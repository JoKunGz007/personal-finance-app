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
 * - the row's bank description names `GRAB`, or it is an unnamed KBANK card spend (D-229);
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

/**
 * A LINE MAN order is paid at checkout, so its row lands just after the printed order time (the
 * lag read is from that time for LINE MAN, migration 036). Measured then chosen by the owner
 * (D-223, 2026-09-25): of 7 stored orders, 6 had exactly one row of the charged amount, 0–1
 * minutes after the order time; the only other equal-amount row was a BTS fare 22 hours away.
 */
export const LINEMAN_MATCH_BEFORE_MINUTES = 5;
export const LINEMAN_MATCH_AFTER_MINUTES = 30;

/**
 * What the bank row must name. All 6 measured rows read `LINE PAY` (bill payment); `LINE MAN` is
 * the mobile-banking QR form. A BTS fare paid through LINE Pay prints `LINEPAY*`, with no space,
 * and must not match.
 */
const LINEMAN_BANK_WORDING = /LINE (PAY|MAN)/i;

/** Whether a LINE MAN candidate satisfies the rule on its own, before uniqueness. */
export function linemanQualifiesAutomatically(
  candidate: Pick<DeliveryLedgerCandidate, "lag_minutes" | "description" | "transaction_label">
): boolean {
  return LINEMAN_BANK_WORDING.test(`${candidate.description} ${candidate.transaction_label}`)
    && candidate.lag_minutes !== null
    && candidate.lag_minutes >= -LINEMAN_MATCH_BEFORE_MINUTES
    && candidate.lag_minutes <= LINEMAN_MATCH_AFTER_MINUTES;
}

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
  /** A ride paid in two parts (D-229): the second charge, or the refund, beside `row`. */
  also: z.array(deliveryLedgerRowSchema).optional(),
  options: z.array(deliveryLedgerRowSchema),
  revision: z.number().int().nonnegative()
}).strict();

export type DeliveryMatchState = z.infer<typeof deliveryMatchStateSchema>;

export const deliveryMatchRequestSchema = ledgerMatchRequestSchema;

export type DeliveryMatchRequest = LedgerMatchRequest;

export const deliveryMatchResponseSchema = z.object({ match: deliveryMatchDecisionSchema }).strict();

/**
 * A KBANK debit card prints no merchant: every card payment reads `Debit Card Spending` with a
 * `Ref Code EDC…` description. Measured 2026-09-25 (D-229): 7 such rows on the whole ledger, every one
 * inside a Grab order's or ride's window, so accepting them as Grab's collides with nothing.
 */
function unnamedCardSpend(candidate: { transaction_label?: string; description?: string }): boolean {
  return candidate.transaction_label === "Debit Card Spending" && (candidate.description ?? "").startsWith("Ref Code EDC");
}

type GrabWording = Pick<DeliveryLedgerCandidate, "names_grab" | "lag_minutes"> & Partial<Pick<DeliveryLedgerCandidate, "transaction_label" | "description">>;

const toRow = ({ transaction_id, source_date, source_time, transaction_label, description, lag_minutes }: DeliveryLedgerCandidate): DeliveryLedgerRow =>
  ({ transaction_id, source_date, source_time, transaction_label, description, lag_minutes });

/** Whether one candidate satisfies the automatic rule on its own, before uniqueness. */
export function qualifiesAutomatically(candidate: GrabWording): boolean {
  return (candidate.names_grab || unnamedCardSpend(candidate))
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
export function rideQualifiesAutomatically(candidate: GrabWording): boolean {
  return (candidate.names_grab || unnamedCardSpend(candidate))
    && candidate.lag_minutes !== null
    && candidate.lag_minutes >= -RIDE_MATCH_BEFORE_MINUTES
    && candidate.lag_minutes <= RIDE_MATCH_AFTER_MINUTES;
}

type Tagged = DeliveryLedgerCandidate & { readonly document: string; readonly rule: (candidate: DeliveryLedgerCandidate) => boolean };

/**
 * Every order's and every ride's match state, **decided together** (D-222): a `GRAB` row that an
 * order and a ride both want is wanted twice, so neither takes it (D-063), and a row either
 * kind's decision holds is off the table for the other. Each kind keeps its own window.
 *
 * A ฿0 document (an order paid outside Grab, or a ride paid in full by discounts) is `outside`
 * whatever the candidates say, and wants no row.
 */
export function proposeGrabMatches(
  orders: readonly { id: string; paidOutside: boolean; platform?: "grabfood" | "lineman" }[],
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
  // Each document keeps its own window: GrabFood before the send time, LINE MAN after the order
  // time, a ride around its pickup.
  const lineman = new Set(orders.filter((order) => order.platform === "lineman").map((order) => order.id));
  const candidates: Tagged[] = [
    ...orderCandidates.filter((candidate) => matchableOrders.has(candidate.delivery_id))
      .map((candidate) => ({
        ...candidate, document: orderKey(candidate.delivery_id),
        rule: lineman.has(candidate.delivery_id) ? linemanQualifiesAutomatically : qualifiesAutomatically
      })),
    ...rideCandidates.filter((candidate) => matchableRides.has(candidate.ride_id))
      .map(({ ride_id, ...candidate }) => ({ ...candidate, delivery_id: ride_id, document: rideKey(ride_id), rule: rideQualifiesAutomatically }))
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
      qualifies: (candidate) => candidate.rule(candidate),
      toRow
    }
  );
  const outside: DeliveryMatchState = { status: "outside", row: null, options: [], revision: 0 };
  return {
    orders: new Map(orders.map((order) => [order.id, order.paidOutside ? outside : states.get(orderKey(order.id))!])),
    rides: new Map(rides.map((ride) => [ride.id, ride.paidOutside ? outside : states.get(rideKey(ride.id))!]))
  };
}

