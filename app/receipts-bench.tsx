"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LedgerNote } from "@/app/ledger-note";
import { formatThb } from "@/lib/money";
import type { ReceiptForm } from "@/lib/receipt-pdf";
import type { ParsedReceipt } from "@/lib/receipt-text";
import { receiptCaptureBody, receiptCaptureResultSchema, receiptListSchema, type StoredReceipt } from "@/lib/receipts";
import { ledgerRequest } from "@/lib/wire";

type WorkerReply =
  | { type: "receipt"; form: ReceiptForm; receipt: ParsedReceipt }
  | { type: "error"; message: string };

type Picked =
  | { key: string; file: string; state: "reading" }
  | { key: string; file: string; state: "refused"; message: string }
  | { key: string; file: string; state: "ready"; form: ReceiptForm; receipt: ParsedReceipt }
  | { key: string; file: string; state: "saving"; form: ReceiptForm; receipt: ParsedReceipt }
  | { key: string; file: string; state: "saved"; form: ReceiptForm; receipt: ParsedReceipt; outcome: string }
  | { key: string; file: string; state: "failed"; form: ReceiptForm; receipt: ParsedReceipt; message: string };

const FORM_LABEL: Record<ReceiptForm | "screenshot", string> = { condensed: "Short receipt", full: "Full tax invoice", screenshot: "Screenshot" };

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

function summary(form: ReceiptForm, receipt: ParsedReceipt): string {
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
    const batch = [...files].map((file, index) => ({ key: `${Date.now()}-${index}-${file.name}`, file }));
    setPicked((current) => [...batch.map(({ key, file }) => ({ key, file: file.name, state: "reading" as const })), ...current]);
    // One at a time: each worker loads pdf.js, and a phone reading several at once gains nothing.
    for (const { key, file } of batch) {
      const reply = await readReceiptPdf(file);
      update(key, reply.type === "receipt"
        ? { key, file: file.name, state: "ready", form: reply.form, receipt: reply.receipt }
        : { key, file: file.name, state: "refused", message: reply.message });
    }
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
  }

  const ready = picked.filter((entry): entry is Extract<Picked, { state: "ready" | "failed" }> => entry.state === "ready" || entry.state === "failed");

  return (
    <>
      <section className="cash-bench compact" aria-labelledby="receipt-add-title">
        <div className="cash-heading">
          <p className="section-index">Add</p>
          <h2 id="receipt-add-title">Read receipt PDFs</h2>
        </div>
        <div className="slip-form">
          <label className="account-control">
            <span>7-Eleven e-tax PDFs</span>
            <input type="file" accept="application/pdf,.pdf" multiple onChange={(event) => { void choose(event.target.files); event.target.value = ""; }} />
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
                {entry.state === "reading" ? <span role="status">Reading on this device…</span> : null}
                {entry.state === "refused" ? <span className="status error" role="alert">Not read: {entry.message}</span> : null}
                {"receipt" in entry ? (
                  <>
                    <span>{summary(entry.form, entry.receipt)}</span>
                    {entry.receipt.completeness === "partial" ? (
                      <span className="status error">Its own checks did not all pass, so it is saved as partial: the total counts, the item list does not.</span>
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
                  <time dateTime={receipt.purchased_on}>{receipt.purchased_on}</time>
                  {receipt.purchased_at_time ? ` ${receipt.purchased_at_time.slice(0, 5)}` : ""}
                  {" · "}{receipt.branch_name}
                  {" · "}{receipt.items.filter((item) => !item.is_promotion).length} items
                  {" · "}<span className="numeric">{formatThb(receipt.net_minor)}</span>
                  {receipt.completeness === "partial" ? " · partial" : ""}
                </summary>
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
                        <tr key={item.position}>
                          <td data-label="Item">{item.display_name ?? item.name}{item.is_promotion ? " (promotion)" : ""}</td>
                          <td data-label="Qty" className="numeric">{item.quantity}</td>
                          <td data-label="Amount" className="numeric">{formatThb(item.amount_minor)}</td>
                        </tr>
                      ))}
                      {receipt.discounts.map((discount) => (
                        <tr key={`d${discount.position}`}>
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
