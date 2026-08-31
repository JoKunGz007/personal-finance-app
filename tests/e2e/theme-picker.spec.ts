import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import {
  DARK_THEMES,
  DEFAULT_THEME,
  SYSTEM_DARK,
  THEME_GROUNDS,
  THEME_NOTES,
  type ThemeChoice
} from "@/lib/ui-theme";

/**
 * The colour scheme switch, driven in a real browser (2026-09-01, reversing D-137).
 *
 * **This suite exists because the unit tests cannot reach the mechanism.**
 * `tests/ui-theme.test.ts` holds the closed set and measures every declared scheme against its
 * floors — which is the half that matters for untrusted input and for contrast. But the cookie is
 * `httpOnly`, the attribute is applied by the **root layout** re-rendering on `router.refresh()`,
 * and `prefers-color-scheme` is a device fact no unit test has. Those are framework and browser
 * behaviours, so the only honest way to know they work is to watch them happen.
 *
 * The parallel with `tests/e2e/font-picker.spec.ts` is deliberate and so is the duplication: the two
 * controls share `.ui-picker` in CSS and nothing else, and a shared spec helper would couple the
 * next change to one of them to the other.
 */

const HTML = "html";

/** Opens the header's Settings panel if this viewport keeps one closed (see the font spec). */
async function openHeaderPanel(page: import("@playwright/test").Page) {
  const toggle = page.getByRole("button", { name: "Settings" });
  if (await toggle.isVisible() && await toggle.getAttribute("aria-expanded") === "false") {
    await toggle.click();
  }
}

async function pick(page: import("@playwright/test").Page, theme: ThemeChoice) {
  await openHeaderPanel(page);
  await page.getByLabel("Colours").selectOption(theme);
  await expect(page.locator(`html[data-theme="${theme}"]`)).toBeVisible({ timeout: 15_000 });
}

/** What the page is actually painted, rather than what the stylesheet was asked for. */
function groundOf(page: import("@playwright/test").Page) {
  return page.locator("body").evaluate((node) => getComputedStyle(node).backgroundColor);
}

/** `#1e2440` as the `rgb(30, 36, 64)` a computed style reports. */
function asRgb(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * The select is named "Colours" and nothing else — the assertion no accessibility scanner makes.
 *
 * Its `(i)` is a **sibling** of the `<label>`, never a child: a `<label>`'s accessible name is
 * computed from its subtree, so a disclosure inside it would make the select announce as
 * *"Colours About these colours"* and, once open, the whole note as well. **axe reports no violation
 * for this** — the name is non-empty and contains the visible text — so a green pass on every route
 * says nothing about it, and `exact: true` is the only form that catches it. The font picker shipped
 * exactly this defect once (D-156).
 */
test("names the colour select and nothing more", async ({ page }) => {
  await page.goto("/ledger");
  await openHeaderPanel(page);
  await expect(page.getByRole("combobox", { name: "Colours", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "About these colours" }).click();
  await expect(page.getByText(THEME_NOTES[DEFAULT_THEME])).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Colours", exact: true })).toBeVisible();
});

/**
 * **Adding a second picker must not make the first one ambiguous.**
 *
 * Both are a `<label>` wrapping a `<select>` inside `.ui-picker`, and the browser suite locates the
 * typeface by accessible name. If the two names ever collide — or if one control's disclosure joins
 * the other's name — every assertion in `font-picker.spec.ts` starts failing on a change that has
 * nothing to do with typefaces. The `GOTCHAS.md` entries about a second `role="status"` breaking
 * unrelated specs are the same failure in a different costume.
 */
test("leaves the typeface picker unambiguous", async ({ page }) => {
  await page.goto("/ledger");
  await openHeaderPanel(page);
  await expect(page.getByRole("combobox", { name: "Typeface", exact: true })).toHaveCount(1);
  await expect(page.getByRole("combobox", { name: "Colours", exact: true })).toHaveCount(1);
});

test("applies a scheme, and remembers it across a reload", async ({ page }) => {
  await page.goto("/ledger");
  await expect(page.locator(HTML), "a device with no cookie follows its own OS")
    .toHaveAttribute("data-theme", DEFAULT_THEME);

  await pick(page, "cellar");
  await expect(page.getByLabel("Colours")).toHaveValue("cellar");
  expect(await groundOf(page), "the ground must be the one the scheme declares")
    .toBe(asRgb(THEME_GROUNDS.cellar));

  // The whole point of a cookie over per-visit state.
  await page.reload();
  await expect(page.locator(HTML), "it must survive a reload or it is not a setting")
    .toHaveAttribute("data-theme", "cellar");
  expect(await groundOf(page)).toBe(asRgb(THEME_GROUNDS.cellar));
});

/**
 * Every scheme paints the ground it says it does, in the browser rather than in a parsed stylesheet.
 *
 * `tests/ui-theme.test.ts` reads the values out of `globals.css` as text, which cannot tell whether
 * a later rule overrides one or whether a block's selector matches anything at all. This can.
 */
for (const theme of ["light", ...DARK_THEMES] as const) {
  test(`paints the declared ground in ${theme}`, async ({ page }) => {
    await page.goto("/ledger");
    await pick(page, theme);
    expect(await groundOf(page)).toBe(asRgb(THEME_GROUNDS[theme]));
  });
}

/**
 * **`system` follows the device, which is the one behaviour a pinned scheme cannot demonstrate.**
 *
 * Emulated rather than argued: the media query is the only path by which `[data-theme="system"]`
 * ever becomes dark, and it is also the duplicated Night Town block — so this is the browser-side
 * half of the parity assertion in the unit suite.
 */
test("resolves `system` from the device, both ways", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/ledger");
  await pick(page, "system");
  expect(await groundOf(page), "a light device gets daylight").toBe(asRgb(THEME_GROUNDS.light));

  await page.emulateMedia({ colorScheme: "dark" });
  expect(await groundOf(page), `a dark device gets ${SYSTEM_DARK}`)
    .toBe(asRgb(THEME_GROUNDS[SYSTEM_DARK]));

  // A pinned scheme must beat the device, or "Daylight" on a dark-OS phone would do nothing.
  await pick(page, "light");
  expect(await groundOf(page), "an explicit choice overrides the device")
    .toBe(asRgb(THEME_GROUNDS.light));
  await page.emulateMedia({ colorScheme: null });
});

test("refuses a scheme it does not offer, and keeps the stored one", async ({ page }) => {
  await page.goto("/ledger");
  const status = await page.evaluate(async () => {
    const response = await fetch("/api/v1/ui/theme", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ theme: "dark" })
    });
    return response.status;
  });
  expect(status, "`dark` is plausible and is not one of the five").toBe(422);
  await expect(page.locator(HTML)).toHaveAttribute("data-theme", DEFAULT_THEME);
});

