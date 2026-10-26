"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useState } from "react";
import { accountListSchema } from "@/lib/accounts";
import {
  describeGrabOutcome, describeGrabProgress, describeSevenElevenOutcome, describeSevenElevenProgress,
  describeStatementTotal, loadAccountCoverage, recordMailSync, saveCoverageWarnDays, statementsNeedDeviceImport, syncGrabMail, syncMailboxStatements,
  syncSevenElevenMail, type AccountCoverage, type MailboxStatementTotal, type MailSyncOutcome
} from "@/lib/browser/mail-sync";
import {
  coverageAge, coverageAgeDays, coverageTone, dayCount, formatDayMonth, formatInstantDay, formatInstantDayTime, formatWallTime, relativeAge
} from "@/lib/coverage";
import { bangkokToday } from "@/lib/dates";
import { REVIEW_LINK_LABEL } from "@/lib/inbox-drain";
import { ledgerRequest } from "@/lib/wire";

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
  const [coverage, setCoverage] = useState<CoverageState>({ kind: "loading" });

  const reloadCoverage = useCallback(async () => setCoverage(await fetchCoverage()), []);

  useEffect(() => {
    let live = true;
    void fetchCoverage().then((next) => { if (live) setCoverage(next); });
    return () => { live = false; };
  }, []);

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
    const line: Line = { state: "done", note: finished ? outcome(finished) : "", error };
    setLine(index, line);
    return line;
  }

  async function syncAll() {
    setRunning(true);
    setStarted(true);
    setLines(IDLE);
    const grab = await mailLine(0, syncGrabMail, describeGrabProgress, describeGrabOutcome);
    const sevenEleven = await mailLine(1, syncSevenElevenMail, describeSevenElevenProgress, describeSevenElevenOutcome);
    setLine(2, { state: "running", note: "Checking the mailbox…" });
    const statements = await syncMailboxStatements((total, done, of) =>
      setLine(2, { state: "running", note: `Importing statement ${done} of ${of}…` }));
    const bank: Line = statements.ok
      ? { state: "statements", total: statements.total }
      : { state: "failed", error: statements.why };
    setLine(2, bank);
    setRunning(false);
    // Complete means no source line ended Failed. A failed record is ignored; coverage reloads either way.
    const complete = [grab, sevenEleven, bank].every((line) => sourceStatus(line) !== "failed");
    await recordMailSync(complete);
    await reloadCoverage();
  }

  return (
    <>
    <CoverageSection state={coverage} reload={reloadCoverage} />
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
    </>
  );
}

type CoverageState =
  | { readonly kind: "loading" }
  | { readonly kind: "failed" }
  | { readonly kind: "ready"; readonly data: AccountCoverage; readonly names: ReadonlyMap<string, string> };

async function fetchCoverage(): Promise<CoverageState> {
  const [loaded, accounts] = await Promise.all([
    loadAccountCoverage(),
    ledgerRequest("/api/v1/accounts", accountListSchema, {
      fallback: "Accounts could not be loaded.",
      offContract: "The accounts response did not match its contract."
    })
  ]);
  if (!loaded.ok) return { kind: "failed" };
  const names = new Map<string, string>();
  if (accounts.ok) for (const account of accounts.data.accounts) names.set(account.id, account.label);
  return { kind: "ready", data: loaded.data, names };
}

/** One account's coverage row, ready to print. */
export type CoverageRowView = {
  readonly accountId: string;
  readonly name: string;
  readonly newestDate: string | null;
  readonly newestTime: string | null;
  readonly lastStatementMailAt: string | null;
  readonly warnAfterDays: number;
};

/** "Up to date until": the newest statement row per account and the last mail Sync (migration 064). */
function CoverageSection({ state, reload }: { state: CoverageState; reload: () => Promise<void> }) {
  const rows: CoverageRowView[] = state.kind === "ready"
    ? state.data.accounts.map((account) => ({ ...account, name: state.names.get(account.accountId) ?? `Account ${account.accountId.slice(0, 4)}` }))
    : [];
  return (
    <section className="cash-bench compact" aria-labelledby="inbox-coverage-title">
      <div className="cash-heading">
        <p className="section-index">Coverage</p>
        <h2 id="inbox-coverage-title">Up to date until</h2>
      </div>
      <div className="slip-form">
        {state.kind === "failed" ? <p className="status error" role="alert">Coverage could not be loaded.</p> : null}
        {state.kind === "ready" ? (
          <>
            <p className="field-help">{describeLastSync(state.data.lastSync, new Date())}</p>
            <CoverageTable rows={rows} today={bangkokToday()} />
            <WarnDaysEditor rows={rows} reload={reload} />
          </>
        ) : null}
      </div>
    </section>
  );
}

