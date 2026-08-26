import { describe, expect, it } from "vitest";
import type { LedgerAccount } from "@/lib/accounts";
import { slipMatchRequestSchema, slipsInForce, type CapturedSlip, type SlipCorrection } from "@/lib/slips";
import { cashInForce, type CashCorrection, type CashEntry } from "@/lib/cash";
import type { AccountTransaction, LedgerTransaction } from "@/lib/transactions";
import {
  MATCH_WINDOW_DAYS,
  compareRows,
  matchCandidates,
  proposeSlipMatches,
  reconcileLedger,
  slipAccount,
  summarizeRows,
  type ReconciledRow
} from "@/lib/slip-reconcile";

// Reconciling captured slips against confirmed statement rows (PLAN task 22, D-063).
//
// Every value here is invented, per docs/FIXTURE_POLICY.md. The references are built from the
// grammar's own alphabet rather than recalled from a real slip — the specific mistake D-060
// recorded, which is worth not repeating in the file that would repeat it.

const KTB_ACCOUNT: LedgerAccount = {
  id: "aaaaaaaa-0000-4000-8000-000000000001",
  bank_code: "KTB", label: "Invented KTB", account_type: "savings",
  last_four: "4242", currency: "THB", timezone: "Asia/Bangkok"
};
const SCB_ACCOUNT: LedgerAccount = { ...KTB_ACCOUNT, id: "aaaaaaaa-0000-4000-8000-000000000002", bank_code: "SCB", label: "Invented SCB" };
const SECOND_KTB: LedgerAccount = { ...KTB_ACCOUNT, id: "aaaaaaaa-0000-4000-8000-000000000003", last_four: "1357", label: "Invented KTB two" };

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
    transaction_overlays: [],
    account_id,
    ...rest
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

function cashEntry(overrides: Partial<CashEntry> = {}): CashEntry {
  return {
    id: "eeeeeeee-0000-4000-8000-000000000001",
    kind: "withdrawal",
    amount_minor: "-2500",
    currency: "THB",
    occurred_on: "2026-06-10",
    occurred_at_time: "12:15",
    counterparty: "Invented market stall",
    category_id: null,
    note: null,
    created_at: "2026-06-10T05:15:00Z",
    ...overrides
  };
}

const ACCOUNTS = [KTB_ACCOUNT, SCB_ACCOUNT];

/**
 * The rows *slip* reconciliation is about. A cash row carries no pairing at all — it has no bank
 * and no statement — and an unmatched notification card carries one this module does not own:
 * its rule is `lib/notification-card-reconcile.ts` and its pairing cannot be overruled, so it has
 * no `ownerDecided` to ask about. Narrowing both out is how a test says it is asking about slips.
 */
function reconciledSlipRows(rows: readonly ReconciledRow[]): Exclude<ReconciledRow, { kind: "cash" | "card" }>[] {
  return rows.filter(
    (entry): entry is Exclude<ReconciledRow, { kind: "cash" | "card" }> => entry.kind !== "cash" && entry.kind !== "card"
  );
}

