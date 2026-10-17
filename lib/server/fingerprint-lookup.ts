import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Which of `fingerprints` the owner already has in `source_transactions` for `accountId`; null
 * when any lookup fails. `confirm_import` skips such rows silently, so the server import and the
 * review screen both ask first.
 * Read through the owner's own client (`strong_owner_select` policy). Chunked to keep the URL short.
 */
const CHUNK = 50;

export async function existingFingerprints(
  client: SupabaseClient, accountId: string, fingerprints: readonly string[]
): Promise<string[] | null> {
  const found = new Set<string>();
  for (let start = 0; start < fingerprints.length; start += CHUNK) {
    const { data, error } = await client
      .from("source_transactions")
      .select("fingerprint")
      .eq("account_id", accountId)
      .in("fingerprint", fingerprints.slice(start, start + CHUNK));
    if (error) return null;
    for (const row of data ?? []) found.add(String((row as { fingerprint: unknown }).fingerprint));
  }
  return [...found];
}

/**
 * How many of `rows` (the rows `confirm_import` would receive, see `buildRpcRows`) it would link to a
 * stored row, by exact fingerprint or identity facts; null when the call fails. The database applies
 * the one linking rule (`count_existing_import_rows`), read-only.
 */
export async function existingImportRowCount(
  client: SupabaseClient, accountId: string, rows: readonly unknown[]
): Promise<number | null> {
  const { data, error } = await client.rpc("count_existing_import_rows", { p_account_id: accountId, p_rows: rows });
  return error || typeof data !== "number" || !Number.isInteger(data) ? null : data;
}

/**
 * How many rows of `batchId` `confirm_import` linked to an already stored row; null when the read
 * fails. Read through the owner's own client (`strong_owner_select` policy).
 */
export async function linkedBatchRowCount(client: SupabaseClient, batchId: string): Promise<number | null> {
  const { count, error } = await client
    .from("import_batch_rows")
    .select("id", { count: "exact", head: true })
    .eq("batch_id", batchId)
    .eq("linked_existing", true);
  return error || count === null ? null : count;
}
