import { describe, expect, it } from "vitest";
import { loadShopeeMatchState, loadShopeeView } from "@/lib/server/shopee";
import { loadCurrentMatches } from "@/lib/server/current-matches";
import { shopeeViewSchema } from "@/lib/shopee-view";

// The loader's join of stored orders to the read-time proposals (PLAN task 62 step 4b). The
// database's side is pgTAP's; here the client is a stub and every value is invented.
const A = "aaaaaaaa-0000-4000-8000-000000000001";
const B = "aaaaaaaa-0000-4000-8000-000000000002";
const ROW_AUTO = "bbbbbbbb-0000-4000-8000-000000000001";
const ROW_OWNER = "bbbbbbbb-0000-4000-8000-000000000002";
const ROW_OTHER = "bbbbbbbb-0000-4000-8000-000000000003";
const ACCOUNT = "cccccccc-0000-4000-8000-000000000001";

type Read = { data: unknown; error: unknown; count?: number | null };

function order(id: string, code: string, paidAt: string, total: number) {
  return {
    id, order_code: code, link_id: "1234567890123", placed_at: paidAt, paid_at: paidAt, shop: "Invented shop",
    payment_method: "ตัดบัญชี Invented", payment_kind: "bank_debit", total_minor: total
  };
}

function ledgerRow(id: string, date: string, time: string, movement: number) {
  return {
    transaction_id: id, account_id: ACCOUNT, source_date: date, source_time: time,
    transaction_label: "Card payment", description: "SHOPEEPAY INVENTED", movement_minor: String(movement)
  };
}

function reads(overrides: Record<string, Read> = {}): Record<string, Read> {
  return {
    shopee_orders: {
      data: [order(A, "INVENTED0001", "2026-09-01T12:00:00+00:00", 25000), order(B, "INVENTED0002", "2026-09-02T12:00:00+00:00", 9900)],
      error: null
    },
    shopee_order_items: {
      data: [
        { order_id: A, position: 2, name: "Invented second", variation: null, quantity: 1, price_minor: 5000, original_price_minor: null },
        { order_id: A, position: 1, name: "Invented first", variation: "Blue", quantity: 2, price_minor: 10000, original_price_minor: 12000 }
      ],
      error: null
    },
    shopee_order_price_lines: {
      data: [
        { order_id: A, position: 2, label: "Invented shipping", amount_minor: 0 },
        { order_id: A, position: 1, label: "Invented items", amount_minor: 25000 }
      ],
      error: null
    },
    shopee_refunds: { data: [], error: null },
    shopee_payment_match_overlays: {
      data: [{ order_id: B, decision: "matched", transaction_id: ROW_OWNER, revision: 2 }],
      error: null
    },
    shopee_order_links: { data: [], error: null },
    shopee_ledger_rows: {
      data: [
        ledgerRow(ROW_AUTO, "2026-09-01", "19:00:30", -25000),
        ledgerRow(ROW_OWNER, "2026-09-02", "19:30:00", -9900),
        ledgerRow(ROW_OTHER, "2026-09-03", "08:00:00", -1234)
      ],
      error: null
    },
    transaction_overlays: { data: [], error: null },
    shopee_monthly_summary: {
      data: {
        months: [{
          month: "2026-09", orders: 2, cancelled: 0, spentMinor: "34900", refundedMinor: "0",
          byKind: { bank_debit: "34900", wallet: "0", spaylater: "0", other: "0" }
        }]
      },
      error: null
    },
    ...overrides
  };
}

function client(data: Record<string, Read>) {
  // A paging stub: honours .range() over the fixture and reports the exact count.
  const query = (name: string) => {
    const read = data[name] as Read;
    const rows = Array.isArray(read.data) ? read.data : null;
    let range: [number, number] = [0, Number.MAX_SAFE_INTEGER];
    const chain = {
      order: () => chain,
      eq: () => chain,
      range: (from: number, to: number) => { range = [from, to]; return chain; },
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({
        data: rows ? rows.slice(range[0], range[1] + 1) : read.data,
        error: read.error,
        count: read.count === undefined ? (rows ? rows.length : null) : read.count
      }).then(resolve)
    };
    return chain;
  };
  return {
    from: (table: string) => ({ select: () => query(table) }),
    rpc: (name: string) => query(name)
  } as unknown as Parameters<typeof loadShopeeView>[0];
}

