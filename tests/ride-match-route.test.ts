import { beforeEach, describe, expect, it, vi } from "vitest";

// The ride match route's own layer (D-222's open review item): the RPC it calls and with what, the
// decision read back in its published shape, and each database refusal translated — a ride's own
// refusals before the generic ones. The database's side is pgTAP's (022); here the client is a stub.
// Every value is invented.
const RIDE = "dddddddd-0000-4000-8000-000000000071";
const ROW = "eeeeeeee-0000-4000-8000-000000000071";

const rpc = vi.hoisted(() => ({
  result: { data: null as unknown, error: null as { message: string } | null },
  calls: [] as { name: string; args: Record<string, unknown> }[]
}));

vi.mock("@/lib/server/supabase", () => ({
  noStoreHeaders: { "Content-Type": "application/json" },
  routeError: (message: string, status: number) => Response.json({ error: message }, { status }),
  strongOwnerClient: async () => ({
    ok: true,
    supabase: {
      rpc: async (name: string, args: Record<string, unknown>) => { rpc.calls.push({ name, args }); return rpc.result; }
    }
  })
}));

beforeEach(() => {
  rpc.calls = [];
  rpc.result = { data: { ride_id: RIDE, decision: "matched", transaction_id: ROW, revision: 2 }, error: null };
});

async function put(id: string, body: unknown) {
  const { PUT } = await import("@/app/api/v1/rides/[id]/match/route");
  const response = await PUT(new Request(`http://localhost/api/v1/rides/${id}/match`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
  }), { params: Promise.resolve({ id }) });
  return { status: response.status, body: await response.json() as Record<string, unknown> };
}

const link = { expectedRevision: 1, decision: "matched", transactionId: ROW };

describe("PUT /api/v1/rides/[id]/match (D-222)", () => {
  it("sends the decision to set_ride_match and returns it as a ride's", async () => {
    const response = await put(RIDE, link);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ match: { ride_id: RIDE, decision: "matched", transaction_id: ROW, revision: 2 } });
    expect(rpc.calls).toEqual([{
      name: "set_ride_match",
      args: { p_ride_id: RIDE, p_expected_revision: 1, p_decision: "matched", p_transaction_id: ROW }
    }]);
  });

  it("refuses a malformed id or decision before calling the database", async () => {
    expect((await put("not-a-uuid", link)).status).toBe(400);
    expect((await put(RIDE, { ...link, decision: "maybe" })).status).toBe(422);
    expect(rpc.calls).toEqual([]);
  });

  it.each([
    ["ride paid in full by discounts", 422, /paid in full by discounts/],
    // A ride's own claim refusal first: it names the food order, not "another ride".
    ["transaction already claimed by a delivery", 409, /food order is already linked/],
    ["transaction already claimed", 409, /Another ride is already linked/],
    ["revision conflict", 409, /This ride's match changed/],
    ["ride match amount mismatch", 422, /not this ride's total/],
    ["ride not owned", 404, /That ride does not exist/],
    ["transaction not owned", 422, /That ledger row does not exist/],
    ["something unexpected", 400, /could not be saved/]
  ])("translates %s", async (message, status, said) => {
    rpc.result = { data: null, error: { message } };
    const response = await put(RIDE, link);
    expect(response.status).toBe(status);
    expect(response.body.error).toMatch(said);
    expect(String(response.body.error)).not.toContain(message);
  });

  it("says the decision landed when its read-back is off-contract, rather than inviting a repeat", async () => {
    rpc.result = { data: { delivery_id: RIDE, decision: "matched", transaction_id: ROW, revision: 2 }, error: null };
    const response = await put(RIDE, link);
    expect(response.status).toBe(500);
    expect(response.body.error).toMatch(/was saved/);
  });
});
