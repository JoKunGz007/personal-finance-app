"use client";

import { useEffect, useMemo, useState } from "react";
import { formatThb, parseThb } from "@/lib/money";
import { applyCorrection, type Correctable, type CorrectionOverlay } from "@/lib/corrections";
import { readError } from "@/lib/wire";

type Category = { id: string; name: string; archived: boolean };

/**
 * Correcting what the owner typed — on a slip or on a cash entry (migration 013).
 *
 * One component for both, because the correctable half is the same seven fields and the same
 * overlay semantics. What differs is only the endpoint and the words, which are passed in.
 *
 * **It sends a field only when it differs from the original.** That is not an optimisation: a
 * null in the overlay *means* "not corrected", so writing every field back — including the
 * ones that never changed — would record a correction of values nobody corrected, and the row
 * would say "corrected by you" about a note the owner only re-read. It also gives the undo for
 * free: put every field back to what it was and the overlay clears, which is what makes a
 * mistaken correction itself correctable.
 *
 * The original is never overwritten. `slips` and `cash_entries` refuse an update outright —
 * `slips_immutable` and `cash_entries_immutable` — so what is on screen after this is the
 * original plus an overlay plus an append-only revision, and all three survive a backup.
 */
export function CorrectionForm({
  base,
  overlay,
  endpoint,
  title,
  onSaved,
  onCancel
}: {
  base: Correctable;
  overlay: CorrectionOverlay | null;
  endpoint: string;
  title: string;
  onSaved: (correction: unknown) => void;
  onCancel: () => void;
}) {
  const inForce = useMemo(() => applyCorrection(base, overlay), [base, overlay]);
  const [kind, setKind] = useState(inForce.kind);
  // Shown unsigned, because the direction control carries the sign — the owner reads a
  // receipt, not a ledger entry.
  const [amount, setAmount] = useState(() => {
    const magnitude = BigInt(inForce.amount_minor) < 0n ? -BigInt(inForce.amount_minor) : BigInt(inForce.amount_minor);
    return `${magnitude / 100n}.${(magnitude % 100n).toString().padStart(2, "0")}`;
  });
  const [occurredOn, setOccurredOn] = useState(inForce.occurred_on);
  const [occurredAtTime, setOccurredAtTime] = useState(inForce.occurred_at_time?.slice(0, 5) ?? "");
  const [counterparty, setCounterparty] = useState(inForce.counterparty ?? "");
  const [categoryId, setCategoryId] = useState(inForce.category_id ?? "");
  const [note, setNote] = useState(inForce.note ?? "");
  const [categories, setCategories] = useState<Category[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const response = await fetch("/api/v1/categories", { headers: { accept: "application/json" } });
      if (!response.ok) return;
      const body = await response.json().catch(() => null);
      if (body && Array.isArray(body.categories)) setCategories(body.categories.filter((c: Category) => !c.archived));
    })();
  }, []);

  const parsedAmount = useMemo(() => {
    if (amount.trim() === "") return { ok: false as const, message: "An amount is required." };
    try {
      const money = parseThb(amount);
      const magnitude = BigInt(money.minor) < 0n ? -BigInt(money.minor) : BigInt(money.minor);
      if (magnitude === 0n) return { ok: false as const, message: "A payment of nothing is not a payment." };
      return { ok: true as const, minor: (kind === "withdrawal" ? -magnitude : magnitude).toString() };
    } catch {
      return { ok: false as const, message: "Enter a plain amount such as 250 or 250.75." };
    }
  }, [amount, kind]);

  // What actually changed, against the **original** rather than against what is in force. A
  // field equal to the original is sent as null, which is how the overlay says "not corrected".
  const changes = useMemo(() => {
    if (!parsedAmount.ok) return null;
    const amountChanged = parsedAmount.minor !== base.amount_minor || kind !== base.kind;
    const time = occurredAtTime === "" ? null : occurredAtTime;
    const trimmedCounterparty = counterparty.trim() === "" ? null : counterparty.trim();
    const trimmedNote = note.trim() === "" ? null : note.trim();
    return {
      // Kind and amount move together — the overlay's own CHECK couples them — so a change to
      // either sends both.
      kind: amountChanged ? kind : null,
      amountMinor: amountChanged ? parsedAmount.minor : null,
      occurredOn: occurredOn === base.occurred_on ? null : occurredOn,
      occurredAtTime: time === base.occurred_at_time?.slice(0, 5) ? null : time,
      counterparty: trimmedCounterparty === base.counterparty ? null : trimmedCounterparty,
      categoryId: (categoryId === "" ? null : categoryId) === base.category_id ? null : (categoryId === "" ? null : categoryId),
      note: trimmedNote === base.note ? null : trimmedNote
    };
  }, [parsedAmount, kind, occurredOn, occurredAtTime, counterparty, categoryId, note, base]);

  /**
   * Null everywhere is a legitimate save, not a no-op: it clears an existing correction. It is
   * only pointless when there was no correction to begin with, which is what this asks.
   */
  const clearsToOriginal = changes !== null && Object.values(changes).every((value) => value === null);
  const nothingToDo = clearsToOriginal && overlay === null;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (changes === null || nothingToDo) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(endpoint, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          // 0 means "I believe no correction exists", which is what the RPC's optimistic
          // concurrency compares against. A second tab having corrected already is a conflict
          // worth reporting rather than a write to repeat.
          expectedRevision: overlay?.revision ?? 0,
          ...changes
        })
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setError(readError(body, "The correction could not be saved."));
        return;
      }
      onSaved((body as { correction: unknown } | null)?.correction);
    } catch {
      setError("The ledger could not be reached, so nothing was corrected.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="correction-form" onSubmit={(event) => void submit(event)}>
      <p className="correction-title"><strong>{title}</strong></p>
      <div className="slip-fields">
        <label>
          <span>Direction</span>
          <select value={kind} disabled={busy} onChange={(event) => setKind(event.target.value as typeof kind)}>
            <option value="withdrawal">Money out</option>
            <option value="deposit">Money in</option>
          </select>
        </label>
        <label>
          <span>Amount (THB)</span>
          <input inputMode="decimal" value={amount} disabled={busy} onChange={(event) => setAmount(event.target.value)} required />
        </label>
        <label>
          <span>Date</span>
          <input type="date" value={occurredOn} disabled={busy} onChange={(event) => setOccurredOn(event.target.value)} required />
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

      <label className="slip-note">
        <span>Note (optional)</span>
        <textarea value={note} maxLength={2000} rows={2} disabled={busy} onChange={(event) => setNote(event.target.value)} />
      </label>

      <p className="field-help">
        {!parsedAmount.ok
          ? parsedAmount.message
          : clearsToOriginal
            ? overlay === null
              ? "Nothing here differs from what was first recorded, so there is nothing to correct."
              : `Saving now clears your correction and puts ${formatThb(base.amount_minor)} back as the figure in force.`
            : `The figure in force becomes ${formatThb(parsedAmount.minor)}. What was first recorded is kept.`}
      </p>

      {error && <p className="status error" role="alert">{error}</p>}

      <div className="slip-actions">
        <button type="submit" className="primary-button" disabled={busy || changes === null || nothingToDo}>
          {busy ? "Saving…" : clearsToOriginal ? "Clear the correction" : "Save the correction"}
        </button>
        <button type="button" className="secondary-button" disabled={busy} onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
