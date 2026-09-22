import { describe, expect, test } from "vitest";
import { detectReceiptForm, readReceiptPdfText, receiptItemsToText, type ReceiptTextItem } from "@/lib/receipt-pdf";

// Every value is invented (docs/FIXTURE_POLICY.md). The item shapes — a wrapped name ending its
// run with hasEOL, its tail on a lower baseline, and the row's amounts arriving after the tail —
// are what pdf.js produced for a real full invoice on 2026-09-23.

const item = (str: string, y: number, hasEOL = false): ReceiptTextItem => ({ str, y, hasEOL });

/** One item per printed line, each on its own baseline, top to bottom. */
function linesToItems(lines: string[]): ReceiptTextItem[][] {
  return [lines.map((line, index) => item(line, 800 - index * 20, true))];
}

describe("receiptItemsToText", () => {
  test("a wrapped item name keeps its row whole; the tail becomes a line of its own", () => {
    const page = [
      item("1", 442), item(" ", 442), item("2", 442), item(" ", 442),
      item("ขนมปังไส้ครีมรสช็อกโกแลต", 442, true),
      item("ขนาดใหญ่", 428.7, true),
      item("15.00", 442), item(" ", 442), item("30.00", 442, true),
      item("2", 408), item(" ", 408), item("1", 408), item(" ", 408), item("น้ำดื่ม 10.00 10.00", 408, true)
    ];
    expect(receiptItemsToText([page]).split("\n")).toEqual([
      "1 2 ขนมปังไส้ครีมรสช็อกโกแลต 15.00 30.00",
      "ขนาดใหญ่",
      "2 1 น้ำดื่ม 10.00 10.00"
    ]);
  });

  test("a right-aligned label on the title's baseline joins the title's line", () => {
    const page = [item("ใบกำกับภาษีเต็มรูป", 774), item(" ", 774), item("เลขที่ F1000123", 774, true)];
    expect(receiptItemsToText([page])).toBe("ใบกำกับภาษีเต็มรูป เลขที่ F1000123");
  });

  test("pages are separate: equal baselines on two pages never merge", () => {
    expect(receiptItemsToText([[item("a", 700, true)], [item("b", 700, true)]])).toBe("a\nb");
  });
});

describe("detectReceiptForm", () => {
  test("the condensed header decides condensed, even though it also prints a bare Vat Code", () => {
    expect(detectReceiptForm("CP ALL,7-Eleven สาขาทดสอบ(30219)\nVat Code 0001 POS#1")).toBe("condensed");
  });
  test("Vat Code (n) without the condensed header is the full invoice", () => {
    expect(detectReceiptForm("สาขา : 30219 7-Eleven สาขาทดสอบ Vat Code (0105536000000)")).toBe("full");
  });
  test("anything else is refused rather than guessed", () => {
    expect(detectReceiptForm("Some other shop")).toBeNull();
    expect(readReceiptPdfText(linesToItems(["Some other shop"]))).toMatchObject({ ok: false, code: "UNKNOWN_FORM" });
  });
});

const FULL_LINES = [
  "สาขาที่ออกใบกำกับภาษี : 30219 สาขา 7-Eleven สาขาทดสอบ Vat Code (0105536000000)",
  "ใบกำกับภาษีเต็มรูป เลขที่ F1000123",
  "1 1 น้ำดื่ม 10.00 10.00",
  "มูลค่\x06สินค้\x06รวม 10.00",
  "มูลค่\x06สินค้\x06ก่อนภ\x06ษีมูลค่\x06เพิ่ม 9.35",
  "ภ\x06ษีมูลค่\x06เพิ่ม 0.65",
  "มูลค่\x06สินค้\x06รวมภ\x06ษีมูลค่\x06เพิ่ม 10.00",
  "ยกเลิกใบกำกับภาษีอย่างย่อเลขที่ : 0012 POS 02 วันที่ 22/09/2569 วันที่ 22/09/2569"
];

describe("readReceiptPdfText", () => {
  test("a full invoice that cannot be stored is refused when read, with a reason", () => {
    const noClause = readReceiptPdfText(linesToItems(FULL_LINES.slice(0, -1).concat("วันที่ 22/09/2569")));
    expect(noClause).toMatchObject({ ok: false, code: "MISSING_FIELD" });
    expect(!noClause.ok && noClause.message).toMatch(/short receipt it replaces/);
    const noVat = readReceiptPdfText(linesToItems(FULL_LINES.filter((line) => !line.startsWith("ภ\x06ษี"))));
    expect(!noVat.ok && noVat.message).toMatch(/VAT breakdown/);
  });

  test("repairs the full invoice's U+0006 before reading", () => {
    const read = readReceiptPdfText(linesToItems(FULL_LINES));
    expect(read.ok, read.ok ? "" : read.message).toBe(true);
    if (!read.ok) return;
    expect(read.form).toBe("full");
    expect(read.receipt.completeness).toBe("complete");
    expect(read.receipt.netMinor).toBe("1000");
  });
});
