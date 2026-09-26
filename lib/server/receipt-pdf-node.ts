// Reading a 7-Eleven e-tax PDF on the server, for mailbox Sync (D-232).
//
// The same text-item walk as `workers/receipt.worker.ts`, so the device and the server hand
// `readReceiptPdfText` identical input; only the pdf.js build differs. The **legacy** build is the
// one that runs under Node (`scripts/mask-statement.mjs`).
//
// The PDF and its page text stay inside this function: the full invoice prints the buyer's name,
// address, telephone and taxpayer number, and the reader drops that block by never matching it.
// Only the parse, or a refusal built from static text, is returned.

import { readReceiptPdfText, type ReceiptPdfRead, type ReceiptTextItem } from "@/lib/receipt-pdf";

type PdfJs = typeof import("pdfjs-dist/legacy/build/pdf.mjs");
let loaded: Promise<PdfJs> | null = null;

/**
 * pdf.js, loaded on first use. The worker module goes first: it registers `globalThis.pdfjsWorker`,
 * so pdf.js parses in this process instead of loading a worker file by path, which a serverless
 * bundle would not carry. **A failure to load throws** (and is retried next request), so the route
 * reports it rather than reading every PDF as "not a receipt" and marking the mail done for good.
 */
export function loadPdfJs(): Promise<PdfJs> {
  loaded ??= (async () => {
    // pdf.js builds one `DOMMatrix` when its module loads, and otherwise needs it only to draw.
    // Under Node it borrows one from the optional `@napi-rs/canvas`, which the serverless bundle
    // does not carry, so the import failed on Vercel with "DOMMatrix is not defined" (D-232). Text
    // extraction never draws: a bare placeholder satisfies the load, and any drawing path reaching
    // it throws, which reads that PDF as unreadable — refused and retried, never marked done.
    if (!("DOMMatrix" in globalThis)) {
      (globalThis as { DOMMatrix?: unknown }).DOMMatrix = class ServerTextOnlyDOMMatrix {};
    }
    // @ts-expect-error -- the worker build ships no types; it is imported only for its side effect.
    await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
    return import("pdfjs-dist/legacy/build/pdf.mjs");
  })().catch((error: unknown) => {
    loaded = null;
    throw error;
  });
  return loaded;
}

/** A PDF this reader could not open: refused and retried next Sync, never marked done. */
export type ReceiptPdfBytesRead = ReceiptPdfRead | { ok: false; code: "UNREADABLE_PDF"; message: string };

/** Only a PDF that will not open is caught, as a refusal; pdf.js failing to load throws. */
export async function readReceiptPdfBytes(bytes: Uint8Array): Promise<ReceiptPdfBytesRead> {
  const { getDocument } = await loadPdfJs();
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
