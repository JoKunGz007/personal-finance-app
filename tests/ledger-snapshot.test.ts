import { afterEach, describe, expect, it, vi } from "vitest";
import { loadLedgerSnapshot } from "@/lib/browser/ledger-snapshot";
import { ledgerPageSearch } from "@/lib/transactions";

/**
 * What the ledger view's load reads and how it answers (D-293).
 *
 * `fetch` is stubbed and routed by URL path, so these are decisions, not integration. Every value
 * is invented, per `docs/FIXTURE_POLICY.md`: two accounts, empty pages, empty lists.
 */

const ACCOUNT_ONE = { id: "11111111-1111-4111-8111-111111111111", label: "Invented savings" };
const ACCOUNT_TWO = { id: "22222222-2222-4222-8222-222222222222", label: "Invented current" };
const RANGE = { from: "2026-01-01", to: "2026-03-31" };
const UNREACHABLE = "The ledger could not be reached. Check that the local Supabase stack is running.";

const account = (a: { id: string; label: string }, last: string) => ({
  id: a.id,
  bank_code: "KBANK",
  label: a.label,
  account_type: "savings",
  last_four: last,
  currency: "THB",
  timezone: "Asia/Bangkok"
});

const emptyPage = {
  rows: [],
  hasMore: false,
  totals: { rows: 0, deposits: "0", withdrawals: "0", net: "0" }
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

type Route = () => Response | Promise<Response>;

/** Healthy answers for every path; a test overrides the one it is about. Shopee answers 500 here. */
function healthy(): Record<string, Route> {
  return {
    "/api/v1/accounts": () => json({ accounts: [account(ACCOUNT_ONE, "1111"), account(ACCOUNT_TWO, "2222")] }),
    [`/api/v1/accounts/${ACCOUNT_ONE.id}/transactions`]: () => json(emptyPage),
    [`/api/v1/accounts/${ACCOUNT_TWO.id}/transactions`]: () => json(emptyPage),
    "/api/v1/transactions/match-candidates": () => json({ candidates: [] }),
    "/api/v1/slips": () => json({ slips: [], matches: [], corrections: [] }),
    "/api/v1/cash": () => json({ entries: [], corrections: [] }),
    "/api/v1/notification-cards": () => json({ cards: [], corrections: [], decisions: [] }),
    "/api/v1/transactions/auto-excluded": () => json({ ids: ["33333333-3333-4333-8333-333333333333"] }),
    "/api/v1/transactions/duplicates": () => json({ ids: ["44444444-4444-4444-8444-444444444444"] }),
    "/api/v1/receipts": () => json({ receipts: [] }),
    "/api/v1/deliveries": () => json({ deliveries: [], rides: [] }),
    "/api/v1/categories": () => json({ categories: [{ id: "55555555-5555-4555-8555-555555555555", name: "Invented", archived: false }] }),
    "/api/v1/shopee": () => json({ error: "down" }, 500)
  };
}

function stubRoutes(overrides: Record<string, Route> = {}) {
  const routes = { ...healthy(), ...overrides };
  const spy = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), "http://localhost");
    const route = routes[url.pathname];
    if (!route) throw new Error(`unrouted ${url.pathname}`);
    return route();
  });
  vi.stubGlobal("fetch", spy);
  return spy;
}

const requested = (spy: ReturnType<typeof stubRoutes>) => spy.mock.calls.map(([input]) => String(input));

afterEach(() => { vi.unstubAllGlobals(); });

describe("loadLedgerSnapshot: the first request", () => {
  it("answers refused 401 when accounts is signed out", async () => {
    const spy = stubRoutes({ "/api/v1/accounts": () => json({ error: "Sign in." }, 401) });
    const result = await loadLedgerSnapshot(RANGE);

    expect(result).toEqual({ kind: "refused", status: 401, why: "Sign in." });
    // A signed-out arrival stops with one request, not the whole wave.
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("answers refused 403 carrying the route's own sentence", async () => {
    stubRoutes({ "/api/v1/accounts": () => json({ error: "This identity is not the ledger owner." }, 403) });

    expect(await loadLedgerSnapshot(RANGE)).toEqual({
      kind: "refused",
      status: 403,
      why: "This identity is not the ledger owner."
    });
  });

  it("answers failed on any other status", async () => {
    stubRoutes({ "/api/v1/accounts": () => json({}, 500) });

    expect(await loadLedgerSnapshot(RANGE)).toEqual({ kind: "failed", why: "Accounts could not be loaded." });
  });
});

describe("loadLedgerSnapshot: the blocking reads", () => {
  it("reports the first failing account, in account order, with that account's wording", async () => {
    stubRoutes({
      // The first account answers last; the order of reading, not of arrival, decides who is named.
      [`/api/v1/accounts/${ACCOUNT_ONE.id}/transactions`]: async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return json(emptyPage);
      },
      [`/api/v1/accounts/${ACCOUNT_TWO.id}/transactions`]: () => json({}, 500)
    });

    expect(await loadLedgerSnapshot(RANGE)).toEqual({
      kind: "failed",
      why: `Transactions could not be loaded for ${ACCOUNT_TWO.label}.`
    });
  });

  it("fails the whole load when the candidate set fails (D-158)", async () => {
    stubRoutes({ "/api/v1/transactions/match-candidates": () => json({}, 500) });

    expect(await loadLedgerSnapshot(RANGE)).toEqual({
      kind: "failed",
      why: "The reconciliation set could not be loaded, so the ledger is not shown."
    });
  });

  it("answers failed with the could-not-be-reached wording when fetch throws", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("network down"); }));

    expect(await loadLedgerSnapshot(RANGE)).toEqual({ kind: "failed", why: UNREACHABLE });
  });
});

