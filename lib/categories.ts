import { z } from "zod";

/**
 * The wire contract for `public.categories`, in one place rather than four.
 *
 * Before this, `cash-entry.tsx`, `correction-form.tsx`, `notification-card-capture.tsx` and
 * `slip-capture.tsx` each hand-rolled a `fetch` against `/api/v1/categories`, an `Array.isArray`
 * check and a local `type Category = { id; name; archived }` — none of them validated. The
 * `/categories` page and the ledger row's category editor call this schema through
 * `ledgerRequest`; `correction-form.tsx` no longer fetches at all and takes the list as a prop.
 * **`cash-entry.tsx`, `notification-card-capture.tsx` and `slip-capture.tsx` still hand-roll it**
 * — each is a capture surface that mounts on its own page rather than beside a list the page
 * already holds, so the same prop is not simply available to them; they are the remaining callers
 * worth migrating.
 *
 * `created_at` is `.optional()` rather than required, because it is not symmetric across the
 * three routes that answer with a category: `GET /api/v1/categories` selects it, but
 * `mutate_category` (the RPC behind `POST` and `PATCH`) returns only
 * `jsonb_build_object('id', ..., 'name', ..., 'archived', ...)` — no `created_at` at all. A
 * required field here would make every create or rename fail this parse.
 */
export const categorySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  archived: z.boolean(),
  created_at: z.string().optional(),
  // The parent's id, or null for a top-level category (migration 048, D-245). Optional for the
  // same reason as `created_at`: `mutate_category` does not return it; `GET` always does.
  parent_id: z.string().uuid().nullable().optional()
}).strict();

export type Category = z.infer<typeof categorySchema>;

/** What `GET /api/v1/categories` answers with. */
export const categoryListSchema = z.object({ categories: z.array(categorySchema) }).strict();

/** What `POST` and `PATCH /api/v1/categories` each answer with — one category, just mutated. */
export const categoryWriteResponseSchema = z.object({ category: categorySchema }).strict();

/**
 * The categories a picker may offer for a record whose assignment is `currentId`.
 *
 * Archived categories are not offerable — taking one out of circulation is what archiving is for.
 * **The record's own assignment is the exception, and it is not a courtesy.** Filter an assigned
 * but archived category out entirely and the select's `value` matches no `<option>`, so the
 * browser paints the control as unselected while the stored `category_id` is untouched. The owner
 * reads the blank as a missing value, "corrects" it by choosing something, and that write
 * genuinely erases an assignment nobody meant to change. Listing it keeps what is shown honest
 * about what is stored.
 *
 * **It lives here because it was written twice and only one copy was right.** `OverlayCategoryForm`
 * reasoned this through; `CorrectionForm` — which every slip, cash and card panel mounts — filtered
 * archived categories with no carve-out and carried the erasure path above until this was shared.
 */
export function pickableCategories(all: readonly Category[], currentId: string | null): Category[] {
  const active = all.filter((category) => !category.archived);
  if (currentId === null || currentId === "") return active;
  if (active.some((category) => category.id === currentId)) return active;
  const assigned = all.find((category) => category.id === currentId);
  return assigned ? [...active, assigned] : active;
}

/** `POST /api/v1/categories/parent`: set a category's parent, or remove it with null. */
export const categoryParentBodySchema = z.object({ id: z.string().uuid(), parentId: z.string().uuid().nullable() }).strict();

/** What that route answers with (`set_category_parent`). */
export const categoryParentResponseSchema = z.object({
  category_id: z.string().uuid(),
  parent_id: z.string().uuid().nullable(),
  changed: z.boolean()
}).strict();

/** `"Parent › Child"` for a subcategory, the name alone otherwise. A parent the list lacks reads as none. */
export function categoryLabel(category: Category, all: readonly Category[]): string {
  const parent = category.parent_id ? all.find((candidate) => candidate.id === category.parent_id) : undefined;
  return parent ? `${parent.name} › ${category.name}` : category.name;
}

/**
 * The list in tree order: each top-level category followed by its subcategories, both by name.
 * A subcategory whose parent is not in `list` (archived out of a picker, say) sits among the top level.
 */
export function nestedCategories<T extends Category>(list: readonly T[]): T[] {
  const byName = (a: T, b: T) => a.name.localeCompare(b.name);
  const ids = new Set(list.map((category) => category.id));
  const tops = list.filter((category) => !category.parent_id || !ids.has(category.parent_id)).sort(byName);
  const out: T[] = [];
  for (const top of tops) {
    out.push(top);
    out.push(...list.filter((category) => category.parent_id === top.id).sort(byName));
  }
  return out;
}
