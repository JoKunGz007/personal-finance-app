import { noStoreHeaders, routeError, strongOwnerClient } from "@/lib/server/supabase";
import { loadReceiptMatches } from "@/lib/server/current-matches";
import { captureReceipt } from "@/lib/server/receipt-store";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await strongOwnerClient();
  if (!auth.ok) return routeError(auth.message, auth.status);
  // The match decision lives in `lib/server/current-matches.ts`, shared with the auto-categoriser (D-245).
  const loaded = await loadReceiptMatches(auth.supabase);
  if (!loaded.ok) return routeError(loaded.message, loaded.status);
  return Response.json({ receipts: loaded.receipts }, { headers: noStoreHeaders });
}

export async function POST(request: Request) {
  const auth = await strongOwnerClient();
  if (!auth.ok) return routeError(auth.message, auth.status);

  const captured = await captureReceipt(auth.supabase, await request.json().catch(() => null));
  if (!captured.ok) {
    // "Outside the plausible window" is one the owner can act on.
    if (captured.reason === "invalid") return routeError(`The receipt is invalid: ${captured.message}`, 422, captured.details);
    // Rule 2's refusal is the one a caller can act on: two readings of one purchase disagree
    // about money, so one of them is misread. Everything else is a contract violation.
    if (captured.reason === "disagrees") {
      return routeError("This receipt's figures disagree with the copy already stored for the same purchase, so nothing was changed.", 409);
    }
    return routeError("The receipt could not be captured.", 400);
  }

  // 201 for a new receipt, 200 when it merged into one already stored — capturing the other form
  // of the same purchase is the design (migration 027), not a duplicate to apologise for.
  return Response.json(captured.data, { status: captured.data.captured ? 201 : 200, headers: noStoreHeaders });
}
