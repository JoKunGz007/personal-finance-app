import { captureDeliveryRequest, captureRideRequest } from "@/lib/deliveries";
import type { OrderOutcome, StoreOrders, StoreRides } from "@/lib/server/delivery-mailbox";
import type { strongOwnerClient } from "@/lib/server/supabase";

type OwnerClient = Extract<Awaited<ReturnType<typeof strongOwnerClient>>, { ok: true }>["supabase"];
const BATCH = 25;
const OUTCOMES = new Set<OrderOutcome>(["captured", "alreadyStored", "disagrees"]);

/**
 * How Sync stores a message's orders or rides (PLAN task 58 parts 1 and 5), under the owner's own
 * session so RLS, the audit event and the mutation sequence apply as they would from the page.
 *
 * Already-stored documents are found in one read per message rather than one RPC each, so
 * re-reading a bundle stored last time costs a query, not a hundred round trips. A stored one is
 * compared by its `reading` — money, and for a ride both times — and one that differs `disagrees`.
 * New ones are captured `BATCH` to a call (migration 041, D-230), each in its own subtransaction,
 * so a hundred-ride bundle is four round trips; a booking printed twice in one message is captured
 * once and the repeat is compared with the first.
 */
async function storeByBooking<T extends { bookingId: string }>(
  items: readonly T[],
  spec: {
    readStored: (bookingIds: string[]) => PromiseLike<{ data: Record<string, unknown>[] | null; error: unknown }>;
    storedReading: (row: Record<string, unknown>) => string;
    reading: (item: T) => string;
    captureMany: (items: T[]) => PromiseLike<{ data: unknown; error: unknown }>;
  }
): Promise<OrderOutcome[]> {
  const { data, error } = await spec.readStored(items.map((item) => item.bookingId));
  if (error) return items.map((): OrderOutcome => "storeRefused");
  const known = new Map((data ?? []).map((row) => [row.booking_id as string, spec.storedReading(row)]));

  const outcomes: OrderOutcome[] = new Array(items.length);
  const firstAt = new Map<string, number>();
  items.forEach((item, index) => { if (!firstAt.has(item.bookingId)) firstAt.set(item.bookingId, index); });
  const toCapture: number[] = [];
  for (const index of firstAt.values()) {
    const stored = known.get(items[index]!.bookingId);
    if (stored === undefined) toCapture.push(index);
    else outcomes[index] = stored === spec.reading(items[index]!) ? "alreadyStored" : "disagrees";
  }
  for (let start = 0; start < toCapture.length; start += BATCH) {
    const batch = toCapture.slice(start, start + BATCH);
    const captured = await spec.captureMany(batch.map((index) => items[index]!));
    // An answer off-contract, or of the wrong length, stores nothing this side can vouch for.
    const answers = !captured.error && Array.isArray(captured.data) && captured.data.length === batch.length ? captured.data : null;
    batch.forEach((index, at) => {
      const answer = answers?.[at] as OrderOutcome | undefined;
      outcomes[index] = answer !== undefined && OUTCOMES.has(answer) ? answer : "storeRefused";
    });
  }
  items.forEach((item, index) => {
    if (outcomes[index] !== undefined) return;
    const first = firstAt.get(item.bookingId)!;
    outcomes[index] = outcomes[first] === "captured" || outcomes[first] === "alreadyStored"
      ? (spec.reading(item) === spec.reading(items[first]!) ? "alreadyStored" : "disagrees")
      : outcomes[first]!;
  });
  return outcomes;
}

/** GrabFood orders, keyed on the booking ID, compared on their money. */
export function orderStore(supabase: OwnerClient): StoreOrders {
  return (orders) => storeByBooking(orders, {
    readStored: (ids) => supabase.from("deliveries").select("booking_id,food_minor,delivery_fee_minor,total_minor")
      .eq("platform", "grabfood").in("booking_id", ids),
    storedReading: (row) => `${row.food_minor}/${row.delivery_fee_minor ?? ""}/${row.total_minor}`,
    reading: (order) => `${order.foodMinor}/${order.deliveryFeeMinor ?? ""}/${order.totalMinor}`,
    captureMany: (orders) => supabase.rpc("capture_deliveries", { p_requests: orders.map((order) => captureDeliveryRequest(order)) })
  });
}

const instant = (iso: string) => new Date(iso).getTime();

/** Rides, keyed on the booking ID, compared on money and both times (D-222). */
export function rideStore(supabase: OwnerClient): StoreRides {
  return (rides) => storeByBooking(rides, {
    readStored: (ids) => supabase.from("rides")
      .select("booking_id,fare_minor,platform_fee_minor,total_minor,picked_up_at,dropped_off_at").in("booking_id", ids),
    storedReading: (row) =>
      `${row.fare_minor}/${row.platform_fee_minor}/${row.total_minor}/${instant(row.picked_up_at as string)}/${instant(row.dropped_off_at as string)}`,
    reading: (ride) => `${ride.fareMinor}/${ride.platformFeeMinor}/${ride.totalMinor}/${instant(ride.pickedUpAt)}/${instant(ride.droppedOffAt)}`,
    captureMany: (rides) => supabase.rpc("capture_rides", { p_requests: rides.map((ride) => captureRideRequest(ride)) })
  });
}
