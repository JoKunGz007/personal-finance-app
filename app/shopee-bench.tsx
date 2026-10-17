"use client";

import { useCallback, useId, useState } from "react";
import { formatDate } from "@/app/ledger-shared";
import { useLoadOnArrival } from "@/app/use-load-on-arrival";
import { getShopeeView, postShopeeLinks, postShopeeMatch } from "@/lib/browser/shopee-client";
import { formatThb } from "@/lib/money";
import {
  confirmMatchBody, linkBody, sumMinor, undoMatchBody,
  type ShopeeView, type ShopeeViewOrder, type ShopeeViewRow
} from "@/lib/shopee-view";

type WriteResult = { ok: true } | { ok: false; why: string };
type Act = (write: () => Promise<WriteResult>) => void;

/** The Bangkok calendar date of an instant, as `YYYY-MM-DD` (sv-SE prints that order). */
function bangkokDate(iso: string): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date(iso));
}

function monthLabel(month: string): string {
  return new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric", timeZone: "Asia/Bangkok" })
    .format(new Date(`${month}-01T00:00:00+07:00`));
}

const KIND_LABEL = { bank_debit: "Bank debit", wallet: "Wallet", spaylater: "SPayLater", other: "Other" } as const;

type Chip = { label: string; tone: "ok" | "warn" | "quiet" };

// The `wallet` and `spaylater` states only name the payment kind; the chip reads the links and proposals.
function matchChip(order: ShopeeViewOrder, view: ShopeeView): Chip {
  const linkedAs = (kind: string) => view.links.some((l) => l.orderId === order.id && l.kind === kind);
  switch (order.match.state) {
    case "matched":
    case "auto": return { label: "Matched", tone: "ok" };
    case "combined_proposed": return { label: "Proposal", tone: "warn" };
    case "wallet":
      if (linkedAs("wallet_topup")) return { label: "Top-up linked", tone: "ok" };
      if (view.walletTopups.some((w) => w.orderId === order.id)) return { label: "Proposal", tone: "warn" };
      return { label: "Wallet", tone: "quiet" };
    case "spaylater":
      return linkedAs("spaylater_repayment") ? { label: "Repayment linked", tone: "ok" } : { label: "SPayLater", tone: "quiet" };
    default: return { label: "Not matched", tone: "quiet" };
  }
}

const LIST_LIMIT = 20;

export function ShopeeBench() {
  const [view, setView] = useState<ShopeeView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signInNote, setSignInNote] = useState<string | null>(null);
  const [all, setAll] = useState(false);

  const load = useCallback(async (automatic = false) => {
    setBusy(true);
    setError(null);
    setSignInNote(null);
    const result = await getShopeeView();
    setBusy(false);
    if (!result.ok) {
      if (automatic && (result.status === 401 || result.status === 403)) {
        setSignInNote(result.status === 401 ? "Sign in to see Shopee orders." : result.why);
        return;
      }
      setError(result.why);
      return;
    }
    setView(result.data);
  }, []);
  useLoadOnArrival(load, signInNote !== null);

  // A write that fails (a 409 clash included) shows its message after the reload, which clears errors.
  const act = useCallback<Act>((write) => {
    void (async () => {
      setBusy(true);
      const result = await write();
      await load();
      if (!result.ok) setError(result.why);
    })();
  }, [load]);

  const months = view?.summary.months ?? [];
  const current = months.at(-1);

  return (
    <>
      <section className="captured-slips" aria-labelledby="shopee-month-title">
        <div className="bench-heading">
          <p className="section-index">Month</p>
          <div><h2 id="shopee-month-title">{current ? monthLabel(current.month) : "This month"}</h2></div>
        </div>
        <div className="ledger-controls">
          <button type="button" className="secondary-button" aria-label={view ? "Reload Shopee orders" : undefined} disabled={busy} onClick={() => void load()}>
            {busy ? "Loading…" : view ? "Reload" : "Show Shopee orders"}
          </button>
        </div>
        {signInNote ? <p className="ledger-status" role="status">{signInNote}</p> : null}
        {error ? (
          <div className="warning error" role="alert">
            <strong>Not loaded</strong>
            <span>{error}</span>
          </div>
        ) : null}
        {current ? (
          <>
            <dl className="shopee-figures">
              <div><dt>Orders</dt><dd className="numeric">{current.orders}</dd></div>
              <div><dt>Spent, net of refunds</dt><dd className="numeric">{formatThb(current.spentMinor)}</dd></div>
              {(Object.keys(KIND_LABEL) as (keyof typeof KIND_LABEL)[]).map((kind) => (
                <div key={kind}><dt>{KIND_LABEL[kind]}</dt><dd className="numeric">{formatThb(current.byKind[kind])}</dd></div>
              ))}
              <div><dt>Cancelled</dt><dd className="numeric">{current.cancelled}</dd></div>
            </dl>
            <p className="ledger-status">
              Shopee&apos;s own totals. They are never added to a ledger total.
            </p>
            <MonthStrip months={months} />
          </>
        ) : null}
      </section>

      {view ? <WaitingForYou view={view} busy={busy} act={act} /> : null}

      <section className="captured-slips" aria-labelledby="shopee-orders-title">
        <div className="bench-heading">
          <p className="section-index">Orders</p>
          <div><h2 id="shopee-orders-title">Shopee orders</h2></div>
        </div>
        {view === null ? null : view.orders.length === 0 ? (
          <p className="ledger-empty" role="status">No Shopee order has been stored on this ledger yet.</p>
        ) : (
          <>
            <ul className="receipt-list">
              {(all ? view.orders : view.orders.slice(0, LIST_LIMIT)).map((order) => (
                <OrderItem key={order.id} order={order} view={view} busy={busy} act={act} />
              ))}
            </ul>
            {view.orders.length > LIST_LIMIT ? (
              <button type="button" className="secondary-button list-more" aria-expanded={all} onClick={() => setAll((open) => !open)}>
                {all ? `Show the newest ${LIST_LIMIT}` : `Show all ${view.orders.length} orders`}
              </button>
            ) : null}
          </>
        )}
      </section>
    </>
  );
}

