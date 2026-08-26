"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useResultBanner } from "@/app/result-banner";
import { accountListSchema, createAccountSchema, ledgerAccountSchema, type LedgerAccount } from "@/lib/accounts";
import { encryptBackup } from "@/lib/backup";
import { downloadFile } from "@/lib/download";
import { sha256HexBytes } from "@/lib/canonical";
import { assembleImportPayload } from "@/lib/import-assembly";
import type { StatementFrame } from "@/lib/statement-frame";
import { addMinor, formatThb } from "@/lib/money";
import { reconcileRows, type ReconciliationWarning } from "@/lib/reconcile";
import { importPayloadSchema, type ImportPayload, type SourceRowCandidate } from "@/lib/statement";
import {
  bannerCarriesRefusal, bannerFor, confirmationFor, confirmed, openedFromWorklist, rebound,
  type BindOutcome, type Worklist
} from "@/lib/import-flow";
import { ledgerRequest } from "@/lib/wire";
import { StatementBatch, type BatchHandoff } from "@/app/statement-batch";
import { LedgerNote } from "@/app/ledger-note";

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
  | { type: "parsed"; frame: StatementFrame; rows: SourceRowCandidate[]; pageCount: number; valueLabels?: string[] }
  | {
      type: "error"; code: string; reason?: string; detail?: string;
      labelCandidates?: string[][]; valueLabels?: string[]; structure?: string[];
      message: string;
    };

const categories = ["Uncategorized", "Income", "Food", "Cash", "Fees", "Interest"];

function stageIndex(stage: Stage) {
  return stages.findIndex((item) => item.id === stage);
}

/**
 * The import route: select a statement, unlock and parse it on this device, bind it to a
 * ledger account, review every balance, confirm.
 *
 * This was the top half of `app/ledger-app.tsx` until routing split the single page into
 * four (PLAN task 19). The parts that left are the ones that were never import's business —
 * the session control, which is the shell's, and the real backup and restore surface, which
 * is the recovery route's. What stayed is one stage machine, which is why it is one file.
 */
