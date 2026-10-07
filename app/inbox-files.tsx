"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import {
  listWaiting, ownerUid, removeExpired, removeFromInbox, uploadToInbox, type WaitingFile
} from "@/lib/browser/inbox-storage";
import { captureSlips, browserDrainDeps, drainInbox } from "@/lib/browser/inbox-importer";
import Link from "next/link";
import { describeSlipCapture, REVIEW_LINK_LABEL, reviewHref } from "@/lib/inbox-drain";
import { LedgerNote } from "@/app/ledger-note";
import { formatDate } from "@/app/ledger-shared";
import { encodeForReader } from "@/lib/browser/ocr-reader";
import { browserSupabase } from "@/lib/browser/supabase";
import { discardLineImage, lineBotStatus, moveLineImages, type StuckImage } from "@/lib/browser/line-inbox";
import { addedLabel, kindOfObject, planFile, sizeLabel, type InboxPlan } from "@/lib/inbox-queue";
import { kindLabel, loadInboxView, saveInboxView, type InboxView } from "@/lib/inbox-view";
import { useInboxPreviews } from "@/app/use-inbox-previews";

type Status =
  | { readonly state: "uploading" }
  | { readonly state: "queued" }
  | { readonly state: "refused"; readonly reason: string };

type Picked = { readonly key: number; readonly name: string; readonly status: Status };

// The choice made this visit, so a browser that refuses storage still switches views.
let chosenView: InboxView | null = null;
const viewListeners = new Set<() => void>();
function announceView(next: InboxView) {
  chosenView = next;
  saveInboxView(next);
  for (const listener of viewListeners) listener();
}
function subscribeView(listener: () => void) {
  viewListeners.add(listener);
  return () => { viewListeners.delete(listener); };
}

/** PNG bytes for a file the queue does not hold as it is (HEIC and the like), or null. */
async function toPng(file: File): Promise<Blob | null> {
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file);
    return await encodeForReader(bitmap);
  } catch {
    return null;
  } finally {
    bitmap?.close();
  }
}

/**
 * "Add files": pick images and PDFs, which wait in the private inbox bucket until they are imported
 * (D-235). When the page opens and after each batch, the queue is drained: 7-Eleven receipts and LINE
 * MAN orders are imported and leave the queue, and anything else waits with a reason. Files older
 * than seven days are removed when the page opens.
 */
