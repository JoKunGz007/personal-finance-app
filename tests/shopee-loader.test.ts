import { describe, expect, it } from "vitest";
import { loadShopeeView } from "@/lib/server/shopee";
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

describe("loadShopeeView past 1000 rows", () => {
  it("reads every price line across pages", async () => {
    const lines = Array.from({ length: 2345 }, (_, i) => ({ id: `id-${i}`, order_id: A, position: i + 1, label: "Invented line", amount_minor: 1 }));
    const loaded = await loadShopeeView(client(reads({ shopee_order_price_lines: { data: lines, error: null } })));
    expect(loaded.ok && loaded.view.orders.find((o) => o.id === A)!.priceLines.length).toBe(2345);
  });
});
