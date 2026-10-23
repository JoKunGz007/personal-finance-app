import { describe, expect, it } from "vitest";
import {
  SHOPEE_REFUND_DEPOSIT_DAYS,
  SHOPEE_VIP_AMOUNT_MINOR,
  currentLinks,
  SPAYLATER_REPAY_DAY_FIRST,
  SPAYLATER_REPAY_DAY_LAST,
  SPAYLATER_REPAY_MAX_DAYS,
  SPAYLATER_REPAY_MIN_DAYS,
  namesShopeePay,
  paysShopee,
  proposeShopeeMatches,
  shopeeMatchedTransactionIds,
  type ShopeeMatchInput
} from "@/lib/shopee-match";

// Every id and value here is invented (docs/FIXTURE_POLICY.md).
const pad = (n: number) => String(n).padStart(12, "0");
const oid = (n: number) => `aaaaaaaa-0000-4000-8000-${pad(n)}`;
const tid = (n: number) => `bbbbbbbb-0000-4000-8000-${pad(n)}`;
const ACCOUNT = "cccccccc-0000-4000-8000-000000000001";

// 2026-10-10 10:00 Bangkok.
const PAID = "2026-10-10T03:00:00Z";

type OrderOpts = { paidAt?: string | null; placedAt?: string; kind?: "bank_debit" | "wallet" | "spaylater" | "other"; total?: string };
function order(n: number, o: OrderOpts = {}) {
  return {
    id: oid(n),
    orderCode: `INVENTED${String(n).padStart(4, "0")}`,
    placedAt: o.placedAt ?? "2026-10-10T02:50:00Z",
    paidAt: o.paidAt === undefined ? PAID : o.paidAt,
    paymentKind: o.kind ?? "bank_debit",
    totalMinor: o.total ?? "10000"
  };
}

type RowOpts = { date?: string; time?: string | null; movement?: string; description?: string; label?: string };
function row(n: number, o: RowOpts = {}) {
  return {
    transaction_id: tid(n),
    account_id: ACCOUNT,
    source_date: o.date ?? "2026-10-10",
    source_time: o.time === undefined ? "10:00:00" : o.time,
    transaction_label: o.label ?? "Transfer",
    description: o.description ?? "INVENTED SHOPEEPAY",
    movement_minor: o.movement ?? "-10000"
  };
}

function run(partial: Partial<ShopeeMatchInput>) {
  return proposeShopeeMatches({ orders: [], refunds: [], rows: [], overlays: [], linkEvents: [], ...partial });
}
const stateOf = (result: ReturnType<typeof run>, n: number) => result.orders.find((s) => s.orderId === oid(n));

describe("wording rules", () => {
  it("names ShopeePay in the description or the label, any case", () => {
    expect(namesShopeePay({ description: "x shopeepay y", transaction_label: null })).toBe(true);
    expect(namesShopeePay({ description: null, transaction_label: "ShopeePay" })).toBe(true);
    expect(namesShopeePay({ description: "SHOPEE MALL", transaction_label: "Transfer" })).toBe(false);
  });
  it("says a row pays Shopee when it names ShopeePay or reads Payment to Shopee (D-275)", () => {
    expect(paysShopee({ description: "INVENTED Payment to Shopee NOTE", transaction_label: "ENET" })).toBe(true);
    expect(paysShopee({ description: "INVENTED SHOPEEPAY", transaction_label: "Transfer" })).toBe(true);
    expect(paysShopee({ description: "INVENTED SHOP", transaction_label: "Transfer" })).toBe(false);
    expect(paysShopee({ description: null, transaction_label: null })).toBe(false);
  });
  it("treats a Direct Debit naming ShopeePay as a bank debit (task 63)", () => {
    // A second bank labels ordinary ShopeePay bank-debit payments this way.
    expect(stateOf(run({ orders: [order(1)], rows: [row(1, { label: "Direct Debit" })] }), 1))
      .toEqual({ orderId: oid(1), state: "auto", transactionId: tid(1) });
  });
});

