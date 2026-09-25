import { beforeEach, describe, expect, it } from "vitest";
import type { ParsedDelivery, ParsedRide } from "@/lib/delivery-grab";
import { orderStore, rideStore } from "@/lib/server/delivery-store";

// Sync's store layer over a stubbed client (D-222's open review item): which table and filter it
// reads, what it compares, how a repeat in one message is answered, and that new documents go to
// the batch RPC 25 to a call (D-230). The database's side is pgTAP's. Every value is invented.

type Stub = {
  stored: Record<string, unknown>[];
  readError: unknown;
  /** The batch RPC's outcome per booking ID; `captured` when absent. */
  answers: Map<string, string>;
  /** Replaces the batch RPC's whole answer when set. */
  reply: { data: unknown; error: unknown } | null;
  reads: { table: string; columns: string; eq: [string, unknown][]; in: [string, string[]] | null }[];
  captures: { rpc: string; bookingIds: string[] }[];
};

let stub: Stub;

function client() {
  return {
    from: (table: string) => ({
      select: (columns: string) => {
        const read = { table, columns, eq: [] as [string, unknown][], in: null as [string, string[]] | null };
        stub.reads.push(read);
        const builder = {
          eq: (column: string, value: unknown) => { read.eq.push([column, value]); return builder; },
          in: async (column: string, values: string[]) => {
            read.in = [column, values];
            return { data: stub.readError ? null : stub.stored, error: stub.readError };
          }
        };
        return builder;
      }
    }),
    rpc: async (rpc: string, args: { p_requests: { bookingId: string }[] }) => {
      const bookingIds = args.p_requests.map((request) => request.bookingId);
      stub.captures.push({ rpc, bookingIds });
      return stub.reply ?? { data: bookingIds.map((id) => stub.answers.get(id) ?? "captured"), error: null };
    }
  } as unknown as Parameters<typeof rideStore>[0];
}

beforeEach(() => {
  stub = { stored: [], readError: null, answers: new Map(), reply: null, reads: [], captures: [] };
});

function ride(bookingId: string, overrides: Partial<ParsedRide> = {}): ParsedRide {
  return {
    platform: "grab", bookingId, rideType: "Invented Bike", pickedUpAt: "2026-09-01T12:00:00+07:00",
    droppedOffAt: "2026-09-01T12:15:00+07:00", pickupPlace: "Invented A", dropoffPlace: "Invented B",
    distanceMeters: 3000, durationMinutes: 15, paymentMethod: "0000", fareMinor: "6000", platformFeeMinor: "200",
    totalMinor: "6200", adjustments: [], ...overrides
  } as ParsedRide;
}

function order(bookingId: string, overrides: Partial<ParsedDelivery> = {}): ParsedDelivery {
  return {
    platform: "grabfood", bookingId, restaurant: "Invented kitchen", paymentMethod: null,
    receiptSentAt: "2026-09-01T12:10:00+07:00", foodMinor: "14100", deliveryFeeMinor: null, totalMinor: "14100",
    items: [], adjustments: [], ...overrides
  } as ParsedDelivery;
}

// A stored ride as PostgREST returns it: the same instants, written in UTC.
const storedRide = (bookingId: string, total = 6200) => ({
  booking_id: bookingId, fare_minor: total - 200, platform_fee_minor: 200, total_minor: total,
  picked_up_at: "2026-09-01T05:00:00+00:00", dropped_off_at: "2026-09-01T05:15:00+00:00"
});

