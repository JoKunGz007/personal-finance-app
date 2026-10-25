import { safeErrorCode } from "@/lib/server/mail-sync-log";

/**
 * Records when the mail carrying a confirmed batch arrived (migration 064). Bookkeeping, so it never
 * fails the import: a missing arrival time or a refused call leaves one value-free line and moves on.
 */
export async function recordStatementMail(
  supabase: { rpc: (name: "record_statement_mail", args: { p_batch_id: string; p_received_at: string }) => PromiseLike<{ error: unknown }> },
  batchId: string,
  internalDate: Date | null
): Promise<void> {
  if (!internalDate) {
    console.warn("statement mail time not recorded", { code: "NO_INTERNAL_DATE" });
    return;
  }
  try {
    const { error } = await supabase.rpc("record_statement_mail", { p_batch_id: batchId, p_received_at: internalDate.toISOString() });
    if (error) console.warn("statement mail time not recorded", { code: safeErrorCode(error) });
  } catch (error) {
    console.warn("statement mail time not recorded", { code: safeErrorCode(error) });
  }
}

/** A replay whose earlier batch could not be looked up: the mail time is skipped, with the same line. */
export function logStatementMailSkipped(error: unknown): void {
  console.warn("statement mail time not recorded", { code: safeErrorCode(error) ?? "BATCH_LOOKUP_FAILED" });
}
