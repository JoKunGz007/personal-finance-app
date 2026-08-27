import type { CapturedSlip, SlipMatchDecision } from "@/lib/slips";
import type { CashEntry } from "@/lib/cash";
import type { LedgerAccount } from "@/lib/accounts";
import type { NotificationCard, NotificationCardDecision } from "@/lib/notification-cards";
import { cardAccount, cardStatus, proposeCardMatches, type CardMatches } from "@/lib/notification-card-reconcile";
import { dayNumber } from "@/lib/dates";
import { movementMinor, type AccountTransaction } from "@/lib/transactions";

/**
 * Matching captured slips to confirmed statement rows (PLAN task 22).
 *
 * **There is no identifier to join on.** No supported layout prints the transaction
 * reference the slip QR carries: Krungthai and KBANK print none at all, and SCB's is a short
 * channel code such as `SIPI`. That single fact decides everything here — a match is a
 * *proposal* from bank, amount and date, never a fact the two records assert about each
 * other, so it must be visible, reversible, and refuse when it cannot be sure.
 *
 * The rule, stated once:
 *
 * - the slip's bank equals the bank of the account the transaction belongs to;
 * - the amounts are equal **to the minor unit**, sign included — no tolerance, ever, because
 *   a near-match on money is exactly the thing this ledger must not invent;
 * - the dates are within `MATCH_WINDOW_DAYS`, because the slip's date is the owner's local
 *   date and the row's is the bank's posting date, so the two can straddle midnight;
 * - among the candidates that survive, **only those nearest in date are considered**;
 * - and the pair is **mutually unique**: the slip has exactly one nearest candidate row, and
 *   that row has exactly one slip claiming it.
 *
 * The last two clauses are the ones that carry their weight, and the nearest-date one was
 * added on evidence rather than taste. Measured over the owner's real ledger — 1,465 rows —
 * the share of rows sharing a bank and an exact amount with another row is 6.5% on the same
 * day, 11.5% within one day, **16.3% within three** and 27.8% within seven. Preferring the
 * nearest date takes the three-day figure back down to **6.5%** — the same-day floor — so a
 * wider window costs nothing in ambiguity, and the residue is irreducible: two identical
 * payments on one day, where no date rule can help and a guess would be a coin toss.
 *
 * Mutual uniqueness is what makes the result order-independent. Matching greedily in
 * iteration order would pair two identical transfers with whichever row came first and look
 * confident doing it — and that case is not hypothetical: the real ledger holds a same-bank,
 * same-day pair of equal amount.
 *
 * **Every slip reaching this module is the slip in force**, corrections already applied by
 * `slipsInForce`. Migration 014 is the reason that is a rule rather than a convention: the
 * database's own guard compared a slip's *original* amount against a statement row, and both
 * refused correct pairings and accepted wrong ones. A rule matching on a figure the owner has
 * replaced would be the same defect with nothing to raise it.
 */

/**
 * One day — tolerance for the clocks, not for the bank (D-064).
 *
 * The owner's judgement is that his banks post same-day, and the evidence that exists points
 * the same way: of the six real slips ever checked against the live ledger, four produced a
 * candidate at all, and every one of those sat on the slip's own day. So this is not buying
 * room for a late posting. It is buying room for the fact that the slip's date is the owner's
 * local date while the row's is the bank's posting date — a payment made late in the evening
 * can fall either side of midnight between those two clocks with no lag at all. Zero would
 * have no room for that; one does, and by the measurement above it costs nothing, because
 * nearest-date collapses even a three-day window back to the same-day floor.
 *
 * **It has not been measured across the whole sample, and cannot be until PLAN task 21.** The
 * rule needs bank, exact amount and date. The QR carries only bank and reference
 * (`SlipIdentity` in `lib/slip-qr.ts`), and the amount exists solely on the printed face of
 * the slip — `docs/SLIP_CONTRACT.md` records that no OCR has been run. So checking a slip
 * against the ledger means reading its image by eye, which is why the evidence stops at six
 * rather than covering all 23 samples. When task 21 lands this becomes a script, and the
 * window should be re-derived from that run rather than from this note.
 */
