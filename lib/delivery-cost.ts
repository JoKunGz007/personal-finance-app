import type { MinorUnitString } from "@/lib/money";

/**
 * What an order paid through ไทยช่วยไทย really cost the owner (PLAN task 58 part 2).
 *
 * The scheme pays for part of an order out of the เป๋าตัง wallet, so no card row carries it and the
 * printed total says ฿0 (GrabFood) or only what the bank was charged (a split LINE MAN order). The
 * owner's rule, 2026-09-25: the scheme pays 60% of the food and none of the delivery fee, so of
 * what the wallet covered, the food share costs 40% and the fee share costs all of it. Promo codes
 * and delivery promos reduce the fee only, so the food share is the wallet amount up to the food.
 *
 * Display only: an order is never money (D-209), and the wallet top-up that funded this is already
 * a bank row on the ledger. Integer arithmetic; 40% of a satang count is never exactly half, so it
 * rounds to the nearest satang.
 */

/** GrabFood prints the scheme as one discount line named like `TH26GF0001ALL`. */
const GRAB_SCHEME_LINE = /^TH\d+GF\d+ALL$/;

type Order = {
  platform: "grabfood" | "lineman";
  food_minor: MinorUnitString;
  total_minor: MinorUnitString;
  charged_minor: MinorUnitString | null;
  adjustments: readonly { kind: string; name: string; amount_minor: MinorUnitString }[];
};

/** The order's real cost in satang, or null when it was not paid through the scheme. */
export function schemeRealCost(order: Order): MinorUnitString | null {
  let wallet: bigint;
  let charged: bigint;
  if (order.platform === "grabfood") {
    const lines = order.adjustments.filter((row) => row.kind === "discount" && GRAB_SCHEME_LINE.test(row.name));
    if (order.total_minor !== "0" || lines.length !== 1) return null;
    wallet = BigInt(lines[0]!.amount_minor);
    charged = 0n;
  } else {
    if (order.charged_minor === null) return null;
    charged = BigInt(order.charged_minor);
    wallet = BigInt(order.total_minor) - charged;
    if (wallet <= 0n) return null;
  }
  const food = BigInt(order.food_minor);
  const foodShare = wallet < food ? wallet : food;
  // 40% to the nearest satang: (4 × share + 5) / 10, floored. Never a tie, since 4 × share is even.
  const ownFood = (4n * foodShare + 5n) / 10n;
  return String(charged + ownFood + (wallet - foodShare));
}
