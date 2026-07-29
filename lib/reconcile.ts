import type { MinorUnitString } from "@/lib/money";
import { minor } from "@/lib/money";
import type { SourceRowCandidate } from "@/lib/statement";

type ReconciliationIssue = {
  row: number;
  expected: MinorUnitString;
  printed: MinorUnitString;
  message: string;
};

// The out-of-order variant deliberately does not borrow `expected`/`printed`: its figures
// are a run's entry balance and the closing balance its recovered order reaches, which are
// not a row-level expected-versus-printed pair. `POST /api/v1/imports/confirm` returns
// warnings verbatim, so a consumer reading the shared shape would otherwise render a
// specific false claim about a row.
export type ReconciliationWarning =
  | (ReconciliationIssue & { code: "balance-gap" })
  | {
      code: "out-of-order-run";
      row: number;
      // The date the run is printed under. `row` and `order` are printed row numbers, which
      // no surface displays — a reader needs something they can actually find on the page.
      date: string;
      entryBalance: MinorUnitString;
      recoveredClosing: MinorUnitString;
      order: readonly number[];
      message: string;
    };
export type ReconciliationBlocker = ReconciliationIssue & { code: "unexplained-balance-gap" };

export type ReconciledRow = SourceRowCandidate & {
  movement: MinorUnitString;
  expectedBalance: MinorUnitString;
  status: "balanced" | "resynchronized" | "reordered" | "blocked";
};

// A statement may print a day's rows in an order that is not the order its balances were
// applied in: a real Krungthai statement prints an end-of-day interest posting first among
// its date's entries and applies it last, so the printed chain breaks at that row, at the
// row after it, and again at the first row of the next date (D-055). The rows themselves
// are correct — the printed totals cross-check agrees — so refusing the statement would be
// refusing the bank's own arithmetic.
//
// The repair is deliberately narrow. It is attempted only where this function would
// otherwise refuse, only within one date, and only if exactly one ordering of that date's
// rows reproduces every printed balance. Nought or several orderings refuse exactly as
// before, so ambiguity can never be resolved by picking one.
//
// `rows` comes back in printed order, for display. `applied` comes back in the order the
// balances were applied, and that is the order an import submits: `public.confirm_import`
// walks the payload's rows and requires the chain to close, so the order it is given has
// to be the one that closes. Each row keeps its printed page and row in `provenance`, so
// the printed position survives the reordering.
const MAX_REORDER_RUN = 10;
// Statement-wide, not per run: a per-run budget multiplies by the number of dates, which
// is not a bound at all on a long document.
const SEARCH_BUDGET = 50_000;

// The interest/tax pairing the parser marks, whose printed balance legitimately reflects
// only one half. Unmarked compound rows are not covered — see D-029.
const isKnownCompoundAnomaly = (row: SourceRowCandidate) =>
  row.components.length === 2
  && row.components.some((item) => item.kind === "deposit")
  && row.components.some((item) => item.kind === "withdrawal")
  && row.provenance.parserFields.anomaly === "interest-tax-order";

// Maximal spans of consecutive rows printed under one date. The repair never crosses a
// date boundary: a statement that needed it to would be one whose printed dates are wrong,
// which is a different defect and must not be silently absorbed by a reordering.
function sameDateRuns(rows: readonly SourceRowCandidate[]): { start: number; end: number }[] {
  const runs: { start: number; end: number }[] = [];
  let start = 0;
  for (let index = 1; index <= rows.length; index += 1) {
    if (index === rows.length || rows[index]!.sourceDate !== rows[start]!.sourceDate) {
      runs.push({ start, end: index });
      start = index;
    }
  }
  return runs;
}

