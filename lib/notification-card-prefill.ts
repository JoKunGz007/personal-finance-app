import { isoDateSchema } from "@/lib/dates";
import { parseThb } from "@/lib/money";
import { resolveCardYear, type NotificationCardLayout } from "@/lib/notification-card";
import type { Box, CardFieldName, CardOcrRead, OcrWord } from "@/lib/notification-card-ocr";
import { MONTH_ALTERNATION, THAI_MONTH_TOKENS, groupIntoLines, normalise } from "@/lib/slip-ocr";

/**
 * What a card's located fields would offer a form, or why they offer nothing (PLAN task 34 part 1).
 *
 * **This is D-087 on trial rather than reversed** (D-114). `lib/notification-card-ocr.ts` locates a
 * field and reads no digit; this module reads the digits inside a located box and hands them to the
 * form as a *starting value the owner can overtype*. Whether that survives is the trial's question,
 * and the trial's independent check is the statement rather than anything in this file: a wrongly
 * pre-filled figure fails to pair with its statement row and surfaces as `AWAITING STATEMENT`.
 *
 * ## Why offering a digit is defensible here, and it is not a softening
 *
 * D-087 refused a pre-fill because a wrong figure "would be indistinguishable from a correct one".
 * D-112 measured that on 19 real cards and found the opposite: of 19 amounts, none came back
 * wrong-but-plausible. What breaks is never the number — it is the punctuation around it, `-` read
 * as `=` and `/` as `|` or `!`. So the shape of a safe pre-fill is:
 *
 *   1. **repair characters that carry no value** — and prove that is all that happened;
 *   2. **run the strict grammar already in `lib/money.ts`**, never a forgiving one; and
 *   3. **return nothing rather than a guess** when either step refuses.
 *
 * **Step 1's guard is the load-bearing part, not its substitution list.** `repairToken` compares the
 * digit sequence before and after and discards the whole repair if it changed, so a confusion class
 * added carelessly in future still cannot alter a number. That is the sentence to keep if only one
 * survives, and it has its own test.
 *
 * **Nothing here softens `parseThb`.** A lenient parser that "helpfully" stripped an unknown
 * character would turn `=15.00` into a valid-looking figure and manufacture exactly the silent error
 * D-112 went looking for and did not find (D-112, final risk paragraph).
 *
 * ## Ported, not invented
 *
 * Every rule below comes from the throwaway harness that produced D-113's numbers, so the fill rates
 * this module will show are the measured ones: on 10 images and 19 cards, amount **17/19**, balance
 * **15/19**, own account **11/19**, date and time **10/19**. A field that refuses is left blank and
 * typed exactly as it is today, so a trial can only reduce typing, never add it.
 *
 * **The measurement did not establish that an accepted figure is *correct***, and neither does this
 * module. That needs the card, and the card is the owner's to read.
 *
 * ## Two limits worth knowing before reading the numbers
 *
 * **Both printed date forms are read: slashed, and KBank Live's Thai month name.** The month-name
 * reader was built, measured at **0 of 2** and removed on 2026-08-16 (D-117) because the local
 * engine could not see those rows at all — then restored the same day once Cloud Vision read them
 * and this grammar was what refused them (D-118). That history is the point rather than noise: a
 * feature that does not work and a feature whose input never arrives look identical from the
 * outside, and only a measurement separates them.
 *
 * **The money shape wants printed thousands separators.** `MONEY` accepts `1,234.00` and `234.00`
 * but not an ungrouped `1234.00`, because that is how the three layouts print
 * (`docs/NOTIFICATION_CARD_CONTRACT.md`). It is a shape gate in front of the grammar, and it errs
 * towards refusing.
 *
 * **No engine and no React**, exactly as `lib/notification-card-ocr.ts` depends on neither. The seam
 * is `OcrWord` plus an already-located `Box`, so every rule here is drivable by a test with no
 * browser and no image.
 */

/** The four digit-bearing fields a card stores, which is what a pre-fill has to get right. */
export const PREFILL_FIELDS = ["amount", "balance", "occurredAt", "ownAccount"] as const;

export type PrefillField = (typeof PREFILL_FIELDS)[number];

