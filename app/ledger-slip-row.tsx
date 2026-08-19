"use client";

import { Fragment } from "react";
import { formatThb } from "@/lib/money";
import { type AccountTransaction } from "@/lib/transactions";
import { type ReconciledRow } from "@/lib/slip-reconcile";
import { type CapturedSlip, type SlipCorrection } from "@/lib/slips";
import { CorrectionForm } from "@/app/correction-form";
import { formatDate, type LedgerLayout, type LedgerModes } from "@/app/ledger-shared";

/**
 * A captured slip that has not collapsed onto a statement row.
 *
 * It prints a dash for the balance in both columns: a printed balance is the bank's statement of
 * the account after a row, and a slip is not in that chain — writing a derived figure here would
 * invent one.
 *
 * Split out of `app/transactions-view.tsx` with no change to what it renders.
 */
export function LedgerSlipRow({
  row,
  layout,
  modes,
  original,
  correction,
  candidates,
  onChooseRow,
  onToggleCorrecting,
  onCorrectionSaved,
  onCancelCorrection
}: {
  row: Extract<ReconciledRow, { kind: "provisional" }>;
  layout: LedgerLayout;
  modes: LedgerModes;
  /** The slip **as first typed**, which is what the correction form edits. */
  original: CapturedSlip | undefined;
  /** The correction in force, or null. Its presence is what "Corrected by you" reports. */
  correction: SlipCorrection | null;
  /** The statement rows this slip may be paired with by hand. Empty means there is nothing to offer. */
  candidates: readonly AccountTransaction[];
  onChooseRow: (slipId: string) => void;
  onToggleCorrecting: (slipId: string) => void;
  onCorrectionSaved: (slipId: string, saved: unknown) => void;
  onCancelCorrection: () => void;
}) {
  const slip = row.slip;
  const amount = BigInt(slip.amount_minor);
  const { showCombined, columns } = layout;

  return (
    <Fragment>
      {/* Marked in the row itself, not only by colour: the difference between
          a bank's record and one the owner typed is the most important thing
          this table says, and it has to survive a screenshot, a print and a
          screen reader. */}
      <tr className="provisional-row">
        <td data-label="Date">
          <time dateTime={slip.occurred_on}>{formatDate(slip.occurred_on)}</time>
          <small>{slip.occurred_at_time ?? "—"}</small>
        </td>
        <td data-label="Description">
          <strong>Slip · {slip.bank_code}</strong>
          <span>{slip.counterparty ?? "No counterparty recorded"}</span>
        </td>
        <td data-label="Status">
          {row.status === "needs-review" ? (
            <em className="status-chip needs-review">Needs review · several rows match</em>
          ) : (
            <em className="status-chip awaiting">Awaiting statement</em>
          )}
          {/* Said in words, because "awaiting a statement" and "you decided
              this is on no statement" look identical otherwise, and the
              second is a decision the owner may want to take back. */}
          {row.ownerDecided ? <small className="decision-mark">Your decision · on no statement row</small> : null}
          {/* A corrected slip matches on the figure in force, so the amount in
              this row is not necessarily the one captured. Saying so is what
              keeps "no row carries this exact amount" checkable. */}
          {correction !== null ? <small className="decision-mark">Corrected by you</small> : null}
          {/* Not a dropdown (D-069). Candidate rows share a bank, an amount
              and usually a date and a wording, so an option label repeating
              the first two of those cannot tell them apart — the printed time
              and the running balance can, and both live in the table. The
              button asks the table to show only this slip and its candidates
              instead of describing them here. */}
          {candidates.length > 0 ? (
            <div className="match-control">
              <button
                type="button"
                className="secondary-button"
                aria-label={`Choose a statement row for the slip dated ${formatDate(slip.occurred_on)}`}
                disabled={modes.deciding !== null || modes.matching !== null}
                onClick={() => onChooseRow(slip.id)}
              >
                Choose a statement row
              </button>
              <small>{candidates.length} row{candidates.length === 1 ? "" : "s"} could be this payment</small>
            </div>
          ) : (
            <small className="decision-mark">
              No {slip.bank_code} row carries this exact amount, so there is nothing to match it to.
            </small>
          )}
          {/* Offered beside "nothing matches this amount" on purpose: a
              mistyped amount is the likeliest reason a slip has no candidate,
              and correcting it is the fix. What the QR carried — the bank and
              the reference — is not correctable and is not in the form. */}
          {original ? (
            <div className="match-control">
              <button
                type="button"
                className="secondary-button"
                aria-expanded={modes.correcting === slip.id}
                aria-label={`Correct what you typed for the slip dated ${formatDate(slip.occurred_on)}`}
                disabled={modes.picking || (modes.correcting !== null && modes.correcting !== slip.id)}
                onClick={() => onToggleCorrecting(slip.id)}
              >
                {modes.correcting === slip.id ? "Stop correcting" : "Correct what you typed"}
              </button>
            </div>
          ) : null}
        </td>
        <td data-label={showCombined ? "Account" : "Reference"}>
          {showCombined
            ? <span>{row.account ? `${row.account.label} ···· ${row.account.last_four}` : `${slip.bank_code} · account unknown`}</span>
            : <span className="mono">{slip.slip_reference}</span>}
        </td>
        <td data-label="Movement" className={`numeric ${amount > 0n ? "positive" : ""}`}>
          {amount > 0n ? "+" : ""}{formatThb(slip.amount_minor)}
        </td>
        {/* No balance, in either column. A printed balance is the bank's
            statement of the account after a row, and a slip is not in that
            chain — writing a derived figure here would invent one. */}
        <td data-label={showCombined ? "Account balance" : "Balance"} className="numeric">
          <span aria-label="No balance: a slip is not in the statement's balance chain">—</span>
        </td>
        {showCombined ? <td data-label="All accounts" className="numeric combined-balance">—</td> : null}
      </tr>
      {original && modes.correcting === slip.id ? (
        <tr className="correction-row">
          <td colSpan={columns}>
            <CorrectionForm
              base={original}
              overlay={correction}
              endpoint={`/api/v1/slips/${slip.id}/correction`}
              title={`Correct what you typed for this ${slip.bank_code} slip`}
              onSaved={(saved) => onCorrectionSaved(slip.id, saved)}
              onCancel={onCancelCorrection}
            />
          </td>
        </tr>
      ) : null}
    </Fragment>
  );
}
