import type { MinorUnitString } from "@/lib/money";
import type { RowStatus } from "@/lib/slip-reconcile";
import {
  compareTransactions,
  type AccountTransaction,
  type LedgerCursor,
  type LedgerPage,
  type TransactionTotals
} from "@/lib/transactions";

/**
 * The ledger the client is holding, one account at a time.
 *
 * Before PLAN task 45 the client held every confirmed row of every account, so "the ledger" and
 * "what is loaded" were the same set and nothing had to name the difference. Paged, they are not,
 * and **every question that used to be answered by looking at the array has to say which of the
 * two it means**. That is what this module exists to make explicit rather than incidental:
 *
 *   * the **window** is what is loaded — contiguous, newest-first, per account, and it grows;
 *   * the **totals** are whole-account facts the server computed over rows nobody fetched;
 *   * the **carried balance** is what the window cannot derive about itself;
 *   * the **candidates** are rows outside the window that reconciliation still has to see.
 *
 * Keeping the window per account rather than as one merged list is what makes "load more" honest
 * with several accounts on screen. Each account has its own cursor, so a deeper page is the next
 * page *of that account*; merging first and paging the merge would need a cursor the server has no
 * way to answer.
 */
export type AccountWindow = {
  rows: AccountTransaction[];
  /** Whole-account and unpaged, as the server computed it. Never a total over the window. */
  totals: TransactionTotals;
  cursor: LedgerCursor | null;
  hasMore: boolean;
};

export type LedgerWindow = { byAccount: Map<string, AccountWindow> };

export function emptyWindow(): LedgerWindow {
  return { byAccount: new Map() };
}

const NO_TOTALS: TransactionTotals = {
  rows: 0,
  deposits: "0" as MinorUnitString,
  withdrawals: "0" as MinorUnitString,
  net: "0" as MinorUnitString
};

/**
 * Adds one page to the window.
 *
 * Rows are appended rather than merged: the server returns them in the ledger's own order and
 * every page continues where the cursor left off, so a page is never out of sequence with the one
 * before it. `cursorAfter` is not re-derived here because the caller already read it off the page
 * it fetched.
 */
export function withPage(
  window: LedgerWindow,
  accountId: string,
  page: LedgerPage,
  cursor: LedgerCursor | null
): LedgerWindow {
  const held = window.byAccount.get(accountId);
  const rows = page.rows.map((row) => ({ ...row, account_id: accountId }));
  const byAccount = new Map(window.byAccount);
  byAccount.set(accountId, {
    rows: held ? [...held.rows, ...rows] : rows,
    totals: page.totals,
    cursor,
    hasMore: page.hasMore
  });
  return { byAccount };
}

/** The account ids in scope: one, or every account the window holds. */
function scopeIds(window: LedgerWindow, accountId: string | null): string[] {
  if (accountId !== null) return window.byAccount.has(accountId) ? [accountId] : [];
  return [...window.byAccount.keys()];
}

/** Every row loaded for the accounts in scope, in the ledger's own order. */
export function windowRows(window: LedgerWindow, accountId: string | null): AccountTransaction[] {
  const rows = scopeIds(window, accountId).flatMap((id) => window.byAccount.get(id)?.rows ?? []);
  return rows.sort(compareTransactions);
}