describe("rideStore (D-222)", () => {
  it("reads the stored rides of this message once, by booking ID", async () => {
    await rideStore(client())([ride("A-1"), ride("A-2")]);
    expect(stub.reads).toHaveLength(1);
    expect(stub.reads[0]).toMatchObject({ table: "rides", in: ["booking_id", ["A-1", "A-2"]] });
    expect(stub.reads[0]!.columns).toContain("picked_up_at");
  });

  it("answers a stored ride without a capture: already stored when money and both times agree, disagrees otherwise", async () => {
    stub.stored = [storedRide("A-1"), storedRide("A-2"), storedRide("A-3")];
    const outcomes = await rideStore(client())([
      ride("A-1"),
      ride("A-2", { totalMinor: "6300", fareMinor: "6100" }),
      ride("A-3", { droppedOffAt: "2026-09-01T12:16:00+07:00" })
    ]);
    expect(outcomes).toEqual(["alreadyStored", "disagrees", "disagrees"]);
    expect(stub.captures).toEqual([]);
  });

  it("captures new rides in one capture_rides call and takes its outcomes by position", async () => {
    stub.answers.set("A-2", "alreadyStored");
    stub.answers.set("A-3", "disagrees");
    stub.answers.set("A-4", "refused");
    const outcomes = await rideStore(client())([ride("A-1"), ride("A-2"), ride("A-3"), ride("A-4")]);
    expect(outcomes).toEqual(["captured", "alreadyStored", "disagrees", "storeRefused"]);
    expect(stub.captures).toEqual([{ rpc: "capture_rides", bookingIds: ["A-1", "A-2", "A-3", "A-4"] }]);
  });

  it("refuses a batch whose answer is an error, off-contract, or the wrong length", async () => {
    for (const reply of [
      { data: null, error: { message: "anything" } },
      { data: { captured: true }, error: null },
      { data: ["captured"], error: null }
    ]) {
      stub.reply = reply;
      expect(await rideStore(client())([ride("A-1"), ride("A-2")])).toEqual(["storeRefused", "storeRefused"]);
    }
    // An unknown outcome refuses only its own position; the one beside it was stored.
    stub.reply = { data: ["captured", "invented"], error: null };
    expect(await rideStore(client())([ride("A-1"), ride("A-2")])).toEqual(["captured", "storeRefused"]);
  });

  it("captures a booking printed twice once, and compares the repeat with the first", async () => {
    const outcomes = await rideStore(client())([ride("A-1"), ride("A-1"), ride("A-1", { totalMinor: "9900" })]);
    expect(outcomes).toEqual(["captured", "alreadyStored", "disagrees"]);
    expect(stub.captures).toHaveLength(1);
  });

  it("gives a repeat its first copy's refusal", async () => {
    stub.answers.set("A-1", "refused");
    expect(await rideStore(client())([ride("A-1"), ride("A-1")])).toEqual(["storeRefused", "storeRefused"]);
  });

  it("sends a hundred new rides as four calls of 25, skipping the stored one", async () => {
    stub.stored = [storedRide("A-0")];
    const outcomes = await rideStore(client())(Array.from({ length: 101 }, (_, index) => ride(`A-${index}`)));
    expect(outcomes).toEqual(["alreadyStored", ...new Array(100).fill("captured")]);
    expect(stub.captures.map((capture) => capture.bookingIds.length)).toEqual([25, 25, 25, 25]);
    expect(stub.captures.flatMap((capture) => capture.bookingIds)).not.toContain("A-0");
  });

  it("refuses the whole message when the stored read fails, capturing nothing", async () => {
    stub.readError = { message: "read failed" };
    expect(await rideStore(client())([ride("A-1"), ride("A-2")])).toEqual(["storeRefused", "storeRefused"]);
    expect(stub.captures).toEqual([]);
  });
});

describe("orderStore (D-219)", () => {
  it("reads GrabFood orders only, compares money, and captures the new ones in one call", async () => {
    stub.stored = [{ booking_id: "A-1", food_minor: 14100, delivery_fee_minor: null, total_minor: 14100 }];
    const outcomes = await orderStore(client())([order("A-1"), order("A-2"), order("A-3"), order("A-2", { totalMinor: "1" })]);
    expect(stub.reads[0]).toMatchObject({ table: "deliveries", eq: [["platform", "grabfood"]] });
    expect(outcomes).toEqual(["alreadyStored", "captured", "captured", "disagrees"]);
    expect(stub.captures).toEqual([{ rpc: "capture_deliveries", bookingIds: ["A-2", "A-3"] }]);
  });
});
