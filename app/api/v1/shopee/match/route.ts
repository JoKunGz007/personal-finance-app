import { noStoreHeaders, routeError, strongOwnerClient } from "@/lib/server/supabase";
import { shopeeMatchRequestSchema, shopeeMatchResultSchema } from "@/lib/shopee-view";

export const dynamic = "force-dynamic";

/**
 * The owner's say over which ledger row a group of Shopee orders paid for (migration 055, D-270).
 * The RPC is the only write path: zod checks the shape, the RPC checks the money and the group,
 * and every refusal below is the database's, translated. The RPC's own message is never echoed.
 */
const REFUSALS: readonly (readonly [string, string, number])[] = [
  ["shopee match revision conflict", "These orders' matches changed in another session. Reload the list and try again.", 409],
  ["shopee match amount mismatch", "That ledger row's amount is not the total of these orders, so it cannot be the same payment.", 409],
  ["ledger row already claimed by another shopee order", "Another Shopee order is already linked to that ledger row. Undo that link first.", 409],
  ["shopee order already matched to another ledger row", "One of these orders is already linked to a different ledger row. Undo that link first.", 409],
  ["combined shopee match must be undone whole", "These orders were linked to one ledger row together. Undo them all at once.", 409],
  ["shopee order paid outside the platform", "An order that was paid outside Shopee has no ledger row to link.", 409],
  ["shopee order not owned", "One of those orders does not exist.", 404],
  ["transaction not owned", "That ledger row does not exist.", 422]
];

export async function POST(request: Request) {
  const auth = await strongOwnerClient();
  if (!auth.ok) return routeError(auth.message, auth.status);
  const parsed = shopeeMatchRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return routeError("The match decision is invalid.", 422, parsed.error.flatten());

  const { data, error } = await auth.supabase.rpc("set_shopee_payment_match", {
    p_transaction_id: parsed.data.transactionId,
    p_orders: parsed.data.orders.map((o) => ({ orderId: o.orderId, expectedRevision: o.expectedRevision })),
    p_decision: parsed.data.decision
  });
  if (error) {
    for (const [fragment, said, status] of REFUSALS) {
      if (error.message.includes(fragment)) return routeError(said, status);
    }
    return routeError("The match decision could not be saved.", 400);
  }

  const stored = (data as { orders?: Record<string, unknown>[] } | null)?.orders;
  const result = shopeeMatchResultSchema.safeParse({
    orders: Array.isArray(stored)
      ? stored.map((o) => ({
        orderId: o.order_id, decision: o.decision, transactionId: o.transaction_id ?? null, revision: o.revision
      }))
      : stored
  });
  if (!result.success) {
    // The decision *was* stored; saying otherwise would invite a repeat of a landed write.
    return routeError("The decision was saved but could not be read back in its published shape. Reload the list.", 500);
  }
  return Response.json(result.data, { headers: noStoreHeaders });
}
