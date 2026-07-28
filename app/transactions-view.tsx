"use client";

import { useMemo, useState } from "react";
import { accountListSchema, type LedgerAccount } from "@/lib/accounts";
import { formatThb } from "@/lib/money";
import {
  compareTransactions,
  matchesQuery,
  movementMinor,
  summarize,
  transactionListSchema,
  type AccountTransaction
} from "@/lib/transactions";
import { readError } from "@/lib/wire";

const ALL_ACCOUNTS = "all";

function formatDate(date: string) {
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" })
    .format(new Date(`${date}T00:00:00+07:00`));
}

/**
 * Reads the confirmed ledger back (PLAN task 17). Front-end only: it calls the two
 * endpoints that already exist and adds no route, RPC or migration.
 *
 * Nothing loads until asked. Every other read surface in this app is driven by an
 * explicit action, and this one now reaches real financial records, so a section
 * that fetched the whole ledger on page load would be the one place that stopped
 * being deliberate about it.
 */
export function TransactionsView() {
  const [accounts, setAccounts] = useState<LedgerAccount[] | null>(null);
  const [transactions, setTransactions] = useState<AccountTransaction[] | null>(null);
  const [selected, setSelected] = useState<string>(ALL_ACCOUNTS);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accountsById = useMemo(
    () => new Map((accounts ?? []).map((account) => [account.id, account])),
    [accounts]
  );

  const visible = useMemo(() => {
    if (!transactions) return [];
    return transactions
      .filter((transaction) => selected === ALL_ACCOUNTS || transaction.account_id === selected)
      .filter((transaction) => matchesQuery(transaction, query))
      .sort(compareTransactions);
  }, [transactions, selected, query]);

  const totals = useMemo(() => summarize(visible), [visible]);

  // The printed balance is a fact about one account's statement chain, so a merged
  // list would show it stepping between unrelated running balances. Showing the
  // column only for a single account is the honest option; the alternative is a
  // number that looks like a ledger balance and is not one.
  const showBalance = selected !== ALL_ACCOUNTS;

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
            Everything already committed to the ledger, newest first. Source facts are immutable here —
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

          {visible.length === 0 ? (
            <p className="ledger-empty" role="status">
              {transactions.length === 0
                ? "This ledger holds no confirmed transactions yet. Import a statement to fill it."
                : "No transaction matches this filter."}
            </p>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Source description</th>
                    <th>{showBalance ? "Reference" : "Account"}</th>
                    <th className="numeric">Movement</th>
                    {showBalance ? <th className="numeric">Balance</th> : null}
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
                        <td data-label={showBalance ? "Reference" : "Account"}>
                          {showBalance
                            ? <span>{transaction.reference ?? "Not printed"}</span>
                            : <span>{account ? `${account.label} ···· ${account.last_four}` : "Unknown account"}</span>}
                        </td>
                        <td data-label="Movement" className={`numeric ${BigInt(movement) > 0n ? "positive" : ""}`}>
                          {BigInt(movement) > 0n ? "+" : ""}{formatThb(movement)}
                        </td>
                        {showBalance ? (
                          <td data-label="Balance" className="numeric">{formatThb(transaction.post_balance_minor)}</td>
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
