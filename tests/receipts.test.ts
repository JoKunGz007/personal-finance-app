import { afterAll, beforeAll, describe, expect, it, test, vi } from "vitest";
import type { ParsedReceipt } from "@/lib/receipt-text";
import { captureReceiptRequest, receiptCaptureBody, receiptCaptureSchema, receiptListSchema, receiptsOnRows, type StoredReceipt } from "@/lib/receipts";
import { receiptStatisticsSchema } from "@/lib/receipt-statistics";
import {
  API, OWNER_EMAIL, PUBLISHABLE, containerReachable, ownerId as lookupOwnerId,
  ownerSession, psql, resetOwnerImportSurface
} from "./helpers/local-owner";

// Every value is invented (docs/FIXTURE_POLICY.md). The pair below is one purchase read from
// its two PDF forms, shaped as the reader returns them: the condensed form carries the payment
// method, time and unit count; the full invoice carries longer names, the VAT breakdown and the
// condensed number it replaces — and its own number is a different, lettered series.

const condensed: ParsedReceipt = {
  receiptNumber: "00012",
  storeCode: "30219",
  branchName: "สาขาทดสอบ",
  purchasedAt: "2026-06-12",
  purchasedAtTime: "14:35",
  paymentMethod: "เงินสด",
  items: [
    { lineNo: 2, quantity: 2, name: "ขนมปังไส้ครีมรสช็", unitPriceMinor: "1500", amountMinor: "3000", vatExempt: false, isPromotion: false },
    { lineNo: 3, quantity: 1, name: "น้ำดื่ม", unitPriceMinor: null, amountMinor: "1000", vatExempt: true, isPromotion: false }
  ],
  discounts: ["500"],
  subtotalMinor: "4000",
  netMinor: "3500",
  unitCount: 3,
  vat: null,
  vatCode: null,
  supersedesReceiptNumber: null,
  completeness: "complete",
  failedChecks: [],
  inapplicableChecks: ["VAT_IDENTITY_CHECK"]
};

const full: ParsedReceipt = {
  ...condensed,
  receiptNumber: "F1000123",
  purchasedAtTime: null,
  paymentMethod: null,
  items: [
    { ...condensed.items[0]!, name: "ขนมปังไส้ครีมรสช็อกโกแลต" },
    { ...condensed.items[1]!, unitPriceMinor: "1000" }
  ],
  unitCount: null,
  vat: { preVatMinor: "3271", vatMinor: "229", totalInclVatMinor: "3500" },
  vatCode: "0105536000000",
  supersedesReceiptNumber: "0000000012",
  inapplicableChecks: ["UNIT_COUNT_CHECK"]
};

describe("receipts on ledger rows", () => {
  const row = (id: string) => ({ transaction_id: id, source_date: "2026-06-12", source_time: "14:36", account_id: "cccccccc-0000-4000-8000-000000000001", transaction_label: "SIPI", description: "Invented", lag_minutes: 1, names_true_money: true });
  const receipt = (id: string, status: StoredReceipt["match"]["status"], rowId: string | null) =>
    ({ id, match: { status, row: rowId ? row(rowId) : null, options: [], revision: 0 } }) as unknown as StoredReceipt;

  it("keys matched and linked receipts by their row, and leaves every other state off the ledger", () => {
    const pairs = receiptsOnRows([
      receipt("r1", "matched", "t1"),
      receipt("r2", "linked", "t2"),
      receipt("r3", "declined", null),
      receipt("r4", "ambiguous", null),
      receipt("r5", "none", null)
    ]);
    expect(pairs.map(([rowId, stored]) => [rowId, stored.id])).toEqual([["t1", "r1"], ["t2", "r2"]]);
  });

  it("drops a link whose row the candidate read did not return, rather than guessing it", () => {
    expect(receiptsOnRows([receipt("r1", "linked", null)])).toEqual([]);
  });
});