describe("automatic single match", () => {
  it("matches one order to one exact ShopeePay row at the same minute", () => {
    const r = run({ orders: [order(1)], rows: [row(1)] });
    expect(stateOf(r, 1)).toEqual({ orderId: oid(1), state: "auto", transactionId: tid(1) });
    expect([...shopeeMatchedTransactionIds(r)]).toEqual([tid(1)]);
  });
  it("accepts a lag of exactly one minute either side, refuses two", () => {
    expect(stateOf(run({ orders: [order(1)], rows: [row(1, { time: "10:01:00" })] }), 1)?.state).toBe("auto");
    expect(stateOf(run({ orders: [order(1)], rows: [row(1, { time: "09:59:00" })] }), 1)?.state).toBe("auto");
    expect(stateOf(run({ orders: [order(1)], rows: [row(1, { time: "10:02:00" })] }), 1)?.state).toBe("none");
    expect(stateOf(run({ orders: [order(1)], rows: [row(1, { time: "09:58:00" })] }), 1)?.state).toBe("none");
  });
  it("uses paidAt, and placedAt when unpaid", () => {
    const unpaid = order(1, { paidAt: null, placedAt: "2026-10-10T03:00:30Z" });
    expect(stateOf(run({ orders: [unpaid], rows: [row(1)] }), 1)?.state).toBe("auto");
  });
  it("refuses a row with no time", () => {
    expect(stateOf(run({ orders: [order(1)], rows: [row(1, { time: null })] }), 1)?.state).toBe("none");
  });
  it("refuses a different amount and a row not naming Shopee", () => {
    expect(stateOf(run({ orders: [order(1)], rows: [row(1, { movement: "-10001" })] }), 1)?.state).toBe("none");
    expect(stateOf(run({ orders: [order(1)], rows: [row(1, { description: "INVENTED SHOP" })] }), 1)?.state).toBe("none");
  });
  it("refuses two candidate rows for one order", () => {
    const r = run({ orders: [order(1)], rows: [row(1), row(2)] });
    expect(stateOf(r, 1)?.state).toBe("none");
  });
  it("refuses one row wanted by two orders", () => {
    const r = run({ orders: [order(1), order(2)], rows: [row(1)] });
    expect(stateOf(r, 1)?.state).toBe("none");
    expect(stateOf(r, 2)?.state).toBe("none");
  });
  it("matches two equal orders to two rows only when each is unique", () => {
    // Both rows fit both orders, so neither side is unique.
    const r = run({ orders: [order(1), order(2)], rows: [row(1), row(2)] });
    expect(r.orders.map((s) => s.state)).toEqual(["none", "none"]);
  });
  it("lets an order whose amount differs match despite a neighbour", () => {
    const r = run({
      orders: [order(1), order(2, { total: "20000" })],
      rows: [row(1), row(2, { movement: "-20000" })]
    });
    expect(r.orders.map((s) => s.state)).toEqual(["auto", "auto"]);
  });
  it("lets the owner's matched overlay take a row, and an unmatched overlay suppress auto", () => {
    const taken = run({
      orders: [order(1), order(2)],
      rows: [row(1)],
      overlays: [{ orderId: oid(2), decision: "matched", transactionId: tid(1), revision: 3 }]
    });
    expect(stateOf(taken, 2)).toEqual({ orderId: oid(2), state: "matched", transactionId: tid(1), revision: 3 });
    expect(stateOf(taken, 1)?.state).toBe("none");
    const unmatched = run({
      orders: [order(1)],
      rows: [row(1)],
      overlays: [{ orderId: oid(1), decision: "unmatched", transactionId: null, revision: 1 }]
    });
    expect(stateOf(unmatched, 1)).toEqual({ orderId: oid(1), state: "unmatched", revision: 1 });
    expect(shopeeMatchedTransactionIds(unmatched).size).toBe(0);
  });
  it("skips a row already linked to anything", () => {
    const r = run({
      orders: [order(1)],
      rows: [row(1)],
      linkEvents: [{ orderId: oid(9), transactionId: tid(1), kind: "wallet_topup", action: "link", changedAt: "2026-10-11T00:00:00Z" }]
    });
    expect(stateOf(r, 1)?.state).toBe("none");
  });
  it("never matches a zero or negative total", () => {
    expect(stateOf(run({ orders: [order(1, { total: "0" })], rows: [row(1, { movement: "0" })] }), 1)?.state).toBe("none");
    expect(stateOf(run({ orders: [order(1, { total: "-10000" })], rows: [row(1, { movement: "10000" })] }), 1)?.state).toBe("none");
  });
  it("matches an order paid by PromptPay QR or Mobile Banking (kind other) like a bank debit (D-275)", () => {
    // (a) a same-minute "Payment to Shopee" ENET row of equal amount.
    const pay = row(1, { label: "ENET", description: "INVENTED Payment to Shopee NOTE : -" });
    expect(stateOf(run({ orders: [order(1, { kind: "other" })], rows: [pay] }), 1))
      .toEqual({ orderId: oid(1), state: "auto", transactionId: tid(1) });
    // (b) a ShopeePay row.
    expect(stateOf(run({ orders: [order(1, { kind: "other" })], rows: [row(1)] }), 1))
      .toEqual({ orderId: oid(1), state: "auto", transactionId: tid(1) });
  });
  it("still leaves wallet and SPayLater orders out of the automatic match", () => {
    expect(stateOf(run({ orders: [order(1, { kind: "wallet" })], rows: [row(1)] }), 1)?.state).toBe("wallet");
    expect(stateOf(run({ orders: [order(1, { kind: "spaylater" })], rows: [row(1)] }), 1)?.state).toBe("spaylater");
  });
});

