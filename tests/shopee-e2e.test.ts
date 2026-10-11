import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { confirmationDigest, rowFingerprint } from "@/lib/canonical";
import { assembleImportPayload } from "@/lib/import-assembly";
import { extractStatement } from "@/lib/krungthai-layout";
import { loadShopeeView } from "@/lib/server/shopee";
import { parseShopeeExport, SHOPEE_SOURCE } from "@/lib/shopee-import";
import { validStatement } from "./fixtures/krungthai-layout-v1";
import {
  API, PUBLISHABLE, api, containerReachable, ownerId as lookupOwnerId,
  ownerSession, psql, resetOwnerImportSurface
} from "./helpers/local-owner";

// Real authenticated round trip for the Shopee import (PLAN task 62): the seeded ledger rows go
// in through confirm_import, the invented export through the real parser and capture_shopee_orders,
// and the page's read through the real loader with an owner-token client. All values are invented.
const ACCOUNT_ID = "cccccccc-0000-4000-8000-000000000062";
const SIPS = "SIPS SHOPEEPAY (THAILAND) CO.,LTD.";

const reachable = containerReachable();
let ownerId = "";
let token = "";

type SeedRow = { date: string; time: string; label: string; description: string; amount: number };

async function seedLedger(rows: SeedRow[]) {
  const extracted = extractStatement(validStatement);
  if (!extracted.ok) throw new Error(extracted.message);
  const assembled = assembleImportPayload(extracted.frame, extracted.rows, {
    accountId: ACCOUNT_ID, bankCode: extracted.frame.bankCode, lastFour: extracted.frame.accountLastFour, currency: "THB"
  });
  if (!assembled.ok) throw new Error(assembled.message);
  const base = assembled.payload.rows[0]!;
  const opening = 1_000_000;
  let balance = opening;
  const rpcRows = [];
  for (const [index, row] of rows.entries()) {
    balance += row.amount;
    const candidate = {
      ...base,
      sourceDate: row.date, sourceTime: row.time, effectiveDate: row.date,
      transactionLabel: row.label, description: row.description, reference: null, branch: null,
      components: [{ kind: row.amount < 0 ? ("withdrawal" as const) : ("deposit" as const), amount: { minor: String(row.amount), currency: "THB" as const } }],
      postBalance: { minor: String(balance), currency: "THB" as const },
      provenance: { page: 1, row: index + 1, parserFields: {} }
    };
    const fingerprint = await rowFingerprint(ACCOUNT_ID, "KTB", candidate);
    rpcRows.push({ ...candidate, fingerprint, sourceIndex: index + 1 });
  }
  const periodStart = rows[0]!.date;
  const periodEnd = rows[rows.length - 1]!.date;
  const digest = await confirmationDigest({
    accountId: ACCOUNT_ID, contractVersion: "krungthai-layout-v1", currency: "THB",
    periodStart, periodEnd, openingBalanceMinor: String(opening), closingBalanceMinor: String(balance)
  }, rpcRows);
  const response = await api("/rest/v1/rpc/confirm_import", {
    method: "POST", token,
    body: JSON.stringify({
      p_account_id: ACCOUNT_ID, p_artifact_digest: "e".repeat(64), p_payload_digest: digest,
      p_idempotency_key: randomUUID(), p_contract_version: "krungthai-layout-v1",
      p_period_start: periodStart, p_period_end: periodEnd,
      p_opening_balance_minor: String(opening), p_closing_balance_minor: String(balance),
      p_currency: "THB", p_rows: rpcRows
    })
  });
  expect(response.status, response.body).toBe(200);
}

function rpc(name: string, args: unknown) {
  return api(`/rest/v1/rpc/${name}`, { method: "POST", token, body: JSON.stringify(args) });
}

const sequence = () =>
  psql(`select sequence from public.mutation_sequences where owner_id = '${ownerId}';`).output.trim();

