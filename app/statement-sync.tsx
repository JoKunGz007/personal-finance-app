"use client";

import { useState } from "react";
import {
  attachmentPath, describeManifest,
  type MailboxFile, type SyncAttachment, type SyncManifest
} from "@/lib/statement-sync";

/** The list endpoint. A constant so there is one place the path is written. */
const MAILBOX_PATH = "/api/v1/imports/mailbox";

/** How many attachments download at once. Each opens its own IMAP session on the server. */
const DOWNLOAD_LANES = 3;

/** The windows a sync can be asked for. `all` is spelled out rather than being a very large day count. */
const WINDOWS = [
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "365", label: "Last 12 months" },
  { value: "all", label: "Everything the senders ever sent" }
] as const;

type Phase = { readonly kind: "idle" } | { readonly kind: "listing" } | { readonly kind: "downloading"; readonly done: number; readonly total: number };

/**
 * The hosted Sync button: pulls statement PDFs out of the dedicated mailbox into the batch.
 *
 * ## Why this is its own file rather than part of `app/statement-batch.tsx`
 *
 * **`app/statement-batch.tsx` is guarded to construct no request of any kind**, because statement
 * import is the only path in this app that reads entirely on the device (D-128, D-129) and opening
 * many at once is exactly where that would erode quietly. That guard is worth keeping literally
 * true, so the one surface that does talk to a server lives here and hands `MailboxFile` objects
 * (a `File` paired with the uid/part that produced it) across. `tests/privacy.test.ts` now asserts
 * both halves: that the batch still fetches nothing, and that everything this file fetches is
 * same-origin and under `/api/v1/`.
 *
 * ## What crosses the wire and what does not
 *
 * **Two GETs and no body, ever.** This asks the app's own server what is in the mailbox and then
 * asks it for each attachment's bytes, a few at a time. It sends nothing: no document password — this
 * component never sees one — no PDF bytes, no parse result, no account. What comes back is the
 * bank's own ciphertext, which this app cannot open and which was already sitting on Google's
 * servers before it moved (D-141).
 *
 * Everything after the files land is the batch that already exists: the owner types the document
 * password once, each PDF is unlocked and read by the pdf.js worker on this device, and each
 * statement is bound and confirmed on its own.
 *
 * ## Why one press does both steps
 *
 * The route lists first and downloads separately so a server holds one attachment at a time and a
 * single bad file is one row rather than a failed sync. **The owner asked for a Sync button**, so
 * the page spends both calls on one press and reports progress — the split is the server's concern,
 * not something to make a person press twice for.
 *
 * ## Why a failed download is a line and not a thrown sync
 *
 * A statement that will not come down should not take the four that did with it. Each failure is
 * collected and named, and whatever arrived still reaches the batch.
 */
