import { parseThb } from "@/lib/money";
import { slipDateWindow } from "@/lib/slips";
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
 * ## What this reads only as a suggestion
 *
 * **The counterparty and the note.** Free text in two scripts — the fields least suited to a
 * whitelist — so `proposeSlipText` pre-fills them for the owner to see and correct, and declines
 * with `null` rather than refusing. It never feeds a money decision.
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
  /**
   * Whether the engine saw a space after this word. Optional, because only Vision reports it:
   * Vision splits Thai into syllable-sized words, so joining every word with a space breaks a
   * name ("นาย สม มุ ติ"), while its own break flag gives "นาย สมมุติ". Absent means unknown,
   * and the join falls back to a space.
   */
  spaceAfter?: boolean;
};

export type OcrRefusal =
  | "LABEL_NOT_FOUND"
  | "LABEL_AMBIGUOUS"
  | "NO_VALUE_BESIDE_LABEL"
  | "VALUE_NOT_MONEY"
  | "VALUE_AMBIGUOUS"
  | "DATE_NOT_FOUND"
  | "DATE_AMBIGUOUS"
  | "DATE_YEAR_UNRESOLVED"
  | "DATE_YEAR_DOUBTFUL"
  | "DATE_OUT_OF_RANGE";

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

/**
 * The one text normalisation every label comparison in this repo goes through.
 *
 * Exported because `lib/notification-card-ocr.ts` compares labels against the same OCR words
 * and must normalise them identically — two normalisers that drift apart would make a label
 * match on a slip and miss on a card for reasons no test would name.
 */