describe("Bangkok time", () => {
  it("reads the order across UTC midnight as Bangkok wall clock", () => {
    // 2026-10-09T17:30:00Z is 2026-10-10 00:30 in Bangkok.
    const o = order(1, { paidAt: "2026-10-09T17:30:00Z" });
    expect(stateOf(run({ orders: [o], rows: [row(1, { date: "2026-10-10", time: "00:30:00" })] }), 1)?.state).toBe("auto");
    expect(stateOf(run({ orders: [o], rows: [row(1, { date: "2026-10-09", time: "00:30:00" })] }), 1)?.state).toBe("none");
  });
  it("matches across a Bangkok midnight within the minute window", () => {
    const o = order(1, { paidAt: "2026-10-10T16:59:30Z" }); // 23:59 Bangkok
    expect(stateOf(run({ orders: [o], rows: [row(1, { date: "2026-10-11", time: "00:00:00" })] }), 1)?.state).toBe("auto");
  });
});

describe("combined checkout", () => {
  const three = [order(1, { total: "10000" }), order(2, { total: "5000" }), order(3, { total: "2500" })];
  it("proposes the one grouping whose totals sum exactly to one row", () => {
    const r = run({ orders: three, rows: [row(1, { movement: "-15000" })] });
    expect(r.combined).toEqual([{ transactionId: tid(1), orderIds: [oid(1), oid(2)] }]);
    expect(stateOf(r, 1)).toEqual({ orderId: oid(1), state: "combined_proposed", transactionId: tid(1), orderIds: [oid(1), oid(2)] });
    expect(stateOf(r, 3)?.state).toBe("none");
    expect(shopeeMatchedTransactionIds(r).size).toBe(0);
  });
  it("proposes nothing when two groupings fit", () => {
    // 10000 + 5000 + 5000 = 20000; 10000+5000 can be made twice over.
    const orders = [order(1, { total: "10000" }), order(2, { total: "5000" }), order(3, { total: "5000" })];
    expect(run({ orders, rows: [row(1, { movement: "-15000" })] }).combined).toEqual([]);
  });
  it("proposes nothing when two rows each fit a grouping", () => {
    const r = run({ orders: three, rows: [row(1, { movement: "-15000" }), row(2, { movement: "-15000" })] });
    expect(r.combined).toEqual([]);
  });
  it("needs the same order minute", () => {
    const orders = [order(1, { total: "10000" }), order(2, { total: "5000", paidAt: "2026-10-10T03:01:00Z" })];
    expect(run({ orders, rows: [row(1, { movement: "-15000" })] }).combined).toEqual([]);
  });
  it("needs a row within a minute and with a time", () => {
    const orders = [order(1, { total: "10000" }), order(2, { total: "5000" })];
    expect(run({ orders, rows: [row(1, { movement: "-15000", time: "10:02:00" })] }).combined).toEqual([]);
    expect(run({ orders, rows: [row(1, { movement: "-15000", time: null })] }).combined).toEqual([]);
  });
  it("leaves out an order that has its own automatic match", () => {
    const orders = [order(1, { total: "10000" }), order(2, { total: "5000" }), order(3, { total: "5000" })];
    const r = run({ orders, rows: [row(1, { movement: "-5000" }), row(2, { movement: "-15000" })] });
    // Orders 2 and 3 share the 5000 row, so neither is auto; the 15000 row fits 1+2 and 1+3.
    expect(r.combined).toEqual([]);
    const solo = run({
      orders: [order(1, { total: "10000" }), order(2, { total: "5000" }), order(3, { total: "700" })],
      rows: [row(1, { movement: "-700" }), row(2, { movement: "-15000" })]
    });
    expect(stateOf(solo, 3)?.state).toBe("auto");
    expect(solo.combined).toEqual([{ transactionId: tid(2), orderIds: [oid(1), oid(2)] }]);
  });
  it("skips a minute group larger than ten", () => {
    const orders = Array.from({ length: 11 }, (_, i) => order(i + 1, { total: "100" }));
    expect(run({ orders, rows: [row(1, { movement: "-200" })] }).combined).toEqual([]);
  });
  it("does not propose over an owner decision", () => {
    const orders = [order(1, { total: "10000" }), order(2, { total: "5000" })];
    const r = run({
      orders,
      rows: [row(1, { movement: "-15000" })],
      overlays: [{ orderId: oid(1), decision: "unmatched", transactionId: null, revision: 1 }]
    });
    expect(r.combined).toEqual([]);
  });
});

