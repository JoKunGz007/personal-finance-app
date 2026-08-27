import { describe, expect, it } from "vitest";
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
  STATUS_POPULATION
} from "@/lib/ledger-window";
import {
  cursorAfter,
  type AccountTransaction,
  type LedgerPage,
  type LedgerPageRow,
  type LedgerTransaction,
  type TransactionOverlay
} from "@/lib/transactions";

// The window a paged ledger is read through (PLAN task 45, migration 021).
//
// Every value is invented, per docs/FIXTURE_POLICY.md. The fixture below is a ledger of five rows
// arranged so that its *middle* is a page boundary — which is the only arrangement that can tell a
// correct carried balance from a plausible one.

const ACCOUNT_A = "aaaaaaaa-0000-4000-8000-000000000001";
const ACCOUNT_B = "aaaaaaaa-0000-4000-8000-000000000002";

function row(
  id: string,
  date: string,
  time: string | null,
  movement: string,
  postBalance: string,
  // Page rows carry the whole ledger's balance at them since migration 022. These fixtures are
  // about the window's own bookkeeping, so the value only has to be present and canonical.
  combined = postBalance
): LedgerPageRow {
  return {
    id,
    source_date: date,
    source_time: time,
    effective_date: date,
    transaction_label: "Invented label",
    description: "Invented description",
    reference: null,
    branch: null,
    post_balance_minor: postBalance,
    currency: "THB",
    source_components: [{
      id: `cccccccc-0000-4000-8000-${id.slice(-12)}`,
      kind: movement.startsWith("-") ? "withdrawal" : "deposit",
      amount_minor: movement,
      currency: "THB"
    }],
    transaction_overlays: [],
    combined_balance_minor: combined
  };
}

// Account A, opening 100000:
//   tx3 (07-01, untimed)  -30000 ->  70000   <- oldest
//   tx1 (07-01, 09:00)    +50000 -> 120000
//   tx2 (07-01, 10:00)    -20000 -> 100000
//   tx4 (07-02, 08:00)    +10000 -> 110000
//   tx5 (07-03, untimed)   -5000 -> 105000   <- newest
const TX1 = row("dddddddd-0000-4000-8000-000000000001", "2026-07-01", "09:00", "50000", "120000");
const TX2 = row("dddddddd-0000-4000-8000-000000000002", "2026-07-01", "10:00", "-20000", "100000");
const TX3 = row("dddddddd-0000-4000-8000-000000000003", "2026-07-01", null, "-30000", "70000");
const TX4 = row("dddddddd-0000-4000-8000-000000000004", "2026-07-02", "08:00", "10000", "110000");
const TX5 = row("dddddddd-0000-4000-8000-000000000005", "2026-07-03", null, "-5000", "105000");

const A_TOTALS: LedgerPage["totals"] = { rows: 5, deposits: "60000", withdrawals: "-55000", net: "5000" };

function page(rows: LedgerPageRow[], hasMore: boolean, totals = A_TOTALS): LedgerPage {
  return { rows, hasMore, totals };
}

/** The first page of account A: its two newest rows. */
const A_PAGE_1 = page([TX5, TX4], true);
const A_PAGE_2 = page([TX2, TX1], true);
/** The third reaches the account's opening, so nothing is left to fetch. */
const A_PAGE_3 = page([TX3], false);

function windowOfA(...pages: LedgerPage[]) {
  let held = emptyWindow();
  for (const one of pages) held = withPage(held, ACCOUNT_A, one, cursorAfter(one.rows));
  return held;
}

