import { describe, expect, test } from "vitest";
import { classifyGrabReceipt, htmlToLines, parseGrabRide } from "@/lib/delivery-grab";

// Every value below is invented (`docs/FIXTURE_POLICY.md`): the booking ID, places, times, names,
// card digits and amounts match no real ride. The **layout** follows the ride template measured
// 2026-09-24 over all 276 real ride receipts by `scripts/measure-grab-mail.ts --rides-detail`
// (labels and counts only): the total printed at the top and at the bottom, a VAT asterisk on the
// platform fee, the paid-by block, and the trip section's eight dots before pickup and drop-off.

type Parts = { type?: string; date?: string; breakdown?: string[]; total?: string; paid?: string[]; trip?: string[] };

function rideLines(parts: Parts = {}): string[] {
  const total = parts.total ?? "฿ 81";
  const html = [
    "E-Receipt/Abbreviated Tax Invoice",
    parts.type ?? "Saver Bike",
    "Invented thanks line",
    parts.date ?? "Picked up on 12 September 2026",
    "Booking ID: A-INVENTED0001",
    "Total Paid", total,
    "9.9", "Compliments for driver", "Invented Driver Name",
    "Breakdown",
    ...(parts.breakdown ?? ["Fare", "฿ 90", "Platform Fee", "฿ 6*", "Promo", "฿ -15"]),
    "Total Paid", total,
    "Passenger", "Invented Passenger", "Profile", "PERSONAL",
    ...(parts.paid ?? ["Paid by", "0000", total, "Points earned invented line"]),
    "Got an issue with your ride? Invented help line",
    "Your Trip",
    ...(parts.trip ?? [
      "4.20 km • 17 mins",
      "⋮", "⋮", "⋮", "⋮", "⋮", "⋮", "⋮", "⋮",
      "Invented Pickup Place", "8:05PM", "Invented Drop-off Place", "8:22PM"
    ]),
    "Grab Thailand"
  ].map((line) => `<div>${line}</div>`).join("\n");
  return htmlToLines(`<html><body>${html}</body></html>`);
}

describe("parseGrabRide", () => {
  test("is classified as a ride", () => {
    expect(classifyGrabReceipt(rideLines())).toBe("ride");
  });

  test("reads the ride, its breakdown, the trip and its times in Bangkok", () => {
    const parsed = parseGrabRide(rideLines());
    expect(parsed).toEqual({
      ok: true,
      value: {
        platform: "grab", bookingId: "A-INVENTED0001", rideType: "Saver Bike",
        pickedUpAt: "2026-09-12T20:05:00+07:00", droppedOffAt: "2026-09-12T20:22:00+07:00",
        pickupPlace: "Invented Pickup Place", dropoffPlace: "Invented Drop-off Place",
        distanceMeters: 4200, durationMinutes: 17, paymentMethod: "0000",
        fareMinor: "9000", platformFeeMinor: "600",
        adjustments: [{ position: 1, kind: "discount", name: "Promo", amountMinor: "1500" }],
        totalMinor: "8100"
      }
    });
  });

  test("never reads the driver, the passenger or the rating into any field", () => {
    const parsed = parseGrabRide(rideLines());
    const text = JSON.stringify(parsed);
    for (const secret of ["Invented Driver Name", "Invented Passenger", "9.9", "PERSONAL"]) expect(text).not.toContain(secret);
  });

  test("a drop-off earlier on the clock than the pickup is the next day", () => {
    const parsed = parseGrabRide(rideLines({
      date: "Picked up on 31 December 2026",
      trip: ["3 km • 1 hour 5 mins", "⋮", "Invented A", "11:40PM", "Invented B", "12:45AM"]
    }));
    expect(parsed.ok && [parsed.value.pickedUpAt, parsed.value.droppedOffAt, parsed.value.durationMinutes, parsed.value.distanceMeters])
      .toEqual(["2026-12-31T23:40:00+07:00", "2027-01-01T00:45:00+07:00", 65, 3000]);
  });

  test("reads a toll as a charge and a bare GrabCoins amount as a discount", () => {
    const parsed = parseGrabRide(rideLines({
      breakdown: ["Fare", "฿ 200", "Platform Fee", "฿ 6*", "Toll", "฿ 50", "GrabCoins", "-99"],
      total: "฿ 157"
    }));
    expect(parsed.ok && parsed.value.adjustments).toEqual([
      { position: 1, kind: "charge", name: "Toll", amountMinor: "5000" },
      { position: 2, kind: "discount", name: "GrabCoins", amountMinor: "9900" }
    ]);
  });

  test("refuses a bare amount after any label but GrabCoins", () => {
    const parsed = parseGrabRide(rideLines({ breakdown: ["Fare", "฿ 90", "Platform Fee", "฿ 6*", "Promo", "-15"] }));
    expect(parsed).toMatchObject({ ok: false, code: "MALFORMED_LINE" });
  });

  test("refuses a breakdown that does not sum to the total", () => {
    const parsed = parseGrabRide(rideLines({ breakdown: ["Fare", "฿ 90", "Platform Fee", "฿ 6*", "Promo", "฿ -14"] }));
    expect(parsed).toMatchObject({ ok: false, code: "TOTAL_MISMATCH" });
  });

  test("refuses when the amount paid is not the total", () => {
    const parsed = parseGrabRide(rideLines({ paid: ["Paid by", "0000", "฿ 80"] }));
    expect(parsed).toMatchObject({ ok: false, code: "TOTAL_MISMATCH" });
  });

  test("refuses a ride with no platform fee line", () => {
    const parsed = parseGrabRide(rideLines({ breakdown: ["Fare", "฿ 96", "Promo", "฿ -15"] }));
    expect(parsed).toMatchObject({ ok: false, code: "MISSING_FIELD" });
  });

  test("refuses a trip with a stop too many", () => {
    const parsed = parseGrabRide(rideLines({
      trip: ["4.20 km • 17 mins", "⋮", "Invented A", "8:05PM", "Invented B", "8:12PM", "Invented C", "8:22PM"]
    }));
    expect(parsed).toMatchObject({ ok: false, code: "MALFORMED_LINE" });
  });

  test("reads any Latin-led ride type, and refuses a Thai or priced line in its place", () => {
    expect(parseGrabRide(rideLines({ type: "Invented (BETA) | Van’s, 4-seat" }))).toMatchObject({ ok: true });
    expect(parseGrabRide(rideLines({ type: "Hope you enjoyed your ride!" }))).toMatchObject({ ok: false, code: "MISSING_FIELD" });
    expect(parseGrabRide(rideLines({ type: "ขอบคุณ" }))).toMatchObject({ ok: false, code: "MISSING_FIELD" });
    expect(parseGrabRide(rideLines({ type: "฿ 81" }))).toMatchObject({ ok: false, code: "MISSING_FIELD" });
  });

  test("refuses an impossible pickup date rather than rolling it over", () => {
    expect(parseGrabRide(rideLines({ date: "Picked up on 31 September 2026" }))).toMatchObject({ ok: false, code: "MALFORMED_LINE" });
  });
});
