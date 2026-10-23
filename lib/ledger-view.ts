import type { LedgerAccount } from "@/lib/accounts";
import {
  chooserRows,
  hasDeeperPage,
  reconciliationRows,
  scopeTotals,
  statusIsComplete,
  windowIds,
  windowReach,
  windowRows,
  type LedgerWindow
} from "@/lib/ledger-window";
import type { CashEntry } from "@/lib/cash";
import { cardMatchCandidates } from "@/lib/notification-card-reconcile";
import type { NotificationCard, NotificationCardDecision } from "@/lib/notification-cards";
import {
  compareRows,
  dayGroups,
  matchCandidates,
  reconcileLedger,
  summarizeRows,
  type ReconciledRow,
  type RowStatus
} from "@/lib/slip-reconcile";
import type { CapturedSlip, SlipMatchDecision } from "@/lib/slips";
import {
  matchesCardQuery,
  matchesCashQuery,
  matchesQuery,
  matchesSlipQuery,
  withoutDuplicates,
  type AccountTransaction
} from "@/lib/transactions";

/**
 * The ledger view's derivation, out of `app/transactions-view.tsx` (D-293). Pure: no React, no
 * fetch, no clock. The component holds the state and calls this once per render; the rules the
 * pipeline enforces (reconciliation over window plus candidates, the chooser's lazy set, the
 * combined balance from SQL, duplicates hidden for display only, the BigInt totals splice) are
 * testable here instead of only through the component.
 */

/** The Account control's "no account chosen" value, which is not an account id. */
export const ALL_ACCOUNTS = "all";
/** The Status control's "ask nothing" value, which is not a `RowStatus`. */
export const ALL_STATUSES = "all";

export type Order = "newest" | "oldest";
export type StatusFilter = typeof ALL_STATUSES | RowStatus;

/**
 * The balance a window closes on, and what it is a balance of.
 *
 * `date` travels with the figure rather than being inferred at the point of display, because the
 * whole hazard of this number is that it looks current and is only as current as the window: a
 * ledger narrowed to March closes on March's balance, and a strip that printed it without saying
 * so would be quietly wrong on every date filter. `combined` distinguishes the all-accounts figure
 * (`combined_balance_minor`, migration 022) from one account's own `post_balance_minor`; the two
 * are different facts and only the row knows which it is carrying.
 */
export type LedgerBalance = {
  readonly minor: string;
  readonly date: string;
  readonly combined: boolean;
};

/**
 * Whether the table is showing the all-accounts layout, and how many columns that makes.
 *
 * The two travel together because they cannot be allowed to disagree: `columns` is what a
 * full-width detail or correction row spans, and it was written as `showCombined ? 7 : 6` at
 * five separate places in the file this came out of.
 */
export type LedgerLayout = {
  readonly showCombined: boolean;
  readonly columns: number;
};

/**
 * The manual chooser's rows, from `list_chooser_candidates`: bank or account and exact amount, no
 * date window (D-067). Fetched when the owner starts choosing a row, not with the ledger
 * (D-158), and dropped whenever a decision is written or the ledger reloads, so the next
 * choosing fetches a set that includes the new decision's rows.
 */
export type ChooserSet =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "ready"; rows: AccountTransaction[] };

/** What the load and the chooser fetched. Slips, cash and cards are the in-force (corrected) ones. */
export type LedgerViewData = {
  ledgerWindow: LedgerWindow | null;
  candidates: readonly AccountTransaction[];
  accounts: readonly LedgerAccount[] | null;
  slips: readonly CapturedSlip[];
  matches: readonly SlipMatchDecision[];
  cash: readonly CashEntry[];
  cards: readonly NotificationCard[];
  cardDecisions: readonly NotificationCardDecision[];
  duplicates: ReadonlySet<string>;
  chooserSet: ChooserSet;
};

export type LedgerViewFilters = {
  /** An account id or `ALL_ACCOUNTS`. */
  selected: string;
  query: string;
  status: StatusFilter;
  order: Order;
  groupByDay: boolean;
  showDuplicates: boolean;
};

/** The slip and the card being matched by hand, by id. */
export type LedgerChoosing = {
  matching: string | null;
  matchingCard: string | null;
};

type Reconciled = ReturnType<typeof reconcileLedger>;
type ChooserState = { state: "loading" } | { state: "error"; message: string } | { state: "ready" };
type Totals = ReturnType<typeof summarizeRows>;

