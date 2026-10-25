import { describe, expect, it } from "vitest";
import {
  coverageAge, coverageAgeDays, coverageTone, formatDayMonth, formatInstantDay, formatInstantDayTime, formatWallTime, relativeAge
} from "@/lib/coverage";

describe("coverageAge (calendar dates, invented values)", () => {
  it("counts today, one day and N days", () => {
    expect(coverageAge("2026-03-14", "2026-03-14")).toBe("today");
    expect(coverageAge("2026-03-13", "2026-03-14")).toBe("1 day");
    expect(coverageAge("2026-03-06", "2026-03-14")).toBe("8 days");
    expect(coverageAge("2026-03-15", "2026-03-14")).toBe("today");
  });
  it("crosses month, year and leap boundaries", () => {
    expect(coverageAge("2026-02-28", "2026-03-01")).toBe("1 day");
    expect(coverageAge("2024-02-28", "2024-03-01")).toBe("2 days");
    expect(coverageAge("2025-12-31", "2026-01-01")).toBe("1 day");
    expect(coverageAge("2025-12-25", "2026-01-02")).toBe("8 days");
  });
});

describe("coverageTone", () => {
  it("is done at 7 days and check at 8", () => {
    expect(coverageTone(coverageAgeDays("2026-03-07", "2026-03-14"))).toBe("done");
    expect(coverageTone(coverageAgeDays("2026-03-06", "2026-03-14"))).toBe("check");
    expect(coverageTone(0)).toBe("done");
  });
});

describe("statement-local formatting reads the string, not Date", () => {
  it("formats the day and the time", () => {
    expect(formatDayMonth("2026-03-13")).toBe("13 Mar");
    expect(formatDayMonth("2026-03-06")).toBe("6 Mar");
    expect(formatWallTime("21:40:00")).toBe("21:40");
  });
});

describe("instants are read in Bangkok", () => {
  it("moves a late-UTC instant to the next Bangkok day", () => {
    expect(formatInstantDayTime("2026-03-13T18:30:00Z")).toBe("14 Mar 01:30");
    expect(formatInstantDay("2026-03-13T18:30:00Z")).toBe("14 Mar");
  });
  it("words the age", () => {
    const now = new Date("2026-03-14T09:30:00Z");
    expect(relativeAge("2026-03-14T09:29:30Z", now)).toBe("just now");
    expect(relativeAge("2026-03-14T09:29:00Z", now)).toBe("1 minute ago");
    expect(relativeAge("2026-03-14T09:00:00Z", now)).toBe("30 minutes ago");
    expect(relativeAge("2026-03-14T06:30:00Z", now)).toBe("3 hours ago");
    expect(relativeAge("2026-03-12T09:30:00Z", now)).toBe("2 days ago");
  });
});
