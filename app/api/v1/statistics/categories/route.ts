import { statisticsWindowSchema } from "@/lib/statistics";
import { noStoreHeaders, routeError, strongOwnerClient } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";

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

  const { data, error } = await auth.supabase.rpc("spending_by_category", {
    p_from: parsed.data.from,
    p_to: parsed.data.to,
    p_account_id: parsed.data.account
  });
  if (error) return routeError("Spending by category could not be loaded.", 400);

  // Returned verbatim; `spendingByCategorySchema` is `.strict()` so a new field fails the client parse.
  return Response.json(data, { headers: noStoreHeaders });
}
