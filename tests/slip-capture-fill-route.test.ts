import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildSlipQrPayload } from "@/lib/slip-qr";

// POST /api/v1/slips filling a re-sent slip's blank payee and memo through the correction RPC.
// The database side is the RPCs' own; here the client is a stub. Every value is invented.
const SLIP_ID = "eeeeeeee-0000-4000-8000-000000000301";
const CATEGORY = "cafecafe-0000-4000-8000-000000000301";
const REFERENCE = "202601010000000000000001x";
const PAYLOAD = buildSlipQrPayload({ bankQrCode: "014", reference: REFERENCE });

const state = vi.hoisted(() => ({
  captured: false,
  slip: {} as Record<string, unknown>,
  overlay: { data: null as unknown, error: null as unknown },
  rpcError: null as unknown,
  captureError: null as unknown,
  calls: [] as { name: string; args: Record<string, unknown> }[]
}));

vi.mock("@/lib/server/supabase", () => ({
  noStoreHeaders: { "Content-Type": "application/json" },
  routeError: (message: string, status: number) => Response.json({ error: message }, { status }),
  strongOwnerClient: async () => ({
    ok: true,
    supabase: {
      rpc: async (name: string, args: Record<string, unknown>) => {
        state.calls.push({ name, args });
        if (name === "capture_slip") return state.captureError ? { data: null, error: state.captureError } : { data: { captured: state.captured, slip: state.slip }, error: null };
        if (name === "set_slip_correction") return { data: {}, error: state.rpcError };
        throw new Error(`unexpected rpc ${name}`);
      },
      from: (table: string) => {
        if (table !== "slip_correction_overlays") throw new Error(`unexpected table ${table}`);
        const query = { select: () => query, eq: () => query, maybeSingle: async () => state.overlay };
        return query;
      }
    }
  })
}));

const body = (overrides: Record<string, unknown> = {}) => ({
  qrPayload: PAYLOAD, bankCode: "SCB", bankQrCode: "014", slipReference: REFERENCE, kind: "withdrawal", amountMinor: "-12500",
  currency: "THB", occurredOn: "2026-07-20", occurredAtTime: "13:45", counterparty: "INVENTED PAYEE", categoryId: null, note: "invented memo",
  ...overrides
});

async function post(overrides: Record<string, unknown> = {}) {
  const { POST } = await import("@/app/api/v1/slips/route");
  const response = await POST(new Request("http://localhost/api/v1/slips", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body(overrides))
  }));
  return { status: response.status, body: await response.json() as { filled: boolean } };
}

const fillCalls = () => state.calls.filter((call) => call.name === "set_slip_correction");

beforeEach(() => {
  state.captured = false;
  state.slip = { id: SLIP_ID, counterparty: null, note: null };
  state.overlay = { data: null, error: null };
  state.rpcError = null;
  state.captureError = null;
  state.calls = [];
});

describe("POST /api/v1/slips filling a duplicate", () => {
  it("fills a blank payee and memo with no correction yet, from revision 0", async () => {
    const answer = await post();
    expect(answer).toMatchObject({ status: 200, body: { filled: true } });
    expect(fillCalls()).toHaveLength(1);
    expect(fillCalls()[0]!.args).toEqual({
      p_slip_id: SLIP_ID, p_expected_revision: 0, p_kind: null, p_amount_minor: null, p_occurred_on: null,
      p_occurred_at_time: null, p_counterparty: "INVENTED PAYEE", p_category_id: null, p_note: "invented memo"
    });
  });

  it("carries every existing correction field unchanged and passes its revision", async () => {
    state.overlay = {
      data: {
        kind: "withdrawal", amount_minor: -9900, occurred_on: "2026-07-21", occurred_at_time: "14:00:00",
        counterparty: null, category_id: CATEGORY, note: null, revision: 3
      },
      error: null
    };
    const answer = await post({ note: null });
    expect(answer.body.filled).toBe(true);
    expect(fillCalls()[0]!.args).toEqual({
      p_slip_id: SLIP_ID, p_expected_revision: 3, p_kind: "withdrawal", p_amount_minor: "-9900", p_occurred_on: "2026-07-21",
      p_occurred_at_time: "14:00:00", p_counterparty: "INVENTED PAYEE", p_category_id: CATEGORY, p_note: null
    });
  });

  it("does not touch a slip that already has a payee, and fills only the memo", async () => {
    state.slip = { id: SLIP_ID, counterparty: "STORED PAYEE", note: null };
    const answer = await post();
    expect(answer.body.filled).toBe(true);
    expect(fillCalls()[0]!.args).toMatchObject({ p_counterparty: null, p_note: "invented memo" });
    state.calls = [];
    state.slip = { id: SLIP_ID, counterparty: "STORED PAYEE", note: null };
    expect(await post({ note: null })).toMatchObject({ status: 200, body: { filled: false } });
    expect(fillCalls()).toHaveLength(0);
  });

  it("never overwrites a payee the owner's correction holds", async () => {
    state.overlay = {
      data: { kind: null, amount_minor: null, occurred_on: null, occurred_at_time: null, counterparty: "OWNER PAYEE", category_id: null, note: null, revision: 1 },
      error: null
    };
    const answer = await post({ note: null });
    expect(answer).toMatchObject({ status: 200, body: { filled: false } });
    expect(fillCalls()).toHaveLength(0);
  });

  it("still answers 200 duplicate with filled false when the correction write fails", async () => {
    state.rpcError = { message: "revision conflict" };
    expect(await post()).toMatchObject({ status: 200, body: { filled: false } });
  });

  it("still answers 200 duplicate when the correction read fails", async () => {
    state.overlay = { data: null, error: { message: "boom" } };
    expect(await post()).toMatchObject({ status: 200, body: { filled: false } });
    expect(fillCalls()).toHaveLength(0);
  });

  it("makes no fill attempt for a slip captured now", async () => {
    state.captured = true;
    expect(await post()).toMatchObject({ status: 201, body: { filled: false } });
    expect(fillCalls()).toHaveLength(0);
  });
});

describe("POST /api/v1/slips refusing a possible duplicate (D-258)", () => {
  it("maps 'slip may already be captured' to 409 with an owner-facing message", async () => {
    state.captureError = { message: "slip may already be captured" };
    const answer = await post({ qrPayload: null, bankQrCode: null, slipReference: "20260720INVENTED0001" });
    expect(answer.status).toBe(409);
    expect((answer.body as unknown as { error: string }).error).toContain("same bank, date, time and amount");
    expect(fillCalls()).toHaveLength(0);
  });

  it("still fills a printed slip's blank payee on an exact-reference duplicate", async () => {
    const answer = await post({ qrPayload: null, bankQrCode: null, slipReference: "20260720INVENTED0001" });
    expect(answer).toMatchObject({ status: 200, body: { filled: true } });
    expect(fillCalls()).toHaveLength(1);
  });
});
