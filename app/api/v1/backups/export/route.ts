import { backupSnapshotSchema } from "@/lib/backup-contract";
import { canonicalJson, sha256Hex } from "@/lib/canonical";
import { routeError, strongOwnerClient } from "@/lib/server/supabase";
import { z } from "zod";

export const dynamic = "force-dynamic";

const acknowledgeSchema = z.object({
  digest: z.string().regex(/^[a-f0-9]{64}$/),
  snapshotSequence: z.string().regex(/^(?:0|[1-9]\d*)$/)
}).strict();

export async function GET() {
  const auth = await strongOwnerClient();
  if (!auth.ok) return routeError(auth.message, auth.status);
  const snapshot = await auth.supabase.rpc("export_backup_snapshot");
  if (snapshot.error) return routeError("Backup export could not be assembled.", 400);
  const parsed = backupSnapshotSchema.safeParse(snapshot.data);
  if (!parsed.success) return routeError("Backup export contract was invalid.", 500);
  const result = { digest: await sha256Hex(canonicalJson(parsed.data)), payload: parsed.data };
  const body = canonicalJson(result);
  return new Response(body, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json"
    }
  });
}

export async function POST(request: Request) {
  const auth = await strongOwnerClient();
  if (!auth.ok) return routeError(auth.message, auth.status);
  const parsed = acknowledgeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return routeError("Backup acknowledgement is invalid.", 422, parsed.error.flatten());
  const marked = await auth.supabase.rpc("mark_backup_exported", {
    p_payload_digest: parsed.data.digest,
    p_expected_sequence: parsed.data.snapshotSequence
  });
  if (marked.error) {
    const conflict = /sequence.*changed|snapshot.*conflict/iu.test(marked.error.message);
    return routeError(
      conflict ? "The ledger changed before backup custody was confirmed." : "Backup completion could not be recorded.",
      conflict ? 409 : 400
    );
  }
  return Response.json({ mutationSequence: marked.data }, {
    headers: { "Cache-Control": "no-store", "Content-Type": "application/json" }
  });
}
