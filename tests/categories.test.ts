import { describe, expect, it } from "vitest";
import { categoryListSchema, categorySchema, categoryWriteResponseSchema } from "@/lib/categories";

const ID = "11111111-1111-4111-8111-111111111111";

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
