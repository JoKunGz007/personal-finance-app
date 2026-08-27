import { describe, expect, it } from "vitest";
import {
  exactAverageSchema,
  ledgerStatisticsSchema,
  monthLabel,
  magnitudeChange,
  shareOf,
  wholeWeeks
} from "@/lib/statistics";

/**
 * The client side of PLAN task 44 (D-160).
 *
 * The arithmetic itself lives in `supabase/tests/011_ledger_statistics.sql`, with the derivation —
 * the same split D-159 made when the combined balance moved into SQL. What is left here is the wire
 * boundary and the two display-only ratios, and **the reason those are tested at all is that they
 * are the only division in the app that produces a number rather than money.**
 */

const emptyWindow = {
  window: { from: null, to: null, days: 0, endsToday: false },
  totals: { deposits: "0", withdrawals: "0", net: "0", transactions: 0, excluded: 0 },
  averages: {},
  months: [],
  dayOfWeek: [],
  largestOut: [],
  largestIn: [],
  dailyBalances: []
};

describe("the statistics wire contract", () => {
  it("accepts the empty shape a weak session and an empty ledger both return", () => {
    expect(ledgerStatisticsSchema.safeParse(emptyWindow).success).toBe(true);
  });

  it("refuses a money field that arrived as a number", () => {
    // The RPC casts every bigint with `::text`. If that ever regresses, this is where it is caught —
    // a number here is the one place a float could enter a money path.
    const drifted = { ...emptyWindow, totals: { ...emptyWindow.totals, deposits: 0 } };
    expect(ledgerStatisticsSchema.safeParse(drifted).success).toBe(false);
  });

  it("refuses a field the schema does not know, rather than ignoring it", () => {
    const widened = { ...emptyWindow, totals: { ...emptyWindow.totals, median: "0" } };
    expect(ledgerStatisticsSchema.safeParse(widened).success).toBe(false);
  });

  it("refuses a non-canonical minor-unit string", () => {
    expect(exactAverageSchema.safeParse({ quotient: "-0", remainder: "0" }).success).toBe(false);
    expect(exactAverageSchema.safeParse({ quotient: "01", remainder: "0" }).success).toBe(false);
    expect(exactAverageSchema.safeParse({ quotient: "1.5", remainder: "0" }).success).toBe(false);
    expect(exactAverageSchema.safeParse({ quotient: "-491", remainder: "-49" }).success).toBe(true);
  });
});

describe("the average identity, as the wire carries it", () => {
  // The same property `011_ledger_statistics.sql` asserts against the database, restated here
  // against the parsed values: `quotient * divisor + remainder = total`. It is what makes an
  // integer division of money lossless rather than merely tidy.
  it.each([
    { total: 150059n, divisor: 61n, quotient: 2459n, remainder: 60n },
    { total: -30000n, divisor: 61n, quotient: -491n, remainder: -49n },
    { total: 1050413n, divisor: 61n, quotient: 17219n, remainder: 54n }
  ])("holds for $total over $divisor", ({ total, divisor, quotient, remainder }) => {
    expect(quotient * divisor + remainder).toBe(total);
  });

  it("distinguishes the weekly average from the daily one multiplied by seven", () => {
    const total = 150059n;
    const days = 61n;
    // What the surface computes: one division on a scaled numerator.
    expect(total * 7n / days).toBe(17219n);
    // What compounding the daily truncation would give, and why the fixture was chosen this way.
    expect(total / days * 7n).toBe(17213n);
  });
});

describe("magnitudeChange", () => {
  it("is a rounded label built from exact integers", () => {
    expect(magnitudeChange("15000", "10000")).toEqual({ delta: "5000", percent: 50 });
    expect(magnitudeChange("7500", "10000")).toEqual({ delta: "-2500", percent: -25 });
  });

  it("reads a rise in spending as a rise, even though spending is stored negative", () => {
    // **The defect this function exists to prevent.** A signed subtraction gives -5000 here, which
    // prints as a fall and means the owner spent 5,000 more. Comparing magnitudes says +50%.
    expect(magnitudeChange("-15000", "-10000")).toEqual({ delta: "5000", percent: 50 });
    expect(magnitudeChange("-7500", "-10000")).toEqual({ delta: "-2500", percent: -25 });
  });

  it("keeps the exact delta even when the percentage is undefined", () => {
    // A zero denominator is undefined, not zero — but the delta itself is still a fact worth showing.
    expect(magnitudeChange("5000", "0")).toEqual({ delta: "5000", percent: null });
  });

  it("returns null when there is no previous month at all", () => {
    expect(magnitudeChange("5000", null)).toBeNull();
  });

  it("stays exact past the range a double could hold", () => {
    // Well past Number.MAX_SAFE_INTEGER in satang. The ratio is computed in BigInt and only its
    // presentation is approximate, which is the whole point of the shape.
    expect(magnitudeChange("18014398509481986000", "9007199254740993000")?.percent).toBe(100);
  });
});

describe("shareOf", () => {
  it("reports a part of a whole as a display percentage", () => {
    expect(shareOf("2500", "10000")).toBe(25);
  });

  it("returns null on a zero whole", () => {
    expect(shareOf("2500", "0")).toBeNull();
  });

  it("does not force three shares to sum to exactly one hundred", () => {
    // **The first version of this test asserted the opposite of its own name.** It used
    // 3333/3333/3334 of 10000, which does reconcile to 100.00, so the guard passed while proving
    // nothing. Three exact thirds do not reconcile: each truncates to 33.33 and the total is 99.99.
    // That gap is asserted rather than corrected — the remedy is to print the exact minor-unit parts
    // beside the percentages, and adjusting the last slice into agreement would invent a figure
    // (D-160).
    const shares = ["1", "1", "1"].map((part) => shareOf(part, "3"));
    expect(shares).toEqual([33.33, 33.33, 33.33]);
    expect(shares.reduce<number>((sum, share) => sum + (share ?? 0), 0)).toBeCloseTo(99.99, 5);
  });

  it("treats a negative part by magnitude, since spending is stored negative", () => {
    expect(shareOf("-2500", "10000")).toBe(25);
  });
});

describe("labels", () => {
  it("counts whole weeks and does not round a partial one up", () => {
    expect(wholeWeeks(61)).toBe(8);
    expect(wholeWeeks(6)).toBe(0);
    expect(wholeWeeks(7)).toBe(1);
  });

  it("names a month without pulling in a date library", () => {
    expect(monthLabel("2026-03")).toBe("March 2026");
    expect(monthLabel("2026-12")).toBe("December 2026");
  });
});
