import type { StatementFrame } from "@/lib/statement-frame";
import { importPayloadSchema, type ImportPayload, type SourceRowCandidate } from "@/lib/statement";
import { reconcileRows } from "@/lib/reconcile";

// Turns an extracted statement into a confirmable ImportPayload.
//
// Binding is the one step the parser must not infer: which ledger account a
// statement belongs to is a user decision (docs/KRUNGTHAI_CONTRACT.md). This
// function takes that decision as input and then refuses to act on it blindly —
// the chosen account's last four digits and currency must match what was printed,
// so a mis-click cannot post one account's transactions into another's ledger.

export type BindingTarget = {
  accountId: string;
  bankCode: string;
  lastFour: string;
  currency: string;
};

export type AssemblyErrorCode =
  | "NOT_CROSS_CHECKED"
  | "ACCOUNT_MISMATCH"
  | "BANK_MISMATCH"
  | "CURRENCY_MISMATCH"
  | "BALANCE_RECONCILIATION_FAILED"
  | "INVALID_PAYLOAD";

export type AssemblyResult =
  | { ok: true; payload: ImportPayload }
  | { ok: false; code: AssemblyErrorCode; message: string; details?: unknown };

export function assembleImportPayload(
  frame: StatementFrame,
  rows: readonly SourceRowCandidate[],
  target: BindingTarget
): AssemblyResult {
  // Checked before anything about the binding, because it is a property of the statement
  // rather than of the account: if this fails, no account will do, and saying so first
  // stops the owner working through the chooser looking for one that fits.
  //
  // An import the bank's own arithmetic did not confirm is refused outright (D-043). The
  // reader still reads such a statement — that is a fact about the document, and the
  // diagnostics that fix a wording mismatch depend on the parse succeeding — but it may not
  // reach the ledger. What the balance chain cannot see is exactly what this catches, and
  // it differs per layout: Krungthai derives its opening from the first row (D-026), so a
  // dropped *first* row is invisible to reconciliation, and neither Krungthai nor SCB
  // prints a closing balance, so a dropped *last* row is invisible too. Rows are
  // append-only; there is no un-importing one.
  if (!frame.crossChecked) {
    return {
      ok: false,
      code: "NOT_CROSS_CHECKED",
      message:
        "This statement printed no summary block the reader could match, so its rows were never checked against " +
        "the bank's own counts and totals. It will not be imported."
    };
  }
  // Checked before the last four, because the last four alone no longer identifies an
  // account: three banks are supported and `public.accounts` is unique on
  // (owner_id, bank_code, last_four), so one owner can hold three accounts ending in the
  // same digits. `confirm_import` refuses the pair too, but a mismatch surfacing there
  // would arrive as a fingerprint error rather than as a mis-binding.
  if (target.bankCode !== frame.bankCode) {
    return {
      ok: false,
      code: "BANK_MISMATCH",
      message: "The selected account is not held at the bank that issued this statement."
    };
  }
  if (target.lastFour !== frame.accountLastFour) {
    return {
      ok: false,
      code: "ACCOUNT_MISMATCH",
      message: "The selected account does not match the account printed on this statement."
    };
  }
  if (target.currency !== frame.currency) {
    return {
      ok: false,
      code: "CURRENCY_MISMATCH",
      message: "The selected account is not held in the statement's currency."
    };
  }

  // Reconcile before assembling: an unexplained balance gap means the extracted
  // rows do not describe the printed statement, and must not be offered for
  // confirmation. The server checks this too; failing here keeps the blockers
  // visible next to the rows that caused them.
  const reconciliation = reconcileRows(frame.openingBalance, rows);
  if (reconciliation.blockers.length > 0) {
    return {
      ok: false,
      code: "BALANCE_RECONCILIATION_FAILED",
      message: "Unexplained balance gaps block confirmation.",
      details: reconciliation.blockers
    };
  }

  const candidate = {
    // From the frame, not hard-coded: three layouts reach this function now, and the
    // schema pins the contract version to the bank code so a mismatch cannot pass.
    contractVersion: frame.contractVersion,
    fingerprintVersion: "fingerprint-v1",
    accountId: target.accountId,
    bankCode: frame.bankCode,
    currency: frame.currency,
    periodStart: frame.periodStart,
    periodEnd: frame.periodEnd,
    openingBalance: { minor: frame.openingBalance, currency: frame.currency },
    closingBalance: { minor: frame.closingBalance, currency: frame.currency },
    rows
  };

  // The schema is the authority on what may be confirmed, including the source-text
  // charset that keeps row fingerprints reproducible in PostgreSQL.
  const parsed = importPayloadSchema.safeParse(candidate);
  if (!parsed.success) {
    return {
      ok: false,
      code: "INVALID_PAYLOAD",
      message: "The extracted statement does not satisfy the import contract.",
      details: parsed.error.flatten()
    };
  }

  return { ok: true, payload: parsed.data };
}
