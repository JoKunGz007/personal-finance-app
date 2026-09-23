// Reading GrabFood e-receipts out of the statement mailbox, over IMAP (PLAN task 58 part 1).
//
// The third caller of the mailbox after the statement script and the statement Sync, and the first
// that reads a **body** rather than an attachment: an e-receipt is an HTML email with no PDF, which
// is why statement sync has always ignored it. The session itself (`openMailbox`, the credential,
// the lock) is `statement-mailbox-session.ts`'s, reused unchanged.
//
// ## Two shapes, one reader (D-218)
//
// * **A forwarded receipt**: the owner's Gmail filter forwards Grab's own email, so the receipt is
//   the message's HTML body.
// * **A backfill bundle**: an email from the owner's own address carrying about a hundred receipts
//   as attached `message/rfc822` parts. Each embedded message's HTML body is one receipt.
//
// Both reduce to the same thing — a list of HTML documents per message — and **the content decides
// what each one is**, never the sender (`lib/delivery-grab.ts`). The subject search below only
// narrows which mail is worth opening, so bank statements are never downloaded (see
// `DELIVERY_SEARCH` for why the word is `Grab`).
//
// ## Nothing leaves the server but counts
//
// The route parses and stores here; the page is sent a count of what happened (`DeliverySyncReport`)
// and later reads stored orders like any other table. No HTML, no mail text and no refusal detail
// naming a value crosses to the browser, and nothing here logs.
//
// ## Marking a message done
//
// A message is flagged `PLDelivery` once **every** receipt in it is resolved — stored, already
// stored, a ride, or not a receipt — so the next sync skips it. A message with any refused receipt
// is left unflagged and re-read next time, so a reader fix picks it up without anyone re-sending
// mail; re-reading is cheap because a stored order is recognised by its booking ID and skipped. One
// flag per message rather than per part: a bundle has a hundred parts, and a keyword per part is a
// hundred keywords on one message.

import type { ImapFlow, FetchMessageObject, SearchObject } from "imapflow";
import type { MessagePart } from "@/lib/server/statement-mailbox";
import { classifyGrabReceipt, htmlToLines, parseGrabFood, type ParsedDelivery } from "@/lib/delivery-grab";
import type { DeliverySyncReport } from "@/lib/deliveries";

export const DELIVERY_FLAG = "PLDelivery";
// **The word `Grab`, not `E-Receipt`.** Gmail's IMAP SUBJECT search matches whole words, so
// `E-Receipt` found none of the bundles ("Grab e-receipts backfill") — measured 2026-09-23 against
// the real mailbox, 0 hits where `Grab` found all four. `Grab` also covers Grab's own "Your Grab
// E-Receipt" and a hand-forward of it; other Grab mail is read once as `other` and flagged.
export const DELIVERY_SEARCH: SearchObject = { subject: "Grab" };
/** How many candidate messages one sync examines, newest first. Four bundles plus a year of forwards. */
export const MAX_DELIVERY_MESSAGES_SCANNED = 600;

export type ReceiptDocument = {
  /** IMAP part path of the HTML body to fetch. */
  readonly part: string;
  readonly encoding: string;
  readonly charset: string;
};

type Node = MessagePart & { readonly encoding?: string };

/**
 * One HTML document per message: the top-level message's own body, and each embedded
 * `message/rfc822`'s body, depth first. A document with no HTML part yields nothing.
 *
 * **The embedded part path needs one correction.** imapflow numbers an embedded message's body with
 * its wrapper's own path when that body is not multipart; IMAP addresses it as `<wrapper>.1`, and
 * fetching the wrapper's path would return the whole embedded message, headers and all.
 */
export function receiptDocuments(root: Node | undefined): ReceiptDocument[] {
  const documents: ReceiptDocument[] = [];
  const firstHtml = (node: Node, wrapper: string | null): ReceiptDocument | null => {
    if (node.type === "message/rfc822") return null;
    if (node.childNodes && node.childNodes.length > 0) {
      for (const child of node.childNodes as Node[]) {
        const found = firstHtml(child, wrapper);
        if (found) return found;
      }
      return null;
    }
    if ((node.type ?? "").toLowerCase() !== "text/html") return null;
    if ((node.disposition ?? "").toLowerCase() === "attachment") return null;
    const own = node.part ?? "1";
    const part = wrapper !== null && own === wrapper ? `${wrapper}.1` : own;
    return { part, encoding: (node.encoding ?? "7bit").toLowerCase(), charset: (node.parameters?.charset ?? "utf-8").toLowerCase() };
  };
  const embedded = (node: Node, found: Node[]) => {
    for (const child of (node.childNodes ?? []) as Node[]) {
      if (child.type === "message/rfc822") found.push(child);
      else embedded(child, found);
    }
    return found;
  };
  const visit = (body: Node, wrapper: string | null) => {
    const html = firstHtml(body, wrapper);
    if (html) documents.push(html);
    for (const message of embedded(body, [])) {
      const inner = message.childNodes?.[0] as Node | undefined;
      if (inner) visit(inner, message.part ?? null);
    }
  };
  if (root) visit(root, null);
  return documents;
}

function decodeQuotedPrintable(raw: string): Buffer {
  const joined = raw.replace(/=\r?\n/gu, "");
  const bytes: number[] = [];
  for (let index = 0; index < joined.length; index += 1) {
    const char = joined[index]!;
    if (char === "=" && /^[0-9A-Fa-f]{2}$/u.test(joined.slice(index + 1, index + 3))) {
      bytes.push(Number.parseInt(joined.slice(index + 1, index + 3), 16));
      index += 2;
    } else {
      bytes.push(joined.charCodeAt(index) & 0xff);
    }
  }
  return Buffer.from(bytes);
}

