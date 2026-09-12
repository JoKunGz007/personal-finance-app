import { z } from "zod";

/**
 * The wire contract for `public.categories`, in one place rather than four.
 *
 * Before this, `cash-entry.tsx`, `correction-form.tsx`, `notification-card-capture.tsx` and
 * `slip-capture.tsx` each hand-rolled a `fetch` against `/api/v1/categories`, an `Array.isArray`
 * check and a local `type Category = { id; name; archived }` — none of them validated. This is
 * the schema those four still do not use (out of scope for this task) and the one the new
 * `/categories` page and the ledger row's category editor both call through `ledgerRequest`.
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
  created_at: z.string().optional()
}).strict();

export type Category = z.infer<typeof categorySchema>;

/** What `GET /api/v1/categories` answers with. */
export const categoryListSchema = z.object({ categories: z.array(categorySchema) }).strict();

/** What `POST` and `PATCH /api/v1/categories` each answer with — one category, just mutated. */
export const categoryWriteResponseSchema = z.object({ category: categorySchema }).strict();
