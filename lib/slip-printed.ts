import { findLabelLine, groupIntoLines, normalise, valueWordsFor, type OcrWord } from "@/lib/slip-ocr";

/**
 * A slip's identity read off its printed text, for a slip whose QR cannot be decoded (D-258).
 *
 * **This is OCR, not a CRC-covered QR**, so it is held to narrow shapes and refuses anything else:
 * exactly one bank named in the slip's header, exactly one `รหัสอ้างอิง` line, and a reference of
 * plain letters and digits. The server re-checks the reference against the printed date
 * (`printedReferenceAgrees` in `lib/slips.ts`), and the batch classifier does too before a slip is
 * filed unseen, so a misread reference date sends the slip to review rather than into the ledger.
 *
 * Only Krungthai and SCB are read here: those are the two banks the server accepts a printed
 * identity for.
 */

export type PrintedSlipIdentity =
  | { readonly ok: true; readonly bankCode: "KTB" | "SCB"; readonly reference: string }
  | { readonly ok: false; readonly reason: string };

const REFERENCE_LABEL = "รหัสอ้างอิง";
const REFERENCE_SHAPE = /^[0-9A-Za-z]{1,64}$/;
/** Krungthai's top-up and transfer reference: "A" and 16 lowercase hex digits. OCR has read a "c" as "C". */
const KTB_HEX_REFERENCE = /^A[0-9a-fA-F]{16}$/;
/** SCB's header word, as Vision reads it beside the logo: "› SCB,", "SCB-", "SCB+". */
const SCB_HEADER = /^[^0-9A-Za-z]*SCB(?![0-9A-Za-z])/i;

function headerBanks(lines: readonly OcrWord[][]): Set<"KTB" | "SCB"> {
  const banks = new Set<"KTB" | "SCB">();
  const all = lines.flat();
  if (all.length === 0) return banks;
  const top = Math.min(...all.map((word) => word.top));
  const bottom = Math.max(...all.map((word) => word.bottom));
  const headerEnd = top + (bottom - top) / 3;
  for (const line of lines) {
    if (Math.min(...line.map((word) => word.top)) >= headerEnd) continue;
    const joined = line.map((word) => normalise(word.text)).join("");
    if (joined.toLowerCase().includes("krungthai")) banks.add("KTB");
    const spaced = line.map((word) => word.text.normalize("NFKC")).join(" ");
    if (SCB_HEADER.test(spaced)) banks.add("SCB");
  }
  return banks;
}

export function readPrintedIdentity(words: readonly OcrWord[]): PrintedSlipIdentity {
  const lines = groupIntoLines(words);
  const banks = headerBanks(lines);
  if (banks.size !== 1) {
    return { ok: false, reason: banks.size === 0 ? "No bank was found in this slip's header." : "More than one bank was found in this slip's header." };
  }
  const bankCode = [...banks][0]!;

  const label = findLabelLine(lines, REFERENCE_LABEL);
  if (!label.ok) {
    return { ok: false, reason: label.code === "LABEL_NOT_FOUND" ? "No reference was found on this slip." : "This slip shows more than one reference." };
  }
  // Beside the label, or on the line under it (Krungthai's bill payment, measured 2026-10-07).
  const joined = (position: "same-line-right" | "next-line") => valueWordsFor(lines, label, position)
    .map((word) => normalise(word.text))
    .join("")
    .replace(/^:+/, "");
  const right = joined("same-line-right");
  const value = right.length > 0 ? right : joined("next-line");
  if (!REFERENCE_SHAPE.test(value)) return { ok: false, reason: "The reference on this slip could not be read exactly." };

  const reference = bankCode === "KTB" && KTB_HEX_REFERENCE.test(value) ? `A${value.slice(1).toLowerCase()}` : value;
  return { ok: true, bankCode, reference };
}
