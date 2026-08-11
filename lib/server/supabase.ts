import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { REQUIRED_FACTORS } from "@/lib/owner-access";

function localConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key || key.startsWith("replace-with")) return null;
  return { url, key };
}

export async function strongOwnerClient() {
  const config = localConfig();
  if (!config) return { ok: false as const, status: 503, message: "Local Supabase is not configured." };
  const cookieStore = await cookies();
  const supabase = createServerClient(config.url, config.key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (values) => values.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
    }
  });
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { ok: false as const, status: 401, message: "Sign in to continue." };
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
  return Response.json({ error: message, ...(details === undefined ? {} : { details }) }, { status, headers: noStoreHeaders });
}
