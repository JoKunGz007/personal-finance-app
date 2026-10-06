import { noStoreHeaders, routeError, strongOwnerClient } from "@/lib/server/supabase";
import { isComplete } from "@/lib/server/row-cap";
import { correctionRpcArgs, type CorrectionRequest } from "@/lib/corrections";
import { slipCaptureSchema } from "@/lib/slips";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await strongOwnerClient();
  if (!auth.ok) return routeError(auth.message, auth.status);
  const read = await auth.supabase
    .from("slips")
    .select("id,bank_code,slip_reference,kind,amount_minor,currency,occurred_on,occurred_at_time,counterparty,category_id,note,captured_at", { count: "exact" })
    .order("occurred_on", { ascending: false })
    .order("captured_at", { ascending: false });
  const { data, error } = read;
  if (error) return routeError("Slips could not be loaded.", 400);
  // PostgREST cuts a plain select at max_rows without saying so; a cut list is a refusal, never a shorter one.
  if (!isComplete(read)) return routeError("Slips could not be loaded in full, so none are shown.", 500);

  // The owner's stored decisions, on the same response as the slips they are about (D-067).
  // A decision that failed to arrive on its own would leave the ledger showing a pairing the
  // owner has already overruled, presented as the automatic rule's — so this failing fails the
  // whole read rather than silently downgrading it to the rule.
  const matches = await auth.supabase
    .from("slip_match_overlays")
    .select("slip_id,decision,transaction_id,revision", { count: "exact" });
  if (matches.error) return routeError("Slips could not be loaded.", 400);
  if (!isComplete(matches)) return routeError("Slips could not be loaded in full, so none are shown.", 500);

  // Corrections travel with the slips for a sharper version of the same argument (migration
  // 013). A slip whose correction failed to arrive shows its **original** amount, and the
  // ledger would then reconcile and total on a figure the owner has already replaced — the
  // read-side twin of the defect migration 014 had to fix.
  const corrections = await auth.supabase
    .from("slip_correction_overlays")
    .select("slip_id,kind,amount_minor,occurred_on,occurred_at_time,counterparty,category_id,note,revision,updated_at", { count: "exact" });
  if (corrections.error) return routeError("Slips could not be loaded.", 400);
  if (!isComplete(corrections)) return routeError("Slips could not be loaded in full, so none are shown.", 500);

  // bigint arrives as a JS number from PostgREST unless it is cast, so the amount is
  // stringified here rather than trusted to survive JSON. Every money value in this app
  // crosses the wire as canonical text (D-018). A correction's amount is nullable and a null
  // stays null — the overlay reads that as "not corrected", and a string would be a
  // correction the owner never made.
  const slips = (data ?? []).map((slip) => ({ ...slip, amount_minor: String(slip.amount_minor) }));
  const overlays = (corrections.data ?? []).map((correction) => ({
    ...correction,
    amount_minor: correction.amount_minor === null ? null : String(correction.amount_minor)
  }));
  return Response.json(
    { slips, matches: matches.data ?? [], corrections: overlays },
    { headers: noStoreHeaders }
  );
}

export async function POST(request: Request) {
  const auth = await strongOwnerClient();
  if (!auth.ok) return routeError(auth.message, auth.status);

  const parsed = slipCaptureSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return routeError("The slip is invalid.", 422, parsed.error.flatten());

  const { data, error } = await auth.supabase.rpc("capture_slip", { p_request: parsed.data });
  if (error) {
    // The two refusals a caller can act on are separated from the rest. Everything else is
    // a contract violation the client should not have been able to produce, and its message
    // is deliberately not echoed — it can name a stored value.
    if (error.message.includes("outside the plausible window")) {
      return routeError("The slip date is outside the plausible window. Check the year is not a Buddhist-era one.", 422);
    }
    if (error.message.includes("category not owned")) return routeError("That category does not exist.", 422);
    return routeError("The slip could not be captured.", 400);
  }

  const result = data as { captured: boolean; slip: Record<string, unknown> };
  // 201 when a row was written, 200 when the same slip had already been captured. Sharing
  // a slip twice is expected rather than exceptional (migration 011), so the second share
  // is a success the client reports plainly, not an error it has to interpret.
  const filled = result.captured ? false : await fillBlankPayeeAndMemo(auth.supabase, result.slip, parsed.data);
  return Response.json({ ...result, filled }, { status: result.captured ? 201 : 200, headers: noStoreHeaders });
}

type OverlayRow = {
  kind: string | null; amount_minor: number | string | null; occurred_on: string | null; occurred_at_time: string | null;
  counterparty: string | null; category_id: string | null; note: string | null; revision: number;
};

/**
 * A re-sent slip that is already stored may carry a payee or memo the stored copy lacks (the
 * reader that first captured it missed them). Those two blanks are filled through the owner's
 * own correction path, so the slip row stays append-only and the fill is audited and revisioned.
 *
 * A field is filled only when the request has it and neither the slip nor its correction holds a
 * value; nothing is ever overwritten. Best-effort: any failure leaves the duplicate answer as it
 * was, so a duplicate is never turned into an error. Returns whether a correction was written.
 */
async function fillBlankPayeeAndMemo(
  supabase: (Awaited<ReturnType<typeof strongOwnerClient>> & { ok: true })["supabase"],
  slip: Record<string, unknown>,
  request: { counterparty: string | null; note: string | null }
): Promise<boolean> {
  if (request.counterparty === null && request.note === null) return false;
  if (typeof slip.id !== "string") return false;
  try {
    const read = await supabase
      .from("slip_correction_overlays")
      .select("kind,amount_minor,occurred_on,occurred_at_time,counterparty,category_id,note,revision")
      .eq("slip_id", slip.id)
      .maybeSingle();
    if (read.error) return false;
    const existing = (read.data ?? null) as OverlayRow | null;

    const fillCounterparty = request.counterparty !== null && (slip.counterparty ?? null) === null && (existing?.counterparty ?? null) === null;
    const fillNote = request.note !== null && (slip.note ?? null) === null && (existing?.note ?? null) === null;
    if (!fillCounterparty && !fillNote) return false;

    // Every existing correction field travels unchanged, so kind and amount keep moving together.
    const args = correctionRpcArgs({
      expectedRevision: existing?.revision ?? 0,
      kind: (existing?.kind ?? null) as CorrectionRequest["kind"],
      amountMinor: existing?.amount_minor == null ? null : String(existing.amount_minor),
      occurredOn: existing?.occurred_on ?? null,
      occurredAtTime: existing?.occurred_at_time ?? null,
      counterparty: fillCounterparty ? request.counterparty : existing?.counterparty ?? null,
      categoryId: existing?.category_id ?? null,
      note: fillNote ? request.note : existing?.note ?? null
    });
    const written = await supabase.rpc("set_slip_correction", { p_slip_id: slip.id, ...args });
    return !written.error;
  } catch {
    return false;
  }
}
