import { z } from "zod";
import type { strongOwnerClient } from "@/lib/server/supabase";
import { isComplete } from "@/lib/server/row-cap";
import { deliveryTime, paidOutsidePlatform, type DeliveryService } from "@/lib/deliveries";
import {
  deliveryLedgerCandidateSchema, deliveryMatchDecisionSchema, proposeGrabMatches, proposeRideSplits,
  rideLedgerCandidateSchema, rideMatchDecisionSchema, rideSplitCandidateSchema,
  type DeliveryMatchState
} from "@/lib/delivery-match";
import { proposeReceiptMatches, receiptLedgerCandidateSchema, receiptMatchDecisionSchema, type ReceiptMatchState } from "@/lib/receipt-match";

/**
 * The match decision the `/orders` and `/receipts` routes show, factored out so the auto-categoriser
 * (D-245) reads exactly the same matches. Automatic matches are not stored: they are decided here,
 * in TypeScript, from the candidate RPCs and the owner's stored decisions.
 */
type OwnerClient = Extract<Awaited<ReturnType<typeof strongOwnerClient>>, { ok: true }>["supabase"];

type Refusal = { ok: false; message: string; status: number };

const money = (value: number | string | null) => (value === null ? null : String(value));

/** Stored delivery orders and Grab rides, each with its match (D-220, D-222, D-229). */
export async function loadOrderMatches(supabase: OwnerClient) {
  // Seven independent reads, started together: each kind's documents, candidate rows and the
  // owner's stored decisions, and the rows a ride paid in two parts can be (migration 039).
  const [orders, rides, orderCandidates, rideCandidates, orderDecisions, rideDecisions, splitCandidates] = await Promise.all([
    supabase
      .from("deliveries")
      .select("id,platform,service,booking_id,restaurant,payment_method,receipt_sent_at,food_minor,delivery_fee_minor,total_minor,items:delivery_items(position,quantity,name,options,amount_minor),adjustments:delivery_adjustments(position,kind,name,amount_minor),lineman:lineman_order_details(ordered_at,charged_minor)", { count: "exact" }),
    supabase
      .from("rides")
      .select("id,booking_id,ride_type,picked_up_at,dropped_off_at,pickup_place,dropoff_place,distance_meters,duration_minutes,payment_method,fare_minor,platform_fee_minor,total_minor,adjustments:ride_adjustments(position,kind,name,amount_minor)", { count: "exact" })
      .order("dropped_off_at", { ascending: false }),
    supabase.rpc("delivery_ledger_candidates"),
    supabase.rpc("ride_ledger_candidates"),
    supabase.from("delivery_match_overlays").select("delivery_id,decision,transaction_id,revision", { count: "exact" }),
    supabase.from("ride_match_overlays").select("ride_id,decision,transaction_id,revision", { count: "exact" }),
    supabase.rpc("ride_split_candidates")
  ]);
  if (orders.error || rides.error) return { ok: false, message: "Delivery orders could not be loaded.", status: 400 } satisfies Refusal;
  // PostgREST cuts a plain select at max_rows without saying so; a cut list is a refusal, never a shorter one.
  if (!isComplete(orders) || !isComplete(rides)) {
    return { ok: false, message: "Delivery orders could not be loaded in full, so none are shown.", status: 500 } satisfies Refusal;
  }

  // Off-contract any read is a refusal, never a document shown as unmatched — "no row" is a
  // claim the page would then be making about the ledger without having read it.
  const parsedOrderCandidates = z.array(deliveryLedgerCandidateSchema).safeParse(orderCandidates.data);
  const parsedRideCandidates = z.array(rideLedgerCandidateSchema).safeParse(rideCandidates.data);
  const parsedOrderDecisions = z.array(deliveryMatchDecisionSchema).safeParse(orderDecisions.data);
  const parsedRideDecisions = z.array(rideMatchDecisionSchema).safeParse(rideDecisions.data);
  const parsedSplitCandidates = z.array(rideSplitCandidateSchema).safeParse(splitCandidates.data);
  if (orderCandidates.error || rideCandidates.error || orderDecisions.error || rideDecisions.error || splitCandidates.error
    || !isComplete(orderDecisions) || !isComplete(rideDecisions)
    || !parsedOrderCandidates.success || !parsedRideCandidates.success
    || !parsedOrderDecisions.success || !parsedRideDecisions.success || !parsedSplitCandidates.success) {
    return { ok: false, message: "Orders could not be matched to the ledger, so none are shown.", status: 500 } satisfies Refusal;
  }

  // bigint arrives as a JS number from PostgREST, so every money column is stringified here (D-018).
  // A LINE MAN order's own facts arrive embedded (one row, or none for GrabFood); PostgREST sends
  // a one-to-one embed as an object, and an array is tolerated in case it ever does not.
  const deliveries = (orders.data ?? []).map(({ lineman, ...delivery }) => {
    const detail = (Array.isArray(lineman) ? lineman[0] : lineman) as { ordered_at: string; charged_minor: number | string } | null | undefined;
    return { ...delivery, ordered_at: detail?.ordered_at ?? null, charged_minor: detail ? String(detail.charged_minor) : null };
  }).map((delivery) => ({
    ...delivery,
    food_minor: String(delivery.food_minor),
    delivery_fee_minor: delivery.delivery_fee_minor === null ? null : String(delivery.delivery_fee_minor),
    total_minor: String(delivery.total_minor),
    items: [...delivery.items].sort((a, b) => a.position - b.position).map((item) => ({ ...item, amount_minor: String(item.amount_minor) })),
    adjustments: [...delivery.adjustments].sort((a, b) => a.position - b.position).map((row) => ({ ...row, amount_minor: String(row.amount_minor) }))
  })).sort((a, b) => deliveryTime(b).localeCompare(deliveryTime(a)) || a.id.localeCompare(b.id));
  const storedRides = (rides.data ?? []).map((ride) => ({
    ...ride,
    fare_minor: String(ride.fare_minor),
    platform_fee_minor: String(ride.platform_fee_minor),
    total_minor: String(ride.total_minor),
    adjustments: [...ride.adjustments].sort((a, b) => a.position - b.position).map((row) => ({ ...row, amount_minor: String(row.amount_minor) }))
  }));
  const matches = proposeGrabMatches(
    deliveries.map((delivery) => ({ id: delivery.id, paidOutside: paidOutsidePlatform(delivery), platform: delivery.platform, service: delivery.service })),
    parsedOrderCandidates.data,
    parsedOrderDecisions.data,
    // A ฿0 ride was paid in full by discounts: no card row, so it is never matched.
    storedRides.map((ride) => ({ id: ride.id, paidOutside: ride.total_minor === "0" })),
    parsedRideCandidates.data,
    parsedRideDecisions.data
  );
  // A row any document holds, or any undecided one could be, is off the table for a two-part pair.
  const held = new Set([...matches.orders.values(), ...matches.rides.values()].flatMap((state) =>
    state.status === "ambiguous" ? state.options.map((row) => row.transaction_id)
      : (state.status === "matched" || state.status === "linked") && state.row ? [state.row.transaction_id] : []));
  const rideMatches = proposeRideSplits(storedRides, matches.rides, held, parsedSplitCandidates.data);
  return {
    ok: true as const,
    deliveries: deliveries.map((delivery) => ({ ...delivery, match: matches.orders.get(delivery.id)! })),
    rides: storedRides.map((ride) => ({ ...ride, match: rideMatches.get(ride.id)! })),
    orderDecisions: parsedOrderDecisions.data,
    rideDecisions: parsedRideDecisions.data
  };
}

