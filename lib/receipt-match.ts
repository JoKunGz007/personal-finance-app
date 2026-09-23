import { z } from "zod";
import { ledgerMatchRequestSchema, proposeLedgerMatches, type LedgerMatchRequest } from "@/lib/ledger-match";

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

export const receiptMatchRequestSchema = ledgerMatchRequestSchema;

export type ReceiptMatchRequest = LedgerMatchRequest;

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
 * Every receipt's match state: the shared mutual-uniqueness rule (`lib/ledger-match.ts`) over
 * this contract's own candidate rule.
 */
export function proposeReceiptMatches(
  receiptIds: readonly string[],
  candidates: readonly ReceiptLedgerCandidate[],
  decisions: readonly ReceiptMatchDecision[]
): Map<string, ReceiptMatchState> {
  return proposeLedgerMatches(
    receiptIds,
    candidates,
    decisions.map((decision) => ({ ...decision, documentId: decision.receipt_id })),
    { documentOf: (candidate) => candidate.receipt_id, qualifies: qualifiesAutomatically, toRow }
  );
}
