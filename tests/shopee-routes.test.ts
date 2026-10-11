import { beforeEach, describe, expect, it, vi } from "vitest";

// The Shopee routes' own layer (PLAN task 62 step 4b): refusal before the database, the exact RPC
// arguments, and the translation of each raised message. The database's side is pgTAP's; the
// client is a stub and every value is invented.
const ORDER_A = "aaaaaaaa-0000-4000-8000-000000000001";
const ORDER_B = "aaaaaaaa-0000-4000-8000-000000000002";
const ROW = "bbbbbbbb-0000-4000-8000-000000000001";

const state = vi.hoisted(() => ({
  auth: { ok: true } as { ok: boolean; status?: number; message?: string },
  calls: [] as { name: string; args: unknown }[],
  result: { data: null as unknown, error: null as { message: string } | null }
}));

vi.mock("@/lib/server/supabase", () => ({
  noStoreHeaders: { "Content-Type": "application/json" },
  routeError: (message: string, status: number, details?: unknown) =>
    Response.json({ error: message, ...(details === undefined ? {} : { details }) }, { status }),
  strongOwnerClient: async () => state.auth.ok
    ? {
      ok: true,
      supabase: {
        rpc: async (name: string, args: unknown) => { state.calls.push({ name, args }); return state.result; }
      }
    }
    : state.auth
}));

const post = async (path: "match" | "links", body: unknown) => {
  const { POST } = path === "match" ? await import("@/app/api/v1/shopee/match/route") : await import("@/app/api/v1/shopee/links/route");
  return POST(new Request(`http://localhost/api/v1/shopee/${path}`, { method: "POST", body: JSON.stringify(body) }));
};

beforeEach(() => {
  state.auth = { ok: true };
  state.calls = [];
  state.result = { data: null, error: null };
});

describe("POST /api/v1/shopee/match", () => {
  const body = {
    transactionId: ROW,
    orders: [{ orderId: ORDER_A, expectedRevision: 0 }, { orderId: ORDER_B, expectedRevision: 3 }],
    decision: "matched"
  };
  const stored = (revision: number) => ({
    orders: [
      { order_id: ORDER_A, owner_id: "x", decision: "matched", transaction_id: ROW, revision, updated_at: "2026-09-01T00:00:00Z" },
      { order_id: ORDER_B, owner_id: "x", decision: "matched", transaction_id: ROW, revision: revision + 1, updated_at: "2026-09-01T00:00:00Z" }
    ]
  });

  it("refuses an unauthenticated caller before reading the body", async () => {
    state.auth = { ok: false, status: 401, message: "Sign in to continue." };
    expect((await post("match", body)).status).toBe(401);
    state.auth = { ok: false, status: 403, message: "This identity is not the ledger owner." };
    expect((await post("match", body)).status).toBe(403);
    expect(state.calls).toEqual([]);
  });

  it("passes the exact arguments, with the orders as the jsonb the RPC reads", async () => {
    state.result = { data: stored(1), error: null };
    const response = await post("match", body);
    expect(response.status).toBe(200);
    expect(state.calls).toEqual([{
      name: "set_shopee_payment_match",
      args: {
        p_transaction_id: ROW,
        p_orders: [{ orderId: ORDER_A, expectedRevision: 0 }, { orderId: ORDER_B, expectedRevision: 3 }],
        p_decision: "matched"
      }
    }]);
    // The owner id and timestamp of the stored row are not echoed.
    expect(await response.json()).toEqual({
      orders: [
        { orderId: ORDER_A, decision: "matched", transactionId: ROW, revision: 1 },
        { orderId: ORDER_B, decision: "matched", transactionId: ROW, revision: 2 }
      ]
    });
  });

  it("passes an undo with a null row", async () => {
    state.result = { data: { orders: [{ order_id: ORDER_A, decision: "unmatched", transaction_id: null, revision: 2 }] }, error: null };
    const response = await post("match", { transactionId: null, orders: [{ orderId: ORDER_A, expectedRevision: 1 }], decision: "unmatched" });
    expect(response.status).toBe(200);
    expect(state.calls[0]!.args).toEqual({ p_transaction_id: null, p_orders: [{ orderId: ORDER_A, expectedRevision: 1 }], p_decision: "unmatched" });
  });

  it("refuses a malformed body with 422 before the database sees it", async () => {
    const bad: unknown[] = [
      null,
      { ...body, extra: 1 },
      { ...body, orders: [] },
      { ...body, orders: Array.from({ length: 21 }, () => ({ orderId: ORDER_A, expectedRevision: 0 })) },
      { ...body, orders: [{ orderId: "nope", expectedRevision: 0 }] },
      { ...body, orders: [{ orderId: ORDER_A, expectedRevision: -1 }] },
      { ...body, orders: [{ orderId: ORDER_A, expectedRevision: 0, extra: true }] },
      { ...body, decision: "maybe" },
      { ...body, transactionId: null },
      { ...body, decision: "unmatched" }
    ];
    for (const candidate of bad) expect((await post("match", candidate)).status).toBe(422);
    expect(state.calls).toEqual([]);
  });

  it.each([
    ["shopee match revision conflict", 409],
    ["shopee match amount mismatch", 409],
    ["ledger row already claimed by another shopee order", 409],
    ["shopee order already matched to another ledger row", 409],
    ["combined shopee match must be undone whole", 409],
    ["shopee order paid outside the platform", 409],
    ["shopee order not owned", 404],
    ["transaction not owned", 422],
    ["invalid shopee match orders", 400],
    ["something unexpected quoting 424242", 400]
  ])("translates %s to %i without echoing it", async (message, status) => {
    state.result = { data: null, error: { message } };
    const response = await post("match", body);
    expect(response.status).toBe(status);
    const said = ((await response.json()) as { error: string }).error;
    expect(said).not.toContain(message);
    expect(said).not.toContain("424242");
  });

  it("answers 500, not success, when the stored decision cannot be read back", async () => {
    state.result = { data: { orders: [{ order_id: "nope" }] }, error: null };
    expect((await post("match", body)).status).toBe(500);
  });
});

