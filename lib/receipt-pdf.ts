import { parseReceiptText, repairThai, type ParsedReceipt, type ReceiptRead } from "@/lib/receipt-text";

/**
 * From pdf.js text items to a parsed receipt (PLAN task 56, `docs/RECEIPT_CONTRACT.md`
 * § Reading each form). Pure, so the worker and a measurement harness share one join rule.
 *
 * **Raw reading order, grouped into rows by baseline.** Items keep `getTextContent`'s own order;
 * nothing is sorted by x, which is what reordered Thai combining marks and interleaved the full
 * invoice's columns in the first measurement. But `hasEOL` alone is not a row boundary: measured
 * 2026-09-23 on a real full invoice, an item name that wraps ends its run with `hasEOL`, the
 * wrapped tail follows on a lower baseline, and the same row's two amounts come *after* the tail
 * — so a pure `hasEOL` join splits one item row into three lines and the reader loses the item.
 * Items on one baseline therefore form one line, in pdf.js order, with a space where pdf.js
 * ended a run mid-row; lines are emitted in the order their baseline first appears.
 *
 * **Known limit**: the wrapped tail becomes a line of its own that matches nothing, so a
 * wrapped full-invoice name is stored without its second line. The amounts are unaffected.
 *
 * **No NFKC here**, unlike the statement worker: NFKC decomposes sara am (`ำ`, U+0E33) into
 * nikhahit plus sara aa, which is exactly the sequence `repairThai` recomposes away from — every
 * `ำ` would stop matching the labels the reader anchors on.
 */
export type ReceiptTextItem = { str: string; hasEOL: boolean; y: number };

// Half a point: the measured rows sit about 20pt apart and a wrapped tail about 13pt below its
// row, while items on one row share a baseline exactly.
const BASELINE_TOLERANCE = 0.5;

function pageToLines(items: ReceiptTextItem[]): string[] {
  const rows: { y: number; text: string; endedRun: boolean }[] = [];
  for (const item of items) {
    let row = rows.find((candidate) => Math.abs(candidate.y - item.y) <= BASELINE_TOLERANCE);
    if (!row) {
      row = { y: item.y, text: "", endedRun: false };
      rows.push(row);
    }
    row.text += (row.endedRun && item.str.trim() !== "" ? " " : "") + item.str;
    row.endedRun = item.hasEOL;
  }
  return rows.map((row) => row.text);
}

export function receiptItemsToText(pages: ReceiptTextItem[][]): string {
  return pages.flatMap(pageToLines).join("\n");
}

export type ReceiptForm = "condensed" | "full";

/**
 * Which PDF form this is, decided by the document. The condensed form's first line is
 * `CP ALL,7-Eleven …` and the full invoice never prints it; the full invoice's store line carries
 * `Vat Code (…)` and the condensed form never does. Neither, or both, is not a 7-Eleven receipt
 * this reader knows.
 */
export function detectReceiptForm(text: string): ReceiptForm | null {
  const condensed = /^CP ALL,7-Eleven/m.test(text);
  const full = /Vat Code\s*\(\d+\)/.test(text);
  if (condensed === full) return null;
  return condensed ? "condensed" : "full";
}

export type ReceiptPdfRead =
  | { ok: true; form: ReceiptForm; receipt: ParsedReceipt }
  | { ok: false; code: "UNKNOWN_FORM" | Extract<ReceiptRead<ParsedReceipt>, { ok: false }>["code"]; message: string };

export function readReceiptPdfText(pages: ReceiptTextItem[][]): ReceiptPdfRead {
  const text = repairThai(receiptItemsToText(pages));
  const form = detectReceiptForm(text);
  if (form === null) {
    return { ok: false, code: "UNKNOWN_FORM", message: "This PDF is not a 7-Eleven e-tax receipt this app can read." };
  }
  const parsed = parseReceiptText(text, form);
  if (!parsed.ok) return { ok: false, code: parsed.code, message: parsed.message };
  // The reader accepts a full invoice without these, but it cannot be stored without them: the
  // superseded number is its identity (`lib/receipts.ts`) and the VAT breakdown is the only check
  // it has beyond the net. Refused here, where the owner sees why, rather than as a bare 422 on Save.
  if (form === "full" && parsed.value.supersedesReceiptNumber === null) {
    return { ok: false, code: "MISSING_FIELD", message: "This invoice does not name the short receipt it replaces, so it cannot be tied to one purchase." };
  }
  if (form === "full" && parsed.value.vat === null) {
    return { ok: false, code: "MISSING_FIELD", message: "This invoice's VAT breakdown was not found." };
  }
  return { ok: true, form, receipt: parsed.value };
}
