import { z } from "zod";
import { accountListSchema } from "@/lib/accounts";
import { INBOX_STATEMENT_NAME } from "@/lib/inbox-queue";
import { confirmImport } from "@/lib/server/confirm-import";
import { downloadInboxObject } from "@/lib/server/inbox-object";
import { processInboxStatement } from "@/lib/server/inbox-statement";
import { readStatementPdf } from "@/lib/server/statement-pdf-node";
import { noStoreHeaders, routeError, strongOwnerClient } from "@/lib/server/supabase";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  objectName: z.string().regex(INBOX_STATEMENT_NAME),
  mode: z.enum(["import", "read"])
}).strict();

const FAILURE_STATUS = { NOT_FOUND: 404, TOO_LARGE: 413, ACCOUNTS_UNAVAILABLE: 502, LOOKUP_FAILED: 502 } as const;

export async function POST(request: Request) {
  const auth = await strongOwnerClient();
  if (!auth.ok) return routeError(auth.message, auth.status);
  let unknownBody: unknown;
  try {
    unknownBody = await request.json();
  } catch {
    return routeError("The request body is not valid JSON.", 400);
  }
  const parsed = bodySchema.safeParse(unknownBody);
  if (!parsed.success) return routeError("The request is invalid.", 422);

  const { supabase, user } = auth;
  const outcome = await processInboxStatement(parsed.data.mode, {
    download: () => downloadInboxObject(supabase, user.id, parsed.data.objectName),
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
    confirmImport: (body) => confirmImport(supabase, body)
  });

  if (outcome.kind === "failed") {
    return routeError("The statement could not be fetched.", FAILURE_STATUS[outcome.code], { code: outcome.code });
  }
  return Response.json(outcome, { status: 200, headers: noStoreHeaders });
}
