import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { confirmationDigest, rowFingerprint } from "@/lib/canonical";
import { assembleImportPayload } from "@/lib/import-assembly";
import { extractStatement } from "@/lib/krungthai-layout";
import { validStatement } from "./fixtures/krungthai-layout-v1";
import {
  CONTAINER, api, containerReachable, ownerId as lookupOwnerId,
  ownerSession, psql, resetOwnerImportSurface, weakOwnerSession
} from "./helpers/local-owner";

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
// The local-stack harness (psql, TOTP, aal2 sign-in) is shared with the route-wrapper
// suite; see tests/helpers/local-owner.ts.
const ACCOUNT_ID = "cccccccc-0000-4000-8000-000000000001";

const reachable = containerReachable();

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
    bankCode: extractedStatement.frame.bankCode,
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
    ownerId = lookupOwnerId();
    expect(ownerId, "the seeded owner must exist").toMatch(/^[0-9a-f-]{36}$/);

    // Start this owner's import surface clean, drop any factors left by an earlier
    // run, and give them the account the extracted statement binds to.
    const cleaned = resetOwnerImportSurface(ownerId, [ACCOUNT_ID]);
    expect(cleaned.ok, `cleanup failed: ${cleaned.output}`).toBe(true);
    const setup = psql(`
      insert into public.accounts(id, owner_id, bank_code, label, account_type, last_four, currency, timezone)
        values ('${ACCOUNT_ID}', '${ownerId}', 'KTB', 'E2E synthetic', 'savings', '7890', 'THB', 'Asia/Bangkok');
    `);
    expect(setup.ok, `setup failed: ${setup.output}`).toBe(true);

    token = (await ownerSession()).access_token;
  }, 120_000);

  afterAll(() => {
    resetOwnerImportSurface(ownerId, [ACCOUNT_ID]);
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
    const aal1 = (await weakOwnerSession()).access_token;
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
