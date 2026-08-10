import { z } from "zod";
import { noStoreHeaders, routeError, strongOwnerClient } from "@/lib/server/supabase";
import { cashCorrectionSchema } from "@/lib/cash";
import { correctionRequestSchema, correctionRpcArgs } from "@/lib/corrections";

export const dynamic = "force-dynamic";

/**
 * Correcting a cash entry (`public.set_cash_entry_correction`, migration 013).
 *
 * The entry itself is append-only — `cash_entries_immutable` refuses an update outright — so
 * this writes an overlay beside it and an append-only revision behind that. Cash is the one
 * figure in this ledger with no bank statement to check it against, which is exactly why what
 * was first typed is kept rather than replaced.
 *
 * PUT, because the correction is one row per entry: sending it twice must land in the same
 * place rather than accumulate.
 */
export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await strongOwnerClient();
  if (!auth.ok) return routeError(auth.message, auth.status);
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) return routeError("Cash entry id is invalid.", 400);

  const parsed = correctionRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return routeError("The correction is invalid.", 422, parsed.error.flatten());

  const { data, error } = await auth.supabase.rpc("set_cash_entry_correction", {
    p_cash_entry_id: id,
    ...correctionRpcArgs(parsed.data)
  });

  if (error) {
    const message = error.message;
    if (message.includes("revision conflict")) {
      return routeError("This entry's correction changed in another session. Reload the ledger and try again.", 409);
    }
    if (message.includes("cash entry not owned")) return routeError("That cash entry does not exist.", 404);
    if (message.includes("category not owned")) return routeError("That category does not exist.", 422);
    return routeError("The correction could not be saved.", 400);
  }

  const stored = data as Record<string, unknown> | null;
  const correction = cashCorrectionSchema.safeParse({
    cash_entry_id: stored?.cash_entry_id,
    kind: stored?.kind ?? null,
    // Null stays null: the overlay reads an absent amount as "not corrected", and stringifying
    // it would be reporting back a correction the owner did not make.
    amount_minor: stored?.amount_minor === null || stored?.amount_minor === undefined ? null : String(stored.amount_minor),
    occurred_on: stored?.occurred_on ?? null,
    occurred_at_time: stored?.occurred_at_time ?? null,
    counterparty: stored?.counterparty ?? null,
    category_id: stored?.category_id ?? null,
    note: stored?.note ?? null,
    revision: stored?.revision,
    updated_at: stored?.updated_at
  });
  if (!correction.success) {
    // Stored, but unreadable in the published shape. Saying it failed would invite a repeat of
    // a write that has landed and bumped the revision, which the next attempt would 409 on.
    return routeError("The correction was saved but could not be read back in its published shape. Reload the ledger.", 500);
  }
  return Response.json({ correction: correction.data }, { headers: noStoreHeaders });
}
