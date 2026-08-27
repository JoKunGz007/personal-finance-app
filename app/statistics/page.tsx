import { LedgerNote } from "@/app/ledger-note";
import { StatisticsView } from "@/app/statistics-view";

export const dynamic = "force-dynamic";

export const metadata = { title: "Statistics · Private Ledger" };

/**
 * The statistics surface (PLAN task 44, D-160).
 *
 * A title, not a sentence, on the same rule every other route follows since 2026-08-26 — and the
 * `(i)` is a sibling of the `<h1>` rather than a child, because the heading is this section's
 * `aria-labelledby` target and a button inside it would put its own label into the name of both the
 * heading and the landmark.
 */
export default function StatisticsPage() {
  return (
    <>
      <section className="intro" aria-labelledby="page-title">
        <div>
          <p className="eyebrow">Statistics · private workspace</p>
          <h1 id="page-title">Statistics</h1>
          <div className="heading-note">
            <LedgerNote label="About these figures">
              Every figure is computed over the whole ledger in the database, never over the rows a
              page happened to hold, and every one is exact to the satang. Averages are integer
              division that keeps its remainder, so nothing is lost or rounded into place. Cash
              entries are not counted yet, and rows marked as excluded from reporting are left out of
              the totals but still move the balance line.
            </LedgerNote>
          </div>
        </div>
      </section>
      <StatisticsView />
    </>
  );
}
