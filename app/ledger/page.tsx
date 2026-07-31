import { TransactionsView } from "@/app/transactions-view";

export const dynamic = "force-dynamic";

export default function LedgerPage() {
  return (
    <>
      <section className="intro" aria-labelledby="page-title">
        <div>
          <p className="eyebrow">Ledger · private workspace</p>
          <h1 id="page-title">Every confirmed row,<br />and nothing else.</h1>
        </div>
        <p className="intro-copy">Nothing loads until asked. Balances are exact and computed over whole accounts, never over the rows a filter happened to match.</p>
      </section>
      <TransactionsView />
    </>
  );
}
