import { LedgerNote } from "@/app/ledger-note";
import { SlipsBench } from "@/app/slips-bench";

export const dynamic = "force-dynamic";

export default function SlipsPage() {
  return (
    <>
      {/* A title and an `(i)`, matching every other route (PLAN task 42). The sentence that stood
          here is worth keeping — it says where the image goes, which is the one thing about this
          page a person should know before using it — so it folded rather than went. */}
      <section className="intro" aria-labelledby="page-title">
        <div>
          <p className="eyebrow">Slips · provisional entries</p>
          <h1 id="page-title">Slips</h1>
          <div className="heading-note">
            <LedgerNote label="About slips">
              The QR is read on this device; reading the amount sends the image to Google Cloud
              Vision. A slip stays provisional until the statement it belongs to arrives.
            </LedgerNote>
          </div>
        </div>
      </section>
      <SlipsBench />
    </>
  );
}
