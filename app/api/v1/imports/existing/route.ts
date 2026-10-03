import { z } from "zod";
import { existingFingerprints } from "@/lib/server/fingerprint-lookup";
import { noStoreHeaders, routeError, strongOwnerClient } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";

const existingBodySchema = z.object({
  accountId: z.string().uuid(),
  fingerprints: z.array(z.string().regex(/^[0-9a-f]{64}$/)).max(2000)
}).strict();

/** Which of a statement's row fingerprints the owner already has; the review warns before Confirm. */
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

  const existing = await existingFingerprints(auth.supabase, parsed.data.accountId, parsed.data.fingerprints);
  if (existing === null) return routeError("The existing rows could not be checked.", 502);
  return Response.json({ existing }, { headers: noStoreHeaders });
}
