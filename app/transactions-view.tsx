"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { accountListSchema, type LedgerAccount } from "@/lib/accounts";
import {
  combinedBalanceByTransaction,
  matchesCardQuery,
  matchesCashQuery,
  matchesQuery,
  matchesSlipQuery,
  transactionListSchema,
  type AccountTransaction
} from "@/lib/transactions";
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
import { LedgerRetiredCards } from "@/app/ledger-retired-cards";
import {
  ALL_ACCOUNTS,
  ALL_STATUSES,
  type LedgerLayout,
  type LedgerModes,
  type Order,
  type StatusFilter
} from "@/app/ledger-shared";
import { LedgerSlipRow } from "@/app/ledger-slip-row";
import { LedgerStatementRow } from "@/app/ledger-statement-row";
import { LedgerSummary } from "@/app/ledger-summary";
import { readError } from "@/lib/wire";

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
    () => ({ picking, pickingCard, matching, matchingCard, deciding, decidingCard, correcting }),
    [picking, pickingCard, matching, matchingCard, deciding, decidingCard, correcting]
  );

  // Reconciliation runs over the **whole** ledger, before any account or text filter. A
  // match is a fact about two records, not about what is on screen — reconciling the
  // filtered subset would let choosing an account or typing in the search box silently
  // unmatch a pair and change the totals (D-063).
  const reconciled = useMemo(
    () => reconcileLedger(transactions ?? [], currentSlips, accounts ?? [], matches, currentCash, currentCards, cardDecisions),
    [transactions, currentSlips, accounts, matches, currentCash, currentCards, cardDecisions]
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
      byCard.set(row.card.id, cardMatchCandidates(row.card, transactions ?? [], cardDecisions));
    }
    return byCard;
  }, [reconciled, transactions, cardDecisions]);

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
  }, [reconciled, inAccount, query, order, status, matching, picking, offered, pickingCard, matchingCard, offeredToCard]);

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
      const cardsResponse = await fetch("/api/v1/notification-cards", { cache: "no-store" });
      const cardsBody: unknown = await cardsResponse.json().catch(() => null);
      if (!cardsResponse.ok) {
        setCardsError(readError(cardsBody, "Captured notification cards could not be loaded, so none are shown."));
      } else {
        const parsedCards = notificationCardListSchema.safeParse(cardsBody);
        if (parsedCards.success) {
          setCards(parsedCards.data.cards);
          setCardCorrections(parsedCards.data.corrections);
          setCardDecisions(parsedCards.data.decisions);
        } else setCardsError("The notification cards response did not match its contract, so none are shown.");
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
        and a capture is an event, not something an effect should react to (D-075). Nothing
        reloads unless the ledger has already been asked for once. */}
    <CashEntryForm onRecorded={() => { if (transactions !== null) void load(); }} />
    <section className="ledger-band" aria-labelledby="ledger-title">
      <LedgerControls
        busy={busy}
        loaded={transactions !== null}
        accounts={accounts}
        selected={selected}
        order={order}
        status={status}
        query={query}
        modes={modes}
        onLoad={load}
        onSelectAccount={setSelected}
        onOrderChange={setOrder}
        onStatusChange={setStatus}
        onQueryChange={setQuery}
      />

      {error ? (
        <div className="warning error" role="alert">
          <strong>Not loaded</strong>
          <span>{error}</span>
        </div>
      ) : null}

      {transactions ? (
        <>
          <LedgerSummary
            modes={modes}
            matchingSlip={matchingSlip}
            matchingCardRecord={matchingCardRecord}
            offeredCount={offered.size}
            offeredToCardCount={offeredToCard.size}
            totals={totals}
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
                      return (
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
                      );
                    }

                    if (row.kind === "card") {
                      return (
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
                      );
                    }

                    if (row.kind === "provisional") {
                      return (
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
                      );
                    }

                    return (
                      <LedgerStatementRow
                        key={row.transaction.id}
                        row={row}
                        layout={layout}
                        modes={modes}
                        account={accountsById.get(row.transaction.account_id)}
                        combinedBalance={combined.get(row.transaction.id) ?? row.transaction.post_balance_minor}
                        matchingCardRecord={matchingCardRecord}
                        slipCorrected={row.slip !== null && slipCorrectionBySlip.has(row.slip.id)}
                        openPair={openPair}
                        openCard={openCard}
                        onTogglePair={togglePair}
                        onToggleCard={toggleCard}
                        onDecideSlip={decide}
                        onDecideCard={decideCard}
                      />
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

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
