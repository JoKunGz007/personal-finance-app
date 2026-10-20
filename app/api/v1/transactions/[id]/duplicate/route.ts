import { z } from "zod";
import { markDuplicateBodySchema } from "@/lib/transactions";
import { noStoreHeaders, routeError, strongOwnerClient } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";

/**
 * Marks one row as a duplicate (migration 062): the database excludes it from reporting through the
 * same overlay write as Exclude, keeps every other overlay field, and records the marker. A replay
 * at the revision it already reached is a no-op; a stale revision is a 409, as on the overlay route.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await strongOwnerClient();
  if (!auth.ok) return routeError(auth.message, auth.status);
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) return routeError("Transaction id is invalid.", 400);
  const parsed = markDuplicateBodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return routeError("The duplicate mark is invalid.", 422, parsed.error.flatten());
  const { data, error } = await auth.supabase.rpc("mark_duplicate", {
    p_transaction_id: id,
    p_expected_revision: parsed.data.expectedRevision
  });
  if (error) return routeError(/revision/iu.test(error.message) ? "The transaction changed in another session. Reload and try again." : "The row could not be marked as a duplicate.", /revision/iu.test(error.message) ? 409 : 400);
  // Same shape the overlay route returns, so the ledger folds it back with the same schema.
  const overlay = data === null || typeof data !== "object"
    ? data
    : Object.fromEntries(Object.entries(data as Record<string, unknown>)
        .filter(([key]) => key !== "owner_id" && key !== "transaction_id"));
  return Response.json({ overlay }, { headers: noStoreHeaders });
}
