import { describe, expect, it } from "vitest";
import { movedRowIndexes, pageCountOf, statementTotals } from "@/lib/import-review";
import type { SourceRowCandidate } from "@/lib/statement";

// Every value invented.
type Part = [kind: "deposit" | "withdrawal", minor: string];
const row = (page: number, line: number, ...parts: Part[]) => ({
  provenance: { page, row: line },
  components: parts.map(([kind, minor]) => ({ kind, amount: { minor, currency: "THB" } }))
}) as unknown as SourceRowCandidate;

describe("statementTotals", () => {
  it("sums deposits, withdrawals and the net exactly, past the float-safe range", () => {
    const totals = statementTotals([
      row(1, 1, ["deposit", "9007199254740993"]),
      row(1, 2, ["withdrawal", "-9007199254740992"]),
      row(2, 1, ["deposit", "5"], ["withdrawal", "-2"])
    ]);
    expect(totals).toEqual({ deposits: "9007199254740998", withdrawals: "-9007199254740994", net: "4" });
  });
  it("is zero for no components", () => {
    expect(statementTotals([])).toEqual({ deposits: "0", withdrawals: "0", net: "0" });
  });
});

describe("movedRowIndexes", () => {
  it("marks a row printed earlier than the row above it", () => {
    const rows = [row(1, 1), row(1, 3), row(1, 2), row(2, 1), row(1, 9)];
    expect([...movedRowIndexes(rows)]).toEqual([2, 4]);
  });
  it("marks nothing for an in-order run", () => {
    expect(movedRowIndexes([row(1, 1), row(1, 2), row(2, 1), row(2, 1)]).size).toBe(0);
  });
});

describe("pageCountOf", () => {
  it("is the highest page any row came from", () => {
    expect(pageCountOf([row(1, 1), row(3, 1), row(2, 4)])).toBe(3);
  });
  it("is at least one", () => {
    expect(pageCountOf([])).toBe(1);
  });
});
