import { z } from "zod";

/**
 * Matching Shopee orders to the ledger (PLAN task 62 step 4a, D-270; migration 056).
 *
 * **An order is never money** (migration 055). Everything here is a proposal computed at read
 * time from `public.shopee_ledger_rows()` and the owner's stored say (the match overlay and the
 * link events); nothing is stored by this module. Money is exact `bigint` throughout.
 *
 * Time is Bangkok wall clock (UTC+7, no daylight saving). An order's time is `paidAt ?? placedAt`.
 * A ledger row's time is its date plus its time of day, read as Bangkok wall clock. The lag is
 * the row's minute minus the order's minute, both truncated to the minute, so a row 20 seconds
 * after the order in the next minute has lag 1. A row with no time never qualifies automatically.
 *
 * Any ambiguity, on either side, proposes nothing (D-063).
 *
 * Inputs: orders, refunds, ledger rows, the owner's overlays and link events, and the ids of rows
 * the owner Excluded from reporting (never proposed; an owner match or link on one is kept).
 */

/** The automatic match: the row falls within this many minutes either side of the order. */
export const SHOPEE_MATCH_WINDOW_MINUTES = 1;
/** A wallet top-up lands up to this long before the wallet order's time. */
export const SHOPEE_WALLET_TOPUP_WINDOW_MINUTES = 60;
/** A SPayLater repayment lands 10..60 days after the order's Bangkok date (D-270, measured 15-21). */
export const SPAYLATER_REPAY_MIN_DAYS = 10;
export const SPAYLATER_REPAY_MAX_DAYS = 60;
/** A refund to a bank account is deposited within this many days after the request. */
export const SHOPEE_REFUND_DEPOSIT_DAYS = 30;
/** The monthly Shopee VIP charge, owner-identified (D-270); never a wallet top-up. */
export const SHOPEE_VIP_AMOUNT_MINOR = 4900n;
/** A minute group larger than this is not searched for a combined checkout. */
const COMBINED_GROUP_CAP = 10;

const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;
const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 86_400_000;

const minorString = z.string().regex(/^-?\d+$/);
const isoInstant = z.string().datetime({ offset: true });
const uuid = z.string().uuid();

export const shopeeOrderInputSchema = z.object({
  id: uuid,
  orderCode: z.string().min(1),
  placedAt: isoInstant,
  paidAt: isoInstant.nullable(),
  paymentKind: z.enum(["bank_debit", "wallet", "spaylater", "other"]),
  totalMinor: minorString
});

export const shopeeRefundInputSchema = z.object({
  orderId: uuid,
  requestedAt: isoInstant,
  refundMinor: minorString,
  refundTo: z.enum(["wallet", "bank"])
});

/** The shape of `public.shopee_ledger_rows()`; movement is int64 text, time is Bangkok local. */
export const shopeeLedgerRowSchema = z.object({
  transaction_id: uuid,
  account_id: uuid,
  source_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  source_time: z.string().regex(/^\d{2}:\d{2}:\d{2}$/).nullable(),
  transaction_label: z.string().nullable(),
  description: z.string().nullable(),
  movement_minor: minorString
});

export const shopeeOverlayInputSchema = z.object({
  orderId: uuid,
  decision: z.enum(["matched", "unmatched"]),
  transactionId: uuid.nullable(),
  revision: z.number().int().nonnegative()
});

export const shopeeLinkKindSchema = z.enum(["wallet_topup", "spaylater_repayment", "refund_deposit"]);

export const shopeeLinkEventSchema = z.object({
  orderId: uuid,
  transactionId: uuid,
  kind: shopeeLinkKindSchema,
  action: z.enum(["link", "unlink"]),
  changedAt: isoInstant
});

export const shopeeMatchInputSchema = z.object({
  orders: z.array(shopeeOrderInputSchema),
  refunds: z.array(shopeeRefundInputSchema),
  rows: z.array(shopeeLedgerRowSchema),
  overlays: z.array(shopeeOverlayInputSchema),
  linkEvents: z.array(shopeeLinkEventSchema),
  excludedTransactionIds: z.array(uuid).default([])
});

export type ShopeeOrderInput = z.infer<typeof shopeeOrderInputSchema>;
export type ShopeeRefundInput = z.infer<typeof shopeeRefundInputSchema>;
export type ShopeeLedgerRow = z.infer<typeof shopeeLedgerRowSchema>;
export type ShopeeOverlayInput = z.infer<typeof shopeeOverlayInputSchema>;
export type ShopeeLinkEvent = z.infer<typeof shopeeLinkEventSchema>;
export type ShopeeLinkKind = z.infer<typeof shopeeLinkKindSchema>;
export type ShopeeMatchInput = z.input<typeof shopeeMatchInputSchema>;

