import { beforeEach, describe, expect, it, vi } from "vitest";
import { existingFingerprints } from "@/lib/server/fingerprint-lookup";
import { flagExisting, ledgerCheckNotice } from "@/lib/existing-rows";

// Every value is invented.
const ACCOUNT = "cccccccc-0000-4000-8000-000000000011";
const fp = (n: number) => n.toString(16).padStart(64, "0");

const state = vi.hoisted(() => ({
  auth: { ok: true } as { ok: boolean; status?: number; message?: string },
  stored: [] as string[],
  fail: false,
  calls: [] as { account: string; chunk: string[] }[]
}));

vi.mock("@/lib/server/supabase", () => ({
  noStoreHeaders: { "Content-Type": "application/json" },
  routeError: (message: string, status: number) => Response.json({ error: message }, { status }),
  strongOwnerClient: async () => state.auth.ok ? { ok: true, supabase: fakeClient() } : state.auth
}));

function fakeClient() {
  return {
    from: () => ({
      select: () => ({
        eq: (_c: string, account: string) => ({
          in: async (_f: string, chunk: string[]) => {
            state.calls.push({ account, chunk });
            if (state.fail) return { data: null, error: { message: "boom" } };
            return { data: chunk.filter((x) => state.stored.includes(x)).map((fingerprint) => ({ fingerprint })), error: null };
          }
        })
      })
    })
  } as never;
}

beforeEach(() => { state.auth = { ok: true }; state.stored = []; state.fail = false; state.calls = []; });

async function post(body: unknown) {
  const { POST } = await import("@/app/api/v1/imports/existing/route");
  const response = await POST(new Request("http://localhost/api/v1/imports/existing", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body)
  }));
  return { status: response.status, body: await response.json() as Record<string, unknown> };
}

describe("POST /api/v1/imports/existing", () => {
  it("answers with the stored subset", async () => {
    state.stored = [fp(2), fp(9)];
    const response = await post({ accountId: ACCOUNT, fingerprints: [fp(1), fp(2), fp(3)] });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ existing: [fp(2)] });
    expect(state.calls[0]!.account).toBe(ACCOUNT);
  });

  it("refuses an unauthenticated owner before reading", async () => {
    state.auth = { ok: false, status: 401, message: "Sign in." };
    expect((await post({ accountId: ACCOUNT, fingerprints: [] })).status).toBe(401);
    expect(state.calls).toEqual([]);
  });

  it.each([
    ["not json", "{nope", 400],
    ["bad account", { accountId: "x", fingerprints: [] }, 422],
    ["bad fingerprint", { accountId: ACCOUNT, fingerprints: ["abc"] }, 422],
    ["uppercase fingerprint", { accountId: ACCOUNT, fingerprints: [fp(1).toUpperCase().replace(/0/g, "A")] }, 422],
    ["too many", { accountId: ACCOUNT, fingerprints: Array.from({ length: 2001 }, (_, i) => fp(i)) }, 422],
    ["extra key", { accountId: ACCOUNT, fingerprints: [], more: 1 }, 422]
  ])("rejects %s", async (_name, body, status) => {
    expect((await post(body)).status).toBe(status);
    expect(state.calls).toEqual([]);
  });

  it("reports a failed lookup as an error", async () => {
    state.fail = true;
    expect((await post({ accountId: ACCOUNT, fingerprints: [fp(1)] })).status).toBe(502);
  });
});

describe("existingFingerprints", () => {
  it("chunks and returns each stored fingerprint once", async () => {
    const all = Array.from({ length: 120 }, (_, i) => fp(i));
    state.stored = [fp(5), fp(77), fp(119)];
    const found = await existingFingerprints(fakeClient(), ACCOUNT, all);
    expect(found?.sort()).toEqual([fp(5), fp(77), fp(119)].sort());
    expect(state.calls.length).toBe(3);
  });

  it("returns null when any chunk fails", async () => {
    state.fail = true;
    expect(await existingFingerprints(fakeClient(), ACCOUNT, [fp(1)])).toBeNull();
  });
});

describe("ledgerCheckNotice", () => {
  it("is silent while checking, before a check, and when nothing exists", () => {
    expect(ledgerCheckNotice(null, 3)).toBeNull();
    expect(ledgerCheckNotice({ status: "checking" }, 3)).toBeNull();
    expect(ledgerCheckNotice({ status: "done", existing: [false, false, false] }, 3)).toBeNull();
  });

  it("words partial, full and failed outcomes", () => {
    expect(ledgerCheckNotice({ status: "done", existing: [true, false, true] }, 3)?.text)
      .toBe("2 of 3 rows are already in the ledger and will be skipped.");
    expect(ledgerCheckNotice({ status: "done", existing: [true, true] }, 2)?.text)
      .toBe("Every row is already in the ledger; confirming adds nothing.");
    expect(ledgerCheckNotice({ status: "failed" }, 2)?.text).toBe("Could not check for rows already in the ledger.");
  });

  it("flags rows by fingerprint, in order", () => {
    expect(flagExisting([fp(1), fp(2), fp(3)], [fp(3), fp(1)])).toEqual([true, false, true]);
  });
});
