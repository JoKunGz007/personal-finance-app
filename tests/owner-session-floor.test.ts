import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// D-303: a token close to expiry after `getUser()` is refused before any read, as a 503 the browser
// retries. Every value here is invented.

const auth = vi.hoisted(() => ({ expiresInSeconds: 3600 as number | null }));

vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: () => {} }) }));
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: "u-1", email: "owner@example.test" } }, error: null }),
      getSession: async () => ({ data: { session: { expires_at: auth.expiresInSeconds === null ? undefined : Math.floor(Date.now() / 1000) + auth.expiresInSeconds } } }),
      mfa: {
        getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: "aal2" } }),
        listFactors: async () => ({ data: { totp: [{ status: "verified" }] } })
      }
    }
  })
}));

import { routeError, SESSION_RENEWING, strongOwnerClient } from "@/lib/server/supabase";

describe("strongOwnerClient's session floor (D-303)", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://supabase.example.test");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "publishable-test-key");
    vi.stubEnv("OWNER_GOOGLE_EMAIL", "owner@example.test");
  });
  afterEach(() => { vi.unstubAllEnvs(); });

  it("refuses with the renewing 503 when the token has under 30 s left", async () => {
    auth.expiresInSeconds = 29;
    expect(await strongOwnerClient()).toEqual({ ok: false, status: 503, message: SESSION_RENEWING });
  });

  it("lets a token with time to spare through", async () => {
    auth.expiresInSeconds = 31;
    expect((await strongOwnerClient()).ok).toBe(true);
  });

  it("does not refuse a session whose expiry it cannot read; the owner checks still decide", async () => {
    auth.expiresInSeconds = null;
    expect((await strongOwnerClient()).ok).toBe(true);
  });

  it("marks only the renewing refusal with Retry-After", () => {
    expect(routeError(SESSION_RENEWING, 503).headers.get("Retry-After")).toBe("1");
    expect(routeError("Local Supabase is not configured.", 503).headers.get("Retry-After")).toBeNull();
  });
});
