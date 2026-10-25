import { beforeEach, describe, expect, it, vi } from "vitest";

// The mail-sync-runs and coverage routes (migration 064). The client is a stub; every value is invented.
const ACCOUNT = "aaaaaaaa-0000-4000-8000-000000000001";

const state = vi.hoisted(() => ({
  owner: true,
  rpcCalls: [] as { name: string; args: unknown }[],
  rpc: { data: null as unknown, error: null as unknown },
  syncRows: { data: [] as unknown[], error: null as unknown }
}));

vi.mock("@/lib/server/supabase", () => ({
  noStoreHeaders: { "Content-Type": "application/json" },
  routeError: (message: string, status: number) => Response.json({ error: message }, { status }),
  strongOwnerClient: async () => state.owner ? ({
    ok: true,
    supabase: {
      rpc: async (name: string, args?: unknown) => { state.rpcCalls.push({ name, args }); return state.rpc; },
      from: (table: string) => {
        if (table !== "mail_sync_runs") throw new Error(`unexpected table ${table}`);
        const chain = {
          select: () => chain,
          order: () => chain,
          limit: async () => state.syncRows
        };
        return chain;
      }
    }
  }) : { ok: false, status: 403, message: "AAL2 and a verified TOTP factor are required." }
}));

const request = (body: unknown) => new Request("http://x.test/api/v1/mail-sync-runs", {
  method: "POST", headers: { "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body)
});

beforeEach(() => {
  state.owner = true;
  state.rpcCalls = [];
  state.rpc = { data: null, error: null };
  state.syncRows = { data: [], error: null };
});

describe("POST /api/v1/mail-sync-runs", () => {
  it("calls record_mail_sync and answers the finish time", async () => {
    state.rpc = { data: "2026-10-25T01:02:03.456+00:00", error: null };
    const { POST } = await import("@/app/api/v1/mail-sync-runs/route");
    const response = await POST(request({ complete: false }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ finishedAt: "2026-10-25T01:02:03.456+00:00" });
    expect(state.rpcCalls).toEqual([{ name: "record_mail_sync", args: { p_complete: false } }]);
  });

  it.each([
    ["a missing field", {}],
    ["a string flag", { complete: "true" }],
    ["an extra key", { complete: true, extra: 1 }],
    ["a non-object", []],
    ["bad JSON", "{nope"]
  ])("rejects %s with 400 and calls nothing", async (_label, body) => {
    const { POST } = await import("@/app/api/v1/mail-sync-runs/route");
    expect((await POST(request(body))).status).toBe(400);
    expect(state.rpcCalls).toEqual([]);
  });

  it("answers an unauthorised owner as other routes do", async () => {
    state.owner = false;
    const { POST } = await import("@/app/api/v1/mail-sync-runs/route");
    expect((await POST(request({ complete: true }))).status).toBe(403);
    expect(state.rpcCalls).toEqual([]);
  });

  it("answers 400 when the RPC errors", async () => {
    state.rpc = { data: null, error: { message: "invented" } };
    const { POST } = await import("@/app/api/v1/mail-sync-runs/route");
    expect((await POST(request({ complete: true }))).status).toBe(400);
  });
});

describe("GET /api/v1/accounts/coverage", () => {
  it("maps rows and the newest sync, passing database strings through", async () => {
    state.rpc = {
      data: [{ account_id: ACCOUNT, newest_date: "2026-10-20", newest_time: "13:45:00", last_statement_mail_at: "2026-10-21T02:00:00+00:00" }],
      error: null
    };
    state.syncRows = { data: [{ finished_at: "2026-10-25T01:00:00+00:00", complete: true }], error: null };
    const { GET } = await import("@/app/api/v1/accounts/coverage/route");
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      accounts: [{ accountId: ACCOUNT, newestDate: "2026-10-20", newestTime: "13:45:00", lastStatementMailAt: "2026-10-21T02:00:00+00:00" }],
      lastSync: { finishedAt: "2026-10-25T01:00:00+00:00", complete: true }
    });
    expect(state.rpcCalls).toEqual([{ name: "list_account_coverage", args: undefined }]);
  });

  it("keeps nulls and answers lastSync null when no sync row exists", async () => {
    state.rpc = { data: [{ account_id: ACCOUNT, newest_date: null, newest_time: null, last_statement_mail_at: null }], error: null };
    const { GET } = await import("@/app/api/v1/accounts/coverage/route");
    expect(await (await GET()).json()).toEqual({
      accounts: [{ accountId: ACCOUNT, newestDate: null, newestTime: null, lastStatementMailAt: null }],
      lastSync: null
    });
  });

  it("answers an unauthorised owner as other routes do", async () => {
    state.owner = false;
    const { GET } = await import("@/app/api/v1/accounts/coverage/route");
    expect((await GET()).status).toBe(403);
  });

  it("answers 400 when either read errors", async () => {
    const { GET } = await import("@/app/api/v1/accounts/coverage/route");
    state.rpc = { data: null, error: { message: "invented" } };
    expect((await GET()).status).toBe(400);
    state.rpc = { data: [], error: null };
    state.syncRows = { data: [], error: { message: "invented" } };
    expect((await GET()).status).toBe(400);
  });
});
