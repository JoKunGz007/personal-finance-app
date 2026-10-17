import Link from "next/link";
import { LedgerNote } from "@/app/ledger-note";
import { DeliveriesBench } from "@/app/deliveries-bench";
import { ShopeeBench } from "@/app/shopee-bench";

export const metadata = { title: "Orders · Private Ledger" };

export const dynamic = "force-dynamic";

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ view?: string | string[] }> }) {
  const { view } = await searchParams;
  const shopee = view === "shopee";
  return (
    <>
      <section className="intro" aria-labelledby="page-title">
        <div>
          <p className="eyebrow">{shopee ? "Orders · Shopee" : "Orders · food and rides"}</p>
          <h1 id="page-title">Orders</h1>
          <div className="heading-note">
            {shopee ? (
              <LedgerNote label="About Shopee orders">
                Orders come from the export dropped on the Inbox. They itemize money already on the
                ledger, so they never change a balance. The recipient&apos;s name, address and phone
                are never stored. A SPayLater purchase is counted in the month it was ordered, and on
                the ledger as its repayments.
              </LedgerNote>
            ) : (
              <LedgerNote label="About orders">
                Grab e-receipts are read on the server from the statement mailbox; the email never
                reaches this page. Orders and rides only itemize money already on the ledger, so they
                never change a balance. Your name, address and the rider are never stored.
              </LedgerNote>
            )}
          </div>
        </div>
      </section>
      <nav className="view-tabs" aria-label="Order sources">
        <Link href="/orders" aria-current={shopee ? undefined : "page"}>Food &amp; rides</Link>
        <Link href="/orders?view=shopee" aria-current={shopee ? "page" : undefined}>Shopee</Link>
      </nav>
      {shopee ? <ShopeeBench /> : <DeliveriesBench />}
    </>
  );
}