export type PrefillRefusal =
  /** The reader would not say where this field is, so there is nothing to read. */
  | "NOT_LOCATED"
  /** Nothing digit-shaped inside the located box. Usually a region holding only label text. */
  | "NO_DIGITS"
  /** Digits are present and no token has the shape a printed figure has. */
  | "NO_MONEY_TOKEN"
  /** The shape matched and `parseThb` still refused. Never papered over — see the module note. */
  | "GRAMMAR_REFUSED"
  /** An amount whose sign character did not survive the digit guard. Refused, not assumed. */
  | "SIGN_UNREADABLE"
  | "DATE_NOT_READ"
  | "TIME_NOT_READ"
  /** The printed year does not resolve under this layout's era rule. */
  | "YEAR_NOT_RESOLVED"
  /** The parts read as a date that no calendar has, such as a 31st of February. */
  | "NOT_A_CALENDAR_DATE"
  /** The account region yielded some digits, and not the four a card prints. */
  | "WRONG_DIGIT_COUNT";

/**
 * An offer or a refusal, shaped like `CardOcrRead` in the sibling module on purpose.
 *
 * `why` is written for the owner rather than for a log: a refusal is shown beside the blank field
 * it explains, and "the sign could not be read" is a different instruction from "nothing legible
 * here" even though both mean *type it yourself*.
 */
export type PrefillOffer<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly code: PrefillRefusal; readonly why: string };

/**
 * A magnitude and the sign the card printed beside it, kept apart.
 *
 * The form's amount box holds a magnitude and its Direction control carries the sign
 * (`app/notification-card-capture.tsx`, `parsedAmount`), so offering `-1,234.00` into the box would
 * be offering a value that field does not hold. **The sign is deliberately not offered to the
 * Direction control either**: `readDirection` cross-checks the card's words against what the owner
 * chose, and filling in the owner's half would compare the image with itself and always agree.
 */
export type PrefillAmount = {
  /** As printed, thousands separators and all — `parseThb` strips them. */
  readonly magnitude: string;
  /** `""` when the card printed no sign, which is ordinary on the layouts that use a title. */
  readonly sign: "-" | "+" | "";
};

/** `date` is ISO `YYYY-MM-DD` and `time` is `HH:MM`, which is what the form's two inputs hold. */
export type PrefillTimestamp = { readonly date: string; readonly time: string };

export type CardPrefill = {
  readonly amount: PrefillOffer<PrefillAmount>;
  /** Signed as printed: a balance is a position, zero is ordinary and negative is an overdraft. */
  readonly balance: PrefillOffer<string>;
  readonly occurredAt: PrefillOffer<PrefillTimestamp>;
  /** The four digits as printed — never reordered or padded, per `assertPrintedDigits`. */
  readonly ownAccount: PrefillOffer<string>;
};

function refuse(code: PrefillRefusal, why: string): { ok: false; code: PrefillRefusal; why: string } {
  return { ok: false, code, why };
}

/** A money magnitude as a card prints it. No sign: that is read separately and reported separately. */
const MONEY = /^\d{1,3}(?:,\d{3})*(?:\.\d{2})?$/u;
/** A slashed date, as two of the three layouts print it. **Separators must be real**, the point. */
const PRINTED_DATE = /^(\d{2})\/(\d{2})\/(\d{2}|\d{4})$/u;
const PRINTED_TIME = /^([01]\d|2[0-3]):[0-5]\d$/u;

/**
 * A date printed with a Thai month name, which is KBank Live's form and only its form.
 *
 * That layout prints `d <thai-month-abbrev> yy hh:mm` then the marker `น.`, with no label at all
 * (`docs/NOTIFICATION_CARD_CONTRACT.md`). Nothing slashed appears on it, so a reader knowing only
 * the slashed form refuses every KBank timestamp.
 *
 * **This was built, measured at zero and removed once already the same day** (D-117), because the
 * local engine could not see those rows at all — the grammar was never what was missing. Cloud
 * Vision reads them and this grammar then refused them, which is what brings it back (D-118). The
 * history is worth keeping: it is the difference between a feature that does not work and a feature
 * whose input never arrived.
 *
 * **The tail anchor is load-bearing and is the same one `lib/slip-ocr.ts` documents.** `normalise`
 * has already removed the spaces this layout separates its parts with, so `… 69  09:41 น.` arrives
 * as `…6909:41น.` — and an unanchored year group reads `6909` as the year, which then fails the era
 * rule and reports no date about a card that plainly prints one.
 */
