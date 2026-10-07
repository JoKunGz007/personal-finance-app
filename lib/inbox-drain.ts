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
import type { SlipIdentity } from "@/lib/slip-qr";
import type { MinorUnitString } from "@/lib/money";
import type { SlipKind } from "@/lib/slips";

/** Notification cards and statements come in a later step; they wait untouched. */
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

// --- Statement PDFs (read and imported by the server, which holds the passwords) ---

/** True for a PDF the receipt reader could not open: an encrypted statement, or any file that is not a readable PDF. */
export function needsStatementRoute(reply: PdfReply): boolean {
  return reply.type === "error" && reply.code === "UNREADABLE_PDF";
}

/** What the statement route answered to an import, as the drain needs it. */
export type StatementAnswer =
  | { readonly kind: "captured" }
  | { readonly kind: "duplicate" }
  /** No transactions and zero totals: released like a captured one, since there is nothing to import. */
  | { readonly kind: "empty" }
  | { readonly kind: "held"; readonly reason: string };

/** The Import page's address for a statement waiting in the Inbox, and the label of its link. */
export const REVIEW_LINK_LABEL = "Review on Import";
export function reviewHref(objectName: string): string {
  return `/import?inbox=${encodeURIComponent(objectName)}`;
}

export const STATEMENT_LOCKED_REASON = "None of the stored statement passwords opens this PDF.";
export const STATEMENT_NO_PASSWORDS_REASON = "No statement password is set on the server yet.";
const STATEMENT_UNREADABLE_REASON = "This PDF could not be read as a statement.";
const STATEMENT_NEEDS_ACCOUNT_REASON = "No account of yours matches this statement.";
const STATEMENT_WARNINGS_REASON = "This statement needs a look before it is saved.";
const STATEMENT_CONFIRM_FAILED_REASON = "The statement could not be saved automatically.";
const STATEMENT_OVERLAP_REASON = "Some rows of this statement are already in the ledger, so it waits for a look.";
const STATEMENT_CHECKS_REASON = "This statement did not pass its checks, so it was not saved automatically.";

/** A held statement's reason in plain words. Any code that is not one of the first three needs the owner's review. */
export function statementHeldReason(reason: string): string {
  switch (reason) {
    case "locked": return STATEMENT_LOCKED_REASON;
    case "no-passwords": return STATEMENT_NO_PASSWORDS_REASON;
    case "unreadable": return STATEMENT_UNREADABLE_REASON;
    case "needs-account": return STATEMENT_NEEDS_ACCOUNT_REASON;
    case "warnings": return STATEMENT_WARNINGS_REASON;
    case "confirm-failed": return STATEMENT_CONFIRM_FAILED_REASON;
    case "overlap": return STATEMENT_OVERLAP_REASON;
    default: return STATEMENT_CHECKS_REASON;
  }
}

/** Whether the owner can do something about a held statement on the Import page. */
export function statementNeedsReview(reason: string): boolean {
  return reason !== "locked" && reason !== "no-passwords" && reason !== "unreadable";
}

export type StatementPlan =
  | { readonly action: "capture"; readonly outcome: "captured" | "duplicate" | "empty" }
  | { readonly action: "keep"; readonly reason: string; readonly review: boolean };

/**
 * The server's answer to an import. Only `captured`, `duplicate` and `empty` let the file go; a held statement
 * stays with its reason (and a review link when the Import page can help).
 */
