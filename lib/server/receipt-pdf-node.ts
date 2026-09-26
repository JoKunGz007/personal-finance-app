// Reading a 7-Eleven e-tax PDF on the server, for mailbox Sync (D-232).
//
// The same text-item walk as `workers/receipt.worker.ts`, so the device and the server hand
// `readReceiptPdfText` identical input; only the pdf.js build differs. The **legacy** build is the
// one that runs under Node (`scripts/mask-statement.mjs`).
//
// The PDF and its page text stay inside this function: the full invoice prints the buyer's name,
// address, telephone and taxpayer number, and the reader drops that block by never matching it.
// Only the parse, or a refusal built from static text, is returned.

// Registers `globalThis.pdfjsWorker`, so pdf.js parses in this process instead of loading a worker
// file by path, which a serverless bundle would not carry. Imported first, before pdf.js reads it.
import "pdfjs-dist/legacy/build/pdf.worker.mjs";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { readReceiptPdfText, type ReceiptPdfRead, type ReceiptTextItem } from "@/lib/receipt-pdf";

/** A PDF this reader could not open: refused and retried next Sync, never marked done. */
export type ReceiptPdfBytesRead = ReceiptPdfRead | { ok: false; code: "UNREADABLE_PDF"; message: string };

/**
 * Only a PDF that will not open is caught, as a refusal. If pdf.js itself cannot load, the import
 * above fails the route, which the page reports as an error: were that read as "not a receipt",
 * every message would be marked done and the mail skipped for good.
 */
export async function readReceiptPdfBytes(bytes: Uint8Array): Promise<ReceiptPdfBytesRead> {
  try {
    const document = await getDocument({ data: bytes, useSystemFonts: false, verbosity: 0 }).promise;
    try {
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
      return readReceiptPdfText(pages);
    } finally {
      await document.destroy();
    }
  } catch {
    return { ok: false, code: "UNREADABLE_PDF", message: "This file could not be opened as a PDF." };
  }
}
