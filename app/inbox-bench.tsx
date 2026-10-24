"use client";

import Link from "next/link";
import { Fragment, useState } from "react";
import {
  describeGrabOutcome, describeGrabProgress, describeSevenElevenOutcome, describeSevenElevenProgress,
  describeStatementTotal, statementsNeedDeviceImport, syncGrabMail, syncMailboxStatements, syncSevenElevenMail,
  type MailboxStatementTotal, type MailSyncOutcome
} from "@/lib/browser/mail-sync";
import { REVIEW_LINK_LABEL } from "@/lib/inbox-drain";

export type Line =
  | { readonly state: "waiting" }
  | { readonly state: "running"; readonly note: string }
  | { readonly state: "done"; readonly note: string; readonly error: string | null }
  | { readonly state: "statements"; readonly total: MailboxStatementTotal }
  | { readonly state: "failed"; readonly error: string };

const SOURCES = ["Grab orders and rides", "7-Eleven invoices", "Bank statements"] as const;
const IDLE: Line[] = SOURCES.map(() => ({ state: "waiting" }));

/**
 * "Sync all mail": the three mailbox sources one after another, never together (Gmail limits
 * concurrent logins). A source that fails says so on its own line and the next one still runs.
 * Statements are opened and imported by the server, which holds the passwords (D-237); a held one is
 * listed with its reason and, when it can be reviewed, a link to /import.
 */
export function InboxBench() {
  const [running, setRunning] = useState(false);
  const [started, setStarted] = useState(false);
  const [lines, setLines] = useState<Line[]>(IDLE);

  const setLine = (index: number, line: Line) =>
    setLines((current) => current.map((entry, at) => (at === index ? line : entry)));

  async function mailLine<T>(
    index: number,
    run: (onProgress: (total: T) => void) => Promise<MailSyncOutcome<T>>,
    progress: (total: T) => string,
    outcome: (total: T) => string
  ) {
    setLine(index, { state: "running", note: "Reading the mailbox…" });
    const { total: finished, error } = await run((total) => setLine(index, { state: "running", note: progress(total) }));
    setLine(index, { state: "done", note: finished ? outcome(finished) : "", error });
  }

  async function syncAll() {
    setRunning(true);
    setStarted(true);
    setLines(IDLE);
    await mailLine(0, syncGrabMail, describeGrabProgress, describeGrabOutcome);
    await mailLine(1, syncSevenElevenMail, describeSevenElevenProgress, describeSevenElevenOutcome);
    setLine(2, { state: "running", note: "Checking the mailbox…" });
    const statements = await syncMailboxStatements((total, done, of) =>
      setLine(2, { state: "running", note: `Importing statement ${done} of ${of}…` }));
    setLine(2, statements.ok
      ? { state: "statements", total: statements.total }
      : { state: "failed", error: statements.why });
    setRunning(false);
  }

  return (
    <section className="cash-bench compact" aria-labelledby="inbox-sync-title">
      <div className="cash-heading">
        <p className="section-index">Sync</p>
        <h2 id="inbox-sync-title">From the mailbox</h2>
      </div>
      <div className="slip-form">
        <p className="field-help">
          Reads the Grab and 7-Eleven mail, then imports bank statements it can open. Nothing is stored twice.
        </p>
        <div className="slip-actions">
          <button type="button" className="primary-button" disabled={running} onClick={() => void syncAll()}>
            {running ? "Syncing…" : "Sync all mail"}
          </button>
        </div>
        {started ? <SyncTable lines={lines} /> : null}
      </div>
    </section>
  );
}

/** Source · Status · Details on desktop, checklist rows on phone (PLAN Open item 10; CSS `.sync-table`). */
export function SyncTable({ lines }: { lines: readonly Line[] }) {
  return (
    <ul className="sync-table">
      <li className="sync-head" aria-hidden="true"><span>Source</span><span>Status</span><span>Details</span></li>
      {SOURCES.map((name, index) => {
        const line = lines[index] ?? { state: "waiting" };
        const status = sourceStatus(line);
        return (
          <li key={name} className={`sync-row sync-${status}`}>
            <span className="sync-mark" aria-hidden="true">{STATUS_MARK[status]}</span>
            <span className="sync-body">
              <strong>{name}</strong>
              <span className="sync-status">{STATUS_LABEL[status]}</span>
              <span className="sync-details"><SourceLine line={line} /></span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export type SourceStatus = "waiting" | "running" | "done" | "failed" | "check";
const STATUS_LABEL: Record<SourceStatus, string> = { waiting: "Waiting", running: "Running", done: "Done", failed: "Failed", check: "Check" };
const STATUS_MARK: Record<SourceStatus, string> = { waiting: "·", running: "…", done: "✓", failed: "✕", check: "!" };

/**
 * The status column (desktop) and the mark (phone) of one source line. An error outranks a held
 * statement: a total with an error is Failed even when some statements also need a look.
 */
export function sourceStatus(line: Line): SourceStatus {
  switch (line.state) {
    case "waiting":
      return "waiting";
    case "running":
      return "running";
    case "done":
      return line.error ? "failed" : "done";
    case "failed":
      return "failed";
    case "statements":
      if (line.total.error) return "failed";
      return line.total.held.length > 0 || statementsNeedDeviceImport(line.total) ? "check" : "done";
  }
}

/** Exported for its render test only. */
export function SourceLine({ line }: { line: Line }) {
  switch (line.state) {
    case "waiting":
      return <span>Waiting…</span>;
    case "running":
      return <span role="status">{line.note}</span>;
    case "done":
      return (
        <>
          {line.note ? <span role="status">{line.note}</span> : null}
          {line.error ? <span className="status error" role="alert">{line.error}</span> : null}
        </>
      );
    case "failed":
      return <span className="status error" role="alert">{line.error}</span>;
    case "statements": {
      const { total } = line;
      const nothing = total.captured + total.duplicates + total.held.length === 0 && total.error === null && total.remaining === 0;
      return (
        <>
          <span role="status">{nothing ? "No statements waiting." : describeStatementTotal(total)}</span>
          {total.notes.map((note, index) => <span key={`note-${index}`} role="status">{note}</span>)}
          {total.held.map((entry) => (
            <Fragment key={`${entry.uid}.${entry.part}`}>
              <span role="status">{entry.name}: {entry.reason}</span>
              {/* A button like the queue's own Review (D-254), not a bare link (D-260). */}
              {entry.reviewHref ? (
                <span className="slip-actions">
                  <Link href={entry.reviewHref} className="secondary-button">{REVIEW_LINK_LABEL}</Link>
                </span>
              ) : null}
            </Fragment>
          ))}
          {total.error ? <span className="status error" role="alert">{total.error}</span> : null}
          {statementsNeedDeviceImport(total) ? (
            <span role="status">
              {total.remaining > 0 || total.more ? "More statements are waiting. " : ""}
              <Link href="/import?sync=1">Open the rest on Import</Link>
            </span>
          ) : null}
        </>
      );
    }
  }
}