/** Twelve bars of net spend. SVG shapes carry their size as attributes, so the strict CSP holds. */
function MonthStrip({ months }: { months: ShopeeView["summary"]["months"] }) {
  const max = months.reduce((peak, m) => (BigInt(m.spentMinor) > peak ? BigInt(m.spentMinor) : peak), 1n);
  const slot = 30, plot = 100, top = 6;
  return (
    <figure className="shopee-strip">
      <svg viewBox={`0 0 ${slot * months.length} ${top + plot + 22}`} role="group" aria-label="Spent per month, last twelve months">
        {months.map((m, index) => {
          const spent = BigInt(m.spentMinor);
          const height = spent > 0n ? Math.max(1, Number((spent * 10000n) / max) / 10000 * plot) : 0;
          const label = `${monthLabel(m.month)}: ${formatThb(m.spentMinor)}, ${m.orders} orders`;
          return (
            <g key={m.month} role="img" aria-label={label}>
              <title>{label}</title>
              <rect className={index === months.length - 1 ? "shopee-bar shopee-bar-now" : "shopee-bar"}
                x={index * slot + 5} width={slot - 10} y={top + plot - height} height={height} rx={3} />
              <text x={index * slot + slot / 2} y={top + plot + 14} textAnchor="middle">{m.month.slice(5)}</text>
            </g>
          );
        })}
        <line x1={0} x2={slot * months.length} y1={top + plot} y2={top + plot} className="shopee-baseline" strokeWidth={1} />
      </svg>
    </figure>
  );
}

