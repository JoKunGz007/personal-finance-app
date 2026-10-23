import { maskShape } from "@/lib/masked-diagnostics";
import { formatThb, type MinorUnitString } from "@/lib/money";
import type { LayoutErrorCode, LayoutResult } from "@/lib/statement-frame";

// The two checks every statement reader runs after its own geometry (D-295): the statement's
// printed totals against the rows read, and the batching of row failures into one result.
// Each reader builds the inputs from its own row shape; nothing here reads a page.

export type PrintedTotals = {
  withdrawalCount: number | null;
  withdrawalTotal: MinorUnitString | null;
  depositCount: number | null;
  depositTotal: MinorUnitString | null;
};

/** What the reader found for one direction: how many rows carry it, and their summed magnitude. */
export type DirectionTally = { readonly rows: number; readonly minor: bigint };

export type RowFailure = { code: LayoutErrorCode; message: string };

// The statement's own arithmetic, and the only global check a reader has. A mismatch means the
// reader and the bank disagree about what the document contains, so it fails closed rather than
// warning: an append-only ledger cannot take back a dropped row (D-033). Counts are reported
// plainly — a row count is not a financial value — while a total mismatch reports only the masked
// shape of the gap, which gives its order of magnitude without the figure.
export function verifyTotals(
  totals: PrintedTotals,
  read: Readonly<Record<"withdrawal" | "deposit", DirectionTally>>
): LayoutResult | null {
  const mismatch = (message: string): LayoutResult => ({ ok: false, code: "SUMMARY_MISMATCH", message });
  for (const kind of ["withdrawal", "deposit"] as const) {
    const printedCount = kind === "withdrawal" ? totals.withdrawalCount : totals.depositCount;
    const printedTotal = kind === "withdrawal" ? totals.withdrawalTotal : totals.depositTotal;
    if (printedCount !== null && printedCount !== read[kind].rows) {
      return mismatch(`The statement counts ${printedCount} ${kind} rows but the reader found ${read[kind].rows}.`);
    }
    if (printedTotal !== null) {
      const gap = BigInt(printedTotal) - read[kind].minor;
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

// How many distinct failure classes one result reports. Enough to cover a statement's remaining
// defects in a single read without an unbounded status line.
const MAX_REPORTED_FAILURE_CLASSES = 6;

// Groups failures by everything except which page and row they occurred on, so a defect repeating
// across 200 rows is reported once with a count and one location. Every message is already fully
// masked by the reader, so grouping adds no disclosure. Reading a real Krungthai statement cost
// seven owner-driven runs because each surfaced one row and stopped (D-032). Call only with at
// least one failure.
export function summarizeFailures(failures: readonly RowFailure[]): LayoutResult {
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
    // The first failure's code, so a single-defect statement reports exactly what it did before
    // this batching existed.
    code: failures[0]!.code,
    message:
      `${failures.length} row${failures.length === 1 ? "" : "s"} could not be read` +
      `${classes.size > 1 ? `, in ${classes.size} distinct cases` : ""}. ${summary}` +
      `${omitted > 0 ? ` | and ${omitted} further case${omitted === 1 ? "" : "s"} not shown` : ""}`
  };
}