describe("wallet-paid orders", () => {
  const wallet = (n: number, paidAt = PAID) => order(n, { kind: "wallet", paidAt, total: "20000" });
  it("is never unmatched and proposes an unmatched top-up row within 60 minutes before", () => {
    const r = run({ orders: [wallet(1)], rows: [row(1, { time: "09:00:00", movement: "-30000" })] });
    expect(stateOf(r, 1)).toEqual({ orderId: oid(1), state: "wallet" });
    expect(r.walletTopups).toEqual([{ orderId: oid(1), transactionIds: [tid(1)] }]);
  });
  it("accepts lag -60 and 0, refuses -61 and +1", () => {
    const at = (time: string) => run({ orders: [wallet(1)], rows: [row(1, { time, movement: "-30000" })] }).walletTopups.length;
    expect(at("09:00:00")).toBe(1);
    expect(at("10:00:00")).toBe(1);
    expect(at("08:59:00")).toBe(0);
    expect(at("10:01:00")).toBe(0);
  });
  it("proposes nothing when another wallet order shares the window", () => {
    const r = run({
      orders: [wallet(1), wallet(2, "2026-10-10T03:10:00Z")],
      rows: [row(1, { time: "09:30:00", movement: "-30000" })]
    });
    expect(r.walletTopups).toEqual([]);
  });
  it("excludes a row of the VIP amount", () => {
    const r = run({ orders: [wallet(1)], rows: [row(1, { time: "09:30:00", movement: `-${SHOPEE_VIP_AMOUNT_MINOR}` })] });
    expect(r.walletTopups).toEqual([]);
  });
  it("excludes a row linked elsewhere, an inflow, a null time, and a row an auto match holds", () => {
    const base = { orders: [wallet(1)] };
    const link = [{ orderId: oid(9), transactionId: tid(1), kind: "spaylater_repayment" as const, action: "link" as const, changedAt: "2026-10-11T00:00:00Z" }];
    expect(run({ ...base, rows: [row(1, { time: "09:30:00", movement: "-30000" })], linkEvents: link }).walletTopups).toEqual([]);
    expect(run({ ...base, rows: [row(1, { time: "09:30:00", movement: "30000" })] }).walletTopups).toEqual([]);
    expect(run({ ...base, rows: [row(1, { time: null, movement: "-30000" })] }).walletTopups).toEqual([]);
    const withAuto = run({
      orders: [wallet(1), order(2, { total: "30000", paidAt: "2026-10-10T02:30:00Z" })],
      rows: [row(1, { time: "09:30:00", movement: "-30000" })]
    });
    expect(stateOf(withAuto, 2)?.state).toBe("auto");
    expect(withAuto.walletTopups).toEqual([]);
  });
  it("proposes nothing once the order has a wallet top-up link", () => {
    const r = run({
      orders: [wallet(1)],
      rows: [row(1, { time: "09:30:00", movement: "-30000" }), row(2, { time: "09:40:00", movement: "-1000" })],
      linkEvents: [{ orderId: oid(1), transactionId: tid(2), kind: "wallet_topup", action: "link", changedAt: "2026-10-11T00:00:00Z" }]
    });
    expect(r.walletTopups).toEqual([]);
  });
  it("proposes several rows for one order", () => {
    const r = run({
      orders: [wallet(1)],
      rows: [row(1, { time: "09:30:00", movement: "-30000" }), row(2, { time: "09:40:00", movement: "-1000" })]
    });
    expect(r.walletTopups).toEqual([{ orderId: oid(1), transactionIds: [tid(1), tid(2)] }]);
  });
});

