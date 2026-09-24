import type { DeliverySyncReport } from "@/lib/deliveries";
import { syncDeliveryMail } from "@/lib/server/delivery-mailbox";
import { orderStore, rideStore } from "@/lib/server/delivery-store";
import { mailboxConfig, openMailbox } from "@/lib/server/statement-mailbox-session";
import { noStoreHeaders, routeError, strongOwnerClient } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";
// Node, not edge: this opens a TLS socket to an IMAP server.
export const runtime = "nodejs";
// A backfill bundle is about a hundred receipts in one message; one request reads until the budget
// below and reports `truncated`, and the page asks again. The budget is checked only between
// messages, so it leaves room under `maxDuration` for one whole bundle — its download and up to a
// hundred captures — started just before the budget runs out.
export const maxDuration = 60;
const READ_BUDGET_MS = 20_000;

/**
 * Reads Grab e-receipts out of the statement mailbox and stores each new order and ride (PLAN
 * task 58 parts 1 and 5). The server reads the email — the owner's choice (D-218) — so the page sends nothing and
 * gets back counts only.
 *
 * Same gate as statement Sync: `strongOwnerClient()`, and every write goes through
 * `capture_delivery` or `capture_ride` under the owner's own session (`lib/server/delivery-store.ts`).
 */
export async function POST() {
  const started = Date.now();
  const auth = await strongOwnerClient();
  if (!auth.ok) return routeError(auth.message, auth.status);

  // Senders are statement sync's filter; this reads Grab mail by content, so it does not need them.
  const settings = mailboxConfig({ requireSenders: false });
  if (!settings.ok) return routeError(settings.message, settings.status);

  let session;
  try {
    session = await openMailbox(settings.config);
  } catch {
    // As statement Sync: imapflow's message can carry the mailbox address, so it is not passed on.
    return routeError(
      "The statement mailbox could not be opened. Check that the app password is current and that IMAP is enabled for that account.",
      502
    );
  }

  try {
    const report: DeliverySyncReport = await syncDeliveryMail(session.client, { orders: orderStore(auth.supabase), rides: rideStore(auth.supabase) }, started + READ_BUDGET_MS);
    return Response.json(report, { headers: noStoreHeaders });
  } catch {
    return routeError("The mailbox was opened but its e-receipts could not be read.", 502);
  } finally {
    await session.release();
  }
}
