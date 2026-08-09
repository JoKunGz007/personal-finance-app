"use client";

import { useState } from "react";
import { decryptBackup, encryptBackup, encryptedBackupSchema } from "@/lib/backup";
import { backupSnapshotSchema, describeBackupSnapshot } from "@/lib/backup-contract";
import { downloadFile } from "@/lib/download";
import { buildRestorePlan } from "@/lib/restore-plan";
import { readError } from "@/lib/wire";

/**
 * The recovery route: export an encrypted ledger backup, and restore one.
 *
 * Deliberately not tied to a parsed statement, which is why it was already the one section
 * of the old single page that stood on its own — the moment a person needs this is the
 * moment they have no statement in hand and possibly no other copy of the ledger. Routing
 * only made that structural (PLAN task 19).
 *
 * Both halves run in this browser: the snapshot is encrypted here and decrypted here, and
 * the password never leaves.
 */
export function RecoveryBench() {
  const [ledgerBackupPassword, setLedgerBackupPassword] = useState("");
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restorePassword, setRestorePassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The real ledger backup, as distinct from the `.pldemo` preview on the import route: the
  // whole owner snapshot, encrypted in this browser with a password the server never sees.
  //
  // Custody is acknowledged only after the file has been handed to the download flow, and
  // the database marks the backup current only if the ledger has not moved since the
  // snapshot was taken — so "backed up" means an artifact exists, not that an export ran.
  async function downloadLedgerBackup() {
    setError(null);
    setNote(null);
    setBusy(true);
    try {
      const response = await fetch("/api/v1/backups/export", { cache: "no-store" });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(readError(body, "The backup could not be exported."));

      const exported = body as { digest?: unknown; payload?: unknown };
      const snapshot = backupSnapshotSchema.safeParse(exported.payload);
      if (!snapshot.success) throw new Error("The exported snapshot did not match its contract, so it was not written to a file.");

      const envelope = await encryptBackup(snapshot.data, ledgerBackupPassword);
      downloadFile(
        JSON.stringify(envelope),
        `private-ledger-backup-${snapshot.data.exportedAt.slice(0, 10)}.plbak`,
        "application/vnd.private-ledger.backup+json"
      );

      const acknowledged = await fetch("/api/v1/backups/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ digest: String(exported.digest), snapshotSequence: snapshot.data.snapshotSequence })
      });
      setLedgerBackupPassword("");
      if (!acknowledged.ok) {
        // The file is on disk either way. What failed is the record of custody, and
        // saying so is more useful than reporting a failed backup.
        setNote(`Backup written, but custody was not recorded: ${readError(await acknowledged.json().catch(() => null), "the ledger changed while the file was being written.")} Export again to clear the staleness flag.`);
        return;
      }
      // Described from the snapshot, never from this module's own table list: the server may
      // be a schema version behind the client, and a sentence about a file must be about that
      // file (D-074).
      setNote(`Encrypted backup written and custody recorded: ${describeBackupSnapshot(snapshot.data)}. Keep the file and its password apart.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The backup could not be written.");
    } finally {
      setBusy(false);
    }
  }

  // Recovery: decrypt the artifact here, build the request sequence the server accepts,
  // and send it. `lib/restore-plan.ts` is what makes this a page rather than a project —
  // the manifest binds eleven chunk digests, an aggregate payload digest, the snapshot
  // sequence and per-table counts, all recomputed server-side.
  //
  // The destination must be an empty ledger, which is the point rather than a limitation:
  // a restore rebinds every row to whoever is signed in, so allowing it over live data
  // would be an overwrite wearing a recovery's clothes.
  async function restoreLedgerBackup() {
    setError(null);
    setNote(null);
    setBusy(true);
    try {
      if (!restoreFile) throw new Error("Choose a .plbak backup file first.");
      const envelope = encryptedBackupSchema.safeParse(JSON.parse(await restoreFile.text()) as unknown);
      if (!envelope.success) throw new Error("That file is not a Private Ledger backup.");

      let snapshot: unknown;
      try {
        snapshot = await decryptBackup(envelope.data, restorePassword);
      } catch {
        // Distinguish the two failures a person actually hits. Both surface from WebCrypto
        // as the same opaque error, and "wrong password" is the recoverable one.
        throw new Error("The backup could not be decrypted. Check the password; if it is right, the file has been altered.");
      }

      const plan = await buildRestorePlan(snapshot);
      const steps: [string, unknown][] = [
        ["stage", plan.stage],
        ...plan.chunks.map((chunk) => ["chunk", chunk] as [string, unknown]),
        ["commit", plan.commit]
      ];
      for (const [action, request] of steps) {
        const response = await fetch(`/api/v1/backups/restores/${action}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request)
        });
        if (!response.ok) {
          throw new Error(readError(await response.json().catch(() => null), `The restore failed at the ${action} step.`));
        }
      }
      setRestorePassword("");
      setRestoreFile(null);
      setNote("Ledger restored. Every row is now bound to the signed-in owner, and the restored ledger is marked backup-stale.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The ledger could not be restored.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="recovery-band" aria-labelledby="recovery-title">
      <div className="bench-heading">
        <p className="section-index">Recovery</p>
        <div>
          <h2 id="recovery-title">Back up and restore the ledger</h2>
          <p>
            This is the real ledger backup, not the synthetic preview on the import route: the whole owner snapshot, encrypted in this browser under a password the server never receives.
            Keep the file and the password apart — either one alone is useless, and losing both makes the ledger unrecoverable.
          </p>
        </div>
      </div>

      <div className="recovery-grid">
        <div className="recovery-half">
          <h3>Export an encrypted backup</h3>
          <p>Custody is recorded only after the file is written, and only if the ledger has not changed since the snapshot was taken.</p>
          <label className="account-control">
            <span>Backup password</span>
            <input
              type="password"
              name="ledger-backup-password"
              minLength={12}
              autoComplete="new-password"
              value={ledgerBackupPassword}
              placeholder="At least 12 characters…"
              onChange={(event) => setLedgerBackupPassword(event.target.value)}
            />
          </label>
          <button type="button" className="secondary-button" disabled={busy || ledgerBackupPassword.length < 12} onClick={downloadLedgerBackup}>
            Export encrypted backup
          </button>
        </div>

        <div className="recovery-half">
          <h3>Restore from a backup</h3>
          <p>
            Restoring rebinds every row to the signed-in owner, so it requires an <b>empty ledger</b> and is refused otherwise.
            That is what makes it a recovery into a fresh installation rather than an overwrite of a live one.
          </p>
          <label className="account-control">
            <span>Backup file</span>
            <input
              type="file"
              name="restore-file"
              accept=".plbak,application/json"
              onChange={(event) => { setRestoreFile(event.target.files?.[0] ?? null); setError(null); }}
            />
          </label>
          <label className="account-control">
            <span>Backup password</span>
            <input
              type="password"
              name="restore-password"
              autoComplete="off"
              value={restorePassword}
              onChange={(event) => setRestorePassword(event.target.value)}
            />
          </label>
          <button type="button" className="secondary-button" disabled={busy || !restoreFile || restorePassword === ""} onClick={restoreLedgerBackup}>
            Restore this ledger
          </button>
        </div>
      </div>

      {note ? <div className="warning" role="status"><strong>Recovery</strong><span>{note}</span></div> : null}
      {error ? <div className="warning error" role="alert"><strong>Recovery failed</strong><span>{error}</span></div> : null}
    </section>
  );
}
