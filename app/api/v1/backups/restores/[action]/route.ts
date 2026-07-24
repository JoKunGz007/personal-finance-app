import { restoreActionSchemas } from "@/lib/backup-contract";
import { noStoreHeaders, routeError, strongOwnerClient } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ action: string }> }) {
  const auth = await strongOwnerClient();
  if (!auth.ok) return routeError(auth.message, auth.status);
  const { action } = await context.params;
  if (!(action in restoreActionSchemas)) return routeError("Unknown restore action.", 404);
  const parsed = restoreActionSchemas[action as keyof typeof restoreActionSchemas].safeParse(await request.json().catch(() => null));
  if (!parsed.success) return routeError("Restore payload is invalid.", 422, parsed.error.flatten());
  const { data, error } = await auth.supabase.rpc("restore_backup", { p_action: action, p_request: parsed.data });
  if (error) return routeError(/not empty/iu.test(error.message) ? "Restore requires an empty destination ledger." : "Restore could not be applied.", /not empty/iu.test(error.message) ? 409 : 400);
  return Response.json({ restore: data }, { headers: noStoreHeaders });
}
