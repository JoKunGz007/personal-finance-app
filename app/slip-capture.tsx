"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { encodeForReader, readImageWords } from "@/lib/browser/ocr-reader";
import { formatThb, parseThb, plainThb } from "@/lib/money";
import { locateAmount, paddedCrop, proposeAmount, type Box } from "@/lib/slip-ocr";
import { scanForSlipIdentity, type SlipScanResult } from "@/lib/slip-scan";
import { type SlipIdentity } from "@/lib/slip-qr";
import { slipDateFromReference, slipDateWindow, SLIP_KINDS } from "@/lib/slips";
import { readError } from "@/lib/wire";

type Category = { id: string; name: string; archived: boolean };
type Kind = (typeof SLIP_KINDS)[number];

type BarcodeDetectorLike = { detect(source: ImageBitmapSource): Promise<Array<{ rawValue: string }>> };
type BarcodeDetectorConstructor = {
  new (options?: { formats?: string[] }): BarcodeDetectorLike;
  getSupportedFormats?: () => Promise<string[]>;
};

// Resolves a QR reader, preferring the platform's own.
//
// The native detector is the better choice **where it exists**: nothing to download, and
// it is backed by the platform on the device this feature is actually for. It does not
// exist everywhere. Chrome implements the Shape Detection barcode backend on Android,
// macOS and ChromeOS and **not on Windows or Linux desktop** — measured on this machine
// across bundled Chromium and installed Chrome, headless and headed, with the relevant
// flags, all absent (D-057). Depending on it alone meant slip capture could not run, or be
// verified, on the owner's own computer.
//
// The fallback is `import()`ed rather than imported at module scope, so a platform that
// has a native detector never downloads the ~1.1 MB WebAssembly reader. That is what makes
// its size acceptable; putting it in the bundle unconditionally would tax the phone, which
// is the one device that does not need it.
async function resolveDetector(): Promise<BarcodeDetectorLike | null> {
  const native = (globalThis as { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector;
  if (native) {
    try {
      // Constructing it is not proof it can read a QR: the constructor's presence and its
      // format support are separate facts, so ask before trusting it.
      const formats = await native.getSupportedFormats?.();
      if (!formats || formats.includes("qr_code")) return new native({ formats: ["qr_code"] });
    } catch {
      // Fall through. A native detector that throws is not worth diagnosing here when a
      // working reader is one dynamic import away.
    }
  }
  try {
    const { BarcodeDetector, prepareZXingModule } = await import("barcode-detector/ponyfill");
    // Point the reader at our own copy of its WebAssembly binary. Without this it resolves
    // the file relative to its bundled chunk — `/_next/static/chunks/zxing_reader.wasm` —
    // which does not exist, so the fetch 404s and every decode returns nothing at all. The
    // failure is silent, which is what makes it worth an explicit override rather than a
    // default. `scripts/copy-zxing-wasm.mjs` puts the file there at build time, and the CSP
    // permits it precisely because it is same-origin (D-057).
    await prepareZXingModule({
      overrides: {
        locateFile: (path: string, prefix: string) => (path.endsWith(".wasm") ? "/zxing_reader.wasm" : `${prefix}${path}`)
      },
      fireImmediately: true
    });
    return new BarcodeDetector({ formats: ["qr_code"] });
  } catch {
    return null;
  }
}

// Draws the image at `scale` and hands the result to the detector. The 2x pass is the
// whole reason this indirection exists: D-053 measured that 3 of 23 real slips do not
// decode at native resolution while the detector still finds the finder pattern, so a
// single-pass reader silently loses 13% of them. `lib/slip-scan.ts` owns the ladder; this
// only supplies pixels.
async function detectAtScale(bitmap: ImageBitmap, detector: BarcodeDetectorLike, scale: number) {
  const source = scale === 1
    ? bitmap
    : await (async () => {
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      const context = canvas.getContext("2d");
      if (!context) return bitmap;
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      return canvas;
    })();
  try {
    const found = await detector.detect(source as ImageBitmapSource);
    return found.map((code) => code.rawValue).filter((value) => typeof value === "string" && value.length > 0);
  } catch {
    // A detector that throws on one scale must not abort the ladder — the next scale is
    // exactly the case this is here to rescue.
    return [];
  }
}

// Cuts the located region out of the image and enlarges it, as a data URL.
//
// **Upscaling here is not the upscaling D-087 ruled out.** That finding was about feeding an
// enlarged image *to the recogniser*, where interpolation adds no information and disturbs the
// glyph shapes it was trained on. This enlargement is for a person's eyes on a phone, after
// recognition is over and with nothing downstream of it — the opposite direction entirely.
//
// The target width is in CSS pixels and the cap stops a tiny region from being blown into a
// blur; a slip photographed close up already exceeds it and is drawn at its own size.
const CROP_TARGET_WIDTH = 720;
const CROP_MAX_SCALE = 4;

// **The bitmap is a parameter rather than made here, and that is the coordinate-space guard.**
// The reader returns boxes in the space of the bytes it was sent; a crop cut from a *different*
// decode with one of those boxes can land on the wrong row, silently, and the symptom is a crop of
// the wrong field rather than an error. `readAmountOnImage` decodes once and passes the same bitmap
// to `encodeForReader` and to this — which is the rule the card form's `CardImage` type exists for
// (D-120).
function cropAmountRegion(bitmap: ImageBitmap, box: Box): string | null {
  const crop = paddedCrop(box, { width: bitmap.width, height: bitmap.height });
  const width = crop.right - crop.left;
  const height = crop.bottom - crop.top;
  if (width <= 0 || height <= 0) return null;
  const scale = Math.min(CROP_MAX_SCALE, Math.max(1, CROP_TARGET_WIDTH / width));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, crop.left, crop.top, width, height, 0, 0, canvas.width, canvas.height);
  // A data URL rather than an object URL: it is bounded by the crop, it needs no revoking,
  // and it dies with the component state. `img-src` already permits `data:` (D-058).
  return canvas.toDataURL("image/png");
}

const SHARE_CACHE = "shared-slip-v1";
const PENDING_URL = "/__pending-shared-slip";

// Takes the shared image out of the cache the service worker put it in, and deletes it in
// the same breath. Leaving it there would mean a slip image outliving the capture that
// consumed it — a stored image by accident, which is exactly what D-050 rules out.
async function consumePendingSharedSlip(): Promise<File | null> {
  if (!("caches" in globalThis)) return null;
  try {
    const cache = await caches.open(SHARE_CACHE);
    const response = await cache.match(PENDING_URL);
    if (!response) return null;
    const blob = await response.blob();
    await cache.delete(PENDING_URL);
    return new File([blob], "shared-slip", { type: blob.type || "image/jpeg" });
  } catch {
    return null;
  }
}

/**
 * Slip capture (PLAN task 20, D-050). The QR supplies identity; the reader offers the amount and
 * the owner confirms it.
 *
 * **Identity stays the QR's and is never machine-read.** The bank and the transaction reference
 * come out of the QR payload under its own CRC, server-side (`lib/slips.ts`); nothing OCR reads can
 * change either. That is why offering the amount is a bounded change rather than a general
 * loosening.
 *
 * ## What leaves the device, and when
 *
 * The QR is decoded here and the image is never stored. **Pressing "Read the amount" sends the slip
 * image to this app's own reader route, which relays it to Google Cloud Vision** (D-129) — the same
 * route the card form uses (D-120). Nothing is sent until that button is pressed, and the form says
 * so on screen. What crosses the wire on submit is still the QR payload and the values in the boxes.
 */
export function SlipCapture({ onCaptured }: { onCaptured?: () => void } = {}) {
  const [identity, setIdentity] = useState<SlipIdentity | null>(null);
  const [qrPayload, setQrPayload] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [scanned, setScanned] = useState<SlipScanResult | null>(null);
  // The captured file is held so the amount finder can re-read it. It is the same object the
  // preview already points at — nothing extra is retained, and both die on reset.
  const [image, setImage] = useState<File | null>(null);
  const [amountCrop, setAmountCrop] = useState<string | null>(null);
  const [readingAmount, setReadingAmount] = useState(false);
  const [amountFilled, setAmountFilled] = useState(false);
  const [amountReaderNote, setAmountReaderNote] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [kind, setKind] = useState<Kind>("withdrawal");
  const [amount, setAmount] = useState("");
  const [occurredOn, setOccurredOn] = useState("");
  const [dateFromQr, setDateFromQr] = useState(false);
  const [occurredAtTime, setOccurredAtTime] = useState("");
  const [counterparty, setCounterparty] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [note, setNote] = useState("");

  const fileInput = useRef<HTMLInputElement>(null);
  const window = useMemo(() => slipDateWindow(new Date()), []);

  // Revoking the object URL matters more here than usual: the whole promise of this
  // feature is that the image does not linger.
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  // Share-to-app. The service worker has already intercepted the share POST and stashed the
  // image locally (public/share-slip-sw.js); this picks it up and runs it through the same
  // path a file chosen by hand takes.
  //
  // **Registering** that worker is the shell's job rather than this component's, and routing
  // is what moved it (`app/site-header.tsx`). A worker installed only by the page the share
  // lands on cannot intercept the first share ever made — and an unintercepted share is one
  // that reaches the server, which is the single thing D-050 forbids.
  //
  // Every setState below happens in an async continuation, never synchronously in the
  // effect body — a shared slip is an external event arriving, which is what effects are
  // actually for.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!new URLSearchParams(globalThis.location.search).has("shared")) return;
      const shared = await consumePendingSharedSlip();
      if (cancelled || !shared) return;
      await onFile(shared);
    })();
    return () => { cancelled = true; };
    // Mount-only on purpose. `onFile` is redefined every render, so listing it would re-read
    // the pending share on each one — and the pending share is consumed destructively, so
    // the second read would find nothing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The parsed amount, shown back before anything is submitted. `parseThb` is the same
  // exact-money reader the statement path uses, so a typo is caught here rather than
  // becoming a stored value that only a reconciliation notices.
  const parsedAmount = useMemo(() => {
    if (!amount.trim()) return null;
    try {
      const money = parseThb(amount.trim());
      const magnitude = BigInt(money.minor) < 0n ? -BigInt(money.minor) : BigInt(money.minor);
      if (magnitude === 0n) return { ok: false as const, message: "A slip cannot be for zero." };
      return { ok: true as const, minor: (kind === "withdrawal" ? -magnitude : magnitude).toString() };
    } catch {
      return { ok: false as const, message: "Enter a plain amount such as 1250.00." };
    }
  }, [amount, kind]);

  function reset() {
    setIdentity(null);
    setQrPayload(null);
    setScanned(null);
    setImage(null);
    setAmountCrop(null);
    setAmountFilled(false);
    setAmountReaderNote(null);
    setAmount("");
    setOccurredAtTime("");
    setDateFromQr(false);
    setCounterparty("");
    setCategoryId("");
    setNote("");
    setError(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    if (fileInput.current) fileInput.current.value = "";
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    reset();
    setBusy(true);
    setStatus("Reading the slip's QR code…");
    try {
      const detector = await resolveDetector();
      if (!detector) {
        setError("No QR reader could be loaded in this browser.");
        return;
      }
      const bitmap = await createImageBitmap(file);
      const result = await scanForSlipIdentity((scale) => detectAtScale(bitmap, detector, scale));
      bitmap.close();
      setScanned(result);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setIdentity(result.identity);
      setImage(file);
      setPreview(URL.createObjectURL(file));
      // Categories are fetched now rather than on mount, matching the rule the transactions
      // view states: nothing in this app reaches the ledger until an action asks it to.
      void loadCategories();
      // Only the payload the reader accepted travels on. Re-deriving the bank and
      // reference from it server-side is what keeps identity the QR's job (lib/slips.ts).
      setQrPayload(result.payload);
      // SCB and Krungthai's longer variant embed the transaction date in the reference, so
      // for those the date is *read* rather than assumed — exact, CRC-covered, and Gregorian,
      // which is the Buddhist-era hazard removed rather than guarded (D-059). The others fall
      // back to today, which is right for a slip captured at the moment of payment.
      const fromQr = slipDateFromReference(result.identity.reference, window);
      setDateFromQr(fromQr !== null);
      setOccurredOn(fromQr ?? new Date().toISOString().slice(0, 10));
      setStatus(result.scale === 2
        ? "Read after upscaling — this slip does not decode at its native resolution."
        : "Slip QR read. Confirm the amount from the image.");
    } catch {
      setError("That file could not be read as an image.");
    } finally {
      setBusy(false);
    }
  }

  async function loadCategories() {
    const response = await fetch("/api/v1/categories", { headers: { accept: "application/json" } });
    if (!response.ok) return;
    const body = await response.json().catch(() => null);
    if (body && Array.isArray(body.categories)) setCategories(body.categories.filter((c: Category) => !c.archived));
  }

  /**
   * Reads the amount off the slip, fills the box with it, and shows the region enlarged.
   *
   * ## This reverses D-087's shipped rule, deliberately, and here is what changed
   *
   * D-087 refused to let a machine-read digit reach this box: on tesseract, digits came back
   * unstable about one time in fifteen across configurations and at least one wrong figure passed
   * the strict money grammar, so a pre-filled amount would have been indistinguishable from a
   * correct one. It shipped a *finder* instead — locate, crop, enlarge, and the owner types.
   *
   * **The engine that measurement was taken on no longer exists here** (D-129). Through this
   * app's own reader route and Google Cloud Vision, over all 23 real samples at native size:
   * `locateAmount` succeeds on **23 of 23** against tesseract's 16, and `proposeAmount` — the
   * strict read, which requires the figure to parse as money — succeeds on **23 of 23** as well
   * (D-128). The seven slips that gave the owner nothing at all now all resolve.
   *
   * This is the same reversal `tests/privacy.test.ts` already carries for cards (D-115): the
   * assertion is no longer "no figure may reach this box" but "a figure may reach it only through
   * the strict grammar". `setAmount` is called **only** with `proposeAmount`'s own value, never
   * with a token this function read for itself.
   *
   * ## What did not change, and is why this is safe
   *
   * `parseThb`, the two-fractional-place rule and blank-on-failure all sit **downstream** of
   * whichever engine produced the words (`lib/slip-ocr.ts`), so no engine — including one that
   * hallucinates — can put a wrong-but-plausible figure in the box. A figure that does not parse
   * leaves the box empty and says so. And a wrong figure that *does* parse still fails to pair with
   * its statement row and surfaces as unmatched, which is the independent check and the only answer
   * to the one thing no measurement here can produce: whether the offered figure is the *right*
   * figure (D-063, D-102, D-112).
   *
   * **The crop is kept and is now the check rather than the product.** It is shown whenever the
   * region was located, including when the figure refused to parse — which is exactly when the
   * owner most needs to see it enlarged.
   */
  async function readAmountOnImage() {
    if (!image || !identity) return;
    setReadingAmount(true);
    setAmountCrop(null);
    setAmountFilled(false);
    setAmountReaderNote(null);
    let bitmap: ImageBitmap | null = null;
    try {
      // One decode, used for both the bytes sent and the pixels cropped, so a box can never be
      // applied to a different image than the one it was measured on (`cropAmountRegion`).
      bitmap = await createImageBitmap(image);
      const encoded = await encodeForReader(bitmap);
      if (!encoded) {
        setAmountReaderNote("This image could not be prepared for the reader. Read the amount off the slip above and type it.");
        return;
      }
      const read = await readImageWords(encoded);
      if (!read.ok) {
        setAmountReaderNote(read.why);
        return;
      }

      // Located first, because the enlargement is useful on strictly more slips than a parsed
      // figure is — `locateAmount` needs only the label and something beside it.
      const located = locateAmount(read.words, identity.bankCode);
      if (located.ok) setAmountCrop(cropAmountRegion(bitmap, located.value));

      const proposed = proposeAmount(read.words, identity.bankCode);
      if (!proposed.ok) {
        // The policy layer's own words. Its refusals distinguish a label that was never
        // recognised from a figure that did not read as money, and both are more use than
        // "it did not work" — the second is the one where the crop above is worth looking at.
        setAmountReaderNote(proposed.message);
        return;
      }
      // The only value that reaches this box, and it is the one the strict grammar returned.
      // `plainThb` is the inverse of the `parseThb` that produced it, so the box holds a figure
      // this form will parse back to exactly the same amount.
      setAmount(plainThb(proposed.value));
      setAmountFilled(true);
    } catch {
      setAmountReaderNote("The amount could not be read off this image.");
    } finally {
      bitmap?.close();
      setReadingAmount(false);
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!identity || !qrPayload || !parsedAmount?.ok) return;
    setBusy(true);
    setError(null);
    setStatus("Capturing…");
    try {
      const response = await fetch("/api/v1/slips", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          qrPayload,
          bankCode: identity.bankCode,
          bankQrCode: identity.bankQrCode,
          slipReference: identity.reference,
          kind,
          amountMinor: parsedAmount.minor,
          currency: "THB",
          occurredOn,
          occurredAtTime: occurredAtTime || null,
          counterparty: counterparty.trim() || null,
          categoryId: categoryId || null,
          note: note.trim() || null
        })
      });
      if (!response.ok) {
        // The body, not the response. `readError` looks for an `error` key on an already-parsed
        // object, so handing it a `Response` silently falls through to the fallback and this
        // form showed the generic sentence for every refusal — including the two the capture
        // route words specifically, the Buddhist-era date and the unknown category (GOTCHAS).
        const failure: unknown = await response.json().catch(() => null);
        setError(readError(failure, "The slip could not be captured."));
        return;
      }
      const body = await response.json();
      // Sharing the same slip twice is expected rather than exceptional, so the second
      // share is reported as a plain outcome instead of an error.
      setStatus(body.captured
        ? "Captured as a provisional entry. The statement remains the authority."
        : "Already captured — this slip is in the ledger and nothing changed.");
      reset();
      // Both outcomes refresh the list below: an already-captured slip is still one the owner
      // is entitled to see, and a form that clears itself with no record left on the page is
      // what made a successful capture feel like nothing happened (D-075).
      onCaptured?.();
    } catch {
      setError("The slip could not be captured.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="slip-bench" aria-labelledby="slip-title">
      <div className="bench-heading">
        <p className="section-index">Slips</p>
        <div>
          <h2 id="slip-title">Capture a transfer slip</h2>
          <p>
            The QR names the bank and the transaction; you confirm the amount. Slips are
            provisional — the statement stays the authority and reconciles against them later.
            The QR is read on this device. Reading the amount sends the slip image to Google
            Cloud Vision, which stores nothing; the image is never stored here either.
          </p>
        </div>
      </div>

      <div className="slip-controls">
        <label className="file-control">
          <span>Slip image</span>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            disabled={busy}
            onChange={(event) => void onFile(event.target.files?.[0])}
          />
          <b>{identity ? "Slip read" : "Choose or photograph a slip…"}</b>
        </label>
        {identity && <button type="button" onClick={reset} disabled={busy}>Discard</button>}
      </div>

      {status && <p className="status" role="status">{status}</p>}
      {error && <p className="status error" role="alert">{error}</p>}

      {identity && (
        <form className="slip-form" onSubmit={(event) => void submit(event)}>
          <dl className="slip-identity">
            <div><dt>Bank</dt><dd>{identity.bankCode}</dd></div>
            <div><dt>Transaction reference</dt><dd className="mono">{identity.reference}</dd></div>
            {scanned?.ok && scanned.scale === 2 && (
              <div><dt>Decoded</dt><dd>after 2× upscale</dd></div>
            )}
          </dl>

          {preview && (
            // Shown so the owner can read the amount off the slip while typing it. It is an
            // object URL over the local file and is revoked on reset; nothing is uploaded.
            // `next/image` is deliberately not used: it optimises through a loader, and the
            // whole point here is that these bytes never leave the device.
            // eslint-disable-next-line @next/next/no-img-element
            <img className="slip-preview" src={preview} alt="The slip being captured" />
          )}

          {/*
            **The button now says "read", and that word is the reversal** (D-129). It said
            "Enlarge" while D-087's finder was what it did, because reading the amount was the
            promise this form deliberately did not make. It makes it now, on the measurement in
            D-128, and the enlargement below has become the check rather than the product.

            It also says where the slip goes, on the screen where it goes there, rather than only
            in a document — the same rule the card form follows (D-120).
          */}
          <div className="amount-finder">
            <button type="button" onClick={() => void readAmountOnImage()} disabled={busy || readingAmount || !image}>
              {readingAmount ? "Reading the amount…" : "Read the amount"}
            </button>
            {/*
              Three states, and there is deliberately no fourth. **A located region with no
              filled amount always carries a refusal**, because `locateAmount` and `proposeAmount`
              find the label the same way: if the label was found and the figure beside it would
              not parse, `proposeAmount` says so and its sentence is what belongs here. So a
              "found but not filled" arm would be unreachable, and an unreachable arm is a message
              nobody ever sees being maintained as though somebody does.

              The filled message only promises an enlargement when there is one — cropping can
              fail on its own (a canvas the browser would not give us), and a message pointing at
              something absent is worse than a shorter one.
            */}
            <p className="field-help" role="status">
              {readingAmount
                ? "Sending this slip to Google Cloud Vision to be read."
                : amountReaderNote
                  ?? (amountFilled
                    ? amountCrop
                      ? "Read off the slip and filled in above. Check it against the enlargement below before capturing."
                      : "Read off the slip and filled in above. Check it against the slip before capturing."
                    : "Optional. Sends the slip image to Google Cloud Vision, fills in the amount it reads, and enlarges that part of the slip so you can check it.")}
            </p>
            {amountCrop && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                className="amount-crop"
                src={amountCrop}
                alt="The part of the slip that carries the amount, enlarged"
              />
            )}
          </div>

          <div className="slip-fields">
            <label>
              <span>Direction</span>
              <select value={kind} onChange={(event) => setKind(event.target.value as Kind)}>
                <option value="withdrawal">Money out</option>
                <option value="deposit">Money in</option>
              </select>
            </label>

            <label>
              <span>Amount (THB)</span>
              <input
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="Amount from the slip"
                required
                aria-describedby="slip-amount-help"
              />
            </label>

            <label>
              <span>Date</span>
              <input
                type="date"
                value={occurredOn}
                min={window.earliest}
                max={window.latest}
                onChange={(event) => setOccurredOn(event.target.value)}
                required
                aria-describedby="slip-date-help"
              />
            </label>

            <label>
              <span>Time (optional)</span>
              <input type="time" value={occurredAtTime} onChange={(event) => setOccurredAtTime(event.target.value)} />
            </label>

            <label>
              <span>Counterparty (optional)</span>
              <input value={counterparty} maxLength={240} onChange={(event) => setCounterparty(event.target.value)} />
            </label>

            <label>
              <span>Category (optional)</span>
              <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
                <option value="">Uncategorised</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>{category.name}</option>
                ))}
              </select>
            </label>
          </div>

          <p id="slip-amount-help" className="field-help">
            {parsedAmount === null
              ? "Read the amount from the slip above."
              : parsedAmount.ok
                ? `Will be recorded as ${formatThb(parsedAmount.minor)}.`
                : parsedAmount.message}
          </p>
          <p id="slip-date-help" className="field-help">
            {dateFromQr
              // Say where a pre-filled value came from. A date the owner did not type looks
              // identical to one they did, and the difference matters: this one is exact.
              ? "Read from the slip's QR code, so this is the bank's own date rather than a guess. Change it if it looks wrong."
              : "This slip's QR carries no date, so today is filled in. Thai slips often print a Buddhist year such as 2569 — enter the Gregorian year, since a Buddhist one is outside the accepted range and will be refused."}
          </p>

          <label className="slip-note">
            <span>Note (optional)</span>
            <textarea value={note} maxLength={2000} rows={2} onChange={(event) => setNote(event.target.value)} />
          </label>

          <button type="submit" disabled={busy || !parsedAmount?.ok || !occurredOn}>
            Capture slip
          </button>
        </form>
      )}
    </section>
  );
}
