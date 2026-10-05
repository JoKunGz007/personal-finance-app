import { noStoreHeaders, routeError, strongOwnerClient } from "@/lib/server/supabase";
import { autoCategorise } from "@/lib/server/auto-categorise";

export const dynamic = "force-dynamic";

/**
 * Machine categories (D-245). `POST` decides a category for every row the owner has not settled —
 * own transfer, match, history, keyword rule — and writes them through `apply_category_proposals`,
 * which never overwrites an owner's, a legacy or a reviewed category. A re-run writes nothing new.
 */
export async function POST() {
  const auth = await strongOwnerClient();
  if (!auth.ok) return routeError(auth.message, auth.status);
  const run = await autoCategorise(auth.supabase);
  // A failed chunk stops the run; the counts already committed travel with the error.
  if (!run.ok) return routeError(run.message, 400, run.result);
  return Response.json(run.result, { headers: noStoreHeaders });
}
