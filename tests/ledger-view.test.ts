import { describe, expect, it } from "vitest";
import type { LedgerAccount } from "@/lib/accounts";
import type { CapturedSlip } from "@/lib/slips";
import type { CashEntry } from "@/lib/cash";
import { emptyWindow, withPage, type LedgerWindow } from "@/lib/ledger-window";
import {
  applyReportingChange,
  createLedgerViewDeriver,
  deriveLedgerView,
  type LedgerChoosing,
  type LedgerViewData,
  type LedgerViewFilters
} from "@/lib/ledger-view";
import { cursorAfter, type AccountTransaction, type LedgerPage, type LedgerPageRow } from "@/lib/transactions";
import { ALL_ACCOUNTS, ALL_STATUSES } from "@/app/ledger-shared";

// The ledger view's derivation (D-293). Every value is invented, per docs/FIXTURE_POLICY.md.
// The tests call the shipped `deriveLedgerView`, not a hand-composed copy of its pipeline.

const ACCOUNT: LedgerAccount = {
  id: "aaaaaaaa-0000-4000-8000-000000000001",
  bank_code: "KTB", label: "Invented KTB", account_type: "savings",
  last_four: "4242", currency: "THB", timezone: "Asia/Bangkok"
};
const OTHER_ACCOUNT_ID = "aaaaaaaa-0000-4000-8000-000000000099";

