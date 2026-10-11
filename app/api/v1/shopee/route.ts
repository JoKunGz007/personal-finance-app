import { loadShopeeView } from "@/lib/server/shopee";
import { noStoreHeaders, routeError, strongOwnerClient } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";

/** Stored Shopee orders with their breakdowns, the owner's matches and the read-time proposals (D-270). */
export async function GET() {
  const auth = await strongOwnerClient();
  if (!auth.ok) return routeError(auth.message, auth.status);
  const loaded = await loadShopeeView(auth.supabase);
  if (!loaded.ok) return routeError(loaded.message, loaded.status);
  return Response.json(loaded.view, { headers: noStoreHeaders });
}
