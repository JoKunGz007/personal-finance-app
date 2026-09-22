import { LedgerNote } from "@/app/ledger-note";
import { ReceiptsBench } from "@/app/receipts-bench";

export const metadata = { title: "Receipts · Private Ledger" };

export const dynamic = "force-dynamic";

export default function ReceiptsPage() {
  return (
    <>
      <section className="intro" aria-labelledby="page-title">
        <div>
          <p className="eyebrow">Receipts · what the money bought</p>
          <h1 id="page-title">Receipts</h1>
          <div className="heading-note">
            <LedgerNote label="About receipts">
              7-Eleven e-tax receipt PDFs are read on this device; only the items and totals are
              sent, never the page. A receipt itemizes money the ledger already holds, so it never
              changes a balance or a total. The short receipt and the full tax invoice for one
              purchase become one receipt.
            </LedgerNote>
          </div>
        </div>
      </section>
      <ReceiptsBench />
    </>
  );
}