// ---------------------------------------------------------------------------------------------
// Rides paid in two parts (migration 039, D-229)
//
// Measured on the hosted ledger 2026-09-25, of the 43 rides inside statement coverage that no single
// row of their total paid: 34 were charged twice (the first 2–25 minutes before pickup, the rest
// 4–22 minutes after, once 51), summing to the total; 6 were charged once for more and refunded the
// difference 2–5 days later on a `POS REFUND` row; 3 were a KBANK card, which the wording rule above
// now covers.
// ---------------------------------------------------------------------------------------------

/** The second charge lands after pickup, up to an hour after (measured: 4–22 minutes, once 51). */
export const RIDE_SECOND_CHARGE_AFTER_MINUTES = 60;
/** The refund of an overcharge lands within a week of the charge (measured: 2–5 days). */
export const RIDE_REFUND_DAYS = 7;

export const rideSplitCandidateSchema = rideLedgerCandidateSchema.omit({ names_grab: true })
  .extend({ amount_minor: z.number().int() }).strict();

export type RideSplitCandidate = z.infer<typeof rideSplitCandidateSchema>;

const splitRow = ({ transaction_id, source_date, source_time, transaction_label, description, lag_minutes }: RideSplitCandidate): DeliveryLedgerRow =>
  ({ transaction_id, source_date, source_time, transaction_label, description, lag_minutes });

const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);

/**
 * A ride that no single row paid (`none`, with no decision of the owner's) is matched to **two**
 * rows when exactly one pair fits:
 *
 * - two charges, the first in the ride's usual window and the second from pickup to
 *   `RIDE_SECOND_CHARGE_AFTER_MINUTES` after, summing to the total to the satang; or
 * - one charge in the usual window for more than the total, and a `POS REFUND` of exactly the
 *   difference on the same day or up to `RIDE_REFUND_DAYS` after.
 *
 * Fail closed as the single-row rule is: a row any document already holds, or one another ride's
 * pair also wants, is used by neither. The owner's "Not this row" stores a decline, as for any match.
 */
export function proposeRideSplits(
  rides: readonly { id: string; total_minor: string }[],
  states: ReadonlyMap<string, DeliveryMatchState>,
  held: ReadonlySet<string>,
  candidates: readonly RideSplitCandidate[]
): Map<string, DeliveryMatchState> {
  const byRide = new Map<string, RideSplitCandidate[]>();
  for (const candidate of candidates) {
    if (held.has(candidate.transaction_id)) continue;
    byRide.set(candidate.ride_id, [...(byRide.get(candidate.ride_id) ?? []), candidate]);
  }
  const proposals = new Map<string, [RideSplitCandidate, RideSplitCandidate]>();
  for (const ride of rides) {
    if (states.get(ride.id)?.status !== "none") continue;
    const total = Number(ride.total_minor);
    const rows = byRide.get(ride.id) ?? [];
    const charges = rows.filter((row) => row.amount_minor < 0 && row.lag_minutes !== null);
    const first = charges.filter((row) => row.lag_minutes! >= -RIDE_MATCH_BEFORE_MINUTES && row.lag_minutes! <= RIDE_MATCH_AFTER_MINUTES);
    const pairs: [RideSplitCandidate, RideSplitCandidate][] = [];
    for (const a of first) {
      for (const b of charges) {
        if (b.transaction_id !== a.transaction_id && b.lag_minutes! >= 0 && b.lag_minutes! <= RIDE_SECOND_CHARGE_AFTER_MINUTES
          && (b.lag_minutes! > a.lag_minutes! || (b.lag_minutes === a.lag_minutes && b.transaction_id > a.transaction_id))
          && a.amount_minor + b.amount_minor === -total) pairs.push([a, b]);
      }
      if (-a.amount_minor > total) {
        for (const refund of rows) {
          const days = daysBetween(a.source_date, refund.source_date);
          if (refund.amount_minor === -a.amount_minor - total && days >= 0 && days <= RIDE_REFUND_DAYS) pairs.push([a, refund]);
        }
      }
    }
    if (pairs.length === 1) proposals.set(ride.id, pairs[0]!);
  }
  // A row two rides' pairs both want is taken by neither.
  const wanted = new Map<string, number>();
  for (const pair of proposals.values()) for (const row of pair) wanted.set(row.transaction_id, (wanted.get(row.transaction_id) ?? 0) + 1);
  const result = new Map(states);
  for (const [rideId, [primary, second]] of proposals) {
    if (wanted.get(primary.transaction_id)! > 1 || wanted.get(second.transaction_id)! > 1) continue;
    const state = states.get(rideId)!;
    result.set(rideId, { ...state, status: "matched", row: splitRow(primary), also: [splitRow(second)] });
  }
  return result;
}

/** Orders alone: `proposeGrabMatches` with no rides. */
export function proposeDeliveryMatches(
  orders: readonly { id: string; paidOutside: boolean }[],
  candidates: readonly DeliveryLedgerCandidate[],
  decisions: readonly DeliveryMatchDecision[]
): Map<string, DeliveryMatchState> {
  return proposeGrabMatches(orders, candidates, decisions, [], [], []).orders;
}
