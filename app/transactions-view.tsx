"use client";

import { useMemo, useState } from "react";
import { accountListSchema, type LedgerAccount } from "@/lib/accounts";
import { formatThb } from "@/lib/money";
import {
  combinedBalanceByTransaction,
  compareTransactions,
  matchesQuery,
  movementMinor,
  summarize,
  transactionListSchema,
  type AccountTransaction
} from "@/lib/transactions";
import { readError } from "@/lib/wire";

const ALL_ACCOUNTS = "all";
type Order = "newest" | "oldest";

function formatDate(date: string) {
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" })
    .format(new Date(`${date}T00:00:00+07:00`));
}

/**
 * Reads the confirmed ledger back (PLAN task 17). Front-end only: it calls the two
 * endpoints that already exist and adds no route, RPC or migration.
 *
 * Nothing loads until asked. Every other read surface in this app is driven by an
 * explicit action, and this one reaches real financial records, so a section that
 * fetched the whole ledger on page load would be the one place that stopped being
 * deliberate about it.
 */
export function TransactionsView() {
  const [accounts, setAccounts] = useState<LedgerAccount[] | null>(null);
  const [transactions, setTransactions] = useState<AccountTransaction[] | null>(null);
  const [selected, setSelected] = useState<string>(ALL_ACCOUNTS);
  const [order, setOrder] = useState<Order>("newest");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accountsById = useMemo(
    () => new Map((accounts ?? []).map((account) => [account.id, account])),
    [accounts]
  );

  // The account scope, before any text filter. Balances are derived from this rather
  // than from `visible`, because a running total of whatever a search matched would
  // not be a balance.
  const scope = useMemo(
    () => (transactions ?? []).filter((transaction) => selected === ALL_ACCOUNTS || transaction.account_id === selected),
    [transactions, selected]
  );

  const combined = useMemo(() => combinedBalanceByTransaction(scope), [scope]);

  const visible = useMemo(() => {
    const sorted = scope.filter((transaction) => matchesQuery(transaction, query)).sort(compareTransactions);
    if (order === "oldest") sorted.reverse();
    return sorted;
  }, [scope, query, order]);

  const totals = useMemo(() => summarize(visible), [visible]);

  const showCombined = selected === ALL_ACCOUNTS;

  // An account with no imported rows has no derivable balance, so the combined figure
  // cannot speak for it. Stated as a plain status of what *is* imported rather than a
  // warning about what is not: on this ledger most accounts are empty most of the
  // time, so a banner would fire on nearly every load and be read as noise.
  const importedAccounts = useMemo(() => {
    const withRows = new Set(scope.map((transaction) => transaction.account_id));
    return (accounts ?? []).filter((account) => withRows.has(account.id));
  }, [scope, accounts]);

  async function load() {
    setBusy(true);
    setError(null);
    try {
      const accountsResponse = await fetch("/api/v1/accounts", { cache: "no-store" });
      const accountsBody: unknown = await accountsResponse.json();
      if (!accountsResponse.ok) {
        setError(readError(accountsBody, "Accounts could not be loaded."));
        return;
      }
      const parsedAccounts = accountListSchema.safeParse(accountsBody);
      if (!parsedAccounts.success) {
        setError("The accounts response did not match its contract. Run the unit tests before trusting this view.");
        return;
      }

      // One call per account: list_account_transactions is per-account and there is
      // no all-accounts RPC. Fine at this scale; revisit past tens of thousands of
      // rows, when this becomes pagination and a server-side filter (PLAN task 17).
      const loaded: AccountTransaction[] = [];
      for (const account of parsedAccounts.data.accounts) {
        const response = await fetch(`/api/v1/accounts/${account.id}/transactions`, { cache: "no-store" });
        const body: unknown = await response.json();
        if (!response.ok) {
          setError(readError(body, `Transactions could not be loaded for ${account.label}.`));
          return;
        }
        const parsed = transactionListSchema.safeParse(body);
        if (!parsed.success) {
          setError(`The transactions response for ${account.label} did not match its contract.`);
          return;
        }
        for (const transaction of parsed.data.transactions) {
          loaded.push({ ...transaction, account_id: account.id });
        }
      }

      setAccounts(parsedAccounts.data.accounts);
      setTransactions(loaded);
    } catch {
      setError("The ledger could not be reached. Check that the local Supabase stack is running.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="ledger-band" aria-labelledby="ledger-title">
      <div className="bench-heading">
        <p className="section-index">Ledger / 05</p>
        <div>
          <h2 id="ledger-title">Confirmed transactions</h2>
          <p>
            Everything already committed to the ledger. Source facts are immutable here —
            this view reads them and never writes.
          </p>
        </div>
      </div>

      <div className="ledger-controls">
        <button type="button" className="secondary-button" disabled={busy} onClick={load}>
          {busy ? "Loading…" : transactions ? "Reload" : "Load transactions"}
        </button>
        {transactions ? (
          <>
            <label className="account-control">
              <span>Account</span>
              <select value={selected} onChange={(event) => setSelected(event.target.value)}>
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
              <select value={order} onChange={(event) => setOrder(event.target.value as Order)}>
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
              </select>
            </label>
            <label className="account-control">
              <span>Filter</span>
              <input
                type="search"
                name="transaction-filter"
                value={query}
                placeholder="Description, reference, branch…"
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
          </>
        ) : null}
      </div>

      {error ? (
        <div className="warning error" role="alert">
          <strong>Not loaded</strong>
          <span>{error}</span>
        </div>
      ) : null}

      {transactions ? (
        <>
          <dl className="statement-strip ledger-strip">
            <div><dt>Rows</dt><dd>{totals.rows}</dd></div>
            <div><dt>Deposits</dt><dd className="positive">+{formatThb(totals.deposits)}</dd></div>
            <div><dt>Withdrawals</dt><dd>{formatThb(totals.withdrawals)}</dd></div>
            <div><dt>Net movement</dt><dd>{formatThb(totals.net)}</dd></div>
          </dl>

          {showCombined && accounts ? (
            <p className="ledger-status">
              <b>Imported accounts: {importedAccounts.length} of {accounts.length}</b>
              {importedAccounts.length > 0
                ? ` · ${importedAccounts.map((account) => `${account.label} ···· ${account.last_four}`).join(" · ")}`
                : null}
              {importedAccounts.length < accounts.length
                ? " · the all-accounts balance covers these only, since an account with no rows has no balance to derive"
                : null}
            </p>
          ) : null}

          {visible.length === 0 ? (
            <p className="ledger-empty" role="status">
              {transactions.length === 0
                ? "This ledger holds no confirmed transactions yet. Import a statement to fill it."
                : "No transaction matches this filter."}
            </p>
          ) : (
            <div className="table-scroll">
              <table className={showCombined ? "ledger-table merged" : "ledger-table"}>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Source description</th>
                    <th>{showCombined ? "Account" : "Reference"}</th>
                    <th className="numeric">Movement</th>
                    <th className="numeric">{showCombined ? "Account balance" : "Balance"}</th>
                    {showCombined ? <th className="numeric">All accounts</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {visible.map((transaction) => {
                    const movement = movementMinor(transaction);
                    const overlay = transaction.transaction_overlays[0];
                    const account = accountsById.get(transaction.account_id);
                    return (
                      <tr key={transaction.id}>
                        <td data-label="Date">
                          <time dateTime={transaction.source_date}>{formatDate(transaction.source_date)}</time>
                          <small>{transaction.source_time ?? "—"}</small>
                        </td>
                        <td data-label="Description">
                          <strong lang="th">{transaction.transaction_label}</strong>
                          <span>{overlay?.description ?? transaction.description}</span>
                          {overlay?.counterparty ? <em>{overlay.counterparty}</em> : null}
                          {transaction.source_components.length > 1 ? <em>2 components</em> : null}
                        </td>
                        <td data-label={showCombined ? "Account" : "Reference"}>
                          {showCombined
                            ? <span>{account ? `${account.label} ···· ${account.last_four}` : "Unknown account"}</span>
                            : <span>{transaction.reference ?? "Not printed"}</span>}
                        </td>
                        <td data-label="Movement" className={`numeric ${BigInt(movement) > 0n ? "positive" : ""}`}>
                          {BigInt(movement) > 0n ? "+" : ""}{formatThb(movement)}
                        </td>
                        <td data-label={showCombined ? "Account balance" : "Balance"} className="numeric">
                          {formatThb(transaction.post_balance_minor)}
                        </td>
                        {showCombined ? (
                          <td data-label="All accounts" className="numeric combined-balance">
                            {formatThb(combined.get(transaction.id) ?? transaction.post_balance_minor)}
                          </td>
                        ) : null}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : null}
    </section>
  );
}
