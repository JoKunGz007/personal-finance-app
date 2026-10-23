import { statisticsWindowSchema } from "@/lib/statistics";
import { noStoreHeaders, routeError, strongOwnerClient } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";

// The size of the largest-movements list is the route's decision, not the caller's, on the same
// reasoning as the ledger's page size: a route that forwarded any number a query string carried
// would be handing back an unbounded read. The database clamps it too — that is the invariant.
const LARGEST_MOVEMENTS = 10;

export async function GET(request: Request) {
  const auth = await strongOwnerClient();
  if (!auth.ok) return routeError(auth.message, auth.status);

  const url = new URL(request.url);
  const parsed = statisticsWindowSchema.safeParse({
    from: url.searchParams.get("from"),
    to: url.searchParams.get("to"),
    account: url.searchParams.get("account")
  });
  if (!parsed.success) return routeError("The statistics window is invalid.", 400);

  const { data, error } = await auth.supabase.rpc("ledger_statistics", {
    p_from: parsed.data.from,
    p_to: parsed.data.to,
    p_top_n: LARGEST_MOVEMENTS,
    // **Named rather than positional, which is what makes the fourth argument safe to add.**
    // Migration 024 dropped the three-argument signature instead of leaving it beside this one, so
    // there is exactly one `ledger_statistics` to resolve to and no ambiguity for PostgREST to
    // pick wrong.
    p_account_id: parsed.data.account
  });
  if (error) return routeError("Statistics could not be loaded.", 400);

  // Returned verbatim, like the ledger page route. `ledgerStatisticsSchema` is `.strict()` on every
  // object, so a migration that adds a field fails the client parse by name rather than having the
  // page quietly ignore something the database now considers part of the answer.
  return Response.json(data, { headers: noStoreHeaders });
}
