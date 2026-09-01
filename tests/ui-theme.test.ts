import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DARK_THEMES,
  DEFAULT_THEME,
  SYSTEM_DARK,
  THEME_CHOICES,
  THEME_COOKIE,
  THEME_GROUNDS,
  THEME_LABELS,
  THEME_NOTES,
  THEME_TOKENS,
  colorSchemeFor,
  isDarkTheme,
  isThemeChoice,
  themeChoiceFrom,
  themePreferenceRequestSchema,
  themePreferenceResponseSchema
} from "@/lib/ui-theme";

/**
 * The colour schemes, driven directly, and the answer to why D-137 could be reversed.
 *
 * **D-137 dropped the dark scheme on the argument that a second scheme is a second set of contrast
 * facts that nothing here measures.** That argument was correct when it was made and this file is
 * what retires it: every declared scheme is measured here, against floors calibrated from the light
 * palette this app has shipped since 2026-08-21. A fourth scheme costs one CSS block, one entry in
 * `THEME_CHOICES`, and nothing else — because if it is wrong, this fails.
 *
 * **The floors were calibrated, not chosen, and the calibration found the instrument at fault.**
 * A first pass used the textbook numbers — 3:1 for every non-text boundary, 1.1 for a surface lift —
 * and the *shipped light palette* failed five of them: the privacy dot, the backup band's border,
 * the warning's edge, and both surface lifts. Light is accepted, deployed and axe-clean, so those
 * floors were wrong rather than the palette. What they are now is the light scheme's own measured
 * values, rounded down: a dark scheme must be **at least as good as daylight**, which is a claim
 * this repo can actually defend.
 */

const CSS = readFileSync(join(process.cwd(), "app", "globals.css"), "utf8");

/** `globals.css` with every comment removed, so prose about a colour is never read as a colour. */
const CSS_CODE = CSS.replace(/\/\*[\s\S]*?\*\//gu, "");

/**
 * The declarations of the first block for `selector` that actually declares tokens.
 *
 * Deliberately a small scanner rather than a CSS parser dependency: the blocks it must read are flat
 * and hand-written, and a parser would be a new dependency for one file. `:root[data-theme="system"]`
 * appears twice — once as a one-line `color-scheme` and once inside the media query with the tokens —
 * so "the first block that declares `--mist`" is the disambiguator rather than "the first block".
 */
function tokensOf(selector: string): Record<string, string> {
  const found: Record<string, string> = {};
  let from = 0;
  for (;;) {
    const at = CSS_CODE.indexOf(`${selector} {`, from);
    if (at === -1) break;
    const open = CSS_CODE.indexOf("{", at);
    const close = CSS_CODE.indexOf("}", open);
    const body = CSS_CODE.slice(open + 1, close);
    from = close;
    if (!body.includes("--mist:")) continue;
    for (const match of body.matchAll(/--([a-z-]+)\s*:\s*([^;]+);/gu)) {
      const [, name, value] = match;
      if (name === undefined || value === undefined) continue;
      found[name] = value.trim();
    }
    return found;
  }
  throw new Error(`no token-declaring block for ${selector} in app/globals.css`);
}

/**
 * The custom properties `:root` declares that are **not** about colour, and that a scheme block must
 * therefore never redeclare.
 *
 * `--radius` is a fact about the layout and the three font stacks are facts about the typeface
 * trial; neither changes when the ground does. A dark block that redeclared one would be saying
 * something it does not mean, and the assertion below is what stops a future block from copying
 * `:root` wholesale.
 */
const LAYOUT_TOKENS = ["radius", "font-money", "font-body", "font-data"] as const;

const BLOCKS = {
  light: tokensOf(":root"),
  night: tokensOf(':root[data-theme="night"]'),
  lamplit: tokensOf(':root[data-theme="lamplit"]'),
  cellar: tokensOf(':root[data-theme="cellar"]'),
  system: tokensOf(':root[data-theme="system"]')
} as const;

// ---------------------------------------------------------------------------
// Colour maths. Self-contained: a test that imports the thing it measures from
// the thing it is measuring proves nothing.
// ---------------------------------------------------------------------------

function channels(value: string): [number, number, number] {
  const s = value.replace("#", "");
  const full = s.length === 3 ? s.split("").map((c) => c + c).join("") : s;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number];
}