/** Stored receipts, each with its match (D-212). */
export async function loadReceiptMatches(supabase: OwnerClient) {
  // Three independent reads, started together: the receipts, the candidate rows (migration 030)
  // and the owner's stored decisions.
  const [receiptRead, candidates, decisions] = await Promise.all([supabase
    .from("receipts")
    .select("id,store_code,branch_name,receipt_number,purchased_on,purchased_at_time,payment_method,subtotal_minor,net_minor,unit_count,completeness,failed_checks,sources,items_source,items_complete,updated_at,items:receipt_items(position,quantity,name,display_name,amount_minor,is_promotion,vat_exempt),discounts:receipt_discounts(position,amount_minor)", { count: "exact" })
    .order("purchased_on", { ascending: false })
    .order("purchased_at_time", { ascending: false, nullsFirst: false }),
    supabase.rpc("receipt_ledger_candidates"),
    supabase.from("receipt_match_overlays").select("receipt_id,decision,transaction_id,revision", { count: "exact" })
  ]);
  const { data, error } = receiptRead;
  if (error) return { ok: false, message: "Receipts could not be loaded.", status: 400 } satisfies Refusal;
  // PostgREST cuts a plain select at max_rows without saying so; a cut list is a refusal, never a shorter one.
  if (!isComplete(receiptRead)) return { ok: false, message: "Receipts could not be loaded in full, so none are shown.", status: 500 } satisfies Refusal;

  // The match state is computed here rather than on the device. Off-contract either read is a
  // refusal, never a receipt shown as unmatched — "no row" is a claim the page would then be
  // making about the ledger without having read it.
  const parsedCandidates = z.array(receiptLedgerCandidateSchema).safeParse(candidates.data);
  const parsedDecisions = z.array(receiptMatchDecisionSchema).safeParse(decisions.data);
  if (candidates.error || decisions.error || !isComplete(decisions) || !parsedCandidates.success || !parsedDecisions.success) {
    return { ok: false, message: "Receipts could not be matched to the ledger, so none are shown.", status: 500 } satisfies Refusal;
  }
  const matches = proposeReceiptMatches((data ?? []).map((receipt) => receipt.id), parsedCandidates.data, parsedDecisions.data);

  // bigint arrives as a JS number from PostgREST, so every money column is stringified here
  // (D-018), exactly as the slips route does. Children are ordered here rather than trusted to
  // arrive in position order from the embed.
  const receipts = (data ?? []).map((receipt) => ({
    ...receipt,
    subtotal_minor: money(receipt.subtotal_minor),
    net_minor: String(receipt.net_minor),
    items: [...receipt.items].sort((a, b) => a.position - b.position).map((item) => ({ ...item, amount_minor: String(item.amount_minor) })),
    discounts: [...receipt.discounts].sort((a, b) => a.position - b.position).map((discount) => ({ ...discount, amount_minor: String(discount.amount_minor) })),
    match: matches.get(receipt.id)!
  }));
  return { ok: true as const, receipts, decisions: parsedDecisions.data };
}

