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
              A 7-Eleven PDF you pick is read on this device and only items and totals are sent;
              mailed invoices are read on the server by Sync. Your name and tax ID on a full invoice
              are never stored. Receipts only
              itemize money already on the ledger, so they never change a balance. The short receipt
              and the full tax invoice for one purchase merge into one.
            </LedgerNote>
          </div>
        </div>
      </section>
      <ReceiptsBench />
    </>
  );
}
