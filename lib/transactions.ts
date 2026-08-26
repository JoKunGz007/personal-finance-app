import { z } from "zod";
import { isoDateSchema } from "@/lib/dates";
import { minorUnitStringSchema, type MinorUnitString } from "@/lib/money";
import type { CapturedSlip } from "@/lib/slips";
import type { CashEntry } from "@/lib/cash";
import type { NotificationCard } from "@/lib/notification-cards";

// Wire contract for GET /api/v1/accounts/[id]/transactions, which returns
// `public.list_account_transactions_page` verbatim — a page object rather than a bare
// array, since migration 021 (D-158). Column names stay as the database returns them,
// matching the other read endpoints (lib/accounts.ts).
//
// Money arrives as text because the RPC casts every bigint with `::text`. Parsing it
// into a number here would be the one place a float could enter the read path, so
// the schema accepts canonical integer strings only and every derivation below is
// BigInt. A balance past 2^53 minor units is not reachable at this scale, but the
// rule is structural rather than sized: nothing in this app turns money into a
// double, and a read path is where that habit would first slip.

export const ledgerComponentSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(["deposit", "withdrawal"]),
  amount_minor: minorUnitStringSchema,
  currency: z.literal("THB")
}).strict();

// `to_jsonb(o) - 'owner_id' - 'transaction_id'` yields exactly the remaining
// columns of public.transaction_overlays. Strict on purpose: a migration that adds
// a column should fail this parse loudly rather than have the view quietly ignore
// a field the ledger now considers part of an overlay.
export const transactionOverlaySchema = z.object({
  category_id: z.string().uuid().nullable(),
  description: z.string().nullable(),
  counterparty: z.string().nullable(),
  effective_date: isoDateSchema.nullable(),
  note: z.string().nullable(),
  include_in_reporting: z.boolean(),
  revision: z.number().int().nonnegative(),
  updated_at: z.string()
}).strict();

/**
 * One confirmed row as the ledger view reads it.
 *
 * **`import_batch_rows` and `fingerprint` are both deliberately absent, and `.strict()` is what
 * keeps them absent.** `list_account_transactions` still builds both — changing the RPC needs a
 * migration — so `app/api/v1/accounts/[id]/transactions/route.ts` drops them from the response
 * instead. Each was parsed here and read by nothing: no component, no reconciliation, no total.
 *
 * `import_batch_rows` measured **241 of 848 bytes, 28.4%** of the object (PLAN task 43, D-155).
 * `fingerprint` is 64 hex characters plus its key, about **80 of the ~584 bytes** a row costs
 * after that trim — roughly **14%** more, on a field the ledger has never displayed.
 *
 * **Dropping it from the wire is not dropping the column**, which stays exactly as it was:
 * `source_transactions.fingerprint` is `not null`, format-checked, and carries
 * `unique (owner_id, account_id, fingerprint)` — the constraint that makes re-importing a
 * statement idempotent. `private.row_fingerprint` still recomputes it on every confirm and
 * `confirm_import` still refuses a row whose claim disagrees, and `export_backup_snapshot`
 * still emits it, so the backup contract is unchanged. What ends here is only the habit of
 * shipping a server-side identity to a screen that never reads it.
 *
 * If the route ever regresses and sends either again, this parse fails by name rather than
 * quietly paying for it, which is the same reason the overlay object is strict.
 */
export const ledgerTransactionSchema = z.object({
  id: z.string().uuid(),
  source_date: isoDateSchema,
  source_time: z.string().nullable(),
  effective_date: isoDateSchema,
  transaction_label: z.string(),
  description: z.string(),
  reference: z.string().nullable(),
  branch: z.string().nullable(),
  post_balance_minor: minorUnitStringSchema,
  currency: z.literal("THB"),
  source_components: z.array(ledgerComponentSchema),
  transaction_overlays: z.array(transactionOverlaySchema)
}).strict();

export type LedgerTransaction = z.infer<typeof ledgerTransactionSchema>;

/** A transaction carrying the account it was read from, for the merged view. */
export type AccountTransaction = LedgerTransaction & { account_id: string };

/**
 * How many rows one page of an account's ledger holds.
 *
 * **The route decides this, not the caller.** A page size that arrived on the query string would
 * hand back the unbounded read migration 021 exists to end; the database clamps it as well, which
 * is the invariant, and this is the number the app actually asks for.
 *
 * 100 rather than a round guess: at roughly 584 bytes a row it puts a page near 50 KB, against the
 * ~785 KB a whole visit cost before paging. Deeper pages are one press and cost the same again.
 */
export const LEDGER_PAGE_SIZE = 100;

