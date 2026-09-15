import { contentDisposition, isSafePartPath, parseUid, stepTimer, MAX_ATTACHMENT_BYTES } from "@/lib/statement-sync";
import { mailboxConfig, markFetched, openMailbox, verifyAttachment } from "@/lib/server/statement-mailbox-session";
import { routeError, strongOwnerClient } from "@/lib/server/supabase";

/** Shared by both handlers: the same `uid`/`part` validation the page's own request was built from. */
function parseAttachmentParams(request: Request): { uid: number; part: string } | null {
  const params = new URL(request.url).searchParams;
  const uid = parseUid(params.get("uid"));
  const part = params.get("part") ?? "";
  return uid === null || !isSafePartPath(part) ? null : { uid, part };
}

export const dynamic = "force-dynamic";
// Node, not edge: this opens a TLS socket to an IMAP server, which the edge runtime cannot do.
export const runtime = "nodejs";

/**
 * Streams one statement PDF out of the mailbox, still encrypted, to the owner's browser.
 *
 * ## What crosses which boundary
 *
 * **The bytes are the bank's own ciphertext and this app cannot open them.** The document password
 * is typed into the import form and reaches the pdf.js worker on the device; it is not a parameter
 * of this route, is not held by this deployment, and no code path here could use it. So statement
 * *reading* stays entirely on the device (D-128, D-129, D-141) — what changed is only how the
 * locked file gets to the device, and it was already sitting on Google's servers before it moved.
 *
 * The two alternatives were weighed in D-141 and rejected for reasons that have not changed.
 * Decrypting on the server would put a secret derived from the owner's citizen ID onto a third
 * party's infrastructure. Calling the Gmail API from the browser would need `connect-src` widened
 * past `'self'` and the Supabase origin, and the CSP is not weakened to make a feature work
 * (D-058). Proxying ciphertext needs neither.
 *
 * ## Why the pair is checked twice
 *
 * `uid` and `part` arrive from the page, so they are **client input into a mail server query**.
 * `lib/statement-sync.ts` refuses anything that is not a positive integer and a dotted-digit part
 * path — but a *well-formed* pair still names an arbitrary part of an arbitrary message. So the
 * mailbox itself is asked a second question before anything is downloaded: is this uid in the set
 * matching the configured senders, and is this part one of its PDF attachments? Either answer being
 * no is a 404. Without that, an owner-gated download route would also be a way to read any part of
 * any mail in the mailbox, which is more than this feature needs and therefore more than it should
 * have.
 *
 * ## Why it streams
 *
 * A buffered response would hold the whole PDF in the function and hit the platform's own response
 * size cap, which is set outside this repository and would surface as a truncated file rather than
 * an error. Streaming has a cost — the IMAP session must outlive the handler and is closed from the
 * stream's own lifecycle instead — which is why `openMailbox` returns an idempotent `release`:
 * `flush` and `cancel` can both run, and a cancelled download must not become a server error about
 * a mailbox.
 *
 * ## Downloading does not mark anything fetched
 *
 * A first draft flagged the mailbox message the moment a download completed, which meant a
 * statement downloaded but never confirmed — the batch cleared, the tab closed, the password never
 * typed — could not be synced again: the mailbox's own record of "fetched" would say otherwise
 * while the ledger's said the opposite. `POST` below is the honest place for that record: it fires
 * once `/api/v1/imports/confirm` has actually succeeded for the artifact this uid/part produced
 * (D-189), not merely once its bytes reached the browser.
 */
