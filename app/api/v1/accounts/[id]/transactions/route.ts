import { z } from "zod";
import { noStoreHeaders, routeError, strongOwnerClient } from "@/lib/server/supabase";
import { LEDGER_PAGE_SIZE } from "@/lib/transactions";

export const dynamic = "force-dynamic";

/**
 * The cursor, as it arrives on the query string.
 *
 * All three parts or none — a partial cursor would walk a different sequence than the sort and
 * skip rows in silence, which is the worse half of every paging bug. The database refuses one too
 * (`incomplete ledger page cursor`); this refuses it earlier and with wording a caller can act on,
 * and the two together mean neither side is trusting the other to have checked.
 *
 * `beforeTime` is the exception and deliberately so: a statement row may carry no time, so an
 * absent time is a real cursor position rather than a missing parameter. `nulls last` is what
 * makes it unambiguous — an untimed row sorts after every timed row on its day.
 */
const cursorSchema = z.object({
  beforeDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  beforeTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).nullable(),
  beforeId: z.string().uuid().nullable()
}).refine(
  (cursor) => (cursor.beforeDate === null) === (cursor.beforeId === null),
  "A ledger page cursor needs its date and its id together."
);

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await strongOwnerClient();
  if (!auth.ok) return routeError(auth.message, auth.status);
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) return routeError("Account id is invalid.", 400);

  const url = new URL(request.url);
  const cursor = cursorSchema.safeParse({
    beforeDate: url.searchParams.get("beforeDate"),
    beforeTime: url.searchParams.get("beforeTime"),
    beforeId: url.searchParams.get("beforeId")
  });
  if (!cursor.success) return routeError("The ledger page cursor is invalid.", 400);

  // The page size is the route's to decide, not the caller's. The database clamps it as well —
  // that is the invariant — but a route that forwarded any number a query string carried would be
  // handing back the unbounded read migration 021 exists to end.
  const { data, error } = await auth.supabase.rpc("list_account_transactions_page", {
    p_account_id: id,
    p_limit: LEDGER_PAGE_SIZE,
    p_before_date: cursor.data.beforeDate,
    p_before_time: cursor.data.beforeTime,
    p_before_id: cursor.data.beforeId
  });
  if (error) return routeError("Transactions could not be loaded.", 400);

  // Returned verbatim. `fingerprint` and `import_batch_rows` used to be deleted here because
  // changing the RPC needed a migration; migration 021 is that migration, so the database no
  // longer assembles what nothing reads and there is nothing left for this route to trim.
  // `ledgerTransactionSchema` is `.strict()` and fails by name if either comes back.
  return Response.json(data, { headers: noStoreHeaders });
}
