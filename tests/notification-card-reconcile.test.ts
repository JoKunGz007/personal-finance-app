import { describe, expect, it } from "vitest";
import type { LedgerAccount } from "@/lib/accounts";
import type { NotificationCard } from "@/lib/notification-cards";
import type { AccountTransaction, LedgerTransaction } from "@/lib/transactions";
import {
  CARD_MATCH_WINDOW_DAYS,
  cardAccount,
  cardStatus,
  proposeCardMatches
} from "@/lib/notification-card-reconcile";
import { reconcileLedger, summarizeRows } from "@/lib/slip-reconcile";
import type { CapturedSlip } from "@/lib/slips";

// Reconciling captured notification cards against confirmed statement rows (PLAN task 27).
//
// Every value here is invented, per docs/FIXTURE_POLICY.md. Nothing in this file came from
// `receipts_sample/line/`, including the account digits, which are built from the layout's shape
// rather than recalled from a screenshot — D-060 is the mistake this rule exists to not repeat.
//
// The balances below are chosen so the arithmetic is checkable by eye: a row's
// `post_balance_minor` is what the account held after it, and a card printing the same figure is
// what pairs the two.

const KTB_ACCOUNT: LedgerAccount = {
  id: "aaaaaaaa-0000-4000-8000-000000000001",
  bank_code: "KTB", label: "Invented KTB", account_type: "savings",
  last_four: "4242", currency: "THB", timezone: "Asia/Bangkok"
};
const SECOND_KTB: LedgerAccount = {
  ...KTB_ACCOUNT, id: "aaaaaaaa-0000-4000-8000-000000000003", last_four: "1357", label: "Invented KTB two"
};

const ACCOUNTS = [KTB_ACCOUNT, SECOND_KTB];

function row(overrides: Partial<LedgerTransaction> & { account_id?: string } = {}): AccountTransaction {
  const { account_id = KTB_ACCOUNT.id, ...rest } = overrides;
  return {
    id: "bbbbbbbb-0000-4000-8000-000000000001",
    source_date: "2026-06-10",
    source_time: "09:30:00",
    effective_date: "2026-06-10",
    transaction_label: "Invented label",
    description: "Invented description",
    reference: null,
    branch: null,
    post_balance_minor: "500000",
    currency: "THB",
    fingerprint: "f".repeat(64),
    source_components: [{ id: "cccccccc-0000-4000-8000-000000000001", kind: "withdrawal", amount_minor: "-9000", currency: "THB" }],
    import_batch_rows: [],
    transaction_overlays: [],
    account_id,
    ...rest
  };
}

function card(overrides: Partial<NotificationCard> = {}): NotificationCard {
  return {
    id: "eeeeeeee-0000-4000-8000-000000000001",
    account_id: KTB_ACCOUNT.id,
    channel: "Krungthai Connext",
    printed_account_digits: "4242",
    kind: "withdrawal",
    amount_minor: "-9000",
    currency: "THB",
    occurred_on: "2026-06-10",
    occurred_at_time: "09:30",
    balance_minor: "500000",
    counterparty: "Invented payee",
    category_id: null,
    note: null,
    captured_at: "2026-06-10T02:30:00Z",
    ...overrides
  };
}

function slip(overrides: Partial<CapturedSlip> = {}): CapturedSlip {
  return {
    id: "dddddddd-0000-4000-8000-000000000001",
    bank_code: "KTB",
    slip_reference: "A00000000000000001",
    kind: "withdrawal",
    amount_minor: "-9000",
    currency: "THB",
    occurred_on: "2026-06-10",
    occurred_at_time: "09:31",
    counterparty: "Invented payee",
    category_id: null,
    note: null,
    captured_at: "2026-06-10T02:31:00Z",
    ...overrides
  };
}

