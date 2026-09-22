import { parseThb, type MinorUnitString } from "@/lib/money";

/**
 * Reading 7-Eleven receipt text (PLAN task 56, `docs/RECEIPT_CONTRACT.md`).
 *
 * **Pure functions only.** Extraction — pdf.js for the PDF forms, Vision OCR for the
 * screenshot — happens elsewhere and hands this file already-extracted text, exactly as
 * `lib/slip-ocr.ts` is kept apart from the engine that supplies its words (D-053). That keeps
 * every rule below testable without a PDF or a network call.
 *
 * `lib/receipt-pdf.ts` turns pdf.js items into this text; `lib/receipts.ts` and
 * `app/api/v1/receipts/route.ts` store the parse.
 *
 * **The three input forms are complementary, not ranked** (corrections #14–16, measured
 * 2026-09-22). It is tempting to treat the full tax invoice as simply "the best" source and the
 * condensed PDF and screenshot as fallbacks it supersedes, because it alone carries untruncated
 * item names and a VAT breakdown. It does not carry a payment method, a printed time, a unit
 * count, or `TID#`/`R#` at all — and the payment method is exactly the field
 * `docs/RECEIPT_CONTRACT.md` § Matching to the ledger keys its automatic match on. So "upgrading"
 * a receipt to a full invoice must never discard a field an earlier source supplied; `null` on
 * one form's fields here is that form's own limit, not a placeholder waiting to be filled in by
 * a later, supposedly-better one. `ParsedReceipt`'s optional fields are shaped around this on
 * purpose, one per form rather than one shared "best available" value.
 */

// ---------------------------------------------------------------------------------------------
// Thai encoding repair
// ---------------------------------------------------------------------------------------------

/**
 * Repairs a font-encoding defect in this issuer's PDF text extraction. **This is not a Thai
 * text normalizer** — it corrects two specific, deterministic glyph-mapping mistakes in
 * 7-Eleven's own embedded font, measured 2026-09-22 against both the full tax invoice and the
 * condensed form with pdf.js, and independently confirmed with PyMuPDF (identical results).
 * Its correctness is a property of *this issuer's* fonts and is not expected to generalise to
 * any other document.
 *
 * Two rules, applied in this order because the second's input is the first's output:
 *
 * 1. `U+0006` (a control character with no legitimate meaning in this text) is this font's
 *    mapping for sara aa (`า`, U+0E32). Measured at 163 occurrences in the full invoice and
 *    zero elsewhere in the document — no other control character appears at all.
 * 2. Sara am (`ำ`, U+0E33) is encoded decomposed in the same font, so rule 1 alone leaves a
 *    spurious trailing `า` after every `ำ`. Recomposing `ำา` back to `ำ` removes exactly that
 *    artifact.
 *
 * Deliberately does nothing else. A probe for "a space directly after a Thai combining mark"
 * found 9 occurrences in the measured documents, and all 9 were legitimate word boundaries —
 * so no space-repair heuristic is applied here, because it would corrupt every one of them.
 * No dictionary, no per-word guessing: only these two fixed replacements.
 */
export function repairThai(text: string): string {
  // `\x06` rather than a literal control character in the source, so an editor or a diff tool
  // cannot silently mangle it.
  const saraAaRepaired = text.replace(/\x06/g, "า");
  return saraAaRepaired.replace(/ำา/g, "ำ");
}

// ---------------------------------------------------------------------------------------------
// Result shape
// ---------------------------------------------------------------------------------------------

/**
 * Follows `lib/slip-ocr.ts`'s `OcrRead<T>` convention: a tagged union rather than a thrown
 * error, so a malformed receipt is a value the caller inspects instead of a try/catch the
 * caller must remember. `lineNo` is included when the refusal is traceable to one printed row.
 */
export type ReceiptRefusal =
  | "MALFORMED_LINE"
  | "MISSING_FIELD"
  | "DATE_MISMATCH"
  | "QUANTITY_MISMATCH"
  /**
   * Full invoice only: `ส่วนลดที่ได้ทั้งหมด` prints the sum of the discount block above it, and
   * that sum must agree with what this reader itself added up (correction #13) — the same
   * "a printed cross-check disagreeing is refused, not reconciled" spirit as `QUANTITY_MISMATCH`.
   */
  | "DISCOUNT_TOTAL_MISMATCH";

export type ReceiptRead<T> =
  | { ok: true; value: T }
  | { ok: false; code: ReceiptRefusal; message: string; lineNo?: number };

export type ReceiptItem = {
  lineNo: number;
  quantity: number;
  name: string;
  /** Null when no `@unit` price is printed on the line — see `docs/RECEIPT_CONTRACT.md`. */
  unitPriceMinor: MinorUnitString | null;
  amountMinor: MinorUnitString;
  vatExempt: boolean;
  /** `M-Stamp(บาท)`, `AMBสิทธิ์แลกซื้อ`, `ภารกิจช้อป…` — a quantity and a zero amount, not merchandise. */
  isPromotion: boolean;
};

export type VatBreakdown = {
  preVatMinor: MinorUnitString;
  vatMinor: MinorUnitString;
  totalInclVatMinor: MinorUnitString;
};

