import { confirmImport, confirmSchema } from "@/lib/server/confirm-import";
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
    case "ok":
      return Response.json(
        { batchId: result.batchId, payloadDigest: result.payloadDigest, fingerprints: result.fingerprints, warnings: result.warnings },
        { status: 201, headers: noStoreHeaders }
      );
  }
}
