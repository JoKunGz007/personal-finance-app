"use client";

import { Fragment } from "react";
import { formatThb } from "@/lib/money";
import { type ReconciledRow } from "@/lib/slip-reconcile";
import { type CapturedSlip, type SlipCorrection } from "@/lib/slips";
import { type Category } from "@/lib/categories";
import { CorrectionForm } from "@/app/correction-form";
import { formatDate, formatDateParts, formatTime, splitFigures, type LedgerActions, type LedgerLayout, type LedgerModes } from "@/app/ledger-shared";

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
  categories,
  actions
}: {
  row: Extract<ReconciledRow, { kind: "provisional" }>;
  layout: LedgerLayout;
  modes: LedgerModes;
  /** Passed to the correction form, which no longer fetches a list of its own. */
  categories: readonly Category[];
  /** The slip **as first typed**, which is what the correction form edits. */
  original: CapturedSlip | undefined;
  /** The correction in force, or null. Its presence is what "Corrected by you" reports. */
  correction: SlipCorrection | null;
  actions: LedgerActions;
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
          <time dateTime={slip.occurred_on}>
            {formatDateParts(slip.occurred_on).map((part, index) =>
              part.numeric ? <span key={index} className="figure">{part.value}</span> : part.value
            )}
          </time>
          <small>{slip.occurred_at_time ? <span className="figure">{formatTime(slip.occurred_at_time)}</span> : "—"}</small>
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
          {/* No count and no "nothing to match" here: the chooser's rows are fetched
              when the button is pressed (D-158), and the banner reports how many
              there are, or that there are none, once they arrive. */}
          <div className="match-control">
            <button
              type="button"
              className="secondary-button"
              aria-label={`Choose a statement row for the slip dated ${formatDate(slip.occurred_on)}`}
              disabled={modes.deciding !== null || modes.matching !== null}
              onClick={() => actions.chooseRowForSlip(slip.id)}
            >
              Choose a statement row
            </button>
          </div>
          {/* Offered beside the chooser on purpose: a mistyped amount is the
              likeliest reason a slip has no candidate, and correcting it is
              the fix. What the QR carried — the bank and
              the reference — is not correctable and is not in the form. */}
          {original ? (
            <div className="match-control">
              <button
                type="button"
                className="secondary-button"
                aria-expanded={modes.correcting === slip.id}
                aria-label={`Correct what you typed for the slip dated ${formatDate(slip.occurred_on)}`}
                disabled={modes.picking || (modes.correcting !== null && modes.correcting !== slip.id)}
                onClick={() => actions.toggleCorrecting(slip.id)}
              >
                {modes.correcting === slip.id ? "Stop correcting" : "Correct what you typed"}
              </button>
            </div>
          ) : null}
        </td>
        <td data-label={showCombined ? "Account" : "Reference"}>
          {showCombined
            ? (row.account
                ? <span className="mono">{row.account.label} <span className="nowrap">···· <span className="figure">{row.account.last_four}</span></span></span>
                : <span className="mono">{slip.bank_code} · account unknown</span>)
            : <span className="mono">
                {splitFigures(slip.slip_reference).map((part, index) =>
                  part.numeric ? <span key={index} className="figure">{part.value}</span> : part.value
                )}
              </span>}
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
              categories={categories}
              onSaved={(saved) => actions.storeSlipCorrection(slip.id, saved)}
              onCancel={actions.stopCorrecting}
            />
          </td>
        </tr>
      ) : null}
    </Fragment>
  );
}