export type ShopeeOrderMatchState =
  | { orderId: string; state: "matched"; transactionId: string; revision: number }
  | { orderId: string; state: "unmatched"; revision: number }
  | { orderId: string; state: "auto"; transactionId: string }
  | { orderId: string; state: "combined_proposed"; transactionId: string; orderIds: string[] }
  | { orderId: string; state: "wallet" }
  | { orderId: string; state: "spaylater" }
  | { orderId: string; state: "none" };

export type ShopeeCurrentLink = { orderId: string; transactionId: string; kind: ShopeeLinkKind };

export type ShopeeMatchResult = {
  /** One entry per input order, in input order. */
  orders: ShopeeOrderMatchState[];
  combined: { transactionId: string; orderIds: string[] }[];
  walletTopups: { orderId: string; transactionIds: string[] }[];
  spaylaterRepayments: {
    transactionId: string;
    orderIds: string[];
    preselected: string[];
    linkedOrderIds: string[];
  }[];
  refundDeposits: { orderId: string; transactionId: string }[];
};

/** The current state of each (order, transaction, kind) is its newest event; only `link` survives. */
export function currentLinks(events: ShopeeLinkEvent[]): ShopeeCurrentLink[] {
  const newest = new Map<string, { event: ShopeeLinkEvent; at: number }>();
  for (const event of events) {
    const key = `${event.orderId}|${event.transactionId}|${event.kind}`;
    const at = Date.parse(event.changedAt);
    const held = newest.get(key);
    // A tie goes to the later event in the input, which is the order the database returns.
    if (!held || at >= held.at) newest.set(key, { event, at });
  }
  return [...newest.values()]
    .filter(({ event }) => event.action === "link")
    .map(({ event }) => ({ orderId: event.orderId, transactionId: event.transactionId, kind: event.kind }));
}

export function namesShopeePay(row: Pick<ShopeeLedgerRow, "description" | "transaction_label">): boolean {
  return /SHOPEEPAY/i.test(row.description ?? "") || /SHOPEEPAY/i.test(row.transaction_label ?? "");
}

/**
 * A repayment is a bill payment "to Shopee". A `Direct Debit` naming ShopeePay is NOT one: a second
 * bank prints ordinary bank-debit payments that way (task 63, D-273), so it stays a matchable outflow.
 */
export function isSpayLaterRepayment(
  row: Pick<ShopeeLedgerRow, "description" | "transaction_label" | "movement_minor">
): boolean {
  return BigInt(row.movement_minor) < 0n && /Payment to Shopee/i.test(row.description ?? "");
}

/** An instant as whole Bangkok wall-clock minutes since the epoch. */
function orderMinute(order: ShopeeOrderInput): number {
  return Math.floor((Date.parse(order.paidAt ?? order.placedAt) + BANGKOK_OFFSET_MS) / MS_PER_MINUTE);
}

function instantDay(iso: string): number {
  return Math.floor((Date.parse(iso) + BANGKOK_OFFSET_MS) / MS_PER_DAY);
}

function rowDay(row: ShopeeLedgerRow): number {
  const [y = 0, m = 1, d = 1] = row.source_date.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / MS_PER_DAY;
}

/** The row's Bangkok wall-clock minute, or null when the row has no time. */
function rowMinute(row: ShopeeLedgerRow): number | null {
  if (row.source_time === null) return null;
  const [y = 0, m = 1, d = 1] = row.source_date.split("-").map(Number);
  const [hh = 0, mm = 0] = row.source_time.split(":").map(Number);
  return Date.UTC(y, m - 1, d, hh, mm) / MS_PER_MINUTE;
}

