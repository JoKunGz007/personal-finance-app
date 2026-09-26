// Reading 7-Eleven e-tax invoices out of the statement mailbox, over IMAP (D-232, PLAN task 56's
// deferred mailbox path).
//
// The fourth caller of the mailbox, shaped like the Grab reader (`delivery-mailbox.ts`) and
// reusing the statement reader's PDF part walk (`collectPdfParts`), which already descends into
// embedded messages. The session is `statement-mailbox-session.ts`'s, unchanged.
//
// ## Two shapes, one reader
//
// * **A forwarded invoice**: the owner's Gmail filter forwards `e_tax@cpall.co.th`'s mail, which
//   keeps its sender, and the invoice is the message's PDF attachment.
// * **A backfill bundle**: an email from the owner's own address carrying invoices as attached
//   `message/rfc822` parts, with "7-11" in its subject. Each embedded message's PDF is one invoice.
//
// **The PDF decides what it is**, never the sender: `readReceiptPdfText` refuses anything that is
// not a 7-Eleven e-tax form. The search only narrows which mail is worth opening, so bank
// statements are never downloaded.
//
// ## Read on the server, the owner's choice (D-232)
//
// The PDF is opened in this process (`receipt-pdf-node.ts`) and only the parse goes on, through
// the same schema and `capture_receipt` the page's own upload uses. The page is sent counts.
// Nothing here logs, and no refusal detail naming a value crosses to the browser.
//
// ## Marking a message done
//
// `PLReceipt` once **every** PDF in it is resolved — stored, already stored, or not a receipt.
// A message with any refusal is left unflagged and re-read next time, so a reader fix picks it up.

import type { ImapFlow, FetchMessageObject, SearchObject } from "imapflow";
import { collectPdfParts, type MessagePart } from "@/lib/server/statement-mailbox";
import type { ReceiptPdfBytesRead } from "@/lib/server/receipt-pdf-node";
import { receiptCaptureBody, type ReceiptCapture, type ReceiptSyncReport } from "@/lib/receipts";

export const RECEIPT_FLAG = "PLReceipt";
/** 7-Eleven's own sender, or the owner's bundle subject. OR takes exactly two arguments in IMAP. */
export const RECEIPT_SEARCH: SearchObject = { or: [{ from: "e_tax@cpall.co.th" }, { subject: "7-11" }] };
/** How many candidate messages one sync examines, newest first. */
export const MAX_RECEIPT_MESSAGES_SCANNED = 300;
/** A 7-Eleven invoice is tens of kilobytes; this only bounds memory against a lying structure. */
export const MAX_RECEIPT_PDF_BYTES = 5 * 1024 * 1024;

export type ReceiptOutcome = "captured" | "alreadyStored" | "disagrees" | "storeRefused";
export type StoreReceipt = (capture: ReceiptCapture) => Promise<ReceiptOutcome>;
export type ReadPdf = (bytes: Uint8Array) => Promise<ReceiptPdfBytesRead>;

export function emptyReceiptReport(): ReceiptSyncReport {
  return { messages: 0, captured: 0, alreadyStored: 0, notReceipts: 0, refused: {}, truncated: false };
}

function countRefusal(report: ReceiptSyncReport, code: string) {
  report.refused[code] = (report.refused[code] ?? 0) + 1;
}

/**
 * Reads one message's downloaded PDFs into the report and stores each receipt. Returns whether
 * every PDF is resolved, so the message may be flagged done. A missing download is a refusal.
 */
export async function readReceiptMessage(
  pdfs: readonly (Uint8Array | null)[],
  readPdf: ReadPdf,
  store: StoreReceipt,
  report: ReceiptSyncReport
): Promise<boolean> {
  let resolved = true;
  for (const bytes of pdfs) {
    if (bytes === null) {
      countRefusal(report, "UNDOWNLOADABLE");
      resolved = false;
      continue;
    }
    const read = await readPdf(bytes);
    if (!read.ok) {
      if (read.code === "UNKNOWN_FORM") report.notReceipts += 1;
      else {
        countRefusal(report, read.code);
        resolved = false;
      }
      continue;
    }
    const outcome = await store(receiptCaptureBody(read.form, read.receipt));
    if (outcome === "captured") report.captured += 1;
    else if (outcome === "alreadyStored") report.alreadyStored += 1;
    else {
      countRefusal(report, outcome === "disagrees" ? "DISAGREES" : "STORE_REFUSED");
      resolved = false;
    }
  }
  return resolved;
}

async function downloadPart(client: ImapFlow, uid: number, part: string): Promise<Uint8Array | null> {
  try {
    const download = await client.download(String(uid), part, { uid: true, maxBytes: MAX_RECEIPT_PDF_BYTES });
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of download.content) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
      size += buffer.length;
      if (size > MAX_RECEIPT_PDF_BYTES) return null;
      chunks.push(buffer);
    }
    return new Uint8Array(Buffer.concat(chunks));
  } catch {
    return null;
  }
}

/**
 * Every unflagged candidate message, newest first, until the deadline. Flags first and body
 * structures only for unflagged mail, as `syncDeliveryMail` does and for the same reason.
 */
export async function syncReceiptMail(
  client: ImapFlow,
  readPdf: ReadPdf,
  store: StoreReceipt,
  deadline: number,
  now: () => number = Date.now
): Promise<ReceiptSyncReport> {
  const report = emptyReceiptReport();
  const uids = await client.search(RECEIPT_SEARCH, { uid: true });
  if (!uids || uids.length === 0) return report;

  const pending: number[] = [];
  for await (const message of client.fetch(uids, { uid: true, flags: true }, { uid: true })) {
    if (!message.flags?.has(RECEIPT_FLAG)) pending.push(message.uid);
  }
  if (pending.length === 0) return report;
  const ordered = pending.sort((left, right) => right - left);
  const examined = ordered.slice(0, MAX_RECEIPT_MESSAGES_SCANNED);
  report.truncated = ordered.length > examined.length;

  const byUid = new Map<number, FetchMessageObject>();
  for await (const message of client.fetch(examined, { uid: true, bodyStructure: true }, { uid: true })) {
    byUid.set(message.uid, message);
  }

  for (const uid of examined) {
    const message = byUid.get(uid);
    if (!message?.bodyStructure) continue;
    if (now() >= deadline) {
      report.truncated = true;
      break;
    }
    report.messages += 1;
    const parts = collectPdfParts(message.bodyStructure as MessagePart, uid);
    const pdfs: (Uint8Array | null)[] = [];
    for (const part of parts) {
      pdfs.push(part.sizeBytes > MAX_RECEIPT_PDF_BYTES ? null : await downloadPart(client, uid, part.part));
    }
    const resolved = await readReceiptMessage(pdfs, readPdf, store, report);
    // Best-effort: a missed flag costs one re-read, never a wrong row.
    if (resolved) await client.messageFlagsAdd(uid, [RECEIPT_FLAG], { uid: true }).catch(() => false);
  }
  return report;
}