/**
 * The oldest date at which the **combined** balance is exactly known, or null when it is known
 * everywhere.
 *
 * ## The defect this exists to close, which is subtler than the one task 45 predicted
 *
 * `combinedBalanceByTransaction` seeds each account from `post_balance − movement` of the oldest
 * row it was handed. **Per account that is exact at any window depth** — the expression is the
 * balance immediately before whatever row it is applied to, so task 45's predicted breakage does
 * not happen and the server needs to tell us nothing.
 *
 * **The merged view is where it goes wrong, and that is the only view rendering the column.** The
 * combined figure at a row is the sum of *every* account's balance at that moment, and the walk
 * supplies an account's seed for every row older than that account's oldest held row. Unpaged the
 * seed is the account's true opening, so that is right. Paged it is the account's balance
 * somewhere in the middle of its history, and every earlier row in the merged list is then summed
 * against a balance from that account's future.
 *
 * Concretely, with A loaded to its opening and B windowed to its newest row: a January row of A is
 * printed with B's July balance added in. Pressing "Load older rows" re-seeds B deeper and the
 * figure printed against a row already on screen silently changes.
 *
 * ## What is knowable, stated as a date
 *
 * An account's balance at a row is known when the account has a held row at or before it — or when
 * its window is **complete**, in which case its seed really is its opening and holds arbitrarily
 * far back. So each account with more to fetch contributes a floor of its oldest held row's date,
 * and the combined figure is exact at and after the newest of those floors. Below it the answer is
 * **not shown at all**, because a running total that quietly means something else is exactly what
 * this task exists to prevent.
 */
export function combinedBalanceFloor(window: LedgerWindow, accountId: string | null): string | null {
  let floor: string | null = null;
  for (const id of scopeIds(window, accountId)) {
    const held = window.byAccount.get(id);
    // A complete window seeds from the account's real opening, which is valid at any date.
    if (held == null || !held.hasMore || held.rows.length === 0) continue;
    const oldest = [...held.rows].sort((a, b) => -compareTransactions(a, b))[0]!;
    if (floor === null || oldest.source_date > floor) floor = oldest.source_date;
  }
  return floor;
}

/**
 * The whole-ledger confirmed totals for the accounts in scope — **not** a total over the window.
 *
 * Summed from per-account figures the server computed, which is exact for the same reason the
 * per-account figures are: every term is a `bigint` of minor units and nothing here divides.
 */
export function scopeTotals(window: LedgerWindow, accountId: string | null): TransactionTotals {
  let rows = 0;
  let deposits = 0n;
  let withdrawals = 0n;
  for (const id of scopeIds(window, accountId)) {
    const totals = window.byAccount.get(id)?.totals ?? NO_TOTALS;
    rows += totals.rows;
    deposits += BigInt(totals.deposits);
    withdrawals += BigInt(totals.withdrawals);
  }
  return {
    rows,
    deposits: deposits.toString() as MinorUnitString,
    withdrawals: withdrawals.toString() as MinorUnitString,
    net: (deposits + withdrawals).toString() as MinorUnitString
  };
}

/** How many confirmed rows of the scope are loaded, against how many exist. */
export function windowReach(window: LedgerWindow, accountId: string | null): { loaded: number; total: number } {
  const ids = scopeIds(window, accountId);
  return {
    loaded: ids.reduce((sum, id) => sum + (window.byAccount.get(id)?.rows.length ?? 0), 0),
    total: ids.reduce((sum, id) => sum + (window.byAccount.get(id)?.totals.rows ?? 0), 0)
  };
}

/** Whether any account in scope has a page left to fetch. */
export function hasDeeperPage(window: LedgerWindow, accountId: string | null): boolean {
  return scopeIds(window, accountId).some((id) => window.byAccount.get(id)?.hasMore === true);
}

/**
 * Every account **in scope** with a page left, and the cursor that fetches it.
 *
 * Scoped rather than global, because the reach line above the control counts the selected account
 * only. An unscoped loop would deepen windows that line is not describing — and, since window depth
 * decides where the combined balance is knowable (`combinedBalanceFloor`), it would also move
 * figures on a view the owner is not looking at.
 */
export function deeperPages(
  window: LedgerWindow,
  accountId: string | null
): Array<{ accountId: string; cursor: LedgerCursor | null }> {
  return scopeIds(window, accountId)
    .map((id) => ({ accountId: id, held: window.byAccount.get(id)! }))
    .filter(({ held }) => held.hasMore)
    .map(({ accountId: id, held }) => ({ accountId: id, cursor: held.cursor }));
}

