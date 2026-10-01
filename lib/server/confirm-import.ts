import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { confirmationDigest, rowFingerprint } from "@/lib/canonical";
import { reconcileRows, type ReconciliationWarning } from "@/lib/reconcile";
import { importPayloadSchema } from "@/lib/statement";

export const confirmSchema = z.object({
  idempotencyKey: z.string().uuid(),
  artifactDigest: z.string().regex(/^[a-f0-9]{64}$/),
  payload: importPayloadSchema
}).strict();

export type ConfirmImportBody = z.infer<typeof confirmSchema>;

export type ConfirmImportResult =
  | { kind: "ok"; batchId: unknown; payloadDigest: string; fingerprints: string[]; warnings: ReconciliationWarning[] }
  | { kind: "refused"; message: string; details: { code: string; blockers?: unknown } }
  | { kind: "conflict"; message: string }
  | { kind: "error"; message: string };

/** Everything after auth and body parse: refusals, digest, the `confirm_import` RPC, transfer exclusion. */
export async function confirmImport(client: SupabaseClient, body: ConfirmImportBody): Promise<ConfirmImportResult> {
  const { payload, idempotencyKey, artifactDigest } = body;
  const fingerprints = await Promise.all(payload.rows.map((row) => rowFingerprint(payload.accountId, payload.bankCode, row)));
  const duplicates = fingerprints.filter((fingerprint, index) => fingerprints.indexOf(fingerprint) !== index);
  if (duplicates.length > 0) return { kind: "refused", message: "Indistinguishable rows block confirmation.", details: { code: "AMBIGUOUS_DUPLICATES" } };
  const reconciliation = reconcileRows(payload.openingBalance.minor, payload.rows);
  if (reconciliation.blockers.length > 0) return { kind: "refused", message: "Unexplained balance gaps block confirmation.", details: { code: "BALANCE_RECONCILIATION_FAILED", blockers: reconciliation.blockers } };
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
  const { data, error } = await client.rpc("confirm_import", {
    p_account_id: payload.accountId,
    p_artifact_digest: artifactDigest,
    p_payload_digest: digest,
    p_idempotency_key: idempotencyKey,
    p_contract_version: payload.contractVersion,
    p_period_start: payload.periodStart,
    p_period_end: payload.periodEnd,
    p_opening_balance_minor: payload.openingBalance.minor,
    p_closing_balance_minor: payload.closingBalance.minor,
    p_currency: payload.currency,
    p_rows: rpcRows
  });
  if (error) {
    const conflict = /idempotency|artifact.*different|payload.*different/iu.test(error.message);
    return conflict
      ? { kind: "conflict", message: "This retry key or artifact was already used for different content." }
      : { kind: "error", message: "The import could not be confirmed atomically." };
  }
  // Internal transfers the new rows complete are excluded from reporting (D-207). The import is
  // already committed, so a failure here must not turn it into an error; the next import or a
  // manual run from the ledger picks the pair up.
  await client.rpc("auto_exclude_internal_transfers");
  return { kind: "ok", batchId: data, payloadDigest: digest, fingerprints, warnings: reconciliation.warnings };
}
