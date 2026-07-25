import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { totp } from "@/lib/dev/totp";
import { noStoreHeaders, routeError } from "@/lib/server/supabase";

// Development-only sign-in. Mints the aal2 cookie session that every owner-bound route
// requires, so the binding chooser, the authenticated import path, and the charset
// rejection path can be exercised in a real browser (PLAN task 10).
//
// **This is not the login.** The real one is Google OAuth with two TOTP factors enrolled
// from an authenticator app (`docs/PRODUCT_CHARTER.md`, `docs/ARCHITECTURE.md`). This
// route exists because `private.has_strong_owner_access` checks the bound owner, `aal2`,
// and two verified TOTP factors, and never inspects the auth provider — so a local
// password session is indistinguishable to the gate (D-020). Provider verification
// happens once, at binding, not per request.
//
// It is an authentication bypass living in the repository, so it is guarded three ways
// and every guard fails closed. All three must hold; any one of them absent gives a 404,
// never a 403, because a 403 would confirm the route is there.
//
//  1. `NEXT_PUBLIC_ALLOW_DEV_OWNER_SESSION` must be exactly "1". It is opt-in, absent by
//     default, and has to be set when the server is built and started.
//  2. The configured Supabase URL must be loopback, so this can never sign in against
//     hosted infrastructure.
//  3. The request's own Host must be loopback, so even a build that shipped with the flag
//     set answers only to someone already on the machine.
//
// Why not simply `NODE_ENV !== "production"`: the browser specs must run against
// `next build && next start`, because the strict CSP forbids the `eval()` React needs in
// development mode and the app is not interactive under `next dev` at all (GOTCHAS,
// "Strict production CSP can block the Next.js development runtime"). A NODE_ENV guard
// would therefore be unreachable in precisely the build that needs to exercise it.
//
// State the residual honestly: this is weaker than "impossible in production". A
// deployment that set the flag, pointed at a loopback Supabase, and was reached over
// localhost could serve it. Nothing in the product sets the flag, and
// `tests/dev-session.test.ts` asserts each guard independently.

const OWNER_EMAIL = "synthetic.owner@example.invalid";
// Set by `supabase/seed.sql`. Synthetic, local, and useless anywhere else — the name
// says so, and it is committed in the seed already.
const OWNER_PASSWORD = "local-synthetic-login-disabled";
const REQUIRED_FACTORS = 2;

// Supabase returns a factor's secret only at enrolment, so a later sign-in cannot
// produce a code for a factor it did not create. These are kept in the gitignored
// runtime directory to survive a restart. Plaintext TOTP secrets on disk would be
// indefensible in production; here they belong to a synthetic owner on a loopback stack
// and never leave the machine.
const SECRET_STORE = ".runtime/dev-mfa.json";

type StoredFactor = { factorId: string; secret: string };

async function loadFactors(): Promise<StoredFactor[]> {
  try {
    const parsed: unknown = JSON.parse(await readFile(SECRET_STORE, "utf8"));
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is StoredFactor =>
      typeof entry === "object" && entry !== null
      && typeof (entry as StoredFactor).factorId === "string"
      && typeof (entry as StoredFactor).secret === "string");
  } catch {
    return [];
  }
}

async function saveFactors(factors: readonly StoredFactor[]): Promise<void> {
  await mkdir(dirname(SECRET_STORE), { recursive: true });
  await writeFile(SECRET_STORE, JSON.stringify(factors, null, 2), "utf8");
}

const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);

function hostIsLoopback(host: string | null): boolean {
  if (!host) return false;
  // Strip the port. An IPv6 literal keeps its brackets, which is how the set stores it.
  const hostname = host.startsWith("[") ? host.slice(0, host.indexOf("]") + 1) : host.split(":")[0]!;
  return LOOPBACK.has(hostname.toLowerCase());
}

function urlIsLoopback(url: string): boolean {
  try {
    return LOOPBACK.has(new URL(url).hostname.toLowerCase());
  } catch {
    return false;
  }
}

