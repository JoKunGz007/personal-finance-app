import { describe, expect, it } from "vitest";
import { assembleImportPayload } from "@/lib/import-assembly";
import { extractStatement } from "@/lib/krungthai-layout";
import { confirmationDigest, rowFingerprint } from "@/lib/canonical";
import { validStatement } from "./fixtures/krungthai-layout-v1";

const ACCOUNT_ID = "11111111-2222-4333-8444-555555555555";

function extracted() {
  const result = extractStatement(validStatement);
  if (!result.ok) throw new Error(result.message);
  return result;
}

const target = { accountId: ACCOUNT_ID, bankCode: "KTB", lastFour: "7890", currency: "THB" };

describe("import payload assembly", () => {
  it("assembles a confirmable payload from an extracted statement", () => {
    const { frame, rows } = extracted();
    const result = assembleImportPayload(frame, rows, target);
    expect(result.ok, result.ok ? "" : JSON.stringify(result.details ?? result.message)).toBe(true);
    if (!result.ok) return;

    expect(result.payload.accountId).toBe(ACCOUNT_ID);
    expect(result.payload.periodStart).toBe("2026-01-01");
    expect(result.payload.periodEnd).toBe("2026-01-31");
    expect(result.payload.openingBalance).toEqual({ minor: "1000000", currency: "THB" });
    expect(result.payload.closingBalance).toEqual({ minor: "1025970", currency: "THB" });
    expect(result.payload.rows).toHaveLength(4);
  });

  it("submits a reordered statement in applied order and reports the reordering", () => {
    // The defect this guards: the payload's rows are in applied order, so re-reconciling
    // the payload finds nothing to report. A caller rendering only its own reconciliation
    // would show a clean statement and never mention the reordering (D-055).
    const { frame, rows } = extracted();
    const day = rows[0]!.sourceDate;
    // Invented: put every row on one date and print an end-of-day posting first, so the
    // printed chain breaks and exactly one ordering closes it.
    const chained = [rows[1]!, rows[2]!, rows[3]!, rows[0]!].map((row) => ({ ...row, sourceDate: day }));
    let running = BigInt(frame.openingBalance);
    const renumbered = chained.map((row) => {
      running += row.components.reduce((sum, item) => sum + BigInt(item.amount.minor), 0n);
      return { ...row, postBalance: { ...row.postBalance, minor: running.toString() as typeof row.postBalance.minor } };
    });
    const printed = [renumbered[3]!, renumbered[0]!, renumbered[1]!, renumbered[2]!];

    const result = assembleImportPayload({ ...frame, closingBalance: running.toString() as typeof frame.closingBalance }, printed, target);
    expect(result.ok, result.ok ? "" : JSON.stringify(result.details ?? result.message)).toBe(true);
    if (!result.ok) return;

    // Reported, not silent.
    expect(result.warnings.map((warning) => warning.code)).toContain("out-of-order-run");
    // Submitted in the order that closes, which is what confirm_import walks.
    let chain = BigInt(result.payload.openingBalance.minor);
    for (const row of result.payload.rows) {
      chain += row.components.reduce((sum, item) => sum + BigInt(item.amount.minor), 0n);
      expect(chain.toString()).toBe(row.postBalance.minor);
    }
    expect(chain.toString()).toBe(result.payload.closingBalance.minor);
    // Printed position survives the reordering.
    expect(result.payload.rows.map((row) => row.provenance.row).sort())
      .toEqual(printed.map((row) => row.provenance.row).sort());
  });

  it("produces rows the confirm route can fingerprint and digest", async () => {
    const { frame, rows } = extracted();
    const result = assembleImportPayload(frame, rows, target);
    if (!result.ok) throw new Error(result.message);

    // Mirrors app/api/v1/imports/confirm/route.ts: fingerprint every row, reject
    // indistinguishable rows, then digest the frame plus the rpc rows.
    const payload = result.payload;
    const fingerprints = await Promise.all(
      payload.rows.map((row) => rowFingerprint(payload.accountId, payload.bankCode, row))
    );
    expect(new Set(fingerprints).size).toBe(fingerprints.length);

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
    expect(digest).toMatch(/^[a-f0-9]{64}$/);
  });

  it("refuses a statement whose printed totals never confirmed its rows", () => {
    // The reader reads such a statement — that is a fact about the document — but it may
    // not reach an append-only ledger (D-043). This is where the refusal lives, rather
    // than in the reader, so a dozen fixtures that never print totals stay readable.
    const { frame, rows } = extracted();
    expect(assembleImportPayload({ ...frame, crossChecked: false }, rows, target))
      .toMatchObject({ ok: false, code: "NOT_CROSS_CHECKED" });
  });

  it("names the missing cross-check before anything about the binding", () => {
    // If this fails, no account will do — so reporting a wrong account first would send
    // the owner through the chooser looking for one that fits.
    const { frame, rows } = extracted();
    expect(assembleImportPayload({ ...frame, crossChecked: false }, rows, { ...target, lastFour: "0001", bankCode: "SCB" }))
      .toMatchObject({ ok: false, code: "NOT_CROSS_CHECKED" });
  });

  it("refuses an account whose last four does not match the statement", () => {
    const { frame, rows } = extracted();
    expect(assembleImportPayload(frame, rows, { ...target, lastFour: "0001" }))
      .toMatchObject({ ok: false, code: "ACCOUNT_MISMATCH" });
  });

  it("refuses an account held in another currency", () => {
    const { frame, rows } = extracted();
    expect(assembleImportPayload(frame, rows, { ...target, currency: "USD" }))
      .toMatchObject({ ok: false, code: "CURRENCY_MISMATCH" });
  });

  it("refuses rows that do not reconcile from the printed opening balance", () => {
    const { frame, rows } = extracted();
    const tampered = rows.map((row, index) =>
      index === 0 ? { ...row, postBalance: { minor: "999999", currency: "THB" as const } } : row);
    expect(assembleImportPayload(frame, tampered, target))
      .toMatchObject({ ok: false, code: "BALANCE_RECONCILIATION_FAILED" });
  });

  it("refuses a statement whose text violates the source-text charset", () => {
    const { frame, rows } = extracted();
    const exotic = rows.map((row, index) =>
      index === 0 ? { ...row, description: "total \u{1CCF0}" } : row);
    expect(assembleImportPayload(frame, exotic, target))
      .toMatchObject({ ok: false, code: "INVALID_PAYLOAD" });
  });
});