/**
 * What reconciliation runs over: every row loaded, plus every candidate, deduplicated.
 *
 * **Never the page alone, and this is the load-bearing line of the whole task.** `reconcileLedger`
 * decides a slip's status by how many rows it could be — one is a pairing, two is `needs-review`.
 * Handed a page, a slip whose second candidate is off-page sees one row and pairs with it, so the
 * ledger renders `verified` where the truth is that the owner has never been asked. That is a
 * wrong answer about money, not a slow one, and it is exactly what D-063 refuses.
 *
 * The union is deduplicated by id because a candidate is very often also on the page — it is the
 * newest rows that are most likely to be awaiting a slip — and a row appearing twice would be
 * counted twice in every total that walks this list.
 *
 * **Scope is deliberately ignored here.** Reconciliation runs across every account before any
 * filter, for the same reason it always has: a match is a fact about two records, not about what
 * is on screen, and narrowing first would let choosing an account unmatch a pair.
 */
export function reconciliationRows(
  window: LedgerWindow,
  candidates: readonly AccountTransaction[]
): AccountTransaction[] {
  const byId = new Map<string, AccountTransaction>();
  for (const held of window.byAccount.values()) {
    for (const row of held.rows) byId.set(row.id, row);
  }
  for (const candidate of candidates) {
    if (!byId.has(candidate.id)) byId.set(candidate.id, candidate);
  }
  return [...byId.values()].sort(compareTransactions);
}

/** The ids the window actually holds, so a candidate pulled in as evidence is not shown as a row. */
export function windowIds(window: LedgerWindow): Set<string> {
  const ids = new Set<string>();
  for (const held of window.byAccount.values()) {
    for (const row of held.rows) ids.add(row.id);
  }
  return ids;
}

/**
 * Which population a status can appear in — and the reason the status filter never needed SQL.
 *
 * The six statuses partition cleanly, and each half of the partition has a different and
 * separately easy answer under paging:
 *
 *   * `awaiting-statement`, `needs-review`, `balance-conflict` and `cash` belong only to
 *     **records** — slips, cards and cash entries. Those are few, fetched whole, and never paged,
 *     so filtering to any of them is a complete answer with no page involved at all.
 *   * `verified` and `statement-only` belong only to **confirmed rows**, which is the population
 *     that pages. Only these two had a problem to solve.
 *
 * And those two resolve asymmetrically. `verified` needs no page either: a row can only be
 * verified if some slip or card claimed it, so every verified row in the ledger is in the
 * candidate set by construction, and the complete answer is already in hand. `statement-only` is
 * the bulk — the whole ledger less a small set — so it pages, which is the right behaviour for it
 * and the only one of the six where the window's depth is visible to the owner.
 */
export const STATUS_POPULATION: Record<RowStatus, "confirmed" | "record"> = {
  verified: "confirmed",
  "statement-only": "confirmed",
  "awaiting-statement": "record",
  "needs-review": "record",
  "balance-conflict": "record",
  cash: "record"
};

/**
 * Whether filtering to this status yields a complete answer from what is loaded.
 *
 * **True only for the record statuses**, and the earlier, more generous version of this was a
 * defect. It also called `verified` complete, on the reasoning that every verified row is in the
 * candidate set and so is already in hand. That is true of the *reconciliation*, and false of the
 * *table*: a confirmed row outside the window is filtered out of the display — it has to be, since
 * its combined balance is not knowable there — so a slip matched to a row three pages down produces
 * a `verified` row the owner cannot see, under a line telling him the answer was complete.
 *
 * The four record statuses are genuinely complete: slips, cards and cash entries are fetched whole
 * and never page, so nothing about them is hidden at any window depth.
 */
export function statusIsComplete(status: RowStatus): boolean {
  return STATUS_POPULATION[status] === "record";
}
