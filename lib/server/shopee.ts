import { z } from "zod";
import type { strongOwnerClient } from "@/lib/server/supabase";
import { readAll } from "@/lib/server/row-cap";
import {
  currentLinks, proposeShopeeMatches, shopeeLedgerRowSchema, shopeeLinkKindSchema,
  type ShopeeOrderMatchState
} from "@/lib/shopee-match";
import { shopeeSummarySchema, type ShopeeView } from "@/lib/shopee-view";

/**
 * The Shopee page's read (PLAN task 62 step 4b, D-270): every stored order with its breakdown,
 * the owner's stored say, and the proposals `proposeShopeeMatches` computes at read time from
 * `public.shopee_ledger_rows()`. Nothing automatic is stored. Like the delivery loader, a read
 * that failed, was cut at PostgREST's max_rows, or is off-contract is a refusal, never a shorter
 * list: "no row" would be a claim about the ledger the page had not read.
 */
type OwnerClient = Extract<Awaited<ReturnType<typeof strongOwnerClient>>, { ok: true }>["supabase"];
type Refusal = { ok: false; message: string; status: number };

// bigint arrives as a JS number from PostgREST (D-018); money is stringified before it leaves.
const money = z.union([z.number().int(), z.string().regex(/^-?\d+$/)]).transform(String);
const uuid = z.string().uuid();
const instant = z.string().datetime({ offset: true });

const orderRow = z.object({
  id: uuid, order_code: z.string(), link_id: z.string(), placed_at: instant, paid_at: instant.nullable(),
  shop: z.string(), payment_method: z.string(),
  payment_kind: z.enum(["bank_debit", "wallet", "spaylater", "other"]), total_minor: money
});
const itemRow = z.object({
  order_id: uuid, position: z.number().int(), name: z.string(), variation: z.string().nullable(),
  quantity: z.number().int(), price_minor: money.nullable(), original_price_minor: money.nullable()
});
const priceLineRow = z.object({ order_id: uuid, position: z.number().int(), label: z.string(), amount_minor: money });
const refundRow = z.object({
  order_id: uuid, request_id: z.string(), requested_at: instant, refund_minor: money,
  refund_to: z.enum(["wallet", "bank"]), requested_by: z.enum(["buyer", "shopee"]),
  reason: z.string().nullable(), steps: z.array(z.string())
});
const overlayRow = z.object({
  order_id: uuid, decision: z.enum(["matched", "unmatched"]), transaction_id: uuid.nullable(),
  revision: z.number().int().nonnegative()
});
const linkRow = z.object({
  order_id: uuid, transaction_id: uuid, kind: shopeeLinkKindSchema, action: z.enum(["link", "unlink"]), changed_at: instant
});

const byPosition = <T extends { position: number }>(a: T, b: T) => a.position - b.position;

