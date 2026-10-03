import { describe, expect, it, vi } from "vitest";
import type { LedgerAccount } from "@/lib/accounts";
import { extractStatement } from "@/lib/krungthai-layout";
import { confirmSchema, type ConfirmImportBody, type ConfirmImportResult } from "@/lib/server/confirm-import";
import {
  inboxIdempotencyKey, processInboxStatement, type InboxStatementDeps
} from "@/lib/server/inbox-statement";
import type { StatementPdfPages, StatementPdfRead } from "@/lib/server/statement-pdf-node";
import { validStatement } from "./fixtures/krungthai-layout-v1";

const ACCOUNT_ID = "11111111-2222-4333-8444-555555555555";
const BYTES = new Uint8Array([1, 2, 3, 4, 5]);

function statement() {
  const result = extractStatement(validStatement);
  if (!result.ok) throw new Error(result.message);
  return result;
}

const account = (over: Partial<LedgerAccount> = {}): LedgerAccount => ({
  id: ACCOUNT_ID, bank_code: "KTB", label: "Invented savings", account_type: "savings",
  last_four: "7890", currency: "THB", timezone: "Asia/Bangkok", ...over
}) as LedgerAccount;

function deps(over: Partial<InboxStatementDeps> = {}): InboxStatementDeps & { confirmImport: ReturnType<typeof vi.fn> } {
  const { frame, rows } = statement();
  const base = {
    download: async () => ({ ok: true as const, bytes: BYTES }),
    readStatementPdf: async (): Promise<StatementPdfRead> => ({ kind: "read", frame, rows }),
    listAccounts: async () => [account()],
    readStatementPdfPages: async (): Promise<StatementPdfPages> => ({ kind: "pages", pages: validStatement }),
    sourceName: "statement_1234567890.pdf",
    artifactExists: async () => false,
    existingFingerprintCount: vi.fn<InboxStatementDeps["existingFingerprintCount"]>(async () => 0),
    confirmImport: vi.fn(async (): Promise<ConfirmImportResult> => ({
      kind: "ok", batchId: "b", payloadDigest: "d", fingerprints: [], warnings: []
    })),
    ...over
  };
  return base as InboxStatementDeps & { confirmImport: ReturnType<typeof vi.fn> };
}