export function planStatement(answer: StatementAnswer): StatementPlan {
  if (answer.kind === "held") {
    return { action: "keep", reason: statementHeldReason(answer.reason), review: statementNeedsReview(answer.reason) };
  }
  return { action: "capture", outcome: answer.kind };
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

/** A page is not taken more than this many minutes before its own order's first page. */
export const SHOT_WINDOW_MINUTES = 2;

/**
 * Whether an order's first page was shot **more than `SHOT_WINDOW_MINUTES` after** `page` (both clocks
 * known), so `page` cannot belong to that order. Midnight wraps: a gap is "after" when it is over the
 * window and at most 12 hours forward; anything else is at or before the page, which rules nothing out.
 */
function firstShotWellAfter(first: OrderPage, page: OrderPage): boolean {
  const from = first.page.shotAt, to = page.page.shotAt;
  if (from === null || to === null) return false;
  const gap = (from - to + 1440) % 1440;
  return gap > SHOT_WINDOW_MINUTES && gap <= 720;
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
 *
 * **One tie-break, for orders to the same address.** Content cannot separate those: the lines above
 * `Menu` are identical and a first page's only priced dish is its last line, which the parser skips,
 * so a second page fits both. The phone's status-bar clock is the one thing that can: it is printed
 * in the image, so it survives LINE, the picker and re-encoding. An unnumbered page that fits more
 * than one order is first tried against the clock, **which only rules orders out**: with every clock
 * involved readable, an order whose first page was shot more than `SHOT_WINDOW_MINUTES` **after**
 * the page is dropped (a page is not taken well before its own order's top; midnight wraps). If
 * exactly one order remains the page joins it, otherwise it is held as "mixed", as before. Any
 * unreadable clock holds the page: it cannot rule that order out. The loop then lets content finish
 * the job: once a page has joined its order, the next order's page no longer `follows` it. A page that
 * fits only one order never consults the clock. (The phone prints a 24-hour clock. On a 12-hour one
 * the 12:59 to 1:00 crossing reads as half a day apart, which drops the right order and so mostly
 * holds the page, though a first page shot just after the crossing could take it.)
 *
 * **The remaining wrong-capture risk, plainly:** a second page shot more than `SHOT_WINDOW_MINUTES`
 * *before* its own first page, while another, earlier order is also in reach, is joined to that
 * earlier order (it is not dropped, and the page's own order is). Photographing the pages out of order
 * by more than the window is the only way to get there.
 */
export function planLinemanOrders(pages: readonly OrderPage[]): LinemanGroup[] {
  if (pages.length === 0) return [];
  const groups: OrderPage[][] = pages.filter((entry) => entry.page.orderNumber !== null).map((entry) => [entry]);
  let loose = pages.filter((entry) => entry.page.orderNumber === null);
  if (groups.length === 0) return [readGroup(loose)];

  for (let progress = true; progress && loose.length > 0;) {
    progress = false;
    for (const entry of [...loose]) {
      let fits = groups.filter((group) => follows(group, entry));
      // The clock only rules orders out; an unreadable one (a rival's included) rules nothing out.
      if (fits.length > 1) {
        fits = entry.page.shotAt === null || fits.some((group) => group[0]!.page.shotAt === null)
          ? []
          : fits.filter((group) => !firstShotWellAfter(group[0]!, entry));
      }
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

// --- Bank slips ---

/** The page that hosts the slip forms, named as the owner sees it. */
const SLIPS_PAGE = "Slips";

/**
 * A slip's identity as the drain carries it: the QR's, or one read off the printed text (D-258),
 * which has no QR code and so a null `bankQrCode`.
 */
export type ReadySlipIdentity = Omit<SlipIdentity, "bankQrCode"> & { readonly bankQrCode: string | null };

/** A slip whose amount and date were read exactly, held until the owner says money in or out. */
export type ReadySlip = {
  /** The queue's object name, which is how its file is removed after the capture. */
  readonly name: string;
  /**
   * The QR text verbatim: the server re-derives the bank and reference from it. Null for a slip
   * whose identity was read off its printed text (D-258); `identity.bankQrCode` is then null too.
   */
  readonly payload: string | null;
  readonly identity: ReadySlipIdentity;
  readonly occurredOn: string;
  readonly occurredAtTime: string | null;
  /** The **magnitude**, in minor units. The direction supplies the sign at capture. */
  readonly amountMinor: MinorUnitString;
  /** The payee and the memo as printed, read by `proposeSlipText`; null when the layout gave none (D-252). */
  readonly counterparty: string | null;
  readonly note: string | null;
};

/** Why a ready slip's file is still in the queue until the page captures it as money out (D-252). */
export const SLIP_WAITING_REASON = "Waiting to be captured as money out.";

/** Shown for a slip already found to need checking on an earlier drain (no download, no read). */
export const SLIP_REVIEW_REMEMBERED_REASON = `This slip needs checking. Add it on the ${SLIPS_PAGE} page, then remove it here.`;

/** The verdict's own reason, then where the owner can type the slip in. */
export function slipReviewReason(reason: string): string {
  const sentence = /[.!?]$/u.test(reason.trim()) ? reason.trim() : `${reason.trim()}.`;
  return `${sentence} Add it on the ${SLIPS_PAGE} page, then remove it here.`;
}

/** The body of `POST /api/v1/slips`: the same one `app/slip-batch.tsx` sends for a slip it has read. */
export type SlipPostBody = {
  readonly qrPayload: string | null;
  readonly bankCode: string;
  readonly bankQrCode: string | null;
  readonly slipReference: string;
  readonly kind: SlipKind;
  readonly amountMinor: MinorUnitString;
  readonly currency: "THB";
  readonly occurredOn: string;
  readonly occurredAtTime: string | null;
  readonly counterparty: string | null;
  readonly categoryId: null;
  readonly note: string | null;
};

/**
 * A ready slip with the direction applied. The payee and memo go as read off the slip (D-252): they
 * are the slip's own detail on the matched row, never the statement's description, and the owner can
 * correct either. The category stays unset; the categoriser decides it.
 */
export function slipPostBody(slip: ReadySlip, kind: SlipKind, signedAmountMinor: MinorUnitString): SlipPostBody {
  return {
    qrPayload: slip.payload,
    bankCode: slip.identity.bankCode,
    bankQrCode: slip.identity.bankQrCode,
    slipReference: slip.identity.reference,
    kind,
    amountMinor: signedAmountMinor,
    currency: "THB",
    occurredOn: slip.occurredOn,
    occurredAtTime: slip.occurredAtTime,
    counterparty: slip.counterparty,
    categoryId: null,
    note: slip.note
  };
}

/** A capture that answered 2xx but whose confirmation could not be read: the slip may be stored, so its file stays. */
export const SLIP_UNCONFIRMED_REASON =
  "This slip was accepted but its confirmation could not be read. Check the ledger before capturing it again.";

export const SLIP_AMOUNT_REASON = "This amount is not one this ledger can store. Add it on the Slips page, then remove it here.";

// --- Images already found not to be any known screen ---

/**
 * Why a queued image is remembered: "unrecognised" is no screen this step knows, "slip-review" is a
 * slip that needs the owner (so Vision is not paid for it on every open). A slip waiting for a
 * direction is **not** remembered, since the next drain must offer it again.
 */
export type RememberedKind =
  | "unrecognised"
  | "slip-review"
  /** A statement the server held: its reason code and the build that said so (another build retries it once). */
  | { readonly kind: "held"; readonly reason: string; readonly build: string };

/** The build this page was served from; read here and nowhere else. A deploy changes it, so held statements are retried once. */
export const BUILD_ID: string = process.env.NEXT_PUBLIC_BUILD_ID ?? "local";

/** Held reasons the device never remembers: the owner can fix them without a deploy, or they may be transient. */
export const FORGOTTEN_HELD: ReadonlySet<string> = new Set(["locked", "no-passwords", "needs-account", "confirm-failed"]);

/**
 * The queue's object names this device already settled, by why, so the next drain does not send the
 * same image to Vision again. **Names only**: each is the random `<id>.<ext>` the queue gave the
 * file, which says nothing about it. Kept per device, in `lib/browser/inbox-memory.ts`. The key is
 * versioned: **a step that teaches the drain a new kind of image must change the version**, or the
 * files this memory skips would never be read by it (v3: held statements; v2: bank slips; v1 held a
 * bare list of names). Since every entry is build-stamped, a deploy now does that on its own.
 */
export const REMEMBERED_KEY = "inbox:unrecognised:v3";

/**
 * The remembered names from stored text; anything that is not a name-to-kind object is an empty memory.
 * **Every entry is stamped with the build that settled it, and one from another build is dropped**, so
 * each deploy retries it once: a reader fixed in a deploy must get to read the images an older build
 * gave up on (2026-10-07, D-252: 20 K PLUS slips stayed "needs checking" after the two-digit year was
 * fixed, because the verdict outlived the build that made it). Unstamped entries are dropped too.
 */
export function parseRemembered(raw: string | null, build: string = BUILD_ID): Map<string, RememberedKind> {
  const remembered = new Map<string, RememberedKind>();
  if (!raw) return remembered;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null || Array.isArray(value)) return remembered;
    for (const [name, kind] of Object.entries(value)) {
      if (typeof kind !== "object" || kind === null) continue;
      const stored = kind as { kind?: unknown; reason?: unknown; build?: unknown };
      if (stored.build !== build) continue;
      if (stored.kind === "unrecognised" || stored.kind === "slip-review") remembered.set(name, stored.kind);
      else if (stored.kind === "held" && typeof stored.reason === "string") {
        remembered.set(name, { kind: "held", reason: stored.reason, build });
      }
    }
    return remembered;
  } catch {
    return new Map();
  }
}

/** One stored entry: every kind carries the build that settled it (`parseRemembered`). */
export type StoredRemembered =
  | { readonly kind: "unrecognised" | "slip-review"; readonly build: string }
  | { readonly kind: "held"; readonly reason: string; readonly build: string };

/** What to store: the remembered names that are still in the queue, so the memory cannot grow, each stamped with `build`. */
export function pruneRemembered(
  remembered: ReadonlyMap<string, RememberedKind>, inQueue: readonly string[], build: string = BUILD_ID
): Record<string, StoredRemembered> {
  const present = new Set(inQueue);
  return Object.fromEntries([...remembered]
    .filter(([name]) => present.has(name))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([name, kind]): [string, StoredRemembered] => [name, typeof kind === "string" ? { kind, build } : kind]));
}

// --- What the owner reads ---

/** "Importing 3 of 7…" */
export function progressLine(done: number, total: number): string {
  return `Importing ${done} of ${total}…`;
}

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "1 receipt and 2 LINE MAN orders were already in the ledger.", or null when there are none. */
function alreadyHeld(receipts: number, orders: number): string | null {
  const parts = [
    receipts > 0 ? count(receipts, "receipt", "receipts") : null,
    orders > 0 ? count(orders, "LINE MAN order", "LINE MAN orders") : null
  ].filter((part): part is string => part !== null);
  if (parts.length === 0) return null;
  return `${parts.join(" and ")} ${receipts + orders === 1 ? "was" : "were"} already in the ledger.`;
}

/**
 * "2 receipts and 1 LINE MAN order imported. 3 slips need money in or out." The count of files still
 * waiting is left out on purpose: the list shows it live, and a figure fixed here went stale after a Remove.
 */
export function describeDrain(result: {
  receipts: number; orders: number; slips: number; receiptsAlready?: number; ordersAlready?: number;
  statements?: number; statementsAlready?: number; statementsEmpty?: number;
}): string {
  const statements = result.statements ?? 0;
  const imported = [
    result.receipts > 0 ? count(result.receipts, "receipt", "receipts") : null,
    result.orders > 0 ? count(result.orders, "LINE MAN order", "LINE MAN orders") : null,
    statements > 0 ? count(statements, "statement", "statements") : null
  ].filter((part): part is string => part !== null);
  const sentences = [
    imported.length > 0 ? `${imported.join(" and ")} imported.` : null,
    // A capture the ledger answered as already held stored nothing, so it is not called imported (D-241 live finding).
    alreadyHeld(result.receiptsAlready ?? 0, result.ordersAlready ?? 0),
    (result.statementsAlready ?? 0) > 0 ? `${count(result.statementsAlready ?? 0, "statement was", "statements were")} already in the ledger.` : null,
    (result.statementsEmpty ?? 0) > 0 ? `${count(result.statementsEmpty ?? 0, "statement", "statements")} had no transactions.` : null,
    result.slips > 0 ? `${count(result.slips, "slip needs", "slips need")} money in or out.` : null
  ].filter((part): part is string => part !== null);
  return sentences.length === 0 ? "Nothing was imported." : sentences.join(" ");
}

/** After the owner's answer: "2 slips captured as money out. 1 slip stays in the queue." */
export function describeSlipCapture(result: { captured: number; duplicates: number; kept: number; filled?: number }, kind: SlipKind): string {
  const sentences = [
    result.captured > 0 ? `${count(result.captured, "slip", "slips")} captured as money ${kind === "withdrawal" ? "out" : "in"}.` : null,
    result.duplicates > 0 ? `${count(result.duplicates, "slip was", "slips were")} already in the ledger${result.filled ? `; payee or memo added to ${result.filled}` : ""}.` : null,
    result.kept > 0 ? `${count(result.kept, "slip stays", "slips stay")} in the queue.` : null
  ].filter((part): part is string => part !== null);
  return sentences.length === 0 ? "No slips were captured." : sentences.join(" ");
}
