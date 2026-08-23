"use client";

import { useMemo, useRef, useState } from "react";
import { encodeForReader, readImageWords } from "@/lib/browser/ocr-reader";
import { detectAtScale, resolveDetector, type SlipQrReader } from "@/lib/browser/qr-detector";
import { formatThb, parseThb, plainThb } from "@/lib/money";
import { classifySlip, signedSlipAmount, type SlipDateSource } from "@/lib/slip-batch";
import { scanForSlipIdentity } from "@/lib/slip-scan";
import { type SlipIdentity } from "@/lib/slip-qr";
import { slipDateWindow, type SlipKind } from "@/lib/slips";
import { readError } from "@/lib/wire";

/**
 * A slip's state as it moves through the batch. Every one is a sentence the owner can act on rather
 * than a code, because this list *is* the interface — there is no per-slip screen to explain
 * anything on.
 *
 * `failed` is separate from `review` on purpose: a slip whose QR would not read cannot be captured
 * here at all, since identity comes from the QR and nothing typed can supply it. A `review` slip has
 * its identity in hand and is missing a value.
 */
type RowState = "queued" | "reading" | "ready" | "review" | "failed" | "captured" | "duplicate" | "refused";

type BatchRow = {
  readonly id: string;
  readonly fileName: string;
  readonly file: File;
  state: RowState;
  identity: SlipIdentity | null;
  payload: string | null;
  reason: string | null;
  dateSource: SlipDateSource | null;
  occurredOn: string;
  occurredAtTime: string | null;
  /** Plain decimal text. Filled only with `plainThb` of what the strict grammar returned. */
  amount: string;
};

/**
 * A ceiling on one batch, because every slip in it is a paid third-party read.
 *
 * Not a technical limit — it is the difference between a mistaken drop of a whole camera roll
 * costing a sentence and costing a bill. The excess is reported rather than silently trimmed.
 */
const MAX_BATCH_FILES = 50;

/**
 * The typed or offered amount as a magnitude, or null when it is not one this ledger can store.
 *
 * `parseThb` is the same exact-money reader every other path uses, so a slip typed by hand in the
 * review list is held to exactly the grammar an offered one already passed. **This is not a second,
 * lenient door into the amount**: nothing here repairs a doubtful character, and a figure that does
 * not parse leaves its row unsubmittable rather than being approximated.
 */
function amountMagnitude(amount: string): bigint | null {
  if (!amount.trim()) return null;
  try {
    const money = parseThb(amount.trim());
    const value = BigInt(money.minor);
    const magnitude = value < 0n ? -value : value;
    return magnitude === 0n ? null : magnitude;
  } catch {
    return null;
  }
}

function rowIsSubmittable(row: BatchRow): boolean {
  // **`refused` belongs here, and leaving it out made a transient failure permanent.** A network
  // error on slip 30 of 50 set `refused`, which this excluded forever, so the only way back was to
  // discard the batch and re-read every slip — fifty fresh paid reads to recover one failed POST.
  // Re-sending is safe by construction: `capture_slip` writes nothing for a slip already in the
  // ledger (migration 011), which is the same property that makes the whole batch re-runnable.
  if (row.state !== "ready" && row.state !== "review" && row.state !== "refused") return false;
  if (!row.occurredOn || !row.identity || !row.payload) return false;
  return amountMagnitude(row.amount) !== null;
}

function chipClass(state: RowState): string {
  if (state === "ready" || state === "captured") return "verified";
  if (state === "review") return "awaiting";
  if (state === "failed" || state === "refused") return "needs-review";
  return "cash";
}

function chipLabel(state: RowState): string {
  switch (state) {
    case "queued": return "not read";
    case "reading": return "reading";
    case "ready": return "ready";
    case "review": return "needs a value";
    case "failed": return "no slip QR";
    case "captured": return "captured";
    case "duplicate": return "already captured";
    case "refused": return "refused";
  }
}

