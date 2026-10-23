"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { displayBranch, formatDate, formatMonthParts } from "@/app/ledger-shared";
import { CollapsibleSection } from "@/app/collapsible-section";
import { LedgerNote } from "@/app/ledger-note";
import { useBenchList } from "@/app/use-bench-list";
import { formatThb } from "@/lib/money";
import { receiptStatisticsSchema, type ReceiptStatistics } from "@/lib/receipt-statistics";
import { ledgerRequest } from "@/lib/wire";

/** "2026-10" as "Oct 2026", with the digits in the figures font. */
const monthLabel = (month: string) => formatMonthParts(month).map((part, index) =>
  part.numeric ? <span key={index} className="figure">{part.value}</span> : part.value
);

type ItemRow = ReceiptStatistics["mostBought"][number];

function ItemTable({ id, title, items }: { id: string; title: string; items: readonly ItemRow[] }) {
  return (
    <CollapsibleSection id={id} title={title}>
      {items.length === 0 ? <p className="field-help">No complete item list yet.</p> : (
        <div className="table-scroll">
          <table>
            <caption className="sr-only">{title}, from complete item lists.</caption>
            <thead>
              <tr>
                <th scope="col">Item</th>
                <th scope="col" className="numeric">Qty</th>
                <th scope="col" className="numeric">Spent</th>
                <th scope="col" className="numeric">Receipts</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.name}>
                  <td data-label="Item" className="receipt-name">{item.name}</td>
                  <td data-label="Qty" className="numeric">{item.quantity}</td>
                  <td data-label="Spent" className="numeric">{formatThb(item.spend)}</td>
                  <td data-label="Receipts" className="numeric">{item.receipts}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </CollapsibleSection>
  );
}

function GroupTable({ id, title, label, rows }: {
  id: string; title: string; label: string;
  rows: readonly { key: string; name: ReactNode; receipts: number; net: string }[];
}) {
  return (
    <CollapsibleSection id={id} title={title}>
      <div className="table-scroll">
        <table>
          <caption className="sr-only">{title}, over every stored receipt.</caption>
          <thead>
            <tr>
              <th scope="col">{label}</th>
              <th scope="col" className="numeric">Receipts</th>
              <th scope="col" className="numeric">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <td data-label={label} className="receipt-name">{row.name}</td>
                <td data-label="Receipts" className="numeric">{row.receipts}</td>
                <td data-label="Total" className="numeric">{formatThb(row.net)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </CollapsibleSection>
  );
}

/**
 * What the stored receipts show (migration 031). **A separate lens, never a ledger total**: every
 * purchase here is already in the ledger as the payment that made it, so these figures are not
 * added to anything and do not appear on `/statistics`. Loaded on arrival, like the receipt list.
 */
export function ReceiptStatisticsPanel({ saves }: { saves: number }) {
  const { data: stats, busy, error, signInNote, load } = useBenchList(() => ledgerRequest("/api/v1/receipts/statistics", receiptStatisticsSchema, {
    fallback: "Receipt statistics could not be loaded.",
    unreachable: "The ledger could not be reached, so receipt statistics are not shown.",
    offContract: "The receipt statistics did not match their contract, so none are shown."
  }), { signInText: "Sign in to see receipt statistics." });

  const shown = useRef(false);
  useEffect(() => { shown.current = stats !== null; }, [stats]);
  // A save changes the figures; reload them if they are on screen.
  useEffect(() => { if (saves > 0 && shown.current) void load(); }, [saves, load]);

  const totals = stats?.totals;
  return (
    <section className="captured-slips" aria-labelledby="receipt-stats-title">
      <div className="bench-heading">
        <p className="section-index">Statistics</p>
        <div>
          <h2 id="receipt-stats-title">What the receipts show</h2>
          <div className="heading-note">
            <LedgerNote label="About receipt statistics">
              Every stored receipt. They&apos;re already on the ledger as payments, so nothing here
              adds to a ledger total. Item figures use only receipts with a complete item list, and
              skip stamps, promotions and ฿0 lines.
            </LedgerNote>
          </div>
        </div>
      </div>

      <div className="ledger-controls">
        <button type="button" className="secondary-button" aria-label={stats ? "Reload statistics" : undefined} disabled={busy} onClick={() => void load()}>
          {busy ? "Loading…" : stats ? "Reload" : "Show receipt statistics"}
        </button>
      </div>

      {signInNote ? <p className="ledger-status" role="status">{signInNote}</p> : null}

      {error ? (
        <div className="warning error" role="alert">
          <strong>Not loaded</strong>
          <span>{error}</span>
        </div>
      ) : null}

      {stats === null || totals === undefined ? null : totals.receipts === 0 ? (
        <p className="ledger-empty" role="status">No receipt has been stored on this ledger yet.</p>
      ) : (
        <>
          <p className="field-help">
            {totals.firstDate && totals.lastDate ? `${formatDate(totals.firstDate)} to ${formatDate(totals.lastDate)}` : "—"} · {totals.receipts} receipt{totals.receipts === 1 ? "" : "s"}
            {totals.partialReceipts > 0
              ? ` · ${totals.partialReceipts} partial, so ${totals.partialReceipts === 1 ? "its" : "their"} items are left out of the item figures`
              : ""}
          </p>
          <dl className="statement-strip">
            <div><dt>Receipts</dt><dd>{totals.receipts}</dd></div>
            <div><dt>Total</dt><dd>{formatThb(totals.net)}</dd></div>
            <div><dt>Average receipt</dt><dd>{totals.averageNet ? formatThb(totals.averageNet.quotient) : "—"}</dd></div>
            <div><dt>Items bought</dt><dd>{totals.units}</dd></div>
            <div><dt>Items before discounts</dt><dd>{formatThb(totals.itemSpend)}</dd></div>
            <div><dt>Discounts</dt><dd className="positive">{totals.discounts === "0" ? formatThb("0") : `−${formatThb(totals.discounts)}`}</dd></div>
          </dl>

          <ItemTable id="receipt-most-bought" title="Most bought" items={stats.mostBought} />
          <ItemTable id="receipt-most-spent" title="Most spent on" items={stats.mostSpent} />
          <GroupTable id="receipt-months" title="By month" label="Month"
            rows={stats.months.map((m) => ({ key: m.month, name: monthLabel(m.month), receipts: m.receipts, net: m.net }))} />
          <GroupTable id="receipt-payment" title="By payment" label="Paid by"
            rows={stats.paymentMethods.map((p) => ({ key: p.method ?? "", name: p.method ?? "Not printed", receipts: p.receipts, net: p.net }))} />
          <GroupTable id="receipt-branches" title="By branch" label="Branch"
            rows={stats.branches.map((b) => ({ key: b.storeCode, name: displayBranch(b.branchName), receipts: b.receipts, net: b.net }))} />
        </>
      )}
    </section>
  );
}
