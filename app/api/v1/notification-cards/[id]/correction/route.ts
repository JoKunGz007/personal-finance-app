import { z } from "zod";
import { noStoreHeaders, routeError, strongOwnerClient } from "@/lib/server/supabase";
import { correctionRpcArgs } from "@/lib/corrections";
import {
  notificationCardCorrectionRequestSchema,
  notificationCardCorrectionSchema
} from "@/lib/notification-cards";

export const dynamic = "force-dynamic";

/**
 * Correcting a captured notification card (`public.set_notification_card_correction`,
 * migration 017) — the omission migration 016 recorded in its own comment.
 *
 * What the owner typed is what the owner may correct, and on a card that is nearly everything:
 * the amount, the **balance**, the direction, the date, the time, the counterparty, the category
 * and the note are all read off a screenshot by eye.
 *
 * **The account, the channel and the printed digits are not in the overlay at all.** The binding
 * was checked against those digits under that layout's mask at capture, and that check cannot be
 * re-made afterwards — `POST /api/v1/notification-cards` is the only layer that can make it and
 * the card row is append-only (D-101). The remedy for a wrong binding is to retire the card
 * through the decision route and capture it again correctly (D-103).
 *
 * Two refusals are worth knowing about, and both are stored-match conflicts. A match was accepted
 * because the card's amount equalled the row's movement to the satang; a correction that breaks
 * that is refused rather than quietly re-pairing. The balance half is the same rule with the
 * owner's own consent respected: a pairing he made *in spite of* a balance disagreement is not
 * re-refused for the disagreement it was made in spite of.
 */
export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await strongOwnerClient();
  if (!auth.ok) return routeError(auth.message, auth.status);
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) return routeError("Notification card id is invalid.", 400);

  const parsed = notificationCardCorrectionRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return routeError("The correction is invalid.", 422, parsed.error.flatten());

  const { data, error } = await auth.supabase.rpc("set_notification_card_correction", {
    p_card_id: id,
    ...correctionRpcArgs(parsed.data),
    p_balance_minor: parsed.data.balanceMinor
  });

  if (error) {
    const message = error.message;
    if (message.includes("revision conflict")) {
      return routeError("This card's correction changed in another session. Reload the ledger and try again.", 409);
    }
    // Named rather than fixed, and the words say what to do about it: the two sides of a stored
    // match would no longer agree, and only the owner can decide which of them is wrong.
    if (message.includes("conflicts with stored match")) {
      return routeError(
        "This card is matched to a statement row whose amount is the one you are changing. Undo that match first, then correct the card.",
        409
      );
    }
    if (message.includes("contradicts the matched row balance")) {
      return routeError(
        "This card is matched to a statement row that prints a different balance from the one you are typing. Undo that match first, or re-make it accepting the disagreement.",
        409
      );
    }
    if (message.includes("notification card not owned")) return routeError("That card does not exist.", 404);
    if (message.includes("category not owned")) return routeError("That category does not exist.", 422);
    return routeError("The correction could not be saved.", 400);
  }

  const stored = data as Record<string, unknown> | null;
  const correction = notificationCardCorrectionSchema.safeParse({
    card_id: stored?.card_id,
    kind: stored?.kind ?? null,
    // Null stays null in both money columns — the overlay reads an absent figure as "not
    // corrected", and `String(null)` would turn that into the text "null" and fail the parse.
    amount_minor: stored?.amount_minor === null || stored?.amount_minor === undefined ? null : String(stored.amount_minor),
    balance_minor: stored?.balance_minor === null || stored?.balance_minor === undefined ? null : String(stored.balance_minor),
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