describe("the window grows without losing what it knew", () => {
  it("appends a page rather than replacing what is held", () => {
    const held = windowOfA(A_PAGE_1, A_PAGE_2);
    expect(windowRows(held, ACCOUNT_A).map((r) => r.id)).toEqual([TX5.id, TX4.id, TX2.id, TX1.id]);
  });

  it("reports how much of the ledger is loaded against how much exists", () => {
    expect(windowReach(windowOfA(A_PAGE_1), ACCOUNT_A)).toEqual({ loaded: 2, total: 5 });
    expect(windowReach(windowOfA(A_PAGE_1, A_PAGE_2, A_PAGE_3), ACCOUNT_A)).toEqual({ loaded: 5, total: 5 });
  });

  it("knows when a deeper page exists and which cursor fetches it", () => {
    const held = windowOfA(A_PAGE_1);
    expect(hasDeeperPage(held, ACCOUNT_A)).toBe(true);
    expect(deeperPages(held, null)).toEqual([{
      accountId: ACCOUNT_A,
      cursor: { beforeDate: "2026-07-02", beforeTime: "08:00", beforeId: TX4.id }
    }]);
    expect(hasDeeperPage(windowOfA(A_PAGE_1, A_PAGE_2, A_PAGE_3), ACCOUNT_A)).toBe(false);
  });

  // An untimed row is a real cursor position rather than a missing value, so the cursor carries
  // null and `nulls last` is what makes it unambiguous on the server.
  it("carries a null time in the cursor rather than omitting the row", () => {
    expect(cursorAfter([TX4, TX5])).toEqual({ beforeDate: "2026-07-03", beforeTime: null, beforeId: TX5.id });
    expect(cursorAfter([])).toBeNull();
  });

  // Scoped, so pressing "load more" with one account selected does not deepen the others — their
  // depth is what decides where the merged balance is knowable, so it is not a free change.
  it("offers a deeper page only for the account in scope", () => {
    let held = windowOfA(A_PAGE_1);
    held = withPage(held, ACCOUNT_B, page([TX5], true, A_TOTALS), cursorAfter([TX5]));
    expect(deeperPages(held, null)).toHaveLength(2);
    expect(deeperPages(held, ACCOUNT_A)).toEqual([{
      accountId: ACCOUNT_A,
      cursor: { beforeDate: "2026-07-02", beforeTime: "08:00", beforeId: TX4.id }
    }]);
  });

  it("merges several accounts into the ledger's own order", () => {
    const other = page([row("eeeeeeee-0000-4000-8000-000000000001", "2026-07-02", "09:00", "-20000", "300000")],
      false, { rows: 1, deposits: "0", withdrawals: "-20000", net: "-20000" });
    let held = windowOfA(A_PAGE_1);
    held = withPage(held, ACCOUNT_B, other, cursorAfter(other.rows));
    expect(windowRows(held, null).map((r) => r.source_date))
      .toEqual(["2026-07-03", "2026-07-02", "2026-07-02"]);
    expect(windowRows(held, ACCOUNT_B)).toHaveLength(1);
  });
});

describe("totals are whole-account facts, never totals over the window", () => {
  it("reports the server's figure however little is loaded", () => {
    expect(scopeTotals(windowOfA(A_PAGE_1), ACCOUNT_A)).toEqual({
      rows: 5, deposits: "60000", withdrawals: "-55000", net: "5000"
    });
  });

  it("sums across accounts exactly, and net is a sum rather than a difference", () => {
    const other = page([row("eeeeeeee-0000-4000-8000-000000000001", "2026-07-02", "09:00", "-20000", "300000")],
      false, { rows: 1, deposits: "0", withdrawals: "-20000", net: "-20000" });
    let held = windowOfA(A_PAGE_1);
    held = withPage(held, ACCOUNT_B, other, cursorAfter(other.rows));
    const totals = scopeTotals(held, null);
    expect(totals).toEqual({ rows: 6, deposits: "60000", withdrawals: "-75000", net: "-15000" });
    expect(BigInt(totals.net)).toBe(BigInt(totals.deposits) + BigInt(totals.withdrawals));
  });
});

/*
 * Two suites stood here on 2026-08-27 and are gone with what they tested. The first held that the
 * per-account walk was exact at any window depth, which was true; the second held the **floor** that
 * hid the merged figure where a per-account window could not know it, which was correct and, on the
 * real ledger, blanked most of the column. Migration 022 computes the combined balance in SQL over
 * every account, so there is no client derivation left to test and no unknowable range left to name.
 * `supabase/tests/010_combined_balance.sql` carries the cases, including the merged one that failed
 * here — two accounts of unequal window depth.
 */

