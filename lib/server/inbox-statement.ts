import type { LedgerAccount } from "@/lib/accounts";
import { rowFingerprint, sha256Hex, sha256HexBytes } from "@/lib/canonical";
import { maskName, renderMaskedDump } from "@/lib/masked-diagnostics";
import { assembleImportPayload, type AssemblyErrorCode } from "@/lib/import-assembly";
import type { SourceRowCandidate } from "@/lib/statement";
import type { StatementFrame } from "@/lib/statement-frame";
import { soleMatchingAccount } from "@/lib/statement-binding";
import type { ConfirmImportBody, ConfirmImportResult } from "@/lib/server/confirm-import";
import type { InboxDownload } from "@/lib/server/inbox-object";
import type { StatementPdfPages, StatementPdfRead } from "@/lib/server/statement-pdf-node";

// Reads one statement the owner dropped into the Inbox and, when it is clean, imports it (D-235).
// A clean statement is bound to exactly one account, passes every refusal and carries no
// reconciliation warning; anything else is **held** for the owner's review. Dependencies are
// injected so the decision is testable without pdf.js, Storage or a database.

export type InboxStatementDeps = {
  download: () => Promise<InboxDownload>;
  readStatementPdf: (bytes: Uint8Array) => Promise<StatementPdfRead>;
  /** The text layer for the masked dump (`dump` mode only). */
  readStatementPdfPages: (bytes: Uint8Array) => Promise<StatementPdfPages>;
  /** The file's own name; it only ever reaches a dump masked. */
  sourceName: string;
  listAccounts: () => Promise<readonly LedgerAccount[] | null>;
  /** True when an import artifact with this digest already exists for the owner; null when unknown. */
  artifactExists: (artifactDigest: string) => Promise<boolean | null>;
  /** How many of these row fingerprints the owner already has stored for the account; null when unknown. */
  existingFingerprintCount: (accountId: string, fingerprints: string[]) => Promise<number | null>;
  confirmImport: (body: ConfirmImportBody) => Promise<ConfirmImportResult>;
};

export type HeldReason =
  | "locked" | "no-passwords" | "unreadable" | "needs-account" | "warnings" | "overlap" | "confirm-failed"
  | AssemblyErrorCode;

export type InboxStatementOutcome =
  | { kind: "duplicate"; artifactDigest: string }
  | { kind: "captured"; artifactDigest: string; accountLabel: string; periodStart: string; periodEnd: string; rowCount: number }
  | {
      kind: "held"; reason: HeldReason; artifactDigest: string;
      /** The reader's own code when `reason` is `unreadable`. */
      code?: string;
      /** For `needs-account` only: what the statement printed. */
      bankCode?: string; lastFour?: string;
    }
  | { kind: "dump"; markdown: string }
  | { kind: "read"; artifactDigest: string; frame: StatementFrame; rows: SourceRowCandidate[] }
  | { kind: "failed"; code: "NOT_FOUND" | "TOO_LARGE" | "ACCOUNTS_UNAVAILABLE" | "LOOKUP_FAILED" };

/**
 * A uuid derived from the artifact digest: version-4-shaped bits over sha256("inbox-statement:" +
 * digest). The same file always yields the same key, so a retry is the same confirm request.
 */
export async function inboxIdempotencyKey(artifactDigest: string): Promise<string> {
  const hex = await sha256Hex(`inbox-statement:${artifactDigest}`);
  const variant = ((parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export async function processInboxStatement(
  mode: "import" | "read" | "dump",
  deps: InboxStatementDeps
): Promise<InboxStatementOutcome> {
  const downloaded = await deps.download();
  if (!downloaded.ok) return { kind: "failed", code: downloaded.code };
  const { bytes } = downloaded;
  const artifactDigest = await sha256HexBytes(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);

  if (mode === "dump") {
    // A structural dump only: no duplicate lookup, no account, no confirm, nothing written anywhere.
    const opened = await deps.readStatementPdfPages(bytes);
    if (opened.kind === "locked" || opened.kind === "no-passwords") return { kind: "held", reason: opened.kind, artifactDigest };
    if (opened.kind === "unreadable") return { kind: "held", reason: "unreadable", code: opened.code, artifactDigest };
    return {
      kind: "dump",
      markdown: renderMaskedDump({ label: "server", sourceName: maskName(deps.sourceName), pageCount: opened.pages.length, pages: opened.pages, shapesOnly: true })
    };
  }

  if (mode === "import") {
    const exists = await deps.artifactExists(artifactDigest);
    if (exists === null) return { kind: "failed", code: "LOOKUP_FAILED" };
    if (exists) return { kind: "duplicate", artifactDigest };
  }

  const read = await deps.readStatementPdf(bytes);
  if (read.kind === "locked" || read.kind === "no-passwords") return { kind: "held", reason: read.kind, artifactDigest };
  if (read.kind === "unreadable") return { kind: "held", reason: "unreadable", code: read.code, artifactDigest };
  if (mode === "read") return { kind: "read", artifactDigest, frame: read.frame, rows: read.rows };

  const accounts = await deps.listAccounts();
  if (accounts === null) return { kind: "failed", code: "ACCOUNTS_UNAVAILABLE" };
  const account = soleMatchingAccount(read.frame, accounts);
  if (!account) {
    return { kind: "held", reason: "needs-account", artifactDigest, bankCode: read.frame.bankCode, lastFour: read.frame.accountLastFour };
  }

  const assembled = assembleImportPayload(read.frame, read.rows, {
    accountId: account.id,
    bankCode: account.bank_code,
    lastFour: account.last_four,
    currency: account.currency
  });
  if (!assembled.ok) return { kind: "held", reason: assembled.code, artifactDigest };
  if (assembled.warnings.length > 0) return { kind: "held", reason: "warnings", artifactDigest };

  // `confirm_import` silently skips a row whose fingerprint is already stored, so a statement that
  // overlaps one already imported would "succeed" while saving only part of it. Held for a look instead.
  const { payload } = assembled;
  const fingerprints = await Promise.all(payload.rows.map((row) => rowFingerprint(payload.accountId, payload.bankCode, row)));
  const existing = await deps.existingFingerprintCount(payload.accountId, fingerprints);
  if (existing === null) return { kind: "failed", code: "LOOKUP_FAILED" };
  if (existing > 0) return { kind: "held", reason: "overlap", artifactDigest };

  const confirmed = await deps.confirmImport({
    idempotencyKey: await inboxIdempotencyKey(artifactDigest),
    artifactDigest,
    payload: assembled.payload
  });
  if (confirmed.kind !== "ok") return { kind: "held", reason: "confirm-failed", artifactDigest };
  return {
    kind: "captured",
    artifactDigest,
    accountLabel: account.label,
    periodStart: assembled.payload.periodStart,
    periodEnd: assembled.payload.periodEnd,
    rowCount: assembled.payload.rows.length
  };
}
