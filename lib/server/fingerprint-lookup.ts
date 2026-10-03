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

/** How many of `fingerprints` are already stored; null when any lookup fails. */
export async function existingFingerprintCount(
  client: SupabaseClient, accountId: string, fingerprints: readonly string[]
): Promise<number | null> {
  let found = 0;
  for (let start = 0; start < fingerprints.length; start += CHUNK) {
    const { data, error } = await client
      .from("source_transactions")
      .select("fingerprint")
      .eq("account_id", accountId)
      .in("fingerprint", fingerprints.slice(start, start + CHUNK));
    if (error) return null;
    found += data?.length ?? 0;
  }
  return found;
}
