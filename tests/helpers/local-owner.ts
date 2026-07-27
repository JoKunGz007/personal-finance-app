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

// Removes every trace a suite may have left in this owner's import surface, plus the
// TOTP factors enrolled to reach aal2, so runs are repeatable.
//
// Audit rows are append-only in product code, so they are cleared here through
// `session_replication_role = replica` — the same escape hatch the backup round-trip
// suite uses on this synthetic database. The identity sequence is then realigned:
// public.restore_backup sets it to `greatest(max(id),1)` after re-inserting audit rows
// with explicit ids, so a database that has been through a restore can hold a sequence
// sitting at or below an existing id, and the next real import fails on
// `audit_events_pkey` for reasons that have nothing to do with the test. See GOTCHAS.
export function resetOwnerImportSurface(owner: string, accountIds: readonly string[]): { ok: boolean; output: string } {
  const accounts = accountIds.map((id) => `'${id}'`).join(",");
  return psql(`
    set session_replication_role = replica;
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