/**
 * Which of the independent checksums this receipt satisfies. All *applicable* ones are required
 * for `"complete"`; any applicable one failing is `"partial"` — the header, net, payment method
 * and timestamp stay trustworthy regardless, and only the item list (or the VAT breakdown, for
 * `VAT_IDENTITY_CHECK`) is marked incomplete (`docs/RECEIPT_CONTRACT.md` § The screenshot
 * truncates silently).
 *
 * **Not every check applies to every document** (correction #14): the full invoice prints no
 * unit count at all, so `UNIT_COUNT_CHECK` never runs on it — a full invoice is verified by one
 * fewer checksum than a condensed one, as a property of what the document prints, not a gap in
 * this reader. `ParsedReceipt.inapplicableChecks` says which checks did not run, so `"complete"`
 * is never misread as "every check that exists passed" when some could not be attempted.
 */
export type CompletenessCheck = "NET_CHECK" | "UNIT_COUNT_CHECK" | "VAT_IDENTITY_CHECK";

export type ParsedReceipt = {
  receiptNumber: string;
  storeCode: string;
  branchName: string;
  /**
   * `YYYY-MM-DD`, Asia/Bangkok. Condensed form: from `TID#`, cross-checked against `R#`. Full
   * form: from the labelled `วันที่` line — its only printed date (correction #16: `TID#` is
   * condensed-only too). Always present; a receipt's day is never in doubt on either form.
   */
  purchasedAt: string;
  /**
   * `HH:MM`, Asia/Bangkok, from the condensed form's `R#` line. **`null` on the full form**,
   * which prints no time at all (correction #16) — not an invented `00:00`, an absent field.
   */
  purchasedAtTime: string | null;
  /**
   * The printed method text, verbatim — no vocabulary of known payment methods is enforced
   * here. **Condensed form only.** Measured (correction #15): payment-method tokens occur zero
   * times in the full tax invoice and once in the condensed form; the full invoice's tail runs
   * straight from `มูลค่าสินค้ารวมภาษีมูลค่าเพิ่ม` into the repeated page-2 header, with no
   * payment line between them at all. `null` on a full-form parse — not a gap this reader
   * failed to fill, a field that document does not carry.
   *
   * **This has a design consequence beyond parsing**: the full invoice carries the best item
   * names of the three forms, but it cannot answer how the purchase was paid — exactly the
   * field `docs/RECEIPT_CONTRACT.md` § Matching to the ledger keys its automatic match on. The
   * three forms are therefore complementary rather than ranked by quality; a full invoice alone can
   * never drive ledger matching and needs the condensed form or the screenshot beside it for
   * that purpose, even though it is otherwise the richest of the three.
   */
  paymentMethod: string | null;
  items: ReceiptItem[];
  /**
   * Printed as positive figures to be subtracted, per the contract. Condensed form: the lines
   * under `ยอดรวม`. Full form: the `หักส่วนลด` … `ส่วนลดที่ได้ทั้งหมด` block, and that block's own
   * total is cross-checked against this sum rather than folded into it — see
   * `DISCOUNT_TOTAL_MISMATCH`.
   */
  discounts: MinorUnitString[];
  /**
   * Condensed form: absent when there are no discounts (`ยอดรวม` prints only when discounts
   * follow). Full form: `มูลค่าสินค้ารวม`, which is always printed.
   */
  subtotalMinor: MinorUnitString | null;
  /** Condensed form: `ยอดสุทธิ`. Full form: `มูลค่าสินค้ารวมภาษีมูลค่าเพิ่ม` (correction #14). */
  netMinor: MinorUnitString;
  /**
   * The condensed form's printed `ชิ้น` count. **The full invoice prints no unit count at all**
   * (correction #14, measured: `ยอดรวม`, `ยอดสุทธิ` and `ชิ้น` occur zero times in it) — `null`
   * there, not invented.
   */
  unitCount: number | null;
  /** Only the full invoice prints a VAT breakdown. */
  vat: VatBreakdown | null;
  /** The VAT registration code printed beside the full invoice's store/branch line. Full only. */
  vatCode: string | null;
  /**
   * The condensed receipt number this full invoice names as the one it cancels and replaces
   * (`docs/RECEIPT_CONTRACT.md` § Identity and deduplication). Read from the document rather
   * than inferred from amount and time, which is the whole point of the field. Full form only;
   * `null` on a condensed or screenshot parse.
   */
  supersedesReceiptNumber: string | null;
  completeness: "complete" | "partial";
  failedChecks: CompletenessCheck[];
  /** Checks this document's form makes impossible to run — see `CompletenessCheck`'s doc comment. */
  inapplicableChecks: CompletenessCheck[];
};

// ---------------------------------------------------------------------------------------------
// Line grammar
//
// Corrected 2026-09-22 against a real measurement the coordinator took after the first pass:
// label wordings and field order are format knowledge and safe to encode
// (`docs/RECEIPT_CONTRACT.md`); item names, amounts, quantities, dates and identifiers stay
// invented in every fixture (`docs/FIXTURE_POLICY.md`).
//
// **One shape is deliberately shared.** A merchandise line with no `@unit` price, a discount
// line, and a promotional line all print as `<qty> <name> <amount>[N]` — they are distinguished
// only by the printed name, never by structure. `QTY_NAME_AMOUNT_LINE` matches all three, and
// `classifyQtyNameAmountLine` decides which one a given name is. This one shape must be tried
// before nothing else can claim a discount or a promotion line first, which is why its handling
// sits ahead of nothing narrower being available to steal it.
// ---------------------------------------------------------------------------------------------