describe("loadShopeeView", () => {
  it("joins the proposals to the orders and publishes only the rows something refers to", async () => {
    const loaded = await loadShopeeView(client(reads()));
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const view = shopeeViewSchema.parse(JSON.parse(JSON.stringify(loaded.view)));
    // Newest first.
    expect(view.orders.map((o) => o.id)).toEqual([B, A]);
    const a = view.orders.find((o) => o.id === A)!;
    expect(a.match).toEqual({ state: "auto", transactionId: ROW_AUTO, revision: 0 });
    expect(a.orderUrl).toBe("https://shopee.co.th/user/purchase/order/1234567890123");
    expect(a.totalMinor).toBe("25000");
    expect(a.items.map((i) => [i.position, i.priceMinor])).toEqual([[1, "10000"], [2, "5000"]]);
    expect(a.priceLines.map((l) => l.position)).toEqual([1, 2]);
    expect(view.orders.find((o) => o.id === B)!.match).toEqual({ state: "matched", transactionId: ROW_OWNER, revision: 2 });
    expect(Object.keys(view.rows).sort()).toEqual([ROW_AUTO, ROW_OWNER]);
    expect(view.rows[ROW_AUTO]).toMatchObject({ date: "2026-09-01", time: "19:00:30", movement: "-25000" });
  });

  it("publishes current links only, and keeps their rows", async () => {
    const loaded = await loadShopeeView(client(reads({
      shopee_order_links: {
        data: [
          { order_id: A, transaction_id: ROW_OTHER, kind: "wallet_topup", action: "link", changed_at: "2026-09-04T01:00:00+00:00" },
          { order_id: A, transaction_id: ROW_OTHER, kind: "wallet_topup", action: "unlink", changed_at: "2026-09-04T02:00:00+00:00" },
          { order_id: B, transaction_id: ROW_OTHER, kind: "spaylater_repayment", action: "link", changed_at: "2026-09-04T03:00:00+00:00" }
        ],
        error: null
      }
    })));
    expect(loaded.ok && loaded.view.links).toEqual([{ orderId: B, transactionId: ROW_OTHER, kind: "spaylater_repayment" }]);
    expect(loaded.ok && Object.keys(loaded.view.rows)).toContain(ROW_OTHER);
  });

  it("refuses the whole view when a read fails, is cut at max_rows, or is off-contract", async () => {
    const failed = await loadShopeeView(client(reads({ shopee_ledger_rows: { data: null, error: { message: "invented" } } })));
    expect(failed).toMatchObject({ ok: false, status: 500 });
    const cut = await loadShopeeView(client(reads({ shopee_orders: { data: [], count: 1181, error: null } })));
    expect(cut).toMatchObject({ ok: false, status: 500 });
    const off = await loadShopeeView(client(reads({
      shopee_payment_match_overlays: { data: [{ order_id: A, decision: "maybe", transaction_id: null, revision: 1 }], error: null }
    })));
    expect(off).toMatchObject({ ok: false, status: 500 });
  });

  it("publishes the SQL monthly summary, and refuses the view when that read fails or is off-contract", async () => {
    const loaded = await loadShopeeView(client(reads()));
    expect(loaded.ok && loaded.view.summary.months[0]).toMatchObject({ month: "2026-09", orders: 2, spentMinor: "34900" });
    const failed = await loadShopeeView(client(reads({ shopee_monthly_summary: { data: null, error: { message: "invented" } } })));
    expect(failed).toMatchObject({ ok: false, status: 500 });
    const off = await loadShopeeView(client(reads({ shopee_monthly_summary: { data: { months: [{ month: "2026-09", spentMinor: 3.5 }] }, error: null } })));
    expect(off).toMatchObject({ ok: false, status: 500 });
  });
});

