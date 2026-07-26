import { gregorianYearFrom, type StatementEra } from "@/lib/dates";
import { LINE_TOLERANCE, groupIntoLines, maskShape, type PageText, type TextItem } from "@/lib/masked-diagnostics";
import { formatThb, parseThb, type MinorUnitString } from "@/lib/money";
import type { SourceRowCandidate } from "@/lib/statement";
import type { BankCode, ContractVersion, LayoutErrorCode, LayoutResult, StatementFrame } from "@/lib/statement-frame";

// Descriptor-driven reader for contract versions `scb-layout-v1` and `kbank-layout-v1`
// (docs/SCB_CONTRACT.md, docs/KBANK_CONTRACT.md).
//
// Krungthai is deliberately not read here. That reader is the highest-risk proven code
// in the repo — eleven defects across ten owner-driven reads, one of which did not fail
// closed — and folding it into an abstraction that had never run against a second layout
// would have traded working financial code for a design hypothesis. It is migrated
// afterwards, with its own tests as the safety net.
//
// The geometry validated here is invented, per docs/FIXTURE_POLICY.md: the structure was
// learned from masked dumps (D-035), but no coordinate from a real document is recorded
// in a fixture or in this file. Everything fails closed.
//
// ## Why this reads a row grammar rather than column bands
//
// `lib/krungthai-layout.ts` assigns each run to a column by where its midpoint falls
// between heading anchors. That works on Krungthai and on neither of these layouts: in
// both, the heading x positions do not bound the data. SCB prints its description runs
// far left of the `Description/Note` heading, under `Balance/Baht`; KBANK prints short
// descriptions left of the `Descriptions` heading, inside the time column's band.
// Banding misfiles most of a row.
//
// What is stable is the row *grammar*. Across the masked dumps every one of 361 SCB rows
// and 89 KBANK rows is the same ordered sequence of run kinds, so a field is identified
// by what it is and where it comes in that sequence. Geometry is then used for exactly
// one thing: cross-checking direction, below.

const NOMINAL_GLYPH_WIDTH = 4;

// A run's right edge. For a right-aligned column this is the invariant — the left edge
// moves with the value's width, which is what put a wide balance in the wrong column on
// a real Krungthai statement (D-030). Money and balance are right-aligned in both of
// these layouts, so every geometric claim here is made about right edges.
function rightEdgeOf(item: TextItem): number {
  return item.x + (item.width ?? item.str.trim().length * NOMINAL_GLYPH_WIDTH);
}

// Two right edges belong to the same printed column within this distance. It has to be
// well under the separation between a layout's two money sub-columns, and KBANK's are
// the closer pair of the two.
const COLUMN_EDGE_TOLERANCE = 4;

const MONEY_PATTERN = /^-?\d{1,3}(?:,\d{3})*\.\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;
// Four-digit years, as both layouts print in their frame. This is why neither can
// reproduce D-031's calendar shift in the frame: 2569 and 2026 are not confusable.
const PERIOD_YEAR_BUDDHIST_FLOOR = 2400;

// The frame's printed period. Both layouts print it with slashes, including KBANK, whose
// rows use hyphens — so this takes either separator and requires both dates to use the
// same one.
const PERIOD_PATTERN = /(\d{2})([/-])(\d{2})\2(\d{4})\s*[-–—]\s*(\d{2})\2(\d{2})\2(\d{4})/u;

type TextField = "code" | "channel" | "description" | "details";

// One field of a row, in printed order. `absorb` lets the last text field of a segment
// take any surplus runs, so a description that pdf.js splits into two runs joins rather
// than shifting every field after it.
type FieldSpec =
  | { kind: "dateTime" }
  | { kind: "date" }
  | { kind: "time" }
  | { kind: "literal"; pattern: RegExp }
  | { kind: "text"; field: TextField; optional?: boolean; absorb?: boolean };

// How a layout prints its own totals. Three layouts encode the same fact three ways, so
// the descriptor names the encoding rather than pretending one shape fits all: Krungthai
// prints label-then-count-then-amount, SCB puts both counts on their own `TOTAL ITEMS`
// line, KBANK embeds the count inside the label's own run.
type SummarySpec =
  | {
      encoding: "counts-on-own-line";
      region: "last-page-below-grid";
      withdrawalTotal: RegExp;
      depositTotal: RegExp;
      // One line carrying two counts, in the same left-to-right order as the two money
      // sub-columns.
      itemCounts: RegExp;
    }
  | {
      encoding: "count-inside-label";
      region: "first-page-above-grid";
      // Each pattern must capture the count as group 1.
      withdrawal: RegExp;
      deposit: RegExp;
    };

export type LayoutDescriptor = {
  contractVersion: ContractVersion;
  bankCode: BankCode;
  // There is no bank-name signature here, and its absence is deliberate.
  //
  // A masked dump masks every letter, so it cannot reveal what name a statement prints —
  // the only unmasked wordings it yields are heading lines and labels printed beside a
  // number, and neither carries one. Guessing at a name would therefore be unfalsifiable
  // against the only evidence available.
  //
  // It would also be wrong. Both KBANK statements print `Internet/Mobile SCB` as a
  // channel on ordinary transfer rows, so a signature matching `SCB` on page one routes
  // every KBANK statement to the SCB reader. A bank's name appears on other banks'
  // statements as a matter of course, because that is what a transfer is.
  //
  // The heading anchor set is what actually identifies a layout: it is unique per bank,
  // it is confirmed present on every page of every dump, and a transaction description
  // cannot forge a line carrying all of it. Dispatch uses it, and so does the frame/grid
  // boundary — one fact, checked once (D-039).
  //
  // Every one of these must appear on a single printed line for that line to be the
  // heading. Requiring all of them is what stopped a frame label that happens to equal a
  // column heading from being taken as the frame/grid boundary (D-028).
  headingAnchors: readonly RegExp[];
  // The heading block spans more than one printed line in both layouts, counted in lines
  // rather than in units so no coordinate from a real document is encoded here. SCB
  // prints a Thai mirror line beneath; KBANK splits one column heading above and another
  // below, which is why anchoring on the main line alone gives five anchors for six
  // columns.
  headingLinesAbove: number;
  headingLinesBelow: number;
  // The currency must be printed, never assumed. Neither layout states it in the frame
  // block, so D-034's guard is relocated to the heading block rather than dropped: SCB
  // prints `Balance/Baht`, KBANK `(THB)` under the balance heading (D-040).
  currencyMarker: RegExp;
  dateSeparator: "/" | "-";
  // The runs before the two money runs, and the runs after them.
  leadingFields: readonly FieldSpec[];
  trailingFields: readonly FieldSpec[];
  // Which text field feeds which row field. `transactionLabel` and `description` are both
  // required by the import contract, so a layout must name a source for each.
  rowFields: {
    transactionLabel: TextField;
    description: TextField;
    reference: TextField | null;
    branch: TextField | null;
  };
  // The brought-forward pseudo-row. Recognised by its label rather than by its shape,
  // because KBANK's leads with a date exactly as a transaction does.
  carryForwardLabel: RegExp;
  frameLabels: {
    accountNumber: RegExp;
    closingBalance: RegExp | null;
  };
  summary: SummarySpec;
  // A wrapped line belongs to the row above it within this distance. Expressed in the
  // same units as `y`; both layouts print continuations closer to their row than the next
  // row is.
  detailTolerance: number;
};

