import { z } from "zod";
import { noStoreHeaders, routeError, strongOwnerClient } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";

const createSchema = z.object({ name: z.string().trim().min(1).max(80) }).strict();
const patchSchema = z.object({ id: z.string().uuid(), name: z.string().trim().min(1).max(80), archived: z.boolean() }).strict();

export async function GET() {
  const auth = await strongOwnerClient();
  if (!auth.ok) return routeError(auth.message, auth.status);
  const { data, error } = await auth.supabase.from("categories").select("id,name,archived,created_at").order("name");
  if (error) return routeError("Categories could not be loaded.", 400);
  return Response.json({ categories: data }, { headers: noStoreHeaders });
}

export async function POST(request: Request) {
  const auth = await strongOwnerClient();
  if (!auth.ok) return routeError(auth.message, auth.status);
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return routeError("Category name is invalid.", 422, parsed.error.flatten());
  const { data, error } = await auth.supabase.rpc("mutate_category", { p_action: "create", p_id: null, p_name: parsed.data.name, p_archived: false });
  if (error) return routeError("Category could not be created.", error.code === "23505" ? 409 : 400);
  return Response.json({ category: data }, { status: 201, headers: noStoreHeaders });
}

export async function PATCH(request: Request) {
  const auth = await strongOwnerClient();
  if (!auth.ok) return routeError(auth.message, auth.status);
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return routeError("Category update is invalid.", 422, parsed.error.flatten());
  const { data, error } = await auth.supabase.rpc("mutate_category", { p_action: "update", p_id: parsed.data.id, p_name: parsed.data.name, p_archived: parsed.data.archived });
  if (error) return routeError("Category could not be updated.", error.code === "23505" ? 409 : 400);
  return Response.json({ category: data }, { headers: noStoreHeaders });
}
