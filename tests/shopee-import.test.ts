import { describe, expect, it } from "vitest";
import { bahtToMinor, bangkokTimeToIso, describeShopeeImport, parseShopeeExport } from "@/lib/shopee-import";

// Every value is invented (docs/FIXTURE_POLICY.md).
const BANK_SHAPED = "INVENTEDBANK xxx-x-x7788-x";

function order(over: Record<string, unknown> = {}) {
  return {
    url: "https://shopee.co.th/user/purchase/order/12345678901234",
    orderId: "INVENTED0001", status: "Completed",
    timeline: { "Order Placed": "05-09-2026 10:30", "Order Paid": "05-09-2026 10:31" },
    shops: [{ name: "Invented shop", items: [{ name: "Invented thing", variation: "Red", qty: 2, price: "120.50", originalPrice: "150" }] }],
    priceRows: [
      { label: "Merchandise Subtotal", amount: "241.00" },
      { label: "Shipping", amount: "30" },
      { label: "Voucher", amount: "-11.25" }
    ],
    orderTotal: "259.75", paymentMethod: "Invented pay", check: "ok", itemsCheck: "ok", itemPriceIs: "line total",
    ...over
  };
}
const cancellation = (over: Record<string, unknown> = {}) => ({
  url: "https://shopee.co.th/user/purchase/cancellation/99", requestId: "REQ1", requestedAt: "06-09-2026 08:00",
  steps: ["Cancellation Requested", "Refunded"], refundAmount: "259.75", refundTo: "ShopeePay Balance",
  requestedBy: "Buyer", orderId: "INVENTED0001", reason: "Invented reason", ...over
});
const file = (orders: unknown[], extra: Record<string, unknown> = {}) =>
  ({ source: "shopee.co.th order detail", exportedAt: "2026-10-01T00:00:00Z", orders, ...extra });

function one(raw: unknown) {
  const parsed = parseShopeeExport(file([raw]));
  if (!parsed.ok) throw new Error(parsed.reason);
  return parsed;
}

describe("parseShopeeExport recognition", () => {
  it("reads a version 1 file (no version key) and a version 2 file", () => {
    const v1 = parseShopeeExport(file([order()]));
    expect(v1).toMatchObject({ ok: true, version: 1 });
    const v2 = parseShopeeExport(file([order()], { version: 2 }));
    expect(v2).toMatchObject({ ok: true, version: 2 });
  });
  it("does not recognise another source, another version or no list", () => {
    expect(parseShopeeExport({ source: "other", orders: [] }).ok).toBe(false);
    expect(parseShopeeExport(file([], { version: 3 })).ok).toBe(false);
    expect(parseShopeeExport({ source: "shopee.co.th order detail" }).ok).toBe(false);
    expect(parseShopeeExport(null).ok).toBe(false);
    expect(parseShopeeExport([]).ok).toBe(false);
  });
  it("maps an order to the request shape", () => {
    const { orders, refused } = one(order());
    expect(refused).toEqual([]);
    expect(orders[0]).toEqual({
      orderCode: "INVENTED0001", linkId: "12345678901234", placedAt: "2026-09-05T10:30:00+07:00",
      paidAt: "2026-09-05T10:31:00+07:00", shop: "Invented shop", paymentMethod: "Invented pay", totalMinor: "25975",
      itemPriceIs: "line total",
      items: [{ position: 1, name: "Invented thing", variation: "Red", quantity: 2, priceMinor: "12050", originalPriceMinor: "15000" }],
      priceLines: [
        { position: 1, label: "Merchandise Subtotal", amountMinor: "24100" },
        { position: 2, label: "Shipping", amountMinor: "3000" },
        { position: 3, label: "Voucher", amountMinor: "-1125" }
      ],
      refund: null
    });
  });
  it("takes a 15-digit link with a query and an order with no paid time", () => {
    const { orders } = one(order({
      url: "https://shopee.co.th/user/purchase/order/123456789012345?type=9", timeline: { "Order Placed": "05-09-2026 10:30" }
    }));
    expect(orders[0]).toMatchObject({ linkId: "123456789012345", paidAt: null });
  });
});

