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
              Computed in the database over every row in the window, exact to the satang. The window
              starts at All time; its dates and day count show above the figures, and averages are
              over those days, keeping their remainder rather than rounding. Cash entries
              aren&apos;t counted yet. Excluded rows are left out of totals but still move the
              balance line.
            </LedgerNote>
          </div>
        </div>
      </section>
      <StatisticsView />
    </>
  );
}