// Mirrors `lib/slip-ocr.ts`'s `PRINTED_MONEY`: grouped thousands, an optional two-place
// fraction, anchored at both ends. `parseThb` already tolerates a comma (`lib/money.ts` strips
// `[฿,\s]`), so this only has to *recognise* the printed shape — the stripping happens once,
// inside `toMinor`, rather than being duplicated here.
const MONEY = "(?:0|[1-9]\\d{0,2}(?:,\\d{3})*|[1-9]\\d*)(?:\\.\\d{2})?";

// The condensed PDF's first line, and **only** the condensed PDF's — measured to occur zero
// times in the full invoice, which uses `FULL_STORE_LINE` instead (correction #8). Store and
// branch come from here on the condensed form.
const CP_ALL_LINE = /^CP ALL,7-Eleven\s+(.+?)\((\d+)\)$/;

// Full invoice only: the one labelled receipt-number line either PDF carries. **Not anchored at
// the start**: measured 2026-09-23 through pdf.js, the label is right-aligned on the same row as
// the document title, so the line reads `<title> เลขที่ <number>`. The number is one letter then
// digits, and requiring the letter is what keeps an address line ending ` เลขที่ <n>` from matching.
const FULL_RECEIPT_NUMBER_LINE = /(?:^|\s)เลขที่\s+([A-Z]\d+)$/;

// Full invoice only: `วันที่ <dd/mm/yyyy>`, and the year is **four-digit Buddhist** here —
// unlike the screenshot's two-digit year, so no century-guessing is needed, only a direct
// Buddhist-to-Gregorian subtraction before the cross-check against `TID#`.
//
// **Not anchored at the start** (measured 2026-09-23 through pdf.js): the invoice's own date is
// right-aligned on the same row as `FULL_SUPERSEDES_LINE`, so that one printed line carries both.
// On the measured row **both** dates print as a plain `วันที่ <date>` — the cancelled receipt's
// inside the clause, then the invoice's own, right-aligned — so the **end anchor** is the only
// thing choosing the invoice's date. Keep it. Both regexes run on the line — see the call site.
const FULL_DATE_LINE = /(?:^|\s)วันที่\s+(\d{2})\/(\d{2})\/(\d{4})$/;

// Full invoice only: `<Thai prose> : <store code> <Thai> 7-Eleven <branch name> Vat Code (<vat code>)`.
//
// **Anchored on structural tokens, not on transcribed Thai** (correction #10). Every wording
// round so far on this line and the one below it was a guess at prose the coordinator then had
// to re-measure — `7-Eleven` and `Vat Code (…)` are the parts a re-issued template will not
// change, so those are what this matches on; the Thai around them (a confirmed label wording
// elsewhere in this file, but here a longer descriptive sentence never independently measured)
// is treated as opaque filler consumed by `.*?`. Unanchored (no `^`/`$`) for the same reason:
// the line does not start at the colon. Measured to repeat once per page on a multi-page
// invoice; re-matching on a later page simply overwrites the same values, which is harmless
// (correction #8's carve-out — a repeat of this line, `FULL_RECEIPT_NUMBER_LINE` or
// `FULL_DATE_LINE` is never itself a refusal here).
const FULL_STORE_LINE = /:\s*(\d+)\s*.*?7-Eleven\s+(.+?)\s+Vat Code\s*\((\d+)\)/;

// Full invoice only: names the condensed receipt this invoice cancels and replaces
// (correction #9) — `docs/RECEIPT_CONTRACT.md` § Identity and deduplication's dedupe link, read
// from the document rather than inferred from amount and time.
//
// **Also anchored on structural tokens** (correction #10): a spaced colon, a digit run, the
// literal `POS`, and a second digit run. Unanchored at both ends, because the real line carries
// Thai prose before the colon and **two** dates after the `POS` number — anchoring to
// end-of-line, as the first version of this regex did, breaks on the second date. Nothing here
// depends on either date, so neither is captured.
const FULL_SUPERSEDES_LINE = /:\s*(\d+)\s+POS\s+(\d+)/;

// `R#<receipt number>P<till> :<sequence> <dd>/<mm>/<yy> <HH>:<MM>`. The **first** digit run is
// the receipt number (correction #7) — confirmed against the in-app screen for the same
// purchase and against the number the full invoice names as the one it cancels; the
// after-colon sequence matches neither. Printed unpadded on the screenshot and zero-padded
// here, so a caller comparing across sources must normalise leading zeros; this reader takes
// the digits as printed. The trailing date/time is two-digit Buddhist era, exactly the
// representation `TID#` is cross-checked against for the condensed form.
const R_LINE = /^R#(\d+)P(\d+)\s*:(\d+)\s+(\d{2})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2})$/;

const TID_LINE = /^TID#(\d{4})(\d{2})(\d{2})/;

// The VAT-exempt `N` is printed **hard against the figure with no space**, and it is the same in
// both forms — measured 2026-09-22 against a real document of each. An earlier draft required
// `\s+N` here while the condensed patterns required a bare `N`, on an assumption that the two
// forms differed. They do not, and the asymmetry was not harmless: a full-invoice promotional
// line ends `0.00N`, so the optional group failed, the `$` anchor failed with it, and the whole
// line matched nothing and was skipped as unrecognised — silently dropping every promotional row
// from the full form and corrupting the unit-count checksum that depends on them.
const ITEM_FULL_LINE = new RegExp(`^(\\d+)\\s+(\\d+)\\s+(.+?)\\s+(${MONEY})\\s+(${MONEY})(N)?$`);
const ITEM_CONDENSED_WITH_UNIT_LINE = new RegExp(`^(\\d+)\\s+(.+?)\\s+@(${MONEY})\\s+(${MONEY})(N)?$`);