/** "Last mail Sync 14 Mar 09:30 · 3 hours ago", plus " · some sources failed" for an incomplete one. */
export function describeLastSync(lastSync: AccountCoverage["lastSync"], now: Date): string {
  if (lastSync === null) return "No mail Sync recorded yet";
  return `Last mail Sync ${formatInstantDayTime(lastSync.finishedAt)} · ${relativeAge(lastSync.finishedAt, now)}${lastSync.complete ? "" : " · some sources failed"}`;
}

/** Account · Newest row · Last statement mail (CSS `.sync-table.coverage-table`). */
export function CoverageTable({ rows, today }: { rows: readonly CoverageRowView[]; today: string }) {
  return (
    <ul className="sync-table coverage-table">
      <li className="sync-head" aria-hidden="true"><span>Account</span><span>Newest row</span><span>Last statement mail</span></li>
      {rows.map((row) => {
        const tone = row.newestDate === null ? "waiting" : coverageTone(coverageAgeDays(row.newestDate, today), row.warnAfterDays);
        const status = row.newestDate === null
          ? "No rows yet"
          : `${formatDayMonth(row.newestDate)}${row.newestTime ? ` ${formatWallTime(row.newestTime)}` : ""} · ${coverageAge(row.newestDate, today)}`;
        return (
          <li key={row.accountId} className={`sync-row sync-${tone}`}>
            <span className="sync-mark" aria-hidden="true">{tone === "done" ? "✓" : tone === "check" ? "!" : "·"}</span>
            <span className="sync-body">
              <strong>{row.name}</strong>
              <span className="sync-status">{status}</span>
              <span className="sync-details"><span>Statement mail {row.lastStatementMailAt ? formatInstantDay(row.lastStatementMailAt) : "—"}</span><span>Warns after {dayCount(row.warnAfterDays)}</span></span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

const WARN_DAYS_INVALID = "Enter a whole number of days from 1 to 365.";

/** "Change warning days": one number per account; saves only the rows that changed, one request each. */
function WarnDaysEditor({ rows, reload }: { rows: readonly CoverageRowView[]; reload: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ readonly text: string; readonly error: boolean } | null>(null);
  const [saving, setSaving] = useState(false);

  function begin() {
    setValues(Object.fromEntries(rows.map((row) => [row.accountId, String(row.warnAfterDays)])));
    setMessage(null);
    setOpen(true);
  }

  async function save() {
    const changes: { accountId: string; days: number }[] = [];
    for (const row of rows) {
      const raw = (values[row.accountId] ?? "").trim();
      const days = Number(raw);
      if (!/^\d+$/u.test(raw) || !Number.isInteger(days) || days < 1 || days > 365) {
        setMessage({ text: WARN_DAYS_INVALID, error: true });
        return;
      }
      if (days !== row.warnAfterDays) changes.push({ accountId: row.accountId, days });
    }
    setSaving(true);
    setMessage(null);
    for (const change of changes) {
      const result = await saveCoverageWarnDays(change.accountId, change.days);
      if (!result.ok) {
        setSaving(false);
        setMessage({ text: "The warning days could not be saved.", error: true });
        // Earlier rows may already be saved: show them.
        await reload();
        return;
      }
    }
    setSaving(false);
    setOpen(false);
    await reload();
    setMessage({ text: "Warning days saved.", error: false });
  }

  return (
    <>
      {open ? (
        <div className="warn-days-editor">
          {rows.map((row) => (
            <label key={row.accountId} className="warn-days-row">
              <span>{row.name}</span>
              <input
                type="number" min={1} max={365} step={1} inputMode="numeric"
                value={values[row.accountId] ?? ""}
                onChange={(event) => setValues((current) => ({ ...current, [row.accountId]: event.target.value }))}
              />
            </label>
          ))}
          <div className="slip-actions">
            <button type="button" className="primary-button" disabled={saving} onClick={() => void save()}>Save</button>
            <button type="button" className="secondary-button" disabled={saving} onClick={() => { setOpen(false); setMessage(null); }}>Cancel</button>
          </div>
        </div>
      ) : (
        <div className="slip-actions">
          <button type="button" className="secondary-button" onClick={begin}>Change warning days</button>
        </div>
      )}
      {message ? (
        message.error
          ? <p className="status error" role="alert">{message.text}</p>
          : <p className="status" role="status">{message.text}</p>
      ) : null}
    </>
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
