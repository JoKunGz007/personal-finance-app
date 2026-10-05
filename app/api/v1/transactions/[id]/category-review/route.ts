import { z } from "zod";
import { categoryReviewBodySchema } from "@/lib/transactions";
import { noStoreHeaders, routeError, strongOwnerClient } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";

/**
 * "Looks right" on a machine-set category (D-245). The body names the provenance revision the
 * owner was looking at; `review_transaction_category` refuses unless it is still the latest, so a
 * category that changed underneath is never confirmed by accident. Reviewing twice writes nothing.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await strongOwnerClient();
  if (!auth.ok) return routeError(auth.message, auth.status);
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) return routeError("Transaction id is invalid.", 400);
  const parsed = categoryReviewBodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return routeError("The review is invalid.", 422, parsed.error.flatten());
  const { data, error } = await auth.supabase.rpc("review_transaction_category", {
    p_transaction_id: id,
    p_overlay_revision: parsed.data.overlayRevision
  });
  if (error) {
    const stale = /not the latest/iu.test(error.message);
    return routeError(stale ? "The category changed in another session. Reload and try again." : "The category could not be confirmed.", stale ? 409 : 400);
  }
  return Response.json(data, { headers: noStoreHeaders });
}
