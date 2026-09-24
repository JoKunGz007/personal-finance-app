import { captureDeliveryRequest, captureRideRequest, type DeliverySyncReport } from "@/lib/deliveries";
import { syncDeliveryMail, type OrderOutcome, type StoreOrders, type StoreRides } from "@/lib/server/delivery-mailbox";
import { mailboxConfig, openMailbox } from "@/lib/server/statement-mailbox-session";
import { noStoreHeaders, routeError, strongOwnerClient } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";
// Node, not edge: this opens a TLS socket to an IMAP server.
export const runtime = "nodejs";
// A backfill bundle is about a hundred receipts in one message; one request reads until the budget
// below and reports `truncated`, and the page asks again. The budget is checked only between
// messages, so it leaves room under `maxDuration` for one whole bundle — its download and up to a
// hundred captures — started just before the budget runs out.
export const maxDuration = 60;
const READ_BUDGET_MS = 20_000;

/**
 * Reads Grab e-receipts out of the statement mailbox and stores each new order and ride (PLAN
 * task 58 parts 1 and 5). The server reads the email — the owner's choice (D-218) — so the page sends nothing and
 * gets back counts only.
 *
 * Same gate as statement Sync: `strongOwnerClient()`, and every write goes through
 * `capture_delivery` or `capture_ride` under the owner's own session, so RLS, the audit event and the mutation
 * sequence apply exactly as they would to a capture from the page.
 */
export async function POST() {
  const started = Date.now();
  const auth = await strongOwnerClient();
  if (!auth.ok) return routeError(auth.message, auth.status);

  // Senders are statement sync's filter; this reads Grab mail by content, so it does not need them.
  const settings = mailboxConfig({ requireSenders: false });
  if (!settings.ok) return routeError(settings.message, settings.status);

  // Already-stored orders are found in one read per message rather than one RPC each, so re-reading
  // a bundle that was stored last time costs a query, not a hundred round trips.
  const store: StoreOrders = async (orders) => {
    const { data, error } = await auth.supabase
      .from("deliveries")
      .select("booking_id,food_minor,delivery_fee_minor,total_minor")
      .eq("platform", "grabfood")
      .in("booking_id", orders.map((order) => order.bookingId));
    if (error) return orders.map((): OrderOutcome => "storeRefused");
    const known = new Map((data ?? []).map((row) => [row.booking_id as string,
      `${row.food_minor}/${row.delivery_fee_minor ?? ""}/${row.total_minor}`]));

    const outcomes: OrderOutcome[] = [];
    for (const order of orders) {
      const money = `${order.foodMinor}/${order.deliveryFeeMinor ?? ""}/${order.totalMinor}`;
      const stored = known.get(order.bookingId);
      if (stored !== undefined) {
        outcomes.push(stored === money ? "alreadyStored" : "disagrees");
        continue;
      }
      const captured = await auth.supabase.rpc("capture_delivery", { p_request: captureDeliveryRequest(order) });
      if (captured.error) {
        // The message is not echoed: it can name a stored value.
        outcomes.push(captured.error.message.includes("disagrees with the stored copy") ? "disagrees" : "storeRefused");
        continue;
      }
      outcomes.push((captured.data as { captured: boolean }).captured ? "captured" : "alreadyStored");
      known.set(order.bookingId, money);
    }
    return outcomes;
  };

  // Rides the same way, keyed on the booking ID, comparing money and both times (D-222).
  const storeRides: StoreRides = async (rides) => {
    const { data, error } = await auth.supabase
      .from("rides")
      .select("booking_id,fare_minor,platform_fee_minor,total_minor,picked_up_at,dropped_off_at")
      .in("booking_id", rides.map((ride) => ride.bookingId));
    if (error) return rides.map((): OrderOutcome => "storeRefused");
    const instant = (iso: string) => new Date(iso).getTime();
    const known = new Map((data ?? []).map((row) => [row.booking_id as string,
      `${row.fare_minor}/${row.platform_fee_minor}/${row.total_minor}/${instant(row.picked_up_at as string)}/${instant(row.dropped_off_at as string)}`]));

    const reading = (ride: (typeof rides)[number]) =>
      `${ride.fareMinor}/${ride.platformFeeMinor}/${ride.totalMinor}/${instant(ride.pickedUpAt)}/${instant(ride.droppedOffAt)}`;
    const capture = async (ride: (typeof rides)[number]): Promise<OrderOutcome> => {
      const stored = known.get(ride.bookingId);
      if (stored !== undefined) return stored === reading(ride) ? "alreadyStored" : "disagrees";
      const captured = await auth.supabase.rpc("capture_ride", { p_request: captureRideRequest(ride) });
      // The message is not echoed: it can name a stored value.
      if (captured.error) return captured.error.message.includes("disagrees with the stored copy") ? "disagrees" : "storeRefused";
      return (captured.data as { captured: boolean }).captured ? "captured" : "alreadyStored";
    };

    // A backfill bundle holds up to a hundred new rides and the read budget is checked only between
    // messages, so captures overlap four at a time rather than queueing a hundred round trips.
    // `capture_ride` takes the ledger lock itself, so overlapping calls still commit one by one; a
    // booking printed twice in one message is captured once and read back as already stored.
    const outcomes: OrderOutcome[] = new Array(rides.length);
    const firstAt = new Map<string, number>();
    rides.forEach((ride, index) => { if (!firstAt.has(ride.bookingId)) firstAt.set(ride.bookingId, index); });
    const unique = [...firstAt.values()];
    for (let start = 0; start < unique.length; start += 4) {
      const batch = unique.slice(start, start + 4);
      const results = await Promise.all(batch.map((index) => capture(rides[index]!)));
      batch.forEach((index, at) => { outcomes[index] = results[at]!; });
    }
    rides.forEach((ride, index) => {
      if (outcomes[index] !== undefined) return;
      const first = outcomes[firstAt.get(ride.bookingId)!]!;
      outcomes[index] = first === "captured" || first === "alreadyStored"
        ? (reading(ride) === reading(rides[firstAt.get(ride.bookingId)!]!) ? "alreadyStored" : "disagrees")
        : first;
    });
    return outcomes;
  };

  let session;
  try {
    session = await openMailbox(settings.config);
  } catch {
    // As statement Sync: imapflow's message can carry the mailbox address, so it is not passed on.
    return routeError(
      "The statement mailbox could not be opened. Check that the app password is current and that IMAP is enabled for that account.",
      502
    );
  }

  try {
    const report: DeliverySyncReport = await syncDeliveryMail(session.client, { orders: store, rides: storeRides }, started + READ_BUDGET_MS);
    return Response.json(report, { headers: noStoreHeaders });
  } catch {
    return routeError("The mailbox was opened but its e-receipts could not be read.", 502);
  } finally {
    await session.release();
  }
}
