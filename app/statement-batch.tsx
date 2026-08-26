"use client";

import { useMemo, useRef, useState } from "react";
import { useResultBanner } from "@/app/result-banner";
import { StatementSync } from "@/app/statement-sync";
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
  /** Where the bytes came from, so the worklist can say which ones the owner did not choose. */
  readonly source: "chosen" | "mailbox";
  readonly file: File;
  readonly state: FileState;
  /** The PDF's SHA-256, computed before the bytes are transferred to the worker. */
  readonly digest: string | null;
  readonly parsed: { frame: StatementFrame; rows: SourceRowCandidate[]; pageCount: number } | null;
  readonly reason: string | null;
};

/** What the stage machine hands back once a batched statement has reached the ledger. */
export type BatchConfirmation = {
  readonly label: string;
  readonly rows: number;
  readonly accountLabel: string;
  readonly batchId: string;
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
export function StatementBatch({ onWork, confirmedDigests, confirmation, autoBind, onAutoBindChange }: {
  readonly onWork: (handoff: BatchHandoff) => void;
  /** Whether a statement printing an account this ledger holds is bound without asking. */
  readonly autoBind: boolean;
  readonly onAutoBindChange: (next: boolean) => void;
  /** Artifact digests already confirmed this session, so a worked statement stops inviting a second pass. */
  readonly confirmedDigests: readonly string[];
  /** The most recent confirmation, so the worklist says what happened where the owner is looking. */
  readonly confirmation: BatchConfirmation | null;
}) {
  const [files, setFiles] = useState<BatchFile[]>([]);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  /**
   * A monotonic counter behind every entry's key.
   *
   * **The id used to be `${index}-${file.name}` within one selection, and that stopped being unique
   * once a batch could be added to.** Files now arrive from the chooser *and* from the mailbox, so
   * two arrivals could each hold an entry at index 0 with the same name — a duplicate React key,
   * which makes two rows update as one. A counter is unique across arrivals by construction, which
   * a name and a position are not.
   */
  const nextId = useRef(0);
  /**
   * How many entries the batch holds, mirrored in a ref.
   *
   * **`files.length` is a render-time value and the sync resolves outside that render.** The
   * callback `StatementSync` captured at click time closes over the `files` of the click; forty
   * downloads later it is stale, so a `room` computed from it would let a batch capped at forty
   * hold seventy — which is the memory bound the cap exists for, broken by the one code path that
   * takes the longest. The ref is written in the same handler that queues the files, so it is
   * always current. Only `addFiles` and `clear` change the array's length, which is what keeps the
   * two in step.
   */
  const fileCount = useRef(0);
  /** True while `StatementSync` is listing or downloading. Separate from `busy`, which is parsing. */
  const [syncing, setSyncing] = useState(false);
  /**
   * Brings the confirmation into view once a statement has reached the ledger.
   *
   * **The owner is looking at this list, not at the review table he just left** — which is D-139's
   * finding in a second place: a one-time answer belongs where the question was asked. Confirming
   * used to leave a sentence at the bottom of the single-import section, several screens above.
   *
   * **The anchor is a wrapper that is always rendered, rather than a ref on the banner itself.**
   * The banner only exists while there is a confirmation, so a ref on it would be null at the
   * moment the scroll wants to happen — React has not committed the new element yet.
   *
   * The scroll, the focus move and the reasoning behind both live in `app/result-banner.ts`, shared
   * with the card form and the import bench (D-150).
   */
  const { anchor: resultBanner } = useResultBanner(confirmation);

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
  const chosenCount = files.filter((item) => item.source === "chosen").length;
  const retryable = files.filter((item) => item.state === "failed");
  /** Parsing or syncing. Every control in this section is held while either is true. */
  const working = busy || syncing;

  function patch(id: string, changes: Partial<BatchFile>) {
    setFiles((current) => current.map((item) => (item.id === id ? { ...item, ...changes } : item)));
  }

  function clear() {
    setFiles([]);
    fileCount.current = 0;
    setProgress(null);
    setStatus(null);
    if (fileInput.current) fileInput.current.value = "";
  }

  /**
   * Adds files to the batch, from either source.
   *
   * **Adding rather than replacing, and that is a change from how the chooser used to behave.** A
   * selection used to clear the batch first, which was harmless while the chooser was the only way
   * in. It stopped being harmless the moment a mailbox sync could fill the list: choosing one local
   * PDF afterwards would silently discard everything that had just been downloaded. "Clear this
   * batch" is the way to start over, and it is the only way, which is the honest arrangement now
   * that files arrive from two places.
   *
   * **Re-adding the same file is not guarded here on purpose.** `parseOne` blocks a repeat on its
   * SHA-256 and the plan shows it as `duplicate-file`, which is a real check against the bytes;
   * comparing names here would be a weaker check in an earlier place saying the same thing worse.
   */
  function addFiles(incoming: readonly File[], source: "chosen" | "mailbox"): number {
    if (incoming.length === 0) return 0;
    // Room comes from the ref, not from `files.length`: see `fileCount`. The work stays out of the
    // `setFiles` updater because an updater must be pure — `reactStrictMode` runs it twice — and
    // advancing a counter or setting other state in there is the impurity that exists to expose.
    const room = Math.max(0, MAX_BATCH_FILES - fileCount.current);
    const kept = incoming.slice(0, room);
    const added: BatchFile[] = kept.map((file) => {
      nextId.current += 1;
      return {
        id: `f${nextId.current}`,
        fileName: file.name,
        source,
        file,
        state: "queued",
        digest: null,
        parsed: null,
        reason: null
      };
    });
    fileCount.current += added.length;
    setFiles((current) => [...current, ...added]);
    setStatus(incoming.length > kept.length
      ? `${kept.length} added, and ${incoming.length - kept.length} left out — a batch is capped at ${MAX_BATCH_FILES}. Nothing has been unlocked yet.`
      : `${kept.length} statement(s) added. Nothing has been unlocked yet.`);
    // **The accepted count travels back to the caller.** `StatementSync` used to report what it
    // downloaded, which is not what landed: with the batch nearly full it announced "40 added"
    // beside this function's "5 added, and 35 left out" — two contradictory sentences, and the one
    // nearer the button was the false one.
    return added.length;
  }

  function onFiles(chosen: FileList | null) {
    // **Copied out before the input is reset, and that order is load-bearing.** A `FileList` is a
    // live view onto the input rather than a snapshot, so reading it after `input.value = ""` finds
    // nothing and every chosen file vanishes silently. Bulk slip upload shipped with exactly this
    // defect and a browser spec caught it (D-135); no unit test could have.
    const chosenFiles = chosen ? [...chosen] : [];
    // Cleared so choosing the *same* file again still fires a change event — without it, a file
    // removed from the batch could not be put back.
    if (fileInput.current) fileInput.current.value = "";
    addFiles(chosenFiles, "chosen");
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
            uses. Binding and confirming stay one statement at a time. Choose local files, or sync
            the locked PDFs straight from the statement mailbox.
          </p>
        </div>
      </div>

      {/* **The one surface in this section that talks to a server, and it is a separate file for
          that reason.** This component is asserted to construct no request of any kind, because
          statement import is the only path in this app that reads entirely on the device (D-128,
          D-129) — so the mailbox fetch lives in `app/statement-sync.tsx` and hands `File`s back,
          and `tests/privacy.test.ts` guards both halves separately. What it downloads is the
          bank's own ciphertext; the document password below never reaches it. */}
      <StatementSync
        busy={busy}
        // How many more this batch can hold. Without it a sync downloads forty attachments into a
        // batch with room for five and throws thirty-five away *after* paying for them over the
        // network — which is the opposite of what the cap was for.
        room={Math.max(0, MAX_BATCH_FILES - files.length)}
        onWorkingChange={setSyncing}
        onFetched={(fetched) => addFiles(fetched, "mailbox")}
      />

      <div className="import-controls">
        <label className="file-control">
          <span>Statement PDFs</span>
          <input
            ref={fileInput}
            type="file"
            name="statement-pdfs"
            accept="application/pdf,.pdf"
            multiple
            disabled={working}
            onChange={(event) => onFiles(event.target.files)}
          />
          {/* **Counts the ones actually chosen here, not the whole batch.** Fed by `files.length`
              it read "40 chosen" on the local file control after a mailbox sync the owner had
              chosen nothing in — which is the one place the `source` field earns its keep. */}
          <b>{chosenCount > 0 ? `${chosenCount} chosen` : "Choose local PDFs…"}</b>
        </label>
        <label className="password-control">
          <span>Document password</span>
          <input
            type="password"
            value={password}
            autoComplete="off"
            name="statement-batch-unlock-code"
            placeholder="Enter only when ready…"
            disabled={working}
            onChange={(event) => setPassword(event.target.value)}
          />
          <small>Held in this form for one pass, then cleared.</small>
        </label>
        <button
          className="primary-button"
          type="button"
          disabled={working || queuedCount === 0}
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

      <label className="auto-bind-control">
        <input
          type="checkbox"
          name="auto-bind"
          checked={autoBind}
          disabled={working}
          onChange={(event) => onAutoBindChange(event.target.checked)}
        />
        <span>
          <b>Bind automatically when the account is unambiguous.</b> A statement prints a bank and
          four digits, and this ledger holds at most one account for that pair — so when exactly one
          matches, it is bound without asking and you go straight to the review. Everything else is
          unchanged: a mismatch is still refused, every balance is still shown, and nothing reaches
          the ledger until you confirm it. Turn this off to choose the account yourself; the
          matching one is preselected either way.
        </span>
      </label>

      {progress ? (
        <p className="batch-note" role="status">Read {progress.done} of {progress.total}.</p>
      ) : null}
      {status ? <p className="status" role="status">{status}</p> : null}

      <div ref={resultBanner} className="capture-result-anchor">
        {confirmation ? (
          <div className="capture-result captured" role="status" tabIndex={-1} data-capture-result>
            <p>
              <b>{confirmation.label} is in the ledger.</b>{" "}
              {confirmation.rows} row(s) confirmed into {confirmation.accountLabel}, as batch{" "}
              <span className="mono">{confirmation.batchId}</span>.
            </p>
            <p>
              The last backup no longer covers the ledger — export a new one from Recovery.{" "}
              {plan.ready.length > 1 ? "Carry on with the next statement below." : null}
            </p>
          </div>
        ) : null}
      </div>

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
                  <span className="batch-file">
                    {item.entry.label}
                    {/* Which files the owner did not choose himself. It matters most on the blocked
                        list — an unreadable local file is a file he picked, and an unreadable
                        mailbox file is a bank attaching something that is not a statement. */}
                    {source?.source === "mailbox" ? <span className="batch-source"> · from the mailbox</span> : null}
                  </span>
                  <button
                    className={done ? "secondary-button" : "primary-button"}
                    type="button"
                    disabled={working || !source?.parsed}
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
                <span className="batch-file">
                  {item.entry.label}
                  {files.find((file) => file.id === item.entry.id)?.source === "mailbox"
                    ? <span className="batch-source"> · from the mailbox</span>
                    : null}
                </span>
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

      {/* **Shown whenever the batch holds anything at all, not only once something has been read.**
          It was gated on the *plan*, which is built solely from files that have been through the
          worker — so a sync that queued forty PDFs the owner did not want offered no way out: no
          Clear button existed, the cap refused every further add, and the chooser could only
          append. A page reload was the only escape. Since selection became additive, this button
          is the one recovery path there is, so it may not depend on having got as far as a parse. */}
      {files.length > 0 ? (
        <div className="batch-summary">
          <p className="batch-source">
            {plan.ready.length > 0 || plan.blocked.length > 0
              ? `${plan.ready.length} ready to bind · ${plan.blocked.length} needing attention`
              : `${files.length} waiting to be unlocked`}
          </p>
          <button className="secondary-button" type="button" disabled={working} onClick={clear}>
            Clear this batch
          </button>
        </div>
      ) : null}
    </section>
  );
}