describe("matching a slip to a statement row", () => {
  it("matches on bank, exact amount and a date inside the window", () => {
    const matches = proposeSlipMatches([row()], [slip()], ACCOUNTS);
    expect(matches.bySlip.get(slip().id)).toBe(row().id);
    expect(matches.byTransaction.get(row().id)?.id).toBe(slip().id);
    expect(matches.needsReview.size).toBe(0);
  });

  it("matches across the window's edge and refuses one day beyond it", () => {
    // The window is one day (D-064): room for the slip's clock and the bank's to fall either
    // side of midnight, not room for a late posting. It is a hard edge, not a slope.
    const inside = proposeSlipMatches([row({ source_date: "2026-06-11" })], [slip({ occurred_on: "2026-06-10" })], ACCOUNTS);
    expect(inside.bySlip.size).toBe(1);
    expect(MATCH_WINDOW_DAYS).toBe(1);

    const outside = proposeSlipMatches([row({ source_date: "2026-06-12" })], [slip({ occurred_on: "2026-06-10" })], ACCOUNTS);
    expect(outside.bySlip.size).toBe(0);
    expect(outside.needsReview.size).toBe(0); // no candidate at all is "awaiting", not a problem
  });

  it("refuses a near-match on money, to the minor unit", () => {
    // One satang apart. There is no tolerance here and there must never be: a ledger that
    // pairs records on approximately-equal money has stopped being a ledger.
    const matches = proposeSlipMatches([row()], [slip({ amount_minor: "-9001" })], ACCOUNTS);
    expect(matches.bySlip.size).toBe(0);
  });

  it("refuses to match a deposit slip to a withdrawal row of the same magnitude", () => {
    // The comparison is signed, so direction cannot be crossed.
    const matches = proposeSlipMatches([row()], [slip({ kind: "deposit", amount_minor: "9000" })], ACCOUNTS);
    expect(matches.bySlip.size).toBe(0);
  });

  it("refuses a row at another bank, however well the amount and date agree", () => {
    const matches = proposeSlipMatches([row({ account_id: SCB_ACCOUNT.id })], [slip()], ACCOUNTS);
    expect(matches.bySlip.size).toBe(0);
  });

  // The clause that makes this safe. Two identical payments on one day are the case where a
  // greedy matcher looks confident and is guessing — and it is not hypothetical: the owner's
  // real ledger holds a same-bank, same-amount pair on a single day.
  it("refuses when one slip could be either of two rows on the same day", () => {
    const matches = proposeSlipMatches(
      [row(), row({ id: "bbbbbbbb-0000-4000-8000-000000000002" })],
      [slip()],
      ACCOUNTS
    );
    expect(matches.bySlip.size).toBe(0);
    expect(matches.needsReview.has(slip().id)).toBe(true);
  });

  // Measured rather than assumed: over 1,465 real rows, taking every candidate inside a
  // three-day window leaves 16.3% of rows ambiguous, and preferring the nearest date takes
  // that to 6.5% — the same-day floor. The window's tolerance therefore costs nothing, which
  // is what would let it widen again without paying for it.
  //
  // Both candidates here must sit *inside* the window, or the window rather than the
  // preference is what separates them and this stops testing its own name.
  it("prefers the nearest date instead of treating everything in the window as equal", () => {
    const matches = proposeSlipMatches(
      [
        row(), // the slip's own day
        row({ id: "bbbbbbbb-0000-4000-8000-000000000002", source_date: "2026-06-11" })
      ],
      [slip()],
      ACCOUNTS
    );
    expect(matches.bySlip.get(slip().id)).toBe(row().id);
    expect(matches.needsReview.size).toBe(0);
  });

  it("still refuses when the two nearest candidates are equidistant on either side", () => {
    // One day before and one day after: nothing in the dates distinguishes them, so the
    // nearest-date rule cannot break the tie and must not pretend to.
    const matches = proposeSlipMatches(
      [
        row({ source_date: "2026-06-09" }),
        row({ id: "bbbbbbbb-0000-4000-8000-000000000002", source_date: "2026-06-11" })
      ],
      [slip()],
      ACCOUNTS
    );
    expect(matches.bySlip.size).toBe(0);
    expect(matches.needsReview.has(slip().id)).toBe(true);
  });

  it("does not let a far candidate block a pairing it could never win", () => {
    // Two slips, one on the row's day and one a day off but still inside the window, and a
    // single row. The near slip takes it; the far one is left awaiting rather than both being
    // called ambiguous. The far slip has to be a genuine candidate for this to mean anything —
    // put it outside the window and the test passes without exercising the claim.
    const near = slip();
    const far = slip({ id: "dddddddd-0000-4000-8000-000000000007", occurred_on: "2026-06-11", slip_reference: "A00000000000000007" });
    const matches = proposeSlipMatches([row()], [near, far], ACCOUNTS);
    expect(matches.bySlip.get(near.id)).toBe(row().id);
    expect(matches.bySlip.has(far.id)).toBe(false);
    expect(matches.needsReview.size).toBe(0);
  });

  it("refuses when two slips could both be the same row", () => {
    const matches = proposeSlipMatches(
      [row()],
      [slip(), slip({ id: "dddddddd-0000-4000-8000-000000000002", slip_reference: "A00000000000000002" })],
      ACCOUNTS
    );
    expect(matches.bySlip.size).toBe(0);
    expect(matches.needsReview.size).toBe(2);
  });

  it("is independent of the order it is handed rows and slips", () => {
    // Mutual uniqueness is what buys this. A greedy matcher would pair whichever came first
    // and produce a different ledger from the same data.
    const rows = [row(), row({ id: "bbbbbbbb-0000-4000-8000-000000000002", source_date: "2026-06-11", source_components: [{ id: "cccccccc-0000-4000-8000-000000000002", kind: "withdrawal", amount_minor: "-2500", currency: "THB" }] })];
    const slips = [slip(), slip({ id: "dddddddd-0000-4000-8000-000000000002", amount_minor: "-2500", occurred_on: "2026-06-11", slip_reference: "A00000000000000002" })];
    const forward = proposeSlipMatches(rows, slips, ACCOUNTS);
    const reversed = proposeSlipMatches([...rows].reverse(), [...slips].reverse(), ACCOUNTS);
    expect([...forward.bySlip.entries()].sort()).toEqual([...reversed.bySlip.entries()].sort());
    expect(forward.bySlip.size).toBe(2);
  });
});