describe("SPayLater repayments (D-276)", () => {
  const spay = (n: number, paidAt: string) => order(n, { kind: "spaylater", total: "50000", paidAt });
  const listed = (r: ReturnType<typeof run>) => r.spaylaterRepayments.map((x) => x.transactionId);
  const leftover = (n: number, date: string, extra: RowOpts = {}) => row(n, { date, time: "08:00:00", movement: "-12000", ...extra });
  const link = (orderId: string, transactionId: string) =>
    [{ orderId, transactionId, kind: "spaylater_repayment" as const, action: "link" as const, changedAt: "2026-10-11T00:00:00Z" }];

  it("has the day window 7..13 and the age window 10..366", () => {
    expect([SPAYLATER_REPAY_DAY_FIRST, SPAYLATER_REPAY_DAY_LAST]).toEqual([7, 13]);
    expect([SPAYLATER_REPAY_MIN_DAYS, SPAYLATER_REPAY_MAX_DAYS]).toEqual([10, 366]);
  });
  it("lists a leftover ShopeePay outflow on day 7 and 13, not on day 6 or 14", () => {
    const at = (date: string) => listed(run({ rows: [leftover(1, date)] }));
    expect(at("2026-10-07")).toEqual([tid(1)]);
    expect(at("2026-10-13")).toEqual([tid(1)]);
    expect(at("2026-10-06")).toEqual([]);
    expect(at("2026-10-14")).toEqual([]);
  });
  it("does not list a row an automatic match holds", () => {
    const r = run({ orders: [order(1)], rows: [row(1)] });
    expect(stateOf(r, 1)?.state).toBe("auto");
    expect(listed(r)).toEqual([]);
  });
  it("does not list a row in a wallet top-up proposal", () => {
    const r = run({
      orders: [order(1, { kind: "wallet", total: "20000" })],
      rows: [row(1, { time: "09:30:00", movement: "-30000" })]
    });
    expect(r.walletTopups).toHaveLength(1);
    expect(listed(r)).toEqual([]);
  });
  it("does not list a combined-checkout row", () => {
    const r = run({
      orders: [order(1, { total: "10000" }), order(2, { total: "5000" })],
      rows: [row(1, { movement: "-15000" })]
    });
    expect(r.combined).toHaveLength(1);
    expect(listed(r)).toEqual([]);
  });
  it("does not list the VIP amount on the 11th", () => {
    expect(listed(run({ rows: [leftover(1, "2026-10-11", { movement: `-${SHOPEE_VIP_AMOUNT_MINOR}` })] }))).toEqual([]);
    expect(listed(run({ rows: [leftover(1, "2026-10-11")] }))).toEqual([tid(1)]);
  });
  it("does not list an Excluded row or an owner-matched row", () => {
    expect(listed(run({ rows: [leftover(1, "2026-10-10")], excludedTransactionIds: [tid(1)] }))).toEqual([]);
    const owner = run({
      orders: [order(2)],
      rows: [leftover(1, "2026-10-10")],
      overlays: [{ orderId: oid(2), decision: "matched", transactionId: tid(1), revision: 1 }]
    });
    expect(listed(owner)).toEqual([]);
  });
  it("does not list an inflow or a row that does not pay Shopee", () => {
    expect(listed(run({ rows: [leftover(1, "2026-10-10", { movement: "12000" })] }))).toEqual([]);
    expect(listed(run({ rows: [leftover(1, "2026-10-10", { description: "INVENTED SHOP" })] }))).toEqual([]);
  });
  it("lists a row linked as a repayment outside the day window, with linkedOrderIds", () => {
    const r = run({
      orders: [spay(9, "2026-08-01T03:00:00Z")],
      rows: [leftover(1, "2026-10-20")],
      linkEvents: link(oid(9), tid(1))
    });
    expect(r.spaylaterRepayments).toEqual([
      { transactionId: tid(1), orderIds: [oid(9)], preselected: [oid(9)], linkedOrderIds: [oid(9)] }
    ]);
  });
  it("keeps a linked row listed even when it was later Excluded", () => {
    const r = run({
      orders: [spay(9, "2026-08-01T03:00:00Z")],
      rows: [leftover(1, "2026-10-20")],
      linkEvents: link(oid(9), tid(1)),
      excludedTransactionIds: [tid(1)]
    });
    expect(listed(r)).toEqual([tid(1)]);
  });
  it("keeps input row order", () => {
    const r = run({ rows: [leftover(3, "2026-10-09"), leftover(1, "2026-10-08"), leftover(2, "2026-10-10")] });
    expect(listed(r)).toEqual([tid(3), tid(1), tid(2)]);
  });
  it("offers an order 10 and 366 days before, not 9 or 367", () => {
    const offered = (paidAt: string) => run({ orders: [spay(9, paidAt)], rows: [leftover(1, "2026-10-10")] }).spaylaterRepayments[0]?.orderIds;
    expect(offered("2026-09-30T03:00:00Z")).toEqual([oid(9)]); // 10 days
    expect(offered("2025-10-09T03:00:00Z")).toEqual([oid(9)]); // 366 days
    expect(offered("2026-10-01T03:00:00Z")).toEqual([]); // 9 days
    expect(offered("2025-10-08T03:00:00Z")).toEqual([]); // 367 days
  });
  it("offers an order 150 days before (the five-instalment case)", () => {
    const r = run({ orders: [spay(9, "2026-05-13T03:00:00Z")], rows: [leftover(1, "2026-10-10")] });
    expect(r.spaylaterRepayments[0]?.orderIds).toEqual([oid(9)]);
  });
  it("reads the order's date in Bangkok", () => {
    const offered = (paidAt: string) => run({ orders: [spay(9, paidAt)], rows: [leftover(1, "2026-10-10")] }).spaylaterRepayments[0]?.orderIds;
    expect(offered("2026-09-30T16:59:00Z")).toEqual([oid(9)]); // 2026-09-30 23:59 Bangkok: 10 days
    expect(offered("2026-09-30T18:00:00Z")).toEqual([]); // 2026-10-01 01:00 Bangkok: 9 days
  });
  it("preselects with exactly one candidate order, none with two", () => {
    const one = run({ orders: [spay(9, "2026-08-01T03:00:00Z")], rows: [leftover(1, "2026-10-10")] });
    expect(one.spaylaterRepayments[0]?.preselected).toEqual([oid(9)]);
    const two = run({ orders: [spay(9, "2026-08-01T03:00:00Z"), spay(8, "2026-07-01T03:00:00Z")], rows: [leftover(1, "2026-10-10")] });
    expect(two.spaylaterRepayments[0]?.orderIds).toEqual([oid(9), oid(8)]);
    expect(two.spaylaterRepayments[0]?.preselected).toEqual([]);
  });
  it("leaves the order SPayLater state alone", () => {
    const r = run({ orders: [spay(9, "2026-08-01T03:00:00Z")], rows: [leftover(1, "2026-10-10")] });
    expect(stateOf(r, 9)).toEqual({ orderId: oid(9), state: "spaylater" });
  });
});

