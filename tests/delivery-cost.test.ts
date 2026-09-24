import { describe, expect, it } from "vitest";
import { schemeRealCost } from "@/lib/delivery-cost";

// The owner's ไทยช่วยไทย rule (PLAN task 58 part 2): of what the wallet covered, the food share costs
// 40% and the fee share all of it. Every value here is invented.

const discount = (name: string, amount: string) => ({ kind: "discount", name, amount_minor: amount });
const grab = (food: string, adjustments: ReturnType<typeof discount>[], total = "0") =>
  ({ platform: "grabfood" as const, food_minor: food, total_minor: total, charged_minor: null, adjustments });

describe("schemeRealCost", () => {
  it("costs 40% of the food when a delivery promo cancelled the fee", () => {
    // Food ฿300, fee ฿40 cancelled by a promo, the scheme line covering the ฿300 left.
    expect(schemeRealCost(grab("30000", [discount("Free deli promo", "4000"), discount("TH26GF0001ALL", "30000")]))).toBe("12000");
  });

  it("costs the fee in full when the wallet covered more than the food", () => {
    // Food ฿300, fee ฿40, no promo: the scheme line covers ฿340, of which ฿40 is fee.
    expect(schemeRealCost(grab("30000", [discount("TH26GF0001ALL", "34000")]))).toBe("16000");
  });

  it("costs 40% of only what the wallet covered when promos took more than the fee", () => {
    // Food ฿300, fee ฿40, a ฿99 promo: the scheme covers ฿241, all of it food.
    expect(schemeRealCost(grab("30000", [discount("EUT1A2", "9900"), discount("TH26GF0001ALL", "24100")]))).toBe("9640");
  });

  it("rounds 40% to the nearest satang", () => {
    expect(schemeRealCost(grab("1", [discount("TH26GF0001ALL", "1")]))).toBe("0");
    expect(schemeRealCost(grab("2", [discount("TH26GF0001ALL", "2")]))).toBe("1");
    expect(schemeRealCost(grab("3", [discount("TH26GF0001ALL", "3")]))).toBe("1");
    expect(schemeRealCost(grab("4", [discount("TH26GF0001ALL", "4")]))).toBe("2");
  });

  it("is nothing for a GrabFood order that is not ฿0 or has no single scheme line", () => {
    expect(schemeRealCost(grab("30000", [discount("TH26GF0001ALL", "30000")], "100"))).toBeNull();
    expect(schemeRealCost(grab("30000", [discount("Some promo", "30000")]))).toBeNull();
    expect(schemeRealCost(grab("30000", [discount("TH26GF0001ALL", "15000"), discount("TH26GF0002ALL", "15000")]))).toBeNull();
  });

  it("adds 40% of a split LINE MAN order's wallet-paid food to what the bank was charged", () => {
    // Food ฿189, fee ฿16 charged by the bank, total ฿205: the wallet paid the ฿189.
    const order = { platform: "lineman" as const, food_minor: "18900", total_minor: "20500", charged_minor: "1600", adjustments: [] };
    expect(schemeRealCost(order)).toBe("9160");
  });

  it("is nothing for a LINE MAN order the bank paid in full", () => {
    expect(schemeRealCost({ platform: "lineman", food_minor: "18900", total_minor: "20500", charged_minor: "20500", adjustments: [] })).toBeNull();
  });
});