describe("matching a notification card to a statement row", () => {
  it("pairs a card with the row whose account, amount, date and printed balance it shares", () => {
    const matches = proposeCardMatches([row()], [card()]);
    expect(matches.byCard.get(card().id)).toBe(row().id);
    expect(matches.byTransaction.get(row().id)?.id).toBe(card().id);
    expect(cardStatus(card(), matches)).toBe("verified");
  });

  /**
   * **The load-bearing test, and the reason a card is worth capturing at all.**
   *
   * Two rows on one account, the same amount, the same day. This is exactly the case
   * `proposeSlipMatches` refuses outright as a coin toss — measured at 6.5% of the real ledger's
   * rows even on the same day (D-063). Two rows never share a running balance, so the card
   * resolves it.
   *
   * **Red proof, measured against the final code rather than carried forward from when the rule
   * was written:** drop the balance filter from `proposeCardMatches` — keep `fitting` as the
   * survivor set — and **exactly four tests fail**, this one and the three others that are about
   * the balance: the fail-closed refusal below, the order-independence pair (which only separates
   * because the two cards print different balances), and the ledger's balance-conflict row. The
   * other thirteen pass. That is the right blast radius for a one-line rule that is the whole
   * difference between a card and a slip — anything narrower would mean the balance was not
   * really load-bearing.
   */
  it("uses the printed balance to break a tie the amount cannot", () => {
    const first = row({ id: "bbbbbbbb-0000-4000-8000-00000000000a", post_balance_minor: "500000" });
    const second = row({ id: "bbbbbbbb-0000-4000-8000-00000000000b", post_balance_minor: "491000" });

    const matches = proposeCardMatches([first, second], [card({ balance_minor: "491000" })]);

    expect(matches.byCard.get(card().id)).toBe(second.id);
    expect(matches.needsReview.size).toBe(0);
  });

  /**
   * The other half of the same rule, and the half that refuses rather than decides.
   *
   * A card fitting on account, amount and date whose balance contradicts every such row is a card
   * that was misread, or a row that is not this payment. It stays unpaired and says how many rows
   * it was measured against.
   */
  it("refuses to pair when no fitting row printed the card's balance, and says how many fitted", () => {
    const first = row({ id: "bbbbbbbb-0000-4000-8000-00000000000a", post_balance_minor: "500000" });
    const second = row({ id: "bbbbbbbb-0000-4000-8000-00000000000b", post_balance_minor: "491000" });

    const matches = proposeCardMatches([first, second], [card({ balance_minor: "123456" })]);

    expect(matches.byCard.size).toBe(0);
    expect(matches.balanceConflict.get(card().id)).toBe(2);
    expect(cardStatus(card({ balance_minor: "123456" }), matches)).toBe("balance-conflict");
    // Not folded into needs-review: the two states ask the owner for different things.
    expect(matches.needsReview.size).toBe(0);
  });

  /**
   * The account, not the bank — the check a slip structurally cannot make.
   *
   * `slipAccount` returns null whenever the owner holds two accounts at one bank, so the slip rule
   * matches on `bank_code` and would accept this row. A card's `account_id` was checked against
   * the digits it printed at capture (D-101), so it refuses.
   *
   * **Red proof:** compare `bankByAccount.get(transaction.account_id)` against the card's bank
   * instead of comparing `transaction.account_id` to `card.account_id`, and this test fails alone
   * — the row is at the same bank, on the same day, for the same amount, with the same balance.
   */
  it("does not match a row at the same bank on a different account", () => {
    const otherAccount = row({ account_id: SECOND_KTB.id });
    const matches = proposeCardMatches([otherAccount], [card()]);

    expect(matches.byCard.size).toBe(0);
    expect(matches.balanceConflict.size).toBe(0);
    expect(cardStatus(card(), matches)).toBe("awaiting-statement");
  });

  it("does not match a row whose movement has the opposite sign", () => {
    const deposit = row({
      source_components: [{ id: "cccccccc-0000-4000-8000-000000000002", kind: "deposit", amount_minor: "9000", currency: "THB" }]
    });
    const matches = proposeCardMatches([deposit], [card()]);
    expect(matches.byCard.size).toBe(0);
  });

  it("does not match a row outside the date window, however well the balance agrees", () => {
    const distant = row({ source_date: "2026-06-13" });
    expect(CARD_MATCH_WINDOW_DAYS).toBe(1);

    const matches = proposeCardMatches([distant], [card()]);

    expect(matches.byCard.size).toBe(0);
    // Awaiting a statement rather than a balance conflict: the balance was never consulted,
    // because nothing fitted for it to contradict.
    expect(matches.balanceConflict.size).toBe(0);
    expect(cardStatus(card(), matches)).toBe("awaiting-statement");
  });

  it("matches a row one day either side of the card", () => {
    const before = proposeCardMatches([row({ source_date: "2026-06-09" })], [card()]);
    const after = proposeCardMatches([row({ source_date: "2026-06-11" })], [card()]);
    expect(before.byCard.size).toBe(1);
    expect(after.byCard.size).toBe(1);
  });

  /**
   * Two cards resolving to one row. Neither is safe to pair, and the reason is recorded because
   * it names the likely cause: everything but the printed time is in the fingerprint the database
   * computes, so two distinct cards on one row differ in their time.
   */
  it("refuses both cards when two of them resolve to the same row", () => {
    const second = card({ id: "eeeeeeee-0000-4000-8000-000000000002", occurred_at_time: "09:31" });
    const matches = proposeCardMatches([row()], [card(), second]);

    expect(matches.byCard.size).toBe(0);
    expect(matches.needsReview.get(card().id)).toBe("several-cards");
    expect(matches.needsReview.get(second.id)).toBe("several-cards");
  });

  /**
   * Two rows sharing an amount **and** a balance, which a sound balance chain should not contain.
   * Left as an ambiguity rather than resolved by falling back to the nearest date: a rule that
   * refuses on the balance and then guesses on something weaker when the balance fails to decide
   * is not fail-closed.
   */
  it("refuses when two rows share the amount and the balance, rather than falling back to the date", () => {
    const sameDay = row({ id: "bbbbbbbb-0000-4000-8000-00000000000a" });
    const dayAfter = row({ id: "bbbbbbbb-0000-4000-8000-00000000000b", source_date: "2026-06-11" });

    const matches = proposeCardMatches([sameDay, dayAfter], [card()]);

    expect(matches.byCard.size).toBe(0);
    expect(matches.needsReview.get(card().id)).toBe("several-rows");
  });

  it("is independent of the order the cards and rows arrive in", () => {
    const first = row({ id: "bbbbbbbb-0000-4000-8000-00000000000a", post_balance_minor: "500000" });
    const second = row({ id: "bbbbbbbb-0000-4000-8000-00000000000b", post_balance_minor: "491000" });
    const one = card({ id: "eeeeeeee-0000-4000-8000-00000000000a", balance_minor: "500000" });
    const two = card({ id: "eeeeeeee-0000-4000-8000-00000000000b", balance_minor: "491000", occurred_at_time: "09:35" });

    const forward = proposeCardMatches([first, second], [one, two]);
    const backward = proposeCardMatches([second, first], [two, one]);

    expect([...forward.byCard.entries()].sort()).toEqual([...backward.byCard.entries()].sort());
    expect(forward.byCard.get(one.id)).toBe(first.id);
    expect(forward.byCard.get(two.id)).toBe(second.id);
  });

  it("reads a card's account straight off the card rather than deriving it", () => {
    expect(cardAccount(card(), ACCOUNTS)?.id).toBe(KTB_ACCOUNT.id);
    // Two accounts at one bank is the case `slipAccount` gives up on. A card does not.
    expect(cardAccount(card({ account_id: SECOND_KTB.id }), ACCOUNTS)?.id).toBe(SECOND_KTB.id);
    expect(cardAccount(card({ account_id: "aaaaaaaa-0000-4000-8000-0000000000ff" }), ACCOUNTS)).toBeNull();
  });
});

