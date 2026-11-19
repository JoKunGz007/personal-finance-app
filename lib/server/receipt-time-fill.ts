import { loadReceiptMatches } from "@/lib/server/current-matches";
import { safeErrorCode } from "@/lib/server/mail-sync-log";
import type { strongOwnerClient } from "@/lib/server/supabase";

type OwnerClient = Extract<Awaited<ReturnType<typeof strongOwnerClient>>, { ok: true }>["supabase"];

export interface ReceiptTimeFillReport {
  /** Receipts with no time and one current match, offered to `fill_receipt_time`. */
  attempted: number;
  /** How many of those the RPC filled. */
  filled: number;
}

/**
 * Offers each time-less receipt with a unique current match to `fill_receipt_time` (migration 067),
 * which fills the time from the receipt's recorded candidates only when the row and the lag rule
 * agree, and otherwise returns a no-op reason. The RPC owns every money and lag check.
 *
 * "Current match" is the app's own decision, reused: `loadReceiptMatches` (so `proposeReceiptMatches`,
 * whose automatic rule for a time-less receipt is `date_only_match`, plus the owner's stored link).
 * That read covers every receipt, so there is no cheaper per-receipt query; `receiptIds` only narrows
 * which of the loaded receipts are offered to the RPC. One load per call, never one per receipt.
 *
 * Best effort: never throws and never changes the caller's response. Logs counts and a sanitised
 * error code only. Call it after a write, never on a page read.
 */
export async function fillReceiptTimes(client: OwnerClient, options: { receiptIds?: readonly string[] } = {}): Promise<ReceiptTimeFillReport> {
  const report: ReceiptTimeFillReport = { attempted: 0, filled: 0 };
  try {
    const loaded = await loadReceiptMatches(client);
    if (!loaded.ok) {
      console.error("receipt time fill failed", { stage: "load", status: loaded.status });
      return report;
    }
    const only = options.receiptIds ? new Set(options.receiptIds) : null;
    const linked = new Map(loaded.decisions.filter((d) => d.decision === "matched").map((d) => [d.receipt_id, d.transaction_id]));
    const offers: Array<{ receiptId: string; transactionId: string }> = [];
    for (const receipt of loaded.receipts) {
      // Only a screenshot can carry time candidates: a full tax invoice never prints a time (D-232),
      // so offering it would take the ledger lock just to hear "no time candidates" on every import.
      if (receipt.purchased_at_time !== null || !receipt.sources.includes("screenshot") || (only && !only.has(receipt.id))) continue;
      const { status, row } = receipt.match;
      // `matched` is the single automatic row; `linked` is the owner's stored row (which may lie
      // outside the candidate read, so its id comes from the decision). Anything else holds nothing.
      const transactionId = status === "linked" ? (linked.get(receipt.id) ?? row?.transaction_id)
        : status === "matched" ? row?.transaction_id
        : undefined;
      if (transactionId) offers.push({ receiptId: receipt.id, transactionId });
    }
    for (const { receiptId, transactionId } of offers) {
      report.attempted += 1;
      const { data, error } = await client.rpc("fill_receipt_time", { p_receipt_id: receiptId, p_transaction_id: transactionId });
      if (error) {
        console.error("receipt time fill failed", { stage: "rpc", code: safeErrorCode(error) });
        continue;
      }
      if ((data as { filled?: unknown } | null)?.filled === true) report.filled += 1;
    }
    if (report.filled > 0) console.info("receipt time filled", { attempted: report.attempted, filled: report.filled });
  } catch (error) {
    console.error("receipt time fill failed", { stage: "unexpected", code: safeErrorCode(error) });
  }
  return report;
}
