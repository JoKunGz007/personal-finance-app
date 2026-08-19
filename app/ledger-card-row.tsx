"use client";

import { Fragment } from "react";
import { formatThb } from "@/lib/money";
import { type AccountTransaction } from "@/lib/transactions";
import { type ReconciledRow } from "@/lib/slip-reconcile";
import { type CardReviewReason } from "@/lib/notification-card-reconcile";
import { type NotificationCard, type NotificationCardCorrection } from "@/lib/notification-cards";
import { CorrectionForm } from "@/app/correction-form";
import { formatDate, type LedgerLayout, type LedgerModes } from "@/app/ledger-shared";

/**
 * A captured notification card that has not collapsed onto a statement row (migration 016).
 *
 * The one captured record that prints a **balance**, which is why it is the only kind that can be
 * in `balance-conflict`: it carries a figure that can contradict the statement row it otherwise
 * fits. That balance is shown in the balance column where a slip and a cash entry both print a
 * dash, labelled as printed rather than derived.
 *
 * Split out of `app/transactions-view.tsx` with no change to what it renders.
 */
export function LedgerCardRow({
  row,
  layout,
  modes,
  original,
  correction,
  candidates,
  fittingRows,
  reviewReason,
  onChooseRow,
  onNotAPayment,
  onToggleCorrecting,
  onCorrectionSaved,
  onCancelCorrection
}: {
  row: Extract<ReconciledRow, { kind: "card" }>;
  layout: LedgerLayout;
  modes: LedgerModes;
  /** The card **as first typed**, which is what the correction form edits. */
  original: NotificationCard | undefined;
  /** The correction in force, or null. Its presence is what "Corrected by you" reports. */
  correction: NotificationCardCorrection | null;
  /** The statement rows this card may be paired with by hand. */
  candidates: readonly AccountTransaction[];
  /**
   * How many statement rows fitted on account, amount and date while every one printed a
   * different balance. Only meaningful when the status is `balance-conflict`.
   */
  fittingRows: number;
  /** Why the surviving candidates were not unique on both sides. Only set when `needs-review`. */
  reviewReason: CardReviewReason | undefined;
  onChooseRow: (cardId: string) => void;
  onNotAPayment: (cardId: string) => void;
  onToggleCorrecting: (cardId: string) => void;
  onCorrectionSaved: (cardId: string, saved: unknown) => void;
  onCancelCorrection: () => void;
}) {
  const card = row.card;
  const amount = BigInt(card.amount_minor);
  const { showCombined, columns } = layout;

  return (
    <Fragment>
      {/* Marked in the row itself for the reason a slip and a cash entry are:
          the difference between a record the bank has confirmed on a statement
          and one it has only pushed to a phone is the most important thing this
          table says, and it has to survive a screenshot and a screen reader
          rather than living in a colour. */}
      <tr className="card-row">
        <td data-label="Date">
          <time dateTime={card.occurred_on}>{formatDate(card.occurred_on)}</time>
          <small>{card.occurred_at_time}</small>
        </td>
        <td data-label="Description">
          <strong>Card · {card.channel}</strong>
          <span>{card.counterparty ?? "No counterparty recorded"}</span>
          {card.note ? <em>{card.note}</em> : null}
        </td>
        <td data-label="Status">
          {row.status === "balance-conflict" ? (
            <em className="status-chip needs-review">Balance disagrees</em>
          ) : row.status === "needs-review" ? (
            <em className="status-chip needs-review">Needs review</em>
          ) : (
            <em className="status-chip awaiting">Awaiting statement</em>
          )}
          {/* Each state says what was found and what would change it, because
              all three look identical as a chip and only one of them is
              waiting for something. */}
          {row.status === "balance-conflict" ? (
            <small className="decision-mark warn">
              {fittingRows} statement row{fittingRows === 1 ? "" : "s"} on this account
              carr{fittingRows === 1 ? "ies" : "y"} this exact amount within a day, and none
              printed this balance. Not paired, on purpose — check the balance you typed
              against the card before trusting either figure.
            </small>
          ) : row.status === "needs-review" ? (
            <small className="decision-mark warn">
              {reviewReason === "several-cards"
                ? "Another captured card resolves to the same statement row. They differ only in the time printed on them, so one of the two times is likely mistyped."
                : "Two statement rows on this account carry both this amount and this balance, which a sound balance chain should not contain. Check the import rather than the card."}
            </small>
          ) : (
            <small className="decision-mark">
              No row on this account carries this amount within a day of it yet. Import the
              statement covering this date and it will pair itself.
            </small>
          )}
          {row.ownerDecided ? (
            <small className="decision-mark">Your decision · on no statement row</small>
          ) : null}
          {correction !== null ? (
            <small className="decision-mark">Corrected by you</small>
          ) : null}
          {/* Not a dropdown, for D-069's reason: candidate rows share an account
              and an amount, and only the printed time and the running balance
              tell them apart. The chooser puts them in the table where both
              live, with the balance-agreeing one first. */}
          {candidates.length > 0 ? (
            <div className="match-control">
              <button
                type="button"
                className="secondary-button"
                aria-label={`Choose a statement row for the card dated ${formatDate(card.occurred_on)}`}
                disabled={modes.decidingCard !== null || modes.matchingCard !== null || modes.matching !== null}
                onClick={() => onChooseRow(card.id)}
              >
                Choose a statement row
              </button>
              <small>
                {candidates.length} row
                {candidates.length === 1 ? "" : "s"} could be this payment
              </small>
            </div>
          ) : null}
          {/* The remedy for a card that should never have been captured — a
              wrong account binding or a second capture. The binding cannot be
              re-made and the row cannot be deleted, so retiring is what a wrong
              card gets (D-103). Reversible: retired cards stay listed below. */}
          <div className="match-control">
            <button
              type="button"
              className="secondary-button"
              aria-label={`Not a payment — retire the card dated ${formatDate(card.occurred_on)} and take it out of the ledger`}
              disabled={modes.decidingCard !== null || modes.pickingCard}
              onClick={() => onNotAPayment(card.id)}
            >
              {modes.decidingCard === card.id ? "Saving…" : "Not a payment"}
            </button>
          </div>
          {original ? (
            <div className="match-control">
              <button
                type="button"
                className="secondary-button"
                aria-expanded={modes.correcting === card.id}
                aria-label={`Correct what you typed for the card dated ${formatDate(card.occurred_on)}`}
                disabled={modes.pickingCard || modes.picking || (modes.correcting !== null && modes.correcting !== card.id)}
                onClick={() => onToggleCorrecting(card.id)}
              >
                {modes.correcting === card.id ? "Stop correcting" : "Correct what you typed"}
              </button>
            </div>
          ) : null}
        </td>
        <td data-label={showCombined ? "Account" : "Reference"}>
          {/* A card has no reference — no layout prints one, which is why
              migration 016 identifies it by a computed fingerprint. The digits
              it printed are the nearest thing, and they are what the capture
              route checked the account against. */}
          {showCombined
            ? <span>{row.account ? `${row.account.label} ···· ${row.account.last_four}` : "Unknown account"}</span>
            : <span className="mono">···· {card.printed_account_digits}</span>}
        </td>
        <td data-label="Movement" className={`numeric ${amount > 0n ? "positive" : ""}`}>
          {amount > 0n ? "+" : ""}{formatThb(card.amount_minor)}
        </td>
        {/* A balance, where a slip and a cash entry both print a dash — and this
            is the whole reason a card reconciles better than a slip. It is the
            bank's own running balance after the transaction, printed on the card
            by the bank, which is the same figure the statement prints in its
            balance column. Labelled as printed rather than derived: it has not
            been confirmed against a statement row, because there is no matching
            row yet. */}
        <td data-label={showCombined ? "Account balance" : "Balance"} className="numeric">
          <span aria-label={`Balance printed on the card, not yet confirmed against a statement row: ${formatThb(card.balance_minor)}`}>
            {formatThb(card.balance_minor)}
          </span>
          <small>as printed</small>
        </td>
        {/* The combined figure is walked from statement rows only, so a card
            that is in no statement contributes nothing to it. */}
        {showCombined ? <td data-label="All accounts" className="numeric combined-balance">—</td> : null}
      </tr>
      {original && modes.correcting === card.id ? (
        <tr className="correction-row">
          <td colSpan={columns}>
            <CorrectionForm
              base={original}
              overlay={correction}
              balance={{
                baseMinor: original.balance_minor,
                overlayMinor: correction?.balance_minor ?? null
              }}
              endpoint={`/api/v1/notification-cards/${card.id}/correction`}
              title={`Correct what you typed for this ${card.channel} card`}
              onSaved={(saved) => onCorrectionSaved(card.id, saved)}
              onCancel={onCancelCorrection}
            />
          </td>
        </tr>
      ) : null}
    </Fragment>
  );
}
