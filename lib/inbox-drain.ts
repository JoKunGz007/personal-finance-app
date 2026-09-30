/**
 * What to do with each waiting file when the Inbox drains its queue (D-235 step 2c-i), without the
 * browser or the network: which recogniser matched, which files a finished read lets go of and which
 * it keeps (and why), and the sentences shown. The reading, the capture POSTs and the Storage calls
 * are in `lib/browser/inbox-importer.ts`.
 *
 * **A file is only ever removed after its capture answered success or already-stored**, so every
 * plan here is either `capture` (the caller removes the files once the route says yes) or `keep`
 * with a plain reason. Nothing here decides money: each parser and capture route is the existing one.
 */

import { readLinemanOrder, readLinemanPage, type LinemanPage, type ParsedLinemanOrder } from "@/lib/delivery-lineman";
import type { ReceiptForm } from "@/lib/receipt-pdf";
import { groupScreenshotPages, readScreenshotPage, readScreenshotReceipt, type ScreenshotPage } from "@/lib/receipt-screenshot";
import type { ParsedReceipt } from "@/lib/receipt-text";
import type { OcrWord } from "@/lib/slip-ocr";

/** Slips, notification cards and statements come in a later step; they wait untouched. */
export const NOT_YET = "Not imported automatically yet.";

export const TWO_ORDERS_REASON = "Two orders are mixed here; add one order's screenshots at a time.";

const PARTIAL_PDF_REASON =
  "Some of this receipt's own checks did not pass, so it was not saved automatically. Add it on the Receipts page to save it as partial.";
const PARTIAL_SCREENSHOTS_REASON =
  "Its items do not add up to its total, so part of the receipt is probably not in the screenshots. Add the missing part.";

/** What to do with a finished reading: capture it (then remove its files) or keep its files. */
export type Plan<T> = { readonly action: "capture"; readonly value: T } | { readonly action: "keep"; readonly reason: string };

// --- 7-Eleven PDF ---

export type PdfReply =
  | { readonly type: "receipt"; readonly form: ReceiptForm; readonly receipt: ParsedReceipt }
  | { readonly type: "error"; readonly message: string; readonly code?: string };

/**
 * A PDF the worker read. A PDF that is not a 7-Eleven form, or cannot be opened (an encrypted
 * statement), is not this step's and waits untouched; any other refusal, and a worker that failed or
 * timed out, keeps its own message. A receipt whose checks did not all pass is kept too: saving a
 * partial receipt stays the owner's press on the Receipts page, as before.
 */
export function planPdf(reply: PdfReply): Plan<{ form: ReceiptForm; receipt: ParsedReceipt }> {
  if (reply.type === "error") {
    return { action: "keep", reason: reply.code === "UNKNOWN_FORM" || reply.code === "UNREADABLE_PDF" ? NOT_YET : reply.message };
  }
  if (reply.receipt.completeness !== "complete") return { action: "keep", reason: PARTIAL_PDF_REASON };
  return { action: "capture", value: { form: reply.form, receipt: reply.receipt } };
}

// --- Images: one OCR read, every recogniser ---

export type ImageRecognition =
  | { readonly kind: "receipt-page"; readonly page: ScreenshotPage }
  | { readonly kind: "lineman-page"; readonly page: LinemanPage }
  | { readonly kind: "keep"; readonly reason: string };

/**
 * Which known screen an image is, from the words Vision returned once. The 7-Eleven headings are
 * tried first, then LINE MAN's "Order details" plus "Menu". A LINE MAN page that is recognised but
 * unreadable keeps the parser's message; anything neither recognises (a slip, a notification card)
 * waits untouched.
 */
export function recogniseImage(words: readonly OcrWord[]): ImageRecognition {
  const receipt = readScreenshotPage(words);
  if (receipt.ok) return { kind: "receipt-page", page: receipt.value };
  const order = readLinemanPage(words);
  if (order.ok) return { kind: "lineman-page", page: order.value };
  return { kind: "keep", reason: order.code === "NOT_AN_ORDER" ? NOT_YET : order.message };
}

// --- 7-Eleven screenshots ---

export type ReceiptShotGroup = { readonly names: string[]; readonly plan: Plan<ParsedReceipt> };

/**
 * The recognised receipt pages of one drain, grouped by receipt, each group read once. Only a
 * receipt whose own checksums close is captured; a group that does not complete keeps every one of
 * its files, which the next drain reads together with any page added later.
 */
export function planReceiptScreenshots(pages: readonly { name: string; page: ScreenshotPage }[]): ReceiptShotGroup[] {
  return groupScreenshotPages(pages).map((group) => {
    const names = group.map((entry) => entry.name);
    const read = readScreenshotReceipt(group.map((entry) => entry.page));
    if (!read.ok) return { names, plan: { action: "keep", reason: read.message } };
    if (read.value.completeness !== "complete") return { names, plan: { action: "keep", reason: PARTIAL_SCREENSHOTS_REASON } };
    return { names, plan: { action: "capture", value: read.value } };
  });
}

// --- LINE MAN screenshots ---

export type LinemanGroup = { readonly names: string[]; readonly plan: Plan<ParsedLinemanOrder> };

/** `createdAt` is Storage's own time for the file; null or unreadable when Storage gave none. */
type OrderPage = { readonly name: string; readonly page: LinemanPage; readonly createdAt: string | null };

/** One order's screenshots are added together; further apart than this, they are not trusted to be one order. */
export const ORDER_WINDOW_MINUTES = 10;

export const DIFFERENT_TIMES_REASON =
  "These screenshots were added at different times. Remove them and add the whole order at once.";

/**
 * Whether every time is readable and all of them fall within `ORDER_WINDOW_MINUTES` of each other.
 * A missing or unreadable time counts as "different times": not knowing is no reason to capture.
 */
