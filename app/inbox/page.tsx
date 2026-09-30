import { LedgerNote } from "@/app/ledger-note";
import { InboxBench } from "@/app/inbox-bench";
import { InboxFiles } from "@/app/inbox-files";

export const metadata = { title: "Inbox · Private Ledger" };

export const dynamic = "force-dynamic";

export default function InboxPage() {
  return (
    <>
      <section className="intro" aria-labelledby="page-title">
        <div>
          <p className="eyebrow">Inbox · mail and dropped files</p>
          <h1 id="page-title">Inbox</h1>
          <div className="heading-note">
            <LedgerNote label="About the inbox">
              One press reads the statement mailbox for Grab orders and rides, then 7-Eleven
              invoices, on the server, and checks for bank statements. Statements are not read here:
              they are locked PDFs, opened on this device on the Import page with your document
              password. Files you add below are kept privately only until they are imported, and at
              most 7 days.
            </LedgerNote>
          </div>
        </div>
      </section>
      <InboxBench />
      <InboxFiles />
    </>
  );
}
