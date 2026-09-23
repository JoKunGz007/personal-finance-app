import { LedgerNote } from "@/app/ledger-note";
import { DeliveriesBench } from "@/app/deliveries-bench";

export const metadata = { title: "Deliveries · Private Ledger" };

export const dynamic = "force-dynamic";

export default function DeliveriesPage() {
  return (
    <>
      <section className="intro" aria-labelledby="page-title">
        <div>
          <p className="eyebrow">Deliveries · what the food orders were</p>
          <h1 id="page-title">Deliveries</h1>
          <div className="heading-note">
            <LedgerNote label="About deliveries">
              GrabFood e-receipts are read on the server from the statement mailbox; the page is sent
              counts and stored orders, never the email. An order itemizes money the ledger already
              holds, so it never changes a balance or a total. The name on the receipt, the delivery
              address and the rider are never stored.
            </LedgerNote>
          </div>
        </div>
      </section>
      <DeliveriesBench />
    </>
  );
}