// ---------------------------------------------------------------------------
// Descriptors
// ---------------------------------------------------------------------------

export const SCB_LAYOUT: LayoutDescriptor = {
  contractVersion: "scb-layout-v1",
  bankCode: "SCB",
  headingAnchors: [
    /^Date$/iu,
    /^Time$/iu,
    /^Code$/iu,
    /^Channel$/iu,
    /^Debit\s*\/\s*Credit$/iu,
    /^Balance\s*\/\s*Baht$/iu,
    /^Description\s*\/\s*Note$/iu
  ],
  headingLinesAbove: 0,
  headingLinesBelow: 1,
  currencyMarker: /\bBaht\b|บาท|\bTHB\b/iu,
  dateSeparator: "/",
  // `dd/dd/dd dd:dd`, a two-character code, then the channel name.
  leadingFields: [
    { kind: "dateTime" },
    { kind: "text", field: "code" },
    { kind: "text", field: "channel", absorb: true }
  ],
  // The literal `DESC :` marks the description on the row line and on its continuation,
  // which is how a continuation is recognised without relying on proximity alone.
  trailingFields: [
    { kind: "literal", pattern: /^DESC\s*:$/iu },
    { kind: "text", field: "description", absorb: true }
  ],
  rowFields: { transactionLabel: "channel", description: "description", reference: "code", branch: null },
  carryForwardLabel: /Balance\s+Brought\s+Forward|ยอดยกมา/iu,
  frameLabels: {
    accountNumber: /^(เลขที่บัญชี|Account\s*Number|Account\s*No\.?)$/iu,
    // No closing balance is printed anywhere, so it is derived from the last row exactly
    // as D-026 forced for Krungthai.
    closingBalance: null
  },
  summary: {
    encoding: "counts-on-own-line",
    region: "last-page-below-grid",
    withdrawalTotal: /^TOTAL\s+AMOUNTS?\s*\(\s*Debit\s*\)$/iu,
    depositTotal: /^TOTAL\s+AMOUNTS?\s*\(\s*Credit\s*\)$/iu,
    itemCounts: /^TOTAL\s+ITEMS?$/iu
  },
  detailTolerance: 14
};

export const KBANK_LAYOUT: LayoutDescriptor = {
  contractVersion: "kbank-layout-v1",
  bankCode: "KBANK",
  headingAnchors: [
    /^Date$/iu,
    /^Descriptions?$/iu,
    /^Withdrawal\s*\/\s*Deposit$/iu,
    /^Channel$/iu,
    /^Details?$/iu
  ],
  // `Date/` and `Outstanding Balance` above, `Trn.Time` and `(THB)` below. Anchoring on
  // the main line alone leaves the balance column inside the `Withdrawal / Deposit` band.
  headingLinesAbove: 1,
  headingLinesBelow: 1,
  currencyMarker: /\(\s*THB\s*\)|\bTHB\b|บาท/iu,
  dateSeparator: "-",
  leadingFields: [
    { kind: "date" },
    { kind: "time" },
    { kind: "text", field: "description", absorb: true }
  ],
  trailingFields: [
    { kind: "text", field: "channel", optional: true },
    { kind: "text", field: "details", optional: true, absorb: true }
  ],
  rowFields: { transactionLabel: "description", description: "details", reference: null, branch: "channel" },
  carryForwardLabel: /Beginning\s+Balance|ยอดยกมา/iu,
  frameLabels: {
    accountNumber: /^(Account\s*Number|Account\s*No\.?|เลขที่บัญชี)$/iu,
    closingBalance: /^(Ending\s+Balance|ยอดยกไป)$/iu
  },
  summary: {
    encoding: "count-inside-label",
    region: "first-page-above-grid",
    withdrawal: /^Total\s+Withdrawals?\s+(\d{1,9})\s+items?$/iu,
    deposit: /^Total\s+Deposits?\s+(\d{1,9})\s+items?$/iu
  },
  detailTolerance: 14
};

export const LAYOUTS: readonly LayoutDescriptor[] = [SCB_LAYOUT, KBANK_LAYOUT];

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

type Failure = { code: LayoutErrorCode; message: string };

// A row as read off the page, before its direction is known. Direction cannot be decided
// here: the printed figure is unsigned and the column it sits in is one of two that share
// a heading, so it takes the balance chain to say which (D-039).
type DraftRow = {
  page: number;
  row: number;
  printedDateTime: string;
  sourceDate: string;
  sourceTime: string | null;
  text: Partial<Record<TextField, string>>;
  amount: bigint;
  balance: MinorUnitString;
  amountRightEdge: number;
};

function textOf(runs: readonly TextItem[]): string {
  return runs.map((run) => run.str.trim()).join(" ").replace(/\s+/gu, " ").trim();
}

function labelText(item: TextItem): string {
  return item.str.replace(/\s+/gu, " ").trim();
}

function isMoney(item: TextItem): boolean {
  return MONEY_PATTERN.test(labelText(item));
}

