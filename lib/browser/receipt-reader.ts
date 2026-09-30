import type { ReceiptForm } from "@/lib/receipt-pdf";
import type { ParsedReceipt } from "@/lib/receipt-text";

/**
 * Reading a 7-Eleven e-tax PDF on this device: one worker, the bytes transferred in and only the
 * parse back (D-235). **Extracted unchanged from `app/receipts-bench.tsx`**, so the Receipts page and
 * the Inbox's queue read a PDF the same way. The page text never leaves the worker.
 */

/** `code` is the reader's refusal code when the worker has one (`lib/receipt-pdf.ts`); the page ignores it. */
export type ReceiptWorkerReply =
  | { type: "receipt"; form: ReceiptForm; receipt: ParsedReceipt }
  | { type: "error"; message: string; code?: string };

// A receipt is a page or two; a worker silent for this long is not going to answer.
const READ_TIMEOUT_MS = 60_000;

/**
 * One PDF, one worker: the bytes are transferred in and only the parse comes back. **Always
 * resolves** — an unreadable file, a worker error and a worker that never answers all become a
 * refusal — so one bad file cannot leave itself and every file after it stuck on "Reading".
 */
export async function readReceiptPdf(file: Blob): Promise<ReceiptWorkerReply> {
  let bytes: ArrayBuffer;
  try {
    bytes = await file.arrayBuffer();
  } catch {
    return { type: "error", message: "This file could not be opened on this device." };
  }
  return new Promise<ReceiptWorkerReply>((resolve) => {
    const worker = new Worker(new URL("../../workers/receipt.worker.ts", import.meta.url), { type: "module" });
    const timer = setTimeout(() => finish({ type: "error", message: "Reading this PDF took too long, so it was stopped." }), READ_TIMEOUT_MS);
    function finish(reply: ReceiptWorkerReply) {
      clearTimeout(timer);
      worker.terminate();
      resolve(reply);
    }
    worker.onmessage = (event: MessageEvent<ReceiptWorkerReply>) => finish(event.data);
    worker.onerror = () => finish({ type: "error", message: "This PDF could not be read on this device." });
    worker.postMessage({ type: "read", bytes }, [bytes]);
  });
}
