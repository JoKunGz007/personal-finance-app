import { noStoreHeaders, routeError, strongOwnerClient } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";

/**
 * Internal transfers excluded from reporting automatically (migration 026, D-207).
 *
 * `GET` lists the rows whose **current** exclusion the database wrote, so the ledger can label them.
 * `POST` runs the detection over the whole ledger; the import confirm route runs it too, so this is
 * for the first pass over rows imported before 026 and for a manual re-run. Rows the owner has ever
 * decided on are never touched — that rule lives in the function, not here.
 */
export async function GET() {
  const auth = await strongOwnerClient();
  if (!auth.ok) return routeError(auth.message, auth.status);
  const { data, error } = await auth.supabase.rpc("list_auto_excluded_transactions");
  if (error) return routeError("Automatically excluded rows could not be loaded.", 400);
  return Response.json({ ids: data }, { headers: noStoreHeaders });
}

export async function POST() {
  const auth = await strongOwnerClient();
  if (!auth.ok) return routeError(auth.message, auth.status);
  const { data, error } = await auth.supabase.rpc("auto_exclude_internal_transfers");
  if (error) return routeError("Internal transfers could not be checked.", 400);
  return Response.json(data, { headers: noStoreHeaders });
}
