import { z } from "zod";
import { ledgerMatchRequestSchema, proposeLedgerMatches, type LedgerMatchRequest } from "@/lib/ledger-match";

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

export const deliveryMatchRequestSchema = ledgerMatchRequestSchema;

export type DeliveryMatchRequest = LedgerMatchRequest;

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

// ---------------------------------------------------------------------------------------------
// Rides (migration 034, D-222)
//
// Grab charges a ride's card at booking, so the window is around the **pickup** (migration 035).
// Measured on the 276 real rides, then chosen by the owner (D-222, 2026-09-24): of 183 rides with a
// GRAB row of their exact total, 176 landed 1–15 minutes before pickup, two 16–30 before, two
// within 15 after, and two over two hours before (booked ahead, left to a manual link). Inside
// this window no ride had two rows, no row was wanted by two rides, and none fell in an order's.
// ---------------------------------------------------------------------------------------------

export const RIDE_MATCH_BEFORE_MINUTES = 30;
export const RIDE_MATCH_AFTER_MINUTES = 15;

export const rideLedgerCandidateSchema = deliveryLedgerCandidateSchema.omit({ delivery_id: true }).extend({ ride_id: z.string().uuid() }).strict();

export type RideLedgerCandidate = z.infer<typeof rideLedgerCandidateSchema>;

export const rideMatchDecisionSchema = deliveryMatchDecisionSchema.omit({ delivery_id: true }).extend({ ride_id: z.string().uuid() }).strict();

export type RideMatchDecision = z.infer<typeof rideMatchDecisionSchema>;

export const rideMatchResponseSchema = z.object({ match: rideMatchDecisionSchema }).strict();

/** Whether one ride candidate satisfies the automatic rule on its own, before uniqueness. */
export function rideQualifiesAutomatically(candidate: Pick<RideLedgerCandidate, "names_grab" | "lag_minutes">): boolean {
  return candidate.names_grab
    && candidate.lag_minutes !== null
    && candidate.lag_minutes >= -RIDE_MATCH_BEFORE_MINUTES
    && candidate.lag_minutes <= RIDE_MATCH_AFTER_MINUTES;
}

type Tagged = DeliveryLedgerCandidate & { readonly document: string; readonly ride: boolean };

/**
 * Every order's and every ride's match state, **decided together** (D-222): a `GRAB` row that an
 * order and a ride both want is wanted twice, so neither takes it (D-063), and a row either
 * kind's decision holds is off the table for the other. Each kind keeps its own window.
 *
 * A ฿0 document (an order paid outside Grab, or a ride paid in full by discounts) is `outside`
 * whatever the candidates say, and wants no row.
 */
export function proposeGrabMatches(
  orders: readonly { id: string; paidOutside: boolean }[],
  orderCandidates: readonly DeliveryLedgerCandidate[],
  orderDecisions: readonly DeliveryMatchDecision[],
  rides: readonly { id: string; paidOutside: boolean }[],
  rideCandidates: readonly RideLedgerCandidate[],
  rideDecisions: readonly RideMatchDecision[]
): { orders: Map<string, DeliveryMatchState>; rides: Map<string, DeliveryMatchState> } {
  // Keys carry the kind, so an order and a ride can never be mistaken for one document.
  const orderKey = (id: string) => `order:${id}`;
  const rideKey = (id: string) => `ride:${id}`;
  const matchableOrders = new Set(orders.filter((order) => !order.paidOutside).map((order) => order.id));
  const matchableRides = new Set(rides.filter((ride) => !ride.paidOutside).map((ride) => ride.id));
  const candidates: Tagged[] = [
    ...orderCandidates.filter((candidate) => matchableOrders.has(candidate.delivery_id))
      .map((candidate) => ({ ...candidate, document: orderKey(candidate.delivery_id), ride: false })),
    ...rideCandidates.filter((candidate) => matchableRides.has(candidate.ride_id))
      .map(({ ride_id, ...candidate }) => ({ ...candidate, delivery_id: ride_id, document: rideKey(ride_id), ride: true }))
  ];
  const decisions = [
    ...orderDecisions.filter((decision) => matchableOrders.has(decision.delivery_id))
      .map((decision) => ({ ...decision, documentId: orderKey(decision.delivery_id) })),
    ...rideDecisions.filter((decision) => matchableRides.has(decision.ride_id))
      .map((decision) => ({ ...decision, documentId: rideKey(decision.ride_id) }))
  ];
  const states: Map<string, DeliveryMatchState> = proposeLedgerMatches(
    [...[...matchableOrders].map(orderKey), ...[...matchableRides].map(rideKey)],
    candidates,
    decisions,
    {
      documentOf: (candidate) => candidate.document,
      qualifies: (candidate) => (candidate.ride ? rideQualifiesAutomatically(candidate) : qualifiesAutomatically(candidate)),
      toRow
    }
  );
  const outside: DeliveryMatchState = { status: "outside", row: null, options: [], revision: 0 };
  return {
    orders: new Map(orders.map((order) => [order.id, order.paidOutside ? outside : states.get(orderKey(order.id))!])),
    rides: new Map(rides.map((ride) => [ride.id, ride.paidOutside ? outside : states.get(rideKey(ride.id))!]))
  };
}

/** Orders alone: `proposeGrabMatches` with no rides. */
export function proposeDeliveryMatches(
  orders: readonly { id: string; paidOutside: boolean }[],
  candidates: readonly DeliveryLedgerCandidate[],
  decisions: readonly DeliveryMatchDecision[]
): Map<string, DeliveryMatchState> {
  return proposeGrabMatches(orders, candidates, decisions, [], [], []).orders;
}