function order(code: string, link: string, placed: string, paid: string | null, total: string, method: string, extra: Record<string, unknown> = {}) {
  return {
    orderId: code,
    url: `https://shopee.co.th/user/purchase/order/${link}`,
    timeline: paid ? { "Order Placed": placed, "Order Paid": paid } : { "Order Placed": placed },
    orderTotal: total,
    paymentMethod: method,
    itemPriceIs: "line total",
    priceRows: [{ label: "Merchandise Subtotal", amount: total }],
    shops: [{ name: "Invented Shop", items: [{ name: "Invented item", variation: null, qty: 1, price: total, originalPrice: null }] }],
    ...extra
  };
}

const BANK = "ShopeePay - ตัดบัญชีธนาคาร";

function buildExport(singleTotal = "250.00") {
  return {
    source: SHOPEE_SOURCE,
    version: 2,
    orders: [
      // Single order with a gift line that prints no price.
      order("EXA1000000001", "100000000000001", "10-06-2026 10:15", "10-06-2026 10:15", singleTotal, BANK, {
        shops: [{ name: "Invented Shop", items: [
          { name: "Invented item", variation: null, qty: 1, price: singleTotal, originalPrice: null },
          { name: "Invented gift", variation: null, qty: 1, price: null, originalPrice: null }
        ] }]
      }),
      // Two orders of one checkout minute.
      order("EXB2000000002", "100000000000002", "12-06-2026 14:30", "12-06-2026 14:30", "120.00", BANK),
      order("EXC3000000003", "100000000000003", "12-06-2026 14:30", "12-06-2026 14:30", "80.50", BANK),
      // Wallet order, cancelled, refunded to the wallet.
      order("EXD4000000004", "100000000000004", "14-06-2026 09:00", "14-06-2026 09:00", "50.00", "ShopeePay", {
        cancellation: {
          orderId: "EXD4000000004", requestId: "REQ4000000004", requestedAt: "14-06-2026 09:30",
          refundAmount: "50.00", refundTo: "ShopeePay Balance", requestedBy: "Buyer", reason: "Invented reason",
          steps: ["Cancellation Requested", "Refunded"]
        }
      }),
      // Dated before the ledger's first row.
      order("EXE5000000005", "100000000000005", "20-05-2026 08:00", "20-05-2026 08:00", "30.00", BANK)
    ]
  };
}

function parsed(json: unknown) {
  const result = parseShopeeExport(json);
  if (!result.ok) throw new Error(result.reason);
  expect(result.refused).toEqual([]);
  return result.orders;
}

