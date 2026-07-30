"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatThb, parseThb } from "@/lib/money";
import { scanForSlipIdentity, type SlipScanResult } from "@/lib/slip-scan";
import { type SlipIdentity } from "@/lib/slip-qr";
import { slipDateWindow, SLIP_KINDS } from "@/lib/slips";
import { readError } from "@/lib/wire";

type Category = { id: string; name: string; archived: boolean };
type Kind = (typeof SLIP_KINDS)[number];

// The browser's own barcode reader. Deliberately not a bundled decoder: the CSP forbids
// remote script and allows WASM only for the pdf.js worker, and a slip is decoded on the
// same device that took the photo — so the native detector is both the smallest and the
// least surprising option. It is Chromium-only, which is stated to the owner rather than
// discovered as a silent failure to read a perfectly good QR.
type BarcodeDetectorLike = { detect(source: ImageBitmapSource): Promise<Array<{ rawValue: string }>> };
type BarcodeDetectorConstructor = new (options?: { formats?: string[] }) => BarcodeDetectorLike;

function barcodeDetector(): BarcodeDetectorLike | null {
  const ctor = (globalThis as { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector;
  if (!ctor) return null;
  try {
    return new ctor({ formats: ["qr_code"] });
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
 * Slip capture (PLAN task 20, D-050). The QR supplies identity; the owner supplies the
 * amount and confirms it. No OCR — that is task 21, and this form is identical either way,
 * which is why D-050 ordered the manual half first.
 *
 * The image is never uploaded and never stored. It is decoded in this component and
 * discarded; what crosses the wire is the QR payload and the values the owner typed.
 */
export function SlipCapture() {
  const [identity, setIdentity] = useState<SlipIdentity | null>(null);
  const [qrPayload, setQrPayload] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [scanned, setScanned] = useState<SlipScanResult | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [kind, setKind] = useState<Kind>("withdrawal");
  const [amount, setAmount] = useState("");
  const [occurredOn, setOccurredOn] = useState("");
  const [occurredAtTime, setOccurredAtTime] = useState("");
  const [counterparty, setCounterparty] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [note, setNote] = useState("");

  const fileInput = useRef<HTMLInputElement>(null);
  const detectorAvailable = useMemo(() => barcodeDetector() !== null, []);
  const window = useMemo(() => slipDateWindow(new Date()), []);

  // Revoking the object URL matters more here than usual: the whole promise of this
  // feature is that the image does not linger.
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  // Share-to-app. The service worker has already intercepted the share POST and stashed the
  // image locally (public/share-slip-sw.js); this picks it up and runs it through the same
  // path a file chosen by hand takes. Registration is here rather than in the layout so the
  // only page that needs a worker is the only page that installs one.
  //
  // Every setState below happens in an async continuation, never synchronously in the
  // effect body — a shared slip is an external event arriving, which is what effects are
  // actually for.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!("serviceWorker" in navigator)) return;
      try {
        await navigator.serviceWorker.register("/share-slip-sw.js", { scope: "/" });
      } catch {
        // An unregistrable worker only costs share-to-app; choosing a file still works.
        return;
      }
      if (cancelled || !new URLSearchParams(globalThis.location.search).has("shared")) return;
      const shared = await consumePendingSharedSlip();
      if (cancelled || !shared) return;
      await onFile(shared);
    })();
    return () => { cancelled = true; };
    // Mount-only on purpose. `onFile` is redefined every render, so listing it would
    // re-register the worker and re-read the pending share on each one — and the pending
    // share is consumed destructively, so the second read would find nothing.
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
    setAmount("");
    setOccurredAtTime("");
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
      const detector = barcodeDetector();
      if (!detector) {
        setError("This browser has no built-in QR reader. Capture needs a Chromium browser such as Chrome or Edge.");
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
      setPreview(URL.createObjectURL(file));
      // Categories are fetched now rather than on mount, matching the rule the transactions
      // view states: nothing in this app reaches the ledger until an action asks it to.
      void loadCategories();
      // Only the payload the reader accepted travels on. Re-deriving the bank and
      // reference from it server-side is what keeps identity the QR's job (lib/slips.ts).
      setQrPayload(result.payload);
      setOccurredOn((current) => current || new Date().toISOString().slice(0, 10));
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
        setError(await readError(response, "The slip could not be captured."));
        return;
      }
      const body = await response.json();
      // Sharing the same slip twice is expected rather than exceptional, so the second
      // share is reported as a plain outcome instead of an error.
      setStatus(body.captured
        ? "Captured as a provisional entry. The statement remains the authority."
        : "Already captured — this slip is in the ledger and nothing changed.");
      reset();
    } catch {
      setError("The slip could not be captured.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="slip-bench" aria-labelledby="slip-title">
      <div className="bench-heading">
        <p className="section-index">Slips / 06</p>
        <div>
          <h2 id="slip-title">Capture a transfer slip</h2>
          <p>
            The QR names the bank and the transaction; you confirm the amount. Slips are
            provisional — the statement stays the authority and reconciles against them later.
            The image is read on this device and never stored.
          </p>
        </div>
      </div>

      {!detectorAvailable && (
        // Deliberately not `role="status"`. This is static explanatory text, not something
        // that changes in response to an action — and announcing it as a live region also
        // put a second status role on the page, which broke every existing spec that looks
        // one up by role. A live region is for what just happened, not for what is true.
        <p className="notice">
          This browser has no built-in QR reader, so slips cannot be captured here. Chrome or Edge can.
        </p>
      )}

      <div className="slip-controls">
        <label className="file-control">
          <span>Slip image</span>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            disabled={busy || !detectorAvailable}
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
                placeholder="1250.00"
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
            Thai slips often print a Buddhist year such as 2569. Enter the Gregorian year — a
            Buddhist one is outside the accepted range and will be refused.
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
