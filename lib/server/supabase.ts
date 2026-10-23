import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { REQUIRED_FACTORS } from "@/lib/owner-access";
import { retryingFetch } from "@/lib/server/retry-fetch";

function localConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key || key.startsWith("replace-with")) return null;
  return { url, key };
}

/** A sessionless client on the publishable key, for callers with no owner session (the LINE webhook, D-241). */
export function anonServerClient() {
  const config = localConfig();
  if (!config) return null;
  return createClient(config.url, config.key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Below this much token life after `getUser()`, a request could outlive its token (D-303). */
const SESSION_FLOOR_MS = 30_000;
export const SESSION_RENEWING = "Your sign-in was being renewed, so nothing was read. Try again.";

export async function strongOwnerClient() {
  const config = localConfig();
  if (!config) return { ok: false as const, status: 503, message: "Local Supabase is not configured." };
  const cookieStore = await cookies();
  const supabase = createServerClient(config.url, config.key, {
    global: { fetch: retryingFetch() },
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (values) => values.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
    }
  });
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { ok: false as const, status: 401, message: "Sign in to continue." };
  // A token about to expire after `getUser()` means its refresh failed: auth-js keeps sending the
  // old token until its real expiry and will not retry the refresh for 60 s, so a later read in this
  // request can reach PostgREST expired (PGRST303, a 500 mid-load). Refuse before any read; the
  // browser retries a GET once on this answer (`lib/wire.ts`), by when its cookies carry the renewed
  // session. Seen on production 2026-10-23 (D-303).
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.expires_at && session.expires_at * 1000 - Date.now() < SESSION_FLOOR_MS) {
    return { ok: false as const, status: 503, message: SESSION_RENEWING };
  }
  const ownerEmail = process.env.OWNER_GOOGLE_EMAIL?.trim().toLowerCase();
  if (!ownerEmail || user.email?.toLowerCase() !== ownerEmail) return { ok: false as const, status: 403, message: "This identity is not the ledger owner." };
  const [aal, factors] = await Promise.all([
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    supabase.auth.mfa.listFactors()
  ]);
  // One verified factor, matching `private.has_strong_owner_access` exactly (D-093,
  // migration 015). These two checks must agree: the SQL one is what actually guards every
  // RPC, and this one exists so a refusal arrives as a 403 with a sentence rather than as a
  // PostgreSQL exception from inside a function.
  const verifiedTotp = factors.data?.totp.filter((factor) => factor.status === "verified").length ?? 0;
  if (aal.data?.currentLevel !== "aal2" || verifiedTotp < REQUIRED_FACTORS) {
    return { ok: false as const, status: 403, message: "AAL2 and a verified TOTP factor are required." };
  }
  return { ok: true as const, supabase, user };
}

export const noStoreHeaders = { "Cache-Control": "no-store", "Content-Type": "application/json" };

export function routeError(message: string, status: number, details?: unknown) {
  // `Retry-After` marks the one 503 worth retrying (D-303); the others mean "not configured".
  const headers = message === SESSION_RENEWING ? { ...noStoreHeaders, "Retry-After": "1" } : noStoreHeaders;
  return Response.json({ error: message, ...(details === undefined ? {} : { details }) }, { status, headers });
}
