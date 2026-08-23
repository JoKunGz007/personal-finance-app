import {
  buildManifest, syncSince, type SyncManifest
} from "@/lib/statement-sync";
import { findAttachments, mailboxConfig, openMailbox } from "@/lib/server/statement-mailbox-session";
import { noStoreHeaders, routeError, strongOwnerClient } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";
// Node, not edge: this opens a TLS socket to an IMAP server, which the edge runtime cannot do.
export const runtime = "nodejs";

/**
 * Lists the statement PDFs waiting in the dedicated mailbox. Bytes are fetched separately.
 *
 * ## Why this is a list and not one call that returns everything
 *
 * **A single "fetch all" would hold every attachment in one server process and return them in one
 * response body**, which is a memory bound nobody set and a response size the hosting platform caps
 * independently of anything in this repository. Listing first keeps the server holding one
 * attachment at a time, lets the page show what it found before any of it has been downloaded, and
 * makes a failure specific — one statement that will not download is one row saying so rather than
 * a whole sync that failed.
 *
 * The cost is one IMAP session per request instead of one per sync. That is seconds on a button
 * pressed by hand, and it is the right side of the trade.
 *
 * ## What it does not claim
 *
 * **It never says a statement is "already imported".** The local fetcher can, because it owns the
 * folder it writes to and can compare filenames. A route has no folder. The import worklist already
 * blocks a repeat on the PDF's own SHA-256 (D-141), which is a stronger check than a filename and
 * happens where the bytes actually are — so this reports the mailbox and lets the digest do the
 * deduplicating rather than inventing server-side state to hold a watermark.
 *
 * ## Gate
 *
 * `strongOwnerClient()` like every other owner-bound route: aal2 plus a verified TOTP factor, which
 * is what `private.has_strong_owner_access` requires of every write path (D-093). Reading the
 * owner's bank mail is not a lesser act than reading his ledger, so it is not a lesser gate.
 */
export async function GET(request: Request) {
  const auth = await strongOwnerClient();
  if (!auth.ok) return routeError(auth.message, auth.status);

  const settings = mailboxConfig();
  if (!settings.ok) return routeError(settings.message, settings.status);

  const since = syncSince(new URL(request.url).searchParams);

  let session;
  try {
    session = await openMailbox(settings.config);
  } catch {
    // **The underlying message is deliberately not passed through.** `imapflow` puts the mailbox
    // address into its authentication errors, and this response reaches a browser, a devtools
    // network panel and anything that captures one. The remedy the owner needs is the same for
    // every cause anyway.
    return routeError(
      "The statement mailbox could not be opened. Check that the app password is current and that IMAP is enabled for that account.",
      502
    );
  }

  try {
    const { messages, found, truncated } = await findAttachments(session.client, settings.config.senders, since);
    const manifest: SyncManifest = buildManifest(found, messages, since, truncated);
    return Response.json(manifest, { headers: noStoreHeaders });
  } catch {
    return routeError("The mailbox was opened but could not be listed.", 502);
  } finally {
    await session.release();
  }
}
