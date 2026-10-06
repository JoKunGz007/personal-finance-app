import { describe, expect, it } from "vitest";
import {
  gregorianFromPrintedYear,
  gregorianFromTwoDigitYear,
  groupIntoLines,
  findLabelLine,
  locateAmount,
  paddedCrop,
  proposeAmount,
  proposeSlipText,
  readAmount,
  readPrintedDate,
  valueWordsFor,
  THAI_MONTH_TOKENS,
  type OcrWord
} from "@/lib/slip-ocr";

// Reading printed fields off a slip (PLAN task 21). Every value here is invented, per
// docs/FIXTURE_POLICY.md — the amounts are round numbers chosen to exercise the grammar and
// none of them came from a real slip. Label wordings are format knowledge and are taken from
// docs/SLIP_CONTRACT.md, which is the one thing here that describes real documents.
//
// There is no OCR engine in these tests because there is none in the module. That is the
// point of the split: the rules that decide what to believe are testable without a browser,
// a WebAssembly build, or a language model file.

let nextTop = 0;

/** A line of words at a given band, laid out left to right. */
function line(top: number, entries: Array<[string, number, number]>): OcrWord[] {
  return entries.map(([text, left, right]) => ({ text, left, right, top, bottom: top + 20 }));
}

function word(text: string, left: number, right: number, top = (nextTop += 30)): OcrWord {
  return { text, left, right, top, bottom: top + 20 };
}

describe("grouping words into visual lines", () => {
  it("keeps words on one line even when their boxes disagree on both edges", () => {
    // A Thai tone mark makes a taller box, so two words on one line rarely share a `top`.
    // Overlap of the bands is what means "same line"; equality of an edge never does.
    const words: OcrWord[] = [
      { text: "จำนวนเงิน", left: 10, right: 90, top: 100, bottom: 124 },
      { text: "1,250.00", left: 300, right: 380, top: 104, bottom: 122 }
    ];
    expect(groupIntoLines(words)).toHaveLength(1);
  });

  it("separates genuinely different lines", () => {
    const words = [...line(100, [["จำนวน:", 10, 70]]), ...line(140, [["1,250.00", 300, 380]])];
    expect(groupIntoLines(words)).toHaveLength(2);
  });

  it("orders lines top to bottom and words left to right, whatever order they arrived in", () => {
    const words = [
      ...line(140, [["บาท", 390, 420], ["1,250.00", 300, 380]]),
      ...line(100, [["จำนวนเงิน", 10, 90]])
    ];
    const lines = groupIntoLines(words);
    expect(lines.map((entry) => entry.map((w) => w.text))).toEqual([
      ["จำนวนเงิน"],
      ["1,250.00", "บาท"]
    ]);
  });
});

describe("finding the line a label sits on", () => {
  it("matches a label the engine split into several words", () => {
    // Thai has no inter-word spaces, so where an engine breaks a label is its business.
    const lines = groupIntoLines(line(100, [["จำนวน", 10, 50], ["เงิน", 50, 90], ["1,250.00", 300, 380]]));
    const found = findLabelLine(lines, "จำนวนเงิน");
    expect(found.ok).toBe(true);
    if (found.ok) expect(found.labelRight).toBe(90);
  });

  it("refuses when the label appears on two lines rather than taking the first", () => {
    // Twice means the image caught something this policy does not model. Picking one would
    // be a guess wearing a result's clothing.
    const lines = groupIntoLines([
      ...line(100, [["จำนวนเงิน", 10, 90], ["1,250.00", 300, 380]]),
      ...line(140, [["จำนวนเงิน", 10, 90], ["999.00", 300, 380]])
    ]);
    expect(findLabelLine(lines, "จำนวนเงิน")).toEqual({ ok: false, code: "LABEL_AMBIGUOUS" });
  });

  it("reports a missing label as missing", () => {
    const lines = groupIntoLines(line(100, [["ค่าธรรมเนียม", 10, 90], ["12.00", 300, 360]]));
    expect(findLabelLine(lines, "จำนวนเงิน")).toEqual({ ok: false, code: "LABEL_NOT_FOUND" });
  });
});