export type LedgerView = {
  picking: boolean;
  pickingCard: boolean;
  matchingSlip: CapturedSlip | null;
  matchingCardRecord: NotificationCard | null;
  /** Null for the all-accounts view, which is what every window helper reads as "every account". */
  scopedAccount: string | null;
  reach: { loaded: number; total: number };
  ledgerIsEmpty: boolean;
  moreToLoad: boolean;
  partialFilter: boolean;
  showCombined: boolean;
  layout: LedgerLayout;
  reconciled: Reconciled;
  retiredCards: NotificationCard[];
  chooserState: ChooserState;
  offered: Set<string>;
  offeredToCard: Set<string>;
  visibleRows: ReconciledRow[];
  shownRows: readonly ReconciledRow[];
  duplicateCount: number;
  totals: Totals;
  balance: LedgerBalance | null;
  dayHeads: ReturnType<typeof dayGroups> | null;
  unattributedSlips: number;
  importedAccounts: LedgerAccount[];
};

/**
 * A single-entry cache over a stage's inputs, compared with `Object.is`: the same rule a
 * `useMemo` dependency list applies, so a stage recomputes exactly when the memo it replaces would.
 */
function stage<Inputs extends readonly unknown[], Output>(compute: (...inputs: Inputs) => Output) {
  let last: { inputs: Inputs; output: Output } | null = null;
  return (...inputs: Inputs): Output => {
    if (last !== null && last.inputs.every((value, index) => Object.is(value, inputs[index]))) return last.output;
    const output = compute(...inputs);
    last = { inputs, output };
    return output;
  };
}

/**
 * The derivation with each stage cached on its inputs' identity, so recomputation is no coarser
 * than the `useMemo` chain it replaced: typing in the search box must not re-run `reconcileLedger`.
 */
