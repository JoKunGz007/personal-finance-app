import { expect, test } from "@playwright/test";
import { FONT_CHOICES, type FontChoice } from "@/lib/ui-font";

/**
 * The typeface switch, driven in a real browser (D-153, `PLAN.md` task 42).
 *
 * **This suite exists because the unit tests cannot reach the mechanism.** `tests/ui-font.test.ts`
 * holds the closed set, which is the half that matters for untrusted input — but the cookie is
 * `httpOnly` and the face is applied by the **root layout** re-rendering on `router.refresh()`.
 * That is a framework behaviour rather than app code, so the only honest way to know it works is to
 * watch it happen. A first draft of these tests lived under `.runtime/` and was therefore
 * gitignored: the one check covering the mechanism was outside the repo, which is the "committed
 * spec gap" `PLAN.md` names in another form.
 */

const HTML = "html";

async function pick(page: import("@playwright/test").Page, font: FontChoice) {
  await page.getByLabel("Typeface").selectOption(font);
  await expect(page.locator(`html[data-font="${font}"]`)).toBeVisible({ timeout: 15_000 });
}

test("applies a typeface, and remembers it across a reload", async ({ page }) => {
  await page.goto("/ledger");
  await expect(page.locator(HTML), "a device with no cookie gets the legible default")
    .toHaveAttribute("data-font", "system");

  await pick(page, "press-start-2p");
  await expect(page.getByLabel("Typeface")).toHaveValue("press-start-2p");

  // The whole point of a cookie over per-visit state.
  await page.reload();
  await expect(page.locator(HTML), "it must survive a reload or it is not a setting")
    .toHaveAttribute("data-font", "press-start-2p");

  const family = await page.locator("body").evaluate((node) => getComputedStyle(node).fontFamily);
  expect(family, "the chosen face must lead the stack").toContain("Press Start 2P");
  // **Load-bearing.** Every pixel face is Latin-only, and Thai reaches this app as statement data.
  // Drop this fallback and those cells go to whatever the device happens to have.
  expect(family, "Thai must still have a face behind it").toContain("IBM Plex Sans Thai");
});

test("refuses a typeface it does not offer, and keeps the stored one", async ({ page }) => {
  await page.goto("/ledger");
  const status = await page.evaluate(async () => {
    const response = await fetch("/api/v1/ui/font", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ font: "comic-sans" })
    });
    return response.status;
  });
  expect(status, "an unknown face is a refusal, not a stored value").toBe(422);
  await expect(page.locator(HTML)).toHaveAttribute("data-font", "system");
});

test("refuses a body carrying a key this endpoint does not have", async ({ page }) => {
  // Strict on purpose: a caller sending `{font, theme}` has a broken model of this endpoint, and
  // answering it as though the extra key were fine is how a second preference gets half-built.
  await page.goto("/ledger");
  const status = await page.evaluate(async () => {
    const response = await fetch("/api/v1/ui/font", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ font: "system", theme: "dark" })
    });
    return response.status;
  });
  expect(status).toBe(422);
});

/**
 * **No face may push the page wider than the screen, and this is the guard D-138 did not have.**
 *
 * The ledger table escaped a real phone once and no suite could see it, because nothing measured.
 * Switching typefaces re-opens exactly that risk from a new direction: a pixel face is far wider per
 * glyph, and the shell header grew from 455px to 734px at a 390px viewport before `flex-wrap` was
 * added — at which point the whole page shrink-to-fits and every glyph gets *smaller*, the opposite
 * of what the trial is for. Measured per face rather than argued, and on the mobile project where it
 * actually bites.
 */
for (const font of FONT_CHOICES) {
  test(`keeps the page inside the viewport in ${font}`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "the overflow only bites at a phone width");
    await page.goto("/ledger");
    await pick(page, font);

    const { scrollWidth, clientWidth, innerWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      innerWidth: window.innerWidth
    }));

    // **`clientWidth`, never `innerWidth`.** A first draft compared `scrollWidth` against
    // `innerWidth` and passed with the defect fully present, because that is the same number twice:
    // when the content overflows, the phone widens its *layout* viewport to fit and `innerWidth`
    // grows with it. Measured on this page in Press Start 2P before the fix: `scrollWidth` 504,
    // `innerWidth` 504 — and `clientWidth` still 390, which is the only one that stayed honest.
    // Same family as the GOTCHAS trap about asserting a scrolled element sits near the viewport top:
    // a ratio that adjusts to the thing it is checking cannot fail.
    expect(scrollWidth, `${font} pushes the document to ${scrollWidth}px inside a ${clientWidth}px viewport (innerWidth reports ${innerWidth}px, which is the shrink-to-fit and not a reference)`)
      .toBeLessThanOrEqual(clientWidth);
  });
}
