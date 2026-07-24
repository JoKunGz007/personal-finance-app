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
const COLUMN_ANCHORS = [
  { key: "date", pattern: /^(วันที่|Date)$/iu },
  { key: "time", pattern: /^(เวลา|Time)$/iu },
  { key: "description", pattern: /^(รายการ|Description)$/iu },
  { key: "withdrawal", pattern: /^(ถอนเงิน|Withdrawal)$/iu },
  { key: "deposit", pattern: /^(ฝากเงิน|Deposit)$/iu },
  { key: "balance", pattern: /^(ยอดคงเหลือ|Balance)$/iu },
  { key: "branch", pattern: /^(ช่องทาง|สาขา|Channel|Branch)$/iu }
] as const;

type ColumnKey = (typeof COLUMN_ANCHORS)[number]["key"];
type Columns = Record<ColumnKey, number>;

const DATE_PATTERN = /^(\d{2})\/(\d{2})\/(\d{2})$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;

// Frame labels live above the transaction heading line. Each value is read from
// the same printed line, to the right of its label.
const FRAME_LABELS = {
  accountType: /^(ประเภทบัญชี|Account type)$/iu,
  accountNumber: /^(เลขที่บัญชี|Account no\.?)$/iu,
  period: /^(ระหว่างวันที่|Period)$/iu,
  opening: /^(ยอดยกมา|Opening balance)$/iu,
  closing: /^(ยอดยกไป|Closing balance)$/iu
} as const;

const CURRENCY_MARKER = /\b(THB)\b|บาท/u;

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

function findColumns(lines: TextItem[][]): Columns | null {
  for (const line of lines) {
    const found: Partial<Columns> = {};
    for (const item of line) {
      const anchor = COLUMN_ANCHORS.find((candidate) => candidate.pattern.test(item.str.trim()));
      if (anchor) found[anchor.key] = item.x;
    }
    if (COLUMN_ANCHORS.every((anchor) => found[anchor.key] !== undefined)) return found as Columns;
  }
  return null;
}

// Reads the label/value block above the transaction grid on page one.
function extractFrame(lines: TextItem[][], headerY: number):
  { ok: true; frame: StatementFrame } | { ok: false; code: LayoutErrorCode; message: string } {
  const frameLines = lines.filter((line) => line[0]!.y > headerY + LINE_TOLERANCE);
  const frameText = frameLines.flat().map((item) => item.str).join(" ");

  if (!CURRENCY_MARKER.test(frameText)) {
    return { ok: false, code: "UNSUPPORTED_CURRENCY", message: "The statement frame does not state THB." };
  }

  // The value for a label is whatever is printed to its right on the same line.
  const valueFor = (label: RegExp): string | null => {
    for (const line of frameLines) {
      const index = line.findIndex((item) => label.test(item.str.trim()));
      if (index === -1) continue;
      const value = line.slice(index + 1).map((item) => item.str.trim()).join(" ").replace(/\s+/gu, " ").trim();
      return value || null;
    }
    return null;
  };

  const missing = (field: string) =>
    ({ ok: false as const, code: "MISSING_FRAME_FIELD" as const, message: `The statement frame has no ${field}.` });
  const invalid = (field: string) =>
    ({ ok: false as const, code: "INVALID_FRAME_CONTENT" as const, message: `The statement frame has an unreadable ${field}.` });

  const accountType = valueFor(FRAME_LABELS.accountType);
  if (!accountType) return missing("account type");

  const accountNumber = valueFor(FRAME_LABELS.accountNumber);
  if (!accountNumber) return missing("account number");
  const digits = accountNumber.replace(/\D/gu, "");
  if (digits.length < 4) return invalid("account number");
  const accountLastFour = digits.slice(-4);

  const periodText = valueFor(FRAME_LABELS.period);
  if (!periodText) return missing("statement period");
  const periodDates = periodText.match(/\d{2}\/\d{2}\/\d{2}/gu);
  if (!periodDates || periodDates.length !== 2) return invalid("statement period");

  // The period end year anchors every two-digit year in the statement, including
  // its own start date, so it is resolved first against its own printed value.
  const endParts = DATE_PATTERN.exec(periodDates[1]!)!;
  const endYear = resolveKrungthaiYear(Number(endParts[3]), new Date().getUTCFullYear());
  const periodEnd = toIsoDate(periodDates[1]!, endYear);
  const periodStart = toIsoDate(periodDates[0]!, endYear);
  if (!periodStart || !periodEnd) return invalid("statement period");
  if (periodStart > periodEnd) return invalid("statement period (start is after end)");

  const openingText = valueFor(FRAME_LABELS.opening);
  if (!openingText) return missing("opening balance");
  const closingText = valueFor(FRAME_LABELS.closing);
  if (!closingText) return missing("closing balance");

  let openingBalance: MinorUnitString;
  let closingBalance: MinorUnitString;
  try {
    openingBalance = parseThb(openingText).minor;
    closingBalance = parseThb(closingText).minor;
  } catch {
    return invalid("opening or closing balance");
  }

  return {
    ok: true,
    frame: {
      bankCode: "KTB",
      accountType,
      accountLastFour,
      periodStart,
      periodEnd,
      openingBalance,
      closingBalance,
      currency: "THB"
    }
  };
}

