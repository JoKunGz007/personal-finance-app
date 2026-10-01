"use client";

import Link from "next/link";
import { useState } from "react";
import {
  describeGrabOutcome, describeGrabProgress, describeSevenElevenOutcome, describeSevenElevenProgress,
  describeStatementTotal, statementsNeedDeviceImport, syncGrabMail, syncMailboxStatements, syncSevenElevenMail,
  type MailboxStatementTotal, type MailSyncOutcome
} from "@/lib/browser/mail-sync";
import { REVIEW_LINK_LABEL } from "@/lib/inbox-drain";

type Line =
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
        {started ? (
          <ul className="receipt-queue">
            {SOURCES.map((name, index) => (
              <li key={name}>
                <strong>{name}</strong>
                <SourceLine line={lines[index] ?? { state: "waiting" }} />
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}

function SourceLine({ line }: { line: Line }) {
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
          {total.held.map((entry) => (
            <span key={`${entry.uid}.${entry.part}`} role="status">
              {entry.name}: {entry.reason}{" "}
              {entry.reviewHref ? <Link href={entry.reviewHref}>{REVIEW_LINK_LABEL}</Link> : null}
            </span>
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
