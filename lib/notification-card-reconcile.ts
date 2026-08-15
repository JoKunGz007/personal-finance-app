import { dayNumber } from "@/lib/dates";
import type { LedgerAccount } from "@/lib/accounts";
import type { NotificationCard, NotificationCardDecision } from "@/lib/notification-cards";
import { movementMinor, type AccountTransaction } from "@/lib/transactions";

/**
 * Matching captured notification cards to confirmed statement rows (PLAN task 27, second half).
 *
 * **This is not the slip rule with a different record in it**, and the difference is the whole
 * value of the card. A slip names a bank and an amount, and `lib/slip-reconcile.ts` has to build
 * a pairing out of those two facts plus a date window, refusing outright whenever two rows fit —
 * measured at 16.3% of this ledger's rows sharing a bank and an exact amount with another within
 * three days (D-063). A card carries two facts a slip does not:
 *
 *   * **an account**, not a bank. `POST /api/v1/notification-cards` already checked that the
 *     digits the card printed resolve to the chosen account under that layout's mask (D-101), so
 *     `account_id` is a checked fact rather than a derivation. `slipAccount` has to guess at this
 *     and returns null whenever the owner holds two accounts at one bank; a card never does.
 *   * **the printed balance**, which is the account's running balance after the transaction — the
 *     same figure the statement prints in its own balance column. Measured 2026-08-12 against the
 *     real ledger: equal to the satang on 6 of 6 cards across all three layouts.
 *
 * The balance does two separate jobs here and they are worth keeping apart, because one of them
 * makes matches and the other refuses them:
 *
 *   * **A tie-breaker the amount cannot be.** Two rows of the same amount on the same day are the
 *     coin toss the slip rule refuses outright; two rows never share a running balance, so the
 *     card resolves what a slip cannot.
 *   * **A fail-closed cross-check.** A card whose amount and date fit a row but whose balance
 *     contradicts it is a card that was misread, or a row that is not this payment. It **refuses
 *     to pair** and says so, rather than pairing on the two facts that agreed.
 *
 * **What the balance is deliberately not: identity.** The measurement is n=6, both cards in each
 * screenshot share an account and a day, and none was captured while a hold was outstanding — two
 * layouts print an *available* balance and the third a *remaining* one, and those diverge at many
 * banks exactly when a hold exists (`docs/NOTIFICATION_CARD_CONTRACT.md`). So a disagreement is
 * reported as a state the owner looks at, never as proof the card is wrong. The cost of that limit
 * being wrong is a correct pairing refused, which is visible; the cost of treating it as identity
 * would be a wrong pairing accepted, which is not.
 *
 * **A card does not compete with a slip for a statement row, and that is deliberate.** One payment
 * can produce both an e-slip and a LINE push, so the two records are not rivals for a scarce row —
 * they are two pieces of evidence for the same movement, and a row is allowed to carry both. This
 * rule therefore runs over the whole transaction list without removing anything the slip rule
 * claimed, and the slip rule is left exactly as it was. Coupling them would mean a card arriving
 * could silently unmatch a slip that was already correct.
 *
 * **Nothing here is stored and nothing here can be overruled yet.** A card has no match-decision
 * table — `PLAN.md` task 27 keeps that with the correction overlay so both land in one migration
 * rather than one version bump each. So every pairing below is recomputed on every read, and the
 * view says so rather than presenting a proposal as a decision.
 */

/**
 * One day, and it is doing less work here than the same constant does for a slip.
 *
 * A slip's date is the owner's local date while the row's is the bank's posting date, so a payment
 * made late in the evening can fall either side of midnight between two different clocks (D-064).
 * A card's timestamp is the bank's own, printed by the bank, and it equalled the statement row's
 * on all six measured cards — so zero would very nearly always be right. One day is kept anyway
 * because it costs nothing: the balance is what discriminates, so widening the date window does
 * not widen the set of pairings that survive it.
 */
export const CARD_MATCH_WINDOW_DAYS = 1;

