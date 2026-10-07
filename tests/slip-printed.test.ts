import { describe, expect, it } from "vitest";
import { type OcrWord } from "@/lib/slip-ocr";
import { readPrintedIdentity } from "@/lib/slip-printed";

// Invented slips: every name, reference and amount below is made up (docs/FIXTURE_POLICY.md).
const line = (top: number, entries: Array<[string, number, number]>): OcrWord[] =>
  entries.map(([text, left, right]) => ({ text, left, right, top, bottom: top + 20 }));

const KTB_HEADER = line(10, [["Krungthai", 10, 120]]);
const SCB_HEADER = line(10, [["›", 5, 10], ["SCB,", 15, 60]]);
const BODY = [
  ...line(60, [["โอนเงินสำเร็จ", 10, 150]]),
  ...line(400, [["จำนวนเงิน", 10, 90], ["100.00", 300, 380]])
];
const reference = (entries: Array<[string, number, number]>) => line(200, [["รหัสอ้างอิง", 10, 100], ...entries]);

describe("reading a slip's identity off its printed text", () => {
  it("reads a Krungthai slip's bank and reference", () => {
    expect(readPrintedIdentity([...KTB_HEADER, ...BODY, ...reference([["A0f1e2d3c4b5a6978", 110, 300]])]))
      .toEqual({ ok: true, bankCode: "KTB", reference: "A0f1e2d3c4b5a6978" });
  });

  it("reads Krungthai's 17-digit bill-payment reference as printed", () => {
    expect(readPrintedIdentity([...KTB_HEADER, ...BODY, ...reference([["20260714000012345", 110, 300]])]))
      .toEqual({ ok: true, bankCode: "KTB", reference: "20260714000012345" });
  });

  it("lowercases a Krungthai hex reference OCR read with capitals", () => {
    expect(readPrintedIdentity([...KTB_HEADER, ...BODY, ...reference([["A0f1e2D3C4b5a6978", 110, 300]])]))
      .toEqual({ ok: true, bankCode: "KTB", reference: "A0f1e2d3c4b5a6978" });
  });

  it("keeps an SCB reference's case, joins split words and drops the label's colon", () => {
    const words = [...SCB_HEADER, ...BODY, ...line(200, [["รหัสอ้างอิง:", 10, 110], ["2026071431a2B3c4", 120, 250], ["D5e6F7g8H", 255, 330]])];
    expect(readPrintedIdentity(words)).toEqual({ ok: true, bankCode: "SCB", reference: "2026071431a2B3c4D5e6F7g8H" });
  });

  it("reads SCB from a header word with stray punctuation and a colon split off the label", () => {
    const words = [...line(10, [["SCB-", 10, 60]]), ...BODY, ...reference([[":", 105, 108], ["2026071431a2B3c4D5e6F7g8H", 110, 330]])];
    expect(readPrintedIdentity(words)).toEqual({ ok: true, bankCode: "SCB", reference: "2026071431a2B3c4D5e6F7g8H" });
  });

  it("reads the reference from the line under the label when nothing is beside it", () => {
    const words = [...KTB_HEADER, ...BODY, ...line(200, [["รหัสอ้างอิง", 10, 100]]), ...line(230, [["C20260714123456789", 10, 200]])];
    expect(readPrintedIdentity(words)).toEqual({ ok: true, bankCode: "KTB", reference: "C20260714123456789" });
  });

  it("refuses a slip naming no bank in its header, even when one is named lower down", () => {
    const words = [...BODY, ...reference([["A0f1e2d3c4b5a6978", 110, 300]]), ...line(380, [["SCB", 10, 60]])];
    expect(readPrintedIdentity(words).ok).toBe(false);
  });

  it("refuses a header naming two banks", () => {
    const words = [...KTB_HEADER, ...line(40, [["SCB+", 10, 60]]), ...BODY, ...reference([["A0f1e2d3c4b5a6978", 110, 300]])];
    expect(readPrintedIdentity(words).ok).toBe(false);
  });

  it("refuses a reference that is not plain letters and digits", () => {
    expect(readPrintedIdentity([...KTB_HEADER, ...BODY, ...reference([["2026-0714", 110, 300]])]).ok).toBe(false);
    expect(readPrintedIdentity([...KTB_HEADER, ...BODY, ...reference([])]).ok).toBe(false);
  });

  it("refuses a slip with no reference label, or two", () => {
    expect(readPrintedIdentity([...KTB_HEADER, ...BODY]).ok).toBe(false);
    const twice = [...KTB_HEADER, ...BODY, ...reference([["A0f1e2d3c4b5a6978", 110, 300]]),
      ...line(300, [["รหัสอ้างอิง", 10, 100], ["A1111111111111111", 110, 300]])];
    expect(readPrintedIdentity(twice).ok).toBe(false);
  });
});
