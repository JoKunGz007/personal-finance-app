"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { accountListSchema, type LedgerAccount } from "@/lib/accounts";
import { formatThb } from "@/lib/money";
import {
  combinedBalanceByTransaction,
  matchesCashQuery,
  matchesQuery,
  matchesSlipQuery,
  movementMinor,
  transactionListSchema,
  type AccountTransaction
} from "@/lib/transactions";
import {
  compareRows,
  matchCandidates,
  reconcileLedger,
  summarizeRows,
  type ReconciledRow,
  type RowStatus
} from "@/lib/slip-reconcile";
import {
  slipCorrectionResponseSchema,
  slipListSchema,
  slipMatchResponseSchema,
  slipsInForce,
  type CapturedSlip,
  type SlipCorrection,
  type SlipMatchDecision
} from "@/lib/slips";
import {
  cashCorrectionResponseSchema,
  cashInForce,
  cashListSchema,
  type CashCorrection,
  type CashEntry
} from "@/lib/cash";
import { CashEntryForm } from "@/app/cash-entry";
import { CorrectionForm } from "@/app/correction-form";
import { readError } from "@/lib/wire";

const ALL_ACCOUNTS = "all";
const ALL_STATUSES = "all";
type Order = "newest" | "oldest";
type StatusFilter = typeof ALL_STATUSES | RowStatus;

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
  const [matches, setMatches] = useState<SlipMatchDecision[]>([]);
  const [slipCorrections, setSlipCorrections] = useState<SlipCorrection[]>([]);
  const [slipsError, setSlipsError] = useState<string | null>(null);
  // Cash entries and their corrections, loaded and failing on the same terms as slips: the
  // confirmed ledger is the authority and a cash outage must not hide it.
  const [cash, setCash] = useState<CashEntry[]>([]);
  const [cashCorrections, setCashCorrections] = useState<CashCorrection[]>([]);
  const [cashError, setCashError] = useState<string | null>(null);
  // Which slip is being decided, so one row's control can be busy without disabling the rest.
  const [deciding, setDeciding] = useState<string | null>(null);
  const [decisionError, setDecisionError] = useState<string | null>(null);
  // The slip currently being matched by hand, if any. While this is set the table shows that
  // slip and the rows it could be, and nothing else (D-069).
  const [matching, setMatching] = useState<string | null>(null);
  // Focus has to follow the mode. The button that opens it disables itself in the same update,
  // and a browser blurs a disabled element — which drops a keyboard or screen-reader user to
  // the top of the document with the `aria-live` announcement read but nowhere to be.
  const cancelMatching = useRef<HTMLButtonElement | null>(null);
  // Which pair is expanded, by transaction id. A matched pair collapses to one row, so without
  // this the ledger can say a row is verified but never say what by (D-075).
  const [openPair, setOpenPair] = useState<string | null>(null);
  // Which record is being corrected, by its own id. One at a time: two open forms would let
  // the owner start a second correction against a revision the first is about to move past.
  const [correcting, setCorrecting] = useState<string | null>(null);
  const [correctionError, setCorrectionError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string>(ALL_ACCOUNTS);
  const [order, setOrder] = useState<Order>("newest");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>(ALL_STATUSES);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accountsById = useMemo(
    () => new Map((accounts ?? []).map((account) => [account.id, account])),
    [accounts]
  );

  /**
   * Slips and cash entries **as they stand**, corrections applied once here rather than at
   * each place that reads an amount.
   *
   * This is the read-side counterpart of migration 014. The database's own guard once compared
   * a slip's original figure against a statement row and both refused correct pairings and
   * accepted wrong ones; a view that reconciled on the original while displaying the correction
   * would be the same mistake with nothing to raise it. The uncorrected records stay in `slips`
   * and `cash`, so the detail panels can still show what was first typed.
   */
  const currentSlips = useMemo(() => slipsInForce(slips, slipCorrections), [slips, slipCorrections]);
  const currentCash = useMemo(() => cashInForce(cash, cashCorrections), [cash, cashCorrections]);

  // Keyed by the record they correct, so a row can ask for its own overlay — both to say
  // "corrected by you" and to hand the form the revision it must send back.
  const slipCorrectionBySlip = useMemo(
    () => new Map(slipCorrections.map((correction) => [correction.slip_id, correction])),
    [slipCorrections]
  );
  const cashCorrectionByEntry = useMemo(
    () => new Map(cashCorrections.map((correction) => [correction.cash_entry_id, correction])),
    [cashCorrections]
  );
  // The records as first typed, which is what a correction is measured against.
  const originalSlips = useMemo(() => new Map(slips.map((slip) => [slip.id, slip])), [slips]);
  const originalCash = useMemo(() => new Map(cash.map((entry) => [entry.id, entry])), [cash]);

  /**
   * A stored correction, folded back into state rather than triggering a reload.
   *
   * The whole reconciled view is derived from these lists, so replacing one overlay re-runs
   * the rule, the totals and any other slip that was competing for a row — with the revision
   * the database actually stored, which is the one the next write must send.
   */
  function storeSlipCorrection(slipId: string, saved: unknown) {
    const parsed = slipCorrectionResponseSchema.safeParse({ correction: saved });
    if (!parsed.success) {
      setCorrectionError("The correction was saved but did not come back in its published shape. Reload before trusting this view.");
      return;
    }
    setSlipCorrections((current) => [...current.filter((correction) => correction.slip_id !== slipId), parsed.data.correction]);
    setCorrecting(null);
  }

  function storeCashCorrection(entryId: string, saved: unknown) {
    const parsed = cashCorrectionResponseSchema.safeParse({ correction: saved });
    if (!parsed.success) {
      setCorrectionError("The correction was saved but did not come back in its published shape. Reload before trusting this view.");
      return;
    }
    setCashCorrections((current) => [...current.filter((correction) => correction.cash_entry_id !== entryId), parsed.data.correction]);
    setCorrecting(null);
  }

  const matchingSlip = useMemo(
    () => (matching === null ? null : currentSlips.find((slip) => slip.id === matching) ?? null),
    [matching, currentSlips]
  );

  /**
   * One derived value decides whether the mode is on, and everything reads it.
   *
   * Gating the banner on the slip while the row filter and the disabled controls gated on the
   * id alone left a reachable dead end: a slip that vanished mid-choice took the banner — and
   * with it the only Cancel — off the screen while the controls stayed disabled and the totals
   * strip reappeared over a picking subset. Recovery needed a page reload. A mode that cannot
   * be half-on cannot do that.
   */
  const picking = matching !== null && matchingSlip !== null;

  // Entering the mode moves focus to Cancel: it is the one control that is certainly present,
  // it is the way out, and it sits beside the announcement rather than at the top of the page.
  useEffect(() => {
    if (picking) cancelMatching.current?.focus();
  }, [picking]);

  // The account scope, before any text filter. Balances are derived from this rather
  // than from `visible`, because a running total of whatever a search matched would
  // not be a balance.
  const scope = useMemo(
    () => (transactions ?? []).filter((transaction) => selected === ALL_ACCOUNTS || transaction.account_id === selected),
    [transactions, selected]
  );

  const combined = useMemo(() => combinedBalanceByTransaction(scope), [scope]);

  // The account column, not the reference one, whenever a slip is being matched: candidates are
  // filtered by **bank**, so with two accounts at one bank the offered rows can belong to
  // different accounts — and in the per-account layout nothing on screen would say which. That
  // is the very ambiguity `slipAccount` refuses to guess at (D-056), so the chooser must show it.
  const showCombined = picking || selected === ALL_ACCOUNTS;

  // Reconciliation runs over the **whole** ledger, before any account or text filter. A
  // match is a fact about two records, not about what is on screen — reconciling the
  // filtered subset would let choosing an account or typing in the search box silently
  // unmatch a pair and change the totals (D-063).
  const reconciled = useMemo(
    () => reconcileLedger(transactions ?? [], currentSlips, accounts ?? [], matches, currentCash),
    [transactions, currentSlips, accounts, matches, currentCash]
  );

  const decisionBySlip = useMemo(
    () => new Map(matches.map((match) => [match.slip_id, match])),
    [matches]
  );

  // The rows a slip may be paired with by hand, computed for the provisional rows only — a
  // matched slip's control is an undo and needs no list. Not date-bounded: an override exists
  // precisely to reach past the automatic window (D-067).
  const candidatesBySlip = useMemo(() => {
    const byslip = new Map<string, AccountTransaction[]>();
    for (const row of reconciled.rows) {
      if (row.kind !== "provisional") continue;
      byslip.set(row.slip.id, matchCandidates(row.slip, transactions ?? [], accounts ?? [], matches));
    }
    return byslip;
  }, [reconciled, transactions, accounts, matches]);

  // The rows on offer while matching, as a set, so a confirmed row can ask whether it is one
  // of them without re-deriving the list per row.
  const offered = useMemo(
    () => new Set((matching === null ? [] : candidatesBySlip.get(matching) ?? []).map((candidate) => candidate.id)),
    [matching, candidatesBySlip]
  );

  // A slip is shown against an account when the owner holds exactly one at that bank, so the
  // attribution is forced rather than guessed; with two, it belongs to the all-accounts view
  // only, and the status line says why (D-056 still holds — the QR names a bank).
  const inAccount = useMemo(() => (row: ReconciledRow) => {
    if (selected === ALL_ACCOUNTS) return true;
    if (row.kind === "confirmed") return row.transaction.account_id === selected;
    // A cash payment never belongs to an account — it has no bank and no statement, so there
    // is no attribution to derive and none to guess at. It belongs to the all-accounts view,
    // the same place a slip goes when its bank holds two of them.
    if (row.kind === "cash") return false;
    return row.account?.id === selected;
  }, [selected]);

  const visibleRows = useMemo(() => {
    // Matching is its own view of the ledger, not a filter of the current one: the slip being
    // matched and every row it could be, whatever the Account, Status and search controls were
    // left on. Those are suspended rather than obeyed, because a filter set earlier could
    // otherwise hide the very row the owner is looking for and read as "it is not there".
    if (picking) {
      const candidates = reconciled.rows.filter((row) => {
        if (row.kind === "provisional") return row.slip.id === matching;
        // Cash is not a statement row and can never be one, so it is never on offer.
        if (row.kind === "cash") return false;
        return offered.has(row.transaction.id);
      });
      candidates.sort(compareRows);
      if (order === "oldest") candidates.reverse();
      return candidates;
    }

    const filtered = reconciled.rows.filter((row) => {
      if (!inAccount(row)) return false;
      // Status filters the reconciled result; it never feeds back into reconciliation, which
      // has already run over the whole ledger above. That ordering is the point — a filter
      // that could change what matched would let a dropdown move the totals (D-063).
      if (status !== ALL_STATUSES && row.status !== status) return false;
      // A matched pair is one row and must be findable by either record's text.
      if (row.kind === "confirmed") {
        return matchesQuery(row.transaction, query) || (row.slip !== null && matchesSlipQuery(row.slip, query));
      }
      if (row.kind === "cash") return matchesCashQuery(row.entry, query);
      return matchesSlipQuery(row.slip, query);
    });
    filtered.sort(compareRows);
    if (order === "oldest") filtered.reverse();
    return filtered;
  }, [reconciled, inAccount, query, order, status, matching, picking, offered]);

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
      setSlipCorrections([]);
      // Decisions travel with the slips and are cleared with them. Keeping stale ones while
      // the slips they belong to failed to load would reconcile against records no longer on
      // screen; keeping none while the slips loaded would present an overruled pairing as the
      // rule's own. They are one response for exactly that reason (D-067).
      setMatches([]);
      setDecisionError(null);
      const slipsResponse = await fetch("/api/v1/slips", { cache: "no-store" });
      const slipsBody: unknown = await slipsResponse.json().catch(() => null);
      if (!slipsResponse.ok) {
        setSlipsError(readError(slipsBody, "Captured slips could not be loaded, so none are shown."));
      } else {
        const parsedSlips = slipListSchema.safeParse(slipsBody);
        if (parsedSlips.success) {
          setSlips(parsedSlips.data.slips);
          setMatches(parsedSlips.data.matches);
          setSlipCorrections(parsedSlips.data.corrections);
        } else setSlipsError("The slips response did not match its contract, so none are shown.");
      }

      // Cash entries, on the same terms: the confirmed ledger is the authority, so a failure
      // here is reported beside the rows rather than replacing them. Corrections arrive on the
      // same response as the entries they correct, and are cleared with them — showing an
      // entry whose correction went missing would put a figure the owner has already replaced
      // into the ledger and into its totals.
      setCashError(null);
      setCash([]);
      setCashCorrections([]);
      const cashResponse = await fetch("/api/v1/cash", { cache: "no-store" });
      const cashBody: unknown = await cashResponse.json().catch(() => null);
      if (!cashResponse.ok) {
        setCashError(readError(cashBody, "Cash entries could not be loaded, so none are shown."));
      } else {
        const parsedCash = cashListSchema.safeParse(cashBody);
        if (parsedCash.success) {
          setCash(parsedCash.data.entries);
          setCashCorrections(parsedCash.data.corrections);
        } else setCashError("The cash response did not match its contract, so none are shown.");
      }

      setAccounts(parsedAccounts.data.accounts);
      setTransactions(loaded);
    } catch {
      setError("The ledger could not be reached. Check that the local Supabase stack is running.");
    } finally {
      setBusy(false);
    }
  }

  /**
   * The owner's say over one slip's match (D-067). Three cases reach this: a wrong automatic
   * pairing rejected, an ambiguity resolved by naming the row, and a stored decision changed.
   *
   * The reconciled view is derived from `matches`, so replacing one decision here re-runs the
   * whole rule — including the totals and any *other* slip that was competing for the row.
   * That is why this updates state from the response rather than reloading: the decision the
   * database stored is the one the view then reasons about, revision included.
   */
  async function decide(slipId: string, decision: "matched" | "unmatched", transactionId: string | null) {
    setDeciding(slipId);
    setDecisionError(null);
    try {
      const response = await fetch(`/api/v1/slips/${slipId}/match`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // 0 means "I believe no decision exists", which is what the RPC's optimistic
          // concurrency compares against. A second tab having decided already is a conflict
          // worth reporting rather than a write to repeat.
          expectedRevision: decisionBySlip.get(slipId)?.revision ?? 0,
          decision,
          transactionId
        })
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setDecisionError(readError(body, "The match decision could not be saved."));
        return;
      }
      const parsed = slipMatchResponseSchema.safeParse(body);
      if (!parsed.success) {
        setDecisionError("The saved decision did not match its contract. Reload before trusting this view.");
        return;
      }
      setMatches((current) => [...current.filter((match) => match.slip_id !== slipId), parsed.data.match]);
      setMatching(null);
    } catch {
      setDecisionError("The ledger could not be reached, so the decision was not saved.");
    } finally {
      setDeciding(null);
    }
  }

  return (
    <>
    {/* A sibling of the ledger rather than a child of it, so the page keeps a flat outline —
        but rendered from here, because recording a cash payment must refresh the rows below
        and a capture is an event, not something an effect should react to (D-075). Nothing
        reloads unless the ledger has already been asked for once. */}
    <CashEntryForm onRecorded={() => { if (transactions !== null) void load(); }} />
    <section className="ledger-band" aria-labelledby="ledger-title">
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
        <button type="button" className="secondary-button" disabled={busy || picking} onClick={load}>
          {busy ? "Loading…" : transactions ? "Reload" : "Load transactions"}
        </button>
        {transactions ? (
          <>
            <label className="account-control">
              <span>Account</span>
              <select value={selected} disabled={picking} onChange={(event) => setSelected(event.target.value)}>
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
            {/* The status a row carries is no longer written on the row itself when it is
                the unremarkable one, so this is where the question gets asked instead
                (D-064). */}
            <label className="account-control">
              <span>Status</span>
              <select value={status} disabled={picking} onChange={(event) => setStatus(event.target.value as StatusFilter)}>
                <option value={ALL_STATUSES}>All statuses</option>
                <option value="verified">Verified by slip</option>
                <option value="awaiting-statement">Awaiting statement</option>
                <option value="needs-review">Needs review</option>
                <option value="statement-only">Statement only</option>
                <option value="cash">Cash</option>
              </select>
            </label>
            <label className="account-control">
              <span>Filter</span>
              <input
                type="search"
                name="transaction-filter"
                value={query}
                disabled={picking}
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
          {picking && matchingSlip ? (
            /* The totals are deliberately gone while this is up. What is on screen is a slip
               and the rows it could be, which is not a view of the ledger and has no total
               worth printing — a subtotal of three unrelated rows reads as a figure. */
            <div className="matching-banner" aria-live="polite">
              <div>
                <strong>Choosing a statement row</strong>
                <span>
                  {`${matchingSlip.bank_code} slip · ${formatDate(matchingSlip.occurred_on)}${matchingSlip.occurred_at_time ? ` ${matchingSlip.occurred_at_time}` : ""} · ${formatThb(matchingSlip.amount_minor)}`}
                  {` — ${offered.size} row${offered.size === 1 ? "" : "s"} could be it, each at the same bank for the same amount to the satang. The time and the balance are what tell them apart, so they are shown as rows rather than as a list of names. Other filters are suspended while you choose.`}
                </span>
              </div>
              <button
                type="button"
                className="secondary-button"
                ref={cancelMatching}
                disabled={deciding !== null}
                onClick={() => setMatching(null)}
              >
                Cancel
              </button>
            </div>
          ) : (
            <>
              {/* One total over both kinds, which is only correct because a matched pair is one
                  row. The provisional count travels with the figure so it discloses how much of
                  itself the bank has not confirmed (D-063). */}
              <dl className="statement-strip ledger-strip">
                {/* Cash is counted apart from `provisional`: a slip is waiting for a statement,
                    while a cash payment has no bank behind it and never will, so folding the
                    two together would say the total is waiting on something never coming. */}
                <div><dt>Rows</dt><dd>{totals.rows}{totals.provisional > 0 ? <small> · {totals.provisional} provisional</small> : null}{totals.cash > 0 ? <small> · {totals.cash} cash</small> : null}</dd></div>
                <div><dt>Deposits</dt><dd className="positive">+{formatThb(totals.deposits)}</dd></div>
                <div><dt>Withdrawals</dt><dd>{formatThb(totals.withdrawals)}</dd></div>
                <div><dt>Net movement</dt><dd>{formatThb(totals.net)}</dd></div>
              </dl>

              {slips.length > 0 ? (
                <p className="ledger-status">
                  <b>Slips: {reconciled.matches.bySlip.size} verified · {slips.length - reconciled.matches.bySlip.size - reconciled.matches.needsReview.size} awaiting a statement{reconciled.matches.needsReview.size > 0 ? ` · ${reconciled.matches.needsReview.size} needing review` : ""}</b>
                  {" · a slip is matched to a statement row only when the bank, the exact amount and a date within one day identify one row and no other slip claims it. No layout prints the slip's reference, so a match is a proposal from those three facts rather than an identifier the two records share."}
                </p>
              ) : null}
            </>
          )}

          {slipsError ? (
            <p className="ledger-status" role="status">{slipsError}</p>
          ) : null}

          {cashError ? (
            <p className="ledger-status" role="status">{cashError}</p>
          ) : null}

          {/* A refused decision is reported where it can be read against the row it was about,
              and as an alert: the owner has just pressed something, and silence would read as
              success. Every message here is one the database refused for a reason the owner
              can act on. */}
          {decisionError ? (
            <div className="warning error" role="alert">
              <strong>Not saved</strong>
              <span>{decisionError}</span>
            </div>
          ) : null}

          {correctionError ? (
            <div className="warning error" role="alert">
              <strong>Correction</strong>
              <span>{correctionError}</span>
            </div>
          ) : null}

          {!picking &&!showCombined && unattributedSlips > 0 ? (
            <p className="ledger-status">
              {unattributedSlips} slip{unattributedSlips === 1 ? " is" : "s are"} hidden while one account is selected: you hold more than one account at that bank, and a slip&rsquo;s QR names the bank without saying which account the money moved through.
            </p>
          ) : null}

          {!picking &&showCombined && accounts ? (
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
                    if (row.kind === "cash") {
                      const entry = row.entry;
                      const amount = BigInt(entry.amount_minor);
                      const original = originalCash.get(entry.id);
                      return (
                        <Fragment key={entry.id}>
                        {/* Marked in the row itself for the reason a slip is: the difference
                            between a bank's record and one the owner typed is the most important
                            thing this table says, and it has to survive a screenshot and a
                            screen reader rather than living in a colour. */}
                        <tr className="cash-row">
                          <td data-label="Date">
                            <time dateTime={entry.occurred_on}>{formatDate(entry.occurred_on)}</time>
                            <small>{entry.occurred_at_time ?? "—"}</small>
                          </td>
                          <td data-label="Description">
                            <strong>Cash</strong>
                            <span>{entry.counterparty ?? "No counterparty recorded"}</span>
                            {entry.note ? <em>{entry.note}</em> : null}
                          </td>
                          <td data-label="Status">
                            <em className="status-chip cash">Cash · no statement</em>
                            {/* Said in words rather than implied by the chip. A corrected figure
                                and an uncorrected one look identical on the row, and which one
                                is on screen is exactly what the owner needs to know. */}
                            {cashCorrectionByEntry.has(entry.id) ? <small className="decision-mark">Corrected by you</small> : null}
                            {/* The only way to change a cash entry, because the row itself
                                cannot be changed: `cash_entries_immutable` refuses an update
                                outright, so this writes an overlay beside it and keeps both. */}
                            {original ? (
                              <div className="match-control">
                                <button
                                  type="button"
                                  className="secondary-button"
                                  aria-expanded={correcting === entry.id}
                                  aria-label={`Correct the cash entry dated ${formatDate(entry.occurred_on)}`}
                                  disabled={correcting !== null && correcting !== entry.id}
                                  onClick={() => { setCorrectionError(null); setCorrecting((current) => current === entry.id ? null : entry.id); }}
                                >
                                  {correcting === entry.id ? "Stop correcting" : "Correct"}
                                </button>
                              </div>
                            ) : null}
                          </td>
                          <td data-label={showCombined ? "Account" : "Reference"}>
                            <span>No account · cash</span>
                          </td>
                          <td data-label="Movement" className={`numeric ${amount > 0n ? "positive" : ""}`}>
                            {amount > 0n ? "+" : ""}{formatThb(entry.amount_minor)}
                          </td>
                          {/* No balance, in either column, and for a stronger reason than a
                              slip's: cash is in no bank's balance chain at all, so there is not
                              even a later statement that could supply one. */}
                          <td data-label={showCombined ? "Account balance" : "Balance"} className="numeric">
                            <span aria-label="No balance: cash is in no statement's balance chain">—</span>
                          </td>
                          {showCombined ? <td data-label="All accounts" className="numeric combined-balance">—</td> : null}
                        </tr>
                        {original && correcting === entry.id ? (
                          <tr className="correction-row">
                            <td colSpan={showCombined ? 7 : 6}>
                              <CorrectionForm
                                base={original}
                                overlay={cashCorrectionByEntry.get(entry.id) ?? null}
                                endpoint={`/api/v1/cash/${entry.id}/correction`}
                                title="Correct this cash entry"
                                onSaved={(saved) => storeCashCorrection(entry.id, saved)}
                                onCancel={() => setCorrecting(null)}
                              />
                            </td>
                          </tr>
                        ) : null}
                        </Fragment>
                      );
                    }

                    if (row.kind === "provisional") {
                      const slip = row.slip;
                      const amount = BigInt(slip.amount_minor);
                      const candidates = candidatesBySlip.get(slip.id) ?? [];
                      const originalSlip = originalSlips.get(slip.id);
                      return (
                        <Fragment key={slip.id}>
                        {/* Marked in the row itself, not only by colour: the difference between
                            a bank's record and one the owner typed is the most important thing
                            this table says, and it has to survive a screenshot, a print and a
                            screen reader. */}
                        <tr className="provisional-row">
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
                            {/* Said in words, because "awaiting a statement" and "you decided
                                this is on no statement" look identical otherwise, and the
                                second is a decision the owner may want to take back. */}
                            {row.ownerDecided ? <small className="decision-mark">Your decision · on no statement row</small> : null}
                            {/* A corrected slip matches on the figure in force, so the amount in
                                this row is not necessarily the one captured. Saying so is what
                                keeps "no row carries this exact amount" checkable. */}
                            {slipCorrectionBySlip.has(slip.id) ? <small className="decision-mark">Corrected by you</small> : null}
                            {/* Not a dropdown (D-069). Candidate rows share a bank, an amount
                                and usually a date and a wording, so an option label repeating
                                the first two of those cannot tell them apart — the printed time
                                and the running balance can, and both live in the table. The
                                button asks the table to show only this slip and its candidates
                                instead of describing them here. */}
                            {candidates.length > 0 ? (
                              <div className="match-control">
                                <button
                                  type="button"
                                  className="secondary-button"
                                  aria-label={`Choose a statement row for the slip dated ${formatDate(slip.occurred_on)}`}
                                  disabled={deciding !== null || matching !== null}
                                  onClick={() => { setDecisionError(null); setMatching(slip.id); }}
                                >
                                  Choose a statement row
                                </button>
                                <small>{candidates.length} row{candidates.length === 1 ? "" : "s"} could be this payment</small>
                              </div>
                            ) : (
                              <small className="decision-mark">
                                No {slip.bank_code} row carries this exact amount, so there is nothing to match it to.
                              </small>
                            )}
                            {/* Offered beside "nothing matches this amount" on purpose: a
                                mistyped amount is the likeliest reason a slip has no candidate,
                                and correcting it is the fix. What the QR carried — the bank and
                                the reference — is not correctable and is not in the form. */}
                            {originalSlip ? (
                              <div className="match-control">
                                <button
                                  type="button"
                                  className="secondary-button"
                                  aria-expanded={correcting === slip.id}
                                  aria-label={`Correct what you typed for the slip dated ${formatDate(slip.occurred_on)}`}
                                  disabled={picking || (correcting !== null && correcting !== slip.id)}
                                  onClick={() => { setCorrectionError(null); setCorrecting((current) => current === slip.id ? null : slip.id); }}
                                >
                                  {correcting === slip.id ? "Stop correcting" : "Correct what you typed"}
                                </button>
                              </div>
                            ) : null}
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
                        {originalSlip && correcting === slip.id ? (
                          <tr className="correction-row">
                            <td colSpan={showCombined ? 7 : 6}>
                              <CorrectionForm
                                base={originalSlip}
                                overlay={slipCorrectionBySlip.get(slip.id) ?? null}
                                endpoint={`/api/v1/slips/${slip.id}/correction`}
                                title={`Correct what you typed for this ${slip.bank_code} slip`}
                                onSaved={(saved) => storeSlipCorrection(slip.id, saved)}
                                onCancel={() => setCorrecting(null)}
                              />
                            </td>
                          </tr>
                        ) : null}
                        </Fragment>
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
                    const pair = row.slip;
                    return (
                      <Fragment key={transaction.id}>
                      <tr className={row.slip ? "verified-row" : ""}>
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
                        {/* No chip for a statement row with no slip. It is the ledger's default
                            state — on this ledger, essentially every row — so a badge on each
                            one carries no information while making the three statuses that do
                            mean something harder to find. The status is still readable to a
                            screen reader here, and askable through the Status filter (D-064). */}
                        <td data-label="Status">
                          {picking && matching !== null ? (
                            /* Picking mode: this row is one of the candidates, or it would not
                               be on screen. The button is on the row itself, beside the time
                               and the balance that are the only things distinguishing it from
                               its neighbours. */
                            <div className="match-control">
                              {/* The chip stays. A candidate may already be paired with a
                                  *different* slip — `matchCandidates` offers those deliberately,
                                  and the database accepts the write — so replacing the status
                                  with a button would let the owner take a row off another slip
                                  with nothing on screen saying so but a green edge, which is
                                  colour alone. Taking it is allowed; not being told is not. */}
                              {row.slip ? <em className="status-chip verified">Verified by slip</em> : null}
                              {row.slip && row.slip.id !== matching ? (
                                <small className="decision-mark warn">
                                  Already matched to the {formatDate(row.slip.occurred_on)} slip
                                  {row.slip.counterparty ? ` · ${row.slip.counterparty}` : ""}. Choosing this row
                                  unmatches that one, which goes back to waiting for a statement.
                                </small>
                              ) : null}
                              <button
                                type="button"
                                className="primary-button"
                                /* The visible words come first, because an accessible name that
                                   does not contain the label is a name nobody can speak — and
                                   the rest is what distinguishes this row from its twin. */
                                aria-label={`This is it — ${formatDate(row.date)}${transaction.source_time ? ` at ${transaction.source_time}` : ""}, balance ${formatThb(transaction.post_balance_minor)}`}
                                disabled={deciding !== null}
                                onClick={() => decide(matching, "matched", transaction.id)}
                              >
                                {deciding === matching ? "Saving…" : "This is it"}
                              </button>
                            </div>
                          ) : row.slip ? (
                            <>
                              <em className="status-chip verified">Verified by slip</em>
                              {row.ownerDecided ? <small className="decision-mark">Your match</small> : null}
                              {/* The undo, and the only control a matched row needs. It stores
                                  `unmatched` rather than deleting the decision: the RPC has no
                                  way to return a slip to the automatic rule, and pretending
                                  otherwise would promise something the database cannot do. */}
                              <div className="match-control">
                                {/* A pairing this app itself calls a proposal from three facts
                                    has to be inspectable, or "verified" is something the owner
                                    can only take on trust. The pair collapsed onto the statement
                                    row, so without this the slip is on screen nowhere. */}
                                <button
                                  type="button"
                                  className="secondary-button"
                                  aria-expanded={openPair === transaction.id}
                                  aria-controls={`pair-${transaction.id}`}
                                  /* Visible words first — an accessible name that does not
                                     contain the label is a name nobody can speak, and it is the
                                     second time in one day that rule caught a locator instead of
                                     a screen reader (GOTCHAS). */
                                  aria-label={`${openPair === transaction.id ? "Hide slip" : "Show slip"} — the slip matched to the row dated ${formatDate(row.date)}`}
                                  onClick={() => setOpenPair((current) => current === transaction.id ? null : transaction.id)}
                                >
                                  {openPair === transaction.id ? "Hide slip" : "Show slip"}
                                </button>
                                <button
                                  type="button"
                                  className="secondary-button"
                                  aria-label={`Not this slip — the row dated ${formatDate(row.date)} is not this payment`}
                                  /* Every decision control, not just this row's. One write at a
                                     time: two in flight let the first to resolve re-enable a
                                     button whose own write is still pending, and a second press
                                     then sends a revision the database has already moved past —
                                     which comes back as "changed in another session" to an owner
                                     who has only one tab open. The shared error line has the same
                                     problem: it cannot say which decision it is about. */
                                  disabled={deciding !== null}
                                  onClick={() => decide(row.slip!.id, "unmatched", null)}
                                >
                                  {deciding === row.slip.id ? "Saving…" : "Not this slip"}
                                </button>
                              </div>
                            </>
                          ) : (
                            <span className="status-none" aria-label="Statement only: no slip is matched to this row">—</span>
                          )}
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
                      {pair && openPair === transaction.id ? (
                        <tr className="pair-detail" id={`pair-${transaction.id}`}>
                          <td colSpan={showCombined ? 7 : 6}>
                            <dl>
                              <div><dt>Slip reference</dt><dd className="mono">{pair.slip_reference}</dd></div>
                              <div><dt>Slip bank</dt><dd>{pair.bank_code}</dd></div>
                              <div>
                                <dt>Printed on the slip</dt>
                                <dd>{formatDate(pair.occurred_on)}{pair.occurred_at_time ? ` · ${pair.occurred_at_time}` : " · no time printed"}</dd>
                              </div>
                              {/* Shown because it is the match: the slip's amount and the row's
                                  movement are equal to the minor unit, or this pairing could not
                                  exist. Seeing both is what makes the claim checkable. */}
                              <div>
                                <dt>Slip amount</dt>
                                <dd>
                                  {formatThb(pair.amount_minor)}
                                  {slipCorrectionBySlip.has(pair.id) ? " · corrected by you, and it is this figure the match was checked against" : null}
                                </dd>
                              </div>
                              <div><dt>Counterparty on the slip</dt><dd>{pair.counterparty ?? "none recorded"}</dd></div>
                              {pair.note ? <div><dt>Note</dt><dd>{pair.note}</dd></div> : null}
                              <div>
                                <dt>Paired by</dt>
                                <dd>{row.ownerDecided ? "you — a stored decision" : "the rule — same bank, same amount to the satang, within one day"}</dd>
                              </div>
                            </dl>
                            {row.ownerDecided ? null : (
                              <p>
                                No statement layout prints a slip&rsquo;s reference, so this is a proposal from
                                three facts rather than an identifier the two records share. It is recomputed
                                on every load and nothing about it is stored until you decide something.
                              </p>
                            )}
                          </td>
                        </tr>
                      ) : null}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : null}
    </section>
    </>
  );
}
