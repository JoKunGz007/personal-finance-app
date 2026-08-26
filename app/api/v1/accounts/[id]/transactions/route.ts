import { z } from "zod";
import { noStoreHeaders, routeError, strongOwnerClient } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";

/**
 * Drops `import_batch_rows` from every row the RPC returned.
 *
 * **Why here and not in the RPC.** `list_account_transactions` builds that array in SQL, and
 * changing it means a migration. This route can shed the bytes today without one, so it does.
 * Moving the trim into the function is the better fix and is left for the next migration —
 * until then the database still assembles the field and this discards it.
 *
 * **Why it is safe to drop.** Nothing reads it. `lib/transactions.ts` parsed it and no component,
 * no reconciliation and no total ever touched the parsed value; provenance reaches the backup
 * through `export_backup_snapshot`, which is a different path and is untouched. Measured on a row
 * carrying the field shape the parsers really write, it was **241 of 848 bytes — 28.4%** of the
 * object. At the ledger's present size that is roughly **290 KB of a 1,020 KB** response, and the
 * ledger now loads on arrival (PLAN task 43), so it was being paid on every visit.
 *
 * The rows are otherwise passed through untouched: this deletes a key and reshapes nothing.
 */
function withoutBatchProvenance(data: unknown): unknown {
  if (!Array.isArray(data)) return data;
  return data.map((row) => {
    if (typeof row !== "object" || row === null) return row;
    const rest = { ...(row as Record<string, unknown>) };
    delete rest.import_batch_rows;
    return rest;
  });
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await strongOwnerClient();
  if (!auth.ok) return routeError(auth.message, auth.status);
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) return routeError("Account id is invalid.", 400);
  const { data, error } = await auth.supabase.rpc("list_account_transactions", { p_account_id: id });
  if (error) return routeError("Transactions could not be loaded.", 400);
  return Response.json({ transactions: withoutBatchProvenance(data) }, { headers: noStoreHeaders });
}