describe("processInboxStatement", () => {
  it("reports a duplicate without reading or confirming", async () => {
    const d = deps({ artifactExists: async () => true });
    const read = vi.fn();
    const out = await processInboxStatement("import", { ...d, readStatementPdf: read });
    expect(out.kind).toBe("duplicate");
    expect(read).not.toHaveBeenCalled();
    expect(d.confirmImport).not.toHaveBeenCalled();
  });

  it("fails closed when the duplicate lookup is unknown", async () => {
    const d = deps({ artifactExists: async () => null });
    expect(await processInboxStatement("import", d)).toEqual({ kind: "failed", code: "LOOKUP_FAILED" });
    expect(d.confirmImport).not.toHaveBeenCalled();
  });

  it("passes a download failure through as a code", async () => {
    const d = deps({ download: async () => ({ ok: false as const, code: "TOO_LARGE" as const }) });
    expect(await processInboxStatement("import", d)).toEqual({ kind: "failed", code: "TOO_LARGE" });
  });

  it.each([["locked"], ["no-passwords"]] as const)("holds a %s file", async (kind) => {
    const d = deps({ readStatementPdf: async () => ({ kind }) });
    const out = await processInboxStatement("import", d);
    expect(out).toMatchObject({ kind: "held", reason: kind });
    expect(d.confirmImport).not.toHaveBeenCalled();
  });

  it("holds an unreadable file with the reader's code", async () => {
    const d = deps({ readStatementPdf: async () => ({ kind: "unreadable", code: "UNSUPPORTED_LAYOUT" }) });
    expect(await processInboxStatement("import", d)).toMatchObject({ kind: "held", reason: "unreadable", code: "UNSUPPORTED_LAYOUT" });
  });

  it("holds needs-account with only the bank code and last four", async () => {
    const d = deps({ listAccounts: async () => [account({ last_four: "0000" })] });
    const out = await processInboxStatement("import", d);
    expect(out).toMatchObject({ kind: "held", reason: "needs-account", bankCode: "KTB", lastFour: "7890" });
    expect(d.confirmImport).not.toHaveBeenCalled();
  });

  it("holds a statement the assembler refuses, by its code", async () => {
    const { frame, rows } = statement();
    const d = deps({ readStatementPdf: async () => ({ kind: "read", frame: { ...frame, crossChecked: false }, rows }) });
    expect(await processInboxStatement("import", d)).toMatchObject({ kind: "held", reason: "NOT_CROSS_CHECKED" });
    expect(d.confirmImport).not.toHaveBeenCalled();
  });

  it("holds a statement with a reconciliation warning", async () => {
    const { frame, rows } = statement();
    const day = rows[0]!.sourceDate;
    const chained = [rows[1]!, rows[2]!, rows[3]!, rows[0]!].map((row) => ({ ...row, sourceDate: day }));
    let running = BigInt(frame.openingBalance);
    const renumbered = chained.map((row) => {
      running += row.components.reduce((sum, item) => sum + BigInt(item.amount.minor), 0n);
      return { ...row, postBalance: { ...row.postBalance, minor: running.toString() as typeof row.postBalance.minor } };
    });
    const printed = [renumbered[3]!, renumbered[0]!, renumbered[1]!, renumbered[2]!];
    const reordered = { ...frame, closingBalance: running.toString() as typeof frame.closingBalance };
    const d = deps({ readStatementPdf: async () => ({ kind: "read", frame: reordered, rows: printed }) });
    expect(await processInboxStatement("import", d)).toMatchObject({ kind: "held", reason: "warnings" });
    expect(d.confirmImport).not.toHaveBeenCalled();
  });

  it("holds a statement some of whose rows are already stored, without confirming", async () => {
    const d = deps({ existingFingerprintCount: vi.fn(async () => 1) });
    const out = await processInboxStatement("import", d);
    expect(out).toMatchObject({ kind: "held", reason: "overlap" });
    expect(d.confirmImport).not.toHaveBeenCalled();
    const [accountId, fingerprints] = (d.existingFingerprintCount as ReturnType<typeof vi.fn>).mock.calls[0] as [string, string[]];
    expect(accountId).toBe(ACCOUNT_ID);
    expect(fingerprints).toHaveLength(4);
    for (const fingerprint of fingerprints) expect(fingerprint).toMatch(/^[a-f0-9]{64}$/u);
  });

  it("fails closed when the fingerprint lookup is unknown", async () => {
    const d = deps({ existingFingerprintCount: async () => null });
    expect(await processInboxStatement("import", d)).toEqual({ kind: "failed", code: "LOOKUP_FAILED" });
    expect(d.confirmImport).not.toHaveBeenCalled();
  });

  it("captures when no row is stored yet", async () => {
    const d = deps({ existingFingerprintCount: async () => 0 });
    expect(await processInboxStatement("import", d)).toMatchObject({ kind: "captured" });
    expect(d.confirmImport).toHaveBeenCalledTimes(1);
  });

  it("confirms a clean statement with a key derived from the artifact digest", async () => {
    const first = deps();
    const out = await processInboxStatement("import", first);
    expect(out).toMatchObject({ kind: "captured", accountLabel: "Invented savings", periodStart: "2026-01-01", periodEnd: "2026-01-31", rowCount: 4 });
    const second = deps();
    await processInboxStatement("import", second);
    const a = first.confirmImport.mock.calls[0]![0] as ConfirmImportBody;
    const b = second.confirmImport.mock.calls[0]![0] as ConfirmImportBody;
    expect(a.idempotencyKey).toBe(b.idempotencyKey);
    expect(a.idempotencyKey).toBe(await inboxIdempotencyKey(a.artifactDigest));
    expect(confirmSchema.safeParse(a).success).toBe(true);

    const other = deps({ download: async () => ({ ok: true as const, bytes: new Uint8Array([9, 9]) }) });
    await processInboxStatement("import", other);
    expect((other.confirmImport.mock.calls[0]![0] as ConfirmImportBody).idempotencyKey).not.toBe(a.idempotencyKey);
  });

  it.each([
    [{ kind: "conflict", message: "x" }],
    [{ kind: "error", message: "x" }],
    [{ kind: "refused", message: "x", details: { code: "X" } }]
  ] as const)("holds confirm-failed when the confirm answers %j", async (result) => {
    const d = deps({ confirmImport: vi.fn(async () => result as ConfirmImportResult) });
    expect(await processInboxStatement("import", d)).toMatchObject({ kind: "held", reason: "confirm-failed" });
  });

  it("read mode returns the statement and digest without confirming or checking duplicates", async () => {
    const exists = vi.fn(async () => true);
    const d = deps({ artifactExists: exists });
    const out = await processInboxStatement("read", d);
    expect(out.kind).toBe("read");
    if (out.kind === "read") {
      expect(out.artifactDigest).toMatch(/^[a-f0-9]{64}$/u);
      expect(out.rows).toHaveLength(4);
    }
    expect(exists).not.toHaveBeenCalled();
    expect(d.confirmImport).not.toHaveBeenCalled();
  });
});
