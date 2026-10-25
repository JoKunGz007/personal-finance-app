import { z } from "zod";
import { accountListSchema } from "@/lib/accounts";
import { confirmImport } from "@/lib/server/confirm-import";
import { existingImportRowCount, linkedBatchRowCount } from "@/lib/server/fingerprint-lookup";
import { processMailboxStatement } from "@/lib/server/mailbox-statement";
import { mailboxConfig, markFetchedOnSession, openMailbox, verifyAttachment } from "@/lib/server/statement-mailbox-session";
import { readStatementPdf, readStatementPdfPages } from "@/lib/server/statement-pdf-node";
import { logMailSyncFailure, logMailSyncStep } from "@/lib/server/mail-sync-log";
import { logStatementMailSkipped, recordStatementMail } from "@/lib/server/statement-mail";
import { noStoreHeaders, routeError, strongOwnerClient } from "@/lib/server/supabase";
import { isSafePartPath, MAX_ATTACHMENT_BYTES, parseUid, stepTimer } from "@/lib/statement-sync";

export const runtime = "nodejs";
// Fluid compute is on (Hobby allows 300 s). One statement ran past 60 s on 2026-10-25 and was killed.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  uid: z.number(),
  part: z.string(),
  mode: z.enum(["import", "read", "dump"])
}).strict();

const FAILURE_STATUS = { NOT_FOUND: 404, TOO_LARGE: 413, ACCOUNTS_UNAVAILABLE: 502, LOOKUP_FAILED: 502 } as const;

/**
 * Opens one mailbox statement on the server, the same way an Inbox drop is opened (D-237): the
 * attachment is fetched through the existing mailbox session, then `processInboxStatement` reads it
 * with the server's stored passwords and, in import mode, saves it when it is clean. **This is the one
 * mailbox route that decrypts**, by design; `GET` on the attachment path still streams ciphertext.
 * `mode: "dump"` returns the masked structural dump instead (never imports, never flags).
 * The message is flagged fetched here, on the server, only after the statement is in the ledger
 * (captured or already there). `uid`/`part` are checked as the attachment route checks them, and
 * `verifyAttachment` re-derives them from the mailbox.
 *
 * Each step's duration is logged as it ends (fixed step names and milliseconds only), because a
 * request Vercel kills at `maxDuration` never sends its `Server-Timing` header. A step's time runs
 * from the previous lap, so it includes any work between the two.
 */
