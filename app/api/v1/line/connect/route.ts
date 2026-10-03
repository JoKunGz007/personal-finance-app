import { noStoreHeaders, routeError, strongOwnerClient } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";

/**
 * The owner connects the LINE bot (D-241): stores the hash of `LINE_INBOX_SECRET` (its own random
 * value, not derived from the LINE channel secret), so `line_inbox_enqueue` will accept the webhook. Takes no input, and any body is ignored.
 * Needs the owner's strong session; the RPC checks strong access again.
 */
export async function POST() {
  const auth = await strongOwnerClient();
  if (!auth.ok) return routeError(auth.message, auth.status);
  const inboxSecret = process.env.LINE_INBOX_SECRET ?? "";
  if (inboxSecret.length < 32) return routeError("The LINE bot is not configured on this deployment.", 503);

  const { error } = await auth.supabase.rpc("set_line_webhook_secret", { p_secret: inboxSecret });
  if (error) return routeError("The LINE bot could not be connected.", 500);
  return Response.json({ connected: true }, { headers: noStoreHeaders });
}