describe("loadShopeeView Excluded rows (task 64)", () => {
  const ROW_DUP = "bbbbbbbb-0000-4000-8000-000000000004";
  it("filters an Excluded duplicate so the order auto-matches", async () => {
    const withDup = {
      shopee_ledger_rows: {
        data: [ledgerRow(ROW_AUTO, "2026-09-01", "19:00:30", -25000), ledgerRow(ROW_DUP, "2026-09-01", "19:00:40", -25000),
          ledgerRow(ROW_OWNER, "2026-09-02", "19:30:00", -9900)],
        error: null
      }
    };
    const both = await loadShopeeView(client(reads(withDup)));
    expect(both.ok && both.view.orders.find((o) => o.id === A)!.match.state).toBe("none");
    const loaded = await loadShopeeView(client(reads({
      ...withDup, transaction_overlays: { data: [{ transaction_id: ROW_DUP }], error: null }
    })));
    expect(loaded.ok && loaded.view.orders.find((o) => o.id === A)!.match)
      .toEqual({ state: "auto", transactionId: ROW_AUTO, revision: 0 });
  });
  it("refuses the view when the Excluded read fails", async () => {
    const failed = await loadShopeeView(client(reads({ transaction_overlays: { data: null, error: { message: "invented" } } })));
    expect(failed).toEqual({ ok: false, message: "Shopee orders could not be loaded in full, so none are shown.", status: 500 });
  });
});

describe("loadShopeeView past 1000 rows", () => {
  it("reads every price line across pages", async () => {
    const lines = Array.from({ length: 2345 }, (_, i) => ({ id: `id-${i}`, order_id: A, position: i + 1, label: "Invented line", amount_minor: 1 }));
    const loaded = await loadShopeeView(client(reads({ shopee_order_price_lines: { data: lines, error: null } })));
    expect(loaded.ok && loaded.view.orders.find((o) => o.id === A)!.priceLines.length).toBe(2345);
  });
});

describe("loadShopeeMatchState (D-277)", () => {
  const summaryDown = { shopee_monthly_summary: { data: null, error: { message: "invented" } } };
  const itemsDown = { shopee_order_items: { data: null, error: { message: "invented" } } };

  it("succeeds when only the summary read fails, while the full view refuses", async () => {
    expect(await loadShopeeView(client(reads(summaryDown)))).toMatchObject({ ok: false, status: 500 });
    const state = await loadShopeeMatchState(client(reads(summaryDown)));
    expect(state.ok && state.currentMatchInput.orders.find((o) => o.id === A)!.match)
      .toEqual({ state: "auto", transactionId: ROW_AUTO, revision: 0 });
  });
  it("succeeds when only the items or price-line read fails, while the full view refuses", async () => {
    expect(await loadShopeeView(client(reads(itemsDown)))).toMatchObject({ ok: false, status: 500 });
    expect((await loadShopeeMatchState(client(reads(itemsDown)))).ok).toBe(true);
    const lines = { shopee_order_price_lines: { data: null, error: { message: "invented" } } };
    expect(await loadShopeeView(client(reads(lines)))).toMatchObject({ ok: false, status: 500 });
    expect((await loadShopeeMatchState(client(reads(lines)))).ok).toBe(true);
  });
  it("still refuses on a match-side read failure, with the view's message", async () => {
    const failed = await loadShopeeMatchState(client(reads({ shopee_ledger_rows: { data: null, error: { message: "invented" } } })));
    expect(failed).toEqual({ ok: false, message: "Shopee orders could not be loaded in full, so none are shown.", status: 500 });
  });
  it("loadCurrentMatches still lists Shopee matches when the summary read fails", async () => {
    const data = reads(summaryDown);
    const base = client(data) as unknown as { from: (t: string) => unknown; rpc: (n: string) => unknown };
    const empty = { data: [], error: null, count: 0 };
    // Any table the Shopee fixture does not name reads as empty, through a chain that answers every call.
    const emptyChain: Record<string, unknown> = {
      then: (r: (v: unknown) => unknown) => Promise.resolve(empty).then(r)
    };
    for (const m of ["select", "order", "range", "eq", "in", "is", "neq", "gte", "lte", "not", "or"]) emptyChain[m] = () => emptyChain;
    const stub = {
      from: (t: string) => (t in data ? base.from(t) : emptyChain),
      rpc: (n: string) => (n in data ? base.rpc(n) : emptyChain)
    } as unknown as Parameters<typeof loadShopeeView>[0];
    const loaded = await loadCurrentMatches(stub);
    expect(loaded.ok && loaded.matches.filter((m) => m.kind === "shopee_order").map((m) => m.entity_id).sort()).toEqual([A, B]);
  });
});
