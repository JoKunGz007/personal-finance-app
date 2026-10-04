import { routeError, strongOwnerClient } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";

// Custody state for /recovery: when the newest backup was recorded and how far the ledger has
// moved since. Both reads are plain selects under the strong-owner policy; no new privilege.
export async function GET() {
  const auth = await strongOwnerClient();
  if (!auth.ok) return routeError(auth.message, auth.status);
  const [record, sequences] = await Promise.all([
    auth.supabase.from("backup_records").select("exported_at").order("exported_at", { ascending: false }).limit(1).maybeSingle(),
    auth.supabase.from("mutation_sequences").select("sequence,last_exported_sequence").limit(1).maybeSingle()
  ]);
  if (record.error || sequences.error) return routeError("Backup status could not be read.", 400);
  let sequence: bigint | null = null;
  let exported: bigint | null = null;
  try {
    if (sequences.data) {
      sequence = BigInt(sequences.data.sequence);
      exported = BigInt(sequences.data.last_exported_sequence);
    }
  } catch {
    return routeError("Backup status could not be read.", 400);
  }
  return Response.json({
    lastExportedAt: record.data?.exported_at ?? null,
    changesSince: sequence !== null && exported !== null && sequence > exported ? (sequence - exported).toString() : null
  }, { headers: { "Cache-Control": "no-store" } });
}
