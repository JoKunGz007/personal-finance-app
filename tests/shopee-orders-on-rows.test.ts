import { describe, expect, it } from "vitest";
import { shopeeOrdersOnRows, shopeeViewOrderSchema, type ShopeeViewOrder } from "@/lib/shopee-view";

// The ledger's fold of Shopee orders (D-270). Every id and value is invented.
const id = (n: number) => `eeeeeeee-0000-4000-8000-${String(n).padStart(12, "0")}`;

function order(n: number, state: ShopeeViewOrder["match"]["state"], transactionId: string | null): ShopeeViewOrder {
  return shopeeViewOrderSchema.parse({
    id: id(n), orderCode: `INVENTED${n}`, linkId: `${n}`, orderUrl: `https://shopee.co.th/user/purchase/order/${n}`,
    placedAt: "2026-01-01T00:00:00+07:00", paidAt: null, shop: "Invented Shop", paymentMethod: "ShopeePay",
    paymentKind: "bank_debit", totalMinor: "10000", items: [], priceLines: [], refunds: [],
    match: { state, transactionId, revision: 0 }
  });
}

describe("shopeeOrdersOnRows", () => {
  it("holds matched and auto orders by row, several on one row, and nothing proposed or undone", () => {
    const map = shopeeOrdersOnRows([
      order(1, "matched", id(101)), order(2, "auto", id(102)), order(3, "matched", id(101)),
      order(4, "combined_proposed", id(103)), order(5, "unmatched", null), order(6, "wallet", null),
      order(7, "spaylater", null), order(8, "none", null)
    ]);
    expect([...map.keys()].sort()).toEqual([id(101), id(102)]);
    expect(map.get(id(101))?.map((o) => o.id)).toEqual([id(1), id(3)]);
    expect(map.get(id(102))?.map((o) => o.id)).toEqual([id(2)]);
  });

  it("is empty for no orders", () => {
    expect(shopeeOrdersOnRows([]).size).toBe(0);
  });
});
