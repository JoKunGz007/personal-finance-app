import { z } from "zod";
import { isoDateSchema } from "@/lib/dates";
import { minorUnitStringSchema } from "@/lib/money";
import { exactAverageSchema } from "@/lib/statistics";

/**
 * Wire contract for `GET /api/v1/deliveries/statistics`, which returns `public.delivery_statistics()`
 * verbatim (migrations 037 and 038, PLAN task 58).
 *
 * **These figures are never ledger totals**: every order and ride already reached the ledger as the
 * payment that made it. An order counts at its real cost, a co-payment order at the owner's share of
 * the wallet's food plus the rest (D-224, D-226; `lib/delivery-cost.ts`). Strict throughout, like `lib/receipt-statistics.ts`.
 */
export const deliveryStatisticsSchema = z.object({
  totals: z.object({
    orders: z.number().int().nonnegative(),
    spent: minorUnitStringSchema,
    averageSpent: exactAverageSchema.nullable(),
    firstDate: isoDateSchema.nullable(),
    lastDate: isoDateSchema.nullable(),
    deliveryFees: minorUnitStringSchema,
    discounts: minorUnitStringSchema,
    schemeOrders: z.number().int().nonnegative(),
    schemePaid: minorUnitStringSchema
  }).strict(),
  platforms: z.array(z.object({
    platform: z.enum(["grabfood", "lineman"]),
    orders: z.number().int().positive(),
    spent: minorUnitStringSchema
  }).strict()),
  restaurants: z.array(z.object({
    restaurant: z.string(),
    orders: z.number().int().positive(),
    spent: minorUnitStringSchema
  }).strict()),
  months: z.array(z.object({
    month: z.string().regex(/^\d{4}-\d{2}$/),
    orders: z.number().int().nonnegative(),
    spent: minorUnitStringSchema,
    rides: z.number().int().nonnegative(),
    rideSpent: minorUnitStringSchema
  }).strict()),
  rides: z.object({
    rides: z.number().int().nonnegative(),
    spent: minorUnitStringSchema,
    averageSpent: exactAverageSchema.nullable(),
    platformFees: minorUnitStringSchema
  }).strict(),
  rideTypes: z.array(z.object({
    rideType: z.string(),
    rides: z.number().int().positive(),
    spent: minorUnitStringSchema
  }).strict())
}).strict();

export type DeliveryStatistics = z.infer<typeof deliveryStatisticsSchema>;
