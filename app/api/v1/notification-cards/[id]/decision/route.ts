import { z } from "zod";
import { noStoreHeaders, routeError, strongOwnerClient } from "@/lib/server/supabase";
import {
  notificationCardDecisionRequestSchema,
  notificationCardDecisionSchema
} from "@/lib/notification-cards";

export const dynamic = "force-dynamic";

/**
 * The owner's say over one card (`public.set_notification_card_decision`, migration 017).
 *
 * Three things reach this route, and the third has no slip equivalent:
 *
 *   * `matched` — this card is that statement row, including where the automatic rule refused to
 *     say so;
 *   * `unmatched` — this card is on none of them;
 *   * `not-a-payment` — **retire it**. The card leaves the ledger rows and the totals while
 *     staying in its append-only table, because nothing here is ever deleted. This is the remedy
 *     for a card captured against the wrong account or captured twice, since the binding itself
 *     cannot be re-made (D-101, D-103). It is reversible: a decision is an overlay carrying a
 *     revision, so a card retired by mistake is un-retired by deciding something else.
 *
 * **The balance refusal is the one worth reading.** `set_notification_card_decision` compares the
 * card's corrected balance with the row's printed balance and refuses by default — the
 * fail-closed posture D-102 built into the automatic rule, kept for the override. It lifts only
 * when the request carries `acceptBalanceMismatch`, and that acknowledgement is then what gets
 * stored. The field defaults to false, so a client that omits it gets the refusal rather than the
 * override.
 */
export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await strongOwnerClient();
  if (!auth.ok) return routeError(auth.message, auth.status);
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) return routeError("Notification card id is invalid.", 400);

  const parsed = notificationCardDecisionRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return routeError("The decision is invalid.", 422, parsed.error.flatten());

  const { data, error } = await auth.supabase.rpc("set_notification_card_decision", {
    p_card_id: id,
    p_expected_revision: parsed.data.expectedRevision,
    p_decision: parsed.data.decision,
    p_transaction_id: parsed.data.transactionId,
    p_accept_balance_mismatch: parsed.data.acceptBalanceMismatch
  });

  if (error) {
    const message = error.message;
    if (message.includes("revision conflict")) {
      return routeError("This card's decision changed in another session. Reload the ledger and try again.", 409);
    }
    // The partial unique index. Another **card** already claims that row; a slip claiming it is
    // not a conflict and never reaches here (D-102).
    if (message.includes("already claimed by another notification card")) {
      return routeError("Another captured card is already matched to that statement row.", 409);
    }
    // The refusal this route exists to make legible. It is not an error in the request — it is
    // the cross-check doing its job, and the words say what the owner can do instead.
    if (message.includes("balance mismatch")) {
      return routeError(
        "That statement row prints a different balance from this card. Nothing was saved. If the card is right anyway — a hold can make an available balance differ from a remaining one — confirm the disagreement and it will be recorded with the match.",
        409
      );
    }
    if (message.includes("account mismatch")) {
      return routeError("That statement row belongs to a different account from the one this card was captured against.", 422);
    }
    if (message.includes("amount mismatch")) {
      return routeError("That statement row's movement is not this card's amount.", 422);
    }
    if (message.includes("notification card not owned")) return routeError("That card does not exist.", 404);
    if (message.includes("transaction not owned")) return routeError("That statement row does not exist.", 422);
    return routeError("The decision could not be saved.", 400);
  }

  const stored = data as Record<string, unknown> | null;
  const decision = notificationCardDecisionSchema.safeParse({
    card_id: stored?.card_id,
    decision: stored?.decision,
    transaction_id: stored?.transaction_id ?? null,
    accepted_balance_mismatch: stored?.accepted_balance_mismatch,
    revision: stored?.revision,
    updated_at: stored?.updated_at
  });
  if (!decision.success) {
    return routeError("The decision was saved but could not be read back in its published shape. Reload the ledger.", 500);
  }
  return Response.json({ decision: decision.data }, { headers: noStoreHeaders });
}
