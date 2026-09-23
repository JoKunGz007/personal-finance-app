import { z } from "zod";
import { ledgerMatchRequestSchema } from "@/lib/ledger-match";
import { noStoreHeaders, routeError, strongOwnerClient } from "@/lib/server/supabase";

/**
 * The owner's say over which ledger row a document itemizes — a receipt (migration 030, D-212) or
 * a delivery order (migration 033, D-220) — shaped as the slip match route is. The RPC is the only
 * write path: zod checks the shape, the RPC checks the money, and every refusal below is the
 * database's, translated. PUT because the decision is one row per document: sending it twice lands
 * in the same place.
 */
export interface LedgerMatchRouteSpec<Decision> {
  rpc: "set_receipt_match" | "set_delivery_match";
  idArgument: "p_receipt_id" | "p_delivery_id";
  idField: "receipt_id" | "delivery_id";
  /** How the page names the document: "receipt" or "order". */
  noun: string;
  /** The RPC's refusal for a document this owner does not hold. */
  notOwned: string;
  decisionSchema: z.ZodType<Decision>;
  /** Refusals only one document has, matched on the RPC's message: [fragment, what to say, status]. */
  extraRefusals?: readonly (readonly [string, string, number])[];
}

export async function putLedgerMatch<Decision>(
  request: Request,
  context: { params: Promise<{ id: string }> },
  spec: LedgerMatchRouteSpec<Decision>
): Promise<Response> {
  const auth = await strongOwnerClient();
  if (!auth.ok) return routeError(auth.message, auth.status);
  const { id } = await context.params;
  const Noun = spec.noun[0]!.toUpperCase() + spec.noun.slice(1);
  if (!z.string().uuid().safeParse(id).success) return routeError(`${Noun} id is invalid.`, 400);
  const parsed = ledgerMatchRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return routeError("The match decision is invalid.", 422, parsed.error.flatten());

  const { data, error } = await auth.supabase.rpc(spec.rpc, {
    [spec.idArgument]: id,
    p_expected_revision: parsed.data.expectedRevision,
    p_decision: parsed.data.decision,
    p_transaction_id: parsed.data.transactionId
  });

  if (error) {
    // The RPC's own message is never echoed: a database message can name a stored value.
    const message = error.message;
    if (message.includes("revision conflict")) {
      return routeError(`This ${spec.noun}'s match changed in another session. Reload the list and try again.`, 409);
    }
    if (message.includes("already claimed")) {
      return routeError(`Another ${spec.noun} is already linked to that ledger row. Undo that link first.`, 409);
    }
    if (message.includes("amount mismatch")) {
      return routeError(`That ledger row's amount is not this ${spec.noun}'s total, so it cannot be the same payment.`, 422);
    }
    for (const [fragment, said, status] of spec.extraRefusals ?? []) {
      if (message.includes(fragment)) return routeError(said, status);
    }
    if (message.includes(spec.notOwned)) return routeError(`That ${spec.noun} does not exist.`, 404);
    if (message.includes("transaction not owned")) return routeError("That ledger row does not exist.", 422);
    return routeError("The match decision could not be saved.", 400);
  }

  const stored = data as Record<string, unknown> | null;
  const match = spec.decisionSchema.safeParse({
    [spec.idField]: stored?.[spec.idField],
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
