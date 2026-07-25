import { z } from "zod";

// Wire contract for GET /api/v1/accounts, shared by the route's consumers and its
// tests. Column names stay as the database returns them, matching the other read
// endpoints. Nothing wider than the last four digits exists in the schema, so this
// list cannot carry a full account number.
export const ledgerAccountSchema = z.object({
  id: z.string().uuid(),
  bank_code: z.literal("KTB"),
  label: z.string().min(1).max(120),
  account_type: z.enum(["savings", "current"]),
  last_four: z.string().regex(/^[0-9]{4}$/),
  currency: z.literal("THB"),
  timezone: z.literal("Asia/Bangkok")
}).strict();

export const accountListSchema = z.object({ accounts: z.array(ledgerAccountSchema) }).strict();

export type LedgerAccount = z.infer<typeof ledgerAccountSchema>;