describe("locating the value a label points at", () => {
  it("takes only what is right of the label on the same line", () => {
    const lines = groupIntoLines(line(100, [["จำนวนเงิน", 10, 90], ["1,250.00", 300, 380], ["บาท", 390, 420]]));
    const found = findLabelLine(lines, "จำนวนเงิน");
    expect(found.ok).toBe(true);
    if (!found.ok) return;
    expect(valueWordsFor(lines, found, "same-line-right").map((w) => w.text)).toEqual(["1,250.00", "บาท"]);
  });

  it("takes the line below when that is where the layout puts the value", () => {
    // KBANK, the layout that prints its value under its label rather than beside it.
    const lines = groupIntoLines([
      ...line(100, [["จำนวน:", 10, 70]]),
      ...line(140, [["1,250.00", 300, 380], ["บาท", 390, 420]])
    ]);
    const found = findLabelLine(lines, "จำนวน:");
    expect(found.ok).toBe(true);
    if (!found.ok) return;
    expect(valueWordsFor(lines, found, "next-line").map((w) => w.text)).toEqual(["1,250.00", "บาท"]);
  });
});

describe("reading an amount, or refusing to", () => {
  it("reads grouped thousands with two fractional places", () => {
    const read = readAmount([word("1,250.00", 300, 380)]);
    expect(read.ok).toBe(true);
    if (read.ok) expect(read.value).toBe("125000");
  });

  it("strips the baht suffix on the layouts that print one, and copes with the one that does not", () => {
    const withSuffix = readAmount([word("1,250.00", 300, 380), word("บาท", 390, 420)]);
    const without = readAmount([word("1250.00", 300, 380)]);
    expect(withSuffix.ok && withSuffix.value).toBe("125000");
    expect(without.ok && without.value).toBe("125000");
  });

  it("reads Thai digits, which are a transliteration rather than a judgement", () => {
    const read = readAmount([word("๑,๒๕๐.๐๐", 300, 380)]);
    expect(read.ok && read.value).toBe("125000");
  });

  // The three confusions docs/SLIP_CONTRACT.md names. None of them is repaired, and that is
  // the whole design: a corrected amount arrives wearing the same confidence as a correct
  // one, and only a reconciliation would ever catch it.
  it("refuses a letter standing in for a digit instead of correcting it", () => {
    const read = readAmount([word("1,25o.00", 300, 380)]);
    expect(read.ok).toBe(false);
    if (!read.ok) expect(read.code).toBe("VALUE_NOT_MONEY");
  });

  it("refuses one fractional place, because a slip prints two and one means a dropped glyph", () => {
    const read = readAmount([word("1250.5", 300, 380)]);
    expect(read.ok).toBe(false);
  });

  it("refuses a value that is only partly a number", () => {
    // Anchored at both ends: a partial match is how 1,250.00 silently becomes 1.
    expect(readAmount([word("1,250.00x", 300, 380)]).ok).toBe(false);
    expect(readAmount([word("x1,250.00", 300, 380)]).ok).toBe(false);
  });

  it("refuses when nothing beside the label carries a digit", () => {
    const read = readAmount([word("บาท", 390, 420)]);
    expect(read.ok).toBe(false);
    if (!read.ok) expect(read.code).toBe("NO_VALUE_BESIDE_LABEL");
  });

  it("refuses when two different amounts read off one line", () => {
    const read = readAmount([word("1,250.00", 300, 380), word("980.00", 400, 460)]);
    expect(read.ok).toBe(false);
    if (!read.ok) expect(read.code).toBe("VALUE_AMBIGUOUS");
  });

  it("accepts the same amount read twice, which is duplication rather than ambiguity", () => {
    const read = readAmount([word("1,250.00", 300, 380), word("1,250.00", 400, 480)]);
    expect(read.ok && read.value).toBe("125000");
  });
});

