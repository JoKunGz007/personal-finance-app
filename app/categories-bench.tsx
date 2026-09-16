"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CategoriesList } from "@/app/categories-list";
import { categoryListSchema, categoryWriteResponseSchema, type Category } from "@/lib/categories";
import { onOwnerReady, ownerReadyGeneration } from "@/lib/owner-ready";
import { ledgerRequest } from "@/lib/wire";

/**
 * The categories route's fetch and its two writes — create and the shared rename/archive patch
 * (migration 001's `categories` table, never given a caller until now).
 *
 * **Loads on arrival**, the same reversal `app/transactions-view.tsx` made for the ledger (PLAN
 * task 43): a list is what this route is *for*, so a press the owner would make on every single
 * visit is a toll rather than a decision. The sign-in retry below is the same second half that
 * reversal needed — signing in does not navigate, so a visit that lands signed out must still
 * populate once the owner proves who he is, without a manual reload.
 *
 * **Every write folds its response back into state rather than reloading the list.** `POST` and
 * `PATCH /api/v1/categories` both answer with the one category just mutated
 * (`mutate_category`'s `jsonb_build_object`, no `created_at`) — which is exactly why
 * `categorySchema` makes that field optional rather than required: a fold that demanded it would
 * make every create and every rename fail its own parse. Folding keeps a create or a rename to one
 * request instead of two, and the list is re-sorted by name after each one so it still reads the
 * way `GET`'s own `order by name` does.
 */