export async function loadShopeeView(supabase: OwnerClient): Promise<({ ok: true } & { view: ShopeeView }) | Refusal> {
  const all = <Row>(table: string, columns: string) => readAll<Row>((from, to) =>
    supabase.from(table).select(columns, { count: "exact" }).order("id", { ascending: true }).range(from, to));
  const [orders, items, priceLines, refunds, overlays, links, ledger, summary] = await Promise.all([
    all("shopee_orders", "id,order_code,link_id,placed_at,paid_at,shop,payment_method,payment_kind,total_minor"),
    all("shopee_order_items", "id,order_id,position,name,variation,quantity,price_minor,original_price_minor"),
    all("shopee_order_price_lines", "id,order_id,position,label,amount_minor"),
    all("shopee_refunds", "id,order_id,request_id,requested_at,refund_minor,refund_to,requested_by,reason,steps"),
    // The overlay's key is its order id.
    readAll((from, to) => supabase.from("shopee_payment_match_overlays")
      .select("order_id,decision,transaction_id,revision", { count: "exact" })
      .order("order_id", { ascending: true }).range(from, to)),
    // By id: a tie in time is settled by the later id, as the database settles it (migration 055).
    all("shopee_order_links", "id,order_id,transaction_id,kind,action,changed_at"),
    readAll((from, to) => supabase.rpc("shopee_ledger_rows", undefined, { count: "exact" })
      .order("transaction_id", { ascending: true }).range(from, to)),
    // One jsonb document, computed in SQL (migration 057): not a paged table read.
    supabase.rpc("shopee_monthly_summary")
  ]);

  if (!orders.ok || !items.ok || !priceLines.ok || !refunds.ok || !overlays.ok || !links.ok || !ledger.ok || summary.error) {
    return { ok: false, message: "Shopee orders could not be loaded in full, so none are shown.", status: 500 };
  }
  const p = {
    orders: z.array(orderRow).safeParse(orders.data),
    items: z.array(itemRow).safeParse(items.data),
    priceLines: z.array(priceLineRow).safeParse(priceLines.data),
    refunds: z.array(refundRow).safeParse(refunds.data),
    overlays: z.array(overlayRow).safeParse(overlays.data),
    links: z.array(linkRow).safeParse(links.data),
    // A bigint movement arrives as a JS number from PostgREST (D-018); the contract takes int64 text.
    ledger: z.array(shopeeLedgerRowSchema).safeParse(ledger.data.map((row) => {
      const r = row as { movement_minor?: unknown };
      return typeof r.movement_minor === "number" ? { ...r, movement_minor: String(r.movement_minor) } : r;
    })),
    summary: shopeeSummarySchema.safeParse(summary.data)
  };
  if (!p.summary.success || !p.orders.success || !p.items.success || !p.priceLines.success || !p.refunds.success
    || !p.overlays.success || !p.links.success || !p.ledger.success) {
    return { ok: false, message: "Shopee orders could not be matched to the ledger, so none are shown.", status: 500 };
  }

  let proposals: ReturnType<typeof proposeShopeeMatches>;
  try {
    proposals = proposeShopeeMatches({
      orders: p.orders.data.map((o) => ({
        id: o.id, orderCode: o.order_code, placedAt: o.placed_at, paidAt: o.paid_at,
        paymentKind: o.payment_kind, totalMinor: o.total_minor
      })),
      refunds: p.refunds.data.map((r) => ({
        orderId: r.order_id, requestedAt: r.requested_at, refundMinor: r.refund_minor, refundTo: r.refund_to
      })),
      rows: p.ledger.data,
      overlays: p.overlays.data.map((o) => ({
        orderId: o.order_id, decision: o.decision, transactionId: o.transaction_id, revision: o.revision
      })),
      linkEvents: p.links.data.map((l) => ({
        orderId: l.order_id, transactionId: l.transaction_id, kind: l.kind, action: l.action, changedAt: l.changed_at
      }))
    });
  } catch {
    return { ok: false, message: "Shopee orders could not be matched to the ledger, so none are shown.", status: 500 };
  }

  const stateByOrder = new Map<string, ShopeeOrderMatchState>(proposals.orders.map((s) => [s.orderId, s]));
  const group = <T extends { order_id: string }>(rows: T[]) => {
    const map = new Map<string, T[]>();
    for (const row of rows) map.set(row.order_id, [...(map.get(row.order_id) ?? []), row]);
    return map;
  };
  const itemsBy = group(p.items.data);
  const linesBy = group(p.priceLines.data);
  const refundsBy = group(p.refunds.data);

  const matchOf = (state: ShopeeOrderMatchState | undefined): ShopeeView["orders"][number]["match"] => {
    if (!state) return { state: "none", transactionId: null, revision: 0 };
    if (state.state === "matched") return { state: "matched", transactionId: state.transactionId, revision: state.revision };
    if (state.state === "unmatched") return { state: "unmatched", transactionId: null, revision: state.revision };
    if (state.state === "auto" || state.state === "combined_proposed") {
      return { state: state.state, transactionId: state.transactionId, revision: 0 };
    }
    return { state: state.state, transactionId: null, revision: 0 };
  };

  const shown = [...p.orders.data]
    .sort((a, b) => Date.parse(b.paid_at ?? b.placed_at) - Date.parse(a.paid_at ?? a.placed_at) || a.id.localeCompare(b.id))
    .map((o) => ({
      id: o.id,
      orderCode: o.order_code,
      linkId: o.link_id,
      orderUrl: `https://shopee.co.th/user/purchase/order/${o.link_id}`,
      placedAt: o.placed_at,
      paidAt: o.paid_at,
      shop: o.shop,
      paymentMethod: o.payment_method,
      paymentKind: o.payment_kind,
      totalMinor: o.total_minor,
      items: [...(itemsBy.get(o.id) ?? [])].sort(byPosition).map((i) => ({
        position: i.position, name: i.name, variation: i.variation, quantity: i.quantity,
        priceMinor: i.price_minor, originalPriceMinor: i.original_price_minor
      })),
      priceLines: [...(linesBy.get(o.id) ?? [])].sort(byPosition).map((l) => ({
        position: l.position, label: l.label, amountMinor: l.amount_minor
      })),
      refunds: [...(refundsBy.get(o.id) ?? [])]
        .sort((a, b) => Date.parse(a.requested_at) - Date.parse(b.requested_at) || a.request_id.localeCompare(b.request_id))
        .map((r) => ({
          requestId: r.request_id, requestedAt: r.requested_at, refundMinor: r.refund_minor, refundTo: r.refund_to,
          requestedBy: r.requested_by, reason: r.reason, steps: r.steps
        })),
      match: matchOf(stateByOrder.get(o.id))
    }));

  const current = currentLinks(p.links.data.map((l) => ({
    orderId: l.order_id, transactionId: l.transaction_id, kind: l.kind, action: l.action, changedAt: l.changed_at
  })));

  // Only the rows something refers to: a state, a proposal or a current link.
  const referenced = new Set<string>();
  for (const order of shown) if (order.match.transactionId) referenced.add(order.match.transactionId);
  for (const c of proposals.combined) referenced.add(c.transactionId);
  for (const w of proposals.walletTopups) for (const id of w.transactionIds) referenced.add(id);
  for (const s of proposals.spaylaterRepayments) referenced.add(s.transactionId);
  for (const r of proposals.refundDeposits) referenced.add(r.transactionId);
  for (const l of current) referenced.add(l.transactionId);
  const rows: ShopeeView["rows"] = {};
  for (const row of p.ledger.data) {
    if (!referenced.has(row.transaction_id)) continue;
    rows[row.transaction_id] = {
      id: row.transaction_id, date: row.source_date, time: row.source_time, label: row.transaction_label,
      description: row.description, movement: row.movement_minor
    };
  }

  return {
    ok: true,
    view: {
      summary: p.summary.data,
      orders: shown,
      rows,
      combined: proposals.combined,
      walletTopups: proposals.walletTopups,
      spaylaterRepayments: proposals.spaylaterRepayments,
      refundDeposits: proposals.refundDeposits,
      links: current
    }
  };
}
