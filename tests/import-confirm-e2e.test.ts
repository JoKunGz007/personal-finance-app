import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { confirmationDigest, rowFingerprint } from "@/lib/canonical";
import { assembleImportPayload } from "@/lib/import-assembly";
import { extractStatement } from "@/lib/krungthai-layout";
import { REQUIRED_FACTORS } from "@/lib/owner-access";
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
const IDENTITY_ACCOUNT_ID = "cccccccc-0000-4000-8000-000000000002";

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

// Identity links (migration 054): one synthetic withdrawal row per statement, printed
// differently by statement B, sent over HTTP like a real client.
type IdentityRow = { date: string; time: string | null; label: string; description: string; post: number };

async function submitIdentityStatement(row: IdentityRow, artifactChar: string, amountMinor = -10000) {
  const base = buildPayload().rows[0]!;
  const candidate = {
    ...base,
    sourceDate: row.date,
    sourceTime: row.time,
    effectiveDate: row.date,
    transactionLabel: row.label,
    description: row.description,
    reference: null,
    branch: null,
    components: [{ kind: "withdrawal" as const, amount: { minor: String(amountMinor), currency: "THB" as const } }],
    postBalance: { minor: String(row.post), currency: "THB" as const },
    provenance: { page: 1, row: 1, parserFields: {} }
  };
  const fingerprint = await rowFingerprint(IDENTITY_ACCOUNT_ID, "KTB", candidate);
  const rpcRows = [{ ...candidate, fingerprint, sourceIndex: 1 }];
  const opening = String(row.post - amountMinor);
  const closing = String(row.post);
  const digest = await confirmationDigest({
    accountId: IDENTITY_ACCOUNT_ID, contractVersion: "krungthai-layout-v1", currency: "THB",
    periodStart: row.date, periodEnd: row.date, openingBalanceMinor: opening, closingBalanceMinor: closing
  }, rpcRows);
  const response = await api("/rest/v1/rpc/confirm_import", {
    method: "POST",
    token,
    body: JSON.stringify({
      p_account_id: IDENTITY_ACCOUNT_ID, p_artifact_digest: artifactChar.repeat(64), p_payload_digest: digest,
      p_idempotency_key: randomUUID(), p_contract_version: "krungthai-layout-v1",
      p_period_start: row.date, p_period_end: row.date,
      p_opening_balance_minor: opening, p_closing_balance_minor: closing,
      p_currency: "THB", p_rows: rpcRows
    })
  });
  expect(response.status, response.body).toBe(200);
  return JSON.parse(response.body) as string;
}

function countIdentityTransactions(date: string) {
  const out = psql(`select count(*) from public.source_transactions where owner_id='${ownerId}' and account_id='${IDENTITY_ACCOUNT_ID}' and source_date='${date}';`);
  return out.output.trim();
}

let ownerId = "";
let token = "";

describe.skipIf(!reachable)("authenticated import confirmation", () => {
  beforeAll(async () => {
    ownerId = lookupOwnerId();
    expect(ownerId, "the seeded owner must exist").toMatch(/^[0-9a-f-]{36}$/);

    // Start this owner's import surface clean, drop any factors left by an earlier
    // run, and give them the account the extracted statement binds to.
    const cleaned = resetOwnerImportSurface(ownerId, [ACCOUNT_ID, IDENTITY_ACCOUNT_ID]);
    expect(cleaned.ok, `cleanup failed: ${cleaned.output}`).toBe(true);
    const setup = psql(`
      insert into public.accounts(id, owner_id, bank_code, label, account_type, last_four, currency, timezone)
        values ('${ACCOUNT_ID}', '${ownerId}', 'KTB', 'E2E synthetic', 'savings', '7890', 'THB', 'Asia/Bangkok'),
               ('${IDENTITY_ACCOUNT_ID}', '${ownerId}', 'KTB', 'E2E identity', 'savings', '7891', 'THB', 'Asia/Bangkok');
    `);
    expect(setup.ok, `setup failed: ${setup.output}`).toBe(true);

    token = (await ownerSession()).access_token;
  }, 120_000);

  afterAll(() => {
    resetOwnerImportSurface(ownerId, [ACCOUNT_ID, IDENTITY_ACCOUNT_ID]);
  });

  it("reaches aal2 with a verified TOTP factor", () => {
    const claims = JSON.parse(Buffer.from(token.split(".")[1]!, "base64url").toString("utf8"));
    expect(claims.aal).toBe("aal2");
    const factors = psql(`select count(*) from auth.mfa_factors where user_id = '${ownerId}' and status = 'verified';`);
    // Against the shared constant, not a literal, so this cannot drift from
    // `private.has_strong_owner_access` without one of them failing (D-093).
    expect(factors.output.trim()).toBe(String(REQUIRED_FACTORS));
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

  it("links the same bank row printed differently to the existing row", async () => {
    const a = await submitIdentityStatement({ date: "2026-03-01", time: "10:15", label: "Transfer out", description: "To account 123", post: 500000 }, "1");
    const b = await submitIdentityStatement({ date: "2026-03-01", time: "10:15", label: "Thai print", description: "To account 123 wrapped", post: 500000 }, "2");
    expect(countIdentityTransactions("2026-03-01")).toBe("1");
    const linked = psql(`select linked_existing::text || ',' || (transaction_id = (select transaction_id from public.import_batch_rows where batch_id='${a}')) from public.import_batch_rows where batch_id='${b}';`);
    expect(linked.output.trim()).toBe("true,true");
    const audit = psql(`select detail->>'identity_links' from public.audit_events where entity_id='${b}' and event_type='import.confirmed';`);
    expect(audit.output.trim()).toBe("1");
    const auditA = psql(`select detail->>'identity_links' from public.audit_events where entity_id='${a}' and event_type='import.confirmed';`);
    expect(auditA.output.trim()).toBe("0");
  }, 60_000);

  it("inserts a new row when the post balance differs", async () => {
    await submitIdentityStatement({ date: "2026-03-02", time: "10:15", label: "Transfer out", description: "To account 123", post: 500000 }, "3");
    await submitIdentityStatement({ date: "2026-03-02", time: "10:15", label: "Thai print", description: "To account 123 wrapped", post: 400000 }, "4");
    expect(countIdentityTransactions("2026-03-02")).toBe("2");
  }, 60_000);

  it("never identity-matches a row without a source time", async () => {
    await submitIdentityStatement({ date: "2026-03-03", time: null, label: "Transfer out", description: "To account 123", post: 500000 }, "5");
    await submitIdentityStatement({ date: "2026-03-03", time: null, label: "Thai print", description: "To account 123 wrapped", post: 500000 }, "6");
    expect(countIdentityTransactions("2026-03-03")).toBe("2");
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
