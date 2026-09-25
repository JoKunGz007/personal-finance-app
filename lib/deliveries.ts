// The wire contract for food delivery orders and Grab rides (PLAN task 58, migrations 032 and 034).
//
// A GrabFood order is never posted by the page: the server reads the e-receipt email, parses it
// and captures it itself (`app/api/v1/deliveries/sync/route.ts`). A LINE MAN order is read from
// screenshots on the device and posted as its parse (`POST /api/v1/deliveries`, D-223), as a
// 7-Eleven screenshot receipt is. The page also posts the owner's match decision.
// This module holds the capture request the server builds, the stored shape the list returns, and
// the sync report.

import { z } from "zod";
import { minorUnitStringSchema } from "@/lib/money";
import type { ParsedDelivery, ParsedRide } from "@/lib/delivery-grab";
import type { ParsedLinemanOrder } from "@/lib/delivery-lineman";
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

/** The `capture_delivery` request for a LINE MAN order (migration 036): no send time, an order time and a charged amount. */
export function captureLinemanRequest(order: ParsedLinemanOrder) {
  return {
    platform: order.platform,
    bookingId: order.bookingId,
    restaurant: order.restaurant,
    paymentMethod: order.paymentMethod,
    orderedAt: order.orderedAt,
    foodMinor: order.foodMinor,
    deliveryFeeMinor: order.deliveryFeeMinor,
    totalMinor: order.totalMinor,
    chargedMinor: order.chargedMinor,
    items: order.items.map((item) => ({
      position: item.position, quantity: item.quantity, name: item.name, options: item.options, amountMinor: item.amountMinor
    })),
    adjustments: order.adjustments.map((row) => ({ position: row.position, kind: row.kind, name: row.name, amountMinor: row.amountMinor }))
  };
}

const orderLine = z.object({
  position: z.number().int().positive(),
  quantity: z.number().int().positive(),
  name: z.string().min(1).max(300),
  options: z.array(z.string().max(300)).max(40),
  amountMinor: minorUnitStringSchema
}).strict();

/** What the page may post: a LINE MAN order's parse, checked again by `capture_delivery`. */
export const linemanCaptureRequestSchema = z.object({
  platform: z.literal("lineman"),
  bookingId: z.string().regex(/^[A-Z]{2,4}-\d{6}-\d{6,}$/u),
  restaurant: z.string().min(1).max(300),
  paymentMethod: z.string().min(1).max(120),
  orderedAt: z.string().datetime({ offset: true }),
  foodMinor: minorUnitStringSchema,
  deliveryFeeMinor: minorUnitStringSchema.nullable(),
  totalMinor: minorUnitStringSchema,
  chargedMinor: minorUnitStringSchema,
  items: z.array(orderLine).min(1).max(60),
  adjustments: z.array(z.object({
    position: z.number().int().positive(),
    kind: z.enum(["discount", "charge"]),
    name: z.string().min(1).max(300),
    amountMinor: minorUnitStringSchema
  }).strict()).max(20)
}).strict();

export const deliveryCaptureResultSchema = z.object({ captured: z.boolean(), id: z.string().uuid() }).strict();

/** The `capture_ride` request (migration 034): camelCase keys, money as canonical int64 text. */
export function captureRideRequest(ride: ParsedRide) {
  return {
    platform: ride.platform,
    bookingId: ride.bookingId,
    rideType: ride.rideType,
    pickedUpAt: ride.pickedUpAt,
    droppedOffAt: ride.droppedOffAt,
    pickupPlace: ride.pickupPlace,
    dropoffPlace: ride.dropoffPlace,
    distanceMeters: ride.distanceMeters,
    durationMinutes: ride.durationMinutes,
    paymentMethod: ride.paymentMethod,
    fareMinor: ride.fareMinor,
    platformFeeMinor: ride.platformFeeMinor,
    totalMinor: ride.totalMinor,
    adjustments: ride.adjustments.map((row) => ({ position: row.position, kind: row.kind, name: row.name, amountMinor: row.amountMinor }))
  };
}

