import { parseThb } from "@/lib/money";
import type { BankCode } from "@/lib/statement-frame";

/**
 * Reading printed fields off a slip image (PLAN task 21, D-050).
 *
 * **This file contains no OCR engine and deliberately depends on none.** It is the policy
 * half — what counts as a readable amount, where a value sits relative to its label, and
 * when to refuse — kept apart from whatever recognises glyphs, exactly as `lib/slip-scan.ts`
 * is kept apart from the browser machinery that supplies pixels (D-053). The separation
 * earned itself once already: the retry ladder is a policy bug's natural home, and a test can
 * drive it without a browser. The same applies here, more so, because every rule below is
 * about refusing rather than recognising.
 *
 * The engine, when one is chosen, has only to produce `OcrWord`s. Every OCR engine worth
 * using reports a word and its box; nothing here assumes more than that.
 *
 * ## Why labels anchor and geometry does not
 *
 * `docs/SLIP_CONTRACT.md` measured this against the 23 real slips and the answer was
 * unambiguous: **region targeting must be anchored on labels, not on fractions of the
 * image.** SCB prints at least three transaction types whose bodies differ in height — a
 * bill payment adds a biller block of four lines and moves the amount a fifth of the image
 * down the page. Krungthai's bottom block gains a row whenever a memo exists or a recipient
 * name wraps. KBANK's blocks move the same way. A box at a fixed fraction reads the wrong
 * line on a real slip, which is the lesson D-024 and D-026 already paid for on statements.
 *
 * ## Why nothing here corrects a character
 *
 * The contract names the confusions that would silently change money: `0`/`o`, `1`/`7`, and
 * a comma against a full stop. The temptation is to repair them. This file never does. A
 * corrected amount is an invented amount, and it would arrive wearing the same confidence as
 * a correct one — so anything outside the strict money grammar is **refused**, and the owner
 * types it. Refusing costs a few seconds; correcting costs a wrong number in the ledger that
 * only a reconciliation would ever catch, and D-030 and D-031 are what that looks like when
 * it happens to a statement.
 *
 * The one transformation performed is Thai digits to Arabic (`๐`–`๙`), which is a lossless
 * one-to-one transliteration rather than a guess about a doubtful glyph.
 *
 * ## What this deliberately does not read yet
 *
 * **The printed date**, except to refuse an out-of-era one. 14 of 23 slips carry a Gregorian
 * date inside the QR reference already, exactly and under the QR's own CRC (D-059), so the
 * printed date is only the sole source on KBANK. Reading it needs the month token forms, and
 * `docs/SLIP_CONTRACT.md` records the date *layout* without recording whether the months
 * print in Thai or Latin abbreviations — so writing a month table now would be inventing
 * format knowledge nobody has measured. `printedYearIsBuddhist` below is the half that can
 * be written without it, because the era hazard is arithmetic rather than vocabulary.
 *
 * **The counterparty.** The contract says it is not sized, and it is free text in two
 * scripts — the field least suited to a whitelist and the one where a wrong read is least
 * visible. It stays typed.
 */

