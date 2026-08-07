import { execFileSync } from "node:child_process";
import { totp } from "@/lib/dev/totp";

// Shared local-stack harness for the suites that need a really authenticated owner.
//
// The owner gate compares an email string and never inspects the auth provider, so a
// local password user with two verified TOTP factors satisfies it exactly as a Google
// identity would (DECISIONS D-020). No hosted Supabase or OAuth resources are involved.
export const CONTAINER = "supabase_db_private-ledger-local";
export const API = "http://127.0.0.1:54321";
export const PUBLISHABLE = "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH";
// public.ledger_owners binds exactly one owner and is immutable, so a second owner
// cannot exist. Tests authenticate as the bound synthetic owner, whose credentials
// are set by supabase/seed.sql.
export const OWNER_EMAIL = "synthetic.owner@example.invalid";
export const OWNER_PASSWORD = "local-synthetic-login-disabled";

// Parameterised by container because the recovery rehearsal drives a second Supabase
// project as well as this one (tests/recovery-portability.test.ts).
export function psqlAt(container: string, sql: string): { ok: boolean; output: string } {
  try {
    return {
      ok: true,
      output: execFileSync(
        "docker",
        ["exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres", "-t", "-A", "-v", "ON_ERROR_STOP=1", "-f", "-"],
        { input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }
      )
    };
  } catch (error) {
    const shell = error as { stdout?: string; stderr?: string };
    return { ok: false, output: `${shell.stdout ?? ""}${shell.stderr ?? ""}` };
  }
}

export function psql(sql: string): { ok: boolean; output: string } {
  return psqlAt(CONTAINER, sql);
}

export function containerReachable(container: string = CONTAINER): boolean {
  return psqlAt(container, "select 1;").ok;
}

// RFC 6238 TOTP lives in `lib/dev/totp.ts` and is re-exported here, because the dev
// sign-in route needs the identical implementation. Supabase returns the factor secret
// at enrollment, so a valid code can be produced without any authenticator app.
export { totp };

export async function api(path: string, init: RequestInit & { token?: string; base?: string } = {}) {
  const { token, base, ...rest } = init;
  const response = await fetch(`${base ?? API}${path}`, {
    ...rest,
    headers: {
      apikey: PUBLISHABLE,
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...rest.headers
    }
  });
  const body = await response.text();
  return { status: response.status, body, json: () => JSON.parse(body) };
}

export type OwnerSession = { access_token: string; refresh_token: string };

// Signs in and climbs to aal2 by enrolling and verifying two TOTP factors, which is
// exactly what private.has_strong_owner_access requires. Parameterised by API base and
// credentials so the recovery destination — a different project with a different bound
// owner — reaches aal2 the same way rather than through a second implementation.
export async function sessionAt(base: string, email: string, password: string): Promise<OwnerSession> {
  const signIn = await api("/auth/v1/token?grant_type=password", {
    base,
    method: "POST",
    body: JSON.stringify({ email, password })
  });
  if (signIn.status !== 200) throw new Error(`sign-in failed: ${signIn.body}`);
  let session = signIn.json() as OwnerSession;

  for (const friendlyName of ["synthetic one", "synthetic two"]) {
    const enrolled = await api("/auth/v1/factors", {
      base,
      method: "POST",
      token: session.access_token,
      body: JSON.stringify({ factor_type: "totp", friendly_name: friendlyName })
    });
    if (enrolled.status !== 200) throw new Error(`enroll failed: ${enrolled.body}`);
    const factorId = enrolled.json().id as string;
    const secret = enrolled.json().totp.secret as string;

    const challenge = await api(`/auth/v1/factors/${factorId}/challenge`, { base, method: "POST", token: session.access_token });
    if (challenge.status !== 200) throw new Error(`challenge failed: ${challenge.body}`);

    const verified = await api(`/auth/v1/factors/${factorId}/verify`, {
      base,
      method: "POST",
      token: session.access_token,
      body: JSON.stringify({ challenge_id: challenge.json().id, code: totp(secret) })
    });
    if (verified.status !== 200) throw new Error(`verify failed: ${verified.body}`);
    session = verified.json() as OwnerSession;
  }
  return session;
}

export async function ownerSession(): Promise<OwnerSession> {
  return sessionAt(API, OWNER_EMAIL, OWNER_PASSWORD);
}

export async function weakOwnerSession(): Promise<OwnerSession> {
  const signIn = await api("/auth/v1/token?grant_type=password", {
    method: "POST",
    body: JSON.stringify({ email: OWNER_EMAIL, password: OWNER_PASSWORD })
  });
  if (signIn.status !== 200) throw new Error(`sign-in failed: ${signIn.body}`);
  return signIn.json() as OwnerSession;
}

