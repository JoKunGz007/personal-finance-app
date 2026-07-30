import { noStoreHeaders, routeError, strongOwnerClient } from "@/lib/server/supabase";
import { slipCaptureSchema } from "@/lib/slips";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await strongOwnerClient();
  if (!auth.ok) return routeError(auth.message, auth.status);
  const { data, error } = await auth.supabase
    .from("slips")
    .select("id,bank_code,slip_reference,kind,amount_minor,currency,occurred_on,occurred_at_time,counterparty,category_id,note,captured_at")
    .order("occurred_on", { ascending: false })
    .order("captured_at", { ascending: false });
  if (error) return routeError("Slips could not be loaded.", 400);
  // bigint arrives as a JS number from PostgREST unless it is cast, so the amount is
  // stringified here rather than trusted to survive JSON. Every money value in this app
  // crosses the wire as canonical text (D-018).
  const slips = (data ?? []).map((slip) => ({ ...slip, amount_minor: String(slip.amount_minor) }));
  return Response.json({ slips }, { headers: noStoreHeaders });
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
  return Response.json(result, { status: result.captured ? 201 : 200, headers: noStoreHeaders });
}