function luminance(value: string): number {
  const linear = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = channels(value);
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

function contrast(a: string, b: string): number {
  const one = luminance(a);
  const other = luminance(b);
  const hi = Math.max(one, other);
  const lo = Math.min(one, other);
  return (hi + 0.05) / (lo + 0.05);
}

/** `color-mix(in srgb, a p%, b)`, which several surfaces below are painted with for real. */
function mix(a: string, percent: number, b: string): string {
  const [r1, g1, b1] = channels(a);
  const [r2, g2, b2] = channels(b);
  const blend = (x: number, y: number) =>
    Math.round((x * percent + y * (100 - percent)) / 100).toString(16).padStart(2, "0");
  return `#${blend(r1, r2)}${blend(g1, g2)}${blend(b1, b2)}`;
}

/**
 * Every pair with a floor, and what paints it.
 *
 * `4.5` is body text, `3` a chart mark or a control boundary (WCAG 1.4.3 and 1.4.11). Anything
 * below 3 is a **decorative** pair whose floor is the light scheme's own measurement rounded down —
 * named as such so nobody later reads it as a standard being met.
 */
function pairs(block: Record<string, string>): Array<[string, string, string, number]> {
  // **Throws rather than yielding `undefined`**, which matters more than it looks: `undefined`
  // would reach `channels()` as `NaN` and every ratio against it would come back `NaN`, and
  // `NaN < 4.5` is `false` — so a missing token would make this suite *pass*. A check that cannot
  // fail on a broken input is the failure mode this repo keeps rediscovering.
  const t = (name: string): string => {
    const value = block[name];
    if (value === undefined) throw new Error(`no --${name} declared`);
    return value;
  };
  return [
    ["primary text on the ground", t("navy"), t("mist"), 4.5],
    ["primary text on the header band", t("navy"), t("paper"), 4.5],
    ["primary text on a lifted panel", t("navy"), t("paper-strong"), 4.5],
    ["secondary text on the ground", t("muted"), t("mist"), 4.5],
    ["secondary text on a lifted panel", t("muted"), t("paper-strong"), 4.5],
    ["the action colour on the ground", t("blue"), t("mist"), 4.5],
    ["the action colour on a lifted panel", t("blue"), t("paper-strong"), 4.5],
    ["the pressed action colour on the ground", t("blue-dark"), t("mist"), 4.5],
    ["text over an action fill", t("on-action"), t("blue"), 4.5],
    ["text over a pressed action fill", t("on-action"), t("blue-dark"), 4.5],
    ["text over a stale backup button", t("paper-strong"), t("warn-ink"), 4.5],
    ["error text on the ground", t("red"), t("mist"), 4.5],
    ["error text on a lifted panel", t("red"), t("paper-strong"), 4.5],
    ["money in on the ground", t("money-in"), t("mist"), 4.5],
    ["money in on a lifted panel", t("money-in"), t("paper-strong"), 4.5],
    ["money out on the ground", t("money-out"), t("mist"), 4.5],
    ["money out on a lifted panel", t("money-out"), t("paper-strong"), 4.5],
    ["confirmation text on its fill", t("celadon-ink"), t("celadon"), 4.5],
    ["warning text on its wash", t("warn-ink"), t("saffron-wash"), 4.5],
    ["warning text on a 55% wash", t("warn-ink"), mix(t("saffron-wash"), 55, t("mist")), 4.5],
    ["the resync label on the ground", t("resync-ink"), t("mist"), 4.5],
    ["the verified chip on the ground", t("verified-ink"), t("mist"), 4.5],
    ["the verified chip on a lifted panel", t("verified-ink"), t("paper-strong"), 4.5],
    ["the income chart mark on the ground", t("chart-in"), t("mist"), 3],
    ["the spending chart mark on the ground", t("chart-out"), t("mist"), 3],
    ["the income chart mark on a panel", t("chart-in"), t("paper-strong"), 3],
    ["a full-intensity calendar cell", mix(t("chart-in"), 100, t("paper")), t("paper"), 1.5],
    ["the verified row's rail", t("verified-rail"), t("mist"), 3],
    ["the panel frame's outer ring", t("frame-outer"), t("mist"), 3],
    // Decorative below this line: floors are the light scheme's own values, rounded down.
    // **The dot's surface is its own halo over the header band, not solid celadon.** `.privacy-chip`
    // sets no background at all; the ring is `color-mix(--celadon 55%, transparent)`. An earlier
    // draft measured against solid `--celadon`, a surface the app never paints there — it passed,
    // which is the problem: a pair naming the wrong surface is a check that cannot report the real
    // one. Against the real halo it reads 2.91 in daylight rather than 2.40.
    ["the privacy dot on its halo (decorative)", t("celadon-dot"), mix(t("celadon"), 55, t("paper")), 2.2],
    ["the warning's edge (decorative)", t("saffron"), t("mist"), 2.0],
    ["the backup band's edge (decorative)", t("backup-edge"), mix(t("celadon"), 55, t("paper")), 1.6],
    ["a hairline on the ground (decorative)", t("line"), t("mist"), 1.35],
    ["a hairline on a lifted panel (decorative)", t("line"), t("paper-strong"), 1.3],
    ["a panel lifting off the ground (decorative)", t("paper-strong"), t("mist"), 1.04],
    ["the header band lifting off the ground (decorative)", t("paper"), t("mist"), 1.02]
  ];
}

/** One token out of a parsed block, loudly absent rather than quietly `undefined`. */
function tokenOf(block: Record<string, string>, name: string): string {
  const value = block[name];
  if (value === undefined) throw new Error(`no --${name} declared`);
  return value;
}

describe("reading a colour scheme from untrusted input", () => {
  it("answers with a known scheme for every choice it recognises", () => {
    for (const choice of THEME_CHOICES) {
      expect(themeChoiceFrom(choice)).toBe(choice);
    }
  });

  it("falls back rather than failing, for every way the cookie can be wrong", () => {
    expect(themeChoiceFrom(undefined), "no cookie at all").toBe(DEFAULT_THEME);
    expect(themeChoiceFrom(null)).toBe(DEFAULT_THEME);
    expect(themeChoiceFrom(""), "an empty cookie").toBe(DEFAULT_THEME);
    expect(themeChoiceFrom("dark"), "a plausible token this app does not use").toBe(DEFAULT_THEME);
    expect(themeChoiceFrom("NIGHT"), "the tokens are exact, not case-folded").toBe(DEFAULT_THEME);
    expect(themeChoiceFrom(" night "), "and not trimmed").toBe(DEFAULT_THEME);
  });

  it.each([
    ['" onload="alert(1)'],
    ['night" data-x="y'],
    ["<script>alert(1)</script>"],
    ["night; DROP TABLE accounts"],
    ["night\ncellar"]
  ])("refuses %j and returns the default", (hostile) => {
    expect(themeChoiceFrom(hostile)).toBe(DEFAULT_THEME);
    expect(THEME_CHOICES).toContain(themeChoiceFrom(hostile));
  });

  it("never returns anything outside the closed set, whatever it is handed", () => {
    const anything: unknown[] = [42, true, null, undefined, {}, [], () => "night", Symbol("x")];
    for (const value of anything) {
      expect(THEME_CHOICES).toContain(themeChoiceFrom(value as string));
    }
  });

  it("recognises a scheme only by exact membership", () => {
    expect(isThemeChoice("cellar")).toBe(true);
    expect(isThemeChoice("cell")).toBe(false);
    expect(isThemeChoice(undefined)).toBe(false);
  });
});

describe("the preference's own shape", () => {
  it("follows the device by default, and keeps daylight reachable", () => {
    // **A preference nobody has expressed should follow the device.** And the way back to the
    // palette this app shipped for its whole life must not depend on a new choice going well —
    // which is the same invariant `tests/ui-font.test.ts` holds over `system`.
    expect(DEFAULT_THEME).toBe("system");
    expect(THEME_CHOICES[0]).toBe("system");
    expect(THEME_CHOICES).toContain("light");
    expect(THEME_CHOICES).toContain(DEFAULT_THEME);
  });

  it("names Night Town as the scheme `system` resolves to after dark", () => {
    // The owner's choice on 2026-09-01, from three candidates rendered on the real surfaces.
    // Asserted rather than assumed: this is a decision, so it fails loudly when it is rewritten.
    expect(SYSTEM_DARK).toBe("night");
    expect(DARK_THEMES).toContain(SYSTEM_DARK);
  });

  it("classifies exactly the dark schemes as dark", () => {
    expect(isDarkTheme("light")).toBe(false);
    for (const dark of DARK_THEMES) expect(isDarkTheme(dark)).toBe(true);
    // `system` is neither, and asking is a category error the type system should already refuse.
    expect(DARK_THEMES).not.toContain("system");
  });

  it("declares a `color-scheme` that makes native controls follow the page", () => {
    // Not decoration: this is what stops a date picker rendering dark on a cream page, and what
    // stops a `<select>` dropdown rendering light on a dark one.
    expect(colorSchemeFor("system")).toBe("light dark");
    expect(colorSchemeFor("light")).toBe("light");
    for (const dark of DARK_THEMES) expect(colorSchemeFor(dark)).toBe("dark");
  });

  it("gives every scheme a label and a note, so a new one cannot ship unexplained", () => {
    for (const choice of THEME_CHOICES) {
      expect(THEME_LABELS[choice], `${choice} needs a label`).toBeTruthy();
      expect(THEME_NOTES[choice], `${choice} needs a note`).toBeTruthy();
    }
    expect(Object.keys(THEME_LABELS).sort()).toEqual([...THEME_CHOICES].sort());
    expect(Object.keys(THEME_NOTES).sort()).toEqual([...THEME_CHOICES].sort());
  });

  it("keeps each note short enough to stay one line in every typeface", () => {
    // PLAN task 49: width-capped prose in a header box occupies a face-dependent number of lines
    // and reflowed every landmark below it. The pixel faces run up to 30% wider per character, so
    // a note that is two lines in IBM Plex is three in Press Start 2P and the header grows.
    for (const choice of THEME_CHOICES) {
      expect(THEME_NOTES[choice].length, `${choice}'s note is too long for the header box`)
        .toBeLessThanOrEqual(80);
    }
  });

  it("names the cookie distinctly enough not to collide with a session cookie", () => {
    expect(THEME_COOKIE).toMatch(/^pl_/u);
    expect(THEME_COOKIE).not.toMatch(/^sb-/u);
    expect(THEME_COOKIE).not.toBe("pl_ui_font");
  });
});

describe("the wire contract", () => {
  it("accepts a known scheme and refuses everything else", () => {
    expect(themePreferenceRequestSchema.parse({ theme: "cellar" })).toEqual({ theme: "cellar" });
    expect(themePreferenceRequestSchema.safeParse({ theme: "dark" }).success).toBe(false);
    expect(themePreferenceRequestSchema.safeParse({}).success).toBe(false);
  });

  it("is strict, so an unknown key is refused rather than quietly dropped", () => {
    // The mirror of the assertion in `tests/ui-font.test.ts`: a caller sending both preferences to
    // one endpoint has a broken model of it, and each route stores exactly one thing.
    expect(themePreferenceRequestSchema.safeParse({ theme: "night", font: "system" }).success).toBe(false);
    expect(themePreferenceResponseSchema.safeParse({ theme: "night", stored: true }).success).toBe(false);
  });
});

describe("what app/globals.css actually declares", () => {
  it("declares a block for every scheme, and a scheme for every block", () => {
    for (const dark of DARK_THEMES) {
      expect(BLOCKS[dark], `${dark} has no [data-theme] block`).toBeTruthy();
    }
    const declared = [...CSS_CODE.matchAll(/:root\[data-theme="([a-z-]+)"\]/gu)].map((m) => m[1]);
    for (const name of new Set(declared)) {
      expect(THEME_CHOICES, `globals.css styles "${name}", which is not a choice`).toContain(name);
    }
  });

  it("gives every scheme exactly the same token set", () => {
    // **A scheme that omits one inherits the light value**, which is how a dark page ends up with
    // one cornsilk surface nobody notices in review. Exactly this set: no more, no less.
    const colours = [...THEME_TOKENS].sort();
    for (const [name, block] of Object.entries(BLOCKS)) {
      const own = Object.keys(block).sort();
      // `:root` additionally carries the layout and typeface tokens; a scheme block carries none.
      const expected = name === "light" ? [...THEME_TOKENS, ...LAYOUT_TOKENS].sort() : colours;
      expect(own, `${name} declares a different token set`).toEqual(expected);
    }
  });

  it("keeps the non-colour tokens out of every scheme block", () => {
    for (const name of [...DARK_THEMES, "system"] as const) {
      for (const layout of LAYOUT_TOKENS) {
        expect(BLOCKS[name], `${name} redeclares --${layout}, which is not about colour`)
          .not.toHaveProperty(layout);
      }
    }
  });

  it("keeps the duplicated Night Town block in step with itself", () => {
    // CSS cannot alias one rule to another and the server never learns `prefers-color-scheme`, so
    // `[data-theme="system"]` under a dark OS repeats Night Town's values verbatim. This is the
    // assertion that makes the duplication safe rather than a latent divergence.
    expect(BLOCKS.system).toEqual(BLOCKS.night);
  });

  it("keeps THEME_GROUNDS equal to the ground each block paints", () => {
    // **The check that was missing on 2026-08-21.** `themeColor` is a `<meta>` value, not a custom
    // property, so a palette change leaves it behind — it sat at the pre-retheme blue-grey for a
    // day across two deployments, and no screenshot can catch it because a headless capture never
    // renders browser chrome (D-137, and the `GOTCHAS.md` trap on colours outside the stylesheet).
    for (const [name, ground] of Object.entries(THEME_GROUNDS)) {
      const block = BLOCKS[name as keyof typeof BLOCKS];
      expect(tokenOf(block, "mist"), `${name}'s themeColor disagrees with --mist`).toBe(ground);
    }
  });

  it("writes no colour literal outside a token block", () => {
    // The `GOTCHAS.md` trap this whole change exists to close: a rule pairing a `var(--…)` surface
    // with a literal `color` is correct in one scheme and unreadable in the other. Eleven of them
    // were live in this file. The guard is a blanket grep and is only worth having while it stays
    // one — hence a single named exception rather than a list that grows.
    let rules = CSS_CODE;
    for (const selector of [":root", ':root[data-theme="night"]', ':root[data-theme="lamplit"]', ':root[data-theme="cellar"]', ':root[data-theme="system"]']) {
      let from = 0;
      for (;;) {
        const at = rules.indexOf(`${selector} {`, from);
        if (at === -1) break;
        const close = rules.indexOf("}", at);
        if (rules.slice(at, close).includes("--mist:")) {
          rules = rules.slice(0, at) + rules.slice(close + 1);
          from = at;
        } else {
          from = close;
        }
      }
    }
    // `white\b` alone matches the `white` in `white-space`, which is a property name and not a
    // colour at all — the lookahead is what makes this a grep for values. Found by the grep
    // reporting eight offenders on a file that had none.
    const offenders = [...rules.matchAll(/[^\w-](#[0-9a-fA-F]{3,8}\b|white\b(?!-)|black\b(?!-))/gu)]
      .map((m) => m[1])
      // An authenticator reads the QR off the screen and a quiet zone is white in every scheme.
      // Tokenising it would make the dark schemes serve an unscannable code.
      .filter((literal) => literal !== "#fff");
    expect(offenders, "promote these to tokens in all four blocks").toEqual([]);
  });

  it("gives the ledger's day heading a surface that is not the ground, and a rule that survives collapse", () => {
    // **Both halves of this rule silently painted nothing until 2026-09-01, each for its own
    // reason, and neither failure is visible in the source.**
    //
    // The background was `var(--mist)`. `.ledger-band` paints no surface, so the table sits
    // straight on `html` — which is *also* `var(--mist)`. The band was the ground's exact colour
    // in all four schemes. The contrast floor at "a panel lifting off the ground" already measures
    // `--paper-strong` against `--mist`, so naming the right token here is the whole assertion:
    // the ratio is somebody else's test.
    //
    // The rule was `1px`, meeting the preceding row's `td { border-bottom: 1px solid var(--line) }`
    // under `border-collapse: collapse`. Equal width and equal style, so the cell higher up wins
    // the tie and the brighter line is discarded. **Anything ≥ 2px wins on width instead**, which
    // is why the number is load-bearing rather than cosmetic — dropping it back to 1px restores the
    // bug with no visible edit, and that is exactly what this pins.
    //
    // Scoped to the desktop rule on purpose. The ≤700px block restates this heading as
    // `display: block` with a 1px border and no background; there no collapse happens, so 1px
    // paints as written and the ground is the right surface for it.
    // **Selected by content, not by file order.** Two rules carry this selector — this one and the
    // ≤700px restatement — so `match` without `g` would pin whichever happens to sit higher in the
    // file, and a mobile-first reshuffle would silently move this assertion onto the phone rule.
    // The phone rule is the one that sets `display: block`; this is the one that does not.
    const rules = [...CSS_CODE.matchAll(/\.ledger-table tr\.day-head th \{([^}]*)\}/gu)]
      .map((m) => m[1] ?? "");
    const rule = rules.find((body) => !body.includes("display: block"));
    expect(rule, "the ledger day heading rule is gone or has been renamed").toBeTruthy();
    expect(rule, "the day heading's band must not be the ground it sits on").toContain("var(--paper-strong)");
    expect(rule, "the day heading must not repaint the ground as its band").not.toContain("var(--mist)");
    const width = Number(rule?.match(/border-top:\s*(\d+)px/u)?.[1]);
    expect(width, "border-top must be ≥2px or border-collapse discards it").toBeGreaterThanOrEqual(2);
  });

  it("only unsticks the ledger's horizontal scroller where the table already fits", () => {
    // **`position: sticky` on the day heading is inert unless `.table-scroll` stops being a scroll
    // container**, because `overflow-x: auto` drags the other axis to `auto` with it and that
    // container — which has no height of its own and so never scrolls vertically — becomes the
    // sticky scrollport. Measured on the deployment: sticky alone moved the heading the full 500px
    // of a 500px scroll.
    //
    // **But removing it below the width the table fits in makes the whole page scroll sideways**,
    // which is the one thing `.table-scroll` exists to prevent and which the phone audit forbids
    // outright. So the pairing is the invariant: `overflow: visible` and `position: sticky` must
    // live in the same width-gated block, at a floor at or above the measured threshold.
    //
    // The threshold was read off the real ledger, not derived — the shell's gutter scales with the
    // viewport, and the arithmetic that assumed it fixed was wrong by 200px. The page still
    // overflows at 1320px and no longer does at 1360px; the floor asserted here is 1400px.
    const block = CSS_CODE.match(/@media \(min-width:\s*(\d+)px\)\s*\{([\s\S]*?)\n\}/gu)
      ?.map((b) => ({
        floor: Number(b.match(/min-width:\s*(\d+)px/u)?.[1]),
        body: b
      }))
      .find((b) => b.body.includes(".table-scroll") && b.body.includes("overflow: visible"));
    expect(block, "the ledger's sticky day heading block is gone or has been renamed").toBeTruthy();
    expect(block?.floor, "unsticking the scroller below ~1360px scrolls the page sideways")
      .toBeGreaterThanOrEqual(1400);
    expect(block?.body, "overflow: visible without sticky leaves the change pointless")
      .toContain("position: sticky");
    // The collapsed border does not travel with a pinned cell, so the rule has to be redrawn on the
    // cell itself. Losing this shadow means the pinned heading arrives with no rule above it.
    expect(block?.body, "the pinned heading needs its rule redrawn as an inset shadow")
      .toContain("inset 0 2px 0 var(--navy)");
    // **Scope, which the first draft of this test did not pin.** Five other surfaces share
    // `.table-scroll` — the slips list, the import review and three statistics tables — and an
    // unscoped rule takes the scroller off all of them to give the ledger a sticky heading. They
    // all sit under 1280px so it would look fine today and bite the first wider table added later.
    expect(block?.body, "unstick only the scroller that holds the ledger table")
      .toContain(".table-scroll:has(> .ledger-table)");
    // The first heading sits under the `thead`'s own border and has never drawn a rule; the inset
    // shadow would give it one, a pixel below the line already there.
    expect(block?.body, "the first day heading must not gain a second rule from the shadow")
      .toMatch(/tr\.day-head:first-child th \{ box-shadow: 0 1px 0 var\(--line\); \}/u);
  });
});

describe("what every scheme measures", () => {
  it.each(Object.keys(BLOCKS).filter((name) => name !== "system"))(
    "%s clears every contrast floor",
    (name) => {
      const failures = pairs(BLOCKS[name as keyof typeof BLOCKS])
        .filter(([, fg, bg, floor]) => contrast(fg, bg) < floor)
        .map(([label, fg, bg, floor]) => `${label}: ${contrast(fg, bg).toFixed(2)} < ${floor}`);
      expect(failures).toEqual([]);
    }
  );

  it("holds every dark scheme to at least daylight's text contrast on the ground", () => {
    // The claim a reader of `DESIGN.md` should be able to rely on: choosing a dark scheme is never
    // a legibility trade. Body text only — the decorative pairs are allowed to differ.
    const daylight = contrast(tokenOf(BLOCKS.light, "navy"), tokenOf(BLOCKS.light, "mist"));
    for (const dark of DARK_THEMES) {
      const t = BLOCKS[dark];
      expect(contrast(tokenOf(t, "navy"), tokenOf(t, "mist")), `${dark} reads worse than daylight`)
        .toBeGreaterThanOrEqual(daylight);
    }
  });

  it("dims the page behind a dialog rather than brightening it", () => {
    // **Found by review, and it is the inversion trap in its subtler form.**
    // `.detail-dialog::backdrop` mixed `--navy` — the *text* colour — at 65%. Correct in daylight,
    // where the ink is near-black; exactly backwards in every dark scheme, where it is near-white.
    // Measured before the fix: 19% luminance in daylight against **38% in all three darks**, so
    // opening a dialog washed the page lighter than the app behind it, in the scheme that exists
    // for reading in a dark room. No contrast floor catches this — both states have plenty of
    // contrast — so the assertion has to be about direction, not amount.
    for (const [name, t] of Object.entries(BLOCKS)) {
      const ground = tokenOf(t, "mist");
      const behind = mix(tokenOf(t, "scrim"), 65, ground);
      expect(luminance(behind), `${name}'s dialog backdrop brightens the page instead of dimming it`)
        .toBeLessThan(luminance(ground));
    }
  });

  it("keeps the two chart series apart in every scheme", () => {
    // Distance in sRGB rather than a contrast ratio: two marks of similar lightness are *supposed*
    // to have a low ratio to each other — the light palette's validated pair measures 1.83 — so a
    // contrast floor is the wrong instrument and would fail the shipped scheme.
    for (const [name, t] of Object.entries(BLOCKS)) {
      const [r1, g1, b1] = channels(tokenOf(t, "chart-in"));
      const [r2, g2, b2] = channels(tokenOf(t, "chart-out"));
      const distance = Math.hypot(r1 - r2, g1 - g2, b1 - b2);
      expect(distance, `${name}'s two series are too close`).toBeGreaterThan(100);
    }
  });
});
