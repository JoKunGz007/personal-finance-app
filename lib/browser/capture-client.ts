import { captureLinemanRequest, deliveryCaptureResultSchema } from "@/lib/deliveries";
import type { ParsedLinemanOrder } from "@/lib/delivery-lineman";
import type { ParsedReceipt } from "@/lib/receipt-text";
import { receiptCaptureBody, receiptCaptureResultSchema, type CaptureForm } from "@/lib/receipts";
import { ledgerRequest } from "@/lib/wire";

/**
 * The two capture POSTs a dropped file can end in (D-235). **Extracted unchanged from
 * `app/receipts-bench.tsx` and `app/lineman-capture.tsx`**: same route, same body builder, same
 * wording, so the Inbox's queue stores exactly what those pages store. Capture is idempotent on the
 * server; a repeat is answered as already stored.
 */

export function postReceiptCapture(form: CaptureForm, receipt: ParsedReceipt) {
  return ledgerRequest("/api/v1/receipts", receiptCaptureResultSchema, {
    fallback: "The receipt could not be saved.",
    unreachable: "The ledger could not be reached, so the receipt was not saved."
  }, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(receiptCaptureBody(form, receipt))
  });
}

export function postLinemanCapture(order: ParsedLinemanOrder) {
  return ledgerRequest("/api/v1/deliveries", deliveryCaptureResultSchema, {
    fallback: "The order could not be saved.",
    unreachable: "The ledger could not be reached, so the order was not saved."
  }, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(captureLinemanRequest(order))
  });
}