const MONTH_NAME_DATE = new RegExp(
  `(\\d{1,2})(${MONTH_ALTERNATION})(\\d{4}|\\d{2})(?:[-–—]?(\\d{1,2}):(\\d{2}))?(?:น\\.)?$`,
  "u"
);
/** The sign characters a minus is misread as. Also the only characters `repairToken` promotes. */
const MISREAD_MINUS = /^[=~—–]/u;

const digitsOf = (text: string): string => text.replace(/\D/gu, "");

export type TokenRepair = { readonly find: RegExp; readonly replace: string };

/**
 * The confusion classes measured on real cards, and **nothing that touches a digit**.
 *
 * A separator and a sign character are not digits, which is the distinction the whole design turns
 * on (D-113). Kept as a value rather than inlined into `repairToken` so it can be read as a list
 * and so the digit guard below can be exercised against a class that is *not* on it.
 */
export const CARD_TOKEN_REPAIRS: readonly TokenRepair[] = [
  /** A minus read as one of its lookalikes. Only leading, where a sign can be. */
  { find: MISREAD_MINUS, replace: "-" },
  /** A date separator, which comes back as one of these on essentially every measured card. */
  { find: /[|!]/gu, replace: "/" },
  /** Two of the above in a row, from a separator read as a doubled glyph. */
  { find: /\/{2,}/gu, replace: "/" },
  /** A thousands comma with a stray space after it. See `repairToken` for when this can fire. */
  { find: /,\s+/gu, replace: "," }
];

/**
 * Repairs only characters that carry **no value**, and proves it did no more than that.
 *
 * The measurement refused every date — `/` comes back as `|` or `!` essentially always — and three
 * amounts whose minus had been read as `=`. Both are non-numeric characters in known confusion
 * classes, and normalising them changes no digit. That is a different act from a lenient parser
 * reshaping a figure.
 *
 * **The guard is the point, not the substitutions.** If the digit sequence changed, the whole repair
 * is discarded and the original token stands. Three consequences worth stating, because they are
 * what the guard buys:
 *
 *   * a confusion class added carelessly in future cannot alter a number — `O`→`0` and `l`→`1` are
 *     the two anyone would reach for first, and both are exactly what this refuses;
 *   * the guard discards the **whole** repair rather than falling back to a partial one, because a
 *     partial repair is a guess about which half was safe; and
 *   * it costs a legitimate repair whenever a dangerous one travels in the same token, which is the
 *     fail-closed direction and leaves the field blank rather than filled with something plausible.
 *
 * `repairs` is a parameter so that last property can be **tested against a class that would alter a
 * digit**, which no member of `CARD_TOKEN_REPAIRS` does. Callers pass nothing.
 *
 * Restoring a sign is safe for a reason specific to this form: direction is read twice, from the
 * card's words and from the Direction control, and `readDirection` refuses when they disagree
 * (D-099, D-113). A repaired sign is therefore cross-checked rather than trusted — and an amount
 * whose sign did *not* survive this is refused outright by `readMoney` rather than assumed positive.
 *
 * The `,\s+` rule is the third case D-113 names, a thousands comma with a stray space. With this
 * module's tokeniser it fires only on a caller-supplied string that still holds spaces; a comma
 * detached into two separate OCR words is recovered by `moneyCandidates` joining them instead.
 */
export function repairToken(token: string, repairs: readonly TokenRepair[] = CARD_TOKEN_REPAIRS): string {
  const repaired = repairs.reduce((text, { find, replace }) => text.replace(find, replace), token);
  return digitsOf(repaired) === digitsOf(token) ? repaired : token;
}

/**
 * The words inside a located box, in reading order — the raw material a pre-fill sees.
 *
 * A word counts as inside when its **centre** is, so a glyph whose box overhangs the region by a
 * pixel is not dropped. The region a reader returns is built around whole words in the first place,
 * so this is tolerance rather than cropping.
 */