// The shared shape: a bare-quantity item, a discount, or a promotion. See the section comment.
const QTY_NAME_AMOUNT_LINE = new RegExp(`^(\\d+)\\s+(.+?)\\s+(${MONEY})(N)?$`);

// Condensed form only in practice: `ยอดรวม` is measured to occur zero times in the full invoice
// (correction #14), so this simply never matches full-form text — no form guard is needed for
// that reason, but the full form has its own, differently-labelled subtotal; see
// `FULL_SUBTOTAL_LINE` below.
const SUBTOTAL_LINE = new RegExp(`^ยอดรวม\\s+(${MONEY})$`);
// Condensed form only: count precedes the amount here — `ยอดสุทธิ <count> ชิ้น <amount>` — the
// other order from the subtotal and item lines. **Measured to occur zero times in the full
// invoice** (correction #14) along with `ชิ้น` itself — the full form prints no unit count at
// all, so this line, and the concept it carries, simply does not exist there.
const NET_LINE = new RegExp(`^ยอดสุทธิ\\s+(\\d+)\\s*ชิ้น\\s+(${MONEY})$`);

// **Condensed form only** (correction #15, measured: payment-method tokens occur zero times in
// the full invoice and once in the condensed form — this reader's earlier assumption that the
// full form had one too, flagged rather than guessed at, turned out to be wrong). No label
// precedes it there either, so it is still identified positionally: the first unclaimed
// `<text> <amount>` line immediately after the net line, followed by one more bare `<amount>`
// line (a tendered/change figure this reader has no field for and simply consumes). See the
// `form === "condensed"` guard at both call sites below.
const PAYMENT_LINE = new RegExp(`^(.+?)\\s+(${MONEY})$`);
const BARE_MONEY_LINE = new RegExp(`^(${MONEY})$`);

const VAT_PRE_LINE = new RegExp(`^มูลค่าสินค้าก่อนภาษีมูลค่าเพิ่ม\\s+(${MONEY})$`);
const VAT_TAX_LINE = new RegExp(`^ภาษีมูลค่าเพิ่ม\\s+(${MONEY})$`);
// The full form's **net** (correction #14) — the last line of its tail, and the point at which
// the payment line (see `PAYMENT_LINE`'s comment) is expected to follow. Anchored so it cannot
// be confused with `FULL_SUBTOTAL_LINE`'s shorter label, which is a strict text prefix of this
// one: `^มูลค่าสินค้ารวม\s+` requires whitespace immediately after that prefix, and this label's
// text continues with `ภาษีมูลค่าเพิ่ม` there instead, so the two never both match one line.
const VAT_TOTAL_LINE = new RegExp(`^มูลค่าสินค้ารวมภาษีมูลค่าเพิ่ม\\s+(${MONEY})$`);

// The full form's tail (correction #14), measured in this order:
// `มูลค่าสินค้ารวม <subtotal>` / `หักส่วนลด` / `<discount name> <amount>` (one or more) /
// `ส่วนลดที่ได้ทั้งหมด <total>` / `สินค้าไม่เสียภาษีมูลค่าเพิ่ม <amount>` / the three VAT lines above.
// The exempt-goods line (`สินค้าไม่เสียภาษีมูลค่าเพิ่ม`) is deliberately not matched anywhere —
// `ParsedReceipt` has no field for it, and nothing else in the grammar can mistake it for
// something it is not, so it falls through to the generic "unrecognised line" skip.
const FULL_SUBTOTAL_LINE = new RegExp(`^มูลค่าสินค้ารวม\\s+(${MONEY})$`);

// A bare heading line with no amount — opens the discount block. Matched explicitly (rather
// than left to the generic "unrecognised, skip" fallthrough) so the block's start is a state
// transition this file names, not an implicit side effect of nothing else claiming the line.
const FULL_DISCOUNT_HEADING_LINE = /^หักส่วนลด$/;

// Ends the discount block and gives its own total — a free third checksum (correction #13),
// checked against this reader's own sum of the block's discount lines after the loop
// (`DISCOUNT_TOTAL_MISMATCH`). Matches the `ส่วนลด` prefix `classifyQtyNameAmountLine` also
// tests for, so it must be recognised as this specific line — not as another discount — or the
// fix for correction #12 would double-count it into `discounts` on top of being compared
// against it.
const FULL_DISCOUNT_TOTAL_LINE = new RegExp(`^ส่วนลดที่ได้ทั้งหมด\\s+(${MONEY})$`);

// Full-form discount lines carry **no leading quantity** — `<name> <amount>`, not
// `<qty> <name> <amount>` (correction #12) — so `QTY_NAME_AMOUNT_LINE` never matches them and a
// dedicated shape is needed. Deliberately generic (`.+?` for the name); safe only because it is
// gated on `inFullDiscountBlock` at the call site, so it can only claim a line the discount
// heading has already opened and the total line has not yet closed.
const FULL_DISCOUNT_LINE = new RegExp(`^(.+?)\\s+(${MONEY})$`);

type QtyLineClass = "discount" | "promotion" | "item";

/**
 * Distinguishes a discount, a promotion, and a bare-quantity item — all three print in
 * `QTY_NAME_AMOUNT_LINE`'s identical shape, and the name is the only thing that tells them
 * apart (the coordinator's correction #5). Checked in this order because a discount's and a
 * promotion's names are closed, specific vocabularies; anything else is merchandise by default.
 */
