// The second caller of `lib/server/statement-mailbox.ts`, and the one that runs on a server.
//
// `scripts/fetch-statements.mjs` is the first: it reads the mailbox and writes files to a folder.
// This one reads the same mailbox on behalf of a route and hands the bytes back to the owner's
// browser. **Neither implements IMAP** — the part that finds a statement in a message tree lives in
// `statement-mailbox.ts` and is imported here **unchanged**, which is what that module's own header
// says it exists for. Two copies of a fiddly protocol means one of them rots quietly.
//
// ## What differs from the script, and why
//
// **The credential is an environment variable here, and that is a real change in risk class.** The
// script reads the app password from stdin and never lets it touch a file, an argument or an
// environment (D-035). A route cannot prompt anybody, so a hosted deployment necessarily holds the
// credential — which is precisely why putting it into Vercel is a hosted-resource change the owner
// authorizes at the time, and why this module fails closed with a 503 and a sentence when it is
// absent rather than pretending to be configured.
//
// **It is a mailbox app password and not a document password, and the distinction is the whole
// argument.** This one is rotatable from a Google account page and is scoped to reading one mailbox
// that receives nothing but bank mail. A statement's document password derives from the owner's
// date of birth and citizen ID, is therefore non-rotatable, and **never comes near this file or any
// server**: the PDFs move as the bank encrypted them and are opened by pdf.js on the device
// (D-141). What transits is ciphertext this app cannot read and which already sits on Google's
// servers anyway.
//
// **`statement-mailbox.json` is not read here.** It is gitignored, so it does not exist in a
// deployment; the same two facts it carries come from the environment instead.
//
// **The mail is left untouched.** Nothing here marks as read, moves, flags or deletes anything —
// the same decision the script made, on the owner's grounds that the files also live in his main
// mail.

import { ImapFlow, type SearchObject } from "imapflow";
import { collectPdfParts, safeFileName, senderSearch } from "@/lib/server/statement-mailbox";
import { attachmentId, parseSenders, MAX_SYNC_ATTACHMENTS, type SyncAttachment } from "@/lib/statement-sync";

const HOST = "imap.gmail.com";
const PORT = 993;

export type MailboxConfig = {
  readonly user: string;
  readonly pass: string;
  readonly senders: readonly string[];
};

export type MailboxConfigResult =
  | { readonly ok: true; readonly config: MailboxConfig }
  | { readonly ok: false; readonly status: number; readonly message: string };

/**
 * The mailbox this deployment is allowed to read, from the environment.
 *
 * **503 rather than 500 when it is missing**, matching `strongOwnerClient()`'s answer to an
 * unconfigured Supabase: the app is not broken, it is not set up, and those want different
 * sentences. The refusal names which of the three is absent — the *names* of the variables are not
 * secret and saying which one is unset is the difference between a fixable message and a shrug.
 * **It never names the values**, and the password is never compared, logged or echoed.
 */
export function mailboxConfig(): MailboxConfigResult {
  const user = process.env.STATEMENT_MAILBOX_USER?.trim();
  const pass = process.env.STATEMENT_MAILBOX_APP_PASSWORD;
  const senders = parseSenders(process.env.STATEMENT_MAILBOX_SENDERS);

  const missing: string[] = [];
  if (!user) missing.push("STATEMENT_MAILBOX_USER");
  // Trimmed only for emptiness. Gmail prints an app password in four groups of four and the spaces
  // are not part of it, so they are stripped the same way the script strips them — pasting them is
  // the commonest way this fails with a bare "invalid credentials" that explains nothing.
  const cleanedPass = (pass ?? "").replace(/\s+/gu, "");
  if (cleanedPass === "") missing.push("STATEMENT_MAILBOX_APP_PASSWORD");
  if (senders.length === 0) missing.push("STATEMENT_MAILBOX_SENDERS");

  if (missing.length > 0) {
    return {
      ok: false,
      status: 503,
      message: `The statement mailbox is not configured on this deployment (${missing.join(", ")} unset). Statements can still be imported from local files.`
    };
  }
  return { ok: true, config: { user: user as string, pass: cleanedPass, senders } };
}

export type MailboxSession = {
  readonly client: ImapFlow;
  /** Releases the mailbox lock and logs out. Safe to call more than once. */
  readonly release: () => Promise<void>;
};

/**
 * Signs in and takes the INBOX lock.
 *
 * **A lock rather than a bare `mailboxOpen`, and `release` is idempotent**, because the attachment
 * route hands its download stream to the platform and closes the session from the stream's own
 * lifecycle — where `finally` and `cancel` can both run. Releasing twice must not throw, or a
 * cancelled download would surface as a server error about a mailbox rather than as the cancelled
 * download it was.
 */
