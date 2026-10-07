import { postLinemanCapture, postReceiptCapture } from "@/lib/browser/capture-client";
import { loadRemembered, saveRemembered } from "@/lib/browser/inbox-memory";
import { downloadFromInbox, removeFromInbox, type Outcome, type WaitingFile } from "@/lib/browser/inbox-storage";
import { readImageFileWords, type ImageWordsRead } from "@/lib/browser/ocr-reader";
import { rereadBox } from "@/lib/browser/year-reread";
import { detectAtScale, resolveDetector, type SlipQrReader } from "@/lib/browser/qr-detector";
import { readReceiptPdf } from "@/lib/browser/receipt-reader";
import type { browserSupabase } from "@/lib/browser/supabase";
import type { LinemanPage, ParsedLinemanOrder } from "@/lib/delivery-lineman";
import { postStatementImport, type StatementImportPosted } from "@/lib/browser/inbox-statement-client";
import {
  BUILD_ID, describeDrain, FORGOTTEN_HELD, needsStatementRoute, statementHeldReason, statementNeedsReview, NOT_YET, planLinemanOrders, planPdf, planReceiptScreenshots, planStatement, progressLine, recogniseImage,
  SLIP_AMOUNT_REASON, SLIP_REVIEW_REMEMBERED_REASON, SLIP_UNCONFIRMED_REASON, SLIP_WAITING_REASON, slipPostBody, slipReviewReason,
  type PdfReply, type ReadySlip, type ReadySlipIdentity, type RememberedKind, type SlipPostBody
} from "@/lib/inbox-drain";
import { kindOfObject, lineReceivedAt } from "@/lib/inbox-queue";
import type { ScreenshotPage } from "@/lib/receipt-screenshot";
import type { ParsedReceipt } from "@/lib/receipt-text";
import type { CaptureForm } from "@/lib/receipts";
import { classifySlipRereadingYear, signedSlipAmount, type BoxCrop, type SlipIdentitySource } from "@/lib/slip-batch";
import { proposeSlipText, type Box } from "@/lib/slip-ocr";
import { readPrintedIdentity } from "@/lib/slip-printed";
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
 * not captured here: `app/inbox-files.tsx` hands every ready slip to `captureSlips` as money out
 * straight after the drain, since a slip is always the payer's (owner, 2026-10-07, D-252). Its file
 * stays in the queue until that capture is confirmed.
 *
 * Everything that touches the network or the device comes in through `DrainDeps`, so the drain's own
 * ordering rules are tested with fakes. Two devices draining at once is harmless: a capture is
 * idempotent, and a file another device already removed is simply not counted here.
 */

type Client = NonNullable<ReturnType<typeof browserSupabase>>;

/** `already`: the ledger held this receipt or order before, so the capture stored nothing new. */
export type Posted = { readonly ok: true; readonly already?: boolean } | { readonly ok: false; readonly why: string };

/** A slip capture's answer: stored now, already in the ledger, or why it is not known to be stored. */
export type SlipPosted =
  | { readonly ok: true; readonly outcome: "captured" | "duplicate"; /** A duplicate whose blank payee or memo the re-send filled. */ readonly filled?: boolean }
  | {
    readonly ok: false;
    readonly why: string;
    /**
     * The ledger refused this slip itself (a 4xx with its own reason, e.g. 409 "may already be
     * captured"), so re-sending the same read would be refused again: the slip is remembered as
     * needing checking (D-259). Absent for a network failure, a 5xx or an unconfirmed 2xx.
     */
    readonly settled?: boolean;
  };

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
  /** A second, enlarged read of one box of the image (the printed year D-257, the amount D-259); any failure is a not-ok result, never a throw. */
  readonly rereadBox: (file: Blob, box: Box, crop: BoxCrop) => Promise<ImageWordsRead>;
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

/** 4xx statuses that answer for the session or the server's load, not for the slip: never settled. */
const NOT_ABOUT_THE_SLIP = new Set([401, 403, 408, 429]);

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
      const why = readError(failure, "This slip could not be captured.");
      const reasoned = typeof failure === "object" && failure !== null && "error" in failure;
      const settled = reasoned && response.status >= 400 && response.status < 500 && !NOT_ABOUT_THE_SLIP.has(response.status);
      return settled ? { ok: false, why, settled: true } : { ok: false, why };
    }
    // An unparsable 2xx body means `capture_slip` had already committed, so this is neither a
    // success to remove the file on nor a failure to re-send blindly: the file stays and the owner checks.
    const answer: unknown = await response.json().catch(() => null);
    if (answer === null) return { ok: false, why: SLIP_UNCONFIRMED_REASON };
    const captured = typeof answer === "object" && (answer as { captured?: unknown }).captured === true;
    const filled = !captured && typeof answer === "object" && (answer as { filled?: unknown }).filled === true;
    return { ok: true, outcome: captured ? "captured" : "duplicate", filled };
  } catch {
    return { ok: false, why: "This slip could not be captured." };
  }
}

