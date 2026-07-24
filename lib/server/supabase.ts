import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

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
  const verifiedTotp = factors.data?.totp.filter((factor) => factor.status === "verified").length ?? 0;
  if (aal.data?.currentLevel !== "aal2" || verifiedTotp < 2) {
    return { ok: false as const, status: 403, message: "AAL2 and two verified TOTP factors are required." };
  }
  return { ok: true as const, supabase, user };
}

export const noStoreHeaders = { "Cache-Control": "no-store", "Content-Type": "application/json" };

export function routeError(message: string, status: number, details?: unknown) {
  return Response.json({ error: message, ...(details === undefined ? {} : { details }) }, { status, headers: noStoreHeaders });
}