/**
 * One page of an account's ledger, as `list_account_transactions_page` returns it.
 *
 * **It deliberately carries no balance.** A draft returned the balance walked into the page,
 * because task 45 predicted `combinedBalanceByTransaction` would otherwise seed from the wrong
 * row; it does not, and the field was removed rather than kept as a cross-check that could raise a
 * false alarm about money. What the merged view needs is a different fact and is derived from
 * window depth — `combinedBalanceFloor` in `lib/ledger-window.ts`.
 *
 * `totals` are **whole-account and unpaged**. A total over a page would answer a question nobody
 * asked, and the strip above the ledger has always meant "this ledger", not "this screenful".
 */
export const ledgerPageSchema = z.object({
  rows: z.array(ledgerTransactionSchema),
  hasMore: z.boolean(),
  totals: z.object({
    rows: z.number().int().nonnegative(),
    deposits: minorUnitStringSchema,
    withdrawals: minorUnitStringSchema,
    net: minorUnitStringSchema
  }).strict()
}).strict();

export type LedgerPage = z.infer<typeof ledgerPageSchema>;

/**
 * A candidate carries its own account, because nobody named one on its behalf.
 *
 * A page is fetched per account, so its rows inherit the account the caller asked for. The
 * candidate set spans every account at once — that is what makes it able to answer a question
 * about the whole ledger — so the account has to travel on the row.
 */
export const matchCandidateSchema = ledgerTransactionSchema.extend({
  account_id: z.string().uuid()
}).strict();

export const matchCandidateListSchema = z.object({
  candidates: z.array(matchCandidateSchema)
}).strict();

/**
 * The cursor identifying the last row a caller already holds.
 *
 * All three parts travel together — `source_time` may legitimately be null, so it is the one part
 * whose absence means a position rather than a missing value. Null when there is no page yet.
 */
export type LedgerCursor = { beforeDate: string; beforeTime: string | null; beforeId: string };

/** The cursor that continues after a page, or null when the page was the end of the ledger. */
export function cursorAfter(page: readonly LedgerTransaction[]): LedgerCursor | null {
  const last = page[page.length - 1];
  if (last === undefined) return null;
  return { beforeDate: last.source_date, beforeTime: last.source_time, beforeId: last.id };
}

/**
 * Net movement of a row: components already carry their sign (deposits positive,
 * withdrawals negative, enforced by componentSchema and by the database), so the
 * sum is the movement and no per-kind branching is needed.
 */
export function movementMinor(transaction: LedgerTransaction): MinorUnitString {
  const total = transaction.source_components.reduce((sum, component) => sum + BigInt(component.amount_minor), 0n);
  return total.toString() as MinorUnitString;
}

export type TransactionTotals = {
  rows: number;
  deposits: MinorUnitString;
  withdrawals: MinorUnitString;
  net: MinorUnitString;
};

export function summarize(transactions: readonly LedgerTransaction[]): TransactionTotals {
  let deposits = 0n;
  let withdrawals = 0n;
  for (const transaction of transactions) {
    for (const component of transaction.source_components) {
      const amount = BigInt(component.amount_minor);
      if (component.kind === "deposit") deposits += amount;
      else withdrawals += amount;
    }
  }
  return {
    rows: transactions.length,
    deposits: deposits.toString() as MinorUnitString,
    withdrawals: withdrawals.toString() as MinorUnitString,
    net: (deposits + withdrawals).toString() as MinorUnitString
  };
}

/**
 * Mirrors the RPC's `order by t.source_date desc, t.source_time desc nulls last, t.id`.
 *
 * The merged all-accounts view is several single-account responses concatenated, so
 * it has to re-sort in the browser; using the same comparator keeps one account's
 * rows in the order the database would have produced them. `nulls last` is explicit
 * because PostgreSQL puts nulls *first* under `desc` by default, which is the
 * opposite of what a reader expects from an untimed row.
 */