/** The drain's dependencies in the browser: the inbox bucket, the PDF worker, Vision and the capture routes. */
export function browserDrainDeps(supabase: Client, uid: string): DrainDeps {
  const posted = (result: { ok: true; data: { captured: boolean; merged?: boolean } } | { ok: false; why: string }): Posted =>
    result.ok ? { ok: true, already: !result.data.captured && result.data.merged !== true } : { ok: false, why: result.why };
  // Resolved on the first image scanned and then kept for the drain: the WebAssembly fallback is ~1.1 MB.
  let detector: Promise<SlipQrReader | null> | null = null;
  return {
    download: (name) => downloadFromInbox(supabase, uid, name),
    remove: (names) => removeFromInbox(supabase, uid, names),
    readPdf: readReceiptPdf,
    readImage: readImageFileWords,
    rereadBox,
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
  /** Receipts and LINE MAN orders the ledger already held; their files left the queue without a write. */
  readonly receiptsAlready: number;
  readonly ordersAlready: number;
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

/** How many queued files are read at once. Vision has no quota guard and a 2026-10-02 burst answered error 8, so keep it small. */
export const DRAIN_CONCURRENCY = 3;

type FileOutcome = {
  readonly reason?: string;
  readonly remember?: RememberedKind;
  readonly reviewable?: boolean;
  readonly slip?: ReadySlip;
  readonly receiptPage?: { name: string; page: ScreenshotPage };
  readonly linemanPage?: { name: string; page: LinemanPage; createdAt: string | null };
};

export async function drainInbox(
  files: readonly WaitingFile[], onStatus: (line: string) => void, deps: DrainDeps
): Promise<DrainResult> {
  const reasons: Record<string, string> = {};
  const removed = new Set<string>();
  const remembered = deps.memory.load();
  const slips: ReadySlip[] = [];
  let receipts = 0;
  let orders = 0;
  let receiptsAlready = 0;
  let ordersAlready = 0;
  let statements = 0;
  let statementsAlready = 0;
  let statementsEmpty = 0;
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

  const outcomes: FileOutcome[] = new Array<FileOutcome>(files.length);
  let done = 0;
  let failed = false;
  const finished = (index: number, outcome: FileOutcome): void => {
    outcomes[index] = outcome;
    done += 1;
    // A read still in flight when another failed must not overwrite the page's failure line.
    if (!failed) onStatus(progressLine(done, files.length));
  };

  /** A statement or PDF receipt posts to the server and removes its file, so those run one at a time, after the reads. */
  async function settlePdf(file: WaitingFile, downloaded: Blob): Promise<FileOutcome> {
    const reply = await deps.readPdf(downloaded);
    if (needsStatementRoute(reply)) {
      // An encrypted statement: the server holds the passwords and opens it. A failed or unanswered
      // request keeps the file with the technical reason and is simply asked again next open.
      const answered = await deps.postStatement(file.name);
      if (!answered.ok) return { reason: answered.why };
      const statementPlan = planStatement(answered.answer);
      if (statementPlan.action === "keep") {
        // Not remembered: locked, password-less and needs-account (the owner fixes them without a
        // deploy) and confirm-failed (may be a transient error). They are asked again next open.
        const hold: RememberedKind | undefined = answered.answer.kind === "held" && !FORGOTTEN_HELD.has(answered.answer.reason)
          ? { kind: "held", reason: answered.answer.reason, build: BUILD_ID } : undefined;
        return { reason: statementPlan.reason, reviewable: statementPlan.review === true, remember: hold };
      }
      if (await release([file.name])) {
        if (statementPlan.outcome === "captured") statements += 1;
        else if (statementPlan.outcome === "empty") statementsEmpty += 1;
        else statementsAlready += 1;
      }
      return {};
    }
    const plan = planPdf(reply);
    if (plan.action === "keep") return { reason: plan.reason };
    const saved = await deps.postReceipt(plan.value.form, plan.value.receipt);
    if (!saved.ok) return { reason: saved.why };
    if (await release([file.name])) { if (saved.already) receiptsAlready += 1; else receipts += 1; }
    return {};
  }

  /** Reads one queued file and says what to record; it writes no shared state, so reads can overlap. */
  async function readFile(file: WaitingFile): Promise<FileOutcome | "pdf"> {
    const kind = kindOfObject(file.name);
    if (kind === null) return { reason: NOT_YET };
    // Settled on an earlier drain: no download, no scan and no second Vision read.
    const earlier = remembered.get(file.name);
    if (kind === "image" && typeof earlier === "string") {
      return { reason: earlier === "slip-review" ? SLIP_REVIEW_REMEMBERED_REASON : NOT_YET };
    }
    // A statement the server held on this build: shown again without a download or a server read.
    if (kind === "pdf" && typeof earlier === "object") {
      return { reason: statementHeldReason(earlier.reason), reviewable: statementNeedsReview(earlier.reason) };
    }
    if (kind === "pdf") return "pdf";
    const downloaded = await deps.download(file.name);
    if (!downloaded.ok) return { reason: downloaded.why };

    // The slip QR first, before any Vision read: a slip is told by its QR, and one that is never
    // reaches the receipt recognisers. No QR, or a QR that is not a slip's, falls through unchanged.
    const scan = await deps.scanSlip(downloaded.value);

    // One Vision read per image per drain; the words go to every recogniser.
    const read = await deps.readImage(downloaded.value);

    // No QR at all (not merely a non-slip QR, which may be a payment-request screen): a Krungthai or
    // SCB slip may still carry its identity in print (D-258). A refusal falls through unchanged.
    let slipIdentity: { identity: ReadySlipIdentity; payload: string | null; source: SlipIdentitySource } | null = null;
    if (scan.ok) {
      slipIdentity = { identity: scan.identity, payload: scan.payload, source: "qr" };
    } else if (scan.code === "NO_QR_DETECTED" && read.ok) {
      const printed = readPrintedIdentity(read.words);
      if (printed.ok) {
        slipIdentity = { identity: { bankCode: printed.bankCode, bankQrCode: null, reference: printed.reference }, payload: null, source: "printed" };
      }
    }

    if (slipIdentity !== null) {
      const { identity, payload, source } = slipIdentity;
      // The words are only compared with each other (labels and the figure beside them), so they need
      // no shared coordinate space with the scanned bitmap; `readImageFileWords` decodes the same file.
      const verdict = await classifySlipRereadingYear({
        reference: identity.reference,
        bankCode: identity.bankCode,
        words: read.ok ? read.words : null,
        readerRefusal: read.ok ? null : read.why,
        window: slipDateWindow(new Date()),
        today: new Date(),
        identity: source
      }, (box, crop) => deps.rereadBox(downloaded.value, box, crop));
      if (verdict.status === "ready") {
        // Ready means Vision answered, so the words are there; the payee and memo are best-effort.
        const text = read.ok ? proposeSlipText(read.words, identity.bankCode) : { counterparty: null, note: null };
        return {
          reason: SLIP_WAITING_REASON,
          slip: {
            name: file.name,
            payload,
            identity,
            occurredOn: verdict.date.occurredOn,
            occurredAtTime: verdict.date.occurredAtTime,
            amountMinor: verdict.amountMinor,
            counterparty: text.counterparty,
            note: text.note
          }
        };
      }
      // Remembered only when no further read could change it (D-259): an unreachable reader, or a
      // second, enlarged read that gave nothing usable, is not a verdict on the slip, and the next
      // open may read it cleanly.
      return { reason: slipReviewReason(verdict.reason), remember: verdict.retryable ? undefined : "slip-review" };
    }

    if (!read.ok) return { reason: read.why };
    const recognised = recogniseImage(read.words);
    if (recognised.kind === "receipt-page") return { receiptPage: { name: file.name, page: recognised.page } };
    // The LINE receive time, when the name carries it: images moved from the LINE holding table
    // together all get the same Storage time, which would defeat the 10-minute "added together" rule
    // (D-235 step 2c-i). The time LINE delivered them is the real one (D-241).
    if (recognised.kind === "lineman-page") {
      return { linemanPage: { name: file.name, page: recognised.page, createdAt: lineReceivedAt(file.name) ?? file.created_at } };
    }
    // Not when the scan itself failed: the image may be a slip the next open can scan.
    return { reason: recognised.reason, remember: recognised.reason === NOT_YET && (scan.ok || scan.code !== "SCAN_FAILED") ? "unrecognised" : undefined };
  }

  onStatus(progressLine(0, files.length));
  // A small pool: files are read DRAIN_CONCURRENCY at a time. One failing aborts the drain, as before.
  const deferredPdfs: { index: number; file: WaitingFile }[] = [];
  let next = 0;
  const worker = async (): Promise<void> => {
    while (!failed && next < files.length) {
      const index = next++;
      const file = files[index]!;
      try {
        const result = await readFile(file);
        if (result === "pdf") deferredPdfs.push({ index, file });
        else finished(index, result);
      } catch (error) {
        failed = true;
        throw error;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(DRAIN_CONCURRENCY, files.length) }, worker));

  deferredPdfs.sort((x, y) => x.index - y.index);
  for (const { index, file } of deferredPdfs) {
    const downloaded = await deps.download(file.name);
    finished(index, downloaded.ok ? await settlePdf(file, downloaded.value) : { reason: downloaded.why });
  }

  // Applied in queue order, whatever order the reads finished in: the page groups below depend on it.
  for (const [index, file] of files.entries()) {
    const outcome = outcomes[index]!;
    if (outcome.reason !== undefined) reasons[file.name] = outcome.reason;
    if (outcome.reviewable) reviewable.push(file.name);
    if (outcome.remember !== undefined) remembered.set(file.name, outcome.remember);
    if (outcome.slip) slips.push(outcome.slip);
    if (outcome.receiptPage) receiptPages.push(outcome.receiptPage);
    if (outcome.linemanPage) linemanPages.push(outcome.linemanPage);
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
    if (await release(group.names)) { if (saved.already) receiptsAlready += 1; else receipts += 1; }
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
    if (await release(group.names)) { if (saved.already) ordersAlready += 1; else orders += 1; }
  }

  // A file whose removal succeeded has no reason to show.
  for (const name of removed) delete reasons[name];
  deps.memory.save(remembered, files.filter((file) => !removed.has(file.name)).map((file) => file.name));
  const waiting = files.length - removed.size;
  return {
    reasons, receipts, orders, receiptsAlready, ordersAlready, statements, statementsAlready, reviewable: reviewable.filter((name) => !removed.has(name)), slips, waiting,
    summary: describeDrain({ receipts, orders, receiptsAlready, ordersAlready, statements, statementsAlready, statementsEmpty, slips: 0 })
  };
}

export type SlipCaptureResult = {
  readonly captured: number;
  /** Slips the ledger already held; their files are removed like captured ones. */
  readonly duplicates: number;
  /** Of the duplicates, those whose blank payee or memo this re-send filled in. */
  readonly filled: number;
  /** Why each slip that stayed is still in the queue, by object name. */
  readonly reasons: Record<string, string>;
};

/**
 * Captures the slips the drain held, with the owner's money in or out applied (one answer for the
 * batch), one at a time in order. A slip's file is removed **only after the ledger answered captured
 * or already-in-ledger and Storage confirmed the removal**; a refusal, an unreadable confirmation or
 * a removal that did not go through keeps the file with its reason (a slip stored but not removed is
 * not counted: the next capture finds it already in the ledger).
 *
 * A slip the ledger itself refused (`settled`, e.g. 409) is remembered as needing checking when
 * `memory` is given, so it is not read through Vision again every open (D-259).
 */
export async function captureSlips(
  slips: readonly ReadySlip[], kind: SlipKind, deps: Pick<DrainDeps, "remove" | "postSlip"> & { readonly memory?: DrainDeps["memory"] }
): Promise<SlipCaptureResult> {
  const reasons: Record<string, string> = {};
  const settled: string[] = [];
  let captured = 0;
  let duplicates = 0;
  let filled = 0;
  for (const slip of slips) {
    // Refuses a non-canonical magnitude rather than coercing it, so nothing bad is sent.
    const signed = signedSlipAmount(slip.amountMinor, kind);
    if (signed === null) { reasons[slip.name] = SLIP_AMOUNT_REASON; continue; }
    const posted = await deps.postSlip(slipPostBody(slip, kind, signed));
    if (!posted.ok) {
      reasons[slip.name] = posted.why;
      if (posted.settled === true) settled.push(slip.name);
      continue;
    }
    if (!(await removeAll(deps, [slip.name]))) { reasons[slip.name] = REMOVE_FAILED; continue; }
    if (posted.outcome === "captured") captured += 1;
    else {
      duplicates += 1;
      if (posted.filled === true) filled += 1;
    }
  }
  if (settled.length > 0 && deps.memory) {
    // The drain saved its memory just before this, already pruned to the queue; these join it.
    const remembered = deps.memory.load();
    for (const name of settled) remembered.set(name, "slip-review");
    deps.memory.save(remembered, [...remembered.keys()]);
  }
  return { captured, duplicates, filled, reasons };
}
