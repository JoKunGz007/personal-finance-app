import { beforeEach, describe, expect, it, vi } from "vitest";
import { existingFingerprints } from "@/lib/server/fingerprint-lookup";
import { confirmedRowsText, confirmResponseSchema, existingResponseSchema, flagExisting, ledgerCheckNotice } from "@/lib/existing-rows";
import { assembleImportPayload } from "@/lib/import-assembly";
import { extractStatement } from "@/lib/krungthai-layout";
import { buildRpcRows } from "@/lib/server/confirm-import";
import type { ImportPayload } from "@/lib/statement";
import { validStatement } from "./fixtures/krungthai-layout-v1";

// Every value is invented.
const ACCOUNT = "cccccccc-0000-4000-8000-000000000011";
const fp = (n: number) => n.toString(16).padStart(64, "0");

function buildPayload(): ImportPayload {
  const extracted = extractStatement(validStatement);
  if (!extracted.ok) throw new Error(extracted.message);
  const assembled = assembleImportPayload(extracted.frame, extracted.rows, {
    accountId: ACCOUNT,
    bankCode: extracted.frame.bankCode,
    lastFour: extracted.frame.accountLastFour,
    currency: "THB"
  });
  if (!assembled.ok) throw new Error(assembled.message);
  return assembled.payload;
}

const state = vi.hoisted(() => ({
  auth: { ok: true } as { ok: boolean; status?: number; message?: string },
  stored: [] as string[],
  fail: false,
  rpcCount: 0 as number | null,
  rpcFail: false,
  calls: [] as { account: string; chunk: string[] }[],
  rpcCalls: [] as { name: string; args: { p_account_id: string; p_rows: { fingerprint: string; sourceIndex: number }[] } }[]
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
    }),
    rpc: async (name: string, args: never) => {
      state.rpcCalls.push({ name, args });
      return state.rpcFail ? { data: null, error: { message: "fingerprint mismatch" } } : { data: state.rpcCount, error: null };
    }
  } as never;
}

beforeEach(() => {
  state.auth = { ok: true }; state.stored = []; state.fail = false; state.calls = [];
  state.rpcCount = 0; state.rpcFail = false; state.rpcCalls = [];
});

async function post(body: unknown) {
  const { POST } = await import("@/app/api/v1/imports/existing/route");
  const response = await POST(new Request("http://localhost/api/v1/imports/existing", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body)
  }));
  return { status: response.status, body: await response.json() as Record<string, unknown> };
}

describe("POST /api/v1/imports/existing", () => {
  it("answers with the stored fingerprints and the database's link count", async () => {
    const payload = buildPayload();
    const { fingerprints } = await buildRpcRows(payload);
    state.stored = [fingerprints[0]!, fp(9)];
    state.rpcCount = 2;
    const response = await post({ payload });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ existing: [fingerprints[0]], existingCount: 2 });
    expect(state.calls[0]!.account).toBe(ACCOUNT);
    // The count sees the rows exactly as confirm would: fingerprint and 1-based source index.
    expect(state.rpcCalls).toHaveLength(1);
    expect(state.rpcCalls[0]!.name).toBe("count_existing_import_rows");
    expect(state.rpcCalls[0]!.args.p_account_id).toBe(ACCOUNT);
    expect(state.rpcCalls[0]!.args.p_rows.map((row) => row.fingerprint)).toEqual(fingerprints);
    expect(state.rpcCalls[0]!.args.p_rows.map((row) => row.sourceIndex)).toEqual(fingerprints.map((_, i) => i + 1));
  });

  it("refuses an unauthenticated owner before reading", async () => {
    state.auth = { ok: false, status: 401, message: "Sign in." };
    expect((await post({ payload: buildPayload() })).status).toBe(401);
    expect(state.calls).toEqual([]);
    expect(state.rpcCalls).toEqual([]);
  });

  it.each([
    ["not json", "{nope", 400],
    ["old fingerprint-only shape", { accountId: ACCOUNT, fingerprints: [fp(1)] }, 422],
    ["no payload", {}, 422],
    ["bad payload", { payload: { accountId: "x" } }, 422],
    ["extra key", { payload: buildPayload(), more: 1 }, 422]
  ])("rejects %s", async (_name, body, status) => {
    expect((await post(body)).status).toBe(status);
    expect(state.calls).toEqual([]);
    expect(state.rpcCalls).toEqual([]);
  });

  it("reports a failed fingerprint lookup as an error", async () => {
    state.fail = true;
    expect((await post({ payload: buildPayload() })).status).toBe(502);
  });

  it("reports a failed count (the RPC raising) as an error the review treats as advisory", async () => {
    state.rpcFail = true;
    const response = await post({ payload: buildPayload() });
    expect(response.status).toBe(502);
    expect(response.body.existingCount).toBeUndefined();
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
    expect(ledgerCheckNotice({ status: "done", existing: [false, false, false], linkedCount: 0 }, 3)).toBeNull();
  });

  it("words partial, full and failed outcomes", () => {
    expect(ledgerCheckNotice({ status: "done", existing: [true, false, true], linkedCount: 2 }, 3)?.text)
      .toBe("2 of 3 rows are already in the ledger and will be linked, not added again.");
    expect(ledgerCheckNotice({ status: "done", existing: [true, true], linkedCount: 2 }, 2)?.text)
      .toBe("Every row is already in the ledger; confirming adds nothing.");
    expect(ledgerCheckNotice({ status: "failed" }, 2)?.text).toBe("Could not check for rows already in the ledger.");
  });

  it("counts rows linked by identity facts although no fingerprint matched", () => {
    expect(ledgerCheckNotice({ status: "done", existing: [false, false, false], linkedCount: 1 }, 3)?.text)
      .toBe("1 of 3 rows are already in the ledger and will be linked, not added again. Rows matched by date, time and amount rather than an exact copy are not marked below.");
  });

  it("parses the routes' answers with schemas and words the confirmed rows", () => {
    expect(existingResponseSchema.safeParse({ existing: [fp(1)], existingCount: 1 }).success).toBe(true);
    expect(existingResponseSchema.safeParse({ existing: [fp(1)] }).success).toBe(false);
    expect(existingResponseSchema.safeParse({ existing: "x", existingCount: 1 }).success).toBe(false);
    expect(confirmResponseSchema.safeParse({ batchId: "b", linkedRows: null }).success).toBe(true);
    expect(confirmResponseSchema.safeParse({ batchId: "b", linkedRows: "2" }).success).toBe(false);
    expect(confirmedRowsText(5, 0)).toBe("5 rows");
    expect(confirmedRowsText(5, null)).toBe("5 rows");
    expect(confirmedRowsText(5, 2)).toBe("3 new rows (2 already in the ledger, linked)");
    expect(confirmedRowsText(5, 9)).toBe("0 new rows (5 already in the ledger, linked)");
  });

  it("flags rows by fingerprint, in order", () => {
    expect(flagExisting([fp(1), fp(2), fp(3)], [fp(3), fp(1)])).toEqual([true, false, true]);
  });
});
