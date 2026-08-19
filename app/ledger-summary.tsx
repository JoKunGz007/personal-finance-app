"use client";

import { type RefObject } from "react";
import { formatThb } from "@/lib/money";
import { type CardMatches } from "@/lib/notification-card-reconcile";
import { type LedgerTotals, type SlipMatches } from "@/lib/slip-reconcile";
import { type NotificationCard } from "@/lib/notification-cards";
import { type CapturedSlip } from "@/lib/slips";
import { formatDate, type LedgerModes } from "@/app/ledger-shared";

/**
 * What sits above the table: either the matching banner, or the totals and what they rest on.
 *
 * **The two are alternatives rather than neighbours, and that is the point.** While a row is being
 * chosen by hand the totals are deliberately gone: what is on screen is one captured record and
 * the rows it could be, which is not a view of the ledger and has no total worth printing — a
 * subtotal of three unrelated rows reads as a figure.
 *
 * Split out of `app/transactions-view.tsx` with no change to what it renders.
 */
export function LedgerSummary({
  modes,
  matchingSlip,
  matchingCardRecord,
  offeredCount,
  offeredToCardCount,
  totals,
  slipCount,
  cardCount,
  matches,
  cardMatches,
  cancelRef,
  onCancelMatching,
  onCancelMatchingCard
}: {
  modes: LedgerModes;
  /** The slip being matched, when one is. Both it and the mode must hold or the banner is off. */
  matchingSlip: CapturedSlip | null;
  /** The card being matched, when one is. */
  matchingCardRecord: NotificationCard | null;
  /** How many rows are on offer for the slip. */
  offeredCount: number;
  /** How many rows are on offer for the card. */
  offeredToCardCount: number;
  totals: LedgerTotals;
  slipCount: number;
  cardCount: number;
  matches: SlipMatches;
  cardMatches: CardMatches;
  /**
   * Focus has to follow the mode. The button that opens it disables itself in the same update,
   * and a browser blurs a disabled element — which drops a keyboard or screen-reader user to the
   * top of the document with the `aria-live` announcement read but nowhere to be. The ref belongs
   * to the view because the effect that moves focus does.
   */
  cancelRef: RefObject<HTMLButtonElement | null>;
  onCancelMatching: () => void;
  onCancelMatchingCard: () => void;
}) {
  if (modes.pickingCard && matchingCardRecord) {
    return (
      <div className="matching-banner" aria-live="polite">
        <div>
          <strong>Choosing a statement row for a card</strong>
          <span>
            {`${matchingCardRecord.channel} · ${formatDate(matchingCardRecord.occurred_on)} ${matchingCardRecord.occurred_at_time} · ${formatThb(matchingCardRecord.amount_minor)}`}
            {` — ${offeredToCardCount} row${offeredToCardCount === 1 ? "" : "s"} on this account carry that exact amount. Rows whose printed balance matches the card are listed first, because that is the one the rule would have taken. Other filters are suspended while you choose.`}
          </span>
        </div>
        <button
          type="button"
          className="secondary-button"
          ref={cancelRef}
          disabled={modes.decidingCard !== null}
          onClick={onCancelMatchingCard}
        >
          Cancel
        </button>
      </div>
    );
  }

  if (modes.picking && matchingSlip) {
    /* The totals are deliberately gone while this is up. What is on screen is a slip
       and the rows it could be, which is not a view of the ledger and has no total
       worth printing — a subtotal of three unrelated rows reads as a figure. */
    return (
      <div className="matching-banner" aria-live="polite">
        <div>
          <strong>Choosing a statement row</strong>
          <span>
            {`${matchingSlip.bank_code} slip · ${formatDate(matchingSlip.occurred_on)}${matchingSlip.occurred_at_time ? ` ${matchingSlip.occurred_at_time}` : ""} · ${formatThb(matchingSlip.amount_minor)}`}
            {` — ${offeredCount} row${offeredCount === 1 ? "" : "s"} could be it, each at the same bank for the same amount to the satang. The time and the balance are what tell them apart, so they are shown as rows rather than as a list of names. Other filters are suspended while you choose.`}
          </span>
        </div>
        <button
          type="button"
          className="secondary-button"
          ref={cancelRef}
          disabled={modes.deciding !== null}
          onClick={onCancelMatching}
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <>
      {/* One total over both kinds, which is only correct because a matched pair is one
          row. The provisional count travels with the figure so it discloses how much of
          itself the bank has not confirmed (D-063). */}
      <dl className="statement-strip ledger-strip">
        {/* Cash is counted apart from `provisional`: a slip is waiting for a statement,
            while a cash payment has no bank behind it and never will, so folding the
            two together would say the total is waiting on something never coming. */}
        <div><dt>Rows</dt><dd>{totals.rows}{totals.provisional > 0 ? <small> · {totals.provisional} provisional</small> : null}{totals.cash > 0 ? <small> · {totals.cash} cash</small> : null}{totals.cards > 0 ? <small> · {totals.cards} card{totals.cards === 1 ? "" : "s"}</small> : null}</dd></div>
        <div><dt>Deposits</dt><dd className="positive">+{formatThb(totals.deposits)}</dd></div>
        <div><dt>Withdrawals</dt><dd>{formatThb(totals.withdrawals)}</dd></div>
        <div><dt>Net movement</dt><dd>{formatThb(totals.net)}</dd></div>
      </dl>

      {slipCount > 0 ? (
        <p className="ledger-status">
          <b>Slips: {matches.bySlip.size} verified · {slipCount - matches.bySlip.size - matches.needsReview.size} awaiting a statement{matches.needsReview.size > 0 ? ` · ${matches.needsReview.size} needing review` : ""}</b>
          {" · a slip is matched to a statement row only when the bank, the exact amount and a date within one day identify one row and no other slip claims it. No layout prints the slip's reference, so a match is a proposal from those three facts rather than an identifier the two records share."}
        </p>
      ) : null}

      {cardCount > 0 ? (
        <p className="ledger-status">
          <b>
            Notification cards: {cardMatches.byCard.size} verified · {cardCount - cardMatches.byCard.size - cardMatches.needsReview.size - cardMatches.balanceConflict.size} awaiting a statement
            {cardMatches.needsReview.size > 0 ? ` · ${cardMatches.needsReview.size} needing review` : ""}
            {cardMatches.balanceConflict.size > 0 ? ` · ${cardMatches.balanceConflict.size} whose balance disagrees` : ""}
          </b>
          {" · a card matches on the account it was bound to, the exact amount, a date within one day, and the balance it printed being equal to the row's. The balance is what a slip does not have: it breaks a tie between two rows of the same amount, and a card that fits on everything else while contradicting the balance refuses to pair rather than guessing. Recomputed on every load, and nothing about a card's match is stored yet."}
        </p>
      ) : null}
    </>
  );
}
