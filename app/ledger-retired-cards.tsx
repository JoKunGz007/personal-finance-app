"use client";

import { formatThb } from "@/lib/money";
import { type NotificationCard } from "@/lib/notification-cards";
import { formatDate } from "@/app/ledger-shared";

/**
 * Cards the owner marked **not a payment** — out of the rows and the totals, never out of reach.
 *
 * Without this panel the database's reversibility would be theoretical: the row vanishes from the
 * ledger, and there would be nothing on screen to undo it from. Nothing here is ever deleted, so
 * bringing one back simply puts it in front of the matching rule again.
 *
 * Split out of `app/transactions-view.tsx` with no change to what it renders.
 */
export function LedgerRetiredCards({
  cards,
  expanded,
  decidingCard,
  onToggle,
  onBringBack
}: {
  /** The retired cards, already resolved to the figures in force. */
  cards: NotificationCard[];
  expanded: boolean;
  /** The card whose decision is being written, so every Bring-it-back disables while one is. */
  decidingCard: string | null;
  onToggle: () => void;
  onBringBack: (cardId: string) => void;
}) {
  return (
    <div className="retired-cards">
      <button
        type="button"
        className="secondary-button"
        aria-expanded={expanded}
        onClick={onToggle}
      >
        {expanded ? "Hide retired cards" : `Show ${cards.length} retired card${cards.length === 1 ? "" : "s"}`}
      </button>
      <p className="ledger-status">
        A retired card is one you marked <b>not a payment</b> &mdash; a wrong account, or the same payment
        captured twice. It is out of the ledger and out of the totals, and it is still in the database, because
        nothing here is ever deleted. Bringing one back puts it in front of the matching rule again.
      </p>
      {expanded ? (
        <ul className="retired-list">
          {cards.map((card) => (
            <li key={card.id}>
              <span>
                {card.channel} · {formatDate(card.occurred_on)} {card.occurred_at_time} · {formatThb(card.amount_minor)}
                {card.counterparty ? ` · ${card.counterparty}` : ""}
              </span>
              <button
                type="button"
                className="secondary-button"
                aria-label={`Bring back the ${card.channel} card dated ${formatDate(card.occurred_on)}`}
                disabled={decidingCard !== null}
                onClick={() => onBringBack(card.id)}
              >
                {decidingCard === card.id ? "Saving…" : "Bring it back"}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
