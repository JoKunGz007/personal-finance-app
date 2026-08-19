"use client";

import { type LedgerAccount } from "@/lib/accounts";
import {
  ALL_ACCOUNTS,
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
  modes,
  onLoad,
  onSelectAccount,
  onOrderChange,
  onStatusChange,
  onQueryChange
}: {
  busy: boolean;
  /** Whether the ledger has been asked for at all. Nothing but Reload is shown until it has. */
  loaded: boolean;
  accounts: LedgerAccount[] | null;
  selected: string;
  order: Order;
  status: StatusFilter;
  query: string;
  modes: LedgerModes;
  onLoad: () => void;
  onSelectAccount: (accountId: string) => void;
  onOrderChange: (order: Order) => void;
  onStatusChange: (status: StatusFilter) => void;
  onQueryChange: (query: string) => void;
}) {
  const suspended = modes.picking || modes.pickingCard;

  return (
    <>
      <div className="bench-heading">
        <p className="section-index">Ledger</p>
        <div>
          <h2 id="ledger-title">Transactions</h2>
          <p>
            Everything committed to the ledger, and every slip still waiting for the statement
            that will confirm it. Source facts are immutable here — the one thing this view
            writes is your say over a match, which is stored beside them and never in them.
          </p>
        </div>
      </div>

      <div className="ledger-controls">
        {/* Every control here is suspended while a slip is being matched — including Reload,
            which would drop the choice half-made. The mode is a different question about the
            ledger, not a filter of it. */}
        <button type="button" className="secondary-button" disabled={busy || suspended} onClick={onLoad}>
          {busy ? "Loading…" : loaded ? "Reload" : "Load transactions"}
        </button>
        {loaded ? (
          <>
            <label className="account-control">
              <span>Account</span>
              <select value={selected} disabled={suspended} onChange={(event) => onSelectAccount(event.target.value)}>
                <option value={ALL_ACCOUNTS}>All accounts</option>
                {(accounts ?? []).map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.label} ···· {account.last_four}
                  </option>
                ))}
              </select>
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
          </>
        ) : null}
      </div>
    </>
  );
}