test("refuses a body carrying a key this endpoint does not have", async ({ page }) => {
  // The mirror of the font route's own assertion: each endpoint stores exactly one preference.
  await page.goto("/ledger");
  const status = await page.evaluate(async () => {
    const response = await fetch("/api/v1/ui/theme", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ theme: "night", font: "system" })
    });
    return response.status;
  });
  expect(status).toBe(422);
});

/**
 * **No scheme may push the page wider than the screen**, on the same reasoning as the typeface
 * check beside it: the header gained a second control, and a phone is where that bites first.
 * `clientWidth`, never `innerWidth` — a phone widens its layout viewport to contain an overflow, so
 * comparing `scrollWidth` to `innerWidth` is the same number twice (D-138).
 */
for (const theme of ["light", ...DARK_THEMES] as const) {
  test(`keeps the page inside the viewport in ${theme}`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "the overflow only bites at a phone width");
    await page.goto("/ledger");
    await pick(page, theme);
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth
    }));
    expect(scrollWidth, `${theme} pushes the document to ${scrollWidth}px inside ${clientWidth}px`)
      .toBeLessThanOrEqual(clientWidth);
  });
}

/**
 * **axe, in each dark scheme — the check `GOTCHAS.md` records as never having run.**
 *
 * The trap "a token that inverts between colour schemes makes every hardcoded partner a latent
 * failure" ends with the sentence that matters here: *"Neither browser suite's axe check caught
 * them: they run in the default scheme."* Three white-on-brightened-copper pairings shipped behind
 * a fully green accessibility pass in 2026-08-21 for exactly that reason. Every existing axe test
 * in this repo still runs in whatever scheme the device defaults to, so without this one the three
 * dark schemes would be as unscanned as the dark block was then.
 *
 * `tests/ui-theme.test.ts` measures the contrast of the tokens; this measures what the tokens
 * actually paint, which is the part a stylesheet parse cannot see.
 */
for (const theme of DARK_THEMES) {
  test(`has no detectable accessibility violations in ${theme}`, async ({ page }) => {
    await page.goto("/ledger");
    await pick(page, theme);
    for (const path of ["/ledger", "/import", "/slips", "/statistics", "/recovery"]) {
      await page.goto(path);
      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations, `accessibility violations on ${path} in ${theme}`).toEqual([]);
    }
  });
}

/**
 * **Changing the scheme moves nothing**, which is the colour half of PLAN task 49's promise.
 *
 * A colour cannot reflow a box on its own — but a *token* can, because several of them are painted
 * as borders and box-shadows, and one written as a width or an inset would. This is cheap insurance
 * against a future scheme block quietly carrying a non-colour declaration; the unit suite forbids
 * that textually and this catches it in layout.
 */
test("switching the scheme moves nothing on the page", async ({ page }) => {
  await page.goto("/ledger");
  const measure = () => page.evaluate(() => {
    const header = document.querySelector("header.site-header")!;
    const heights: Record<string, number> = {};
    for (const el of header.querySelectorAll(":scope > *, :scope > .header-panel > *, :scope > .header-toggle > *")) {
      heights[el.className || el.tagName.toLowerCase()] = Math.round(el.getBoundingClientRect().height);
    }
    return { header: Math.round(header.getBoundingClientRect().height), heights };
  });

  const readings: Record<string, Awaited<ReturnType<typeof measure>>> = {};
  for (const theme of ["light", ...DARK_THEMES] as const) {
    await pick(page, theme);
    readings[theme] = await measure();
  }

  const base = readings.light!;
  for (const theme of DARK_THEMES) {
    const here = readings[theme]!;
    expect(here.header, `${theme}: the header is ${here.header}px against ${base.header}px in daylight`)
      .toBe(base.header);
    for (const [part, height] of Object.entries(base.heights)) {
      expect(here.heights[part], `${theme}: .${part} is ${here.heights[part]}px against ${height}px in daylight`)
        .toBe(height);
    }
  }
});
