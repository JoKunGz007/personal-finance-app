import { z } from "zod";
import { BANK_CODES } from "@/lib/statement-frame";

// Wire contract for GET /api/v1/accounts, shared by the route's consumers and its
// tests. Column names stay as the database returns them, matching the other read
// endpoints. Nothing wider than the last four digits exists in the schema, so this
// list cannot carry a full account number.
export const ledgerAccountSchema = z.object({
  id: z.string().uuid(),
  bank_code: z.enum(BANK_CODES),
  label: z.string().min(1).max(120),
  account_type: z.enum(["savings", "current"]),
  last_four: z.string().regex(/^[0-9]{4}$/),
  currency: z.literal("THB"),
  timezone: z.literal("Asia/Bangkok")
}).strict();

export const accountListSchema = z.object({ accounts: z.array(ledgerAccountSchema) }).strict();

/**
 * The shape an account id has to have before it is worth sending anywhere — not proof the account
 * exists, only that a caller who typed it meant a uuid. Shared by `lib/statistics.ts`'s picker and
 * `app/transactions-view.tsx`'s own initial state, both of which read an `account` query parameter
 * off a URL that may have been hand-edited or followed from a link written before either surface
 * added the param, and both fall back to "no account chosen" on anything that fails it.
 */
export const ACCOUNT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

export type LedgerAccount = z.infer<typeof ledgerAccountSchema>;

// Wire contract for POST /api/v1/accounts. `currency` and `timezone` are absent on
// purpose: both are single-valued by CHECK constraint and are supplied by
// `public.mutate_account`, so there is nothing for a caller to get wrong or to disagree
// with the database about.
//
// The bank list comes from BANK_CODES, which is the same set the table's CHECK admits.
// That is one restatement, in the one place the client has to name a bank at all; the
// server never reads it back (D-041, GOTCHAS).
export const createAccountSchema = z.object({
  bank_code: z.enum(BANK_CODES),
  label: z.string().trim().min(1).max(120),
  account_type: z.enum(["savings", "current"]),
  last_four: z.string().regex(/^[0-9]{4}$/)
}).strict();

// Only the label. Every other column is identity: `bank_code` is hashed into every row
// fingerprint and `last_four` is what a statement binds against, so changing either would
// re-scope history already imported under the account.
export const relabelAccountSchema = z.object({
  id: z.string().uuid(),
  label: z.string().trim().min(1).max(120)
}).strict();

export type CreateAccountRequest = z.infer<typeof createAccountSchema>;
