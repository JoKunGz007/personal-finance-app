import { z } from "zod";
import { noStoreHeaders, routeError, strongOwnerClient } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";

/**
 * The statistics window, as it arrives on the query string.
 *
 * Both ends are optional and independent — the RPC resolves an absent end to the ledger's own first
 * or last row, which is what makes "all time" the default rather than a special case the caller has
 * to ask for. An end before its start is refused here rather than in the database, because the
 * database's answer is an empty page and a caller that transposed two dates deserves to be told.
 */
const windowSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable()
}).refine(
  (w) => w.from === null || w.to === null || w.from <= w.to,
  "A statistics window ends on or after it starts."
);

// The size of the largest-movements list is the route's decision, not the caller's, on the same
// reasoning as the ledger's page size: a route that forwarded any number a query string carried
// would be handing back an unbounded read. The database clamps it too — that is the invariant.
const LARGEST_MOVEMENTS = 10;

export async function GET(request: Request) {
  const auth = await strongOwnerClient();
  if (!auth.ok) return routeError(auth.message, auth.status);

  const url = new URL(request.url);
  const parsed = windowSchema.safeParse({
    from: url.searchParams.get("from"),
    to: url.searchParams.get("to")
  });
  if (!parsed.success) return routeError("The statistics window is invalid.", 400);

  const { data, error } = await auth.supabase.rpc("ledger_statistics", {
    p_from: parsed.data.from,
    p_to: parsed.data.to,
    p_top_n: LARGEST_MOVEMENTS
  });
  if (error) return routeError("Statistics could not be loaded.", 400);

  // Returned verbatim, like the ledger page route. `ledgerStatisticsSchema` is `.strict()` on every
  // object, so a migration that adds a field fails the client parse by name rather than having the
  // page quietly ignore something the database now considers part of the answer.
  return Response.json(data, { headers: noStoreHeaders });
}
