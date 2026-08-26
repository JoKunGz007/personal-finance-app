import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ledgerRequest, readError } from "@/lib/wire";

/**
 * What the client tier does with an answer from this app's own API.
 *
 * **Nothing here had a test before.** `lib/wire.ts` held one 10-line function and the other five
 * steps of a request lived open-coded at 26 call sites in `app/`, where no unit test reaches —
 * 33 of this repo's 34 test files import from `lib/` and none imports from `app/`. So "what does
 * this app show when a route answers HTML, or 500s with no body, or returns JSON its schema
 * rejects" was unasked and unanswerable. These are the answers.
 *
 * Every value invented, per `docs/FIXTURE_POLICY.md`. No route is contacted: `fetch` is stubbed,
 * which is the whole point — these are decisions, not integration.
 */

const schema = z.object({ accounts: z.array(z.string()) }).strict();
const WORDING = { fallback: "Accounts could not be loaded." };

afterEach(() => { vi.unstubAllGlobals(); });

function stubFetch(impl: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  const spy = vi.fn(impl);
  vi.stubGlobal("fetch", spy);
  return spy;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("a request that succeeds", () => {
  it("returns the parsed value, not the raw body", async () => {
    stubFetch(async () => json({ accounts: ["one", "two"] }));
    const result = await ledgerRequest("/api/v1/accounts", schema, WORDING);

    expect(result.ok).toBe(true);
    // Narrowed by `ok`, which is the reason the result is a discriminated union rather than a
    // value beside an error: a caller cannot read `data` without having checked.
    if (!result.ok) throw new Error("expected ok");
    expect(result.data.accounts).toEqual(["one", "two"]);
  });

  it("asks for no cache, because a ledger read served from one is a wrong answer", async () => {
    const fetchSpy = stubFetch(async () => json({ accounts: [] }));
    await ledgerRequest("/api/v1/accounts", schema, WORDING);

    expect(fetchSpy.mock.calls[0]![1]).toMatchObject({ cache: "no-store" });
  });

  it("sends the path relative, so it is same-origin by construction", async () => {
    const fetchSpy = stubFetch(async () => json({ accounts: [] }));
    await ledgerRequest("/api/v1/accounts", schema, WORDING);

    expect(fetchSpy.mock.calls[0]![0]).toBe("/api/v1/accounts");
  });

  it("lets a caller override the method and headers without losing the cache default", async () => {
    const fetchSpy = stubFetch(async () => json({ accounts: [] }));
    await ledgerRequest("/api/v1/accounts", schema, WORDING, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}"
    });

    expect(fetchSpy.mock.calls[0]![1]).toMatchObject({ method: "POST", cache: "no-store" });
  });
});

describe("a route that refuses", () => {
  it("quotes the route's own words rather than a status code", async () => {
    // The recovery path is why this matters: the server's wording is the only guidance a person
    // has there, and a status code is not guidance.
    stubFetch(async () => json({ error: "Strong owner access is required." }, 403));
    const result = await ledgerRequest("/api/v1/accounts", schema, WORDING);

    expect(result).toEqual({ ok: false, kind: "refused", why: "Strong owner access is required.", status: 403 });
  });

  it("falls back to the caller's wording when the refusal carries no readable error", async () => {
    stubFetch(async () => json({ nothing: "useful" }, 500));
    const result = await ledgerRequest("/api/v1/accounts", schema, WORDING);

    expect(result).toEqual({ ok: false, kind: "refused", why: "Accounts could not be loaded.", status: 500 });
  });

  it("reads `ok` before the schema, so a refusal is never reported as a contract failure", async () => {
    // A 400 body is an `{ error }`, which fails `schema` on every field. Checking the schema first
    // would tell the owner his build is broken when in fact the route answered him in words.
    stubFetch(async () => json({ error: "That account does not exist." }, 400));
    const result = await ledgerRequest("/api/v1/accounts", schema, WORDING);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected a failure");
    expect(result.kind).toBe("refused");
    expect(result.why).toBe("That account does not exist.");
  });
});

describe("an answer that is not JSON at all", () => {
  it("is unreachable rather than a thrown error, on a 200", async () => {
    // A platform error page is HTML with a 200 more often than anyone expects. Bare `.json()`
    // turns it into a throw that the caller's outer `catch` then mislabels.
    stubFetch(async () => new Response("<html>bad gateway</html>", { status: 200 }));
    const result = await ledgerRequest("/api/v1/accounts", schema, {
      fallback: "Accounts could not be loaded.",
      unreachable: "The ledger could not be reached."
    });

    expect(result).toEqual({ ok: false, kind: "unreachable", why: "The ledger could not be reached.", status: null });
  });

  it("is a refusal on a 502, because the status is the more specific fact", async () => {
    stubFetch(async () => new Response("<html>bad gateway</html>", { status: 502 }));
    const result = await ledgerRequest("/api/v1/accounts", schema, WORDING);

    expect(result).toEqual({ ok: false, kind: "refused", why: "Accounts could not be loaded.", status: 502 });
  });

  it("does not mistake a route that legitimately answered null for an unreadable body", async () => {
    stubFetch(async () => json(null));
    const result = await ledgerRequest("/api/v1/accounts", schema, WORDING);

    // `null` fails the schema, which is the correct complaint. It is emphatically not "unreachable":
    // something answered, and it spoke JSON.
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected a failure");
    expect(result.kind).toBe("off-contract");
  });
});