describe("the owner's stored decision, which outranks the rule", () => {
  // The headline case: two rows on the slip's own day is the ambiguity the rule must refuse,
  // and the decision is how the owner resolves what no rule can.
  it("resolves an ambiguity the rule correctly refused", () => {
    const second = row({ id: "bbbbbbbb-0000-4000-8000-000000000002" });
    const undecided = proposeSlipMatches([row(), second], [slip()], ACCOUNTS);
    expect(undecided.needsReview.has(slip().id)).toBe(true);

    const decided = proposeSlipMatches([row(), second], [slip()], ACCOUNTS, [
      { slip_id: slip().id, decision: "matched", transaction_id: second.id, revision: 1 }
    ]);
    expect(decided.bySlip.get(slip().id)).toBe(second.id);
    expect(decided.needsReview.size).toBe(0);
    expect(decided.decided.has(slip().id)).toBe(true);
  });

  it("undoes a match the rule would otherwise make", () => {
    const { rows } = reconcileLedger([row()], [slip()], ACCOUNTS, [
      { slip_id: slip().id, decision: "unmatched", transaction_id: null, revision: 1 }
    ]);
    // Two rows, not one: the pair no longer collapses, and the slip is visible again.
    expect(rows).toHaveLength(2);
    expect(rows.filter((entry) => entry.status === "statement-only")).toHaveLength(1);
    expect(rows.filter((entry) => entry.status === "awaiting-statement")).toHaveLength(1);
  });

  it("takes the claimed row out of the pool, so the rule cannot pair it with something else", () => {
    // Without this the automatic rule would find the same row a decision already owns, and
    // the owner's decision would lose to a guess depending on iteration order.
    const other = slip({ id: "dddddddd-0000-4000-8000-000000000002", slip_reference: "A00000000000000002" });
    const matches = proposeSlipMatches([row()], [slip(), other], ACCOUNTS, [
      { slip_id: slip().id, decision: "matched", transaction_id: row().id, revision: 1 }
    ]);
    expect(matches.bySlip.get(slip().id)).toBe(row().id);
    expect(matches.bySlip.has(other.id)).toBe(false);
    // Awaiting a statement, not ambiguous: the row it wanted is spoken for.
    expect(matches.needsReview.size).toBe(0);
  });

  it("ignores a decision naming a row this ledger no longer holds, rather than losing the slip", () => {
    // A restore or a re-import can remove the row a decision pointed at. Obeying it would pair
    // the slip with nothing and drop it out of the totals; ignoring it leaves it visible.
    const { rows } = reconcileLedger([row()], [slip()], ACCOUNTS, [
      { slip_id: slip().id, decision: "matched", transaction_id: "bbbbbbbb-0000-4000-8000-00000000dead", revision: 1 }
    ]);
    expect(rows).toHaveLength(2);
    expect(rows.filter((entry) => entry.kind === "provisional")).toHaveLength(1);
    expect(summarizeRows(rows).provisional).toBe(1);
  });

  it("says which pairings are the owner's and which are the rule's", () => {
    const automatic = reconcileLedger([row()], [slip()], ACCOUNTS);
    expect(reconciledSlipRows(automatic.rows)[0]!.ownerDecided).toBe(false);

    const manual = reconcileLedger([row()], [slip()], ACCOUNTS, [
      { slip_id: slip().id, decision: "matched", transaction_id: row().id, revision: 1 }
    ]);
    expect(reconciledSlipRows(manual.rows)[0]!.ownerDecided).toBe(true);
  });

  it("ignores a decision about a slip that is not loaded", () => {
    const matches = proposeSlipMatches([row()], [slip()], ACCOUNTS, [
      { slip_id: "dddddddd-0000-4000-8000-00000000dead", decision: "unmatched", transaction_id: null, revision: 1 }
    ]);
    expect(matches.bySlip.get(slip().id)).toBe(row().id);
    expect(matches.decided.size).toBe(0);
  });

  it("stays independent of the order decisions and slips arrive in", () => {
    const second = row({ id: "bbbbbbbb-0000-4000-8000-000000000002" });
    const other = slip({ id: "dddddddd-0000-4000-8000-000000000002", slip_reference: "A00000000000000002" });
    const decisions = [
      { slip_id: other.id, decision: "matched" as const, transaction_id: row().id, revision: 1 },
      { slip_id: slip().id, decision: "matched" as const, transaction_id: second.id, revision: 1 }
    ];
    const forward = proposeSlipMatches([row(), second], [slip(), other], ACCOUNTS, decisions);
    const reversed = proposeSlipMatches([second, row()], [other, slip()], ACCOUNTS, [...decisions].reverse());
    expect([...forward.bySlip.entries()].sort()).toEqual([...reversed.bySlip.entries()].sort());
    expect(forward.bySlip.size).toBe(2);
  });
});

