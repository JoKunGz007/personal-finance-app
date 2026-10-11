import { noStoreHeaders, routeError, strongOwnerClient } from "@/lib/server/supabase";
import { shopeeLinksRequestSchema, shopeeLinksResultSchema } from "@/lib/shopee-view";

export const dynamic = "force-dynamic";

/**
 * Links Shopee orders to the other ledger rows they relate to: a wallet top-up, a SPayLater
 * repayment or a refund deposit (migration 055, D-270). Setting a state an order already has
 * changes nothing. The RPC's own message is never echoed.
 */
const REFUSALS: readonly (readonly [string, string, number])[] = [
  ["shopee link kind mismatch", "That ledger row does not fit this kind of link for these orders.", 409],
  ["invalid shopee link", "The link request is invalid.", 400],
  ["shopee order not owned", "One of those orders does not exist.", 404],
  ["transaction not owned", "That ledger row does not exist.", 422]
];

export async function POST(request: Request) {
  const auth = await strongOwnerClient();
  if (!auth.ok) return routeError(auth.message, auth.status);
  const parsed = shopeeLinksRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return routeError("The link request is invalid.", 422, parsed.error.flatten());

  const { data, error } = await auth.supabase.rpc("set_shopee_order_links", {
    p_kind: parsed.data.kind,
    p_transaction_id: parsed.data.transactionId,
    p_order_ids: parsed.data.orderIds,
    p_action: parsed.data.action
  });
  if (error) {
    for (const [fragment, said, status] of REFUSALS) {
      if (error.message.includes(fragment)) return routeError(said, status);
    }
    return routeError("The link could not be saved.", 400);
  }

  const result = shopeeLinksResultSchema.safeParse(data);
  if (!result.success) {
    return routeError("The link was saved but could not be read back in its published shape. Reload the list.", 500);
  }
  return Response.json(result.data, { headers: noStoreHeaders });
}
