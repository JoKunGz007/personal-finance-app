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
      {/* **A title, not a sentence.** This read "Every confirmed row, and nothing else." until
          2026-08-26, and the owner's objection to it was the same one he had made about the page
          as a whole: it is a line written to sell the thing rather than to name it. Every route
          now carries a plain noun for the surface, with the sentence that used to sit here behind
          the `(i)` if it was worth keeping at all.

          The `(i)` is a **sibling** of the heading, never a child. This `<h1>` is the
          `aria-labelledby` target for the section, so a button inside it would put its own label —
          and the disclosed paragraph — into the name of both the heading and the landmark.
          `app/ledger-note.tsx` carries the measurement. */}
      <section className="intro" aria-labelledby="page-title">
        <div>
          <p className="eyebrow">Ledger · private workspace</p>
          <h1 id="page-title">Ledger</h1>
          <div className="heading-note">
            <LedgerNote label="About this ledger">
              Every confirmed row and nothing else. Balances are exact and computed over whole
              accounts, never over the rows a filter happened to match.
            </LedgerNote>
          </div>
        </div>
      </section>
      <TransactionsView />
    </>
  );
}