/**
 * Bulk slip upload (PLAN task 39, D-135).
 *
 * ## Why this is a second form rather than a mode of the first
 *
 * The single-slip form is for a slip captured at the moment of payment: one image, the owner looking
 * at it, today's date a sensible default. This is for a **backlog** — many slips at once, none of
 * them looked at individually — and the default that is right for the first is dangerous for the
 * second. Filling in today is correct for a payment just made and produces a slip that can *never*
 * pair for one made last month, because slips reconcile against statement rows inside a one-day
 * window (`lib/slip-reconcile.ts`). So this form refuses to assume a date at all, and
 * `lib/slip-batch.ts` holds that refusal and its two exact alternatives.
 *
 * ## What makes filing a slip unseen safe
 *
 * **Identity is the QR's and is re-derived server-side** from the payload under its own CRC
 * (`lib/slips.ts`), so no misreading can file a slip under the wrong bank or reference.
 * **Re-capturing is a no-op** (migration 011), so a batch may be re-run over the same folder.
 * **The amount comes only through the strict grammar** — `proposeAmount` finds it under its own
 * label and converts it or refuses, with no lenient fallback, which is the rule the single form is
 * held to (D-129). **The date is exact or absent**, never assumed. And a wrong figure that does
 * parse still fails to pair with its statement row and surfaces as unmatched, which is the
 * independent check the whole provisional-slip design rests on.
 *
 * **Direction is the one thing no image can settle**, so it is asked once for the whole batch. A
 * slip prints who paid whom; which side is the owner is not on the image and is not in this app. A
 * direction filed wrong carries the opposite sign, can never pair, and skews the deposit, withdrawal
 * and net totals until corrected by hand — so a mixed batch is two batches, and the form says so.
 *
 * ## What leaves the device, and when
 *
 * The QR is read here. **Pressing "Read these slips" sends each image to this app's own reader
 * route, which relays it to Google Cloud Vision** (D-129) — the same route the single form and the
 * card form use. One read per slip, one slip at a time, and nothing is sent until that press.
 */
