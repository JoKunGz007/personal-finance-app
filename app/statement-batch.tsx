"use client";

import { useMemo, useRef, useState } from "react";
import { sha256HexBytes } from "@/lib/canonical";
import {
  describeStatement, planStatementBatch,
  type BlockedReason, type StatementBatchEntry
} from "@/lib/statement-batch";
import type { StatementFrame } from "@/lib/statement-frame";
import type { SourceRowCandidate } from "@/lib/statement";

/**
 * **A cap on memory and wall time, not on spend.** Bulk slip upload caps at fifty because every
 * slip is a billed Google Cloud Vision call (D-135); a statement is parsed entirely on this device
 * by pdf.js, so nothing here is metered. What this bounds is holding forty PDFs' bytes at once and
 * how long a single press can run for.
 */
const MAX_BATCH_FILES = 40;

/** What one chosen file is doing. `read` and `failed` are terminal for a given password. */
type FileState = "queued" | "parsing" | "read" | "failed";

type BatchFile = {
  readonly id: string;
  readonly fileName: string;
  readonly file: File;
  readonly state: FileState;
  /** The PDF's SHA-256, computed before the bytes are transferred to the worker. */
  readonly digest: string | null;
  readonly parsed: { frame: StatementFrame; rows: SourceRowCandidate[]; pageCount: number } | null;
  readonly reason: string | null;
};

/** What the batch hands to the stage machine when the owner picks one statement to work. */
export type BatchHandoff = {
  readonly artifactDigest: string;
  readonly label: string;
  readonly frame: StatementFrame;
  readonly rows: SourceRowCandidate[];
  readonly pageCount: number;
};

/** The blocked verdicts in the owner's words. The enum itself is for code, not for a screen. */
const BLOCKED_LABELS: Record<BlockedReason, string> = {
  "unreadable": "could not be read",
  "not-cross-checked": "totals never confirmed",
  "duplicate-file": "already in this batch"
};

type WorkerReply =
  | { type: "parsed"; frame: StatementFrame; rows: SourceRowCandidate[]; pageCount: number; valueLabels?: string[] }
  | { type: "error"; code: string; reason?: string; detail?: string; message: string };

/**
 * Bulk statement import: many PDFs unlocked and parsed in one pass, then worked one at a time.
 *
 * ## What this is and is not
 *
 * **It is a pre-stage, not a second importer.** Everything after a statement is picked off the
 * worklist — binding, the review table, the confirmation — is the machine that already exists in
 * `app/import-bench.tsx`, entered at its `bind` stage. Nothing about how a statement reaches the
 * ledger changes, and no route or migration is added: this is `POST /api/v1/imports/confirm` as
 * before, once per statement.
 *
 * **Confirming stays one statement at a time, and that is the whole design rather than a
 * limitation.** `assembleImportPayload` returns reconciliation warnings alongside a valid payload,
 * and the sharpest of them says rows were *reordered* to make the balance chain close (D-055).
 * That warning is precisely what the owner is confirming, and re-reconciling the finished payload
 * cannot reproduce it, because the payload's rows are already in applied order. A single button
 * confirming a whole batch would file every one of those unseen — which is the one failure mode
 * that writes to an append-only ledger while hiding what it did.
 *
 * **Nothing leaves this device in this component.** The PDFs are unlocked and parsed by the same
 * worker pair the single import uses, the password lives in this form's state for the length of a
 * press, and the only network call is the one the owner makes later, per statement, from the
 * review table. Statement import remains the one path in this app that reads entirely on the
 * device (D-128, D-129).
 */