describe("proposing the amount for a bank", () => {
  it("reads Krungthai's amount from beside its own label", () => {
    const words = [
      ...line(100, [["จำนวนเงิน", 10, 90], ["1,250.00", 300, 380], ["บาท", 390, 420]]),
      ...line(140, [["ค่าธรรมเนียม", 10, 90], ["12.00", 300, 360], ["บาท", 390, 420]])
    ];
    const read = proposeAmount(words, "KTB");
    expect(read.ok && read.value).toBe("125000");
  });

  it("reads KBANK's amount from the line below its label", () => {
    const words = [
      ...line(100, [["จำนวน:", 10, 70]]),
      ...line(140, [["1,250.00", 300, 380], ["บาท", 390, 420]])
    ];
    const read = proposeAmount(words, "KBANK");
    expect(read.ok && read.value).toBe("125000");
  });

  it("reads SCB's amount, which prints no baht suffix", () => {
    const words = line(100, [["จำนวนเงิน", 10, 90], ["1,250.00", 300, 380]]);
    const read = proposeAmount(words, "SCB");
    expect(read.ok && read.value).toBe("125000");
  });

  // The hazard this module exists to refuse. A fee is money, on a nearby line, and small and
  // plausible — so a reader that shrugged and took the nearest number when it could not find
  // the amount's label would return a wrong number that looks entirely reasonable.
  it("refuses rather than returning the fee when the amount's label is not found", () => {
    const words = line(100, [["ค่าธรรมเนียม", 10, 90], ["12.00", 300, 360], ["บาท", 390, 420]]);
    const read = proposeAmount(words, "KTB");
    expect(read.ok).toBe(false);
    if (!read.ok) expect(read.code).toBe("LABEL_NOT_FOUND");
  });

  it("does not take the fee even when it sits above the amount", () => {
    const words = [
      ...line(100, [["ค่าธรรมเนียม", 10, 90], ["12.00", 300, 360]]),
      ...line(140, [["จำนวนเงิน", 10, 90], ["1,250.00", 300, 380]])
    ];
    const read = proposeAmount(words, "KTB");
    expect(read.ok && read.value).toBe("125000");
  });
});

describe("the Buddhist era, which is the opposite way round from the QR", () => {
  const today = new Date("2026-08-05T00:00:00Z");

  it("converts a printed Buddhist year to Gregorian", () => {
    expect(gregorianFromPrintedYear(2569, today)).toBe(2026);
  });

  // D-031: a 543-year shift parsed cleanly once and would have written 1983 dates into the
  // ledger. This is a guard rather than a silent subtraction because of that.
  it("refuses an already-Gregorian year rather than shifting it 543 years into the past", () => {
    expect(gregorianFromPrintedYear(2026, today)).toBeNull();
  });

  it("leaves a two-digit year to its own resolver", () => {
    expect(gregorianFromPrintedYear(69, today)).toBeNull();
  });

  // KBANK prints `69`. No century is assumed: every completion in both eras is tried, and
  // only a year with exactly one survivor in the window is believed.
  it("completes a two-digit year when exactly one candidate fits the window", () => {
    expect(gregorianFromTwoDigitYear(69, today)).toBe(2026); // 2569 BE
    expect(gregorianFromTwoDigitYear(68, today)).toBe(2025); // 2568 BE
    expect(gregorianFromTwoDigitYear(70, today)).toBe(2027); // 2570 BE, the window's last year
    expect(gregorianFromTwoDigitYear(26, today)).toBe(2026); // printed Gregorian; 2526 BE is 1983
    expect(gregorianFromTwoDigitYear(59, today)).toBe(2016); // 2559 BE, the window's first year
  });

  it("refuses a two-digit year that fits no candidate, and anything that is not one", () => {
    expect(gregorianFromTwoDigitYear(71, today)).toBeNull(); // 2028 and 2071: both outside
    expect(gregorianFromTwoDigitYear(50, today)).toBeNull(); // 2007 and 2050
    expect(gregorianFromTwoDigitYear(100, today)).toBeNull();
    expect(gregorianFromTwoDigitYear(-1, today)).toBeNull();
    expect(gregorianFromTwoDigitYear(6.9, today)).toBeNull();
  });

  it("never finds two survivors, because the eras' readings of one YY sit 43 or 57 years apart", () => {
    for (let yy = 0; yy <= 99; yy += 1) {
      for (const year of [2020, 2026, 2035, 2060]) {
        const at = new Date(Date.UTC(year, 5, 1));
        const result = gregorianFromTwoDigitYear(yy, at);
        if (result !== null) expect(result >= year - 10 && result <= year + 1).toBe(true);
      }
    }
  });

  it("refuses a converted year outside the window a slip can belong to", () => {
    expect(gregorianFromPrintedYear(2999, today)).toBeNull();
    expect(gregorianFromPrintedYear(1900, today)).toBeNull();
  });

  it("accepts the edges of the window and nothing beyond them", () => {
    expect(gregorianFromPrintedYear(2570, today)).toBe(2027);
    expect(gregorianFromPrintedYear(2571, today)).toBeNull();
    expect(gregorianFromPrintedYear(2559, today)).toBe(2016);
    expect(gregorianFromPrintedYear(2558, today)).toBeNull();
  });
});