/**
 * The printed time is **not** a match criterion, although it equalled the row's on all six cards.
 *
 * `source_time` is nullable on a statement row — Krungthai prints one, and a layout that does not
 * would make every card at that bank unmatchable on a rule that required agreement. The balance is
 * the stronger discriminator and is never null, so it carries the whole job and the time stays
 * what it is: a fact stored on the card and shown beside the pairing so the owner can check it.
 */
export type CardMatchStatus = "verified" | "awaiting-statement" | "needs-review" | "balance-conflict" | "retired";

/**
 * Why a card needs review, because the two causes ask the owner for different things.
 *
 * `several-rows` — two statement rows on this account carry the same amount **and** the same
 * running balance. That should not happen in a sound balance chain, so the thing to check is the
 * import rather than the card.
 *
 * `several-cards` — two captured cards both resolve to one statement row. They differ in their
 * printed time, since everything else is in the fingerprint the database computes, so the likely
 * cause is a time typed wrongly on one of them.
 */
export type CardReviewReason = "several-rows" | "several-cards";

export type CardMatches = {
  /** card id → the transaction it was matched to. */
  byCard: Map<string, string>;
  /** transaction id → the card matched to it. */
  byTransaction: Map<string, NotificationCard>;
  /** card id → why its surviving candidates were not unique on both sides. Shown, never guessed at. */
  needsReview: Map<string, CardReviewReason>;
  /**
   * card id → how many statement rows fitted it on account, amount and date while **every one of
   * them printed a different balance**.
   *
   * Kept apart from `needsReview` because the two say different things and ask for different
   * things: "several rows could be this" is an ambiguity to resolve, while "the balance
   * contradicts every row that otherwise fits" is a figure to check. The count travels with it so
   * the view can say what was actually found rather than that something went wrong.
   */
  balanceConflict: Map<string, number>;
  /** Cards whose relationship to the statement is the owner's stored decision, not the rule's. */
  decided: Set<string>;
  /**
   * Cards the owner has retired (`not-a-payment`, migration 017).
   *
   * They leave the ledger rows and the totals entirely, which is what makes this the remedy for a
   * card captured against the wrong account or captured twice — the binding cannot be re-made
   * after capture, and the row cannot be deleted (D-103). Reversible: the decision is an overlay
   * carrying a revision, so deciding something else brings the card back.
   */
  retired: Set<string>;
};

/**
 * Candidates in both directions before anything is committed to, so no pairing depends on the
 * order rows arrived in — the same argument `proposeSlipMatches` makes, and for the same reason:
 * the real ledger holds same-amount, same-day pairs, and a greedy pass over them would look
 * confident about a coin toss.
 */
