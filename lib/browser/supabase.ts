import { createBrowserClient } from "@supabase/ssr";

// The browser half of the session, and the first one this app has ever had (PLAN task 19).
//
// Until 2026-08-10 `createServerClient` in `lib/server/supabase.ts` was the only Supabase
// client anywhere in the app. Every owner-bound route read a cookie session that exactly one
// thing had ever minted — `app/api/v1/dev/session/route.ts`, which answers 404 unless the
// flag is set *and* the Supabase URL is loopback *and* the request's own Host is loopback.
// So a hosted deployment had no way to sign anybody in at all, which is why OAuth gates
// hosting rather than merely accompanying it.
//
// Google sign-in and TOTP enrolment both have to happen here rather than server-side:
// OAuth is a redirect the owner performs, and enrolment is a conversation with an
// authenticator app that this app's server has no part in and no reason to see.
//
// **Cookies, not localStorage.** `createBrowserClient` from `@supabase/ssr` keeps the
// session in cookies, which is what lets `strongOwnerClient` read it on the next request —
// and is also the only client storage this app permits (`tests/privacy.test.ts` forbids
// `localStorage` and `sessionStorage` on every ledger surface).

/**
 * Returns `null` rather than throwing when Supabase is unconfigured, matching
 * `localConfig()` on the server so both halves agree about what "configured" means. The
 * caller renders the signed-out state, which is the honest thing to show: an app that
 * cannot reach its database cannot sign anyone in either.
 */
export function browserSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key || key.startsWith("replace-with")) return null;
  return createBrowserClient(url, key);
}
