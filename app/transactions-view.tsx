"use client";

import { useMemo, useState } from "react";
import { accountListSchema, type LedgerAccount } from "@/lib/accounts";
import { formatThb } from "@/lib/money";
import {
  combinedBalanceByTransaction,
  matchesQuery,
  matchesSlipQuery,
  movementMinor,
  transactionListSchema,
  type AccountTransaction
} from "@/lib/transactions";
import {
  compareRows,
  reconcileLedger,
  summarizeRows,
  type ReconciledRow
} from "@/lib/slip-reconcile";
import { slipListSchema, type CapturedSlip } from "@/lib/slips";
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
  const [slips, setSlips] = useState<CapturedSlip[]>([]);
  const [slipsError, setSlipsError] = useState<string | null>(null);
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

  const showCombined = selected === ALL_ACCOUNTS;

  // Reconciliation runs over the **whole** ledger, before any account or text filter. A
  // match is a fact about two records, not about what is on screen — reconciling the
  // filtered subset would let choosing an account or typing in the search box silently
  // unmatch a pair and change the totals (D-063).
  const reconciled = useMemo(
    () => reconcileLedger(transactions ?? [], slips, accounts ?? []),
    [transactions, slips, accounts]
  );

  // A slip is shown against an account when the owner holds exactly one at that bank, so the
  // attribution is forced rather than guessed; with two, it belongs to the all-accounts view
  // only, and the status line says why (D-056 still holds — the QR names a bank).
  const inAccount = useMemo(() => (row: ReconciledRow) => {
    if (selected === ALL_ACCOUNTS) return true;
    return row.kind === "confirmed" ? row.transaction.account_id === selected : row.account?.id === selected;
  }, [selected]);

  const visibleRows = useMemo(() => {
    const filtered = reconciled.rows.filter((row) => {
      if (!inAccount(row)) return false;
      // A matched pair is one row and must be findable by either record's text.
      if (row.kind === "confirmed") {
        return matchesQuery(row.transaction, query) || (row.slip !== null && matchesSlipQuery(row.slip, query));
      }
      return matchesSlipQuery(row.slip, query);
    });
    filtered.sort(compareRows);
    if (order === "oldest") filtered.reverse();
    return filtered;
  }, [reconciled, inAccount, query, order]);

  const totals = useMemo(() => summarizeRows(visibleRows), [visibleRows]);

  const unattributedSlips = useMemo(
    () => reconciled.rows.filter((row) => row.kind === "provisional" && row.account === null).length,
    [reconciled]
  );

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

      // Provisional entries, loaded after the confirmed ones and deliberately unable to
      // fail the view. The ledger is the authority; a slips outage must not hide it, so a
      // failure here is reported beside the rows instead of replacing them.
      setSlipsError(null);
      setSlips([]);
      const slipsResponse = await fetch("/api/v1/slips", { cache: "no-store" });
      const slipsBody: unknown = await slipsResponse.json().catch(() => null);
      if (!slipsResponse.ok) {
        setSlipsError(readError(slipsBody, "Captured slips could not be loaded, so none are shown."));
      } else {
        const parsedSlips = slipListSchema.safeParse(slipsBody);
        if (parsedSlips.success) setSlips(parsedSlips.data.slips);
        else setSlipsError("The slips response did not match its contract, so none are shown.");
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
        <p className="section-index">Ledger</p>
        <div>
          <h2 id="ledger-title">Transactions</h2>
          <p>
            Everything committed to the ledger, and every slip still waiting for the statement
            that will confirm it. Source facts are immutable here — this view reads them and
            never writes.
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
          {/* One total over both kinds, which is only correct because a matched pair is one
              row. The provisional count travels with the figure so it discloses how much of
              itself the bank has not confirmed (D-063). */}
          <dl className="statement-strip ledger-strip">
            <div><dt>Rows</dt><dd>{totals.rows}{totals.provisional > 0 ? <small> · {totals.provisional} provisional</small> : null}</dd></div>
            <div><dt>Deposits</dt><dd className="positive">+{formatThb(totals.deposits)}</dd></div>
            <div><dt>Withdrawals</dt><dd>{formatThb(totals.withdrawals)}</dd></div>
            <div><dt>Net movement</dt><dd>{formatThb(totals.net)}</dd></div>
          </dl>

          {slips.length > 0 ? (
            <p className="ledger-status">
              <b>Slips: {reconciled.matches.bySlip.size} verified · {slips.length - reconciled.matches.bySlip.size - reconciled.matches.needsReview.size} awaiting a statement{reconciled.matches.needsReview.size > 0 ? ` · ${reconciled.matches.needsReview.size} needing review` : ""}</b>
              {" · a slip is matched to a statement row only when the bank, the exact amount and a date within three days identify one row and no other slip claims it. No layout prints the slip's reference, so a match is a proposal from those three facts rather than an identifier the two records share."}
            </p>
          ) : null}

          {slipsError ? (
            <p className="ledger-status" role="status">{slipsError}</p>
          ) : null}

          {!showCombined && unattributedSlips > 0 ? (
            <p className="ledger-status">
              {unattributedSlips} slip{unattributedSlips === 1 ? " is" : "s are"} hidden while one account is selected: you hold more than one account at that bank, and a slip&rsquo;s QR names the bank without saying which account the money moved through.
            </p>
          ) : null}

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

          {visibleRows.length === 0 ? (
            <p className="ledger-empty" role="status">
              {transactions.length === 0 && slips.length === 0
                ? "This ledger holds no confirmed transactions yet. Import a statement to fill it, or capture a slip."
                : "No transaction matches this filter."}
            </p>
          ) : (
            <div className="table-scroll">
              <table className={showCombined ? "ledger-table merged" : "ledger-table"}>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Source description</th>
                    <th>Status</th>
                    <th>{showCombined ? "Account" : "Reference"}</th>
                    <th className="numeric">Movement</th>
                    <th className="numeric">{showCombined ? "Account balance" : "Balance"}</th>
                    {showCombined ? <th className="numeric">All accounts</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row) => {
                    if (row.kind === "provisional") {
                      const slip = row.slip;
                      const amount = BigInt(slip.amount_minor);
                      return (
                        // Marked in the row itself, not only by colour: the difference between
                        // a bank's record and one the owner typed is the most important thing
                        // this table says, and it has to survive a screenshot, a print and a
                        // screen reader.
                        <tr key={slip.id} className="provisional-row">
                          <td data-label="Date">
                            <time dateTime={slip.occurred_on}>{formatDate(slip.occurred_on)}</time>
                            <small>{slip.occurred_at_time ?? "—"}</small>
                          </td>
                          <td data-label="Description">
                            <strong>Slip · {slip.bank_code}</strong>
                            <span>{slip.counterparty ?? "No counterparty recorded"}</span>
                          </td>
                          <td data-label="Status">
                            {row.status === "needs-review" ? (
                              <em className="status-chip needs-review">Needs review · several rows match</em>
                            ) : (
                              <em className="status-chip awaiting">Awaiting statement</em>
                            )}
                          </td>
                          <td data-label={showCombined ? "Account" : "Reference"}>
                            {showCombined
                              ? <span>{row.account ? `${row.account.label} ···· ${row.account.last_four}` : `${slip.bank_code} · account unknown`}</span>
                              : <span className="mono">{slip.slip_reference}</span>}
                          </td>
                          <td data-label="Movement" className={`numeric ${amount > 0n ? "positive" : ""}`}>
                            {amount > 0n ? "+" : ""}{formatThb(slip.amount_minor)}
                          </td>
                          {/* No balance, in either column. A printed balance is the bank's
                              statement of the account after a row, and a slip is not in that
                              chain — writing a derived figure here would invent one. */}
                          <td data-label={showCombined ? "Account balance" : "Balance"} className="numeric">
                            <span aria-label="No balance: a slip is not in the statement's balance chain">—</span>
                          </td>
                          {showCombined ? <td data-label="All accounts" className="numeric combined-balance">—</td> : null}
                        </tr>
                      );
                    }

                    const transaction = row.transaction;
                    const movement = movementMinor(transaction);
                    const overlay = transaction.transaction_overlays[0];
                    const account = accountsById.get(transaction.account_id);
                    // A verified row is the statement's, enriched by the slip: the printed
                    // balance and the immutable source facts stay, and the counterparty the
                    // owner typed fills in what the bank's own description usually does not say.
                    const counterparty = overlay?.counterparty ?? row.slip?.counterparty ?? null;
                    return (
                      <tr key={transaction.id} className={row.slip ? "verified-row" : ""}>
                        <td data-label="Date">
                          <time dateTime={transaction.source_date}>{formatDate(transaction.source_date)}</time>
                          <small>{transaction.source_time ?? "—"}</small>
                        </td>
                        <td data-label="Description">
                          <strong lang="th">{transaction.transaction_label}</strong>
                          <span>{overlay?.description ?? transaction.description}</span>
                          {counterparty ? <em>{counterparty}{overlay?.counterparty ? "" : " (from slip)"}</em> : null}
                          {transaction.source_components.length > 1 ? <em>2 components</em> : null}
                        </td>
                        <td data-label="Status">
                          {row.slip
                            ? <em className="status-chip verified">Verified by slip</em>
                            : <em className="status-chip statement-only">Statement only</em>}
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
