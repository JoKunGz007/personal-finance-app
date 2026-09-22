import { z } from "zod";
import { bangkokToday, dayNumber, isoDateSchema } from "@/lib/dates";
import { minorUnitStringSchema } from "@/lib/money";
import { assessReceipt, type ParsedReceipt } from "@/lib/receipt-text";
import type { ReceiptForm } from "@/lib/receipt-pdf";

/**
 * The wire contract for capturing a 7-Eleven receipt (PLAN task 56), and the one place a parse
 * done on the device becomes a `capture_receipt(jsonb)` request.
 *
 * **The PDF is read on the device and only the parse crosses the wire** — never the page text,
 * which carries the full invoice's taxpayer identity block (`docs/RECEIPT_CONTRACT.md` § What must
 * never be stored). So the server cannot re-read the document; what it can do is refuse a parse
 * that is not shaped like the form it claims, and **recompute the checksums itself** rather than
 * accept a client's `"complete"`, because that one word decides whether a stored item list may be
 * replaced (migration 027, Rule 3).
 */

const RECEIPT_MAX_AGE_DAYS = 10 * 366;

const printedTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

const receiptItemSchema = z.object({
  lineNo: z.number().int().min(1).max(10_000),
  quantity: z.number().int().min(0).max(10_000),
  name: z.string().min(1).max(240),
  unitPriceMinor: minorUnitStringSchema.nullable(),
  amountMinor: minorUnitStringSchema,
  vatExempt: z.boolean(),
  isPromotion: z.boolean()
}).strict();

/**
 * Where a parse came from. A screenshot is the condensed receipt rendered by the app and read by
 * OCR (`lib/receipt-screenshot.ts`), so it carries exactly the condensed form's fields.
 */
export type CaptureForm = ReceiptForm | "screenshot";

export const receiptCaptureSchema = z.object({
  form: z.enum(["condensed", "full", "screenshot"]),
  receipt: z.object({
    receiptNumber: z.string().regex(/^[A-Z]?\d{1,24}$/),
    storeCode: z.string().regex(/^\d{1,12}$/),
    branchName: z.string().trim().min(1).max(160),
    purchasedAt: isoDateSchema,
    purchasedAtTime: printedTime.nullable(),
    paymentMethod: z.string().trim().min(1).max(120).nullable(),
    items: z.array(receiptItemSchema).max(400),
    discounts: z.array(minorUnitStringSchema).max(200),
    subtotalMinor: minorUnitStringSchema.nullable(),
    netMinor: minorUnitStringSchema,
    unitCount: z.number().int().min(0).max(100_000).nullable(),
    vat: z.object({
      preVatMinor: minorUnitStringSchema,
      vatMinor: minorUnitStringSchema,
      totalInclVatMinor: minorUnitStringSchema
    }).strict().nullable(),
    vatCode: z.string().regex(/^\d{1,20}$/).nullable(),
    supersedesReceiptNumber: z.string().regex(/^\d{1,24}$/).nullable()
  }).strict()
}).strict().superRefine(({ form, receipt }, context) => {
  // Each form's fields are that form's own limits (`lib/receipt-text.ts`), so a parse carrying a
  // field its form never prints did not come from the reader.
  const expectPresent = form !== "full"
    ? { purchasedAtTime: true, paymentMethod: true, unitCount: true, vat: false, vatCode: false, supersedesReceiptNumber: false }
    : { purchasedAtTime: false, paymentMethod: false, unitCount: false, vat: true, vatCode: true, supersedesReceiptNumber: true };
  for (const [field, present] of Object.entries(expectPresent)) {
    if ((receipt[field as keyof typeof expectPresent] !== null) !== present) {
      context.addIssue({ code: "custom", message: `A ${form} receipt ${present ? "always prints" : "never prints"} ${field}.`, path: ["receipt", field] });
    }
  }
  // The same bound slips use (SLIP_MAX_AGE_YEARS): wide enough for an old receipt, narrow enough
  // that a Buddhist year read through unconverted — 543 years out — cannot be stored.
  const age = dayNumber(bangkokToday()) - dayNumber(receipt.purchasedAt);
  if (age < -1 || age > RECEIPT_MAX_AGE_DAYS) {
    context.addIssue({ code: "custom", message: "The receipt date is outside the plausible window.", path: ["receipt", "purchasedAt"] });
  }
  if (form !== "full" && !/^\d+$/.test(receipt.receiptNumber)) {
    context.addIssue({ code: "custom", message: "A short receipt's number is digits only.", path: ["receipt", "receiptNumber"] });
  }
});

export type ReceiptCapture = z.infer<typeof receiptCaptureSchema>;

