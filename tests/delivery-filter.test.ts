import { describe, expect, it } from "vitest";
import type { StoredDelivery, StoredRide } from "@/lib/deliveries";
import { filterDeliveries, NO_DELIVERY_FILTER, type DeliveryFilter } from "@/lib/delivery-filter";
import type { DeliveryMatchState } from "@/lib/delivery-match";

// Every value here is invented.
const state = (status: DeliveryMatchState["status"]): DeliveryMatchState => ({ status, row: null, options: [], revision: 0 });

function order(id: string, overrides: Partial<StoredDelivery> = {}): StoredDelivery {
  return {
    id, platform: "grabfood", booking_id: `A-${id}`, restaurant: "Invented Noodle House", payment_method: null,
    receipt_sent_at: "2026-09-01T12:10:00+00:00", ordered_at: null, charged_minor: null, food_minor: "10000",
    delivery_fee_minor: null, total_minor: "10000",
    items: [{ position: 1, quantity: 1, name: "Invented Pad Kra Pao", options: ["Extra egg"], amount_minor: "10000" }],
    adjustments: [], match: state("matched"), ...overrides
  };
}

function ride(id: string, overrides: Partial<StoredRide> = {}): StoredRide {
  return {
    id, booking_id: `R-${id}`, ride_type: "Invented Bike", picked_up_at: "2026-09-01T12:00:00+00:00",
    dropped_off_at: "2026-09-01T12:15:00+00:00", pickup_place: "Invented Station", dropoff_place: "Invented Office",
    distance_meters: 3000, duration_minutes: 15, payment_method: "0000", fare_minor: "5000", platform_fee_minor: "0",
    total_minor: "5000", adjustments: [], match: state("matched"), ...overrides
  } as StoredRide;
}

const scheme = order("s", {
  total_minor: "0", match: state("outside"),
  adjustments: [{ position: 1, kind: "discount", name: "TH26GF0001ALL", amount_minor: "10000" }]
});
const lineman = order("l", { platform: "lineman", restaurant: "Invented Mala", match: state("none") });
const orders = [order("g"), scheme, lineman];
const rides = [ride("1"), ride("2", { pickup_place: "Invented Mall", match: state("ambiguous") })];

const ids = (filter: Partial<DeliveryFilter>) => {
  const shown = filterDeliveries(orders, rides, { ...NO_DELIVERY_FILTER, ...filter });
  return [...shown.deliveries.map((row) => row.id), ...shown.rides.map((row) => row.id)];
};

describe("filterDeliveries", () => {
  it("shows everything with no filter", () => {
    expect(ids({})).toEqual(["g", "s", "l", "1", "2"]);
  });

  it("narrows to one platform, or to rides", () => {
    expect(ids({ show: "lineman" })).toEqual(["l"]);
    expect(ids({ show: "grabfood" })).toEqual(["g", "s"]);
    expect(ids({ show: "rides" })).toEqual(["1", "2"]);
  });

  it("narrows by where the payment stands, across orders and rides", () => {
    expect(ids({ ledger: "on" })).toEqual(["g", "1"]);
    expect(ids({ ledger: "none" })).toEqual(["l"]);
    expect(ids({ ledger: "pick" })).toEqual(["2"]);
    expect(ids({ ledger: "outside" })).toEqual(["s"]);
  });

  it("finds ไทยช่วยไทย orders, and never a ride", () => {
    expect(ids({ ledger: "scheme" })).toEqual(["s"]);
    expect(ids({ ledger: "scheme", show: "rides" })).toEqual([]);
  });

  it("searches restaurant, dish, option, booking and places, every word in any order, ignoring case", () => {
    expect(ids({ query: "mala" })).toEqual(["l"]);
    expect(ids({ query: "EXTRA egg" })).toEqual(["g", "s", "l"]);
    expect(ids({ query: "kra noodle" })).toEqual(["g", "s"]);
    expect(ids({ query: "A-l" })).toEqual(["l"]);
    expect(ids({ query: "mall" })).toEqual(["2"]);
    expect(ids({ query: "   " })).toEqual(["g", "s", "l", "1", "2"]);
  });

  it("combines the filters", () => {
    expect(ids({ show: "grabfood", ledger: "on", query: "noodle" })).toEqual(["g"]);
  });
});
