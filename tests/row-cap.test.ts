import { describe, expect, it } from "vitest";
import { isComplete } from "@/lib/server/row-cap";

// PostgREST's max_rows = 1000 cuts a plain select silently; the exact count is the only witness.
// Every value is invented.
describe("isComplete", () => {
  it("accepts a read whose rows match the exact count", () => {
    expect(isComplete({ data: [{}, {}, {}], count: 3 })).toBe(true);
  });

  it("refuses a read cut at the row cap (1000 of 1181)", () => {
    expect(isComplete({ data: Array.from({ length: 1000 }, () => ({})), count: 1181 })).toBe(false);
  });

  it("refuses a read that arrived without a count", () => {
    expect(isComplete({ data: [{}], count: null })).toBe(false);
  });

  it("accepts an empty table, where null data and a count of 0 agree", () => {
    expect(isComplete({ data: null, count: 0 })).toBe(true);
  });

  it("refuses null data when the count says rows exist", () => {
    expect(isComplete({ data: null, count: 5 })).toBe(false);
  });
});
