import { noStoreHeaders, routeError, strongOwnerClient } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";

/**
 * Receipt statistics, computed in the database over every receipt (migration 031) — never over
 * the rows the receipt list happened to hold, which is also what keeps them clear of PostgREST's
 * row cap. Returned verbatim; `receiptStatisticsSchema` is strict, so the client refuses drift.
 */
export async function GET() {
  const auth = await strongOwnerClient();
  if (!auth.ok) return routeError(auth.message, auth.status);
  const { data, error } = await auth.supabase.rpc("receipt_statistics");
  if (error) return routeError("Receipt statistics could not be loaded.", 400);
  return Response.json(data, { headers: noStoreHeaders });
}
