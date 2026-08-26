import { describe, expect, it } from "vitest";
import {
  DEFAULT_FONT,
  FONT_CHOICES,
  FONT_COOKIE,
  FONT_LABELS,
  FONT_NOTES,
  fontChoiceFrom,
  fontPreferenceRequestSchema,
  fontPreferenceResponseSchema,
  isFontChoice
} from "@/lib/ui-font";

/**
 * The typeface preference, driven directly.
 *
 * The whole of this module's job is that **a client-supplied cookie cannot put anything but a known
 * token on the `<html>` element**, and that a device with no preference, a stale one, or a hostile
 * one all end up somewhere legible. That is a total function over untrusted input, which is exactly
 * the shape a unit test can hold and a source grep cannot.
 */

describe("reading a typeface preference from untrusted input", () => {
  it("answers with a known face for every choice it recognises", () => {
    for (const choice of FONT_CHOICES) {
      expect(fontChoiceFrom(choice)).toBe(choice);
    }
  });

  it("falls back rather than failing, for every way the cookie can be wrong", () => {
    // No failure branch on purpose: a preference that cannot be read is not an error to report, it
    // is a device that gets the default.
    expect(fontChoiceFrom(undefined), "no cookie at all").toBe(DEFAULT_FONT);
    expect(fontChoiceFrom(null)).toBe(DEFAULT_FONT);
    expect(fontChoiceFrom(""), "an empty cookie").toBe(DEFAULT_FONT);
    expect(fontChoiceFrom("comic-sans"), "a face that was removed or never existed").toBe(DEFAULT_FONT);
    expect(fontChoiceFrom("SILKSCREEN"), "the tokens are exact, not case-folded").toBe(DEFAULT_FONT);
    expect(fontChoiceFrom(" silkscreen "), "and not trimmed").toBe(DEFAULT_FONT);
  });

  /**
   * **The reason the allowlist exists**, rather than trusting the cookie and writing it out.
   *
   * The value lands in an attribute on `<html>`. React escapes attribute values, so none of these
   * is an injection today — but "it is escaped downstream" is a property of a renderer someone can
   * change, and a closed set is a property of this function that they cannot.
   */
  it.each([
    ['" onload="alert(1)'],
    ["system\" data-x=\"y"],
    ["../../etc/passwd"],
    ["<script>alert(1)</script>"],
    ["system; DROP TABLE accounts"],
    ["system\nsilkscreen"]
  ])("refuses %j and returns the default", (hostile) => {
    expect(fontChoiceFrom(hostile)).toBe(DEFAULT_FONT);
    expect(FONT_CHOICES).toContain(fontChoiceFrom(hostile));
  });

  it("never returns anything outside the closed set, whatever it is handed", () => {
    const anything: unknown[] = [42, true, null, undefined, {}, [], () => "silkscreen", Symbol("x")];
    for (const value of anything) {
      // Deliberately cast: the point is what happens when the type is a lie, which is the only
      // situation a cookie can produce.
      expect(FONT_CHOICES).toContain(fontChoiceFrom(value as string));
    }
  });

  it("recognises a face only by exact membership", () => {
    expect(isFontChoice("press-start-2p")).toBe(true);
    expect(isFontChoice("press-start")).toBe(false);
    expect(isFontChoice(undefined)).toBe(false);
    expect(isFontChoice(42)).toBe(false);
  });
});

describe("the preference's own shape", () => {
  it("keeps the legible stack as the default and lists it first", () => {
    // The pixel faces are on trial (PLAN task 42) and the way back must not depend on the trial
    // going well. A change here is a real decision, so it fails loudly rather than drifting.
    expect(DEFAULT_FONT).toBe("system");
    expect(FONT_CHOICES[0]).toBe("system");
  });

  it("gives every face a label and a note, so a new one cannot ship unexplained", () => {
    for (const choice of FONT_CHOICES) {
      expect(FONT_LABELS[choice], `${choice} needs a label`).toBeTruthy();
      expect(FONT_NOTES[choice], `${choice} needs a note`).toBeTruthy();
    }
    expect(Object.keys(FONT_LABELS).sort()).toEqual([...FONT_CHOICES].sort());
    expect(Object.keys(FONT_NOTES).sort()).toEqual([...FONT_CHOICES].sort());
  });

  it("says out loud that the pixel faces do not cover Thai", () => {
    // Thai reaches the screen as statement data and falls back mid-line. Saying so beside the
    // control is cheaper than the owner meeting it in a table and reading it as a defect.
    for (const choice of FONT_CHOICES) {
      if (choice === "system") continue;
      expect(FONT_NOTES[choice], `${choice} must warn about Thai`).toMatch(/Thai/u);
    }
  });

  it("names the cookie distinctly enough not to collide with a session cookie", () => {
    expect(FONT_COOKIE).toMatch(/^pl_/u);
    expect(FONT_COOKIE).not.toMatch(/^sb-/u);
  });
});

describe("the wire contract", () => {
  it("accepts a known face and refuses everything else", () => {
    expect(fontPreferenceRequestSchema.parse({ font: "silkscreen" })).toEqual({ font: "silkscreen" });
    expect(fontPreferenceRequestSchema.safeParse({ font: "comic-sans" }).success).toBe(false);
    expect(fontPreferenceRequestSchema.safeParse({}).success).toBe(false);
    expect(fontPreferenceRequestSchema.safeParse({ font: 42 }).success).toBe(false);
  });

  it("is strict, so an unknown key is refused rather than quietly dropped", () => {
    // A caller sending `{font, theme}` has a broken model of this endpoint, and answering it as
    // though the extra key were fine is how a second preference gets half-built.
    expect(fontPreferenceRequestSchema.safeParse({ font: "system", theme: "dark" }).success).toBe(false);
    expect(fontPreferenceResponseSchema.safeParse({ font: "system", stored: true }).success).toBe(false);
  });

  it("answers with the face that was stored, so the client renders from the server's word", () => {
    expect(fontPreferenceResponseSchema.parse({ font: "pixelify-sans" })).toEqual({ font: "pixelify-sans" });
  });
});