/** What the device sends: the parse without its self-assessment, which the server redoes. */
export function receiptCaptureBody(form: CaptureForm, receipt: ParsedReceipt): ReceiptCapture {
  return {
    form,
    receipt: {
      receiptNumber: receipt.receiptNumber,
      storeCode: receipt.storeCode,
      branchName: receipt.branchName,
      purchasedAt: receipt.purchasedAt,
      purchasedAtTime: receipt.purchasedAtTime,
      paymentMethod: receipt.paymentMethod,
      items: receipt.items,
      discounts: receipt.discounts,
      subtotalMinor: receipt.subtotalMinor,
      netMinor: receipt.netMinor,
      unitCount: receipt.unitCount,
      vat: receipt.vat,
      vatCode: receipt.vatCode,
      supersedesReceiptNumber: receipt.supersedesReceiptNumber
    }
  };
}

/**
 * The `capture_receipt(jsonb)` request for a validated capture.
 *
 * **Identity for a full invoice is the condensed number it names**, not its own `เลขที่`.
 * Measured 2026-09-23 on a real pair: the full invoice's own number is a different, alphanumeric
 * series, while the number in its "cancels and replaces" clause equals the condensed receipt's
 * `R#` number exactly — so keying the row on the invoice's own number would store one purchase
 * twice, which is the one thing `docs/RECEIPT_CONTRACT.md` § Identity and deduplication forbids.
 * The invoice's own number is not stored: nothing reads it.
 */
export function captureReceiptRequest({ form, receipt }: ReceiptCapture) {
  const assessed = assessReceipt(receipt);
  return {
    merchant: "7-eleven",
    source: form,
    storeCode: receipt.storeCode,
    branchName: receipt.branchName,
    receiptNumber: form === "full" ? receipt.supersedesReceiptNumber : receipt.receiptNumber,
    purchasedOn: receipt.purchasedAt,
    purchasedAtTime: receipt.purchasedAtTime,
    paymentMethod: receipt.paymentMethod,
    subtotalMinor: receipt.subtotalMinor,
    netMinor: receipt.netMinor,
    unitCount: receipt.unitCount,
    vatPreMinor: receipt.vat?.preVatMinor ?? null,
    vatMinor: receipt.vat?.vatMinor ?? null,
    vatTotalMinor: receipt.vat?.totalInclVatMinor ?? null,
    vatCode: receipt.vatCode,
    supersedesReceiptNumber: receipt.supersedesReceiptNumber,
    completeness: assessed.completeness,
    failedChecks: assessed.failedChecks,
    inapplicableChecks: assessed.inapplicableChecks,
    items: receipt.items.map((item, position) => ({ ...item, position })),
    // The reader keeps discount amounts only; `receipt_discounts.name` waits for it (PLAN task 56).
    discounts: receipt.discounts.map((amountMinor, position) => ({ position, name: null, amountMinor }))
  };
}

export const RECEIPT_SOURCES = ["screenshot", "condensed", "full"] as const;

/** The read contract for `GET /api/v1/receipts`. Strict, like the slip list: a new column should fail loudly. */
export const storedReceiptSchema = z.object({
  id: z.string().uuid(),
  store_code: z.string(),
  branch_name: z.string(),
  receipt_number: z.string(),
  purchased_on: isoDateSchema,
  purchased_at_time: z.string().nullable(),
  payment_method: z.string().nullable(),
  subtotal_minor: minorUnitStringSchema.nullable(),
  net_minor: minorUnitStringSchema,
  unit_count: z.number().int().nullable(),
  completeness: z.enum(["complete", "partial"]),
  failed_checks: z.array(z.string()),
  sources: z.array(z.enum(RECEIPT_SOURCES)),
  items_source: z.enum(RECEIPT_SOURCES),
  items_complete: z.boolean(),
  updated_at: z.string(),
  items: z.array(z.object({
    position: z.number().int(),
    quantity: z.number().int(),
    name: z.string(),
    display_name: z.string().nullable(),
    amount_minor: minorUnitStringSchema,
    is_promotion: z.boolean(),
    vat_exempt: z.boolean()
  }).strict()),
  discounts: z.array(z.object({ position: z.number().int(), amount_minor: minorUnitStringSchema }).strict())
}).strict();

export type StoredReceipt = z.infer<typeof storedReceiptSchema>;

export const receiptListSchema = z.object({ receipts: z.array(storedReceiptSchema) }).strict();

export const receiptCaptureResultSchema = z.object({
  captured: z.boolean(),
  merged: z.boolean(),
  itemsReplaced: z.boolean().optional(),
  receipt: z.object({ id: z.string().uuid() }).passthrough()
}).strict();