describe("the account a slip is shown against", () => {
  it("takes the one account at that bank, because nothing is being guessed", () => {
    expect(slipAccount(slip(), ACCOUNTS)?.id).toBe(KTB_ACCOUNT.id);
  });

  it("declines when the owner holds two accounts at that bank", () => {
    // D-056 stands: the QR names a bank, and only the statement says which account. With two
    // candidates there is a real choice, and this makes none.
    expect(slipAccount(slip(), [KTB_ACCOUNT, SECOND_KTB, SCB_ACCOUNT])).toBeNull();
  });

  it("declines when no account exists at that bank", () => {
    expect(slipAccount(slip({ bank_code: "KBANK" }), ACCOUNTS)).toBeNull();
  });
});

describe("the reconciled ledger", () => {
  it("collapses a matched pair onto the statement row, carrying the slip", () => {
    const { rows } = reconcileLedger([row()], [slip()], ACCOUNTS);
    expect(rows).toHaveLength(1);
    const only = rows[0]!;
    expect(only.kind).toBe("confirmed");
    expect(only.status).toBe("verified");
    if (only.kind === "confirmed") expect(only.slip?.counterparty).toBe("Invented payee");
  });

  it("keeps an unmatched slip as its own provisional row", () => {
    const { rows } = reconcileLedger([], [slip()], ACCOUNTS);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe("awaiting-statement");
  });

  it("marks an ambiguous slip for review rather than matching or hiding it", () => {
    // Both rows on the slip's own day, so the nearest-date rule cannot separate them.
    const { rows } = reconcileLedger(
      [row(), row({ id: "bbbbbbbb-0000-4000-8000-000000000002" })],
      [slip()],
      ACCOUNTS
    );
    expect(rows).toHaveLength(3);
    expect(rows.filter((entry) => entry.status === "needs-review")).toHaveLength(1);
    expect(rows.filter((entry) => entry.status === "statement-only")).toHaveLength(2);
  });

  it("labels a statement row with no slip as statement-only", () => {
    const { rows } = reconcileLedger([row()], [], ACCOUNTS);
    expect(rows[0]!.status).toBe("statement-only");
  });

  it("orders both kinds in one sequence, untimed last within a day", () => {
    const { rows } = reconcileLedger(
      [row({ source_date: "2026-06-12" })],
      [slip({ occurred_on: "2026-06-12", occurred_at_time: null, amount_minor: "-100" }), slip({ id: "dddddddd-0000-4000-8000-000000000009", occurred_on: "2026-06-14", amount_minor: "-200", slip_reference: "A00000000000000009" })],
      ACCOUNTS
    );
    const sorted = [...rows].sort(compareRows);
    expect(sorted.map((entry) => entry.date)).toEqual(["2026-06-14", "2026-06-12", "2026-06-12"]);
    expect(sorted[1]!.time).toBe("09:30:00");
    expect(sorted[2]!.time).toBeNull();
  });
});

