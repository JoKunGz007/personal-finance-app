import { noStoreHeaders, routeError, strongOwnerClient } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";

/**
 * Every confirmed row a captured record could be paired with **by hand**: same bank (slip) or
 * account (card) and exact amount, with no date window (D-067). Unlike `match-candidates`, which
 * the ledger load fetches and which is bounded by date, this is fetched only when the owner starts
 * choosing a row, so its unbounded scan is paid on demand (D-158).
 */
export async function GET() {
  const auth = await strongOwnerClient();
  if (!auth.ok) return routeError(auth.message, auth.status);
  const { data, error } = await auth.supabase.rpc("list_chooser_candidates");
  if (error) return routeError("Chooser candidates could not be loaded.", 400);
  return Response.json({ candidates: data }, { headers: noStoreHeaders });
}