function OrderItem({ order, view, busy, act }: { order: ShopeeViewOrder; view: ShopeeView; busy: boolean; act: Act }) {
  const when = bangkokDate(order.paidAt ?? order.placedAt);
  const chip = matchChip(order, view);
  const row = order.match.state === "matched" || order.match.state === "auto"
    ? (order.match.transactionId ? view.rows[order.match.transactionId] : undefined)
    : undefined;
  const refunded = sumMinor(order.refunds.map((r) => r.refundMinor));
  const links = view.links.filter((l) => l.orderId === order.id);
  const matched = order.match.state === "matched" || order.match.state === "auto";
  // A combined checkout is undone whole (the route refuses a part), so undo every order on the row.
  const sameRow = matched
    ? view.orders.filter((o) => (o.match.state === "matched" || o.match.state === "auto") && o.match.transactionId === order.match.transactionId)
    : [];
  return (
    <li>
      <details>
        <summary>
          <span className="receipt-when"><time dateTime={order.paidAt ?? order.placedAt}>{formatDate(when)}</time></span>
          <span className="receipt-branch">{order.shop}</span>
          <span className={`receipt-chip ${chip.tone}`}>{chip.label}</span>
          <span className="receipt-amount numeric">{formatThb(order.totalMinor)}</span>
        </summary>
        <p className="ledger-status">
          Placed {formatDate(bangkokDate(order.placedAt))}
          {order.paidAt ? ` · paid ${formatDate(bangkokDate(order.paidAt))}` : ""} · {order.paymentMethod} ·{" "}
          <a className="shopee-order-link" href={order.orderUrl} target="_blank" rel="noopener noreferrer">Order {order.orderCode}</a>
        </p>
        {row ? (
          <p className="ledger-status">Ledger row: {formatDate(row.date)}{row.description ? ` · ${withoutEmptyNote(row.description)}` : ""}</p>
        ) : null}
        <ul>
          {order.items.map((item) => (
            <li key={item.position}>{item.name}{item.variation ? ` (${item.variation})` : ""} × {item.quantity}</li>
          ))}
        </ul>
        {order.refunds.length > 0 ? (
          <p className="ledger-status">
            Refunded {formatThb(refunded)} ({order.refunds.map((r) => `${formatThb(r.refundMinor)} to ${r.refundTo}`).join(", ")})
          </p>
        ) : null}
        {links.map((l) => (
          <p key={`${l.transactionId}|${l.kind}`} className="ledger-status">
            Linked: {LINK_LABEL[l.kind]} · {rowText(view.rows[l.transactionId])}{" "}
            <button type="button" className="secondary-button" disabled={busy}
              onClick={() => act(() => postShopeeLinks(linkBody(l.kind, l.transactionId, [order.id], "unlink")))}>
              Unlink
            </button>
          </p>
        ))}
        {matched ? (
          <div className="ledger-controls">
            <button type="button" className="secondary-button" disabled={busy}
              onClick={() => act(() => postShopeeMatch(undoMatchBody(sameRow)))}>
              {sameRow.length > 1 ? `Undo match (${sameRow.length} orders)` : "Undo match"}
            </button>
          </div>
        ) : null}
      </details>
    </li>
  );
}

const LINK_LABEL = { wallet_topup: "wallet top-up", spaylater_repayment: "SPayLater repayment", refund_deposit: "refund deposit" } as const;

/** Display only: the bank's text often ends in an empty "NOTE : -". */
function withoutEmptyNote(text: string): string {
  return text.replace(/\s+NOTE\s*:\s*-\s*$/i, "");
}

function rowText(row: ShopeeViewRow | undefined): string {
  if (!row) return "ledger row not in view";
  const text = withoutEmptyNote(row.description ?? row.label ?? "");
  return `${formatDate(row.date)}${text ? ` · ${text}` : ""} · ${formatThb(row.movement)}`;
}

function OrderLine({ order }: { order: ShopeeViewOrder }) {
  return <>{order.shop} · {formatDate(bangkokDate(order.paidAt ?? order.placedAt))} · {formatThb(order.totalMinor)}</>;
}