export function tokensIn(words: readonly OcrWord[], box: Box): string[] {
  return words
    .filter((word) => {
      const x = (word.left + word.right) / 2;
      const y = (word.top + word.bottom) / 2;
      return x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
    })
    .sort((a, b) => (a.top - b.top) || (a.left - b.left))
    .flatMap((word) => word.text.split(/\s+/u))
    .filter((token) => token.length > 0);
}

/**
 * Money candidates in the order they must be tried, walking the region left to right.
 *
 * A stray space inside a figure — one measured balance came back with its thousands comma detached —
 * is split into two words before anything sees it, so testing tokens alone can never recover it.
 * Hence the joins.
 *
 * **At each position the join is tried before the single, and that order is a correction to the
 * harness this was ported from rather than a copy of it.** The harness tried every single first, so
 * on `1,` + `234.00` the fragment `234.00` parsed and won — offering a figure a tenth of the one the
 * card printed, with nothing marking it as partial. That is a **wrong-but-plausible value**, the one
 * outcome D-112 measured as absent and the whole design exists to prevent, and the harness could not
 * have caught it: it never graded its own accepted values, which is the column D-112 and D-113 both
 * say they cannot fill in. Found by the test named for the detached comma.
 *
 * **Over-joining is what the money shape then guards against**, and it guards well because grouping
 * is required: `12` + `345` joins to `12345`, which `MONEY` refuses, as does any pair whose join is
 * not itself a properly grouped figure. So a join wins only where it reconstructs something that
 * reads as one printed figure.
 *
 * Position still decides between two *unrelated* figures sharing a region — the first is offered,
 * exactly as it was measured — because a join across them fails the shape and never displaces it.
 */
function moneyCandidates(tokens: readonly string[]): string[] {
  return tokens.flatMap((token, index) => {
    const next = tokens[index + 1];
    // Arrow rather than a bare reference: `map` would pass the index as a second argument, which
    // would land in `repairs` and replace the substitution list with a number.
    const single = repairToken(token);
    return next === undefined ? [single] : [repairToken(`${token}${next}`), single];
  });
}

/** Splits a leading sign off a candidate, since the magnitude and the sign are offered apart. */
function splitSign(token: string): { sign: PrefillAmount["sign"]; body: string } {
  const sign = /^[-+]/u.test(token) ? (token[0] as "-" | "+") : "";
  return { sign, body: sign === "" ? token : token.slice(1) };
}

/**
 * A money figure from a located region, or the reason there is none.
 *
 * `requireSign` is the one place amount and balance differ, and the asymmetry is real rather than
 * tidy: an amount is a movement and its direction is part of the reading, so a card that plainly
 * printed a sign this module could not recover is refused. A balance is a *position* — the layouts
 * print it unsigned and an unsigned reading is complete — so no such rule applies to it.
 */
function readMoney(tokens: readonly string[], requireSign: boolean): PrefillOffer<{ magnitude: string; sign: PrefillAmount["sign"] }> {
  for (const candidate of moneyCandidates(tokens)) {
    const { sign, body } = splitSign(candidate);
    if (!MONEY.test(body)) continue;
    try {
      parseThb(body);
    } catch {
      // The shape matched and the real grammar still refused — exactly the case a lenient parser
      // would paper over. Refused and named rather than retried against a looser rule.
      return refuse("GRAMMAR_REFUSED", "The figure here is not one the money grammar accepts, so nothing is offered.");
    }
    if (requireSign && sign === "") {
      // Reached only when the digit guard discarded a repair: `=1,234.00` would otherwise have
      // become `-1,234.00` above. So this is the case where a sign was plainly printed and could
      // not be recovered without touching a digit, which is a refusal rather than a positive.
      const strayed = tokens.some((each) => MISREAD_MINUS.test(each) && MONEY.test(each.slice(1)));
      if (strayed) {
        return refuse("SIGN_UNREADABLE", "The sign printed beside this figure could not be read, so the figure is not offered.");
      }
    }
    return { ok: true, value: { magnitude: body, sign } };
  }
  const anyDigits = tokens.some((token) => /\d/u.test(token));
  return anyDigits
    ? refuse("NO_MONEY_TOKEN", "Nothing here has the shape of a printed figure.")
    : refuse("NO_DIGITS", "No digits were read here at all.");
}

