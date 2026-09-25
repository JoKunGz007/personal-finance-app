import type { MinorUnitString } from "@/lib/money";

/**
 * What an order paid through the co-payment scheme really cost the owner (PLAN task 58 part 2).
 *
 * The scheme pays for part of an order out of the เป๋าตัง wallet, so no card row carries it and the
 * printed total says ฿0 (GrabFood) or only what the bank was charged (a split LINE MAN order). The
 * owner's rule, 2026-09-25, checked against the เป๋าตัง history and the published terms: the
 * government pays a share of the food and none of the delivery fee — **50% in 2025** (คนละครึ่งพลัส)
 * and **60% from 2026** (ไทยช่วยไทยพลัส) — and **at most ฿200 a Bangkok day** across that day's
 * orders, in both years. Promo codes and delivery promos reduce the fee only, so the food share is
 * the wallet amount up to the food.
 *
 * The daily cap makes one order's cost depend on the day's earlier orders, which is why this takes
 * the whole list. **Two known limits, both reading low**: the ฿200 is shared with the owner's other
 * scheme spending (a shop, a market) that no table here holds, and each campaign's total limit is
 * not modelled. Migration 038's `delivery_statistics()` is the same rule; pgTAP 024 and
 * `tests/delivery-cost.test.ts` pin the same cases on both sides.
 *
 * Display only: an order is never money (D-209), and the wallet top-up that funded this is already
 * a bank row on the ledger. Integer satang throughout.
 */

/** GrabFood prints the scheme as one discount line named like `TH26GF5050ALL`. */
const GRAB_SCHEME_LINE = /^TH\d+GF\d+ALL$/;

/** The most the government pays in one Bangkok day, in satang. */
export const SCHEME_DAILY_CAP = 20000n;

type Order = {
  id: string;
  platform: "grabfood" | "lineman";
  receipt_sent_at: string | null;
  ordered_at: string | null;
  food_minor: MinorUnitString;
  delivery_fee_minor: MinorUnitString | null;
  total_minor: MinorUnitString;
  charged_minor: MinorUnitString | null;
  adjustments: readonly { kind: string; name: string; amount_minor: MinorUnitString }[];
};

export type SchemeCost = {
  /** The scheme's name that year: คนละครึ่งพลัส in 2025, ไทยช่วยไทยพลัส from 2026. */
  scheme: "คนละครึ่ง" | "ไทยช่วยไทย";
  /** What the order really cost: `wallet + charged`. */
  cost: MinorUnitString;
  /** What the owner paid from เป๋าตัง — the figure its history shows: their food share plus any fee it covered. */
  wallet: MinorUnitString;
  /** What a bank was charged beside it (a split LINE MAN order's delivery fee), or "0". */
  charged: MinorUnitString;
  /** True when the bank charge is no more than the printed delivery fee, so it can be called that. */
  chargedIsFee: boolean;
  /** What the government paid. */
  government: MinorUnitString;
  /** True when the daily cap cut the government's share. */
  capped: boolean;
};

/** What the scheme's wallet covered and what a bank was charged, or null when not paid through it. */
export function schemeWallet(order: Omit<Order, "id" | "receipt_sent_at" | "ordered_at" | "delivery_fee_minor">): { wallet: bigint; charged: bigint } | null {
  if (order.platform === "grabfood") {
    const lines = order.adjustments.filter((row) => row.kind === "discount" && GRAB_SCHEME_LINE.test(row.name));
    if (order.total_minor !== "0" || lines.length !== 1) return null;
    return { wallet: BigInt(lines[0]!.amount_minor), charged: 0n };
  }
  if (order.charged_minor === null) return null;
  const charged = BigInt(order.charged_minor);
  const wallet = BigInt(order.total_minor) - charged;
  return wallet > 0n ? { wallet, charged } : null;
}

/** The Bangkok calendar date (UTC+7, no daylight saving) of an instant. */
function bangkokDate(instant: string): string {
  return new Date(Date.parse(instant) + 7 * 3600_000).toISOString().slice(0, 10);
}

/**
 * The owner's share of `food` satang before any cap: 50% in 2025, 40% from 2026, to the nearest
 * satang. 40% is never a tie (4 × a whole count is even); 50% of an odd count rounds half up.
 */
function ownShare(food: bigint, date: string): bigint {
  const tenths = date < "2026-01-01" ? 5n : 4n;
  return (tenths * food + 5n) / 10n;
}

/**
 * Every scheme order's real cost, keyed by order id. Orders are taken in time order within each
 * Bangkok day, ties by id, and the day's government share is capped as a running total — so an
 * order's government share is `min(running, cap) − min(running before it, cap)`.
 */
export function schemeCosts(orders: readonly Order[]): Map<string, SchemeCost> {
  const scheme = orders
    .map((order) => ({ order, paid: schemeWallet(order), at: order.ordered_at ?? order.receipt_sent_at ?? "" }))
    .filter((row): row is typeof row & { paid: { wallet: bigint; charged: bigint } } => row.paid !== null && row.at !== "")
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || (a.order.id < b.order.id ? -1 : a.order.id > b.order.id ? 1 : 0));

  const running = new Map<string, bigint>();
  const costs = new Map<string, SchemeCost>();
  for (const { order, paid, at } of scheme) {
    const date = bangkokDate(at);
    const food = BigInt(order.food_minor);
    const foodShare = paid.wallet < food ? paid.wallet : food;
    const uncapped = foodShare - ownShare(foodShare, date);
    const before = running.get(date) ?? 0n;
    const after = before + uncapped;
    running.set(date, after);
    const min = (value: bigint) => (value < SCHEME_DAILY_CAP ? value : SCHEME_DAILY_CAP);
    const government = min(after) - min(before);
    const wallet = paid.wallet - government;
    costs.set(order.id, {
      scheme: date < "2026-01-01" ? "คนละครึ่ง" : "ไทยช่วยไทย",
      cost: String(wallet + paid.charged),
      wallet: String(wallet),
      charged: String(paid.charged),
      chargedIsFee: paid.charged <= BigInt(order.delivery_fee_minor ?? "0"),
      government: String(government),
      capped: government < uncapped
    });
  }
  return costs;
}