describe("times and money", () => {
  it("converts Bangkok local time and rejects impossible dates", () => {
    expect(bangkokTimeToIso("01-01-2026 00:00")).toBe("2026-01-01T00:00:00+07:00");
    expect(bangkokTimeToIso("29-02-2028 23:59")).toBe("2028-02-29T23:59:00+07:00");
    expect(bangkokTimeToIso("29-02-2026 10:00")).toBeNull();
    expect(bangkokTimeToIso("31-04-2026 10:00")).toBeNull();
    expect(bangkokTimeToIso("05-09-2026 24:00")).toBeNull();
    expect(bangkokTimeToIso("5-9-2026 10:00")).toBeNull();
    expect(bangkokTimeToIso(null)).toBeNull();
  });
  it("turns decimal baht into exact satang text", () => {
    expect(bahtToMinor("0")).toBe("0");
    expect(bahtToMinor("0.1")).toBe("10");
    expect(bahtToMinor("0.07")).toBe("7");
    expect(bahtToMinor("1234.56")).toBe("123456");
    expect(bahtToMinor("-11.25")).toBe("-1125");
    expect(bahtToMinor("-0")).toBe("0");
    expect(bahtToMinor("90071992547409.93")).toBe("9007199254740993");
  });
  it("rejects more than two decimals, separators, floats, numbers and the int64 overflow", () => {
    for (const bad of ["1.234", "1,000", "1e3", "", "abc", "1.", ".5", "92233720368547758.08"]) expect(bahtToMinor(bad)).toBeNull();
    expect(bahtToMinor(12.5)).toBeNull();
    expect(bahtToMinor(null)).toBeNull();
  });
});

describe("refusals", () => {
  const reasonOf = (raw: unknown) => one(raw).refused;
  it("refuses an order the page could not read", () => {
    expect(reasonOf({ url: "https://shopee.co.th/user/purchase/order/12345678901234", error: "timed out after 30s" }))
      .toEqual([{ orderCode: null, reason: "The page could not be read when the file was made." }]);
  });
  it("refuses an order missing its ID, link, placed time, total or shop", () => {
    for (const bad of [
      order({ orderId: null }), order({ url: "https://shopee.co.th/user/purchase/order/123" }),
      order({ timeline: {} }), order({ orderTotal: null }), order({ shops: [] })
    ]) {
      const { orders, refused } = one(bad);
      expect(orders).toEqual([]);
      expect(refused[0]!.reason).toBe("The order is missing its ID, link, placed time, total or shop.");
    }
    expect(one(order({ orderId: null })).refused[0]!.orderCode).toBeNull();
  });
  it("refuses an order with no payment method, before the database does", () => {
    for (const bad of [order({ paymentMethod: null }), order({ paymentMethod: "  " }), order({ paymentMethod: undefined })]) {
      const { orders, refused } = one(bad);
      expect(orders).toEqual([]);
      expect(refused).toEqual([{ orderCode: "INVENTED0001", reason: "The order has no payment method." }]);
    }
  });
  it("refuses more than one shop", () => {
    const shop = { name: "Second", items: [] };
    const { refused } = one(order({ shops: [order().shops[0], shop] }));
    expect(refused).toEqual([{ orderCode: "INVENTED0001", reason: "The order spans more than one shop." }]);
  });
  it("refuses price rows that do not sum exactly to the total, even by one satang", () => {
    expect(one(order({ orderTotal: "259.76" })).refused[0]!.reason).toBe("The price rows do not add up to the order total.");
    expect(one(order({ priceRows: [] })).refused).toHaveLength(1);
  });
  it("refuses an item with an unreadable price or quantity", () => {
    const shops = [{ name: "S", items: [{ name: "x", variation: null, qty: 0, price: "1", originalPrice: null }] }];
    expect(one(order({ shops })).refused[0]!.reason).toBe("An item has an unreadable price or quantity.");
    const badPrice = [{ name: "S", items: [{ name: "x", variation: null, qty: 1, price: "1,0", originalPrice: null }] }];
    expect(one(order({ shops: badPrice })).refused).toHaveLength(1);
  });
  it("keeps an unpriced gift line with a null price", () => {
    const shops = [{ name: "S", items: [
      { name: "x", variation: null, qty: 1, price: "259.75", originalPrice: null },
      { name: "gift", variation: null, qty: 1, price: null, originalPrice: null }
    ] }];
    const parsed = one(order({ shops }));
    expect(parsed.refused).toEqual([]);
    expect(parsed.orders[0]!.items[1]!.priceMinor).toBeNull();
  });
  it("refuses a cancellation with an error or for another order, and keeps the good orders", () => {
    const parsed = parseShopeeExport(file([
      order({ cancellation: { url: "u", error: "timed out after 30s" } }),
      order({ orderId: "INVENTED0002", cancellation: cancellation() }),
      order({ orderId: "INVENTED0003", cancellation: cancellation({ orderId: "INVENTED0003" }) })
    ]));
    if (!parsed.ok) throw new Error("not ok");
    expect(parsed.refused.map((r) => r.reason)).toEqual([
      "The cancellation page could not be read when the file was made.",
      "The cancellation belongs to a different order."
    ]);
    expect(parsed.orders.map((o) => o.orderCode)).toEqual(["INVENTED0003"]);
  });
  it("refuses a cancellation with no readable refund", () => {
    expect(one(order({ cancellation: cancellation({ refundAmount: null }) })).refused[0]!.reason)
      .toBe("The cancellation record is incomplete.");
  });
});