export const MATCH_WINDOW_DAYS = 1;

export type SlipMatchStatus = "verified" | "awaiting-statement" | "needs-review" | "statement-only";

/**
 * What a ledger row can say about itself, once cash and notification cards are in the view.
 *
 * `cash` is not a fifth reconciliation state, and treating it as one would be the mistake. The
 * four above are stages of a slip's relationship with a statement; a cash payment has no
 * statement and never will, so it is not awaiting anything and cannot be verified by anything.
 * It sits in the same list because it is money that moved, which is what the list is for.
 *
 * `balance-conflict` **is** a reconciliation state, and only a card can be in it. It means rows
 * fitted the card on account, amount and date and every one of them printed a different running
 * balance — so the card refused to pair rather than pairing on the facts that agreed
 * (`lib/notification-card-reconcile.ts`). A slip can never reach it, because a slip prints no
 * balance to contradict anything with.
 *
 * The other three card states reuse the slip names deliberately: `verified`,
 * `awaiting-statement` and `needs-review` describe a record's relationship to the statement,
 * not which kind of record it is, so the Status control asks one question rather than two.
 */
export type RowStatus = SlipMatchStatus | "cash" | "balance-conflict";

/**
 * The account a slip is shown against, derived and never stored.
 *
 * D-056 refused to put an account on a slip and that still holds: the QR names a bank, and
 * only the statement says which of that bank's accounts the money moved through. But when the
 * owner holds exactly **one** account at that bank there is nothing to guess — the attribution
 * is forced by the data, not chosen. With two, this returns null and the view says so.
 *
 * Derived at read time on purpose. A stored account id would be a guess written down, and a
 * later statement could contradict it with no way to notice.
 */
export function slipAccount(slip: CapturedSlip, accounts: readonly LedgerAccount[]): LedgerAccount | null {
  const atBank = accounts.filter((account) => account.bank_code === slip.bank_code);
  return atBank.length === 1 ? atBank[0]! : null;
}

/**
 * A decision the owner stored about one slip (migration 012, PLAN task 22 second half).
 *
 * `matched` names the statement row; `unmatched` says this slip is none of them. No row at
 * all means no decision, and the automatic rule applies — which is the state every slip is
 * in until the owner disagrees with something.
 *
 * Defined once, in `lib/slips.ts`, where its zod schema parses it off the wire. Re-exported
 * here because this module is where it is reasoned about, and two hand-kept copies of the same
 * shape would drift the moment one of them gained a field.
 */
export type { SlipMatchDecision };

export type SlipMatches = {
  /** slip id → the transaction it was matched to. */
  bySlip: Map<string, string>;
  /** transaction id → the slip matched to it. */
  byTransaction: Map<string, CapturedSlip>;
  /** Slips with candidates that were not unique on both sides. Shown, never guessed at. */
  needsReview: Set<string>;
  /** Slips whose pairing is the owner's stored decision rather than the rule's proposal. */
  decided: Set<string>;
};

/**
 * Decisions are facts and the rule is a proposal, so decisions are applied **first** and the
 * rule only ever sees what is left.
 *
 * Doing it the other way round — rule first, decisions layered over the result — would let an
 * automatic pairing consume the very statement row the owner had already assigned to another
 * slip, and the owner's decision would then lose silently to a guess. Removing the decided
 * slips and claimed rows from the pool before the rule runs makes that unrepresentable rather
 * than a matter of ordering luck.
 */
