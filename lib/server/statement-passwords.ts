// The stored statement passwords: server-only Vercel env vars the owner sets himself.
//
// This is the ONLY module that reads them, at call time (never at import), and it never logs.
// `KBANK` and `SCB` share one password, so one variable covers both. Only
// `lib/server/statement-pdf-node.ts` may import this file; tests/privacy.test.ts enforces both.

/** The non-empty, de-duplicated stored passwords, in a stable order. Empty when none are set. */
export function storedStatementPasswords(): string[] {
  const candidates = [process.env.STATEMENT_PASSWORD_KTB, process.env.STATEMENT_PASSWORD_KBANK_SCB];
  const out: string[] = [];
  for (const value of candidates) {
    if (typeof value === "string" && value !== "" && !out.includes(value)) out.push(value);
  }
  return out;
}
