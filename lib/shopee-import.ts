import { z } from "zod";

/**
 * The Shopee order export in the Inbox (D-270, PLAN task 62). Pure: no I/O. The export file is
 * written by `scripts/shopee-orders-bookmarklet.js`; this maps each order to the request shape
 * `capture_shopee_orders` takes, in integer satang, and refuses what cannot be stored exactly.
 *
 * Nothing about the recipient is read, and the printed refund destination is reduced to
 * `wallet` or `bank` on the spot: it can carry a masked bank account, so it is never kept.
 */

export const SHOPEE_SOURCE = "shopee.co.th order detail";
export const SHOPEE_CHUNK = 500;
export const SHOPEE_MAX_BYTES = 5 * 1024 * 1024;

export type ShopeeCaptureItem = {
  position: number; name: string; variation: string | null; quantity: number;
  priceMinor: string | null; originalPriceMinor: string | null;
};
export type ShopeeCaptureRefund = {
  requestId: string; requestedAt: string; refundMinor: string; refundTo: "wallet" | "bank";
  requestedBy: "buyer" | "shopee"; reason: string | null; steps: string[];
};
export type ShopeeCaptureOrder = {
  orderCode: string; linkId: string; placedAt: string; paidAt: string | null; shop: string;
  paymentMethod: string; totalMinor: string; itemPriceIs: "line total" | "unit price" | null;
  items: ShopeeCaptureItem[];
  priceLines: { position: number; label: string; amountMinor: string }[];
  refund: ShopeeCaptureRefund | null;
};
export type ShopeeRefusal = { orderCode: string | null; reason: string };

export type ShopeeParse =
  | { ok: true; version: 1 | 2; orders: ShopeeCaptureOrder[]; refused: ShopeeRefusal[] }
  | { ok: false; reason: string };

export const shopeeImportResultSchema = z.object({
  version: z.union([z.literal(1), z.literal(2)]),
  new: z.number().int().nonnegative(),
  stored: z.number().int().nonnegative(),
  beforeLedger: z.number().int().nonnegative(),
  refundsNew: z.number().int().nonnegative(),
  refundsStored: z.number().int().nonnegative(),
  refused: z.array(z.object({ orderCode: z.string().nullable(), reason: z.string() }))
});
export type ShopeeImportResult = z.infer<typeof shopeeImportResultSchema>;

export const REFUSE = {
  error: "The page could not be read when the file was made.",
  incomplete: "The order is missing its ID, link, placed time, total or shop.",
  noPayment: "The order has no payment method.",
  shops: "The order spans more than one shop.",
  sum: "The price rows do not add up to the order total.",
  item: "An item has an unreadable price or quantity.",
  cancelError: "The cancellation page could not be read when the file was made.",
  cancelOrder: "The cancellation belongs to a different order.",
  cancelIncomplete: "The cancellation record is incomplete.",
  cancelDestination: "The refund destination is not ShopeePay or a bank account."
} as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const text = (value: unknown): string | null => (typeof value === "string" && value.trim() !== "" ? value.trim() : null);

/** Exact decimal baht text (at most two decimals, optional leading minus) to canonical satang text. */
export function bahtToMinor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = /^(-)?(\d+)(?:\.(\d{1,2}))?$/u.exec(value.trim());
  if (!match) return null;
  const magnitude = BigInt(match[2]!) * 100n + BigInt(((match[3] ?? "") + "00").slice(0, 2));
  const signed = match[1] ? -magnitude : magnitude;
  const minor = signed.toString();
  // int64 range.
  return signed > 9223372036854775807n || signed < -9223372036854775808n ? null : minor;
}