describe("loadLedgerSnapshot: a loaded ledger", () => {
  it("carries the range, the accounts, one window entry per account and the candidates", async () => {
    stubRoutes();
    const result = await loadLedgerSnapshot(RANGE);

    expect(result.kind).toBe("loaded");
    if (result.kind !== "loaded") throw new Error("expected loaded");
    const { snapshot } = result;
    expect(snapshot.range).toEqual(RANGE);
    expect(snapshot.accounts.map((a) => a.id)).toEqual([ACCOUNT_ONE.id, ACCOUNT_TWO.id]);
    expect([...snapshot.window.byAccount.keys()]).toEqual([ACCOUNT_ONE.id, ACCOUNT_TWO.id]);
    expect(snapshot.candidates).toEqual([]);
    expect(snapshot.slips).toEqual({ ok: true, slips: [], matches: [], corrections: [] });
    expect(snapshot.cash).toEqual({ ok: true, entries: [], corrections: [] });
    expect(snapshot.cards).toEqual({ ok: true, cards: [], corrections: [], decisions: [] });
    expect(snapshot.categories?.map((c) => c.name)).toEqual(["Invented"]);
    expect([...snapshot.autoExcluded]).toEqual(["33333333-3333-4333-8333-333333333333"]);
    expect([...snapshot.duplicates]).toEqual(["44444444-4444-4444-8444-444444444444"]);
  });

  it("keeps the ledger when slips fail, and says why beside it", async () => {
    stubRoutes({ "/api/v1/slips": () => json({}, 500) });
    const result = await loadLedgerSnapshot(RANGE);

    if (result.kind !== "loaded") throw new Error("expected loaded");
    expect(result.snapshot.slips).toEqual({ ok: false, why: "Captured slips could not be loaded, so none are shown." });
    expect(result.snapshot.window.byAccount.size).toBe(2);
    expect(result.snapshot.cash.ok).toBe(true);
  });

  it("keeps the ledger when cash fails or cards fail", async () => {
    stubRoutes({ "/api/v1/cash": () => json({}, 500), "/api/v1/notification-cards": () => json({}, 500) });
    const result = await loadLedgerSnapshot(RANGE);

    if (result.kind !== "loaded") throw new Error("expected loaded");
    expect(result.snapshot.cash).toEqual({ ok: false, why: "Cash entries could not be loaded, so none are shown." });
    expect(result.snapshot.cards).toEqual({
      ok: false,
      why: "Captured notification cards could not be loaded, so none are shown."
    });
    expect(result.snapshot.slips.ok).toBe(true);
    expect(result.snapshot.window.byAccount.size).toBe(2);
  });

  it("answers null categories on a failure, so the caller keeps its last good list", async () => {
    stubRoutes({ "/api/v1/categories": () => json({}, 500) });
    const result = await loadLedgerSnapshot(RANGE);

    if (result.kind !== "loaded") throw new Error("expected loaded");
    expect(result.snapshot.categories).toBeNull();
  });

  it("answers empty sets when auto-excluded or duplicates fail, and empty maps when the optional reads fail", async () => {
    stubRoutes({
      "/api/v1/transactions/auto-excluded": () => json({}, 500),
      "/api/v1/transactions/duplicates": () => json({}, 500),
      "/api/v1/receipts": () => json({}, 500),
      "/api/v1/deliveries": () => json({}, 500)
    });
    const result = await loadLedgerSnapshot(RANGE);

    if (result.kind !== "loaded") throw new Error("expected loaded");
    const { snapshot } = result;
    expect(snapshot.autoExcluded.size).toBe(0);
    expect(snapshot.duplicates.size).toBe(0);
    expect(snapshot.receiptByRow.size).toBe(0);
    expect(snapshot.deliveryByRow.size).toBe(0);
    expect(snapshot.rideByRow.size).toBe(0);
    expect(snapshot.shopeeByRow.size).toBe(0);
  });
});

describe("loadLedgerSnapshot: what it requests", () => {
  it("never writes: no request goes to the auto-categorise route, and every request is a read", async () => {
    const spy = stubRoutes();
    await loadLedgerSnapshot(RANGE);

    expect(requested(spy).some((url) => url.includes("auto-categorised"))).toBe(false);
    for (const [, init] of spy.mock.calls as unknown as [unknown, RequestInit | undefined][]) {
      expect(init?.method ?? "GET").toBe("GET");
    }
  });

  it("sends one page request per account, each carrying the range's search params", async () => {
    const spy = stubRoutes();
    await loadLedgerSnapshot(RANGE);

    const search = ledgerPageSearch(RANGE, null);
    expect(search).toContain("2026-01-01");
    const pages = requested(spy).filter((url) => url.includes("/transactions") && url.includes("/accounts/"));
    expect(pages).toEqual([
      `/api/v1/accounts/${ACCOUNT_ONE.id}/transactions${search}`,
      `/api/v1/accounts/${ACCOUNT_TWO.id}/transactions${search}`
    ]);
  });

  it("issues the rest of the wave once accounts has answered", async () => {
    const spy = stubRoutes();
    await loadLedgerSnapshot(RANGE);

    const paths = requested(spy).map((url) => url.split("?")[0]);
    expect(paths[0]).toBe("/api/v1/accounts");
    expect(paths).toEqual(expect.arrayContaining([
      "/api/v1/transactions/match-candidates",
      "/api/v1/slips",
      "/api/v1/cash",
      "/api/v1/notification-cards",
      "/api/v1/transactions/auto-excluded",
      "/api/v1/transactions/duplicates",
      "/api/v1/receipts",
      "/api/v1/deliveries",
      "/api/v1/shopee",
      "/api/v1/categories"
    ]));
    expect(spy).toHaveBeenCalledTimes(13);
  });
});
