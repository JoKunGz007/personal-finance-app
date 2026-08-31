"use client";

import { type LedgerAccount } from "@/lib/accounts";
import { AccountSelect } from "@/app/account-select";
import { LedgerNote } from "@/app/ledger-note";
import {
  ALL_STATUSES,
  type LedgerModes,
  type Order,
  type StatusFilter
} from "@/app/ledger-shared";

/**
 * The ledger's heading and its control bar.
 *
 * **Every control here is suspended while a match is being chosen by hand** — including Reload,
 * which would drop the choice half-made. Picking a row is a different question about the ledger,
 * not a filter of it, which is why the controls are disabled rather than merely ignored.
 *
 * Split out of `app/transactions-view.tsx` with no change to what it renders.
 */
export function LedgerControls({
  busy,
  loaded,
  accounts,
  selected,
  order,
  status,
  query,
  dateFrom,
  dateTo,
  rangeUsable,
  modes,
  onLoad,
  onSelectAccount,
  onOrderChange,
  onStatusChange,
  onQueryChange,
  onDateFromChange,
  onDateToChange
}: {
  busy: boolean;
  /** Whether rows have arrived. The filters are meaningless until they have, so they wait. */
  loaded: boolean;
  accounts: LedgerAccount[] | null;
  selected: string;
  order: Order;
  status: StatusFilter;
  query: string;
  /** The ledger window's bounds, empty string for an open end (PLAN task 47, migration 024). */
  dateFrom: string;
  dateTo: string;
  /** Whether the current pair is sendable — false for a transposed range. */
  rangeUsable: boolean;
  modes: LedgerModes;
  onLoad: () => void;
  onSelectAccount: (accountId: string) => void;
  onOrderChange: (order: Order) => void;
  onStatusChange: (status: StatusFilter) => void;
  onQueryChange: (query: string) => void;
  onDateFromChange: (value: string) => void;
  onDateToChange: (value: string) => void;
}) {
  const suspended = modes.picking || modes.pickingCard;

  return (
    <>
      {/* The heading is one line and a disclosure. The paragraph that stood here described what
          the table already shows and what the rows already say, and it did it above the fold on
          the one page whose point is the table. It is unchanged, just folded (PLAN task 42). */}
      <div className="bench-heading compact">
        <p className="section-index">Ledger</p>
        <div>
          {/* Sibling of the heading, not a child: this `<h2>` names the `<section>` through
              `aria-labelledby`, and a button inside it joins that name. See `app/ledger-note.tsx`. */}
          <h2 id="ledger-title">Transactions</h2>
          <div className="heading-note">
            <LedgerNote label="About these transactions">
              Everything committed to the ledger, and every slip still waiting for the statement
              that will confirm it. Source facts are immutable here — the one thing this view
              writes is your say over a match, which is stored beside them and never in them.
              {" "}
              {/* Folded here rather than repeated on each excluded row (PLAN task 48, D-156's
                  rule). It explains a principle and never changes, so a row wears the chip and
                  this says once what the chip means. */}
              A row marked <strong>Excluded</strong> is not counted as income or spending. The
              money still moved, so it stays in every balance — what changes is only the totals
              above and the statistics page.
            </LedgerNote>
          </div>
        </div>
      </div>

      <div className="ledger-controls">
        {/* Every control here is suspended while a slip is being matched — including Reload,
            which would drop the choice half-made. The mode is a different question about the
            ledger, not a filter of it. */}
        {/* **"Load transactions" is now the retry, not the way in.** The ledger loads on arrival
            (PLAN task 43), so the label the owner ordinarily sees is Reload; the other wording is
            what is left after a first load that failed, and pressing it is the way back. */}
        <button type="button" className="secondary-button" disabled={busy || suspended || !rangeUsable} onClick={onLoad}>
          {busy ? "Loading…" : loaded ? "Reload" : "Load transactions"}
        </button>
        {loaded ? (
          <>
            <AccountSelect accounts={accounts} value={selected} onChange={onSelectAccount} disabled={suspended} />
            {/* **The one control here that changes what is fetched, not merely what is shown.**
                Account, Order, Status and Filter all narrow rows already held by the client
                (`app/transactions-view.tsx`); a date window has to narrow the fetch itself, because
                a page holds only the newest rows and an owner asking for March cannot be answered
                by hiding what happens to already be on screen. That is why this does not filter
                live like the others: it only takes effect on the next Reload, which is the one
                button here that already means "go back to the server" (migration 024, PLAN task
                47). Both ends independently optional, on the same "open end" rule the statistics
                picker uses (`lib/date-range.ts`). */}
            <label className="account-control">
              <span>From</span>
              <input type="date" value={dateFrom} disabled={suspended} max={dateTo === "" ? undefined : dateTo}
                onChange={(event) => onDateFromChange(event.target.value)} />
            </label>
            <label className="account-control">
              <span>To</span>
              <input type="date" value={dateTo} disabled={suspended} min={dateFrom === "" ? undefined : dateFrom}
                onChange={(event) => onDateToChange(event.target.value)} />
            </label>
            <label className="account-control">
              <span>Order</span>
              <select value={order} onChange={(event) => onOrderChange(event.target.value as Order)}>
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
              </select>
            </label>
            {/* The status a row carries is no longer written on the row itself when it is
                the unremarkable one, so this is where the question gets asked instead
                (D-064). */}
            <label className="account-control">
              <span>Status</span>
              <select value={status} disabled={suspended} onChange={(event) => onStatusChange(event.target.value as StatusFilter)}>
                <option value={ALL_STATUSES}>All statuses</option>
                <option value="verified">Verified by slip</option>
                <option value="awaiting-statement">Awaiting statement</option>
                <option value="needs-review">Needs review</option>
                <option value="statement-only">Statement only</option>
                <option value="cash">Cash</option>
                {/* Only a notification card can be in this state: it is the one captured record
                    that prints a balance, so it is the only one with a figure that can
                    contradict the statement row it otherwise fits. */}
                <option value="balance-conflict">Balance disagrees</option>
              </select>
            </label>
            <label className="account-control">
              <span>Filter</span>
              <input
                type="search"
                name="transaction-filter"
                value={query}
                disabled={suspended}
                placeholder="Description, reference, branch…"
                onChange={(event) => onQueryChange(event.target.value)}
              />
            </label>
            {!rangeUsable && (
              <p className="field-help ledger-range-warning" role="alert">
                That date range ends before it starts, so Reload has nothing to send.
              </p>
            )}
          </>
        ) : null}
      </div>
    </>
  );
}
