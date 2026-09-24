import { describe, expect, it } from "vitest";
import { deliveryStatisticsSchema } from "@/lib/delivery-statistics";

// The wire contract for `delivery_statistics()` (migration 037): the shape pgTAP 024 asserts on the
// database side parses here, and drift fails by name. Every value is invented.
const sample = {
  totals: {
    orders: 5, spent: "42801", averageSpent: { quotient: "8560", remainder: "1" }, firstDate: "2026-08-01",
    lastDate: "2026-09-06", deliveryFees: "11600", discounts: "13900", schemeOrders: 4, schemePaid: "43802"
  },
  platforms: [{ platform: "grabfood", orders: 3, spent: "33640" }, { platform: "lineman", orders: 2, spent: "9161" }],
  restaurants: [{ restaurant: "Invented B", orders: 2, spent: "21640" }],
  months: [{ month: "2026-08", orders: 1, spent: "12000", rides: 0, rideSpent: "0" }],
  rides: { rides: 2, spent: "12001", averageSpent: { quotient: "6000", remainder: "1" }, platformFees: "200" },
  rideTypes: [{ rideType: "Invented Car", rides: 1, spent: "7001" }]
};

describe("deliveryStatisticsSchema", () => {
  it("accepts the database's shape, including an empty ledger", () => {
    expect(deliveryStatisticsSchema.safeParse(sample).success).toBe(true);
    expect(deliveryStatisticsSchema.safeParse({
      ...sample,
      totals: { ...sample.totals, orders: 0, spent: "0", averageSpent: null, firstDate: null, lastDate: null },
      platforms: [], restaurants: [], months: [], rideTypes: [],
      rides: { rides: 0, spent: "0", averageSpent: null, platformFees: "0" }
    }).success).toBe(true);
  });

  it("refuses money that is not a minor-unit string, an unknown platform, or a new field", () => {
    expect(deliveryStatisticsSchema.safeParse({ ...sample, totals: { ...sample.totals, spent: 42801 } }).success).toBe(false);
    expect(deliveryStatisticsSchema.safeParse({ ...sample, platforms: [{ platform: "foodpanda", orders: 1, spent: "1" }] }).success).toBe(false);
    expect(deliveryStatisticsSchema.safeParse({ ...sample, extra: 1 }).success).toBe(false);
  });
});
