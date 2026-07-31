// The response headers, and the one part of them that cannot be a constant.
//
// `connect-src` has to name the Supabase origin the app actually talks to. It was hard-coded
// to `http://127.0.0.1:54321`, which is correct for exactly one machine and silently wrong
// for a hosted deployment — the app would build, load, and then fail every request with a
// CSP violation rather than an error anyone could act on (`PLAN.md` task 19).
//
// Everything else here stays fixed. The rule this file exists to keep is that widening the
// policy is never how a deployment problem gets solved: the origin is *derived* from a
// configured URL, never wildcarded, never read from a header, and an unconfigured build
// gets a **narrower** policy rather than a broader one.

export const REQUIRED_DIRECTIVES = {
  "default-src": "'self'",
  "script-src": "'self' 'unsafe-inline' 'wasm-unsafe-eval'",
  "style-src": "'self' 'unsafe-inline'",
  "img-src": "'self' data: blob:",
  "font-src": "'self'",
  "worker-src": "'self' blob:",
  "object-src": "'none'",
  "frame-ancestors": "'none'",
  "base-uri": "'self'",
  "form-action": "'self'"
} as const;

/**
 * The origins `connect-src` may name, derived from the configured Supabase URL.
 *
 * Returns `'self'` alone when the URL is absent or not a plain http(s) origin. That is the
 * fail-closed direction: an app that cannot reach its database is broken and says so
 * (`strongOwnerClient` already answers 503 in that state), whereas a policy widened to cover
 * an unknown value is broken and does not.
 *
 * Only the *origin* is taken. A configured value carrying a path, query or fragment
 * contributes its scheme, host and port and nothing else, because a path in `connect-src` is
 * not a restriction the browser enforces the way a reader might assume.
 */
export function connectSources(supabaseUrl: string | undefined | null): string[] {
  const sources = ["'self'"];
  if (!supabaseUrl) return sources;

  let parsed: URL;
  try {
    parsed = new URL(supabaseUrl);
  } catch {
    return sources;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return sources;
  if (!parsed.hostname) return sources;

  // Realtime uses a WebSocket against the same host, so the socket scheme is derived rather
  // than configured separately — two values that must agree are one value.
  const socketProtocol = parsed.protocol === "https:" ? "wss:" : "ws:";
  sources.push(parsed.origin, `${socketProtocol}//${parsed.host}`);
  return sources;
}

export function contentSecurityPolicy(supabaseUrl: string | undefined | null): string {
  const directives = { ...REQUIRED_DIRECTIVES, "connect-src": connectSources(supabaseUrl).join(" ") };
  // A fixed order so the header is stable across builds and a diff of it is readable.
  return [
    `default-src ${directives["default-src"]}`,
    `script-src ${directives["script-src"]}`,
    `style-src ${directives["style-src"]}`,
    `img-src ${directives["img-src"]}`,
    `font-src ${directives["font-src"]}`,
    `connect-src ${directives["connect-src"]}`,
    `worker-src ${directives["worker-src"]}`,
    `object-src ${directives["object-src"]}`,
    `frame-ancestors ${directives["frame-ancestors"]}`,
    `base-uri ${directives["base-uri"]}`,
    `form-action ${directives["form-action"]}`
  ].join("; ");
}

export function securityHeaders(supabaseUrl: string | undefined | null): Array<{ key: string; value: string }> {
  return [
    { key: "Cache-Control", value: "no-store" },
    { key: "Content-Security-Policy", value: contentSecurityPolicy(supabaseUrl) },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
    { key: "Referrer-Policy", value: "no-referrer" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" }
  ];
}