describe("refund deposits", () => {
  const refund = { orderId: oid(1), requestedAt: "2026-10-10T03:00:00Z", refundMinor: "15000", refundTo: "bank" as const };
  const deposit = (n: number, date: string, movement = "15000") => row(n, { date, movement, description: "INVENTED DEPOSIT", label: "Deposit" });
  const run1 = (rows: ReturnType<typeof row>[], extra: Partial<ShopeeMatchInput> = {}) =>
    run({ orders: [order(1)], refunds: [refund], rows, ...extra }).refundDeposits;
  it("proposes the one matching inflow 0..30 days after the request", () => {
    expect(SHOPEE_REFUND_DEPOSIT_DAYS).toBe(30);
    expect(run1([deposit(1, "2026-10-10")])).toEqual([{ orderId: oid(1), transactionId: tid(1) }]);
    expect(run1([deposit(1, "2026-11-09")])).toEqual([{ orderId: oid(1), transactionId: tid(1) }]);
    expect(run1([deposit(1, "2026-11-10")])).toEqual([]);
    expect(run1([deposit(1, "2026-10-09")])).toEqual([]);
  });
  it("reads the request date in Bangkok", () => {
    const late = { ...refund, requestedAt: "2026-10-09T18:00:00Z" }; // 2026-10-10 01:00 Bangkok
    const out = run({ orders: [order(1)], refunds: [late], rows: [deposit(1, "2026-10-09")] }).refundDeposits;
    expect(out).toEqual([]);
  });
  it("proposes nothing for two matching rows", () => {
    expect(run1([deposit(1, "2026-10-12"), deposit(2, "2026-10-13")])).toEqual([]);
  });
  it("proposes nothing when one row could be either of two refunds (D-298)", () => {
    const second = { ...refund, orderId: oid(2) };
    const both = run({ orders: [order(1), order(2)], refunds: [refund, second], rows: [deposit(1, "2026-10-12")] }).refundDeposits;
    expect(both).toEqual([]);
    // Each with its own row, both are proposed.
    const apart = run({
      orders: [order(1), order(2)], refunds: [refund, { ...second, refundMinor: "16000" }],
      rows: [deposit(1, "2026-10-12"), deposit(2, "2026-10-12", "16000")]
    }).refundDeposits;
    expect(apart).toEqual([{ orderId: oid(1), transactionId: tid(1) }, { orderId: oid(2), transactionId: tid(2) }]);
  });
  it("proposes nothing for a wallet refund, a different amount, or a linked row/order", () => {
    expect(run({ orders: [order(1)], refunds: [{ ...refund, refundTo: "wallet" }], rows: [deposit(1, "2026-10-12")] }).refundDeposits).toEqual([]);
    expect(run1([deposit(1, "2026-10-12", "15001")])).toEqual([]);
    const linked = (orderId: string, transactionId: string) => [{ orderId, transactionId, kind: "refund_deposit" as const, action: "link" as const, changedAt: "2026-11-01T00:00:00Z" }];
    expect(run1([deposit(1, "2026-10-12")], { linkEvents: linked(oid(1), tid(1)) })).toEqual([]);
    expect(run1([deposit(1, "2026-10-12")], { linkEvents: linked(oid(7), tid(1)) })).toEqual([]);
  });
  it("judges ambiguity over free rows only: a row an owner match holds does not count", () => {
    // Row 2 is an inflow of the refund amount, held by an owner-matched order 2.
    const held = [order(1), order(2)];
    const owner = run({
      orders: held, refunds: [refund], rows: [deposit(1, "2026-10-12"), deposit(2, "2026-10-13")],
      overlays: [{ orderId: oid(2), decision: "matched", transactionId: tid(2), revision: 1 }]
    }).refundDeposits;
    expect(owner).toEqual([{ orderId: oid(1), transactionId: tid(1) }]);
    // The only candidate is held by an owner match: nothing is proposed.
    const taken = run({
      orders: held, refunds: [refund], rows: [deposit(1, "2026-10-12")],
      overlays: [{ orderId: oid(2), decision: "matched", transactionId: tid(1), revision: 1 }]
    }).refundDeposits;
    expect(taken).toEqual([]);
  });
  it("proposes again after an unlink", () => {
    const events = [
      { orderId: oid(1), transactionId: tid(1), kind: "refund_deposit" as const, action: "link" as const, changedAt: "2026-11-01T00:00:00Z" },
      { orderId: oid(1), transactionId: tid(1), kind: "refund_deposit" as const, action: "unlink" as const, changedAt: "2026-11-02T00:00:00Z" }
    ];
    expect(run1([deposit(1, "2026-10-12")], { linkEvents: events })).toEqual([{ orderId: oid(1), transactionId: tid(1) }]);
  });
});