export function proposeCardMatches(
  transactions: readonly AccountTransaction[],
  cards: readonly NotificationCard[],
  decisions: readonly NotificationCardDecision[] = []
): CardMatches {
  const byCard = new Map<string, string>();
  const byTransaction = new Map<string, NotificationCard>();
  const needsReview = new Map<string, CardReviewReason>();
  const balanceConflict = new Map<string, number>();
  const decided = new Set<string>();
  const retired = new Set<string>();

  const transactionIds = new Set(transactions.map((transaction) => transaction.id));
  const cardsById = new Map(cards.map((card) => [card.id, card]));
  const claimedTransactions = new Set<string>();
  const decidedPairs: Array<{ card: NotificationCard; transactionId: string }> = [];

  // Decisions are facts and the rule is a proposal, so decisions are applied **first** and the
  // rule only ever sees what is left. Doing it the other way round — rule first, decisions
  // layered over the result — would let an automatic pairing consume the very row the owner had
  // already assigned to another card, and his decision would lose silently to a guess.
  // `proposeSlipMatches` records the same ordering for the same reason.
  for (const decision of decisions) {
    const card = cardsById.get(decision.card_id);
    if (!card) continue;
    decided.add(card.id);
    if (decision.decision === "not-a-payment") {
      retired.add(card.id);
      continue;
    }
    if (decision.decision !== "matched" || decision.transaction_id === null) continue;
    // A decision naming a row this ledger no longer holds is ignored rather than obeyed: the card
    // falls back to its own row, which is visible, instead of pairing with nothing and vanishing
    // from the totals.
    if (!transactionIds.has(decision.transaction_id)) continue;
    claimedTransactions.add(decision.transaction_id);
    decidedPairs.push({ card, transactionId: decision.transaction_id });
  }

  // Each card's surviving candidates, and every card claiming each transaction. Both are built
  // in full before a single pairing is made.
  const survivorsByCard = new Map<string, string[]>();
  const claimantsByTransaction = new Map<string, string[]>();

  for (const card of cards) {
    if (decided.has(card.id)) continue; // the owner has spoken; the rule does not re-open it
    const cardDay = dayNumber(card.occurred_on);
    const amount = BigInt(card.amount_minor);
    const balance = BigInt(card.balance_minor);

    const fitting: AccountTransaction[] = [];
    for (const transaction of transactions) {
      if (claimedTransactions.has(transaction.id)) continue; // already assigned by the owner
      // The account, not the bank. This is the check a slip cannot make.
      if (transaction.account_id !== card.account_id) continue;
      // Equal to the minor unit, sign included. No tolerance, ever — a near-match on money is
      // exactly the thing this ledger must not invent.
      if (BigInt(movementMinor(transaction)) !== amount) continue;
      if (Math.abs(dayNumber(transaction.source_date) - cardDay) > CARD_MATCH_WINDOW_DAYS) continue;
      fitting.push(transaction);
    }

    // No row of that amount on that account in that window: the statement has not been imported
    // yet, which is a card awaiting a statement rather than a problem with it.
    if (fitting.length === 0) continue;

    const survivors = fitting.filter((transaction) => BigInt(transaction.post_balance_minor) === balance);

    // Rows fitted on account, amount and date, and every one of them disagrees on the balance.
    // Refused rather than paired on the facts that did agree — this is the fail-closed half.
    if (survivors.length === 0) {
      balanceConflict.set(card.id, fitting.length);
      continue;
    }

    survivorsByCard.set(card.id, survivors.map((transaction) => transaction.id));
    for (const transaction of survivors) {
      const claimants = claimantsByTransaction.get(transaction.id);
      if (claimants) claimants.push(card.id);
      else claimantsByTransaction.set(transaction.id, [card.id]);
    }
  }

  // Seeded before the rule's own results, so a decision can never be displaced by one.
  for (const pair of decidedPairs) {
    byCard.set(pair.card.id, pair.transactionId);
    byTransaction.set(pair.transactionId, pair.card);
  }

  for (const card of cards) {
    const survivors = survivorsByCard.get(card.id);
    if (survivors === undefined) continue; // decided, awaiting a statement, or a balance conflict

    // More than one row of the same amount **and** the same running balance on one account. This
    // should not occur in a sound balance chain, and it is left as an ambiguity to look at rather
    // than resolved by falling back to the date: a rule that refuses on the balance and then
    // guesses on something weaker when the balance fails to decide is not fail-closed.
    if (survivors.length > 1) {
      needsReview.set(card.id, "several-rows");
      continue;
    }

    const transactionId = survivors[0]!;
    const claimants = claimantsByTransaction.get(transactionId) ?? [];
    // Two cards claiming one row. They cannot be the same card — the fingerprint the database
    // computes covers bank, account digits, amount, timestamp and balance, so two rows here differ
    // in their printed time. Neither is safe to pair, and picking one would be a coin toss that
    // reads as a decision.
    if (claimants.length > 1) {
      needsReview.set(card.id, "several-cards");
      continue;
    }

    byCard.set(card.id, transactionId);
    byTransaction.set(transactionId, cardsById.get(card.id)!);
  }

  return { byCard, byTransaction, needsReview, balanceConflict, decided, retired };
}