export function addedTogether(times: readonly (string | null)[], windowMinutes = ORDER_WINDOW_MINUTES): boolean {
  const stamps = times.map((time) => (time ? Date.parse(time) : Number.NaN));
  if (stamps.length === 0 || stamps.some((stamp) => !Number.isFinite(stamp))) return false;
  return Math.max(...stamps) - Math.min(...stamps) <= windowMinutes * 60 * 1000;
}

export const UNMATCHED_PAGE_REASON =
  "This screenshot does not match any order waiting here. Add the missing screenshots of its order.";

/**
 * Whether `page` can follow the pages already gathered for one order, **by the parser's own checks**
 * (the overlap above `Menu` and the dishes already priced), which `readLinemanOrder` runs page by page
 * before it reads any sum. Only its `NO_OVERLAP` refusal means "does not follow"; a read that is still
 * short of the Food line, or whose sums fail, got past those checks.
 */
function follows(group: readonly OrderPage[], page: OrderPage): boolean {
  const read = readLinemanOrder([...group, page].map((entry) => entry.page));
  return !(!read.ok && read.code === "NO_OVERLAP");
}

function readGroup(entries: readonly OrderPage[]): LinemanGroup {
  const names = entries.map((entry) => entry.name);
  const read = readLinemanOrder(entries.map((entry) => entry.page));
  if (!read.ok) return { names, plan: { action: "keep", reason: read.code === "TWO_ORDERS" ? TWO_ORDERS_REASON : read.message } };
  // Only a first screenshot carries the order number, so a later one is tied to it by fit alone.
  // Screenshots of one order are added together; ones added apart may belong to different orders.
  if (!addedTogether(entries.map((entry) => entry.createdAt))) return { names, plan: { action: "keep", reason: DIFFERENT_TIMES_REASON } };
  return { names, plan: { action: "capture", value: read.value } };
}

/**
 * The recognised LINE MAN pages of one drain, read as **one order per numbered page**. Only a first
 * screenshot carries the order number, so each numbered page starts an order, and an unnumbered page
 * joins one only when the parser's own checks accept it (`follows`) and it fits **exactly one**: a
 * stuck order never blocks the next one's files. Pages are tried in queue order (oldest first) until
 * none more will join, since a later page follows its predecessor. An unnumbered page that fits two
 * orders is kept as "mixed", and one that fits none is kept with its own sentence. With no numbered
 * page at all, the parser says to add the top of the order page. **An order is captured only if all
 * its pages were added within `ORDER_WINDOW_MINUTES` of each other** (`addedTogether`).
 */
export function planLinemanOrders(pages: readonly OrderPage[]): LinemanGroup[] {
  if (pages.length === 0) return [];
  const groups: OrderPage[][] = pages.filter((entry) => entry.page.orderNumber !== null).map((entry) => [entry]);
  let loose = pages.filter((entry) => entry.page.orderNumber === null);
  if (groups.length === 0) return [readGroup(loose)];

  for (let progress = true; progress && loose.length > 0;) {
    progress = false;
    for (const entry of [...loose]) {
      const fits = groups.filter((group) => follows(group, entry));
      if (fits.length !== 1) continue;
      fits[0]!.push(entry);
      loose = loose.filter((other) => other !== entry);
      progress = true;
    }
  }

  return [
    ...groups.map(readGroup),
    ...loose.map((entry): LinemanGroup => ({
      names: [entry.name],
      plan: {
        action: "keep",
        reason: groups.filter((group) => follows(group, entry)).length > 1 ? TWO_ORDERS_REASON : UNMATCHED_PAGE_REASON
      }
    }))
  ];
}

// --- Images already found not to be any known screen ---

/**
 * The names of files this device already found "not recognised" (a slip, a notification card), so
 * the next drain does not send the same image to Vision again. **Names only**: each is the random
 * `<id>.<ext>` the queue gave the file, which says nothing about it. Kept per device, in
 * `lib/browser/inbox-memory.ts`. The key is versioned: **a step that teaches the drain a new kind of
 * image must change the version**, or the files this memory skips would never be read by it.
 */
export const UNRECOGNISED_KEY = "inbox:unrecognised:v1";

/** The remembered names from stored text; anything that is not a list of strings is an empty memory. */
export function parseRemembered(raw: string | null): Set<string> {
  if (!raw) return new Set();
  try {
    const value: unknown = JSON.parse(raw);
    return new Set(Array.isArray(value) ? value.filter((name): name is string => typeof name === "string") : []);
  } catch {
    return new Set();
  }
}

/** What to store: the remembered names that are still in the queue, so the memory cannot grow. */
export function pruneRemembered(remembered: ReadonlySet<string>, inQueue: readonly string[]): string[] {
  const present = new Set(inQueue);
  return [...remembered].filter((name) => present.has(name)).sort();
}

// --- What the owner reads ---

/** "Importing 3 of 7…" */
export function progressLine(done: number, total: number): string {
  return `Importing ${done} of ${total}…`;
}

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "2 receipts and 1 LINE MAN order imported; 3 files wait." */
export function describeDrain(result: { receipts: number; orders: number; waiting: number }): string {
  const imported = [
    result.receipts > 0 ? count(result.receipts, "receipt", "receipts") : null,
    result.orders > 0 ? count(result.orders, "LINE MAN order", "LINE MAN orders") : null
  ].filter((part): part is string => part !== null);
  const waits = result.waiting === 0 ? "" : ` ${count(result.waiting, "file waits", "files wait")}.`;
  if (imported.length === 0) return result.waiting === 0 ? "Nothing was waiting." : `Nothing was imported.${waits}`;
  return `${imported.join(" and ")} imported${result.waiting === 0 ? "." : ";"}${waits}`;
}
