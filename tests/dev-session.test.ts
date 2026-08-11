import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync, unlinkSync } from "node:fs";
import { API, OWNER_EMAIL, PUBLISHABLE, containerReachable, ownerId, psql } from "./helpers/local-owner";
import { REQUIRED_FACTORS } from "@/lib/owner-access";

// The development sign-in route is an authentication bypass that lives in the
// repository, so these tests are about its guards first and its behaviour second.
//
// The real login is Google OAuth (`docs/PRODUCT_CHARTER.md`). This route exists only so
// the binding chooser, the authenticated import path, and the charset rejection path can
// be exercised in a browser, and it must be impossible to reach outside development.

const ROUTE = "app/api/v1/dev/session/route.ts";

// The route reads and writes cookies through next/headers, which throws outside a real
// request scope. The jar stands in for it, exactly as tests/import-route.test.ts does,
// so @supabase/ssr writes the session with its own cookie names and encoding rather than
// anything this test invents. The guard cases return before reaching it.
const jar = vi.hoisted(() => new Map<string, string>());

vi.mock("next/headers", () => ({
  cookies: async () => ({
    getAll: () => [...jar].map(([name, value]) => ({ name, value })),
    get: (name: string) => jar.has(name) ? { name, value: jar.get(name)! } : undefined,
    set: (name: string, value: string) => { jar.set(name, value); }
  })
}));