export function createLedgerViewDeriver(): (
  data: LedgerViewData,
  filters: LedgerViewFilters,
  choosing: LedgerChoosing
) => LedgerView {
  const picked = stage((
    matching: string | null,
    matchingCard: string | null,
    slips: readonly CapturedSlip[],
    cards: readonly NotificationCard[]
  ) => {
    const matchingSlip = matching === null ? null : slips.find((slip) => slip.id === matching) ?? null;
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
    // The card half of the same pair.
    const matchingCardRecord = matchingCard === null ? null : cards.find((card) => card.id === matchingCard) ?? null;
    const pickingCard = matchingCard !== null && matchingCardRecord !== null;
    return { matchingSlip, picking, matchingCardRecord, pickingCard };
  });

  // The account scope, before any text filter. Balances are derived from this rather
  // than from `visible`, because a running total of whatever a search matched would
  // not be a balance.
  const scoped = stage((ledgerWindow: LedgerWindow | null, scopedAccount: string | null) => {
    const scope = ledgerWindow === null ? [] : windowRows(ledgerWindow, scopedAccount);
    /** The ids actually loaded, so a candidate pulled in as evidence is not shown as a row. */
    const heldIds = ledgerWindow === null ? new Set<string>() : windowIds(ledgerWindow, scopedAccount);
    /** How much of the confirmed ledger is on screen, and whether more can be fetched. */
    const reach = ledgerWindow === null ? { loaded: 0, total: 0 } : windowReach(ledgerWindow, scopedAccount);
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
    return { scope, heldIds, reach, ledgerIsEmpty, moreToLoad };
  });

  // Reconciliation runs over the **whole** ledger, before any account or text filter. A
  // match is a fact about two records, not about what is on screen — reconciling the
  // filtered subset would let choosing an account or typing in the search box silently
  // unmatch a pair and change the totals (D-063).
  const reconcile = stage((
    ledgerWindow: LedgerWindow | null,
    candidates: readonly AccountTransaction[],
    slips: readonly CapturedSlip[],
    accounts: readonly LedgerAccount[] | null,
    matches: readonly SlipMatchDecision[],
    cash: readonly CashEntry[],
    cards: readonly NotificationCard[],
    cardDecisions: readonly NotificationCardDecision[]
  ) => {
    /**
     * What the matching rule runs over: the window **plus** every candidate, deduplicated.
     *
     * Never the window alone. A slip that is genuinely ambiguous ledger-wide but has only one of
     * its candidates on the page would pair with that one and read `verified`, when the truth is
     * that nobody has ever been asked which row it is. See `reconciliationRows`.
     */
    const reconcileInput = ledgerWindow === null ? [] : reconciliationRows(ledgerWindow, candidates);
    const reconciled = reconcileLedger(reconcileInput, slips, accounts ?? [], matches, cash, cards, cardDecisions);
    // Retired cards, kept out of the rows and the totals but reachable, so that retiring stays as
    // reversible on screen as it is in the database.
    const retiredCards = cards.filter((card) => reconciled.cardMatches.retired.has(card.id));
    const unattributedSlips = reconciled.rows.filter((row) => row.kind === "provisional" && row.account === null).length;
    return { reconciled, retiredCards, unattributedSlips };
  });

  // What the manual chooser offers, derived only while the owner is choosing and only once the
  // chooser's rows have arrived (D-158). Reconciled over the bounded input **plus** the chooser's
  // rows, so a candidate outside the automatic date window is a row the table can show and carries
  // the slip or card that claims it. It feeds only the choosing views: the statuses everywhere
  // else keep using `reconciled`, which runs over the bounded set.
  const chooserStateOf = stage((chooserSet: ChooserSet): ChooserState =>
    chooserSet.state === "error"
      ? { state: "error", message: chooserSet.message }
      : chooserSet.state === "ready" ? { state: "ready" } : { state: "loading" }
  );
  const chooserInputOf = stage((
    ledgerWindow: LedgerWindow | null,
    candidates: readonly AccountTransaction[],
    chooserReady: readonly AccountTransaction[] | null,
    matching: string | null,
    matchingCard: string | null
  ) =>
    ledgerWindow === null || chooserReady === null || (matching === null && matchingCard === null)
      ? null
      : chooserRows(ledgerWindow, candidates, chooserReady)
  );
  const chooserReconciledOf = stage((
    chooserInput: readonly AccountTransaction[] | null,
    slips: readonly CapturedSlip[],
    accounts: readonly LedgerAccount[] | null,
    matches: readonly SlipMatchDecision[],
    cash: readonly CashEntry[],
    cards: readonly NotificationCard[],
    cardDecisions: readonly NotificationCardDecision[]
  ) =>
    chooserInput === null
      ? null
      : reconcileLedger(chooserInput, slips, accounts ?? [], matches, cash, cards, cardDecisions)
  );

  // The choosing views' rows: the slip or card being chosen for, from the automatic reconciliation,
  // and the confirmed rows from the chooser's, so each carries the record that claims it.
  const choosingRowsOf = stage((reconciled: Reconciled, chooserReconciled: Reconciled | null) => [
    ...reconciled.rows.filter((row) => row.kind !== "confirmed"),
    ...(chooserReconciled?.rows.filter((row) => row.kind === "confirmed") ?? [])
  ]);

  // The rows a card may be paired with by hand. The union, not the window: a chooser that offered
  // only loaded rows would hide the very row the owner is looking for and read as "it is not
  // there" — and an override exists precisely to reach past what the automatic rule would propose
  // (D-067).
  const offeredToCardOf = stage((
    matchingCard: string | null,
    cards: readonly NotificationCard[],
    chooserInput: readonly AccountTransaction[] | null,
    cardDecisions: readonly NotificationCardDecision[],
    duplicates: ReadonlySet<string>
  ) => {
    const card = matchingCard === null ? undefined : cards.find((entry) => entry.id === matchingCard);
    return new Set(
      card === undefined || chooserInput === null
        ? []
        : cardMatchCandidates(card, chooserInput, cardDecisions)
            .filter((candidate) => !duplicates.has(candidate.id))
            .map((candidate) => candidate.id)
    );
  });

  // The rows a slip may be paired with by hand. Not date-bounded: an override exists precisely to
  // reach past the automatic window (D-067). A row marked as a duplicate is never offered, here or
  // for a card: pairing a record with the copy the owner set aside would hide the match.
  const offeredOf = stage((
    slip: CapturedSlip | null,
    chooserInput: readonly AccountTransaction[] | null,
    accounts: readonly LedgerAccount[] | null,
    matches: readonly SlipMatchDecision[],
    duplicates: ReadonlySet<string>
  ) =>
    new Set(
      slip === null || chooserInput === null
        ? []
        : matchCandidates(slip, chooserInput, accounts ?? [], matches)
            .filter((candidate) => !duplicates.has(candidate.id))
            .map((candidate) => candidate.id)
    )
  );

  // A slip is shown against an account when the owner holds exactly one at that bank, so the
  // attribution is forced rather than guessed; with two, it belongs to the all-accounts view
  // only, and the status line says why (D-056 still holds — the QR names a bank).
  const inAccountOf = stage((selected: string) => (row: ReconciledRow) => {
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
  });

  const visibleRowsOf = stage((
    reconciled: Reconciled,
    inAccount: (row: ReconciledRow) => boolean,
    query: string,
    order: Order,
    status: StatusFilter,
    matching: string | null,
    picking: boolean,
    offered: ReadonlySet<string>,
    pickingCard: boolean,
    matchingCard: string | null,
    offeredToCard: ReadonlySet<string>,
    heldIds: ReadonlySet<string>,
    choosingRows: readonly ReconciledRow[]
  ): ReconciledRow[] => {
    // Matching is its own view of the ledger, not a filter of the current one: the slip being
    // matched and every row it could be, whatever the Account, Status and search controls were
    // left on. Those are suspended rather than obeyed, because a filter set earlier could
    // otherwise hide the very row the owner is looking for and read as "it is not there".
    // The card's own picking mode, on the same terms as the slip's: the card being matched and
    // every row it could be, with the other controls suspended rather than obeyed.
    if (pickingCard) {
      const candidates = choosingRows.filter((row) => {
        if (row.kind === "card") return row.card.id === matchingCard;
        if (row.kind === "cash" || row.kind === "provisional") return false;
        return offeredToCard.has(row.transaction.id);
      });
      candidates.sort(compareRows);
      if (order === "oldest") candidates.reverse();
      return candidates;
    }

    if (picking) {
      const candidates = choosingRows.filter((row) => {
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
  });

  /**
   * What the table renders: `visibleRows` minus marked duplicates unless they are shown, and
   * **nothing else reads it except the table and its day headings**. Totals, the balance, the
   * balance checks and paging all run on the full set above, so hiding a duplicate is display only.
   * Not applied while a match is being chosen by hand, which is its own view of the ledger.
   */
  const shownRowsOf = stage((
    visibleRows: readonly ReconciledRow[],
    duplicates: ReadonlySet<string>,
    showDuplicates: boolean,
    picking: boolean,
    pickingCard: boolean
  ) => (picking || pickingCard ? visibleRows : withoutDuplicates(visibleRows, duplicates, showDuplicates)));

  /** Duplicates that are on the loaded rows of the current scope, for the toggle's count. */
  const duplicateCountOf = stage((visibleRows: readonly ReconciledRow[], duplicates: ReadonlySet<string>) =>
    visibleRows.filter((row) => row.kind === "confirmed" && duplicates.has(row.transaction.id)).length
  );

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
  const totalsOf = stage((
    visibleRows: readonly ReconciledRow[],
    ledgerWindow: LedgerWindow | null,
    scopedAccount: string | null,
    status: StatusFilter,
    query: string
  ): Totals => {
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
  });

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
  const balanceOf = stage((scope: readonly AccountTransaction[], scopedAccount: string | null): LedgerBalance | null => {
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
  });

  /**
   * Where a day's heading row belongs, keyed by the row that opens it.
   *
   * **Off while a record is being matched by hand, whatever the control says.** That mode lists one
   * captured record and the rows it could be - candidates drawn from across the ledger by amount and
   * bank, not a stretch of it - so a day heading over them would print a total of unrelated rows,
   * which is the same reason the totals strip disappears entirely in that mode.
   */
  const dayHeadsOf = stage((
    groupByDay: boolean,
    picking: boolean,
    pickingCard: boolean,
    shownRows: readonly ReconciledRow[]
  ) => (groupByDay && !picking && !pickingCard ? dayGroups(shownRows) : null));

  // An account with no imported rows has no derivable balance, so the combined figure
  // cannot speak for it. Stated as a plain status of what *is* imported rather than a
  // warning about what is not: on this ledger most accounts are empty most of the
  // time, so a banner would fire on nearly every load and be read as noise.
  const importedAccountsOf = stage((
    ledgerWindow: LedgerWindow | null,
    scopedAccount: string | null,
    accounts: readonly LedgerAccount[] | null
  ) => {
    // The window rather than `scope`: `scope` stops at the merged view's floor, and an account
    // whose loaded rows all sit below it is still imported.
    const withRows = new Set(
      [...(ledgerWindow?.byAccount ?? [])]
        .filter(([id, held]) => held.rows.length > 0 && (scopedAccount === null || id === scopedAccount))
        .map(([id]) => id)
    );
    return (accounts ?? []).filter((account) => withRows.has(account.id));
  });

  // Handed to every row component so the all-accounts column and the width of a full-width
  // detail or correction row cannot disagree. `columns` was written out as `showCombined ? 7 : 6`
  // at five separate places before the row kinds became components.
  const layoutOf = stage((showCombined: boolean): LedgerLayout => ({ showCombined, columns: showCombined ? 7 : 6 }));

  return (data, filters, choosing) => {
    const { ledgerWindow, candidates, accounts, slips, matches, cash, cards, cardDecisions, duplicates, chooserSet } = data;
    const { selected, query, status, order, groupByDay, showDuplicates } = filters;
    const { matching, matchingCard } = choosing;

    const { matchingSlip, picking, matchingCardRecord, pickingCard } = picked(matching, matchingCard, slips, cards);

    /** Null for the all-accounts view, which is what every window helper reads as "every account". */
    const scopedAccount = selected === ALL_ACCOUNTS ? null : selected;
    const { scope, heldIds, reach, ledgerIsEmpty, moreToLoad } = scoped(ledgerWindow, scopedAccount);
    // A text query, or a confirmed-row status, narrows only what is loaded (D-204): say so wherever
    // the answer is shown, or an empty result reads as "none exist".
    const partialFilter = moreToLoad
      && (query.trim() !== "" || (status !== ALL_STATUSES && !statusIsComplete(status)));

    // The account column, not the reference one, whenever a slip is being matched: candidates are
    // filtered by **bank**, so with two accounts at one bank the offered rows can belong to
    // different accounts — and in the per-account layout nothing on screen would say which. That
    // is the very ambiguity `slipAccount` refuses to guess at (D-056), so the chooser must show it.
    const showCombined = picking || pickingCard || selected === ALL_ACCOUNTS;
    const layout = layoutOf(showCombined);

    const { reconciled, retiredCards, unattributedSlips } =
      reconcile(ledgerWindow, candidates, slips, accounts, matches, cash, cards, cardDecisions);

    const chooserReady = chooserSet.state === "ready" ? chooserSet.rows : null;
    const chooserState = chooserStateOf(chooserSet);
    const chooserInput = chooserInputOf(ledgerWindow, candidates, chooserReady, matching, matchingCard);
    const chooserReconciled = chooserReconciledOf(chooserInput, slips, accounts, matches, cash, cards, cardDecisions);
    const choosingRows = choosingRowsOf(reconciled, chooserReconciled);
    const offeredToCard = offeredToCardOf(matchingCard, cards, chooserInput, cardDecisions, duplicates);
    const offered = offeredOf(matchingSlip, chooserInput, accounts, matches, duplicates);

    const inAccount = inAccountOf(selected);
    const visibleRows = visibleRowsOf(reconciled, inAccount, query, order, status, matching, picking, offered,
      pickingCard, matchingCard, offeredToCard, heldIds, choosingRows);
    const shownRows = shownRowsOf(visibleRows, duplicates, showDuplicates, picking, pickingCard);
    const duplicateCount = duplicateCountOf(visibleRows, duplicates);
    const totals = totalsOf(visibleRows, ledgerWindow, scopedAccount, status, query);
    const balance = balanceOf(scope, scopedAccount);
    const dayHeads = dayHeadsOf(groupByDay, picking, pickingCard, shownRows);
    const importedAccounts = importedAccountsOf(ledgerWindow, scopedAccount, accounts);

    return {
      picking, pickingCard, matchingSlip, matchingCardRecord, scopedAccount, reach, ledgerIsEmpty, moreToLoad,
      partialFilter, showCombined, layout, reconciled, retiredCards, chooserState, offered, offeredToCard,
      visibleRows, shownRows, duplicateCount, totals, balance, dayHeads, unattributedSlips, importedAccounts
    };
  };
}

/** A fresh deriver per call, for tests and one-off callers: the same composition, nothing carried over. */
export function deriveLedgerView(
  data: LedgerViewData,
  filters: LedgerViewFilters,
  choosing: LedgerChoosing
): LedgerView {
  return createLedgerViewDeriver()(data, filters, choosing);
}

/** The reporting marks one row carries beyond the overlay itself: both are read from audit events. */
export type ReportingMarks = { readonly autoExcluded: boolean; readonly duplicate: boolean };

/** A hand decision on a row's reporting: Include, Exclude, or Mark as duplicate. */
export type ReportingChange = "include" | "exclude" | "duplicate";

/**
 * The marks a row carries after a successful reporting write, exactly as the database leaves them
 * (`update_transaction_overlay` migration 026/D-207, `mark_duplicate` migration 062/D-290):
 * every write moves the overlay revision on, so the auto-exclusion label (current only while its
 * event's revision equals the overlay's) always goes; Include clears the duplicate mark (a marked row
 * must still be excluded); Exclude keeps an existing mark; Mark as duplicate sets it.
 */
export function applyReportingChange(marks: ReportingMarks, change: ReportingChange): ReportingMarks {
  switch (change) {
    case "include": return { autoExcluded: false, duplicate: false };
    case "exclude": return { autoExcluded: false, duplicate: marks.duplicate };
    case "duplicate": return { autoExcluded: false, duplicate: true };
  }
}
