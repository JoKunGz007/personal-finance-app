import { z } from "zod";
import { shopeeLinkKindSchema } from "@/lib/shopee-match";

/**
 * The published shape of `GET /api/v1/shopee` and the two write routes (PLAN task 62 step 4b,
 * D-270). Money is string minor units; the browser and the loader (`lib/server/shopee.ts`) share
 * these schemas. No destination text exists to publish: a refund's printed destination is never stored.
 */
const minor = z.string().regex(/^-?\d+$/);
const uuid = z.string().uuid();
const instant = z.string().datetime({ offset: true });

export const shopeeViewMatchSchema = z.object({
  state: z.enum(["matched", "unmatched", "auto", "combined_proposed", "wallet", "spaylater", "none"]),
  transactionId: uuid.nullable(),
  /** The overlay's revision; 0 when the owner has said nothing yet (what `expectedRevision` wants). */
  revision: z.number().int().nonnegative()
});

export const shopeeViewOrderSchema = z.object({
  id: uuid,
  orderCode: z.string(),
  linkId: z.string(),
  orderUrl: z.string(),
  placedAt: instant,
  paidAt: instant.nullable(),
  shop: z.string(),
  paymentMethod: z.string(),
  paymentKind: z.enum(["bank_debit", "wallet", "spaylater", "other"]),
  totalMinor: minor,
  items: z.array(z.object({
    position: z.number().int(),
    name: z.string(),
    variation: z.string().nullable(),
    quantity: z.number().int(),
    priceMinor: minor.nullable(),
    originalPriceMinor: minor.nullable()
  })),
  priceLines: z.array(z.object({ position: z.number().int(), label: z.string(), amountMinor: minor })),
  refunds: z.array(z.object({
    requestId: z.string(),
    requestedAt: instant,
    refundMinor: minor,
    refundTo: z.enum(["wallet", "bank"]),
    requestedBy: z.enum(["buyer", "shopee"]),
    reason: z.string().nullable(),
    steps: z.array(z.string())
  })),
  match: shopeeViewMatchSchema
});

export const shopeeViewRowSchema = z.object({
  id: uuid,
  date: z.string(),
  time: z.string().nullable(),
  label: z.string().nullable(),
  description: z.string().nullable(),
  movement: minor
});

/** `public.shopee_monthly_summary()`: the last twelve Bangkok months, oldest first, money as int text. */
export const shopeeSummarySchema = z.object({
  months: z.array(z.object({
    month: z.string().regex(/^\d{4}-\d{2}$/),
    orders: z.number().int().nonnegative(),
    cancelled: z.number().int().nonnegative(),
    spentMinor: minor,
    refundedMinor: minor,
    byKind: z.object({ bank_debit: minor, wallet: minor, spaylater: minor, other: minor })
  }))
});

export const shopeeViewSchema = z.object({
  summary: shopeeSummarySchema,
  orders: z.array(shopeeViewOrderSchema),
  rows: z.record(z.string(), shopeeViewRowSchema),
  combined: z.array(z.object({ transactionId: uuid, orderIds: z.array(uuid) })),
  walletTopups: z.array(z.object({ orderId: uuid, transactionIds: z.array(uuid) })),
  spaylaterRepayments: z.array(z.object({
    transactionId: uuid,
    orderIds: z.array(uuid),
    preselected: z.array(uuid),
    linkedOrderIds: z.array(uuid)
  })),
  refundDeposits: z.array(z.object({ orderId: uuid, transactionId: uuid })),
  links: z.array(z.object({ orderId: uuid, transactionId: uuid, kind: shopeeLinkKindSchema }))
});

export type ShopeeView = z.infer<typeof shopeeViewSchema>;

export type ShopeeViewOrder = z.infer<typeof shopeeViewOrderSchema>;
export type ShopeeViewRow = z.infer<typeof shopeeViewRowSchema>;

/**
 * Each ledger row's Shopee orders, keyed by transaction id, for `/ledger`'s fold (D-270, as
 * `deliveriesOnRows`): only orders the owner matched or that matched automatically. A combined
 * checkout is a proposal, not a match, so it adds nothing. A row can hold several orders.
 */
export function shopeeOrdersOnRows(orders: readonly ShopeeViewOrder[]): Map<string, ShopeeViewOrder[]> {
  const byRow = new Map<string, ShopeeViewOrder[]>();
  for (const order of orders) {
    if ((order.match.state !== "matched" && order.match.state !== "auto") || !order.match.transactionId) continue;
    byRow.set(order.match.transactionId, [...(byRow.get(order.match.transactionId) ?? []), order]);
  }
  return byRow;
}

export const shopeeMatchRequestSchema = z.object({
  transactionId: uuid.nullable(),
  orders: z.array(z.object({ orderId: uuid, expectedRevision: z.number().int().nonnegative() }).strict()).min(1).max(20),
  decision: z.enum(["matched", "unmatched"])
}).strict().refine((body) => (body.decision === "matched") === (body.transactionId !== null), {
  message: "A match needs a ledger row; an undo must not name one."
});

export const shopeeMatchResultSchema = z.object({
  orders: z.array(z.object({
    orderId: uuid,
    decision: z.enum(["matched", "unmatched"]),
    transactionId: uuid.nullable(),
    revision: z.number().int().positive()
  }))
});

export const shopeeLinksRequestSchema = z.object({
  kind: shopeeLinkKindSchema,
  transactionId: uuid,
  orderIds: z.array(uuid).min(1).max(20),
  action: z.enum(["link", "unlink"])
}).strict();

export const shopeeLinksResultSchema = z.object({ changed: z.number().int().nonnegative() });

export type ShopeeMatchRequest = z.infer<typeof shopeeMatchRequestSchema>;
export type ShopeeLinksRequest = z.infer<typeof shopeeLinksRequestSchema>;

/** Request bodies for the Shopee tab's actions, built from the loaded view (no money math). */
export function confirmMatchBody(
  transactionId: string,
  orders: readonly Pick<ShopeeViewOrder, "id" | "match">[]
): ShopeeMatchRequest {
  return {
    transactionId,
    orders: orders.map((o) => ({ orderId: o.id, expectedRevision: o.match.revision })),
    decision: "matched"
  };
}

export function undoMatchBody(orders: readonly Pick<ShopeeViewOrder, "id" | "match">[]): ShopeeMatchRequest {
  return {
    transactionId: null,
    orders: orders.map((o) => ({ orderId: o.id, expectedRevision: o.match.revision })),
    decision: "unmatched"
  };
}

export function linkBody(
  kind: ShopeeLinksRequest["kind"],
  transactionId: string,
  orderIds: readonly string[],
  action: ShopeeLinksRequest["action"] = "link"
): ShopeeLinksRequest {
  return { kind, transactionId, orderIds: [...orderIds], action };
}

/** Sum of minor-unit strings, for display only. */
export function sumMinor(values: readonly string[]): string {
  return String(values.reduce((sum, v) => sum + BigInt(v), 0n));
}