// Every rejection reports the whole line reduced to shapes. maskShape turns digits into
// `d` and letters and marks into `x`, so a format mismatch is diagnosable on this device
// without any figure or counterparty leaving it — the property that let a real Krungthai
// statement be debugged over ten reads without an agent seeing one.
function describeLine(runs: readonly TextItem[]): string {
  return runs.map((run) => `[${maskShape(run.str.trim())}]`).join(" ");
}

function locate(page: number, row: number | null): string {
  return `Page ${page} row ${row ?? "—"}: `;
}

// ---------------------------------------------------------------------------
// The heading block
// ---------------------------------------------------------------------------

type Heading = {
  // The topmost line of the block: the frame sits above this.
  frameBottom: number;
  // The bottommost line of the block: rows sit below this.
  gridTop: number;
  lines: TextItem[][];
};

function findHeading(descriptor: LayoutDescriptor, lines: readonly TextItem[][]): Heading | null {
  for (const [index, line] of lines.entries()) {
    const matched = descriptor.headingAnchors.every((anchor) =>
      line.some((item) => anchor.test(labelText(item))));
    if (!matched) continue;
    // `groupIntoLines` returns lines top to bottom, so a lower index is a higher `y`.
    const first = Math.max(0, index - descriptor.headingLinesAbove);
    const last = Math.min(lines.length - 1, index + descriptor.headingLinesBelow);
    const block = lines.slice(first, last + 1);
    return { frameBottom: block[0]![0]!.y, gridTop: block[block.length - 1]![0]!.y, lines: block };
  }
  return null;
}

// ---------------------------------------------------------------------------
// The frame
// ---------------------------------------------------------------------------

type FrameDraft = {
  accountLastFour: string;
  periodStart: string;
  periodEnd: string;
  era: StatementEra;
  periodEndYear: number;
  closingBalance: MinorUnitString | null;
};

function extractFrame(
  descriptor: LayoutDescriptor,
  lines: readonly TextItem[][],
  heading: Heading
): { ok: true; frame: FrameDraft } | { ok: false; code: LayoutErrorCode; message: string } {
  const frameLines = lines.filter((line) => line[0]!.y > heading.frameBottom + LINE_TOLERANCE);

  // The currency is read from the heading block, not the frame. Neither layout states it
  // in the frame at all, so keeping D-034's guard where Krungthai has it would reject
  // every statement — and dropping it would let a statement in another currency import
  // as THB, which is the failure the guard exists for. It is printed on the very column
  // it denominates, which is a stronger place than the frame (D-040).
  const headingText = heading.lines.flat().map((item) => item.str).join(" ");
  if (!descriptor.currencyMarker.test(headingText)) {
    return {
      ok: false,
      code: "UNSUPPORTED_CURRENCY",
      message: "The statement's column headings do not state THB, so its currency cannot be confirmed."
    };
  }

  // The period is found by its printed shape rather than by a label. Both layouts print
  // exactly one four-digit-year date range above the grid, and SCB's label for it is the
  // bare Thai word for "date" — matching on that wording alone would be far weaker than
  // matching on a shape nothing else in the block has.
  //
  // The separator here is deliberately *not* `descriptor.dateSeparator`. A layout's frame
  // and its rows do not have to agree, and KBANK's do not: its rows print `dd-dd-dd` and
  // its frame prints `dd/dd/dddd - dd/dd/dddd`. Threading the row separator through to
  // the frame made every KBANK statement report a missing period.
  const periods = frameLines
    .map((line) => PERIOD_PATTERN.exec(textOf(line)))
    .filter((match): match is RegExpExecArray => match !== null);
  if (periods.length !== 1) {
    return {
      ok: false,
      code: periods.length === 0 ? "MISSING_FRAME_FIELD" : "INVALID_FRAME_CONTENT",
      message: periods.length === 0
        ? "The statement frame prints no period as a four-digit-year date range."
        : `The statement frame prints ${periods.length} period-shaped date ranges, so the period is ambiguous.`
    };
  }
  const [, startDay, , startMonth, startYear, endDay, endMonth, endYear] = periods[0]!;

  // The era is a determination, not an inference: a four-digit year is either side of the
  // 543-year gap unambiguously. This is why neither of these layouts can reproduce D-031,
  // which read two-digit Gregorian years as Buddhist and dated a whole statement to 1983.
  const printedEndYear = Number(endYear);
  const era: StatementEra = printedEndYear >= PERIOD_YEAR_BUDDHIST_FLOOR ? "buddhist" : "gregorian";
  const shift = era === "buddhist" ? 543 : 0;
  const periodStart = toIsoDate(Number(startYear) - shift, Number(startMonth), Number(startDay));
  const periodEnd = toIsoDate(printedEndYear - shift, Number(endMonth), Number(endDay));
  if (!periodStart || !periodEnd) {
    return { ok: false, code: "INVALID_FRAME_CONTENT", message: "The statement period is not a real calendar range." };
  }
  if (periodStart > periodEnd) {
    return { ok: false, code: "INVALID_FRAME_CONTENT", message: "The statement period starts after it ends." };
  }

  // A label's value is the single run printed immediately to its right, never everything
  // to its right. An unbounded slice swept the following field's digits into the account
  // number on a real Krungthai statement and silently produced the wrong last four
  // (D-026); taking exactly one run cannot.
  const runAfter = (label: RegExp): TextItem | null => {
    for (const line of frameLines) {
      const index = line.findIndex((item) => label.test(labelText(item)));
      if (index !== -1 && line[index + 1]) return line[index + 1]!;
    }
    return null;
  };

  const accountRun = runAfter(descriptor.frameLabels.accountNumber);
  if (!accountRun) {
    return { ok: false, code: "MISSING_FRAME_FIELD", message: "The statement frame has no account number." };
  }
  const accountText = labelText(accountRun);
  // Grouped digits, in any grouping: SCB prints `ddd-dddddd-d` and KBANK `ddd-d-ddddd-d`,
  // so the shape must not be pinned to either.
  if (!/^\d[\d-]{4,}\d$/u.test(accountText)) {
    return {
      ok: false,
      code: "INVALID_FRAME_CONTENT",
      message: `The statement frame has an unreadable account number, shape ${maskShape(accountText)}.`
    };
  }
  const digits = accountText.replace(/\D/gu, "");
  if (digits.length < 4) {
    return { ok: false, code: "INVALID_FRAME_CONTENT", message: "The statement frame has too short an account number." };
  }

  let closingBalance: MinorUnitString | null = null;
  if (descriptor.frameLabels.closingBalance) {
    const run = runAfter(descriptor.frameLabels.closingBalance);
    if (run) {
      try { closingBalance = parseThb(labelText(run)).minor; }
      catch {
        return {
          ok: false,
          code: "INVALID_FRAME_CONTENT",
          message: `The statement frame has an unreadable closing balance, shape ${maskShape(labelText(run))}.`
        };
      }
    }
  }

  return {
    ok: true,
    frame: {
      accountLastFour: digits.slice(-4),
      periodStart,
      periodEnd,
      era,
      periodEndYear: printedEndYear - shift,
      closingBalance
    }
  };
}

