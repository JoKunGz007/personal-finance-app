import { describe, expect, it } from "vitest";
import { decideCategories, normaliseDescription, type CategoryInput, type CategoryNode } from "@/lib/server/auto-categorise";
import { heldRows, type CurrentMatch } from "@/lib/server/current-matches";
import type { CategoryRule } from "@/lib/category-rules";

// The pure decision of the auto-categoriser (D-245): precedence, history, fallback and skips.
// Every id, name and description is invented.
const id = (n: number) => `dddddddd-0000-4000-8000-${String(n).padStart(12, "0")}`;
const cat = (n: number) => `cafecafe-0000-4000-8000-${String(n).padStart(12, "0")}`;

const categories: CategoryNode[] = [
  { id: cat(1), name: "Own Transfers", archived: false, parent_id: null },
  { id: cat(2), name: "Transport", archived: false, parent_id: null },
  { id: cat(3), name: "Ride-hailing", archived: false, parent_id: cat(2) },
  { id: cat(4), name: "Food & Drinks", archived: false, parent_id: null },
  // Food & Drinks has no "Delivery" child: a delivery falls back to the parent.
  { id: cat(5), name: "Groceries & Convenience", archived: false, parent_id: null },
  { id: cat(6), name: "Convenience Store", archived: false, parent_id: cat(5) },
  { id: cat(7), name: "Invented Owner Pick", archived: false, parent_id: null },
  { id: cat(8), name: "Invented Other Pick", archived: false, parent_id: null },
  { id: cat(9), name: "Cash", archived: true, parent_id: null }
];

function row(n: number, overrides: Partial<CategoryInput> = {}): CategoryInput {
  return {
    id: id(n), amount_minor: "-10000", description: `INVENTED SHOP ${n}`, transaction_label: "Card payment",
    include_in_reporting: true, category_id: null, source: null, reviewed: false, ...overrides
  };
}

const rules: CategoryRule[] = [
  { id: "invented-ride-word", direction: "out", match: /INVENTED RIDE/i, category: "Transport › Ride-hailing" },
  { id: "invented-missing-parent", direction: "out", match: /NOWHERE/i, category: "Invented Missing › Child" },
  { id: "invented-archived", direction: "out", match: /CASHPOINT/i, category: "Cash" },
  { id: "invented-in", direction: "in", match: /INVENTED SHOP/i, category: "Invented Other Pick" }
];

const decide = (rows: CategoryInput[], matches: CurrentMatch[] = [], excluded: ReadonlySet<string> = new Set()) =>
  decideCategories(rows, categories, matches, excluded, rules);

describe("decideCategories precedence", () => {
  it("own transfer beats a match, a match beats history and rules", () => {
    const matches: CurrentMatch[] = [
      { transaction_id: id(1), kind: "ride", entity_id: id(901) },
      { transaction_id: id(2), kind: "ride", entity_id: id(902) }
    ];
    const rows = [
      row(1, { include_in_reporting: false, description: "INVENTED RIDE" }),
      row(2, { description: "INVENTED RIDE" }),
      row(3, { description: "INVENTED RIDE" })
    ];
    expect(decide(rows, matches, new Set([id(1)])).proposals).toEqual([
      { transaction_id: id(1), category_id: cat(1), source: "match", detail: { rule: "own-transfer" } },
      { transaction_id: id(2), category_id: cat(3), source: "match", detail: { kind: "ride", entity_id: id(902) } },
      { transaction_id: id(3), category_id: cat(3), source: "rule", detail: { rule: "invented-ride-word" } }
    ]);
  });

  it("a row the owner excluded by hand is no own transfer and falls through to the later steps", () => {
    const rows = [row(1, { include_in_reporting: false, description: "INVENTED RIDE" })];
    expect(decide(rows).proposals).toEqual([
      { transaction_id: id(1), category_id: cat(3), source: "rule", detail: { rule: "invented-ride-word" } }
    ]);
  });

  it("maps each match kind, a missing child falling back to its parent", () => {
    const matches: CurrentMatch[] = [
      { transaction_id: id(1), kind: "delivery", platform: "lineman", entity_id: id(901) },
      { transaction_id: id(2), kind: "receipt", entity_id: id(902) }
    ];
    expect(decide([row(1), row(2)], matches).proposals.map((p) => [p.category_id, p.detail])).toEqual([
      [cat(4), { kind: "delivery", entity_id: id(901) }],
      [cat(6), { kind: "receipt", entity_id: id(902) }]
    ]);
  });

  it("resolves a delivery by its service, a missing child falling back to the parent and a missing parent proposing nothing", () => {
    const tree: CategoryNode[] = [
      ...categories,
      { id: cat(20), name: "Dining Out", archived: false, parent_id: cat(4) },
      { id: cat(21), name: "Grocery Delivery", archived: false, parent_id: cat(5) }
      // no "Services" parent at all
    ];
    const at = (n: number, service?: "food" | "mart" | "express" | "dine_out"): CurrentMatch =>
      ({ transaction_id: id(n), kind: "delivery", platform: "grabfood", ...(service ? { service } : {}), entity_id: id(900 + n) });
    const result = decideCategories(
      [row(1), row(2), row(3), row(4), row(5)],
      tree,
      [at(1), at(2, "food"), at(3, "dine_out"), at(4, "mart"), at(5, "express")],
      new Set()
    );
    expect(result.proposals.map((p) => [p.transaction_id, p.category_id])).toEqual([
      [id(1), cat(4)], [id(2), cat(4)], [id(3), cat(20)], [id(4), cat(21)]
    ]);
    expect(result.unresolved).toBe(1);
    // With the mart child absent it falls back to Groceries & Convenience.
    const noChild = decideCategories([row(4)], categories, [at(4, "mart")], new Set());
    expect(noChild.proposals.map((p) => p.category_id)).toEqual([cat(5)]);
  });

  it("history beats a keyword rule", () => {
    const rows = [
      row(1, { description: "INVENTED RIDE 0001", category_id: cat(7), source: "owner" }),
      row(2, { description: "invented   ride 0002" })
    ];
    expect(decide(rows).proposals).toEqual([
      { transaction_id: id(2), category_id: cat(7), source: "rule", detail: { rule: "history" } }
    ]);
  });
});

