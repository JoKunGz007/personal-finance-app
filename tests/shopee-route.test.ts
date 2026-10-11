import { beforeEach, describe, expect, it, vi } from "vitest";

// The Shopee route's own layer (D-270): auth refusal, a bad file, chunking and the refusal merge.
// The database side is pgTAP's; here the client is a stub. Every value is invented.
const state = vi.hoisted(() => ({
  auth: true,
  calls: [] as { orders: unknown[] }[],
  answer: (() => ({ data: null, error: null })) as (n: number) => { data: unknown; error: unknown }
}));

vi.mock("@/lib/server/supabase", () => ({
  noStoreHeaders: { "Content-Type": "application/json" },
  routeError: (message: string, status: number) => Response.json({ error: message }, { status }),
  strongOwnerClient: async () => state.auth
    ? {
      ok: true,
      supabase: {
        rpc: async (name: string, args: { p_request: { orders: unknown[] } }) => {
          if (name !== "capture_shopee_orders") throw new Error("unexpected rpc");
          state.calls.push(args.p_request);
          return state.answer(state.calls.length);
        }
      }
    }
    : { ok: false, message: "Sign in again.", status: 401 }
}));

const answer = (over: Record<string, unknown> = {}) => ({
  data: { new: 1, stored: 0, beforeLedger: 0, refundsNew: 0, refundsStored: 0, refused: [], ...over }, error: null
});

function order(n: number) {
  return {
    url: `https://shopee.co.th/user/purchase/order/${String(10000000000000 + n)}`, orderId: `INV${n}`, status: "Completed",
    timeline: { "Order Placed": "05-09-2026 10:30" },
    shops: [{ name: "Invented shop", items: [{ name: "Thing", variation: null, qty: 1, price: "10", originalPrice: null }] }],
    priceRows: [{ label: "Merchandise Subtotal", amount: "10" }], orderTotal: "10", paymentMethod: "Invented pay",
    check: "ok", itemsCheck: "ok", itemPriceIs: "line total"
  };
}
const exportOf = (orders: unknown[]) => ({ source: "shopee.co.th order detail", version: 2, exportedAt: "x", orders });

const post = async (body: unknown) => {
  const { POST } = await import("@/app/api/v1/inbox/shopee/route");
  return POST(new Request("http://localhost/api/v1/inbox/shopee", {
    method: "POST", body: typeof body === "string" ? body : JSON.stringify(body)
  }));
};

beforeEach(() => {
  state.auth = true;
  state.calls = [];
  state.answer = () => answer();
});

describe("POST /api/v1/inbox/shopee", () => {
  it("refuses without an owner session before reading anything", async () => {
    state.auth = false;
    expect((await post(exportOf([order(1)]))).status).toBe(401);
    expect(state.calls).toEqual([]);
  });

  it("answers 400 for a file that is not JSON or not a Shopee export", async () => {
    expect((await post("not json")).status).toBe(400);
    const other = await post({ source: "elsewhere", orders: [] });
    expect(other.status).toBe(400);
    expect(await other.json()).toEqual({ error: "This is not a Shopee order export." });
    expect(state.calls).toEqual([]);
  });

  it("answers 413 for a body over 5 MB", async () => {
    expect((await post("x".repeat(5 * 1024 * 1024 + 1))).status).toBe(413);
  });

  it("sends the parsed orders to capture_shopee_orders and returns the totals", async () => {
    const response = await post(exportOf([order(1), order(2)]));
    expect(response.status).toBe(200);
    expect(state.calls).toHaveLength(1);
    expect(state.calls[0]!.orders).toHaveLength(2);
    expect(state.calls[0]!.orders[0]).toMatchObject({ orderCode: "INV1", totalMinor: "1000" });
    expect(await response.json()).toEqual({ version: 2, new: 1, stored: 0, beforeLedger: 0, refundsNew: 0, refundsStored: 0, refused: [] });
  });

  it("calls the database twice for more than 500 orders and sums the answers", async () => {
    state.answer = (n) => n === 1
      ? answer({ new: 400, stored: 100, beforeLedger: 0, refundsNew: 2 })
      : answer({ new: 1, stored: 0, beforeLedger: 0, refundsStored: 1 });
    const orders = Array.from({ length: 501 }, (_, i) => order(i + 1));
    const body = await (await post(exportOf(orders))).json();
    expect(state.calls.map((call) => call.orders.length)).toEqual([500, 1]);
    expect(body).toMatchObject({ new: 401, stored: 100, refundsNew: 2, refundsStored: 1 });
  });

  it("merges the parser's refusals with the database's", async () => {
    state.answer = () => answer({ refused: [{ orderCode: "INV1", reason: "Invented database reason" }] });
    const body = await (await post(exportOf([order(1), { url: "https://shopee.co.th/user/purchase/order/12345678901234", error: "x" }]))).json();
    expect(body.refused).toEqual([
      { orderCode: null, reason: "The page could not be read when the file was made." },
      { orderCode: "INV1", reason: "Invented database reason" }
    ]);
  });

  it("makes no database call when every order is refused", async () => {
    const body = await (await post(exportOf([{ url: "u", error: "x" }]))).json();
    expect(state.calls).toEqual([]);
    expect(body).toMatchObject({ new: 0, stored: 0 });
    expect(body.refused).toHaveLength(1);
  });

  it("maps a database error without echoing its message", async () => {
    state.answer = () => ({ data: null, error: { message: "boom with 12345" } });
    const response = await post(exportOf([order(1)]));
    expect(response.status).toBe(400);
    expect(JSON.stringify(await response.json())).not.toContain("12345");
    // The removed "disagrees with the stored copy" branch now falls through to the same answer.
    state.calls = [];
    state.answer = () => ({ data: null, error: { message: "order disagrees with the stored copy" } });
    const same = await post(exportOf([order(1)]));
    expect(same.status).toBe(400);
    expect(await same.json()).toEqual({ error: "The orders could not be stored." });
  });

  it("reports what landed when a later chunk fails, without echoing the database message", async () => {
    state.answer = (n) => n === 1
      ? answer({ new: 400, stored: 100 })
      : { data: null, error: { message: "boom with 99887" } };
    const orders = Array.from({ length: 501 }, (_, i) => order(i + 1));
    const response = await post(exportOf(orders));
    expect(response.status).toBe(500);
    expect(state.calls.map((call) => call.orders.length)).toEqual([500, 1]);
    const { error } = await response.json() as { error: string };
    expect(error).toContain("first 500 orders were processed (400 new, 100 already stored)");
    expect(error).toContain("the rest were not");
    expect(error).toContain("safe");
    expect(error).not.toContain("99887");
  });
});