export function proposeSlipMatches(
  transactions: readonly AccountTransaction[],
  slips: readonly CapturedSlip[],
  accounts: readonly LedgerAccount[],
  decisions: readonly SlipMatchDecision[] = []
): SlipMatches {
  const bankByAccount = new Map(accounts.map((account) => [account.id, account.bank_code]));
  const transactionIds = new Set(transactions.map((transaction) => transaction.id));
  const slipsById = new Map(slips.map((slip) => [slip.id, slip]));

  const decidedSlips = new Set<string>();
  const claimedTransactions = new Set<string>();
  const decidedPairs: Array<{ slip: CapturedSlip; transactionId: string }> = [];
  for (const decision of decisions) {
    const slip = slipsById.get(decision.slip_id);
    if (!slip) continue;
    decidedSlips.add(slip.id);
    if (decision.decision !== "matched" || decision.transaction_id === null) continue;
    // A decision naming a row this ledger no longer holds is ignored rather than obeyed: the
    // slip falls back to being its own provisional row, which is visible, instead of pairing
    // with nothing and disappearing from the totals.
    if (!transactionIds.has(decision.transaction_id)) continue;
    claimedTransactions.add(decision.transaction_id);
    decidedPairs.push({ slip, transactionId: decision.transaction_id });
  }

  // Candidates in both directions, computed before anything is committed to, so no pairing
  // depends on the order rows arrived in.
  const candidatesBySlip = new Map<string, string[]>();
  const claimantsByTransaction = new Map<string, Array<{ slipId: string; distance: number }>>();

  for (const slip of slips) {
    if (decidedSlips.has(slip.id)) continue; // the owner has spoken; the rule does not re-open it
    const slipDay = dayNumber(slip.occurred_on);
    const amount = BigInt(slip.amount_minor);
    const withDistance: Array<{ id: string; distance: number }> = [];
    for (const transaction of transactions) {
      if (claimedTransactions.has(transaction.id)) continue; // already assigned by the owner
      if (bankByAccount.get(transaction.account_id) !== slip.bank_code) continue;
      if (BigInt(movementMinor(transaction)) !== amount) continue;
      const distance = Math.abs(dayNumber(transaction.source_date) - slipDay);
      if (distance > MATCH_WINDOW_DAYS) continue;
      withDistance.push({ id: transaction.id, distance });
    }
    // Nearest in date only. A row on the slip's own day is a better explanation of it than
    // one a day away, and keeping both would manufacture an ambiguity the data does not
    // have — measured at nearly ten points of this ledger's rows across a three-day window,
    // and the clause is what lets the window be widened again without paying for it.
    const nearest = withDistance.length === 0
      ? 0
      : withDistance.reduce((best, candidate) => Math.min(best, candidate.distance), Number.POSITIVE_INFINITY);
    const candidates = withDistance.filter((candidate) => candidate.distance === nearest).map((candidate) => candidate.id);

    // Claims carry their distance, so competition between slips is resolved the same way
    // competition between rows is: the nearer record is the better explanation. Without this,
    // a slip a day from a row would block the slip sitting exactly on it.
    for (const id of candidates) {
      const claimants = claimantsByTransaction.get(id);
      if (claimants) claimants.push({ slipId: slip.id, distance: nearest });
      else claimantsByTransaction.set(id, [{ slipId: slip.id, distance: nearest }]);
    }
    candidatesBySlip.set(slip.id, candidates);
  }

  const bySlip = new Map<string, string>();
  const byTransaction = new Map<string, CapturedSlip>();
  const needsReview = new Set<string>();

  // Seeded before the rule's own results, so a decision can never be displaced by one.
  for (const pair of decidedPairs) {
    bySlip.set(pair.slip.id, pair.transactionId);
    byTransaction.set(pair.transactionId, pair.slip);
  }

  for (const slip of slips) {
    if (decidedSlips.has(slip.id)) continue;
    const candidates = candidatesBySlip.get(slip.id) ?? [];
    if (candidates.length === 0) continue; // awaiting a statement, which is not a problem
    if (candidates.length > 1) {
      needsReview.add(slip.id);
      continue;
    }
    const transactionId = candidates[0]!;
    const claimants = claimantsByTransaction.get(transactionId) ?? [];
    const closest = claimants.reduce((best, claim) => Math.min(best, claim.distance), Number.POSITIVE_INFINITY);
    const winners = claimants.filter((claim) => claim.distance === closest);
    if (winners.length > 1) {
      // Two slips equally close to one row: neither is safe to pair, and picking one would be
      // a coin toss that reads as a decision.
      needsReview.add(slip.id);
      continue;
    }
    // A slip that lost to a nearer one has no candidate left, which is "awaiting a statement"
    // rather than a problem — the row it wanted is better explained by the other slip.
    if (winners[0]!.slipId !== slip.id) continue;
    bySlip.set(slip.id, transactionId);
    byTransaction.set(transactionId, slip);
  }

  return { bySlip, byTransaction, needsReview, decided: decidedSlips };
}