function classifyQtyNameAmountLine(name: string): QtyLineClass {
  if (/^(ส่วนลด|ฟรี)/.test(name)) return "discount";
  if (name === "M-Stamp(บาท)" || name === "AMBสิทธิ์แลกซื้อ" || /^ภารกิจช้อป/.test(name)) return "promotion";
  return "item";
}

function toMinor(printed: string): MinorUnitString | null {
  try {
    return parseThb(printed).minor;
  } catch {
    return null;
  }
}

/** `parseReceiptText`'s single point of failure for a money-shaped field that will not parse. */
function malformed(lineNo: number, message: string): { ok: false; code: "MALFORMED_LINE"; message: string; lineNo: number } {
  return { ok: false, code: "MALFORMED_LINE", message, lineNo };
}

/**
 * Parses already-extracted, already-`repairThai`'d receipt text into its fields. Never throws:
 * every failure is a `ReceiptRead` refusal (`code`, `message`, and a `lineNo` when the failure
 * traces to one printed row).
 *
 * Both forms put one logical row on one printed line (`docs/RECEIPT_CONTRACT.md`'s note on
 * pdf.js reading order), so this is a line-by-line scan rather than a layout parser. Lines that
 * match none of the known shapes — the taxpayer identity block, member points, the savings
 * line, blank padding — are skipped rather than refused, since this reader only needs the
 * fields it names, not an exhaustive model of the page.
 */