export async function GET(request: Request) {
  // Step durations only, reported as `Server-Timing` on the download — see `stepTimer`.
  const timer = stepTimer();
  const auth = await strongOwnerClient();
  if (!auth.ok) return routeError(auth.message, auth.status);
  timer.lap("auth");

  const settings = mailboxConfig();
  if (!settings.ok) return routeError(settings.message, settings.status);

  const parsed = parseAttachmentParams(request);
  if (!parsed) return routeError("That is not an attachment this app can ask for.", 422);
  const { uid, part } = parsed;

  let session;
  try {
    session = await openMailbox(settings.config);
  } catch {
    return routeError(
      "The statement mailbox could not be opened. Check that the app password is current and that IMAP is enabled for that account.",
      502
    );
  }

  timer.lap("imap-open");

  try {
    const attachment = await verifyAttachment(session.client, settings.config.senders, uid, part, timer.lap);
    if (!attachment) {
      await session.release();
      // Not found rather than forbidden, and deliberately the same answer for "no such message",
      // "not from a configured sender" and "not a PDF part". Distinguishing them would let the
      // shape of the mailbox be mapped one request at a time.
      return routeError("No statement attachment was found there.", 404);
    }
    if (attachment.sizeBytes > MAX_ATTACHMENT_BYTES) {
      await session.release();
      return routeError("That attachment is larger than this app will download.", 413);
    }

    const download = await session.client.download(uid, part, {
      uid: true,
      // Belt and braces against a body structure that understated its own size. The check above is
      // what produces a sentence; this is what bounds the memory if the server lied.
      maxBytes: MAX_ATTACHMENT_BYTES
    });
    timer.lap("download-start");

    // **Read in `pull`, not in `start`, and that is the difference between streaming and buffering.**
    // An `async start` that drains the source in one loop enqueues every chunk as fast as IMAP
    // delivers it, without ever consulting the consumer — `pull` is not called until `start`'s
    // promise settles, so the whole PDF accumulates in the stream's internal queue whenever the
    // reader is slower than the mail server. That is exactly the memory profile a buffered response
    // was rejected for, reached while calling itself a stream. Pulling one chunk at a time lets the
    // platform's backpressure actually reach the socket.
    const chunks = download.content[Symbol.asyncIterator]();
    const body = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const next = await chunks.next();
          if (next.done) {
            controller.close();
            await session.release();
            return;
          }
          const chunk = next.value as Uint8Array | Buffer;
          controller.enqueue(chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk));
        } catch (error) {
          // The session is released on every exit — done, thrown and cancelled — because the only
          // thing holding the mailbox open at this point is this stream.
          await session.release();
          controller.error(error);
        }
      },
      async cancel() {
        // The browser gave up — abandon the mailbox session rather than draining a file nobody
        // wants. `release` is idempotent, so racing the other two exits is harmless.
        download.content.destroy();
        await session.release();
      }
    });

    return new Response(body, {
      headers: {
        "Content-Type": "application/pdf",
        // `attachment` so no browser tries to render a password-protected PDF inline. Built by
        // `contentDisposition` rather than interpolated, because a Thai filename — the ordinary
        // case for these banks — cannot go in a bare `filename="…"`: Node refuses a header value
        // holding a code point above `\xFF`, and the download would fail outright rather than
        // arrive with a mangled name.
        "Content-Disposition": contentDisposition(attachment.name),
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Server-Timing": timer.header()
      }
    });
  } catch {
    await session.release();
    return routeError("That attachment could not be downloaded from the mailbox.", 502);
  }
}

/**
 * Records that one attachment has reached the ledger, so the next sync leaves it out.
 *
 * **Called once per confirmed statement, from `app/import-bench.tsx` right after
 * `/api/v1/imports/confirm` succeeds for the artifact this uid/part produced** — never from the
 * download itself (see the note above `GET`). A statement downloaded and then abandoned before
 * confirming is offered again next sync, which is the correct answer for something that never
 * reached the ledger.
 *
 * **Its second caller is the owner saying "Don't offer this again"** on a mailbox PDF the reader
 * refused as not a statement (D-195), from the same file and with the same empty body. The flag
 * means "Sync leaves this part out" in both cases; only who decided differs.
 *
 * **`uid`/`part` are re-verified here rather than trusted**, the same two questions `GET` asks: is
 * this uid in the set matching the configured senders, and is this part one of its PDF attachments?
 * The owner is already authenticated by the time this fires, so a mismatched pair can only mark the
 * wrong message as fetched on the owner's own mailbox — a minor, self-correcting annoyance rather
 * than a boundary crossed — but the check costs one more IMAP round trip on a path already paying
 * for one, and a route that skipped it here while paying for it on `GET` would be an inconsistency
 * with no argument behind it.
 */
export async function POST(request: Request) {
  const auth = await strongOwnerClient();
  if (!auth.ok) return routeError(auth.message, auth.status);

  const settings = mailboxConfig();
  if (!settings.ok) return routeError(settings.message, settings.status);

  const parsed = parseAttachmentParams(request);
  if (!parsed) return routeError("That is not an attachment this app can ask for.", 422);
  const { uid, part } = parsed;

  let session;
  try {
    session = await openMailbox(settings.config);
  } catch {
    return routeError(
      "The statement mailbox could not be opened. Check that the app password is current and that IMAP is enabled for that account.",
      502
    );
  }

  try {
    const attachment = await verifyAttachment(session.client, settings.config.senders, uid, part);
    if (!attachment) return routeError("No statement attachment was found there.", 404);
    if (!(await markFetched(session.client, uid, part))) {
      return routeError("The mailbox did not record that.", 502);
    }
    return Response.json({ ok: true });
  } catch {
    return routeError("Could not be recorded on the mailbox.", 502);
  } finally {
    await session.release();
  }
}
