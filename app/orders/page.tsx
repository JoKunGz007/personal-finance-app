import { LedgerNote } from "@/app/ledger-note";
import { DeliveriesBench } from "@/app/deliveries-bench";

export const metadata = { title: "Orders · Private Ledger" };

export const dynamic = "force-dynamic";

export default function OrdersPage() {
  return (
    <>
      <section className="intro" aria-labelledby="page-title">
        <div>
          <p className="eyebrow">Orders · food orders and rides</p>
          <h1 id="page-title">Orders</h1>
          <div className="heading-note">
            <LedgerNote label="About orders">
              Grab e-receipts are read on the server from the statement mailbox; the email never
              reaches this page. Orders and rides only itemize money already on the ledger, so they
              never change a balance. Your name, address and the rider are never stored.
            </LedgerNote>
          </div>
        </div>
      </section>
      <DeliveriesBench />
    </>
  );
}
