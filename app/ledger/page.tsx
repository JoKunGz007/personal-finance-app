import { LedgerNote } from "@/app/ledger-note";
import { TransactionsView } from "@/app/transactions-view";

export const dynamic = "force-dynamic";

/**
 * The intro is deliberately smaller here than on the other three routes (`intro tight`).
 *
 * This page's job is the table. The standing paragraph that used to sit here said the ledger
 * loads nothing until asked — which stopped being true in PLAN task 43 — and explained how
 * balances are derived, which is a principle worth stating once and not worth re-reading on
 * every visit. It is behind the `(i)`.
 */
export default function LedgerPage() {
  return (
    <>
      <section className="intro tight" aria-labelledby="page-title">
        <div>
          <p className="eyebrow">Ledger · private workspace</p>
          {/* The `(i)` is a **sibling** of the heading, never a child of it. This `<h1>` is the
              `aria-labelledby` target for the section, so a button inside it would put its own
              label — and the disclosed paragraph — into the name of both the heading and the
              landmark. `app/ledger-note.tsx` carries the measurement. */}
          <h1 id="page-title">Every confirmed row,<br />and nothing else.</h1>
          <div className="heading-note">
            <LedgerNote label="About this ledger">
              Balances are exact and computed over whole accounts, never over the rows a filter
              happened to match.
            </LedgerNote>
          </div>
        </div>
      </section>
      <TransactionsView />
    </>
  );
}
