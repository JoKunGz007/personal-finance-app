import { noStoreHeaders, routeError, strongOwnerClient } from "@/lib/server/supabase";
import { linemanCaptureRequestSchema } from "@/lib/deliveries";
import { loadOrderMatches } from "@/lib/server/current-matches";

export const dynamic = "force-dynamic";

/**
 * Stored delivery orders (GrabFood and LINE MAN) and Grab rides, newest first, with their breakdowns (migrations 032 and
 * 034), and each one's match to the ledger (migration 033, D-220; migration 034, D-222). Orders
 * and rides are matched **together**, so a row both want is claimed by neither. The decision lives
 * in `lib/server/current-matches.ts`, shared with the auto-categoriser (D-245).
 */
export async function GET() {
  const auth = await strongOwnerClient();
  if (!auth.ok) return routeError(auth.message, auth.status);
  const loaded = await loadOrderMatches(auth.supabase);
  if (!loaded.ok) return routeError(loaded.message, loaded.status);
  return Response.json({ deliveries: loaded.deliveries, rides: loaded.rides }, { headers: noStoreHeaders });
}

/**
 * Stores a LINE MAN order read from its screenshots on the device (D-223). Only the parse arrives —
 * never an image or a line of the owner's block — and `capture_delivery` re-checks its sums, its
 * charge and its idempotency under the owner's own session.
 */
export async function POST(request: Request) {
  const auth = await strongOwnerClient();
  if (!auth.ok) return routeError(auth.message, auth.status);
  const parsed = linemanCaptureRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return routeError("The order is not in the shape this ledger stores.", 422, parsed.error.flatten());
  // The schema is `captureLinemanRequest`'s shape exactly, so the checked body is the RPC request.
  const { data, error } = await auth.supabase.rpc("capture_delivery", { p_request: parsed.data });
  if (error) {
    // The database's message is never echoed: it can name a stored value.
    if (error.message.includes("disagrees with the stored copy")) {
      return routeError("This order is already stored with different amounts. Check the screenshots.", 409);
    }
    if (error.message.includes("does not equal") || error.message.includes("do not sum") || error.message.includes("charged more")) {
      return routeError("The order's amounts do not add up, so it was not stored.", 422);
    }
    return routeError("The order could not be stored.", 400);
  }
  return Response.json(data, { headers: noStoreHeaders });
}
