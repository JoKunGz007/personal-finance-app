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
 * **The counterparty.** The contract says it is not sized, and it is free text in two
 * scripts — the field least suited to a whitelist and the one where a wrong read is least
 * visible. It stays typed.
 *
 * ## What it now does read
 *
 * **The printed date**, as of 2026-08-10, once the month vocabulary was measured across all
 * three layouts (`docs/SLIP_CONTRACT.md` § The month vocabulary). 14 of 23 slips carry a
 * Gregorian date inside the QR reference already, exactly and under the QR's own CRC (D-059),
 * so this matters most on KBANK, whose reference carries none — and KBANK is also the one
 * layout this still refuses, because it prints a two-digit year. See `readPrintedDate`.
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
  | "VALUE_AMBIGUOUS"
  | "DATE_NOT_FOUND"
  | "DATE_AMBIGUOUS"
  | "DATE_YEAR_UNRESOLVED";

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

/** A region of the source image, in the same pixel space the words are reported in. */
export type Box = { left: number; top: number; right: number; bottom: number };

/**
 * Where the amount sits, so the form can show it rather than type it (D-087).
 *
 * **This is the whole reason an engine is worth shipping, and it is a much weaker claim than
 * reading the figure.** It answers "which part of this image is the amount" and stops there;
 * the owner reads the digits. No machine-read digit enters the ledger, so the ~1-in-15
 * cross-configuration instability measured on 2026-08-10 — at least one of which passed the
 * money grammar while being wrong — cannot reach a stored value at all.
 *
 * It also covers **more** slips than reading would. `proposeAmount` needs the figure to parse
 * as money; this needs only the label to be found and something to sit beside it. On the 23
 * real samples the label was found on 16–17 while the amount parsed on 13–15, so the weaker
 * question is answerable on strictly more images — and on exactly the images where reading
 * failed for digit reasons, which are the ones a person most needs to see enlarged.
 *
 * The label is included in the box on purpose: a crop showing `จำนวนเงิน` above the figure says
 * which field it is, where a bare number crop asks the owner to trust the targeting.
 */
export function locateAmount(words: readonly OcrWord[], bank: BankCode): OcrRead<Box> {
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
  const value = valueWordsFor(lines, found, anchor.position);
  if (value.length === 0) {
    return { ok: false, code: "NO_VALUE_BESIDE_LABEL", message: "Nothing sits beside that label to show." };
  }
  // The label's own line and the value together, so the crop is self-describing whether the
  // value sits beside the label (Krungthai, SCB) or under it (KBANK).
  const region = [...(lines[found.index] ?? []), ...value];
  return {
    ok: true,
    value: {
      left: Math.min(...region.map((word) => word.left)),
      top: Math.min(...region.map((word) => word.top)),
      right: Math.max(...region.map((word) => word.right)),
      bottom: Math.max(...region.map((word) => word.bottom))
    },
    source: anchor.label
  };
}

/**
 * The region to actually crop: `locateAmount`'s box with breathing room, clamped to the image.
 *
 * Padding is proportional to the box rather than fixed, because these images arrive at whatever
 * resolution the owner's phone screenshotted at — a 12-pixel margin is generous on one and
 * invisible on another.
 */
export function paddedCrop(box: Box, image: { width: number; height: number }, ratio = 0.35): Box {
  const padX = (box.right - box.left) * ratio;
  const padY = (box.bottom - box.top) * ratio;
  return {
    left: Math.max(0, Math.round(box.left - padX)),
    top: Math.max(0, Math.round(box.top - padY)),
    right: Math.min(image.width, Math.round(box.right + padX)),
    bottom: Math.min(image.height, Math.round(box.bottom + padY))
  };
}

/**
 * The month vocabulary, measured across all three layouts on 2026-08-10.
 *
 * **Matched as a token list, never as a shape, and that is the whole point.** Nine of the
 * twelve are two consonants between periods, so `[ก-ฮ]\.[ก-ฮ]\.` looks like it works — and
 * silently misses `มี.ค.`, `เม.ย.` and `มิ.ย.`, which carry a vowel (`เม.ย.` begins with
 * one). A reader built that way passes every test written in a month that is not March, April
 * or June, and fails three months of the year in production.
 *
 * This table is standard Thai calendar vocabulary rather than anything the slips disclosed,
 * which is why it can be written here in full: what the slips established is that all three
 * layouts print *this* form rather than a Latin `Jul` or a full `กรกฎาคม`
 * (`docs/SLIP_CONTRACT.md`).
 */
export const THAI_MONTH_TOKENS: ReadonlyArray<readonly [string, number]> = [
  ["ม.ค.", 1], ["ก.พ.", 2], ["มี.ค.", 3], ["เม.ย.", 4], ["พ.ค.", 5], ["มิ.ย.", 6],
  ["ก.ค.", 7], ["ส.ค.", 8], ["ก.ย.", 9], ["ต.ค.", 10], ["พ.ย.", 11], ["ธ.ค.", 12]
];

