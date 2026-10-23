import { z } from "zod";

/** What `POST /api/v1/imports/existing` answers with. */
export const existingResponseSchema = z.object({
  existing: z.array(z.string()),
  existingCount: z.number().int().min(0)
});

/** The part of the confirm route's answer the status line uses; `linkedRows` null when the read-back failed. */
export const confirmResponseSchema = z.object({
  batchId: z.unknown(),
  linkedRows: z.number().int().min(0).nullable().optional()
});

/** Wording for the review's "rows already in the ledger" check; pure so it is covered by tests. */
export type LedgerCheck =
  | { status: "checking" }
  | { status: "failed" }
  // `existing` flags rows by exact fingerprint (the per-row tags); `linkedCount` is how many rows
  // `confirm_import` would link to stored rows, by fingerprint or identity facts (the notice).
  | { status: "done"; existing: readonly boolean[]; linkedCount: number };

export type LedgerCheckNotice = { tone: "info" | "warn"; text: string } | null;

export function ledgerCheckNotice(check: LedgerCheck | null, totalRows: number): LedgerCheckNotice {
  if (check === null || check.status === "checking") return null;
  if (check.status === "failed") return { tone: "warn", text: "Could not check for rows already in the ledger." };
  const count = check.linkedCount;
  if (count <= 0) return null;
  if (count >= totalRows) return { tone: "warn", text: "Every row is already in the ledger; confirming adds nothing." };
  // A row linked by identity facts (date, time, amount) rather than an exact fingerprint has no tag
  // below, so say so when the tags fall short of the count.
  const tagged = check.existing.filter(Boolean).length;
  const untagged = tagged < count ? " Rows matched by date, time and amount rather than an exact copy are not marked below." : "";
  return { tone: "warn", text: `${count} of ${totalRows} rows are already in the ledger and will be linked, not added again.${untagged}` };
}

/** What the confirm route answered with, as the status line words it. `linkedRows` null means unknown. */
export function confirmedRowsText(totalRows: number, linkedRows: number | null): string {
  if (linkedRows === null || linkedRows <= 0) return `${totalRows} rows`;
  const linked = Math.min(linkedRows, totalRows);
  return `${totalRows - linked} new rows (${linked} already in the ledger, linked)`;
}

/** Fingerprints the route answered with, turned into one flag per row (same order as `fingerprints`). */
export function flagExisting(fingerprints: readonly string[], existing: readonly string[]): boolean[] {
  const stored = new Set(existing);
  return fingerprints.map((fingerprint) => stored.has(fingerprint));
}
