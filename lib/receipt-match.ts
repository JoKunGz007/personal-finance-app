import { z } from "zod";

/**
 * Matching a 7-Eleven receipt to the ledger row that paid for it (PLAN task 56, D-212).
 *
 * **A receipt is never money** (migration 027), so a match moves no balance and no total. It
 * attaches itemization to a row the ledger already holds, which is why an unmatched receipt is a
 * normal outcome rather than an error: a purchase paid from the wallet balance can never have a
 * row, and one reimbursed to a friend has a row the rule cannot tell from an unrelated payment.
 *
 * The automatic rule, stated once (`docs/RECEIPT_CONTRACT.md` § Matching to the ledger):
 *
 * - the row's bank description names `TRUE MONEY`;
 * - its movement is the receipt's net, negated, **to the minor unit** — the candidate read
 *   (`public.receipt_ledger_candidates()`, migration 030) returns only such rows;
 * - it falls **at or after** the receipt time, within `RECEIPT_MATCH_WINDOW_MINUTES`;
 * - and the pair is **mutually unique**: the receipt has exactly one such row, that row is the
 *   automatic candidate of no other undecided receipt, and no owner decision already claims it.
 *
 * Two candidates is a refusal, never a choice (D-063). The owner's stored decision always wins,
 * and a manual link covers what the rule declines — the database holds that link to the amount
 * and to nothing else (`set_receipt_match`).
 */

/**
 * Two hours, measured rather than picked (D-212, 2026-09-23). Thirteen real receipts against the
 * hosted ledger: the ten paid by the 7-Eleven app wallet landed 0–2 minutes after the receipt,
 * the one TrueMoney-wallet payment with a row landed at 47, none fell before its receipt, and the
 * nearest other row of an equal amount was weeks away. Two hours covers the slow route with room,
 * and the mutual-uniqueness clause is what stops a wider window letting a wrong row in.
 */
export const RECEIPT_MATCH_WINDOW_MINUTES = 120;

export const receiptLedgerCandidateSchema = z.object({
  receipt_id: z.string().uuid(),
  transaction_id: z.string().uuid(),
  account_id: z.string().uuid(),
  source_date: z.string(),
  source_time: z.string().nullable(),
  transaction_label: z.string(),
  description: z.string(),
  lag_minutes: z.number().int().nullable(),
  names_true_money: z.boolean()
}).strict();

export type ReceiptLedgerCandidate = z.infer<typeof receiptLedgerCandidateSchema>;

export const receiptMatchDecisionSchema = z.object({
  receipt_id: z.string().uuid(),
  decision: z.enum(["matched", "unmatched"]),
  transaction_id: z.string().uuid().nullable(),
  revision: z.number().int().nonnegative()
}).strict();

export type ReceiptMatchDecision = z.infer<typeof receiptMatchDecisionSchema>;

/** A ledger row as the receipts page shows it: enough to recognise, nothing it does not need. */
export const receiptLedgerRowSchema = z.object({
  transaction_id: z.string().uuid(),
  source_date: z.string(),
  source_time: z.string().nullable(),
  transaction_label: z.string(),
  description: z.string(),
  lag_minutes: z.number().int().nullable(),
  names_true_money: z.boolean()
}).strict();

export type ReceiptLedgerRow = z.infer<typeof receiptLedgerRowSchema>;

/**
 * - `linked` / `declined`: the owner decided. Final until the owner changes it.
 * - `matched`: the automatic rule found exactly one row.
 * - `ambiguous`: more than one row qualifies, or another receipt wants the same one.
 * - `none`: no row qualifies — normal for a wallet-balance purchase or a statement not yet imported.
 */
export const receiptMatchStateSchema = z.object({
  status: z.enum(["linked", "declined", "matched", "ambiguous", "none"]),
  // The row in force for `linked` and `matched`. Null for `linked` only when the owner linked a
  // row outside the candidate read's three days, which the page cannot describe but still honours.
  row: receiptLedgerRowSchema.nullable(),
  // What a manual link may choose from: every equal-amount row within three days that no other
  // receipt's decision holds.
  options: z.array(receiptLedgerRowSchema),
  // The stored decision's revision, 0 when there is none — what a write must send as expected.
  revision: z.number().int().nonnegative()
}).strict();

