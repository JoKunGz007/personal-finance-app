import { beforeEach, describe, expect, it, vi } from "vitest";
import { deliveryListSchema } from "@/lib/deliveries";

// The list route's own layer over its three reads (D-220): the match computed on the server, a
// ฿0 order read as `outside` from a total PostgREST sends as a number, and a refusal — never
// "no row" — when the candidate or decision read is off-contract. The database's side is
// pgTAP's (021); here the client is a stub. Every value is invented.
const ORDER = "dddddddd-0000-4000-8000-000000000051";
const FREE = "dddddddd-0000-4000-8000-000000000052";
const ROW = "eeeeeeee-0000-4000-8000-000000000051";
const ACCOUNT = "ffffffff-0000-4000-8000-000000000051";

const reads = vi.hoisted(() => ({
  candidates: { data: [] as unknown, error: null as unknown },
  decisions: { data: [] as unknown, error: null as unknown }
}));

function order(id: string, total: number) {
  return {
    id, platform: "grabfood", booking_id: `A-${id.slice(-6)}`, restaurant: "Invented kitchen", payment_method: null,
    receipt_sent_at: "2026-09-01T12:10:00+00:00", food_minor: total, delivery_fee_minor: null, total_minor: total,
    items: [{ position: 1, quantity: 1, name: "Invented dish", options: [], amount_minor: total }], adjustments: []
  };
}

vi.mock("@/lib/server/supabase", () => ({
  noStoreHeaders: { "Content-Type": "application/json" },
  routeError: (message: string, status: number) => Response.json({ error: message }, { status }),
  strongOwnerClient: async () => ({
    ok: true,
    supabase: {
      from: (table: string) => table === "deliveries"
        ? { select: () => ({ order: async () => ({ data: [order(ORDER, 14100), order(FREE, 0)], error: null }) }) }
        : { select: async () => reads.decisions },
      rpc: async () => reads.candidates
    }
  })
}));

const candidate = (delivery: string) => ({
  delivery_id: delivery, transaction_id: ROW, account_id: ACCOUNT, source_date: "2026-09-01", source_time: "19:02:00",
  transaction_label: "Card payment", description: "INVENTED GRAB MERCHANT", lag_minutes: -8, names_grab: true
});

beforeEach(() => {
  reads.candidates = { data: [candidate(ORDER), candidate(FREE)], error: null };
  reads.decisions = { data: [], error: null };
});

async function list() {
  const { GET } = await import("@/app/api/v1/deliveries/route");
  return GET();
}

describe("GET /api/v1/deliveries", () => {
  it("matches a paid order and reads a ฿0 order as paid outside, even with a candidate in hand", async () => {
    const response = await list();
    expect(response.status).toBe(200);
    const { deliveries } = deliveryListSchema.parse(await response.json());
    const byId = new Map(deliveries.map((delivery) => [delivery.id, delivery]));
    expect(byId.get(ORDER)!.match).toMatchObject({ status: "matched", row: { transaction_id: ROW } });
    expect(byId.get(FREE)!.match).toEqual({ status: "outside", row: null, options: [], revision: 0 });
    expect(byId.get(FREE)!.total_minor).toBe("0");
  });

  it("refuses the whole list when the candidate read fails, rather than showing no row", async () => {
    reads.candidates = { data: null, error: { message: "invented failure" } };
    expect((await list()).status).toBe(500);
  });

  it("refuses the whole list when a candidate is off-contract", async () => {
    reads.candidates = { data: [{ ...candidate(ORDER), lag_minutes: "soon" }], error: null };
    expect((await list()).status).toBe(500);
  });

  it("refuses the whole list when a decision is off-contract", async () => {
    reads.decisions = { data: [{ delivery_id: ORDER, decision: "maybe", transaction_id: null, revision: 1 }], error: null };
    expect((await list()).status).toBe(500);
  });
});