// Rejects dates that are not real calendar dates; `Date` rolls 31/02 over silently.
function toIsoDate(year: number, month: number, day: number): string | null {
  if (!Number.isInteger(year) || year < 1 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const iso = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const asDate = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(asDate.getTime())) return null;
  if (asDate.getUTCFullYear() !== year || asDate.getUTCMonth() + 1 !== month || asDate.getUTCDate() !== day) return null;
  return iso;
}

// ---------------------------------------------------------------------------
// The row grammar
// ---------------------------------------------------------------------------

type GrammarMatch = {
  text: Partial<Record<TextField, string>>;
  day: string;
  month: string;
  shortYear: string;
  time: string | null;
  // The date and time exactly as printed, kept for row provenance so a later question
  // about how a date was read is answerable from the ledger rather than by reopening the
  // document.
  printed: string;
};

// Matches a segment of a row's runs against an ordered list of field specs. The last
// text field may absorb any surplus, so a description pdf.js happened to split into two
// runs joins rather than shifting every field after it by one.
function matchSegment(
  descriptor: LayoutDescriptor,
  runs: readonly TextItem[],
  specs: readonly FieldSpec[],
  into: GrammarMatch
): boolean {
  const datePattern = descriptor.dateSeparator === "/"
    ? /^(\d{2})\/(\d{2})\/(\d{2})$/
    : /^(\d{2})-(\d{2})-(\d{2})$/;
  const dateTimePattern = descriptor.dateSeparator === "/"
    ? /^(\d{2})\/(\d{2})\/(\d{2})\s+(([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?)$/
    : /^(\d{2})-(\d{2})-(\d{2})\s+(([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?)$/;

  let index = 0;
  for (const [specIndex, spec] of specs.entries()) {
    const run = runs[index];
    const text = run ? labelText(run) : null;
    switch (spec.kind) {
      case "dateTime": {
        const match = text === null ? null : dateTimePattern.exec(text);
        if (!match) return false;
        into.day = match[1]!;
        into.month = match[2]!;
        into.shortYear = match[3]!;
        into.time = match[4]!;
        into.printed = text!;
        index += 1;
        break;
      }
      case "date": {
        const match = text === null ? null : datePattern.exec(text);
        if (!match) return false;
        into.day = match[1]!;
        into.month = match[2]!;
        into.shortYear = match[3]!;
        into.printed = text!;
        index += 1;
        break;
      }
      case "time": {
        if (text === null || !TIME_PATTERN.test(text)) return false;
        into.time = text;
        into.printed = `${into.printed} ${text}`.trim();
        index += 1;
        break;
      }
      case "literal": {
        if (text === null || !spec.pattern.test(text)) return false;
        index += 1;
        break;
      }
      case "text": {
        // The last spec of the segment takes everything left; otherwise one run.
        const isLast = specIndex === specs.length - 1;
        const taken = spec.absorb && isLast ? runs.slice(index) : runs.slice(index, index + 1);
        if (taken.length === 0) {
          if (spec.optional) break;
          return false;
        }
        // A money-shaped or date-shaped run is never text. Refusing it here is what keeps
        // a third figure on the line from being absorbed into a description instead of
        // failing closed.
        if (taken.some((item) => isMoney(item))) return false;
        into.text[spec.field] = textOf(taken);
        index += taken.length;
        break;
      }
    }
  }
  return index === runs.length;
}

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------

type PageSummary = { lines: TextItem[][]; heading: Heading };

export function extractWithLayout(descriptor: LayoutDescriptor, pages: readonly PageText[]): LayoutResult {
  const failures: Failure[] = [];
  const drafts: DraftRow[] = [];
  let frame: FrameDraft | null = null;
  let firstPage: PageSummary | null = null;
  let lastPage: PageSummary | null = null;
  // The brought-forward figure at the top of each page. Page one's is the statement's
  // opening balance; every later page's is a carry-forward that must equal the previous
  // page's last balance, which the statement gives away for free (D-039).
  let openingBalance: MinorUnitString | null = null;
  let runningBalance: MinorUnitString | null = null;

  for (const [pageIndex, page] of pages.entries()) {
    const pageNumber = pageIndex + 1;
    const lines = groupIntoLines(page);
    const heading = findHeading(descriptor, lines);
    if (!heading) {
      return {
        ok: false,
        code: "MISSING_COLUMN_ANCHOR",
        message: `Page ${pageNumber} has no line carrying every required column heading.`
      };
    }
    const summaryPage: PageSummary = { lines, heading };
    if (pageIndex === 0) firstPage = summaryPage;
    lastPage = summaryPage;

    if (pageIndex === 0) {
      const extracted = extractFrame(descriptor, lines, heading);
      if (!extracted.ok) return extracted;
      frame = extracted.frame;
    }

    let current: { draft: DraftRow; y: number; runs: TextItem[] } | null = null;
    let rowNumber = 0;
    let pastGrid = false;

    for (const line of lines) {
      if (line[0]!.y >= heading.gridTop - LINE_TOLERANCE) continue; // the heading and everything above it
      if (pastGrid) continue;

      // A summary label ends the grid. Recognising it explicitly matters because SCB
      // prints its block in the row region: a statement whose block sits within
      // `detailTolerance` of the last row would otherwise merge its totals into that row.
      if (isSummaryLine(descriptor, line)) {
        current = null;
        pastGrid = true;
        continue;
      }

      // The brought-forward pseudo-row. Checked before anything else because KBANK's
      // leads with a date exactly as a transaction does, so shape alone cannot tell them
      // apart — the label can.
      if (line.some((item) => descriptor.carryForwardLabel.test(labelText(item)))) {
        const printed = line.filter(isMoney);
        if (printed.length !== 1) {
          failures.push({
            code: "INVALID_ROW_CONTENT",
            message: `${locate(pageNumber, null)}the brought-forward line carries ${printed.length} figures, not one. ${describeLine(line)}`
          });
          current = null;
          continue;
        }
        let carried: MinorUnitString;
        try { carried = parseThb(labelText(printed[0]!)).minor; }
        catch {
          failures.push({
            code: "INVALID_ROW_CONTENT",
            message: `${locate(pageNumber, null)}the brought-forward figure is unparsable. ${describeLine(line)}`
          });
          current = null;
          continue;
        }
        if (openingBalance === null) {
          // The first brought-forward line is the statement's opening balance, and it can
          // only be that if no row has been read yet. A statement that prints its first
          // one below a transaction is not one this reader understands, and treating a
          // mid-statement carry-forward as the opening would silently rebase the whole
          // balance chain.
          if (drafts.length > 0) {
            return {
              ok: false,
              code: "MISSING_FRAME_FIELD",
              message: `Page ${pageNumber} prints a brought-forward balance below a transaction, so the statement's opening balance is not established.`
            };
          }
          openingBalance = carried;
          runningBalance = carried;
        } else if (runningBalance !== null && carried !== runningBalance) {
          // Free, and worth taking: the bank has restated the running balance at the top
          // of the page, so a row dropped on the previous page shows up here rather than
          // silently reducing the import.
          return {
            ok: false,
            code: "CARRY_FORWARD_MISMATCH",
            message:
              `Page ${pageNumber} carries a balance forward that does not match the previous page's last balance; ` +
              `the gap is ${maskShape(formatThb(absoluteGap(carried, runningBalance)))}.`
          };
        }
        current = null;
        continue;
      }

      const money = line.filter(isMoney);
      if (money.length === 2) {
        const parsed = readRow(descriptor, line, money, frame!, pageNumber, rowNumber + 1);
        if (!parsed.ok) {
          failures.push({ code: parsed.code, message: parsed.message });
          current = null;
          continue;
        }
        rowNumber += 1;
        drafts.push(parsed.draft);
        current = { draft: parsed.draft, y: line[0]!.y, runs: line };
        continue;
      }

      // Not a row and not a brought-forward line. Either a wrapped continuation of the
      // row above it, or page furniture below the grid.
      if (!current) continue;
      if (current.y - line[0]!.y > descriptor.detailTolerance) {
        current = null;
        continue;
      }
      if (money.length > 0) {
        // A continuation must not carry a figure: that would be a row this reader failed
        // to recognise, and folding it into the row above would lose a transaction.
        failures.push({
          code: "AMBIGUOUS_ROW_GEOMETRY",
          message: `${locate(pageNumber, current.draft.row)}a wrapped line carries a figure, so it is not a continuation. ${describeLine(line)}`
        });
        current = null;
        continue;
      }
      mergeContinuation(descriptor, current.draft, current.runs, line);
    }

    // The running balance at the end of a page is the last row read on it.
    const lastOnPage = drafts[drafts.length - 1];
    if (lastOnPage) runningBalance = lastOnPage.balance;
  }

  if (!frame || !firstPage || !lastPage) {
    return { ok: false, code: "MISSING_FRAME_FIELD", message: "The statement has no readable frame." };
  }
  if (failures.length > 0) return summarizeFailures(failures);
  if (drafts.length === 0) {
    return { ok: false, code: "INVALID_ROW_CONTENT", message: "The statement has no readable rows." };
  }
  if (openingBalance === null) {
    // Both layouts print it, so its absence means the reader did not find the block it
    // was told to find — never that the opening may be derived. Deriving it would define
    // away the very check D-026 gave up on Krungthai and D-033 later restored.
    return {
      ok: false,
      code: "MISSING_FRAME_FIELD",
      message: "The statement prints no brought-forward balance, so the opening balance cannot be established."
    };
  }

  const directed = assignDirections(drafts, openingBalance);
  if (!directed.ok) return directed;

  const geometry = verifyMoneyColumns(directed.rows);
  if (geometry) return geometry;

  const rows = directed.rows.map((row) => toCandidate(descriptor, row, frame!));
  const outOfPeriod = rows.filter((row) => row.sourceDate < frame!.periodStart || row.sourceDate > frame!.periodEnd);
  if (outOfPeriod.length > 0) {
    // The era is determined from a four-digit year, so this cannot be D-031 — but it is
    // the check that would have caught D-031, and it costs nothing to keep.
    return {
      ok: false,
      code: "INVALID_ROW_CONTENT",
      message: `${outOfPeriod.length} row${outOfPeriod.length === 1 ? " dates" : "s date"} outside the statement period.`
    };
  }

  const summaryRegion = descriptor.summary.region === "last-page-below-grid"
    ? lastPage.lines.filter((line) => line[0]!.y < lastPage!.heading.gridTop - LINE_TOLERANCE)
    : firstPage.lines.filter((line) => line[0]!.y > firstPage!.heading.frameBottom + LINE_TOLERANCE);
  const totals = extractTotals(descriptor, summaryRegion);
  if (!totals.ok) return totals;
  const mismatch = verifyTotals(totals.totals, directed.rows);
  if (mismatch) return mismatch;
  // Strict on purpose: a partially read block confirms part of the parse, and reporting
  // that as "cross-checked" would overstate it. All four per-direction figures, or nothing.
  const crossChecked = totals.totals.withdrawalCount !== null && totals.totals.withdrawalTotal !== null
    && totals.totals.depositCount !== null && totals.totals.depositTotal !== null;

  const lastPrinted = rows[rows.length - 1]!.postBalance.minor;
  if (frame.closingBalance !== null && lastPrinted !== frame.closingBalance) {
    return {
      ok: false,
      code: "CLOSING_BALANCE_MISMATCH",
      message: "The final row balance does not match the printed closing balance."
    };
  }

  const statementFrame: StatementFrame = {
    bankCode: descriptor.bankCode,
    contractVersion: descriptor.contractVersion,
    accountType: null,
    accountLastFour: frame.accountLastFour,
    periodStart: frame.periodStart,
    periodEnd: frame.periodEnd,
    openingBalance,
    closingBalance: frame.closingBalance ?? lastPrinted,
    currency: "THB",
    // The opening is printed in both layouts, so unlike Krungthai it is never derived.
    // The closing is printed only by KBANK.
    balancesPrinted: frame.closingBalance !== null,
    crossChecked
  };

  return { ok: true, frame: statementFrame, rows };
}

function absoluteGap(left: MinorUnitString, right: MinorUnitString): MinorUnitString {
  const gap = BigInt(left) - BigInt(right);
  return ((gap < 0n ? -gap : gap).toString()) as MinorUnitString;
}

function isSummaryLine(descriptor: LayoutDescriptor, line: readonly TextItem[]): boolean {
  const patterns = descriptor.summary.encoding === "counts-on-own-line"
    ? [descriptor.summary.withdrawalTotal, descriptor.summary.depositTotal, descriptor.summary.itemCounts]
    : [descriptor.summary.withdrawal, descriptor.summary.deposit];
  return line.some((item) => patterns.some((pattern) => pattern.test(labelText(item))));
}

function readRow(
  descriptor: LayoutDescriptor,
  line: readonly TextItem[],
  money: readonly TextItem[],
  frame: FrameDraft,
  page: number,
  row: number
): { ok: true; draft: DraftRow } | { ok: false; code: LayoutErrorCode; message: string } {
  const invalid = (reason: string): { ok: false; code: LayoutErrorCode; message: string } =>
    ({ ok: false, code: "INVALID_ROW_CONTENT", message: `${locate(page, row)}${reason} ${describeLine(line)}` });

  // The two money runs split the line into what comes before them and what comes after.
  // The amount is the left one and the balance the right one — both layouts print the
  // balance rightmost of the two, which the masked dumps confirm on every row.
  const [amountRun, balanceRun] = money;
  const firstIndex = line.indexOf(amountRun!);
  const secondIndex = line.indexOf(balanceRun!);
  if (firstIndex === -1 || secondIndex === -1 || secondIndex !== firstIndex + 1) {
    return invalid("the two figures on this row are not adjacent, so amount and balance cannot be told apart.");
  }

  const match: GrammarMatch = { text: {}, day: "", month: "", shortYear: "", time: null, printed: "" };
  if (!matchSegment(descriptor, line.slice(0, firstIndex), descriptor.leadingFields, match)) {
    return invalid("the runs before the figures do not match this layout's row grammar.");
  }
  if (!matchSegment(descriptor, line.slice(secondIndex + 1), descriptor.trailingFields, match)) {
    return invalid("the runs after the figures do not match this layout's row grammar.");
  }

  let amount: bigint;
  let balance: MinorUnitString;
  try {
    amount = BigInt(parseThb(labelText(amountRun!)).minor);
    balance = parseThb(labelText(balanceRun!)).minor;
  } catch {
    return invalid("a figure on this row is unparsable.");
  }
  // Both layouts print their amounts unsigned; a sign would mean direction is encoded
  // some other way, and reading a credit as a debit would invert a real transaction.
  if (amount < 0n) return invalid("the amount is printed with a sign, which this layout does not use.");
  if (amount === 0n) return invalid("the row prints a zero amount, so nothing moved.");

  // Two-digit row years resolve against the four-digit year the frame printed, in the era
  // that year determined — never re-derived per row, so one file can never be read half in
  // one calendar and half in the other (D-031).
  const year = gregorianYearFrom(Number(match.shortYear), frame.periodEndYear, frame.era);
  const sourceDate = toIsoDate(year, Number(match.month), Number(match.day));
  if (!sourceDate) return invalid("the row's date is not a real calendar date.");

  return {
    ok: true,
    draft: {
      page,
      row,
      printedDateTime: match.printed,
      sourceDate,
      sourceTime: match.time,
      text: match.text,
      amount,
      balance,
      amountRightEdge: rightEdgeOf(amountRun!)
    }
  };
}

// A wrapped line's runs join the field of the parent row whose own run is nearest in x.
// Bands would be wrong here for the same reason they are wrong for the row itself, and
// nearest-run is exactly what "printed under" means on a page.
function mergeContinuation(
  descriptor: LayoutDescriptor,
  draft: DraftRow,
  parentRuns: readonly TextItem[],
  line: readonly TextItem[]
): void {
  const literals = [...descriptor.leadingFields, ...descriptor.trailingFields]
    .filter((spec): spec is Extract<FieldSpec, { kind: "literal" }> => spec.kind === "literal");
  // Which parent run carries which text field, so a continuation can be attributed.
  const anchors: Array<{ field: TextField; x: number }> = [];
  for (const field of ["code", "channel", "description", "details"] as const) {
    const value = draft.text[field];
    if (!value) continue;
    const owner = parentRuns.find((run) => value.startsWith(labelText(run)) && !isMoney(run));
    if (owner) anchors.push({ field, x: owner.x });
  }
  if (anchors.length === 0) return;

  for (const run of line) {
    const text = labelText(run);
    if (!text || literals.some((spec) => spec.pattern.test(text))) continue;
    const nearest = anchors.reduce((best, candidate) =>
      Math.abs(candidate.x - run.x) < Math.abs(best.x - run.x) ? candidate : best);
    draft.text[nearest.field] = `${draft.text[nearest.field] ?? ""} ${text}`.replace(/\s+/gu, " ").trim();
  }
}

// ---------------------------------------------------------------------------
// Direction: arithmetic first, geometry as the cross-check
// ---------------------------------------------------------------------------

type DirectedRow = DraftRow & { kind: "withdrawal" | "deposit" };

// Both layouts print one unsigned figure per row in one of two right-aligned sub-columns
// that share a heading, so nothing on the row itself says which direction it is. The
// statement's own running balance does, exactly: the delta from the previous balance is
// either +amount or −amount and cannot be both, since a zero amount is already refused.
//
// This is arithmetic on printed values rather than a guessed coordinate, and it fails
// closed the moment the two disagree — which is also how a dropped or misread row shows
// up, because the chain stops closing.
function assignDirections(
  drafts: readonly DraftRow[],
  openingBalance: MinorUnitString
): { ok: true; rows: DirectedRow[] } | { ok: false; code: LayoutErrorCode; message: string } {
  const rows: DirectedRow[] = [];
  let previous = BigInt(openingBalance);
  for (const draft of drafts) {
    const delta = BigInt(draft.balance) - previous;
    let kind: "withdrawal" | "deposit";
    if (delta === draft.amount) kind = "deposit";
    else if (delta === -draft.amount) kind = "withdrawal";
    else {
      return {
        ok: false,
        code: "AMBIGUOUS_ROW_DIRECTION",
        message:
          `${locate(draft.page, draft.row)}the printed balance moves by an amount this row does not state, ` +
          `so its direction cannot be determined. The unexplained gap is ` +
          `${maskShape(formatThb(((delta - draft.amount) < 0n ? -(delta - draft.amount) : (delta - draft.amount)).toString() as MinorUnitString))}.`
      };
    }
    rows.push({ ...draft, kind });
    previous = BigInt(draft.balance);
  }
  return { ok: true, rows };
}

// The geometric half of the cross-check. Each direction must occupy one tight cluster of
// right edges, and the two clusters must be distinct — that is what "two right-aligned
// sub-columns under one heading" means, and it is the fact the first draft of both layout
// contracts missed (D-039). Withdrawals sit left of deposits, matching the order both
// headings name them in (`Debit/Credit`, `Withdrawal / Deposit`).
//
// This is redundant with the balance chain by construction, and deliberately kept: it is
// the check that catches the reader picking the wrong run as the balance, which is the
// shape of the one Krungthai defect that did not fail closed (D-030).
function verifyMoneyColumns(rows: readonly DirectedRow[]): LayoutResult | null {
  const edges = (kind: "withdrawal" | "deposit") =>
    rows.filter((row) => row.kind === kind).map((row) => row.amountRightEdge);
  const mismatch = (message: string): LayoutResult => ({ ok: false, code: "AMBIGUOUS_ROW_GEOMETRY", message });

  const spans: Partial<Record<"withdrawal" | "deposit", { min: number; max: number }>> = {};
  for (const kind of ["withdrawal", "deposit"] as const) {
    const found = edges(kind);
    if (found.length === 0) continue;
    const min = Math.min(...found);
    const max = Math.max(...found);
    if (max - min > COLUMN_EDGE_TOLERANCE) {
      return mismatch(
        `The ${kind} figures do not share one right-aligned column, so the layout's two money columns ` +
        `cannot be told apart. ${found.length} figures span ${Math.round(max - min)} units.`
      );
    }
    spans[kind] = { min, max };
  }

  // A statement carrying only one direction has nothing to separate, and its counterpart
  // count in the summary block will be zero.
  if (!spans.withdrawal || !spans.deposit) return null;
  if (spans.deposit.min - spans.withdrawal.max <= COLUMN_EDGE_TOLERANCE) {
    return mismatch(
      "Withdrawals and deposits are printed in the same column, so the direction read from the balance chain " +
      "is not confirmed by the layout."
    );
  }
  return null;
}

// ---------------------------------------------------------------------------
// The statement's own totals
// ---------------------------------------------------------------------------

type StatementTotals = {
  withdrawalCount: number | null;
  withdrawalTotal: MinorUnitString | null;
  depositCount: number | null;
  depositTotal: MinorUnitString | null;
};

function extractTotals(
  descriptor: LayoutDescriptor,
  lines: readonly TextItem[][]
): { ok: true; totals: StatementTotals } | { ok: false; code: LayoutErrorCode; message: string } {
  const unreadable = (): { ok: false; code: LayoutErrorCode; message: string } => ({
    ok: false,
    code: "SUMMARY_MISMATCH",
    message: "The statement prints a summary block whose counts or totals could not be read, so the import cannot be cross-checked."
  });

  const runAfter = (pattern: RegExp): TextItem[] | null => {
    for (const line of lines) {
      const index = line.findIndex((item) => pattern.test(labelText(item)));
      if (index !== -1) return line.slice(index + 1);
    }
    return null;
  };

  try {
    if (descriptor.summary.encoding === "count-inside-label") {
      // KBANK prints `Total Withdrawal <n> items` as one run, so the count is read out of
      // the label's own text and the amount is the run after it.
      const read = (pattern: RegExp): { count: number; total: MinorUnitString } | null => {
        for (const line of lines) {
          for (const [index, item] of line.entries()) {
            const match = pattern.exec(labelText(item));
            if (!match) continue;
            const amount = line[index + 1];
            if (!amount) throw new Error("missing summary total");
            return { count: Number(match[1]), total: parseThb(labelText(amount)).minor };
          }
        }
        return null;
      };
      const withdrawal = read(descriptor.summary.withdrawal);
      const deposit = read(descriptor.summary.deposit);
      return {
        ok: true,
        totals: {
          withdrawalCount: withdrawal?.count ?? null,
          withdrawalTotal: withdrawal?.total ?? null,
          depositCount: deposit?.count ?? null,
          depositTotal: deposit?.total ?? null
        }
      };
    }

    // SCB prints the two amounts on their own labelled lines and both counts on a third,
    // right-aligned on the same two money columns as the rows.
    const totalOf = (pattern: RegExp): MinorUnitString | null => {
      const rest = runAfter(pattern);
      if (!rest) return null;
      const text = rest[0]?.str.trim();
      if (!text) throw new Error("missing summary total");
      return parseThb(text).minor;
    };
    const counts = runAfter(descriptor.summary.itemCounts);
    if (counts !== null && counts.length !== 2) throw new Error("unreadable summary counts");
    const readCount = (index: number): number | null => {
      if (!counts) return null;
      const text = (counts[index]?.str ?? "").replace(/,/gu, "").trim();
      if (!/^\d{1,9}$/.test(text)) throw new Error("unreadable summary count");
      return Number(text);
    };
    return {
      ok: true,
      totals: {
        withdrawalCount: readCount(0),
        withdrawalTotal: totalOf(descriptor.summary.withdrawalTotal),
        depositCount: readCount(1),
        depositTotal: totalOf(descriptor.summary.depositTotal)
      }
    };
  } catch {
    return unreadable();
  }
}

// The statement's own arithmetic, and the only global check the reader has. A mismatch
// means the reader and the bank disagree about what the document contains, so it fails
// closed rather than warning: an append-only ledger cannot take back a dropped row
// (D-033). Counts are reported plainly — a row count is not a financial value — while a
// total mismatch reports only the masked shape of the gap.
function verifyTotals(totals: StatementTotals, rows: readonly DirectedRow[]): LayoutResult | null {
  const mismatch = (message: string): LayoutResult => ({ ok: false, code: "SUMMARY_MISMATCH", message });
  for (const kind of ["withdrawal", "deposit"] as const) {
    const printedCount = kind === "withdrawal" ? totals.withdrawalCount : totals.depositCount;
    const printedTotal = kind === "withdrawal" ? totals.withdrawalTotal : totals.depositTotal;
    const matching = rows.filter((row) => row.kind === kind);
    if (printedCount !== null && printedCount !== matching.length) {
      return mismatch(`The statement counts ${printedCount} ${kind} rows but the reader found ${matching.length}.`);
    }
    if (printedTotal !== null) {
      const magnitude = matching.reduce((sum, row) => sum + row.amount, 0n);
      const gap = BigInt(printedTotal) - magnitude;
      if (gap !== 0n) {
        return mismatch(
          `The statement's printed ${kind} total does not match the rows read; the gap is ` +
          `${maskShape(formatThb(((gap < 0n ? -gap : gap).toString()) as MinorUnitString))}.`
        );
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Assembly and failure reporting
// ---------------------------------------------------------------------------

function toCandidate(descriptor: LayoutDescriptor, row: DirectedRow, frame: FrameDraft): SourceRowCandidate {
  const value = (field: TextField | null): string | null => field === null ? null : row.text[field]?.trim() || null;
  const transactionLabel = value(descriptor.rowFields.transactionLabel);
  const description = value(descriptor.rowFields.description);
  // Both are required by the import contract, and a layout may print only one of them on
  // a given row, so each falls back to the other rather than the row failing over a blank.
  const label = transactionLabel ?? description ?? "";
  const detail = description ?? transactionLabel ?? "";
  const magnitude = row.kind === "withdrawal" ? -row.amount : row.amount;

  return {
    sourceDate: row.sourceDate,
    sourceTime: row.sourceTime,
    effectiveDate: row.sourceDate,
    transactionLabel: label,
    description: detail,
    reference: value(descriptor.rowFields.reference),
    branch: value(descriptor.rowFields.branch),
    components: [{ kind: row.kind, amount: { minor: magnitude.toString() as MinorUnitString, currency: "THB" } }],
    postBalance: { minor: row.balance, currency: "THB" },
    provenance: {
      page: row.page,
      row: row.row,
      parserFields: {
        contractVersion: descriptor.contractVersion,
        printedDateTime: row.printedDateTime,
        // Which era the whole statement was read in, so a later question about a date is
        // answerable from the row rather than by re-reading the document.
        era: frame.era
      }
    }
  };
}

const MAX_REPORTED_FAILURE_CLASSES = 6;

// Groups failures by everything except which page and row they occurred on, so a defect
// repeating across 200 rows is reported once with a count. Every message is already fully
// masked, so grouping adds no disclosure. Reading a real Krungthai statement cost seven
// owner-driven runs because each surfaced one row and stopped (D-032).
function summarizeFailures(failures: readonly Failure[]): LayoutResult {
  const classes = new Map<string, { exemplar: string; count: number }>();
  for (const failure of failures) {
    const key = failure.message.replace(/^Page \d+ row (?:\d+|—): /u, "");
    const existing = classes.get(key);
    if (existing) existing.count += 1;
    else classes.set(key, { exemplar: failure.message, count: 1 });
  }
  const reported = [...classes.values()].slice(0, MAX_REPORTED_FAILURE_CLASSES);
  const omitted = classes.size - reported.length;
  const summary = reported.map(({ exemplar, count }) => count > 1 ? `${count}× ${exemplar}` : exemplar).join(" | ");

  return {
    ok: false,
    code: failures[0]!.code,
    message:
      `${failures.length} row${failures.length === 1 ? "" : "s"} could not be read` +
      `${classes.size > 1 ? `, in ${classes.size} distinct cases` : ""}. ${summary}` +
      `${omitted > 0 ? ` | and ${omitted} further case${omitted === 1 ? "" : "s"} not shown` : ""}`
  };
}

// Which descriptor-driven layout, if any, this document is printed in. A layout is
// identified by its heading anchor set appearing in full on one line of the first page —
// see the note on `LayoutDescriptor` for why that, and not a bank name.
//
// A document matching none of them is not attempted. The KBANK folder contained a
// bank-abbreviation glossary whose Thai and Chinese do not decode at all; it has no
// heading line, so it is refused rather than read, and guessing at it would have produced
// rows out of noise.
export function matchLayout(pages: readonly PageText[]): LayoutDescriptor | null {
  const lines = groupIntoLines(pages[0] ?? []);
  const matched = LAYOUTS.filter((descriptor) => findHeading(descriptor, lines) !== null);
  // Two layouts claiming one document would mean the heading sets are not as distinct as
  // the dumps say. Refusing is the only safe answer: picking either would decide which
  // bank issued a statement by tie-break.
  return matched.length === 1 ? matched[0]! : null;
}

export function extractStatement(pages: readonly PageText[]): LayoutResult {
  const descriptor = matchLayout(pages);
  if (!descriptor) {
    return {
      ok: false,
      code: "UNSUPPORTED_LAYOUT",
      message: "The first page carries no supported layout's column headings."
    };
  }
  return extractWithLayout(descriptor, pages);
}
