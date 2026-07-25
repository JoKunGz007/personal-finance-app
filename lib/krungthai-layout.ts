import { resolveKrungthaiYear } from "@/lib/dates";
import { parseThb, type MinorUnitString } from "@/lib/money";
import type { SourceRowCandidate } from "@/lib/statement";

// Geometry reader for contract version krungthai-layout-v1 (docs/KRUNGTHAI_CONTRACT.md).
//
// The geometry this validates is invented, per docs/FIXTURE_POLICY.md: no real
// statement was inspected to derive it. It is therefore proven correct against the
// synthetic fixtures only; whether it matches a real Krungthai PDF is unknown until
// the separately authorized smoke test. Everything here fails closed, so an
// unrecognized layout yields an error code rather than a guessed row.
//
// Input is the pdf.js text layer rather than PDF bytes: pdf.js already gives every
// glyph run a position, and the risk being managed is column/row assignment, not
// PDF decoding.

export type TextItem = { str: string; x: number; y: number };
export type PageText = readonly TextItem[];

export type LayoutErrorCode =
  | "UNSUPPORTED_LAYOUT"
  | "MISSING_COLUMN_ANCHOR"
  | "AMBIGUOUS_ROW_GEOMETRY"
  | "INVALID_ROW_CONTENT"
  | "MISSING_FRAME_FIELD"
  | "INVALID_FRAME_CONTENT"
  | "UNSUPPORTED_CURRENCY"
  | "CLOSING_BALANCE_MISMATCH";

// The account number is reduced to its last four digits here, at the point of
// extraction, so no full account number is ever carried past the parser
// (docs/KRUNGTHAI_CONTRACT.md: "account mapping (bank, type, last four only)").
export type StatementFrame = {
  bankCode: "KTB";
  accountType: string;
  accountLastFour: string;
  periodStart: string;
  periodEnd: string;
  openingBalance: MinorUnitString;
  closingBalance: MinorUnitString;
  currency: "THB";
  // False when the statement printed neither balance and both were derived from the
  // rows. The closing cross-check only means something when the value was printed.
  balancesPrinted: boolean;
};

export type LayoutResult =
  | { ok: true; frame: StatementFrame; rows: SourceRowCandidate[] }
  | { ok: false; code: LayoutErrorCode; message: string };

// Vertical distance within which two items are considered the same printed line.
const LINE_TOLERANCE = 3;
// A detail line belongs to the row above it when it sits within this distance.
const DETAIL_TOLERANCE = 14;

const BANK_SIGNATURE = /Krungthai|กรุงไทย/iu;

// Column anchors, in printed order. `key` names the field the band feeds.
//
// The seven columns below are the ones a real statement prints (see the 2026-07-25
// smoke test, DECISIONS D-024). The date and the time share a single `Date/Time`
// column, and the transaction type is printed separately from the description — the
// earlier invented model split date from time and had no transaction column at all,
// which no real statement could ever satisfy. Thai wordings are kept as alternates
// because the contract allows either language; the structure is what must match.
const COLUMN_ANCHORS = [
  { key: "dateTime", pattern: /^(Date\/Time|วันที่\/เวลา|วันที่|Date)$/iu },
  { key: "transaction", pattern: /^(Transaction|รายการ)$/iu },
  { key: "description", pattern: /^(Description\/Cheque No\.?|Description|คำอธิบาย|รายละเอียด)$/iu },
  { key: "withdrawal", pattern: /^(ถอนเงิน|Withdrawal)$/iu },
  { key: "deposit", pattern: /^(ฝากเงิน|Deposit)$/iu },
  { key: "balance", pattern: /^(ยอดคงเหลือ|Balance)$/iu },
  { key: "branch", pattern: /^(ช่องทาง|สาขา|Channel|Branch)$/iu }
] as const;

type ColumnKey = (typeof COLUMN_ANCHORS)[number]["key"];
type Columns = Record<ColumnKey, number>;

