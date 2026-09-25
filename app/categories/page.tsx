import { LedgerNote } from "@/app/ledger-note";
import { CategoriesBench } from "@/app/categories-bench";

export const metadata = { title: "Categories · Private Ledger" };

export const dynamic = "force-dynamic";

export default function CategoriesPage() {
  return (
    <>
      {/* A title and an `(i)`, matching every other route (PLAN task 42) — the `(i)` is a sibling
          of the `<h1>`, never a child, or its label leaks into the heading's accessible name
          (`app/ledger-note.tsx`). */}
      <section className="intro" aria-labelledby="page-title">
        <div>
          <p className="eyebrow">Categories · private workspace</p>
          <h1 id="page-title">Categories</h1>
          <div className="heading-note">
            <LedgerNote label="About categories">
              Type a category once here, then attach it to rows on the ledger. Renaming changes it
              everywhere. Archiving hides it from the picker; rows that have it keep it.
            </LedgerNote>
          </div>
        </div>
      </section>
      <CategoriesBench />
    </>
  );
}