export function normalise(text: string): string {
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
 * cleanly once and would have written 1983 dates into the ledger. A two-digit year (KBANK
 * prints `69`) goes through `gregorianFromTwoDigitYear` instead, which assumes no century.
 */
export const BUDDHIST_ERA_OFFSET = 543;

export function gregorianFromPrintedYear(year: number, today: Date): number | null {
  if (!Number.isInteger(year) || year < 1000) return null;
  const converted = year - BUDDHIST_ERA_OFFSET;
  // Fail closed: a converted year must land in the window a slip can plausibly belong to,
  // and an already-Gregorian year printed by mistake must not pass by looking reasonable.
  return inSlipWindow(converted, today) ? converted : null;
}

/** The years a slip can belong to: ten back, one ahead (`SLIP_MAX_AGE_YEARS` server-side). */
const inSlipWindow = (year: number, today: Date) => year >= today.getUTCFullYear() - 10 && year <= today.getUTCFullYear() + 1;

/**
 * A two-digit printed year, completed by arithmetic rather than by assuming a century
 * (`docs/SLIP_CONTRACT.md`, decided by the owner 2026-10-07).
 *
 * Every completion across both eras is a candidate — `24YY`, `25YY`, `26YY` Buddhist and `19YY`,
 * `20YY`, `21YY` Gregorian — and the year is believed only when **exactly one** lands in the
 * slip window. It is the four-digit argument again: D-031's 1983 came from a year read in the
 * wrong era, and two readings of one `YY` sit 43 or 57 years apart, so a twelve-year window can
 * never hold both. More than one survivor, or none, fails closed.
 */
export function gregorianFromTwoDigitYear(year: number, today: Date): number | null {
  if (!Number.isInteger(year) || year < 0 || year > 99) return null;
  const candidates = [2400, 2500, 2600].map((century) => century + year - BUDDHIST_ERA_OFFSET)
    .concat([1900, 2000, 2100].map((century) => century + year))
    .filter((candidate) => inSlipWindow(candidate, today));
  return new Set(candidates).size === 1 ? candidates[0]! : null;
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

/**
 * The month vocabulary as a regular-expression alternation, longest first.
 *
 * Longest first, so a token that is a prefix of another can never shadow it. None currently is,
 * and relying on that would make adding one a silent hazard.
 *
 * **Exported so a second reader cannot keep its own copy of that ordering rule.** KBank Live prints
 * a card's timestamp with the same month tokens a slip uses
 * (`docs/NOTIFICATION_CARD_CONTRACT.md` § KBank Live), and two hand-kept alternations would be two
 * chances to disagree about which token shadows which — the argument `dayNumber` in `lib/dates.ts`
 * makes for sharing rather than copying. **What is deliberately not shared is the era decision**: a
 * slip refuses a two-digit year because nothing tells it which calendar (D-059), while a card
 * resolves one from its layout. That difference is the whole of why `readDateLine` below cannot
 * simply be called by the card reader.
 */
export const MONTH_ALTERNATION = [...THAI_MONTH_TOKENS]
  .sort((a, b) => b[0].length - a[0].length)
  .map(([token]) => escapeForPattern(token))
  .join("|");

// Whitespace is already gone by the time this runs (`normalise`), because Thai has no
// inter-word spaces and where an engine breaks a run is its business (`findLabelLine` makes
// the same argument). The optional time tolerates the separator each layout prints — Krungthai
// and SCB a hyphen, KBANK nothing — and the trailing `น.` KBANK appends. Any number of hyphens:
// Vision read one Krungthai slip's single hyphen as `- -` (2026-10-07).
// **The tail is anchored, and that anchor is load-bearing.** Krungthai and SCB separate the
// year from the time with a hyphen; KBANK separates them with spaces, which `normalise` has
// already removed — so `… 69  11:38 น.` arrives as `…6911:38น.` and an unanchored `\d{2,4}`
// reads the year as `6911`, which then fails the era window and reports "no date on this
// image" about a slip that plainly prints one. Requiring the match to consume to the end of
// the line makes the four-digit reading fail and the two-digit one succeed, which is the
// correct split rather than a lucky one.
const PRINTED_DATE = new RegExp(
  // A trailing mark that is neither letter nor digit is background read as text (`>` after a
  // Krungthai time, D-262); it can never move the year/time split, which is all digits.
  `(\\d{1,2})(${MONTH_ALTERNATION})(\\d{4}|\\d{2})(?:[-–—]*(\\d{1,2}):(\\d{2}))?(?:น\\.)?[^\\p{L}\\p{N}]*$`,
  "u"
);

export type PrintedDate = {
  /** ISO `YYYY-MM-DD`, already converted out of the Buddhist era. */
  iso: string;
  /** `HH:MM` when the layout printed one, null otherwise. */
  time: string | null;
};

/**
 * True when swapping 5<->6 on any non-empty subset of a four-digit printed year's 5/6 digits gives
 * a different Buddhist-era year whose same day/month is a real date inside the slip window.
 */
function hasInWindowYearAlternative(printedYear: number, month: number, day: number, today: Date): boolean {
  const digits = String(printedYear).split("");
  if (digits.length !== 4) return false;
  const positions = digits.flatMap((digit, index) => (digit === "5" || digit === "6" ? [index] : []));
  const window = slipDateWindow(today);
  const isoOf = (year: number) => `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  // A printed date already outside the window is refused downstream ("outside the range"), so
  // there is nothing to doubt: behaviour for it is unchanged.
  const printedIso = isoOf(printedYear - BUDDHIST_ERA_OFFSET);
  if (printedIso < window.earliest || printedIso > window.latest) return false;
  for (let mask = 1; mask < 1 << positions.length; mask += 1) {
    const swapped = [...digits];
    positions.forEach((position, bit) => {
      if (mask & (1 << bit)) swapped[position] = digits[position] === "5" ? "6" : "5";
    });
    const year = Number(swapped.join("")) - BUDDHIST_ERA_OFFSET;
    const utc = new Date(Date.UTC(year, month - 1, day));
    if (utc.getUTCFullYear() !== year || utc.getUTCMonth() !== month - 1 || utc.getUTCDate() !== day) continue;
    const iso = isoOf(year);
    if (iso >= window.earliest && iso <= window.latest) return true;
  }
  return false;
}

/**
 * Where the printed date's four-digit year sits: the word that carries it, the year's offset inside
 * that word's normalised text, and the word's box. Null unless exactly one line reads as a printed
 * date, that line has a four-digit year, and the year lies wholly inside a single word.
 *
 * Shares `PRINTED_DATE` and `groupIntoLines` with `readDateLine` rather than keeping its own
 * grammar, so the line this finds is the line the reader would have used (D-257).
 */
function findPrintedYear(words: readonly OcrWord[]): { index: number; offset: number; box: Box } | null {
  let found: { line: OcrWord[]; yearStart: number } | null = null;
  for (const line of groupIntoLines(words)) {
    const match = PRINTED_DATE.exec(normalise(line.map((word) => word.text).join("")));
    if (!match) continue;
    if (found !== null || match[3]!.length !== 4) return null;
    found = { line, yearStart: match.index + match[1]!.length + match[2]!.length };
  }
  if (found === null) return null;
  let cursor = 0;
  for (const word of found.line) {
    const start = cursor;
    cursor += normalise(word.text).length;
    if (found.yearStart >= start && found.yearStart + 4 <= cursor) {
      return {
        index: words.indexOf(word),
        offset: found.yearStart - start,
        box: { left: word.left, top: word.top, right: word.right, bottom: word.bottom }
      };
    }
  }
  return null;
}

/**
 * The box of the word carrying the printed year, for a second, enlarged read of just that word
 * (D-257). Vision misreads this font's 6 as 5 when it reads the whole slip, and the same word
 * cropped and upscaled reads correctly. Null when there is no single date line, its year is not
 * four digits, or the year is split across words.
 */
export function locatePrintedYear(words: readonly OcrWord[]): Box | null {
  return findPrintedYear(words)?.box ?? null;
}

/**
 * `words` with the printed year's four digits replaced by the digits a re-read of the year's crop
 * gave, or null when that re-read is not exactly four digits. The rest of the word's text and its
 * box are kept, and the input is not modified.
 */
export function withRereadYear(words: readonly OcrWord[], cropWords: readonly OcrWord[]): OcrWord[] | null {
  const digits = normalise(cropWords.map((word) => word.text).join(""));
  if (!/^\d{4}$/u.test(digits)) return null;
  const located = findPrintedYear(words);
  if (located === null || located.index < 0) return null;
  return words.map((word, index) => {
    if (index !== located.index) return word;
    const text = normalise(word.text);
    return { ...word, text: text.slice(0, located.offset) + digits + text.slice(located.offset + 4) };
  });
}

/**
 * Reads one line as a printed date, or refuses.
 *
 * Returns null rather than a refusal when the line simply is not a date, because most lines on
 * a slip are not and the caller is scanning. A line that *is* date-shaped but whose year will
 * not resolve is a refusal, not a null — that difference is what stops an unresolvable KBANK
 * date being silently skipped and some other line picked up instead.
 */
function readDateLine(
  text: string,
  today: Date
): PrintedDate | { unresolvedYear: true } | { doubtfulYear: true } | { outOfRangeYear: true } | null {
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
  // KBANK prints `YY`, the layout where the printed date is the only date there is (D-059).
  // It is completed only when exactly one candidate fits the window; otherwise it still fails
  // closed and says which case it is. A three-digit year is no format any bank prints.
  const short = printedYear < 1000;
  const year = printedYear < 100
    ? gregorianFromTwoDigitYear(printedYear, today)
    : short ? null : gregorianFromPrintedYear(printedYear, today);
  if (year === null && short) return { unresolvedYear: true };
  // Out of era or out of window: date-shaped, but not a date this ledger can believe. Reported as
  // its own refusal rather than as "no date" (D-257): Vision reads Krungthai's 2568 as 2558, which
  // lands here, and a re-read of the year can cure it only if the caller can tell. Only the year
  // failing counts: an impossible calendar day (31 September) is still a plain null.
  if (year === null) {
    const asGregorian = printedYear - BUDDHIST_ERA_OFFSET;
    const probe = new Date(Date.UTC(2000, month - 1, day));
    probe.setUTCFullYear(asGregorian);
    const real = probe.getUTCFullYear() === asGregorian && probe.getUTCMonth() === month - 1 && probe.getUTCDate() === day;
    return real ? { outOfRangeYear: true } : null;
  }

  // A real calendar day, not merely a plausible one: 31 September is refused here rather than
  // rolling forward into October, which is what `Date` would do left alone.
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (utc.getUTCFullYear() !== year || utc.getUTCMonth() !== month - 1 || utc.getUTCDate() !== day) return null;

  // Vision reads Krungthai's printed 6 as 5 ("2569" -> "2559"; measured 2026-10-07, D-257). The
  // wrong reading usually falls outside the window and is refused, but not always: when a 5<->6
  // swap on any year digit gives another real date inside the window, the printed year cannot be
  // trusted, so the line is a refusal rather than a date. Four-digit years only; KBANK's `YY` is
  // handled above.
  if (!short && printedYear >= 1000 && hasInWindowYearAlternative(printedYear, month, day, today)) {
    return { doubtfulYear: true };
  }

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
  let sawDoubtfulYear = false;
  let sawOutOfRangeYear = false;
  for (const line of lines) {
    const read = readDateLine(line.map((word) => word.text).join(""), today);
    if (read === null) continue;
    if ("unresolvedYear" in read) { sawUnresolvedYear = true; continue; }
    if ("doubtfulYear" in read) { sawDoubtfulYear = true; continue; }
    if ("outOfRangeYear" in read) { sawOutOfRangeYear = true; continue; }
    found.push(read);
  }

  // A doubtful line is a refusal that no other line may override, so it is checked before the
  // single-line success below; two believable lines stay DATE_AMBIGUOUS.
  if (found.length === 1 && !sawDoubtfulYear) return { ok: true, value: found[0]!, source: "printed" };
  if (found.length > 1) {
    return {
      ok: false,
      code: "DATE_AMBIGUOUS",
      message: "More than one line on this slip reads as a date, so which one is the transaction's is not decidable."
    };
  }
  if (sawDoubtfulYear) {
    return {
      ok: false,
      code: "DATE_YEAR_DOUBTFUL",
      message: "The year on this slip could be read as more than one year, so the date is not used. Enter the date yourself."
    };
  }
  // Below a doubtful line and above the two-digit refusal; one believable line elsewhere has
  // already won above, so an out-of-range line never blocks a good one.
  if (sawOutOfRangeYear) {
    return { ok: false, code: "DATE_OUT_OF_RANGE", message: "The date printed on this slip is outside the range this ledger accepts." };
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

/**
 * The payee and the memo, read best-effort for the form to pre-fill (never to store unseen).
 *
 * **Unlike the amount, this never refuses — it only declines.** A wrong amount is a wrong
 * number in the ledger; a wrong payee is a visibly wrong name in a field the owner is looking
 * at and can retype. So there are no refusal codes here: anything not found, doubled or empty
 * is simply `null`, and the field stays blank for the owner to type.
 */
export type SlipText = { counterparty: string | null; note: string | null };

// The capture schema's own limits (`lib/slips.ts`), so a long OCR run cannot make an otherwise
// valid capture fail validation over a field the owner never typed.
const COUNTERPARTY_MAX = 240;
const NOTE_MAX = 2000;

const PAYEE_LABEL = "ไปยัง";
// Krungthai's memo label, and KBANK's with a colon. Accepted on every layout, because a memo the
// bank chose to print is worth reading whichever template carried it.
const MEMO_LABEL = "บันทึกช่วยจำ";

/**
 * Where each layout prints its payee and its note (`docs/SLIP_CONTRACT.md`).
 *
 * KBANK has no payee label at all — the name is found by position, after the sender's masked
 * account (see `kbankPayee`) — which is why its payee anchor is null rather than invented.
 */
const SLIP_TEXT_ANCHORS: Record<BankCode, { payee: FieldAnchor | null; note: FieldAnchor }> = {
  SCB: {
    payee: { label: PAYEE_LABEL, position: "same-line-right" },
    note: { label: "ข้อมูลเพิ่มเติมจากผู้ให้บริการ", position: "next-line" }
  },
  KTB: {
    payee: { label: PAYEE_LABEL, position: "next-line" },
    note: { label: MEMO_LABEL, position: "same-line-right" }
  },
  KBANK: {
    payee: null,
    note: { label: `${MEMO_LABEL}:`, position: "next-line" }
  }
};

// Every label any layout prints. A value line that begins with one of these is the *next field*,
// not a value — which happens when the value itself was blank or the engine dropped it — and
// reading it as a payee would put `จำนวนเงิน` in the counterparty. A prefix rather than a
// substring test, because labels open their line and a memo such as "โอนไปยัง…" must survive.
const KNOWN_LABELS = [
  "จำนวนเงิน", "จำนวน:", "ค่าธรรมเนียม", "เลขที่รายการ:", "รหัสอ้างอิง", "วันที่ทำรายการ",
  PAYEE_LABEL, MEMO_LABEL, "ข้อมูลเพิ่มเติมจากผู้ให้บริการ"
].map(normalise);

const isLabelText = (text: string) => {
  const flat = normalise(text);
  return KNOWN_LABELS.some((label) => flat.startsWith(label));
};

/** Display text, not comparison text: `normalise` strips spaces, which a name needs. */
function displayText(text: string, max: number): string | null {
  const capped = text.normalize("NFKC").replace(/\s+/g, " ").trim().slice(0, max).trim();
  return capped.length > 0 ? capped : null;
}

const lineText = (words: readonly OcrWord[]) => words.map((word) => word.text).join(" ");

/** Text to show and store: a space only where the engine saw one, or did not say (`spaceAfter`). */
const shownText = (words: readonly OcrWord[]) =>
  words.map((word, index) => (index > 0 && words[index - 1]!.spaceAfter !== false ? " " : "") + word.text).join("");

/** The value words for one label, or null when the label is missing, doubled or points at a label. */
function labelledValue(lines: readonly OcrWord[][], anchor: FieldAnchor): OcrWord[] | null {
  const found = findLabelLine(lines, anchor.label);
  if (!found.ok) return null;
  const value = valueWordsFor(lines, found, anchor.position);
  if (value.length === 0 || isLabelText(lineText(value))) return null;
  return value;
}

/**
 * SCB draws a round icon left of a merchant payee, and Vision reads it as `E`, `EX` or `E )` —
 * on all 15 iconned SCB slips measured 2026-10-07. Its gap to the name overlaps ordinary word
 * spacing, so the token is matched by its text, and only while a name is left after it.
 */
// `E`, `EX` or `EG`, each with or without `)` (`EX)` seen on a later batch), or a lone `)`.
const SCB_ICON = /^(?:E[XG]?\)?|\))$/;
/**
 * 32 more SCB slips (2026-10-07) showed other icons read as a word with at most one letter in it
 * — `3`, `฿3`, `29`, `E3)`, `(`, `อ`, `ปี`, `๛` — and TrueMoney's logo read as lowercase `true move`.
 * A payee's own first word carries two letters or more (`นาย`, a shop name), so a word with one
 * letter or none is stripped too, again only while a name is left after it. The logo words match
 * exactly and lower-case (`EG` is an SCB icon above), so a payee printed `TRUE …` keeps its name.
 */
const letters = (text: string) => (text.match(/[ก-ฮA-Za-z]/gu) ?? []).length;
// 50 more (same day): `EG dtac` before a TrueMove H top-up, the combined operator's logo.
const OPERATOR_LOGO = /^(?:true|move|money|truemoney|truemove|dtac)$/;
// A word opening with `฿` is an icon too (`฿ER` seen once): no payee's name starts with the baht sign.
const isIconText = (text: string) => SCB_ICON.test(text) || letters(text) <= 1 || OPERATOR_LOGO.test(text) || text.startsWith("฿");
/**
 * Judged per spaced word, not per engine word: Vision splits a Thai name into syllables (`สุ` +
 * `ชาดา`) and an icon into pieces (`E3` + `)`, `(` + `E` + `)`) with no space between them, so the
 * pieces up to each space are joined first. A one-letter first syllable then stays with its name.
 */
function withoutScbIcon(value: OcrWord[]): OcrWord[] {
  const runs: OcrWord[][] = [];
  for (const word of value) {
    const last = runs.at(-1);
    if (last && last.at(-1)!.spaceAfter === false) last.push(word);
    else runs.push([word]);
  }
  let start = 0;
  while (start < runs.length - 1 && isIconText(runs[start]!.map((word) => word.text).join(""))) start += 1;
  return runs.slice(start).flat();
}

/**
 * SCB's payee, with at most one wrapped continuation line.
 *
 * SCB wraps a long company name under itself, indented to where the value began. The next line
 * is taken as a continuation only when it sits entirely right of the label and looks like more
 * name — no digit and no colon, since the line under a short payee is an account number or the
 * next labelled field, and either would corrupt the name rather than finish it.
 */
function scbPayee(lines: readonly OcrWord[][], anchor: FieldAnchor): OcrWord[] | null {
  const found = findLabelLine(lines, anchor.label);
  if (!found.ok) return null;
  const value = withoutScbIcon(valueWordsFor(lines, found, "same-line-right"));
  if (value.length === 0 || isLabelText(lineText(value))) return null;
  const next = lines[found.index + 1];
  if (next && next.length > 0) {
    const text = normalise(lineText(next));
    const indented = next.every((word) => word.left >= found.labelRight);
    if (indented && !/\d/.test(text) && !text.includes(":") && !isLabelText(text)) return [...value, ...next];
  }
  return value;
}

// The sender's masked account as K PLUS prints it, `xxx-x-x1234-x`. It is the only fixed
// landmark between the sender block and the payee's name.
const KBANK_MASKED_ACCOUNT = /^x{3}-x-x\d{4}-x$/i;
const HAS_LETTER = /[ก-ฮA-Za-z]/u;

/**
 * KBANK's payee: the first lettered line after the sender's masked account.
 *
 * The sender's block comes first, so the first masked line is the sender's. The payee's own
 * account is masked the same way on a transfer to another person (most of the 20 K PLUS slips
 * measured 2026-10-07 print two), which is why the first is taken rather than requiring exactly one.
 * If the engine dropped the sender's line, the first masked line is the payee's and the next
 * lettered line is `เลขที่รายการ:`, a label, so the answer is still null rather than wrong.
 */
function kbankPayee(lines: readonly OcrWord[][]): OcrWord[] | null {
  const masked = lines.findIndex((words) => KBANK_MASKED_ACCOUNT.test(normalise(lineText(words))));
  if (masked < 0) return null;
  // Skip the arrow K PLUS draws between the two parties, and anything else with no letter in it.
  const payee = lines.slice(masked + 1).find((words) => HAS_LETTER.test(normalise(lineText(words))));
  if (!payee || isLabelText(lineText(payee))) return null;
  // K PLUS left-aligns both names on the masked account's column; the payee bank's logo sits left
  // of it and Vision reads it as a stray "0" (2 of 20 slips, 2026-10-07).
  const masks = lines[masked]!;
  const column = masks[0]!.left - (masks[0]!.bottom - masks[0]!.top);
  const named = payee.filter((word) => word.left >= column);
  return named.length > 0 ? named : null;
}

// Krungthai's masked accounts: `XXX-X-XX445-1`, a PromptPay `XXX-XXXXXXXX-7322` or `XXX XXX 9572`
// (spaces are gone after `normalise`), once with a stray `___` before it.
// Leading strokes are the slip's arrow graphic read as text (`___`, `//____`, measured 2026-10-07).
const KTB_MASKED_ACCOUNT = /^[_/\\|]*x{3}[-x]*\d{3,4}(?:-\d)?$/i;

