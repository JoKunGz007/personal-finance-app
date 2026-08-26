import { LedgerNote } from "@/app/ledger-note";
import { RecoveryBench } from "@/app/recovery-bench";

export const dynamic = "force-dynamic";

export default function RecoveryPage() {
  return (
    <>
      {/* A title and an `(i)`, matching every other route (PLAN task 42). What folded is a claim
          about where the password goes, which is worth being able to check and is not worth
          re-reading on every visit. */}
      <section className="intro" aria-labelledby="page-title">
        <div>
          <p className="eyebrow">Recovery · encrypted artifacts</p>
          <h1 id="page-title">Recovery</h1>
          <div className="heading-note">
            <LedgerNote label="About recovery">
              Backing up and restoring both run in this browser. The password never reaches the
              server, and neither does the decrypted snapshot.
            </LedgerNote>
          </div>
        </div>
      </section>
      <RecoveryBench />
    </>
  );
}