const notFound = () => new Response("Not Found", { status: 404, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  // Guards 1 and 3: explicit opt-in, and only for a caller already on this machine.
  // Both answer 404 rather than 403 — absence, not refusal.
  if (process.env.NEXT_PUBLIC_ALLOW_DEV_OWNER_SESSION !== "1") return notFound();
  if (!hostIsLoopback(request.headers.get("host"))) return notFound();

  if (!url || !key || key.startsWith("replace-with")) {
    return routeError("Local Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY from `supabase status`.", 503);
  }

  // Guard 2: never against hosted infrastructure.
  if (!urlIsLoopback(url)) {
    return routeError("Refusing to mint a development session against a non-loopback Supabase URL.", 403);
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (values) => values.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
    }
  });

  const signIn = await supabase.auth.signInWithPassword({ email: OWNER_EMAIL, password: OWNER_PASSWORD });
  if (signIn.error) {
    return routeError(`Sign-in failed: ${signIn.error.message}. Is the local stack up and seeded (\`pnpm supabase:start\`)?`, 502);
  }

  const stored = await loadFactors();
  const listed = await supabase.auth.mfa.listFactors();
  if (listed.error) return routeError(`Could not list MFA factors: ${listed.error.message}`, 502);
  const verified = listed.data.totp.filter((factor) => factor.status === "verified");

  // Enrol whatever is missing. Enrolment is permitted at aal1, and verifying a freshly
  // enrolled factor elevates the session — so a run that enrols anything ends at aal2.
  const known = new Map(stored.map((entry) => [entry.factorId, entry.secret]));
  let elevated = false;
  for (let index = verified.length; index < REQUIRED_FACTORS; index += 1) {
    const enrolled = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `dev factor ${index + 1} (${Date.now()})` });
    if (enrolled.error) return routeError(`Enrolment failed: ${enrolled.error.message}`, 502);
    const { id: factorId, totp: { secret } } = enrolled.data;
    const check = await supabase.auth.mfa.challengeAndVerify({ factorId, code: totp(secret) });
    if (check.error) return routeError(`Factor verification failed: ${check.error.message}`, 502);
    known.set(factorId, secret);
    elevated = true;
  }

  // Nothing was enrolled this run, so the session is still aal1. Elevate through any
  // factor whose secret we recorded.
  if (!elevated) {
    const usable = verified.find((factor) => known.has(factor.id));
    if (!usable) {
      return routeError(
        "Two factors are already enrolled but their secrets are unknown, so no code can be produced. "
        + "Clear them and retry: docker exec -i supabase_db_private-ledger-local psql -U postgres -d postgres "
        + "-c \"delete from auth.mfa_factors;\"",
        409
      );
    }
    const check = await supabase.auth.mfa.challengeAndVerify({ factorId: usable.id, code: totp(known.get(usable.id)!) });
    if (check.error) return routeError(`Factor verification failed: ${check.error.message}`, 502);
  }

  await saveFactors([...known].map(([factorId, secret]) => ({ factorId, secret })));

  // Report what the owner gate will actually see, rather than assuming the climb worked.
  const [assurance, factorsNow] = await Promise.all([
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    supabase.auth.mfa.listFactors()
  ]);
  const verifiedNow = factorsNow.data?.totp.filter((factor) => factor.status === "verified").length ?? 0;
  const level = assurance.data?.currentLevel ?? null;
  if (level !== "aal2" || verifiedNow < REQUIRED_FACTORS) {
    return routeError(`Session did not reach strong access (level ${level ?? "unknown"}, ${verifiedNow} verified factors).`, 502);
  }

  const configuredOwner = process.env.OWNER_GOOGLE_EMAIL?.trim().toLowerCase();
  // Not fatal here — this route's job is the session. But the owner-bound routes compare
  // this string and will answer 403 without saying why, so name it now.
  const ownerMatches = configuredOwner === OWNER_EMAIL;

  return Response.json({
    ok: true,
    email: OWNER_EMAIL,
    level,
    verifiedFactors: verifiedNow,
    ...(ownerMatches ? {} : { warning: `OWNER_GOOGLE_EMAIL is ${configuredOwner ?? "unset"}; owner-bound routes will answer 403 until it is ${OWNER_EMAIL}.` })
  }, { headers: noStoreHeaders });
}
