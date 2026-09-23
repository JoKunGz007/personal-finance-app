import { z } from "zod";
import { noStoreHeaders, routeError, strongOwnerClient } from "@/lib/server/supabase";
import { receiptMatchDecisionSchema, receiptMatchRequestSchema } from "@/lib/receipt-match";

export const dynamic = "force-dynamic";

/**
 * The owner's say over which ledger row a receipt itemizes (migration 030, D-212), the slip
 * match route's shape exactly. `public.set_receipt_match` is the only write path — zod checks
 * the shape, the RPC checks the money — and every refusal below is the database's, translated.
 * PUT because the decision is one row per receipt: sending it twice lands in the same place.
 */
export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await strongOwnerClient();
  if (!auth.ok) return routeError(auth.message, auth.status);
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) return routeError("Receipt id is invalid.", 400);
  const parsed = receiptMatchRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return routeError("The match decision is invalid.", 422, parsed.error.flatten());

  const { data, error } = await auth.supabase.rpc("set_receipt_match", {
    p_receipt_id: id,
    p_expected_revision: parsed.data.expectedRevision,
    p_decision: parsed.data.decision,
    p_transaction_id: parsed.data.transactionId
  });

  if (error) {
    // The RPC's own message is never echoed: a database message can name a stored value.
    const message = error.message;
    if (message.includes("revision conflict")) {
      return routeError("This receipt's match changed in another session. Reload the list and try again.", 409);
    }
    if (message.includes("already claimed")) {
      return routeError("Another receipt is already linked to that ledger row. Undo that link first.", 409);
    }
    if (message.includes("amount mismatch")) {
      return routeError("That ledger row's amount is not this receipt's total, so it cannot be the same payment.", 422);
    }
    if (message.includes("receipt not owned")) return routeError("That receipt does not exist.", 404);
    if (message.includes("transaction not owned")) return routeError("That ledger row does not exist.", 422);
    return routeError("The match decision could not be saved.", 400);
  }

  const stored = data as Record<string, unknown> | null;
  const match = receiptMatchDecisionSchema.safeParse({
    receipt_id: stored?.receipt_id,
    decision: stored?.decision,
    transaction_id: stored?.transaction_id ?? null,
    revision: stored?.revision
  });
  if (!match.success) {
    // The decision *was* stored; saying otherwise would invite a repeat of a landed write.
    return routeError("The decision was saved but could not be read back in its published shape. Reload the list.", 500);
  }
  return Response.json({ match: match.data }, { headers: noStoreHeaders });
}