describe("Excluded rows (task 64)", () => {
  it("skips an Excluded duplicate so the other row matches automatically", () => {
    const rows = [row(1), row(2)];
    expect(stateOf(run({ orders: [order(1)], rows }), 1)?.state).toBe("none");
    const r = run({ orders: [order(1)], rows, excludedTransactionIds: [tid(1)] });
    expect(stateOf(r, 1)).toEqual({ orderId: oid(1), state: "auto", transactionId: tid(2) });
  });
  it("does not offer an Excluded row as a wallet top-up or a refund deposit", () => {
    const wallet = order(1, { kind: "wallet", total: "20000" });
    const topup = row(1, { time: "09:30:00", movement: "-30000" });
    expect(run({ orders: [wallet], rows: [topup] }).walletTopups).toHaveLength(1);
    expect(run({ orders: [wallet], rows: [topup], excludedTransactionIds: [tid(1)] }).walletTopups).toEqual([]);

    const refund = { orderId: oid(1), requestedAt: "2026-10-10T03:00:00Z", refundMinor: "15000", refundTo: "bank" as const };
    const deposit = row(1, { date: "2026-10-12", movement: "15000", description: "INVENTED DEPOSIT", label: "Deposit" });
    expect(run({ orders: [order(1)], refunds: [refund], rows: [deposit] }).refundDeposits).toHaveLength(1);
    expect(run({ orders: [order(1)], refunds: [refund], rows: [deposit], excludedTransactionIds: [tid(1)] }).refundDeposits).toEqual([]);
  });
  it("keeps an owner match on an Excluded row", () => {
    const r = run({
      orders: [order(1)], rows: [row(1)], excludedTransactionIds: [tid(1)],
      overlays: [{ orderId: oid(1), decision: "matched", transactionId: tid(1), revision: 3 }]
    });
    expect(stateOf(r, 1)).toEqual({ orderId: oid(1), state: "matched", transactionId: tid(1), revision: 3 });
  });
});

