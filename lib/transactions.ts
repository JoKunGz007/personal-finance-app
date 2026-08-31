import { z } from "zod";
import { appendRange, type DateRange } from "@/lib/date-range";
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

export type TransactionOverlay = z.infer<typeof transactionOverlaySchema>;

/**
 * What `PUT /api/v1/transactions/[id]/overlay` answers with.
 *
 * The same shape the ledger already reads on a row, and that is not a coincidence: the route
 * strips `owner_id` and `transaction_id` from the RPC's `to_jsonb(o)` for exactly this reason,
 * so a stored overlay can be folded back into the window without a second contract.
 */
export const overlayWriteResponseSchema = z.object({ overlay: transactionOverlaySchema }).strict();

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

/**
 * One row **of a page**, which carries the combined balance the whole ledger had at it.
 *
 * Only a page row has it. A candidate is fetched as evidence for the matching rule and is never
 * displayed, so computing a combined balance for one would be work nobody reads — and the field
 * being absent there is what keeps that distinction structural rather than remembered.
 */
export const ledgerPageRowSchema = ledgerTransactionSchema.extend({
  combined_balance_minor: minorUnitStringSchema
}).strict();

export type LedgerPageRow = z.infer<typeof ledgerPageRowSchema>;

/**
 * A transaction carrying the account it was read from, for the merged view.
 *
 * `combined_balance_minor` is optional because this type covers both populations: rows from a page
 * carry it, candidates do not. The table only ever renders rows it holds in the window, so the
 * optionality is never reached on screen.
 */
export type AccountTransaction = LedgerTransaction & {
  account_id: string;
  combined_balance_minor?: MinorUnitString;
};

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
 * **Every row carries its own `combined_balance_minor`** (migration 022), which is what the client
 * cannot derive once the ledger pages: the combined figure is a fact about *every* account at that
 * moment, and a per-account window has no way to know a different account's balance further back
 * than its own rows reach.
 *
 * `totals` are **whole-account and unpaged**. A total over a page would answer a question nobody
 * asked, and the strip above the ledger has always meant "this ledger", not "this screenful".
 */