describe("decideCategories history", () => {
  it("counts owner, reviewed and legacy rows that agree", () => {
    const rows = [
      row(1, { description: "INVENTED CAFE 11", category_id: cat(7), source: "owner" }),
      row(2, { description: "INVENTED CAFE 22", category_id: cat(7), source: "rule", reviewed: true }),
      row(3, { description: "INVENTED CAFE 33", category_id: cat(7), source: null }),
      row(4, { description: "INVENTED CAFE 44" })
    ];
    expect(decide(rows).proposals).toEqual([
      { transaction_id: id(4), category_id: cat(7), source: "rule", detail: { rule: "history" } }
    ]);
  });

  it("gives no answer when settled rows disagree, and ignores unreviewed machine rows", () => {
    const disagree = [
      row(1, { description: "INVENTED CAFE 1", category_id: cat(7), source: "owner" }),
      row(2, { description: "INVENTED CAFE 2", category_id: cat(8), source: "owner" }),
      row(3, { description: "INVENTED CAFE 3" })
    ];
    expect(decide(disagree).proposals).toEqual([]);
    const machine = [row(1, { description: "INVENTED CAFE 1", category_id: cat(7), source: "rule" }), row(2, { description: "INVENTED CAFE 2" })];
    expect(decide(machine).proposals).toEqual([]);
  });

  it("a short generic description never keys a match", () => {
    const rows = [row(1, { description: "TR fr 0001", category_id: cat(7), source: "owner" }), row(2, { description: "TR fr 0002" })];
    expect(decide(rows).proposals).toEqual([]);
  });

  it("history needs the same direction", () => {
    const rows = [
      row(1, { description: "INVENTED CAFE 1", amount_minor: "5000", category_id: cat(7), source: "owner" }),
      row(2, { description: "INVENTED CAFE 2", amount_minor: "-5000" })
    ];
    expect(decide(rows).proposals).toEqual([]);
  });

  it("an owner-cleared row (owner, no category) is no history", () => {
    const rows = [row(1, { description: "INVENTED CAFE 1", source: "owner" }), row(2, { description: "INVENTED CAFE 2" })];
    expect(decide(rows).proposals).toEqual([]);
  });

  it("normalises digits, whitespace and case", () => {
    expect(normaliseDescription("  Invented  SHOP 0042\tREF 9 ")).toBe("invented shop ref");
  });
});

describe("decideCategories resolution and skips", () => {
  it("a parent that does not exist, or is archived, is unresolved", () => {
    const decision = decide([row(1, { description: "NOWHERE" }), row(2, { description: "CASHPOINT" })]);
    expect(decision).toEqual({ proposals: [], unresolved: 2 });
  });

  it("an own transfer with no Own Transfers category is unresolved", () => {
    const decision = decideCategories([row(1, { include_in_reporting: false })], categories.slice(1), [], new Set([id(1)]), rules);
    expect(decision).toEqual({ proposals: [], unresolved: 1 });
  });

  it("skips owner, reviewed and legacy rows, and a row already in the proposed category", () => {
    const matches: CurrentMatch[] = [1, 2, 3, 4, 5].map((n) => ({ transaction_id: id(n), kind: "ride" as const, entity_id: id(900 + n) }));
    const rows = [
      row(1, { source: "owner", category_id: null }),
      row(2, { source: "match", category_id: cat(8), reviewed: true }),
      row(3, { source: null, category_id: cat(8) }),
      row(4, { source: "match", category_id: cat(3) }),
      row(5, { source: "rule", category_id: cat(8) })
    ];
    expect(decide(rows, matches).proposals).toEqual([
      { transaction_id: id(5), category_id: cat(3), source: "match", detail: { kind: "ride", entity_id: id(905) } }
    ]);
  });

  it("applies a rule's direction to the signed amount", () => {
    expect(decide([row(1, { amount_minor: "10000" }), row(2)]).proposals.map((p) => p.transaction_id)).toEqual([id(1)]);
  });

  it("proposes nothing for a row no step fits", () => {
    expect(decide([row(1)])).toEqual({ proposals: [], unresolved: 0 });
  });
});

describe("heldRows", () => {
  const ledgerRow = (n: number) => ({
    transaction_id: id(n), source_date: "2026-09-01", source_time: null, transaction_label: "Card payment",
    description: "INVENTED", lag_minutes: 0
  });

  it("holds both rows of a split ride, the owner's linked row, and nothing for other states", () => {
    expect(heldRows({ status: "matched", row: ledgerRow(1), also: [ledgerRow(2)], options: [], revision: 0 }, undefined)).toEqual([id(1), id(2)]);
    expect(heldRows({ status: "linked", row: null, options: [], revision: 1 }, id(3))).toEqual([id(3)]);
    expect(heldRows({ status: "ambiguous", row: null, options: [ledgerRow(4)], revision: 0 }, undefined)).toEqual([]);
    expect(heldRows({ status: "declined", row: null, options: [], revision: 1 }, undefined)).toEqual([]);
    expect(heldRows({ status: "outside", row: null, options: [], revision: 0 }, undefined)).toEqual([]);
  });
});