describe("refund mapping", () => {
  const refundOf = (c: Record<string, unknown>) => one(order({ cancellation: cancellation(c) })).orders[0]!.refund;
  it("maps ShopeePay Balance and ShopeePay to wallet", () => {
    expect(refundOf({ refundTo: "ShopeePay Balance" })!.refundTo).toBe("wallet");
    expect(refundOf({ refundTo: "ShopeePay" })!.refundTo).toBe("wallet");
  });
  it("D-277: matches the wallet name case-insensitively and trimmed", () => {
    expect(refundOf({ refundTo: "shopeepay balance" })!.refundTo).toBe("wallet");
    expect(refundOf({ refundTo: "  SHOPEEPAY  " })!.refundTo).toBe("wallet");
  });
  it("D-277: maps a masked account number to bank", () => {
    for (const shape of [BANK_SHAPED, "INVENTEDBANK xxx-x-x1234-x", "XXX-X-X1234-X", "***1234", "INVENTEDBANK ****5678"]) {
      expect(refundOf({ refundTo: shape })!.refundTo).toBe("bank");
    }
  });
  it("D-277: refuses a destination that is neither ShopeePay nor a bank account", () => {
    for (const dest of ["SPayLater", "Shopee Coins", "บัญชีธนาคาร", "Invented card"]) {
      const parsed = one(order({ cancellation: cancellation({ refundTo: dest }) }));
      expect(parsed.orders).toEqual([]);
      expect(parsed.refused[0]!.reason).toBe("The refund destination is not ShopeePay or a bank account.");
    }
  });
  it("D-277: an empty or blank destination stays an incomplete record", () => {
    for (const dest of ["", "   "]) {
      expect(one(order({ cancellation: cancellation({ refundTo: dest }) })).refused[0]!.reason)
        .toBe("The cancellation record is incomplete.");
    }
  });
  it("maps a masked bank destination to bank and never keeps its text", () => {
    const parsed = parseShopeeExport(file([order({ cancellation: cancellation({ refundTo: BANK_SHAPED, requestedBy: "Shopee" }) })]));
    if (!parsed.ok) throw new Error("not ok");
    expect(parsed.orders[0]!.refund).toEqual({
      requestId: "REQ1", requestedAt: "2026-09-06T08:00:00+07:00", refundMinor: "25975", refundTo: "bank",
      requestedBy: "shopee", reason: "Invented reason", steps: ["Cancellation Requested", "Refunded"]
    });
    expect(JSON.stringify(parsed)).not.toContain("INVENTEDBANK");
    expect(JSON.stringify(parsed)).not.toContain("7788");
  });
});

describe("describeShopeeImport", () => {
  const base = { version: 2 as const, new: 3, stored: 241, beforeLedger: 12, refundsNew: 1, refundsStored: 0, refused: [{ orderCode: "A", reason: "r" }] };
  it("builds the sentence", () => {
    expect(describeShopeeImport(base)).toBe(
      "Shopee export: 3 new orders, 241 already stored, 12 before the ledger's first row, 1 refused. 1 new refund."
    );
  });
  it("leaves out zero parts and handles singular and stored refunds", () => {
    expect(describeShopeeImport({ ...base, new: 1, beforeLedger: 0, refused: [], refundsNew: 0, refundsStored: 2 }))
      .toBe("Shopee export: 1 new order, 241 already stored. 2 refunds already stored.");
    expect(describeShopeeImport({ ...base, beforeLedger: 0, refused: [], refundsNew: 0 }))
      .toBe("Shopee export: 3 new orders, 241 already stored.");
  });
  it("drops a refund step wording the table does not accept", () => {
    const parsed = one(order({ cancellation: cancellation({ steps: ["Cancellation Requested", "Something New", 7] }) }));
    expect(parsed.orders[0]!.refund!.steps).toEqual(["Cancellation Requested"]);
  });
});
