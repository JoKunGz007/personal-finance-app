import { z } from "zod";
import { noStoreHeaders, routeError, strongOwnerClient } from "@/lib/server/supabase";
import { slipMatchDecisionSchema, slipMatchRequestSchema } from "@/lib/slips";

export const dynamic = "force-dynamic";

/**
 * The owner's say over a match, from the app (migration 012, D-067).
 *
 * `public.set_slip_match` is the only write path onto either decision table — `authenticated`
 * holds no insert, update or delete on them — so this route is a boundary rather than an
 * implementation: zod checks the shape, the RPC checks the money, and every refusal below is
 * the database's, translated into something the ledger view can say.
 *
 * PUT rather than POST for the same reason the overlay route uses it: the decision is one row
 * per slip, and sending it twice must land in the same place rather than accumulate.
 */
export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await strongOwnerClient();
  if (!auth.ok) return routeError(auth.message, auth.status);
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) return routeError("Slip id is invalid.", 400);
  const parsed = slipMatchRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return routeError("The match decision is invalid.", 422, parsed.error.flatten());

  const { data, error } = await auth.supabase.rpc("set_slip_match", {
    p_slip_id: id,
    p_expected_revision: parsed.data.expectedRevision,
    p_decision: parsed.data.decision,
    p_transaction_id: parsed.data.transactionId
  });

  if (error) {
    // Each of these is a refusal the owner can act on, so each gets its own words. The RPC's
    // own message is never echoed: it is written for a developer reading a stack trace, and
    // a database message can name a stored value.
    const message = error.message;
    if (message.includes("revision conflict")) {
      return routeError("This slip's match changed in another session. Reload the ledger and try again.", 409);
    }
    if (message.includes("already claimed")) {
      return routeError("Another slip is already matched to that statement row. Undo that match first.", 409);
    }
    // The D-067 guard, and the one most likely to be met by an owner doing something
    // reasonable: an override resolves an ambiguity or rejects a wrong pairing, and is not a
    // way to declare that two different sums are the same payment.
    if (message.includes("bank mismatch")) {
      return routeError("That statement row is at a different bank from the slip, so it cannot be the same payment.", 422);
    }
    if (message.includes("amount mismatch")) {
      return routeError("That statement row's amount is not the slip's amount, so it cannot be the same payment.", 422);
    }
    if (message.includes("slip not owned")) return routeError("That slip does not exist.", 404);
    if (message.includes("transaction not owned")) return routeError("That statement row does not exist.", 422);
    return routeError("The match decision could not be saved.", 400);
  }

  // The RPC returns the whole stored row, which carries the owner id and a timestamp neither
  // the view nor anything else needs. Narrowed to the published shape here rather than passed
  // through, so the response is the same contract the listing returns.
  const stored = data as Record<string, unknown> | null;
  const match = slipMatchDecisionSchema.safeParse({
    slip_id: stored?.slip_id,
    decision: stored?.decision,
    transaction_id: stored?.transaction_id ?? null,
    revision: stored?.revision
  });
  if (!match.success) {
    // The decision *was* stored — this is a read-back failure, and saying otherwise would
    // invite the owner to repeat a write that has already landed.
    return routeError("The decision was saved but could not be read back in its published shape. Reload the ledger.", 500);
  }
  return Response.json({ match: match.data }, { headers: noStoreHeaders });
}
