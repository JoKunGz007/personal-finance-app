import { describe, expect, it } from "vitest";
import { connectSources, contentSecurityPolicy, securityHeaders } from "@/lib/security-headers";

// The CSP is a stated invariant of this project and had no test at all until it stopped
// being a constant (`PLAN.md` task 19). These assert the parts that must survive any change
// to where the app is deployed — the failure mode being guarded against is a hosting problem
// getting "fixed" by widening the policy.

const LOCAL = "http://127.0.0.1:54321";
const HOSTED = "https://abcdefghijklm.supabase.co";

describe("connect-src derivation", () => {
  it("names the configured origin and its WebSocket equivalent", () => {
    expect(connectSources(LOCAL)).toEqual(["'self'", "http://127.0.0.1:54321", "ws://127.0.0.1:54321"]);
    expect(connectSources(HOSTED)).toEqual(["'self'", HOSTED, "wss://abcdefghijklm.supabase.co"]);
  });

  it("pairs the socket scheme with the page scheme rather than configuring it twice", () => {
    // Two values that must agree are one value. An https origin with a ws:// socket would be
    // blocked as mixed content, and nothing in the config would say why.
    expect(connectSources("https://example.test").at(-1)).toBe("wss://example.test");
    expect(connectSources("http://example.test:8000").at(-1)).toBe("ws://example.test:8000");
  });

  it("keeps a non-default port, which is the whole point locally", () => {
    expect(connectSources("http://127.0.0.1:54341")).toContain("http://127.0.0.1:54341");
  });

  it("takes only the origin from a URL carrying a path, query or fragment", () => {
    // A path in connect-src is not the restriction it looks like, so it is dropped rather
    // than passed through and trusted.
    for (const url of [`${HOSTED}/rest/v1`, `${HOSTED}?key=value`, `${HOSTED}#fragment`]) {
      expect(connectSources(url)).toEqual(["'self'", HOSTED, "wss://abcdefghijklm.supabase.co"]);
    }
  });

  it.each([undefined, null, "", "   ", "not-a-url", "supabase.co", "javascript:alert(1)", "file:///etc/passwd", "ws://only-a-socket"])(
    "falls back to 'self' alone for %j",
    (value) => {
      // Fail closed *narrower*. An unconfigured build cannot reach a database, which
      // `strongOwnerClient` already reports as a 503 — far better than a policy widened to
      // cover a value nobody validated.
      expect(connectSources(value as string | undefined)).toEqual(["'self'"]);
    }
  );
});

describe("content security policy", () => {
  it("never emits a wildcard, inline-eval or data: script source, whatever it is configured with", () => {
    for (const url of [undefined, LOCAL, HOSTED, "http://evil.test/*"]) {
      const policy = contentSecurityPolicy(url);
      expect(policy).not.toContain("*");
      expect(policy).not.toContain("'unsafe-eval'");
      expect(policy).not.toMatch(/script-src[^;]*data:/u);
    }
  });

  it("keeps the directives that do not depend on deployment", () => {
    const policy = contentSecurityPolicy(HOSTED);
    expect(policy).toContain("default-src 'self'");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("base-uri 'self'");
    expect(policy).toContain("form-action 'self'");
    // `'wasm-unsafe-eval'` is required by the pdf.js worker and the bundled QR reader
    // (D-057); `worker-src blob:` by the pdf.js worker. Both are load-bearing, so a change
    // that drops them should fail here rather than at runtime.
    expect(policy).toContain("'wasm-unsafe-eval'");
    expect(policy).toContain("worker-src 'self' blob:");
  });

  it("does not let a configured origin leak into another directive", () => {
    const policy = contentSecurityPolicy(HOSTED);
    const connect = policy.split("; ").find((directive) => directive.startsWith("connect-src "))!;
    expect(connect).toContain(HOSTED);
    expect(policy.split("; ").filter((directive) => directive.includes("supabase.co"))).toEqual([connect]);
  });
});

describe("security headers", () => {
  it("carries the full set with no store and no framing", () => {
    const headers = new Map(securityHeaders(LOCAL).map((header) => [header.key, header.value]));
    expect(headers.get("Cache-Control")).toBe("no-store");
    expect(headers.get("X-Frame-Options")).toBe("DENY");
    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(headers.get("Permissions-Policy")).toContain("camera=()");
    expect(headers.get("Content-Security-Policy")).toBe(contentSecurityPolicy(LOCAL));
  });
});
