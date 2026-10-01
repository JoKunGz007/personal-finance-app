import { postLinemanCapture, postReceiptCapture } from "@/lib/browser/capture-client";
import { loadRemembered, saveRemembered } from "@/lib/browser/inbox-memory";
import { downloadFromInbox, removeFromInbox, type Outcome, type WaitingFile } from "@/lib/browser/inbox-storage";
import { readImageFileWords, type ImageWordsRead } from "@/lib/browser/ocr-reader";
import { detectAtScale, resolveDetector, type SlipQrReader } from "@/lib/browser/qr-detector";
import { readReceiptPdf } from "@/lib/browser/receipt-reader";
import type { browserSupabase } from "@/lib/browser/supabase";
import type { LinemanPage, ParsedLinemanOrder } from "@/lib/delivery-lineman";
import { postStatementImport, type StatementImportPosted } from "@/lib/browser/inbox-statement-client";
import {
  describeDrain, needsStatementRoute, NOT_YET, planLinemanOrders, planPdf, planReceiptScreenshots, planStatement, progressLine, recogniseImage,
  SLIP_AMOUNT_REASON, SLIP_REVIEW_REMEMBERED_REASON, SLIP_UNCONFIRMED_REASON, SLIP_WAITING_REASON, slipPostBody, slipReviewReason,
  type PdfReply, type ReadySlip, type RememberedKind, type SlipPostBody
} from "@/lib/inbox-drain";
import { kindOfObject } from "@/lib/inbox-queue";
import type { ScreenshotPage } from "@/lib/receipt-screenshot";
import type { ParsedReceipt } from "@/lib/receipt-text";
import type { CaptureForm } from "@/lib/receipts";
import { classifySlip, signedSlipAmount } from "@/lib/slip-batch";
import { scanForSlipIdentity, type SlipScanResult } from "@/lib/slip-scan";
import { slipDateWindow, type SlipKind } from "@/lib/slips";
import { readError } from "@/lib/wire";

/**
 * Drains the Inbox queue in the browser (D-235 steps 2c-i and 2c-ii): each waiting file is
 * downloaded, read by the parsers the Receipts and LINE MAN pages already use, captured through the
 * same routes, and removed from the queue **only after the route answered success or already-stored**
 * and Storage confirmed the removal. A file that is not handled stays, with a plain reason. Files are
 * processed one at a time, oldest first; each image is read by Vision once, and its words feed every
 * recogniser. The decisions are in `lib/inbox-drain.ts`.
 *
 * **A bank slip is told by its QR, scanned on the device before any Vision read**, so a slip never
 * reaches the receipt recognisers. A slip whose amount and date were read exactly is *ready* but is
 * not captured here: money in or out is the owner's answer, asked once for the batch, and
 * `captureSlips` applies it afterwards. Its file stays in the queue until then.
 *
 * Everything that touches the network or the device comes in through `DrainDeps`, so the drain's own
 * ordering rules are tested with fakes. Two devices draining at once is harmless: a capture is
 * idempotent, and a file another device already removed is simply not counted here.
 */

type Client = NonNullable<ReturnType<typeof browserSupabase>>;

export type Posted = { readonly ok: true } | { readonly ok: false; readonly why: string };

/** A slip capture's answer: stored now, already in the ledger, or why it is not known to be stored. */
export type SlipPosted =
  | { readonly ok: true; readonly outcome: "captured" | "duplicate" }
  | { readonly ok: false; readonly why: string };

/**
 * What the device's scan answered. `SCAN_FAILED` is the scan itself failing (the detector would not
 * load, or decoding threw): no verdict on the image, so it must never be remembered as "unrecognised".
 * A `SlipScanResult` refusal, `NO_QR_DETECTED` included, is the scan's own answer about the image.
 */
export type SlipScanAttempt = SlipScanResult | { readonly ok: false; readonly code: "SCAN_FAILED"; readonly message: string };

export type DrainDeps = {
  readonly download: (name: string) => Promise<Outcome<Blob>>;
  /** The number of objects Storage says it removed. */
  readonly remove: (names: readonly string[]) => Promise<Outcome<number>>;
  readonly readPdf: (file: Blob) => Promise<PdfReply>;
  readonly readImage: (file: Blob) => Promise<ImageWordsRead>;
  /** The slip QR on this device; any failure is a not-ok result, never a throw. */
  readonly scanSlip: (file: Blob) => Promise<SlipScanAttempt>;
  readonly postReceipt: (form: CaptureForm, receipt: ParsedReceipt) => Promise<Posted>;
  readonly postOrder: (order: ParsedLinemanOrder) => Promise<Posted>;
  readonly postSlip: (body: SlipPostBody) => Promise<SlipPosted>;
  /** Asks the server to open and import a statement PDF waiting in the queue; never throws. */
  readonly postStatement: (name: string) => Promise<StatementImportPosted>;
  readonly memory: {
    readonly load: () => Map<string, RememberedKind>;
    readonly save: (remembered: ReadonlyMap<string, RememberedKind>, inQueue: readonly string[]) => void;
  };
};

