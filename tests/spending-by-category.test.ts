import { describe, expect, it } from "vitest";
import {
  groupSpendingByParent,
  spendingByCategorySchema,
  statisticsWindowSchema,
  type SpendingByCategory
} from "@/lib/statistics";

const FOOD = "cafecafe-0000-4000-8000-000000000001";
const COFFEE = "cafecafe-0000-4000-8000-000000000002";
const TRAVEL = "cafecafe-0000-4000-8000-000000000003";
const BAKERY = "cafecafe-0000-4000-8000-000000000004";

const row = (over: Partial<SpendingByCategory["categories"][number]>) => ({
  categoryId: null, name: null, archived: false, parentId: null, parentName: null,
  spendingMinor: "100", transactionCount: 1, ...over
});

describe("spendingByCategorySchema", () => {
  const valid = {
    from: "2026-03-01", to: "2026-04-30", spendingMinor: "100",
    categories: [row({ categoryId: FOOD, name: "Invented Food" })]
  };

  it("accepts the RPC shape, including the uncategorised bucket and an empty list", () => {
    expect(spendingByCategorySchema.parse(valid).categories).toHaveLength(1);
    expect(spendingByCategorySchema.parse({ ...valid, categories: [row({})] }).categories[0]?.categoryId).toBeNull();
    expect(spendingByCategorySchema.parse({ from: null, to: null, spendingMinor: "0", categories: [] }).categories).toEqual([]);
  });

  it("is strict at both levels", () => {
    expect(spendingByCategorySchema.safeParse({ ...valid, extra: 1 }).success).toBe(false);
    expect(spendingByCategorySchema.safeParse({ ...valid, categories: [{ ...valid.categories[0], extra: 1 }] }).success).toBe(false);
  });

  it("rejects non-canonical money and numeric money", () => {
    for (const bad of ["1.5", "01", "-0", "", 100, "9223372036854775808"]) {
      expect(spendingByCategorySchema.safeParse({ ...valid, spendingMinor: bad }).success).toBe(false);
      expect(spendingByCategorySchema.safeParse({ ...valid, categories: [row({ spendingMinor: bad as string })] }).success).toBe(false);
    }
  });

  it("rejects a malformed id", () => {
    expect(spendingByCategorySchema.safeParse({ ...valid, categories: [row({ categoryId: "nope" })] }).success).toBe(false);
  });
});

describe("statisticsWindowSchema", () => {
  it("refuses a transposed window and a bad account", () => {
    expect(statisticsWindowSchema.safeParse({ from: "2026-05-01", to: "2026-04-01", account: null }).success).toBe(false);
    expect(statisticsWindowSchema.safeParse({ from: null, to: null, account: "x" }).success).toBe(false);
    expect(statisticsWindowSchema.safeParse({ from: null, to: null, account: null }).success).toBe(true);
  });
});

describe("groupSpendingByParent", () => {
  const data: SpendingByCategory = {
    from: null, to: null, spendingMinor: "1000",
    categories: [
      row({ categoryId: FOOD, name: "Invented Food", spendingMinor: "340", transactionCount: 2 }),
      row({ categoryId: COFFEE, name: "Invented Coffee", archived: true, parentId: FOOD, parentName: "Invented Food", spendingMinor: "200", transactionCount: 3 }),
      row({ categoryId: TRAVEL, name: "Invented Travel", spendingMinor: "250", transactionCount: 1 }),
      row({ spendingMinor: "210", transactionCount: 4 })
    ]
  };

  it("rolls a parent, its child and its own rows into one group, sorted by spending", () => {
    const groups = groupSpendingByParent(data);
    expect(groups.map((g) => [g.label, g.spendingMinor, g.transactionCount])).toEqual([
      ["Invented Food", "540", 5],
      ["Invented Travel", "250", 1],
      [ "Uncategorised", "210", 4]
    ]);
    const food = groups[0];
    expect(food?.children.map((c) => [c.label, c.spendingMinor, c.isParentOwn, c.archived])).toEqual([
      ["Invented Food", "340", true, false],
      ["Invented Coffee", "200", false, true]
    ]);
    expect(food?.children[0]?.share).toEqual({ numerator: "340", denominator: "540" });
  });

  it("keeps a standalone category and the uncategorised bucket as childless groups", () => {
    const groups = groupSpendingByParent(data);
    expect(groups[1]?.children).toEqual([]);
    expect(groups[2]?.key).toBe("uncategorised");
    expect(groups[2]?.children).toEqual([]);
  });

  it("shares are exact numerator/denominator against the whole figure", () => {
    expect(groupSpendingByParent(data).map((g) => g.share)).toEqual([
      { numerator: "540", denominator: "1000" },
      { numerator: "250", denominator: "1000" },
      { numerator: "210", denominator: "1000" }
    ]);
  });

  it("makes a parent with only children a group labelled by the parent, with no own child", () => {
    const groups = groupSpendingByParent({
      from: null, to: null, spendingMinor: "300",
      categories: [
        row({ categoryId: COFFEE, name: "Invented Coffee", parentId: FOOD, parentName: "Invented Food", spendingMinor: "100" }),
        row({ categoryId: BAKERY, name: "Invented Bakery", parentId: FOOD, parentName: "Invented Food", spendingMinor: "200" })
      ]
    });
    expect(groups).toHaveLength(1);
    expect(groups[0]?.label).toBe("Invented Food");
    expect(groups[0]?.children.map((c) => [c.label, c.isParentOwn])).toEqual([
      ["Invented Bakery", false], ["Invented Coffee", false]
    ]);
  });

  it("sums past 2^53 exactly with BigInt", () => {
    const big = (2n ** 53n + 1n).toString();
    const groups = groupSpendingByParent({
      from: null, to: null, spendingMinor: (2n * (2n ** 53n + 1n)).toString(),
      categories: [
        row({ categoryId: FOOD, name: "Invented Food", spendingMinor: big }),
        row({ categoryId: COFFEE, name: "Invented Coffee", parentId: FOOD, parentName: "Invented Food", spendingMinor: big })
      ]
    });
    expect(groups[0]?.spendingMinor).toBe((2n * (2n ** 53n + 1n)).toString());
    expect(groups[0]?.share.numerator).toBe(groups[0]?.share.denominator);
  });

  it("returns no groups for no categories", () => {
    expect(groupSpendingByParent({ from: null, to: null, spendingMinor: "0", categories: [] })).toEqual([]);
  });
});