describe("totals over a reconciled ledger", () => {
  // The reason the total can finally include slips: a matched slip is not a row, so counting
  // every row counts every payment exactly once.
  it("counts a matched payment once, not twice", () => {
    const { rows } = reconcileLedger([row()], [slip()], ACCOUNTS);
    expect(summarizeRows(rows)).toEqual({ rows: 1, deposits: "0", withdrawals: "-9000", net: "-9000", provisional: 0, cash: 0, cards: 0 });
  });

  it("counts an unmatched slip as money that moved, and says it is provisional", () => {
    const { rows } = reconcileLedger([row()], [slip({ occurred_on: "2026-06-20", amount_minor: "-2500", slip_reference: "A00000000000000003" })], ACCOUNTS);
    expect(summarizeRows(rows)).toEqual({ rows: 2, deposits: "0", withdrawals: "-11500", net: "-11500", provisional: 1, cash: 0, cards: 0 });
  });

  it("adds a deposit slip to deposits, with its sign respected", () => {
    const { rows } = reconcileLedger([], [slip({ kind: "deposit", amount_minor: "45000" })], ACCOUNTS);
    expect(summarizeRows(rows)).toEqual({ rows: 1, deposits: "45000", withdrawals: "0", net: "45000", provisional: 1, cash: 0, cards: 0 });
  });

  it("stays exact past 2^53", () => {
    // Money is BigInt here as everywhere else. Asserted alongside proof the loss would be real.
    const huge = "9007199254740993";
    const { rows } = reconcileLedger([], [slip({ kind: "deposit", amount_minor: huge })], ACCOUNTS);
    expect(summarizeRows(rows).net).toBe(huge);
    expect(String(Number(huge))).not.toBe(huge);
  });

  it("is empty and zero for an empty ledger rather than failing", () => {
    expect(summarizeRows([])).toEqual({ rows: 0, deposits: "0", withdrawals: "0", net: "0", provisional: 0, cash: 0, cards: 0 });
  });

  it("counts cash apart from provisional, because it is not waiting for a statement", () => {
    const { rows } = reconcileLedger([row()], [], ACCOUNTS, [], [cashEntry()]);
    expect(summarizeRows(rows)).toEqual({ rows: 2, deposits: "0", withdrawals: "-11500", net: "-11500", provisional: 0, cash: 1, cards: 0 });
  });

  it("adds a cash deposit to deposits, with its sign respected", () => {
    const { rows } = reconcileLedger([], [], ACCOUNTS, [], [cashEntry({ kind: "deposit", amount_minor: "30000" })]);
    expect(summarizeRows(rows)).toEqual({ rows: 1, deposits: "30000", withdrawals: "0", net: "30000", provisional: 0, cash: 1, cards: 0 });
  });

  it("keeps cash exact past 2^53, like every other amount here", () => {
    const huge = "9007199254740993";
    const { rows } = reconcileLedger([], [], ACCOUNTS, [], [cashEntry({ kind: "deposit", amount_minor: huge })]);
    expect(summarizeRows(rows).net).toBe(huge);
  });
});

