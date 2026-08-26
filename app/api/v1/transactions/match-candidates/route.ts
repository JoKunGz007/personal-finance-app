import { noStoreHeaders, routeError, strongOwnerClient } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";

/**
 * Every confirmed row that some captured record could be paired with, whatever page it falls on.
 *
 * **This is what lets the ledger page without moving the matching rule into SQL.** Reconciliation
 * is ~85 tested cases in TypeScript (D-120 refused re-implementing it in PL/pgSQL, which would be
 * one rule in two languages with tests for only one). Run over a page alone it would be wrong in a
 * way that matters: a slip that is genuinely ambiguous across the whole ledger — two rows it could
 * be — would see only the on-page one, pair with it, and render `verified` where the truth is
 * `needs-review`. That is a wrong answer about money, not a slow one.
 *
 * So the client reconciles over **page ∪ candidates**. These rows are evidence, not rows to show:
 * the page is what the ledger displays, and the combined-balance walk runs over the page only,
 * because candidates are scattered through history and would corrupt a running total.
 *
 * **Unpaged, and it stays small for a structural reason rather than a hopeful one.** The set is
 * bounded by how many slips and cards exist, not by how long the ledger is — each reaches only
 * rows of its exact amount at its own bank or account. `matchCandidates` and `cardMatchCandidates`
 * already want precisely this set for the manual chooser, so nothing new is being fetched so much
 * as fetched once and shared.
 */
export async function GET() {
  const auth = await strongOwnerClient();
  if (!auth.ok) return routeError(auth.message, auth.status);
  const { data, error } = await auth.supabase.rpc("list_match_candidates");
  if (error) return routeError("Match candidates could not be loaded.", 400);
  return Response.json({ candidates: data }, { headers: noStoreHeaders });
}