/**
 * A fetched body part as text, or null when it cannot be read faithfully. Only UTF-8 and ASCII are
 * accepted: a receipt in another charset would decode to plausible-looking wrong Thai, and a wrong
 * dish name is worse than a refusal the harness can count.
 */
export function decodeBody(raw: Buffer, document: Pick<ReceiptDocument, "encoding" | "charset">, alreadyDecoded = false): string | null {
  if (!["utf-8", "utf8", "us-ascii", "ascii"].includes(document.charset)) return null;
  let bytes: Buffer;
  if (alreadyDecoded) bytes = raw;
  else if (document.encoding === "base64") bytes = Buffer.from(raw.toString("latin1").replace(/\s+/gu, ""), "base64");
  else if (document.encoding === "quoted-printable") bytes = decodeQuotedPrintable(raw.toString("latin1"));
  else if (["7bit", "8bit", "binary"].includes(document.encoding)) bytes = raw;
  else return null;
  const text = new TextDecoder("utf-8", { fatal: true });
  try {
    return text.decode(bytes);
  } catch {
    return null;
  }
}

/** What happened to one food order the route was handed. */
export type OrderOutcome = "captured" | "alreadyStored" | "disagrees" | "storeRefused";

/** Stores a message's food orders, in order, and says what happened to each. */
export type StoreOrders = (orders: readonly ParsedDelivery[]) => Promise<OrderOutcome[]>;

export function emptyReport(): DeliverySyncReport {
  return { messages: 0, captured: 0, alreadyStored: 0, rides: 0, notReceipts: 0, refused: {}, truncated: false };
}

function countRefusal(report: DeliverySyncReport, code: string) {
  report.refused[code] = (report.refused[code] ?? 0) + 1;
}

/**
 * Reads the receipts in one message's fetched bodies into the report, stores the food orders, and
 * says whether every receipt in it is resolved (so the message may be flagged done).
 */
export async function readMessage(
  documents: readonly ReceiptDocument[],
  bodies: ReadonlyMap<string, Buffer>,
  decodedParts: ReadonlySet<string>,
  store: StoreOrders,
  report: DeliverySyncReport
): Promise<boolean> {
  let resolved = true;
  const orders: ParsedDelivery[] = [];
  for (const document of documents) {
    const raw = bodies.get(document.part);
    const html = raw ? decodeBody(raw, document, decodedParts.has(document.part)) : null;
    if (html === null) {
      countRefusal(report, "UNDECODABLE");
      resolved = false;
      continue;
    }
    const lines = htmlToLines(html);
    const kind = classifyGrabReceipt(lines);
    if (kind === "ride") {
      report.rides += 1;
    } else if (kind === "other") {
      report.notReceipts += 1;
    } else {
      const parsed = parseGrabFood(lines);
      if (parsed.ok) orders.push(parsed.value);
      else {
        countRefusal(report, parsed.code);
        resolved = false;
      }
    }
  }
  if (orders.length > 0) {
    const outcomes = await store(orders);
    for (const outcome of outcomes) {
      if (outcome === "captured") report.captured += 1;
      else if (outcome === "alreadyStored") report.alreadyStored += 1;
      else {
        countRefusal(report, outcome === "disagrees" ? "DISAGREES" : "STORE_REFUSED");
        resolved = false;
      }
    }
  }
  return resolved;
}

/**
 * Every unflagged candidate message, newest first, until the deadline.
 *
 * **Flags first, structures second.** Flags for every match are one small FETCH; body structures
 * are then asked for only for unflagged mail, so a done bundle (a structure listing a hundred
 * embedded messages) is never re-read, and the scan cap counts only mail still to do — capping
 * before filtering would let flagged mail fill the cap and report `truncated` forever. Each
 * message's HTML parts come back in one more FETCH, so a hundred-receipt bundle is one round trip.
 */
export async function syncDeliveryMail(
  client: ImapFlow,
  store: StoreOrders,
  deadline: number,
  now: () => number = Date.now
): Promise<DeliverySyncReport> {
  const report = emptyReport();
  const uids = await client.search(DELIVERY_SEARCH, { uid: true });
  if (!uids || uids.length === 0) return report;

  const pending: number[] = [];
  for await (const message of client.fetch(uids, { uid: true, flags: true }, { uid: true })) {
    if (!message.flags?.has(DELIVERY_FLAG)) pending.push(message.uid);
  }
  if (pending.length === 0) return report;
  const ordered = pending.sort((left, right) => right - left);
  const examined = ordered.slice(0, MAX_DELIVERY_MESSAGES_SCANNED);
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
    const documents = receiptDocuments(message.bodyStructure as Node);
    report.messages += 1;
    if (documents.length === 0) {
      report.notReceipts += 1;
      await client.messageFlagsAdd(uid, [DELIVERY_FLAG], { uid: true }).catch(() => false);
      continue;
    }
    const fetched = await client.fetchOne(uid, { bodyParts: documents.map((document) => document.part) }, { uid: true });
    const bodies = new Map<string, Buffer>();
    for (const document of documents) {
      const body = fetched ? fetched.bodyParts?.get(document.part) ?? fetched.bodyParts?.get(document.part.toLowerCase()) : undefined;
      if (body) bodies.set(document.part, body);
    }
    const resolved = await readMessage(documents, bodies, (fetched && fetched.binaryParts) || new Set(), store, report);
    // Best-effort, as statement sync's flag is: a missed flag costs one re-read, never a wrong row.
    if (resolved) await client.messageFlagsAdd(uid, [DELIVERY_FLAG], { uid: true }).catch(() => false);
  }
  return report;
}