export function parseReceiptText(text: string, form: "condensed" | "full"): ReceiptRead<ParsedReceipt> {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0);

  let storeCode: string | null = null;
  let branchName: string | null = null;
  let receiptNumber: string | null = null;
  let paymentMethod: string | null = null;

  let tidGregorianYear: number | null = null;
  let tidMonth: number | null = null;
  let tidDay: number | null = null;
  let time: string | null = null;

  // Condensed form's date cross-check source: `R#`'s trailing two-digit-Buddhist-era date.
  let rDay: number | null = null;
  let rMonth: number | null = null;
  let rBuddhistYear2: number | null = null;

  // Full form's date cross-check source: the labelled `วันที่` line, four-digit Buddhist era.
  let fullDay: number | null = null;
  let fullMonth: number | null = null;
  let fullBuddhistYear4: number | null = null;

  let subtotalMinor: MinorUnitString | null = null;
  let netMinor: MinorUnitString | null = null;
  let unitCount: number | null = null;
  let vatPre: MinorUnitString | null = null;
  let vatTax: MinorUnitString | null = null;
  let vatTotal: MinorUnitString | null = null;
  let vatCode: string | null = null;
  let supersedesReceiptNumber: string | null = null;
  // Full form only: `ส่วนลดที่ได้ทั้งหมด`'s own printed total, cross-checked after the loop
  // against this reader's sum of the discount block's lines (correction #13).
  let fullDiscountTotalMinor: MinorUnitString | null = null;
  const items: ReceiptItem[] = [];
  const discounts: MinorUnitString[] = [];

  // Set the line immediately after the net line is read (`ยอดสุทธิ` on the condensed form,
  // `มูลค่าสินค้ารวมภาษีมูลค่าเพิ่ม` on the full form), since the payment line has no label of its
  // own to anchor on (correction #4).
  let awaitingPaymentLine = false;
  let awaitingTenderedLine = false;
  // Full form only: true between `หักส่วนลด` and `ส่วนลดที่ได้ทั้งหมด` — the only window in which
  // `FULL_DISCOUNT_LINE`'s deliberately generic `<name> <amount>` shape is allowed to claim a
  // line (correction #12).
  let inFullDiscountBlock = false;

  for (let index = 0; index < lines.length; index++) {
    const lineNo = index + 1;
    const line = lines[index]!;

    let match: RegExpExecArray | null;

    if (form === "condensed" && (match = CP_ALL_LINE.exec(line))) {
      branchName = match[1]!.trim();
      storeCode = match[2]!;
      continue;
    }
    if (form === "full" && (match = FULL_RECEIPT_NUMBER_LINE.exec(line))) {
      // Repeats once per page on a multi-page invoice; re-assigning an identical value is
      // harmless (correction #8).
      receiptNumber = match[1]!;
      continue;
    }
    if (form === "full" && (match = FULL_DATE_LINE.exec(line))) {
      fullDay = Number(match[1]);
      fullMonth = Number(match[2]);
      fullBuddhistYear4 = Number(match[3]);
      // The same printed row can carry the supersedes clause — see `FULL_DATE_LINE`.
      const supersedes = FULL_SUPERSEDES_LINE.exec(line);
      if (supersedes) supersedesReceiptNumber = supersedes[1]!;
      continue;
    }
    if (form === "full" && (match = FULL_STORE_LINE.exec(line))) {
      storeCode = match[1]!;
      branchName = match[2]!.trim();
      vatCode = match[3]!;
      continue;
    }
    if (form === "full" && (match = FULL_SUPERSEDES_LINE.exec(line))) {
      supersedesReceiptNumber = match[1]!;
      continue;
    }
    if ((match = R_LINE.exec(line))) {
      if (form === "condensed") receiptNumber = match[1]!;
      rDay = Number(match[4]);
      rMonth = Number(match[5]);
      rBuddhistYear2 = Number(match[6]);
      time = `${match[7]}:${match[8]}`;
      continue;
    }
    if ((match = TID_LINE.exec(line))) {
      tidGregorianYear = Number(match[1]);
      tidMonth = Number(match[2]);
      tidDay = Number(match[3]);
      continue;
    }
    if (form === "full" && (match = ITEM_FULL_LINE.exec(line))) {
      const quantity = Number(match[2]);
      const name = match[3]!.trim();
      const unitPriceMinor = toMinor(match[4]!);
      const amountMinor = toMinor(match[5]!);
      if (unitPriceMinor === null || amountMinor === null) {
        return malformed(lineNo, "An item line's price or amount does not read as a plain figure.");
      }
      // Classify by name before anything else (correction #11): this shape is the item table's
      // own row shape, and a promotional or discount-named row can appear in it exactly as it
      // can in `QTY_NAME_AMOUNT_LINE`'s shape on the condensed form. Hardcoding `isPromotion:
      // false` here — the very first version of this branch — silently counted every full-form
      // promotional row as merchandise, corrupting the unit-count-shaped checksum it feeds even
      // before that checksum was found not to exist on this form at all.
      const kind = classifyQtyNameAmountLine(name);
      if (kind === "discount") {
        // A discount printed in the item table's own columns is not a per-unit product, so the
        // quantity cross-check below — which assumes `unitPrice × quantity = amount` — does not
        // apply to it and is skipped for this row.
        discounts.push(amountMinor);
        continue;
      }
      // Quantity cross-check: unit price times the parsed quantity must equal the amount. The
      // full invoice's columns interleave under `-layout` extraction, so this line's own qty
      // is exactly the value most at risk from misattribution — a disagreement here is not
      // reconciled, it is refused (`docs/RECEIPT_CONTRACT.md` § The full invoice).
      if (BigInt(unitPriceMinor) * BigInt(quantity) !== BigInt(amountMinor)) {
        return { ok: false, code: "QUANTITY_MISMATCH", message: "Unit price times quantity does not equal the printed amount.", lineNo };
      }
      items.push({ lineNo, quantity, name, unitPriceMinor, amountMinor, vatExempt: Boolean(match[6]), isPromotion: kind === "promotion" });
      continue;
    }
    if (form === "condensed" && (match = ITEM_CONDENSED_WITH_UNIT_LINE.exec(line))) {
      const quantity = Number(match[1]);
      const unitPriceMinor = toMinor(match[3]!);
      const amountMinor = toMinor(match[4]!);
      if (unitPriceMinor === null || amountMinor === null) {
        return malformed(lineNo, "An item line's price or amount does not read as a plain figure.");
      }
      if (BigInt(unitPriceMinor) * BigInt(quantity) !== BigInt(amountMinor)) {
        return { ok: false, code: "QUANTITY_MISMATCH", message: "Unit price times quantity does not equal the printed amount.", lineNo };
      }
      items.push({ lineNo, quantity, name: match[2]!.trim(), unitPriceMinor, amountMinor, vatExempt: Boolean(match[5]), isPromotion: false });
      continue;
    }
    // **Condensed form only.** This shape is deliberately generic — a leading integer, any text,
    // a trailing figure — and on the full invoice that matches the printed head-office address
    // block, which ends in a postcode: `313 <address prose> กรุงเทพฯ 10500` was captured as a
    // merchandise row of quantity 313 and ฿10,500.00, and the block repeats on every page. Every
    // full-form item carries a leading NO column and is already claimed by `ITEM_FULL_LINE`
    // above, and full-form discounts by `FULL_DISCOUNT_LINE` below, so the full form never needs
    // this branch — and an unguarded generic shape on a document with prose lines is exactly how
    // a non-purchase becomes a purchase.
    if (form === "condensed" && (match = QTY_NAME_AMOUNT_LINE.exec(line))) {
      const name = match[2]!.trim();
      const amountMinor = toMinor(match[3]!);
      if (amountMinor === null) return malformed(lineNo, "A line's amount does not read as a plain figure.");
      const quantity = Number(match[1]);
      const kind = classifyQtyNameAmountLine(name);
      if (kind === "discount") {
        discounts.push(amountMinor);
      } else if (kind === "promotion") {
        items.push({ lineNo, quantity, name, unitPriceMinor: null, amountMinor, vatExempt: Boolean(match[4]), isPromotion: true });
      } else {
        // No `@unit` on this shape, so there is no second figure to cross-check against —
        // trusted at face value, exactly as before.
        items.push({ lineNo, quantity, name, unitPriceMinor: null, amountMinor, vatExempt: Boolean(match[4]), isPromotion: false });
      }
      continue;
    }
    if ((match = SUBTOTAL_LINE.exec(line))) {
      const parsed = toMinor(match[1]!);
      if (parsed === null) return malformed(lineNo, "The subtotal does not read as a plain figure.");
      subtotalMinor = parsed;
      continue;
    }
    if (form === "full" && (match = FULL_SUBTOTAL_LINE.exec(line))) {
      const parsed = toMinor(match[1]!);
      if (parsed === null) return malformed(lineNo, "The subtotal does not read as a plain figure.");
      subtotalMinor = parsed;
      continue;
    }
    if (form === "full" && FULL_DISCOUNT_HEADING_LINE.test(line)) {
      inFullDiscountBlock = true;
      continue;
    }
    if (form === "full" && (match = FULL_DISCOUNT_TOTAL_LINE.exec(line))) {
      // Checked *before* `FULL_DISCOUNT_LINE` in this chain so the total line is never captured
      // as just another discount (correction #13) — the double-count that would follow from
      // treating it as one is exactly what this ordering prevents.
      const parsed = toMinor(match[1]!);
      if (parsed === null) return malformed(lineNo, "The discount total does not read as a plain figure.");
      fullDiscountTotalMinor = parsed;
      inFullDiscountBlock = false;
      continue;
    }
    if (form === "full" && inFullDiscountBlock && (match = FULL_DISCOUNT_LINE.exec(line))) {
      const parsed = toMinor(match[2]!);
      if (parsed === null) return malformed(lineNo, "A discount line's amount does not read as a plain figure.");
      discounts.push(parsed);
      continue;
    }
    if ((match = NET_LINE.exec(line))) {
      // Condensed form only in practice — see `NET_LINE`'s own comment.
      const parsed = toMinor(match[2]!);
      if (parsed === null) return malformed(lineNo, "The net amount does not read as a plain figure.");
      unitCount = Number(match[1]);
      netMinor = parsed;
      awaitingPaymentLine = true;
      continue;
    }
    if (form === "full" && (match = VAT_PRE_LINE.exec(line))) {
      const parsed = toMinor(match[1]!);
      if (parsed === null) return malformed(lineNo, "The pre-VAT value does not read as a plain figure.");
      vatPre = parsed;
      continue;
    }
    if (form === "full" && (match = VAT_TAX_LINE.exec(line))) {
      const parsed = toMinor(match[1]!);
      if (parsed === null) return malformed(lineNo, "The VAT value does not read as a plain figure.");
      vatTax = parsed;
      continue;
    }
    if (form === "full" && (match = VAT_TOTAL_LINE.exec(line))) {
      const parsed = toMinor(match[1]!);
      if (parsed === null) return malformed(lineNo, "The VAT-inclusive total does not read as a plain figure.");
      vatTotal = parsed;
      // This line **is** the full form's net (correction #14) — there is no separate `ยอดสุทธิ`
      // to read it from. **It does not arm the payment-line detection** (correction #15): the
      // full form's tail runs straight from here into the repeated page-2 header, with no
      // payment or tendered/change line between them at all — arming it here would have made
      // whatever happens to sit on the next line get misread as a payment method.
      netMinor = parsed;
      continue;
    }
    // Condensed form only (correction #15): the full invoice prints no payment method at all,
    // so this positional detection — armed only by `NET_LINE`, which is condensed-only in
    // practice — never runs on a full-form parse.
    if (form === "condensed" && awaitingPaymentLine && paymentMethod === null && (match = PAYMENT_LINE.exec(line))) {
      paymentMethod = match[1]!.trim();
      awaitingPaymentLine = false;
      awaitingTenderedLine = true;
      continue;
    }
    if (form === "condensed" && awaitingTenderedLine && BARE_MONEY_LINE.test(line)) {
      // The tendered/change figure that follows the payment line. Nothing in `ParsedReceipt`
      // wants it; it is consumed here only so it cannot fall through and be mistaken for
      // something else on a later pass.
      awaitingTenderedLine = false;
      continue;
    }
    // Unrecognised line: taxpayer identity block, member points, "บิลนี้ประหยัด", padding.
    // Skipped rather than refused — see the function comment.
  }

  if (storeCode === null || branchName === null) {
    return { ok: false, code: "MISSING_FIELD", message: "The store code and branch name line was not found." };
  }
  if (receiptNumber === null) return { ok: false, code: "MISSING_FIELD", message: "No receipt number was found." };
  // Condensed-form only (correction #15): payment-method tokens are measured to occur zero
  // times in the full invoice, so requiring one there would refuse every real full-invoice
  // parse. See `ParsedReceipt.paymentMethod`'s doc comment for the design consequence.
  if (form === "condensed" && paymentMethod === null) {
    return { ok: false, code: "MISSING_FIELD", message: "No payment line was found." };
  }
  if (netMinor === null) return { ok: false, code: "MISSING_FIELD", message: "No net amount line was found." };
  // The unit count is condensed-only (correction #14: the full invoice prints no `ชิ้น` count
  // at all), so it is required for a condensed parse and simply absent — not missing — on a
  // full one.
  if (form === "condensed" && unitCount === null) {
    return { ok: false, code: "MISSING_FIELD", message: "No unit-count line was found." };
  }

  // Date and time are read very differently by form (correction #16, measured: `TID#` and `R#`
  // occur zero times in the full invoice — both are condensed-only, not merely-usually-present).
  //
  // **Condensed form**: `TID#` carries the Gregorian date and `R#` carries a second, two-digit
  // Buddhist-era representation of the same day plus the time. D-031's standing rule applies in
  // full — two printed representations of one date must agree, and a disagreement is a refusal
  // rather than a tie-break — so both are required and cross-checked.
  //
  // **Full form**: there is exactly one printed date (`วันที่`, four-digit Buddhist era) and no
  // time at all. One representation means there is nothing to cross-check *against* — this is
  // not the two-digit-year ambiguity D-031 warns about, since a four-digit Buddhist year is
  // unambiguous on its own, so skipping the cross-check here is not a weakening of that rule,
  // it is the rule correctly finding nothing to apply itself to. `purchasedAtTime` is `null`
  // rather than an invented `00:00`.
  let purchasedAt: string;
  let purchasedAtTime: string | null;
  if (form === "condensed") {
    if (tidGregorianYear === null || tidMonth === null || tidDay === null) {
      return { ok: false, code: "MISSING_FIELD", message: "No TID# line was found to date the receipt." };
    }
    if (time === null) return { ok: false, code: "MISSING_FIELD", message: "No R# line was found to time the receipt." };
    if (rDay === null || rMonth === null || rBuddhistYear2 === null) {
      return { ok: false, code: "MISSING_FIELD", message: "No R# line was found to cross-check against TID#." };
    }
    const tidAsBuddhistTwoDigit = (tidGregorianYear + 543) % 100;
    if (rDay !== tidDay || rMonth !== tidMonth || rBuddhistYear2 !== tidAsBuddhistTwoDigit) {
      return {
        ok: false,
        code: "DATE_MISMATCH",
        message: "The R# line's printed date disagrees with the TID# date; neither is trusted alone."
      };
    }
    purchasedAt = `${String(tidGregorianYear).padStart(4, "0")}-${String(tidMonth).padStart(2, "0")}-${String(tidDay).padStart(2, "0")}`;
    purchasedAtTime = time;
  } else {
    if (fullDay === null || fullMonth === null || fullBuddhistYear4 === null) {
      return { ok: false, code: "MISSING_FIELD", message: "No วันที่ line was found to date the receipt." };
    }
    const fullGregorianYear = fullBuddhistYear4 - 543;
    purchasedAt = `${String(fullGregorianYear).padStart(4, "0")}-${String(fullMonth).padStart(2, "0")}-${String(fullDay).padStart(2, "0")}`;
    purchasedAtTime = null;
  }

  // Full form only: the discount block's own printed total must agree with what this reader
  // summed from its lines (correction #13) — a printed cross-check, refused rather than
  // reconciled on disagreement, in the same spirit as the quantity cross-check above. Only
  // checked when the block was present at all; a full invoice with no discounts never opens it.
  if (form === "full" && fullDiscountTotalMinor !== null) {
    const discountTotal = discounts.reduce((sum, discount) => sum + BigInt(discount), 0n);
    if (discountTotal !== BigInt(fullDiscountTotalMinor)) {
      return {
        ok: false,
        code: "DISCOUNT_TOTAL_MISMATCH",
        message: "ส่วนลดที่ได้ทั้งหมด disagrees with the sum of the discount lines above it."
      };
    }
  }

  const vat: VatBreakdown | null =
    form === "full" && vatPre !== null && vatTax !== null && vatTotal !== null
      ? { preVatMinor: vatPre, vatMinor: vatTax, totalInclVatMinor: vatTotal }
      : null;

  return {
    ok: true,
    value: {
      receiptNumber,
      storeCode,
      branchName,
      purchasedAt,
      purchasedAtTime,
      paymentMethod,
      items,
      discounts,
      subtotalMinor,
      netMinor,
      unitCount,
      vat,
      vatCode,
      supersedesReceiptNumber,
      ...assessReceipt({ items, discounts, netMinor, unitCount, vat })
    }
  };
}