/**
 * The status a card carries once the rule has run, from the sets above.
 *
 * Derived rather than stored on the card, so there is exactly one place that decides what a card's
 * relationship to the statement is. **Retirement is checked first**: a retired card is not in any
 * relationship with the statement, and asking whether it is awaiting one would be the wrong
 * question rather than a wrong answer.
 */
export function cardStatus(card: NotificationCard, matches: CardMatches): CardMatchStatus {
  if (matches.retired.has(card.id)) return "retired";
  if (matches.byCard.has(card.id)) return "verified";
  if (matches.balanceConflict.has(card.id)) return "balance-conflict";
  if (matches.needsReview.has(card.id)) return "needs-review";
  return "awaiting-statement";
}

/**
 * The statement rows the owner may pair a card with by hand (migration 017).
 *
 * **Deliberately not the automatic rule's surviving set**, for the reason `matchCandidates` gives:
 * a chooser that only ever offered what the rule had already accepted could resolve nothing the
 * rule refused, and refusing is exactly what brings the owner here. So two of the rule's four
 * facts are re-checked and two are not:
 *
 *   * the **account** and the **exact amount** are re-checked, because
 *     `set_notification_card_decision` re-checks both server-side and would refuse anything else;
 *   * the **date window** is not applied, and neither is the **balance** — the balance being
 *     offered-but-disagreeing is the whole case this list exists for, and the RPC will still
 *     demand an explicit acknowledgement before storing it.
 *
 * Rows already claimed by another **card's** stored decision are left out, because the partial
 * unique index makes that write fail. A row claimed by a *slip* is offered: a payment can produce
 * both records, so that is not a conflict (D-102).
 *
 * **Balance-agreeing rows come first**, which is the ordering a card can afford and a slip cannot:
 * the likeliest answer is the row whose printed balance the card also printed, and putting it at
 * the top means the ordinary case needs no acknowledgement. Then nearest in date, then id, so the
 * order is total and a caller that does not re-sort gets a stable list.
 */
export function cardMatchCandidates(
  card: NotificationCard,
  transactions: readonly AccountTransaction[],
  decisions: readonly NotificationCardDecision[] = []
): AccountTransaction[] {
  const claimed = new Set(
    decisions
      .filter((decision) => decision.card_id !== card.id && decision.transaction_id !== null)
      .map((decision) => decision.transaction_id!)
  );
  const cardDay = dayNumber(card.occurred_on);
  const amount = BigInt(card.amount_minor);
  const balance = BigInt(card.balance_minor);

  const eligible = transactions.filter((transaction) => {
    if (claimed.has(transaction.id)) return false;
    if (transaction.account_id !== card.account_id) return false;
    return BigInt(movementMinor(transaction)) === amount;
  });

  eligible.sort((a, b) => {
    const aAgrees = BigInt(a.post_balance_minor) === balance ? 0 : 1;
    const bAgrees = BigInt(b.post_balance_minor) === balance ? 0 : 1;
    if (aAgrees !== bAgrees) return aAgrees - bAgrees;
    const byDistance = Math.abs(dayNumber(a.source_date) - cardDay) - Math.abs(dayNumber(b.source_date) - cardDay);
    if (byDistance !== 0) return byDistance;
    if (a.source_date !== b.source_date) return a.source_date < b.source_date ? 1 : -1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  return eligible;
}

/**
 * The account a card belongs to — a lookup, not a derivation.
 *
 * `slipAccount` exists because a slip's QR names a bank and only a statement says which of that
 * bank's accounts the money moved through, so it returns null whenever the owner holds two. A card
 * stores `account_id`, checked against the printed digits at capture (D-101), so this is a map
 * lookup that fails only if the account list itself is incomplete.
 */
export function cardAccount(card: NotificationCard, accounts: readonly LedgerAccount[]): LedgerAccount | null {
  return accounts.find((account) => account.id === card.account_id) ?? null;
}
