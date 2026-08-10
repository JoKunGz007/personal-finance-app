import { noStoreHeaders, routeError, strongOwnerClient } from "@/lib/server/supabase";
import { cashCaptureSchema, cashEntrySchema } from "@/lib/cash";

export const dynamic = "force-dynamic";

/**
 * The owner's cash entries and their corrections (migration 013, PLAN task 22).
 *
 * One response for both, for the reason the slips route gives about decisions (D-067): the
 * dangerous half-arrival is entries without their corrections, which shows a figure the owner
 * has already replaced and lets the ledger total it. So a failure on the second read fails the
 * whole thing rather than silently downgrading it to the uncorrected figures.
 */
export async function GET() {
  const auth = await strongOwnerClient();
  if (!auth.ok) return routeError(auth.message, auth.status);

  const { data, error } = await auth.supabase
    .from("cash_entries")
    .select("id,kind,amount_minor,currency,occurred_on,occurred_at_time,counterparty,category_id,note,created_at")
    .order("occurred_on", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) return routeError("Cash entries could not be loaded.", 400);

  const corrections = await auth.supabase
    .from("cash_entry_overlays")
    .select("cash_entry_id,kind,amount_minor,occurred_on,occurred_at_time,counterparty,category_id,note,revision,updated_at");
  if (corrections.error) return routeError("Cash entries could not be loaded.", 400);

  // bigint arrives as a JS number from PostgREST unless it is cast, so both amounts are
  // stringified here rather than trusted to survive JSON (D-018). A correction's amount is
  // nullable and a null must stay null: the overlay reads it as "not corrected", and turning
  // it into the string "null" would be restoring a correction the owner never made.
  const entries = (data ?? []).map((entry) => ({ ...entry, amount_minor: String(entry.amount_minor) }));
  const overlays = (corrections.data ?? []).map((correction) => ({
    ...correction,
    amount_minor: correction.amount_minor === null ? null : String(correction.amount_minor)
  }));
  return Response.json({ entries, corrections: overlays }, { headers: noStoreHeaders });
}

/**
 * Recording a cash payment (`public.create_cash_entry`).
 *
 * POST rather than PUT, and the difference from slip capture is the point: a slip carries a QR
 * reference that is an external identity, so capturing one twice is one slip and the RPC says
 * so. Cash has no such identity — two identical payments on one day are two payments — so this
 * creates every time and there is nothing to be idempotent on.
 */
export async function POST(request: Request) {
  const auth = await strongOwnerClient();
  if (!auth.ok) return routeError(auth.message, auth.status);

  const parsed = cashCaptureSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return routeError("The cash entry is invalid.", 422, parsed.error.flatten());

  const { data, error } = await auth.supabase.rpc("create_cash_entry", {
    p_kind: parsed.data.kind,
    // Money crosses this boundary as canonical int64 text, never as a JSON number (D-002).
    p_amount_minor: parsed.data.amountMinor,
    p_occurred_on: parsed.data.occurredOn,
    p_occurred_at_time: parsed.data.occurredAtTime,
    p_counterparty: parsed.data.counterparty,
    p_category_id: parsed.data.categoryId,
    p_note: parsed.data.note
  });

  if (error) {
    // The one refusal a caller can act on. Everything else is a contract violation this route
    // should not have been able to produce, and its message is deliberately not echoed — a
    // database message can name a stored value.
    if (error.message.includes("category not owned")) return routeError("That category does not exist.", 422);
    return routeError("The cash entry could not be saved.", 400);
  }

  // The RPC returns the stored row whole, owner id included. Narrowed to the published shape
  // rather than passed through, so what comes back is the contract the listing returns.
  const stored = data as Record<string, unknown> | null;
  const entry = cashEntrySchema.safeParse({
    id: stored?.id,
    kind: stored?.kind,
    amount_minor: String(stored?.amount_minor),
    currency: stored?.currency,
    occurred_on: stored?.occurred_on,
    occurred_at_time: stored?.occurred_at_time ?? null,
    counterparty: stored?.counterparty ?? null,
    category_id: stored?.category_id ?? null,
    note: stored?.note ?? null,
    created_at: stored?.created_at
  });
  if (!entry.success) {
    // The entry *was* written — saying otherwise would invite the owner to repeat a payment
    // record that has already landed, and this table is append-only.
    return routeError("The cash entry was saved but could not be read back in its published shape. Reload the ledger.", 500);
  }
  return Response.json({ entry: entry.data }, { status: 201, headers: noStoreHeaders });
}
