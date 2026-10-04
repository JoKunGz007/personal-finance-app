import { describe, expect, it } from "vitest";
import { DEFAULT_NAV, NAV_CHOICES, NAV_LABELS, NAV_NOTES, navChoiceFrom, navPreferenceRequestSchema } from "@/lib/ui-nav";

describe("phone nav preference", () => {
  it("offers Strip first and as the default, with Grid still selectable", () => {
    expect(NAV_CHOICES).toEqual(["strip", "grid"]);
    expect(DEFAULT_NAV).toBe("strip");
    expect(Object.values(NAV_LABELS)).toEqual(["Strip", "Grid"]);
    for (const choice of NAV_CHOICES) expect(NAV_NOTES[choice].length).toBeGreaterThan(0);
  });

  it("is total over untrusted input", () => {
    expect(navChoiceFrom("grid")).toBe("grid");
    for (const bad of [undefined, null, "", "Grid", "wide", "<script>"]) expect(navChoiceFrom(bad)).toBe("strip");
  });

  it("refuses an unknown or extra key", () => {
    expect(navPreferenceRequestSchema.safeParse({ nav: "grid" }).success).toBe(true);
    expect(navPreferenceRequestSchema.safeParse({ nav: "wide" }).success).toBe(false);
    expect(navPreferenceRequestSchema.safeParse({ nav: "grid", theme: "light" }).success).toBe(false);
  });
});