/** One recognised word and where it sits. The only thing an engine must supply. */
export type OcrWord = {
  text: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export type OcrRefusal =
  | "LABEL_NOT_FOUND"
  | "LABEL_AMBIGUOUS"
  | "NO_VALUE_BESIDE_LABEL"
  | "VALUE_NOT_MONEY"
  | "VALUE_AMBIGUOUS";

export type OcrRead<T> = { ok: true; value: T; source: string } | { ok: false; code: OcrRefusal; message: string };

/** Where a value sits relative to the label that names it. */
export type ValuePosition = "same-line-right" | "next-line";

export type FieldAnchor = { label: string; position: ValuePosition };

/**
 * The label inventory, transcribed from `docs/SLIP_CONTRACT.md` rather than from a slip.
 *
 * Label wordings are format knowledge and are recordable; the values beside them are not
 * (`docs/FIXTURE_POLICY.md`, and the same rule the statement contracts follow).
 *
 * **The fee is listed for every layout that prints one, and that is the point of listing
 * it.** A fee is money, on its own line, near the amount, and reading it as the amount would
 * produce a plausible wrong number rather than an obvious failure. Naming it means the
 * amount is found by its own label or not at all — see `readAmount`, which never falls back
 * to whatever other money it can see.
 */
export const SLIP_FIELD_ANCHORS: Record<BankCode, { amount: FieldAnchor; fee: FieldAnchor | null }> = {
  KTB: {
    amount: { label: "จำนวนเงิน", position: "same-line-right" },
    fee: { label: "ค่าธรรมเนียม", position: "same-line-right" }
  },
  SCB: {
    // SCB prints no `บาท` suffix after its amount and no fee line at all.
    amount: { label: "จำนวนเงิน", position: "same-line-right" },
    fee: null
  },
  KBANK: {
    // The layout that puts its value on the line *below* the label, which is why position is
    // a property of the anchor rather than a constant.
    amount: { label: "จำนวน:", position: "next-line" },
    fee: { label: "ค่าธรรมเนียม:", position: "next-line" }
  }
};

const THAI_DIGITS = "๐๑๒๓๔๕๖๗๘๙";

/** Lossless: Thai digits map one-to-one onto Arabic ones, so this decides nothing. */
function arabicDigits(text: string): string {
  let out = "";
  for (const character of text) {
    const thai = THAI_DIGITS.indexOf(character);
    out += thai >= 0 ? String(thai) : character;
  }
  return out;
}

function normalise(text: string): string {
  return arabicDigits(text.normalize("NFKC")).replace(/\s+/g, "");
}

/**
 * Groups words into visual lines.
 *
 * Vertical overlap rather than a shared `top`: OCR reports a taller box for a word with an
 * ascender or a Thai tone mark above it, so two words on one line rarely agree on either
 * edge. Overlap of the *bands* is what actually means "same line", and Thai stacks marks
 * high enough that a threshold tuned on Latin text would split a line in two.
 */
export function groupIntoLines(words: readonly OcrWord[]): OcrWord[][] {
  const ordered = [...words].sort((a, b) => a.top - b.top || a.left - b.left);
  const lines: OcrWord[][] = [];
  for (const word of ordered) {
    const line = lines[lines.length - 1];
    if (line) {
      const last = line[line.length - 1]!;
      const overlap = Math.min(word.bottom, last.bottom) - Math.max(word.top, last.top);
      const shorter = Math.min(word.bottom - word.top, last.bottom - last.top);
      if (shorter > 0 && overlap > shorter * 0.5) {
        line.push(word);
        line.sort((a, b) => a.left - b.left);
        continue;
      }
    }
    lines.push([word]);
  }
  return lines;
}

/**
 * Finds the line carrying a label, and the label's right edge on it.
 *
 * A label may be split across several OCR words — Thai has no inter-word spaces, so where an
 * engine breaks `จำนวนเงิน` is its business and not something to depend on. The line's text
 * is therefore joined before matching, and the label's right edge is taken from the last word
 * that contributed to the match.
 *
 * **Two lines carrying the same label is a refusal, not a first-match.** `ค่าธรรมเนียม` and
 * `จำนวนเงิน` each appear once on a well-formed slip; twice means the image caught something
 * this policy does not model, and picking one would be a guess wearing a result's clothing.
 */
export function findLabelLine(
  lines: readonly OcrWord[][],
  label: string
): { ok: true; index: number; labelRight: number } | { ok: false; code: "LABEL_NOT_FOUND" | "LABEL_AMBIGUOUS" } {
  const wanted = normalise(label);
  const hits: Array<{ index: number; labelRight: number }> = [];
  lines.forEach((line, index) => {
    let joined = "";
    let labelRight: number | null = null;
    for (const word of line) {
      joined += normalise(word.text);
      if (labelRight === null && joined.includes(wanted)) labelRight = word.right;
    }
    if (labelRight !== null) hits.push({ index, labelRight });
  });
  if (hits.length === 0) return { ok: false, code: "LABEL_NOT_FOUND" };
  if (hits.length > 1) return { ok: false, code: "LABEL_AMBIGUOUS" };
  return { ok: true, ...hits[0]! };
}

/** The words a label points at: to its right on the same line, or the whole line below. */
export function valueWordsFor(
  lines: readonly OcrWord[][],
  anchor: { index: number; labelRight: number },
  position: ValuePosition
): OcrWord[] {
  if (position === "same-line-right") {
    return (lines[anchor.index] ?? []).filter((word) => word.left >= anchor.labelRight);
  }
  return [...(lines[anchor.index + 1] ?? [])];
}

// Money as these layouts print it: grouped thousands, an optional two-place fraction, and
// nothing else. Anchored at both ends on purpose — a partial match is how `1,250.00` becomes
// `1` when the engine drops a glyph, and a silent truncation of money is the worst failure
// this file could have.
const PRINTED_MONEY = /^(?:0|[1-9]\d{0,2}(?:,\d{3})*|[1-9]\d*)(?:\.\d{2})?$/;

// Everything a layout may legitimately print around the number. `บาท` follows the amount on
// Krungthai and KBANK and not on SCB (`docs/SLIP_CONTRACT.md`), so it is stripped rather
// than required.
const MONEY_ORNAMENT = /[฿]|บาท/g;

/**
 * Reads an amount, or refuses.
 *
 * The grammar is deliberately narrower than `parseThb`'s: it also rejects a bare `1250.5`,
 * because a slip prints two fractional places and one place means a dropped glyph rather
 * than a tidy number. `parseThb` still does the final conversion, so this path and the typed
 * path agree on what a THB amount is by construction rather than by two implementations
 * happening to match.
 */
export function readAmount(words: readonly OcrWord[]): OcrRead<string> {
  const source = words.map((word) => word.text).join(" ").trim();
  const candidates = words
    .map((word) => normalise(word.text).replace(MONEY_ORNAMENT, ""))
    .filter((text) => text.length > 0)
    .filter((text) => /\d/.test(text));
  if (candidates.length === 0) {
    return { ok: false, code: "NO_VALUE_BESIDE_LABEL", message: "Nothing readable sits beside that label." };
  }
  const money = candidates.filter((text) => PRINTED_MONEY.test(text));
  if (money.length === 0) {
    // The common cause is exactly the confusion the contract warned about — an `o` for a
    // `0`, or a full stop read as a comma — and the answer is to say so and let the owner
    // type it, never to repair it.
    return {
      ok: false,
      code: "VALUE_NOT_MONEY",
      message: "That does not read as a plain amount. Type it from the image instead of trusting a doubtful character."
    };
  }
  if (money.length > 1 && new Set(money).size > 1) {
    return { ok: false, code: "VALUE_AMBIGUOUS", message: "More than one amount reads off that line." };
  }
  try {
    return { ok: true, value: parseThb(money[0]!).minor, source };
  } catch {
    return { ok: false, code: "VALUE_NOT_MONEY", message: "That does not read as a plain amount." };
  }
}

/**
 * The amount for a bank, found by its own label or not at all.
 *
 * There is no fallback to "the other money on the slip", and that absence is the design. On
 * Krungthai and KBANK the fee is money on a nearby line; a reader that shrugged and took the
 * nearest number would return a fee as an amount, and a fee is small, plausible and wrong.
 */
export function proposeAmount(words: readonly OcrWord[], bank: BankCode): OcrRead<string> {
  const lines = groupIntoLines(words);
  const anchor = SLIP_FIELD_ANCHORS[bank].amount;
  const found = findLabelLine(lines, anchor.label);
  if (!found.ok) {
    return {
      ok: false,
      code: found.code,
      message: found.code === "LABEL_NOT_FOUND"
        ? "The amount's label could not be found on this image."
        : "That label appears more than once, so which line carries the amount is not decidable."
    };
  }
  return readAmount(valueWordsFor(lines, found, anchor.position));
}

/**
 * True when a printed year is Buddhist and must be converted before it is believed.
 *
 * **The asymmetry here is the easy thing to get backwards, so it is stated rather than
 * assumed:** a date read from the QR reference is already Gregorian and needs no conversion
 * (D-059), while a date read from the printed slip is Buddhist and always does. The two
 * sources disagree by 543 years on the same slip.
 *
 * D-031 is why this is a guard rather than a silent subtraction: a 543-year shift parsed
 * cleanly once and would have written 1983 dates into the ledger. Two-digit years are
 * refused outright — KBANK prints `69`, which is `2569` BE and `2026` CE, and a reader that
 * resolves a two-digit year by assuming a century is guessing at exactly the point where
 * this project has already been burned.
 */
export const BUDDHIST_ERA_OFFSET = 543;

export function gregorianFromPrintedYear(year: number, today: Date): number | null {
  if (!Number.isInteger(year) || year < 1000) return null;
  const converted = year - BUDDHIST_ERA_OFFSET;
  const thisYear = today.getUTCFullYear();
  // Fail closed: a converted year must land in the window a slip can plausibly belong to,
  // and an already-Gregorian year printed by mistake must not pass by looking reasonable.
  if (converted > thisYear + 1 || converted < thisYear - 10) return null;
  return converted;
}