describe.skipIf(!reachable)("Shopee import against the local database", () => {
  beforeAll(async () => {
    ownerId = lookupOwnerId();
    expect(ownerId).toMatch(/^[0-9a-f-]{36}$/);
    const cleaned = resetOwnerImportSurface(ownerId, [ACCOUNT_ID]);
    expect(cleaned.ok, `cleanup failed: ${cleaned.output}`).toBe(true);
    const setup = psql(`
      insert into public.accounts(id, owner_id, bank_code, label, account_type, last_four, currency, timezone)
        values ('${ACCOUNT_ID}', '${ownerId}', 'KTB', 'E2E shopee', 'savings', '7890', 'THB', 'Asia/Bangkok');
    `);
    expect(setup.ok, `setup failed: ${setup.output}`).toBe(true);
    token = (await ownerSession()).access_token;
    await seedLedger([
      { date: "2026-06-01", time: "09:00", label: "Card payment", description: "INVENTED EARLIER ROW", amount: -10000 },
      { date: "2026-06-10", time: "10:15", label: "SIPI", description: SIPS, amount: -25000 },
      { date: "2026-06-12", time: "14:30", label: "SIPI", description: SIPS, amount: -20050 }
    ]);
  }, 120_000);

  afterAll(() => {
    resetOwnerImportSurface(ownerId, [ACCOUNT_ID]);
  });

  let ids: Record<string, string> = {};
  let combinedRow = "";

  it("captures new orders, then recognises them all on replay without moving the sequence", async () => {
    const orders = parsed(buildExport());
    expect(orders).toHaveLength(5);

    const first = await rpc("capture_shopee_orders", { p_request: { orders } });
    expect(first.status, first.body).toBe(200);
    expect(first.json()).toEqual({ new: 4, stored: 0, beforeLedger: 1, refundsNew: 1, refundsStored: 0, refused: [] });

    const before = sequence();
    const second = await rpc("capture_shopee_orders", { p_request: { orders } });
    expect(second.status, second.body).toBe(200);
    expect(second.json()).toEqual({ new: 0, stored: 4, beforeLedger: 1, refundsNew: 0, refundsStored: 1, refused: [] });
    expect(sequence()).toBe(before);

    const gift = psql(`select count(*) from public.shopee_order_items where owner_id = '${ownerId}' and price_minor is null;`);
    expect(gift.output.trim()).toBe("1");
  }, 60_000);

  it("refuses an order whose facts changed and stores the rest", async () => {
    const orders = parsed(buildExport("260.00"));
    const response = await rpc("capture_shopee_orders", { p_request: { orders } });
    expect(response.status, response.body).toBe(200);
    expect(response.json()).toMatchObject({ new: 0, stored: 3, beforeLedger: 1, refundsNew: 0, refundsStored: 1 });
    expect(response.json().refused).toEqual([{ orderCode: "EXA1000000001", reason: "differs from the stored order" }]);
  });

  async function view() {
    const client = createClient(API, PUBLISHABLE, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } }
    });
    // The loader types its client as the server one; the same supabase-js surface.
    const result = await loadShopeeView(client as unknown as Parameters<typeof loadShopeeView>[0]);
    if (!result.ok) throw new Error(`${result.status} ${result.message}`);
    const byCode = Object.fromEntries(result.view.orders.map((o) => [o.orderCode, o]));
    ids = Object.fromEntries(result.view.orders.map((o) => [o.orderCode, o.id]));
    return { view: result.view, byCode };
  }

  it("loads the page: the single order is auto, the same-minute pair is a combined proposal", async () => {
    const { view: v, byCode } = await view();
    expect(v.orders).toHaveLength(4);
    expect(byCode.EXA1000000001!.match.state).toBe("auto");
    expect(byCode.EXB2000000002!.match.state).toBe("combined_proposed");
    expect(byCode.EXC3000000003!.match.state).toBe("combined_proposed");
    expect(byCode.EXB2000000002!.match.transactionId).toBe(byCode.EXC3000000003!.match.transactionId);
    expect(byCode.EXA1000000001!.items.map((i) => i.priceMinor)).toEqual(["25000", null]);
    expect(byCode.EXD4000000004!.refunds).toHaveLength(1);
    combinedRow = byCode.EXB2000000002!.match.transactionId!;
  });

  it("confirms the combined pair, refuses to undo half, then undoes both", async () => {
    const pair = (revision: number) => [
      { orderId: ids.EXB2000000002, expectedRevision: revision },
      { orderId: ids.EXC3000000003, expectedRevision: revision }
    ];
    const confirm = await rpc("set_shopee_payment_match", { p_transaction_id: combinedRow, p_orders: pair(0), p_decision: "matched" });
    expect(confirm.status, confirm.body).toBe(200);
    let { byCode } = await view();
    expect(byCode.EXB2000000002!.match).toMatchObject({ state: "matched", revision: 1 });
    expect(byCode.EXC3000000003!.match).toMatchObject({ state: "matched", revision: 1 });

    const half = await rpc("set_shopee_payment_match", {
      p_transaction_id: null, p_orders: [{ orderId: ids.EXB2000000002, expectedRevision: 1 }], p_decision: "unmatched"
    });
    expect(half.status).not.toBe(200);
    expect(half.body).toContain("combined shopee match must be undone whole");

    const undo = await rpc("set_shopee_payment_match", { p_transaction_id: null, p_orders: pair(1), p_decision: "unmatched" });
    expect(undo.status, undo.body).toBe(200);
    ({ byCode } = await view());
    expect(byCode.EXB2000000002!.match.state).toBe("unmatched");
    expect(byCode.EXC3000000003!.match.state).toBe("unmatched");
  });
});