describe("nothing answering at all", () => {
  it("is reported with the unreachable wording, not the browser's socket message", async () => {
    stubFetch(async () => { throw new TypeError("Failed to fetch"); });
    const result = await ledgerRequest("/api/v1/accounts", schema, {
      fallback: "Accounts could not be loaded.",
      unreachable: "The ledger could not be reached. Check that the local Supabase stack is running."
    });

    expect(result).toEqual({
      ok: false,
      kind: "unreachable",
      why: "The ledger could not be reached. Check that the local Supabase stack is running.",
      status: null
    });
  });

  it("uses the single fallback when the caller worded only one message", async () => {
    stubFetch(async () => { throw new TypeError("Failed to fetch"); });
    const result = await ledgerRequest("/api/v1/accounts", schema, WORDING);

    expect(result).toEqual({ ok: false, kind: "unreachable", why: "Accounts could not be loaded.", status: null });
  });
});

describe("an answer that does not match its contract", () => {
  it("is off-contract, and says so separately from a refusal", async () => {
    stubFetch(async () => json({ accounts: [{ unexpected: true }] }));
    const result = await ledgerRequest("/api/v1/accounts", schema, {
      fallback: "Accounts could not be loaded.",
      offContract: "The accounts response did not match its contract, so nothing can be bound."
    });

    expect(result).toEqual({
      ok: false,
      kind: "off-contract",
      why: "The accounts response did not match its contract, so nothing can be bound.",
      status: null
    });
  });

  it("rejects an extra key, because the schemas are strict and a widened route is a contract change", async () => {
    stubFetch(async () => json({ accounts: [], surprise: 1 }));
    const result = await ledgerRequest("/api/v1/accounts", schema, WORDING);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected a failure");
    expect(result.kind).toBe("off-contract");
  });

  /**
   * The status is carried so one caller can tell a refusal apart from a *reason* for refusing.
   *
   * The ledger loads on arrival (PLAN task 43), so a signed-out visitor issues a request before
   * touching anything and is answered 401 by design. `app/transactions-view.tsx` reports that as
   * a line rather than as a red alert — but only for the load it performed itself, and only for
   * 401 and 403. It needs the number to do that, and `kind` alone cannot supply it: every one of
   * these is `refused`.
   */
  it.each([401, 403, 404, 500])("carries the status of a refusal (%i)", async (status) => {
    stubFetch(async () => json({ error: "Sign in to continue." }, status));
    const result = await ledgerRequest("/api/v1/accounts", schema, WORDING);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected a failure");
    expect(result.status).toBe(status);
  });

  /**
   * Null rather than absent, and null rather than 0.
   *
   * A transport failure and a non-JSON 2xx have no status worth reporting — nothing answered, or
   * what answered was not an answer. A caller branching on `status === 401` must not be handed a
   * number that was never on the wire.
   */
  it("reports no status where nothing usable answered", async () => {
    stubFetch(async () => { throw new TypeError("Failed to fetch"); });
    const transport = await ledgerRequest("/api/v1/accounts", schema, WORDING);
    expect(transport.ok).toBe(false);
    if (transport.ok) throw new Error("expected a failure");
    expect(transport.status).toBeNull();

    stubFetch(async () => new Response("<html>not json</html>", { status: 200 }));
    const unreadable = await ledgerRequest("/api/v1/accounts", schema, WORDING);
    expect(unreadable.ok).toBe(false);
    if (unreadable.ok) throw new Error("expected a failure");
    expect(unreadable.status).toBeNull();
  });

  it("cannot be skipped, because the schema is a required parameter", () => {
    // Not a runtime assertion — a statement about the interface. Nine of the twenty-six call sites
    // this module replaces validated nothing, and the omission was invisible at each of them.
    // There is no overload of `ledgerRequest` that omits `schema`.
    expect(ledgerRequest.length).toBeGreaterThanOrEqual(3);
  });
});

describe("readError, kept for the write paths that have not moved yet", () => {
  it("reads the route's error key off a parsed body", () => {
    expect(readError({ error: "No." }, "fallback")).toBe("No.");
  });

  it("falls back when handed a Response instead of its body, which is the trap it cannot prevent", async () => {
    // The reason `ledgerRequest` exists. A `Response` has no `error` key, so this returns the
    // fallback and every specifically-worded refusal is silently replaced by the generic sentence.
    // It type-checks, because the parameter is `unknown`. It happened (`GOTCHAS.md`), in two files.
    const response = json({ error: "The slip could not be captured: Buddhist-era date." }, 400);
    expect(readError(response, "Generic.")).toBe("Generic.");
    // And the message it should have shown was right there, one `await` away.
    expect(readError(await response.json(), "Generic.")).toContain("Buddhist-era");
  });
});