describe("cash entries in the ledger", () => {
  it("is its own row and is never matched to a statement row", () => {
    // Same bank-less amount and day as the statement row: a slip on these facts would pair
    // with it, and cash must not, because there is no bank to be the first of the three facts.
    const { rows, matches } = reconcileLedger([row()], [], ACCOUNTS, [], [cashEntry({ amount_minor: "-9000" })]);
    expect(rows).toHaveLength(2);
    expect(matches.bySlip.size).toBe(0);
    expect(matches.byTransaction.size).toBe(0);
    const cashRow = rows.find((entry) => entry.kind === "cash");
    expect(cashRow?.status).toBe("cash");
  });

  it("does not consume a statement row a slip is entitled to", () => {
    const { rows, matches } = reconcileLedger([row()], [slip()], ACCOUNTS, [], [cashEntry({ amount_minor: "-9000" })]);
    expect(matches.bySlip.get(slip().id)).toBe(row().id);
    expect(rows).toHaveLength(2); // the collapsed pair, and the cash entry
  });

  it("sorts into one sequence with the other kinds", () => {
    const { rows } = reconcileLedger(
      [row({ source_date: "2026-06-09" })],
      [slip({ occurred_on: "2026-06-11", amount_minor: "-700", slip_reference: "A00000000000000009" })],
      ACCOUNTS,
      [],
      [cashEntry({ occurred_on: "2026-06-10" })]
    );
    expect([...rows].sort(compareRows).map((entry) => entry.date)).toEqual(["2026-06-11", "2026-06-10", "2026-06-09"]);
  });

  it("carries no account, because there is none to derive", () => {
    const { rows } = reconcileLedger([], [], ACCOUNTS, [], [cashEntry()]);
    const cashRow = rows[0]!;
    expect(cashRow.kind).toBe("cash");
    expect("account" in cashRow).toBe(false);
  });
});

describe("corrections, applied before anything reads an amount", () => {
  const correction = (overrides: Partial<SlipCorrection> = {}): SlipCorrection => ({
    slip_id: slip().id,
    kind: null,
    amount_minor: null,
    occurred_on: null,
    occurred_at_time: null,
    counterparty: null,
    category_id: null,
    note: null,
    revision: 1,
    updated_at: "2026-06-11T02:00:00Z",
    ...overrides
  });

  it("leaves a slip alone when it has no correction", () => {
    expect(slipsInForce([slip()], [])).toEqual([slip()]);
  });

  it("replaces only the fields the correction states", () => {
    const [corrected] = slipsInForce([slip()], [correction({ counterparty: "Invented other payee" })]);
    expect(corrected!.counterparty).toBe("Invented other payee");
    expect(corrected!.amount_minor).toBe(slip().amount_minor);
    expect(corrected!.occurred_on).toBe(slip().occurred_on);
  });

  it("never rewrites the identity the QR carried", () => {
    const [corrected] = slipsInForce([slip()], [correction({ amount_minor: "-4200", kind: "withdrawal" })]);
    expect(corrected!.bank_code).toBe(slip().bank_code);
    expect(corrected!.slip_reference).toBe(slip().slip_reference);
    expect(corrected!.id).toBe(slip().id);
  });

  // The read-side half of migration 014. The uncorrected amount matches the statement row and
  // the corrected one does not, so a rule reading the original would pair two figures the
  // owner has said are different — which is the pairing 014 stopped the database accepting.
  it("refuses a pairing the correction has falsified", () => {
    const uncorrected = proposeSlipMatches([row()], [slip()], ACCOUNTS);
    expect(uncorrected.bySlip.get(slip().id)).toBe(row().id);

    const corrected = proposeSlipMatches(
      [row()],
      slipsInForce([slip()], [correction({ kind: "withdrawal", amount_minor: "-4200" })]),
      ACCOUNTS
    );
    expect(corrected.bySlip.size).toBe(0);
  });

  // And the other direction, which is the one that produced a *wrong* pairing rather than a
  // refused one: the captured figure disagrees with the row and the corrected figure agrees.
  it("allows a pairing only the correction makes true", () => {
    const uncorrected = proposeSlipMatches([row()], [slip({ amount_minor: "-4200" })], ACCOUNTS);
    expect(uncorrected.bySlip.size).toBe(0);

    const corrected = proposeSlipMatches(
      [row()],
      slipsInForce([slip({ amount_minor: "-4200" })], [correction({ kind: "withdrawal", amount_minor: "-9000" })]),
      ACCOUNTS
    );
    expect(corrected.bySlip.get(slip().id)).toBe(row().id);
  });

  it("moves the date the match window is measured from", () => {
    const outside = proposeSlipMatches([row({ source_date: "2026-06-14" })], [slip()], ACCOUNTS);
    expect(outside.bySlip.size).toBe(0);

    const inside = proposeSlipMatches(
      [row({ source_date: "2026-06-14" })],
      slipsInForce([slip()], [correction({ occurred_on: "2026-06-13" })]),
      ACCOUNTS
    );
    expect(inside.bySlip.get(slip().id)).toBe(row().id);
  });

  it("offers manual candidates against the corrected amount too", () => {
    const candidates = matchCandidates(
      slipsInForce([slip({ amount_minor: "-4200" })], [correction({ kind: "withdrawal", amount_minor: "-9000" })])[0]!,
      [row()],
      ACCOUNTS
    );
    expect(candidates.map((candidate) => candidate.id)).toEqual([row().id]);
  });

  it("totals the corrected amount, not the captured one", () => {
    const { rows } = reconcileLedger(
      [],
      slipsInForce([slip()], [correction({ kind: "withdrawal", amount_minor: "-4200" })]),
      ACCOUNTS
    );
    expect(summarizeRows(rows).net).toBe("-4200");
  });

  it("applies the same rule to a cash entry", () => {
    const cashCorrection: CashCorrection = {
      cash_entry_id: cashEntry().id,
      kind: "withdrawal",
      amount_minor: "-3300",
      occurred_on: "2026-06-12",
      occurred_at_time: null,
      counterparty: null,
      category_id: null,
      note: null,
      revision: 1,
      updated_at: "2026-06-12T02:00:00Z"
    };
    const [corrected] = cashInForce([cashEntry()], [cashCorrection]);
    expect(corrected!.amount_minor).toBe("-3300");
    expect(corrected!.occurred_on).toBe("2026-06-12");
    // Null means "not corrected": the entry's own time and counterparty stand.
    expect(corrected!.occurred_at_time).toBe(cashEntry().occurred_at_time);
    expect(corrected!.counterparty).toBe(cashEntry().counterparty);
  });

  it("ignores a correction whose record is not loaded", () => {
    expect(slipsInForce([slip()], [correction({ slip_id: "dddddddd-0000-4000-8000-00000000dead", counterparty: "Invented ghost" })]))
      .toEqual([slip()]);
  });
});

