"use client";

import { Fragment } from "react";
import { formatThb } from "@/lib/money";
import { type ReconciledRow } from "@/lib/slip-reconcile";
import { type CashCorrection, type CashEntry } from "@/lib/cash";
import { CorrectionForm } from "@/app/correction-form";
import { formatDate, type LedgerLayout, type LedgerModes } from "@/app/ledger-shared";

/**
 * A cash payment's row in the ledger (migration 013).
 *
 * The one record with no bank behind it, which is why it prints a dash in both balance columns
 * rather than a figure: cash is in no statement's balance chain at all, so unlike a slip there is
 * not even a later statement that could supply one.
 *
 * Split out of `app/transactions-view.tsx` with no change to what it renders.
 */
export function LedgerCashRow({
  row,
  layout,
  modes,
  original,
  correction,
  onToggleCorrecting,
  onCorrectionSaved,
  onCancelCorrection
}: {
  row: Extract<ReconciledRow, { kind: "cash" }>;
  layout: LedgerLayout;
  modes: LedgerModes;
  /**
   * The entry **as first typed**, which is what a correction is measured against and what the
   * form edits. Absent only if the reconciled row outran the list it came from, in which case
   * the Correct control is not offered rather than offered against nothing.
   */
  original: CashEntry | undefined;
  /** The correction in force, or null. Its presence is what "Corrected by you" reports. */
  correction: CashCorrection | null;
  onToggleCorrecting: (entryId: string) => void;
  onCorrectionSaved: (entryId: string, saved: unknown) => void;
  onCancelCorrection: () => void;
}) {
  const entry = row.entry;
  const amount = BigInt(entry.amount_minor);
  const { showCombined, columns } = layout;

  return (
    <Fragment>
      {/* Marked in the row itself for the reason a slip is: the difference
          between a bank's record and one the owner typed is the most important
          thing this table says, and it has to survive a screenshot and a
          screen reader rather than living in a colour. */}
      <tr className="cash-row">
        <td data-label="Date">
          <time dateTime={entry.occurred_on}>{formatDate(entry.occurred_on)}</time>
          <small>{entry.occurred_at_time ?? "—"}</small>
        </td>
        <td data-label="Description">
          <strong>Cash</strong>
          <span>{entry.counterparty ?? "No counterparty recorded"}</span>
          {entry.note ? <em>{entry.note}</em> : null}
        </td>
        <td data-label="Status">
          <em className="status-chip cash">Cash · no statement</em>
          {/* Said in words rather than implied by the chip. A corrected figure
              and an uncorrected one look identical on the row, and which one
              is on screen is exactly what the owner needs to know. */}
          {correction !== null ? <small className="decision-mark">Corrected by you</small> : null}
          {/* The only way to change a cash entry, because the row itself
              cannot be changed: `cash_entries_immutable` refuses an update
              outright, so this writes an overlay beside it and keeps both. */}
          {original ? (
            <div className="match-control">
              <button
                type="button"
                className="secondary-button"
                aria-expanded={modes.correcting === entry.id}
                aria-label={`Correct the cash entry dated ${formatDate(entry.occurred_on)}`}
                disabled={modes.correcting !== null && modes.correcting !== entry.id}
                onClick={() => onToggleCorrecting(entry.id)}
              >
                {modes.correcting === entry.id ? "Stop correcting" : "Correct"}
              </button>
            </div>
          ) : null}
        </td>
        <td data-label={showCombined ? "Account" : "Reference"}>
          <span>No account · cash</span>
        </td>
        <td data-label="Movement" className={`numeric ${amount > 0n ? "positive" : ""}`}>
          {amount > 0n ? "+" : ""}{formatThb(entry.amount_minor)}
        </td>
        {/* No balance, in either column, and for a stronger reason than a
            slip's: cash is in no bank's balance chain at all, so there is not
            even a later statement that could supply one. */}
        <td data-label={showCombined ? "Account balance" : "Balance"} className="numeric">
          <span aria-label="No balance: cash is in no statement's balance chain">—</span>
        </td>
        {showCombined ? <td data-label="All accounts" className="numeric combined-balance">—</td> : null}
      </tr>
      {original && modes.correcting === entry.id ? (
        <tr className="correction-row">
          <td colSpan={columns}>
            <CorrectionForm
              base={original}
              overlay={correction}
              endpoint={`/api/v1/cash/${entry.id}/correction`}
              title="Correct this cash entry"
              onSaved={(saved) => onCorrectionSaved(entry.id, saved)}
              onCancel={onCancelCorrection}
            />
          </td>
        </tr>
      ) : null}
    </Fragment>
  );
}