describe("currentLinks", () => {
  it("keeps the newest event per (order, transaction, kind), whatever the input order", () => {
    const e = (action: "link" | "unlink", changedAt: string, kind: "wallet_topup" | "refund_deposit" = "wallet_topup") =>
      ({ orderId: oid(1), transactionId: tid(1), kind, action, changedAt });
    expect(currentLinks([e("unlink", "2026-10-02T00:00:00Z"), e("link", "2026-10-01T00:00:00Z")])).toEqual([]);
    expect(currentLinks([e("link", "2026-10-01T00:00:00Z"), e("unlink", "2026-10-02T00:00:00Z"), e("link", "2026-10-03T00:00:00Z")]))
      .toEqual([{ orderId: oid(1), transactionId: tid(1), kind: "wallet_topup" }]);
    expect(currentLinks([e("link", "2026-10-01T00:00:00Z"), e("link", "2026-10-01T00:00:00Z", "refund_deposit")])).toHaveLength(2);
  });
});

describe("input validation", () => {
  it("rejects a malformed movement or a non-ISO time rather than guessing", () => {
    expect(() => run({ rows: [{ ...row(1), movement_minor: "10.5" }] })).toThrow();
    expect(() => run({ rows: [{ ...row(1), source_time: "10:00" }] })).toThrow();
    expect(() => run({ orders: [{ ...order(1), paidAt: "yesterday" }] })).toThrow();
  });
});
