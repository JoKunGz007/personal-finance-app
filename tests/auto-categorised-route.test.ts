import { beforeEach, describe, expect, it, vi } from "vitest";

// The auto-categoriser route's own layer (D-245): it reads the inputs and the current matches,
// sends one apply call per 5000 proposals, and refuses — never writes rules over matched rows — when
// either read fails. The database side is pgTAP's (029); here the client is a stub. Every value is invented.
const RIDE_ROW = "dddddddd-0000-4000-8000-000000000101";
const RULE_ROW = "dddddddd-0000-4000-8000-000000000102";
const NOTHING_ROW = "dddddddd-0000-4000-8000-000000000103";
const TRANSPORT = "cafecafe-0000-4000-8000-000000000101";
const RIDE_HAILING = "cafecafe-0000-4000-8000-000000000102";
const STREAMING_PARENT = "cafecafe-0000-4000-8000-000000000103";
const OWN_TRANSFERS = "cafecafe-0000-4000-8000-000000000104";

const state = vi.hoisted(() => ({
  inputs: { data: null as unknown, error: null as unknown },
  matches: { ok: true, matches: [] as unknown[] } as unknown,
  applyCalls: [] as unknown[][],
  applyError: null as unknown,
  /** The 1-based apply call that fails, when set. */
  applyFailAt: null as number | null,
  excluded: { data: [] as unknown, error: null as unknown },
  owner: true
}));

vi.mock("@/lib/server/current-matches", () => ({ loadCurrentMatches: async () => state.matches }));

vi.mock("@/lib/server/supabase", () => ({
  noStoreHeaders: { "Content-Type": "application/json" },
  routeError: (message: string, status: number, details?: unknown) =>
    Response.json({ error: message, ...(details === undefined ? {} : { details }) }, { status }),
  strongOwnerClient: async () => state.owner ? ({
    ok: true,
    supabase: {
      rpc: async (name: string, args?: { p_items?: unknown[] }) => {
        if (name === "list_category_inputs") return state.inputs;
        if (name === "list_auto_excluded_transactions") return state.excluded;
        if (name === "apply_category_proposals") {
          state.applyCalls.push(args!.p_items!);
          return state.applyError || state.applyFailAt === state.applyCalls.length ? { data: null, error: state.applyError ?? { message: "invented failure" } } : { data: { applied: args!.p_items!.length, skipped: 0 }, error: null };
        }
        throw new Error(`unexpected rpc ${name}`);
      }
    }
  }) : { ok: false, status: 403, message: "AAL2 and a verified TOTP factor are required." }
}));

const tx = (id: string, description: string) => ({
  id, amount_minor: "-12300", description, transaction_label: "Card payment", include_in_reporting: true,
  category_id: null, source: null, reviewed: false
});

async function post() {
  const { POST } = await import("@/app/api/v1/transactions/auto-categorised/route");
  return POST();
}

beforeEach(() => {
  state.inputs = {
    data: {
      transactions: [tx(RIDE_ROW, "INVENTED GRAB ROW"), tx(RULE_ROW, "INVENTED NETFLIX ROW"), tx(NOTHING_ROW, "INVENTED UNKNOWN ROW")],
      categories: [
        { id: TRANSPORT, name: "Transport", archived: false, parent_id: null },
        { id: RIDE_HAILING, name: "Ride-hailing", archived: false, parent_id: TRANSPORT },
        { id: STREAMING_PARENT, name: "Subscriptions & Digital", archived: false, parent_id: null },
        { id: OWN_TRANSFERS, name: "Own Transfers", archived: false, parent_id: null }
      ]
    },
    error: null
  };
  state.matches = { ok: true, matches: [{ transaction_id: RIDE_ROW, kind: "ride", entity_id: "dddddddd-0000-4000-8000-000000000201" }] };
  state.applyCalls = [];
  state.applyError = null;
  state.applyFailAt = null;
  state.excluded = { data: [], error: null };
  state.owner = true;
});

