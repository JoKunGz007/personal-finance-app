import type { MinorUnitString } from "@/lib/money";
import { minor } from "@/lib/money";
import type { SourceRowCandidate } from "@/lib/statement";

type ReconciliationIssue = {
  row: number;
  expected: MinorUnitString;
  printed: MinorUnitString;
  message: string;
};

export type ReconciliationWarning = ReconciliationIssue & { code: "balance-gap" };
export type ReconciliationBlocker = ReconciliationIssue & { code: "unexplained-balance-gap" };

export type ReconciledRow = SourceRowCandidate & {
  movement: MinorUnitString;
  expectedBalance: MinorUnitString;
  status: "balanced" | "resynchronized" | "blocked";
};

export function reconcileRows(openingBalance: MinorUnitString, rows: readonly SourceRowCandidate[]) {
  let running = BigInt(openingBalance);
  const warnings: ReconciliationWarning[] = [];
  const blockers: ReconciliationBlocker[] = [];
  const reconciled: ReconciledRow[] = rows.map((row, index) => {
    const movement = row.components.reduce((sum, component) => sum + BigInt(component.amount.minor), 0n);
    const expected = running + movement;
    const printed = BigInt(row.postBalance.minor);
    const balanced = expected === printed;
    const knownCompoundAnomaly = row.components.length === 2
      && row.components.some((item) => item.kind === "deposit")
      && row.components.some((item) => item.kind === "withdrawal")
      && row.provenance.parserFields.anomaly === "interest-tax-order";
    if (!balanced) {
      const issue = {
        row: index + 1,
        expected: minor(expected.toString()),
        printed: row.postBalance.minor,
        message: "Printed balance differs here; reconciliation resumes from this printed balance."
      };
      if (knownCompoundAnomaly) warnings.push({ code: "balance-gap", ...issue });
      else blockers.push({ code: "unexplained-balance-gap", ...issue });
    }
    running = printed;
    return {
      ...row,
      movement: minor(movement.toString()),
      expectedBalance: minor(expected.toString()),
      status: balanced ? "balanced" : knownCompoundAnomaly ? "resynchronized" : "blocked"
    };
  });
  return { rows: reconciled, warnings, blockers, closingBalance: minor(running.toString()) };
}
