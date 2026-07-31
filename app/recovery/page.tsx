import { RecoveryBench } from "@/app/recovery-bench";

export const dynamic = "force-dynamic";

export default function RecoveryPage() {
  return (
    <>
      <section className="intro" aria-labelledby="page-title">
        <div>
          <p className="eyebrow">Recovery · encrypted artifacts</p>
          <h1 id="page-title">A backup you hold,<br />and can actually restore.</h1>
        </div>
        <p className="intro-copy">Both halves run in this browser. The password never reaches the server, and neither does the decrypted snapshot.</p>
      </section>
      <RecoveryBench />
    </>
  );
}
