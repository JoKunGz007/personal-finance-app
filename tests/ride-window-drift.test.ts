import { describe, expect, it } from "vitest";
import {
  RIDE_MATCH_AFTER_MINUTES, RIDE_MATCH_BEFORE_MINUTES, RIDE_REFUND_DAYS, RIDE_SECOND_CHARGE_AFTER_MINUTES
} from "@/lib/delivery-match";
import { newestFunctionBody } from "./helpers/migration-source";

// D-299: the ride candidate RPCs bound their rows in SQL, and `lib/delivery-match.ts` decides
// inside those rows with its own minute constants. A TS window wider than the SQL bound would
// silently never see the rows it widened to, so this holds each SQL bound to its TS twin.

const pickup = "\\(r\\.picked_up_at at time zone 'Asia/Bangkok'\\)";

function dayBounds(body: string, name: string): { before: number; after: number } {
  const match = new RegExp(`between ${pickup}::date - (\\d+)\\s+and ${pickup}::date \\+ (\\d+)`, "u").exec(body);
  if (!match) throw new Error(`${name} no longer has the pickup-day bound this test reads.`);
  return { before: Number(match[1]), after: Number(match[2]) };
}

describe("ride candidate windows: SQL agrees with lib/delivery-match.ts", () => {
  it("ride_ledger_candidates' day bound contains the single-charge window", () => {
    const { body } = newestFunctionBody("ride_ledger_candidates");
    const days = dayBounds(body, "ride_ledger_candidates");
    // Whole Bangkok days either side of pickup; the minute window must fit even at midnight.
    expect(days.before * 24 * 60).toBeGreaterThanOrEqual(RIDE_MATCH_BEFORE_MINUTES + 24 * 60);
    expect(days.after * 24 * 60).toBeGreaterThanOrEqual(RIDE_MATCH_AFTER_MINUTES + 24 * 60);
  });

  it("ride_split_candidates bounds its charges at exactly the split rule's minutes", () => {
    const { body } = newestFunctionBody("ride_split_candidates");
    const minutes = new RegExp(
      `between ${pickup} - interval '(\\d+) minutes'\\s+and ${pickup} \\+ interval '(\\d+) minutes'`, "u"
    ).exec(body);
    if (!minutes) throw new Error("ride_split_candidates no longer has the charge-minute bound this test reads.");
    expect(Number(minutes[1])).toBe(RIDE_MATCH_BEFORE_MINUTES);
    expect(Number(minutes[2])).toBe(RIDE_SECOND_CHARGE_AFTER_MINUTES);
  });

  it("ride_split_candidates' day bound reaches a refund RIDE_REFUND_DAYS after the charge", () => {
    const { body } = newestFunctionBody("ride_split_candidates");
    const days = dayBounds(body, "ride_split_candidates");
    expect(days.before).toBeGreaterThanOrEqual(1);
    expect(days.after).toBeGreaterThanOrEqual(RIDE_REFUND_DAYS + 1);
  });
});