/**
 * The receipt's own checksums, from its fields alone. Exported so the capture route recomputes
 * them from what it was sent rather than trusting a client's `completeness` — a parse happens on
 * the device, and `"complete"` is the claim that decides whether a stored item list may be
 * replaced (migration 027, Rule 3).
 */
export function assessReceipt(receipt: Pick<ParsedReceipt, "items" | "discounts" | "netMinor" | "unitCount" | "vat">): Pick<ParsedReceipt, "completeness" | "failedChecks" | "inapplicableChecks"> {
  const { items, discounts, netMinor, unitCount, vat } = receipt;
  const failedChecks: CompletenessCheck[] = [];
  const inapplicableChecks: CompletenessCheck[] = [];

  // Check 1 (both forms): sum(item amounts) − sum(discounts) === net. Promotional lines carry
  // a zero amount, so they contribute nothing either way. Always applicable — every form prints
  // a net figure.
  const itemTotal = items.reduce((sum, item) => sum + BigInt(item.amountMinor), 0n);
  const discountTotal = discounts.reduce((sum, discount) => sum + BigInt(discount), 0n);
  if (itemTotal - discountTotal !== BigInt(netMinor)) failedChecks.push("NET_CHECK");

  // Check 2 (condensed only, correction #14): summed quantities of non-promotional items ===
  // the printed unit count, which already excludes promotional lines by design. The full
  // invoice prints no unit count at all — not a missing value, a concept this document does not
  // have — so the check does not run there rather than being scored against a fabricated one.
  if (unitCount !== null) {
    const summedUnits = items.filter((item) => !item.isPromotion).reduce((sum, item) => sum + item.quantity, 0);
    if (summedUnits !== unitCount) failedChecks.push("UNIT_COUNT_CHECK");
  } else {
    inapplicableChecks.push("UNIT_COUNT_CHECK");
  }

  // Check 3 (full only, in practice — the condensed form never carries a VAT breakdown): the
  // pre-VAT and VAT figures must sum to the VAT-inclusive total. Runs only when the breakdown
  // is present; a document without one contributes nothing to say here either way.
  if (vat !== null) {
    if (BigInt(vat.preVatMinor) + BigInt(vat.vatMinor) !== BigInt(vat.totalInclVatMinor)) failedChecks.push("VAT_IDENTITY_CHECK");
  } else {
    inapplicableChecks.push("VAT_IDENTITY_CHECK");
  }

  return { completeness: failedChecks.length === 0 ? "complete" : "partial", failedChecks, inapplicableChecks };
}
