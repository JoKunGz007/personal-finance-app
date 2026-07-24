import { z } from "zod";
import { isoDateSchema } from "@/lib/dates";
import { noStoreHeaders, routeError, strongOwnerClient } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";

const overlaySchema = z.object({
  expectedRevision: z.number().int().nonnegative(),
  description: z.string().trim().max(500).nullable(),
  counterparty: z.string().trim().max(240).nullable(),
  effectiveDate: isoDateSchema.nullable(),
  categoryId: z.string().uuid().nullable(),
  note: z.string().trim().max(2000).nullable(),
  includeInReporting: z.boolean()
}).strict();

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await strongOwnerClient();
  if (!auth.ok) return routeError(auth.message, auth.status);
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) return routeError("Transaction id is invalid.", 400);
  const parsed = overlaySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return routeError("The overlay is invalid.", 422, parsed.error.flatten());
  const { data, error } = await auth.supabase.rpc("update_transaction_overlay", {
    p_transaction_id: id,
    p_expected_revision: parsed.data.expectedRevision,
    p_overlay: {
      description: parsed.data.description,
      counterparty: parsed.data.counterparty,
      effective_date: parsed.data.effectiveDate,
      category_id: parsed.data.categoryId,
      note: parsed.data.note,
      include_in_reporting: parsed.data.includeInReporting
    }
  });
  if (error) return routeError(/revision/iu.test(error.message) ? "The transaction changed in another session. Reload and try again." : "The overlay could not be saved.", /revision/iu.test(error.message) ? 409 : 400);
  return Response.json({ overlay: data }, { headers: noStoreHeaders });
}
