import { z } from "zod";
import { noStoreHeaders, routeError, strongOwnerClient } from "@/lib/server/supabase";
import { deliveryTime, linemanCaptureRequestSchema, paidOutsidePlatform } from "@/lib/deliveries";
import {
  deliveryLedgerCandidateSchema, deliveryMatchDecisionSchema, proposeGrabMatches, proposeRideSplits,
  rideLedgerCandidateSchema, rideMatchDecisionSchema, rideSplitCandidateSchema
} from "@/lib/delivery-match";

export const dynamic = "force-dynamic";

/**
 * Stored delivery orders (GrabFood and LINE MAN) and Grab rides, newest first, with their breakdowns (migrations 032 and
 * 034), and each one's match to the ledger (migration 033, D-220; migration 034, D-222). Orders
 * and rides are matched **together**, so a row both want is claimed by neither.
 */
export async function GET() {
  const auth = await strongOwnerClient();
  if (!auth.ok) return routeError(auth.message, auth.status);

  // Seven independent reads, started together: each kind's documents, candidate rows and the
  // owner's stored decisions, and the rows a ride paid in two parts can be (migration 039).
  const [orders, rides, orderCandidates, rideCandidates, orderDecisions, rideDecisions, splitCandidates] = await Promise.all([
    auth.supabase
      .from("deliveries")
      .select("id,platform,booking_id,restaurant,payment_method,receipt_sent_at,food_minor,delivery_fee_minor,total_minor,items:delivery_items(position,quantity,name,options,amount_minor),adjustments:delivery_adjustments(position,kind,name,amount_minor),lineman:lineman_order_details(ordered_at,charged_minor)"),
    auth.supabase
      .from("rides")
      .select("id,booking_id,ride_type,picked_up_at,dropped_off_at,pickup_place,dropoff_place,distance_meters,duration_minutes,payment_method,fare_minor,platform_fee_minor,total_minor,adjustments:ride_adjustments(position,kind,name,amount_minor)")
      .order("dropped_off_at", { ascending: false }),
    auth.supabase.rpc("delivery_ledger_candidates"),
    auth.supabase.rpc("ride_ledger_candidates"),
    auth.supabase.from("delivery_match_overlays").select("delivery_id,decision,transaction_id,revision"),
    auth.supabase.from("ride_match_overlays").select("ride_id,decision,transaction_id,revision"),
    auth.supabase.rpc("ride_split_candidates")
  ]);
  if (orders.error || rides.error) return routeError("Delivery orders could not be loaded.", 400);

  // Off-contract any read is a refusal, never a document shown as unmatched — "no row" is a
  // claim the page would then be making about the ledger without having read it.
  const parsedOrderCandidates = z.array(deliveryLedgerCandidateSchema).safeParse(orderCandidates.data);
  const parsedRideCandidates = z.array(rideLedgerCandidateSchema).safeParse(rideCandidates.data);
  const parsedOrderDecisions = z.array(deliveryMatchDecisionSchema).safeParse(orderDecisions.data);
  const parsedRideDecisions = z.array(rideMatchDecisionSchema).safeParse(rideDecisions.data);
  const parsedSplitCandidates = z.array(rideSplitCandidateSchema).safeParse(splitCandidates.data);
  if (orderCandidates.error || rideCandidates.error || orderDecisions.error || rideDecisions.error || splitCandidates.error
    || !parsedOrderCandidates.success || !parsedRideCandidates.success
    || !parsedOrderDecisions.success || !parsedRideDecisions.success || !parsedSplitCandidates.success) {
    return routeError("Orders could not be matched to the ledger, so none are shown.", 500);
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
    deliveries.map((delivery) => ({ id: delivery.id, paidOutside: paidOutsidePlatform(delivery), platform: delivery.platform })),
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
  return Response.json({
    deliveries: deliveries.map((delivery) => ({ ...delivery, match: matches.orders.get(delivery.id)! })),
    rides: storedRides.map((ride) => ({ ...ride, match: rideMatches.get(ride.id)! }))
  }, { headers: noStoreHeaders });
}

/**
 * Stores a LINE MAN order read from its screenshots on the device (D-223). Only the parse arrives —
 * never an image or a line of the owner's block — and `capture_delivery` re-checks its sums, its
 * charge and its idempotency under the owner's own session.
 */
export async function POST(request: Request) {
  const auth = await strongOwnerClient();
  if (!auth.ok) return routeError(auth.message, auth.status);
  const parsed = linemanCaptureRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return routeError("The order is not in the shape this ledger stores.", 422, parsed.error.flatten());
  // The schema is `captureLinemanRequest`'s shape exactly, so the checked body is the RPC request.
  const { data, error } = await auth.supabase.rpc("capture_delivery", { p_request: parsed.data });
  if (error) {
    // The database's message is never echoed: it can name a stored value.
    if (error.message.includes("disagrees with the stored copy")) {
      return routeError("This order is already stored with different amounts. Check the screenshots.", 409);
    }
    if (error.message.includes("does not equal") || error.message.includes("do not sum") || error.message.includes("charged more")) {
      return routeError("The order's amounts do not add up, so it was not stored.", 422);
    }
    return routeError("The order could not be stored.", 400);
  }
  return Response.json(data, { headers: noStoreHeaders });
}