/** `dd-mm-yyyy HH:MM` (Asia/Bangkok) to `yyyy-mm-ddTHH:MM:00+07:00`, or null if not a real date. */
export function bangkokTimeToIso(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{2})-(\d{2})-(\d{4}) (\d{2}):(\d{2})$/u.exec(value.trim());
  if (!match) return null;
  const [day, month, year, hour, minute] = match.slice(1).map(Number) as [number, number, number, number, number];
  const probe = new Date(Date.UTC(year, month - 1, day, hour, minute));
  if (
    probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day ||
    hour > 23 || minute > 59
  ) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${String(year).padStart(4, "0")}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:00+07:00`;
}

// D-277: refund_to is immutable once stored, so a destination is classified only when it is clearly one kind.
// Wallet: the ShopeePay name alone. Bank: a masked account number, i.e. a run of 2+ mask characters (x, X, *)
// not glued to a letter, followed by mask characters, dashes, spaces or digits and ending in a digit
// ("xxx-x-x1234-x", "***1234"). Anything else is refused rather than guessed.
const WALLET_DESTINATION = /^ShopeePay( Balance)?$/iu;
// A masked account number: two or more mask characters then a digit, or one mask character then at
// least four digits — the real bank refund prints `[*` and four digits (D-282).
const BANK_DESTINATION = /(?<![A-Za-z])(?:[xX*]{2,}[-\sxX*\d]*\d|[xX*]\d{4,})/u;

function mapRefund(value: unknown, orderCode: string): { refund: ShopeeCaptureRefund } | { refuse: string } {
  if (!isRecord(value)) return { refuse: REFUSE.cancelIncomplete };
  if (value.error !== undefined) return { refuse: REFUSE.cancelError };
  if (text(value.orderId) !== orderCode) return { refuse: REFUSE.cancelOrder };
  const requestId = text(value.requestId);
  const requestedAt = bangkokTimeToIso(value.requestedAt);
  const refundMinor = bahtToMinor(value.refundAmount);
  const destination = text(value.refundTo);
  const by = text(value.requestedBy)?.toLowerCase();
  if (!requestId || !requestedAt || refundMinor === null || destination === null || (by !== "buyer" && by !== "shopee")) {
    return { refuse: REFUSE.cancelIncomplete };
  }
  const refundTo = WALLET_DESTINATION.test(destination) ? "wallet" : BANK_DESTINATION.test(destination) ? "bank" : null;
  if (refundTo === null) return { refuse: REFUSE.cancelDestination };
  return {
    refund: {
      requestId, requestedAt, refundMinor,
      // Only the kind survives; the printed text may hold a masked account number.
      refundTo,
      requestedBy: by,
      reason: text(value.reason),
      steps: Array.isArray(value.steps) ? value.steps.filter((step): step is string => typeof step === "string" && REFUND_STEPS.has(step)) : []
    }
  };
}

function mapOrder(raw: unknown): { order: ShopeeCaptureOrder } | { refusal: ShopeeRefusal } {
  const code = isRecord(raw) ? text(raw.orderId) : null;
  const refuse = (reason: string) => ({ refusal: { orderCode: code, reason } });
  if (!isRecord(raw)) return refuse(REFUSE.incomplete);
  if (raw.error !== undefined) return refuse(REFUSE.error);

  const linkId = typeof raw.url === "string" ? /\/user\/purchase\/order\/(\d{14,15})(?:[?#/]|$)/u.exec(raw.url)?.[1] ?? null : null;
  const timeline = isRecord(raw.timeline) ? raw.timeline : {};
  const placedAt = bangkokTimeToIso(timeline["Order Placed"]);
  const totalMinor = bahtToMinor(raw.orderTotal);
  const shops = Array.isArray(raw.shops) ? raw.shops : [];
  if (shops.length > 1) return refuse(REFUSE.shops);
  const shopRecord = shops[0];
  const shop = isRecord(shopRecord) ? text(shopRecord.name) : null;
  if (!code || !linkId || !placedAt || totalMinor === null || !shop || !isRecord(shopRecord)) return refuse(REFUSE.incomplete);

  const paymentMethod = text(raw.paymentMethod);
  if (paymentMethod === null) return refuse(REFUSE.noPayment);

  const paidRaw = timeline["Order Paid"];
  const paidAt = paidRaw === undefined || paidRaw === null ? null : bangkokTimeToIso(paidRaw);
  if (paidRaw !== undefined && paidRaw !== null && paidAt === null) return refuse(REFUSE.incomplete);

  const rows = Array.isArray(raw.priceRows) ? raw.priceRows : [];
  const priceLines: ShopeeCaptureOrder["priceLines"] = [];
  let sum = 0n;
  for (const row of rows) {
    const label = isRecord(row) ? text(row.label) : null;
    const amountMinor = isRecord(row) ? bahtToMinor(row.amount) : null;
    if (!label || amountMinor === null) return refuse(REFUSE.sum);
    priceLines.push({ position: priceLines.length + 1, label, amountMinor });
    sum += BigInt(amountMinor);
  }
  if (priceLines.length === 0 || sum !== BigInt(totalMinor)) return refuse(REFUSE.sum);

  const items: ShopeeCaptureItem[] = [];
  for (const item of Array.isArray(shopRecord.items) ? shopRecord.items : []) {
    const name = isRecord(item) ? text(item.name) : null;
    const quantity = isRecord(item) ? item.qty : null;
    // A gift line prints no price (seen twice in the owner's history); items are display-only.
    const unpriced = isRecord(item) && item.price === null;
    const priceMinor = isRecord(item) && !unpriced ? bahtToMinor(item.price) : null;
    const originalPriceMinor = isRecord(item) && item.originalPrice != null ? bahtToMinor(item.originalPrice) : null;
    if (!name || (priceMinor === null && !unpriced) || typeof quantity !== "number" || !Number.isInteger(quantity) || quantity < 1) {
      return refuse(REFUSE.item);
    }
    if (isRecord(item) && item.originalPrice != null && originalPriceMinor === null) return refuse(REFUSE.item);
    items.push({
      position: items.length + 1, name, variation: text((item as Record<string, unknown>).variation), quantity,
      priceMinor, originalPriceMinor
    });
  }

  let refund: ShopeeCaptureRefund | null = null;
  if (raw.cancellation !== undefined && raw.cancellation !== null) {
    const mapped = mapRefund(raw.cancellation, code);
    if ("refuse" in mapped) return refuse(mapped.refuse);
    refund = mapped.refund;
  }

  return {
    order: {
      orderCode: code, linkId, placedAt, paidAt, shop, paymentMethod, totalMinor,
      itemPriceIs: raw.itemPriceIs === "line total" || raw.itemPriceIs === "unit price" ? raw.itemPriceIs : null,
      items, priceLines, refund
    }
  };
}

// The steps `shopee_refunds.steps` accepts; an unknown wording is dropped rather than refusing the order.
const REFUND_STEPS = new Set(["Cancellation Requested", "Cancellation Accepted", "Refunded", "Refund Completed"]);

export function parseShopeeExport(json: unknown): ShopeeParse {
  if (!isRecord(json) || json.source !== SHOPEE_SOURCE) return { ok: false, reason: "This is not a Shopee order export." };
  const version = json.version === undefined ? 1 : json.version === 2 ? 2 : null;
  if (version === null) return { ok: false, reason: "This Shopee export is a version this ledger does not read." };
  if (!Array.isArray(json.orders)) return { ok: false, reason: "The Shopee export has no list of orders." };
  const orders: ShopeeCaptureOrder[] = [];
  const refused: ShopeeRefusal[] = [];
  for (const raw of json.orders) {
    const mapped = mapOrder(raw);
    if ("order" in mapped) orders.push(mapped.order);
    else refused.push(mapped.refusal);
  }
  return { ok: true, version, orders, refused };
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** The one-line result shown in the Inbox. Refused order codes and reasons are listed by the caller. */
export function describeShopeeImport(result: ShopeeImportResult): string {
  let line = `Shopee export: ${plural(result.new, "new order", "new orders")}, ${result.stored} already stored`;
  if (result.beforeLedger > 0) line += `, ${result.beforeLedger} before the ledger's first row`;
  if (result.refused.length > 0) line += `, ${result.refused.length} refused`;
  line += ".";
  const refunds: string[] = [];
  if (result.refundsNew > 0) refunds.push(plural(result.refundsNew, "new refund", "new refunds"));
  if (result.refundsStored > 0) refunds.push(`${plural(result.refundsStored, "refund", "refunds")} already stored`);
  if (refunds.length > 0) line += ` ${refunds.join(", ")}.`;
  return line;
}
