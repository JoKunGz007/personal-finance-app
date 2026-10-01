import { z } from "zod";
import { accountListSchema } from "@/lib/accounts";
import { confirmImport } from "@/lib/server/confirm-import";
import { processMailboxStatement } from "@/lib/server/mailbox-statement";
import { mailboxConfig, markFetched, openMailbox, verifyAttachment } from "@/lib/server/statement-mailbox-session";
import { readStatementPdf } from "@/lib/server/statement-pdf-node";
import { noStoreHeaders, routeError, strongOwnerClient } from "@/lib/server/supabase";
import { isSafePartPath, MAX_ATTACHMENT_BYTES, parseUid } from "@/lib/statement-sync";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  uid: z.number(),
  part: z.string(),
  mode: z.enum(["import", "read"])
}).strict();

const FAILURE_STATUS = { NOT_FOUND: 404, TOO_LARGE: 413, ACCOUNTS_UNAVAILABLE: 502, LOOKUP_FAILED: 502 } as const;

/**
 * Opens one mailbox statement on the server, the same way an Inbox drop is opened (D-237): the
 * attachment is fetched through the existing mailbox session, then `processInboxStatement` reads it
 * with the server's stored passwords and, in import mode, saves it when it is clean. **This is the one
 * mailbox route that decrypts**, by design; `GET` on the attachment path still streams ciphertext.
 * The message is flagged fetched here, on the server, only after the statement is in the ledger
 * (captured or already there). `uid`/`part` are checked as the attachment route checks them, and
 * `verifyAttachment` re-derives them from the mailbox.
 */
export async function POST(request: Request) {
  const auth = await strongOwnerClient();
  if (!auth.ok) return routeError(auth.message, auth.status);

  const settings = mailboxConfig();
  if (!settings.ok) return routeError(settings.message, settings.status);

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
  } catch {
    return routeError(
      "The statement mailbox could not be opened. Check that the app password is current and that IMAP is enabled for that account.",
      502
    );
  }

  const { supabase } = auth;
  try {
    const outcome = await processMailboxStatement(mode, {
      download: async () => {
        const attachment = await verifyAttachment(session.client, settings.config.senders, uid, part);
        if (!attachment) return { ok: false, code: "NOT_FOUND" };
        if (attachment.sizeBytes > MAX_ATTACHMENT_BYTES) return { ok: false, code: "TOO_LARGE" };
        const download = await session.client.download(uid, part, { uid: true, maxBytes: MAX_ATTACHMENT_BYTES });
        const chunks: Buffer[] = [];
        for await (const chunk of download.content) chunks.push(Buffer.from(chunk as Uint8Array));
        return { ok: true, bytes: new Uint8Array(Buffer.concat(chunks)) };
      },
      readStatementPdf,
      listAccounts: async () => {
        const { data, error } = await supabase
          .from("accounts")
          .select("id,bank_code,label,account_type,last_four,currency,timezone")
          .order("label");
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
        return error ? null : (data?.length ?? 0) > 0;
      },
      confirmImport: (body) => confirmImport(supabase, body),
      markFetched: () => markFetched(session.client, uid, part)
    });

    if (outcome.kind === "failed") {
      return routeError("The statement could not be fetched.", FAILURE_STATUS[outcome.code], { code: outcome.code });
    }
    return Response.json(outcome, { status: 200, headers: noStoreHeaders });
  } catch {
    return routeError("That attachment could not be downloaded from the mailbox.", 502, { code: "MAILBOX_FAILED" });
  } finally {
    await session.release();
  }
}