/**
 * The words inside a located box as whole normalised lines, which is what a month-name date needs.
 *
 * A token is the wrong unit for that form: the layout separates a date's parts with spaces,
 * `normalise` removes them, and the parts then belong to one run rather than to any single OCR
 * word. Grouped with the same `groupIntoLines` every other reader here uses, so "same line" means
 * the same thing throughout — it compares vertical *overlap* rather than a shared edge, because
 * Thai tone marks make two words on one line disagree about both.
 */
export function linesIn(words: readonly OcrWord[], box: Box): string[] {
  const inside = words.filter((word) => {
    const x = (word.left + word.right) / 2;
    const y = (word.top + word.bottom) / 2;
    return x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
  });
  return groupIntoLines(inside).map((line) => normalise(line.map((word) => word.text).join("")));
}

/** What either printed form yields, before the era rule and the calendar have had their say. */
type PrintedParts = {
  readonly day: number;
  readonly month: number;
  readonly printedYear: number;
  /** `HH:MM`, or null when a date was found and no time was. */
  readonly time: string | null;
};

/** The slashed form, read token by token, as SCB Connect and Krungthai Connext print it. */
function slashedParts(repaired: readonly string[]): PrintedParts | null {
  const date = repaired.map((token) => PRINTED_DATE.exec(token)).find((match) => match !== null);
  if (!date) return null;
  const time = repaired.find((token) => PRINTED_TIME.test(token)) ?? null;
  return { day: Number(date[1]), month: Number(date[2]), printedYear: Number(date[3]), time };
}

/**
 * The month-name form, read a whole line at a time, as KBank Live prints it.
 *
 * A line rather than a token because `normalise` removes the spaces this layout separates its parts
 * with, so the day, month, year and time arrive as one run and no single OCR word holds a date.
 */
function monthNameParts(lines: readonly string[]): PrintedParts | null {
  for (const line of lines) {
    const match = MONTH_NAME_DATE.exec(line);
    if (!match) continue;
    const month = THAI_MONTH_TOKENS.find(([token]) => token === match[2])?.[1];
    // Unreachable while the alternation is built from the same table; guarded rather than asserted,
    // because a token added to one and not the other would otherwise read as an undefined month.
    if (month === undefined) continue;
    const hour = match[4];
    const minute = match[5];
    const time = hour !== undefined && minute !== undefined ? `${hour.padStart(2, "0")}:${minute}` : null;
    return {
      day: Number(match[1]),
      month,
      printedYear: Number(match[3]),
      time: time !== null && PRINTED_TIME.test(time) ? time : null
    };
  }
  return null;
}

/**
 * The card's own timestamp as the form's two inputs hold it, or the reason there is none.
 *
 * **Both printed forms are tried on every layout, and that is not the global assumption D-031
 * warns about.** The two grammars are disjoint — a slashed date carries no Thai month token and a
 * month-name date carries no slash — so neither can be misread as the other, and trying both costs
 * only an attempt. What stays strictly per layout is the part where the danger actually lives: the
 * **era**. `resolveCardYear` decides it from the layout alone, so a two-digit year is completed one
 * way on the two Buddhist layouts and refused outright on the Gregorian one. Reading an era by
 * analogy is what dated a whole statement 43 years early (D-031), and nothing here does that.
 *
 * A printed year of the wrong width for the layout is a refusal, not a reinterpretation.
 *
 * **Date and time refuse together.** A card whose date read and whose time did not offers neither,
 * because the pairing rule uses the instant rather than the day (D-102) and half a timestamp
 * pre-filled beside an empty box is the shape most likely to be submitted unnoticed.
 */
