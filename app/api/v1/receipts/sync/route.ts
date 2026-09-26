import type { ReceiptSyncReport } from "@/lib/receipts";
import { readReceiptPdfBytes } from "@/lib/server/receipt-pdf-node";
import { syncReceiptMail, type StoreReceipt } from "@/lib/server/receipt-mailbox";
import { captureReceipt } from "@/lib/server/receipt-store";
import { mailboxConfig, openMailbox } from "@/lib/server/statement-mailbox-session";
import { noStoreHeaders, routeError, strongOwnerClient } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";
// Node, not edge: this opens a TLS socket to an IMAP server, and pdf.js's legacy build needs Node.
export const runtime = "nodejs";
// The budget is checked only between messages, so it leaves room under `maxDuration` for one
// backfill bundle started just before it runs out; the page asks again while `truncated`.
export const maxDuration = 60;
const READ_BUDGET_MS = 20_000;

/**
 * Reads 7-Eleven e-tax invoices out of the statement mailbox and stores each receipt (D-232). The
 * server reads the PDF — the owner's choice — so the page sends nothing and gets back counts only.
 *
 * Same gate as the other Syncs: `strongOwnerClient()`, and every write goes through
 * `capture_receipt` under the owner's own session (`lib/server/receipt-store.ts`).
 */
export async function POST() {
  const started = Date.now();
  const auth = await strongOwnerClient();
  if (!auth.ok) return routeError(auth.message, auth.status);

  // Senders are statement sync's filter; this reads invoices by content, so it does not need them.
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

  const store: StoreReceipt = async (body) => {
    const captured = await captureReceipt(auth.supabase, body);
    if (captured.ok) return captured.data.captured ? "captured" : "alreadyStored";
    return captured.reason === "disagrees" ? "disagrees" : "storeRefused";
  };

  try {
    const report: ReceiptSyncReport = await syncReceiptMail(session.client, readReceiptPdfBytes, store, started + READ_BUDGET_MS);
    return Response.json(report, { headers: noStoreHeaders });
  } catch {
    return routeError("The mailbox was opened but its invoices could not be read.", 502);
  } finally {
    await session.release();
  }
}