export async function POST(request: Request) {
  const timer = stepTimer(undefined, (step, ms) => logMailSyncStep("imports/mailbox/statement", step, ms));
  const auth = await strongOwnerClient();
  if (!auth.ok) return routeError(auth.message, auth.status);
  timer.lap("auth");

  const settings = mailboxConfig();
  if (!settings.ok) {
    if (settings.status >= 500) logMailSyncFailure("imports/mailbox/statement", "config", settings.status);
    return routeError(settings.message, settings.status);
  }

  let unknownBody: unknown;
  try {
    unknownBody = await request.json();
  } catch {
    return routeError("The request body is not valid JSON.", 400);
  }
  const parsed = bodySchema.safeParse(unknownBody);
  const uid = parsed.success ? parseUid(String(parsed.data.uid)) : null;
  if (!parsed.success || uid === null || !isSafePartPath(parsed.data.part)) {
    return routeError("That is not an attachment this app can ask for.", 422);
  }
  const { part, mode } = parsed.data;

  let session;
  try {
    session = await openMailbox(settings.config);
    timer.lap("imap-open");
  } catch (error) {
    logMailSyncFailure("imports/mailbox/statement", "open", 502, error);
    return routeError(
      "The statement mailbox could not be opened. Check that the app password is current and that IMAP is enabled for that account.",
      502
    );
  }

  const { supabase } = auth;
  let sourceName = "";
  // For the mail-arrival record (import mode only): the message's server arrival time, and the batch
  // the statement is in, by a fresh confirm or by the earlier one a replay finds.
  let internalDate: Date | null = null;
  let batchId: string | null = null;
  try {
    const outcome = await processMailboxStatement(mode, {
      download: async () => {
        const attachment = await verifyAttachment(session.client, settings.config.senders, uid, part);
        timer.lap("verify");
        if (!attachment) return { ok: false, code: "NOT_FOUND" };
        sourceName = attachment.name;
        internalDate = attachment.internalDate;
        if (attachment.sizeBytes > MAX_ATTACHMENT_BYTES) return { ok: false, code: "TOO_LARGE" };
        const download = await session.client.download(uid, part, { uid: true, maxBytes: MAX_ATTACHMENT_BYTES });
        const chunks: Buffer[] = [];
        for await (const chunk of download.content) chunks.push(Buffer.from(chunk as Uint8Array));
        // The bytes are in hand: do not hold the mailbox lock through decrypt and confirm. The login
        // stays, so the flag below does not pay for a second one (PLAN Open item 11).
        timer.lap("download");
        session.unlock();
        return { ok: true, bytes: new Uint8Array(Buffer.concat(chunks)) };
      },
      // Not wrapped for timing: the privacy guard holds this to one hand-off. Its time lands in the next
      // lap (measured 2026-10-25 at 0.1–0.6 s, PLAN Open item 11).
      readStatementPdf,
      readStatementPdfPages,
      // Read after the download has set it; only a masked dump ever shows it.
      get sourceName() { return sourceName; },
      listAccounts: async () => {
        const { data, error } = await supabase
          .from("accounts")
          .select("id,bank_code,label,account_type,last_four,currency,timezone")
          .order("label");
        timer.lap("accounts");
        if (error) return null;
        const list = accountListSchema.safeParse({ accounts: data });
        return list.success ? list.data.accounts : null;
      },
      artifactExists: async (artifactDigest) => {
        const { data, error } = await supabase
          .from("import_artifacts")
          .select("id")
          .eq("artifact_digest", artifactDigest)
          .limit(1);
        timer.lap("artifact-lookup");
        if (error) return null;
        const artifactId = data?.[0]?.id;
        if (typeof artifactId !== "string") return false;
        // A replay: find the batch the first import made, so its mail time can be recorded. Best effort.
        const { data: batches, error: batchError } = await supabase.from("import_batches").select("id").eq("artifact_id", artifactId).limit(1);
        const found = batches?.[0]?.id;
        if (typeof found === "string") batchId = found;
        else if (mode === "import") logStatementMailSkipped(batchError);
        return true;
      },
      existingRowCount: async (accountId, rows) => {
        const count = await existingImportRowCount(supabase, accountId, rows);
        timer.lap("existing-rows");
        return count;
      },
      linkedRowCount: async (batchId) => {
        const count = await linkedBatchRowCount(supabase, batchId);
        timer.lap("linked-rows");
        return count;
      },
      confirmImport: async (body) => {
        const result = await confirmImport(supabase, body, timer.lap);
        if (result.kind === "ok") batchId = String(result.batchId);
        return result;
      },
      // Flags on the download's login; a fresh one only if that has dropped.
      markFetched: () => markFetchedOnSession(session, () => openMailbox(settings.config), uid, part, timer.lap)
    });

    if (outcome.kind === "failed") {
      // 404 and 413 are answers about one statement, not faults; the 502 codes are lookups that failed.
      if (FAILURE_STATUS[outcome.code] >= 500) logMailSyncFailure("imports/mailbox/statement", "store", FAILURE_STATUS[outcome.code]);
      return routeError("The statement could not be fetched.", FAILURE_STATUS[outcome.code], { code: outcome.code });
    }
    if (mode === "import" && batchId && (outcome.kind === "captured" || outcome.kind === "duplicate")) {
      await recordStatementMail(supabase, batchId, internalDate);
    }
    return Response.json(outcome, { status: 200, headers: { ...noStoreHeaders, "Server-Timing": timer.header() } });
  } catch (error) {
    logMailSyncFailure("imports/mailbox/statement", "read", 502, error);
    return routeError("That attachment could not be downloaded from the mailbox.", 502, { code: "MAILBOX_FAILED" });
  } finally {
    await session.release();
  }
}
