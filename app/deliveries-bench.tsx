"use client";

import { useCallback, useState } from "react";
import { LedgerNote } from "@/app/ledger-note";
import { useLoadOnArrival } from "@/app/use-load-on-arrival";
import { formatThb } from "@/lib/money";
import {
  deliveryListSchema, deliverySyncReportSchema, describeSyncReport, paidOutsidePlatform,
  type DeliverySyncReport, type StoredDelivery
} from "@/lib/deliveries";
import { ledgerRequest } from "@/lib/wire";

// One request reads until its time budget and says `truncated`; the page asks again. A backfill of
// four hundred-receipt bundles takes a few rounds; this bound only stops a runaway loop.
const MAX_SYNC_ROUNDS = 20;

function addReports(total: DeliverySyncReport, next: DeliverySyncReport): DeliverySyncReport {
  const refused = { ...total.refused };
  for (const [code, count] of Object.entries(next.refused)) refused[code] = (refused[code] ?? 0) + count;
  return {
    messages: total.messages + next.messages,
    captured: total.captured + next.captured,
    alreadyStored: total.alreadyStored + next.alreadyStored,
    rides: total.rides + next.rides,
    notReceipts: total.notReceipts + next.notReceipts,
    refused,
    truncated: next.truncated
  };
}

/** Bangkok wall time, which is what the e-receipt printed. */
function bangkokTime(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok", year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
  }).format(new Date(iso));
}

