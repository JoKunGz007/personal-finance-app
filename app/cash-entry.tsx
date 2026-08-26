"use client";

import { useMemo, useState } from "react";
import { formatThb, parseThb } from "@/lib/money";
import { cashDateWindow, CASH_KINDS } from "@/lib/cash";
import { bangkokToday } from "@/lib/dates";
import { readError } from "@/lib/wire";
import { LedgerNote } from "@/app/ledger-note";

type Category = { id: string; name: string; archived: boolean };
type Kind = (typeof CASH_KINDS)[number];

/**
 * Recording a cash payment (migration 013, PLAN task 22).
 *
 * It sits on the ledger page rather than beside slip capture, and the reason is the slips
 * page's own premise: a slip is **provisional until the statement it belongs to arrives**.
 * Cash has no statement and never will, so it is not waiting for anything — it is a ledger
 * fact the moment it is typed. The place it appears is the ledger, so the place to record it
 * is the ledger too.
 *
 * Nothing about this form is idempotent, deliberately. Slip capture dedups on the QR
 * reference because that reference *is* an external identity; cash has none, and two identical
 * payments on one day are two payments rather than a duplicate to collapse. So a second submit
 * writes a second entry, and the form says so instead of pretending otherwise.
 */
export function CashEntryForm({ onRecorded }: { onRecorded?: () => void }) {
  const window_ = useMemo(() => cashDateWindow(new Date()), []);
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind>("withdrawal");
  const [amount, setAmount] = useState("");
  // Bangkok, not UTC — see `bangkokToday`. The same defect as the card form's, found with it
  // and fixed with it, because both hand-rolled the same line (D-110).
  const [occurredOn, setOccurredOn] = useState(() => bangkokToday());
  const [occurredAtTime, setOccurredAtTime] = useState("");
  const [counterparty, setCounterparty] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [note, setNote] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The typed amount, read the way every other money field in this app reads one: through
  // `parseThb`, which is exact decimal-to-minor-units and refuses anything else. A float never
  // enters, here or anywhere.
  const parsedAmount = useMemo(() => {
    if (amount.trim() === "") return null;
    try {
      const money = parseThb(amount);
      const magnitude = BigInt(money.minor);
      if (magnitude === 0n) return { ok: false as const, message: "A payment of nothing is not a payment." };
      // The sign belongs to the direction, not to what was typed: the owner chooses "money
      // out" and types a positive number, as on every receipt they have ever read.
      const signed = kind === "withdrawal" ? -(magnitude < 0n ? -magnitude : magnitude) : (magnitude < 0n ? -magnitude : magnitude);
      return { ok: true as const, minor: signed.toString() };
    } catch {
      return { ok: false as const, message: "Enter a plain amount such as 250 or 250.75." };
    }
  }, [amount, kind]);

  async function loadCategories() {
    const response = await fetch("/api/v1/categories", { headers: { accept: "application/json" } });
    if (!response.ok) return;
    const body = await response.json().catch(() => null);
    if (body && Array.isArray(body.categories)) setCategories(body.categories.filter((c: Category) => !c.archived));
  }

  function reset() {
    setAmount("");
    setOccurredAtTime("");
    setCounterparty("");
    setCategoryId("");
    setNote("");
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!parsedAmount?.ok) return;
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const response = await fetch("/api/v1/cash", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind,
          amountMinor: parsedAmount.minor,
          occurredOn,
          occurredAtTime: occurredAtTime || null,
          counterparty: counterparty.trim() || null,
          categoryId: categoryId || null,
          note: note.trim() || null
        })
      });
      if (!response.ok) {
        const body: unknown = await response.json().catch(() => null);
        setError(readError(body, "The cash entry could not be saved."));
        return;
      }
      // Append-only, and the words say so. This row cannot be deleted — a mistake in it is
      // corrected, which leaves both figures on the record.
      setStatus("Recorded. A cash entry cannot be deleted; a mistake in it is corrected instead.");
      reset();
      onRecorded?.();
    } catch {
      setError("The ledger could not be reached, so nothing was recorded.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="cash-bench compact" aria-labelledby="cash-title">
      {/* **Contracted to one line** (PLAN task 42). This owned a titled section and a paragraph
          above the table, which is a lot of the page for something used a few times a week. The
          heading level is unchanged — h1, h2, h2 is still the outline, and axe's `heading-order`
          rule runs on this route — it is only smaller and inline with its own button.

          **The two sentences did not go to the same place, and that is the distinction.** Why
          cash is recorded here at all is a principle and is behind the `(i)`. That it can never
          be edited is a warning about the write itself, so it stays on the screen and has moved
          *down*, next to the button that performs it. */}
      <div className="cash-heading">
        <p className="section-index">Cash</p>
        {/* Named for the thing rather than for the act, so the heading and the button beside it
            are not the same sentence read twice. */}
        <h2 id="cash-title">Cash payments</h2>
        {/* Sibling, not a child. The heading names the `<section>` through `aria-labelledby`, so a
            button inside it would be read as part of that name. See `app/ledger-note.tsx`. */}
        <LedgerNote label="About cash entries">
          Cash leaves no statement row and no slip, so what you type here is the only record
          the amount has.
        </LedgerNote>
        {!open ? (
          <button
            type="button"
            className="secondary-button"
            onClick={() => { setOpen(true); setStatus(null); void loadCategories(); }}
          >
            Record a payment
          </button>
        ) : null}
      </div>

      {!open ? null : (
        <form className="slip-form" onSubmit={(event) => void submit(event)}>
          <div className="slip-fields">
            <label>
              <span>Direction</span>
              <select value={kind} disabled={busy} onChange={(event) => setKind(event.target.value as Kind)}>
                <option value="withdrawal">Money out</option>
                <option value="deposit">Money in</option>
              </select>
            </label>

            <label>
              <span>Amount (THB)</span>
              <input
                inputMode="decimal"
                value={amount}
                disabled={busy}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="250.00"
                required
                aria-describedby="cash-amount-help"
              />
            </label>

            <label>
              <span>Date</span>
              <input
                type="date"
                value={occurredOn}
                min={window_.earliest}
                max={window_.latest}
                disabled={busy}
                onChange={(event) => setOccurredOn(event.target.value)}
                required
                aria-describedby="cash-date-help"
              />
            </label>

            <label>
              <span>Time (optional)</span>
              <input type="time" value={occurredAtTime} disabled={busy} onChange={(event) => setOccurredAtTime(event.target.value)} />
            </label>

            <label>
              <span>Counterparty (optional)</span>
              <input value={counterparty} maxLength={240} disabled={busy} onChange={(event) => setCounterparty(event.target.value)} />
            </label>

            <label>
              <span>Category (optional)</span>
              <select value={categoryId} disabled={busy} onChange={(event) => setCategoryId(event.target.value)}>
                <option value="">Uncategorised</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>{category.name}</option>
                ))}
              </select>
            </label>
          </div>

          <p id="cash-amount-help" className="field-help">
            {parsedAmount === null
              ? "Type the amount as it was paid; the direction above carries the sign."
              : parsedAmount.ok
                ? `Will be recorded as ${formatThb(parsedAmount.minor)}.`
                : parsedAmount.message}
          </p>
          {/* The Buddhist-era warning is repeated from slip capture for a reason that is
              *stronger* here, not weaker: `capture_slip` bounds a slip's date in the database,
              while `create_cash_entry` does not, so this bound is the only one there is. */}
          <p id="cash-date-help" className="field-help">
            Enter the Gregorian year. A Thai receipt often prints a Buddhist one such as 2569,
            and for cash this form is the only thing checking it.
          </p>

          <label className="slip-note">
            <span>Note (optional)</span>
            <textarea value={note} maxLength={2000} rows={2} disabled={busy} onChange={(event) => setNote(event.target.value)} />
          </label>

          {status && <p className="status" role="status">{status}</p>}
          {error && <p className="status error" role="alert">{error}</p>}

          {/* The append-only warning, beside the control that performs the write rather than in
              the section heading where it used to sit. It is the one sentence here the owner has
              to have read *before* pressing, so it is the one that does not fold away. */}
          <p className="write-warning">
            Written once and never edited — a mistake is corrected, and both figures stay on the
            record.
          </p>

          <div className="slip-actions">
            <button type="submit" className="primary-button" disabled={busy || !parsedAmount?.ok}>
              {busy ? "Recording…" : "Record this payment"}
            </button>
            <button type="button" className="secondary-button" disabled={busy} onClick={() => { setOpen(false); reset(); setError(null); }}>
              Close
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
