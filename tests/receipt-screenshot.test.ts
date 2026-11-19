import { describe, expect, test } from "vitest";
import { canonicalLine, groupScreenshotPages, readHeaderTime, readScreenshotPage, readScreenshotReceipt, type ScreenshotPage } from "@/lib/receipt-screenshot";
import type { OcrWord } from "@/lib/slip-ocr";

// Every value is invented (docs/FIXTURE_POLICY.md). The *shapes* — Vision spacing Thai words the
// receipt prints joined, spacing tight punctuation, reading `0.00N` as `0.000` and `ชิ้น` as `ชั้น`,
// a clipped row at a screenshot's edge reading as garbage, and one row read two ways in two
// screenshots — are what the real screenshots showed on 2026-09-23 (D-210).

/** One OCR word per token, one printed line per row, laid out top to bottom. */
function words(lines: string[][]): OcrWord[] {
  return lines.flatMap((tokens, row) => tokens.map((text, column) => ({
    text, left: 10 + column * 60, right: 60 + column * 60, top: 100 + row * 50, bottom: 130 + row * 50
  })));
}

const HEADER = [
  ["01/06/69", "|", "14:35"],
  ["เลข", "ที่", "ใบเสร็จ", "12345"],
  ["สาขา", "7", "-", "Eleven", "ทด", "สอบ"],
  ["รหัส", "ร้าน", ":", "30219"],
  ["รายการ", "สินค้า"]
];
const ITEMS = [
  ["2", "ขนม", "ปัง", "@", "15.00", "30.00"],
  ["1", "น้ำ", "ดื่ม", "10.000"],
  ["1", "M", "-", "Stamp", "(", "บาท", ")", "0.000"],
  ["ยอด", "รวม", "40.00"],
  ["1", "TMW", "ลด", "ขนม", "5.00"]
];
const TAIL = [
  ["ยอด", "สุทธิ", "3", "ชั้น", "35.00"],
  ["ทรู", "วอ", "ล", "เล็ท", "35.00"],
  ["TID", "#", "20260601000000000001"],
  ["R", "#", "0000012345P1", ":", "0000001", "01/06/69", "14:35"]
];
const FOOTER = [["ดู", "ใบ", "กำกับ", "ภาษี"]];

function page(lines: string[][]): ScreenshotPage {
  const read = readScreenshotPage(words(lines));
  if (!read.ok) throw new Error(read.message);
  return read.value;
}

describe("canonicalLine", () => {
  const line = (...tokens: string[]) => canonicalLine(words([tokens]));
  test("joins Thai the receipt prints joined, and keeps Thai–Latin spaces", () => {
    expect(line("1", "TMW", "ลด", "ขนม", "5.00")).toBe("1 TMW ลดขนม 5.00");
  });
  test("tightens punctuation, restores the exempt N and the unit word", () => {
    // The space before `(` is kept: the receipt prints both `M-Stamp(บาท)` and `… (อิ่มคุ้`, OCR cannot
    // tell which, and no rule depends on it (names compare without spaces).
    expect(line("1", "M", "-", "Stamp", "(", "บาท", ")", "0.000")).toBe("1 M-Stamp (บาท) 0.00N");
    expect(line("ยอด", "สุทธิ", "3", "ชั้น", "35.00")).toBe("ยอดสุทธิ 3 ชิ้น 35.00");
  });
  test("keeps the space before a figure, even after a name that ends in (", () => {
    expect(line("1", "ข้าว", "ผัด", "(", "47.00")).toBe("1 ข้าวผัด ( 47.00");
    expect(line("2", "ขนม", "@", "15.00", "30.00")).toBe("2 ขนม @15.00 30.00");
  });
});

