import { processInboxStatement, type InboxStatementDeps, type InboxStatementOutcome } from "@/lib/server/inbox-statement";

// A statement that arrived by mail, opened by the same server core as an Inbox drop (D-237). The
// mailbox half (verify the part, fetch the bytes, flag the message) is injected, so the rule that
// matters is testable without IMAP: **the message is flagged fetched only after the outcome says the
// statement is in the ledger** (captured, or already there), or the statement is empty (no
// transactions and zero totals: there is nothing to import, ever), and only in import mode. A held or
// failed statement stays unflagged and is offered again.

export type MailboxStatementDeps = InboxStatementDeps & {
  /** Flags the message part fetched; resolves whether the mailbox recorded it. Never throws. */
  markFetched: () => Promise<boolean>;
};

export type MailboxStatementOutcome = InboxStatementOutcome & {
  /** Whether the mailbox recorded the fetched flag; false when it was refused or not due. */
  flagged?: boolean;
};

export async function processMailboxStatement(
  mode: "import" | "read" | "dump",
  deps: MailboxStatementDeps
): Promise<MailboxStatementOutcome> {
  // Not a spread: `sourceName` is a getter that only has its value once the download has run.
  const outcome = await processInboxStatement(mode, deps);
  if (mode === "import" && (outcome.kind === "captured" || outcome.kind === "duplicate" || outcome.kind === "empty")) {
    return { ...outcome, flagged: await deps.markFetched() };
  }
  return outcome;
}