export function StatementSync({ busy, room, onFetched, onWorkingChange }: {
  /** True while the batch is parsing. Syncing mid-parse would append files to a pass already running. */
  readonly busy: boolean;
  /**
   * How many more files the batch can take.
   *
   * **The cap has to be applied before the download, or it is not the cap it claims to be.** The
   * manifest is capped against an empty batch; without this the page would pull forty attachments
   * over the network into a batch with room for five and discard thirty-five on arrival — paying
   * for exactly what the limit exists to avoid.
   */
  readonly room: number;
  /** Returns how many were actually taken, which is not always how many were handed over. */
  readonly onFetched: (files: readonly MailboxFile[]) => number;
  /** Raised while listing or downloading, so the batch can hold its own controls meanwhile. */
  readonly onWorkingChange: (working: boolean) => void;
}) {
  const [lookback, setLookback] = useState<string>("30");
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [status, setStatus] = useState<string | null>(null);
  const [failures, setFailures] = useState<readonly string[]>([]);

  const working = phase.kind !== "idle";

  /**
   * One attachment's bytes as a `File` the batch can treat exactly like a chosen one, paired with
   * the uid/part that produced it — carried through so a later confirmation can tell the mailbox
   * this one has actually reached the ledger (D-189).
   */
  async function downloadOne(attachment: SyncAttachment): Promise<MailboxFile> {
    const response = await fetch(attachmentPath(attachment.uid, attachment.part), { cache: "no-store" });
    if (!response.ok) {
      // The route's own sentence when it has one. A non-JSON body means the failure happened
      // outside the route, so the status is all there is to say.
      const detail = await response.json().catch(() => null);
      throw new Error(typeof detail?.error === "string" ? detail.error : `The server answered ${response.status}.`);
    }
    const bytes = await response.arrayBuffer();
    return {
      file: new File([bytes], attachment.name, { type: "application/pdf" }),
      ref: { uid: attachment.uid, part: attachment.part }
    };
  }

  /** One place that moves the phase, so the batch is never left holding its controls after a return. */
  function settle(next: Phase) {
    setPhase(next);
    onWorkingChange(next.kind !== "idle");
  }

  async function sync() {
    setStatus(null);
    setFailures([]);
    if (room <= 0) {
      setStatus("The batch is full. Read or clear what is in it before syncing more.");
      return;
    }
    settle({ kind: "listing" });

    let manifest: SyncManifest;
    try {
      const query = lookback === "all" ? "all=1" : `days=${encodeURIComponent(lookback)}`;
      const response = await fetch(`${MAILBOX_PATH}?${query}`, { cache: "no-store" });
      if (!response.ok) {
        const detail = await response.json().catch(() => null);
        setStatus(typeof detail?.error === "string" ? detail.error : `The mailbox could not be listed (${response.status}).`);
        settle({ kind: "idle" });
        return;
      }
      // **Normalised on arrival, not read field by field afterwards.** A body that is JSON but not
      // a manifest — a proxy's error page, a truncated response — would otherwise reach
      // `describeManifest` and throw on `attachments.length`, turning a bad response into a blank
      // screen instead of a sentence.
      const parsed = await response.json() as Partial<SyncManifest>;
      manifest = {
        messages: typeof parsed.messages === "number" ? parsed.messages : 0,
        attachments: Array.isArray(parsed.attachments) ? parsed.attachments : [],
        truncated: parsed.truncated === true,
        since: typeof parsed.since === "string" ? parsed.since : null
      };
    } catch {
      setStatus("The mailbox could not be reached from this device.");
      settle({ kind: "idle" });
      return;
    }

    const attachments = manifest.attachments;
    if (attachments.length === 0) {
      setStatus(describeManifest(manifest));
      settle({ kind: "idle" });
      return;
    }

    // **Trimmed to the room the batch actually has, before any of it is downloaded.** Reading the
    // whole manifest and letting the batch discard the overflow would pay for those bytes first.
    const wanted = attachments.slice(0, room);

    // **A few at a time, not one at a time and not all at once.** Each download is its own request
    // that opens its own mailbox session, and most of its seconds are that session being set up
    // rather than bytes moving — so one after another made a sync cost the sum of every setup.
    // Forty at once would open forty IMAP logins against one account, which Gmail limits. Every
    // result lands in its own slot, so the batch still receives files in manifest order and each
    // failure still names its own file; a failure is still one line, never the whole sync.
    const files: (MailboxFile | null)[] = wanted.map(() => null);
    const errors: (string | null)[] = wanted.map(() => null);
    let done = 0;
    let next = 0;
    settle({ kind: "downloading", done: 0, total: wanted.length });
    const lane = async () => {
      while (next < wanted.length) {
        const index = next;
        next += 1;
        const attachment = wanted[index];
        if (!attachment) break;
        try {
          files[index] = await downloadOne(attachment);
        } catch (error) {
          errors[index] = `${attachment.name} — ${error instanceof Error ? error.message : "could not be downloaded."}`;
        }
        done += 1;
        settle({ kind: "downloading", done, total: wanted.length });
      }
    };
    await Promise.all(Array.from({ length: Math.min(DOWNLOAD_LANES, wanted.length) }, lane));
    const fetched = files.filter((item): item is MailboxFile => item !== null);
    const failed = errors.filter((line): line is string => line !== null);

    setFailures(failed);
    settle({ kind: "idle" });
    // **What landed, not what was handed over.** `addFiles` can still take fewer than it is given
    // if the batch filled while this ran, and announcing the wrong number beside its own correct
    // one put two contradictory sentences on screen with the false one nearer the button.
    const added = fetched.length > 0 ? onFetched(fetched) : 0;
    setStatus([
      describeManifest(manifest),
      `${added} added to the batch below — type the document password and read them.`,
      attachments.length > wanted.length
        ? `${attachments.length - wanted.length} were left in the mailbox: the batch had room for ${room}.`
        : "",
      failed.length > 0 ? `${failed.length} could not be downloaded.` : ""
    ].filter((part) => part !== "").join(" "));
  }

  return (
    <div className="sync-band">
      <div className="sync-controls">
        <label className="sync-control">
          <span>Look back</span>
          <select
            name="mailbox-window"
            value={lookback}
            disabled={busy || working}
            onChange={(event) => setLookback(event.target.value)}
          >
            {WINDOWS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <button
          className="secondary-button"
          type="button"
          disabled={busy || working}
          onClick={() => void sync()}
        >
          {phase.kind === "listing" ? "Checking the mailbox…"
            : phase.kind === "downloading" ? `Fetching ${phase.done} of ${phase.total}…`
            : "Sync from mailbox"}
        </button>
        <p className="batch-source">
          Fetches the locked PDFs your banks mailed — still encrypted on arrival, opened on this
          device like a local file.
        </p>
      </div>

      {status ? <p className="status" role="status">{status}</p> : null}

      {failures.length > 0 ? (
        <ul className="sync-failures">
          {/* Keyed by position, not by the sentence. Two attachments in one message can share a
              declared name and fail the same way, and a duplicate key makes two rows render as
              one — so the list would silently under-report what went wrong. */}
          {failures.map((line, index) => <li key={index} className="batch-reason">{line}</li>)}
        </ul>
      ) : null}
    </div>
  );
}
