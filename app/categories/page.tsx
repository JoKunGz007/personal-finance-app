import { LedgerNote } from "@/app/ledger-note";
import { CategoriesBench } from "@/app/categories-bench";

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
              A category is a label you type once here and then attach to a statement row&rsquo;s
              overlay from the ledger. Renaming one here renames it everywhere it is attached;
              archiving one takes it out of the picker without touching any row that already
              carries it.
            </LedgerNote>
          </div>
        </div>
      </section>
      <CategoriesBench />
    </>
  );
}