// The printed date (measured 2026-08-10, docs/SLIP_CONTRACT.md § The month vocabulary). Every
// date below is invented; what is real is the month vocabulary and the per-layout grammar, both
// of which are format knowledge like the labels above.
describe("reading the printed date", () => {
  // 2026 CE is 2569 BE. `today` is fixed so the plausibility window cannot drift with the clock.
  const today = new Date(Date.UTC(2026, 6, 1));

  const dateLine = (text: string) => [{ text, left: 100, right: 400, top: 50, bottom: 74 }];

  it("reads the Krungthai and SCB grammar, four-digit year with a hyphen before the time", () => {
    const read = readPrintedDate(dateLine("14 ก.ค. 2569 - 09:05"), today);
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.value).toEqual({ iso: "2026-07-14", time: "09:05" });
  });

  it("converts out of the Buddhist era rather than believing the printed year", () => {
    // The whole hazard in one assertion: 2569 must not reach the ledger as the year 2569, and
    // must not be silently accepted as 2026 without the subtraction either (D-031).
    const read = readPrintedDate(dateLine("3 ธ.ค. 2568 - 18:40"), today);
    expect(read.ok && read.value.iso).toBe("2025-12-03");
  });

  it("reads a date with no time printed beside it", () => {
    const read = readPrintedDate(dateLine("9 ส.ค. 2569"), today);
    expect(read.ok && read.value).toEqual({ iso: "2026-08-09", time: null });
  });

  // The three that defeat the obvious matcher. A `[ก-ฮ]\.[ก-ฮ]\.` pattern reads none of these,
  // and a reader tested only in July would never find out.
  it.each([
    ["มี.ค.", "2026-03-08"],
    ["เม.ย.", "2026-04-08"],
    ["มิ.ย.", "2026-06-08"]
  ])("reads %s, which carries a vowel and breaks a two-consonant pattern", (month, iso) => {
    const read = readPrintedDate(dateLine(`8 ${month} 2569`), today);
    expect(read.ok && read.value.iso).toBe(iso);
  });

  it("reads every month in the table, so none is left to be discovered in production", () => {
    const isos = THAI_MONTH_TOKENS.map(([token]) => {
      const read = readPrintedDate(dateLine(`5 ${token} 2569`), today);
      return read.ok ? read.value.iso : `refused: ${token}`;
    });
    expect(isos).toEqual([
      "2026-01-05", "2026-02-05", "2026-03-05", "2026-04-05", "2026-05-05", "2026-06-05",
      "2026-07-05", "2026-08-05", "2026-09-05", "2026-10-05", "2026-11-05", "2026-12-05"
    ]);
  });

  it("reads KBANK's two-digit year when exactly one candidate fits the window", () => {
    const read = readPrintedDate(dateLine("24 ก.ค. 69  11:38 น."), today);
    expect(read.ok && read.value).toEqual({ iso: "2026-07-24", time: "11:38" });
  });

  it("still refuses a two-digit year no candidate fits, and names the case", () => {
    // Named in the refusal so the form can say something true, rather than reporting "no date
    // found" on a slip that plainly prints one.
    const read = readPrintedDate(dateLine("24 ก.ค. 50  11:38 น."), today);
    expect(read.ok).toBe(false);
    if (read.ok) return;
    expect(read.code).toBe("DATE_YEAR_UNRESOLVED");
  });

  it("refuses two date-shaped lines rather than picking the first", () => {
    const read = readPrintedDate(
      [
        { text: "14 ก.ค. 2569 - 09:05", left: 100, right: 400, top: 50, bottom: 74 },
        { text: "15 ก.ค. 2569 - 10:10", left: 100, right: 400, top: 120, bottom: 144 }
      ],
      today
    );
    expect(read.ok).toBe(false);
    if (read.ok) return;
    expect(read.code).toBe("DATE_AMBIGUOUS");
  });

  it("does not read a reference or a masked account as a date", () => {
    // Both are digit runs, and a grammar keyed on digits alone would take either. Requiring a
    // month token from a closed list is what makes scanning safe without a label.
    const read = readPrintedDate(
      [
        { text: "202607231GM7e5j3VFEeH4XvB", left: 100, right: 500, top: 50, bottom: 74 },
        { text: "xxx-x-x6850-x", left: 100, right: 300, top: 120, bottom: 144 }
      ],
      today
    );
    expect(read.ok).toBe(false);
    if (read.ok) return;
    expect(read.code).toBe("DATE_NOT_FOUND");
  });

  it("refuses a day the calendar does not have, rather than rolling it forward", () => {
    // `Date` would turn 31 September into 1 October without complaint, which is a wrong date
    // that looks right — the failure mode this whole module exists to avoid.
    const read = readPrintedDate(dateLine("31 ก.ย. 2569"), today);
    expect(read.ok).toBe(false);
  });

  it("refuses a year outside the window a slip can plausibly belong to", () => {
    const read = readPrintedDate(dateLine("14 ก.ค. 2500"), today);
    expect(read.ok).toBe(false);
    // The code matters as much as the refusal. This is a four-digit year that converts out of
    // the window, which is a different failure from the two-digit one above — and asserting
    // only `ok === false` let both report as "this slip prints a two-digit year", which was
    // false for this input and is exactly the passing-for-the-wrong-reason GOTCHAS warns of.
    if (read.ok) return;
    expect(read.code).toBe("DATE_NOT_FOUND");
  });

  it("tolerates the word breaks an engine chooses, since Thai has no spaces", () => {
    // The same argument `findLabelLine` makes: where the engine splits a run is its business.
    const read = readPrintedDate(
      [
        { text: "14", left: 100, right: 130, top: 50, bottom: 74 },
        { text: "ก.ค.", left: 135, right: 180, top: 50, bottom: 74 },
        { text: "2569", left: 185, right: 240, top: 50, bottom: 74 }
      ],
      today
    );
    expect(read.ok && read.value.iso).toBe("2026-07-14");
  });
});