describe("the rows an owner may pair a slip with by hand", () => {
  // The candidate list behind the override control (D-067). It is deliberately *not* the
  // automatic rule's candidate set: it re-checks the two facts `set_slip_match` re-checks
  // server-side, and drops the date window entirely, because reaching past that window is the
  // whole reason an override exists.
  it("offers a row the automatic window refused", () => {
    const distant = row({ source_date: "2026-05-02" });
    expect(proposeSlipMatches([distant], [slip()], ACCOUNTS).bySlip.size).toBe(0);
    expect(matchCandidates(slip(), [distant], ACCOUNTS).map((candidate) => candidate.id)).toEqual([distant.id]);
  });

  it("offers nothing at another bank or another amount, because the database would refuse it", () => {
    // The two guards `set_slip_match` enforces. Offering a choice the RPC then rejects would
    // teach the owner that the control is unreliable, and the refusal it earns is the one
    // D-067 called the conservative end: a mismatched pairing takes a real payment off the
    // ledger with no audit row that makes the loss visible.
    const elsewhere = row({ id: "bbbbbbbb-0000-4000-8000-000000000009", account_id: SCB_ACCOUNT.id });
    const different = row({
      id: "bbbbbbbb-0000-4000-8000-00000000000a",
      source_components: [{ id: "cccccccc-0000-4000-8000-00000000000a", kind: "withdrawal", amount_minor: "-9001", currency: "THB" }]
    });
    expect(matchCandidates(slip(), [elsewhere, different], ACCOUNTS)).toEqual([]);
  });

  it("leaves out a row another slip's stored decision already claims, and keeps one the rule merely paired", () => {
    const claimed = row({ id: "bbbbbbbb-0000-4000-8000-00000000000b" });
    const free = row({ id: "bbbbbbbb-0000-4000-8000-00000000000c" });
    const other = slip({ id: "dddddddd-0000-4000-8000-00000000000b", slip_reference: "A00000000000000004" });
    const candidates = matchCandidates(slip(), [claimed, free], ACCOUNTS, [
      { slip_id: other.id, decision: "matched", transaction_id: claimed.id, revision: 1 }
    ]);
    // The partial unique index would refuse the claimed one (`statement row already claimed`).
    // The other is offered: taking a row the rule paired is a legitimate overrule, and the slip
    // that loses it becomes a visible provisional row rather than disappearing.
    expect(candidates.map((candidate) => candidate.id)).toEqual([free.id]);
  });

  it("keeps the slip's own decision from hiding the row it already names", () => {
    // Otherwise a decided slip could never be re-pointed at the row it is on, since its own
    // claim would exclude it — and the control would silently offer one row fewer than exists.
    const claimed = row({ id: "bbbbbbbb-0000-4000-8000-00000000000d" });
    const candidates = matchCandidates(slip(), [claimed], ACCOUNTS, [
      { slip_id: slip().id, decision: "matched", transaction_id: claimed.id, revision: 2 }
    ]);
    expect(candidates.map((candidate) => candidate.id)).toEqual([claimed.id]);
  });

  it("puts the nearest date first and orders the rest without ties", () => {
    const near = row({ id: "bbbbbbbb-0000-4000-8000-00000000000e", source_date: "2026-06-11" });
    const far = row({ id: "bbbbbbbb-0000-4000-8000-00000000000f", source_date: "2026-04-01" });
    const exact = row({ id: "bbbbbbbb-0000-4000-8000-000000000010", source_date: "2026-06-10" });
    const forward = matchCandidates(slip(), [far, near, exact], ACCOUNTS).map((candidate) => candidate.id);
    const reversed = matchCandidates(slip(), [exact, near, far], ACCOUNTS).map((candidate) => candidate.id);
    expect(forward).toEqual([exact.id, near.id, far.id]);
    // Order-independent, like every other result here. The ledger view re-sorts these into its
    // own order because they are shown as rows (D-069), so this is a property of the function
    // rather than of the screen — but a function that returned them in input order would make
    // any caller that does *not* re-sort quietly non-deterministic.
    expect(reversed).toEqual(forward);
  });

  it("returns every eligible row, however many share the amount", () => {
    // Bank plus exact amount is not selective on a round figure — a monthly transfer of the
    // same amount produces one candidate per month. They are shown as rows of the table, which
    // has no length problem, so none is withheld: a cap that hid the right row would be worse
    // than a long list, and the owner is choosing among records rather than reading a menu.
    const many = Array.from({ length: 40 }, (_, index) =>
      row({ id: `bbbbbbbb-0000-4000-8000-0000000${String(index).padStart(5, "1")}`, source_date: "2026-03-01" }));
    expect(matchCandidates(slip(), many, ACCOUNTS)).toHaveLength(40);
  });
});