export function SlipBatch({ onCaptured }: { onCaptured?: () => void } = {}) {
  const [rows, setRows] = useState<BatchRow[]>([]);
  const [kind, setKind] = useState<SlipKind>("withdrawal");
  const [phase, setPhase] = useState<"idle" | "reading" | "capturing">("idle");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fileInput = useRef<HTMLInputElement>(null);
  // **Recomputed when a pass starts, not pinned at mount.** `latest` is the day after the window
  // was built, so a tab left open across midnight refused a slip dated today and the review row's
  // `max` blocked the owner typing it. A backlog form is the one most likely to sit open for days.
  const [dateWindow, setDateWindow] = useState(() => slipDateWindow(new Date()));

  const counts = useMemo(() => ({
    submittable: rows.filter(rowIsSubmittable).length,
    review: rows.filter((row) => row.state === "review").length,
    failed: rows.filter((row) => row.state === "failed").length,
    captured: rows.filter((row) => row.state === "captured").length,
    duplicate: rows.filter((row) => row.state === "duplicate").length,
    refused: rows.filter((row) => row.state === "refused").length
  }), [rows]);

  function patch(id: string, changes: Partial<BatchRow>) {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...changes } : row)));
  }

  function clear() {
    setRows([]);
    setProgress(null);
    setStatus(null);
    setError(null);
    if (fileInput.current) fileInput.current.value = "";
  }

  function onFiles(chosen: FileList | null) {
    // **Copied out before `clear()`, and that order is load-bearing.** A `FileList` is live: it is
    // a view onto the input, not a snapshot of it, and `clear()` sets `input.value = ""`, which
    // empties it. Reading `chosen` afterwards therefore finds nothing and every chosen slip
    // vanishes silently — the form simply goes on saying "Choose slip images…". The single-slip
    // form does not have this hazard only because it takes `files[0]` before its own reset runs.
    const files = chosen ? [...chosen] : [];
    clear();
    if (files.length === 0) return;
    const kept = files.slice(0, MAX_BATCH_FILES);
    setRows(kept.map((file, index) => ({
      // The index is part of the key because two files in one selection can share a name, and a
      // duplicate key would make two rows update as one.
      id: `${index}-${file.name}`,
      fileName: file.name,
      file,
      state: "queued",
      identity: null,
      payload: null,
      reason: null,
      dateSource: null,
      occurredOn: "",
      occurredAtTime: null,
      amount: ""
    })));
    setStatus(files.length > kept.length
      ? `${kept.length} slips taken, and ${files.length - kept.length} left out — a batch is capped at ${MAX_BATCH_FILES}. Nothing has been read or sent yet.`
      : `${kept.length} slips chosen. Nothing has been read or sent yet.`);
  }

  /**
   * Reads one slip: the QR on this device, then the amount and the printed date through the reader
   * route, then the verdict from `lib/slip-batch.ts`.
   *
   * The detector is a parameter rather than resolved here, so the ~1.1 MB WebAssembly fallback is
   * downloaded once per batch instead of once per slip.
   */
  async function readOne(row: BatchRow, detector: SlipQrReader, dates: { earliest: string; latest: string }) {
    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(row.file);
    } catch {
      patch(row.id, { state: "failed", reason: "This file could not be read as an image." });
      return;
    }

    try {
      const scanned = await scanForSlipIdentity((scale) => detectAtScale(bitmap, detector, scale));
      if (!scanned.ok) {
        // Identity comes from the QR alone, so there is nothing to fall back on and nothing the
        // owner can type here to rescue it. The single-slip form is where a stubborn image gets a
        // second try at a better crop.
        patch(row.id, { state: "failed", reason: scanned.message });
        return;
      }

      // One decode for the QR and for the bytes sent, so the words come back in the coordinate
      // space of the image that was actually scanned.
      const encoded = await encodeForReader(bitmap);
      const read = encoded === null
        ? { ok: false as const, why: "This image could not be prepared for the reader." }
        : await readImageWords(encoded);

      const verdict = classifySlip({
        reference: scanned.identity.reference,
        bankCode: scanned.identity.bankCode,
        words: read.ok ? read.words : null,
        readerRefusal: read.ok ? null : read.why,
        window: dates,
        today: new Date()
      });

      if (verdict.status === "ready") {
        patch(row.id, {
          state: "ready",
          identity: scanned.identity,
          payload: scanned.payload,
          reason: null,
          dateSource: verdict.date.source,
          occurredOn: verdict.date.occurredOn,
          occurredAtTime: verdict.date.occurredAtTime,
          // The one value that reaches this box, and it is the strict grammar's own. `plainThb` is
          // the inverse of the `parseThb` inside `proposeAmount`, so the row holds a figure that
          // parses back to exactly the amount that was read.
          amount: plainThb(verdict.amountMinor)
        });
        return;
      }

      // **Whatever resolved is carried in, rather than blanking the row.** The reader being
      // unreachable says nothing about the date: it comes out of the QR's CRC-covered reference
      // and never touched a recognised word (D-059). Blanking it made the owner hand-type, across
      // a whole batch, the one value `lib/slip-batch.ts` calls unable to pair and unable to
      // self-correct. Neither field relaxes a rule — each is what the ready path would have
      // carried — so a pre-filled row is still a row the owner is looking at.
      patch(row.id, {
        state: "review",
        identity: scanned.identity,
        payload: scanned.payload,
        reason: verdict.reason,
        dateSource: verdict.date?.source ?? null,
        occurredOn: verdict.date?.occurredOn ?? "",
        occurredAtTime: verdict.date?.occurredAtTime ?? null,
        amount: verdict.amountMinor === null ? "" : plainThb(verdict.amountMinor)
      });
    } catch {
      patch(row.id, { state: "failed", reason: "This slip could not be read." });
    } finally {
      bitmap.close();
    }
  }

  /**
   * Reads every slip not yet read.
   *
   * **One slip at a time, deliberately.** Firing every image at the reader at once would put an
   * unbounded burst on a metered third party, would make the failure of one indistinguishable from
   * the failure of all, and would make the progress line a lie. A backlog is not latency-sensitive.
   *
   * **Only `queued` rows**, so a second press never overwrites a value the owner has typed into a
   * review row.
   */
  async function readAll() {
    // **The phase is claimed before the first await, and that ordering is the fix.** Resolving the
    // detector downloads ~1.1 MB of WebAssembly on any browser without a native `BarcodeDetector`
    // (D-057) — seconds on a cold connection, and every control stayed live throughout because
    // `busy` derives from `phase`. A second press in that window started a concurrent loop over the
    // same snapshot and sent every image to the metered reader twice; choosing new files mid-flight
    // left the in-flight loop patching ids that the new selection can reuse. `app/slip-capture.tsx`
    // has always set its flag before the identical await.
    setPhase("reading");
    setError(null);
    const dates = slipDateWindow(new Date());
    setDateWindow(dates);
    try {
      const detector = await resolveDetector();
      if (!detector) {
        setError("No QR reader could be loaded in this browser.");
        return;
      }
      // Read after the await, not before: the owner may have been typing into a review row while
      // the reader loaded, and a snapshot taken earlier would overwrite that.
      const pending = rows.filter((row) => row.state === "queued" || row.state === "failed");
      setProgress({ done: 0, total: pending.length });
      setStatus("Reading the slips. Each one is sent to Google Cloud Vision to have its amount read.");

      let done = 0;
      for (const row of pending) {
        patch(row.id, { state: "reading" });
        await readOne(row, detector, dates);
        done += 1;
        setProgress({ done, total: pending.length });
      }
      setStatus("All slips read. Fill in the ones needing a value, then capture.");
    } finally {
      // **`finally`, so a throw anywhere in the loop cannot strand the form.** Without it the phase
      // stayed `reading` for good, which disables Discard along with everything else and leaves a
      // page reload as the only way out — after a batch that has already been paid for.
      setPhase("idle");
    }
  }

  /**
   * Captures every submittable slip, one request at a time.
   *
   * Sequential for the reason the reads are, plus one specific to writing: a burst of captures for
   * one owner contends for the same advisory lock, and a queue of blocked requests is a worse
   * failure than a queue of pending ones. Each row reports its own outcome, so a refusal in the
   * middle stops nothing.
   */
  async function captureAll() {
    const submittable = rows.filter(rowIsSubmittable);
    if (submittable.length === 0) return;
    setPhase("capturing");
    setError(null);
    setProgress({ done: 0, total: submittable.length });

    let done = 0;
    for (const row of submittable) {
      await captureOne(row);
      done += 1;
      setProgress({ done, total: submittable.length });
    }

    setPhase("idle");
    setStatus("Capture finished. Captured slips are provisional — the statement remains the authority.");
    onCaptured?.();
  }

  async function captureOne(row: BatchRow) {
    const magnitude = amountMagnitude(row.amount);
    if (magnitude === null || !row.identity || !row.payload) return;
    // `signedSlipAmount` refuses a non-canonical magnitude rather than coercing it to zero, so the
    // refusal is handled here instead of being sent and bounced by the database.
    const signed = signedSlipAmount(magnitude.toString(), kind);
    if (signed === null) {
      patch(row.id, { state: "review", reason: "This amount is not one this ledger can store. Type it again." });
      return;
    }
    try {
      const response = await fetch("/api/v1/slips", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          qrPayload: row.payload,
          bankCode: row.identity.bankCode,
          bankQrCode: row.identity.bankQrCode,
          slipReference: row.identity.reference,
          kind,
          amountMinor: signed,
          currency: "THB",
          occurredOn: row.occurredOn,
          occurredAtTime: row.occurredAtTime,
          // Neither is readable from a slip and neither is worth a per-row control on a form whose
          // premise is not looking at each one. Both are correctable on the slip afterwards
          // (migration 013).
          counterparty: null,
          categoryId: null,
          note: null
        })
      });
      if (!response.ok) {
        // The body, not the response: `readError` looks for an `error` key on an already-parsed
        // object, and handing it a `Response` silently falls through to the fallback (GOTCHAS).
        const failure: unknown = await response.json().catch(() => null);
        patch(row.id, { state: "refused", reason: readError(failure, "This slip could not be captured.") });
        return;
      }
      // **Guarded like the failure path, because the failure modes are not symmetric.** An
      // unparsable 201 body means the slip *was* written — `capture_slip` had already committed —
      // and falling to the outer catch marked it `refused`, reporting as rejected a slip that is
      // in the ledger. The summary line then under-reports what was captured.
      const body: unknown = await response.json().catch(() => null);
      const captured = typeof body === "object" && body !== null && (body as { captured?: unknown }).captured === true;
      if (body === null) {
        patch(row.id, { state: "review", reason: "This slip was accepted but its confirmation could not be read. Check the ledger before capturing it again." });
        return;
      }
      // A slip already in the ledger is a plain outcome rather than an error — re-running a batch
      // over the same folder is expected, and it is what makes this safe to retry.
      patch(row.id, {
        state: captured ? "captured" : "duplicate",
        reason: captured ? null : "Already in the ledger. Nothing changed."
      });
    } catch {
      patch(row.id, { state: "refused", reason: "This slip could not be captured." });
    }
  }

  const busy = phase !== "idle";
  const unread = rows.some((row) => row.state === "queued");

  return (
    <section className="batch-bench" aria-labelledby="slip-batch-title">
      <div className="bench-heading">
        <p className="section-index">Slips in bulk</p>
        <div>
          <h2 id="slip-batch-title">Upload a backlog of slips</h2>
          <p>
            Choose many slip images at once. Each one&apos;s QR is read on this device for its bank and
            reference; reading the amount sends the image to Google Cloud Vision, which stores
            nothing, and the image is never stored here either. A slip is captured without a second
            look only when its amount read cleanly <b>and</b> its date came from the QR code or from
            the slip itself — never from today, because a backlog dated today can never pair with a
            statement. Everything else is listed below for you to fill in.
          </p>
        </div>
      </div>

      <div className="slip-controls">
        <label className="file-control">
          <span>Slip images</span>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            multiple
            disabled={busy}
            onChange={(event) => onFiles(event.target.files)}
          />
          <b>{rows.length > 0 ? `${rows.length} chosen` : "Choose slip images…"}</b>
        </label>

        <label className="batch-direction">
          <span>Direction for every slip</span>
          <select value={kind} disabled={busy} onChange={(event) => setKind(event.target.value as SlipKind)}>
            <option value="withdrawal">Money out</option>
            <option value="deposit">Money in</option>
          </select>
        </label>

        {rows.length > 0 && (
          <button type="button" className="secondary-button" disabled={busy || !unread} onClick={() => void readAll()}>
            {phase === "reading" ? "Reading…" : "Read these slips"}
          </button>
        )}
        {rows.length > 0 && <button type="button" onClick={clear} disabled={busy}>Discard</button>}
      </div>

      <p className="field-help batch-note">
        One direction applies to the whole batch, because nothing on a slip says which side of it you
        are. A batch holding both is two batches.
      </p>

      {status && <p className="status" role="status">{status}</p>}
      {error && <p className="status error" role="alert">{error}</p>}
      {busy && progress && (
        <p className="status" role="status">
          {phase === "reading" ? "Read" : "Captured"} {progress.done} of {progress.total}.
        </p>
      )}

      {rows.length > 0 && (
        <>
          <ol className="batch-rows">
            {rows.map((row) => (
              <li key={row.id} className="batch-row">
                <div className="batch-row-head">
                  <span className="batch-file">{row.fileName}</span>
                  <span className={`status-chip ${chipClass(row.state)}`}>{chipLabel(row.state)}</span>
                </div>

                {row.identity && (
                  <p className="batch-identity">
                    {row.identity.bankCode} · <span className="mono">{row.identity.reference}</span>
                  </p>
                )}

                {row.state === "ready" && (
                  <p className="batch-values">
                    <b>{formatThb(signedSlipAmount(amountMagnitude(row.amount)?.toString() ?? "0", kind) ?? "0")}</b>
                    {" on "}{row.occurredOn}
                    {" — "}
                    <span className="batch-source">
                      {row.dateSource === "qr" ? "date from the QR code" : "date read off the slip"}
                    </span>
                  </p>
                )}

                {row.reason && <p className="field-help batch-reason">{row.reason}</p>}

                {row.state === "review" && (
                  // Only the two values that can be missing. Identity is the QR's and is not
                  // editable here for the same reason it is not editable in the single form: a
                  // typeable identity would let one slip be re-typed into another's.
                  <div className="batch-fix">
                    <label>
                      <span>Date</span>
                      <input
                        type="date"
                        value={row.occurredOn}
                        min={dateWindow.earliest}
                        max={dateWindow.latest}
                        disabled={busy}
                        onChange={(event) => patch(row.id, { occurredOn: event.target.value })}
                      />
                    </label>
                    <label>
                      <span>Amount (THB)</span>
                      <input
                        inputMode="decimal"
                        value={row.amount}
                        placeholder="Amount from the slip"
                        disabled={busy}
                        onChange={(event) => patch(row.id, { amount: event.target.value })}
                      />
                    </label>
                    {/* **Said out loud, because silence here reads as the form ignoring you.** A
                        figure the strict grammar rejects leaves `rowIsSubmittable` false, so the
                        "N ready to capture" count simply fails to move and the row goes on showing
                        the reader's original refusal. The single-slip form surfaces this; this one
                        did not. */}
                    {row.amount.trim() !== "" && amountMagnitude(row.amount) === null && (
                      <p className="batch-reason" role="alert">
                        This is not an amount this ledger can store. Type it as digits with at most
                        two decimal places, and not zero.
                      </p>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ol>

          <div className="batch-summary">
            <p className="field-help">
              {counts.submittable} ready to capture
              {counts.review > 0 && `, ${counts.review} needing a value`}
              {counts.failed > 0 && `, ${counts.failed} whose QR could not be read`}
              {counts.captured > 0 && `, ${counts.captured} captured`}
              {counts.duplicate > 0 && `, ${counts.duplicate} already in the ledger`}
              {counts.refused > 0 && `, ${counts.refused} refused`}.
            </p>
            <button
              type="button"
              className="primary-button"
              disabled={busy || counts.submittable === 0}
              onClick={() => void captureAll()}
            >
              {phase === "capturing"
                ? "Capturing…"
                : `Capture ${counts.submittable} slip${counts.submittable === 1 ? "" : "s"}`}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
