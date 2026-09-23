"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LedgerNote } from "@/app/ledger-note";
import { ReceiptStatisticsPanel } from "@/app/receipt-statistics";
import { encodeForReader, readImageWords } from "@/lib/browser/ocr-reader";
import { formatThb } from "@/lib/money";
import { receiptMatchResponseSchema, type ReceiptLedgerRow, type ReceiptMatchRequest } from "@/lib/receipt-match";
import type { ReceiptForm } from "@/lib/receipt-pdf";
import { groupScreenshotPages, readScreenshotPage, readScreenshotReceipt, type ScreenshotPage } from "@/lib/receipt-screenshot";
import type { ParsedReceipt } from "@/lib/receipt-text";
import { receiptCaptureBody, receiptCaptureResultSchema, receiptListSchema, type CaptureForm, type StoredReceipt } from "@/lib/receipts";
import { ledgerRequest } from "@/lib/wire";

type WorkerReply =
  | { type: "receipt"; form: ReceiptForm; receipt: ParsedReceipt }
  | { type: "error"; message: string };

type Picked =
  | { key: string; file: string; state: "reading" }
  | { key: string; file: string; state: "refused"; message: string }
  | { key: string; file: string; state: "ready"; form: CaptureForm; receipt: ParsedReceipt }
  | { key: string; file: string; state: "saving"; form: CaptureForm; receipt: ParsedReceipt }
  | { key: string; file: string; state: "saved"; form: CaptureForm; receipt: ParsedReceipt; outcome: string }
  | { key: string; file: string; state: "failed"; form: CaptureForm; receipt: ParsedReceipt; message: string };

const FORM_LABEL: Record<CaptureForm, string> = { condensed: "Short receipt", full: "Full tax invoice", screenshot: "Screenshot" };

// A receipt is a page or two; a worker silent for this long is not going to answer.
const READ_TIMEOUT_MS = 60_000;

/**
 * One PDF, one worker: the bytes are transferred in and only the parse comes back. **Always
 * resolves** — an unreadable file, a worker error and a worker that never answers all become a
 * refusal — so one bad file cannot leave itself and every file after it stuck on "Reading".
 */
async function readReceiptPdf(file: File): Promise<WorkerReply> {
  let bytes: ArrayBuffer;
  try {
    bytes = await file.arrayBuffer();
  } catch {
    return { type: "error", message: "This file could not be opened on this device." };
  }
  return new Promise<WorkerReply>((resolve) => {
    const worker = new Worker(new URL("../workers/receipt.worker.ts", import.meta.url), { type: "module" });
    const timer = setTimeout(() => finish({ type: "error", message: "Reading this PDF took too long, so it was stopped." }), READ_TIMEOUT_MS);
    function finish(reply: WorkerReply) {
      clearTimeout(timer);
      worker.terminate();
      resolve(reply);
    }
    worker.onmessage = (event: MessageEvent<WorkerReply>) => finish(event.data);
    worker.onerror = () => finish({ type: "error", message: "This PDF could not be read on this device." });
    worker.postMessage({ type: "read", bytes }, [bytes]);
  });
}

/**
 * One screenshot's header and item lines, read through the app's Vision route — the image leaves
 * the device here, and the page says so above the picker. Always resolves.
 */
async function readScreenshotFile(file: File): Promise<{ ok: true; page: ScreenshotPage } | { ok: false; message: string }> {
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file);
    const encoded = await encodeForReader(bitmap);
    if (!encoded) return { ok: false, message: "This image could not be prepared for the reader." };
    const read = await readImageWords(encoded);
    if (!read.ok) return { ok: false, message: read.why };
    const page = readScreenshotPage(read.words);
    return page.ok ? { ok: true, page: page.value } : { ok: false, message: page.message };
  } catch {
    return { ok: false, message: "This image could not be opened on this device." };
  } finally {
    bitmap?.close();
  }
}

/** A receipt's identity across picks: its store and unpadded number, as the stitch groups them. */
const screenshotKey = (page: ScreenshotPage) => `${page.storeCode}:${page.receiptNumber.replace(/^0+(?=.)/u, "")}`;

const isPdf = (file: File) => file.type === "application/pdf" || /\.pdf$/iu.test(file.name);