export function compareTransactions(a: LedgerTransaction, b: LedgerTransaction): number {
  if (a.source_date !== b.source_date) return a.source_date < b.source_date ? 1 : -1;
  if (a.source_time !== b.source_time) {
    if (a.source_time === null) return 1;
    if (b.source_time === null) return -1;
    return a.source_time < b.source_time ? 1 : -1;
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * The balance across every account in scope, after each row.
 *
 * A merged list needs a total that means something at each row, and it is exactly
 * determined: an account's balance before its first imported row is that row's
 * printed balance minus its own movement, so every account has a known balance at
 * every point, including dates before its statement begins. Walking the merged list
 * oldest-first and replacing one account's balance at a time gives the combined
 * figure after each row.
 *
 * Keyed by transaction id, which is a primary key, so the map is total.
 *
 * Pass the whole account scope, never a text-filtered subset: the combined balance
 * is a fact about the ledger at that row, not about the rows a search happened to
 * match. Filtering first would produce a running total of an arbitrary selection.
 *
 * An account holding no transactions at all contributes nothing and cannot: there is
 * no row to derive an opening from. The caller is expected to say how many accounts
 * are in that state rather than let the total quietly stand for all of them.
 *
 * ## Paging did not change this rule, and the reason is worth writing down
 *
 * PLAN task 45 predicted that paging would break this: seeded from the newest N rows it would
 * "seed from the wrong row and every figure on screen would be wrong". **That prediction was
 * wrong, and `tests/ledger-window.test.ts` is what showed it.** `post_balance − movement` is a
 * fact about the row itself — the balance immediately *before* it — and it is that whichever row
 * it happens to be. Handed a window, the seed is the balance carried into the window, exactly,
 * with no help from anyone.
 *
 * So this function is unchanged by paging and takes no new argument. What the server's
 * `carriedBalance` is used for instead is checking that claim rather than replacing it: see
 * `openingDisagreements` in `lib/ledger-window.ts`. A figure this can derive and the database can
 * also state is worth comparing, because a disagreement means the window skipped a row.
 */
export function combinedBalanceByTransaction(
  transactions: readonly AccountTransaction[]
): Map<string, MinorUnitString> {
  const byAccount = new Map<string, AccountTransaction[]>();
  for (const transaction of transactions) {
    const rows = byAccount.get(transaction.account_id);
    if (rows) rows.push(transaction);
    else byAccount.set(transaction.account_id, [transaction]);
  }

  const balances = new Map<string, bigint>();
  for (const [accountId, rows] of byAccount) {
    const first = [...rows].sort((a, b) => -compareTransactions(a, b))[0]!;
    balances.set(accountId, BigInt(first.post_balance_minor) - BigInt(movementMinor(first)));
  }

  const combined = new Map<string, MinorUnitString>();
  for (const row of [...transactions].sort((a, b) => -compareTransactions(a, b))) {
    balances.set(row.account_id, BigInt(row.post_balance_minor));
    let total = 0n;
    for (const balance of balances.values()) total += balance;
    combined.set(row.id, total.toString() as MinorUnitString);
  }
  return combined;
}

// The merged-entry helpers that briefly lived here (D-062) moved to `lib/slip-reconcile.ts`
// when matching arrived a few hours later (D-063): a ledger row is no longer "a transaction
// or a slip" but "a payment, evidenced by one record or two", and the module that decides
// which is the one that should own the type.

/**
 * Client-side text filter. This searches the fields a person would recognise a row by,
 * and deliberately not any id — a server-verified identity is not something anyone types
 * into a search box, and matching one would surface rows by an internal value.
 *
 * The fingerprint used to be excluded here by the same reasoning; it is now excluded by not
 * being on the wire at all, which is the stronger form of the same rule.
 */
export function matchesQuery(transaction: LedgerTransaction, query: string): boolean {
  const needle = query.trim().toLocaleLowerCase();
  if (needle === "") return true;
  const overlay = transaction.transaction_overlays[0];
  const haystack = [
    transaction.transaction_label,
    transaction.description,
    transaction.reference,
    transaction.branch,
    overlay?.description ?? null,
    overlay?.counterparty ?? null
  ];
  return haystack.some((field) => field !== null && field.toLocaleLowerCase().includes(needle));
}

/**
 * The same filter over a slip. A slip has no description or branch — what identifies it is
 * the reference the QR carried, the counterparty the owner typed, and the bank. The note is
 * searched too, since it is the only free text a slip has.
 */
export function matchesSlipQuery(slip: CapturedSlip, query: string): boolean {
  const needle = query.trim().toLocaleLowerCase();
  if (needle === "") return true;
  const haystack = [slip.slip_reference, slip.counterparty, slip.note, slip.bank_code];
  return haystack.some((field) => field !== null && field.toLocaleLowerCase().includes(needle));
}

/**
 * The same filter over a cash entry, which has less to search than either of the others.
 *
 * No description, no bank, no reference: a cash payment has no statement and no QR behind it,
 * so the counterparty and the note the owner typed are the only text it carries. That is a
 * property of the record rather than a gap to fill later — there is nothing else to add.
 */
export function matchesCashQuery(entry: CashEntry, query: string): boolean {
  const needle = query.trim().toLocaleLowerCase();
  if (needle === "") return true;
  const haystack = [entry.counterparty, entry.note];
  return haystack.some((field) => field !== null && field.toLocaleLowerCase().includes(needle));
}

/**
 * The same filter over a notification card.
 *
 * A card has no reference to search — no layout prints one, which is the whole reason migration
 * 016 identifies a card by a fingerprint the database computes. What it does carry that the
 * others do not is the **channel** it came from and the **digits it printed**, so both are
 * searched: the channel is how the owner thinks of the card ("the KBank one"), and the digits are
 * what he can read off the screenshot when he is looking for a particular card.
 */
export function matchesCardQuery(card: NotificationCard, query: string): boolean {
  const needle = query.trim().toLocaleLowerCase();
  if (needle === "") return true;
  const haystack = [card.counterparty, card.note, card.channel, card.printed_account_digits];
  return haystack.some((field) => field !== null && field.toLocaleLowerCase().includes(needle));
}