export function DeliveriesBench() {
  const [deliveries, setDeliveries] = useState<StoredDelivery[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signInNote, setSignInNote] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncNote, setSyncNote] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const load = useCallback(async (automatic = false) => {
    setBusy(true);
    setError(null);
    setSignInNote(null);
    const result = await ledgerRequest("/api/v1/deliveries", deliveryListSchema, {
      fallback: "Delivery orders could not be loaded.",
      unreachable: "The ledger could not be reached, so orders are not shown.",
      offContract: "The orders response did not match its contract, so none are shown."
    });
    setBusy(false);
    if (!result.ok) {
      if (automatic && (result.status === 401 || result.status === 403)) {
        setSignInNote(result.status === 401 ? "Sign in to see stored orders." : result.why);
        return;
      }
      setError(result.why);
      return;
    }
    setDeliveries(result.data.deliveries);
  }, []);
  useLoadOnArrival(load, signInNote !== null);

  async function sync() {
    setSyncing(true);
    setSyncError(null);
    setSyncNote("Reading the mailbox…");
    let total: DeliverySyncReport | null = null;
    for (let round = 0; round < MAX_SYNC_ROUNDS; round += 1) {
      const result = await ledgerRequest("/api/v1/deliveries/sync", deliverySyncReportSchema, {
        fallback: "The mailbox could not be read.",
        offContract: "The sync response did not match its contract."
      }, { method: "POST" });
      if (!result.ok) {
        setSyncError(result.why);
        break;
      }
      total = total ? addReports(total, result.data) : result.data;
      setSyncNote(`${describeSyncReport(total)}${total.truncated ? " Still reading…" : ""}`);
      if (!total.truncated) break;
    }
    setSyncing(false);
    if (total) {
      const refused = Object.entries(total.refused);
      setSyncNote(`${describeSyncReport(total)}${refused.length > 0
        ? ` Not read: ${refused.map(([code, count]) => `${count} ${code.toLowerCase().replaceAll("_", " ")}`).join(", ")}.`
        : ""}${total.truncated ? " More mail is waiting; sync again." : ""}`);
    }
    await load();
  }

  return (
    <>
      <section className="cash-bench compact" aria-labelledby="delivery-sync-title">
        <div className="cash-heading">
          <p className="section-index">Sync</p>
          <h2 id="delivery-sync-title">From the mailbox</h2>
        </div>
        <div className="slip-form">
          <p className="field-help">
            Reads GrabFood e-receipts that reach the statement mailbox, forwarded or backfilled. Ride
            receipts are skipped for now. An order already stored is never stored twice.
          </p>
          <div className="slip-actions">
            <button type="button" className="primary-button" disabled={syncing} onClick={() => void sync()}>
              {syncing ? "Syncing…" : "Sync GrabFood orders"}
            </button>
          </div>
          {syncNote ? <p className="ledger-status" role="status">{syncNote}</p> : null}
          {syncError ? <p className="status error" role="alert">{syncError}</p> : null}
        </div>
      </section>

      <section className="captured-slips" aria-labelledby="stored-deliveries-title">
        <div className="bench-heading">
          <p className="section-index">Stored</p>
          <div>
            <h2 id="stored-deliveries-title">On this ledger</h2>
            <div className="heading-note">
              <LedgerNote label="About stored orders">
                Every order stored here, newest first, dated when its e-receipt was sent. An order
                itemizes a payment the ledger already holds. A ฿0 order was paid outside Grab, under
                the co-payment scheme, and is never a card payment.
              </LedgerNote>
            </div>
          </div>
        </div>

        <div className="ledger-controls">
          <button type="button" className="secondary-button" disabled={busy} onClick={() => void load()}>
            {busy ? "Loading…" : deliveries ? "Reload" : "Show stored orders"}
          </button>
        </div>

        {signInNote ? <p className="ledger-status" role="status">{signInNote}</p> : null}
        {error ? (
          <div className="warning error" role="alert">
            <strong>Not loaded</strong>
            <span>{error}</span>
          </div>
        ) : null}

        {deliveries === null ? null : deliveries.length === 0 ? (
          <p className="ledger-empty" role="status">No order has been stored on this ledger yet.</p>
        ) : (
          <ul className="receipt-list">
            {deliveries.map((delivery) => (
              <li key={delivery.id}>
                <details>
                  <summary>
                    <span className="receipt-when"><time dateTime={delivery.receipt_sent_at}>{bangkokTime(delivery.receipt_sent_at)}</time></span>
                    <span className="receipt-branch">{delivery.restaurant}</span>
                    <span className="receipt-count">{delivery.items.reduce((sum, item) => sum + item.quantity, 0)} dishes</span>
                    {paidOutsidePlatform(delivery) ? <span className="receipt-chip quiet">paid outside Grab</span> : null}
                    {delivery.adjustments.some((row) => row.kind === "unprinted") ? <span className="receipt-chip warn">not all on the e-receipt</span> : null}
                    <span className="receipt-amount numeric">{formatThb(delivery.total_minor)}</span>
                  </summary>
                  <p className="ledger-status">
                    GrabFood {delivery.booking_id}{delivery.payment_method ? ` · ${delivery.payment_method}` : ""}
                  </p>
                  <div className="table-scroll">
                    <table className="ledger-table">
                      <thead>
                        <tr><th>Dish</th><th className="numeric">Qty</th><th className="numeric">Amount</th></tr>
                      </thead>
                      <tbody>
                        {delivery.items.map((item) => (
                          <tr key={item.position}>
                            <td data-label="Dish">{item.name}{item.options.length > 0 ? <small> · {item.options.join(", ")}</small> : null}</td>
                            <td data-label="Qty" className="numeric">{item.quantity}</td>
                            <td data-label="Amount" className="numeric">{formatThb(item.amount_minor)}</td>
                          </tr>
                        ))}
                        {delivery.delivery_fee_minor === null ? null : (
                          <tr>
                            <td data-label="Dish">Delivery</td>
                            <td data-label="Qty" className="numeric"></td>
                            <td data-label="Amount" className="numeric">{formatThb(delivery.delivery_fee_minor)}</td>
                          </tr>
                        )}
                        {delivery.adjustments.map((row) => (
                          <tr key={`a${row.position}`} className={row.kind === "charge" ? undefined : "receipt-discount"}>
                            <td data-label="Dish">
                              {row.name}
                              {/* The reader's own line for a gap the e-receipt never explains (D-219). */}
                              {row.kind === "unprinted" ? <small> · e.g. GrabCoins, see the Grab app</small> : null}
                            </td>
                            <td data-label="Qty" className="numeric"></td>
                            <td data-label="Amount" className="numeric">{row.kind === "charge" ? "" : "−"}{formatThb(row.amount_minor)}</td>
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
    </>
  );
}
