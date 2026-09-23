import { noStoreHeaders, routeError, strongOwnerClient } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";

/** Stored delivery orders, newest first, with their dishes, discounts and charges (migration 032). */
export async function GET() {
  const auth = await strongOwnerClient();
  if (!auth.ok) return routeError(auth.message, auth.status);

  const { data, error } = await auth.supabase
    .from("deliveries")
    .select("id,platform,booking_id,restaurant,payment_method,receipt_sent_at,food_minor,delivery_fee_minor,total_minor,items:delivery_items(position,quantity,name,options,amount_minor),adjustments:delivery_adjustments(position,kind,name,amount_minor)")
    .order("receipt_sent_at", { ascending: false });
  if (error) return routeError("Delivery orders could not be loaded.", 400);

  // bigint arrives as a JS number from PostgREST, so every money column is stringified here (D-018).
  const deliveries = (data ?? []).map((delivery) => ({
    ...delivery,
    food_minor: String(delivery.food_minor),
    delivery_fee_minor: delivery.delivery_fee_minor === null ? null : String(delivery.delivery_fee_minor),
    total_minor: String(delivery.total_minor),
    items: [...delivery.items].sort((a, b) => a.position - b.position).map((item) => ({ ...item, amount_minor: String(item.amount_minor) })),
    adjustments: [...delivery.adjustments].sort((a, b) => a.position - b.position).map((row) => ({ ...row, amount_minor: String(row.amount_minor) }))
  }));
  return Response.json({ deliveries }, { headers: noStoreHeaders });
}