/**
 * Krungthai's payee (9 slips measured 2026-10-07).
 *
 * A transfer prints `ไปยัง` on its own line, then the payee's name — wrapped onto a second line
 * when it is long — then the payee's bank (or `พร้อมเพย์`) and the payee's masked account. So the
 * name is the lines between the label and the line above the next masked account, at most two.
 * A bill payment prints no label at all: the biller's name is the first line after the sender's
 * masked account. Either way a bank logo left of the name reads as a one-letter word (`e`) and is
 * dropped by the same rule as SCB's icons.
 */
function ktbPayee(lines: readonly OcrWord[][]): OcrWord[] | null {
  const masked = (from: number) => lines.findIndex((words, index) => index >= from && KTB_MASKED_ACCOUNT.test(normalise(lineText(words))));
  const label = findLabelLine(lines, PAYEE_LABEL);
  let name: OcrWord[][];
  if (label.ok) {
    // A logo on a line of its own (`e` for PromptPay, `G` for G-Wallet) is skipped, not taken as the name.
    let first = label.index + 1;
    while (first < lines.length && letters(lineText(lines[first]!)) <= 1) first += 1;
    const nextMasked = masked(first);
    const end = nextMasked - 1;
    const span = nextMasked > 0 && end - first >= 1 && end - first <= 2
      ? lines.slice(first, end)
      : lines.slice(first, first + 1);
    name = span.filter((words) => !isLabelText(lineText(words)));
  } else {
    if (label.code !== "LABEL_NOT_FOUND") return null;
    const sender = masked(0);
    const first = sender < 0 ? undefined : lines[sender + 1];
    name = first && HAS_LETTER.test(normalise(lineText(first))) && !isLabelText(lineText(first)) ? [first] : [];
  }
  if (name.length === 0) return null;
  const value = withoutScbIcon(name.flat());
  return value.length > 0 ? value : null;
}