/** Everything the matcher proposes and the owner has not yet confirmed. Nothing here is automatic. */
function WaitingForYou({ view, busy, act }: { view: ShopeeView; busy: boolean; act: Act }) {
  const byId = new Map(view.orders.map((o) => [o.id, o]));
  const pick = (ids: readonly string[]) => ids.flatMap((id) => byId.get(id) ?? []);
  // A repayment waits for the owner until any order is linked to it: with candidates reaching back a
  // year (D-276), a finished plan's order stays a candidate forever and would hold the card open.
  const repayments = view.spaylaterRepayments.filter((r) => r.linkedOrderIds.length === 0);
  const empty = view.combined.length + view.walletTopups.length + repayments.length + view.refundDeposits.length === 0;
  return (
    <section className="captured-slips" aria-labelledby="shopee-waiting-title">
      <div className="bench-heading">
        <p className="section-index">Waiting</p>
        <div><h2 id="shopee-waiting-title">Waiting for you</h2></div>
      </div>
      {empty ? <p className="ledger-empty" role="status">Nothing is waiting for you.</p> : null}
      <ul className="receipt-list">
        {view.combined.map((c) => {
          const orders = pick(c.orderIds);
          return (
            <li key={`c-${c.transactionId}`}>
              <p>Combined checkout · {rowText(view.rows[c.transactionId])}</p>
              <ul>{orders.map((o) => <li key={o.id}><OrderLine order={o} /></li>)}</ul>
              <p className="ledger-status">Orders total {formatThb(sumMinor(orders.map((o) => o.totalMinor)))}</p>
              <button type="button" className="secondary-button" disabled={busy}
                onClick={() => act(() => postShopeeMatch(confirmMatchBody(c.transactionId, orders)))}>
                Confirm match
              </button>
            </li>
          );
        })}
        {view.walletTopups.map((w) => {
          const order = byId.get(w.orderId);
          if (!order) return null;
          return (
            <li key={`w-${w.orderId}`}>
              <p>Wallet-paid order · <OrderLine order={order} /></p>
              {w.transactionIds.map((tid) => (
                <p key={tid} className="ledger-status">
                  <span id={`topup-${w.orderId}-${tid}`}>Top-up candidate: {rowText(view.rows[tid])}</span>{" "}
                  <button type="button" className="secondary-button" disabled={busy} aria-describedby={`topup-${w.orderId}-${tid}`}
                    onClick={() => act(() => postShopeeLinks(linkBody("wallet_topup", tid, [order.id])))}>
                    Link
                  </button>
                </p>
              ))}
            </li>
          );
        })}
        {repayments.map((r) => (
          <SpaylaterCard key={`s-${r.transactionId}`} repayment={r} view={view} orders={pick(r.orderIds)} linkedOrders={pick(r.linkedOrderIds)} busy={busy} act={act} />
        ))}
        {view.refundDeposits.map((d) => {
          const order = byId.get(d.orderId);
          if (!order) return null;
          return (
            <li key={`r-${d.orderId}`}>
              <p>Refund deposit · <OrderLine order={order} /></p>
              <p className="ledger-status">
                {rowText(view.rows[d.transactionId])}{" "}
                <button type="button" className="secondary-button" disabled={busy}
                  onClick={() => act(() => postShopeeLinks(linkBody("refund_deposit", d.transactionId, [order.id])))}>
                  Match deposit
                </button>
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function SpaylaterCard({ repayment, view, orders, linkedOrders, busy, act }: {
  repayment: ShopeeView["spaylaterRepayments"][number]; view: ShopeeView; orders: ShopeeViewOrder[];
  linkedOrders: ShopeeViewOrder[]; busy: boolean; act: Act;
}) {
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(repayment.preselected));
  const linked = new Set(repayment.linkedOrderIds);
  const open = orders.filter((o) => !linked.has(o.id));
  const picked = open.filter((o) => chosen.has(o.id));
  const lineId = useId();
  // Count only: the other cards still waiting (as WaitingForYou shows them) that list this order.
  const alsoOn = (orderId: string) => view.spaylaterRepayments.filter((r) =>
    r.transactionId !== repayment.transactionId && r.linkedOrderIds.length === 0 && r.orderIds.includes(orderId)).length;
  return (
    <li>
      <p id={`${lineId}-line`}>SPayLater repayment · {rowText(view.rows[repayment.transactionId])}</p>
      {linkedOrders.map((o) => (
        <p key={o.id} className="ledger-status">
          Linked: <OrderLine order={o} />{" "}
          <button type="button" className="secondary-button" disabled={busy}
            onClick={() => act(() => postShopeeLinks(linkBody("spaylater_repayment", repayment.transactionId, [o.id], "unlink")))}>
            Unlink
          </button>
        </p>
      ))}
      {open.length > 0 ? <div role="group" aria-labelledby={`${lineId}-line`} className="shopee-pick-group">
        {open.map((o) => {
          const others = alsoOn(o.id);
          return (
          <label key={o.id} className="ledger-status shopee-pick">
            <input type="checkbox" checked={chosen.has(o.id)} disabled={busy}
              onChange={(e) => setChosen((prev) => {
                const next = new Set(prev);
                if (e.target.checked) next.add(o.id); else next.delete(o.id);
                return next;
              })} />
            <span><OrderLine order={o} />{others > 0 ? <span className="ledger-status"> · also on {others} other {others === 1 ? "repayment" : "repayments"}</span> : null}</span>
          </label>
          );
        })}
      </div> : null}
      {open.length > 0 ? (
        <>
          <p className="ledger-status">Selected {formatThb(sumMinor(picked.map((o) => o.totalMinor)))}</p>
          {picked.length === 0 ? <p className="ledger-status">Tick the order(s) this repayment paid</p> : null}
          <button type="button" className="secondary-button" disabled={busy || picked.length === 0} aria-describedby={`${lineId}-line`}
            onClick={() => act(() => postShopeeLinks(linkBody("spaylater_repayment", repayment.transactionId, picked.map((o) => o.id))))}>
            Link selected
          </button>
        </>
      ) : null}
    </li>
  );
}
