import { describe, expect, it } from "vitest";
import { schemeCosts, schemeWallet } from "@/lib/delivery-cost";

// The owner's co-payment rule (PLAN task 58 part 2): the government pays 50% of the wallet's food
// share in 2025 and 60% from 2026, at most ฿200 a Bangkok day; the owner pays the rest of what the
// wallet covered, plus whatever a bank was charged. Migration 038 and pgTAP 024 pin the same cases.
// Every value here is invented.

const discount = (name: string, amount: string) => ({ kind: "discount", name, amount_minor: amount });
let next = 0;
const grab = (food: string, adjustments: ReturnType<typeof discount>[], at = "2026-09-02T05:00:00Z", total = "0") => ({
  id: `00000000-0000-4000-8000-${String(++next).padStart(12, "0")}`,
  platform: "grabfood" as const, receipt_sent_at: at, ordered_at: null,
  food_minor: food, delivery_fee_minor: "0", total_minor: total, charged_minor: null, adjustments
});
const lineman = (food: string, total: string, charged: string, at = "2026-09-05T05:00:00Z", fee = "1600") => ({
  id: `00000000-0000-4000-8000-${String(++next).padStart(12, "0")}`,
  platform: "lineman" as const, receipt_sent_at: null, ordered_at: at,
  food_minor: food, delivery_fee_minor: fee, total_minor: total, charged_minor: charged, adjustments: []
});
const one = (order: ReturnType<typeof grab> | ReturnType<typeof lineman>) => schemeCosts([order]).get(order.id);

describe("schemeCosts", () => {
  it("costs 40% of the food in 2026 when a delivery promo cancelled the fee", () => {
    // Food ฿300, fee ฿40 cancelled by a promo, the scheme line covering the ฿300 left.
    expect(one(grab("30000", [discount("Free deli promo", "4000"), discount("TH26GF0001ALL", "30000")])))
      .toEqual({ scheme: "ไทยช่วยไทย", cost: "12000", wallet: "12000", charged: "0", chargedIsFee: true, government: "18000", capped: false });
  });

  it("costs the fee in full when the wallet covered more than the food", () => {
    // Food ฿300, fee ฿40, no promo: the scheme line covers ฿340, of which ฿40 is fee.
    expect(one(grab("30000", [discount("TH26GF0001ALL", "34000")]))?.cost).toBe("16000");
  });

  it("costs 40% of only what the wallet covered when promos took more than the fee", () => {
    // Food ฿300, fee ฿40, a ฿99 promo: the scheme covers ฿241, all of it food.
    expect(one(grab("30000", [discount("EUT1A2", "9900"), discount("TH26GF0001ALL", "24100")]))?.cost).toBe("9640");
  });

  it("costs half the food in 2025, in Bangkok time", () => {
    // 31 Dec 2025 17:30 UTC is already 1 Jan 2026 in Bangkok, so 40% there.
    expect(one(grab("30000", [discount("TH25GF5050ALL", "30000")], "2025-12-31T16:59:00Z")))
      .toMatchObject({ scheme: "คนละครึ่ง", cost: "15000", government: "15000" });
    expect(one(grab("30000", [discount("TH26GF5050ALL", "30000")], "2025-12-31T17:30:00Z")))
      .toMatchObject({ scheme: "ไทยช่วยไทย", cost: "12000" });
  });

  it("caps the government at ฿200 for one order", () => {
    // Food ฿400: 60% is ฿240, so the government pays ฿200 and the owner ฿200.
    expect(one(grab("40000", [discount("TH26GF0001ALL", "40000")])))
      .toMatchObject({ cost: "20000", wallet: "20000", government: "20000", capped: true });
  });

  it("shares the ฿200 across a Bangkok day's orders, in time order", () => {
    // ฿150 then ฿200 on one Bangkok day: the government pays ฿90, then only ฿110 of its ฿120.
    const first = grab("15000", [discount("TH26GF0001ALL", "15000")], "2026-09-02T02:00:00Z");
    const second = grab("20000", [discount("TH26GF0001ALL", "20000")], "2026-09-02T12:00:00Z");
    // 17:30 UTC on the 2nd is the 3rd in Bangkok, a fresh ฿200.
    const nextDay = grab("20000", [discount("TH26GF0001ALL", "20000")], "2026-09-02T17:30:00Z");
    const costs = schemeCosts([nextDay, second, first]);
    expect(costs.get(first.id)).toMatchObject({ cost: "6000", government: "9000", capped: false });
    expect(costs.get(second.id)).toMatchObject({ cost: "9000", government: "11000", capped: true });
    expect(costs.get(nextDay.id)).toMatchObject({ cost: "8000", government: "12000", capped: false });
  });

  it("rounds the owner's share to the nearest satang, half up at 50%", () => {
    expect(one(grab("1", [discount("TH26GF0001ALL", "1")]))?.cost).toBe("0");
    expect(one(grab("3", [discount("TH26GF0001ALL", "3")]))?.cost).toBe("1");
    expect(one(grab("4", [discount("TH26GF0001ALL", "4")]))?.cost).toBe("2");
    expect(one(grab("3", [discount("TH25GF0001ALL", "3")], "2025-11-02T05:00:00Z"))?.cost).toBe("2");
  });

  it("names a split LINE MAN order's bank-charged fee apart from the เป๋าตัง amount", () => {
    // Food ฿189, fee ฿16 charged by the bank, total ฿205: the wallet paid the ฿189.
    expect(one(lineman("18900", "20500", "1600")))
      .toEqual({ scheme: "ไทยช่วยไทย", cost: "9160", wallet: "7560", charged: "1600", chargedIsFee: true, government: "11340", capped: false });
    // Food ฿189 of which the wallet paid ฿100, the bank ฿105: more than the ฿16 fee, so not called one.
    expect(one(lineman("18900", "20500", "10500"))?.chargedIsFee).toBe(false);
  });

  it("leaves out orders not paid through the scheme", () => {
    expect(one(grab("30000", [discount("TH26GF0001ALL", "30000")], undefined, "100"))).toBeUndefined();
    expect(one(grab("30000", [discount("Some promo", "30000")]))).toBeUndefined();
    expect(one(grab("30000", [discount("TH26GF0001ALL", "15000"), discount("TH26GF0002ALL", "15000")]))).toBeUndefined();
    expect(one(lineman("18900", "20500", "20500"))).toBeUndefined();
  });
});

describe("schemeWallet", () => {
  it("is what the wallet covered and what a bank was charged", () => {
    expect(schemeWallet(grab("30000", [discount("TH26GF0001ALL", "30000")]))).toEqual({ wallet: 30000n, charged: 0n });
    expect(schemeWallet(lineman("18900", "20500", "1600"))).toEqual({ wallet: 18900n, charged: 1600n });
    expect(schemeWallet(lineman("18900", "20500", "20500"))).toBeNull();
  });
});
