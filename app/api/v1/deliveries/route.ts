import { z } from "zod";
import { noStoreHeaders, routeError, strongOwnerClient } from "@/lib/server/supabase";
import { paidOutsidePlatform } from "@/lib/deliveries";
import { deliveryLedgerCandidateSchema, deliveryMatchDecisionSchema, proposeDeliveryMatches } from "@/lib/delivery-match";

export const dynamic = "force-dynamic";

/**
 * Stored delivery orders, newest first, with their dishes, discounts and charges (migration 032),
 * and each order's match to the ledger (migration 033, D-220).
 */
export async function GET() {
  const auth = await strongOwnerClient();
  if (!auth.ok) return routeError(auth.message, auth.status);

  // Three independent reads, started together: the orders, the candidate rows and the owner's
  // stored decisions.
  const [{ data, error }, candidates, decisions] = await Promise.all([auth.supabase
    .from("deliveries")
    .select("id,platform,booking_id,restaurant,payment_method,receipt_sent_at,food_minor,delivery_fee_minor,total_minor,items:delivery_items(position,quantity,name,options,amount_minor),adjustments:delivery_adjustments(position,kind,name,amount_minor)")
    .order("receipt_sent_at", { ascending: false }),
    auth.supabase.rpc("delivery_ledger_candidates"),
    auth.supabase.from("delivery_match_overlays").select("delivery_id,decision,transaction_id,revision")
  ]);
  if (error) return routeError("Delivery orders could not be loaded.", 400);

  // Off-contract either read is a refusal, never an order shown as unmatched — "no row" is a
  // claim the page would then be making about the ledger without having read it.
  const parsedCandidates = z.array(deliveryLedgerCandidateSchema).safeParse(candidates.data);
  const parsedDecisions = z.array(deliveryMatchDecisionSchema).safeParse(decisions.data);
  if (candidates.error || decisions.error || !parsedCandidates.success || !parsedDecisions.success) {
    return routeError("Orders could not be matched to the ledger, so none are shown.", 500);
  }

  // bigint arrives as a JS number from PostgREST, so every money column is stringified here (D-018).
  const deliveries = (data ?? []).map((delivery) => ({
    ...delivery,
    food_minor: String(delivery.food_minor),
    delivery_fee_minor: delivery.delivery_fee_minor === null ? null : String(delivery.delivery_fee_minor),
    total_minor: String(delivery.total_minor),
    items: [...delivery.items].sort((a, b) => a.position - b.position).map((item) => ({ ...item, amount_minor: String(item.amount_minor) })),
    adjustments: [...delivery.adjustments].sort((a, b) => a.position - b.position).map((row) => ({ ...row, amount_minor: String(row.amount_minor) }))
  }));
  const matches = proposeDeliveryMatches(
    deliveries.map((delivery) => ({ id: delivery.id, paidOutside: paidOutsidePlatform(delivery) })),
    parsedCandidates.data,
    parsedDecisions.data
  );
  return Response.json({ deliveries: deliveries.map((delivery) => ({ ...delivery, match: matches.get(delivery.id)! })) }, { headers: noStoreHeaders });
}