function escapeForPattern(token: string): string {
  return token.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

// Longest first, so a token that is a prefix of another can never shadow it. None currently
// is, and relying on that would make adding one a silent hazard.
const MONTH_ALTERNATION = [...THAI_MONTH_TOKENS]
  .sort((a, b) => b[0].length - a[0].length)
  .map(([token]) => escapeForPattern(token))
  .join("|");

// Whitespace is already gone by the time this runs (`normalise`), because Thai has no
// inter-word spaces and where an engine breaks a run is its business (`findLabelLine` makes
// the same argument). The optional time tolerates the separator each layout prints — Krungthai
// and SCB a hyphen, KBANK nothing — and the trailing `น.` KBANK appends.
// **The tail is anchored, and that anchor is load-bearing.** Krungthai and SCB separate the
// year from the time with a hyphen; KBANK separates them with spaces, which `normalise` has
// already removed — so `… 69  11:38 น.` arrives as `…6911:38น.` and an unanchored `\d{2,4}`
// reads the year as `6911`, which then fails the era window and reports "no date on this
// image" about a slip that plainly prints one. Requiring the match to consume to the end of
// the line makes the four-digit reading fail and the two-digit one succeed, which is the
// correct split rather than a lucky one.
const PRINTED_DATE = new RegExp(
  `(\\d{1,2})(${MONTH_ALTERNATION})(\\d{4}|\\d{2})(?:[-–—]?(\\d{1,2}):(\\d{2}))?(?:น\\.)?$`,
  "u"
);

export type PrintedDate = {
  /** ISO `YYYY-MM-DD`, already converted out of the Buddhist era. */
  iso: string;
  /** `HH:MM` when the layout printed one, null otherwise. */
  time: string | null;
};

/**
 * Reads one line as a printed date, or refuses.
 *
 * Returns null rather than a refusal when the line simply is not a date, because most lines on
 * a slip are not and the caller is scanning. A line that *is* date-shaped but whose year will
 * not resolve is a refusal, not a null — that difference is what stops an unresolvable KBANK
 * date being silently skipped and some other line picked up instead.
 */
function readDateLine(text: string, today: Date): PrintedDate | { unresolvedYear: true } | null {
  const match = PRINTED_DATE.exec(normalise(text));
  if (!match) return null;
  const day = Number(match[1]);
  const month = THAI_MONTH_TOKENS.find(([token]) => token === match[2])?.[1];
  const printedYear = Number(match[3]);
  if (month === undefined || day < 1 || day > 31) return null;

  // Two failures live behind `gregorianFromPrintedYear`'s single null, and they must not be
  // reported as one. A two-digit year is a decision this reader has not taken; a four-digit
  // year outside the plausible window is simply not a usable date. Collapsing them told the
  // owner "this slip prints a two-digit year" about a slip printing four.
  if (printedYear < 1000) {
    // The decision, not an omission. KBANK prints `YY`, so it is the layout where the printed
    // date is the only date there is (D-059) — and also the one this refuses. Completing a
    // two-digit year means assuming a century, which is guessing at the exact point D-031
    // already cost this project a ledger dated 1983. It *may* reduce to arithmetic — the
    // candidate set across both eras is small, and a window admitting exactly one would settle
    // it the way the four-digit case is settled — but that is undecided, so it fails closed
    // and names which case it is (`docs/SLIP_CONTRACT.md`, `PLAN.md` task 21).
    return { unresolvedYear: true };
  }
  const year = gregorianFromPrintedYear(printedYear, today);
  // Out of era or out of window: date-shaped, but not a date this ledger can believe.
  if (year === null) return null;

  // A real calendar day, not merely a plausible one: 31 September is refused here rather than
  // rolling forward into October, which is what `Date` would do left alone.
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (utc.getUTCFullYear() !== year || utc.getUTCMonth() !== month - 1 || utc.getUTCDate() !== day) return null;

  const hour = match[4] === undefined ? null : Number(match[4]);
  const minute = match[5] === undefined ? null : Number(match[5]);
  const time = hour !== null && minute !== null && hour < 24 && minute < 60
    ? `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
    : null;

  return { iso: `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`, time };
}

/**
 * The printed date, found by scanning rather than by a label.
 *
 * **Only Krungthai labels its date** (`วันที่ทำรายการ`); SCB centres it under the title and
 * KBANK left-aligns it there, both with no label at all (`docs/SLIP_CONTRACT.md`). So there is
 * nothing to anchor on for two of the three layouts, and the date is instead identified by
 * being the one line that parses as one. That is safe here in a way it would not be for the
 * amount: a date grammar requires a month token from a closed list, which a reference, a
 * masked account number or a memo cannot satisfy, whereas money is just digits and the fee
 * line is also money — which is why `readAmount` insists on its label and this does not.
 *
 * Two date-shaped lines is a refusal rather than a first-match, for the same reason a doubled
 * label is: picking one would be a guess wearing a result's clothing.
 */
export function readPrintedDate(words: readonly OcrWord[], today: Date): OcrRead<PrintedDate> {
  const lines = groupIntoLines(words);
  const found: PrintedDate[] = [];
  let sawUnresolvedYear = false;
  for (const line of lines) {
    const read = readDateLine(line.map((word) => word.text).join(""), today);
    if (read === null) continue;
    if ("unresolvedYear" in read) { sawUnresolvedYear = true; continue; }
    found.push(read);
  }

  if (found.length === 1) return { ok: true, value: found[0]!, source: "printed" };
  if (found.length > 1) {
    return {
      ok: false,
      code: "DATE_AMBIGUOUS",
      message: "More than one line on this slip reads as a date, so which one is the transaction's is not decidable."
    };
  }
  if (sawUnresolvedYear) {
    return {
      ok: false,
      code: "DATE_YEAR_UNRESOLVED",
      message: "This slip prints a two-digit year, which this reader will not complete. Enter the date yourself."
    };
  }
  return { ok: false, code: "DATE_NOT_FOUND", message: "No line on this image reads as a date." };
}