// One cell carries the date and, optionally, the time. Whether pdf.js emits them as
// one run or two does not matter: a cell's runs are joined before matching.
const DATE_TIME_PATTERN =
  /^(\d{2})\/(\d{2})\/(\d{2})(?:\s+(([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?))?$/;
// The frame's period is printed as two plain dates, never with a time.
const DATE_ONLY_PATTERN = /^(\d{2})\/(\d{2})\/(\d{2})$/;
// A time on its own line, which is how the time is printed for each row.
const TIME_ONLY_PATTERN = /^([01]?\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;
// Deliberately loose: anything date-shaped enough that treating it as "not a row" would
// risk dropping a transaction. Tighter than "contains a digit", which matched footers.
const LOOSE_DATE_PROBE = /\d{1,4}[/-]\d{1,2}[/-]\d{1,4}/u;

// Frame labels live above the transaction heading line. Each value is read from
// the same printed line, to the right of its label.
// Wordings confirmed against a real statement on 2026-07-25 (D-026): `Account Number`
// and `Statement Period`, not the abbreviations previously guessed. Opening and closing
// balances are not printed in the frame at all — see extractStatement, which derives
// them from the rows.
const FRAME_LABELS = {
  accountType: /^(ประเภทบัญชี|Account Type)$/iu,
  accountNumber: /^(เลขที่บัญชี|Account Number|Account No\.?)$/iu,
  period: /^(ระหว่างวันที่|Statement Period|Period)$/iu,
  opening: /^(ยอดยกมา|Opening Balance|Balance Brought Forward)$/iu,
  closing: /^(ยอดยกไป|Closing Balance)$/iu
} as const;

// Other labels printed in the frame block. They are not read for any value, but a
// label's value must stop before the next label begins: a frame line carries several
// label/value pairs (`Account Number … Branch Code …`), so taking everything to the
// right of a label swept the following field's digits into it — which silently produced
// the wrong last four for the account.
const FRAME_LABEL_STOPS: RegExp[] = [
  ...Object.values(FRAME_LABELS),
  /^(Account Name|ชื่อบัญชี)$/iu,
  /^(Branch|สาขา)$/iu,
  /^(Branch Code|รหัสสาขา)$/iu,
  /^(Current Address|ที่อยู่)$/iu,
  /^(Overdraft Limit|วงเงินเบิกเกินบัญชี)$/iu,
  /^(Requested Date|วันที่ขอ)$/iu,
  /^(Check Book No\.?|Cheque Book No\.?)$/iu,
  /^(Currency|สกุลเงิน)$/iu
];

const CURRENCY_MARKER = /\b(THB)\b|บาท/u;

// Currency wordings worth looking for when the marker above does not match. This is an
// allowlist: the diagnostic reports which of these names were seen and on which side of
// the heading line, never any text taken from the statement.
const CURRENCY_TOKENS: Array<{ name: string; pattern: RegExp }> = [
  { name: "THB", pattern: /\bTHB\b/u },
  { name: "Baht", pattern: /\bbaht\b/iu },
  { name: "บาท", pattern: /บาท/u },
  { name: "Currency", pattern: /\bcurrency\b/iu },
  { name: "สกุลเงิน", pattern: /สกุลเงิน/u }
];

function currencyEvidence(lines: TextItem[][], headerY: number): string {
  const seenIn = (subset: TextItem[][]) =>
    CURRENCY_TOKENS.filter(({ pattern }) => subset.some((line) => line.some((item) => pattern.test(item.str))))
      .map(({ name }) => name);
  const above = lines.filter((line) => line[0]!.y > headerY + LINE_TOLERANCE);
  const below = lines.filter((line) => line[0]!.y <= headerY + LINE_TOLERANCE);
  const format = (names: string[]) => names.length > 0 ? names.join(", ") : "none";
  return `Currency wording above the grid: ${format(seenIn(above))}; below: ${format(seenIn(below))}.`;
}

function groupIntoLines(items: PageText): TextItem[][] {
  const lines: TextItem[][] = [];
  for (const item of [...items].sort((a, b) => b.y - a.y || a.x - b.x)) {
    const line = lines.find((candidate) => Math.abs(candidate[0]!.y - item.y) <= LINE_TOLERANCE);
    if (line) line.push(item);
    else lines.push([item]);
  }
  return lines.map((line) => line.sort((a, b) => a.x - b.x));
}

// A column owns every item from its own anchor x up to the next anchor's x. The
// last column extends to the right page edge.
function assign(columns: Columns, item: TextItem): ColumnKey | null {
  const ordered = COLUMN_ANCHORS.map((anchor) => ({ key: anchor.key, x: columns[anchor.key] }))
    .sort((a, b) => a.x - b.x);
  for (let index = ordered.length - 1; index >= 0; index -= 1) {
    // Allow a small left overhang so a right-aligned number still lands in its band.
    if (item.x >= ordered[index]!.x - LINE_TOLERANCE) return ordered[index]!.key;
  }
  return null;
}

function textOf(cells: Partial<Record<ColumnKey, string[]>>, key: ColumnKey): string {
  return (cells[key] ?? []).join(" ").replace(/\s+/gu, " ").trim();
}

// On-device diagnostic for a layout that will not read.
//
// When the anchors do not match, the only thing needed to fix the reader is the set of
// heading words the statement actually prints — the x positions come from the PDF at
// runtime. This returns those candidate labels and nothing else, so a layout can be
// repaired without anyone reading the statement.
//
// Two filters make the output structurally incapable of carrying financial data: any
// item containing a digit is dropped (excluding amounts, balances, dates, times,
// account and reference numbers), and only lines holding at least three surviving
// short items are reported — heading rows are dense, whereas a name or address line is
// not. It is a diagnostic aid, not a sanitizer: it is shown to the owner on this
// device, and what leaves the device stays their decision.
const DIAGNOSTIC_MAX_LABEL = 24;
const DIAGNOSTIC_MIN_ITEMS_PER_LINE = 3;
const DIAGNOSTIC_MAX_LINES = 12;

// Reduces text to its shape: every numeral becomes `d`, every letter or combining mark
// `x`, and everything else — separators, punctuation, spacing — is kept. `01/01/26 09:15`
// becomes `dd/dd/dd dd:dd`, which says what format a cell is printed in while destroying
// the value. Row-level failures report this instead of the cell, so a date or amount
// format can be diagnosed without any figure leaving the device.
//
// Combining marks must be masked, not just letters: Thai vowel and tone marks are
// `\p{M}`, so masking `\p{L}` alone left them intact and `โอนเงินเข้า` came out as
// `xxxxxิxxx้x`, leaking fragments of the real text. `\p{N}` rather than `\p{Nd}` for the
// same reason — non-decimal numerals are still values.
// One pass, not two: masking numerals to `d` and then letters to `x` overwrites those
// `d`s, because `d` is itself a letter — which silently turned every date into
// `xx/xx/xx` and made the shapes useless for reading a format.
export function maskShape(value: string): string {
  return value.replace(/[\p{N}\p{L}\p{M}]/gu, (character) => /\p{N}/u.test(character) ? "d" : "x");
}

export function describeLabelGeometry(pages: readonly PageText[]): string[][] {
  const described: string[][] = [];
  for (const page of pages) {
    for (const line of groupIntoLines(page)) {
      const labels = line
        .map((item) => item.str.normalize("NFKC").trim())
        .filter((label) => label.length > 0 && label.length <= DIAGNOSTIC_MAX_LABEL && !/\p{Nd}/u.test(label));
      if (labels.length >= DIAGNOSTIC_MIN_ITEMS_PER_LINE) described.push(labels);
      if (described.length >= DIAGNOSTIC_MAX_LINES) return described;
    }
  }
  return described;
}

// The frame labels — account number, period, opening and closing balance — sit on lines
// whose values carry digits, so describeLabelGeometry filters those lines out entirely
// and their wording stays unknown. This reports a label only when the item printed
// *immediately* to its right carries a digit, which is exactly the label/value shape
// those fields use. The account holder's name is excluded by construction: its value is
// text, not digits, so the label never qualifies.
export function describeValueLabels(pages: readonly PageText[]): string[] {
  const labels = new Set<string>();
  // The first and last pages: the frame is on page one, and a statement's summary totals
  // are on the last, where their labels are the only way to read them.
  const scanned = pages.length > 1 ? [pages[0]!, pages[pages.length - 1]!] : pages.slice(0, 1);
  for (const page of scanned) {
    for (const line of groupIntoLines(page)) {
      line.forEach((item, index) => {
        const text = item.str.normalize("NFKC").trim();
        if (!text || text.length > DIAGNOSTIC_MAX_LABEL || /\p{Nd}/u.test(text)) return;
        const next = line[index + 1];
        if (next && /\p{Nd}/u.test(next.str)) labels.add(text);
      });
    }
  }
  return [...labels].slice(0, DIAGNOSTIC_MAX_LINES * 2);
}

// The whole statement's structure with none of its content: every line, every run's
// x position, and each run reduced by maskShape to `d` for a digit and `x` for a letter.
// Punctuation and spacing survive, so formats, column bands, wrapped continuation lines,
// page breaks, and footer blocks are all visible while no name, amount, balance, date, or
// account number can be. Page one is reported in full because the frame and the first
// rows live there; later pages contribute only their opening lines, which is enough to
// show how a continuation page begins.
const STRUCTURE_MAX_LINES = 120;
const STRUCTURE_CONTINUATION_LINES = 12;

export function describeStructure(pages: readonly PageText[]): string[] {
  const described: string[] = [];
  const lastIndex = pages.length - 1;
  const render = (line: TextItem[], pageIndex: number) => {
    const cells = line
      .map((item) => `${maskShape(item.str.normalize("NFKC").trim())}@${Math.round(item.x)}`)
      .join("  ");
    described.push(`p${pageIndex + 1} y=${Math.round(line[0]!.y)}  ${cells}`);
  };

  pages.forEach((page, pageIndex) => {
    if (pageIndex === lastIndex && lastIndex > 0) return; // rendered in full below
    const lines = groupIntoLines(page);
    const limit = pageIndex === 0 ? lines.length : STRUCTURE_CONTINUATION_LINES;
    for (const line of lines.slice(0, limit)) {
      if (described.length >= STRUCTURE_MAX_LINES) return;
      render(line, pageIndex);
    }
  });

  // The last page in full, always. A statement may close with a summary block — totals,
  // an opening or closing balance — and that is exactly the region a middle-page cap
  // would hide. Without it, balances have to be derived rather than read (D-026).
  if (lastIndex > 0) {
    described.push(`--- last page (${lastIndex + 1}) in full ---`);
    for (const line of groupIntoLines(pages[lastIndex]!)) render(line, lastIndex);
  }
  return described;
}

// Locates the transaction grid's heading line and returns both its column x positions
// and its own `y`. The `y` is what separates the frame block above the grid from the
// rows below it, and it has to come from *this* line — the one carrying all seven
// headings — rather than from the first line matching any single anchor. A real
// statement prints `Branch` as a frame label above the grid, which matches the `branch`
// anchor on its own, so an any-anchor search puts the boundary on a frame line and
// silently drops every frame field printed below it (GOTCHAS). The collision is generic
// to any frame label that equals a column heading, so it is not special-cased.
function findColumns(lines: TextItem[][]): { columns: Columns; y: number } | null {
  for (const line of lines) {
    const found: Partial<Columns> = {};
    for (const item of line) {
      const anchor = COLUMN_ANCHORS.find((candidate) => candidate.pattern.test(item.str.trim()));
      if (anchor) found[anchor.key] = item.x;
    }
    if (COLUMN_ANCHORS.every((anchor) => found[anchor.key] !== undefined)) {
      return { columns: found as Columns, y: line[0]!.y };
    }
  }
  return null;
}

// The frame as printed: balances are nullable because a real statement does not print
// them. extractStatement turns this into a StatementFrame once the rows are known.
type FrameDraft = Omit<StatementFrame, "openingBalance" | "closingBalance" | "balancesPrinted"> & {
  openingBalance: MinorUnitString | null;
  closingBalance: MinorUnitString | null;
};

// Reads the label/value block above the transaction grid on page one.
function extractFrame(lines: TextItem[][], headerY: number):
  { ok: true; draft: FrameDraft } | { ok: false; code: LayoutErrorCode; message: string } {
  const frameLines = lines.filter((line) => line[0]!.y > headerY + LINE_TOLERANCE);

  // The currency is looked for across the whole of page one, not just the label block
  // above the grid: a real statement prints it below the transactions (D-025). The
  // requirement is unchanged — page one must state THB explicitly — but this is a
  // weaker guard than a frame-only match, because a statement in another currency that
  // merely mentioned THB would satisfy it. Deliberately not paired with a foreign-code
  // scan: transaction descriptions can legitimately contain a currency code, so that
  // check would reject valid statements. The hard enforcement stays downstream, where
  // `parseThb` and the `THB` literal in `importPayloadSchema` refuse anything else.
  const pageText = lines.flat().map((item) => item.str).join(" ");

  if (!CURRENCY_MARKER.test(pageText)) {
    // Which currency wording a statement uses, and whether it is printed above the grid
    // at all, decides whether this is the wrong marker or the wrong region to look in.
    // Only allowlisted token names are reported, so nothing from the document is echoed.
    return {
      ok: false,
      code: "UNSUPPORTED_CURRENCY",
      message: `The statement frame does not state THB. ${currencyEvidence(lines, headerY)}`
    };
  }

  // A label's value is what is printed to its right on the same line, up to the next
  // label. Frame lines carry more than one pair, so an unbounded slice would append the
  // following field's value — `Account Number` would swallow the `Branch Code` digits.
  // Internal whitespace is collapsed before matching. A frame label may be padded or
  // use a non-standard space, and an anchored pattern rejects `Account  Number` while
  // the text looks identical anywhere it is printed or reported — which is exactly how
  // one field stayed "missing" while its neighbours on the same line matched.
  const labelText = (item: TextItem) => item.str.replace(/\s+/gu, " ").trim();

  // Reports whether the label was found separately from whether it had a value, so a
  // wording mismatch is never confused with an empty or mis-sliced value.
  const valueFor = (label: RegExp): { found: boolean; value: string | null } => {
    let found = false;
    for (const line of frameLines) {
      const index = line.findIndex((item) => label.test(labelText(item)));
      if (index === -1) continue;
      found = true;
      const rest = line.slice(index + 1);
      const stop = rest.findIndex((item) => FRAME_LABEL_STOPS.some((pattern) => pattern.test(labelText(item))));
      const value = (stop === -1 ? rest : rest.slice(0, stop))
        .map((item) => item.str.trim()).join(" ").replace(/\s+/gu, " ").trim();
      // Keep looking if this occurrence carried no value: the same wording can appear as
      // a bare heading elsewhere in the block, and stopping there would report a field
      // that is printed further down as missing.
      if (value) return { found: true, value };
    }
    return { found, value: null };
  };

  const invalid = (field: string) =>
    ({ ok: false as const, code: "INVALID_FRAME_CONTENT" as const, message: `The statement frame has an unreadable ${field}.` });

  // Every label is resolved before any is reported, so one run names every field whose
  // wording does not match rather than only the first. Reporting them one at a time cost
  // a whole authorized statement read per field. Field names only — no value is echoed.
  // Opening and closing balances are deliberately absent from this list: a real
  // statement does not print them in the frame (D-026), so requiring them would reject
  // every statement. They are read when present and derived from the rows otherwise.
  const resolved = {
    "account type": valueFor(FRAME_LABELS.accountType),
    "account number": valueFor(FRAME_LABELS.accountNumber),
    "statement period": valueFor(FRAME_LABELS.period)
  };
  const absent = Object.entries(resolved).filter(([, result]) => !result.value);
  if (absent.length > 0) {
    const complete = Object.entries(resolved).filter(([, result]) => result.value).map(([field]) => field);
    return {
      ok: false as const,
      code: "MISSING_FRAME_FIELD" as const,
      message:
        "The statement frame has no " +
        absent.map(([field, result]) => `${field} (${result.found ? "label found, value empty" : "label not found"})`).join(", no ") +
        `. Fields that did read: ${complete.length > 0 ? complete.join(", ") : "none"}.`
    };
  }

  const accountType = resolved["account type"]!.value!;
  const accountNumber = resolved["account number"]!.value!;
  const digits = accountNumber.replace(/\D/gu, "");
  if (digits.length < 4) return invalid("account number");
  const accountLastFour = digits.slice(-4);

  const periodText = resolved["statement period"]!.value!;
  const periodDates = periodText.match(/\d{2}\/\d{2}\/\d{2}/gu);
  if (!periodDates || periodDates.length !== 2) {
    return {
      ok: false as const,
      code: "INVALID_FRAME_CONTENT" as const,
      message: `The statement frame has an unreadable statement period, shape ${maskShape(periodText)}.`
    };
  }

  // The period end year anchors every two-digit year in the statement, including
  // its own start date, so it is resolved first against its own printed value.
  const endParts = DATE_ONLY_PATTERN.exec(periodDates[1]!)!;
  const endYear = resolveKrungthaiYear(Number(endParts[3]), new Date().getUTCFullYear());
  const periodEnd = toIsoDate(periodDates[1]!, endYear);
  const periodStart = toIsoDate(periodDates[0]!, endYear);
  if (!periodStart || !periodEnd) return invalid("statement period");
  if (periodStart > periodEnd) return invalid("statement period (start is after end)");

  // Read when printed, left null otherwise for extractStatement to derive.
  const openingText = valueFor(FRAME_LABELS.opening).value;
  const closingText = valueFor(FRAME_LABELS.closing).value;

  let openingBalance: MinorUnitString | null = null;
  let closingBalance: MinorUnitString | null = null;
  try {
    if (openingText) openingBalance = parseThb(openingText).minor;
    if (closingText) closingBalance = parseThb(closingText).minor;
  } catch {
    return invalid("opening or closing balance");
  }

  return {
    ok: true,
    draft: {
      bankCode: "KTB" as const,
      accountType,
      accountLastFour,
      periodStart,
      periodEnd,
      openingBalance,
      closingBalance,
      currency: "THB" as const
    }
  };
}

// Resolves a printed dd/mm/yy against an already-known year, rejecting dates that
// are not real calendar dates (Date silently rolls 31/02 over).
function toIsoDate(printed: string, year: number): string | null {
  const match = DATE_ONLY_PATTERN.exec(printed);
  if (!match) return null;
  const [, day, month] = match;
  const iso = `${year}-${month}-${day}`;
  const asDate = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(asDate.getTime())) return null;
  if (asDate.getUTCDate() !== Number(day) || asDate.getUTCMonth() + 1 !== Number(month)) return null;
  return iso;
}

export function extractStatement(pages: readonly PageText[]): LayoutResult {
  const firstPageText = (pages[0] ?? []).map((item) => item.str).join(" ").normalize("NFKC");
  if (!BANK_SIGNATURE.test(firstPageText)) {
    return { ok: false, code: "UNSUPPORTED_LAYOUT", message: "No Krungthai signature on the first page." };
  }

  let draft: FrameDraft | null = null;
  const rows: SourceRowCandidate[] = [];

  for (const [pageIndex, page] of pages.entries()) {
    const lines = groupIntoLines(page);
    const header = findColumns(lines);
    if (!header) {
      return {
        ok: false,
        code: "MISSING_COLUMN_ANCHOR",
        message: `Page ${pageIndex + 1} has no line carrying every required column heading.`
      };
    }
    const { columns, y: headerY } = header;

    // The frame is printed once, above the grid on page one.
    if (pageIndex === 0) {
      const extracted = extractFrame(lines, headerY);
      if (!extracted.ok) return extracted;
      draft = extracted.draft;
    }

    // A row starts on the line whose date cell parses; any following line that has no
    // date of its own is a wrapped detail line belonging to that row.
    let current: { cells: Partial<Record<ColumnKey, string[]>>; y: number } | null = null;
    const pageRows: Array<Partial<Record<ColumnKey, string[]>>> = [];

    for (const line of lines) {
      if (line[0]!.y >= headerY - LINE_TOLERANCE) continue; // header and everything above it

      const cells: Partial<Record<ColumnKey, string[]>> = {};
      for (const item of line) {
        const key = assign(columns, item);
        if (!key) continue;
        (cells[key] ??= []).push(item.str.trim());
      }

      const dateText = textOf(cells, "dateTime");
      if (DATE_TIME_PATTERN.test(dateText)) {
        current = { cells, y: line[0]!.y };
        pageRows.push(cells);
        continue;
      }
      // A real statement prints the time on its own line below the date, in the same
      // column (D-026). Such a line is a genuine continuation: merged into the row's
      // cells it makes the date/time cell read `dd/mm/yy HH:MM`, which is exactly what
      // DATE_TIME_PATTERN expects, so it needs no special handling beyond not being
      // mistaken for a broken row.
      if (dateText && TIME_ONLY_PATTERN.test(dateText) && current) {
        for (const key of Object.keys(cells) as ColumnKey[]) {
          (current.cells[key] ??= []).push(...cells[key]!);
        }
        continue;
      }

      // A date/time cell that looks like a date but does not parse is a row this reader
      // cannot read — never a continuation line and never stray text. Skipping it would
      // drop a transaction silently, and merging it would fold one row's date into
      // another's description, so both directions fail closed.
      //
      // The probe is date-shaped rather than "contains a digit": a footer address line
      // beginning with a street number would otherwise abort a statement that had
      // already parsed correctly.
      if (dateText && LOOSE_DATE_PROBE.test(dateText)) {
        return {
          ok: false,
          code: current ? "AMBIGUOUS_ROW_GEOMETRY" : "INVALID_ROW_CONTENT",
          message: `Page ${pageIndex + 1} has a date/time cell that does not parse, shape ${maskShape(dateText)}.`
        };
      }
      if (!current) continue; // stray text above the first row
      if (current.y - line[0]!.y > DETAIL_TOLERANCE) {
        current = null; // too far below to be a continuation; treat as footer
        continue;
      }
      for (const key of Object.keys(cells) as ColumnKey[]) {
        (current.cells[key] ??= []).push(...cells[key]!);
      }
    }

    for (const [rowIndex, cells] of pageRows.entries()) {
      // Two-digit row years resolve against the extracted period end, not the
      // current year, so a statement stays readable regardless of when it is parsed.
      const parsed = toRow(cells, Number(draft!.periodEnd.slice(0, 4)), pageIndex + 1, rowIndex + 1);
      if (!parsed.ok) return parsed;
      rows.push(parsed.row);
    }
  }

  if (!draft) {
    return { ok: false, code: "MISSING_FRAME_FIELD", message: "The statement has no readable frame." };
  }
  if (rows.length === 0) {
    return { ok: false, code: "INVALID_ROW_CONTENT", message: "The statement has no readable rows." };
  }

  // A statement that does not print its balances still has to yield an opening figure,
  // because reconciliation chains from it. The first row's printed balance minus that
  // row's own movement is the balance the account held before it — arithmetic on values
  // already read, not an assumption.
  //
  // What this costs, stated plainly: reconciliation can no longer detect a dropped
  // *first* row, since the derived opening is defined to agree with it, and there is no
  // printed closing figure to cross-check the chain against. Rows two onward are still
  // fully checked against the chain, which is where a misread row shows up. See D-026.
  const balancesPrinted = draft.openingBalance !== null && draft.closingBalance !== null;
  const firstRow = rows[0]!;
  const firstMovement = firstRow.components.reduce((sum, item) => sum + BigInt(item.amount.minor), 0n);
  const derivedOpening = (BigInt(firstRow.postBalance.minor) - firstMovement).toString() as MinorUnitString;
  const lastPrinted = rows[rows.length - 1]!.postBalance.minor;

  const frame: StatementFrame = {
    ...draft,
    openingBalance: draft.openingBalance ?? derivedOpening,
    closingBalance: draft.closingBalance ?? lastPrinted,
    balancesPrinted
  };

  // Only meaningful when the statement actually printed a closing balance: comparing a
  // derived value against the row it was derived from would assert nothing.
  if (draft.closingBalance !== null && lastPrinted !== draft.closingBalance) {
    return {
      ok: false,
      code: "CLOSING_BALANCE_MISMATCH",
      message: "The final row balance does not match the printed closing balance."
    };
  }

  return { ok: true, frame, rows };
}

function toRow(
  cells: Partial<Record<ColumnKey, string[]>>,
  statementEndYear: number,
  page: number,
  row: number
): { ok: true; row: SourceRowCandidate } | { ok: false; code: LayoutErrorCode; message: string } {
  const invalid = (message: string): { ok: false; code: LayoutErrorCode; message: string } =>
    ({ ok: false, code: "INVALID_ROW_CONTENT", message: `Page ${page} row ${row}: ${message}` });

  const printedDateTime = textOf(cells, "dateTime");
  const dateMatch = DATE_TIME_PATTERN.exec(printedDateTime);
  // A shape rather than the value: digits become `d` and letters `x`, so a format
  // mismatch can be diagnosed on this device without the cell's contents.
  if (!dateMatch) return invalid(`unreadable date/time cell, shape ${maskShape(printedDateTime)}.`);
  const [, day, month, shortYear, printedTime] = dateMatch;
  const year = resolveKrungthaiYear(Number(shortYear), statementEndYear);
  const sourceDate = `${year}-${month}-${day}`;
  // Reject impossible calendar dates such as 31/02; Date rolls them over silently.
  const asDate = new Date(`${sourceDate}T00:00:00Z`);
  if (Number.isNaN(asDate.getTime()) || asDate.getUTCDate() !== Number(day) || asDate.getUTCMonth() + 1 !== Number(month)) {
    return invalid("date is not a real calendar date.");
  }

  const timeText = printedTime ?? "";

  // The transaction type and the description are printed in separate columns. Either
  // may be blank on a given row, and a wrapped continuation appends to whichever
  // column it sits under, so the two are merged only as a last resort.
  const transactionText = textOf(cells, "transaction");
  const descriptionText = textOf(cells, "description");
  if (!transactionText && !descriptionText) return invalid("no transaction or description text.");
  const transactionLabel = transactionText || descriptionText;
  const description = descriptionText || transactionText;

  const withdrawalText = textOf(cells, "withdrawal");
  const depositText = textOf(cells, "deposit");
  if (!withdrawalText && !depositText) return invalid("neither a withdrawal nor a deposit amount.");

  let money: { withdrawal?: MinorUnitString; deposit?: MinorUnitString; balance: MinorUnitString };
  try {
    money = {
      withdrawal: withdrawalText ? parseThb(withdrawalText).minor : undefined,
      deposit: depositText ? parseThb(depositText).minor : undefined,
      balance: parseThb(textOf(cells, "balance")).minor
    };
  } catch {
    return invalid(
      "unparsable money text, shapes " +
      `withdrawal ${maskShape(withdrawalText) || "—"}, ` +
      `deposit ${maskShape(depositText) || "—"}, ` +
      `balance ${maskShape(textOf(cells, "balance")) || "—"}.`
    );
  }

  const components: SourceRowCandidate["components"] = [];
  if (money.deposit !== undefined) {
    if (BigInt(money.deposit) <= 0n) return invalid("deposit column is not positive.");
    components.push({ kind: "deposit", amount: { minor: money.deposit, currency: "THB" } });
  }
  if (money.withdrawal !== undefined) {
    // Withdrawals print unsigned; the ledger stores them negative.
    const magnitude = BigInt(money.withdrawal);
    if (magnitude <= 0n) return invalid("withdrawal column is not positive.");
    components.push({ kind: "withdrawal", amount: { minor: (-magnitude).toString(), currency: "THB" } });
  }
  if (components.length === 2) {
    // Only the recognized interest/tax pairing may share a row; anything else is
    // an unknown compound row and must fail closed.
    const label = `${transactionLabel} ${description}`;
    if (!/ดอกเบี้ย|interest/iu.test(label) || !/ภาษี|tax/iu.test(label)) {
      return invalid("unknown compound row (only the interest/tax pairing is recognized).");
    }
  }

  const branch = textOf(cells, "branch");

  return {
    ok: true,
    row: {
      sourceDate,
      sourceTime: timeText || null,
      effectiveDate: sourceDate,
      transactionLabel,
      description,
      reference: null,
      branch: branch || null,
      components,
      postBalance: { minor: money.balance, currency: "THB" },
      provenance: {
        page,
        row,
        parserFields: { contractVersion: "krungthai-layout-v1", printedDateTime }
      }
    }
  };
}
