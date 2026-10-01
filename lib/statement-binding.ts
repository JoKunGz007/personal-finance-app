import type { LedgerAccount } from "@/lib/accounts";
import type { StatementFrame } from "@/lib/statement-frame";

/**
 * The one account a statement can belong to, or null.
 *
 * **Exact, and unique by construction.** `public.accounts` is unique on
 * `(owner_id, bank_code, last_four)`, so a bank code and four printed digits identify at most one
 * account — this is a lookup on a compound key, not a guess. It still returns null rather than a
 * best effort when the match is not exactly one, which is the case the chooser exists for.
 *
 * Currency is deliberately **not** matched here. `assembleImportPayload` checks it and refuses
 * with its own message; filtering on it would turn a statement in the wrong currency into
 * "no account found", which sends the owner to create an account that already exists.
 */
export function soleMatchingAccount(
  frame: Pick<StatementFrame, "bankCode" | "accountLastFour">,
  accounts: readonly LedgerAccount[] | null | undefined
): LedgerAccount | null {
  const matches = (accounts ?? []).filter(
    (item) => item.bank_code === frame.bankCode && item.last_four === frame.accountLastFour
  );
  return matches.length === 1 ? matches[0]! : null;
}