// Locating the amount rather than reading it (D-087). The shipped feature is a crop the owner
// reads, so these assert a region — never a figure.
describe("locating the amount for a crop", () => {
  it("spans the label and the value beside it", () => {
    const words = line(100, [["จำนวนเงิน", 10, 90], ["1,250.00", 300, 380]]);
    const found = locateAmount(words, "KTB");
    expect(found.ok).toBe(true);
    if (!found.ok) return;
    // Left edge is the label's, not the value's: a crop of a bare number asks the owner to
    // trust the targeting, where one showing the label says which field it is.
    expect(found.value).toEqual({ left: 10, top: 100, right: 380, bottom: 120 });
  });

  it("spans two lines on the layout that prints its value below the label", () => {
    const words = [...line(100, [["จำนวน:", 10, 90]]), ...line(140, [["4,000.00", 250, 340], ["บาท", 350, 390]])];
    const found = locateAmount(words, "KBANK");
    expect(found.ok && found.value).toEqual({ left: 10, top: 100, right: 390, bottom: 160 });
  });

  // The property that makes this worth shipping where reading is not: it answers on images
  // whose digits do not parse, which are exactly the ones a person needs to see enlarged.
  it("locates a value that could never be read as money", () => {
    const words = line(100, [["จำนวนเงิน", 10, 90], ["l,2SO.OO", 300, 380]]);
    expect(readAmount(line(100, [["l,2SO.OO", 300, 380]])).ok).toBe(false);
    expect(locateAmount(words, "KTB").ok).toBe(true);
  });

  it("refuses when the label is not there, rather than offering an arbitrary region", () => {
    const found = locateAmount(line(100, [["ค่าธรรมเนียม", 10, 90], ["0.00", 300, 380]]), "KTB");
    expect(found.ok).toBe(false);
    if (found.ok) return;
    expect(found.code).toBe("LABEL_NOT_FOUND");
  });

  it("pads proportionally and never leaves the image", () => {
    const box = { left: 100, top: 100, right: 200, bottom: 120 };
    const padded = paddedCrop(box, { width: 1000, height: 1000 });
    expect(padded).toEqual({ left: 65, top: 93, right: 235, bottom: 127 });

    // Clamped at every edge, so a label near a margin cannot produce a negative crop.
    const corner = paddedCrop({ left: 0, top: 0, right: 100, bottom: 20 }, { width: 90, height: 15 });
    expect(corner).toEqual({ left: 0, top: 0, right: 90, bottom: 15 });
  });
});