/**
 * The statement rows the owner may pair a slip with by hand (D-067).
 *
 * **Deliberately not the automatic rule's candidate set.** Two of that rule's three facts are
 * re-checked here because `set_slip_match` re-checks them server-side and would refuse anything
 * else: the same bank, and an amount equal to the minor unit. The third — the date window — is
 * *not* applied, and its absence is the entire point of an override. A rule that only ever
 * offered what the rule had already found could resolve nothing it refused.
 *
 * Rows already claimed by another slip's stored decision are left out, because the partial
 * unique index makes that write fail (`statement row already claimed by another slip`) and
 * offering a choice the database will refuse is worse than not offering it. A row the automatic
 * rule paired with some other slip **is** offered: taking it is a legitimate overrule, the
 * database permits it, and the slip that loses it falls back to a visible provisional row
 * rather than disappearing.
 *
 * Returns **every** eligible row rather than a capped best few. These are shown as rows of the
 * ledger's own table, where a row describes itself — the same amount, the same day and the same
 * wording is what candidates look like on a real statement, and only the printed time and the
 * running balance tell them apart (D-069). A capped list existed while they were options in a
 * dropdown, which could not carry either.
 *
 * Nearest in date first, because that is the likeliest answer, and the ordering is total —
 * date, then id — so a caller that does not re-sort gets a stable list.
 */
