import { z } from "zod";
import { overlayWriteBodySchema } from "@/lib/transactions";
import { noStoreHeaders, routeError, strongOwnerClient } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";

/**
 * **The whole overlay, every time, and `.strict()` is what makes that safe to require.**
 *
 * `update_transaction_overlay` writes with `on conflict do update set` over every column, so a
 * partial body is not a partial write — it is a full write with the omitted fields blank. Refusing
 * the partial body by name is the only version of this that fails loudly: the alternative, where a
 * control sends the rest as null, is *accepted* and erases what the owner typed.
 *
 * **The schema lives in `lib/transactions.ts` beside the builder that produces bodies for it**
 * (`overlayWriteBody`), so the two cannot drift and a Vitest case can assert the builder's output
 * against the contract this route actually enforces rather than against a copy of it.
 */
const overlaySchema = overlayWriteBodySchema;

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await strongOwnerClient();
  if (!auth.ok) return routeError(auth.message, auth.status);
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) return routeError("Transaction id is invalid.", 400);
  const parsed = overlaySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return routeError("The overlay is invalid.", 422, parsed.error.flatten());
  const { data, error } = await auth.supabase.rpc("update_transaction_overlay", {
    p_transaction_id: id,
    p_expected_revision: parsed.data.expectedRevision,
    p_overlay: {
      description: parsed.data.description,
      counterparty: parsed.data.counterparty,
      effective_date: parsed.data.effectiveDate,
      category_id: parsed.data.categoryId,
      note: parsed.data.note,
      include_in_reporting: parsed.data.includeInReporting
    }
  });
  if (error) return routeError(/revision/iu.test(error.message) ? "The transaction changed in another session. Reload and try again." : "The overlay could not be saved.", /revision/iu.test(error.message) ? 409 : 400);
  // **`owner_id` and `transaction_id` are dropped, and the shape that remains is the one the
  // ledger already parses.** The RPC returns `to_jsonb(o)`, which is the whole row; the ledger
  // reads overlays as `to_jsonb(o) - 'owner_id' - 'transaction_id'` (`list_account_transactions`),
  // and `transactionOverlaySchema` is strict about that difference. Stripping here means a stored
  // overlay can be folded straight back into the window instead of needing a second contract for
  // the same object — and it stops shipping the owner's uuid to a screen that never reads it,
  // which is D-155's rule about `fingerprint` arriving on a different field.
  const overlay = data === null || typeof data !== "object"
    ? data
    : Object.fromEntries(Object.entries(data as Record<string, unknown>)
        .filter(([key]) => key !== "owner_id" && key !== "transaction_id"));
  return Response.json({ overlay }, { headers: noStoreHeaders });
}
