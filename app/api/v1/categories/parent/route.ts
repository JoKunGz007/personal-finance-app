import { noStoreHeaders, routeError, strongOwnerClient } from "@/lib/server/supabase";
import { categoryParentBodySchema } from "@/lib/categories";

export const dynamic = "force-dynamic";

/**
 * Sets or removes (`parentId: null`) a category's parent through `set_category_parent` (D-245):
 * one level only, audited, and an unchanged link writes nothing. The database refuses a parent
 * that has a parent, a category with children, an archived parent and the category itself.
 */
export async function POST(request: Request) {
  const auth = await strongOwnerClient();
  if (!auth.ok) return routeError(auth.message, auth.status);
  const parsed = categoryParentBodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return routeError("The parent is invalid.", 422, parsed.error.flatten());
  const { data, error } = await auth.supabase.rpc("set_category_parent", { p_category_id: parsed.data.id, p_parent_id: parsed.data.parentId });
  if (error) return routeError("The parent could not be set.", 400);
  return Response.json(data, { headers: noStoreHeaders });
}
