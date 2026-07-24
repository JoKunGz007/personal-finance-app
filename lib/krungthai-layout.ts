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
  | "INVALID_ROW_CONTENT";

export type LayoutResult =
  | { ok: true; rows: SourceRowCandidate[] }
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

export function extractStatement(pages: readonly PageText[], statementEndYear: number): LayoutResult {
  const firstPageText = (pages[0] ?? []).map((item) => item.str).join(" ").normalize("NFKC");
  if (!BANK_SIGNATURE.test(firstPageText)) {
    return { ok: false, code: "UNSUPPORTED_LAYOUT", message: "No Krungthai signature on the first page." };
  }

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
      const parsed = toRow(cells, statementEndYear, pageIndex + 1, rowIndex + 1);
      if (!parsed.ok) return parsed;
      rows.push(parsed.row);
    }
  }

  return { ok: true, rows };
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
