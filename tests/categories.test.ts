import { describe, expect, it } from "vitest";
import { categoryListSchema, categorySchema, categoryWriteResponseSchema, pickableCategories } from "@/lib/categories";

const ID = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const GONE = "33333333-3333-4333-8333-333333333333";

function category(overrides: Record<string, unknown> = {}) {
  return { id: ID, name: "Groceries", archived: false, created_at: "2026-01-01T00:00:00Z", ...overrides };
}

/** What `mutate_category` actually answers with — the same three fields, `created_at` absent
 *  rather than merely omitted, so the schema's `.optional()` is exercised the way the route
 *  really produces it rather than by deleting a key `category()` always sets. */
function mutationResponse(overrides: Record<string, unknown> = {}) {
  return { id: ID, name: "Groceries", archived: false, ...overrides };
}

describe("category wire contract", () => {
  it("accepts a GET row, created_at included", () => {
    expect(categorySchema.safeParse(category()).success).toBe(true);
  });

  it("accepts a create/rename response with no created_at at all", () => {
    // `mutate_category` answers `jsonb_build_object('id', ..., 'name', ..., 'archived', ...)` —
    // no `created_at`, unlike the `GET` rows. A required field here would fail every create and
    // every rename's own parse.
    expect(categorySchema.safeParse(mutationResponse()).success).toBe(true);
  });

  it("is strict: an unexpected field refuses rather than being silently dropped", () => {
    expect(categorySchema.safeParse(category({ extra: "unexpected" })).success).toBe(false);
  });

  it("refuses a non-uuid id, an empty name is otherwise still just a string, and archived must be boolean", () => {
    expect(categorySchema.safeParse(category({ id: "not-a-uuid" })).success).toBe(false);
    expect(categorySchema.safeParse(category({ archived: "false" })).success).toBe(false);
  });

  it("parses the list and write-response envelopes GET/POST/PATCH actually answer with", () => {
    expect(categoryListSchema.safeParse({ categories: [category(), category({ id: "22222222-2222-4222-8222-222222222222" })] }).success).toBe(true);
    expect(categoryListSchema.safeParse({ categories: [] }).success).toBe(true);
    expect(categoryWriteResponseSchema.safeParse({ category: mutationResponse() }).success).toBe(true);
  });
});

describe("pickableCategories", () => {
  const active = { id: ID, name: "Groceries", archived: false };
  const alsoActive = { id: OTHER, name: "Transport", archived: false };
  const archived = { id: GONE, name: "Old habit", archived: true };
  const all = [active, alsoActive, archived];

  it("offers only active categories when nothing is assigned", () => {
    expect(pickableCategories(all, null).map((c) => c.id)).toEqual([ID, OTHER]);
  });

  it("treats an empty string as 'nothing assigned', because that is what a select's blank value is", () => {
    // `CorrectionForm` holds `inForce.category_id ?? ""`, so the unassigned case reaches here as
    // "" rather than null. Reading it as an id would search for a category whose id is empty,
    // find none, and silently behave as if the row were assigned to something missing.
    expect(pickableCategories(all, "").map((c) => c.id)).toEqual([ID, OTHER]);
  });

  it("does not duplicate an assignment that is already active", () => {
    expect(pickableCategories(all, ID).map((c) => c.id)).toEqual([ID, OTHER]);
  });

  /**
   * The defect this function exists to prevent, stated as a test: an archived category that a
   * record is still assigned to must stay in the list. Dropped, the select's `value` matches no
   * option, the browser paints it blank while the stored id is untouched, and the owner
   * "correcting" the blank erases a real assignment.
   */
  it("keeps an assigned category that has since been archived", () => {
    expect(pickableCategories(all, GONE).map((c) => c.id)).toEqual([ID, OTHER, GONE]);
  });

  it("falls back to the active list when the assigned id is not in the list at all", () => {
    expect(pickableCategories(all, "44444444-4444-4444-8444-444444444444").map((c) => c.id)).toEqual([ID, OTHER]);
  });
});
