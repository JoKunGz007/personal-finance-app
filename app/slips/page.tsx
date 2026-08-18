import { SlipsBench } from "@/app/slips-bench";

export const dynamic = "force-dynamic";

export default function SlipsPage() {
  return (
    <>
      <section className="intro" aria-labelledby="page-title">
        <div>
          <p className="eyebrow">Slips · provisional entries</p>
          <h1 id="page-title">The QR says who.<br />You say how much.</h1>
        </div>
        <p className="intro-copy">A slip&apos;s QR is read on this device; reading its amount sends the image to Google Cloud Vision. It stays provisional until the statement it belongs to arrives.</p>
      </section>
      <SlipsBench />
    </>
  );
}
