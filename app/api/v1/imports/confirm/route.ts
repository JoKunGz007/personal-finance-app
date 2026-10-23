import { confirmImport, confirmSchema } from "@/lib/server/confirm-import";
import { linkedBatchRowCount } from "@/lib/server/fingerprint-lookup";
import { noStoreHeaders, routeError, strongOwnerClient } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await strongOwnerClient();
  if (!auth.ok) return routeError(auth.message, auth.status);
  let unknownBody: unknown;
  try {
    unknownBody = await request.json();
  } catch {
    return routeError("The request body is not valid JSON.", 400);
  }
  const parsed = confirmSchema.safeParse(unknownBody);
  if (!parsed.success) return routeError("The import contract is invalid.", 422, parsed.error.flatten());

  const result = await confirmImport(auth.supabase, parsed.data);
  switch (result.kind) {
    case "refused": return routeError(result.message, 422, result.details);
    case "conflict": return routeError(result.message, 409);
    case "error": return routeError(result.message, 400);
    case "ok": {
      // How many rows the batch linked to already stored rows, read back from the batch as the Inbox
      // path does; null when that read fails (the import itself is committed).
      const linkedRows = await linkedBatchRowCount(auth.supabase, String(result.batchId));
      return Response.json(
        {
          batchId: result.batchId, payloadDigest: result.payloadDigest, fingerprints: result.fingerprints, warnings: result.warnings,
          linkedRows: linkedRows === null ? null : Math.min(linkedRows, parsed.data.payload.rows.length)
        },
        { status: 201, headers: noStoreHeaders }
      );
    }
  }
}
