import { z } from "zod";
import { isoDateSchema } from "@/lib/dates";
import { minorUnitStringSchema, type MinorUnitString } from "@/lib/money";
import type { CapturedSlip } from "@/lib/slips";
import type { CashEntry } from "@/lib/cash";

// Wire contract for GET /api/v1/accounts/[id]/transactions, which returns
// `public.list_account_transactions` verbatim. Column names stay as the database
// returns them, matching the other read endpoints (lib/accounts.ts).
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

export const importBatchRowSchema = z.object({
  batch_id: z.string().uuid(),
  source_index: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  row_number: z.number().int().positive(),
  parser_fields: z.unknown(),
  linked_existing: z.boolean()
}).strict();

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
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  source_components: z.array(ledgerComponentSchema),
  import_batch_rows: z.array(importBatchRowSchema),
  transaction_overlays: z.array(transactionOverlaySchema)
}).strict();

export const transactionListSchema = z.object({
  transactions: z.array(ledgerTransactionSchema)
}).strict();

export type LedgerTransaction = z.infer<typeof ledgerTransactionSchema>;

/** A transaction carrying the account it was read from, for the merged view. */
export type AccountTransaction = LedgerTransaction & { account_id: string };

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
 * Client-side text filter. Per-account server-side filtering does not exist and is
 * not worth adding at this scale (PLAN task 17); this searches the fields a person
 * would recognise a row by, and deliberately not the fingerprint or any id.
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
