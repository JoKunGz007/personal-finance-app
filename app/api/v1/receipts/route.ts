import { noStoreHeaders, routeError, strongOwnerClient } from "@/lib/server/supabase";
import { captureReceiptRequest, receiptCaptureSchema } from "@/lib/receipts";

export const dynamic = "force-dynamic";

const money = (value: number | string | null) => (value === null ? null : String(value));

export async function GET() {
  const auth = await strongOwnerClient();
  if (!auth.ok) return routeError(auth.message, auth.status);
  const { data, error } = await auth.supabase
    .from("receipts")
    .select("id,store_code,branch_name,receipt_number,purchased_on,purchased_at_time,payment_method,subtotal_minor,net_minor,unit_count,completeness,failed_checks,sources,items_source,items_complete,updated_at,items:receipt_items(position,quantity,name,display_name,amount_minor,is_promotion,vat_exempt),discounts:receipt_discounts(position,amount_minor)")
    .order("purchased_on", { ascending: false })
    .order("purchased_at_time", { ascending: false, nullsFirst: false });
  if (error) return routeError("Receipts could not be loaded.", 400);

  // bigint arrives as a JS number from PostgREST, so every money column is stringified here
  // (D-018), exactly as the slips route does. Children are ordered here rather than trusted to
  // arrive in position order from the embed.
  const receipts = (data ?? []).map((receipt) => ({
    ...receipt,
    subtotal_minor: money(receipt.subtotal_minor),
    net_minor: String(receipt.net_minor),
    items: [...receipt.items].sort((a, b) => a.position - b.position).map((item) => ({ ...item, amount_minor: String(item.amount_minor) })),
    discounts: [...receipt.discounts].sort((a, b) => a.position - b.position).map((discount) => ({ ...discount, amount_minor: String(discount.amount_minor) }))
  }));
  return Response.json({ receipts }, { headers: noStoreHeaders });
}

export async function POST(request: Request) {
  const auth = await strongOwnerClient();
  if (!auth.ok) return routeError(auth.message, auth.status);

  const parsed = receiptCaptureSchema.safeParse(await request.json().catch(() => null));
  // The first issue's message is static text from `lib/receipts.ts`, never a value, so it is
  // safe to say — and "outside the plausible window" is one the owner can act on.
  if (!parsed.success) return routeError(`The receipt is invalid: ${parsed.error.issues[0]?.message ?? "unknown field"}`, 422, parsed.error.flatten());

  const { data, error } = await auth.supabase.rpc("capture_receipt", { p_request: captureReceiptRequest(parsed.data) });
  if (error) {
    // Rule 2's refusal is the one a caller can act on: two readings of one purchase disagree
    // about money, so one of them is misread. Everything else is a contract violation and its
    // message is deliberately not echoed — it can name a stored value.
    if (error.message.includes("disagrees with the stored value")) {
      return routeError("This receipt's figures disagree with the copy already stored for the same purchase, so nothing was changed.", 409);
    }
    return routeError("The receipt could not be captured.", 400);
  }

  const result = data as { captured: boolean };
  // 201 for a new receipt, 200 when it merged into one already stored — capturing the other form
  // of the same purchase is the design (migration 027), not a duplicate to apologise for.
  return Response.json(data, { status: result.captured ? 201 : 200, headers: noStoreHeaders });
}