export type CurrentMatch =
  | { transaction_id: string; kind: "ride"; entity_id: string }
  | { transaction_id: string; kind: "delivery"; platform: "grabfood" | "lineman"; /** Absent reads as food. */ service?: DeliveryService; entity_id: string }
  | { transaction_id: string; kind: "receipt"; entity_id: string };

/**
 * The ledger rows a match currently holds: an owner's link (by its stored row, which a link outside
 * the candidate window still names), a single automatic match, and both rows of a ride paid in two
 * parts. Declined, ambiguous, none and outside hold nothing.
 */
export function heldRows(state: DeliveryMatchState | ReceiptMatchState, linked: string | null | undefined): string[] {
  if (state.status === "linked") return linked ? [linked] : state.row ? [state.row.transaction_id] : [];
  if (state.status !== "matched" || !state.row) return [];
  const also = "also" in state && state.also ? state.also.map((row) => row.transaction_id) : [];
  return [state.row.transaction_id, ...also];
}

/** Every transaction the app treats as matched today, with its kind and the matched document. */
export async function loadCurrentMatches(supabase: OwnerClient): Promise<{ ok: true; matches: CurrentMatch[] } | Refusal> {
  const [orders, receipts] = await Promise.all([loadOrderMatches(supabase), loadReceiptMatches(supabase)]);
  if (!orders.ok) return orders;
  if (!receipts.ok) return receipts;
  const linkedOrder = new Map(orders.orderDecisions.filter((d) => d.decision === "matched").map((d) => [d.delivery_id, d.transaction_id]));
  const linkedRide = new Map(orders.rideDecisions.filter((d) => d.decision === "matched").map((d) => [d.ride_id, d.transaction_id]));
  const linkedReceipt = new Map(receipts.decisions.filter((d) => d.decision === "matched").map((d) => [d.receipt_id, d.transaction_id]));
  const matches: CurrentMatch[] = [
    ...orders.rides.flatMap((ride) => heldRows(ride.match, linkedRide.get(ride.id))
      .map((transaction_id) => ({ transaction_id, kind: "ride" as const, entity_id: ride.id }))),
    ...orders.deliveries.flatMap((delivery) => heldRows(delivery.match, linkedOrder.get(delivery.id))
      .map((transaction_id) => ({ transaction_id, kind: "delivery" as const, platform: delivery.platform as "grabfood" | "lineman", service: ((delivery as { service?: DeliveryService }).service ?? "food"), entity_id: delivery.id }))),
    ...receipts.receipts.flatMap((receipt) => heldRows(receipt.match, linkedReceipt.get(receipt.id))
      .map((transaction_id) => ({ transaction_id, kind: "receipt" as const, entity_id: receipt.id })))
  ];
  return { ok: true, matches };
}
