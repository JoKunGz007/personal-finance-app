/// <reference lib="webworker" />
import { GlobalWorkerOptions, getDocument } from "pdfjs-dist";
import { readReceiptPdfText, type ReceiptTextItem } from "@/lib/receipt-pdf";

// See workers/krungthai.worker.ts for why pdf.js gets its own worker through `workerPort`.
GlobalWorkerOptions.workerPort = new Worker(new URL("./pdf.worker.entry.ts", import.meta.url), { type: "module" });

type ReadMessage = { type: "read"; bytes: ArrayBuffer };

const workerScope: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;

// The PDF never leaves this worker, and neither does its page text: the full invoice prints the
// buyer's name, address, telephone and taxpayer number, and the reader drops that block by never
// matching it (`docs/RECEIPT_CONTRACT.md` § What must never be stored). Only the parse, or a
// refusal built from static text, is posted back.
workerScope.onmessage = async (event: MessageEvent<ReadMessage>) => {
  if (event.data.type !== "read") return;
  try {
    const document = await getDocument({ data: new Uint8Array(event.data.bytes) }).promise;
    const pages: ReceiptTextItem[][] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const content = await (await document.getPage(pageNumber)).getTextContent();
      const items: ReceiptTextItem[] = [];
      for (const item of content.items) {
        if (!("str" in item)) continue;
        items.push({ str: item.str, hasEOL: item.hasEOL, y: (item.transform as number[])[5]! });
      }
      pages.push(items);
    }
    const read = readReceiptPdfText(pages);
    workerScope.postMessage(read.ok
      ? { type: "receipt", form: read.form, receipt: read.receipt }
      : { type: "error", message: read.message });
  } catch {
    workerScope.postMessage({ type: "error", message: "This file could not be opened as a PDF." });
  }
};