/**
 * The note: the bank's own note label, plus the generic memo label where the layout's own label
 * is not already that one. Where both carry text (an SCB bill payment with a memo), both are kept.
 */
function slipNote(lines: readonly OcrWord[][], bank: BankCode): string | null {
  const own = SLIP_TEXT_ANCHORS[bank].note;
  const parts: string[] = [];
  const ownValue = labelledValue(lines, own);
  const ownText = ownValue ? displayText(shownText(ownValue), NOTE_MAX) : null;
  if (ownText) parts.push(ownText);

  // On Krungthai and KBANK the own label *is* the memo label (KBANK with a colon), so the generic
  // label is only a fallback for an engine that dropped KBANK's colon — tried when the own label
  // is absent, never as a second read of the same line.
  const ownIsMemo = normalise(own.label).includes(normalise(MEMO_LABEL));
  const ownFound = findLabelLine(lines, own.label);
  if (!ownIsMemo || (!ownFound.ok && ownFound.code === "LABEL_NOT_FOUND")) {
    const found = findLabelLine(lines, MEMO_LABEL);
    if (found.ok) {
      const right = valueWordsFor(lines, found, "same-line-right");
      const value = right.length > 0 ? right : valueWordsFor(lines, found, "next-line");
      const text = value.length > 0 && !isLabelText(lineText(value)) ? displayText(shownText(value), NOTE_MAX) : null;
      if (text && !parts.includes(text)) parts.push(text);
    }
  }
  return displayText(parts.join(" · "), NOTE_MAX);
}

export function proposeSlipText(words: readonly OcrWord[], bank: BankCode): SlipText {
  const lines = groupIntoLines(words);
  const payeeAnchor = SLIP_TEXT_ANCHORS[bank].payee;
  const payee = payeeAnchor === null
    ? kbankPayee(lines)
    : bank === "SCB" ? scbPayee(lines, payeeAnchor) : ktbPayee(lines);
  return {
    counterparty: payee ? displayText(shownText(payee), COUNTERPARTY_MAX) : null,
    note: slipNote(lines, bank)
  };
}
