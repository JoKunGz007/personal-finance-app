"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  listWaiting, ownerUid, removeExpired, removeFromInbox, uploadToInbox, type WaitingFile
} from "@/lib/browser/inbox-storage";
import { captureSlips, browserDrainDeps, drainInbox } from "@/lib/browser/inbox-importer";
import { describeSlipCapture, type ReadySlip } from "@/lib/inbox-drain";
import type { SlipKind } from "@/lib/slips";
import { LedgerNote } from "@/app/ledger-note";
import { encodeForReader } from "@/lib/browser/ocr-reader";
import { browserSupabase } from "@/lib/browser/supabase";
import { addedLabel, kindOfObject, planFile, sizeLabel, type InboxPlan } from "@/lib/inbox-queue";

type Status =
  | { readonly state: "uploading" }
  | { readonly state: "queued" }
  | { readonly state: "refused"; readonly reason: string };

type Picked = { readonly key: number; readonly name: string; readonly status: Status };

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
  const [busy, setBusy] = useState(false);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [drainLine, setDrainLine] = useState<string | null>(null);
  const [slips, setSlips] = useState<readonly ReadySlip[]>([]);
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
      const result = await drainInbox(files, setDrainLine, browserDrainDeps(supabase, uid.value));
      setReasons(result.reasons);
      setSlips(result.slips);
      setDrainLine(result.summary);
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
        }
        const listed = await refresh();
        if (listed) await drain(listed);
      } finally {
        release();
      }
    })();
  }, [supabase, refresh, drain, claim, release]);

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
        setSlips((current) => current.filter((slip) => slip.name !== name));
      }
      await refresh();
    } finally {
      release();
    }
  }

  /** The owner's one answer for the batch: capture every held slip as money out or in. */
  async function answerSlips(kind: SlipKind) {
    if (!supabase || slips.length === 0 || !claim()) return;
    const held = slips;
    try {
      const uid = await ownerUid(supabase);
      if (!uid.ok) { setError(uid.why); return; }
      const result = await captureSlips(held, kind, browserDrainDeps(supabase, uid.value));
      // Files a capture removed lose their reason; files that stayed take the capture's reason.
      setReasons((current) => {
        const next = { ...current };
        for (const slip of held) {
          const why = result.reasons[slip.name];
          if (why) next[slip.name] = why;
          else delete next[slip.name];
        }
        return next;
      });
      setDrainLine(describeSlipCapture({
        captured: result.captured, duplicates: result.duplicates, kept: Object.keys(result.reasons).length
      }, kind));
      setSlips([]);
      await refresh();
    } catch {
      // Nothing is removed unless a capture answered and Storage confirmed, so a failure here loses nothing.
      setError("The slips could not be captured. Try again.");
    } finally {
      release();
    }
  }

  const now = new Date();

  return (
    <section className="cash-bench compact" aria-labelledby="inbox-files-title">
      <div className="cash-heading">
        <p className="section-index">Files</p>
        <h2 id="inbox-files-title">Add files</h2>
      </div>
      <div className="slip-form">
        <p className="field-help">
          Pick screenshots, photos or PDFs. They are kept privately until they are imported, and for at
          most 7 days. 7-Eleven receipts, LINE MAN orders and bank slips are imported automatically;
          statements will be soon.
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
        {slips.length > 0 && !busy ? (
          <div className="slip-actions">
            <p className="field-help">
              {slips.length === 1 ? "1 slip is ready." : `${slips.length} slips are ready.`} Money out or money in?
              <LedgerNote label="Why one direction">
                A slip doesn&apos;t say which side you&apos;re on, so one answer applies to the whole batch.
                For mixed directions, remove the slips of the other direction first and add them in a second batch.
              </LedgerNote>
            </p>
            <button type="button" className="secondary-button" disabled={busy} onClick={() => void answerSlips("withdrawal")}>
              Money out
            </button>
            <button type="button" className="secondary-button" disabled={busy} onClick={() => void answerSlips("deposit")}>
              Money in
            </button>
          </div>
        ) : null}
        {expired > 0 ? (
          <p className="field-help" role="status">
            {expired} file{expired === 1 ? "" : "s"} removed after waiting more than 7 days.
          </p>
        ) : null}
        {error ? <p className="status error" role="alert">{error}</p> : null}
        {waiting === null ? (
          error ? null : <p className="field-help">Loading…</p>
        ) : waiting.length === 0 ? (
          <p className="field-help">Nothing is waiting.</p>
        ) : (
          <ul className="receipt-queue" aria-labelledby="inbox-waiting-title">
            {waiting.map((file) => (
              <li key={file.name}>
                <strong>{kindOfObject(file.name) === "pdf" ? "PDF" : kindOfObject(file.name) === "image" ? "Image" : "File"}</strong>
                <span>
                  {file.size === null ? "size unknown" : sizeLabel(file.size)} · added {addedLabel(file.created_at, now)}
                </span>
                {reasons[file.name] ? <span className="field-help">{reasons[file.name]}</span> : null}
                <span className="slip-actions">
                  <button type="button" className="secondary-button" disabled={busy} onClick={() => void remove(file.name)}>
                    Remove
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