function readTimestamp(
  tokens: readonly string[],
  lines: readonly string[],
  layout: NotificationCardLayout,
  currentYear: number
): PrefillOffer<PrefillTimestamp> {
  const parts = slashedParts(tokens.map((token) => repairToken(token)))
    ?? monthNameParts(lines.map((line) => repairToken(line)));

  if (!parts) {
    const anyDigits = tokens.some((token) => /\d/u.test(token));
    if (!anyDigits) return refuse("NO_DIGITS", "No digits were read here at all.");
    return refuse("DATE_NOT_READ", "No date could be read here, so the date and time are left for you to type.");
  }
  if (parts.time === null) return refuse("TIME_NOT_READ", "A date was read here and a time was not, so neither is offered.");

  let year: number;
  try {
    year = resolveCardYear(layout, parts.printedYear, currentYear);
  } catch {
    return refuse("YEAR_NOT_RESOLVED", `The year read here is not the form a ${layout.channel} card prints, so the date is not offered.`);
  }

  const iso = `${String(year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
  if (!isoDateSchema.safeParse(iso).success) {
    return refuse("NOT_A_CALENDAR_DATE", "The date read here is not a real calendar date, so it is not offered.");
  }
  return { ok: true, value: { date: iso, time: parts.time } };
}

/**
 * The four printed account digits, taken from wherever the mask put them.
 *
 * The mask itself is what OCR garbles — measured on every card, while the four digits stayed
 * correct — so the digits are collected from the whole region rather than matched against a mask
 * shape. Exactly four or nothing: `assertPrintedDigits` accepts nothing else, and the two measured
 * failures were five digits, from a mask character read as one.
 */
function readAccountDigits(tokens: readonly string[]): PrefillOffer<string> {
  const digits = digitsOf(tokens.join(""));
  if (digits.length === 4) return { ok: true, value: digits };
  return digits.length === 0
    ? refuse("NO_DIGITS", "No digits were read here at all.")
    : refuse("WRONG_DIGIT_COUNT", `${digits.length} digits were read here rather than the four a card prints, so none are offered.`);
}

const NOT_LOCATED = "The card's own words for this field could not be found, so there is nothing to offer.";

/**
 * What a card offers each of the four digit-bearing fields, given boxes the reader already located.
 *
 * Takes the located boxes rather than locating them, so a form that has already run
 * `locateCardFields` for its crops does not read the same image twice — and so a test can drive
 * this with a box it wrote by hand.
 *
 * `currentYear` is a parameter rather than a call to `new Date()` because the era rule depends on
 * it, and a rule that reads differently on New Year's Eve than on the day a test was written is a
 * rule nobody can pin down.
 */
export function prefillCardFields(
  words: readonly OcrWord[],
  located: Readonly<Partial<Record<CardFieldName, CardOcrRead<Box>>>>,
  layout: NotificationCardLayout,
  currentYear: number
): CardPrefill {
  const tokensFor = (field: PrefillField): readonly string[] | null => {
    const read = located[field];
    if (!read || !read.ok) return null;
    return tokensIn(words, read.value);
  };

  /** A field the reader would not locate refuses here rather than being read out of nothing. */
  const read = <T>(field: PrefillField, from: (tokens: readonly string[]) => PrefillOffer<T>): PrefillOffer<T> => {
    const tokens = tokensFor(field);
    return tokens === null ? refuse("NOT_LOCATED", NOT_LOCATED) : from(tokens);
  };

  /** The balance is offered as one string, sign and all, because the form's box parses it whole. */
  const readBalance = (tokens: readonly string[]): PrefillOffer<string> => {
    const money = readMoney(tokens, false);
    return money.ok ? { ok: true, value: `${money.value.sign}${money.value.magnitude}` } : money;
  };

  return {
    amount: read("amount", (tokens) => readMoney(tokens, true)),
    balance: read("balance", readBalance),
    occurredAt: read("occurredAt", (tokens) => {
      const box = located.occurredAt;
      return readTimestamp(tokens, box?.ok ? linesIn(words, box.value) : [], layout, currentYear);
    }),
    ownAccount: read("ownAccount", readAccountDigits)
  };
}

/**
 * Which fields a pre-fill actually offered, as field names and nothing else.
 *
 * This is the vocabulary migration 019 records (D-114, `PLAN.md` task 34 part 3): **structure, never
 * values**. No amount, balance, date or digit may travel with it, and keeping the list derived from
 * one place is what stops a second hand-kept copy disagreeing about what "offered" means.
 */
export function offeredFields(prefill: CardPrefill): PrefillField[] {
  return PREFILL_FIELDS.filter((field) => prefill[field].ok);
}