export function ownerId(): string {
  const lookup = psql(`select id from auth.users where email = '${OWNER_EMAIL}';`);
  return lookup.output.trim().split("\n")[0]!.trim();
}

// Accounts that exist because `supabase/seed.sql` put them there. Everything else in
// `public.accounts` was created by a suite (which passes its own ids in) or by a person.
const SEEDED_ACCOUNT_IDS = [
  "11111111-2222-4333-8444-555555555555",
  "11111111-2222-4333-8444-555555555556",
  "11111111-2222-4333-8444-555555555557"
] as const;

// The escape hatch, and it is deliberately awkward to reach for.
const OVERRIDE = "ALLOW_DESTRUCTIVE_TESTS";

// Refuses to run the wipe below against a ledger holding accounts nobody recognises.
//
// This exists because the deletes are owner-scoped rather than test-scoped: they remove
// *every* transaction, batch, artifact and audit row the owner has, not only the ones a
// suite created. That was harmless while the database held nothing but the seed, and
// stopped being harmless the moment a real statement was imported into it — at which
// point `pnpm test` silently became a command that destroys real financial records.
//
// An unrecognised account is the signal, because suites always know their own account ids
// and the seed's are fixed. A leftover account from a crashed run trips this too, which is
// correct: something is in the database that no test is entitled to delete.
export function assertOnlyDisposableLedgerData(recognizedAccountIds: readonly string[]): void {
  if (process.env[OVERRIDE] === "1") return;
  const known = [...SEEDED_ACCOUNT_IDS, ...recognizedAccountIds].map((id) => `'${id}'`).join(",");
  const found = psql(`select count(*) from public.accounts where id not in (${known});`);
  if (!found.ok) throw new Error(`could not check the ledger before wiping it: ${found.output}`);
  if (Number(found.output.trim()) === 0) return;

  throw new Error(
    `Refusing to wipe the ledger: ${found.output.trim()} account(s) in public.accounts were created by neither the seed nor this suite.\n` +
    "These deletes are owner-scoped, so running them would remove every transaction, batch and audit row this owner has — including any real import.\n" +
    `Take a backup first (Recovery / 04 in the app), then set ${OVERRIDE}=1 for this run if the data really is disposable.`
  );
}

// Removes every trace a suite may have left in this owner's import surface, plus the
// TOTP factors enrolled to reach aal2, so runs are repeatable.
//
// Guarded: see assertOnlyDisposableLedgerData above. The accounts passed in are treated as
// recognised, since a caller naming an account to delete is a caller that knows about it.
//
// Audit rows are append-only in product code, so they are cleared here through
// `session_replication_role = replica` — the same escape hatch the backup round-trip
// suite uses on this synthetic database. The identity sequence is then realigned:
// public.restore_backup sets it to `greatest(max(id),1)` after re-inserting audit rows
// with explicit ids, so a database that has been through a restore can hold a sequence
// sitting at or below an existing id, and the next real import fails on
// `audit_events_pkey` for reasons that have nothing to do with the test. See GOTCHAS.
export function resetOwnerImportSurface(owner: string, accountIds: readonly string[]): { ok: boolean; output: string } {
  assertOnlyDisposableLedgerData(accountIds);
  const accounts = accountIds.map((id) => `'${id}'`).join(",");
  return psql(`
    set session_replication_role = replica;
    -- Before the slips they reference. Replica session_replication_role disables the FK
    -- triggers as well as the append-only ones, so deleting slips first would leave decisions
    -- pointing at rows that no longer exist rather than failing — silently, and only visible
    -- later as a slip that arrives already decided (migration 012).
    delete from public.slip_match_revisions where owner_id = '${owner}';
    delete from public.slip_match_overlays where owner_id = '${owner}';
    delete from public.slips where owner_id = '${owner}';
    delete from public.import_batch_rows where owner_id = '${owner}';
    delete from public.source_components where owner_id = '${owner}';
    delete from public.source_transactions where owner_id = '${owner}';
    delete from public.import_batches where owner_id = '${owner}';
    delete from public.import_artifacts where owner_id = '${owner}';
    delete from public.audit_events where owner_id = '${owner}';
    delete from public.accounts where id in (${accounts});
    set session_replication_role = origin;
    delete from auth.mfa_factors where user_id = '${owner}';
    select setval(
      pg_get_serial_sequence('public.audit_events','id'),
      greatest(coalesce((select max(id) from public.audit_events), 1), 1),
      true
    );
  `);
}
