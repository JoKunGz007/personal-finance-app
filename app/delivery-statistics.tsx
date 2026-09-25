"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LedgerNote } from "@/app/ledger-note";
import { useLoadOnArrival } from "@/app/use-load-on-arrival";
import { deliveryStatisticsSchema, type DeliveryStatistics } from "@/lib/delivery-statistics";
import { formatThb } from "@/lib/money";
import { ledgerRequest } from "@/lib/wire";

const PLATFORM = { grabfood: "GrabFood", lineman: "LINE MAN" } as const;

function Table({ id, title, columns, rows }: {
  id: string;
  title: string;
  /** The first column is the name; the rest are right-aligned figures. */
  columns: readonly string[];
  rows: readonly { key: string; cells: readonly (string | number)[] }[];
}) {
  return (
    <section className="stats-section" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>{title}</h2>
      <div className="table-scroll">
        <table>
          <caption className="sr-only">{title}, over every stored order and ride.</caption>
          <thead>
            <tr>
              {columns.map((column, index) => (
                <th key={column} scope="col" className={index === 0 ? undefined : "numeric"}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                {row.cells.map((cell, index) => (
                  <td key={columns[index]} data-label={columns[index]} className={index === 0 ? "receipt-name" : "numeric"}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/**
 * What the stored orders and rides show (migration 037). **A separate lens, never a ledger total**,
 * as the receipt statistics are: each order and ride already reached the ledger as its payment.
 * Loaded on arrival, and reloaded when a Sync or a LINE MAN save changes what is stored.
 */
export function DeliveryStatisticsPanel({ changes }: { changes: number }) {
  const [stats, setStats] = useState<DeliveryStatistics | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signInNote, setSignInNote] = useState<string | null>(null);

  const load = useCallback(async (automatic = false) => {
    setBusy(true);
    setError(null);
    setSignInNote(null);
    const result = await ledgerRequest("/api/v1/deliveries/statistics", deliveryStatisticsSchema, {
      fallback: "Delivery statistics could not be loaded.",
      unreachable: "The ledger could not be reached, so delivery statistics are not shown.",
      offContract: "The delivery statistics did not match their contract, so none are shown."
    });
    setBusy(false);
    if (!result.ok) {
      if (automatic && (result.status === 401 || result.status === 403)) {
        setSignInNote(result.status === 401 ? "Sign in to see delivery statistics." : result.why);
        return;
      }
      setError(result.why);
      return;
    }
    setStats(result.data);
  }, []);
  useLoadOnArrival(load, signInNote !== null);

  const shown = useRef(false);
  useEffect(() => { shown.current = stats !== null; }, [stats]);
  useEffect(() => { if (changes > 0 && shown.current) void load(); }, [changes, load]);

  const totals = stats?.totals;
  return (
    <section className="captured-slips" aria-labelledby="delivery-stats-title">
      <div className="bench-heading">
        <p className="section-index">Statistics</p>
        <div>
          <h2 id="delivery-stats-title">What the orders and rides cost</h2>
          <div className="heading-note">
            <LedgerNote label="About delivery statistics">
              Every stored order and ride. They&apos;re already on the ledger as payments, so
              nothing here adds to a ledger total. Co-payment orders count at your share (50% in
              2025, 40% from 2026; the government pays at most ฿200 a day) plus the fee. Months are
              Bangkok time.
            </LedgerNote>
          </div>
        </div>
      </div>

      <div className="ledger-controls">
        <button type="button" className="secondary-button" disabled={busy} onClick={() => void load()}>
          {busy ? "Loading…" : stats ? "Reload" : "Show delivery statistics"}
        </button>
      </div>

      {signInNote ? <p className="ledger-status" role="status">{signInNote}</p> : null}

      {error ? (
        <div className="warning error" role="alert">
          <strong>Not loaded</strong>
          <span>{error}</span>
        </div>
      ) : null}

      {stats === null || totals === undefined ? null : totals.orders === 0 && stats.rides.rides === 0 ? (
        <p className="ledger-empty" role="status">No order or ride has been stored on this ledger yet.</p>
      ) : (
        <>
          <p className="field-help">
            {totals.firstDate} to {totals.lastDate} · {totals.orders} order{totals.orders === 1 ? "" : "s"}
          </p>
          <dl className="statement-strip">
            <div><dt>Orders</dt><dd>{totals.orders}</dd></div>
            <div><dt>Cost you</dt><dd>{formatThb(totals.spent)}</dd></div>
            <div><dt>Average order</dt><dd>{totals.averageSpent ? formatThb(totals.averageSpent.quotient) : "—"}</dd></div>
            <div><dt>Delivery fees</dt><dd>{formatThb(totals.deliveryFees)}</dd></div>
            <div><dt>Discounts</dt><dd className="positive">{totals.discounts === "0" ? formatThb("0") : `−${formatThb(totals.discounts)}`}</dd></div>
            <div><dt>ไทยช่วยไทย paid</dt><dd className="positive">{formatThb(totals.schemePaid)}</dd></div>
          </dl>

          <Table id="delivery-platforms" title="By app" columns={["App", "Orders", "Cost you"]}
            rows={stats.platforms.map((p) => ({ key: p.platform, cells: [PLATFORM[p.platform], p.orders, formatThb(p.spent)] }))} />
          <Table id="delivery-restaurants" title="Most spent at" columns={["Restaurant", "Orders", "Cost you"]}
            rows={stats.restaurants.map((r) => ({ key: r.restaurant, cells: [r.restaurant, r.orders, formatThb(r.spent)] }))} />
          <Table id="delivery-months" title="By month" columns={["Month", "Orders", "Food cost", "Rides", "Ride cost"]}
            rows={stats.months.map((m) => ({ key: m.month, cells: [m.month, m.orders, formatThb(m.spent), m.rides, formatThb(m.rideSpent)] }))} />

          <dl className="statement-strip">
            <div><dt>Rides</dt><dd>{stats.rides.rides}</dd></div>
            <div><dt>Ride cost</dt><dd>{formatThb(stats.rides.spent)}</dd></div>
            <div><dt>Average ride</dt><dd>{stats.rides.averageSpent ? formatThb(stats.rides.averageSpent.quotient) : "—"}</dd></div>
            <div><dt>Platform fees</dt><dd>{formatThb(stats.rides.platformFees)}</dd></div>
          </dl>
          <Table id="delivery-ride-types" title="By ride type" columns={["Ride type", "Rides", "Cost"]}
            rows={stats.rideTypes.map((t) => ({ key: t.rideType, cells: [t.rideType, t.rides, formatThb(t.spent)] }))} />
        </>
      )}
    </section>
  );
}
