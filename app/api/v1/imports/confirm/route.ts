import { z } from "zod";
import { payloadDigest, rowFingerprint } from "@/lib/canonical";
import { reconcileRows } from "@/lib/reconcile";
import { importPayloadSchema } from "@/lib/statement";
import { noStoreHeaders, routeError, strongOwnerClient } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";

const confirmSchema = z.object({
  idempotencyKey: z.string().uuid(),
  artifactDigest: z.string().regex(/^[a-f0-9]{64}$/),
  payload: importPayloadSchema
}).strict();

export async function POST(request: Request) {
  const auth = await strongOwnerClient();
  if (!auth.ok) return routeError(auth.message, auth.status);
  let unknownBody: unknown;
  try {
    unknownBody = await request.json();
  } catch {
    return routeError("The request body is not valid JSON.", 400);
  }
  const parsed = confirmSchema.safeParse(unknownBody);
  if (!parsed.success) return routeError("The import contract is invalid.", 422, parsed.error.flatten());

  const { payload, idempotencyKey, artifactDigest } = parsed.data;
  const digest = await payloadDigest(payload);
  const fingerprints = await Promise.all(payload.rows.map((row) => rowFingerprint(payload.accountId, payload.bankCode, row)));
  const duplicates = fingerprints.filter((fingerprint, index) => fingerprints.indexOf(fingerprint) !== index);
  if (duplicates.length > 0) return routeError("Indistinguishable rows block confirmation.", 422, { code: "AMBIGUOUS_DUPLICATES" });
  const reconciliation = reconcileRows(payload.openingBalance.minor, payload.rows);
  if (reconciliation.blockers.length > 0) return routeError("Unexplained balance gaps block confirmation.", 422, { code: "BALANCE_RECONCILIATION_FAILED", blockers: reconciliation.blockers });
  const rpcRows = payload.rows.map((row, index) => ({ ...row, fingerprint: fingerprints[index], sourceIndex: index + 1 }));
  const { data, error } = await auth.supabase.rpc("confirm_import", {
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
    return routeError(conflict ? "This retry key or artifact was already used for different content." : "The import could not be confirmed atomically.", conflict ? 409 : 400);
  }
  return Response.json({ batchId: data, payloadDigest: digest, fingerprints, warnings: reconciliation.warnings }, { status: 201, headers: noStoreHeaders });
}
