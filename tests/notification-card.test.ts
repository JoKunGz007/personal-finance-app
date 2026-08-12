import { describe, expect, it } from "vitest";
import {
  NOTIFICATION_CARD_LAYOUTS,
  boundDigitCount,
  layoutForChannel,
  matchAccountDigits,
  resolveCardYear
} from "@/lib/notification-card";

// Every account number here is invented, per `docs/FIXTURE_POLICY.md`. The real cards were
// read under a grant on 2026-08-12 and only shapes and counts left that reading — no digit
// from them appears in this file or in any other.

describe("notification card layouts", () => {
  it("registers one layout per channel and resolves each by name", () => {
    expect(NOTIFICATION_CARD_LAYOUTS).toHaveLength(3);
    for (const layout of NOTIFICATION_CARD_LAYOUTS) {
      expect(layoutForChannel(layout.channel)).toBe(layout);
    }
    // One layout names the other side of the transfer and two do not. A reader that treated
    // the absence as a parse failure would refuse two thirds of real cards.
    expect(NOTIFICATION_CARD_LAYOUTS.filter((layout) => layout.carriesCounterparty)).toHaveLength(1);
  });
});

describe("the printed year is read per layout, never globally", () => {
  const gregorian = layoutForChannel("SCB Connect");
  const buddhist = layoutForChannel("Krungthai Connext");

  it("passes a four-digit Gregorian year through untouched", () => {
    expect(resolveCardYear(gregorian, 2026, 2026)).toBe(2026);
  });

  it("resolves a two-digit Buddhist year against the year the card was captured", () => {
    expect(resolveCardYear(buddhist, 69, 2026)).toBe(2026);
    expect(resolveCardYear(buddhist, 68, 2026)).toBe(2025);
  });

  // This is D-031's failure in miniature: reading a two-digit Buddhist year with the
  // four-digit rule, or the reverse, is what dated a whole statement 43 years early while
  // parsing cleanly the entire way. Each layout refuses the other's shape outright.
  it("refuses a year printed in the other layout's shape rather than guessing", () => {
    expect(() => resolveCardYear(gregorian, 69, 2026)).toThrow(/four-digit/u);
    expect(() => resolveCardYear(buddhist, 2026, 2026)).toThrow(/two-digit/u);
  });
});

describe("account digits are matched per layout, and refuse rather than guess", () => {
  const lastFour = layoutForChannel("SCB Connect");
  const offsetOne = layoutForChannel("KBank Live");

  it("compares a last-four layout directly", () => {
    expect(matchAccountDigits(lastFour, "1234", ["1234", "9876"])).toEqual({ outcome: "matched", lastFour: "1234" });
    expect(matchAccountDigits(lastFour, "1234", ["9876"])).toEqual({ outcome: "none" });
  });

  // The finding this whole module exists for. The card shows digits 6-9 of a ten-digit
  // account and masks the last one, so its four printed digits and the stored last four
  // overlap by three and sit one apart. Comparing them directly matches nothing — which is
  // why the naive reading reported real cards as belonging to no account at all.
  it("shifts an offset-one layout by one digit, where a direct comparison finds nothing", () => {
    expect(matchAccountDigits(offsetOne, "1234", ["2345"])).toEqual({ outcome: "matched", lastFour: "2345" });
    // The same digits under the naive rule: no match, and no error either.
    expect(matchAccountDigits(lastFour, "1234", ["2345"])).toEqual({ outcome: "none" });
  });

  it("refuses an offset-one match that only three shared digits cannot decide", () => {
    // Two accounts differing only in the digit the card masks are indistinguishable from it.
    expect(matchAccountDigits(offsetOne, "1234", ["2345", "2346"])).toEqual({
      outcome: "ambiguous",
      candidates: ["2345", "2346"]
    });
  });

  it("reports how many digits each layout actually pins down", () => {
    expect(boundDigitCount(lastFour)).toBe(4);
    // Four digits are printed; only three of them constrain the stored account.
    expect(boundDigitCount(offsetOne)).toBe(3);
  });

  it("refuses printed digits that are not four digits, on either layout", () => {
    for (const layout of [lastFour, offsetOne]) {
      expect(() => matchAccountDigits(layout, "123", [])).toThrow(/four account digits/u);
      expect(() => matchAccountDigits(layout, "12a4", [])).toThrow(/four account digits/u);
    }
  });

  it("ignores a stored value that is not four digits rather than matching it loosely", () => {
    expect(matchAccountDigits(lastFour, "1234", ["1234", "123"])).toEqual({ outcome: "matched", lastFour: "1234" });
  });
});