export const storedDeliverySchema = z.object({
  id: z.string().uuid(),
  platform: z.enum(["grabfood", "lineman"]),
  booking_id: z.string(),
  restaurant: z.string(),
  payment_method: z.string().nullable(),
  /** GrabFood only: when the e-receipt was sent. */
  receipt_sent_at: z.string().nullable(),
  /** LINE MAN only: when the order was placed (migration 036). */
  ordered_at: z.string().nullable(),
  /** LINE MAN only: what was charged, below the total when the food was paid outside. */
  charged_minor: minorUnitStringSchema.nullable(),
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

export const storedRideSchema = z.object({
  id: z.string().uuid(),
  booking_id: z.string(),
  ride_type: z.string(),
  picked_up_at: z.string(),
  dropped_off_at: z.string(),
  pickup_place: z.string(),
  dropoff_place: z.string(),
  distance_meters: z.number().int().nonnegative(),
  duration_minutes: z.number().int().nonnegative(),
  payment_method: z.string(),
  fare_minor: minorUnitStringSchema,
  platform_fee_minor: minorUnitStringSchema,
  total_minor: minorUnitStringSchema,
  adjustments: z.array(z.object({
    position: z.number().int(),
    kind: z.enum(["discount", "charge"]),
    name: z.string(),
    amount_minor: minorUnitStringSchema
  }).strict()),
  match: deliveryMatchStateSchema
}).strict();

export type StoredRide = z.infer<typeof storedRideSchema>;

export const deliveryListSchema = z.object({ deliveries: z.array(storedDeliverySchema), rides: z.array(storedRideSchema) }).strict();

/** What reached a bank or wallet: the total for GrabFood, the `Pay …` line for LINE MAN (D-223). */
export function chargedAmount(delivery: Pick<StoredDelivery, "total_minor" | "charged_minor">): string {
  return delivery.charged_minor ?? delivery.total_minor;
}

/**
 * Nothing charged means paid outside the platform — the co-payment scheme prints the whole food
 * price as a discount (`docs/DELIVERY_CONTRACT.md`). Never a free meal, and never matched to a
 * card row. A LINE MAN order whose food alone went to เป๋าตัง is still matched, on what was charged.
 */
export function paidOutsidePlatform(delivery: Pick<StoredDelivery, "total_minor" | "charged_minor">): boolean {
  return chargedAmount(delivery) === "0";
}

/** When the order happened, for sorting and display: the order time, else the e-receipt's. */
export function deliveryTime(delivery: Pick<StoredDelivery, "receipt_sent_at" | "ordered_at">): string {
  return delivery.ordered_at ?? delivery.receipt_sent_at ?? "";
}

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

/**
 * The same for rides (D-222). A row holds at most one order or one ride, never both (migration 034).
 * A ride paid in two parts sits on both its rows (D-229).
 */
export function ridesOnRows(rides: readonly StoredRide[]): [string, StoredRide][] {
  return rides.flatMap((ride) =>
    (ride.match.status === "matched" || ride.match.status === "linked") && ride.match.row
      ? [ride.match.row, ...(ride.match.also ?? [])].map((row) => [row.transaction_id, ride] as [string, StoredRide])
      : []);
}

/** What one sync did, in counts only: nothing here names a dish, a place or an amount. */
export const deliverySyncReportSchema = z.object({
  /** Messages whose unread receipts were examined this run. */
  messages: z.number().int().nonnegative(),
  captured: z.number().int().nonnegative(),
  /** Food receipts for an order already stored: a forward and a backfill of one order, or a re-read. */
  alreadyStored: z.number().int().nonnegative(),
  /** Rides newly stored, and rides already stored — the same two counts as orders (D-222). */
  ridesCaptured: z.number().int().nonnegative(),
  ridesAlreadyStored: z.number().int().nonnegative(),
  /** Bodies that are neither template (a bundle's own cover note, a cancelled-order mail). */
  notReceipts: z.number().int().nonnegative(),
  /** Refusal code to count; a ride's codes carry a `RIDE_` prefix. */
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
    `${report.ridesCaptured} new ride${report.ridesCaptured === 1 ? "" : "s"}`,
    `${report.ridesAlreadyStored} ride${report.ridesAlreadyStored === 1 ? "" : "s"} already stored`
  ];
  if (refused > 0) parts.push(`${refused} not read`);
  return `${parts.join(", ")}.`;
}
