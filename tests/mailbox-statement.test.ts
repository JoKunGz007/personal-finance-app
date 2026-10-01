import { describe, expect, it, vi } from "vitest";
import type { LedgerAccount } from "@/lib/accounts";
import { extractStatement } from "@/lib/krungthai-layout";
import type { ConfirmImportResult } from "@/lib/server/confirm-import";
import { processMailboxStatement, type MailboxStatementDeps } from "@/lib/server/mailbox-statement";
import type { StatementPdfRead } from "@/lib/server/statement-pdf-node";
import { validStatement } from "./fixtures/krungthai-layout-v1";

const ACCOUNT_ID = "11111111-2222-4333-8444-555555555555";

function deps(over: Partial<MailboxStatementDeps> = {}) {
  const result = extractStatement(validStatement);
  if (!result.ok) throw new Error(result.message);
  const markFetched = vi.fn(async () => true);
  const base: MailboxStatementDeps = {
    download: async () => ({ ok: true, bytes: new Uint8Array([1, 2, 3]) }),
    readStatementPdf: async (): Promise<StatementPdfRead> => ({ kind: "read", frame: result.frame, rows: result.rows }),
    listAccounts: async () => [{
      id: ACCOUNT_ID, bank_code: "KTB", label: "Invented savings", account_type: "savings",
      last_four: "7890", currency: "THB", timezone: "Asia/Bangkok"
    } as LedgerAccount],
    artifactExists: async () => false,
    confirmImport: async (): Promise<ConfirmImportResult> => ({ kind: "ok", batchId: "b", payloadDigest: "d", fingerprints: [], warnings: [] }),
    markFetched,
    ...over
  };
  return { base, markFetched };
}

describe("processMailboxStatement", () => {
  it("flags the message after a capture", async () => {
    const { base, markFetched } = deps();
    const out = await processMailboxStatement("import", base);
    expect(out.kind).toBe("captured");
    expect(out.flagged).toBe(true);
    expect(markFetched).toHaveBeenCalledTimes(1);
  });

  it("flags the message when the artifact is already in the ledger", async () => {
    const { base, markFetched } = deps({ artifactExists: async () => true });
    expect((await processMailboxStatement("import", base)).kind).toBe("duplicate");
    expect(markFetched).toHaveBeenCalledTimes(1);
  });

  it("reports an unrecorded flag without failing the import", async () => {
    const { base } = deps({ markFetched: async () => false });
    expect(await processMailboxStatement("import", base)).toMatchObject({ kind: "captured", flagged: false });
  });

  it("leaves a held statement unflagged", async () => {
    const { base, markFetched } = deps({ readStatementPdf: async () => ({ kind: "locked" }) as StatementPdfRead });
    expect(await processMailboxStatement("import", base)).toMatchObject({ kind: "held", reason: "locked" });
    expect(markFetched).not.toHaveBeenCalled();
  });

  it("leaves a failed fetch unflagged", async () => {
    const { base, markFetched } = deps({ download: async () => ({ ok: false, code: "NOT_FOUND" }) });
    expect(await processMailboxStatement("import", base)).toEqual({ kind: "failed", code: "NOT_FOUND" });
    expect(markFetched).not.toHaveBeenCalled();
  });

  it("never flags in read mode, and confirms nothing", async () => {
    const confirmImport = vi.fn();
    const { base, markFetched } = deps({ confirmImport });
    expect((await processMailboxStatement("read", base)).kind).toBe("read");
    expect(markFetched).not.toHaveBeenCalled();
    expect(confirmImport).not.toHaveBeenCalled();
  });
});
