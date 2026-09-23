// The wire contract for food delivery orders (PLAN task 58, migration 032).
//
// Unlike receipts, no order is posted by the page: the server reads the e-receipt email, parses
// it and captures it itself (`app/api/v1/deliveries/sync/route.ts`). The page posts only the
// owner's match decision (`lib/delivery-match.ts`).
// This module holds the capture request the server builds, the stored shape the list returns, and
// the sync report.

import { z } from "zod";
import { minorUnitStringSchema } from "@/lib/money";
import type { ParsedDelivery } from "@/lib/delivery-grab";
import { deliveryMatchStateSchema } from "@/lib/delivery-match";

/** The `capture_delivery` request: camelCase keys, money as canonical int64 text. */
export function captureDeliveryRequest(order: ParsedDelivery) {
  return {
    platform: order.platform,
    bookingId: order.bookingId,
    restaurant: order.restaurant,
    paymentMethod: order.paymentMethod,
    receiptSentAt: order.receiptSentAt,
    foodMinor: order.foodMinor,
    deliveryFeeMinor: order.deliveryFeeMinor,
    totalMinor: order.totalMinor,
    items: order.items.map((item) => ({
      position: item.position, quantity: item.quantity, name: item.name, options: item.options, amountMinor: item.amountMinor
    })),
    adjustments: order.adjustments.map((row) => ({ position: row.position, kind: row.kind, name: row.name, amountMinor: row.amountMinor }))
  };
}

export const storedDeliverySchema = z.object({
  id: z.string().uuid(),
  platform: z.literal("grabfood"),
  booking_id: z.string(),
  restaurant: z.string(),
  payment_method: z.string().nullable(),
  receipt_sent_at: z.string(),
  food_minor: minorUnitStringSchema,
  delivery_fee_minor: minorUnitStringSchema.nullable(),
  total_minor: minorUnitStringSchema,
  items: z.array(z.object({
    position: z.number().int(),
    quantity: z.number().int(),
    name: z.string(),
    options: z.array(z.string()),
    amount_minor: minorUnitStringSchema
  }).strict()),
  adjustments: z.array(z.object({
    position: z.number().int(),
    kind: z.enum(["discount", "charge", "unprinted"]),
    name: z.string(),
    amount_minor: minorUnitStringSchema
  }).strict()),
  match: deliveryMatchStateSchema
}).strict();

export type StoredDelivery = z.infer<typeof storedDeliverySchema>;

export const deliveryListSchema = z.object({ deliveries: z.array(storedDeliverySchema) }).strict();

/**
 * A ฿0 order was paid outside the platform — the co-payment scheme prints the whole food price as
 * a discount (`docs/DELIVERY_CONTRACT.md`). Never a free meal, and never matched to a card row.
 */
export function paidOutsidePlatform(delivery: Pick<StoredDelivery, "total_minor">): boolean {
  return delivery.total_minor === "0";
}

/** What one sync did, in counts only: nothing here names a dish, a restaurant or an amount. */
/**
 * Each ledger row's order, keyed by transaction id, for `/ledger`'s fold (D-220, as D-216 does for
 * receipts): only orders matched automatically or linked by the owner. One row holds at most one
 * order (migration 033's partial unique index and the rule's mutual uniqueness).
 */
export function deliveriesOnRows(deliveries: readonly StoredDelivery[]): [string, StoredDelivery][] {
  return deliveries.flatMap((delivery) =>
    (delivery.match.status === "matched" || delivery.match.status === "linked") && delivery.match.row
      ? [[delivery.match.row.transaction_id, delivery] as [string, StoredDelivery]]
      : []);
}

export const deliverySyncReportSchema = z.object({
  /** Messages whose unread receipts were examined this run. */
  messages: z.number().int().nonnegative(),
  captured: z.number().int().nonnegative(),
  /** Food receipts for an order already stored: a forward and a backfill of one order, or a re-read. */
  alreadyStored: z.number().int().nonnegative(),
  rides: z.number().int().nonnegative(),
  /** Bodies that are neither template (a bundle's own cover note, a cancelled-order mail). */
  notReceipts: z.number().int().nonnegative(),
  refused: z.record(z.string(), z.number().int().nonnegative()),
  /** More mail is waiting than one request could read; the page asks again. */
  truncated: z.boolean()
}).strict();

export type DeliverySyncReport = z.infer<typeof deliverySyncReportSchema>;

export function describeSyncReport(report: DeliverySyncReport): string {
  const refused = Object.values(report.refused).reduce((sum, count) => sum + count, 0);
  const parts = [
    `${report.captured} new order${report.captured === 1 ? "" : "s"}`,
    `${report.alreadyStored} already stored`,
    `${report.rides} ride receipt${report.rides === 1 ? "" : "s"} skipped`
  ];
  if (refused > 0) parts.push(`${refused} not read`);
  return `${parts.join(", ")}.`;
}
