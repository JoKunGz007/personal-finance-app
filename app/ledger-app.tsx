"use client";

import { useMemo, useRef, useState } from "react";
import { encryptBackup } from "@/lib/backup";
import { payloadDigest } from "@/lib/canonical";
import { addMinor, formatThb } from "@/lib/money";
import { reconcileRows } from "@/lib/reconcile";
import { importPayloadSchema, type ImportPayload } from "@/lib/statement";

type Stage = "select" | "unlock" | "review" | "confirmed";
const stages: Array<{ id: Stage; label: string }> = [
  { id: "select", label: "Select PDF" },
  { id: "unlock", label: "Unlock & parse locally" },
  { id: "review", label: "Review" },
  { id: "confirmed", label: "Confirmed" }
];

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
    const worker = new Worker(new URL("../workers/krungthai.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<{ type: string; message: string }>) => {
      setStatus(event.data.message);
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

  function openDetail(index: number) {
    setSelectedRow(index);
    dialog.current?.showModal();
  }

  async function confirmSynthetic() {
    if (!statement) return;
    await payloadDigest(statement);
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
          </div>
          <p className="status-line" role="status"><span aria-hidden="true">●</span>{status}</p>
        </section>

        {statement && reconciliation && totals ? (
          <section className="review" aria-labelledby="review-title">
            <div className="review-heading">
              <div>
                <p className="section-index">Review / 02</p>
                <h2 id="review-title">Synthetic current account <span>•••• 4242</span></h2>
                <p>1–30 June 2026 · THB · Asia/Bangkok</p>
              </div>
              <div className="review-actions">
                <span className="synthetic-badge">Synthetic data</span>
                <button type="button" className="primary-button" onClick={confirmSynthetic}>Confirm synthetic batch</button>
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

        {statement ? (
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
