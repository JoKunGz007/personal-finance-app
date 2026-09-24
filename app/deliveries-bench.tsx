"use client";

import { useCallback, useState } from "react";
import { LedgerMatchPanel } from "@/app/ledger-match-panel";
import { LedgerNote } from "@/app/ledger-note";
import { LinemanCapture } from "@/app/lineman-capture";
import { useLoadOnArrival } from "@/app/use-load-on-arrival";
import { formatThb } from "@/lib/money";
import {
  deliveryListSchema, deliverySyncReportSchema, deliveryTime, describeSyncReport,
  type DeliverySyncReport, type StoredDelivery, type StoredRide
} from "@/lib/deliveries";
import { deliveryMatchResponseSchema, rideMatchResponseSchema } from "@/lib/delivery-match";
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
    ridesCaptured: total.ridesCaptured + next.ridesCaptured,
    ridesAlreadyStored: total.ridesAlreadyStored + next.ridesAlreadyStored,
    notReceipts: total.notReceipts + next.notReceipts,
    refused,
    truncated: next.truncated
  };
}

/** "4.2 km · 17 min" from stored metres and minutes. */
function tripLength(ride: StoredRide): string {
  const km = (ride.distance_meters / 1000).toFixed(ride.distance_meters % 1000 === 0 ? 0 : 1);
  const hours = Math.floor(ride.duration_minutes / 60), minutes = ride.duration_minutes % 60;
  return `${km} km · ${hours > 0 ? `${hours} h ` : ""}${minutes} min`;
}

/** Bangkok wall time, which is what the e-receipt printed. */
function bangkokTime(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok", year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
  }).format(new Date(iso));
}