// Resolves a printed dd/mm/yy against an already-known year, rejecting dates that
// are not real calendar dates (Date silently rolls 31/02 over).
function toIsoDate(printed: string, year: number): string | null {
  const match = DATE_PATTERN.exec(printed);
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

  let frame: StatementFrame | null = null;
  const rows: SourceRowCandidate[] = [];

  for (const [pageIndex, page] of pages.entries()) {
    const lines = groupIntoLines(page);
    const columns = findColumns(lines);
    if (!columns) {
      return {
        ok: false,
        code: "MISSING_COLUMN_ANCHOR",
        message: `Page ${pageIndex + 1} has no line carrying every required column heading.`
      };
    }
    const headerY = lines.find((line) => line.some((item) =>
      COLUMN_ANCHORS.some((anchor) => anchor.pattern.test(item.str.trim()))))![0]!.y;

    // The frame is printed once, above the grid on page one.
    if (pageIndex === 0) {
      const extracted = extractFrame(lines, headerY);
      if (!extracted.ok) return extracted;
      frame = extracted.frame;
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

      const dateText = textOf(cells, "date");
      if (DATE_PATTERN.test(dateText)) {
        current = { cells, y: line[0]!.y };
        pageRows.push(cells);
        continue;
      }
      if (!current) continue; // stray text above the first row
      if (current.y - line[0]!.y > DETAIL_TOLERANCE) {
        current = null; // too far below to be a continuation; treat as footer
        continue;
      }
      if (dateText) {
        return {
          ok: false,
          code: "AMBIGUOUS_ROW_GEOMETRY",
          message: `Page ${pageIndex + 1} has a continuation line carrying an unparsable date cell.`
        };
      }
      for (const key of Object.keys(cells) as ColumnKey[]) {
        (current.cells[key] ??= []).push(...cells[key]!);
      }
    }

    for (const [rowIndex, cells] of pageRows.entries()) {
      // Two-digit row years resolve against the extracted period end, not the
      // current year, so a statement stays readable regardless of when it is parsed.
      const parsed = toRow(cells, Number(frame!.periodEnd.slice(0, 4)), pageIndex + 1, rowIndex + 1);
      if (!parsed.ok) return parsed;
      rows.push(parsed.row);
    }
  }

  if (!frame) {
    return { ok: false, code: "MISSING_FRAME_FIELD", message: "The statement has no readable frame." };
  }
  if (rows.length === 0) {
    return { ok: false, code: "INVALID_ROW_CONTENT", message: "The statement has no readable rows." };
  }

  // The printed closing balance must equal the last row's printed balance. A
  // mismatch means rows were dropped or misread, so nothing may be imported.
  const lastPrinted = rows[rows.length - 1]!.postBalance.minor;
  if (lastPrinted !== frame.closingBalance) {
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

  const dateMatch = DATE_PATTERN.exec(textOf(cells, "date"));
  if (!dateMatch) return invalid("unreadable date.");
  const [, day, month, shortYear] = dateMatch;
  const year = resolveKrungthaiYear(Number(shortYear), statementEndYear);
  const sourceDate = `${year}-${month}-${day}`;
  // Reject impossible calendar dates such as 31/02; Date rolls them over silently.
  const asDate = new Date(`${sourceDate}T00:00:00Z`);
  if (Number.isNaN(asDate.getTime()) || asDate.getUTCDate() !== Number(day) || asDate.getUTCMonth() + 1 !== Number(month)) {
    return invalid("date is not a real calendar date.");
  }

  const timeText = textOf(cells, "time");
  if (timeText && !TIME_PATTERN.test(timeText)) return invalid("unreadable time.");

  // The heading line is the label; any wrapped continuation is the description.
  const descriptionParts = cells.description ?? [];
  if (descriptionParts.length === 0) return invalid("no description text.");
  const transactionLabel = descriptionParts[0]!.trim();
  const description = descriptionParts.length > 1
    ? descriptionParts.slice(1).join(" ").replace(/\s+/gu, " ").trim()
    : transactionLabel;
  if (!transactionLabel || !description) return invalid("empty description text.");

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
    return invalid("unparsable money text.");
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
        parserFields: { contractVersion: "krungthai-layout-v1", printedDate: textOf(cells, "date") }
      }
    }
  };
}
