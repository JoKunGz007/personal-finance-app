import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { noStoreHeaders, routeError } from "@/lib/server/supabase";

// Where Google sends the owner back to (PLAN task 19).
//
// The browser starts the flow with `signInWithOAuth`, Google returns here with a `code`,
// and this exchanges it for the cookie session every owner-bound route reads. It has to be
// a server route rather than a page: `@supabase/ssr` stores the PKCE verifier in a cookie
// this handler can read, and the session cookies it sets have to be written on a response
// rather than from a component.
//
// **The redirect target is a constant, and that is deliberate.** The obvious convenience —
// honouring a `next` or `redirectTo` parameter so the owner lands back where they were — is
// an open redirect: this URL is handed to a third party by construction, so anything it
// echoes back into a `Location` header is attacker-controlled. There are four routes and
// `/ledger` is the one `/` already redirects to, so the convenience buys nothing anyway.
const LANDING = "/ledger";

export async function GET(request: Request) {
  const requested = new URL(request.url);

  // Google reports a refusal in the query string rather than by failing the request, and
  // the owner cancelling their own sign-in arrives here identically to a misconfigured
  // provider. Report the code as given; it is Google's vocabulary, not something to
  // paraphrase into a friendlier word that no search will match.
  const denied = requested.searchParams.get("error");
  if (denied) {
    const description = requested.searchParams.get("error_description");
    return routeError(`Google refused the sign-in: ${denied}${description ? ` — ${description}` : ""}`, 400);
  }

  const code = requested.searchParams.get("code");
  if (!code) return routeError("This address is the end of a Google sign-in and carries no code of its own.", 400);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key || key.startsWith("replace-with")) {
    return routeError("Supabase is not configured, so this sign-in cannot be completed.", 503);
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (values) => values.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
    }
  });

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    // A dead end that names the failure, rather than a redirect that silently lands on a
    // signed-out ledger. This path runs when the provider is first configured and when it
    // later breaks, and in both cases the message is the whole value — a friendlier page
    // that dropped it would send the owner to the server logs of a machine they may not
    // have.
    return routeError(`The Google sign-in could not be completed: ${error.message}`, 400);
  }

  // The session is `aal1` at this point and every owner-bound route will refuse it. What
  // happens next — enrol two factors, or prove one — is decided by `app/owner-access.tsx`
  // from what Supabase reports, so nothing here needs to know which.
  // A **relative** Location, not one rebuilt on `requested.origin`. That origin comes from
  // the Host header, so an absolute redirect built from it is only ever as trustworthy as
  // whatever proxy sits in front — and a relative target is resolved by the browser against
  // the address it actually asked for. Nothing is gained by the absolute form here.
  return new Response(null, { status: 303, headers: { ...noStoreHeaders, Location: LANDING } });
}