export function InboxFiles() {
  const [supabase] = useState(browserSupabase);
  const [picked, setPicked] = useState<Picked[]>([]);
  const [waiting, setWaiting] = useState<WaitingFile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(0);
  const [lineLine, setLineLine] = useState<string | null>(null);
  const [lineError, setLineError] = useState<string | null>(null);
  const [stuck, setStuck] = useState<readonly StuckImage[]>([]);
  const [botStatus, setBotStatus] = useState<{ readonly connected: boolean; readonly connectedAt: string | null } | null>(null);
  const [connectLine, setConnectLine] = useState<{ readonly text: string; readonly ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [drainLine, setDrainLine] = useState<string | null>(null);
  const [reviewable, setReviewable] = useState<readonly string[]>([]);
  // Read from storage on the client only; the server render and first client render both show the table.
  const view = useSyncExternalStore(subscribeView, () => chosenView ?? loadInboxView(), () => "table" as InboxView);
  const [enlarged, setEnlarged] = useState<string | null>(null);
  const enlargeDialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const imageNames = (waiting ?? []).filter((file) => kindOfObject(file.name) === "image").map((file) => file.name);
  const previews = useInboxPreviews(supabase, imageNames);
  const counter = useRef(0);
  // Who owns `busy`. Only the run that claimed it may release it, so a second run that finds it taken
  // (React's double effect in development, a press during a drain) neither starts nor clears it.
  const claimed = useRef(false);
  const claim = useCallback(() => {
    if (claimed.current) return false;
    claimed.current = true;
    setBusy(true);
    return true;
  }, []);
  const release = useCallback(() => {
    claimed.current = false;
    setBusy(false);
  }, []);

  /** Lists the queue, oldest first; null when it could not be listed. */
  const refresh = useCallback(async (): Promise<WaitingFile[] | null> => {
    if (!supabase) return null;
    const uid = await ownerUid(supabase);
    if (!uid.ok) { setError(uid.why); setWaiting(null); return null; }
    const listed = await listWaiting(supabase, uid.value);
    if (!listed.ok) { setError(listed.why); return null; }
    setError(null);
    setWaiting(listed.value);
    return listed.value;
  }, [supabase]);

  /** Imports what the queue holds, then lists it again. Called only by a run that holds the claim. */
  const drain = useCallback(async (files: WaitingFile[]) => {
    if (!supabase || files.length === 0) return;
    let failed = false;
    try {
      const uid = await ownerUid(supabase);
      if (!uid.ok) { setError(uid.why); return; }
      const deps = browserDrainDeps(supabase, uid.value);
      const result = await drainInbox(files, setDrainLine, deps);
      // **A slip is always money out** (owner, 2026-10-07, superseding D-236's one answer per batch):
      // a bank slip is the payer's receipt, so every slip the owner forwards is a payment he made.
      // Ready slips are captured here, in the same claimed run, rather than waiting on a button.
      const captured = result.slips.length > 0 ? await captureSlips(result.slips, "withdrawal", deps) : null;
      const reasons = { ...result.reasons };
      for (const slip of result.slips) {
        const why = captured?.reasons[slip.name];
        if (why) reasons[slip.name] = why;
        else delete reasons[slip.name];
      }
      setReasons(reasons);
      setReviewable(result.reviewable);
      // The drain's own summary leaves slips out; the capture says what happened to them.
      const slipLine = captured === null ? null : describeSlipCapture({
        captured: captured.captured, duplicates: captured.duplicates, filled: captured.filled, kept: Object.keys(captured.reasons).length
      }, "withdrawal");
      setDrainLine(slipLine === null ? result.summary : result.summary === "Nothing was imported." ? slipLine : `${result.summary} ${slipLine}`);
    } catch {
      // Nothing is removed unless a capture answered and Storage confirmed, so a failure here loses nothing.
      failed = true;
    }
    await refresh();
    if (failed) {
      setDrainLine(null);
      setError("The inbox could not finish importing. Try again.");
    }
  }, [supabase, refresh]);

  // On open: remove what has waited more than seven days, say how many, list what is left, then drain it.
  useEffect(() => {
    void (async () => {
      if (!supabase || !claim()) return;
      try {
        const uid = await ownerUid(supabase);
        if (uid.ok) {
          const removed = await removeExpired(supabase, uid.value, new Date());
          if (removed.ok) setExpired(removed.value);
          const line = await moveLineImages(supabase, uid.value);
          if (line.moved > 0) setLineLine(`Moved ${line.moved} image${line.moved === 1 ? "" : "s"} from LINE.`);
          setStuck(line.stuck);
          const status = await lineBotStatus(supabase);
          if (status) setBotStatus(status);
          if (line.failed > 0) {
            setLineError(`${line.failed} image${line.failed === 1 ? "" : "s"} from LINE could not be moved; they will be tried next time.`);
          }
        }
        const listed = await refresh();
        if (listed) await drain(listed);
      } finally {
        release();
      }
    })();
  }, [supabase, refresh, drain, claim, release]);


  const enlargedUrl = enlarged === null ? null : previews.urls[enlarged] ?? null;
  useEffect(() => {
    const dialog = enlargeDialog.current;
    if (!dialog) return;
    if (enlargedUrl !== null) {
      if (!dialog.open) dialog.showModal();
      closeButton.current?.focus();
    } else if (dialog.open) {
      dialog.close();
    }
  }, [enlargedUrl]);

  function chooseView(next: InboxView) {
    announceView(next);
  }

  function enlarge(name: string, button: HTMLElement) {
    opener.current = button;
    setEnlarged(name);
  }

  function closeEnlarged() {
    setEnlarged(null);
    opener.current?.focus();
  }

  const setStatus = (key: number, status: Status) =>
    setPicked((current) => current.map((entry) => (entry.key === key ? { ...entry, status } : entry)));

  async function addOne(uid: string, key: number, file: File, plan: Exclude<InboxPlan, { action: "refuse" }>) {
    if (!supabase) return;
    let body: Blob = file;
    if (plan.action === "reencode") {
      const png = await toPng(file);
      if (!png) { setStatus(key, { state: "refused", reason: "This image could not be opened on this device." }); return; }
      body = png;
    }
    const stored = await uploadToInbox(supabase, uid, body, plan.contentType, plan.extension);
    setStatus(key, stored.ok ? { state: "queued" } : { state: "refused", reason: stored.why });
  }

  async function choose(files: FileList | null) {
    if (!files || files.length === 0 || !supabase || !claim()) return;
    try {
      await addAndDrain(files);
    } finally {
      release();
    }
  }

  async function addAndDrain(files: FileList) {
    if (!supabase) return;
    const chosen = [...files].map((file) => ({ file, key: counter.current++, plan: planFile(file) }));
    setPicked((current) => [
      ...current,
      ...chosen.map(({ file, key, plan }): Picked => ({
        key,
        name: file.name,
        status: plan.action === "refuse" ? { state: "refused", reason: plan.reason } : { state: "uploading" }
      }))
    ]);
    const uid = await ownerUid(supabase);
    for (const { file, key, plan } of chosen) {
      if (plan.action === "refuse") continue;
      if (!uid.ok) { setStatus(key, { state: "refused", reason: uid.why }); continue; }
      await addOne(uid.value, key, file, plan);
    }
    const listed = await refresh();
    if (listed) await drain(listed);
  }

  async function remove(name: string) {
    if (!supabase || !claim()) return;
    try {
      const uid = await ownerUid(supabase);
      const removed = uid.ok ? await removeFromInbox(supabase, uid.value, [name]) : uid;
      if (!removed.ok) setError(removed.why);
      else {
        setReasons((current) => {
          const rest = { ...current };
          delete rest[name];
          return rest;
        });
        setReviewable((current) => current.filter((held) => held !== name));
      }
      await refresh();
    } finally {
      release();
    }
  }

  /** One-time set-up: asks the server to store the secret the LINE webhook presents (D-241). */
  async function connect() {
    setConnectLine(null);
    try {
      const response = await fetch("/api/v1/line/connect", { method: "POST" });
      if (response.ok) {
        setConnectLine({ text: "Connected.", ok: true });
        const status = supabase ? await lineBotStatus(supabase) : null;
        setBotStatus(status ?? { connected: true, connectedAt: null });
        return;
      }
      const body = (await response.json().catch(() => null)) as { error?: unknown } | null;
      setConnectLine({ text: typeof body?.error === "string" ? body.error : "LINE could not be connected.", ok: false });
    } catch {
      setConnectLine({ text: "LINE could not be connected. Try again.", ok: false });
    }
  }

  /** The owner's confirmed discard of an image that cannot be moved: drops the bytes, keeps the redelivery marker. */
  async function discard() {
    if (!supabase || stuck.length === 0) return;
    const many = stuck.length > 1;
    if (!window.confirm(`Discard ${many ? "these LINE images" : "this LINE image"}? ${many ? "They" : "It"} will be deleted and not imported.`)) return;
    const gone = new Set<number>();
    for (const image of stuck) if (await discardLineImage(supabase, image)) gone.add(image.id);
    setStuck((current) => current.filter((entry) => !gone.has(entry.id)));
    if (gone.size < stuck.length) setLineError("A LINE image could not be discarded. Try again.");
  }

  const now = new Date();
  const enlargedFile = enlarged === null ? null : (waiting ?? []).find((file) => file.name === enlarged) ?? null;

  /** The thumbnail: an enlargeable picture for a queued image that loaded, otherwise a plain tile. */
  function thumb(file: WaitingFile): ReactNode {
    const kind = kindOfObject(file.name);
    const url = previews.urls[file.name];
    if (kind === "image" && url) {
      const label = `Enlarge image added ${addedLabel(file.created_at, now)}`;
      return (
        <button type="button" className="inbox-thumb" aria-label={label} onClick={(event) => enlarge(file.name, event.currentTarget)}>
          {/* eslint-disable-next-line @next/next/no-img-element -- a blob: URL of a file already in the queue */}
          <img src={url} alt="" onError={() => previews.markBroken(file.name)} />
        </button>
      );
    }
    return <span className="inbox-thumb placeholder" aria-hidden="true">{kindLabel(kind)}</span>;
  }

  const actions = (file: WaitingFile) => (
    <span className="slip-actions">
      {reviewable.includes(file.name) ? <Link href={reviewHref(file.name)} className="secondary-button">{REVIEW_LINK_LABEL}</Link> : null}
      <button type="button" className="secondary-button" disabled={busy} onClick={() => void remove(file.name)}>
        Remove
      </button>
    </span>
  );
  const connectedOn = botStatus?.connectedAt ? formatDate(botStatus.connectedAt.slice(0, 10)) : null;

  return (
    <section className="cash-bench compact" aria-labelledby="inbox-files-title">
      <div className="cash-heading">
        <p className="section-index">Files</p>
        <h2 id="inbox-files-title">Add files</h2>
      </div>
      <div className="slip-form">
        <p className="field-help">
          Kept privately up to 7 days,{" "}
          <span className="note-tail">imported automatically.
            <LedgerNote label="What can be added">
              Pick screenshots, photos or PDFs. 7-Eleven receipts, LINE MAN orders, bank slips and statements
              are imported automatically; a statement that needs a check waits here with a link to review it.
            </LedgerNote>
          </span>
        </p>
        <label className="account-control">
          <span>Images and PDFs</span>
          <input
            type="file"
            accept="image/*,application/pdf,.pdf"
            multiple
            disabled={busy || !supabase}
            onChange={(event) => { void choose(event.target.files); event.target.value = ""; }}
          />
        </label>
        {picked.length > 0 ? (
          <ul className="receipt-queue">
            {picked.map((entry) => (
              <li key={entry.key}>
                <strong>{entry.name}</strong>
                {entry.status.state === "uploading" ? <span role="status">Uploading…</span> : null}
                {entry.status.state === "queued" ? <span role="status">Queued.</span> : null}
                {entry.status.state === "refused" ? (
                  <span className="status error" role="alert">Not added: {entry.status.reason}</span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="cash-heading">
        <p className="section-index">Queue</p>
        <h2 id="inbox-waiting-title">Waiting</h2>
      </div>
      <div className="slip-form">
        {drainLine && !(waiting !== null && waiting.length === 0 && drainLine === "Nothing was imported.") ? (
          <p className="field-help" role="status">{drainLine}</p>
        ) : null}
        {expired > 0 ? (
          <p className="field-help" role="status">
            {expired} file{expired === 1 ? "" : "s"} removed after waiting more than 7 days.
          </p>
        ) : null}
        {lineLine ? <p className="field-help" role="status">{lineLine}</p> : null}
        {lineError ? <p className="status error" role="alert">{lineError}</p> : null}
        {stuck.length > 0 ? (
          <p className="field-help" role="status">
            {stuck.length === 1 ? "1 LINE image can't be moved" : `${stuck.length} LINE images can't be moved`}{" "}
            <button type="button" className="secondary-button" disabled={busy || !supabase} onClick={() => void discard()}>
              Discard
            </button>
          </p>
        ) : null}
        {error ? <p className="status error" role="alert">{error}</p> : null}
        {waiting === null ? (
          error ? null : <p className="field-help">Loading…</p>
        ) : waiting.length === 0 ? (
          <p className="field-help">Nothing is waiting.</p>
        ) : (
          <>
            <div className="window-presets inbox-view-toggle" role="group" aria-label="Queue layout">
              {(["table", "cards"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  className={view === option ? "chip current" : "chip"}
                  aria-pressed={view === option}
                  onClick={() => chooseView(option)}
                >
                  {option === "table" ? "Table" : "Cards"}
                </button>
              ))}
            </div>
            {view === "table" ? (
              <div className="table-scroll">
                <table className="ledger-table inbox-table" aria-labelledby="inbox-waiting-title">
                  <thead>
                    <tr>
                      <th>Preview</th>
                      <th>Type</th>
                      <th>Added</th>
                      <th>Size</th>
                      <th>Status</th>
                      <th><span className="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {waiting.map((file) => (
                      <tr key={file.name}>
                        <td data-label="Preview">{thumb(file)}</td>
                        <td data-label="Type">{kindLabel(kindOfObject(file.name))}</td>
                        <td data-label="Added">{addedLabel(file.created_at, now)}</td>
                        <td data-label="Size">{file.size === null ? "size unknown" : sizeLabel(file.size)}</td>
                        <td data-label="Status">{reasons[file.name] ?? null}</td>
                        <td data-label="Actions">{actions(file)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <ul className="inbox-cards" aria-labelledby="inbox-waiting-title">
                {waiting.map((file) => (
                  <li key={file.name} className="inbox-card">
                    {thumb(file)}
                    <strong>{kindLabel(kindOfObject(file.name))}{file.size === null ? " · size unknown" : ` · ${sizeLabel(file.size)}`}</strong>
                    <span>Added {addedLabel(file.created_at, now)}</span>
                    {reasons[file.name] ? <span className="field-help">{reasons[file.name]}</span> : null}
                    {actions(file)}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      <dialog
        ref={enlargeDialog}
        className="image-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={enlargedFile ? `Image added ${addedLabel(enlargedFile.created_at, now)}` : "Image"}
        onClose={closeEnlarged}
        onClick={(event) => { if (event.target === event.currentTarget) event.currentTarget.close(); }}
      >
        {enlargedUrl ? (
          <div className="image-dialog-body">
            {/* eslint-disable-next-line @next/next/no-img-element -- a blob: URL of a file already in the queue */}
            <img src={enlargedUrl} alt="" />
            <button ref={closeButton} type="button" className="secondary-button" onClick={() => enlargeDialog.current?.close()}>
              Close
            </button>
          </div>
        ) : null}
      </dialog>

      <details className="slip-form line-bot">
        <summary>LINE bot</summary>
        {botStatus?.connected ? (
          <p className="field-help">Connected{connectedOn ? ` (${connectedOn})` : ""}.</p>
        ) : (
          <p className="field-help">Connect once after the LINE channel is set up, so the bot can store images here.</p>
        )}
        <button
          type="button"
          className="secondary-button"
          disabled={busy || !supabase}
          onClick={() => void connect()}
        >
          {botStatus?.connected ? "Reconnect" : "Connect LINE"}
        </button>
        {connectLine ? (
          connectLine.ok
            ? <p className="field-help" role="status">{connectLine.text}</p>
            : <p className="status error" role="alert">{connectLine.text}</p>
        ) : null}
      </details>
    </section>
  );
}
