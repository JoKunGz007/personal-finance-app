import { z } from "zod";
import { isoDateSchema } from "@/lib/dates";
import { minorUnitStringSchema } from "@/lib/money";
import { exactAverageSchema } from "@/lib/statistics";

/**
 * Wire contract for `GET /api/v1/receipts/statistics`, which returns `public.receipt_statistics()`
 * verbatim (migration 031, PLAN task 56).
 *
 * **These figures are never ledger totals.** A receipt itemizes money the ledger already holds, so
 * nothing here is added to anything on `/ledger` or `/statistics`. Strict throughout, like
 * `lib/statistics.ts`: every money field is a minor-unit string, and a new field fails by name.
 */
const itemStatisticSchema = z.object({
  name: z.string(),
  quantity: z.number().int().positive(),
  spend: minorUnitStringSchema,
  receipts: z.number().int().positive()
}).strict();

export const receiptStatisticsSchema = z.object({
  totals: z.object({
    receipts: z.number().int().nonnegative(),
    net: minorUnitStringSchema,
    averageNet: exactAverageSchema.nullable(),
    firstDate: isoDateSchema.nullable(),
    lastDate: isoDateSchema.nullable(),
    // Receipts whose item list is not trusted: their net counts above, their items count nowhere.
    partialReceipts: z.number().int().nonnegative(),
    units: z.number().int().nonnegative(),
    itemSpend: minorUnitStringSchema,
    discounts: minorUnitStringSchema
  }).strict(),
  months: z.array(z.object({
    month: z.string().regex(/^\d{4}-\d{2}$/),
    receipts: z.number().int().positive(),
    net: minorUnitStringSchema
  }).strict()),
  mostBought: z.array(itemStatisticSchema),
  mostSpent: z.array(itemStatisticSchema),
  paymentMethods: z.array(z.object({
    // Null when no form read carried a payment line (a receipt read only from a full invoice).
    method: z.string().nullable(),
    receipts: z.number().int().positive(),
    net: minorUnitStringSchema
  }).strict()),
  branches: z.array(z.object({
    storeCode: z.string(),
    branchName: z.string(),
    receipts: z.number().int().positive(),
    net: minorUnitStringSchema
  }).strict())
}).strict();

export type ReceiptStatistics = z.infer<typeof receiptStatisticsSchema>;
