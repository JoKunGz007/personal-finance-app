import { z } from "zod";
import { isUsableRange } from "@/lib/date-range";
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

/**
 * The window, which is **not** the cursor above (migration 024, PLAN task 47).
 *
 * Both are dates on the same request and they do different jobs: the cursor is where the last page
 * stopped and it walks, while these are bounds and they fence. A window narrower than a page still
 * pages, because the database applies the cursor *inside* the bounds rather than instead of them —
 * which is also why the two are parsed apart here instead of being folded into one object that
 * would invite reading either as the other.
 *
 * Each end is independently optional, and a transposed pair is refused here as well as in the
 * database (`ledger window ends before it begins`), so neither side is trusting the other.
 *
 * **The refusal itself is `isUsableRange`, not a copy of it.** `app/statistics-view.tsx` and
 * `app/transactions-view.tsx` both refuse a transposed pair client-side on that same function; a
 * second, independently written comparison here — even one that reads identically today — is
 * exactly the shape that drifts the day one of the two is touched and the other is not.
 */
const windowSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable()
}).refine(isUsableRange, "A ledger window ends on or after it starts.");

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
  const window = windowSchema.safeParse({
    from: url.searchParams.get("from"),
    to: url.searchParams.get("to")
  });
  // Its own message rather than the cursor's, because the two are separately hand-editable and a
  // caller told "the cursor is invalid" about a date he typed would go looking in the wrong place.
  if (!window.success) return routeError("The ledger window is invalid.", 400);

  // The page size is the route's to decide, not the caller's. The database clamps it as well —
  // that is the invariant — but a route that forwarded any number a query string carried would be
  // handing back the unbounded read migration 021 exists to end.
  const { data, error } = await auth.supabase.rpc("list_account_transactions_page", {
    p_account_id: id,
    p_limit: LEDGER_PAGE_SIZE,
    p_before_date: cursor.data.beforeDate,
    p_before_time: cursor.data.beforeTime,
    p_before_id: cursor.data.beforeId,
    // **The bounds, after the cursor and named rather than positional.** Migration 024 dropped the
    // five-argument signature rather than leaving it alongside, so there is one function to resolve
    // to. Absent bounds reproduce the old contract exactly, `totals` included.
    p_from: window.data.from,
    p_to: window.data.to
  });
  if (error) return routeError("Transactions could not be loaded.", 400);

  // Returned verbatim. `fingerprint` and `import_batch_rows` used to be deleted here because
  // changing the RPC needed a migration; migration 021 is that migration, so the database no
  // longer assembles what nothing reads and there is nothing left for this route to trim.
  // `ledgerTransactionSchema` is `.strict()` and fails by name if either comes back.
  return Response.json(data, { headers: noStoreHeaders });
}
