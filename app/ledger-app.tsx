"use client";

import { useMemo, useRef, useState } from "react";
import { accountListSchema, type LedgerAccount } from "@/lib/accounts";
import { encryptBackup } from "@/lib/backup";
import { sha256HexBytes } from "@/lib/canonical";
import { assembleImportPayload } from "@/lib/import-assembly";
import type { StatementFrame } from "@/lib/krungthai-layout";
import { addMinor, formatThb } from "@/lib/money";
import { reconcileRows } from "@/lib/reconcile";
import { importPayloadSchema, type ImportPayload, type SourceRowCandidate } from "@/lib/statement";

type Stage = "select" | "unlock" | "bind" | "review" | "confirmed";
const stages: Array<{ id: Stage; label: string }> = [
  { id: "select", label: "Select PDF" },
  { id: "unlock", label: "Unlock & parse locally" },
  { id: "bind", label: "Choose account" },
  { id: "review", label: "Review" },
  { id: "confirmed", label: "Confirmed" }
];

type Extracted = { frame: StatementFrame; rows: SourceRowCandidate[]; pageCount: number };

type WorkerReply =
  | { type: "parsed"; frame: StatementFrame; rows: SourceRowCandidate[]; pageCount: number }
  | {
      type: "error"; code: string; reason?: string; detail?: string;
      labelCandidates?: string[][]; valueLabels?: string[]; structure?: string[];
      message: string;
    };

const categories = ["Uncategorized", "Income", "Food", "Cash", "Fees", "Interest"];

function stageIndex(stage: Stage) {
  return stages.findIndex((item) => item.id === stage);
}

