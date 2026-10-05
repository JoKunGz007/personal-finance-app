import { describe, expect, it } from "vitest";
import { categoryLabel, nestedCategories, pickableCategories, type Category } from "@/lib/categories";
import { isMachineCategory, ledgerTransactionSchema } from "@/lib/transactions";

// Subcategory labels and order (D-245), the "auto" marker's rule, and the ledger row's new fields.
const FOOD: Category = { id: "cafecafe-0000-4000-8000-000000000401", name: "Food & Drinks", archived: false, parent_id: null };
const DELIVERY: Category = { id: "cafecafe-0000-4000-8000-000000000402", name: "Delivery", archived: false, parent_id: FOOD.id };
const DINING: Category = { id: "cafecafe-0000-4000-8000-000000000403", name: "Dining Out", archived: false, parent_id: FOOD.id };
const CASH: Category = { id: "cafecafe-0000-4000-8000-000000000404", name: "Cash", archived: false, parent_id: null };
const OLD: Category = { id: "cafecafe-0000-4000-8000-000000000405", name: "Old", archived: true, parent_id: FOOD.id };

describe("categoryLabel / nestedCategories", () => {
  it("labels a subcategory Parent › Child and a top-level one by its name", () => {
    expect(categoryLabel(DELIVERY, [FOOD, DELIVERY])).toBe("Food & Drinks › Delivery");
    expect(categoryLabel(FOOD, [FOOD, DELIVERY])).toBe("Food & Drinks");
  });

  it("puts each subcategory right under its parent, both by name", () => {
    expect(nestedCategories([DINING, FOOD, DELIVERY, CASH]).map((c) => c.name)).toEqual(["Cash", "Food & Drinks", "Delivery", "Dining Out"]);
  });

  it("keeps an assigned archived subcategory in the picker (D-190)", () => {
    expect(nestedCategories(pickableCategories([FOOD, DELIVERY, OLD], OLD.id)).map((c) => c.id)).toEqual([FOOD.id, DELIVERY.id, OLD.id]);
    expect(nestedCategories(pickableCategories([FOOD, DELIVERY, OLD], null)).map((c) => c.id)).toEqual([FOOD.id, DELIVERY.id]);
  });
});

describe("isMachineCategory", () => {
  it("is true only for an unreviewed rule, match or model source", () => {
    expect(isMachineCategory({ category_source: "rule", category_reviewed: false })).toBe(true);
    expect(isMachineCategory({ category_source: "match", category_reviewed: false })).toBe(true);
    expect(isMachineCategory({ category_source: "match", category_reviewed: true })).toBe(false);
    expect(isMachineCategory({ category_source: "owner", category_reviewed: false })).toBe(false);
    expect(isMachineCategory({ category_source: null, category_reviewed: false })).toBe(false);
  });
});

describe("ledgerTransactionSchema: category provenance fields (migration 048)", () => {
  const base = {
    id: "11111111-1111-4111-8111-111111111111", source_date: "2026-06-01", source_time: null, effective_date: "2026-06-01",
    transaction_label: "Invented label", description: "Invented description", reference: null, branch: null,
    post_balance_minor: "100000", currency: "THB", source_components: [], transaction_overlays: [],
    category_source: "match", category_source_revision: 2, category_reviewed: false, category_parent_name: "Food & Drinks"
  };

  it("accepts the four fields, null where nothing is known", () => {
    expect(ledgerTransactionSchema.safeParse(base).success).toBe(true);
    expect(ledgerTransactionSchema.safeParse({ ...base, category_source: null, category_source_revision: null, category_parent_name: null }).success).toBe(true);
  });

  it("refuses a row missing one, an unknown source or an extra field", () => {
    const missing: Record<string, unknown> = { ...base };
    delete missing.category_reviewed;
    expect(ledgerTransactionSchema.safeParse(missing).success).toBe(false);
    expect(ledgerTransactionSchema.safeParse({ ...base, category_source: "guess" }).success).toBe(false);
    expect(ledgerTransactionSchema.safeParse({ ...base, category_parent_id: null }).success).toBe(false);
  });
});