describe("notification cards in the reconciled ledger", () => {
  it("collapses a matched card onto its statement row and counts the payment once", () => {
    const { rows } = reconcileLedger([row()], [], ACCOUNTS, [], [], [card()]);

    expect(rows).toHaveLength(1);
    expect(rows[0]!.kind).toBe("confirmed");
    expect(rows[0]!.status).toBe("verified");
    const totals = summarizeRows(rows);
    expect(totals.rows).toBe(1);
    expect(totals.withdrawals).toBe("-9000");
    expect(totals.cards).toBe(0);
  });

  it("shows an unmatched card as its own row and counts it apart from provisional and cash", () => {
    const { rows } = reconcileLedger([], [], ACCOUNTS, [], [], [card()]);

    expect(rows).toHaveLength(1);
    expect(rows[0]!.kind).toBe("card");
    expect(rows[0]!.status).toBe("awaiting-statement");
    const totals = summarizeRows(rows);
    expect(totals.cards).toBe(1);
    expect(totals.provisional).toBe(0);
    expect(totals.cash).toBe(0);
    // Money that moved, whether or not a statement has confirmed it.
    expect(totals.withdrawals).toBe("-9000");
  });

  it("carries a card whose balance disagrees as its own row, in its own status", () => {
    const { rows } = reconcileLedger([row()], [], ACCOUNTS, [], [], [card({ balance_minor: "123456" })]);

    expect(rows).toHaveLength(2);
    const cardRow = rows.find((entry) => entry.kind === "card");
    expect(cardRow?.status).toBe("balance-conflict");
    // The statement row is still statement-only: refusing to pair means neither record claims
    // the other, in both directions.
    expect(rows.find((entry) => entry.kind === "confirmed")?.status).toBe("statement-only");
  });

  /**
   * **The independence rule, stated as a test.** A slip and a card can describe the same payment,
   * so they are not rivals for the row — both collapse onto it and it is still one row.
   *
   * **Red proof:** remove the rows the slip rule claimed from the list `proposeCardMatches` sees,
   * and this test fails with the card unmatched and a second row appearing, while every other
   * test in this file still passes. That is the shape of the defect coupling them would cause:
   * whichever rule ran second would silently lose.
   */
  it("lets one statement row carry both a slip and a card without either displacing the other", () => {
    const { rows, matches, cardMatches } = reconcileLedger([row()], [slip()], ACCOUNTS, [], [], [card()]);

    expect(rows).toHaveLength(1);
    const confirmed = rows[0]!;
    expect(confirmed.kind).toBe("confirmed");
    expect(confirmed.status).toBe("verified");
    if (confirmed.kind === "confirmed") {
      expect(confirmed.slip?.id).toBe(slip().id);
      expect(confirmed.card?.id).toBe(card().id);
    }
    expect(matches.bySlip.get(slip().id)).toBe(row().id);
    expect(cardMatches.byCard.get(card().id)).toBe(row().id);
  });

  it("verifies a row carrying only a card, with no slip anywhere", () => {
    const { rows } = reconcileLedger([row()], [], ACCOUNTS, [], [], [card()]);
    const confirmed = rows[0]!;
    if (confirmed.kind !== "confirmed") throw new Error("expected a confirmed row");
    expect(confirmed.slip).toBeNull();
    expect(confirmed.card?.id).toBe(card().id);
    expect(confirmed.status).toBe("verified");
    // A card cannot be overruled, so a row verified by one alone was never the owner's decision.
    expect(confirmed.ownerDecided).toBe(false);
  });

  it("gives an unmatched card row the account it was captured against", () => {
    const { rows } = reconcileLedger([], [], ACCOUNTS, [], [], [card({ account_id: SECOND_KTB.id })]);
    const cardRow = rows[0]!;
    if (cardRow.kind !== "card") throw new Error("expected a card row");
    expect(cardRow.account?.id).toBe(SECOND_KTB.id);
  });
});
