import { z } from "zod";
import { noStoreHeaders, routeError, strongOwnerClient } from "@/lib/server/supabase";
import { paidOutsidePlatform } from "@/lib/deliveries";
import {
  deliveryLedgerCandidateSchema, deliveryMatchDecisionSchema, proposeGrabMatches,
  rideLedgerCandidateSchema, rideMatchDecisionSchema
} from "@/lib/delivery-match";

export const dynamic = "force-dynamic";

/**
 * Stored delivery orders and Grab rides, newest first, with their breakdowns (migrations 032 and
 * 034), and each one's match to the ledger (migration 033, D-220; migration 034, D-222). Orders
 * and rides are matched **together**, so a row both want is claimed by neither.
 */
export async function GET() {
  const auth = await strongOwnerClient();
  if (!auth.ok) return routeError(auth.message, auth.status);

  // Six independent reads, started together: each kind's documents, candidate rows and the
  // owner's stored decisions.
  const [orders, rides, orderCandidates, rideCandidates, orderDecisions, rideDecisions] = await Promise.all([
    auth.supabase
      .from("deliveries")
      .select("id,platform,booking_id,restaurant,payment_method,receipt_sent_at,food_minor,delivery_fee_minor,total_minor,items:delivery_items(position,quantity,name,options,amount_minor),adjustments:delivery_adjustments(position,kind,name,amount_minor)")
      .order("receipt_sent_at", { ascending: false }),
    auth.supabase
      .from("rides")
      .select("id,booking_id,ride_type,picked_up_at,dropped_off_at,pickup_place,dropoff_place,distance_meters,duration_minutes,payment_method,fare_minor,platform_fee_minor,total_minor,adjustments:ride_adjustments(position,kind,name,amount_minor)")
      .order("dropped_off_at", { ascending: false }),
    auth.supabase.rpc("delivery_ledger_candidates"),
    auth.supabase.rpc("ride_ledger_candidates"),
    auth.supabase.from("delivery_match_overlays").select("delivery_id,decision,transaction_id,revision"),
    auth.supabase.from("ride_match_overlays").select("ride_id,decision,transaction_id,revision")
  ]);
  if (orders.error || rides.error) return routeError("Delivery orders could not be loaded.", 400);

  // Off-contract any read is a refusal, never a document shown as unmatched — "no row" is a
  // claim the page would then be making about the ledger without having read it.
  const parsedOrderCandidates = z.array(deliveryLedgerCandidateSchema).safeParse(orderCandidates.data);
  const parsedRideCandidates = z.array(rideLedgerCandidateSchema).safeParse(rideCandidates.data);
  const parsedOrderDecisions = z.array(deliveryMatchDecisionSchema).safeParse(orderDecisions.data);
  const parsedRideDecisions = z.array(rideMatchDecisionSchema).safeParse(rideDecisions.data);
  if (orderCandidates.error || rideCandidates.error || orderDecisions.error || rideDecisions.error
    || !parsedOrderCandidates.success || !parsedRideCandidates.success
    || !parsedOrderDecisions.success || !parsedRideDecisions.success) {
    return routeError("Orders could not be matched to the ledger, so none are shown.", 500);
  }

  // bigint arrives as a JS number from PostgREST, so every money column is stringified here (D-018).
  const deliveries = (orders.data ?? []).map((delivery) => ({
    ...delivery,
    food_minor: String(delivery.food_minor),
    delivery_fee_minor: delivery.delivery_fee_minor === null ? null : String(delivery.delivery_fee_minor),
    total_minor: String(delivery.total_minor),
    items: [...delivery.items].sort((a, b) => a.position - b.position).map((item) => ({ ...item, amount_minor: String(item.amount_minor) })),
    adjustments: [...delivery.adjustments].sort((a, b) => a.position - b.position).map((row) => ({ ...row, amount_minor: String(row.amount_minor) }))
  }));
  const storedRides = (rides.data ?? []).map((ride) => ({
    ...ride,
    fare_minor: String(ride.fare_minor),
    platform_fee_minor: String(ride.platform_fee_minor),
    total_minor: String(ride.total_minor),
    adjustments: [...ride.adjustments].sort((a, b) => a.position - b.position).map((row) => ({ ...row, amount_minor: String(row.amount_minor) }))
  }));
  const matches = proposeGrabMatches(
    deliveries.map((delivery) => ({ id: delivery.id, paidOutside: paidOutsidePlatform(delivery) })),
    parsedOrderCandidates.data,
    parsedOrderDecisions.data,
    // A ฿0 ride was paid in full by discounts: no card row, so it is never matched.
    storedRides.map((ride) => ({ id: ride.id, paidOutside: ride.total_minor === "0" })),
    parsedRideCandidates.data,
    parsedRideDecisions.data
  );
  return Response.json({
    deliveries: deliveries.map((delivery) => ({ ...delivery, match: matches.orders.get(delivery.id)! })),
    rides: storedRides.map((ride) => ({ ...ride, match: matches.rides.get(ride.id)! }))
  }, { headers: noStoreHeaders });
}
