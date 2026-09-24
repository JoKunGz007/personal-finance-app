"use client";

import { useState } from "react";
import { LedgerNote } from "@/app/ledger-note";
import { encodeForReader, readImageWords } from "@/lib/browser/ocr-reader";
import { captureLinemanRequest, deliveryCaptureResultSchema } from "@/lib/deliveries";
import { readLinemanOrder, readLinemanPage, type LinemanPage, type ParsedLinemanOrder } from "@/lib/delivery-lineman";
import { formatThb } from "@/lib/money";
import { ledgerRequest } from "@/lib/wire";

/**
 * Adding a LINE MAN order from its order-page screenshots (PLAN task 58 part 4, D-223).
 *
 * Each image goes to Google Cloud Vision through the app's own read route, and the order is read
 * **on this device**: only its parse is posted. **One order per pick** is the join's safety — the
 * later screenshots carry no order number, so two orders to the same address cannot be told
 * apart by their pixels — which is why the parsed order is shown for the owner to check before
 * anything is saved.
 */

type Entry =
  | { key: string; files: string; state: "reading" }
  | { key: string; files: string; state: "refused"; message: string }
  | { key: string; files: string; state: "ready" | "saving" | "failed"; order: ParsedLinemanOrder; message?: string }
  | { key: string; files: string; state: "saved"; order: ParsedLinemanOrder; outcome: string };

async function readPage(file: File): Promise<{ ok: true; page: LinemanPage } | { ok: false; message: string }> {
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file);
    const encoded = await encodeForReader(bitmap);
    if (!encoded) return { ok: false, message: "This image could not be prepared for the reader." };
    const read = await readImageWords(encoded);
    if (!read.ok) return { ok: false, message: read.why };
    const page = readLinemanPage(read.words);
    return page.ok ? { ok: true, page: page.value } : { ok: false, message: page.message };
  } catch {
    return { ok: false, message: "This image could not be opened on this device." };
  } finally {
    bitmap?.close();
  }
}

function describe(order: ParsedLinemanOrder): string {
  const when = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"
  }).format(new Date(order.orderedAt));
  const dishes = order.items.reduce((sum, item) => sum + item.quantity, 0);
  const paid = order.chargedMinor === order.totalMinor
    ? formatThb(order.totalMinor)
    : `${formatThb(order.totalMinor)}, of which ${formatThb(order.chargedMinor)} charged`;
  return `${when} · ${order.restaurant} · ${dishes} dish${dishes === 1 ? "" : "es"} · ${paid}`;
}

export function LinemanCapture({ onSaved }: { onSaved: () => void }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const update = (key: string, entry: Entry) => setEntries((current) => current.map((row) => (row.key === key ? entry : row)));

  async function choose(list: FileList | null) {
    // Screenshots are named in the order they were taken, so the name order is the page order.
    const files = [...(list ?? [])].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    if (files.length === 0) return;
    const key = `pick-${Date.now()}`;
    const names = files.map((file) => file.name).join(" + ");
    setEntries((current) => [{ key, files: names, state: "reading" }, ...current]);
    const pages: LinemanPage[] = [];
    for (const file of files) {
      const read = await readPage(file);
      if (!read.ok) {
        update(key, { key, files: names, state: "refused", message: `${file.name}: ${read.message}` });
        return;
      }
      pages.push(read.page);
    }
    const order = readLinemanOrder(pages);
    update(key, order.ok
      ? { key, files: names, state: "ready", order: order.value }
      : { key, files: names, state: "refused", message: order.message });
  }

  async function save(entry: { key: string; files: string; order: ParsedLinemanOrder }) {
    update(entry.key, { key: entry.key, files: entry.files, state: "saving", order: entry.order });
    const result = await ledgerRequest("/api/v1/deliveries", deliveryCaptureResultSchema, {
      fallback: "The order could not be saved.",
      unreachable: "The ledger could not be reached, so the order was not saved."
    }, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(captureLinemanRequest(entry.order))
    });
    if (!result.ok) {
      update(entry.key, { key: entry.key, files: entry.files, state: "failed", order: entry.order, message: result.why });
      return;
    }
    update(entry.key, { key: entry.key, files: entry.files, state: "saved", order: entry.order, outcome: result.data.captured ? "Saved." : "Already stored." });
    onSaved();
  }

  return (
    <section className="cash-bench compact" aria-labelledby="lineman-add-title">
      <div className="cash-heading">
        <p className="section-index">Add</p>
        <h2 id="lineman-add-title">A LINE MAN order</h2>
        <LedgerNote label="About reading LINE MAN screenshots">
          The screenshots are sent to Google Cloud Vision to be read, and stored nowhere, on either
          side. Only the order is kept: your name, phone and addresses are ignored and never stored.
        </LedgerNote>
      </div>
      <div className="slip-form">
        <p className="field-help">
          Pick one order&apos;s screenshots together, the one with the order number first, and check
          the order below before saving it.
        </p>
        <label className="account-control">
          <span>LINE MAN order-page screenshots</span>
          <input type="file" accept="image/*" multiple onChange={(event) => { void choose(event.target.files); event.target.value = ""; }} />
        </label>
        {entries.length > 0 ? (
          <ul className="receipt-queue">
            {entries.map((entry) => (
              <li key={entry.key}>
                <strong>{entry.files}</strong>
                {entry.state === "reading" ? <span role="status">Sending to Google Cloud Vision to be read…</span> : null}
                {entry.state === "refused" ? <span className="status error" role="alert">Not read: {entry.message}</span> : null}
                {"order" in entry ? <span>{describe(entry.order)}</span> : null}
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
      </div>
    </section>
  );
}
