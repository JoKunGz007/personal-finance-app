import { afterAll, beforeAll, describe, expect, it, test, vi } from "vitest";
import type { ParsedReceipt } from "@/lib/receipt-text";
import { captureReceiptRequest, receiptCaptureBody, receiptCaptureSchema, receiptListSchema } from "@/lib/receipts";
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

async function list() {
  const { GET } = await import("@/app/api/v1/receipts/route");
  const response = await GET();
  return { status: response.status, body: await response.json() };
}

// The cleanup helper deletes by account id and needs at least one; this suite creates none.
const NO_ACCOUNT = "cccccccc-0000-4000-8000-000000000056";
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
});
