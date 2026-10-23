import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { formatDate, formatDateParts, formatDayHeading, formatDayHeadingParts } from "@/app/ledger-shared";
import { shortDay } from "@/app/statistics-calendar";

// A ledger date is a Bangkok date. Formatting it in the viewer's zone moves it across a day boundary
// for anyone west of UTC+7 (and for a server rendering in UTC), so each formatter is run under a
// zone where "2026-01-05 00:00 +07:00" is still 4 Jan.
describe("ledger date formatters under a non-Bangkok zone", () => {
  const originalTz = process.env.TZ;

  beforeEach(() => {
    process.env.TZ = "America/New_York";
    // Control: the zone change took effect, otherwise every assertion below proves nothing.
    expect(new Intl.DateTimeFormat().resolvedOptions().timeZone).toBe("America/New_York");
  });

  afterEach(() => {
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  });

  it("formatDate keeps the Bangkok day", () => {
    const text = formatDate("2026-01-05");
    expect(text).toContain("05");
    expect(text).toContain("Jan 2026");
  });

  it("formatDateParts keeps the Bangkok day", () => {
    const parts = formatDateParts("2026-01-05");
    expect(parts.map((part) => part.value).join("")).toBe(formatDate("2026-01-05"));
    expect(parts.find((part) => part.numeric && part.value === "05")).toBeDefined();
  });

  it("formatDayHeading and its parts keep the Bangkok weekday and day", () => {
    // 2026-01-05 is a Monday in Bangkok; New York would read it as Sunday 04.
    expect(formatDayHeading("2026-01-05")).toContain("Mon");
    expect(formatDayHeading("2026-01-05")).toContain("05");
    expect(formatDayHeadingParts("2026-01-05").map((part) => part.value).join("")).toBe(formatDayHeading("2026-01-05"));
  });

  it("shortDay keeps the Bangkok day", () => {
    expect(shortDay("2026-01-05")).toBe("5 Jan");
  });
});
