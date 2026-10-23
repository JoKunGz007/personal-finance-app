import { sha256HexBytes } from "@/lib/canonical";
import type { StatementFrame } from "@/lib/statement-frame";
import type { SourceRowCandidate } from "@/lib/statement";

/**
 * Reading a statement PDF on this device: digest the bytes, hand them and the document password to
 * one worker, interpret the answer. **Extracted from `app/import-bench.tsx` and
 * `app/statement-batch.tsx`**, which each wrote this handshake and had drifted — one hashed with no
 * `try`, neither had a timeout. The page text never leaves the worker, and the password is only
 * ever posted to it: never logged, stored or returned from here.
 */

/** What `workers/krungthai.worker.ts` posts back. Its one home; both components import it. */
export type WorkerReply =
  | { type: "parsed"; frame: StatementFrame; rows: SourceRowCandidate[]; pageCount: number; valueLabels?: string[] }
  | {
      type: "error"; code: string; reason?: string; detail?: string;
      labelCandidates?: string[][]; valueLabels?: string[]; structure?: string[];
      message: string;
    };

export type ParsedReply = Extract<WorkerReply, { type: "parsed" }>;
export type RefusalReply = Extract<WorkerReply, { type: "error" }>;

/**
 * `failure` says which step failed: a refusal carries the worker's reply (typed code and
 * diagnostics); a stopped worker or a timeout lets a caller keep its own wording or use `message`.
 * Only a failed hash has no digest.
 */
export type StatementRead =
  | { ok: true; digest: string; reply: ParsedReply }
  | { ok: false; failure: "refusal"; digest: string; reply: RefusalReply; message: string }
  | { ok: false; failure: "worker" | "timeout"; digest: string; message: string }
  | { ok: false; failure: "hash"; message: string };

// A statement is a handful of pages read by pdf.js; a worker silent for this long is not going to
// answer. Same bound as a receipt (`lib/browser/receipt-reader.ts`): nothing here is slower by a
// factor that a minute does not cover.
const READ_TIMEOUT_MS = 60_000;

/**
 * One PDF, one worker. **Always resolves** — a hash that cannot run, a worker error and a worker
 * that never answers all become `ok: false` — so one bad file cannot leave itself, or a batch's
 * `await`, stuck on "Reading". The digest is of the bytes *before* they are transferred.
 */
export async function readStatementPdf(
  bytes: ArrayBuffer,
  password: string,
  options: { createWorker?: () => Worker; timeoutMs?: number } = {}
): Promise<StatementRead> {
  // Digested before the buffer is transferred to the worker. This identifies the PDF for
  // import_artifacts so re-importing the same statement is a detectable conflict; the bytes
  // themselves never leave the device. `crypto.subtle` is undefined outside a secure context, so
  // this throws over plain HTTP.
  let digest: string;
  try {
    digest = await sha256HexBytes(bytes);
  } catch {
    return { ok: false, failure: "hash", message: "This file could not be prepared for the parser on this device." };
  }
  const createWorker = options.createWorker
    ?? (() => new Worker(new URL("../../workers/krungthai.worker.ts", import.meta.url), { type: "module" }));
  const timeoutMs = options.timeoutMs ?? READ_TIMEOUT_MS;
  return new Promise<StatementRead>((resolve) => {
    let worker: Worker;
    try {
      worker = createWorker();
    } catch {
      resolve({ ok: false, failure: "worker", digest, message: "The local parser could not be started on this device." });
      return;
    }
    const timer = setTimeout(
      () => finish({ ok: false, failure: "timeout", digest, message: "Reading this PDF took too long, so it was stopped." }),
      timeoutMs
    );
    let settled = false;
    function finish(result: StatementRead) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      worker.terminate();
      resolve(result);
    }
    const stopped = (): StatementRead => ({
      ok: false, failure: "worker", digest,
      message: "The local parser stopped safely. No statement data was uploaded."
    });
    worker.onmessage = (event: MessageEvent<WorkerReply>) => {
      const reply = event.data;
      // Anything that is neither shape is a worker that stopped making sense, not a refusal.
      finish(reply?.type === "parsed" ? { ok: true, digest, reply }
        : reply?.type === "error" ? { ok: false, failure: "refusal", digest, reply, message: reply.message }
          : stopped());
    };
    worker.onerror = () => finish(stopped());
    worker.onmessageerror = () => finish(stopped());
    try {
      worker.postMessage({ type: "parse", bytes, password }, [bytes]);
    } catch {
      finish(stopped());
    }
  });
}