export function proposeShopeeMatches(rawInput: ShopeeMatchInput): ShopeeMatchResult {
  const input = shopeeMatchInputSchema.parse(rawInput);
  const { orders, refunds, rows, overlays } = input;
  const links = currentLinks(input.linkEvents);

  // Task 64 / D-274: a row the owner Excluded is never proposed; `movement` and owner state still see all rows.
  const excluded = new Set(input.excludedTransactionIds);
  const candidateRows = rows.filter((r) => !excluded.has(r.transaction_id));

  const movement = new Map(rows.map((r) => [r.transaction_id, BigInt(r.movement_minor)]));
  const overlayByOrder = new Map(overlays.map((o) => [o.orderId, o]));
  const linkedTransactions = new Set(links.map((l) => l.transactionId));
  const takenByOwner = new Set(
    overlays.filter((o) => o.decision === "matched" && o.transactionId).map((o) => o.transactionId as string)
  );

  // Rows that can pay a bank debit at all: Shopee-named outflows that are not a repayment.
  const outflowRows = candidateRows.filter(
    (r) => namesShopeePay(r) && !isSpayLaterRepayment(r) && BigInt(r.movement_minor) < 0n
  );
  const free = (r: ShopeeLedgerRow) => !takenByOwner.has(r.transaction_id) && !linkedTransactions.has(r.transaction_id);
  const lagOf = (row: ShopeeLedgerRow, minute: number): number | null => {
    const m = rowMinute(row);
    return m === null ? null : m - minute;
  };

  const undecidedBank = orders.filter(
    (o) => o.paymentKind === "bank_debit" && !overlayByOrder.has(o.id) && BigInt(o.totalMinor) > 0n
  );

  // Automatic single match.
  const candidatesByOrder = new Map<string, ShopeeLedgerRow[]>();
  const ordersByRow = new Map<string, string[]>();
  for (const order of undecidedBank) {
    const minute = orderMinute(order);
    const total = BigInt(order.totalMinor);
    const found = outflowRows.filter((r) => {
      const lag = lagOf(r, minute);
      return free(r) && movement.get(r.transaction_id) === -total
        && lag !== null && Math.abs(lag) <= SHOPEE_MATCH_WINDOW_MINUTES;
    });
    candidatesByOrder.set(order.id, found);
    for (const r of found) ordersByRow.set(r.transaction_id, [...(ordersByRow.get(r.transaction_id) ?? []), order.id]);
  }
  const autoByOrder = new Map<string, string>();
  for (const order of undecidedBank) {
    const found = candidatesByOrder.get(order.id) ?? [];
    const only = found[0];
    if (only && found.length === 1 && ordersByRow.get(only.transaction_id)?.length === 1) {
      autoByOrder.set(order.id, only.transaction_id);
    }
  }
  const autoRows = new Set(autoByOrder.values());

  // Combined checkout: one row, several orders of the same minute, exactly one grouping.
  const combinedByOrder = new Map<string, { transactionId: string; orderIds: string[] }>();
  const groups = new Map<number, ShopeeOrderInput[]>();
  for (const order of undecidedBank) {
    if (autoByOrder.has(order.id)) continue;
    const minute = orderMinute(order);
    groups.set(minute, [...(groups.get(minute) ?? []), order]);
  }
  const combinedProposals: { transactionId: string; orderIds: string[] }[] = [];
  for (const [minute, group] of groups) {
    if (group.length < 2 || group.length > COMBINED_GROUP_CAP) continue;
    const pairs: { transactionId: string; orderIds: string[] }[] = [];
    for (const row of outflowRows) {
      const lag = lagOf(row, minute);
      if (!free(row) || autoRows.has(row.transaction_id) || lag === null
        || Math.abs(lag) > SHOPEE_MATCH_WINDOW_MINUTES) continue;
      const target = -(movement.get(row.transaction_id) as bigint);
      for (let mask = 1; mask < 1 << group.length; mask += 1) {
        let size = 0;
        let sum = 0n;
        for (let i = 0; i < group.length; i += 1) {
          if (mask & (1 << i)) { size += 1; sum += BigInt(group[i]?.totalMinor ?? "0"); }
        }
        if (size >= 2 && sum === target) {
          pairs.push({ transactionId: row.transaction_id, orderIds: group.filter((_, i) => mask & (1 << i)).map((o) => o.id) });
        }
      }
    }
    const sole = pairs[0];
    if (sole && pairs.length === 1) combinedProposals.push(sole);
  }
  // One row proposed for two minute groups is ambiguous: propose neither.
  const proposalsPerRow = new Map<string, number>();
  for (const p of combinedProposals) proposalsPerRow.set(p.transactionId, (proposalsPerRow.get(p.transactionId) ?? 0) + 1);
  const combined = combinedProposals.filter((p) => proposalsPerRow.get(p.transactionId) === 1);
  for (const p of combined) for (const id of p.orderIds) combinedByOrder.set(id, p);
  const combinedRows = new Set(combined.map((p) => p.transactionId));

  // Wallet top-ups.
  const walletOrders = orders.filter((o) => o.paymentKind === "wallet");
  const walletWindow = (order: ShopeeOrderInput): ShopeeLedgerRow[] => {
    const minute = orderMinute(order);
    return outflowRows.filter((r) => {
      const lag = lagOf(r, minute);
      return free(r)
        && movement.get(r.transaction_id) !== -SHOPEE_VIP_AMOUNT_MINOR
        && lag !== null && lag >= -SHOPEE_WALLET_TOPUP_WINDOW_MINUTES && lag <= 0
        && !autoRows.has(r.transaction_id) && !combinedRows.has(r.transaction_id);
    });
  };
  const windows = new Map(walletOrders.map((o) => [o.id, walletWindow(o).map((r) => r.transaction_id)]));
  const walletTopups: ShopeeMatchResult["walletTopups"] = [];
  for (const order of walletOrders) {
    if (overlayByOrder.has(order.id)) continue;
    if (links.some((l) => l.orderId === order.id && l.kind === "wallet_topup")) continue;
    const mine = windows.get(order.id) ?? [];
    if (mine.length === 0) continue;
    const shared = walletOrders.some(
      (other) => other.id !== order.id && (windows.get(other.id) ?? []).some((id) => mine.includes(id))
    );
    if (!shared) walletTopups.push({ orderId: order.id, transactionIds: mine });
  }

  // SPayLater repayments: always confirmed by the owner, never automatic.
  const spayOrders = orders.filter((o) => o.paymentKind === "spaylater");
  const spaylaterRepayments: ShopeeMatchResult["spaylaterRepayments"] = [];
  for (const row of candidateRows.filter(isSpayLaterRepayment)) {
    const day = rowDay(row);
    const orderIds = spayOrders
      .filter((o) => {
        const age = day - instantDay(o.paidAt ?? o.placedAt);
        return age >= SPAYLATER_REPAY_MIN_DAYS && age <= SPAYLATER_REPAY_MAX_DAYS;
      })
      .map((o) => o.id);
    spaylaterRepayments.push({
      transactionId: row.transaction_id,
      orderIds,
      preselected: orderIds.length === 1 ? orderIds : [],
      linkedOrderIds: links
        .filter((l) => l.transactionId === row.transaction_id && l.kind === "spaylater_repayment")
        .map((l) => l.orderId)
    });
  }

  // Refund deposits to a bank account.
  const refundDeposits: ShopeeMatchResult["refundDeposits"] = [];
  for (const refund of refunds) {
    if (refund.refundTo !== "bank") continue;
    if (links.some((l) => l.orderId === refund.orderId && l.kind === "refund_deposit")) continue;
    const day = instantDay(refund.requestedAt);
    const amount = BigInt(refund.refundMinor);
    const found = candidateRows.filter((r) => {
      const age = rowDay(r) - day;
      return free(r) && !autoRows.has(r.transaction_id) && !combinedRows.has(r.transaction_id)
        && movement.get(r.transaction_id) === amount && age >= 0 && age <= SHOPEE_REFUND_DEPOSIT_DAYS;
    });
    const only = found[0];
    if (only && found.length === 1) {
      refundDeposits.push({ orderId: refund.orderId, transactionId: only.transaction_id });
    }
  }

  const states: ShopeeOrderMatchState[] = orders.map((order): ShopeeOrderMatchState => {
    const overlay = overlayByOrder.get(order.id);
    if (overlay?.decision === "matched" && overlay.transactionId) {
      return { orderId: order.id, state: "matched", transactionId: overlay.transactionId, revision: overlay.revision };
    }
    if (overlay?.decision === "unmatched") return { orderId: order.id, state: "unmatched", revision: overlay.revision };
    const auto = autoByOrder.get(order.id);
    if (auto) return { orderId: order.id, state: "auto", transactionId: auto };
    const group = combinedByOrder.get(order.id);
    if (group) {
      return { orderId: order.id, state: "combined_proposed", transactionId: group.transactionId, orderIds: group.orderIds };
    }
    if (order.paymentKind === "wallet") return { orderId: order.id, state: "wallet" };
    if (order.paymentKind === "spaylater") return { orderId: order.id, state: "spaylater" };
    return { orderId: order.id, state: "none" };
  });

  return { orders: states, combined, walletTopups, spaylaterRepayments, refundDeposits };
}

/** The ledger rows an order is owner-matched or automatically matched to; nothing proposed. */
export function shopeeMatchedTransactionIds(result: ShopeeMatchResult): Set<string> {
  const ids = new Set<string>();
  for (const state of result.orders) {
    if (state.state === "matched" || state.state === "auto") ids.add(state.transactionId);
  }
  return ids;
}