describe("proposing the payee and note", () => {
  // Invented names and memos throughout; only the label wordings and where each layout puts
  // its value are format knowledge.

  it("reads SCB's payee beside its label and the provider note under its label", () => {
    const words = [
      ...line(100, [["ไปยัง", 10, 60], ["นาย", 200, 240], ["สมมุติ", 250, 320], ["ทดลอง", 330, 400]]),
      ...line(140, [["xxx-xxx123-4", 200, 340]]),
      ...line(180, [["จำนวนเงิน", 10, 90], ["150.00", 300, 380]]),
      ...line(220, [["ข้อมูลเพิ่มเติมจากผู้ให้บริการ", 10, 200]]),
      ...line(260, [["ค่า", 10, 40], ["สมาชิก", 45, 100], ["รายเดือน", 105, 170]])
    ];
    expect(proposeSlipText(words, "SCB")).toEqual({ counterparty: "นาย สมมุติ ทดลอง", note: "ค่า สมาชิก รายเดือน" });
  });

  it("appends SCB's one wrapped continuation line of a long payee", () => {
    const words = [
      ...line(100, [["ไปยัง", 10, 60], ["INVENTED", 200, 290], ["HOLDINGS", 300, 390], ["PUBLIC", 400, 470]]),
      ...line(140, [["COMPANY", 200, 290], ["LIMITED", 300, 380]]),
      ...line(180, [["FURTHER", 200, 290], ["WORDS", 300, 380]])
    ];
    expect(proposeSlipText(words, "SCB").counterparty).toBe("INVENTED HOLDINGS PUBLIC COMPANY LIMITED");
  });

  it("does not append SCB's next line when it carries a digit, a colon, or starts left of the label", () => {
    const payee = line(100, [["ไปยัง", 10, 60], ["INVENTED", 200, 290], ["SHOP", 300, 360]]);
    for (const next of [
      line(140, [["Biller", 200, 260], ["ID", 270, 290], ["0000000000001", 300, 420]]),
      line(140, [["Ref", 200, 240], ["no:", 250, 290], ["ABC", 300, 340]]),
      line(140, [["ELSEWHERE", 5, 100]])
    ]) {
      expect(proposeSlipText([...payee, ...next], "SCB").counterparty).toBe("INVENTED SHOP");
    }
  });

  it("reads Krungthai's payee from the line under its label and the memo beside its label", () => {
    const words = [
      ...line(100, [["ไปยัง", 10, 60]]),
      ...line(140, [["น.ส.", 10, 50], ["ตัวอย่าง", 55, 130], ["สมมติ", 135, 200]]),
      ...line(180, [["xxx-x-x5678-x", 10, 150]]),
      ...line(220, [["บันทึกช่วยจำ", 10, 100], ["คืน", 300, 330], ["ค่า", 335, 360], ["ข้าว", 365, 400]])
    ];
    expect(proposeSlipText(words, "KTB")).toEqual({ counterparty: "น.ส. ตัวอย่าง สมมติ", note: "คืน ค่า ข้าว" });
  });

  it("leaves Krungthai's note null when no memo is printed", () => {
    const words = [...line(100, [["ไปยัง", 10, 60]]), ...line(140, [["INVENTED", 10, 100], ["PERSON", 110, 180]])];
    expect(proposeSlipText(words, "KTB")).toEqual({ counterparty: "INVENTED PERSON", note: null });
  });

  const kbankSlip = (masked: OcrWord[][]) => [
    ...line(100, [["นาย", 10, 40], ["ผู้ส่ง", 45, 100], ["สมมุติ", 105, 170]]),
    ...line(140, [["ธ.กสิกรไทย", 10, 110]]),
    ...(masked[0] ?? []),
    ...line(220, [["↓", 10, 20]]),
    ...line(260, [["นาง", 10, 40], ["ผู้รับ", 45, 100], ["ทดลอง", 105, 170]]),
    ...(masked[1] ?? []),
    ...line(340, [["บันทึกช่วยจำ:", 10, 110]]),
    ...line(380, [["ค่า", 10, 40], ["ตั๋ว", 45, 80]])
  ];

  it("reads KBANK's payee as the first lettered line after the sender's masked account", () => {
    // The arrow between the two parties is skipped: it carries no letter.
    expect(proposeSlipText(kbankSlip([line(180, [["xxx-x-x1234-x", 10, 150]])]), "KBANK"))
      .toEqual({ counterparty: "นาง ผู้รับ ทดลอง", note: "ค่า ตั๋ว" });
  });

  it("declines KBANK's payee with no masked account line", () => {
    expect(proposeSlipText(kbankSlip([]), "KBANK").counterparty).toBeNull();
  });

  it("reads KBANK's payee after the first masked line when the payee's account is masked too", () => {
    const two = [line(180, [["xxx-x-x1234-x", 10, 150]]), line(300, [["xxx-x-x9876-x", 10, 150]])];
    expect(proposeSlipText(kbankSlip(two), "KBANK").counterparty).toBe("นาง ผู้รับ ทดลอง");
  });

  it("declines KBANK's payee when only the payee's masked line was read", () => {
    // The sender's masked line was dropped, so the line after the only mask is the next label.
    const words = [
      ...line(100, [["นาย", 10, 40], ["ผู้ส่ง", 45, 100]]),
      ...line(140, [["นาง", 10, 40], ["ผู้รับ", 45, 100]]),
      ...line(180, [["xxx-x-x9876-x", 10, 150]]),
      ...line(220, [["เลขที่รายการ:", 10, 110]])
    ];
    expect(proposeSlipText(words, "KBANK").counterparty).toBeNull();
  });

  it("drops a KBANK logo read left of the names' column", () => {
    const words = [
      ...line(100, [["นาย", 100, 140], ["ผู้ส่ง", 145, 200]]),
      ...line(140, [["xxx-x-x1234-x", 100, 250]]),
      ...line(200, [["0", 10, 60], ["นาง", 100, 140], ["ผู้รับ", 145, 200]])
    ];
    expect(proposeSlipText(words, "KBANK").counterparty).toBe("นาง ผู้รับ");
  });

  it("joins words with a space only where the engine saw one", () => {
    // Vision splits a Thai name into syllables and flags only the real spaces (`spaceAfter`).
    const words = [
      ...line(100, [["xxx-x-x1234-x", 10, 150]]),
      ...[["นาย", 10, 40, true], ["ผู้", 50, 70, false], ["รับ", 72, 100, true], ["ทด", 110, 130, false], ["ลอง", 132, 170, true]]
        .map(([text, left, right, spaceAfter]) => ({ text, left, right, top: 140, bottom: 160, spaceAfter }) as OcrWord)
    ];
    expect(proposeSlipText(words, "KBANK").counterparty).toBe("นาย ผู้รับ ทดลอง");
  });

  it("drops the icon SCB draws before a merchant payee, read as E, EX or E )", () => {
    for (const icon of [[["EX", 150, 180]], [["E", 150, 165]], [["E", 150, 165], [")", 168, 175]]] as Array<Array<[string, number, number]>>) {
      const words = line(100, [["ไปยัง", 10, 60], ...icon, ["INVENTED", 200, 290], ["SHOP", 300, 360]]);
      expect(proposeSlipText(words, "SCB").counterparty).toBe("INVENTED SHOP");
    }
  });

  it("accepts the generic memo label on SCB and joins it with the provider note", () => {
    const words = [
      ...line(100, [["ข้อมูลเพิ่มเติมจากผู้ให้บริการ", 10, 200]]),
      ...line(140, [["INV-0001", 10, 100]]),
      ...line(180, [["บันทึกช่วยจำ", 10, 100], ["ของขวัญ", 300, 380]])
    ];
    expect(proposeSlipText(words, "SCB").note).toBe("INV-0001 · ของขวัญ");
  });

  it("falls back to the memo label without KBANK's colon, reading the line below", () => {
    const words = [...line(100, [["บันทึกช่วยจำ", 10, 100]]), ...line(140, [["ค่า", 10, 40], ["ตั๋ว", 45, 80]])];
    expect(proposeSlipText(words, "KBANK").note).toBe("ค่า ตั๋ว");
  });

  it("declines a field whose label appears on two lines", () => {
    const words = [
      ...line(100, [["ไปยัง", 10, 60], ["ONE", 200, 260]]),
      ...line(140, [["ไปยัง", 10, 60], ["TWO", 200, 260]])
    ];
    expect(proposeSlipText(words, "SCB").counterparty).toBeNull();
  });

  it("declines a value line that is really the next field's label", () => {
    // The memo was blank, so the line under its label is the amount's label.
    const kbank = [...line(100, [["บันทึกช่วยจำ:", 10, 110]]), ...line(140, [["จำนวน:", 10, 70]])];
    expect(proposeSlipText(kbank, "KBANK").note).toBeNull();
    const ktb = [...line(100, [["ไปยัง", 10, 60]]), ...line(140, [["จำนวนเงิน", 10, 90], ["150.00", 300, 380]])];
    expect(proposeSlipText(ktb, "KTB").counterparty).toBeNull();
  });

  it("keeps a memo that merely contains a label word", () => {
    const words = line(100, [["บันทึกช่วยจำ", 10, 100], ["โอนไปยังเพื่อน", 300, 420]]);
    expect(proposeSlipText(words, "KTB").note).toBe("โอนไปยังเพื่อน");
  });

  it("caps the payee at 240 characters and the note at 2000", () => {
    const words = [
      ...line(100, [["ไปยัง", 10, 60], ["A".repeat(300), 200, 900]]),
      ...line(140, [["ข้อมูลเพิ่มเติมจากผู้ให้บริการ", 10, 200]]),
      ...line(180, [["B".repeat(2500), 10, 900]])
    ];
    const read = proposeSlipText(words, "SCB");
    expect(read.counterparty).toHaveLength(240);
    expect(read.note).toHaveLength(2000);
  });

  it("returns nulls, without throwing, for no words at all", () => {
    for (const bank of ["SCB", "KTB", "KBANK"] as const) {
      expect(proposeSlipText([], bank)).toEqual({ counterparty: null, note: null });
    }
  });
});