describe("reconciliation sees more than the page", () => {
  // A candidate carries no combined balance — it is evidence for the matching rule and is never
  // displayed, so the field is stripped here rather than left over from the page fixture.
  const candidate = (r: LedgerPageRow): AccountTransaction => {
    const rest: Record<string, unknown> = { ...r };
    delete rest.combined_balance_minor;
    return { ...(rest as LedgerTransaction), account_id: ACCOUNT_A };
  };

  it("unions the window with the candidates", () => {
    const rows = reconciliationRows(windowOfA(A_PAGE_1), [candidate(TX1)]);
    expect(rows.map((r) => r.id)).toEqual([TX5.id, TX4.id, TX1.id]);
  });

  /**
   * A candidate is very often also on the page — the newest rows are the ones most likely to be
   * awaiting a slip — and a row appearing twice would be counted twice by every total that walks
   * this list.
   */
  it("deduplicates a candidate that is already on the page", () => {
    const rows = reconciliationRows(windowOfA(A_PAGE_1), [candidate(TX4), candidate(TX5)]);
    expect(rows).toHaveLength(2);
  });

  /**
   * **A page that repeats a row cannot reach the table, and that was found by trying.**
   *
   * The keyset predicate was deliberately broken to `<=` at the date boundary, which makes the
   * second page re-return the row the cursor named. The end-to-end paging spec went on passing,
   * because everything the table renders comes through this union and the union is keyed by id.
   * So the dedup is not tidiness — it is what stands between a boundary bug and a row counted
   * twice in every total. Asserted here, at the level that actually holds it.
   *
   * The same break is *not* absorbed in the other direction: a page that skips a row loses it for
   * good, which is why the e2e spec asserts the count and the reach line rather than trusting this.
   */
  it("shows a row once when two pages both carry it", () => {
    let held = withPage(emptyWindow(), ACCOUNT_A, A_PAGE_1, cursorAfter(A_PAGE_1.rows));
    held = withPage(held, ACCOUNT_A, page([TX4, TX2, TX1], false), null);
    expect(reconciliationRows(held, []).map((r) => r.id)).toEqual([TX5.id, TX4.id, TX2.id, TX1.id]);
  });

  it("distinguishes what is held from what was only consulted", () => {
    const held = windowIds(windowOfA(A_PAGE_1));
    expect(held.has(TX4.id)).toBe(true);
    expect(held.has(TX1.id)).toBe(false);
  });
});

describe("the status partition, which is why the filter never needed SQL", () => {
  /**
   * The claim the whole design rests on: only two of the six statuses can appear on a confirmed
   * row, and those are the only two the paging of confirmed rows could affect. The other four
   * belong to records that are fetched whole and never paged.
   */
  it("puts exactly two statuses on the paged population", () => {
    const confirmed = Object.entries(STATUS_POPULATION)
      .filter(([, population]) => population === "confirmed")
      .map(([status]) => status);
    expect(confirmed.sort()).toEqual(["statement-only", "verified"]);
  });

  /**
   * **`verified` is not complete, and calling it complete was a defect.** Every verified row is in
   * the candidate set, so *reconciliation* sees them all — but a confirmed row outside the window
   * is filtered out of the *table*, because its merged balance is not knowable there. So a slip
   * matched to a row three pages down produces a verified row the owner cannot see, and the older
   * version of this told him the answer was complete anyway.
   */
  it("calls a status complete only when its records never page", () => {
    expect(statusIsComplete("awaiting-statement")).toBe(true);
    expect(statusIsComplete("needs-review")).toBe(true);
    expect(statusIsComplete("balance-conflict")).toBe(true);
    expect(statusIsComplete("cash")).toBe(true);
    expect(statusIsComplete("verified")).toBe(false);
    expect(statusIsComplete("statement-only")).toBe(false);
  });
});

/**
 * PLAN task 48 — folding a stored overlay back onto its row.
 *
 * **The totals are the reason this is not a one-line state update.** `list_account_transactions_page`
 * sums components under `coalesce(o.include_in_reporting, true)` since migration 023, so the strip
 * above the ledger is a figure the server computed with the flag applied. Replace the overlay and
 * stop, and the strip states a number the rows on screen now contradict — with no reload to blame
 * it on, because the whole point of folding is that there is no reload.
 */
