import { z } from "zod";
import { proposeLedgerMatches } from "@/lib/ledger-match";

/**
 * Matching a GrabFood order to the ledger row that paid for it (PLAN task 58 part 3, D-220).
 *
 * **An order is never money** (migration 032), so a match moves no balance and no total; it
 * attaches the dishes to a card row the ledger already holds. A ฿0 order was paid outside Grab
 * and is never matched: the candidate read skips it and the write refuses it (migration 033).
 *
 * The automatic rule:
 *
 * - the row's bank description names `GRAB`;
 * - its movement is the order's printed total, negated, **to the minor unit** — the candidate
 *   read (`public.delivery_ledger_candidates()`) returns only such rows;
 * - it falls **at or before** the e-receipt's send time, within `DELIVERY_MATCH_WINDOW_MINUTES`:
 *   the email is sent after delivery, so the card row comes first;
 * - and the pair is mutually unique (`lib/ledger-match.ts`).
 *
 * The owner's stored decision always wins, and a manual link covers what the rule declines; the
 * database holds that link to the amount and to nothing else (`set_delivery_match`).
 */

/**
 * Two hours before the send time, measured then chosen by the owner (D-220, 2026-09-24). 100 paid
 * orders against the hosted ledger: 89 card rows landed 0–35 minutes before the email, one at
 * 100, none after; every one named GRAB and the nearest other equal-amount row was 43 hours away.
 */
export const DELIVERY_MATCH_WINDOW_MINUTES = 120;

export const deliveryLedgerCandidateSchema = z.object({
  delivery_id: z.string().uuid(),
  transaction_id: z.string().uuid(),
  account_id: z.string().uuid(),
  source_date: z.string(),
  source_time: z.string().nullable(),
  transaction_label: z.string(),
  description: z.string(),
  lag_minutes: z.number().int().nullable(),
  names_grab: z.boolean()
}).strict();

export type DeliveryLedgerCandidate = z.infer<typeof deliveryLedgerCandidateSchema>;

export const deliveryMatchDecisionSchema = z.object({
  delivery_id: z.string().uuid(),
  decision: z.enum(["matched", "unmatched"]),
  transaction_id: z.string().uuid().nullable(),
  revision: z.number().int().nonnegative()
}).strict();

export type DeliveryMatchDecision = z.infer<typeof deliveryMatchDecisionSchema>;

/** A ledger row as the deliveries page shows it: enough to recognise, nothing it does not need. */
export const deliveryLedgerRowSchema = z.object({
  transaction_id: z.string().uuid(),
  source_date: z.string(),
  source_time: z.string().nullable(),
  transaction_label: z.string(),
  description: z.string(),
  lag_minutes: z.number().int().nullable()
}).strict();

export type DeliveryLedgerRow = z.infer<typeof deliveryLedgerRowSchema>;

/**
 * - `linked` / `declined`: the owner decided.
 * - `matched`: the automatic rule found exactly one row.
 * - `ambiguous`: more than one row qualifies, or another order wants the same one.
 * - `none`: no row qualifies — normal for another card, or a statement not yet imported.
 * - `outside`: a ฿0 order, paid outside Grab, which is never matched.
 */
export const deliveryMatchStateSchema = z.object({
  status: z.enum(["linked", "declined", "matched", "ambiguous", "none", "outside"]),
  row: deliveryLedgerRowSchema.nullable(),
  options: z.array(deliveryLedgerRowSchema),
  revision: z.number().int().nonnegative()
}).strict();

export type DeliveryMatchState = z.infer<typeof deliveryMatchStateSchema>;

export const deliveryMatchRequestSchema = z.object({
  expectedRevision: z.number().int().nonnegative(),
  decision: z.enum(["matched", "unmatched"]),
  transactionId: z.string().uuid().nullable()
}).strict().superRefine((match, context) => {
  if ((match.decision === "matched") !== (match.transactionId !== null)) {
    context.addIssue({ code: "custom", message: "A link names a ledger row and a decline names none.", path: ["transactionId"] });
  }
});

export type DeliveryMatchRequest = z.infer<typeof deliveryMatchRequestSchema>;

export const deliveryMatchResponseSchema = z.object({ match: deliveryMatchDecisionSchema }).strict();

const toRow = ({ transaction_id, source_date, source_time, transaction_label, description, lag_minutes }: DeliveryLedgerCandidate): DeliveryLedgerRow =>
  ({ transaction_id, source_date, source_time, transaction_label, description, lag_minutes });

/** Whether one candidate satisfies the automatic rule on its own, before uniqueness. */
export function qualifiesAutomatically(candidate: Pick<DeliveryLedgerCandidate, "names_grab" | "lag_minutes">): boolean {
  return candidate.names_grab
    && candidate.lag_minutes !== null
    && candidate.lag_minutes <= 0
    && candidate.lag_minutes >= -DELIVERY_MATCH_WINDOW_MINUTES;
}

/**
 * Every order's match state. `paidOutside` names the ฿0 orders: they are `outside` whatever the
 * candidates say, and hold no row that another order could otherwise want.
 */
export function proposeDeliveryMatches(
  orders: readonly { id: string; paidOutside: boolean }[],
  candidates: readonly DeliveryLedgerCandidate[],
  decisions: readonly DeliveryMatchDecision[]
): Map<string, DeliveryMatchState> {
  const matchable = new Set(orders.filter((order) => !order.paidOutside).map((order) => order.id));
  const states: Map<string, DeliveryMatchState> = proposeLedgerMatches(
    [...matchable],
    candidates.filter((candidate) => matchable.has(candidate.delivery_id)),
    decisions.filter((decision) => matchable.has(decision.delivery_id)).map((decision) => ({ ...decision, documentId: decision.delivery_id })),
    { documentOf: (candidate) => candidate.delivery_id, qualifies: qualifiesAutomatically, toRow }
  );
  for (const order of orders) {
    if (order.paidOutside) states.set(order.id, { status: "outside", row: null, options: [], revision: 0 });
  }
  return states;
}