export function LedgerApp() {
  const [stage, setStage] = useState<Stage>("select");
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("No PDF selected. Try the synthetic statement to review the complete flow safely.");
  const [statement, setStatement] = useState<ImportPayload | null>(null);
  const [extracted, setExtracted] = useState<Extracted | null>(null);
  const [artifactDigest, setArtifactDigest] = useState("");
  const [accounts, setAccounts] = useState<LedgerAccount[] | null>(null);
  const [chosenAccountId, setChosenAccountId] = useState("");
  const [boundAccount, setBoundAccount] = useState<LedgerAccount | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [bindingError, setBindingError] = useState<string | null>(null);
  const [labelCandidates, setLabelCandidates] = useState<string[][]>([]);
  const [valueLabels, setValueLabels] = useState<string[]>([]);
  const [structure, setStructure] = useState<string[]>([]);
  const [selectedRow, setSelectedRow] = useState<number | null>(null);
  const [rowCategories, setRowCategories] = useState<Record<number, string>>({});
  const [backupPassword, setBackupPassword] = useState("");
  const [backupStale, setBackupStale] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);

  const reconciliation = useMemo(
    () => statement ? reconcileRows(statement.openingBalance.minor, statement.rows) : null,
    [statement]
  );
  const totals = useMemo(() => {
    if (!statement) return null;
    const deposits = statement.rows.flatMap((row) => row.components).filter((item) => item.kind === "deposit").map((item) => item.amount.minor);
    const withdrawals = statement.rows.flatMap((row) => row.components).filter((item) => item.kind === "withdrawal").map((item) => item.amount.minor);
    return {
      deposits: addMinor(deposits),
      withdrawals: addMinor(withdrawals),
      net: addMinor([...deposits, ...withdrawals])
    };
  }, [statement]);

  async function loadSynthetic() {
    setStatus("Loading invented statement…");
    const response = await fetch("/api/v1/demo", { cache: "no-store" });
    const parsed = importPayloadSchema.safeParse(await response.json());
    if (!parsed.success) {
      setStatus("The synthetic fixture failed its own contract. Run the unit tests before continuing.");
      return;
    }
    setExtracted(null);
    setBoundAccount(null);
    setBindingError(null);
    setStatement(parsed.data);
    setStage("review");
    setStatus("Synthetic statement ready. Nothing in this review came from a real account.");
  }

  async function parsePdf() {
    if (!file || !password) {
      setStatus("Choose a Krungthai PDF and enter its document password.");
      return;
    }
    setStatus("Unlocking and checking the layout on this device…");
    const bytes = await file.arrayBuffer();
    // Digest the artifact before the buffer is transferred to the worker. This
    // identifies the PDF for import_artifacts so re-importing the same statement is
    // a detectable conflict; the bytes themselves never leave the device.
    const digest = await sha256HexBytes(bytes);
    const worker = new Worker(new URL("../workers/krungthai.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<WorkerReply>) => {
      const reply = event.data;
      if (reply.type === "parsed") {
        // The frame and rows are both read on this device. Which ledger account they
        // belong to is not something the parser may infer (DECISIONS D-017), so the
        // next step is an explicit, checked choice by the owner.
        setArtifactDigest(digest);
        setLabelCandidates([]);
        setValueLabels([]);
        setStructure([]);
        setExtracted({ frame: reply.frame, rows: reply.rows, pageCount: reply.pageCount });
        setStatement(null);
        setBoundAccount(null);
        setBindingError(null);
        setStage("bind");
        setStatus(`Read ${reply.rows.length} rows across ${reply.pageCount} page(s) for account ending ${reply.frame.accountLastFour}, ${reply.frame.periodStart} to ${reply.frame.periodEnd}. Nothing has left this device. Choose the ledger account it belongs to.`);
      } else {
        // Show the typed code alongside the message. The code is a fixed enum from
        // lib/krungthai-layout.ts and carries no statement content, and without it
        // every failure except an unsupported layout reads identically — which makes
        // a single diagnostic run far less informative than it needs to be.
        setStatus(
          `${reply.message} (${reply.code}${reply.reason ? ` / ${reply.reason}` : ""})` +
          (reply.detail ? ` — ${reply.detail}` : "")
        );
        setLabelCandidates(reply.labelCandidates ?? []);
        setValueLabels(reply.valueLabels ?? []);
        setStructure(reply.structure ?? []);
      }
      setPassword("");
      worker.terminate();
    };
    worker.onerror = () => {
      setStatus("The local parser stopped safely. No statement data was uploaded.");
      setPassword("");
      worker.terminate();
    };
    worker.postMessage({ type: "parse", bytes, password }, [bytes]);
  }

  // Development only, and stripped from a production bundle along with its button. The
  // real login is Google OAuth; this mints the aal2 cookie session the owner-bound routes
  // require, so the binding chooser and the import path can be reached in a browser.
  // See app/api/v1/dev/session/route.ts for why a password session satisfies the gate.
  async function devSignIn() {
    setStatus("Minting a development owner session…");
    const response = await fetch("/api/v1/dev/session", { method: "POST", cache: "no-store" });
    const body: unknown = await response.json().catch(() => null);
    const record = typeof body === "object" && body !== null ? body as Record<string, unknown> : {};
    if (!response.ok) {
      setStatus(typeof record.error === "string" ? record.error : "The development session could not be created.");
      return;
    }
    const warning = typeof record.warning === "string" ? ` ${record.warning}` : "";
    setStatus(`Signed in as the synthetic owner at ${String(record.level)} with ${String(record.verifiedFactors)} verified factors.${warning}`);
  }

  async function loadAccounts() {
    setStatus("Loading your ledger accounts…");
    const response = await fetch("/api/v1/accounts", { cache: "no-store" });
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const message = typeof body === "object" && body !== null && "error" in body ? String((body as { error: unknown }).error) : "Accounts could not be loaded.";
      setAccounts(null);
      setStatus(message);
      return;
    }
    const parsed = accountListSchema.safeParse(body);
    if (!parsed.success) {
      setAccounts(null);
      setStatus("The accounts response did not match its contract, so nothing can be bound.");
      return;
    }
    setAccounts(parsed.data.accounts);
    setStatus(parsed.data.accounts.length === 0
      ? "No ledger accounts exist yet. One must be created before a statement can be bound."
      : `${parsed.data.accounts.length} ledger account(s) available. Binding is checked against the printed account and currency.`);
  }

  // Binding is a user decision, and assembleImportPayload refuses to act on it
  // blindly: the chosen account's last four digits and currency must match what the
  // statement printed, so a mis-click cannot post one account's rows into another.
  function bindStatement() {
    if (!extracted) return;
    const account = accounts?.find((item) => item.id === chosenAccountId);
    if (!account) {
      setBindingError("Choose the ledger account this statement belongs to.");
      return;
    }
    const result = assembleImportPayload(extracted.frame, extracted.rows, {
      accountId: account.id,
      lastFour: account.last_four,
      currency: account.currency
    });
    if (!result.ok) {
      setBindingError(result.message);
      setStatus(`Binding refused: ${result.message}`);
      return;
    }
    setBindingError(null);
    setBoundAccount(account);
    setStatement(result.payload);
    // One key per bound statement, so retrying a failed confirmation is a retry
    // rather than a second import.
    setIdempotencyKey(crypto.randomUUID());
    setStage("review");
    setStatus(`Bound to ${account.label} •••• ${account.last_four}. Review every balance before confirming.`);
  }

  async function confirmBoundImport() {
    if (!statement || !boundAccount) return;
    setStatus("Confirming this import…");
    const response = await fetch("/api/v1/imports/confirm", {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idempotencyKey, artifactDigest, payload: statement })
    });
    const body: unknown = await response.json().catch(() => null);
    const record = typeof body === "object" && body !== null ? body as Record<string, unknown> : {};
    if (!response.ok) {
      setStatus(typeof record.error === "string" ? record.error : "The import could not be confirmed.");
      return;
    }
    setStage("confirmed");
    setBackupStale(true);
    setStatus(`Confirmed ${statement.rows.length} rows into ${boundAccount.label} as batch ${String(record.batchId)}. The backup is now stale.`);
  }

  function openDetail(index: number) {
    setSelectedRow(index);
    dialog.current?.showModal();
  }

  async function confirmSynthetic() {
    if (!statement) return;
    setStage("confirmed");
    setBackupStale(true);
    setStatus("Synthetic batch confirmed in this browser preview. Start local Supabase to persist authenticated imports.");
  }

  async function downloadBackup() {
    if (!statement) return;
    try {
      const envelope = await encryptBackup({
        artifactKind: "private-ledger-synthetic-preview",
        formatVersion: 1,
        exportedAt: new Date().toISOString(),
        account: { bank: "KTB", label: "Synthetic current account", lastFour: "4242", currency: "THB", timezone: "Asia/Bangkok" },
        statement,
        overlays: rowCategories
      }, backupPassword);
      const blob = new Blob([JSON.stringify(envelope)], { type: "application/vnd.private-ledger.demo+json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "private-ledger-synthetic.pldemo";
      anchor.click();
      URL.revokeObjectURL(url);
      setBackupPassword("");
      setStatus("Encrypted synthetic preview downloaded. It is not a restorable ledger backup.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Backup encryption failed.");
    }
  }

  const selected = selectedRow === null ? null : statement?.rows[selectedRow] ?? null;
  const activeIndex = stageIndex(stage);

  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="brand" href="#main" aria-label="Private Ledger home">
          <span className="brand-mark" aria-hidden="true">PL</span>
          <span><strong>Private Ledger</strong><small>Local-first · Bangkok time</small></span>
        </a>
        <span className="privacy-chip"><i aria-hidden="true" /> PDF stays on this device</span>
      </header>

      <nav className="stage-nav" aria-label="Statement import progress" tabIndex={0}>
        <ol>
          {stages.map((item, index) => (
            <li key={item.id} className={index < activeIndex ? "done" : index === activeIndex ? "active" : ""} aria-current={index === activeIndex ? "step" : undefined}>
              <span>{index + 1}</span>{item.label}
            </li>
          ))}
        </ol>
      </nav>

      <main id="main">
        <section className="intro" aria-labelledby="page-title">
          <div>
            <p className="eyebrow">Krungthai statement · private workspace</p>
            <h1 id="page-title">Review every balance<br />before anything is saved.</h1>
          </div>
          <p className="intro-copy">The PDF is unlocked and parsed in a dedicated browser worker. Only validated transaction facts can cross the confirmation boundary.</p>
        </section>

        <section className="import-bench" aria-labelledby="import-title">
          <div className="bench-heading">
            <p className="section-index">Import / 01</p>
            <div>
              <h2 id="import-title">Open a statement locally</h2>
              <p>Only the inspected Krungthai layout is accepted. Unknown layouts fail closed.</p>
            </div>
          </div>
          <div className="import-controls">
            <label className="file-control">
              <span>Statement PDF</span>
              <input type="file" accept="application/pdf,.pdf" onChange={(event) => {
                const nextFile = event.target.files?.[0] ?? null;
                setFile(nextFile);
                setStage(nextFile ? "unlock" : "select");
                setStatus(nextFile ? `${nextFile.name} selected. Its bytes have not been read yet.` : "No PDF selected.");
              }} />
              <b>{file?.name ?? "Choose a local PDF…"}</b>
            </label>
            <label className="password-control">
              <span>Document password</span>
              <input type="password" value={password} autoComplete="off" name="statement-unlock-code" placeholder="Enter only when ready…" onChange={(event) => setPassword(event.target.value)} />
              <small>Held in worker memory for this attempt only.</small>
            </label>
            <button className="primary-button" type="button" onClick={parsePdf}>Unlock & check layout</button>
            <span className="or-rule">or</span>
            <button className="secondary-button" type="button" onClick={loadSynthetic}>Use synthetic statement</button>
            {/* Local acceptance only, and opt-in. The bundler inlines the flag at build
                time, so in a build that did not set it the comparison is `undefined ===
                "1"` and this is never rendered — though the literal below does survive in
                the chunk, since a dead branch is not the same as an absent string. The
                route answers 404 without the same flag, which is the guard that matters.
                Not gated on NODE_ENV: the browser suite runs against a production build,
                because the strict CSP forbids the eval() React needs under `next dev`
                (GOTCHAS, D-036). */}
            {process.env.NEXT_PUBLIC_ALLOW_DEV_OWNER_SESSION === "1" ? (
              <button className="secondary-button" type="button" onClick={devSignIn}>Dev sign-in</button>
            ) : null}
          </div>
          <p className="status-line" role="status"><span aria-hidden="true">●</span>{status}</p>

          {labelCandidates.length > 0 ? (
            <details className="label-diagnostic">
              <summary>Heading words this PDF prints ({labelCandidates.length} candidate line(s))</summary>
              <p>
                Repairing the reader needs only the column heading words — the positions come from
                the PDF itself. Every text run containing a digit was dropped before this list was
                built, so amounts, balances, dates, and account numbers cannot appear here. Read it
                before sharing it, and redact anything you do not want to leave this device.
              </p>
              <ol>
                {labelCandidates.map((line, index) => (
                  <li key={index}><code lang="th">{line.join("  ·  ")}</code></li>
                ))}
              </ol>
              {valueLabels.length > 0 ? (
                <>
                  <p>
                    Labels printed immediately left of a number — the account, period, and
                    balance fields. A label only appears here when the run beside it carries a
                    digit, so a name or address label cannot qualify.
                  </p>
                  <ol>
                    {valueLabels.map((label) => <li key={label}><code lang="th">{label}</code></li>)}
                  </ol>
                </>
              ) : null}
              {structure.length > 0 ? (
                <>
                  <p>
                    Structure of the whole statement, with every value replaced by its shape —
                    <code>d</code> for a digit, <code>x</code> for a letter, positions after the
                    <code>@</code>. This shows formats, columns, wrapped lines, and page breaks
                    while containing no name, amount, balance, date, or account number. Select all
                    and copy if a reader needs fixing.
                  </p>
                  <textarea className="structure-dump" readOnly rows={14} value={structure.join("\n")} />
                </>
              ) : null}
            </details>
          ) : null}
        </section>

        {extracted && !boundAccount ? (
          <section className="binding-bench" aria-labelledby="binding-title">
            <div className="bench-heading">
              <p className="section-index">Bind / 02</p>
              <div>
                <h2 id="binding-title">Choose the ledger account</h2>
                <p>The statement printed account ending <b>{extracted.frame.accountLastFour}</b> in {extracted.frame.currency}, {extracted.frame.periodStart} to {extracted.frame.periodEnd}. The parser is not allowed to guess which of your accounts that is.</p>
              </div>
            </div>
            <div className="binding-controls">
              <button className="secondary-button" type="button" onClick={loadAccounts}>Load ledger accounts</button>
              <label className="account-control">
                <span>Ledger account</span>
                <select
                  value={chosenAccountId}
                  disabled={!accounts || accounts.length === 0}
                  onChange={(event) => { setChosenAccountId(event.target.value); setBindingError(null); }}
                >
                  <option value="">{accounts ? "Select an account…" : "Load accounts first…"}</option>
                  {(accounts ?? []).map((account) => (
                    <option key={account.id} value={account.id}>{account.label} · {account.account_type} •••• {account.last_four} · {account.currency}</option>
                  ))}
                </select>
              </label>
              <button className="primary-button" type="button" disabled={chosenAccountId === ""} onClick={bindStatement}>Bind statement to this account</button>
            </div>
            {bindingError ? <div className="warning error" role="alert"><strong>Binding refused</strong><span>{bindingError}</span></div> : null}
          </section>
        ) : null}

        {statement && reconciliation && totals ? (
          <section className="review" aria-labelledby="review-title">
            <div className="review-heading">
              <div>
                <p className="section-index">Review / {boundAccount ? "03" : "02"}</p>
                <h2 id="review-title">{boundAccount ? boundAccount.label : "Synthetic current account"} <span>•••• {boundAccount?.last_four ?? "4242"}</span></h2>
                <p>{boundAccount ? `${statement.periodStart} to ${statement.periodEnd}` : "1–30 June 2026"} · {statement.currency} · Asia/Bangkok</p>
              </div>
              <div className="review-actions">
                {boundAccount
                  ? <span className="synthetic-badge bound">Bound · checked</span>
                  : <span className="synthetic-badge">Synthetic data</span>}
                {boundAccount
                  ? <button type="button" className="primary-button" disabled={reconciliation.blockers.length > 0} onClick={confirmBoundImport}>Confirm import</button>
                  : <button type="button" className="primary-button" onClick={confirmSynthetic}>Confirm synthetic batch</button>}
              </div>
            </div>

            <dl className="statement-strip">
              <div><dt>Opening</dt><dd>{formatThb(statement.openingBalance.minor)}</dd></div>
              <div><dt>Deposits</dt><dd className="positive">+{formatThb(totals.deposits)}</dd></div>
              <div><dt>Withdrawals</dt><dd>{formatThb(totals.withdrawals)}</dd></div>
              <div><dt>Net movement</dt><dd>{formatThb(totals.net)}</dd></div>
              <div><dt>Closing</dt><dd>{formatThb(reconciliation.closingBalance)}</dd></div>
              <div><dt>Rows</dt><dd>{statement.rows.length}</dd></div>
            </dl>

            {reconciliation.warnings.map((warning) => (
              <div className="warning" key={warning.row} role="status">
                <strong>Reconciliation resumes at row {warning.row}</strong>
                <span>{warning.message} Expected {formatThb(warning.expected)}; printed {formatThb(warning.printed)}.</span>
              </div>
            ))}
            {reconciliation.blockers.map((blocker) => (
              <div className="warning error" key={blocker.row} role="alert">
                <strong>Row {blocker.row} blocks confirmation</strong>
                <span>Its movement does not reach the printed balance. Expected {formatThb(blocker.expected)}; printed {formatThb(blocker.printed)}.</span>
              </div>
            ))}

            <div className="ledger-wrap">
              <div className="balance-rail" aria-hidden="true">
                <span className="rail-label">Balance trace</span>
                {reconciliation.rows.map((row, index) => <i key={index} className={row.status === "resynchronized" ? "rail-break" : row.status === "blocked" ? "rail-blocker" : ""} />)}
              </div>
              <div className="table-scroll">
                <table>
                  <thead><tr><th>Date</th><th>Source description</th><th>Category</th><th className="numeric">Movement</th><th className="numeric">Balance</th><th><span className="sr-only">Details</span></th></tr></thead>
                  <tbody>
                    {reconciliation.rows.map((row, index) => (
                      <tr key={`${row.provenance.page}-${row.provenance.row}`} className={row.status === "resynchronized" ? "resync-row" : ""}>
                        <td data-label="Date"><time dateTime={row.sourceDate}>{new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short" }).format(new Date(`${row.sourceDate}T00:00:00+07:00`))}</time><small>{row.sourceTime ?? "—"}</small></td>
                        <td data-label="Description"><strong lang="th">{row.transactionLabel}</strong><span>{row.description}</span>{row.components.length > 1 && <em>2 components</em>}</td>
                        <td data-label="Category">
                          <select aria-label={`Category for ${row.description}`} value={rowCategories[index] ?? "Uncategorized"} onChange={(event) => { setRowCategories((current) => ({ ...current, [index]: event.target.value })); setBackupStale(true); }}>
                            {categories.map((category) => <option key={category}>{category}</option>)}
                          </select>
                        </td>
                        <td data-label="Movement" className={`numeric ${BigInt(row.movement) > 0n ? "positive" : ""}`}>{BigInt(row.movement) > 0n ? "+" : ""}{formatThb(row.movement)}</td>
                        <td data-label="Balance" className="numeric">{formatThb(row.postBalance.minor)}{row.status === "resynchronized" && <small className="resync-label">resynced</small>}</td>
                        <td><button type="button" className="detail-button" aria-label={`View source details for ${row.description}`} onClick={() => openDetail(index)}>View</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        ) : null}

        {/* The .pldemo envelope is labelled synthetic and is not a restorable ledger
            backup, so it is offered only for the synthetic preview. Wrapping real
            confirmed rows in a file that calls itself synthetic would be a lie about
            what the artifact holds. */}
        {statement && !boundAccount ? (
          <section className={`backup-band ${backupStale ? "stale" : ""}`} aria-labelledby="backup-title">
            <div><p className="section-index">Recovery demo / 03</p><h2 id="backup-title">{backupStale ? "The synthetic preview has changed" : "Export an encrypted synthetic preview"}</h2><p>This demonstration file is encrypted locally but is not a restorable ledger backup. The password is never sent to the server.</p></div>
            <div className="backup-form">
              <label><span>Backup password</span><input type="password" minLength={12} autoComplete="new-password" value={backupPassword} onChange={(event) => setBackupPassword(event.target.value)} placeholder="At least 12 characters…" /></label>
              <button type="button" className="backup-button" onClick={downloadBackup}>Encrypt demo preview</button>
            </div>
          </section>
        ) : null}
      </main>

      <footer><span>Private Ledger</span><p>No analytics · no session replay · no financial response caching</p></footer>

      <dialog ref={dialog} className="detail-dialog" onClose={() => setSelectedRow(null)}>
        {selected ? <div>
          <div className="dialog-heading"><div><p className="eyebrow">Immutable source facts</p><h2>{selected.description}</h2></div><button type="button" aria-label="Close transaction details" onClick={() => dialog.current?.close()}>Close</button></div>
          <dl className="detail-grid">
            <div><dt>Source date</dt><dd>{selected.sourceDate} {selected.sourceTime ?? ""} +07:00</dd></div>
            <div><dt>Effective date</dt><dd>{selected.effectiveDate}</dd></div>
            <div><dt>Reference</dt><dd>{selected.reference ?? "Not printed"}</dd></div>
            <div><dt>Branch</dt><dd>{selected.branch ?? "Not printed"}</dd></div>
            <div><dt>Printed balance</dt><dd>{formatThb(selected.postBalance.minor)}</dd></div>
            <div><dt>Provenance</dt><dd>Page {selected.provenance.page}, row {selected.provenance.row}</dd></div>
          </dl>
          <h3>Components</h3>
          <ul className="component-list">{selected.components.map((component, index) => <li key={index}><span>{component.kind}</span><b>{formatThb(component.amount.minor)}</b></li>)}</ul>
          <p className="immutability-note">Source facts, money, currency, components, and printed balance cannot be edited. Category changes are stored as overlay revisions.</p>
        </div> : null}
      </dialog>
    </div>
  );
}