export function StatementBatch({ onWork, confirmedDigests }: {
  readonly onWork: (handoff: BatchHandoff) => void;
  /** Artifact digests already confirmed this session, so a worked statement stops inviting a second pass. */
  readonly confirmedDigests: readonly string[];
}) {
  const [files, setFiles] = useState<BatchFile[]>([]);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // Built only from files that have actually been through the worker: a queued file has no digest
  // and no frame, so there is nothing for the policy layer to decide about it yet.
  const plan = useMemo(() => {
    const entries: StatementBatchEntry[] = files
      .filter((item) => item.state === "read" || item.state === "failed")
      .map((item) => ({
        id: item.id,
        label: item.fileName,
        // **A file that failed before it could be hashed still has to reach the plan.** Filtering
        // it out for having no digest would make it vanish from the worklist silently, which is
        // the one thing a list of refusals must never do. Its own id stands in: ids are unique
        // per selection, so an unhashed file can never be mistaken for a duplicate of another —
        // which is correct, because nothing here knows what it contained.
        artifactDigest: item.digest ?? `unhashed:${item.id}`,
        read: item.parsed !== null
          ? { ok: true as const, frame: item.parsed.frame, rowCount: item.parsed.rows.length, pageCount: item.parsed.pageCount }
          : { ok: false as const, reason: item.reason ?? "This statement could not be read." }
      }));
    return planStatementBatch(entries);
  }, [files]);

  const queuedCount = files.filter((item) => item.state === "queued").length;
  const retryable = files.filter((item) => item.state === "failed");

  function patch(id: string, changes: Partial<BatchFile>) {
    setFiles((current) => current.map((item) => (item.id === id ? { ...item, ...changes } : item)));
  }

  function clear() {
    setFiles([]);
    setProgress(null);
    setStatus(null);
    if (fileInput.current) fileInput.current.value = "";
  }

  function onFiles(chosen: FileList | null) {
    // **Copied out before `clear()`, and that order is load-bearing.** A `FileList` is a live view
    // onto the input rather than a snapshot, and `clear()` sets `input.value = ""`, which empties
    // it — so reading `chosen` afterwards finds nothing and every chosen file vanishes silently.
    // Bulk slip upload shipped with exactly this defect and a browser spec caught it (D-135); no
    // unit test could have.
    const chosenFiles = chosen ? [...chosen] : [];
    clear();
    if (chosenFiles.length === 0) return;
    const kept = chosenFiles.slice(0, MAX_BATCH_FILES);
    setFiles(kept.map((file, index) => ({
      // The index is part of the key because two files in one selection can share a name, and a
      // duplicate key would make two rows update as one.
      id: `${index}-${file.name}`,
      fileName: file.name,
      file,
      state: "queued",
      digest: null,
      parsed: null,
      reason: null
    })));
    setStatus(chosenFiles.length > kept.length
      ? `${kept.length} statements taken, and ${chosenFiles.length - kept.length} left out — a batch is capped at ${MAX_BATCH_FILES}. Nothing has been unlocked yet.`
      : `${kept.length} statement(s) chosen. Nothing has been unlocked yet.`);
  }

  /**
   * Unlocks and parses one PDF.
   *
   * **A fresh worker per file, deliberately.** The single import creates one worker per parse and
   * terminates it, and that is the path proven against real documents; reusing one across a batch
   * would mean a parse inheriting whatever the previous one left in the pdf.js document cache, for
   * no gain a person could measure on a handful of statements.
   */
  function parseOne(item: BatchFile, seenDigests: Set<string>): Promise<void> {
    return new Promise<void>((resolve) => {
      void (async () => {
        // **Everything up to the worker handshake is inside this `try`, and that is load-bearing.**
        // An `async` IIFE that rejects never reaches `resolve()`, so `parseMany`'s `await` would
        // wait forever, `setBusy(false)` would never run, and every control in this section —
        // including "Clear this batch" — is `disabled={busy}`. One throw would make the whole form
        // unrecoverable without a page reload. `crypto.subtle` is the concrete way in: it is
        // `undefined` outside a secure context, so `sha256HexBytes` throws on the first file when
        // the app is opened over plain HTTP.
        try {
          const bytes = await item.file.arrayBuffer();

          // Digested before the buffer is transferred to the worker, exactly as the single import
          // does: this identifies the artifact so re-importing the same statement is a detectable
          // conflict, and the bytes themselves never leave the device.
          const digest = await sha256HexBytes(bytes);

          // A repeat of a file already seen in this pass needs no parse. The digest is what
          // `planStatementBatch` blocks it on and the digest is already in hand, so spawning a
          // worker pair to read a PDF whose verdict is settled is pure waste. It still reaches the
          // plan carrying its digest, which is what makes it a `duplicate-file` there rather than
          // an unreadable one — that check runs before the parse verdict for exactly this reason.
          if (seenDigests.has(digest)) {
            patch(item.id, { state: "failed", digest, parsed: null, reason: "Already chosen in this batch." });
            resolve();
            return;
          }
          seenDigests.add(digest);

          const worker = new Worker(new URL("../workers/krungthai.worker.ts", import.meta.url), { type: "module" });
          const finish = () => {
            worker.terminate();
            resolve();
          };
          worker.onmessage = (event: MessageEvent<WorkerReply>) => {
            const reply = event.data;
            if (reply.type === "parsed") {
              patch(item.id, {
                state: "read",
                digest,
                parsed: { frame: reply.frame, rows: reply.rows, pageCount: reply.pageCount },
                reason: null
              });
            } else {
              // The typed code travels with the message. It is a fixed enum carrying no statement
              // content, and without it every failure except an unsupported layout reads
              // identically — which is what makes a worklist of refusals worth reading at all.
              patch(item.id, {
                state: "failed",
                digest,
                parsed: null,
                reason: `${reply.message} (${reply.code}${reply.reason ? ` / ${reply.reason}` : ""})`
                  + (reply.detail ? ` — ${reply.detail}` : "")
              });
            }
            finish();
          };
          worker.onerror = () => {
            patch(item.id, { state: "failed", digest, parsed: null, reason: "The local parser stopped safely on this file. Nothing was uploaded." });
            finish();
          };
          worker.postMessage({ type: "parse", bytes, password }, [bytes]);
        } catch {
          // No digest to record: whatever failed happened at or before computing it, so this entry
          // reaches the plan as unreadable rather than as anything about its content.
          patch(item.id, { state: "failed", parsed: null, reason: "This file could not be prepared for the parser on this device." });
          resolve();
        }
      })();
    });
  }

  /**
   * Unlocks and parses every file in `targets`, one at a time.
   *
   * **Sequential on purpose.** Each parse spawns a worker pair and holds a whole PDF in memory;
   * forty at once is a browser tab falling over, and it would make the failure of one
   * indistinguishable from the failure of all. A backlog is not latency-sensitive.
   */
  async function parseMany(targets: readonly BatchFile[]): Promise<boolean> {
    if (targets.length === 0) return false;
    if (password === "") {
      setStatus("Enter the document password these statements share.");
      return false;
    }
    setBusy(true);
    setProgress({ done: 0, total: targets.length });
    setStatus("Unlocking and reading on this device. Nothing is being uploaded.");

    // Scoped to this pass rather than to the component. A retry re-reads files whose digests were
    // recorded last time, and a set that outlived the pass would call every one of them a duplicate
    // of itself.
    const seenDigests = new Set<string>();
    let done = 0;
    for (const item of targets) {
      patch(item.id, { state: "parsing" });
      await parseOne(item, seenDigests);
      done += 1;
      setProgress({ done, total: targets.length });
    }

    setBusy(false);
    // Cleared the moment the pass ends, matching the single import, which clears it after every
    // attempt. A batch holds it for longer by necessity; it should not hold it for a moment more.
    setPassword("");
    setStatus("Every statement has been read. Work the ready ones in order; each is bound and confirmed on its own.");
    return true;
  }

  /**
   * Retries the refused files with a freshly typed password.
   *
   * **The reason this exists is that one password does not always open every statement.** The
   * masking harness has re-asked per unopened file since it was written, for the same reason: a
   * bank can change its scheme between periods, and a batch that gave up on the whole selection
   * because one file refused would send the owner back to importing one at a time.
   */
  async function retryRefused() {
    // **The password is checked before anything is discarded, and the order is the whole point.**
    // `parseMany` clears the password at the end of every pass, so the field is always empty when
    // this button first appears — pressing it before typing the new one is the ordinary case, not
    // an edge one. Re-queueing first would throw away every refusal reason and every digest, the
    // plan would drop those entries, the blocked list would empty and this button would disappear:
    // the owner would be told nothing, having asked for a retry.
    if (password === "") {
      setStatus("Enter the document password to try these with, then press retry.");
      return;
    }
    const targets = retryable;
    setFiles((current) => current.map((item) => (
      item.state === "failed" ? { ...item, state: "queued", digest: null, parsed: null, reason: null } : item
    )));
    await parseMany(targets);
  }

  const confirmed = new Set(confirmedDigests);

  return (
    <section className="batch-bench" aria-labelledby="statement-batch-title">
      <div className="bench-heading">
        <p className="section-index">Import / batch</p>
        <div>
          <h2 id="statement-batch-title">Or open several at once</h2>
          <p>
            Every PDF is unlocked and read on this device, in the same worker the single import
            uses. Binding and confirming stay one statement at a time.
          </p>
        </div>
      </div>

      <div className="import-controls">
        <label className="file-control">
          <span>Statement PDFs</span>
          <input
            ref={fileInput}
            type="file"
            name="statement-pdfs"
            accept="application/pdf,.pdf"
            multiple
            disabled={busy}
            onChange={(event) => onFiles(event.target.files)}
          />
          <b>{files.length > 0 ? `${files.length} chosen` : "Choose local PDFs…"}</b>
        </label>
        <label className="password-control">
          <span>Document password</span>
          <input
            type="password"
            value={password}
            autoComplete="off"
            name="statement-batch-unlock-code"
            placeholder="Enter only when ready…"
            disabled={busy}
            onChange={(event) => setPassword(event.target.value)}
          />
          <small>Held in this form for one pass, then cleared.</small>
        </label>
        <button
          className="primary-button"
          type="button"
          disabled={busy || queuedCount === 0}
          onClick={() => void parseMany(files.filter((item) => item.state === "queued"))}
        >
          {busy ? "Reading…" : `Unlock & read ${queuedCount || ""}`.trim()}
        </button>
        {retryable.length > 0 && !busy ? (
          <button className="secondary-button" type="button" onClick={() => void retryRefused()}>
            Retry the {retryable.length} that refused
          </button>
        ) : null}
      </div>

      {progress ? (
        <p className="batch-note" role="status">Read {progress.done} of {progress.total}.</p>
      ) : null}
      {status ? <p className="status" role="status">{status}</p> : null}

      {plan.ready.length > 0 ? (
        <>
        <h3 className="batch-note">Ready to bind — in the order to confirm them</h3>
        <ol className="batch-rows">
          {plan.ready.map((item) => {
            const done = confirmed.has(item.entry.artifactDigest);
            const source = files.find((file) => file.id === item.entry.id);
            return (
              <li key={item.entry.id} className="batch-row">
                <div className="batch-row-head">
                  <span className="batch-file">{item.entry.label}</span>
                  <button
                    className={done ? "secondary-button" : "primary-button"}
                    type="button"
                    disabled={busy || !source?.parsed}
                    onClick={() => {
                      if (!source?.parsed) return;
                      onWork({
                        artifactDigest: item.entry.artifactDigest,
                        label: item.entry.label,
                        frame: source.parsed.frame,
                        rows: source.parsed.rows,
                        pageCount: source.parsed.pageCount
                      });
                    }}
                  >
                    {done ? "Confirmed — open again" : "Bind & review"}
                  </button>
                </div>
                <p className="batch-values">{describeStatement(item)}</p>
                {item.overlaps.length > 0 ? (
                  <p className="batch-reason">
                    This period intersects {item.overlaps.length} other statement(s) chosen for the
                    same account. Rows they share will be refused as already imported, which is the
                    ledger working correctly — but confirm the earlier period first so the refusal
                    is the one you expect.
                  </p>
                ) : null}
              </li>
            );
          })}
        </ol>
        </>
      ) : null}

      {plan.blocked.length > 0 ? (
        <>
        <h3 className="batch-note">Not importable — nothing here will be sent</h3>
        <ol className="batch-rows">
          {plan.blocked.map((item) => (
            <li key={item.entry.id} className="batch-row">
              <div className="batch-row-head">
                <span className="batch-file">{item.entry.label}</span>
                {/* The verdict in words, not the discriminant. `item.reason` is a kebab-case enum
                    for code to switch on; printing it put `not-cross-checked` on screen as though
                    it were a sentence, and it was also the only thing distinguishing a blocked row
                    from a ready one, since both lists render the same markup. */}
                <span className="batch-source">{BLOCKED_LABELS[item.reason]}</span>
              </div>
              <p className="batch-reason">{item.message}</p>
            </li>
          ))}
        </ol>
        </>
      ) : null}

      {plan.ready.length > 0 || plan.blocked.length > 0 ? (
        <div className="batch-summary">
          <p className="batch-source">
            {plan.ready.length} ready to bind · {plan.blocked.length} needing attention
          </p>
          <button className="secondary-button" type="button" disabled={busy} onClick={clear}>
            Clear this batch
          </button>
        </div>
      ) : null}
    </section>
  );
}
