import { describe, expect, it } from "vitest";
import { appendRange, isUsableRange, OPEN_RANGE, rangeFromSearch, rangeSearch, type DateRange } from "@/lib/date-range";

/**
 * The one spelling `/statistics` and `/ledger` both build their query strings from
 * (`lib/date-range.ts`'s own header) — directly tested here rather than only indirectly through
 * `lib/statistics.ts`'s round trips, since `app/api/v1/accounts/[id]/transactions/route.ts` and
 * `app/api/v1/statistics/route.ts` both now refuse a transposed range through `isUsableRange`
 * itself (found duplicated by `/code-review high`, PLAN task 47).
 */
describe("appendRange", () => {
  it("writes both ends when both are set", () => {
    const params = new URLSearchParams();
    appendRange(params, { from: "2026-01-01", to: "2026-01-31" });
    expect(params.toString()).toBe("from=2026-01-01&to=2026-01-31");
  });

  it("omits an open end rather than sending it blank", () => {
    // A blank parameter and an absent one are different to every route's schema — `searchParams.get`
    // yields `null` when absent and `""` when present and empty, and `""` fails the date pattern.
    const fromOnly = new URLSearchParams();
    appendRange(fromOnly, { from: "2026-01-01", to: null });
    expect(fromOnly.toString()).toBe("from=2026-01-01");

    const toOnly = new URLSearchParams();
    appendRange(toOnly, { from: null, to: "2026-01-31" });
    expect(toOnly.toString()).toBe("to=2026-01-31");

    const neither = new URLSearchParams();
    appendRange(neither, OPEN_RANGE);
    expect(neither.toString()).toBe("");
  });

  it("adds to parameters a caller already holds, rather than replacing them", () => {
    const params = new URLSearchParams({ account: "11111111-2222-4333-8444-555555555555" });
    appendRange(params, { from: "2026-01-01", to: null });
    expect(params.toString()).toBe("account=11111111-2222-4333-8444-555555555555&from=2026-01-01");
  });
});

describe("rangeSearch", () => {
  it("is empty for the open range, and a leading '?' for anything narrower", () => {
    expect(rangeSearch(OPEN_RANGE)).toBe("");
    expect(rangeSearch({ from: "2026-01-01", to: "2026-01-31" })).toBe("?from=2026-01-01&to=2026-01-31");
    expect(rangeSearch({ from: null, to: "2026-01-31" })).toBe("?to=2026-01-31");
  });
});

describe("rangeFromSearch", () => {
  it("is the inverse of rangeSearch for every range rangeSearch can produce", () => {
    const ranges: DateRange[] = [
      OPEN_RANGE,
      { from: "2026-01-01", to: "2026-01-31" },
      { from: "2026-01-01", to: null },
      { from: null, to: "2026-01-31" }
    ];
    for (const range of ranges) {
      expect(rangeFromSearch(rangeSearch(range)), JSON.stringify(range)).toEqual(range);
    }
  });

  it("is total: an empty parameter reads as an open end, not as the empty string", () => {
    // The same equivalence `appendRange` writes in the other direction — `?from=` is what a
    // hand-cleared form field produces, and it must not become a `from: ""` no schema accepts.
    expect(rangeFromSearch("?from=&to=2026-01-31")).toEqual({ from: null, to: "2026-01-31" });
    expect(rangeFromSearch("")).toEqual(OPEN_RANGE);
    expect(rangeFromSearch("?unrelated=1")).toEqual(OPEN_RANGE);
  });

  it("returns the dates as written, unvalidated — isUsableRange is the refusal, not this", () => {
    // A transposed pair round-trips rather than being corrected or thrown on: validating here as
    // well would put the rule in two places and let them disagree (the module's own header).
    expect(rangeFromSearch("?from=2026-01-31&to=2026-01-01")).toEqual({ from: "2026-01-31", to: "2026-01-01" });
  });
});

describe("isUsableRange", () => {
  it("accepts an open range, a half-open range in either direction, and an ordered pair", () => {
    expect(isUsableRange(OPEN_RANGE)).toBe(true);
    expect(isUsableRange({ from: "2026-01-01", to: null })).toBe(true);
    expect(isUsableRange({ from: null, to: "2026-01-31" })).toBe(true);
    expect(isUsableRange({ from: "2026-01-01", to: "2026-01-31" })).toBe(true);
    // Equal is ordered, not transposed — a one-day window is a real window.
    expect(isUsableRange({ from: "2026-01-15", to: "2026-01-15" })).toBe(true);
  });

  it("refuses only a present, transposed pair — the one shape the database also refuses", () => {
    expect(isUsableRange({ from: "2026-01-31", to: "2026-01-01" })).toBe(false);
  });
});
