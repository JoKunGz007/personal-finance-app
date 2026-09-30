"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  listWaiting, ownerUid, removeExpired, removeFromInbox, uploadToInbox, type WaitingFile
} from "@/lib/browser/inbox-storage";
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
 * (D-235). Nothing is read or imported here yet. Files older than seven days are removed when the
 * page opens.
 */
export function InboxFiles() {
  const [supabase] = useState(browserSupabase);
  const [picked, setPicked] = useState<Picked[]>([]);
  const [waiting, setWaiting] = useState<WaitingFile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(0);
  const [busy, setBusy] = useState(false);
  const counter = useRef(0);

  const refresh = useCallback(async () => {
    if (!supabase) return;
    const uid = await ownerUid(supabase);
    if (!uid.ok) { setError(uid.why); setWaiting(null); return; }
    const listed = await listWaiting(supabase, uid.value);
    if (!listed.ok) { setError(listed.why); return; }
    setError(null);
    setWaiting(listed.value);
  }, [supabase]);

  // On open: remove what has waited more than seven days, say how many, then list what is left.
  useEffect(() => {
    void (async () => {
      if (!supabase) return;
      const uid = await ownerUid(supabase);
      if (uid.ok) {
        const removed = await removeExpired(supabase, uid.value, new Date());
        if (removed.ok) setExpired(removed.value);
      }
      await refresh();
    })();
  }, [supabase, refresh]);

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
    if (!files || files.length === 0 || !supabase) return;
    setBusy(true);
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
    await refresh();
    setBusy(false);
  }

  async function remove(name: string) {
    if (!supabase) return;
    setBusy(true);
    const uid = await ownerUid(supabase);
    const removed = uid.ok ? await removeFromInbox(supabase, uid.value, [name]) : uid;
    if (!removed.ok) setError(removed.why);
    await refresh();
    setBusy(false);
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
          most 7 days. Nothing is imported from them yet.
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