const NO_SLIP_SCAN = "This image could not be scanned for a slip QR.";

/** `POST /api/v1/slips`, answered as a `SlipPosted`; the request is the one `app/slip-batch.tsx` sends. */
async function postSlipCapture(body: SlipPostBody): Promise<SlipPosted> {
  try {
    const response = await fetch("/api/v1/slips", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!response.ok) {
      const failure: unknown = await response.json().catch(() => null);
      return { ok: false, why: readError(failure, "This slip could not be captured.") };
    }
    // An unparsable 2xx body means `capture_slip` had already committed, so this is neither a
    // success to remove the file on nor a failure to re-send blindly: the file stays and the owner checks.
    const answer: unknown = await response.json().catch(() => null);
    if (answer === null) return { ok: false, why: SLIP_UNCONFIRMED_REASON };
    const captured = typeof answer === "object" && (answer as { captured?: unknown }).captured === true;
    return { ok: true, outcome: captured ? "captured" : "duplicate" };
  } catch {
    return { ok: false, why: "This slip could not be captured." };
  }
}

/** The drain's dependencies in the browser: the inbox bucket, the PDF worker, Vision and the capture routes. */
export function browserDrainDeps(supabase: Client, uid: string): DrainDeps {
  const posted = (result: { ok: true } | { ok: false; why: string }): Posted => (result.ok ? { ok: true } : { ok: false, why: result.why });
  // Resolved on the first image scanned and then kept for the drain: the WebAssembly fallback is ~1.1 MB.
  let detector: Promise<SlipQrReader | null> | null = null;
  return {
    download: (name) => downloadFromInbox(supabase, uid, name),
    remove: (names) => removeFromInbox(supabase, uid, names),
    readPdf: readReceiptPdf,
    readImage: readImageFileWords,
    scanSlip: async (file) => {
      let bitmap: ImageBitmap | null = null;
      try {
        detector ??= resolveDetector();
        const reader = await detector;
        if (!reader) return { ok: false, code: "SCAN_FAILED", message: "No QR reader could be loaded in this browser." };
        const decoded = await createImageBitmap(file);
        bitmap = decoded;
        return await scanForSlipIdentity((scale) => detectAtScale(decoded, reader, scale));
      } catch {
        return { ok: false, code: "SCAN_FAILED", message: NO_SLIP_SCAN };
      } finally {
        bitmap?.close();
      }
    },
    postReceipt: async (form, receipt) => posted(await postReceiptCapture(form, receipt)),
    postOrder: async (order) => posted(await postLinemanCapture(order)),
    postSlip: postSlipCapture,
    postStatement: postStatementImport,
    memory: { load: loadRemembered, save: saveRemembered }
  };
}

export type DrainResult = {
  /** Why each file that stayed is still waiting, by object name. */
  readonly reasons: Record<string, string>;
  readonly receipts: number;
  readonly orders: number;
  /** Statement PDFs the server imported and that left the queue. */
  readonly statements: number;
  /** Statement PDFs already in the ledger (same file), which left the queue without a write. */
  readonly statementsAlready: number;
  /** Names of held statements the owner can open on the Import page. */
  readonly reviewable: readonly string[];
  /** Slips read exactly and held for the owner's money in or out; their files are still in the queue. */
  readonly slips: readonly ReadySlip[];
  readonly waiting: number;
  readonly summary: string;
};

const REMOVE_FAILED = "Imported, but it could not be removed from the queue. It will be removed next time.";

/**
 * Removes files whose capture succeeded and says whether **every** one went: Storage answers with
 * the objects it removed, so a shorter answer than the request means some file is still there.
 */
async function removeAll(deps: Pick<DrainDeps, "remove">, names: readonly string[]): Promise<boolean> {
  const result = await deps.remove(names);
  return result.ok && result.value === names.length;
}

