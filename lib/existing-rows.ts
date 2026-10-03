/** Wording for the review's "rows already in the ledger" check; pure so it is covered by tests. */
export type LedgerCheck =
  | { status: "checking" }
  | { status: "failed" }
  | { status: "done"; existing: readonly boolean[] };

export type LedgerCheckNotice = { tone: "info" | "warn"; text: string } | null;

export function ledgerCheckNotice(check: LedgerCheck | null, totalRows: number): LedgerCheckNotice {
  if (check === null || check.status === "checking") return null;
  if (check.status === "failed") return { tone: "warn", text: "Could not check for rows already in the ledger." };
  const count = check.existing.filter(Boolean).length;
  if (count === 0) return null;
  if (count === totalRows) return { tone: "warn", text: "Every row is already in the ledger; confirming adds nothing." };
  return { tone: "warn", text: `${count} of ${totalRows} rows are already in the ledger and will be skipped.` };
}

/** Fingerprints the route answered with, turned into one flag per row (same order as `fingerprints`). */
export function flagExisting(fingerprints: readonly string[], existing: readonly string[]): boolean[] {
  const stored = new Set(existing);
  return fingerprints.map((fingerprint) => stored.has(fingerprint));
}