export function reconcileRows(openingBalance: MinorUnitString, rows: readonly SourceRowCandidate[]) {
  // Once per row for the whole call: each `movementOf` re-parses a BigInt per component,
  // and the search revisits a row many times.
  const movements = rows.map((row) =>
    row.components.reduce((sum, component) => sum + BigInt(component.amount.minor), 0n));
  const printedBalances = rows.map((row) => BigInt(row.postBalance.minor));

  // Shared across every run in this statement, so total work is bounded by one budget.
  let budget = SEARCH_BUDGET;

  // The one ordering of a run that reproduces every printed balance from `entry`, or null
  // if there is none, more than one, or the search is too large to settle honestly. Every
  // row must balance exactly: a reordering is not licence to also tolerate a gap.
  const findUniqueClosingOrder = (entry: bigint, start: number, length: number): readonly number[] | null => {
    if (length < 2 || length > MAX_REORDER_RUN) return null;
    const solutions: number[][] = [];

    const walk = (remaining: readonly number[], chosen: number[], running: bigint) => {
      if (solutions.length > 1 || budget <= 0) return;
      if (remaining.length === 0) {
        solutions.push([...chosen]);
        return;
      }
      for (let index = 0; index < remaining.length; index += 1) {
        budget -= 1;
        if (budget <= 0) return;
        const absolute = remaining[index]!;
        if (running + movements[absolute]! !== printedBalances[absolute]!) continue;
        chosen.push(absolute);
        walk([...remaining.slice(0, index), ...remaining.slice(index + 1)], chosen, printedBalances[absolute]!);
        chosen.pop();
        if (solutions.length > 1 || budget <= 0) return;
      }
    };

    walk(Array.from({ length }, (_, offset) => start + offset), [], entry);
    return budget > 0 && solutions.length === 1 ? solutions[0]! : null;
  };

  let running = BigInt(openingBalance);
  const warnings: ReconciliationWarning[] = [];
  const blockers: ReconciliationBlocker[] = [];
  const reconciled: ReconciledRow[] = [];
  const applied: SourceRowCandidate[] = [];

  for (const { start, end } of sameDateRuns(rows)) {
    // The printed order first, on exactly the terms this function has always used.
    const entry = running;
    const attempt: ReconciledRow[] = [];
    const attemptWarnings: ReconciliationWarning[] = [];
    const attemptBlockers: ReconciliationBlocker[] = [];
    for (let index = start; index < end; index += 1) {
      const row = rows[index]!;
      const movement = movements[index]!;
      const expected = running + movement;
      const printed = printedBalances[index]!;
      const balanced = expected === printed;
      const tolerated = isKnownCompoundAnomaly(row);
      if (!balanced) {
        const issue = {
          row: index + 1,
          expected: minor(expected.toString()),
          printed: row.postBalance.minor,
          message: "Printed balance differs here; reconciliation resumes from this printed balance."
        };
        if (tolerated) attemptWarnings.push({ code: "balance-gap", ...issue });
        else attemptBlockers.push({ code: "unexplained-balance-gap", ...issue });
      }
      running = printed;
      attempt.push({
        ...row,
        movement: minor(movement.toString()),
        expectedBalance: minor(expected.toString()),
        status: balanced ? "balanced" : tolerated ? "resynchronized" : "blocked"
      });
    }

    const order = attemptBlockers.length === 0 ? null : findUniqueClosingOrder(entry, start, end - start);
    if (!order) {
      reconciled.push(...attempt);
      applied.push(...rows.slice(start, end));
      warnings.push(...attemptWarnings);
      blockers.push(...attemptBlockers);
      continue;
    }

    // Recovered. Each row's expected balance is the one it has in the order the bank
    // applied them, and the run leaves the balance that order ends on — which is not the
    // printed-order last row's balance, and is what the next date chains from.
    const expectedByIndex = new Map<number, bigint>();
    let repaired = entry;
    for (const index of order) {
      repaired += movements[index]!;
      expectedByIndex.set(index, repaired);
      repaired = printedBalances[index]!;
      applied.push(rows[index]!);
    }
    running = repaired;
    for (let index = start; index < end; index += 1) {
      reconciled.push({
        ...rows[index]!,
        movement: minor(movements[index]!.toString()),
        expectedBalance: minor(expectedByIndex.get(index)!.toString()),
        status: "reordered"
      });
    }
    warnings.push({
      code: "out-of-order-run",
      row: start + 1,
      date: rows[start]!.sourceDate,
      entryBalance: minor(entry.toString()),
      recoveredClosing: minor(running.toString()),
      order: order.map((index) => index + 1),
      message: "This date's rows are printed in a different order from the one their balances were applied in; exactly one ordering reproduces every printed balance, and it was used."
    });
  }

  return { rows: reconciled, applied, warnings, blockers, closingBalance: minor(running.toString()) };
}
