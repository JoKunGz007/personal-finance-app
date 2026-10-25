import { z } from "zod";
import { logMailSyncFailure } from "@/lib/server/mail-sync-log";
import { noStoreHeaders, routeError, strongOwnerClient } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ complete: z.boolean() }).strict();

// Records that a mailbox sync finished, and whether it read everything it meant to (migration 064).
// Bookkeeping about the mailbox, not ledger data: the RPC takes no ledger lock and writes no audit row.
export async function POST(request: Request) {
  const auth = await strongOwnerClient();
  if (!auth.ok) return routeError(auth.message, auth.status);
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return routeError("The sync record is invalid.", 400);

  const { data, error } = await auth.supabase.rpc("record_mail_sync", { p_complete: parsed.data.complete });
  if (error || typeof data !== "string") {
    logMailSyncFailure("mail-sync-runs", "store", 400, error);
    return routeError("The sync could not be recorded.", 400);
  }
  return Response.json({ finishedAt: data }, { headers: noStoreHeaders });
}