describe("development sign-in guards", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  // Every guard is asserted on its own, with the other two satisfied, so a passing case
  // cannot be masked by an unrelated failure.
  const request = (host = "127.0.0.1:3200") =>
    new Request("http://127.0.0.1:3200/api/v1/dev/session", { method: "POST", headers: { host } });

  function configure(overrides: Record<string, string> = {}) {
    const base: Record<string, string> = {
      NEXT_PUBLIC_ALLOW_DEV_OWNER_SESSION: "1",
      NEXT_PUBLIC_SUPABASE_URL: API,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE,
      OWNER_GOOGLE_EMAIL: OWNER_EMAIL
    };
    Object.entries({ ...base, ...overrides }).forEach(([name, value]) => vi.stubEnv(name, value));
    vi.resetModules();
  }

  it("answers 404 without the explicit opt-in flag, rather than admitting it exists", async () => {
    configure({ NEXT_PUBLIC_ALLOW_DEV_OWNER_SESSION: "" });
    const { POST } = await import("@/app/api/v1/dev/session/route");
    const response = await POST(request());
    expect(response.status).toBe(404);
    // 403 would confirm the route is there; 404 is indistinguishable from absence.
    expect(response.status).not.toBe(403);
  });

  it("answers 404 to a request that did not come from this machine", async () => {
    configure();
    const { POST } = await import("@/app/api/v1/dev/session/route");
    expect((await POST(request("ledger.example.com"))).status).toBe(404);
    // A loopback host with a port is still loopback; the port must not defeat the check.
    expect((await POST(request("localhost:3200"))).status).not.toBe(404);
  });

  it("refuses to sign in against a non-loopback Supabase URL", async () => {
    configure({ NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co" });
    const { POST } = await import("@/app/api/v1/dev/session/route");
    const response = await POST(request());
    expect(response.status).toBe(403);
    expect((await response.json()).error).toMatch(/non-loopback/u);
  });

  it("reports missing configuration instead of failing obscurely", async () => {
    configure({ NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "replace-with-your-key" });
    const { POST } = await import("@/app/api/v1/dev/session/route");
    expect((await POST(request())).status).toBe(503);
  });

  it("never hardcodes a credential that could work anywhere but this local stack", () => {
    const route = readFileSync(ROUTE, "utf8");
    // The seeded synthetic password is committed in supabase/seed.sql already, so
    // repeating it here adds no exposure — but nothing else may be embedded, and the
    // route must not read a password from a request body or an environment variable,
    // which would turn it into a general-purpose credential endpoint.
    expect(route).toContain("local-synthetic-login-disabled");
    expect(route).not.toMatch(/process\.env\.[A-Z_]*PASSWORD/u);
    // The request is read for its Host header and for one query parameter, and nothing
    // else. Reading a body would turn this into a general-purpose credential endpoint that
    // signs in as whoever asks.
    expect(route).not.toMatch(/request\.(json|text|formData|body)/u);
    expect(route).toMatch(/request\.headers\.get\("host"\)/u);
    // `?stop=aal1` is the only parameter, and it can only make the route grant *less*.
    const read = [...route.matchAll(/searchParams\.get\("([^"]+)"\)/gu)].map((match) => match[1]!);
    expect(read).toEqual(["stop"]);
  });

  it("keeps the aal1 stop behind all three guards, since it is the same sign-in", () => {
    // The stop mode exists so the real sign-in surface can be reached in a browser, and it
    // must not become a second door with its own weaker rules. Each guard is asserted
    // against a request that asks to stop, with the other two satisfied.
    const stopping = (host = "127.0.0.1:3200") =>
      new Request("http://127.0.0.1:3200/api/v1/dev/session?stop=aal1", { method: "POST", headers: { host } });

    return (async () => {
      configure({ NEXT_PUBLIC_ALLOW_DEV_OWNER_SESSION: "" });
      let { POST } = await import("@/app/api/v1/dev/session/route");
      expect((await POST(stopping())).status).toBe(404);

      configure();
      ({ POST } = await import("@/app/api/v1/dev/session/route"));
      expect((await POST(stopping("ledger.example.com"))).status).toBe(404);

      configure({ NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co" });
      ({ POST } = await import("@/app/api/v1/dev/session/route"));
      expect((await POST(stopping())).status).toBe(403);
    })();
  });
});

// The behavioural half needs the live stack. Reported rather than silently skipped, the
// same way every other container-bound suite in this repo does it.
const reachable = containerReachable();

describe.skipIf(!reachable)("development sign-in against the live stack", () => {
  it("mints a session at aal2 with a verified factor", async () => {
    vi.stubEnv("NEXT_PUBLIC_ALLOW_DEV_OWNER_SESSION", "1");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", API);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", PUBLISHABLE);
    vi.stubEnv("OWNER_GOOGLE_EMAIL", OWNER_EMAIL);
    vi.resetModules();

    // Start from no factors and no remembered secrets, so the enrolment path is what
    // gets exercised rather than the re-challenge path.
    jar.clear();
    psql(`delete from auth.mfa_factors where user_id = '${ownerId()}';`);
    // Per-project store: this suite drives the route against the test project, so it
    // clears only that project's secrets. It must not touch live's — overwriting one
    // shared file is exactly what used to lock the live app out after every run.
    try { unlinkSync(".runtime/dev-mfa-private-ledger-local.json"); } catch { /* absent is the normal case */ }

    const { POST } = await import("@/app/api/v1/dev/session/route");
    const response = await POST(
      new Request("http://127.0.0.1:3000/api/v1/dev/session", { method: "POST", headers: { host: "127.0.0.1:3000" } })
    );
    const body = await response.json();
    expect(response.status, JSON.stringify(body)).toBe(200);
    expect(body.level).toBe("aal2");
    expect(body.verifiedFactors).toBe(REQUIRED_FACTORS);
    expect(body.warning).toBeUndefined();

    // The database gate is the thing that actually matters, so assert on it rather than
    // on the route's own report of itself. Asserted against the shared constant so this
    // cannot drift from `private.has_strong_owner_access` without one of them failing.
    const verified = psql(
      `select count(*) from auth.mfa_factors where user_id = '${ownerId()}' and status = 'verified';`
    );
    expect(verified.output.trim()).toBe(String(REQUIRED_FACTORS));

    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("stops at aal1 on request, and enrols nothing while doing so", async () => {
    // The state `app/owner-access.tsx` shows an owner who has just arrived from Google.
    // It is only reachable this way locally, because the ordinary path ends at aal2 with
    // both factors already verified.
    vi.stubEnv("NEXT_PUBLIC_ALLOW_DEV_OWNER_SESSION", "1");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", API);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", PUBLISHABLE);
    vi.stubEnv("OWNER_GOOGLE_EMAIL", OWNER_EMAIL);
    vi.resetModules();

    jar.clear();
    psql(`delete from auth.mfa_factors where user_id = '${ownerId()}';`);
    try { unlinkSync(".runtime/dev-mfa-private-ledger-local.json"); } catch { /* absent is the normal case */ }

    const { POST } = await import("@/app/api/v1/dev/session/route");
    const response = await POST(new Request(
      "http://127.0.0.1:3000/api/v1/dev/session?stop=aal1",
      { method: "POST", headers: { host: "127.0.0.1:3000" } }
    ));
    const body = await response.json();
    expect(response.status, JSON.stringify(body)).toBe(200);
    expect(body.level).toBe("aal1");
    expect(body.stoppedAt).toBe("aal1");
    expect(body.verifiedFactors).toBe(0);

    // The point of the mode: it must not have enrolled anything on the way past. Asserted
    // against the database rather than the route's report, since the report is what would
    // be wrong if the early return were placed after the enrolment loop.
    const factors = psql(`select count(*) from auth.mfa_factors where user_id = '${ownerId()}';`);
    expect(factors.output.trim()).toBe("0");

    vi.unstubAllEnvs();
    vi.resetModules();
  });
});

describe.skipIf(reachable)("development sign-in", () => {
  it("reports that the live-stack path was not verified", () => {
    console.warn(
      "Skipped development sign-in: the local container is unreachable. Run `pnpm supabase:start` "
      + "to exercise it — a skipped run proves nothing about reaching aal2."
    );
    expect(reachable).toBe(false);
  });
});