export type ReceiptMatchState = z.infer<typeof receiptMatchStateSchema>;

export const receiptMatchRequestSchema = z.object({
  expectedRevision: z.number().int().nonnegative(),
  decision: z.enum(["matched", "unmatched"]),
  transactionId: z.string().uuid().nullable()
}).strict().superRefine((match, context) => {
  if ((match.decision === "matched") !== (match.transactionId !== null)) {
    context.addIssue({ code: "custom", message: "A link names a ledger row and a decline names none.", path: ["transactionId"] });
  }
});

export type ReceiptMatchRequest = z.infer<typeof receiptMatchRequestSchema>;

export const receiptMatchResponseSchema = z.object({ match: receiptMatchDecisionSchema }).strict();

const toRow = ({ transaction_id, source_date, source_time, transaction_label, description, lag_minutes, names_true_money }: ReceiptLedgerCandidate): ReceiptLedgerRow =>
  ({ transaction_id, source_date, source_time, transaction_label, description, lag_minutes, names_true_money });

/** Whether one candidate satisfies the automatic rule on its own, before uniqueness. */
export function qualifiesAutomatically(candidate: Pick<ReceiptLedgerCandidate, "names_true_money" | "lag_minutes">): boolean {
  return candidate.names_true_money
    && candidate.lag_minutes !== null
    && candidate.lag_minutes >= 0
    && candidate.lag_minutes <= RECEIPT_MATCH_WINDOW_MINUTES;
}

/**
 * Every receipt's match state. Order-independent: nothing here depends on the order receipts or
 * candidates arrive in, which is what mutual uniqueness buys over greedy pairing.
 */
export function proposeReceiptMatches(
  receiptIds: readonly string[],
  candidates: readonly ReceiptLedgerCandidate[],
  decisions: readonly ReceiptMatchDecision[]
): Map<string, ReceiptMatchState> {
  const decisionOf = new Map(decisions.map((decision) => [decision.receipt_id, decision]));
  // Rows an owner decision holds, and by which receipt: off the table for everyone else.
  const claimedBy = new Map<string, string>();
  for (const decision of decisions) {
    if (decision.decision === "matched" && decision.transaction_id) claimedBy.set(decision.transaction_id, decision.receipt_id);
  }

  const candidatesOf = new Map<string, ReceiptLedgerCandidate[]>();
  for (const candidate of candidates) {
    const list = candidatesOf.get(candidate.receipt_id) ?? [];
    list.push(candidate);
    candidatesOf.set(candidate.receipt_id, list);
  }

  const automaticOf = new Map<string, ReceiptLedgerCandidate[]>();
  const wantedBy = new Map<string, number>();
  for (const receiptId of receiptIds) {
    if (decisionOf.has(receiptId)) continue;
    const automatic = (candidatesOf.get(receiptId) ?? [])
      .filter((candidate) => qualifiesAutomatically(candidate) && !claimedBy.has(candidate.transaction_id));
    automaticOf.set(receiptId, automatic);
    for (const candidate of automatic) wantedBy.set(candidate.transaction_id, (wantedBy.get(candidate.transaction_id) ?? 0) + 1);
  }

  const states = new Map<string, ReceiptMatchState>();
  for (const receiptId of receiptIds) {
    const own = candidatesOf.get(receiptId) ?? [];
    const options = own
      .filter((candidate) => { const holder = claimedBy.get(candidate.transaction_id); return holder === undefined || holder === receiptId; })
      .map(toRow);
    const decision = decisionOf.get(receiptId);
    if (decision) {
      const linked = decision.transaction_id === null ? undefined : own.find((candidate) => candidate.transaction_id === decision.transaction_id);
      states.set(receiptId, {
        status: decision.decision === "matched" ? "linked" : "declined",
        row: linked ? toRow(linked) : null,
        options,
        revision: decision.revision
      });
      continue;
    }
    const automatic = automaticOf.get(receiptId) ?? [];
    const only = automatic.length === 1 ? automatic[0]! : null;
    if (only && wantedBy.get(only.transaction_id) === 1) {
      states.set(receiptId, { status: "matched", row: toRow(only), options, revision: 0 });
    } else {
      states.set(receiptId, { status: automatic.length === 0 ? "none" : "ambiguous", row: null, options, revision: 0 });
    }
  }
  return states;
}