describe("receipt capture contract", () => {
  test("a full invoice is keyed on the condensed number it replaces, never its own", () => {
    const request = captureReceiptRequest(receiptCaptureSchema.parse(receiptCaptureBody("full", full)));
    expect(request.receiptNumber).toBe("0000000012");
    expect(request.source).toBe("full");
    expect(request.vatTotalMinor).toBe("3500");
  });

  test("completeness is recomputed from the fields, not taken from the device", () => {
    const tampered = { ...condensed, netMinor: "9900", completeness: "complete" as const };
    const request = captureReceiptRequest(receiptCaptureSchema.parse(receiptCaptureBody("condensed", tampered)));
    expect(request.completeness).toBe("partial");
    expect(request.failedChecks).toEqual(["NET_CHECK"]);
  });

  test("the device cannot send its own completeness at all", () => {
    const body = receiptCaptureBody("condensed", condensed);
    expect(receiptCaptureSchema.safeParse({ ...body, completeness: "complete" }).success).toBe(false);
    expect(receiptCaptureSchema.safeParse({ ...body, receipt: { ...body.receipt, completeness: "complete" } }).success).toBe(false);
  });

  test("a parse carrying a field its form never prints is refused", () => {
    expect(receiptCaptureSchema.safeParse(receiptCaptureBody("condensed", { ...condensed, vat: full.vat })).success).toBe(false);
    expect(receiptCaptureSchema.safeParse(receiptCaptureBody("full", { ...full, supersedesReceiptNumber: null })).success).toBe(false);
    expect(receiptCaptureSchema.safeParse(receiptCaptureBody("full", { ...full, paymentMethod: "เงินสด" })).success).toBe(false);
  });

  test("a date a Buddhist year out, or in the future, is refused", () => {
    expect(receiptCaptureSchema.safeParse(receiptCaptureBody("condensed", { ...condensed, purchasedAt: "2569-06-12" })).success).toBe(false);
    expect(receiptCaptureSchema.safeParse(receiptCaptureBody("condensed", { ...condensed, purchasedAt: "1483-06-12" })).success).toBe(false);
  });

  test("a screenshot carries the short receipt's fields and no others", () => {
    const request = captureReceiptRequest(receiptCaptureSchema.parse(receiptCaptureBody("screenshot", condensed)));
    expect(request.source).toBe("screenshot");
    expect(request.receiptNumber).toBe("00012");
    expect(receiptCaptureSchema.safeParse(receiptCaptureBody("screenshot", { ...condensed, vat: full.vat })).success).toBe(false);
  });

  test("money must be canonical minor-unit text", () => {
    expect(receiptCaptureSchema.safeParse(receiptCaptureBody("condensed", { ...condensed, netMinor: "35.00" })).success).toBe(false);
  });
});

const reachable = containerReachable();
const jar = vi.hoisted(() => new Map<string, string>());

vi.mock("next/headers", () => ({
  cookies: async () => ({
    getAll: () => [...jar].map(([name, value]) => ({ name, value })),
    get: (name: string) => jar.has(name) ? { name, value: jar.get(name)! } : undefined,
    set: (name: string, value: string) => { jar.set(name, value); }
  })
}));

async function post(body: unknown) {
  const { POST } = await import("@/app/api/v1/receipts/route");
  const response = await POST(new Request("http://localhost/api/v1/receipts", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
  }));
  return { status: response.status, body: await response.json() };
}

async function putMatch(receiptId: string, body: unknown) {
  const { PUT } = await import("@/app/api/v1/receipts/[id]/match/route");
  const response = await PUT(new Request(`http://localhost/api/v1/receipts/${receiptId}/match`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
  }), { params: Promise.resolve({ id: receiptId }) });
  return { status: response.status, body: await response.json() };
}

async function list() {
  const { GET } = await import("@/app/api/v1/receipts/route");
  const response = await GET();
  return { status: response.status, body: await response.json() };
}

// The one account this suite seeds, for the match tests; the cleanup helper deletes by it.
const NO_ACCOUNT = "cccccccc-0000-4000-8000-000000000056";
const ROW_TRUE_MONEY = "dddddddd-0000-4000-8000-000000000561";
const ROW_OTHER_AMOUNT = "dddddddd-0000-4000-8000-000000000562";
let owner = "";

