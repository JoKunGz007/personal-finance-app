"use client";

import { Fragment } from "react";
import { formatThb } from "@/lib/money";
import { movementMinor, overlayInForce, type AccountTransaction } from "@/lib/transactions";
import { type LedgerAccount } from "@/lib/accounts";
import { type ReconciledRow } from "@/lib/slip-reconcile";
import { type NotificationCard } from "@/lib/notification-cards";
import { formatDate, type LedgerLayout, type LedgerModes } from "@/app/ledger-shared";

/**
 * A confirmed statement row, and whichever captured records collapsed onto it.
 *
 * The ledger's default state and, on this ledger, essentially every row. It carries no status
 * chip when nothing matched it: a badge on each one would carry no information while making the
 * three statuses that do mean something harder to find (D-064).
 *
 * It has three quite different Status cells and they are three modes rather than three styles —
 * picking a row for a card, picking a row for a slip, and the ordinary verified/statement-only
 * view. That is why this component is the largest of the four.
 *
 * Split out of `app/transactions-view.tsx` with no change to what it renders.
 */
export function LedgerStatementRow({
  row,
  layout,
  modes,
  account,
  combinedBalance,
  matchingCardRecord,
  slipCorrected,
  openPair,
  openCard,
  onTogglePair,
  onToggleCard,
  onDecideSlip,
  onDecideCard,
  onSetReporting
}: {
  row: Extract<ReconciledRow, { kind: "confirmed" }>;
  layout: LedgerLayout;
  modes: LedgerModes;
  /** The account this row belongs to, for the all-accounts column. */
  account: LedgerAccount | undefined;
  /** The all-accounts running balance at this row, already defaulted to the row's own. */
  combinedBalance: string | null;
  /**
   * The card currently being matched, when one is. Read for its printed balance, which this row
   * compares against its own so the owner is told whether the two agree **before** choosing.
   */
  matchingCardRecord: NotificationCard | null;
  /** Whether the matched slip carries a correction, reported inside the detail panel. */
  slipCorrected: boolean;
  /** Which pair's slip detail is open, by transaction id. */
  openPair: string | null;
  /** Which pair's card detail is open, by transaction id. */
  openCard: string | null;
  onTogglePair: (transactionId: string) => void;
  onToggleCard: (transactionId: string) => void;
  onDecideSlip: (slipId: string, decision: "matched" | "unmatched", transactionId: string | null) => void;
  onDecideCard: (
    cardId: string,
    decision: "matched" | "unmatched" | "not-a-payment",
    transactionId: string | null,
    acceptBalanceMismatch?: boolean
  ) => void;
  /**
   * Takes this row in or out of income and spending totals (PLAN task 48).
   *
   * It is handed the **whole transaction** rather than an id, because the write replaces the whole
   * overlay and the row is where the rest of that overlay lives. An id would leave the caller to
   * find the row again, which is the shape that invites sending nulls for the fields it did not
   * find — the erasure `overlayWriteBody` exists to make unrepresentable.
   */
  onSetReporting: (transaction: AccountTransaction, includeInReporting: boolean) => void;
}) {
  const transaction: AccountTransaction = row.transaction;
  const movement = movementMinor(transaction);
  const overlay = transaction.transaction_overlays[0];
  const { showCombined, columns } = layout;
  // A verified row is the statement's, enriched by whichever captured records
  // matched it: the printed balance and the immutable source facts stay, and
  // the counterparty the owner typed fills in what the bank's own description
  // usually does not say. The slip is read before the card only because it is
  // the record a counterparty gets typed into more often; either will do.
  const counterparty = overlay?.counterparty ?? row.slip?.counterparty ?? row.card?.counterparty ?? null;
  const pair = row.slip;
  const cardPair = row.card;
  // Through `overlayInForce` rather than `overlay?.include_in_reporting ?? true` so the default
  // that stands in for "this row has no overlay row at all" is written once. It is `true`, and it
  // is the same `true` the column default and every `coalesce(o.include_in_reporting, true)` in
  // migration 023 mean.
  const { includeInReporting } = overlayInForce(transaction);

  return (
    <Fragment>
      <tr className={row.slip || row.card ? "verified-row" : ""}>
        <td data-label="Date">
          <time dateTime={transaction.source_date}>{formatDate(transaction.source_date)}</time>
          <small>{transaction.source_time ?? "—"}</small>
        </td>
        <td data-label="Description">
          <strong lang="th">{transaction.transaction_label}</strong>
          <span>{overlay?.description ?? transaction.description}</span>
          {/* Named by the record it actually came from. Saying "from slip" over a
              counterparty read off a card would attribute it to a record that is
              not on this row, and the two are corrected in different places. */}
          {counterparty ? (
            <em>
              {counterparty}
              {overlay?.counterparty ? "" : row.slip?.counterparty ? " (from slip)" : " (from card)"}
            </em>
          ) : null}
          {transaction.source_components.length > 1 ? <em>2 components</em> : null}
        </td>
        {/* No chip for a statement row with no slip. It is the ledger's default
            state — on this ledger, essentially every row — so a badge on each
            one carries no information while making the three statuses that do
            mean something harder to find. The status is still readable to a
            screen reader here, and askable through the Status filter (D-064). */}
        <td data-label="Status">
          {modes.pickingCard && modes.matchingCard !== null && matchingCardRecord !== null ? (
            /* Picking a row for a card. The balance is printed on both records,
               so the row says whether the two agree — and when they do not, the
               button asks for that acknowledgement explicitly rather than
               storing a disagreement the owner never saw. */
            <div className="match-control">
              {row.card ? <em className="status-chip verified">Verified by card</em> : null}
              {BigInt(transaction.post_balance_minor) === BigInt(matchingCardRecord.balance_minor) ? (
                <small className="decision-mark">Balance agrees with the card</small>
              ) : (
                <small className="decision-mark warn">
                  This row&rsquo;s balance is {formatThb(transaction.post_balance_minor)} and the card printed
                  {" "}{formatThb(matchingCardRecord.balance_minor)}. Choosing it records that you accepted the
                  disagreement — which is right when a hold was outstanding, and wrong if a figure was mistyped.
                </small>
              )}
              <button
                type="button"
                className="primary-button"
                aria-label={`This is it — ${formatDate(row.date)}${transaction.source_time ? ` at ${transaction.source_time}` : ""}, balance ${formatThb(transaction.post_balance_minor)}`}
                disabled={modes.decidingCard !== null}
                onClick={() => onDecideCard(
                  modes.matchingCard!,
                  "matched",
                  transaction.id,
                  BigInt(transaction.post_balance_minor) !== BigInt(matchingCardRecord.balance_minor)
                )}
              >
                {modes.decidingCard === modes.matchingCard ? "Saving…" : "This is it"}
              </button>
            </div>
          ) : modes.picking && modes.matching !== null ? (
            /* Picking mode: this row is one of the candidates, or it would not
               be on screen. The button is on the row itself, beside the time
               and the balance that are the only things distinguishing it from
               its neighbours. */
            <div className="match-control">
              {/* The chip stays. A candidate may already be paired with a
                  *different* slip — `matchCandidates` offers those deliberately,
                  and the database accepts the write — so replacing the status
                  with a button would let the owner take a row off another slip
                  with nothing on screen saying so but a green edge, which is
                  colour alone. Taking it is allowed; not being told is not. */}
              {row.slip ? <em className="status-chip verified">Verified by slip</em> : null}
              {/* Shown but never warned about, unlike the slip below. A card and
                  a slip do not compete for a row — one payment can produce both —
                  so choosing this row takes nothing away from the card, and
                  saying it did would be a false warning. */}
              {row.card ? <em className="status-chip verified">Verified by card</em> : null}
              {row.slip && row.slip.id !== modes.matching ? (
                <small className="decision-mark warn">
                  Already matched to the {formatDate(row.slip.occurred_on)} slip
                  {row.slip.counterparty ? ` · ${row.slip.counterparty}` : ""}. Choosing this row
                  unmatches that one, which goes back to waiting for a statement.
                </small>
              ) : null}
              <button
                type="button"
                className="primary-button"
                /* The visible words come first, because an accessible name that
                   does not contain the label is a name nobody can speak — and
                   the rest is what distinguishes this row from its twin. */
                aria-label={`This is it — ${formatDate(row.date)}${transaction.source_time ? ` at ${transaction.source_time}` : ""}, balance ${formatThb(transaction.post_balance_minor)}`}
                disabled={modes.deciding !== null}
                onClick={() => onDecideSlip(modes.matching!, "matched", transaction.id)}
              >
                {modes.deciding === modes.matching ? "Saving…" : "This is it"}
              </button>
            </div>
          ) : row.slip || row.card ? (
            <>
              {row.slip ? (
                <>
                  <em className="status-chip verified">Verified by slip</em>
                  {row.ownerDecided ? <small className="decision-mark">Your match</small> : null}
                  {/* The undo, and the only control a matched row needs. It stores
                      `unmatched` rather than deleting the decision: the RPC has no
                      way to return a slip to the automatic rule, and pretending
                      otherwise would promise something the database cannot do. */}
                  <div className="match-control">
                    {/* A pairing this app itself calls a proposal from three facts
                        has to be inspectable, or "verified" is something the owner
                        can only take on trust. The pair collapsed onto the statement
                        row, so without this the slip is on screen nowhere. */}
                    <button
                      type="button"
                      className="secondary-button"
                      aria-expanded={openPair === transaction.id}
                      aria-controls={`pair-${transaction.id}`}
                      /* Visible words first — an accessible name that does not
                         contain the label is a name nobody can speak, and it is the
                         second time in one day that rule caught a locator instead of
                         a screen reader (GOTCHAS). */
                      aria-label={`${openPair === transaction.id ? "Hide slip" : "Show slip"} — the slip matched to the row dated ${formatDate(row.date)}`}
                      onClick={() => onTogglePair(transaction.id)}
                    >
                      {openPair === transaction.id ? "Hide slip" : "Show slip"}
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      aria-label={`Not this slip — the row dated ${formatDate(row.date)} is not this payment`}
                      /* Every decision control, not just this row's. One write at a
                         time: two in flight let the first to resolve re-enable a
                         button whose own write is still pending, and a second press
                         then sends a revision the database has already moved past —
                         which comes back as "changed in another session" to an owner
                         who has only one tab open. The shared error line has the same
                         problem: it cannot say which decision it is about. */
                      disabled={modes.deciding !== null}
                      onClick={() => onDecideSlip(row.slip!.id, "unmatched", null)}
                    >
                      {modes.deciding === row.slip.id ? "Saving…" : "Not this slip"}
                    </button>
                  </div>
                </>
              ) : null}
              {cardPair ? (
                <>
                  <em className="status-chip verified">Verified by card</em>
                  {/* No undo beside it, unlike the slip's. A card's match cannot
                      be overruled yet: that needs its own table, and PLAN task 27
                      keeps it with the correction overlay so both land in one
                      migration rather than one backup version bump each. The
                      panel is therefore the whole of what this row offers, and
                      it says the pairing is the rule's. */}
                  <div className="match-control">
                    <button
                      type="button"
                      className="secondary-button"
                      aria-expanded={openCard === transaction.id}
                      aria-controls={`card-${transaction.id}`}
                      /* Visible words first, for the reason the slip's button
                         carries the same rule: an accessible name that does not
                         contain the label is a name nobody can speak (GOTCHAS). */
                      aria-label={`${openCard === transaction.id ? "Hide card" : "Show card"} — the notification card matched to the row dated ${formatDate(row.date)}`}
                      onClick={() => onToggleCard(transaction.id)}
                    >
                      {openCard === transaction.id ? "Hide card" : "Show card"}
                    </button>
                    {/* The undo, which exists now that a card's decision has a
                        table. It stores `unmatched` rather than deleting the
                        decision, for the reason the slip's does: the RPC has no
                        way to return a card to the automatic rule, and pretending
                        otherwise would promise something the database cannot do. */}
                    <button
                      type="button"
                      className="secondary-button"
                      aria-label={`Not this card — the row dated ${formatDate(row.date)} is not this payment`}
                      disabled={modes.decidingCard !== null}
                      onClick={() => onDecideCard(cardPair.id, "unmatched", null)}
                    >
                      {modes.decidingCard === cardPair.id ? "Saving…" : "Not this card"}
                    </button>
                  </div>
                  {row.cardOwnerDecided ? <small className="decision-mark">Your match</small> : null}
                  {/* Stored consent, shown for as long as the pairing stands. It
                      does not go stale after a later correction, because it says
                      what the owner accepted rather than what the figures now say. */}
                  {row.cardBalanceMismatchAccepted ? (
                    <small className="decision-mark warn">
                      You matched this despite the card and the row printing different balances.
                    </small>
                  ) : null}
                </>
              ) : null}
            </>
          ) : (
            <span className="status-none" aria-label="Statement only: no slip and no notification card is matched to this row">—</span>
          )}
          {/*
            **In the Status cell rather than in a column of its own or a detail panel**, and both
            alternatives were live options (PLAN task 48).

            A column was refused because the table already sets a 1160px minimum and the merged
            view 1280px, and D-138 is what a widened ledger costs on a phone. **This cell is the
            one that is already empty on exactly the rows that need the control** — a statement-only
            row renders a single em dash here — so the control costs no width at all.

            A detail panel was refused because on these rows there is none: `pair-detail` exists
            only where a slip or a card matched, and the internal transfers the owner wants set
            aside are statement-only. Putting the control there meant building a second panel and
            charging two presses for a scanning task.

            **Hidden while a pick is on**, because that mode is deliberately one question at a
            time — the table is showing the rows a slip could be, and a second control on each of
            them competes with the answer being asked for.
          */}
          {modes.picking || modes.pickingCard ? null : (
            <div className="match-control">
              {/* No chip in the ordinary case, which is D-064's rule: a badge on every row carries
                  no information. A chip when the row is *out* of reporting is the opposite — the
                  totals above the table are computed without it, and a figure that quietly excludes
                  a visible row is the silent difference this ledger keeps having to name. */}
              {includeInReporting ? null : <em className="status-chip excluded">Excluded</em>}
              <button
                type="button"
                className="secondary-button"
                /* No `aria-pressed`. The visible label names the *action* and changes with the
                   state, so a pressed-ness on top of it announces "Include, pressed" — two
                   readings of the same fact that contradict each other. What states the state is
                   the chip, which is in this cell and is read with it. */
                aria-label={`${includeInReporting ? "Exclude" : "Include"} — ${includeInReporting ? "stop counting" : "count"} the row dated ${formatDate(row.date)} for ${formatThb(movement)} as income or spending`}
                /* Every reporting control, not just this row's, for the reason the decision
                   buttons carry: two writes in flight let the first to resolve re-enable a control
                   whose own write is still pending, and the second press then sends a revision the
                   database has already moved past. */
                disabled={modes.settingReporting !== null}
                onClick={() => onSetReporting(transaction, !includeInReporting)}
              >
                {modes.settingReporting === transaction.id ? "Saving…" : includeInReporting ? "Exclude" : "Include"}
              </button>
              {includeInReporting ? null : (
                <small className="decision-mark">
                  Not counted as income or spending. The money still moved, so the balance is unchanged.
                </small>
              )}
            </div>
          )}
        </td>
        <td data-label={showCombined ? "Account" : "Reference"}>
          {showCombined
            ? <span>{account ? `${account.label} ···· ${account.last_four}` : "Unknown account"}</span>
            : <span>{transaction.reference ?? "Not printed"}</span>}
        </td>
        {/* Colour reinforces a direction the sign already states, and a zero movement stays neutral
            rather than being called an arrival. */}
        <td data-label="Movement"
            className={`numeric ${BigInt(movement) > 0n ? "positive" : BigInt(movement) < 0n ? "negative" : ""}`}>
          {BigInt(movement) > 0n ? "+" : ""}{formatThb(movement)}
        </td>
        <td data-label={showCombined ? "Account balance" : "Balance"} className="numeric">
          {formatThb(transaction.post_balance_minor)}
        </td>
        {showCombined ? (
          <td data-label="All accounts" className="numeric combined-balance">
            {/* Null where the merged figure is not knowable: an account in scope has rows older
                than its window reaches, so summing here would add that account's *later* balance
                to an earlier row. Shown as an em dash rather than as this row's own balance,
                which is a different number wearing the same heading. */}
            {combinedBalance === null
              ? <span title="Load older rows to see the combined balance here." aria-label="Combined balance not loaded">&mdash;</span>
              : formatThb(combinedBalance)}
          </td>
        ) : null}
      </tr>
      {pair && openPair === transaction.id ? (
        <tr className="pair-detail" id={`pair-${transaction.id}`}>
          <td colSpan={columns}>
            <dl>
              <div><dt>Slip reference</dt><dd className="mono">{pair.slip_reference}</dd></div>
              <div><dt>Slip bank</dt><dd>{pair.bank_code}</dd></div>
              <div>
                <dt>Printed on the slip</dt>
                <dd>{formatDate(pair.occurred_on)}{pair.occurred_at_time ? ` · ${pair.occurred_at_time}` : " · no time printed"}</dd>
              </div>
              {/* Shown because it is the match: the slip's amount and the row's
                  movement are equal to the minor unit, or this pairing could not
                  exist. Seeing both is what makes the claim checkable. */}
              <div>
                <dt>Slip amount</dt>
                <dd>
                  {formatThb(pair.amount_minor)}
                  {slipCorrected ? " · corrected by you, and it is this figure the match was checked against" : null}
                </dd>
              </div>
              <div><dt>Counterparty on the slip</dt><dd>{pair.counterparty ?? "none recorded"}</dd></div>
              {pair.note ? <div><dt>Note</dt><dd>{pair.note}</dd></div> : null}
              <div>
                <dt>Paired by</dt>
                <dd>{row.ownerDecided ? "you — a stored decision" : "the rule — same bank, same amount to the satang, within one day"}</dd>
              </div>
            </dl>
            {row.ownerDecided ? null : (
              <p>
                No statement layout prints a slip&rsquo;s reference, so this is a proposal from
                three facts rather than an identifier the two records share. It is recomputed
                on every load and nothing about it is stored until you decide something.
              </p>
            )}
          </td>
        </tr>
      ) : null}
      {cardPair && openCard === transaction.id ? (
        <tr className="pair-detail" id={`card-${transaction.id}`}>
          <td colSpan={columns}>
            <dl>
              <div><dt>Pushed by</dt><dd>{cardPair.channel}</dd></div>
              <div>
                <dt>Account digits printed</dt>
                <dd className="mono">···· {cardPair.printed_account_digits}</dd>
              </div>
              <div>
                <dt>Printed on the card</dt>
                <dd>{formatDate(cardPair.occurred_on)} · {cardPair.occurred_at_time}</dd>
              </div>
              {/* Both figures, side by side, because both are the match. The
                  amount is equal to this row's movement and the balance is equal
                  to its printed balance, or this pairing could not exist — seeing
                  the two is what makes that claim checkable rather than trusted. */}
              <div><dt>Card amount</dt><dd>{formatThb(cardPair.amount_minor)}</dd></div>
              <div>
                <dt>Balance printed on the card</dt>
                <dd>
                  {formatThb(cardPair.balance_minor)}
                  {" · equal to this row's printed balance, which is what paired them"}
                </dd>
              </div>
              <div><dt>Counterparty on the card</dt><dd>{cardPair.counterparty ?? "none recorded"}</dd></div>
              {cardPair.note ? <div><dt>Note</dt><dd>{cardPair.note}</dd></div> : null}
              <div>
                <dt>Paired by</dt>
                <dd>the rule — same account, same amount to the satang, within one day, and the same printed balance</dd>
              </div>
            </dl>
            <p>
              A card prints no reference either, so this is still a proposal rather than an
              identifier the two records share &mdash; but it rests on four facts where a slip
              rests on three, and the fourth is the one that tells two payments of the same
              amount apart. It is recomputed on every load, and nothing about it is stored.
              The balance was measured equal to the statement&rsquo;s on every card checked, but
              on six cards and none captured while a hold was outstanding, so it is treated as
              a cross-check rather than as proof.
            </p>
          </td>
        </tr>
      ) : null}
    </Fragment>
  );
}