export const ledgerPageSchema = z.object({
  rows: z.array(ledgerPageRowSchema),
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
 * The query string for one page request: the window, then the cursor inside it.
 *
 * **Both travel on every deeper page, and forgetting the window on the second one is the defect
 * this function exists to make impossible.** A cursor sent without its bounds walks out of the
 * window the owner selected and returns rows from outside it, so the table grows rows the line
 * above it says are not there. They were built at two separate call sites before this — the first
 * page and the "load older rows" press — which is exactly the shape that lets one of them drift.
 *
 * `beforeTime` is omitted when null rather than sent blank, because an untimed row is a real cursor
 * position and the route's pattern rejects `""`; the range omits its open ends for the same reason
 * (`appendRange`).
 */
export function ledgerPageSearch(range: DateRange, cursor: LedgerCursor | null): string {
  const params = new URLSearchParams();
  appendRange(params, range);
  if (cursor !== null) {
    params.set("beforeDate", cursor.beforeDate);
    params.set("beforeId", cursor.beforeId);
    if (cursor.beforeTime !== null) params.set("beforeTime", cursor.beforeTime);
  }
  const query = params.toString();
  return query === "" ? "" : `?${query}`;
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

/**
 * The overlay fields a caller may change, in the wire's own spelling.
 *
 * Deliberately **not** `revision` or `updated_at`: both are the database's to set, and a shape
 * that let a caller name them would invite a client that thinks it knows the next revision.
 */
export type OverlayFields = {
  readonly description: string | null;
  readonly counterparty: string | null;
  readonly effectiveDate: string | null;
  readonly categoryId: string | null;
  readonly note: string | null;
  readonly includeInReporting: boolean;
};

/**
 * Exactly the body `PUT /api/v1/transactions/[id]/overlay` accepts — **defined here rather than in
 * the route** so that the builder below and the thing that validates it cannot drift apart.
 *
 * The route imports this. A test can therefore assert that `overlayWriteBody`'s output satisfies
 * the real contract, which is the only assertion that is worth anything: `.strict()` means a
 * missing key and an extra key are both refusals, so "the builder produces something reasonable"
 * and "the route accepts it" are different claims and only the second one matters.
 */
export const overlayWriteBodySchema = z.object({
  expectedRevision: z.number().int().nonnegative(),
  description: z.string().trim().max(500).nullable(),
  counterparty: z.string().trim().max(240).nullable(),
  effectiveDate: isoDateSchema.nullable(),
  categoryId: z.string().uuid().nullable(),
  note: z.string().trim().max(2000).nullable(),
  includeInReporting: z.boolean()
}).strict();

/** Exactly the body `PUT /api/v1/transactions/[id]/overlay` accepts. Its schema is `.strict()`. */
export type OverlayWriteBody = OverlayFields & { readonly expectedRevision: number };

/**
 * The overlay in force on a row, as the wire spells it — and the default one where a row has none.
 *
 * A row with no overlay is not a row with an empty overlay from the database's point of view: the
 * table has no entry for it, so `revision` is **0**, which is what `update_transaction_overlay`'s
 * optimistic concurrency compares against to mean *"I believe none exists"*. Every other field is
 * null, and `include_in_reporting` is `true`, matching the column default and the
 * `coalesce(o.include_in_reporting, true)` every reader in migration 023 applies.
 */
export function overlayInForce(transaction: LedgerTransaction): OverlayFields & { readonly revision: number } {
  const overlay = transaction.transaction_overlays[0];
  return {
    description: overlay?.description ?? null,
    counterparty: overlay?.counterparty ?? null,
    effectiveDate: overlay?.effective_date ?? null,
    categoryId: overlay?.category_id ?? null,
    note: overlay?.note ?? null,
    includeInReporting: overlay?.include_in_reporting ?? true,
    revision: overlay?.revision ?? 0
  };
}

/**
 * The body for changing **part** of a row's overlay, built from the whole overlay it already has.
 *
 * **This exists because the endpoint takes the whole overlay and `update_transaction_overlay`
 * writes it with `on conflict do update set` over every column.** A control that sent only the
 * field it changes is refused — the route's schema is `.strict()` and every key is required — and
 * a control that sent the rest as `null` would be *accepted*, silently erasing the description,
 * counterparty, effective date, category and note the owner had typed on a row he was only trying
 * to mark. The second failure is the dangerous one because it looks like a success.
 *
 * So the body is never assembled by a caller. It is derived from the row, and `change` may only
 * narrow that derivation — which makes the hazard structural rather than something each new
 * control has to remember. The next field editor gets the guarantee for free.
 *
 * `expectedRevision` comes from the same place for the same reason: the revision that belongs to
 * the overlay being replaced is the only one the database will accept.
 */
export function overlayWriteBody(
  transaction: LedgerTransaction,
  change: Partial<OverlayFields>
): OverlayWriteBody {
  const { revision, ...fields } = overlayInForce(transaction);
  return { ...fields, ...change, expectedRevision: revision };
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

/*
 * `combinedBalanceByTransaction` lived here until 2026-08-27 and is **deliberately gone**, not
 * mislaid. It walked the rows the client held and seeded each account from `post_balance −
 * movement` of the oldest one — exact per account at any depth, and wrong for the merged figure
 * the moment the ledger paged, because it then seeded a shallow account from the middle of its
 * own history. A floor was shipped first, suppressing the column where it could not be known;
 * on the real ledger that blanked most of the screen, because the largest of three accounts sets
 * the floor.
 *
 * `private.combined_balances` (migration 022) is the one implementation now, and every page row
 * arrives carrying `combined_balance_minor`. Keeping this function as well would be two answers
 * to one question about money, which is the shape D-120 refused for the matching rule and is no
 * better here. PLAN task 44 wants the same series for its charts and calls the same function.
 */

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
