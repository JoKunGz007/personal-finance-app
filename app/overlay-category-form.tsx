"use client";

import { useMemo, useState } from "react";
import { overlayInForce, overlayWriteBody, overlayWriteResponseSchema, type LedgerTransaction, type TransactionOverlay } from "@/lib/transactions";
import { pickableCategories, type Category } from "@/lib/categories";
import { ledgerRequest } from "@/lib/wire";

/**
 * Editing `category_id` and `note` on a confirmed statement row (PLAN task 25 part 2).
 *
 * **Not `CorrectionForm`, on purpose, though it looks like one.** `CorrectionForm` sends a field
 * only when it differs from what was first typed — null means "not corrected" there. This overlay
 * has the opposite meaning for null: `update_transaction_overlay` writes the *whole* row with
 * `on conflict do update set` over every column, so a body that named only `categoryId` and sent
 * everything else as null would be **accepted**, and would erase whatever description,
 * counterparty, effective date or note the owner had already put on this row. `overlayWriteBody`
 * is what makes that structurally impossible: it derives the rest of the body from the row itself,
 * and this form may only narrow that derivation to the two fields it actually edits.
 *
 * **Categories are a prop, not a fetch.** `app/transactions-view.tsx` loads them once via
 * `lib/categories.ts` for every row on the page; a form re-fetching its own copy per open panel
 * would be the same list requested as many times as a row was edited in one visit.
 *
 * Failures are reported to the caller rather than shown here — `app/transactions-view.tsx` keeps
 * its own error line for this write, on the same convention as `reportingError` and
 * `correctionError`, cleared the moment the panel is toggled so a stale refusal from a previous
 * attempt is never read as belonging to this one.
 */
export function OverlayCategoryForm({
  transaction,
  categories,
  onSaved,
  onError,
  onCancel,
  onBusyChange
}: {
  transaction: LedgerTransaction;
  /** Every category this owner has, archived included — see the filter below for why. */
  categories: Category[];
  onSaved: (overlay: TransactionOverlay) => void;
  onError: (message: string) => void;
  onCancel: () => void;
  /** Lets the row disable its own "Stop editing category" trigger while a write is in flight —
   *  this form's own `busy` state is local, so without this the row's toggle stays enabled and
   *  can unmount the form mid-request. */
  onBusyChange: (busy: boolean) => void;
}) {
  const inForce = useMemo(() => overlayInForce(transaction), [transaction]);
  const [categoryId, setCategoryId] = useState(inForce.categoryId ?? "");
  const [note, setNote] = useState(inForce.note ?? "");
  const [busy, setBusy] = useState(false);

  /**
   * Active categories, plus this row's own assignment even when archived — the reasoning, and why
   * it is not optional, is in `pickableCategories`. No inline creation here (this session's
   * decision; creation lives on `/categories` only). The Description cell's chip reads the
   * unfiltered `categories` above rather than this list, so an archived assignment still renders
   * on the row itself.
   */
  const pickable = useMemo(
    () => pickableCategories(categories, inForce.categoryId),
    [categories, inForce.categoryId]
  );

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    onBusyChange(true);
    const trimmedNote = note.trim();
    const result = await ledgerRequest(
      `/api/v1/transactions/${transaction.id}/overlay`,
      overlayWriteResponseSchema,
      {
        fallback: "The category could not be saved.",
        unreachable: "The ledger could not be reached, so nothing was saved.",
        offContract: "The overlay was saved but did not come back in its published shape. Reload before trusting this view."
      },
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(overlayWriteBody(transaction, {
          categoryId: categoryId === "" ? null : categoryId,
          note: trimmedNote === "" ? null : trimmedNote
        }))
      }
    );
    setBusy(false);
    onBusyChange(false);
    if (!result.ok) {
      onError(result.why);
      return;
    }
    onSaved(result.data.overlay);
  }

  return (
    <form className="correction-form" onSubmit={(event) => void submit(event)}>
      <p className="correction-title"><strong>Category and note</strong></p>
      <div className="slip-fields">
        <label>
          <span>Category (optional)</span>
          <select value={categoryId} disabled={busy} onChange={(event) => setCategoryId(event.target.value)}>
            <option value="">Uncategorised</option>
            {pickable.map((category) => (
              <option key={category.id} value={category.id}>
                {category.archived ? `${category.name} · archived` : category.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="slip-note">
        <span>Note (optional)</span>
        <textarea value={note} maxLength={2000} rows={2} disabled={busy} onChange={(event) => setNote(event.target.value)} />
      </label>

      <div className="slip-actions">
        <button type="submit" className="primary-button" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
        <button type="button" className="secondary-button" disabled={busy} onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
