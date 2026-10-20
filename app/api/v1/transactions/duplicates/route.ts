import { noStoreHeaders, routeError, strongOwnerClient } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";

/** Rows the owner marked as duplicates (migration 062): excluded, with a marker only re-including clears. */
export async function GET() {
  const auth = await strongOwnerClient();
  if (!auth.ok) return routeError(auth.message, auth.status);
  const { data, error } = await auth.supabase.rpc("list_duplicate_transactions");
  if (error) return routeError("Duplicate rows could not be loaded.", 400);
  return Response.json({ ids: data }, { headers: noStoreHeaders });
}
