import { describe, expect, it } from "vitest";
import type { LedgerAccount } from "@/lib/accounts";
import type { CapturedSlip } from "@/lib/slips";
import type { AccountTransaction, LedgerTransaction } from "@/lib/transactions";
import {
  MATCH_WINDOW_DAYS,
  compareRows,
  proposeSlipMatches,
  reconcileLedger,
  slipAccount,
  summarizeRows
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
    import_batch_rows: [],
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

const ACCOUNTS = [KTB_ACCOUNT, SCB_ACCOUNT];

describe("matching a slip to a statement row", () => {
  it("matches on bank, exact amount and a date inside the window", () => {
    const matches = proposeSlipMatches([row()], [slip()], ACCOUNTS);
    expect(matches.bySlip.get(slip().id)).toBe(row().id);
    expect(matches.byTransaction.get(row().id)?.id).toBe(slip().id);
    expect(matches.needsReview.size).toBe(0);
  });

  it("matches across the window's edge and refuses one day beyond it", () => {
    // A transfer made late posts the next working day, so the window is real rather than
    // generous — but it is a hard edge, not a slope.
    const inside = proposeSlipMatches([row({ source_date: "2026-06-13" })], [slip({ occurred_on: "2026-06-10" })], ACCOUNTS);
    expect(inside.bySlip.size).toBe(1);
    expect(MATCH_WINDOW_DAYS).toBe(3);

    const outside = proposeSlipMatches([row({ source_date: "2026-06-14" })], [slip({ occurred_on: "2026-06-10" })], ACCOUNTS);
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

  // Measured rather than assumed: over 1,465 real rows, taking every candidate inside the
  // window leaves 16.3% of rows ambiguous, and preferring the nearest date takes that to 6.5%
  // — the same-day floor. The window's tolerance therefore costs nothing.
  it("prefers the nearest date instead of treating everything in the window as equal", () => {
    const matches = proposeSlipMatches(
      [
        row(), // the slip's own day
        row({ id: "bbbbbbbb-0000-4000-8000-000000000002", source_date: "2026-06-12" })
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
    // Two slips, one on the row's day and one three days off, and a single row. The near slip
    // takes it; the far one is left awaiting rather than both being called ambiguous.
    const near = slip();
    const far = slip({ id: "dddddddd-0000-4000-8000-000000000007", occurred_on: "2026-06-13", slip_reference: "A00000000000000007" });
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
    expect(summarizeRows(rows)).toEqual({ rows: 1, deposits: "0", withdrawals: "-9000", net: "-9000", provisional: 0 });
  });

  it("counts an unmatched slip as money that moved, and says it is provisional", () => {
    const { rows } = reconcileLedger([row()], [slip({ occurred_on: "2026-06-20", amount_minor: "-2500", slip_reference: "A00000000000000003" })], ACCOUNTS);
    expect(summarizeRows(rows)).toEqual({ rows: 2, deposits: "0", withdrawals: "-11500", net: "-11500", provisional: 1 });
  });

  it("adds a deposit slip to deposits, with its sign respected", () => {
    const { rows } = reconcileLedger([], [slip({ kind: "deposit", amount_minor: "45000" })], ACCOUNTS);
    expect(summarizeRows(rows)).toEqual({ rows: 1, deposits: "45000", withdrawals: "0", net: "45000", provisional: 1 });
  });

  it("stays exact past 2^53", () => {
    // Money is BigInt here as everywhere else. Asserted alongside proof the loss would be real.
    const huge = "9007199254740993";
    const { rows } = reconcileLedger([], [slip({ kind: "deposit", amount_minor: huge })], ACCOUNTS);
    expect(summarizeRows(rows).net).toBe(huge);
    expect(String(Number(huge))).not.toBe(huge);
  });

  it("is empty and zero for an empty ledger rather than failing", () => {
    expect(summarizeRows([])).toEqual({ rows: 0, deposits: "0", withdrawals: "0", net: "0", provisional: 0 });
  });
});
