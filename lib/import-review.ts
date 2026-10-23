/**
 * Pure figures the import review shows, lifted out of `app/import-bench.tsx` so they are tested
 * without a browser: the deposit/withdrawal totals, the rows the reconciliation moved (D-055) and
 * the page count read from row provenance. Money stays minor-unit strings summed as bigint.
 */
import { addMinor } from "@/lib/money";
import type { SourceRowCandidate } from "@/lib/statement";

export function statementTotals(rows: readonly SourceRowCandidate[]) {
  const components = rows.flatMap((row) => row.components);
  const deposits = components.filter((item) => item.kind === "deposit").map((item) => item.amount.minor);
  const withdrawals = components.filter((item) => item.kind === "withdrawal").map((item) => item.amount.minor);
  return {
    deposits: addMinor(deposits),
    withdrawals: addMinor(withdrawals),
    net: addMinor([...deposits, ...withdrawals])
  };
}

/** Indexes of rows printed earlier on the page than the row now above them (applied order vs provenance). */
export function movedRowIndexes(rows: readonly SourceRowCandidate[]): Set<number> {
  const moved = new Set<number>();
  for (let index = 1; index < rows.length; index += 1) {
    const previous = rows[index - 1]!.provenance;
    const current = rows[index]!.provenance;
    if (current.page < previous.page || (current.page === previous.page && current.row < previous.row)) {
      moved.add(index);
    }
  }
  return moved;
}

/** Pages a statement spans, from the highest page any row came from; at least 1. */
export function pageCountOf(rows: readonly SourceRowCandidate[]): number {
  return Math.max(1, ...rows.map((row) => row.provenance.page));
}