export function DeliveriesBench() {
  const [deliveries, setDeliveries] = useState<StoredDelivery[] | null>(null);
  const [rides, setRides] = useState<StoredRide[] | null>(null);
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
    setRides(result.data.rides);
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
            Reads the Grab e-receipts, food and rides, in the statement mailbox. Nothing is stored
            twice.
          </p>
          <div className="slip-actions">
            <button type="button" className="primary-button" disabled={syncing} onClick={() => void sync()}>
              {syncing ? "Syncing…" : "Sync Grab receipts"}
            </button>
          </div>
          {syncNote ? <p className="ledger-status" role="status">{syncNote}</p> : null}
          {syncError ? <p className="status error" role="alert">{syncError}</p> : null}
        </div>
      </section>

      <LinemanCapture onSaved={() => void load()} />

      <section className="captured-slips" aria-labelledby="stored-deliveries-title">
        <div className="bench-heading">
          <p className="section-index">Stored</p>
          <div>
            <h2 id="stored-deliveries-title">Food orders</h2>
            <div className="heading-note">
              <LedgerNote label="About stored orders">
                Every order stored here, newest first. A GrabFood order is dated when its e-receipt
                was sent, and matches a GRAB row of its exact total up to two hours before. A LINE MAN
                order is dated when it was placed, and matches a LINE PAY or LINE MAN row of what was
                charged, from 5 minutes before that time to 30 after.
                An order paid with เป๋าตัง was paid outside the app, in full or for its food, and
                only what was charged is ever a ledger row.
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
                    <span className="receipt-when"><time dateTime={deliveryTime(delivery)}>{bangkokTime(deliveryTime(delivery))}</time></span>
                    <span className="receipt-branch">{delivery.restaurant}</span>
                    <span className="receipt-count">{dishCount(delivery)}</span>
                    {delivery.platform === "lineman" ? <span className="receipt-chip quiet">LINE MAN</span> : null}
                    <span className={`receipt-chip ${MATCH_CHIP[delivery.match.status].tone}`}>{MATCH_CHIP[delivery.match.status].label}</span>
                    {delivery.adjustments.some((row) => row.kind === "unprinted") ? <span className="receipt-chip warn">not all on the e-receipt</span> : null}
                    {delivery.charged_minor !== null && delivery.charged_minor !== delivery.total_minor && delivery.charged_minor !== "0"
                      ? <span className="receipt-chip quiet">{formatThb(delivery.charged_minor)} charged, food paid outside</span> : null}
                    <span className="receipt-amount numeric">{formatThb(delivery.total_minor)}</span>
                  </summary>
                  <p className="ledger-status">
                    {PLATFORM_LABEL[delivery.platform]} {delivery.booking_id}{delivery.payment_method ? ` · ${delivery.payment_method}` : ""}
                  </p>
                  {delivery.match.status === "outside" ? null : (
                    <LedgerMatchPanel
                      endpoint={`/api/v1/deliveries/${delivery.id}/match`}
                      match={delivery.match}
                      sentence={MATCH_SENTENCE[delivery.match.status]}
                      outsideRange="a ledger row outside the three days around this order."
                      responseSchema={deliveryMatchResponseSchema}
                      onChanged={() => void load()}
                    />
                  )}
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

      {rides === null ? null : (
        <section className="captured-slips" aria-labelledby="stored-rides-title">
          <div className="bench-heading">
            <p className="section-index">Rides</p>
            <div>
              <h2 id="stored-rides-title">Grab rides</h2>
              <div className="heading-note">
                <LedgerNote label="About stored rides">
                  Every ride stored here, newest first, dated when it ended. A ride itemizes a card
                  payment the ledger already holds, found by its exact total on a GRAB row from 30
                  minutes before pickup to 15 after — Grab charges when the ride is booked. A row that both an order and a ride could be is left for you to pick.
                </LedgerNote>
              </div>
            </div>
          </div>
          {rides.length === 0 ? (
            <p className="ledger-empty" role="status">No ride has been stored on this ledger yet.</p>
          ) : (
            <ul className="receipt-list">
              {rides.map((ride) => (
                <li key={ride.id}>
                  <details>
                    <summary>
                      <span className="receipt-when"><time dateTime={ride.dropped_off_at}>{bangkokTime(ride.dropped_off_at)}</time></span>
                      <span className="receipt-branch">{ride.pickup_place} → {ride.dropoff_place}</span>
                      <span className="receipt-count">{ride.ride_type}</span>
                      <span className={`receipt-chip ${RIDE_CHIP[ride.match.status].tone}`}>{RIDE_CHIP[ride.match.status].label}</span>
                      <span className="receipt-amount numeric">{formatThb(ride.total_minor)}</span>
                    </summary>
                    <p className="ledger-status">
                      {ride.booking_id} · {tripLength(ride)} · picked up {bangkokTime(ride.picked_up_at)} · paid by {ride.payment_method}
                    </p>
                    {ride.match.status === "outside" ? null : (
                      <LedgerMatchPanel
                        endpoint={`/api/v1/rides/${ride.id}/match`}
                        match={ride.match}
                        sentence={RIDE_SENTENCE[ride.match.status]}
                        outsideRange="a ledger row outside the three days around this ride."
                        responseSchema={rideMatchResponseSchema}
                        onChanged={() => void load()}
                      />
                    )}
                    <div className="table-scroll">
                      <table className="ledger-table">
                        <thead>
                          <tr><th>Line</th><th className="numeric">Amount</th></tr>
                        </thead>
                        <tbody>
                          <tr><td data-label="Line">Fare</td><td data-label="Amount" className="numeric">{formatThb(ride.fare_minor)}</td></tr>
                          <tr><td data-label="Line">Platform fee</td><td data-label="Amount" className="numeric">{formatThb(ride.platform_fee_minor)}</td></tr>
                          {ride.adjustments.map((row) => (
                            <tr key={row.position} className={row.kind === "charge" ? undefined : "receipt-discount"}>
                              <td data-label="Line">{row.name}</td>
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
      )}
    </>
  );
}

function dishCount(delivery: { items: readonly { quantity: number }[] }): string {
  const dishes = delivery.items.reduce((sum, item) => sum + item.quantity, 0);
  return `${dishes} ${dishes === 1 ? "dish" : "dishes"}`;
}

const PLATFORM_LABEL = { grabfood: "GrabFood", lineman: "LINE MAN" } as const;

// The summary's chip, the receipts page's tones: green for a row on the ledger, amber for
// something the owner can act on, muted otherwise.
const MATCH_CHIP = {
  matched: { label: "on the ledger", tone: "ok" },
  linked: { label: "on the ledger", tone: "ok" },
  declined: { label: "no ledger row", tone: "quiet" },
  ambiguous: { label: "pick a row", tone: "warn" },
  none: { label: "no ledger row", tone: "quiet" },
  outside: { label: "paid outside the app", tone: "quiet" }
} as const;

// What each match status says, for an order or a ride: the same sentences but for the noun, the
// ride's ambiguity (a food order can want its row) and what paid outside means.
function matchSentences(noun: "order" | "ride", ambiguousBecause: string, outside: string) {
  return {
    matched: "Paid by this ledger row, found automatically:",
    linked: `You linked this ${noun} to:`,
    declined: `You said no ledger row pays for this ${noun}.`,
    ambiguous: `More than one ledger row could be this payment${ambiguousBecause} so none was chosen. Pick one below if you know which.`,
    none: `No ledger row found. That is normal for ${noun === "order" ? "an order" : "a ride"} paid with another card, or when the statement covering this date is not imported yet.`,
    outside
  } as const;
}

const MATCH_SENTENCE = matchSentences("order", ",", "Paid outside the app, so there is no card row.");

const RIDE_CHIP = {
  ...MATCH_CHIP,
  outside: { label: "paid by discounts", tone: "quiet" }
} as const;

const RIDE_SENTENCE = matchSentences("ride", " — or a food order wants the same row —", "Paid in full by discounts, so there is no card row.");
