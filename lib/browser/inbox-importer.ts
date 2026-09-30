import { postLinemanCapture, postReceiptCapture } from "@/lib/browser/capture-client";
import { loadUnrecognised, saveUnrecognised } from "@/lib/browser/inbox-memory";
import { downloadFromInbox, removeFromInbox, type Outcome, type WaitingFile } from "@/lib/browser/inbox-storage";
import { readImageFileWords, type ImageWordsRead } from "@/lib/browser/ocr-reader";
import { readReceiptPdf } from "@/lib/browser/receipt-reader";
import type { browserSupabase } from "@/lib/browser/supabase";
import type { LinemanPage, ParsedLinemanOrder } from "@/lib/delivery-lineman";
import {
  describeDrain, NOT_YET, planLinemanOrders, planPdf, planReceiptScreenshots, progressLine, recogniseImage,
  type PdfReply
} from "@/lib/inbox-drain";
import { kindOfObject } from "@/lib/inbox-queue";
import type { ScreenshotPage } from "@/lib/receipt-screenshot";
import type { ParsedReceipt } from "@/lib/receipt-text";
import type { CaptureForm } from "@/lib/receipts";

/**
 * Drains the Inbox queue in the browser (D-235 step 2c-i): each waiting file is downloaded, read by
 * the parsers the Receipts and LINE MAN pages already use, captured through the same routes, and
 * removed from the queue **only after the route answered success or already-stored** and Storage
 * confirmed the removal. A file that is not handled stays, with a plain reason. Files are processed
 * one at a time, oldest first; each image is read by Vision once, and its words feed every
 * recogniser. The decisions are in `lib/inbox-drain.ts`.
 *
 * Everything that touches the network or the device comes in through `DrainDeps`, so the drain's own
 * ordering rules are tested with fakes. Two devices draining at once is harmless: a capture is
 * idempotent, and a file another device already removed is simply not counted here.
 */

type Client = NonNullable<ReturnType<typeof browserSupabase>>;

export type Posted = { readonly ok: true } | { readonly ok: false; readonly why: string };

export type DrainDeps = {
  readonly download: (name: string) => Promise<Outcome<Blob>>;
  /** The number of objects Storage says it removed. */
  readonly remove: (names: readonly string[]) => Promise<Outcome<number>>;
  readonly readPdf: (file: Blob) => Promise<PdfReply>;
  readonly readImage: (file: Blob) => Promise<ImageWordsRead>;
  readonly postReceipt: (form: CaptureForm, receipt: ParsedReceipt) => Promise<Posted>;
  readonly postOrder: (order: ParsedLinemanOrder) => Promise<Posted>;
  readonly memory: {
    readonly load: () => Set<string>;
    readonly save: (remembered: ReadonlySet<string>, inQueue: readonly string[]) => void;
  };
};

/** The drain's dependencies in the browser: the inbox bucket, the PDF worker, Vision and the capture routes. */
export function browserDrainDeps(supabase: Client, uid: string): DrainDeps {
  const posted = (result: { ok: true } | { ok: false; why: string }): Posted => (result.ok ? { ok: true } : { ok: false, why: result.why });
  return {
    download: (name) => downloadFromInbox(supabase, uid, name),
    remove: (names) => removeFromInbox(supabase, uid, names),
    readPdf: readReceiptPdf,
    readImage: readImageFileWords,
    postReceipt: async (form, receipt) => posted(await postReceiptCapture(form, receipt)),
    postOrder: async (order) => posted(await postLinemanCapture(order)),
    memory: { load: loadUnrecognised, save: saveUnrecognised }
  };
}

export type DrainResult = {
  /** Why each file that stayed is still waiting, by object name. */
  readonly reasons: Record<string, string>;
  readonly receipts: number;
  readonly orders: number;
  readonly waiting: number;
  readonly summary: string;
};

const REMOVE_FAILED = "Imported, but it could not be removed from the queue. It will be removed next time.";

export async function drainInbox(
  files: readonly WaitingFile[], onStatus: (line: string) => void, deps: DrainDeps
): Promise<DrainResult> {
  const reasons: Record<string, string> = {};
  const removed = new Set<string>();
  const remembered = deps.memory.load();
  let receipts = 0;
  let orders = 0;

  /**
   * Removes files whose capture succeeded and says whether **every** one went: Storage answers with
   * the objects it removed, so a shorter answer than the request means some file is still there. Such
   * files stay, say so, and are not counted as imported now (the next drain finds them already stored).
   */
  async function release(names: readonly string[]): Promise<boolean> {
    const result = await deps.remove(names);
    const all = result.ok && result.value === names.length;
    for (const name of names) {
      if (all) removed.add(name);
      else reasons[name] = REMOVE_FAILED;
    }
    return all;
  }

  const receiptPages: { name: string; page: ScreenshotPage }[] = [];
  const linemanPages: { name: string; page: LinemanPage; createdAt: string | null }[] = [];

  for (const [index, file] of files.entries()) {
    onStatus(progressLine(index + 1, files.length));
    const kind = kindOfObject(file.name);
    if (kind === null) { reasons[file.name] = NOT_YET; continue; }
    // Found not recognised on an earlier drain: no download and no second Vision read.
    if (kind === "image" && remembered.has(file.name)) { reasons[file.name] = NOT_YET; continue; }
    const downloaded = await deps.download(file.name);
    if (!downloaded.ok) { reasons[file.name] = downloaded.why; continue; }

    if (kind === "pdf") {
      const plan = planPdf(await deps.readPdf(downloaded.value));
      if (plan.action === "keep") { reasons[file.name] = plan.reason; continue; }
      const saved = await deps.postReceipt(plan.value.form, plan.value.receipt);
      if (!saved.ok) { reasons[file.name] = saved.why; continue; }
      if (await release([file.name])) receipts += 1;
      continue;
    }

    // One Vision read per image per drain; the words go to every recogniser.
    const read = await deps.readImage(downloaded.value);
    if (!read.ok) { reasons[file.name] = read.why; continue; }
    const recognised = recogniseImage(read.words);
    if (recognised.kind === "receipt-page") receiptPages.push({ name: file.name, page: recognised.page });
    else if (recognised.kind === "lineman-page") linemanPages.push({ name: file.name, page: recognised.page, createdAt: file.created_at });
    else {
      reasons[file.name] = recognised.reason;
      if (recognised.reason === NOT_YET) remembered.add(file.name);
    }
  }

  for (const group of planReceiptScreenshots(receiptPages)) {
    if (group.plan.action === "keep") {
      for (const name of group.names) reasons[name] = group.plan.reason;
      continue;
    }
    const saved = await deps.postReceipt("screenshot", group.plan.value);
    if (!saved.ok) {
      for (const name of group.names) reasons[name] = saved.why;
      continue;
    }
    if (await release(group.names)) receipts += 1;
  }

  for (const group of planLinemanOrders(linemanPages)) {
    if (group.plan.action === "keep") {
      for (const name of group.names) reasons[name] = group.plan.reason;
      continue;
    }
    const saved = await deps.postOrder(group.plan.value);
    if (!saved.ok) {
      for (const name of group.names) reasons[name] = saved.why;
      continue;
    }
    if (await release(group.names)) orders += 1;
  }

  // A file whose removal succeeded has no reason to show.
  for (const name of removed) delete reasons[name];
  deps.memory.save(remembered, files.filter((file) => !removed.has(file.name)).map((file) => file.name));
  const waiting = files.length - removed.size;
  return { reasons, receipts, orders, waiting, summary: describeDrain({ receipts, orders, waiting }) };
}