describe("POST /api/v1/transactions/auto-categorised", () => {
  it("applies a match and a rule in one call and reports the counts", async () => {
    const response = await post();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ applied: 2, skipped: 0, unresolved: 0, bySource: { match: 1, rule: 1 } });
    expect(state.applyCalls).toEqual([[
      { transaction_id: RIDE_ROW, category_id: RIDE_HAILING, source: "match", detail: { kind: "ride", entity_id: "dddddddd-0000-4000-8000-000000000201" } },
      { transaction_id: RULE_ROW, category_id: STREAMING_PARENT, source: "rule", detail: { rule: "streaming" } }
    ]]);
  });

  it("applies in sequential chunks of 300: 700 items make 3 calls", async () => {
    const many = Array.from({ length: 700 }, (_, n) => tx(`dddddddd-0000-4000-8000-${String(n + 1000).padStart(12, "0")}`, "INVENTED NETFLIX"));
    (state.inputs.data as { transactions: unknown[] }).transactions = many;
    const response = await post();
    expect(response.status).toBe(200);
    expect(state.applyCalls.map((call) => call.length)).toEqual([300, 300, 100]);
    expect((await response.json()).applied).toBe(700);
  });

  it("stops at a failed chunk and reports what the earlier chunks committed", async () => {
    (state.inputs.data as { transactions: unknown[] }).transactions = Array.from({ length: 700 },
      (_, n) => tx(`dddddddd-0000-4000-8000-${String(n + 1000).padStart(12, "0")}`, "INVENTED NETFLIX"));
    state.applyFailAt = 2;
    const response = await post();
    expect(response.status).toBe(400);
    expect(state.applyCalls).toHaveLength(2);
    expect(await response.json()).toEqual({
      error: "Categories could not be applied.",
      details: { applied: 300, skipped: 0, unresolved: 0, bySource: { match: 0, rule: 700 } }
    });
  });

  it("gives Own Transfers only to an automatically excluded row", async () => {
    const excluded = { ...tx(RIDE_ROW, "INVENTED TRANSFER OUT"), include_in_reporting: false };
    const byHand = { ...tx(RULE_ROW, "INVENTED NETFLIX ROW"), include_in_reporting: false };
    (state.inputs.data as { transactions: unknown[] }).transactions = [excluded, byHand];
    state.matches = { ok: true, matches: [] };
    state.excluded = { data: [RIDE_ROW], error: null };
    await post();
    expect(state.applyCalls).toEqual([[
      { transaction_id: RIDE_ROW, category_id: OWN_TRANSFERS, source: "match", detail: { rule: "own-transfer" } },
      { transaction_id: RULE_ROW, category_id: STREAMING_PARENT, source: "rule", detail: { rule: "streaming" } }
    ]]);
  });

  it("refuses, writing nothing, when the auto-excluded read fails", async () => {
    state.excluded = { data: null, error: { message: "strong owner access required" } };
    expect((await post()).status).toBe(400);
    expect(state.applyCalls).toEqual([]);
  });

  it("writes nothing when there is nothing to propose", async () => {
    (state.inputs.data as { transactions: unknown[] }).transactions = [tx(NOTHING_ROW, "INVENTED UNKNOWN ROW")];
    const response = await post();
    expect(await response.json()).toEqual({ applied: 0, skipped: 0, unresolved: 0, bySource: { match: 0, rule: 0 } });
    expect(state.applyCalls).toEqual([]);
  });

  it("refuses, writing nothing, when the match read fails", async () => {
    state.matches = { ok: false, message: "Orders could not be matched to the ledger, so none are shown.", status: 500 };
    const response = await post();
    expect(response.status).toBe(400);
    expect(state.applyCalls).toEqual([]);
  });

  it("refuses an off-contract or failed inputs read", async () => {
    state.inputs = { data: { transactions: [{ id: RIDE_ROW }], categories: [] }, error: null };
    expect((await post()).status).toBe(400);
    state.inputs = { data: null, error: { message: "strong owner access required" } };
    expect((await post()).status).toBe(400);
    expect(state.applyCalls).toEqual([]);
  });

  it("refuses when the apply call fails, without echoing the database", async () => {
    state.applyError = { message: "transaction not owned" };
    const response = await post();
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Categories could not be applied.");
    expect(JSON.stringify(body)).not.toContain("transaction not owned");
  });

  it("refuses a caller who is not the strong owner", async () => {
    state.owner = false;
    const response = await post();
    expect(response.status).toBe(403);
    expect(state.applyCalls).toEqual([]);
  });
});
