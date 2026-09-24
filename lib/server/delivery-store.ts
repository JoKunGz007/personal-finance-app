import { captureDeliveryRequest, captureRideRequest } from "@/lib/deliveries";
import type { OrderOutcome, StoreOrders, StoreRides } from "@/lib/server/delivery-mailbox";
import type { strongOwnerClient } from "@/lib/server/supabase";

type OwnerClient = Extract<Awaited<ReturnType<typeof strongOwnerClient>>, { ok: true }>["supabase"];
type Result = { data: unknown; error: { message: string } | null };

/**
 * How Sync stores a message's orders or rides (PLAN task 58 parts 1 and 5), under the owner's own
 * session so RLS, the audit event and the mutation sequence apply as they would from the page.
 *
 * Already-stored documents are found in one read per message rather than one RPC each, so
 * re-reading a bundle stored last time costs a query, not a hundred round trips. A stored one is
 * compared by its `reading` — money, and for a ride both times — and one that differs `disagrees`.
 * New ones are captured `concurrency` at a time; a booking printed twice in one message is captured
 * once and the repeat is compared with the first.
 */
async function storeByBooking<T extends { bookingId: string }>(
  items: readonly T[],
  spec: {
    readStored: (bookingIds: string[]) => PromiseLike<{ data: Record<string, unknown>[] | null; error: unknown }>;
    storedReading: (row: Record<string, unknown>) => string;
    reading: (item: T) => string;
    capture: (item: T) => PromiseLike<Result>;
    concurrency: number;
  }
): Promise<OrderOutcome[]> {
  const { data, error } = await spec.readStored(items.map((item) => item.bookingId));
  if (error) return items.map((): OrderOutcome => "storeRefused");
  const known = new Map((data ?? []).map((row) => [row.booking_id as string, spec.storedReading(row)]));

  const capture = async (item: T): Promise<OrderOutcome> => {
    const stored = known.get(item.bookingId);
    if (stored !== undefined) return stored === spec.reading(item) ? "alreadyStored" : "disagrees";
    const captured = await spec.capture(item);
    // The message is not echoed: it can name a stored value.
    if (captured.error) return captured.error.message.includes("disagrees with the stored copy") ? "disagrees" : "storeRefused";
    return (captured.data as { captured: boolean }).captured ? "captured" : "alreadyStored";
  };

  // The capture RPCs take the ledger lock themselves, so overlapping calls still commit one by one.
  const outcomes: OrderOutcome[] = new Array(items.length);
  const firstAt = new Map<string, number>();
  items.forEach((item, index) => { if (!firstAt.has(item.bookingId)) firstAt.set(item.bookingId, index); });
  const unique = [...firstAt.values()];
  for (let start = 0; start < unique.length; start += spec.concurrency) {
    const batch = unique.slice(start, start + spec.concurrency);
    const results = await Promise.all(batch.map((index) => capture(items[index]!)));
    batch.forEach((index, at) => { outcomes[index] = results[at]!; });
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
    capture: (order) => supabase.rpc("capture_delivery", { p_request: captureDeliveryRequest(order) }),
    concurrency: 1
  });
}

const instant = (iso: string) => new Date(iso).getTime();

/**
 * Rides, keyed on the booking ID, compared on money and both times (D-222). A backfill bundle holds
 * up to a hundred new rides and Sync's read budget is checked only between messages, so captures
 * overlap four at a time.
 */
export function rideStore(supabase: OwnerClient): StoreRides {
  return (rides) => storeByBooking(rides, {
    readStored: (ids) => supabase.from("rides")
      .select("booking_id,fare_minor,platform_fee_minor,total_minor,picked_up_at,dropped_off_at").in("booking_id", ids),
    storedReading: (row) =>
      `${row.fare_minor}/${row.platform_fee_minor}/${row.total_minor}/${instant(row.picked_up_at as string)}/${instant(row.dropped_off_at as string)}`,
    reading: (ride) => `${ride.fareMinor}/${ride.platformFeeMinor}/${ride.totalMinor}/${instant(ride.pickedUpAt)}/${instant(ride.droppedOffAt)}`,
    capture: (ride) => supabase.rpc("capture_ride", { p_request: captureRideRequest(ride) }),
    concurrency: 4
  });
}
