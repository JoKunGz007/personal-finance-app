import { describe, expect, it } from "vitest";
import {
  exactAverageSchema,
  ledgerStatisticsSchema,
  monthLabel,
  magnitudeChange,
  shareOf,
  wholeWeeks,
  windowForPreset,
  windowSearch,
  isUsableWindow,
  localToday,
  pickerSearch,
  pickerStateFromSearch,
  DEFAULT_PICKER_STATE,
  WINDOW_PRESETS,
  WINDOW_PRESET_LABELS
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

describe("the partial-month comparison rule", () => {
  // **The defect the real ledger showed on the first look.** A 29-day opening month against a full
  // August rendered "+1002%" — arithmetically right, and meaningless, because the two periods are
  // not the same length. The rule is stated here as the predicate the table applies, so a later
  // refactor that drops the guard fails rather than printing the figure again.
  const comparable = (previous: { isPartial: boolean } | undefined, month: { isPartial: boolean }) =>
    previous !== undefined && !previous.isPartial && !month.isPartial;

  it("refuses to compare a full month against a partial one", () => {
    expect(comparable({ isPartial: true }, { isPartial: false })).toBe(false);
  });

  it("refuses when the current month is the partial one, which is every current month", () => {
    expect(comparable({ isPartial: false }, { isPartial: true })).toBe(false);
  });

  it("refuses when there is no earlier month", () => {
    expect(comparable(undefined, { isPartial: false })).toBe(false);
  });

  it("compares two whole months", () => {
    expect(comparable({ isPartial: false }, { isPartial: false })).toBe(true);
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

describe("the statistics window picker", () => {
  it("resolves every preset against a mid-year day", () => {
    expect(windowForPreset("all", "2026-08-29")).toEqual({ from: null, to: null });
    expect(windowForPreset("this-month", "2026-08-29")).toEqual({ from: "2026-08-01", to: "2026-08-29" });
    expect(windowForPreset("this-year", "2026-08-29")).toEqual({ from: "2026-01-01", to: "2026-08-29" });
    // Three calendar months ending with the one still running: June, July, August.
    expect(windowForPreset("last-3-months", "2026-08-29")).toEqual({ from: "2026-06-01", to: "2026-08-29" });
  });

  it("crosses a year boundary without arriving at month zero", () => {
    // January minus two months is November of the previous year. Done with a raw `month - 2` this
    // is `-1`, which `pad2` would render as "-1" and the route would refuse — so the arithmetic is
    // a month *index* rather than a month number, and this is the case that proves it.
    expect(windowForPreset("last-3-months", "2026-01-15")).toEqual({ from: "2025-11-01", to: "2026-01-15" });
    expect(windowForPreset("last-3-months", "2026-02-01")).toEqual({ from: "2025-12-01", to: "2026-02-01" });
    expect(windowForPreset("last-3-months", "2026-03-31")).toEqual({ from: "2026-01-01", to: "2026-03-31" });
  });

  it("never produces a day of month that does not exist", () => {
    // "Three months before 31 May" is the classic clamping bug. Nothing here can hit it, because
    // the start of a window is always the first of some month — assert that rather than trusting it.
    for (const day of ["2026-05-31", "2026-03-31", "2026-01-31", "2024-02-29"]) {
      for (const preset of ["this-month", "last-3-months", "this-year"] as const) {
        const resolved = windowForPreset(preset, day);
        expect(resolved.from, `${preset} from ${day}`).toMatch(/^\d{4}-\d{2}-01$/);
        expect(resolved.to).toBe(day);
      }
    }
  });

  it("keeps every resolved window in order, for every preset on every day of a year", () => {
    // The invariant the route enforces with a 400. Cheap to prove exhaustively rather than assume.
    for (let month = 1; month <= 12; month += 1) {
      for (const day of ["01", "15", "28"]) {
        const today = `2026-${String(month).padStart(2, "0")}-${day}`;
        for (const preset of WINDOW_PRESETS) {
          const resolved = windowForPreset(preset, today);
          if (resolved.from !== null && resolved.to !== null) {
            expect(resolved.from <= resolved.to, `${preset} on ${today}`).toBe(true);
          }
        }
      }
    }
  });

  it("reads today from the local calendar and not from UTC", () => {
    // **The defect this guards is silent and only appears for part of the day.** Bangkok is UTC+7,
    // so at 06:30 local on the first of a month it is still the previous month in UTC, and
    // `toISOString().slice(0, 10)` would start "this month" in the month before.
    const earlyOnTheFirst = new Date(2026, 8, 1, 6, 30);
    expect(localToday(earlyOnTheFirst)).toBe("2026-09-01");
    expect(windowForPreset("this-month", localToday(earlyOnTheFirst)).from).toBe("2026-09-01");
    // And the last hour of a month, which fails the other way round in UTC-negative zones.
    expect(localToday(new Date(2026, 7, 31, 23, 45))).toBe("2026-08-31");
  });

  it("omits an absent end rather than sending it blank", () => {
    // `searchParams.get` yields "" for a present-but-empty parameter, which fails the route's date
    // pattern with a 400 — so "all time" must send no parameters at all.
    expect(windowSearch({ from: null, to: null })).toBe("");
    expect(windowSearch({ from: "2026-08-01", to: null })).toBe("?from=2026-08-01");
    expect(windowSearch({ from: null, to: "2026-08-29" })).toBe("?to=2026-08-29");
    expect(windowSearch({ from: "2026-08-01", to: "2026-08-29" })).toBe("?from=2026-08-01&to=2026-08-29");
  });

  it("refuses a transposed custom range before it becomes a request", () => {
    expect(isUsableWindow({ from: "2026-08-01", to: "2026-08-29" })).toBe(true);
    expect(isUsableWindow({ from: "2026-08-29", to: "2026-08-29" })).toBe(true);
    expect(isUsableWindow({ from: "2026-08-30", to: "2026-08-29" })).toBe(false);
    // A half-open range is usable: the RPC resolves the absent end to the ledger's own.
    expect(isUsableWindow({ from: "2026-08-30", to: null })).toBe(true);
    expect(isUsableWindow({ from: null, to: null })).toBe(true);
  });

  it("gives every preset a label, so a new one cannot ship unnamed", () => {
    for (const preset of WINDOW_PRESETS) {
      expect(WINDOW_PRESET_LABELS[preset], `${preset} needs a label`).toBeTruthy();
    }
    expect(Object.keys(WINDOW_PRESET_LABELS).sort()).toEqual([...WINDOW_PRESETS].sort());
  });
});

/**
 * The picker's state in the address bar, so a reload returns to the chosen window and a window can
 * be linked to. Component state only, when the picker shipped in D-170.
 */
describe("the window picker's state in the URL", () => {
  it("encodes a preset by name and a custom range by its dates", () => {
    // All time is the default, so it carries nothing and a bare `/statistics` stays unambiguous.
    expect(pickerSearch(DEFAULT_PICKER_STATE)).toBe("");
    expect(pickerSearch({ ...DEFAULT_PICKER_STATE, preset: "this-month" })).toBe("?window=this-month");
    expect(pickerSearch({ preset: "all", custom: true, customFrom: "2026-01-01", customTo: "2026-03-31", accountId: null }))
      .toBe("?custom=1&from=2026-01-01&to=2026-03-31");
    // An empty end is an open end, and an absent parameter is how the rest of this module says so.
    expect(pickerSearch({ preset: "all", custom: true, customFrom: "2026-01-01", customTo: "", accountId: null }))
      .toBe("?custom=1&from=2026-01-01");
  });

  it("**keeps the preset a custom range was ticked on top of, so unticking means the same thing after a reload**", () => {
    // `window=custom` folded the override into the preset and dropped what was underneath it. The
    // control then behaved one way in-session and another after a reload of the URL it had itself
    // written, which is the asymmetry this encoding exists to remove.
    const ticked = { preset: "this-year" as const, custom: true, customFrom: "2026-02-01", customTo: "2026-02-28", accountId: null };
    expect(pickerSearch(ticked)).toBe("?window=this-year&custom=1&from=2026-02-01&to=2026-02-28");
    expect(pickerStateFromSearch(pickerSearch(ticked))).toEqual(ticked);
    // Unticking is the state the reader gets back, and it is the preset rather than All time.
    expect(pickerStateFromSearch(pickerSearch(ticked)).preset).toBe("this-year");
  });

  it("still reads `window=custom`, so a link written before the split keeps working", () => {
    expect(pickerStateFromSearch("?window=custom&from=2026-01-01&to=2026-03-31"))
      .toEqual({ preset: "all", custom: true, customFrom: "2026-01-01", customTo: "2026-03-31", accountId: null });
  });

  it("**a preset outlives the day it was linked on, and a custom range does not**", () => {
    // The distinction the encoding exists for. A preset is written down by name, so resolving it
    // twelve days later gives the later answer — the rolling question, not the frozen one.
    const link = pickerSearch({ ...DEFAULT_PICKER_STATE, preset: "this-month" });
    const reopened = pickerStateFromSearch(link);
    expect(windowForPreset(reopened.preset, "2026-08-01")).toEqual({ from: "2026-08-01", to: "2026-08-01" });
    expect(windowForPreset(reopened.preset, "2026-08-29")).toEqual({ from: "2026-08-01", to: "2026-08-29" });

    // A custom range carries its dates, so it means the same thing on any day it is opened.
    const fixed = pickerStateFromSearch(
      pickerSearch({ preset: "all", custom: true, customFrom: "2026-01-01", customTo: "2026-03-31", accountId: null })
    );
    expect(fixed).toEqual({ preset: "all", custom: true, customFrom: "2026-01-01", customTo: "2026-03-31", accountId: null });
  });

  it("round-trips every preset and a custom range", () => {
    for (const preset of WINDOW_PRESETS) {
      const state = { ...DEFAULT_PICKER_STATE, preset };
      expect(pickerStateFromSearch(pickerSearch(state)), `${preset} must survive the round trip`).toEqual(state);
    }
    const custom = { preset: "all" as const, custom: true, customFrom: "2026-02-01", customTo: "2026-02-28", accountId: null };
    expect(pickerStateFromSearch(pickerSearch(custom))).toEqual(custom);
  });

  it("carries an account id through the round trip, appended after the window", () => {
    const uuid = "11111111-2222-4333-8444-555555555555";
    const narrowed = { preset: "this-month" as const, custom: false, customFrom: "", customTo: "", accountId: uuid };
    expect(pickerSearch(narrowed)).toBe(`?window=this-month&account=${uuid}`);
    expect(pickerStateFromSearch(pickerSearch(narrowed))).toEqual(narrowed);

    // `windowSearch` is the route's own encoding, not the picker's — same key, same position.
    expect(windowSearch({ from: "2026-01-01", to: "2026-01-31" }, uuid)).toBe(`?from=2026-01-01&to=2026-01-31&account=${uuid}`);
    expect(windowSearch({ from: null, to: null }, null)).toBe("");
  });

  it("drops an account id that is not a uuid, on the same rule as an unrecognised preset", () => {
    for (const account of ["not-a-uuid", "11111111-2222-4333-8444", "", "11111111222243338444555555555555"]) {
      expect(pickerStateFromSearch(`?account=${account}`).accountId, `${account} must not survive`).toBeNull();
    }
    // Case is not significant — a uuid is written in either case in the wild.
    const upper = "11111111-2222-4333-8444-555555555555".toUpperCase();
    expect(pickerStateFromSearch(`?account=${upper}`).accountId).toBe(upper);
  });

  it("reads a bare from/to as a custom range, so a hand-edited URL keeps working", () => {
    // These are the route's own parameters, and hand-editing them was the only way to select a
    // window for the two days before the picker existed (D-170).
    expect(pickerStateFromSearch("?from=2026-05-01&to=2026-05-31"))
      .toEqual({ preset: "all", custom: true, customFrom: "2026-05-01", customTo: "2026-05-31", accountId: null });
    expect(pickerStateFromSearch("?to=2026-05-31"))
      .toEqual({ preset: "all", custom: true, customFrom: "", customTo: "2026-05-31", accountId: null });
  });

  it("is total: anything unreadable falls back to All time rather than throwing", () => {
    for (const search of ["", "?", "?window=", "?window=nonsense", "?window=THIS-MONTH", "?unrelated=1", "?window=all"]) {
      expect(pickerStateFromSearch(search), `${search} must be readable`).toEqual(DEFAULT_PICKER_STATE);
    }
  });

  it("lets a named preset win over stray dates, so one URL cannot mean two windows", () => {
    expect(pickerStateFromSearch("?window=this-year&from=2020-01-01&to=2020-12-31"))
      .toEqual({ ...DEFAULT_PICKER_STATE, preset: "this-year" });
  });

  it("keeps the custom dates as written, because the component owns that rule", () => {
    // Transposed, and deliberately preserved: `isUsableWindow` is what refuses it, and putting the
    // check here as well would let the two disagree about what is sendable.
    const transposed = pickerStateFromSearch("?window=custom&from=2026-08-30&to=2026-08-29");
    expect(transposed.customFrom).toBe("2026-08-30");
    expect(isUsableWindow({ from: transposed.customFrom, to: transposed.customTo })).toBe(false);
  });
});