export function CategoriesBench() {
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signInNote, setSignInNote] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // One id at a time, for the reason every other write control in this app disables on one:
  // two writes in flight let the first to resolve re-enable a control whose own write is still
  // pending, and a second press then races a mutation the first has not finished.
  const [saving, setSaving] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameName, setRenameName] = useState("");

  const load = useCallback(async (automatic = false) => {
    setBusy(true);
    setError(null);
    setSignInNote(null);
    const result = await ledgerRequest("/api/v1/categories", categoryListSchema, {
      fallback: "Categories could not be loaded.",
      unreachable: "The ledger could not be reached, so categories are not shown.",
      offContract: "The categories response did not match its contract, so none are shown."
    });
    setBusy(false);
    if (!result.ok) {
      // Signed out is not a failure — see `app/transactions-view.tsx`'s own note on the same
      // branch. The automatic load on arrival hits this route before the owner has touched
      // anything, and `strongOwnerClient` correctly answers 401 for that.
      if (automatic && result.status === 401) {
        setSignInNote("Sign in to manage categories.");
        return;
      }
      if (automatic && result.status === 403) {
        setSignInNote(result.why);
        return;
      }
      setError(result.why);
      return;
    }
    setCategories(result.data.categories);
  }, []);

  const loadRequested = useRef(false);
  useEffect(() => {
    if (loadRequested.current) return;
    loadRequested.current = true;
    void load(true);
  }, [load]);

  const retriedAtGeneration = useRef(0);
  useEffect(() => {
    if (signInNote === null) return;
    const retry = () => {
      const current = ownerReadyGeneration();
      if (current === 0 || retriedAtGeneration.current >= current) return;
      retriedAtGeneration.current = current;
      void load(true);
    };
    retry();
    return onOwnerReady(retry);
  }, [signInNote, load]);

  function foldCategory(category: Category) {
    setCategories((current) => {
      const next = current === null ? [category] : [...current.filter((existing) => existing.id !== category.id), category];
      next.sort((a, b) => a.name.localeCompare(b.name));
      return next;
    });
  }

  async function createCategory(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed === "") return;
    setCreating(true);
    setCreateError(null);
    const result = await ledgerRequest(
      "/api/v1/categories",
      categoryWriteResponseSchema,
      {
        fallback: "The category could not be created.",
        unreachable: "The ledger could not be reached, so nothing was created.",
        offContract: "The category was created but did not come back in its published shape. Reload before trusting this list."
      },
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: trimmed }) }
    );
    setCreating(false);
    if (!result.ok) {
      // The route's own refusal is generic for a duplicate name (`routeError("Category could
      // not be created.", 409)`), so this asks for its own wording rather than repeating a
      // sentence that does not say what actually went wrong.
      setCreateError(result.status === 409 ? "That name is already used." : result.why);
      return;
    }
    setName("");
    foldCategory(result.data.category);
  }

  function startRename(category: Category) {
    setRowError(null);
    setRenamingId(category.id);
    setRenameName(category.name);
  }

  function cancelRename() {
    setRenamingId(null);
    setRenameName("");
  }

  async function submitRename(category: Category) {
    const trimmed = renameName.trim();
    if (trimmed === "") return;
    await patchCategory(category.id, trimmed, category.archived);
  }

  async function toggleArchive(category: Category) {
    await patchCategory(category.id, category.name, !category.archived);
  }

  /** The one PATCH both a rename and an archive toggle send — `{id, name, archived}` every time,
   *  because the route has no partial patch and the field not being changed must still be sent
   *  as what it already is. */
  async function patchCategory(id: string, nextName: string, nextArchived: boolean) {
    setSaving(id);
    setRowError(null);
    const result = await ledgerRequest(
      "/api/v1/categories",
      categoryWriteResponseSchema,
      {
        fallback: "The category could not be saved.",
        unreachable: "The ledger could not be reached, so nothing was saved.",
        offContract: "The category was saved but did not come back in its published shape. Reload before trusting this list."
      },
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, name: nextName, archived: nextArchived })
      }
    );
    setSaving(null);
    if (!result.ok) {
      setRowError(result.status === 409 ? "That name is already used." : result.why);
      return;
    }
    foldCategory(result.data.category);
    // Only this write's own rename box, if it is still the one open — an archive toggle on one
    // category, or a rename whose panel the owner has since moved off of, must not discard an
    // unrelated category's in-progress, unsaved rename text. Read via the functional updater
    // rather than the closed-over `renamingId` so a rename started during this write's own
    // network round trip is not clobbered by a stale comparison.
    let closedOwnRename = false;
    setRenamingId((current) => {
      if (current !== id) return current;
      closedOwnRename = true;
      return null;
    });
    if (closedOwnRename) setRenameName("");
  }

  return (
    <section className="cash-bench compact" aria-labelledby="categories-title">
      <div className="cash-heading">
        <p className="section-index">New</p>
        <h2 id="categories-title">Add a category</h2>
      </div>

      <form className="slip-form" onSubmit={(event) => void createCategory(event)}>
        <label className="account-control">
          <span>Name</span>
          <input value={name} maxLength={80} disabled={creating} onChange={(event) => setName(event.target.value)} required />
        </label>
        {createError && <p className="status error" role="alert">{createError}</p>}
        <div className="slip-actions">
          <button type="submit" className="primary-button" disabled={creating || name.trim() === ""}>
            {creating ? "Creating…" : "Create category"}
          </button>
        </div>
      </form>

      {error ? (
        <div className="warning error" role="alert">
          <strong>Not loaded</strong>
          <span>{error}</span>
        </div>
      ) : null}

      {signInNote ? <p className="ledger-status" role="status">{signInNote}</p> : null}

      {busy && categories === null ? <p className="ledger-status" role="status">Loading…</p> : null}

      {rowError ? (
        <div className="warning error" role="alert">
          <strong>Not saved</strong>
          <span>{rowError}</span>
        </div>
      ) : null}

      {categories !== null ? (
        <h3 className="list-heading">Your categories</h3>
      ) : null}
      {categories !== null ? (
        <CategoriesList
          categories={categories}
          saving={saving}
          renamingId={renamingId}
          renameName={renameName}
          onStartRename={startRename}
          onRenameNameChange={setRenameName}
          onCancelRename={cancelRename}
          onSubmitRename={(category) => void submitRename(category)}
          onArchiveToggle={(category) => void toggleArchive(category)}
        />
      ) : null}
    </section>
  );
}