describe("readScreenshotReceipt", () => {
  test("one whole screenshot reads complete, with the header's store and branch", () => {
    const read = readScreenshotReceipt([page([...HEADER, ...ITEMS, ...TAIL, ...FOOTER])]);
    expect(read.ok, read.ok ? "" : read.message).toBe(true);
    if (!read.ok) return;
    expect(read.value).toMatchObject({ storeCode: "30219", branchName: "ทดสอบ", receiptNumber: "0000012345", purchasedAt: "2026-06-01", purchasedAtTime: "14:35", netMinor: "3500", paymentMethod: "ทรูวอลเล็ท", completeness: "complete" });
    expect(read.value.discounts).toEqual([{ name: "TMW ลดขนม", amountMinor: "500" }]);
    expect(read.value.items.map((item) => [item.isPromotion, item.vatExempt])).toEqual([[false, false], [false, true], [true, true]]);
  });

  test("two screenshots join across a clipped edge row and a row read two ways, in either order", () => {
    const top = page([...HEADER, ...ITEMS.slice(0, 4), ["ก", "(", "a"], ...FOOTER]);
    const bottom = page([...HEADER, ["ขน"], ["1", "M", "-", "Stamp", "(", "บาท", ")", ".", "0.000"], ...ITEMS.slice(3), ...TAIL, ...FOOTER]);
    for (const order of [[top, bottom], [bottom, top]]) {
      const read = readScreenshotReceipt(order);
      expect(read.ok && read.value.completeness).toBe("complete");
      expect(read.ok && read.value.items).toHaveLength(3);
    }
  });

  test("the best order wins, not the first that happens to join", () => {
    // Rows are compared on quantity and amount, so the middle screenshot's last row (1 × 5.00)
    // coincidentally matches the top one's first row. Picked middle-first, that wrong order joins
    // and reads partial; the right order reads complete and must be the one returned.
    const i1 = ["1", "ขนม", "5.00"], i2 = ["1", "นม", "10.00"], i3 = ["1", "น้ำ", "5.00"];
    const tail = [["ยอด", "สุทธิ", "3", "ชิ้น", "20.00"], ["เงิน", "สด", "20.00"], ...TAIL.slice(2)];
    const top = page([...HEADER, i1, i2]);
    const middle = page([...HEADER, i2, i3]);
    const bottom = page([...HEADER, i3, ...tail]);
    const read = readScreenshotReceipt([middle, top, bottom]);
    expect(read.ok && read.value.completeness).toBe("complete");
    expect(read.ok && read.value.items.map((item) => item.amountMinor)).toEqual(["500", "1000", "500"]);
  });

  test("screenshots of one receipt group together; another receipt's stay apart", () => {
    const other = page([...HEADER.map((row) => row.includes("12345") ? ["เลข", "ที่", "ใบเสร็จ", "99999"] : row), ...ITEMS, ...TAIL, ...FOOTER]);
    const groups = groupScreenshotPages([{ page: page([...HEADER, ...ITEMS, ...FOOTER]) }, { page: other }, { page: page([...HEADER, ...TAIL]) }]);
    expect(groups.map((group) => group.length)).toEqual([2, 1]);
  });

  test("a receipt whose bottom is not in the screenshots asks for it", () => {
    const read = readScreenshotReceipt([page([...HEADER, ...ITEMS, ...FOOTER])]);
    expect(read).toMatchObject({ ok: false, code: "NEEDS_MORE" });
  });

  test("two screenshots with no row in common are refused, not guessed together", () => {
    const read = readScreenshotReceipt([page([...HEADER, ...ITEMS.slice(0, 2)]), page([...HEADER, ...ITEMS.slice(3), ...TAIL])]);
    expect(read).toMatchObject({ ok: false, code: "NO_OVERLAP" });
  });

  test("a header whose number or date disagrees with the R# line is refused, even with a time re-read", () => {
    const number = ["เลข", "ที่", "ใบเสร็จ", "12346"];
    const date = HEADER[0]!.map((token) => (token === "01/06/69" ? "02/06/69" : token));
    for (const head of [[HEADER[0]!, number], [date, HEADER[1]!]]) {
      const shown = page([...head, ...HEADER.slice(2), ...ITEMS, ...TAIL]);
      expect(readScreenshotReceipt([shown])).toMatchObject({ ok: false, code: "MISMATCH" });
      expect(readScreenshotReceipt([shown], "14:35")).toMatchObject({ ok: false, code: "MISMATCH" });
    }
  });

  describe("a header time that alone disagrees with the R# line", () => {
    const shifted = [HEADER[0]!.map((token) => (token === "14:35" ? "14:36" : token)), ...HEADER.slice(1)];
    const disputed = () => page([...shifted, ...ITEMS, ...TAIL]);

    test("asks for the header time to be read again", () => {
      expect(readScreenshotReceipt([disputed()])).toMatchObject({ ok: false, code: "TIME_DISPUTED" });
    });
    test("keeps the R# time when the re-read equals it", () => {
      const read = readScreenshotReceipt([disputed()], "14:35");
      expect(read.ok && read.value.purchasedAtTime).toBe("14:35");
    });
    test("saves with a blank time when the re-read differs or failed", () => {
      for (const again of ["14:36", "09:00", null]) {
        const read = readScreenshotReceipt([disputed()], again);
        expect(read.ok, again ?? "null").toBe(true);
        expect(read.ok && read.value.purchasedAtTime).toBeNull();
        expect(read.ok && read.value.completeness).toBe("complete");
      }
    });
    test("a blank time carries [R# time, header time]: the re-read answer when it is a time, else the header's own", () => {
      expect(readScreenshotReceipt([disputed()], "09:00")).toMatchObject({ ok: true, timeCandidates: ["14:35", "09:00"] });
      expect(readScreenshotReceipt([disputed()], "14:36")).toMatchObject({ ok: true, timeCandidates: ["14:35", "14:36"] });
      expect(readScreenshotReceipt([disputed()], null)).toMatchObject({ ok: true, timeCandidates: ["14:35", "14:36"] });
    });
    test("no candidates when the time is settled or the read is refused", () => {
      const agreeing = page([...HEADER, ...ITEMS, ...TAIL]);
      const settled = readScreenshotReceipt([agreeing]);
      expect(settled.ok && settled.timeCandidates).toBeUndefined();
      const rereadEqual = readScreenshotReceipt([disputed()], "14:35");
      expect(rereadEqual.ok && rereadEqual.timeCandidates).toBeUndefined();
      expect(readScreenshotReceipt([disputed()])).not.toHaveProperty("timeCandidates");
    });
    test("an agreeing header needs no re-read, and one passed is ignored", () => {
      const agreeing = page([...HEADER, ...ITEMS, ...TAIL]);
      expect(readScreenshotReceipt([agreeing], "09:00")).toMatchObject({ ok: true, value: { purchasedAtTime: "14:35" } });
    });
  });

  describe("header times across the screenshots of one receipt", () => {
    const shifted = [HEADER[0]!.map((token) => (token === "14:35" ? "14:36" : token)), ...HEADER.slice(1)];
    const top = (head: string[][]) => page([...head, ...ITEMS.slice(0, 4), ["ก", "(", "a"], ...FOOTER]);
    const bottom = (head: string[][]) => page([...head, ...ITEMS.slice(3), ...TAIL, ...FOOTER]);

    test("a misread time on the second screenshot alone does not make them different receipts", () => {
      const read = readScreenshotReceipt([top(HEADER), bottom(shifted)]);
      expect(read.ok, read.ok ? "" : read.message).toBe(true);
      expect(read.ok && read.value.purchasedAtTime).toBe("14:35");
    });
    test("a misread time on the first screenshot alone needs no re-read", () => {
      const read = readScreenshotReceipt([top(shifted), bottom(HEADER)]);
      expect(read.ok, read.ok ? "" : read.message).toBe(true);
      expect(read.ok && read.value.purchasedAtTime).toBe("14:35");
    });
    test("every screenshot's time disagreeing with R# is disputed", () => {
      expect(readScreenshotReceipt([top(shifted), bottom(shifted)])).toMatchObject({ ok: false, code: "TIME_DISPUTED" });
    });
    test("a different store, number or date across screenshots is still not one receipt", () => {
      const store = HEADER.map((row) => row.includes("30219") ? ["รหัส", "ร้าน", ":", "30220"] : row);
      const number = HEADER.map((row) => row.includes("12345") ? ["เลข", "ที่", "ใบเสร็จ", "12346"] : row);
      const date = [HEADER[0]!.map((token) => (token === "01/06/69" ? "02/06/69" : token)), ...HEADER.slice(1)];
      for (const other of [store, number, date]) {
        expect(readScreenshotReceipt([top(HEADER), bottom(other)])).toMatchObject({ ok: false, code: "MISMATCH", message: "These screenshots are not all of the same receipt." });
      }
    });
  });

  test("the header time's box is the time word, null when it cannot be told", () => {
    expect(page([...HEADER, ...ITEMS, ...TAIL]).headerTimeBox).toEqual({ left: 130, right: 180, top: 100, bottom: 130 });
    // Vision split the time into three words: the box spans all three.
    const split = [["01/06/69", "|", "14", ":", "35"], ...HEADER.slice(1)];
    expect(page([...split, ...ITEMS, ...TAIL]).headerTimeBox).toEqual({ left: 130, right: 300, top: 100, bottom: 130 });
    // The date and time as one word: no separate time word to crop.
    const joined = ["01/06/69 14:35"];
    expect(page([joined, ...HEADER.slice(1), ...ITEMS, ...TAIL]).headerTimeBox).toBeNull();
  });

  test("readHeaderTime reads exactly one time from a crop", () => {
    expect(readHeaderTime(words([["14:35"]]))).toBe("14:35");
    expect(readHeaderTime(words([["14", ":", "35"]]))).toBe("14:35");
    expect(readHeaderTime(words([["hello"]]))).toBeNull();
    expect(readHeaderTime(words([["14:35", "15:40"]]))).toBeNull();
    expect(readHeaderTime([])).toBeNull();
  });

  test("an image that is not a receipt screenshot is refused", () => {
    expect(readScreenshotPage(words([["hello", "world"]]))).toMatchObject({ ok: false, code: "NOT_A_RECEIPT" });
  });
});