describe("an overlay folded back onto its row", () => {
  function overlay(includeInReporting: boolean, fields: Partial<TransactionOverlay> = {}): TransactionOverlay {
    return {
      category_id: null,
      description: null,
      counterparty: null,
      effective_date: null,
      note: null,
      include_in_reporting: includeInReporting,
      revision: 1,
      updated_at: "2026-07-04T03:00:00Z",
      ...fields
    };
  }

  it("puts the stored overlay on the row it belongs to and on no other", () => {
    const held = withOverlay(windowOfA(A_PAGE_1), TX5.id, overlay(false, { note: "Invented note" }));
    const rows = windowRows(held, ACCOUNT_A);
    expect(rows.find((r) => r.id === TX5.id)?.transaction_overlays).toEqual([overlay(false, { note: "Invented note" })]);
    expect(rows.find((r) => r.id === TX4.id)?.transaction_overlays).toEqual([]);
  });

  // TX5 is a withdrawal of -5000. Excluding it takes exactly that out of `withdrawals` and nothing
  // out of `deposits` — the same arithmetic the server does, over the same component set.
  it("takes an excluded withdrawal out of the account's withdrawals and out of nothing else", () => {
    const held = withOverlay(windowOfA(A_PAGE_1), TX5.id, overlay(false));
    expect(scopeTotals(held, ACCOUNT_A)).toEqual({
      rows: 5,
      deposits: "60000",
      withdrawals: "-50000",
      net: "10000"
    });
  });

  // TX4 is a deposit of +10000, and it moves the other bucket. Both directions are asserted
  // because a sign error is invisible in one of them.
  it("takes an excluded deposit out of the account's deposits", () => {
    const held = withOverlay(windowOfA(A_PAGE_1), TX4.id, overlay(false));
    expect(scopeTotals(held, ACCOUNT_A)).toEqual({
      rows: 5,
      deposits: "50000",
      withdrawals: "-55000",
      net: "-5000"
    });
  });

  // The round trip is exact, which is what "no division anywhere" buys: every term is a bigint of
  // minor units, so out-and-back is the identity rather than nearly the identity.
  it("puts an excluded row back exactly when it is included again", () => {
    const excluded = withOverlay(windowOfA(A_PAGE_1), TX5.id, overlay(false));
    const restored = withOverlay(excluded, TX5.id, overlay(true, { revision: 2 }));
    expect(scopeTotals(restored, ACCOUNT_A)).toEqual(A_TOTALS);
  });

  // **The guard against double-counting.** A second write that does not move the flag — the shape
  // every future field editor has, since they all replace the whole overlay — must not touch the
  // totals. Written as two consecutive exclusions because that is the failure it catches: an
  // implementation subtracting unconditionally passes the single-toggle case above.
  it("does not move the totals when the flag did not change", () => {
    const once = withOverlay(windowOfA(A_PAGE_1), TX5.id, overlay(false));
    const twice = withOverlay(once, TX5.id, overlay(false, { revision: 2, note: "Invented note" }));
    expect(scopeTotals(twice, ACCOUNT_A)).toEqual(scopeTotals(once, ACCOUNT_A));
    expect(scopeTotals(twice, ACCOUNT_A).withdrawals).toBe("-50000");
  });

  // The row count is the one figure that does not move, and the migration says so in its own
  // words: it states how many rows the account holds, not how many are reported on, and the paging
  // cursor walks all of them.
  it("leaves the row count alone, because the server does not filter it either", () => {
    const held = withOverlay(windowOfA(A_PAGE_1), TX5.id, overlay(false));
    expect(scopeTotals(held, ACCOUNT_A).rows).toBe(5);
    expect(windowReach(held, ACCOUNT_A)).toEqual({ loaded: 2, total: 5 });
  });

  // Both buckets move for a compound row, because the server sums components rather than rows.
  it("moves both buckets for a row with a deposit and a withdrawal component", () => {
    const compound: LedgerPageRow = {
      ...row("dddddddd-0000-4000-8000-000000000009", "2026-07-04", "09:00", "40000", "145000"),
      source_components: [
        { id: "cccccccc-0000-4000-8000-000000000091", kind: "deposit", amount_minor: "70000", currency: "THB" },
        { id: "cccccccc-0000-4000-8000-000000000092", kind: "withdrawal", amount_minor: "-30000", currency: "THB" }
      ]
    };
    const totals: LedgerPage["totals"] = { rows: 1, deposits: "70000", withdrawals: "-30000", net: "40000" };
    const held = withOverlay(
      withPage(emptyWindow(), ACCOUNT_A, page([compound], false, totals), null),
      compound.id,
      overlay(false)
    );
    expect(scopeTotals(held, ACCOUNT_A)).toEqual({ rows: 1, deposits: "0", withdrawals: "0", net: "0" });
  });

  // Scoping. Another account's figures are its own, and a merged view sums them — so an overlay
  // reaching across accounts would move a number nobody touched.
  it("touches only the account holding the row, with a merged view watching", () => {
    const bTotals: LedgerPage["totals"] = { rows: 1, deposits: "0", withdrawals: "-5000", net: "-5000" };
    const bRow = row("eeeeeeee-0000-4000-8000-000000000001", "2026-07-05", "09:00", "-5000", "20000");
    let held = windowOfA(A_PAGE_1);
    held = withPage(held, ACCOUNT_B, page([bRow], false, bTotals), null);
    const after = withOverlay(held, TX5.id, overlay(false));
    expect(scopeTotals(after, ACCOUNT_B)).toEqual(bTotals);
    expect(scopeTotals(after, null)).toEqual({
      rows: 6,
      deposits: "60000",
      withdrawals: "-55000",
      net: "5000"
    });
  });

  // Unreachable from the UI — a toggle can only be pressed on a rendered row — so it is the shape
  // that says "nothing to fold" rather than a case worth reporting.
  it("returns the window unchanged for a row it does not hold", () => {
    const held = windowOfA(A_PAGE_1);
    expect(withOverlay(held, TX1.id, overlay(false))).toBe(held);
  });
});