describe("POST /api/v1/shopee/links", () => {
  const body = { kind: "spaylater_repayment", transactionId: ROW, orderIds: [ORDER_A, ORDER_B], action: "link" };

  it("refuses an unauthenticated caller", async () => {
    state.auth = { ok: false, status: 401, message: "Sign in to continue." };
    expect((await post("links", body)).status).toBe(401);
    expect(state.calls).toEqual([]);
  });

  it("passes the exact arguments and returns the changed count", async () => {
    state.result = { data: { changed: 2 }, error: null };
    const response = await post("links", body);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ changed: 2 });
    expect(state.calls).toEqual([{
      name: "set_shopee_order_links",
      args: { p_kind: "spaylater_repayment", p_transaction_id: ROW, p_order_ids: [ORDER_A, ORDER_B], p_action: "link" }
    }]);
  });

  it("refuses a malformed body with 422 before the database sees it", async () => {
    const bad: unknown[] = [
      null,
      { ...body, extra: 1 },
      { ...body, kind: "gift" },
      { ...body, action: "toggle" },
      { ...body, transactionId: "nope" },
      { ...body, transactionId: null },
      { ...body, orderIds: [] },
      { ...body, orderIds: Array.from({ length: 21 }, () => ORDER_A) },
      { ...body, orderIds: ["nope"] }
    ];
    for (const candidate of bad) expect((await post("links", candidate)).status).toBe(422);
    expect(state.calls).toEqual([]);
  });

  it.each([
    ["shopee link kind mismatch", 409],
    ["invalid shopee link", 400],
    ["shopee order not owned", 404],
    ["transaction not owned", 422],
    ["something unexpected quoting 424242", 400]
  ])("translates %s to %i without echoing it", async (message, status) => {
    state.result = { data: null, error: { message } };
    const response = await post("links", body);
    expect(response.status).toBe(status);
    const said = ((await response.json()) as { error: string }).error;
    expect(said).not.toContain(message);
    expect(said).not.toContain("424242");
  });
});