export function ImportBench() {
  const [stage, setStage] = useState<Stage>("select");
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("No PDF selected. Try the synthetic statement to review the complete flow safely.");
  const [statement, setStatement] = useState<ImportPayload | null>(null);
  // From the reconciliation that produced the payload, not from re-reconciling the payload.
  // The payload's rows are already in applied order, so it reconciles clean and would
  // report nothing — hiding the one fact the owner most needs before confirming (D-055).
  const [assemblyWarnings, setAssemblyWarnings] = useState<readonly ReconciliationWarning[]>([]);
  const [extracted, setExtracted] = useState<Extracted | null>(null);
  const [artifactDigest, setArtifactDigest] = useState("");
  const [accounts, setAccounts] = useState<LedgerAccount[] | null>(null);
  const [chosenAccountId, setChosenAccountId] = useState("");
  const [boundAccount, setBoundAccount] = useState<LedgerAccount | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [bindingError, setBindingError] = useState<string | null>(null);
  const [newAccountLabel, setNewAccountLabel] = useState("");
  const [newAccountType, setNewAccountType] = useState<"savings" | "current">("savings");
  const [createAccountError, setCreateAccountError] = useState<string | null>(null);
  const [labelCandidates, setLabelCandidates] = useState<string[][]>([]);
  const [valueLabels, setValueLabels] = useState<string[]>([]);
  const [structure, setStructure] = useState<string[]>([]);
  const [selectedRow, setSelectedRow] = useState<number | null>(null);
  const [rowCategories, setRowCategories] = useState<Record<number, string>>({});
  const [backupPassword, setBackupPassword] = useState("");
  const [previewStale, setPreviewStale] = useState(false);
  // Artifact digests confirmed during this visit, so a worked statement stops inviting a second
  // pass in the batch worklist. Session-scoped and nothing more: the authority on what is already
  // imported is `import_artifacts` in the database, which refuses a repeat on its own.
  const [confirmedDigests, setConfirmedDigests] = useState<readonly string[]>([]);
  /**
   * Which batch entry is being worked, and where it has got to — **one value, deliberately**.
   *
   * It was three (`workingLabel`, `batchBinding`, `batchConfirmation`), and the seam between them
   * is where D-147 and D-148 both lived: state that marks a mode, set in one place and cleared in
   * none, then cleared in a helper that half the exits forgot to call. `null` is now the only way
   * to be out of the worklist, so it cannot be cleared by halves. The transitions and the banner
   * are pure functions in `lib/import-flow.ts`, where they are covered by committed tests (D-150).
   */
  const [worklist, setWorklist] = useState<Worklist | null>(null);
  // **Binding a statement without asking, when exactly one account can possibly take it** (D-144,
  // relaxing D-017 on the owner's decision). Default on, and switchable in the batch section so it
  // is visible rather than a hidden behaviour. What it removes is the dropdown, never the review:
  // `assembleImportPayload` still refuses a mismatch, the review table still shows every balance,
  // and confirming is still an explicit act — which is what D-055's reordering warning needs.
  const [autoBind, setAutoBind] = useState(true);
  const dialog = useRef<HTMLDialogElement>(null);
  // Derived, not stored. It was a third `useState` that had to be set on confirming and cleared on
  // everything else, which is the exact shape that produced D-147.
  const batchConfirmation = confirmationFor(worklist);
  const banner = worklist === null ? null : bannerFor(worklist);
  /**
   * Brings whatever a **Bind & review** press produced into view, and announces it.
   *
   * Keyed on the binding **outcome** rather than on a stage, which is D-147: the guard used to read
   * `stage !== "bind"`, and an automatically bound statement (D-144) goes straight to `review` and
   * never passes through `bind` — so the one path that is *on by default* got no scroll at all, and
   * the owner was left looking at an unchanged worklist while the answer rendered off-screen.
   *
   * The anchor is always in the tree, so its position is knowable before the binding section it
   * precedes exists. A ref on that section would be null at the moment `workBatchEntry` wants to
   * scroll, because React has not committed it yet.
   *
   * The scroll, the focus move and the reasoning behind both now live in `app/result-banner.ts`,
   * which is the same module its two sibling capture surfaces use (D-150).
   */
  const { anchor: bindAnchor } = useResultBanner(banner);

  /**
   * Loads the account list once, unprompted.
   *
   * It used to be a button, which was fine when binding was always a manual step — the owner was
   * already in the chooser. Auto-binding has to know the accounts *before* the owner arrives, and
   * the manual path is better for it too: the chooser now arrives populated instead of asking for
   * a second click before it can be used.
   */
  useEffect(() => {
    void loadAccounts();
    // Once, on mount. Re-running it on every render would put a request behind every keystroke.
  }, []);

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

  // Rows are submitted and displayed in applied order, so a row the reconciliation moved is
  // one printed later on the page than the row now above it. Derived from provenance rather
  // than carried as a flag, because provenance is what survives into the payload (D-055).
  const movedRows = useMemo(() => {
    const moved = new Set<number>();
    if (!statement) return moved;
    for (let index = 1; index < statement.rows.length; index += 1) {
      const previous = statement.rows[index - 1]!.provenance;
      const current = statement.rows[index]!.provenance;
      if (current.page < previous.page || (current.page === previous.page && current.row < previous.row)) {
        moved.add(index);
      }
    }
    return moved;
  }, [statement]);

  // At review the payload is what will be imported, so its own reconciliation drives the
  // table — but the warnings must come from the reconciliation that built it.
  const shownWarnings = assemblyWarnings.length > 0 ? assemblyWarnings : reconciliation?.warnings ?? [];

  /**
   * Puts down whatever statement was loaded, because the owner has chosen a different document.
   *
   * **The review section and its Confirm button are gated on `statement`, not on `stage`**, and the
   * file picker is always on screen — so choosing a new PDF used to leave the *previous* statement's
   * review table live, with an enabled **Confirm import** beside it still carrying that statement's
   * payload and artifact digest, under a status line naming the new file. Pressing it filed the old
   * statement into an append-only ledger.
   *
   * **That hazard predates the worklist**, but clearing only the worklist state made it quieter
   * rather than safer: the binding banner naming the old statement was the one thing on screen
   * saying it was still loaded, and removing that cue while leaving the confirm path intact is
   * strictly worse. Found by `/code-review` on 2026-08-25, against the change that introduced it.
   *
   * Everything a review is built from goes at once. The parse that follows sets all of it again;
   * what matters is that nothing survives *between* choosing a document and reading it.
   */
  function discardLoadedStatement() {
    setWorklist(null);
    setStatement(null);
    setExtracted(null);
    setBoundAccount(null);
    setBindingError(null);
    setAssemblyWarnings([]);
    setArtifactDigest("");
    setSelectedRow(null);
    setRowCategories({});
    setLabelCandidates([]);
    setValueLabels([]);
    setStructure([]);
    // **The chooser belongs to the document too, and only the batch path knew it.**
    // `workBatchEntry` resets it for exactly this reason — a refusal used to leave the *previous*
    // statement's account selected under a banner asking for one, with Bind enabled on an account
    // nothing had matched. The picker path never did, so choosing a PDF by hand kept the last
    // statement's account in the dropdown. It could not produce a wrong import —
    // `assembleImportPayload` still checks the printed bank code and last four — but it is the same
    // misdirection one path had already fixed. Found by the guard in `tests/import-flow.test.ts`.
    setChosenAccountId("");
    setCreateAccountError(null);
  }

  async function loadSynthetic() {
    setStatus("Loading invented statement…");
    // **This used to check nothing but the schema.** No `ok`, and a bare `.json()` — so a route
    // that refused reported as "the fixture failed its own contract", pointing at the fixture
    // rather than at the route, and an answer that was not JSON threw out of an `onClick` with
    // nothing to catch it, leaving the status line reading "Loading invented statement…" for good.
    const result = await ledgerRequest("/api/v1/demo", importPayloadSchema, {
      fallback: "The synthetic statement could not be loaded.",
      offContract: "The synthetic fixture failed its own contract. Run the unit tests before continuing."
    });
    if (!result.ok) {
      setStatus(result.why);
      return;
    }
    setExtracted(null);
    setBoundAccount(null);
    setBindingError(null);
    setWorklist(null);
    setStatement(result.data);
    setAssemblyWarnings([]);
    setStage("review");
    setStatus("Synthetic statement ready. Nothing in this review came from a real account.");
  }

  async function parsePdf() {
    if (!file || !password) {
      setStatus("Choose a statement PDF and enter its document password.");
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
        // Empty unless the statement's totals never confirmed its rows, in which case these
        // are the candidate summary wordings that would fix it (D-043).
        setValueLabels(reply.valueLabels ?? []);
        setStructure([]);
        setExtracted({ frame: reply.frame, rows: reply.rows, pageCount: reply.pageCount });
        setStatement(null);
        setAssemblyWarnings([]);
        setBoundAccount(null);
        setBindingError(null);
        setWorklist(null);
        setStage("bind");
        // Three layouts read now, so the status line says which one ran — and whether the
        // rows were checked against the statement's own totals, which is the difference
        // between a verified parse and an unverified one (D-042).
        setStatus(
          `Read ${reply.rows.length} rows across ${reply.pageCount} page(s) as a ${reply.frame.bankCode} statement, ` +
          `for account ending ${reply.frame.accountLastFour}, ${reply.frame.periodStart} to ${reply.frame.periodEnd}. ` +
          `${reply.frame.crossChecked
            ? "Cross-checked against the statement's printed totals."
            : "NOT cross-checked: this statement printed no readable summary block, so it cannot be imported."} ` +
          "Nothing has left this device. Choose the ledger account it belongs to."
        );
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

  /**
   * Takes one statement off the batch worklist and drives the stage machine to `bind` with it.
   *
   * **This is the whole join between the two, and it is deliberately thin.** The batch parses; from
   * here on a batched statement is indistinguishable from one opened on its own — same binding,
   * same review table, same confirmation, same route. Nothing downstream needs to know a batch
   * exists, which is what keeps bulk import from becoming a second way to reach the ledger.
   */
  function workBatchEntry(handoff: BatchHandoff) {
    // The worklist value is replaced outright further down, once binding has resolved — which is
    // also what clears any banner about the *previous* entry. One sitting above the chooser for
    // this one reads as though this one had already been confirmed.
    setArtifactDigest(handoff.artifactDigest);
    setExtracted({ frame: handoff.frame, rows: handoff.rows, pageCount: handoff.pageCount });
    setStatement(null);
    setAssemblyWarnings([]);
    setBoundAccount(null);
    setBindingError(null);
    setSelectedRow(null);
    // **Keyed by row index, so it survives a change of statement as a wrong label over real rows.**
    // Categorise row 2 of one statement, confirm it, then open the next off the worklist and row 2
    // arrives pre-labelled with a category the owner never chose for it. It never reaches the
    // ledger — only `payload: statement` is posted — but it is shown over rows it does not
    // describe. Latent before bulk import; working a worklist is what makes it ordinary.
    setRowCategories({});
    // Diagnostics belong to the parse that produced them; carrying one statement's over to the
    // next would attach a refusal's candidate wordings to a document that never refused.
    setLabelCandidates([]);
    setValueLabels([]);
    setStructure([]);
    const match = soleMatchingAccount(handoff.frame);
    const source: Extracted = { frame: handoff.frame, rows: handoff.rows, pageCount: handoff.pageCount };

    // **Before the auto-bind branch, because a refused automatic bind lands in the chooser too.**
    // It used to sit after the early return, so a refusal left the *previous* statement's account
    // still selected under a banner telling the owner to choose one — the Bind button enabled on an
    // account nothing had matched. `assembleImportPayload` catches the mis-bind on last four, so it
    // cost a second confusing refusal rather than a wrong import, but the new banner points
    // straight at that dropdown. Pre-selected on a single match so the manual path is a
    // confirmation rather than a search; blank when nothing matches, because offering an account
    // the statement cannot bind to only produces a refusal one click later.
    setChosenAccountId(match?.id ?? "");

    // **Auto-bind takes the dropdown away, not the decision.** The review table below is unchanged
    // and confirming is still an explicit act, which is what D-055's reordering warning depends on.
    if (autoBind && match) {
      setWorklist(openedFromWorklist(handoff.label, handoff.rows.length, bindTo(match, source, true)));
      return;
    }
    setWorklist(openedFromWorklist(handoff.label, handoff.rows.length, { kind: "needs-account" }));
    setStage("bind");
    setStatus(
      `${handoff.label}: read ${handoff.rows.length} rows across ${handoff.pageCount} page(s) as a `
      + `${handoff.frame.bankCode} statement, for account ending ${handoff.frame.accountLastFour}, `
      + `${handoff.frame.periodStart} to ${handoff.frame.periodEnd}. `
      + "Nothing has left this device. "
      + (match
        ? "The account it prints is selected below — check it and bind."
        : "Choose the ledger account it belongs to.")
    );
  }

  async function loadAccounts() {
    setStatus("Loading your ledger accounts…");
    // This had written out `readError`'s body by hand rather than importing it — the same four
    // lines, a second time, where a bug fixed in one copy would not reach the other.
    const result = await ledgerRequest("/api/v1/accounts", accountListSchema, {
      fallback: "Accounts could not be loaded.",
      offContract: "The accounts response did not match its contract, so nothing can be bound."
    });
    if (!result.ok) {
      setAccounts(null);
      setStatus(result.why);
      return;
    }
    setAccounts(result.data.accounts);
    setStatus(result.data.accounts.length === 0
      ? "No ledger accounts exist yet. One must be created before a statement can be bound."
      : `${result.data.accounts.length} ledger account(s) available. Binding is checked against the printed account and currency.`);
  }

  // Creating an account is the way out of a real dead end. A statement prints an account
  // suffix, and until now nothing in the app could produce an account carrying it — every
  // account came from the seed (D-041) — so a statement matching none of them could be
  // read, cross-checked and then bound to nothing.
  //
  // The bank code and last four are taken from the statement rather than typed. Binding
  // checks both, so any other value would create an account this statement still could
  // not bind to, which is a worse dead end than the one it is meant to end.
  async function createAccount() {
    if (!extracted) return;
    setCreateAccountError(null);
    const parsed = createAccountSchema.safeParse({
      bank_code: extracted.frame.bankCode,
      label: newAccountLabel,
      account_type: newAccountType,
      last_four: extracted.frame.accountLastFour
    });
    if (!parsed.success) {
      setCreateAccountError("Give the account a name between 1 and 120 characters.");
      return;
    }

    const response = await fetch("/api/v1/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed.data)
    });
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      setCreateAccountError(typeof body === "object" && body !== null && "error" in body
        ? String((body as { error: unknown }).error)
        : "Account could not be created.");
      return;
    }

    const created = ledgerAccountSchema.safeParse((body as { account?: unknown } | null)?.account);
    setNewAccountLabel("");
    await loadAccounts();
    if (created.success) {
      setChosenAccountId(created.data.id);
      setStatus(`Created ${created.data.label} •••• ${created.data.last_four}.`);
    }
  }

  // Binding is a user decision, and assembleImportPayload refuses to act on it
  // blindly: the chosen account's last four digits and currency must match what the
  // statement printed, so a mis-click cannot post one account's rows into another.
  /**
   * The one account a statement can belong to, or null.
   *
   * **Exact, and unique by construction.** `public.accounts` is unique on
   * `(owner_id, bank_code, last_four)`, so a bank code and four printed digits identify at most one
   * account — this is a lookup on a compound key, not a guess. It still returns null rather than a
   * best effort when the match is not exactly one, which is the case the chooser exists for.
   *
   * Currency is deliberately **not** matched here. `assembleImportPayload` checks it and refuses
   * with its own message; filtering on it would turn a statement in the wrong currency into
   * "no account found", which sends the owner to create an account that already exists.
   */
  function soleMatchingAccount(frame: StatementFrame): LedgerAccount | null {
    const matches = (accounts ?? []).filter(
      (item) => item.bank_code === frame.bankCode && item.last_four === frame.accountLastFour
    );
    return matches.length === 1 ? matches[0]! : null;
  }

  /**
   * Binds `account` to the extracted statement, or reports why it cannot be bound.
   *
   * **Returns the refusal message, or null when it bound.** The caller cannot read `bindingError`
   * back — a `useState` setter does not update the variable it was called with — and the worklist
   * banner has to say which of the two happened in the same tick.
   */
  function bindTo(account: LedgerAccount, source: Extracted, automatic: boolean): BindOutcome {
    const result = assembleImportPayload(source.frame, source.rows, {
      accountId: account.id,
      bankCode: account.bank_code,
      lastFour: account.last_four,
      currency: account.currency
    });
    if (!result.ok) {
      setBindingError(result.message);
      setStatus(`Binding refused: ${result.message}`);
      // An automatic attempt that is refused leaves the chooser up rather than the review, so the
      // owner sees the refusal beside the control that can answer it.
      setStage("bind");
      return { kind: "refused", message: result.message };
    }
    setBindingError(null);
    setBoundAccount(account);
    setChosenAccountId(account.id);
    setStatement(result.payload);
    setAssemblyWarnings(result.warnings);
    // One key per bound statement, so retrying a failed confirmation is a retry
    // rather than a second import.
    setIdempotencyKey(crypto.randomUUID());
    setStage("review");
    setStatus(
      `${automatic ? "Bound automatically" : "Bound"} to ${account.label} •••• ${account.last_four}`
      + ` on its printed ${source.frame.bankCode} code and last four digits.`
      + " Review every balance before confirming."
    );
    return { kind: "bound", accountLabel: `${account.label} •••• ${account.last_four}` };
  }

  function bindStatement() {
    if (!extracted) return;
    const account = accounts?.find((item) => item.id === chosenAccountId);
    if (!account) {
      setBindingError("Choose the ledger account this statement belongs to.");
      return;
    }
    const outcome = bindTo(account, extracted, false);
    // `rebound` returns null unchanged when nothing is being worked, which is the single-import
    // path: it has its own status line and no worklist to answer to.
    setWorklist((current) => rebound(current, outcome));
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
    setConfirmedDigests((current) => current.includes(artifactDigest) ? current : [...current, artifactDigest]);
    // **One transition, so the binding banner cannot outlive the confirmation.** `confirmed`
    // returns null unchanged off the worklist, and `bannerFor` returns null on a confirmed phase —
    // so the worklist's own banner takes over and this one goes, without either being cleared by
    // hand. Leaving both up answered the same press twice, in two places, one of them stale.
    setWorklist((current) => confirmed(
      current,
      `${boundAccount.label} •••• ${boundAccount.last_four}`,
      String(record.batchId)
    ));
    // The ledger has moved, so whatever backup exists no longer covers it. Said here rather
    // than shown on the recovery route: the two are separate routes now and share no state,
    // and the authoritative check is the sequence `confirm_backup_custody` compares anyway.
    setStatus(`Confirmed ${statement.rows.length} rows into ${boundAccount.label} as batch ${String(record.batchId)}. The last backup is now stale — export a new one from Recovery.`);
  }

  function openDetail(index: number) {
    setSelectedRow(index);
    dialog.current?.showModal();
  }

  async function confirmSynthetic() {
    if (!statement) return;
    setStage("confirmed");
    setPreviewStale(true);
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
      downloadFile(JSON.stringify(envelope), "private-ledger-synthetic.pldemo", "application/vnd.private-ledger.demo+json");
      setBackupPassword("");
      setPreviewStale(false);
      setStatus("Encrypted synthetic preview downloaded. It is not a restorable ledger backup.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Backup encryption failed.");
    }
  }

  const selected = selectedRow === null ? null : statement?.rows[selectedRow] ?? null;
  const activeIndex = stageIndex(stage);

  return (
    <>
      {/* A title and an `(i)`, matching every other route (PLAN task 42). Both folded sentences
          are claims about a boundary — where the PDF is opened, and what is allowed across the
          confirmation — so they are worth being able to check and not worth re-reading. */}
      <section className="intro" aria-labelledby="page-title">
        <div>
          <p className="eyebrow">Statement import · private workspace</p>
          <h1 id="page-title">Import</h1>
          <div className="heading-note">
            <LedgerNote label="About importing">
              Review every balance before anything is saved. The PDF is unlocked and parsed in a
              dedicated browser worker, and only validated transaction facts can cross the
              confirmation boundary.
            </LedgerNote>
          </div>
        </div>
      </section>

      <nav className="stage-nav" aria-label="Statement import progress" tabIndex={0}>
        <ol>
          {stages.map((item, index) => (
            <li key={item.id} className={index < activeIndex ? "done" : index === activeIndex ? "active" : ""} aria-current={index === activeIndex ? "step" : undefined}>
              <span>{index + 1}</span>{item.label}
            </li>
          ))}
        </ol>
      </nav>

      <section className="import-bench" aria-labelledby="import-title">
        <div className="bench-heading">
          <p className="section-index">Import / 01</p>
          <div>
            <h2 id="import-title">Open a statement locally</h2>
            <p>Only the inspected Krungthai, SCB and KBANK layouts are accepted. Unknown layouts fail closed.</p>
          </div>
        </div>
        <div className="import-controls">
          <label className="file-control">
            <span>Statement PDF</span>
            <input type="file" name="statement-pdf" accept="application/pdf,.pdf" onChange={(event) => {
              const nextFile = event.target.files?.[0] ?? null;
              setFile(nextFile);
              // **Choosing a PDF here is the moment the owner puts down the last one**, and it is
              // the only moment that covers every way of doing so. `parsePdf` reads `file`, which
              // nothing but this control sets, so a worklist entry can never reach it — which makes
              // this the one place the previous statement can be discarded *before* anything of it
              // is shown over the new one. Nothing was cleared here at all until 2026-08-25, so
              // picking an unrelated PDF, or failing to unlock one, left the previous statement's
              // banner, review table and **enabled Confirm button** in place (D-148, D-150).
              discardLoadedStatement();
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
          <button className="primary-button" type="button" onClick={parsePdf}>Unlock &amp; check layout</button>
          <span className="or-rule">or</span>
          <button className="secondary-button" type="button" onClick={loadSynthetic}>Use synthetic statement</button>
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

      <StatementBatch
        onWork={workBatchEntry}
        confirmedDigests={confirmedDigests}
        confirmation={batchConfirmation}
        autoBind={autoBind}
        onAutoBindChange={setAutoBind}
      />

      {/* **`.capture-result-anchor` now, and the reason the old comment gave for avoiding it has
          gone.** That class carries `:empty { display: none }`, and this anchor used to be *always*
          empty — so it would have had no box, and `scrollIntoView` would have silently done
          nothing. It holds the binding banner as of this change, and the effect above only scrolls
          here when that banner exists, so the empty case is never a scroll target. Keeping
          `.scroll-anchor` instead would have been worse than useless: it set `height: 0`, which a
          banner inside it would overflow — so that class is gone from the stylesheet, this having
          been its only caller. The measured failure the old note records — the chooser
          landing at the foot of the viewport rather than the top, with the browser check passing
          anyway because "in the viewport" was too weak an assertion — is why the margin is on the
          class rather than left to the default. */}
      <div ref={bindAnchor} className="capture-result-anchor">
        {banner ? (
          <div className={`capture-result ${banner.tone}`} role="status" tabIndex={-1} data-capture-result>
            <p><b>{banner.heading}</b> {banner.body}</p>
          </div>
        ) : null}
      </div>

      {extracted && !boundAccount ? (
        <section className="binding-bench" aria-labelledby="binding-title">
          <div className="bench-heading">
            <p className="section-index">Bind / 02</p>
            <div>
              <h2 id="binding-title">Choose the ledger account</h2>
              <p>Read as a <b>{extracted.frame.bankCode}</b> statement ({extracted.frame.contractVersion}). It printed account ending <b>{extracted.frame.accountLastFour}</b> in {extracted.frame.currency}, {extracted.frame.periodStart} to {extracted.frame.periodEnd}. The parser is not allowed to guess which of your accounts that is.</p>
              {/* Whether the parse was checked against the bank's own arithmetic is the
                  difference between "these are the rows" and "these are the rows the
                  statement says it has". A statement printing no readable summary block is
                  accepted with no such check at all, and this is the last screen where the
                  owner can decline (D-033, D-042). */}
              {extracted.frame.crossChecked ? (
                <p className="cross-check-note">Cross-checked: the statement&apos;s own printed counts and totals agree with all {extracted.rows.length} rows.</p>
              ) : (
                <p className="cross-check-warning" role="alert">
                  <b>Not cross-checked — this statement will not be imported.</b> It printed no summary block the reader could match, so the {extracted.rows.length} rows were never verified against the bank&apos;s own counts and totals, and a dropped first or last row would not have been caught. If the statement does print totals, the wordings listed below are the candidates the reader saw; the layout needs to learn one of them.
                </p>
              )}
            </div>
          </div>
          <div className="binding-controls">
            <button className="secondary-button" type="button" onClick={loadAccounts}>Load ledger accounts</button>
            <label className="account-control">
              <span>Ledger account</span>
              <select
                name="ledger-account"
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
          {/* **Suppressed while the worklist banner is already carrying this same message.** The
              banner above is a `role="status"` that also takes focus, so leaving this `role="alert"`
              in place read the refusal to a screen reader twice and printed it on screen twice, a
              few hundred pixels apart. It stays for every other way `bindingError` is set — the
              manual "choose an account" case among them, which the banner never carries. */}
          {bindingError && !bannerCarriesRefusal(worklist)
            ? <div className="warning error" role="alert"><strong>Binding refused</strong><span>{bindingError}</span></div>
            : null}

          {/* Offered only once the accounts are loaded and none of them could possibly
              accept this statement. Binding matches on bank and last four together, so
              that pair is what decides whether this is a dead end — not the count of
              accounts, and not the digits alone, since one owner may hold accounts
              ending in the same four digits at different banks (D-041). */}
          {accounts && !accounts.some((item) => item.bank_code === extracted.frame.bankCode && item.last_four === extracted.frame.accountLastFour) ? (
            <div className="account-create">
              <p>
                No <b>{extracted.frame.bankCode}</b> account ends in <b>{extracted.frame.accountLastFour}</b>, so there is nothing this statement can bind to yet.
                Create one — the bank and the last four digits come from the statement itself, because binding checks both.
              </p>
              <div className="binding-controls">
                <label className="account-control">
                  <span>Account name</span>
                  <input
                    type="text"
                    name="new-account-label"
                    maxLength={120}
                    value={newAccountLabel}
                    placeholder="Everyday current account"
                    onChange={(event) => { setNewAccountLabel(event.target.value); setCreateAccountError(null); }}
                  />
                </label>
                <label className="account-control">
                  <span>Account type</span>
                  <select name="new-account-type" value={newAccountType} onChange={(event) => setNewAccountType(event.target.value === "current" ? "current" : "savings")}>
                    <option value="savings">savings</option>
                    <option value="current">current</option>
                  </select>
                </label>
                <button className="secondary-button" type="button" disabled={newAccountLabel.trim() === ""} onClick={createAccount}>
                  Create {extracted.frame.bankCode} account •••• {extracted.frame.accountLastFour}
                </button>
              </div>
              {createAccountError ? <div className="warning error" role="alert"><strong>Not created</strong><span>{createAccountError}</span></div> : null}
            </div>
          ) : null}
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

          {shownWarnings.map((warning) => (
            <div className="warning" key={`${warning.code}-${warning.row}`} role="status">
              {warning.code === "out-of-order-run" ? (
                <>
                  <strong>Rows reordered on {new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${warning.date}T00:00:00+07:00`))}</strong>
                  <span>
                    {warning.message} That date&rsquo;s {warning.order.length} rows are shown and imported in the applied order, running from {formatThb(warning.entryBalance)} to {formatThb(warning.recoveredClosing)}. Each row marked <em>reordered</em> below sits later on the printed page than the row above it — read the balance column straight down to check the chain joins up. The printed page and row of every row are kept.
                  </span>
                </>
              ) : (
                <>
                  <strong>Reconciliation resumes at row {warning.row}</strong>
                  <span>{warning.message} Expected {formatThb(warning.expected)}; printed {formatThb(warning.printed)}.</span>
                </>
              )}
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
              {reconciliation.rows.map((row, index) => <i key={index} className={row.status === "blocked" ? "rail-blocker" : row.status === "resynchronized" || row.status === "reordered" || movedRows.has(index) ? "rail-break" : ""} />)}
            </div>
            <div className="table-scroll">
              <table>
                <thead><tr><th>Date</th><th>Source description</th><th>Category</th><th className="numeric">Movement</th><th className="numeric">Balance</th><th><span className="sr-only">Details</span></th></tr></thead>
                <tbody>
                  {reconciliation.rows.map((row, index) => (
                    <tr key={`${row.provenance.page}-${row.provenance.row}`} className={row.status === "resynchronized" || row.status === "reordered" || movedRows.has(index) ? "resync-row" : ""}>
                      <td data-label="Date"><time dateTime={row.sourceDate}>{new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short" }).format(new Date(`${row.sourceDate}T00:00:00+07:00`))}</time><small>{row.sourceTime ?? "—"}</small></td>
                      <td data-label="Description"><strong lang="th">{row.transactionLabel}</strong><span>{row.description}</span>{row.components.length > 1 && <em>2 components</em>}</td>
                      <td data-label="Category">
                        <select aria-label={`Category for ${row.description}`} value={rowCategories[index] ?? "Uncategorized"} onChange={(event) => { setRowCategories((current) => ({ ...current, [index]: event.target.value })); setPreviewStale(true); }}>
                          {categories.map((category) => <option key={category}>{category}</option>)}
                        </select>
                      </td>
                      <td data-label="Movement" className={`numeric ${BigInt(row.movement) > 0n ? "positive" : ""}`}>{BigInt(row.movement) > 0n ? "+" : ""}{formatThb(row.movement)}</td>
                      <td data-label="Balance" className="numeric">{formatThb(row.postBalance.minor)}{row.status === "resynchronized" && <small className="resync-label">resynced</small>}{(row.status === "reordered" || movedRows.has(index)) && <small className="resync-label">reordered</small>}</td>
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
          what the artifact holds. The real backup lives on the recovery route, which is
          also why this one tracks only its own staleness now — a preview and a ledger
          going stale are not the same event, and treating them as one was a coupling the
          single page made easy to write. */}
      {statement && !boundAccount ? (
        <section className={`backup-band ${previewStale ? "stale" : ""}`} aria-labelledby="backup-title">
          <div><p className="section-index">Recovery demo / 03</p><h2 id="backup-title">{previewStale ? "The synthetic preview has changed" : "Export an encrypted synthetic preview"}</h2><p>This demonstration file is encrypted locally but is not a restorable ledger backup. The password is never sent to the server.</p></div>
          <div className="backup-form">
            <label><span>Backup password</span><input type="password" minLength={12} autoComplete="new-password" value={backupPassword} onChange={(event) => setBackupPassword(event.target.value)} placeholder="At least 12 characters…" /></label>
            <button type="button" className="backup-button" onClick={downloadBackup}>Encrypt demo preview</button>
          </div>
        </section>
      ) : null}

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
    </>
  );
}