function summary(form: CaptureForm, receipt: ParsedReceipt): string {
  const when = receipt.purchasedAtTime ? `${receipt.purchasedAt} ${receipt.purchasedAtTime}` : receipt.purchasedAt;
  const items = receipt.items.filter((item) => !item.isPromotion).length;
  return `${FORM_LABEL[form]} · ${when} · ${receipt.branchName} · ${items} item${items === 1 ? "" : "s"} · ${formatThb(receipt.netMinor)}`;
}

export function ReceiptsBench() {
  const [picked, setPicked] = useState<Picked[]>([]);
  const [receipts, setReceipts] = useState<StoredReceipt[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Keys with a save in flight. A ref, not state: a second press can land before React has
  // re-rendered the first press's "saving", and state read then is still "ready". A duplicate POST
  // merges harmlessly but writes an audit row and bumps the backup sequence for nothing.
  const inFlight = useRef(new Set<string>());
  // Whether the stored list is showing *now*, read when a save lands rather than when it began.
  const listShown = useRef(false);
  // Bumped on every save, so statistics already on screen reload rather than go stale.
  const [saves, setSaves] = useState(0);
  // Screenshots of receipts that did not read complete, kept so a missing part picked later joins
  // the parts already read — the refusal tells the owner to "add a screenshot", which only works
  // if an added one meets the earlier ones. Keyed by receipt; a complete reading drops its pages.
  const heldPages = useRef(new Map<string, { file: string; page: ScreenshotPage }[]>());
  useEffect(() => { listShown.current = receipts !== null; }, [receipts]);

  const update = (key: string, next: Picked) => setPicked((current) => current.map((entry) => (entry.key === key ? next : entry)));

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    const result = await ledgerRequest("/api/v1/receipts", receiptListSchema, {
      fallback: "Receipts could not be loaded.",
      unreachable: "The ledger could not be reached, so receipts are not shown.",
      offContract: "The receipts response did not match its contract, so none are shown."
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.why);
      return;
    }
    setReceipts(result.data.receipts);
  }, []);

  async function choose(files: FileList | null) {
    if (!files || files.length === 0) return;
    const stamp = Date.now();
    const all = [...files];
    const pdfs = all.filter(isPdf).map((file, index) => ({ key: `${stamp}-p${index}-${file.name}`, file }));
    const images = all.filter((file) => !isPdf(file));
    // Screenshots become one queue entry per *receipt*, not per image, so they wait under one
    // placeholder until every image is read and the ones of the same receipt can be joined.
    const shotsKey = `${stamp}-shots`;
    setPicked((current) => [
      ...pdfs.map(({ key, file }) => ({ key, file: file.name, state: "reading" as const })),
      ...(images.length > 0 ? [{ key: shotsKey, file: `${images.length} screenshot${images.length === 1 ? "" : "s"}`, state: "reading" as const }] : []),
      ...current
    ]);
    // One at a time: each worker loads pdf.js, and a phone reading several at once gains nothing.
    for (const { key, file } of pdfs) {
      const reply = await readReceiptPdf(file);
      update(key, reply.type === "receipt"
        ? { key, file: file.name, state: "ready", form: reply.form, receipt: reply.receipt }
        : { key, file: file.name, state: "refused", message: reply.message });
    }
    if (images.length === 0) return;

    const pages: { file: string; page: ScreenshotPage }[] = [];
    const entries: Picked[] = [];
    for (const [index, file] of images.entries()) {
      const read = await readScreenshotFile(file);
      if (read.ok) pages.push({ file: file.name, page: read.page });
      else entries.push({ key: `${shotsKey}-x${index}`, file: file.name, state: "refused", message: read.message });
    }
    // Each receipt's entry is keyed by the receipt, so re-reading it with an added screenshot
    // replaces the earlier entry instead of listing the receipt twice.
    const regrouped = new Set<string>();
    for (const group of groupScreenshotPages(pages)) {
      const receiptKey = screenshotKey(group[0]!.page);
      const all = [...(heldPages.current.get(receiptKey) ?? []), ...group];
      regrouped.add(`shot:${receiptKey}`);
      const names = all.map((entry) => entry.file).join(" + ");
      const read = readScreenshotReceipt(all.map((entry) => entry.page));
      if (read.ok && read.value.completeness === "complete") heldPages.current.delete(receiptKey);
      else heldPages.current.set(receiptKey, all);
      const key = `shot:${receiptKey}`;
      entries.push(read.ok
        ? { key, file: names, state: "ready", form: "screenshot", receipt: read.value }
        : { key, file: names, state: "refused", message: read.message });
    }
    setPicked((current) => current
      .filter((entry) => !regrouped.has(entry.key))
      .flatMap((entry) => (entry.key === shotsKey ? entries : [entry])));
  }

  async function save(entry: Extract<Picked, { state: "ready" | "failed" }>) {
    if (inFlight.current.has(entry.key)) return;
    inFlight.current.add(entry.key);
    try {
      await saveOnce(entry);
    } finally {
      inFlight.current.delete(entry.key);
    }
  }

  async function saveOnce(entry: Extract<Picked, { state: "ready" | "failed" }>) {
    update(entry.key, { key: entry.key, file: entry.file, state: "saving", form: entry.form, receipt: entry.receipt });
    const result = await ledgerRequest("/api/v1/receipts", receiptCaptureResultSchema, {
      fallback: "The receipt could not be saved.",
      unreachable: "The ledger could not be reached, so the receipt was not saved."
    }, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(receiptCaptureBody(entry.form, entry.receipt))
    });
    if (!result.ok) {
      update(entry.key, { key: entry.key, file: entry.file, state: "failed", form: entry.form, receipt: entry.receipt, message: result.why });
      return;
    }
    const outcome = result.data.captured
      ? "Saved."
      : result.data.itemsReplaced
        ? "Merged into the receipt already stored for this purchase; its item list was upgraded."
        : "Merged into the receipt already stored for this purchase; its existing item list was kept.";
    update(entry.key, { key: entry.key, file: entry.file, state: "saved", form: entry.form, receipt: entry.receipt, outcome });
    if (listShown.current) void load();
    setSaves((count) => count + 1);
  }

  const ready = picked.filter((entry): entry is Extract<Picked, { state: "ready" | "failed" }> => entry.state === "ready" || entry.state === "failed");

  return (
    <>
      <section className="cash-bench compact" aria-labelledby="receipt-add-title">
        <div className="cash-heading">
          <p className="section-index">Add</p>
          <h2 id="receipt-add-title">Read receipts</h2>
        </div>
        <div className="slip-form">
          <p className="field-help">
            PDFs are read on this device. Screenshots of the 7-Eleven app are sent to Google Cloud
            Vision to be read (stored nowhere, either side); pick every screenshot of a long receipt
            together and they are joined into one.
          </p>
          <label className="account-control">
            <span>7-Eleven e-tax PDFs or app screenshots</span>
            <input type="file" accept="application/pdf,.pdf,image/*" multiple onChange={(event) => { void choose(event.target.files); event.target.value = ""; }} />
          </label>
          {ready.length > 1 ? (
            <div className="slip-actions">
              <button type="button" className="primary-button" onClick={() => { for (const entry of ready) void save(entry); }}>
                Save all {ready.length}
              </button>
            </div>
          ) : null}
        </div>

        {picked.length > 0 ? (
          <ul className="receipt-queue">
            {picked.map((entry) => (
              <li key={entry.key}>
                <strong>{entry.file}</strong>
                {/* Only a PDF is read on the device; the screenshot batch's placeholder must not say so. */}
                {entry.state === "reading" ? <span role="status">{entry.key.endsWith("-shots") ? "Sending to Google Cloud Vision to be read…" : "Reading on this device…"}</span> : null}
                {entry.state === "refused" ? <span className="status error" role="alert">Not read: {entry.message}</span> : null}
                {"receipt" in entry ? (
                  <>
                    <span>{summary(entry.form, entry.receipt)}</span>
                    {entry.receipt.completeness === "partial" ? (
                      <span className="status error">{entry.form === "screenshot"
                        ? "Its items do not add up to its total, so part of the receipt is probably not in the screenshots. Add the missing part, or save it as partial: the total counts, the item list does not."
                        : "Its own checks did not all pass, so it is saved as partial: the total counts, the item list does not."}</span>
                    ) : null}
                  </>
                ) : null}
                {entry.state === "ready" || entry.state === "failed" ? (
                  <span className="slip-actions">
                    {entry.state === "failed" ? <span className="status error" role="alert">{entry.message}</span> : null}
                    <button type="button" className="secondary-button" onClick={() => void save(entry)}>Save</button>
                  </span>
                ) : null}
                {entry.state === "saving" ? <span role="status">Saving…</span> : null}
                {entry.state === "saved" ? <span role="status">{entry.outcome}</span> : null}
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <StoredReceipts receipts={receipts} busy={busy} error={error} onLoad={() => void load()} />
      <ReceiptStatisticsPanel saves={saves} />
    </>
  );
}

function StoredReceipts({ receipts, busy, error, onLoad }: {
  receipts: StoredReceipt[] | null;
  busy: boolean;
  error: string | null;
  onLoad: () => void;
}) {
  return (
    <section className="captured-slips" aria-labelledby="stored-receipts-title">
      <div className="bench-heading">
        <p className="section-index">Stored</p>
        <div>
          <h2 id="stored-receipts-title">On this ledger</h2>
          <div className="heading-note">
            <LedgerNote label="About stored receipts">
              Every receipt stored here, newest first, with the forms it was read from. A partial
              receipt&rsquo;s total is trusted and its item list is not; saving the other form of
              the same purchase can complete it.
            </LedgerNote>
          </div>
        </div>
      </div>

      <div className="ledger-controls">
        <button type="button" className="secondary-button" disabled={busy} onClick={onLoad}>
          {busy ? "Loading…" : receipts ? "Reload" : "Show stored receipts"}
        </button>
      </div>

      {error ? (
        <div className="warning error" role="alert">
          <strong>Not loaded</strong>
          <span>{error}</span>
        </div>
      ) : null}

      {receipts === null ? null : receipts.length === 0 ? (
        <p className="ledger-empty" role="status">No receipt has been stored on this ledger yet.</p>
      ) : (
        <ul className="receipt-list">
          {receipts.map((receipt) => (
            <li key={receipt.id}>
              <details>
                <summary>
                  <span className="receipt-when">
                    <time dateTime={receipt.purchased_on}>{receipt.purchased_on}</time>
                    {receipt.purchased_at_time ? ` ${receipt.purchased_at_time.slice(0, 5)}` : ""}
                  </span>
                  <span className="receipt-branch">{receipt.branch_name}</span>
                  <span className="receipt-count">{receipt.items.filter((item) => !item.is_promotion).length} items</span>
                  <span className={`receipt-chip ${MATCH_CHIP[receipt.match.status].tone}`}>{MATCH_CHIP[receipt.match.status].label}</span>
                  {/* `items_complete`, not `completeness`: capture overwrites the latter with the latest
                      source's verdict even when it keeps the stored items, and "partial" here means
                      the items shown are not trusted — the rule the statistics count by. */}
                  {receipt.items_complete ? null : <span className="receipt-chip warn">partial</span>}
                  <span className="receipt-amount numeric">{formatThb(receipt.net_minor)}</span>
                </summary>
                <ReceiptMatch receipt={receipt} onChanged={onLoad} />
                <p className="ledger-status">
                  Read from {receipt.sources.map((source) => FORM_LABEL[source]).join(" and ")}
                  {receipt.payment_method ? ` · paid by ${receipt.payment_method}` : ""}
                </p>
                <div className="table-scroll">
                  <table className="ledger-table">
                    <thead>
                      <tr><th>Item</th><th className="numeric">Qty</th><th className="numeric">Amount</th></tr>
                    </thead>
                    <tbody>
                      {receipt.items.map((item) => (
                        <tr key={item.position} className={item.is_promotion ? "receipt-promotion" : undefined}>
                          <td data-label="Item">{item.display_name ?? item.name}{item.is_promotion ? " (promotion)" : ""}</td>
                          <td data-label="Qty" className="numeric">{item.quantity}</td>
                          <td data-label="Amount" className="numeric">{formatThb(item.amount_minor)}</td>
                        </tr>
                      ))}
                      {receipt.discounts.map((discount) => (
                        <tr key={`d${discount.position}`} className="receipt-discount">
                          <td data-label="Item">Discount</td>
                          <td data-label="Qty" className="numeric"></td>
                          <td data-label="Amount" className="numeric">−{formatThb(discount.amount_minor)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** A ledger row in one line: when it posted, how long after the purchase, and what the bank called it. */
function describeRow(row: ReceiptLedgerRow): string {
  const when = row.source_time ? `${row.source_date} ${row.source_time.slice(0, 5)}` : row.source_date;
  const lag = row.lag_minutes === null
    ? ""
    : row.lag_minutes >= 0
      ? ` (${row.lag_minutes} min after)`
      : ` (${-row.lag_minutes} min before)`;
  return `${when}${lag} · ${row.description}`;
}

// The summary's chip. Green only for a row that is on the ledger, amber for something the owner
// can act on, muted otherwise — "no row" is normal for a wallet purchase and must not read as an error.
const MATCH_CHIP = {
  matched: { label: "on the ledger", tone: "ok" },
  linked: { label: "on the ledger", tone: "ok" },
  declined: { label: "no ledger row", tone: "quiet" },
  ambiguous: { label: "pick a row", tone: "warn" },
  none: { label: "no ledger row", tone: "quiet" }
} as const;

const MATCH_SENTENCE = {
  matched: "Paid by this ledger row, found automatically:",
  linked: "You linked this receipt to:",
  declined: "You said no ledger row pays for this receipt.",
  ambiguous: "More than one ledger row could be this payment, so none was chosen. Pick one below if you know which.",
  none: "No ledger row found. That is normal for a wallet-balance purchase, or when the statement covering this date is not imported yet."
} as const;

/**
 * Which ledger row a receipt itemizes (migration 030, D-212). A receipt is never money, so
 * nothing here changes a balance; the owner's decision always wins over the automatic rule, and
 * a link is held by the database to the receipt's exact total.
 */
function ReceiptMatch({ receipt, onChanged }: { receipt: StoredReceipt; onChanged: () => void }) {
  const { match } = receipt;
  const [choice, setChoice] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(request: Omit<ReceiptMatchRequest, "expectedRevision">) {
    setSaving(true);
    setError(null);
    const result = await ledgerRequest(`/api/v1/receipts/${receipt.id}/match`, receiptMatchResponseSchema, {
      fallback: "The decision could not be saved.",
      unreachable: "The ledger could not be reached, so nothing was saved."
    }, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...request, expectedRevision: match.revision })
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.why);
      return;
    }
    // The chosen row is about to leave the choices; a kept id would re-link it on the next press.
    setChoice("");
    onChanged();
  }

  const showsRow = match.status === "matched" || match.status === "linked";
  // Rows a link could name, other than the one already in force.
  const choices = match.options.filter((option) => option.transaction_id !== match.row?.transaction_id);

  return (
    <div className="receipt-match">
      <p className="ledger-status">
        {match.status === "none" && receipt.purchased_at_time === null
          // Read only from a full invoice, which prints no time: the rule cannot establish
          // "at or after", so "normal for a wallet purchase" would be the wrong explanation.
          ? "This receipt has no purchase time, so it cannot be matched automatically. Save its short receipt or a screenshot to add the time, or link a row below."
          : MATCH_SENTENCE[match.status]}
        {showsRow ? <> <span>{match.row ? describeRow(match.row) : "a ledger row outside the three days around this receipt."}</span></> : null}
      </p>
      <div className="slip-actions">
        {showsRow ? (
          <button type="button" className="secondary-button" disabled={saving}
            onClick={() => void decide({ decision: "unmatched", transactionId: null })}>
            {match.status === "linked" ? "Unlink" : "Not this row"}
          </button>
        ) : null}
        {choices.length > 0 ? (
          <>
            <label className="account-control">
              <span>{showsRow ? "Link a different row" : "Link a row of the same amount"}</span>
              <select value={choice} disabled={saving} onChange={(event) => setChoice(event.target.value)}>
                <option value="">Choose a row…</option>
                {choices.map((option) => (
                  <option key={option.transaction_id} value={option.transaction_id}>{describeRow(option)}</option>
                ))}
              </select>
            </label>
            <button type="button" className="secondary-button" disabled={saving || choice === ""}
              onClick={() => void decide({ decision: "matched", transactionId: choice })}>
              Link
            </button>
          </>
        ) : null}
        {saving ? <span role="status">Saving…</span> : null}
      </div>
      {error ? <p className="status error" role="alert">{error}</p> : null}
    </div>
  );
}
