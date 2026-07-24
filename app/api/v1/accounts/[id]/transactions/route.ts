import { z } from "zod";
import { noStoreHeaders, routeError, strongOwnerClient } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await strongOwnerClient();
  if (!auth.ok) return routeError(auth.message, auth.status);
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) return routeError("Account id is invalid.", 400);
  const { data, error } = await auth.supabase.rpc("list_account_transactions", { p_account_id: id });
  if (error) return routeError("Transactions could not be loaded.", 400);
  return Response.json({ transactions: data }, { headers: noStoreHeaders });
}