function id(prefix: string, n: number) {
  return `${prefix}-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

function row(n: number, date: string, time: string, movement: string, balance: string, excluded = false): LedgerPageRow {
  return {
    id: id("bbbbbbbb", n),
    source_date: date,
    source_time: time,
    effective_date: date,
    transaction_label: "Invented label",
    description: "Invented description",
    reference: null,
    branch: null,
    post_balance_minor: balance,
    currency: "THB",
    source_components: [{ id: id("cccccccc", n), kind: movement.startsWith("-") ? "withdrawal" : "deposit", amount_minor: movement, currency: "THB" }],
    transaction_overlays: excluded ? [{
      category_id: null, description: null, counterparty: null, effective_date: null, note: null,
      include_in_reporting: false, revision: 2, updated_at: "2026-06-11T03:00:00Z"
    }] : [],
    category_source: null,
    category_source_revision: null,
    category_reviewed: false,
    category_parent_name: null,
    combined_balance_minor: balance
  };
}

/** A row held outside the window (a candidate or a chooser row), which carries its account itself. */
function outside(n: number, date: string, movement: string, balance: string): AccountTransaction {
  return { ...row(n, date, "10:00", movement, balance), account_id: ACCOUNT.id };
}

function slip(overrides: Partial<CapturedSlip> = {}): CapturedSlip {
  return {
    id: id("dddddddd", 1), bank_code: "KTB", slip_reference: "A00000000000000001", kind: "withdrawal",
    amount_minor: "-777", currency: "THB", occurred_on: "2026-06-10", occurred_at_time: "09:31",
    counterparty: "Invented payee", category_id: null, note: null, captured_at: "2026-06-10T02:31:00Z",
    ...overrides
  };
}

function cashEntry(overrides: Partial<CashEntry> = {}): CashEntry {
  return {
    id: id("eeeeeeee", 1), kind: "withdrawal", amount_minor: "-2500", currency: "THB",
    occurred_on: "2026-06-10", occurred_at_time: "12:15", counterparty: "Invented market stall",
    category_id: null, note: null, created_at: "2026-06-10T05:15:00Z",
    ...overrides
  };
}

const R1 = row(1, "2026-06-10", "09:31", "-9000", "491000");
// R2 is the marked duplicate: excluded from reporting, as a duplicate is (migration 062).
const R2 = row(2, "2026-06-10", "09:32", "-9000", "500000", true);
const R3 = row(3, "2026-06-10", "09:33", "-1500", "489500");

// Whole-account totals as the server would state them: older rows nobody loaded are in them.
const WHOLE: LedgerPage["totals"] = { rows: 7, deposits: "0", withdrawals: "-50000", net: "-50000" };

function windowOf(rows: LedgerPageRow[], totals = WHOLE): LedgerWindow {
  return withPage(emptyWindow(), ACCOUNT.id, { rows, hasMore: true, totals }, cursorAfter(rows));
}

const NO_CHOOSING: LedgerChoosing = { matching: null, matchingCard: null };

function dataOf(overrides: Partial<LedgerViewData> = {}): LedgerViewData {
  return {
    ledgerWindow: windowOf([R3, R2, R1]),
    candidates: [],
    accounts: [ACCOUNT],
    slips: [],
    matches: [],
    cash: [],
    cards: [],
    cardDecisions: [],
    duplicates: new Set(),
    chooserSet: { state: "idle" },
    ...overrides
  };
}

function filtersOf(overrides: Partial<LedgerViewFilters> = {}): LedgerViewFilters {
  return {
    selected: ALL_ACCOUNTS, query: "", status: ALL_STATUSES, order: "newest",
    groupByDay: true, showDuplicates: false,
    ...overrides
  };
}

describe("the totals strip (D-155)", () => {
  const withRecords = () => dataOf({ slips: [slip()], cash: [cashEntry()] });

  it("splices the whole account's totals with the records when nothing narrows the confirmed rows", () => {
    const { totals } = deriveLedgerView(withRecords(), filtersOf(), NO_CHOOSING);
    // 7 confirmed rows per the server, plus the slip and the cash entry; money is BigInt-exact.
    expect(totals.rows).toBe(9);
    expect(totals.deposits).toBe("0");
    expect(totals.withdrawals).toBe("-53277");
    expect(totals.net).toBe("-53277");
  });

  it("is over the visible rows once a query or a confirmed status narrows them", () => {
    const queried = deriveLedgerView(withRecords(), filtersOf({ query: "invented label" }), NO_CHOOSING);
    expect(queried.visibleRows).toHaveLength(3);
    expect(queried.totals.rows).toBe(3);
    // The excluded duplicate adds nothing, and the unloaded older rows are not in it.
    expect(queried.totals.withdrawals).toBe("-10500");
    expect(queried.totals.net).toBe("-10500");

    const confirmedOnly = deriveLedgerView(withRecords(), filtersOf({ status: "statement-only" }), NO_CHOOSING);
    expect(confirmedOnly.totals.rows).toBe(3);
    expect(confirmedOnly.totals.withdrawals).toBe("-10500");
  });

  it("does not splice for a record-only status either: any status filter makes it the on-screen figure", () => {
    const { totals, visibleRows } = deriveLedgerView(withRecords(), filtersOf({ status: "awaiting-statement" }), NO_CHOOSING);
    expect(visibleRows).toHaveLength(1);
    expect(totals.withdrawals).toBe("-777");
  });
});

describe("hiding marked duplicates (D-290)", () => {
  const duplicates: ReadonlySet<string> = new Set([R2.id]);
  const hidden = () => deriveLedgerView(dataOf({ duplicates }), filtersOf({ showDuplicates: false }), NO_CHOOSING);
  const shown = () => deriveLedgerView(dataOf({ duplicates }), filtersOf({ showDuplicates: true }), NO_CHOOSING);

  it("changes only the rows the table renders", () => {
    expect(hidden().shownRows).toHaveLength(2);
    expect(hidden().shownRows.some((r) => r.id === R2.id)).toBe(false);
    expect(shown().shownRows).toHaveLength(3);
    // The row the table does not render is still in the set everything else reads.
    expect(hidden().visibleRows).toHaveLength(3);
  });

  it("leaves totals, balance and the duplicate count untouched, in the spliced and the on-screen case", () => {
    expect(hidden().totals).toEqual(shown().totals);
    expect(hidden().balance).toEqual(shown().balance);
    expect(hidden().duplicateCount).toBe(1);
    expect(shown().duplicateCount).toBe(1);

    const queried = (showDuplicates: boolean) =>
      deriveLedgerView(dataOf({ duplicates }), filtersOf({ query: "invented", showDuplicates }), NO_CHOOSING);
    // Hiding is display only: the strip still counts the three rows the query selected.
    expect(queried(false).totals.rows).toBe(3);
    expect(queried(false).totals).toEqual(queried(true).totals);
    expect(queried(false).totals.net).toBe("-10500");
  });

  it("leaves every day's money identical, because a duplicate is excluded from reporting", () => {
    const money = (view: ReturnType<typeof hidden>) =>
      [...view.dayHeads!.values()].map((g) => [g.date, g.totals.deposits, g.totals.withdrawals, g.totals.net]);
    expect(money(hidden())).toEqual(money(shown()));
    // And no printed balance moved with the toggle.
    expect(hidden().balance).toEqual({ minor: "489500", date: "2026-06-10", combined: true });
  });
});

describe("filters never change what reconciled (D-063)", () => {
  // The slip pairs with R3 alone: its amount matches no other row.
  const paired = slip({ id: id("dddddddd", 2), amount_minor: "-1500" });
  const statusOfR3 = (filters: LedgerViewFilters) => {
    const view = deriveLedgerView(dataOf({ slips: [paired] }), filters, NO_CHOOSING);
    const reconciledRow = view.reconciled.rows.find((r) => r.id === R3.id);
    return { view, status: reconciledRow?.status, slip: reconciledRow?.kind === "confirmed" ? reconciledRow.slip?.id : undefined };
  };

  it("keeps a verified pair verified under an account, a query and a status filter", () => {
    const base = statusOfR3(filtersOf());
    expect(base.status).toBe("verified");
    expect(base.slip).toBe(paired.id);
    for (const filters of [
      filtersOf({ selected: OTHER_ACCOUNT_ID }),
      filtersOf({ query: "no such text anywhere" }),
      filtersOf({ status: "statement-only" }),
      filtersOf({ selected: ACCOUNT.id, query: "invented", status: "awaiting-statement" })
    ]) {
      const filtered = statusOfR3(filters);
      expect(filtered.status).toBe("verified");
      expect(filtered.slip).toBe(paired.id);
    }
    // The filter did hide the row; reconciliation did not notice.
    expect(statusOfR3(filtersOf({ status: "statement-only" })).view.visibleRows.some((r) => r.id === R3.id)).toBe(false);
  });
});

describe("candidates are evidence, not rows (D-063, D-158)", () => {
  it("reconciles over a row outside the window but never lists it", () => {
    const candidate = outside(10, "2026-05-01", "-777", "300000");
    const view = deriveLedgerView(
      dataOf({ candidates: [candidate], slips: [slip({ occurred_on: "2026-05-01" })] }),
      filtersOf(),
      NO_CHOOSING
    );
    const reconciledRow = view.reconciled.rows.find((r) => r.id === candidate.id);
    expect(reconciledRow?.status).toBe("verified");
    expect(view.visibleRows.some((r) => r.id === candidate.id)).toBe(false);
    expect(view.shownRows.some((r) => r.id === candidate.id)).toBe(false);
    // The slip collapsed onto the candidate, so it is not an unmatched row either.
    expect(view.visibleRows.some((r) => r.kind === "provisional")).toBe(false);
  });
});

describe("picking a match by hand (D-069, D-158)", () => {
  const chooserRow = outside(20, "2026-04-01", "-777", "250000");
  const picking = (filters: LedgerViewFilters, duplicates: ReadonlySet<string> = new Set()) =>
    deriveLedgerView(
      dataOf({ slips: [slip()], duplicates, chooserSet: { state: "ready", rows: [chooserRow] } }),
      filters,
      { matching: slip().id, matchingCard: null }
    );

  it("suspends the filters and the duplicate hiding, and drops the day headings", () => {
    const view = picking(
      filtersOf({ selected: OTHER_ACCOUNT_ID, query: "no such text anywhere", status: "cash", groupByDay: true }),
      new Set([R2.id])
    );
    expect(view.picking).toBe(true);
    // The slip and the one row it could be - which sits outside the loaded window - and nothing else.
    expect(view.visibleRows.map((r) => r.id).sort()).toEqual([slip().id, chooserRow.id].sort());
    expect(view.dayHeads).toBeNull();
    expect(view.showCombined).toBe(true);
    expect(view.layout.columns).toBe(7);
    expect(view.chooserState).toEqual({ state: "ready" });
    // A marked duplicate elsewhere in the ledger is not hidden in this view.
    expect(view.shownRows).toBe(view.visibleRows);
  });

  it("never offers a row marked as a duplicate", () => {
    const view = picking(filtersOf(), new Set([chooserRow.id]));
    expect(view.offered.size).toBe(0);
    expect(view.visibleRows.map((r) => r.id)).toEqual([slip().id]);
    // Not hidden a second time on the way to the table.
    expect(view.shownRows).toBe(view.visibleRows);
  });

  it("is not on when the id names no slip", () => {
    const view = deriveLedgerView(dataOf(), filtersOf(), { matching: slip().id, matchingCard: null });
    expect(view.picking).toBe(false);
    expect(view.dayHeads).not.toBeNull();
  });
});

describe("whether the ledger is empty (D-063)", () => {
  it("is not narrowed by the selected account", () => {
    const view = deriveLedgerView(dataOf(), filtersOf({ selected: OTHER_ACCOUNT_ID }), NO_CHOOSING);
    expect(view.reach).toEqual({ loaded: 0, total: 0 });
    expect(view.ledgerIsEmpty).toBe(false);
  });

  it("is true only for a loaded window that holds nothing, and false before the first load", () => {
    expect(deriveLedgerView(dataOf({ ledgerWindow: emptyWindow() }), filtersOf(), NO_CHOOSING).ledgerIsEmpty).toBe(true);
    expect(deriveLedgerView(dataOf({ ledgerWindow: null }), filtersOf(), NO_CHOOSING).ledgerIsEmpty).toBe(false);
  });

  it("flags a partial filter only while more rows can be loaded", () => {
    expect(deriveLedgerView(dataOf(), filtersOf({ query: "x" }), NO_CHOOSING).partialFilter).toBe(true);
    expect(deriveLedgerView(dataOf(), filtersOf(), NO_CHOOSING).partialFilter).toBe(false);
    const complete = withPage(emptyWindow(), ACCOUNT.id, { rows: [R3, R2, R1], hasMore: false, totals: { rows: 3, deposits: "0", withdrawals: "-10500", net: "-10500" } }, null);
    expect(deriveLedgerView(dataOf({ ledgerWindow: complete }), filtersOf({ query: "x" }), NO_CHOOSING).partialFilter).toBe(false);
  });
});

describe("the deriver's cache", () => {
  it("does not re-run reconciliation when only the query changes", () => {
    const derive = createLedgerViewDeriver();
    const data = dataOf({ slips: [slip()] });
    const first = derive(data, filtersOf(), NO_CHOOSING);
    const typed = derive(data, filtersOf({ query: "invented" }), NO_CHOOSING);
    expect(typed.reconciled).toBe(first.reconciled);
    expect(typed.visibleRows).not.toBe(first.visibleRows);
    // Identical inputs return the same view pieces, which is what keeps the row components stable.
    expect(derive(data, filtersOf({ query: "invented" }), NO_CHOOSING).visibleRows).toBe(typed.visibleRows);
    expect(derive(data, filtersOf(), NO_CHOOSING).layout).toBe(first.layout);
  });

  it("re-runs reconciliation when a decision changes", () => {
    const derive = createLedgerViewDeriver();
    const first = derive(dataOf(), filtersOf(), NO_CHOOSING);
    const decided = derive(dataOf({ matches: [{ slip_id: slip().id, decision: "unmatched", transaction_id: null, revision: 1 }] }), filtersOf(), NO_CHOOSING);
    expect(decided.reconciled).not.toBe(first.reconciled);
  });

  it("gives the same answer as an uncached derivation", () => {
    const derive = createLedgerViewDeriver();
    const data = dataOf({ slips: [slip()], cash: [cashEntry()] });
    derive(data, filtersOf({ query: "payee" }), NO_CHOOSING);
    const cached = derive(data, filtersOf({ status: "cash", order: "oldest" }), NO_CHOOSING);
    const fresh = deriveLedgerView(data, filtersOf({ status: "cash", order: "oldest" }), NO_CHOOSING);
    expect(cached.visibleRows.map((r) => r.id)).toEqual(fresh.visibleRows.map((r) => r.id));
    expect(cached.totals).toEqual(fresh.totals);
  });
});

describe("applyReportingChange (server reporting rules, D-207 / D-290)", () => {
  const plain = { autoExcluded: false, duplicate: false };
  it("Include on an auto-excluded row clears the auto-exclusion", () => {
    expect(applyReportingChange({ autoExcluded: true, duplicate: false }, "include")).toEqual(plain);
  });
  it("Include on a duplicate-marked row clears the mark", () => {
    expect(applyReportingChange({ autoExcluded: false, duplicate: true }, "include")).toEqual(plain);
  });
  it("Exclude on a duplicate-marked row keeps the mark", () => {
    expect(applyReportingChange({ autoExcluded: false, duplicate: true }, "exclude")).toEqual({ autoExcluded: false, duplicate: true });
  });
  it("Exclude on an auto-excluded row makes it the owner's", () => {
    expect(applyReportingChange({ autoExcluded: true, duplicate: false }, "exclude")).toEqual(plain);
  });
  it("Exclude on a plain row adds no mark", () => {
    expect(applyReportingChange(plain, "exclude")).toEqual(plain);
  });
  it("Mark as duplicate sets the mark and clears auto-exclusion", () => {
    expect(applyReportingChange(plain, "duplicate")).toEqual({ autoExcluded: false, duplicate: true });
    expect(applyReportingChange({ autoExcluded: true, duplicate: false }, "duplicate")).toEqual({ autoExcluded: false, duplicate: true });
  });
});