export async function drainInbox(
  files: readonly WaitingFile[], onStatus: (line: string) => void, deps: DrainDeps
): Promise<DrainResult> {
  const reasons: Record<string, string> = {};
  const removed = new Set<string>();
  const remembered = deps.memory.load();
  const slips: ReadySlip[] = [];
  let receipts = 0;
  let orders = 0;
  let statements = 0;
  let statementsAlready = 0;
  const reviewable: string[] = [];

  /**
   * Removes files whose capture succeeded and says whether **every** one went. Files Storage did not
   * remove stay, say so, and are not counted as imported now (the next drain finds them already stored).
   */
  async function release(names: readonly string[]): Promise<boolean> {
    const all = await removeAll(deps, names);
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
    // Settled on an earlier drain: no download, no scan and no second Vision read.
    const earlier = kind === "image" ? remembered.get(file.name) : undefined;
    if (earlier !== undefined) {
      reasons[file.name] = earlier === "slip-review" ? SLIP_REVIEW_REMEMBERED_REASON : NOT_YET;
      continue;
    }
    const downloaded = await deps.download(file.name);
    if (!downloaded.ok) { reasons[file.name] = downloaded.why; continue; }

    if (kind === "pdf") {
      const reply = await deps.readPdf(downloaded.value);
      if (needsStatementRoute(reply)) {
        // An encrypted statement: the server holds the passwords and opens it. A failed or unanswered
        // request keeps the file with the technical reason and is simply asked again next open.
        const answered = await deps.postStatement(file.name);
        if (!answered.ok) { reasons[file.name] = answered.why; continue; }
        const statementPlan = planStatement(answered.answer);
        if (statementPlan.action === "keep") {
          reasons[file.name] = statementPlan.reason;
          if (statementPlan.review) reviewable.push(file.name);
          continue;
        }
        if (await release([file.name])) {
          if (statementPlan.outcome === "captured") statements += 1; else statementsAlready += 1;
        }
        continue;
      }
      const plan = planPdf(reply);
      if (plan.action === "keep") { reasons[file.name] = plan.reason; continue; }
      const saved = await deps.postReceipt(plan.value.form, plan.value.receipt);
      if (!saved.ok) { reasons[file.name] = saved.why; continue; }
      if (await release([file.name])) receipts += 1;
      continue;
    }

    // The slip QR first, before any Vision read: a slip is told by its QR, and one that is never
    // reaches the receipt recognisers. No QR, or a QR that is not a slip's, falls through unchanged.
    const scan = await deps.scanSlip(downloaded.value);

    // One Vision read per image per drain; the words go to every recogniser.
    const read = await deps.readImage(downloaded.value);

    if (scan.ok) {
      // The words are only compared with each other (labels and the figure beside them), so they need
      // no shared coordinate space with the scanned bitmap; `readImageFileWords` decodes the same file.
      const verdict = classifySlip({
        reference: scan.identity.reference,
        bankCode: scan.identity.bankCode,
        words: read.ok ? read.words : null,
        readerRefusal: read.ok ? null : read.why,
        window: slipDateWindow(new Date()),
        today: new Date()
      });
      if (verdict.status === "ready") {
        slips.push({
          name: file.name,
          payload: scan.payload,
          identity: scan.identity,
          occurredOn: verdict.date.occurredOn,
          occurredAtTime: verdict.date.occurredAtTime,
          amountMinor: verdict.amountMinor
        });
        reasons[file.name] = SLIP_WAITING_REASON;
      } else {
        reasons[file.name] = slipReviewReason(verdict.reason);
        // Remembered only once Vision actually answered: an unreachable reader is not a verdict on
        // the slip, and the next open may read it cleanly.
        if (read.ok) remembered.set(file.name, "slip-review");
      }
      continue;
    }

    if (!read.ok) { reasons[file.name] = read.why; continue; }
    const recognised = recogniseImage(read.words);
    if (recognised.kind === "receipt-page") receiptPages.push({ name: file.name, page: recognised.page });
    else if (recognised.kind === "lineman-page") linemanPages.push({ name: file.name, page: recognised.page, createdAt: file.created_at });
    else {
      reasons[file.name] = recognised.reason;
      // Not when the scan itself failed: the image may be a slip the next open can scan.
      if (recognised.reason === NOT_YET && scan.code !== "SCAN_FAILED") remembered.set(file.name, "unrecognised");
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
  return {
    reasons, receipts, orders, statements, statementsAlready, reviewable: reviewable.filter((name) => !removed.has(name)), slips, waiting,
    summary: describeDrain({ receipts, orders, statements, statementsAlready, slips: slips.length })
  };
}

export type SlipCaptureResult = {
  readonly captured: number;
  /** Slips the ledger already held; their files are removed like captured ones. */
  readonly duplicates: number;
  /** Why each slip that stayed is still in the queue, by object name. */
  readonly reasons: Record<string, string>;
};

/**
 * Captures the slips the drain held, with the owner's money in or out applied (one answer for the
 * batch), one at a time in order. A slip's file is removed **only after the ledger answered captured
 * or already-in-ledger and Storage confirmed the removal**; a refusal, an unreadable confirmation or
 * a removal that did not go through keeps the file with its reason (a slip stored but not removed is
 * not counted: the next capture finds it already in the ledger).
 */
export async function captureSlips(
  slips: readonly ReadySlip[], kind: SlipKind, deps: Pick<DrainDeps, "remove" | "postSlip">
): Promise<SlipCaptureResult> {
  const reasons: Record<string, string> = {};
  let captured = 0;
  let duplicates = 0;
  for (const slip of slips) {
    // Refuses a non-canonical magnitude rather than coercing it, so nothing bad is sent.
    const signed = signedSlipAmount(slip.amountMinor, kind);
    if (signed === null) { reasons[slip.name] = SLIP_AMOUNT_REASON; continue; }
    const posted = await deps.postSlip(slipPostBody(slip, kind, signed));
    if (!posted.ok) { reasons[slip.name] = posted.why; continue; }
    if (!(await removeAll(deps, [slip.name]))) { reasons[slip.name] = REMOVE_FAILED; continue; }
    if (posted.outcome === "captured") captured += 1;
    else duplicates += 1;
  }
  return { captured, duplicates, reasons };
}
