"use client";

import { type Category } from "@/lib/categories";

/**
 * The list half of `/categories` — create lives in `app/categories-bench.tsx`, this only reads
 * and edits what is already stored.
 *
 * Mirrors `app/ledger-retired-cards.tsx`'s per-row-action list: **one `saving` id disables every
 * row's buttons**, not just the row being written, for the same reason every other write control
 * in this app does that — two writes in flight let the first to resolve re-enable a control whose
 * own write is still pending, and a second press then races a mutation the first has not finished.
 *
 * Presentational on purpose. Which row is mid-rename, and what has been typed into it, are both
 * state `app/categories-bench.tsx` holds — the same shape the ledger's own `modes.correcting`
 * takes, one edit open at a time, keyed by id.
 */
export function CategoriesList({
  categories,
  saving,
  renamingId,
  renameName,
  onStartRename,
  onRenameNameChange,
  onCancelRename,
  onSubmitRename,
  onArchiveToggle
}: {
  categories: Category[];
  /** The category whose write is in flight, or null. Disables every row's buttons while set. */
  saving: string | null;
  /** The category being renamed, by id, or null — one at a time. */
  renamingId: string | null;
  /** What has been typed into the open rename field. */
  renameName: string;
  onStartRename: (category: Category) => void;
  onRenameNameChange: (name: string) => void;
  onCancelRename: () => void;
  /** `{id, name, archived}` — `archived` travels unchanged, because the route has no partial patch. */
  onSubmitRename: (category: Category) => void;
  /** `{id, name, archived}` with `archived` flipped and `name` unchanged, for the same reason. */
  onArchiveToggle: (category: Category) => void;
}) {
  if (categories.length === 0) {
    return <p className="ledger-empty" role="status">No category has been created yet.</p>;
  }

  return (
    <ul className="retired-list">
      {categories.map((category) => {
        const isRenaming = renamingId === category.id;
        const isSaving = saving === category.id;
        return (
          <li key={category.id}>
            {isRenaming ? (
              <>
                {/* `.account-control` for its border/height/radius, same as every other text input
                    in the app — the visible label folds to `.sr-only` because the row itself
                    already says "rename" through the Save/Cancel pair beside it. */}
                <label className="account-control">
                  <span className="sr-only">{`Rename ${category.name}`}</span>
                  <input
                    value={renameName}
                    maxLength={80}
                    disabled={saving !== null}
                    onChange={(event) => onRenameNameChange(event.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={saving !== null || renameName.trim() === ""}
                  onClick={() => onSubmitRename(category)}
                >
                  {isSaving ? "Saving…" : "Save"}
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={saving !== null}
                  onClick={onCancelRename}
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <span>
                  {/* The name is the rename trigger, same as a stated house pattern for an
                      inline edit — a labelled button rather than a bare click target, so a
                      screen reader hears an action rather than a static label. */}
                  <button
                    type="button"
                    className="link-button"
                    aria-label={`Rename ${category.name}`}
                    disabled={saving !== null}
                    onClick={() => onStartRename(category)}
                  >
                    {category.name}
                  </button>
                  {category.archived ? <em> · archived</em> : null}
                </span>
                <button
                  type="button"
                  className="secondary-button"
                  aria-label={`${category.archived ? "Bring back" : "Archive"} ${category.name}`}
                  disabled={saving !== null}
                  onClick={() => onArchiveToggle(category)}
                >
                  {isSaving ? "Saving…" : category.archived ? "Bring it back" : "Archive"}
                </button>
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}
