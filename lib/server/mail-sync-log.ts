// One value-free log line for a failed mailbox Sync request (PLAN Open item 9).
//
// Without it a failed Sync left nothing to diagnose from: the routes answer in fixed sentences and
// logged nothing. **Only fixed words and a sanitised error code are logged.** An IMAP error's message can
// quote the server's reply, which can contain the account address, so the message is never logged, nor
// is any address, subject, uid, file name or mail content.

/** `error.code` or `error.name` when it is a short plain token; otherwise null. */
export function safeErrorCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null;
  const { code, name } = error as { code?: unknown; name?: unknown };
  const candidate = code ?? name;
  return typeof candidate === "string" && candidate.length <= 40 && /^[A-Za-z0-9_.-]+$/u.test(candidate)
    ? candidate
    : null;
}

export type MailSyncStage = "config" | "open" | "read" | "store" | "unexpected";

export function logMailSyncFailure(route: string, stage: MailSyncStage, status: number, error?: unknown): void {
  console.error("mail sync failed", { route, stage, status, code: safeErrorCode(error) });
}

/** One step of a mailbox route and how long it took: a fixed step name and milliseconds, nothing else. */
export function logMailSyncStep(route: string, step: string, ms: number): void {
  console.info("mail sync step", { route, step, ms });
}