export async function openMailbox(config: MailboxConfig): Promise<MailboxSession> {
  const client = new ImapFlow({
    host: HOST,
    port: PORT,
    secure: true,
    auth: { user: config.user, pass: config.pass },
    // The library logs message subjects and addresses at info level, and a hosted platform captures
    // stdout into a retained log. Off entirely: this connection handles real financial mail, and a
    // log line naming a counterparty is exactly the value-free rule being broken by a library.
    logger: false,
    // Named so a mail server's connection list shows this app rather than a bare library default.
    clientInfo: { name: "private-ledger" },
    // **Auto-IDLE off, and both timeouts bounded, because a route is not a daemon.** The script can
    // afford to sit on a connection; a serverless invocation cannot — an unreachable mail server
    // would otherwise hold the function open until the platform killed it, which surfaces as a
    // gateway timeout with no sentence in it rather than as "the mailbox did not answer".
    disableAutoIdle: true,
    greetingTimeout: 10_000,
    socketTimeout: 30_000
  });

  await client.connect();
  let lock: Awaited<ReturnType<ImapFlow["getMailboxLock"]>> | null = null;
  try {
    lock = await client.getMailboxLock("INBOX");
  } catch (error) {
    await client.logout().catch(() => {});
    throw error;
  }

  let released = false;
  const release = async () => {
    if (released) return;
    released = true;
    try {
      lock?.release();
    } finally {
      await client.logout().catch(() => {});
    }
  };
  return { client, release };
}

/**
 * Every PDF attachment from the configured senders, newest UID first.
 *
 * **Only body structures are fetched, never bodies.** The message text is not downloaded at any
 * point, so nothing this process holds in memory is readable prose about the owner's finances —
 * the same restraint the script keeps, and it matters more here because this runs on somebody
 * else's machine.
 *
 * **Every PDF in a message is collected and none is judged.** A statement mail routinely carries
 * more than one and not all of them are statements, measured against the owner's three banks
 * (D-144). `readStatement` refuses a non-statement outright and it lands in the import worklist
 * saying so, which is the right place for that judgement and not here.
 */
export async function findAttachments(
  client: ImapFlow,
  senders: readonly string[],
  since: Date | null
): Promise<{ messages: number; found: SyncAttachment[]; truncated: boolean }> {
  const criteria = senderSearch(senders) as SearchObject;
  const search: SearchObject = since === null ? criteria : { ...criteria, since };
  const uids = await client.search(search, { uid: true });
  if (!uids || uids.length === 0) return { messages: 0, found: [], truncated: false };

  // Newest first, because a sync that hits the cap should keep the statements the owner is most
  // likely to be waiting for. The local fetcher has no such ordering because it has no cap.
  const ordered = [...uids].sort((left, right) => right - left);

  const found: SyncAttachment[] = [];
  let messages = 0;
  let truncated = false;
  for (const uid of ordered) {
    // **Stop at the cap here, not after the loop.** Every iteration is one IMAP round trip, and
    // the page offers "everything the senders ever sent" — so a mailbox holding years of bank mail
    // would issue thousands of sequential fetches inside one request, and end as a gateway timeout
    // with no sentence in it. That is the failure the bounded socket timeouts were added to avoid,
    // reached by a different road. `ordered` is newest-first, so the ones kept are the ones the
    // owner is most likely to be waiting for.
    if (found.length >= MAX_SYNC_ATTACHMENTS) {
      // There is more mail and we are deliberately not looking at it. The page is told so; it is
      // not told how much, because counting would be the scan this break exists to avoid.
      truncated = true;
      break;
    }
    const message = await client.fetchOne(uid, { bodyStructure: true }, { uid: true });
    if (!message || !message.bodyStructure) continue;
    const parts = collectPdfParts(message.bodyStructure, uid);
    // Counted only when the message actually contributed. Incrementing for every message with a
    // body structure produced "2 PDF(s) across 60 message(s)" on a mailbox where 58 of them were
    // ordinary mail — a sentence that reads like 58 statements went missing.
    if (parts.length === 0) continue;
    messages += 1;
    for (const attachment of parts) {
      found.push({
        id: attachmentId(uid, attachment.part),
        uid,
        part: attachment.part,
        // Cleaned with the same function the script writes files through. A mail-supplied filename
        // is attacker-controlled and reaches `new File(...)` in the browser, so it is sanitized
        // here rather than trusted there — and a name that cleans away to nothing gets one that
        // identifies the part instead of an empty label.
        name: safeFileName(attachment.declaredName, `statement-uid-${uid}-part-${attachment.part}.pdf`),
        sizeBytes: attachment.sizeBytes
      });
    }
  }
  return { messages, found, truncated };
}

/**
 * Whether one uid/part pair is a PDF attachment from a configured sender.
 *
 * **The attachment route re-derives this rather than trusting the pair the page sends back**, and
 * that is the check that keeps a download route from being a way to read any part of any message
 * in the mailbox. `lib/statement-sync.ts` already refuses a part path that is not dotted digits;
 * this is the second half, and it is the one that constrains *which* message — a well-formed part
 * path pointing at mail from anyone else is still refused here.
 *
 * It costs one body-structure fetch per download, which is a fraction of the attachment itself.
 */
export async function verifyAttachment(
  client: ImapFlow,
  senders: readonly string[],
  uid: number,
  part: string
): Promise<SyncAttachment | null> {
  const criteria = senderSearch(senders) as SearchObject;
  const uids = await client.search({ ...criteria, uid: String(uid) }, { uid: true });
  if (!uids || !uids.includes(uid)) return null;

  const message = await client.fetchOne(uid, { bodyStructure: true }, { uid: true });
  if (!message || !message.bodyStructure) return null;

  const match = collectPdfParts(message.bodyStructure, uid).find((item) => item.part === part);
  if (!match) return null;
  return {
    id: attachmentId(uid, match.part),
    uid,
    part: match.part,
    name: safeFileName(match.declaredName, `statement-uid-${uid}-part-${match.part}.pdf`),
    sizeBytes: match.sizeBytes
  };
}
