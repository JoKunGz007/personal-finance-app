"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ACCOUNT_ID_PATTERN, accountListSchema, type LedgerAccount } from "@/lib/accounts";
import { isUsableRange, rangeFromSearch, type DateRange } from "@/lib/date-range";
import { isoDateSchema } from "@/lib/dates";
import { formatThb } from "@/lib/money";
import {
  cursorAfter,
  ledgerPageSchema,
  ledgerPageSearch,
  matchCandidateListSchema,
  matchesCardQuery,
  matchesCashQuery,
  matchesQuery,
  matchesSlipQuery,
  overlayWriteBody,
  overlayWriteResponseSchema,
  type AccountTransaction
} from "@/lib/transactions";
import {
  deeperPages,
  emptyWindow,
  hasDeeperPage,
  reconciliationRows,
  scopeTotals,
  statusIsComplete,
  windowIds,
  windowReach,
  windowRows,
  withOverlay,
  withPage,
  type LedgerWindow
} from "@/lib/ledger-window";
import {
  cardsInForce,
  notificationCardCorrectionResponseSchema,
  notificationCardDecisionResponseSchema,
  notificationCardListSchema,
  type NotificationCard,
  type NotificationCardCorrection,
  type NotificationCardDecision
} from "@/lib/notification-cards";
import { cardMatchCandidates } from "@/lib/notification-card-reconcile";
import {
  compareRows,
  dayGroups,
  matchCandidates,
  reconcileLedger,
  summarizeRows,
  type ReconciledRow
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
import { LedgerCardRow } from "@/app/ledger-card-row";
import { LedgerCashRow } from "@/app/ledger-cash-row";
import { LedgerControls } from "@/app/ledger-controls";
import { LedgerNote } from "@/app/ledger-note";
import { LedgerRetiredCards } from "@/app/ledger-retired-cards";
import {
  ALL_ACCOUNTS,
  ALL_STATUSES,
  formatDayHeading,
  type LedgerBalance,
  type LedgerLayout,
  type LedgerModes,
  type Order,
  type StatusFilter
} from "@/app/ledger-shared";
import { LedgerSlipRow } from "@/app/ledger-slip-row";
import { LedgerStatementRow } from "@/app/ledger-statement-row";
import { LedgerSummary } from "@/app/ledger-summary";
import { onOwnerReady, ownerReadyGeneration } from "@/lib/owner-ready";
import { ledgerRequest, readError } from "@/lib/wire";

/**
 * Reads the confirmed ledger back (PLAN task 17). Front-end only: it calls the endpoints that
 * already exist and adds no route, RPC or migration.
 *
 * **It loads on arrival, and that reverses what task 17 decided** (PLAN task 43). The old rule
 * was "nothing loads until asked", justified by consistency: every other read surface here is
 * driven by an explicit action, so a section fetching on page load would be the one place that
 * stopped being deliberate. That is a consistency argument and **not an invariant** — no money,
 * privacy or append-only property rested on it, which is what made it reversible.
 *
 * The owner's reason for reversing it is the better one: **the page read like an advertisement
 * partly because it was empty**, and the standing copy was filling the hole the table should
 * occupy. A press that the owner performs every single time is not a decision, it is a toll.
 *
 * **The payload was measured before this was written, because auto-loading an unbounded fetch is
 * a different thing from auto-loading a bounded one.** `list_account_transactions` bounds
 * nothing — no `limit`, no `offset`, one `jsonb_agg` of every row for the account. It is
 * deliberately still unpaged: the balances here are derived over *whole accounts* and
 * reconciliation runs over the *whole* ledger before any filter (D-063), so a first page would
 * silently change both. What was bounded instead is the width of a row —
 * `app/api/v1/accounts/[id]/transactions/route.ts` drops the one field nothing read, 28.4% of
 * the object. Paging this properly means computing balances in SQL, which means a migration.
 */
export function TransactionsView() {
  const [accounts, setAccounts] = useState<LedgerAccount[] | null>(null);
  /**
   * The confirmed ledger **as far as it is loaded** — null until the first load finishes.
   *
   * Not an array of rows any more, and the rename is the point: before PLAN task 45 "the rows the
   * client holds" and "the ledger" were the same set, so no name had to distinguish them. They are
   * different sets now, and every question that used to be answered by reading `.length` has to
   * say which one it means. `lib/ledger-window.ts` owns that distinction.
   */
  const [ledgerWindow, setLedgerWindow] = useState<LedgerWindow | null>(null);
  /**
   * The date bounds `ledgerWindow` was actually fetched with — **not** the same thing as the live
   * `dateFrom`/`dateTo` state below, and the difference is exactly Statistics' `{ search, data }`
   * split (`app/statistics-view.tsx`, D-170). The date inputs only take effect on the next Reload,
   * so an owner who edits them and then presses "Load older rows" without reloading must not have
   * that press silently switch to the unapplied bounds: `loadMore` walks a cursor that was produced
   * *under this range*, and fencing it with a different one would return a page whose rows and
   * whose account totals (`AccountWindow.totals`, bounded by the RPC only when bounds are supplied)
   * belong to two different windows stitched into one account.
   */
  const [appliedRange, setAppliedRange] = useState<DateRange>({ from: null, to: null });
  /**
   * Rows outside the window that reconciliation still has to see, from `list_match_candidates`.
   *
   * **Evidence, not rows to show.** They are unioned into what the matching rule runs over and
   * then filtered back out of the table, because a candidate is a row the owner did not ask to
   * see — it is there so that a slip whose partner is off-page is not reported as awaiting a
   * statement it already has.
   */
  const [candidates, setCandidates] = useState<AccountTransaction[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [slips, setSlips] = useState<CapturedSlip[]>([]);
  const [matches, setMatches] = useState<SlipMatchDecision[]>([]);
  const [slipCorrections, setSlipCorrections] = useState<SlipCorrection[]>([]);
  const [slipsError, setSlipsError] = useState<string | null>(null);
  // Cash entries and their corrections, loaded and failing on the same terms as slips: the
  // confirmed ledger is the authority and a cash outage must not hide it.
  const [cash, setCash] = useState<CashEntry[]>([]);
  const [cashCorrections, setCashCorrections] = useState<CashCorrection[]>([]);
  const [cashError, setCashError] = useState<string | null>(null);
  // Captured notification cards, on the same terms as slips and cash: the confirmed ledger is the
  // authority, so a failure here is reported beside the rows rather than replacing them. No
  // corrections list travels with them, and that is the table's shape rather than an omission —
  // a card has no correction overlay yet (PLAN task 27), so there is no second half to half-arrive.
  const [cards, setCards] = useState<NotificationCard[]>([]);
  const [cardCorrections, setCardCorrections] = useState<NotificationCardCorrection[]>([]);
  const [cardDecisions, setCardDecisions] = useState<NotificationCardDecision[]>([]);
  const [cardsError, setCardsError] = useState<string | null>(null);
  // Which card is being decided, so one row's control can be busy without disabling the rest.
  const [decidingCard, setDecidingCard] = useState<string | null>(null);
  // The card currently being matched by hand, if any — the card half of `matching`.
  const [matchingCard, setMatchingCard] = useState<string | null>(null);
  // Whether the retired cards are on screen. They are out of the rows and the totals, so without
  // this a retirement would be irreversible in practice however reversible it is in the database.
  const [showRetired, setShowRetired] = useState(false);
  // Which matched pair's card detail is open, by transaction id. Separate from `openPair` because
  // a row can carry a slip and a card at once and the two panels are independent questions.
  const [openCard, setOpenCard] = useState<string | null>(null);
  // Which slip is being decided, so one row's control can be busy without disabling the rest.
  const [deciding, setDeciding] = useState<string | null>(null);
  const [decisionError, setDecisionError] = useState<string | null>(null);
  // Which row's `include_in_reporting` is being written (PLAN task 48). Its own error line rather
  // than a third writer of `decisionError`, which already cannot say which decision it is about.
  const [settingReporting, setSettingReporting] = useState<string | null>(null);
  const [reportingError, setReportingError] = useState<string | null>(null);
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
  /**
   * The incoming link's own query string, read once. **Seeds the account and date filters below and
   * writes nothing back** — unlike `/statistics`'s picker, this page has never round-tripped its
   * filters through the address bar, and adding that is not this task's scope. What is in scope is
   * the other direction: PLAN task 47's calendar links here with `from`, `to` and, when one was
   * selected, `account`, on the same "account" and date-range keys `lib/statistics.ts` already
   * uses — so a day opens already filtered rather than landing on the unfiltered ledger with the
   * date fields merely pre-filled and Reload still to press.
   */
  const initialSearch = useSearchParams().toString();
  const [selected, setSelected] = useState<string>(() => {
    const account = new URLSearchParams(initialSearch).get("account");
    return account !== null && ACCOUNT_ID_PATTERN.test(account) ? account : ALL_ACCOUNTS;
  });
  const [order, setOrder] = useState<Order>("newest");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>(ALL_STATUSES);
  // **On by default.** A ledger is read a day at a time far more often than as one undifferentiated
  // run, and the heading carries that day's own totals - which is the figure the table could not
  // otherwise give without the reader adding a column up by eye. Not persisted anywhere: it is a
  // view preference of no consequence, and a cookie for it would be a third thing to keep in step
  // with the typeface and the colour scheme for no gain.
  const [groupByDay, setGroupByDay] = useState(true);
  /**
   * The ledger's own date window (migration 024, PLAN task 47) — empty string for an open end, on
   * the same convention `app/statistics-view.tsx` uses.
   *
   * **Unlike every other filter on this page, it is not client-side.** Account, Order, Status and
   * Filter all narrow rows the client already holds; a page holds only the newest rows for each
   * account, so an owner asking for March cannot be answered by hiding what happens to be on
   * screen — the fetch itself has to be bounded. That is why this state feeds `load`/`loadMore`
   * rather than `visibleRows`, and why it only takes effect on Reload rather than filtering live.
   *
   * **Seeded from the incoming link, same as `selected` above.** `load` below reads `range`
   * (derived from these) on the very first call, not only on a Reload press, so a link naming a day
   * bounds the first fetch — no extra press is needed for the calendar's own promise to hold.
   *
   * **Each end is validated before it is accepted, unlike every other seed above.** A preset or an
   * account id fails safe on a bad value — the picker falls back to a known option, the select
   * shows "Unknown account" — but a malformed date string here would reach the RPC unchecked and
   * come back as a load error before the owner has touched anything. `isoDateSchema` is the same
   * check the wire contract itself uses, so what is accepted here is exactly what the route would
   * accept. Found by `/code-review high`.
   */
  const [dateFrom, setDateFrom] = useState(() => {
    const from = rangeFromSearch(initialSearch).from;
    return from !== null && isoDateSchema.safeParse(from).success ? from : "";
  });
  const [dateTo, setDateTo] = useState(() => {
    const to = rangeFromSearch(initialSearch).to;
    return to !== null && isoDateSchema.safeParse(to).success ? to : "";
  });
  const range: DateRange = useMemo(
    () => ({ from: dateFrom === "" ? null : dateFrom, to: dateTo === "" ? null : dateTo }),
    [dateFrom, dateTo]
  );
  const rangeUsable = isUsableRange(range);
  /**
   * What to say about `appliedRange`, or nothing when it is fully open.
   *
   * **Said because the reach line below it would otherwise lie by omission.** "Showing 40 of 40
   * confirmed rows" reads as *the whole ledger* — and once a window is applied, both numbers are
   * the RPC's bounded count (migration 024: `totals.rows` honours the bounds when they are
   * supplied), so 40 could just as easily be everything in one narrow month. The reach line states
   * a fraction; this states what the fraction is *of*.
   */
  const appliedRangeLabel = appliedRange.from === null && appliedRange.to === null
    ? null
    : appliedRange.from === null
      ? `up to ${appliedRange.to}`
      : appliedRange.to === null
        ? `from ${appliedRange.from} onward`
        : `${appliedRange.from} to ${appliedRange.to}`;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * What to say when the load on arrival was refused for want of a session — the sentence itself,
   * not a flag. Null when there is nothing to say.
   *
   * **It holds a message rather than a boolean because 403 means two different things here**, and
   * the first version discarded that. `strongOwnerClient` answers 403 both for an identity that is
   * not the ledger owner and for one that has not cleared aal2. Rendering one fixed line for both
   * told an owner signed in on the wrong Google account to "sign in", which he had just done —
   * and the retry could never repair it, because signing in again produces the same 403. The
   * route's own words are the only thing that distinguishes them, so they are what is shown.
   */
  const [signInNote, setSignInNote] = useState<string | null>(null);

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
  // Two figures resolved rather than one: the card reconciles on its balance as well as its
  // amount, so correcting one and not the other would pair on a figure the owner has replaced.
  const currentCards = useMemo(() => cardsInForce(cards, cardCorrections), [cards, cardCorrections]);

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

  // The card half of the same pair, declared here rather than beside the card's other derived
  // values because `showCombined` below reads it during render — a `const` read before its own
  // declaration is a ReferenceError at runtime, and one that only fires once a card exists.
  const matchingCardRecord = useMemo(
    () => (matchingCard === null ? null : currentCards.find((card) => card.id === matchingCard) ?? null),
    [matchingCard, currentCards]
  );
  const pickingCard = matchingCard !== null && matchingCardRecord !== null;

  // Entering either mode moves focus to Cancel: it is the one control that is certainly present,
  // it is the way out, and it sits beside the announcement rather than at the top of the page.
  useEffect(() => {
    if (picking || pickingCard) cancelMatching.current?.focus();
  }, [picking, pickingCard]);

  /**
   * The load on arrival (PLAN task 43).
   *
   * Guarded by a ref rather than by `transactions === null`, because React's development
   * StrictMode mounts every component twice and the state has not landed by the second mount —
   * a null check would fire the whole fan-out of requests a second time, against real financial
   * records, and only in the mode nobody runs the suites in.
   */
  const loadSequence = useRef(0);
  const loadRequested = useRef(false);
  useEffect(() => {
    if (loadRequested.current) return;
    loadRequested.current = true;
    void load(true);
    // Mount-only on purpose, and for the same reason `app/slip-capture.tsx` is: `load` is
    // redefined every render, so listing it would re-fetch the whole ledger on each one. The ref
    // above is what actually enforces that, rather than the empty dependency list.
  }, []);

  /**
   * The second half of loading on arrival: arriving *before* the session does.
   *
   * Signing in does not navigate, so the owner can land here signed out, have the automatic load
   * answered 401, and then sign in from the header with nothing below reacting — an empty table
   * and a "sign in" line in front of someone who just did. `app/owner-access.tsx` announces the
   * transition and this listens for it.
   *
   * **Registered only while `signInNote` is set**, which is what keeps it from being a second
   * load on every ordinary visit: the announcement fires whenever that component settles into
   * `ready`, including on a page that loaded its rows perfectly well a moment earlier. Gating on
   * the state that the announcement can actually repair means there is nothing to ignore.
   */
  const retriedAtGeneration = useRef(0);
  useEffect(() => {
    if (signInNote === null) return;
    const retry = () => {
      const current = ownerReadyGeneration();
      // Nothing has been announced yet, or this view already acted on the latest announcement.
      // The second half is what makes a repeated refusal stop here instead of retrying forever:
      // being refused again re-runs this effect, and the comparison is what ends it.
      if (current === 0 || retriedAtGeneration.current >= current) return;
      retriedAtGeneration.current = current;
      void load(true);
    };
    // Read first, then listen. The announcement usually fires *before* the 401 that makes this
    // view want it — the refusal travels over the network and the sign-in does not — so a view
    // that only listened would subscribe to news that had already broken.
    retry();
    return onOwnerReady(retry);
  }, [signInNote]);

  /** Null for the all-accounts view, which is what every window helper reads as "every account". */
  const scopedAccount = selected === ALL_ACCOUNTS ? null : selected;

  // The account scope, before any text filter. Balances are derived from this rather
  // than from `visible`, because a running total of whatever a search matched would
  // not be a balance.
  const scope = useMemo(
    () => (ledgerWindow === null ? [] : windowRows(ledgerWindow, scopedAccount)),
    [ledgerWindow, scopedAccount]
  );

  /**
   * What the matching rule runs over: the window **plus** every candidate, deduplicated.
   *
   * Never the window alone. A slip that is genuinely ambiguous ledger-wide but has only one of
   * its candidates on the page would pair with that one and read `verified`, when the truth is
   * that nobody has ever been asked which row it is. See `reconciliationRows`.
   */
  const reconcileInput = useMemo(
    () => (ledgerWindow === null ? [] : reconciliationRows(ledgerWindow, candidates)),
    [ledgerWindow, candidates]
  );

  /** The ids actually loaded, so a candidate pulled in as evidence is not shown as a row. */
  const heldIds = useMemo(
    () => (ledgerWindow === null ? new Set<string>() : windowIds(ledgerWindow)),
    [ledgerWindow]
  );

  /**
   * Unchanged by paging, which was the surprise of this task rather than its plan.
   *
   * Task 45 expected this walk to break on a page — seeded, it says, from the wrong row. It does
   * not: `post_balance − movement` is the balance immediately before whatever row it is applied
   * to, so handed a window it yields the balance carried into that window. The server's own figure
   * is used to *check* that (`openingDisagreements`) rather than to replace it.
   */
  /*
   * The combined balance is no longer derived here at all — every page row arrives carrying it
   * (migration 022). The client walked it until 2026-08-27 and could not: the figure is a fact
   * about *every* account at a row, and a per-account window cannot see another account's history
   * further back than its own rows reach.
   */

  /** How much of the confirmed ledger is on screen, and whether more can be fetched. */
  const reach = useMemo(
    () => (ledgerWindow === null ? { loaded: 0, total: 0 } : windowReach(ledgerWindow, scopedAccount)),
    [ledgerWindow, scopedAccount]
  );

  /**
   * Whether the ledger holds no confirmed rows **at all** — deliberately unscoped.
   *
   * This decides between "nothing has been imported yet" and "this filter matched nothing", and
   * choosing an account is a filter. Reading the scoped count here would tell an owner who
   * selected an account he has not imported into that his whole ledger was empty, which is both
   * wrong and discouraging; the owner suite fails by name on exactly that.
   */
  const ledgerIsEmpty = ledgerWindow !== null && windowReach(ledgerWindow, null).total === 0;
  const moreToLoad = ledgerWindow !== null && hasDeeperPage(ledgerWindow, scopedAccount);

  // The account column, not the reference one, whenever a slip is being matched: candidates are
  // filtered by **bank**, so with two accounts at one bank the offered rows can belong to
  // different accounts — and in the per-account layout nothing on screen would say which. That
  // is the very ambiguity `slipAccount` refuses to guess at (D-056), so the chooser must show it.
  const showCombined = picking || pickingCard || selected === ALL_ACCOUNTS;

  // Handed to every row component so the all-accounts column and the width of a full-width
  // detail or correction row cannot disagree. `columns` was written out as `showCombined ? 7 : 6`
  // at five separate places before the row kinds became components.
  const layout = useMemo<LedgerLayout>(
    () => ({ showCombined, columns: showCombined ? 7 : 6 }),
    [showCombined]
  );

  // What the owner is in the middle of, as one value. Every row consults it before deciding
  // whether its own controls are usable, and the conditions that read it live beside the buttons
  // they disable (`app/ledger-shared.ts`).
  const modes = useMemo<LedgerModes>(
    () => ({ picking, pickingCard, matching, matchingCard, deciding, decidingCard, correcting, settingReporting }),
    [picking, pickingCard, matching, matchingCard, deciding, decidingCard, correcting, settingReporting]
  );

  // Reconciliation runs over the **whole** ledger, before any account or text filter. A
  // match is a fact about two records, not about what is on screen — reconciling the
  // filtered subset would let choosing an account or typing in the search box silently
  // unmatch a pair and change the totals (D-063).
  const reconciled = useMemo(
    () => reconcileLedger(reconcileInput, currentSlips, accounts ?? [], matches, currentCash, currentCards, cardDecisions),
    [reconcileInput, currentSlips, accounts, matches, currentCash, currentCards, cardDecisions]
  );

  const cardDecisionByCard = useMemo(
    () => new Map(cardDecisions.map((decision) => [decision.card_id, decision])),
    [cardDecisions]
  );
  const cardCorrectionByCard = useMemo(
    () => new Map(cardCorrections.map((correction) => [correction.card_id, correction])),
    [cardCorrections]
  );
  // The cards as first typed, which is what a correction is measured against.
  const originalCards = useMemo(() => new Map(cards.map((card) => [card.id, card])), [cards]);

  // Retired cards, kept out of the rows and the totals but reachable, so that retiring stays as
  // reversible on screen as it is in the database.
  const retiredCards = useMemo(
    () => currentCards.filter((card) => reconciled.cardMatches.retired.has(card.id)),
    [currentCards, reconciled]
  );

  // The rows a card may be paired with by hand, for the card rows only — a matched card's control
  // is an undo and needs no list.
  const candidatesByCard = useMemo(() => {
    const byCard = new Map<string, AccountTransaction[]>();
    for (const row of reconciled.rows) {
      if (row.kind !== "card") continue;
      // The union, not the window. A chooser that offered only loaded rows would hide the very
      // row the owner is looking for and read as "it is not there" — and an override exists
      // precisely to reach past what the automatic rule would propose (D-067).
      byCard.set(row.card.id, cardMatchCandidates(row.card, reconcileInput, cardDecisions));
    }
    return byCard;
  }, [reconciled, reconcileInput, cardDecisions]);

  const offeredToCard = useMemo(
    () => new Set((matchingCard === null ? [] : candidatesByCard.get(matchingCard) ?? []).map((candidate) => candidate.id)),
    [matchingCard, candidatesByCard]
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
      byslip.set(row.slip.id, matchCandidates(row.slip, reconcileInput, accounts ?? [], matches));
    }
    return byslip;
  }, [reconciled, reconcileInput, accounts, matches]);

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
    // A card names its account as a stored, checked fact — the capture route refused it unless
    // the printed digits resolved to that account under the layout's mask (D-101). So unlike a
    // slip it is never hidden by choosing an account, and there is no unattributed case to warn
    // about.
    if (row.kind === "card") return row.card.account_id === selected;
    return row.account?.id === selected;
  }, [selected]);

  const visibleRows = useMemo(() => {
    // Matching is its own view of the ledger, not a filter of the current one: the slip being
    // matched and every row it could be, whatever the Account, Status and search controls were
    // left on. Those are suspended rather than obeyed, because a filter set earlier could
    // otherwise hide the very row the owner is looking for and read as "it is not there".
    // The card's own picking mode, on the same terms as the slip's: the card being matched and
    // every row it could be, with the other controls suspended rather than obeyed.
    if (pickingCard) {
      const candidates = reconciled.rows.filter((row) => {
        if (row.kind === "card") return row.card.id === matchingCard;
        if (row.kind === "cash" || row.kind === "provisional") return false;
        return offeredToCard.has(row.transaction.id);
      });
      candidates.sort(compareRows);
      if (order === "oldest") candidates.reverse();
      return candidates;
    }

    if (picking) {
      const candidates = reconciled.rows.filter((row) => {
        if (row.kind === "provisional") return row.slip.id === matching;
        // Neither cash nor an unmatched card is a statement row, and neither can become one, so
        // neither is ever on offer. A card is the closer call of the two and still no: it is a
        // captured record like the slip being matched, not the confirmed row the slip is looking
        // for.
        if (row.kind === "cash" || row.kind === "card") return false;
        return offered.has(row.transaction.id);
      });
      candidates.sort(compareRows);
      if (order === "oldest") candidates.reverse();
      return candidates;
    }

    const filtered = reconciled.rows.filter((row) => {
      // **A candidate is evidence, not a row of the table.** Reconciliation runs over the window
      // plus every row some record could be paired with, which is what makes a paged status
      // correct; those extra rows must then be filtered back out, because the owner asked to see
      // a page of his ledger and not the scattered rows the matching rule happened to consult.
      //
      // Filtering them out *here* rather than earlier is the whole point: removing them before
      // `reconcileLedger` is precisely the mistake this task exists to avoid.
      if (row.kind === "confirmed" && !heldIds.has(row.transaction.id)) return false;
      if (!inAccount(row)) return false;
      // Status filters the reconciled result; it never feeds back into reconciliation, which
      // has already run over the whole ledger above. That ordering is the point — a filter
      // that could change what matched would let a dropdown move the totals (D-063).
      if (status !== ALL_STATUSES && row.status !== status) return false;
      // A matched pair is one row and must be findable by any of its records' text — the
      // statement's, the slip's, and now the card's.
      if (row.kind === "confirmed") {
        return matchesQuery(row.transaction, query)
          || (row.slip !== null && matchesSlipQuery(row.slip, query))
          || (row.card !== null && matchesCardQuery(row.card, query));
      }
      if (row.kind === "cash") return matchesCashQuery(row.entry, query);
      if (row.kind === "card") return matchesCardQuery(row.card, query);
      return matchesSlipQuery(row.slip, query);
    });
    filtered.sort(compareRows);
    if (order === "oldest") filtered.reverse();
    return filtered;
  }, [reconciled, inAccount, query, order, status, matching, picking, offered, pickingCard,
      matchingCard, offeredToCard, heldIds]);

  /**
   * The strip above the table, and the one place paging could have quietly changed what a number
   * means.
   *
   * **Slips, cards and cash entries are complete on the client at any window depth** — they are
   * few and are fetched whole — so their contribution is exact whatever page the ledger is on.
   * Confirmed rows are not, so theirs comes from `list_account_transactions_page`, which computes
   * it over the whole account in SQL as sums of `bigint` minor units with no division anywhere.
   *
   * That substitution is only valid while nothing narrows the confirmed population beyond the
   * account, because the account is all the server was asked about. A text query and either of
   * the two confirmed statuses each select a subset SQL knows nothing of, so in those cases the
   * figure falls back to meaning what it has always meant — *over the rows on screen* — and the
   * reach line beneath the controls is what stops that from being a silent difference.
   */
  const totals = useMemo(() => {
    const onScreen = summarizeRows(visibleRows);
    const exact = ledgerWindow !== null && status === ALL_STATUSES && query.trim() === "";
    if (!exact) return onScreen;

    const records = summarizeRows(visibleRows.filter((row) => row.kind !== "confirmed"));
    const whole = scopeTotals(ledgerWindow, scopedAccount);
    const deposits = BigInt(records.deposits) + BigInt(whole.deposits);
    const withdrawals = BigInt(records.withdrawals) + BigInt(whole.withdrawals);
    return {
      ...onScreen,
      rows: records.rows + whole.rows,
      deposits: deposits.toString(),
      withdrawals: withdrawals.toString(),
      net: (deposits + withdrawals).toString()
    };
  }, [visibleRows, ledgerWindow, scopedAccount, status, query]);

  /**
   * The balance the strip prints, taken from the newest row **in scope** rather than on screen.
   *
   * `scope` is the window narrowed by account and nothing else, already ordered newest-first by
   * `compareTransactions` - so `[0]` is the last row of the window, and its printed balance is what
   * the window closes on. That is the figure the owner asked for: it follows the account and the
   * date range, so narrowing to March reads March's closing balance rather than today's.
   *
   * **Deliberately blind to Status and the search box**, which is the same line `scope` itself is
   * drawn on a few lines above: those narrow which rows are displayed, and the balance printed on
   * whichever row a search last matched is not a balance of anything. `date` travels with the
   * figure so the strip can say which day it belongs to rather than implying today.
   *
   * Null where the scope holds no confirmed row at all - a window of slips and cash has movements
   * and no printed balance, and the strip shows an em dash rather than inventing one.
   */
  const balance = useMemo<LedgerBalance | null>(() => {
    const newest = scope[0];
    if (newest === undefined) return null;
    if (scopedAccount !== null) {
      return { minor: newest.post_balance_minor, date: newest.source_date, combined: false };
    }
    // Every page row carries this (migration 022), but the type covers rows from other populations
    // too, so an absent figure is a real case rather than an impossible one - and the honest answer
    // to "what did every account total that day" when the row cannot say is nothing, not this one
    // account's own balance dressed up as the combined figure.
    const combined = newest.combined_balance_minor;
    return combined === undefined ? null : { minor: combined, date: newest.source_date, combined: true };
  }, [scope, scopedAccount]);

  /**
   * Where a day's heading row belongs, keyed by the row that opens it.
   *
   * **Off while a record is being matched by hand, whatever the control says.** That mode lists one
   * captured record and the rows it could be - candidates drawn from across the ledger by amount and
   * bank, not a stretch of it - so a day heading over them would print a total of unrelated rows,
   * which is the same reason the totals strip disappears entirely in that mode.
   */
  const dayHeads = useMemo(
    () => (groupByDay && !picking && !pickingCard ? dayGroups(visibleRows) : null),
    [groupByDay, picking, pickingCard, visibleRows]
  );

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

  /**
   * Loads everything the view shows.
   *
   * `automatic` says who asked. It changes exactly one thing — how a 401 or 403 from the first
   * request is reported — and nothing else, because a load the page performs by itself and a load
   * the owner pressed for should otherwise behave identically or the Reload button is testing a
   * different path from the one that runs.
   */
  async function load(automatic = false) {
    // A transposed range is refused here rather than sent: the route would answer 400 and the
    // reload would replace a working table with an error the owner can see is his own typing.
    // Reload is already disabled on the same condition — this is what stops the other three
    // callers (mount, the sign-in retry, a cash payment's refresh) from sending it anyway.
    if (!rangeUsable) {
      setError("That date range ends before it starts, so nothing was requested.");
      return;
    }

    // **Which load is allowed to write the state.** Two can overlap now in a way they could not
    // when nothing loaded until asked: the load on arrival can still be in flight when recording a
    // cash payment starts a second one. Whichever *starts* last is the one holding the newer
    // truth, so an older load that resolves late must drop its results rather than overwrite them
    // — otherwise a row the owner has just written disappears from a money view for no visible
    // reason. Checked before every state commit below, not only at the end.
    const mine = loadSequence.current + 1;
    loadSequence.current = mine;
    const superseded = () => loadSequence.current !== mine;

    setBusy(true);
    setError(null);
    setSignInNote(null);
    try {
      // **The two blocking loads used to be the two least defended.** Both parsed their body with
      // a bare `.json()` while the three optional loads below guarded theirs, so a platform error
      // page — HTML, not JSON — threw here and was caught at the bottom as "the ledger could not be
      // reached", sending the owner to check Docker when the route had in fact answered him.
      // `ledgerRequest` tells the three cases apart; `unreachable` keeps the wording that was right
      // for the case it really was.
      const accountsResult = await ledgerRequest("/api/v1/accounts", accountListSchema, {
        fallback: "Accounts could not be loaded.",
        unreachable: "The ledger could not be reached. Check that the local Supabase stack is running.",
        offContract: "The accounts response did not match its contract. Run the unit tests before trusting this view."
      });
      if (superseded()) return;
      if (!accountsResult.ok) {
        // **Signed out is not a failure, and this page is where that distinction became visible.**
        // The ledger loads on arrival, so a visitor who is not signed in now issues a request
        // before touching anything, and `strongOwnerClient` correctly answers 401 — 403 for a
        // signed-in identity that is not the owner, or is the owner without aal2. Reporting any of
        // those as "Not loaded" would put a red alert on the first surface anyone sees, describing
        // a route working exactly as designed. A press still reports it in full, as an alert: the
        // owner asked, so the owner is answered.
        //
        // **Only 401 gets wording of this view's own.** A 403 keeps the route's sentence, because
        // its two cases need telling apart and only the route knows which one it is — "This
        // identity is not the ledger owner" is not answered by signing in again.
        if (automatic && accountsResult.status === 401) {
          setSignInNote("Sign in to read the ledger.");
          return;
        }
        if (automatic && accountsResult.status === 403) {
          setSignInNote(accountsResult.why);
          return;
        }
        setError(accountsResult.why);
        return;
      }

      // One call per account, and now **one page** per call. The RPC is per-account and there is
      // no all-accounts one; taking each account's newest page and merging is still exactly right
      // for the merged view, because any row among the newest N of the union is necessarily among
      // the newest N of its own account.
      let next = emptyWindow();
      for (const account of accountsResult.data.accounts) {
        // The window's own bounds, cursor null for a first page — `ledgerPageSearch` is what
        // `loadMore` below reuses so a deeper page cannot forget them.
        const result = await ledgerRequest(
          `/api/v1/accounts/${account.id}/transactions${ledgerPageSearch(range, null)}`, ledgerPageSchema, {
            fallback: `Transactions could not be loaded for ${account.label}.`,
            unreachable: "The ledger could not be reached. Check that the local Supabase stack is running.",
            offContract: `The transactions response for ${account.label} did not match its contract.`
          });
        if (!result.ok) {
          setError(result.why);
          return;
        }
        next = withPage(next, account.id, result.data, cursorAfter(result.data.rows));
      }

      // **The candidate set, and it is not optional the way slips and cash are.** Those three
      // fail soft because the confirmed ledger is the authority and an outage in a captured
      // record must not hide it. This is different: without it the matching rule runs over a page
      // and can pair a slip that is genuinely ambiguous, which shows `verified` on a row nobody
      // ever confirmed. A missing answer is recoverable; a confidently wrong one about money is
      // not, so a failure here stops the load with the rest of the ledger.
      const candidateResult = await ledgerRequest(
        "/api/v1/transactions/match-candidates", matchCandidateListSchema, {
          fallback: "The reconciliation set could not be loaded, so the ledger is not shown.",
          unreachable: "The ledger could not be reached. Check that the local Supabase stack is running.",
          offContract: "The reconciliation set did not match its contract, so the ledger is not shown."
        });
      if (superseded()) return;
      if (!candidateResult.ok) {
        setError(candidateResult.why);
        return;
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
      const slipsResult = await ledgerRequest("/api/v1/slips", slipListSchema, {
        fallback: "Captured slips could not be loaded, so none are shown.",
        offContract: "The slips response did not match its contract, so none are shown."
      });
      if (superseded()) return;
      if (slipsResult.ok) {
        setSlips(slipsResult.data.slips);
        setMatches(slipsResult.data.matches);
        setSlipCorrections(slipsResult.data.corrections);
      } else setSlipsError(slipsResult.why);

      // Cash entries, on the same terms: the confirmed ledger is the authority, so a failure
      // here is reported beside the rows rather than replacing them. Corrections arrive on the
      // same response as the entries they correct, and are cleared with them — showing an
      // entry whose correction went missing would put a figure the owner has already replaced
      // into the ledger and into its totals.
      setCashError(null);
      setCash([]);
      setCashCorrections([]);
      const cashResult = await ledgerRequest("/api/v1/cash", cashListSchema, {
        fallback: "Cash entries could not be loaded, so none are shown.",
        offContract: "The cash response did not match its contract, so none are shown."
      });
      if (superseded()) return;
      if (cashResult.ok) {
        setCash(cashResult.data.entries);
        setCashCorrections(cashResult.data.corrections);
      } else setCashError(cashResult.why);

      // Notification cards, last and on the same terms. A card that fails to load is a payment
      // missing from the view, which is why it is said out loud below rather than left to a
      // shorter row count nobody would notice.
      setCardsError(null);
      setCards([]);
      // Corrections and decisions are cleared with the cards they belong to, for the reason slips
      // and cash do it: keeping stale ones would reconcile against records no longer on screen,
      // and keeping none while the cards loaded would present an overruled pairing as the rule's
      // own and silently un-retire a card the owner had retired.
      setCardCorrections([]);
      setCardDecisions([]);
      const cardsResult = await ledgerRequest("/api/v1/notification-cards", notificationCardListSchema, {
        fallback: "Captured notification cards could not be loaded, so none are shown.",
        offContract: "The notification cards response did not match its contract, so none are shown."
      });
      if (superseded()) return;
      if (cardsResult.ok) {
        setCards(cardsResult.data.cards);
        setCardCorrections(cardsResult.data.corrections);
        setCardDecisions(cardsResult.data.decisions);
      } else setCardsError(cardsResult.why);

      if (superseded()) return;
      setAccounts(accountsResult.data.accounts);
      setCandidates(candidateResult.data.candidates);
      // Set together, because they describe one fetch. `appliedRange` is what `loadMore` must walk
      // inside of — recording it only here, never from the live inputs, is what keeps an edited but
      // unapplied date field from reaching a deeper page before Reload does.
      setAppliedRange(range);
      // Last, and it is what `loaded` is read from. A reload replaces the window rather than
      // extending it: the pages it just fetched are the newest ones again, and appending them to
      // a window that already held them would show every row twice.
      setLedgerWindow(next);
    } catch {
      if (superseded()) return;
      setError("The ledger could not be reached. Check that the local Supabase stack is running.");
    } finally {
      // **Only the newest load owns `busy`.** A superseded one clearing it would put the control
      // back to "Reload" while a load is still in flight — and the owner suite waits on exactly
      // that label to know rows have arrived, so it would be waiting on a lie.
      if (!superseded()) setBusy(false);
    }
  }

  /**
   * Fetches the next page of every account that still has one, and extends the window.
   *
   * **Not a reload, and it deliberately touches nothing else.** Slips, cards, cash and the
   * candidate set are already complete; re-fetching them here would make a "load more" press cost
   * five requests to answer one question, and would also let a record that changed underneath
   * arrive without the owner having asked for a refresh.
   *
   * It carries its own busy flag rather than sharing `busy`, because `busy` is what the Reload
   * control and the owner suite read as "the ledger is being replaced". Paging deeper is an
   * addition to what is on screen, so the rows stay readable and interactive while it runs.
   *
   * Superseded the same way a load is: pressing twice quickly, or pressing while a reload is in
   * flight, must not splice a page into a window that has since been replaced.
   */
  async function loadMore() {
    if (ledgerWindow === null || loadingMore) return;
    const mine = loadSequence.current;
    setLoadingMore(true);
    try {
      let next = ledgerWindow;
      // Scoped to the selected account, matching the reach line above the control. An unscoped
      // loop would deepen windows that line is not counting — and window depth is what decides
      // where the combined balance is knowable, so it would move figures on the merged view too.
      for (const page of deeperPages(ledgerWindow, scopedAccount)) {
        const cursor = page.cursor;
        // A page marked `hasMore` with no cursor cannot happen — the cursor is read off the last
        // row of a non-empty page — but reading one would silently re-fetch the first page and
        // duplicate every row, so it is skipped rather than trusted.
        if (cursor === null) continue;
        // `appliedRange`, not `range`: the cursor was produced walking *this* window, and an
        // edited-but-not-yet-reloaded date field must not reach a deeper page ahead of Reload.
        const result = await ledgerRequest(
          `/api/v1/accounts/${page.accountId}/transactions${ledgerPageSearch(appliedRange, cursor)}`, ledgerPageSchema, {
            fallback: "The next page of the ledger could not be loaded.",
            unreachable: "The ledger could not be reached. Check that the local Supabase stack is running.",
            offContract: "The next page did not match its contract."
          });
        if (!result.ok) {
          // Guarded like every other commit here: a reload that started meanwhile owns the error
          // line, and a superseded page must not clear its message or replace it with a paging one.
          if (loadSequence.current === mine) setError(result.why);
          return;
        }
        next = withPage(next, page.accountId, result.data, cursorAfter(result.data.rows) ?? cursor);
      }
      if (loadSequence.current !== mine) return;
      setLedgerWindow(next);
    } catch {
      if (loadSequence.current !== mine) return;
      setError("The ledger could not be reached. Check that the local Supabase stack is running.");
    } finally {
      setLoadingMore(false);
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

  /**
   * The owner's say over one card (migration 017). Four cases reach this: naming a statement row,
   * saying it is on none of them, retiring a card that should never have been captured, and
   * un-retiring one.
   *
   * `acceptBalanceMismatch` defaults to false, so the first attempt at a disagreeing pairing is
   * refused and the owner is told what disagreed. Pressing again with the acknowledgement is what
   * stores the consent — the refusal is the design working, not an error to route around.
   */
  async function decideCard(
    cardId: string,
    decision: "matched" | "unmatched" | "not-a-payment",
    transactionId: string | null,
    acceptBalanceMismatch = false
  ) {
    setDecidingCard(cardId);
    setDecisionError(null);
    try {
      const response = await fetch(`/api/v1/notification-cards/${cardId}/decision`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedRevision: cardDecisionByCard.get(cardId)?.revision ?? 0,
          decision,
          transactionId,
          acceptBalanceMismatch
        })
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setDecisionError(readError(body, "The card decision could not be saved."));
        return;
      }
      const parsed = notificationCardDecisionResponseSchema.safeParse(body);
      if (!parsed.success) {
        setDecisionError("The saved decision did not match its contract. Reload before trusting this view.");
        return;
      }
      setCardDecisions((current) => [...current.filter((entry) => entry.card_id !== cardId), parsed.data.decision]);
      setMatchingCard(null);
    } catch {
      setDecisionError("The ledger could not be reached, so the decision was not saved.");
    } finally {
      setDecidingCard(null);
    }
  }

  /**
   * Takes one confirmed row in or out of reporting (PLAN task 48).
   *
   * **The body is derived from the row, never assembled here**, because the endpoint takes the
   * whole overlay and the RPC writes every column: a body naming only the flag is refused, and one
   * sending the rest as null is accepted and erases whatever the owner typed on the row. That is
   * `overlayWriteBody`'s whole reason for existing, and it is why this function is three lines of
   * request around one call rather than an object literal.
   *
   * The stored overlay is folded back rather than reloaded, on the same rule as every other write
   * here — and `withOverlay` corrects the account totals with it, because those came from SQL that
   * honours the flag and would otherwise contradict the row on screen.
   */
  async function setReporting(transaction: AccountTransaction, includeInReporting: boolean) {
    setSettingReporting(transaction.id);
    setReportingError(null);
    const result = await ledgerRequest(
      `/api/v1/transactions/${transaction.id}/overlay`,
      overlayWriteResponseSchema,
      {
        fallback: "The reporting flag could not be saved.",
        unreachable: "The ledger could not be reached, so the reporting flag was not saved.",
        offContract: "The overlay was saved but did not come back in its published shape. Reload before trusting the totals."
      },
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(overlayWriteBody(transaction, { includeInReporting }))
      }
    );
    setSettingReporting(null);
    if (!result.ok) {
      setReportingError(result.why);
      return;
    }
    setLedgerWindow((current) => current === null ? current : withOverlay(current, transaction.id, result.data.overlay));
  }

  /**
   * A stored correction, folded back into state rather than triggering a reload.
   *
   * The whole reconciled view is derived from these lists, so replacing one overlay re-runs
   * the rule, the totals and any other slip that was competing for a row — with the revision
   * the database actually stored, which is the one the next write must send.
   *
   * All three sit together. Two of them used to sit halfway up the derivation pipeline, which
   * read as though the pipeline depended on them; it does not, and they belong with the other
   * writes.
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

  function storeCardCorrection(cardId: string, saved: unknown) {
    const parsed = notificationCardCorrectionResponseSchema.safeParse({ correction: saved });
    if (!parsed.success) {
      setCorrectionError("The correction was saved but did not come back in its published shape. Reload before trusting this view.");
      return;
    }
    setCardCorrections((current) => [...current.filter((entry) => entry.card_id !== cardId), parsed.data.correction]);
    setCorrecting(null);
  }

  /**
   * The four things a row asks this view to do, named once here rather than written as an inline
   * closure per row kind.
   *
   * Each clears the error line belonging to the thing it is about before starting: a refusal left
   * on screen from the previous attempt would be read as a refusal of this one.
   */
  function toggleCorrecting(recordId: string) {
    setCorrectionError(null);
    setCorrecting((current) => current === recordId ? null : recordId);
  }

  function stopCorrecting() {
    setCorrecting(null);
  }

  function chooseRowForSlip(slipId: string) {
    setDecisionError(null);
    setMatching(slipId);
  }

  function chooseRowForCard(cardId: string) {
    setDecisionError(null);
    setMatchingCard(cardId);
  }

  // The two detail panels a matched row can open. Independent of each other because a row can
  // carry a slip and a card at once and the two are separate questions.
  function togglePair(transactionId: string) {
    setOpenPair((current) => current === transactionId ? null : transactionId);
  }

  function toggleCard(transactionId: string) {
    setOpenCard((current) => current === transactionId ? null : transactionId);
  }

  return (
    <>
    {/* A sibling of the ledger rather than a child of it, so the page keeps a flat outline —
        but rendered from here, because recording a cash payment must refresh the rows below
        and a capture is an event, not something an effect should react to (D-075).

        **It stays above the table, contracted rather than moved** (PLAN task 42). Dropping it
        below would have made the table start marginally higher and cost more than it bought:
        recording a payment reloads the rows, and the row that was just written would then appear
        in a table the owner had scrolled past. It is one line now, which does not compete with a
        table for the eye.

        **It reloads unconditionally, and the guard it used to carry was a real defect.** It read
        `if (transactions !== null)`, which was right when nothing loaded until asked and wrong the
        moment the ledger loaded itself: signing in on this page starts a load, and a payment
        recorded while that load is still in flight found `transactions` still null and refreshed
        nothing, so the row just written was missing from the table. There is no case left for the
        guard to cover — this fires only after the write succeeded, which means the session is
        good, which means the load will be too. The owner suite failed on exactly this. */}
    <CashEntryForm onRecorded={() => { void load(); }} />
    <section className="ledger-band" aria-labelledby="ledger-title">
      {/* `onLoad` is `() => void load()` and not `load`: React hands a click handler the
          MouseEvent, which would arrive as `automatic` and be truthy — silently turning every
          manual Reload into one that swallows an authentication refusal. */}
      <LedgerControls
        busy={busy}
        loaded={ledgerWindow !== null}
        accounts={accounts}
        selected={selected}
        order={order}
        status={status}
        query={query}
        dateFrom={dateFrom}
        dateTo={dateTo}
        rangeUsable={rangeUsable}
        groupByDay={groupByDay}
        modes={modes}
        onLoad={() => void load()}
        onSelectAccount={setSelected}
        onOrderChange={setOrder}
        onStatusChange={setStatus}
        onQueryChange={setQuery}
        onDateFromChange={setDateFrom}
        onDateToChange={setDateTo}
        onGroupByDayChange={setGroupByDay}
      />

      {error ? (
        <div className="warning error" role="alert">
          <strong>Not loaded</strong>
          <span>{error}</span>
        </div>
      ) : null}

      {/* Not an alert and not styled as a warning: nothing has gone wrong. The header above owns
          signing in — this only says why the table is empty, which is the question the empty
          space would otherwise raise. */}
      {signInNote ? (
        <p className="ledger-status" role="status">{signInNote}</p>
      ) : null}

      {ledgerWindow ? (
        <>
          {/* Stated before any figure it qualifies, on the same rule `app/statistics-view.tsx`
              follows for its own window line — a reader should never have to trust a date input
              over what is actually on screen. Suppressed during matching, on the same terms as the
              reach line further down: that mode is its own view of the ledger and this would
              describe a different question than the one the banner is already answering. */}
          {appliedRangeLabel && !picking && !pickingCard ? (
            <p className="ledger-status">Showing confirmed rows {appliedRangeLabel}.</p>
          ) : null}

          <LedgerSummary
            modes={modes}
            matchingSlip={matchingSlip}
            matchingCardRecord={matchingCardRecord}
            offeredCount={offered.size}
            offeredToCardCount={offeredToCard.size}
            totals={totals}
            balance={balance}
            slipCount={slips.length}
            cardCount={cards.length}
            matches={reconciled.matches}
            cardMatches={reconciled.cardMatches}
            cancelRef={cancelMatching}
            onCancelMatching={() => setMatching(null)}
            onCancelMatchingCard={() => setMatchingCard(null)}
          />

          {slipsError ? (
            <p className="ledger-status" role="status">{slipsError}</p>
          ) : null}

          {cashError ? (
            <p className="ledger-status" role="status">{cashError}</p>
          ) : null}

          {cardsError ? (
            <p className="ledger-status" role="status">{cardsError}</p>
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

          {/* Its own line rather than the decision one. A refused reporting write and a refused
              match are acted on differently — this one is usually a stale revision from a second
              tab, and the remedy is a reload — and a shared line cannot say which it is about. */}
          {reportingError ? (
            <div className="warning error" role="alert">
              <strong>Reporting</strong>
              <span>{reportingError}</span>
            </div>
          ) : null}

          {!picking &&!showCombined && unattributedSlips > 0 ? (
            <p className="ledger-status">
              {unattributedSlips} slip{unattributedSlips === 1 ? " is" : "s are"} hidden while one account is selected: you hold more than one account at that bank, and a slip&rsquo;s QR names the bank without saying which account the money moved through.
            </p>
          ) : null}

          {/* The count and the account names are data and stay. The sentence explaining *why* the
              combined balance covers only these is a rule, and folds (PLAN task 42). */}
          {!picking &&showCombined && accounts ? (
            <p className="ledger-status">
              <b>Imported accounts: {importedAccounts.length} of {accounts.length}</b>
              {importedAccounts.length > 0
                ? ` · ${importedAccounts.map((account) => `${account.label} ···· ${account.last_four}`).join(" · ")}`
                : null}
              {importedAccounts.length < accounts.length ? (
                <LedgerNote label="Why some accounts are missing">
                  The all-accounts balance covers the imported accounts only, since an account with
                  no rows has no balance to derive.
                </LedgerNote>
              ) : null}
            </p>
          ) : null}

          {visibleRows.length === 0 ? (
            <p className="ledger-empty" role="status">
              {ledgerIsEmpty && slips.length === 0
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
                    /**
                     * The day heading that belongs above this row, when one does.
                     *
                     * **Returned in an array beside the row rather than wrapped around it**, which
                     * is what keeps the four branches below byte-identical to what they were: a
                     * heading is a sibling `<tr>`, not a container for one, and a `<tbody>` is the
                     * one place a wrapper element cannot be introduced to hold them together.
                     * `dayHeads` is null when grouping is off or a match is being chosen by hand,
                     * so every row answers "no heading" without a second condition here.
                     */
                    const head = dayHeads?.get(row.id) ?? null;
                    const heading = head === null ? null : (
                      <tr className="day-head" key={`day-${head.date}`}>
                        {/* `colgroup`, because this cell genuinely heads the rows beneath it for as
                            far as the next heading - which is what a screen reader needs told, and
                            what a styled `<td>` would have said nothing about. */}
                        <th scope="colgroup" colSpan={layout.columns}>
                          <span className="day-head-line">
                            <span className="day-head-date">{formatDayHeading(head.date)}</span>
                            <span>{head.totals.rows} row{head.totals.rows === 1 ? "" : "s"}</span>
                            {/* **In and out separately, never a net figure**: the owner's own reading
                                on the calendar (D-179) and the same one here - a day that took 20,000
                                in and paid 19,500 out is not a 500 day, and a single number is the
                                only way to fail to say so. Signed and coloured on the strip's rule,
                                where the sign is printed and the colour only reinforces it.

                                **A direction that did not move is omitted rather than printed as
                                zero**, which is the one place this differs from the strip above.
                                The strip is one row of figures read once; this line repeats over
                                every day on screen, and most days move in one direction only - so
                                a "+฿0.00" on each of them is a column of noise saying nothing the
                                absent figure does not already say. Same reasoning the calendar
                                draws an empty day empty instead of at the bottom of its ramp. */}
                            {BigInt(head.totals.deposits) !== 0n
                              ? <b className="positive">+{formatThb(head.totals.deposits)}</b>
                              : null}
                            {BigInt(head.totals.withdrawals) !== 0n
                              ? <b className="negative">{formatThb(head.totals.withdrawals)}</b>
                              : null}
                          </span>
                        </th>
                      </tr>
                    );
                    if (row.kind === "cash") {
                      return [heading, (
                        <LedgerCashRow
                          key={row.entry.id}
                          row={row}
                          layout={layout}
                          modes={modes}
                          original={originalCash.get(row.entry.id)}
                          correction={cashCorrectionByEntry.get(row.entry.id) ?? null}
                          onToggleCorrecting={toggleCorrecting}
                          onCorrectionSaved={storeCashCorrection}
                          onCancelCorrection={stopCorrecting}
                        />
                      )];
                    }

                    if (row.kind === "card") {
                      return [heading, (
                        <LedgerCardRow
                          key={row.card.id}
                          row={row}
                          layout={layout}
                          modes={modes}
                          original={originalCards.get(row.card.id)}
                          correction={cardCorrectionByCard.get(row.card.id) ?? null}
                          candidates={candidatesByCard.get(row.card.id) ?? []}
                          fittingRows={reconciled.cardMatches.balanceConflict.get(row.card.id) ?? 0}
                          reviewReason={reconciled.cardMatches.needsReview.get(row.card.id)}
                          onChooseRow={chooseRowForCard}
                          onNotAPayment={(cardId) => void decideCard(cardId, "not-a-payment", null)}
                          onToggleCorrecting={toggleCorrecting}
                          onCorrectionSaved={storeCardCorrection}
                          onCancelCorrection={stopCorrecting}
                        />
                      )];
                    }

                    if (row.kind === "provisional") {
                      return [heading, (
                        <LedgerSlipRow
                          key={row.slip.id}
                          row={row}
                          layout={layout}
                          modes={modes}
                          original={originalSlips.get(row.slip.id)}
                          correction={slipCorrectionBySlip.get(row.slip.id) ?? null}
                          candidates={candidatesBySlip.get(row.slip.id) ?? []}
                          onChooseRow={chooseRowForSlip}
                          onToggleCorrecting={toggleCorrecting}
                          onCorrectionSaved={storeSlipCorrection}
                          onCancelCorrection={stopCorrecting}
                        />
                      )];
                    }

                    return [heading, (
                      <LedgerStatementRow
                        key={row.transaction.id}
                        row={row}
                        layout={layout}
                        modes={modes}
                        account={accountsById.get(row.transaction.account_id)}
                        combinedBalance={row.transaction.combined_balance_minor ?? null}
                        matchingCardRecord={matchingCardRecord}
                        slipCorrected={row.slip !== null && slipCorrectionBySlip.has(row.slip.id)}
                        openPair={openPair}
                        openCard={openCard}
                        onTogglePair={togglePair}
                        onToggleCard={toggleCard}
                        onDecideSlip={decide}
                        onDecideCard={decideCard}
                        onSetReporting={setReporting}
                      />
                    )];
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* **How much of the ledger is on screen, said plainly, and the way to see more.**
              Paging's characteristic bug is a filter that silently means "…within this page", so
              the remedy is that the page never pretends to be the ledger. The line states both
              numbers rather than a percentage: a count is what the owner can act on, and this app
              does not divide.

              It is suppressed while a match is being chosen, because that mode is its own view of
              the ledger and the row count beneath it would describe a different question than the
              one on screen. */}
          {moreToLoad && !picking && !pickingCard ? (
            <p className="ledger-status" role="status">
              Showing {reach.loaded} of {reach.total} confirmed rows.
              {status !== ALL_STATUSES && statusIsComplete(status)
                ? " This filter reads every record, so it is complete whatever is loaded."
                : null}
              {" "}
              {/* `.link-button` rather than a bare one: with no class it inherited the surrounding
                  prose and the only route to the rest of the ledger read as the last three words of
                  a sentence. Seen on the real deployment, not in the suite — a control that looks
                  wrong is invisible to an assertion that only asks whether it exists. */}
              <button type="button" className="link-button" onClick={() => void loadMore()} disabled={loadingMore || busy}>
                {loadingMore ? "Loading…" : "Load older rows"}
              </button>
            </p>
          ) : null}

          {/* Retired cards, out of the rows and the totals but never out of reach. Without this
              the database's reversibility would be theoretical: the row vanishes from the ledger,
              and there would be nothing on screen to undo it from. */}
          {retiredCards.length > 0 && !picking && !pickingCard ? (
            <LedgerRetiredCards
              cards={retiredCards}
              expanded={showRetired}
              decidingCard={decidingCard}
              onToggle={() => setShowRetired((current) => !current)}
              onBringBack={(cardId) => void decideCard(cardId, "unmatched", null)}
            />
          ) : null}
        </>
      ) : null}
    </section>
    </>
  );
}