export function matchCandidates(
  slip: CapturedSlip,
  transactions: readonly AccountTransaction[],
  accounts: readonly LedgerAccount[],
  decisions: readonly SlipMatchDecision[] = []
): AccountTransaction[] {
  const bankByAccount = new Map(accounts.map((account) => [account.id, account.bank_code]));
  const claimed = new Set(
    decisions
      .filter((decision) => decision.slip_id !== slip.id && decision.transaction_id !== null)
      .map((decision) => decision.transaction_id!)
  );
  const slipDay = dayNumber(slip.occurred_on);
  const amount = BigInt(slip.amount_minor);

  const eligible = transactions.filter((transaction) => {
    if (claimed.has(transaction.id)) return false;
    if (bankByAccount.get(transaction.account_id) !== slip.bank_code) return false;
    return BigInt(movementMinor(transaction)) === amount;
  });

  eligible.sort((a, b) => {
    const byDistance = Math.abs(dayNumber(a.source_date) - slipDay) - Math.abs(dayNumber(b.source_date) - slipDay);
    if (byDistance !== 0) return byDistance;
    if (a.source_date !== b.source_date) return a.source_date < b.source_date ? 1 : -1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  return eligible;
}

/**
 * A row of the ledger after reconciliation: one row per payment.
 *
 * A matched pair collapses onto its **statement row**, which keeps the printed balance and
 * the immutable source facts, and takes the slip's counterparty, category and note as
 * detail. The slip does not also appear — that is the whole point, and it is what makes the
 * confirmed totals safe to include slips in.
 *
 * **A statement row can carry a slip and a card at once**, and that is not a conflict to resolve.
 * One payment can produce both an e-slip and a bank's LINE push, in which case both records are
 * evidence for the same movement and both collapse onto it. The row is still one row and is still
 * counted once.
 */
export type ReconciledRow =
  | {
      kind: "confirmed";
      id: string;
      date: string;
      time: string | null;
      status: Extract<SlipMatchStatus, "verified" | "statement-only">;
      transaction: AccountTransaction;
      slip: CapturedSlip | null;
      /**
       * The notification card matched to this row, if one was. Independent of `slip`: either,
       * both or neither may be present, and `status` is `verified` when at least one is.
       */
      card: NotificationCard | null;
      /** True when the **slip** pairing is the owner's stored decision rather than the rule's. */
      ownerDecided: boolean;
      /**
       * True when the **card** pairing is the owner's stored decision. Separate from `ownerDecided`
       * because a row can carry both records and each was decided, or proposed, on its own.
       */
      cardOwnerDecided: boolean;
      /**
       * True when the owner matched this card to this row **knowing their balances disagree**
       * (migration 017). Stored consent rather than a live comparison, so it stays true after a
       * later correction changes whether the two figures still differ.
       */
      cardBalanceMismatchAccepted: boolean;
    }
  | {
      kind: "provisional";
      id: string;
      date: string;
      time: string | null;
      status: Extract<SlipMatchStatus, "awaiting-statement" | "needs-review">;
      slip: CapturedSlip;
      account: LedgerAccount | null;
      ownerDecided: boolean;
    }
  | {
      /**
       * A cash payment (migration 013). Its own row always, and deliberately not a third
       * reconciliation state: there is no statement row it could collapse onto, so it is
       * neither provisional nor confirmed by a bank — it is the owner's own record of money
       * that moved, and the only evidence the figure has.
       */
      kind: "cash";
      id: string;
      date: string;
      time: string | null;
      status: Extract<RowStatus, "cash">;
      entry: CashEntry;
    }
  | {
      /**
       * A captured notification card that has not collapsed onto a statement row (migration 016).
       *
       * Its own row for the reason an unmatched slip gets one: it is money that moved and the
       * ledger must show it. What it is **not** is a fourth flavour of provisional — the three
       * states it can be in are not all "waiting". `awaiting-statement` is waiting;
       * `needs-review` is an ambiguity; `balance-conflict` is a card whose printed balance
       * contradicts every row that otherwise fits, which is a disagreement to look at rather
       * than a delay to sit out.
       *
       * Unlike a slip, its account is a stored fact rather than a derivation, so this row always
       * knows which account it belongs to.
       */
      kind: "card";
      id: string;
      date: string;
      time: string | null;
      status: Extract<RowStatus, "awaiting-statement" | "needs-review" | "balance-conflict">;
      card: NotificationCard;
      account: LedgerAccount | null;
      /** True when this card's state is the owner's stored decision rather than the rule's. */
      ownerDecided: boolean;
    };

/**
 * Slips and cash entries arrive **already corrected** — `slipsInForce` and `cashInForce` do
 * that at the edge of the read path, so nothing below has to remember to ask which amount is
 * the real one. Migration 014 is why that resolution happens once rather than per-caller.
 */
export function reconcileLedger(
  transactions: readonly AccountTransaction[],
  slips: readonly CapturedSlip[],
  accounts: readonly LedgerAccount[],
  decisions: readonly SlipMatchDecision[] = [],
  cash: readonly CashEntry[] = [],
  cards: readonly NotificationCard[] = [],
  cardDecisions: readonly NotificationCardDecision[] = []
): { rows: ReconciledRow[]; matches: SlipMatches; cardMatches: CardMatches } {
  const matches = proposeSlipMatches(transactions, slips, accounts, decisions);
  // Run over the same transactions without removing what the slip rule claimed. The two rules
  // are independent because their records are not rivals: one payment can produce both an e-slip
  // and a LINE push, and a row is allowed to carry both as evidence of the same movement.
  const cardMatches = proposeCardMatches(transactions, cards, cardDecisions);

  const rows: ReconciledRow[] = transactions.map((transaction) => {
    const slip = matches.byTransaction.get(transaction.id) ?? null;
    const card = cardMatches.byTransaction.get(transaction.id) ?? null;
    return {
      kind: "confirmed" as const,
      id: transaction.id,
      date: transaction.source_date,
      time: transaction.source_time,
      // Either record verifies the row. A row carrying only a card is as confirmed as one
      // carrying only a slip — more so, arguably, since the card's balance was checked against
      // the row's and a slip has no balance to check.
      status: slip !== null || card !== null ? ("verified" as const) : ("statement-only" as const),
      transaction,
      slip,
      card,
      ownerDecided: slip !== null && matches.decided.has(slip.id),
      cardOwnerDecided: card !== null && cardMatches.decided.has(card.id),
      cardBalanceMismatchAccepted:
        card !== null && (cardDecisions.find((decision) => decision.card_id === card.id)?.accepted_balance_mismatch ?? false)
    };
  });

  for (const slip of slips) {
    if (matches.bySlip.has(slip.id)) continue; // already shown as its statement row
    rows.push({
      kind: "provisional" as const,
      id: slip.id,
      date: slip.occurred_on,
      time: slip.occurred_at_time,
      status: matches.needsReview.has(slip.id) ? ("needs-review" as const) : ("awaiting-statement" as const),
      slip,
      account: slipAccount(slip, accounts),
      ownerDecided: matches.decided.has(slip.id)
    });
  }

  // Appended without passing through the rule at all. A cash entry has no bank, so the first
  // of the rule's three facts has nothing to compare, and there is no statement row it could
  // be paired with — matching it would be inventing a relationship rather than proposing one.
  for (const entry of cash) {
    rows.push({
      kind: "cash" as const,
      id: entry.id,
      date: entry.occurred_on,
      time: entry.occurred_at_time,
      status: "cash" as const,
      entry
    });
  }

  for (const card of cards) {
    // Asked once, of the module that owns the rule. Deciding it a second time here would let the
    // chip on the row and the Status control disagree about the same card after one of the two
    // was changed — and `verified` is the same answer as "already shown as its statement row",
    // so this is one question rather than two.
    const status = cardStatus(card, cardMatches);
    if (status === "verified") continue;
    // A retired card leaves the ledger entirely — no row, and therefore nothing in the totals.
    // That is the whole point of `not-a-payment`: the row cannot be deleted and the binding
    // cannot be re-made, so leaving the ledger is the only remedy a wrong card can have (D-103).
    if (status === "retired") continue;
    rows.push({
      kind: "card" as const,
      id: card.id,
      date: card.occurred_on,
      time: card.occurred_at_time,
      status,
      card,
      account: cardAccount(card, accounts),
      ownerDecided: cardMatches.decided.has(card.id)
    });
  }

  return { rows, matches, cardMatches };
}

/** `compareTransactions`' rule over reconciled rows, so both kinds sort into one sequence. */
export function compareRows(a: ReconciledRow, b: ReconciledRow): number {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1;
  if (a.time !== b.time) {
    if (a.time === null) return 1;
    if (b.time === null) return -1;
    return a.time < b.time ? 1 : -1;
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** The signed movement of a row, whichever kind it is. */
export function rowMovementMinor(row: ReconciledRow): string {
  if (row.kind === "confirmed") return movementMinor(row.transaction);
  if (row.kind === "cash") return row.entry.amount_minor;
  if (row.kind === "card") return row.card.amount_minor;
  return row.slip.amount_minor;
}

export type LedgerTotals = {
  rows: number;
  deposits: string;
  withdrawals: string;
  net: string;
  /** How many of those rows are provisional, so the figure can say what it rests on. */
  provisional: number;
  /**
   * How many are cash — counted separately from `provisional` rather than folded into it.
   *
   * "Provisional" means a bank has not confirmed it *yet*; a cash payment has no bank and
   * never will, so counting it there would say the total is waiting on something that is
   * never coming. Both numbers travel with the figure for the same reason: a total over
   * records of different standing should disclose what it is made of.
   */
  cash: number;
  /**
   * How many are unmatched notification cards, counted apart from `provisional` for the same
   * disclosure reason and because a card's standing is genuinely its own.
   *
   * A slip is a third party's receipt and a cash entry is the owner's own typing; a card is the
   * **bank's** record, pushed by the bank at the moment of the transaction. So an unmatched card
   * is not weak evidence that a payment happened — it is good evidence that has not met its
   * statement row yet. Folding it into `provisional` would say less than the number is worth.
   */
  cards: number;
};

/**
 * One total over both kinds — which is only correct *because* a matched slip is not a row.
 *
 * Before reconciliation existed this had to keep slips apart, since a slip and its statement
 * row would have been counted twice (D-062). Collapsing the pair removes that hazard at the
 * source, so the total can finally mean "money that moved" rather than "money the bank has
 * confirmed" (D-063). The provisional count travels with it so the number can disclose how
 * much of itself is still unconfirmed.
 *
 * **A confirmed row the owner has taken out of reporting contributes no money** (PLAN task 48),
 * which is what makes this agree with the two places that already do it in SQL:
 * `list_account_transactions_page`'s whole-account totals and `private.reportable_movements`, both
 * of which apply `coalesce(o.include_in_reporting, true)` since migration 023.
 *
 * **It has to be here rather than at the call site**, and one keystroke is why. The strip prefers
 * the server's whole-account figure, but falls back to this function the moment a text query or a
 * confirmed-status filter narrows the population beyond what SQL was asked about. Excluding a row,
 * watching Money in fall, then typing one character in the search box would have counted it again
 * — while the row on screen still wore its "Excluded" chip. That is the inverse of the disclosure
 * the chip exists to make, and it was reachable without leaving the page.
 *
 * **Only confirmed rows are filtered.** The flag lives on `transaction_overlays`, keyed by
 * transaction; a slip, a card and a cash entry are not transactions and have no such column, so
 * there is nothing to honour on them and pretending otherwise would invent a rule.
 *
 * The counts are deliberately untouched, matching migration 023's own line: an excluded row is
 * still a row the ledger holds, and it is still on screen.
 */
export function summarizeRows(rows: readonly ReconciledRow[]): LedgerTotals {
  let deposits = 0n;
  let withdrawals = 0n;
  let provisional = 0;
  let cash = 0;
  let cards = 0;
  for (const row of rows) {
    if (row.kind === "confirmed") {
      if (!(row.transaction.transaction_overlays[0]?.include_in_reporting ?? true)) continue;
      for (const component of row.transaction.source_components) {
        const amount = BigInt(component.amount_minor);
        if (component.kind === "deposit") deposits += amount;
        else withdrawals += amount;
      }
      continue;
    }
    // All three remaining kinds carry one signed amount and its direction, so they add the same
    // way. What differs is only what the count above them means.
    const record = row.kind === "cash" ? row.entry : row.kind === "card" ? row.card : row.slip;
    if (row.kind === "cash") cash += 1;
    else if (row.kind === "card") cards += 1;
    else provisional += 1;
    const amount = BigInt(record.amount_minor);
    if (record.kind === "deposit") deposits += amount;
    else withdrawals += amount;
  }
  return {
    rows: rows.length,
    deposits: deposits.toString(),
    withdrawals: withdrawals.toString(),
    net: (deposits + withdrawals).toString(),
    provisional,
    cash,
    cards
  };
}
