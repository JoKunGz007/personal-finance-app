import { createHmac, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { confirmationDigest, rowFingerprint } from "@/lib/canonical";
import { assembleImportPayload } from "@/lib/import-assembly";
import { extractStatement } from "@/lib/krungthai-layout";
import { validStatement } from "./fixtures/krungthai-layout-v1";

// Drives a real authenticated request into confirm_import.
//
// Everything hardened in D-012 (server-recomputed payload digest) and D-014
// (server-recomputed row fingerprints) was previously proven only at the SQL and
// unit level: the pgTAP wrapper computes fingerprints server-side in pg_temp, so it
// shows the SQL is self-consistent, not that a client's values are accepted. This
// test computes fingerprints and the digest with the real lib/canonical.ts, from a
// statement extracted by the real parser, and sends them over HTTP as an owner who
// actually passed MFA.
//
// The owner gate compares an email string and never inspects the auth provider, so
// a local password user with two verified TOTP factors satisfies it exactly as a
// Google identity would. No hosted Supabase or OAuth resources are involved.
const CONTAINER = "supabase_db_private-ledger-local";
const API = "http://127.0.0.1:54321";
const PUBLISHABLE = "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH";
// public.ledger_owners binds exactly one owner and is immutable, so a second owner
// cannot exist. The test authenticates as the bound synthetic owner, whose
// credentials are set by supabase/seed.sql.
const OWNER_EMAIL = "synthetic.owner@example.invalid";
const OWNER_PASSWORD = "local-synthetic-login-disabled";
const ACCOUNT_ID = "cccccccc-0000-4000-8000-000000000001";

function psql(sql: string): { ok: boolean; output: string } {
  try {
    return {
      ok: true,
      output: execFileSync(
        "docker",
        ["exec", "-i", CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-t", "-A", "-v", "ON_ERROR_STOP=1", "-f", "-"],
        { input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }
      )
    };
  } catch (error) {
    const shell = error as { stdout?: string; stderr?: string };
    return { ok: false, output: `${shell.stdout ?? ""}${shell.stderr ?? ""}` };
  }
}

const reachable = psql("select 1;").ok;

// RFC 6238 TOTP. Supabase returns the factor secret at enrollment, so a valid code
// can be produced without any authenticator app.
function totp(secret: string): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const character of secret.replace(/=+$/u, "").toUpperCase()) {
    const value = alphabet.indexOf(character);
    if (value < 0) continue;
    bits += value.toString(2).padStart(5, "0");
  }
  const key = Buffer.from((bits.match(/.{8}/gu) ?? []).map((byte) => parseInt(byte, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 1000 / 30)));
  const digest = createHmac("sha1", key).update(counter).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const code = digest.readUInt32BE(offset) & 0x7fffffff;
  return (code % 1_000_000).toString().padStart(6, "0");
}

