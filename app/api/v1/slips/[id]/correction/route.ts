import { z } from "zod";
import { noStoreHeaders, routeError, strongOwnerClient } from "@/lib/server/supabase";
import { slipCorrectionSchema } from "@/lib/slips";
import { correctionRequestSchema, correctionRpcArgs } from "@/lib/corrections";

export const dynamic = "force-dynamic";

/**
 * Correcting a captured slip (`public.set_slip_correction`, migration 013) — the omission
 * migration 011 recorded in its own comment.
 *
 * What the owner typed is what the owner may correct. The bank, the QR code and the reference
 * are not in the overlay at all: they came from the QR under its own CRC, and the reference is
 * half the dedup key, so a correctable identity would let one slip be re-typed into another's.
 *
 * The refusal worth knowing about is the stored-match conflict. A match was accepted because
 * the slip's amount equalled the row's movement to the satang; a correction that breaks that
 * is refused rather than quietly re-pairing, because unmatching first is one click and it is
 * visible, while a silent re-pair is not.
 */
export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await strongOwnerClient();
  if (!auth.ok) return routeError(auth.message, auth.status);
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) return routeError("Slip id is invalid.", 400);

  const parsed = correctionRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return routeError("The correction is invalid.", 422, parsed.error.flatten());

  const { data, error } = await auth.supabase.rpc("set_slip_correction", {
    p_slip_id: id,
    ...correctionRpcArgs(parsed.data)
  });

  if (error) {
    const message = error.message;
    if (message.includes("revision conflict")) {
      return routeError("This slip's correction changed in another session. Reload the ledger and try again.", 409);
    }
    // Named rather than fixed, and the words say what to do about it: the two sides of a stored
    // match would no longer agree, and only the owner can decide which of them is wrong.
    if (message.includes("conflicts with stored match")) {
      return routeError(
        "This slip is matched to a statement row whose amount is the one you are changing. Undo that match first, then correct the slip.",
        409
      );
    }
    if (message.includes("slip not owned")) return routeError("That slip does not exist.", 404);
    if (message.includes("category not owned")) return routeError("That category does not exist.", 422);
    return routeError("The correction could not be saved.", 400);
  }

  const stored = data as Record<string, unknown> | null;
  const correction = slipCorrectionSchema.safeParse({
    slip_id: stored?.slip_id,
    kind: stored?.kind ?? null,
    // Null stays null — the overlay reads an absent amount as "not corrected".
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
    return routeError("The correction was saved but could not be read back in its published shape. Reload the ledger.", 500);
  }
  return Response.json({ correction: correction.data }, { headers: noStoreHeaders });
}