describe.skipIf(!reachable)("receipts route", () => {
  beforeAll(async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", API);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", PUBLISHABLE);
    vi.stubEnv("OWNER_GOOGLE_EMAIL", OWNER_EMAIL);
    owner = lookupOwnerId();
    const cleaned = resetOwnerImportSurface(owner, [NO_ACCOUNT]);
    expect(cleaned.ok, `cleanup failed: ${cleaned.output}`).toBe(true);

    jar.clear();
    const { createServerClient } = await import("@supabase/ssr");
    const writer = createServerClient(API, PUBLISHABLE, {
      cookies: {
        getAll: () => [...jar].map(([name, value]) => ({ name, value })),
        setAll: (values) => values.forEach(({ name, value }) => jar.set(name, value))
      }
    });
    const { error } = await writer.auth.setSession(await ownerSession());
    if (error) throw new Error(`could not store the session: ${error.message}`);
  }, 120_000);

  afterAll(() => {
    vi.unstubAllEnvs();
    resetOwnerImportSurface(owner, [NO_ACCOUNT]);
  });

  it("stores the condensed form, then merges the full invoice of the same purchase into it", async () => {
    const first = await post(receiptCaptureBody("condensed", condensed));
    expect(first.status, JSON.stringify(first.body)).toBe(201);

    const second = await post(receiptCaptureBody("full", full));
    expect(second.status, JSON.stringify(second.body)).toBe(200);
    expect(second.body).toMatchObject({ captured: false, merged: true, itemsReplaced: true });

    const read = await list();
    expect(read.status).toBe(200);
    const parsed = receiptListSchema.parse(read.body);
    expect(parsed.receipts).toHaveLength(1);
    const stored = parsed.receipts[0]!;
    expect(stored.receipt_number).toBe("12");
    expect(stored.sources).toEqual(["condensed", "full"]);
    // The full invoice's longer names won, and the condensed form's payment and time survived.
    expect(stored.items.map((item) => item.name)).toEqual(["ขนมปังไส้ครีมรสช็อกโกแลต", "น้ำดื่ม"]);
    expect(stored.payment_method).toBe("เงินสด");
    expect(stored.purchased_at_time).toMatch(/^14:35/);
    expect(stored.net_minor).toBe("3500");
    expect(stored.discounts).toEqual([{ position: 0, amount_minor: "500" }]);
  });

  it("refuses a second reading that disagrees about the money, and changes nothing", async () => {
    const disagreeing = { ...condensed, netMinor: "3400", discounts: ["600"] };
    const response = await post(receiptCaptureBody("condensed", disagreeing));
    expect(response.status, JSON.stringify(response.body)).toBe(409);
    const stored = receiptListSchema.parse((await list()).body).receipts[0]!;
    expect(stored.net_minor).toBe("3500");
  });

  it("refuses a malformed body before the database sees it", async () => {
    const response = await post({ form: "condensed", receipt: { receiptNumber: "1" } });
    expect(response.status).toBe(422);
    expect(psql(`select count(*) from public.receipts where owner_id = '${owner}';`).output.trim()).toBe("1");
  });

  it("reads statistics over the stored receipt, on contract", async () => {
    const { GET } = await import("@/app/api/v1/receipts/statistics/route");
    const response = await GET();
    expect(response.status).toBe(200);
    const stats = receiptStatisticsSchema.parse(await response.json());
    expect(stats.totals).toMatchObject({ receipts: 1, net: "3500", units: 3, itemSpend: "4000", discounts: "500", partialReceipts: 0 });
    expect(stats.mostBought[0]).toEqual({ name: "ขนมปังไส้ครีมรสช็อกโกแลต", quantity: 2, spend: "3000", receipts: 1 });
    expect(stats.paymentMethods).toEqual([{ method: "เงินสด", receipts: 1, net: "3500" }]);
  });

  it("reads no ledger row as none, then matches the TRUE MONEY row once it exists", async () => {
    const before = receiptListSchema.parse((await list()).body).receipts[0]!;
    expect(before.match).toMatchObject({ status: "none", row: null, options: [], revision: 0 });

    // One minute after the invented purchase, of its exact net; and a row of another amount.
    const seeded = psql(`
      set session_replication_role = replica;
      insert into public.accounts(id, owner_id, bank_code, label, account_type, last_four, currency, timezone)
      values ('${NO_ACCOUNT}', '${owner}', 'SCB', 'Invented receipt account', 'savings', '5656', 'THB', 'Asia/Bangkok');
      insert into public.source_transactions(id, owner_id, account_id, fingerprint_version, fingerprint, source_date, source_time,
        effective_date, transaction_label, description, post_balance_minor, currency)
      values
        ('${ROW_TRUE_MONEY}', '${owner}', '${NO_ACCOUNT}', 'fingerprint-v1', repeat('5', 64), '2026-06-12', '14:36', '2026-06-12',
         'SIPI', 'SIPS TRUE MONEY CO.,LTD. NOTE : -', 100000, 'THB'),
        ('${ROW_OTHER_AMOUNT}', '${owner}', '${NO_ACCOUNT}', 'fingerprint-v1', repeat('6', 64), '2026-06-12', '14:40', '2026-06-12',
         'SIPI', 'SIPS TRUE MONEY CO.,LTD. NOTE : -', 90000, 'THB');
      insert into public.source_components(owner_id, transaction_id, position, kind, amount_minor, currency)
      values ('${owner}', '${ROW_TRUE_MONEY}', 1, 'withdrawal', -3500, 'THB'),
             ('${owner}', '${ROW_OTHER_AMOUNT}', 1, 'withdrawal', -9999, 'THB');
    `);
    expect(seeded.ok, seeded.output).toBe(true);

    const after = receiptListSchema.parse((await list()).body).receipts[0]!;
    expect(after.match).toMatchObject({ status: "matched", row: { transaction_id: ROW_TRUE_MONEY, lag_minutes: 1 }, revision: 0 });
    expect(after.match.options.map((option) => option.transaction_id)).toEqual([ROW_TRUE_MONEY]);
  });

  it("stores the owner's decline and link, and refuses a row whose amount differs", async () => {
    const receipt = receiptListSchema.parse((await list()).body).receipts[0]!;

    const declined = await putMatch(receipt.id, { expectedRevision: 0, decision: "unmatched", transactionId: null });
    expect(declined.status, JSON.stringify(declined.body)).toBe(200);
    expect(receiptListSchema.parse((await list()).body).receipts[0]!.match).toMatchObject({ status: "declined", row: null, revision: 1 });

    const stale = await putMatch(receipt.id, { expectedRevision: 0, decision: "matched", transactionId: ROW_TRUE_MONEY });
    expect(stale.status).toBe(409);

    const wrong = await putMatch(receipt.id, { expectedRevision: 1, decision: "matched", transactionId: ROW_OTHER_AMOUNT });
    expect(wrong.status).toBe(422);
    expect(wrong.body.error).toContain("amount");

    const linked = await putMatch(receipt.id, { expectedRevision: 1, decision: "matched", transactionId: ROW_TRUE_MONEY });
    expect(linked.status, JSON.stringify(linked.body)).toBe(200);
    expect(linked.body.match).toMatchObject({ decision: "matched", transaction_id: ROW_TRUE_MONEY, revision: 2 });
    expect(receiptListSchema.parse((await list()).body).receipts[0]!.match).toMatchObject({ status: "linked", row: { transaction_id: ROW_TRUE_MONEY } });
  });

  it("refuses a malformed decision before the database sees it", async () => {
    const receipt = receiptListSchema.parse((await list()).body).receipts[0]!;
    expect((await putMatch(receipt.id, { expectedRevision: 2, decision: "matched", transactionId: null })).status).toBe(422);
    expect((await putMatch("not-a-uuid", { expectedRevision: 0, decision: "unmatched", transactionId: null })).status).toBe(400);
  });
});