async function api(path: string, init: RequestInit & { token?: string } = {}) {
  const { token, ...rest } = init;
  const response = await fetch(`${API}${path}`, {
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

// Signs in and climbs to aal2 by enrolling and verifying two TOTP factors, which is
// exactly what private.has_strong_owner_access requires.
async function ownerSession(): Promise<string> {
  const signIn = await api("/auth/v1/token?grant_type=password", {
    method: "POST",
    body: JSON.stringify({ email: OWNER_EMAIL, password: OWNER_PASSWORD })
  });
  if (signIn.status !== 200) throw new Error(`sign-in failed: ${signIn.body}`);
  let token = signIn.json().access_token as string;

  for (const friendlyName of ["synthetic one", "synthetic two"]) {
    const enrolled = await api("/auth/v1/factors", {
      method: "POST",
      token,
      body: JSON.stringify({ factor_type: "totp", friendly_name: friendlyName })
    });
    if (enrolled.status !== 200) throw new Error(`enroll failed: ${enrolled.body}`);
    const factorId = enrolled.json().id as string;
    const secret = enrolled.json().totp.secret as string;

    const challenge = await api(`/auth/v1/factors/${factorId}/challenge`, { method: "POST", token });
    if (challenge.status !== 200) throw new Error(`challenge failed: ${challenge.body}`);

    const verified = await api(`/auth/v1/factors/${factorId}/verify`, {
      method: "POST",
      token,
      body: JSON.stringify({ challenge_id: challenge.json().id, code: totp(secret) })
    });
    if (verified.status !== 200) throw new Error(`verify failed: ${verified.body}`);
    token = verified.json().access_token as string;
  }
  return token;
}

// Mirrors app/api/v1/imports/confirm/route.ts exactly: fingerprint every row with
// the shared client helper, then digest the frame plus the rpc rows.
async function toRpcArguments(payload: Awaited<ReturnType<typeof buildPayload>>) {
  const fingerprints = await Promise.all(
    payload.rows.map((row) => rowFingerprint(payload.accountId, payload.bankCode, row))
  );
  const rpcRows = payload.rows.map((row, index) => ({ ...row, fingerprint: fingerprints[index], sourceIndex: index + 1 }));
  const digest = await confirmationDigest({
    accountId: payload.accountId,
    contractVersion: payload.contractVersion,
    currency: payload.currency,
    periodStart: payload.periodStart,
    periodEnd: payload.periodEnd,
    openingBalanceMinor: payload.openingBalance.minor,
    closingBalanceMinor: payload.closingBalance.minor
  }, rpcRows);
  return { rpcRows, digest };
}

function buildPayload() {
  const extractedStatement = extractStatement(validStatement);
  if (!extractedStatement.ok) throw new Error(extractedStatement.message);
  const assembled = assembleImportPayload(extractedStatement.frame, extractedStatement.rows, {
    accountId: ACCOUNT_ID,
    lastFour: extractedStatement.frame.accountLastFour,
    currency: "THB"
  });
  if (!assembled.ok) throw new Error(assembled.message);
  return assembled.payload;
}

let ownerId = "";
let token = "";

describe.skipIf(!reachable)("authenticated import confirmation", () => {
  beforeAll(async () => {
    const lookup = psql(`select id from auth.users where email = '${OWNER_EMAIL}';`);
    ownerId = lookup.output.trim().split("\n")[0]!.trim();
    expect(ownerId, "the seeded owner must exist").toMatch(/^[0-9a-f-]{36}$/);

    // Start this owner's import surface clean, drop any factors left by an earlier
    // run, and give them the account the extracted statement binds to.
    const setup = psql(`
      set session_replication_role = replica;
      delete from public.import_batch_rows where owner_id = '${ownerId}';
      delete from public.source_components where owner_id = '${ownerId}';
      delete from public.source_transactions where owner_id = '${ownerId}';
      delete from public.import_batches where owner_id = '${ownerId}';
      delete from public.import_artifacts where owner_id = '${ownerId}';
      delete from public.accounts where id = '${ACCOUNT_ID}';
      set session_replication_role = origin;
      delete from auth.mfa_factors where user_id = '${ownerId}';
      insert into public.accounts(id, owner_id, bank_code, label, account_type, last_four, currency, timezone)
        values ('${ACCOUNT_ID}', '${ownerId}', 'KTB', 'E2E synthetic', 'savings', '7890', 'THB', 'Asia/Bangkok');
    `);
    expect(setup.ok, `setup failed: ${setup.output}`).toBe(true);

    token = await ownerSession();
  }, 120_000);

  afterAll(() => {
    psql(`
      set session_replication_role = replica;
      delete from public.import_batch_rows where owner_id = '${ownerId}';
      delete from public.source_components where owner_id = '${ownerId}';
      delete from public.source_transactions where owner_id = '${ownerId}';
      delete from public.import_batches where owner_id = '${ownerId}';
      delete from public.import_artifacts where owner_id = '${ownerId}';
      delete from public.accounts where id = '${ACCOUNT_ID}';
      set session_replication_role = origin;
      delete from auth.mfa_factors where user_id = '${ownerId}';
    `);
  });

  it("reaches aal2 with two verified TOTP factors", () => {
    const claims = JSON.parse(Buffer.from(token.split(".")[1]!, "base64url").toString("utf8"));
    expect(claims.aal).toBe("aal2");
    const factors = psql(`select count(*) from auth.mfa_factors where user_id = '${ownerId}' and status = 'verified';`);
    expect(factors.output.trim()).toBe("2");
  });

  it("accepts client-computed fingerprints and digest over HTTP", async () => {
    const payload = buildPayload();
    const { rpcRows, digest } = await toRpcArguments(payload);

    const response = await api("/rest/v1/rpc/confirm_import", {
      method: "POST",
      token,
      body: JSON.stringify({
        p_account_id: payload.accountId,
        p_artifact_digest: "a".repeat(64),
        p_payload_digest: digest,
        p_idempotency_key: randomUUID(),
        p_contract_version: payload.contractVersion,
        p_period_start: payload.periodStart,
        p_period_end: payload.periodEnd,
        p_opening_balance_minor: payload.openingBalance.minor,
        p_closing_balance_minor: payload.closingBalance.minor,
        p_currency: payload.currency,
        p_rows: rpcRows
      })
    });

    expect(response.status, response.body).toBe(200);
    const batchId = JSON.parse(response.body);
    expect(batchId).toMatch(/^[0-9a-f-]{36}$/);

    // The rows really landed, under the authenticated owner.
    const stored = psql(`select count(*) from public.source_transactions where owner_id = '${ownerId}';`);
    expect(stored.output.trim()).toBe(String(payload.rows.length));
  }, 60_000);

  it("rejects a tampered fingerprint from a real client", async () => {
    const payload = buildPayload();
    const { rpcRows, digest } = await toRpcArguments(payload);
    // Keep the digest honest for the tampered rows so the fingerprint check, not
    // the digest check, is what fails.
    const tampered = rpcRows.map((row, index) => index === 0 ? { ...row, fingerprint: "b".repeat(64) } : row);
    const tamperedDigest = await confirmationDigest({
      accountId: payload.accountId,
      contractVersion: payload.contractVersion,
      currency: payload.currency,
      periodStart: payload.periodStart,
      periodEnd: payload.periodEnd,
      openingBalanceMinor: payload.openingBalance.minor,
      closingBalanceMinor: payload.closingBalance.minor
    }, tampered);
    expect(tamperedDigest).not.toBe(digest);

    const response = await api("/rest/v1/rpc/confirm_import", {
      method: "POST",
      token,
      body: JSON.stringify({
        p_account_id: payload.accountId,
        p_artifact_digest: "c".repeat(64),
        p_payload_digest: tamperedDigest,
        p_idempotency_key: randomUUID(),
        p_contract_version: payload.contractVersion,
        p_period_start: payload.periodStart,
        p_period_end: payload.periodEnd,
        p_opening_balance_minor: payload.openingBalance.minor,
        p_closing_balance_minor: payload.closingBalance.minor,
        p_currency: payload.currency,
        p_rows: tampered
      })
    });

    expect(response.status).not.toBe(200);
    expect(response.body).toMatch(/fingerprint mismatch/u);
  }, 60_000);

  it("refuses the same request without MFA", async () => {
    const weak = await api("/auth/v1/token?grant_type=password", {
      method: "POST",
      body: JSON.stringify({ email: OWNER_EMAIL, password: OWNER_PASSWORD })
    });
    const aal1 = weak.json().access_token as string;
    const payload = buildPayload();
    const { rpcRows, digest } = await toRpcArguments(payload);

    const response = await api("/rest/v1/rpc/confirm_import", {
      method: "POST",
      token: aal1,
      body: JSON.stringify({
        p_account_id: payload.accountId, p_artifact_digest: "d".repeat(64), p_payload_digest: digest,
        p_idempotency_key: randomUUID(), p_contract_version: payload.contractVersion,
        p_period_start: payload.periodStart, p_period_end: payload.periodEnd,
        p_opening_balance_minor: payload.openingBalance.minor,
        p_closing_balance_minor: payload.closingBalance.minor,
        p_currency: payload.currency, p_rows: rpcRows
      })
    });

    expect(response.status).not.toBe(200);
    expect(response.body).toMatch(/strong owner access required/u);
  }, 60_000);
});

it.skipIf(reachable)("reports that the authenticated import path was not verified", () => {
  console.warn(
    `Skipped authenticated import confirmation: container ${CONTAINER} is unreachable. ` +
    "Run `pnpm supabase:start` to exercise it — a skipped run proves nothing about the import path."
  );
  expect(reachable).toBe(false);
});