describe("the write contract for a match decision", () => {
  const request = { expectedRevision: 0, decision: "matched" as const, transactionId: "bbbbbbbb-0000-4000-8000-000000000001" };

  it("requires the row to travel with the decision, in both directions", () => {
    // The table's CHECK and the RPC both require this; refusing it here means the form gets a
    // message it can show rather than a translated database error.
    expect(slipMatchRequestSchema.safeParse(request).success).toBe(true);
    expect(slipMatchRequestSchema.safeParse({ ...request, transactionId: null }).success).toBe(false);
    expect(slipMatchRequestSchema.safeParse({ expectedRevision: 1, decision: "unmatched", transactionId: null }).success).toBe(true);
    expect(slipMatchRequestSchema.safeParse({ expectedRevision: 1, decision: "unmatched", transactionId: request.transactionId }).success).toBe(false);
  });

  it("refuses a decision the database has no vocabulary for, and a revision that is not one", () => {
    expect(slipMatchRequestSchema.safeParse({ ...request, decision: "probably" }).success).toBe(false);
    expect(slipMatchRequestSchema.safeParse({ ...request, expectedRevision: -1 }).success).toBe(false);
    expect(slipMatchRequestSchema.safeParse({ ...request, expectedRevision: 1.5 }).success).toBe(false);
    expect(slipMatchRequestSchema.safeParse({ ...request, transactionId: "not-a-uuid" }).success).toBe(false);
  });

  it("refuses an unknown field rather than dropping it", () => {
    // Same reason the capture contract is strict: a client sending `slipId` in the body
    // believes it is naming the slip, and the route takes that from the path.
    expect(slipMatchRequestSchema.safeParse({ ...request, slipId: "dddddddd-0000-4000-8000-000000000001" }).success).toBe(false);
  });
});
