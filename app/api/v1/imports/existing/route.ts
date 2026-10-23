import { z } from "zod";
import { importPayloadSchema } from "@/lib/statement";
import { buildRpcRows } from "@/lib/server/confirm-import";
import { existingFingerprints, existingImportRowCount } from "@/lib/server/fingerprint-lookup";
import { noStoreHeaders, routeError, strongOwnerClient } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";

// The same payload the bench posts to confirm, so the count and the confirm see one set of rows.
const existingBodySchema = z.object({
  payload: importPayloadSchema.refine((payload) => payload.rows.length <= 2000, "Too many rows to check.")
}).strict();

/**
 * What the owner already has for a statement, before Confirm: `existing` are the row fingerprints
 * stored exactly (per-row tags), `existingCount` is how many rows `confirm_import` would link to a
 * stored row by fingerprint or identity facts. Advisory: the review never blocks on a failure here.
 */
export async function POST(request: Request) {
  const auth = await strongOwnerClient();
  if (!auth.ok) return routeError(auth.message, auth.status);
  let unknownBody: unknown;
  try {
    unknownBody = await request.json();
  } catch {
    return routeError("The request body is not valid JSON.", 400);
  }
  const parsed = existingBodySchema.safeParse(unknownBody);
  if (!parsed.success) return routeError("The lookup request is invalid.", 422, parsed.error.flatten());

  const { payload } = parsed.data;
  const { fingerprints, rows } = await buildRpcRows(payload);
  const existing = await existingFingerprints(auth.supabase, payload.accountId, fingerprints);
  if (existing === null) return routeError("The existing rows could not be checked.", 502);
  const existingCount = await existingImportRowCount(auth.supabase, payload.accountId, rows);
  if (existingCount === null) return routeError("The existing rows could not be checked.", 502);
  return Response.json({ existing, existingCount }, { headers: noStoreHeaders });
}
