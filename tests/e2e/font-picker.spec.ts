import { expect, test } from "@playwright/test";
import { DEFAULT_FONT, FONT_CHOICES, FONT_NOTES, type FontChoice } from "@/lib/ui-font";

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

/**
 * Opens the header's Settings panel if this viewport keeps one closed.
 *
 * The picker moved behind a disclosure on phones (PLAN task 42), because the header was taking most
 * of the first screen there before any page's own heading began. Above 700px the toggle is
 * `display: none` and this does nothing — which is why it is a visibility check rather than a
 * project-name check: the breakpoint is the CSS's business, not this spec's.
 */
async function openHeaderPanel(page: import("@playwright/test").Page) {
  const toggle = page.getByRole("button", { name: "Settings" });
  if (await toggle.isVisible() && await toggle.getAttribute("aria-expanded") === "false") {
    await toggle.click();
  }
}

async function pick(page: import("@playwright/test").Page, font: FontChoice) {
  await openHeaderPanel(page);
  await page.getByLabel("Typeface").selectOption(font);
  await expect(page.locator(`html[data-font="${font}"]`)).toBeVisible({ timeout: 15_000 });
}

/**
 * The select is named "Typeface" and nothing else — the assertion no accessibility scanner makes.
 *
 * The picker's `(i)` was first written **inside** the `<label>`, which is the defect
 * `app/ledger-note.tsx` documents in its own docblock: a `<label>`'s accessible name is computed
 * from its subtree, so the button's `sr-only` text joined it and the select announced as
 * *"Typeface About this typeface"* — plus the whole note once the panel was open. **axe reports no
 * violation for this**, because the name is non-empty and contains the visible text, so a green
 * accessibility pass on every route says nothing about it. Only reading the computed name finds it,
 * and `exact: true` is the only form that does. It also breaks the HTML content model, since a
 * `<button>` is labelable and a label may hold only its own control.
 */
test("names the typeface select and nothing more", async ({ page }) => {
  await page.goto("/ledger");
  await openHeaderPanel(page);
  await expect(page.getByRole("combobox", { name: "Typeface", exact: true })).toBeVisible();
  // Open the panel and re-check: the disclosed copy is what joined the name in the broken version,
  // and only once it was open. A closed-panel-only assertion would have passed against the defect.
  await page.getByRole("button", { name: "About this typeface" }).click();
  await expect(page.getByText(FONT_NOTES[DEFAULT_FONT])).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Typeface", exact: true })).toBeVisible();
});

test("applies a typeface, and remembers it across a reload", async ({ page }) => {
  await page.goto("/ledger");
  // **Named symbolically, not literally.** This read `"system"` until 2026-08-29 and broke when
  // the owner made Pixelify Sans the default (D-169) - the assertion meant *the default* all along,
  // and spelling it as one face made a decision elsewhere look like a regression here.
  await expect(page.locator(HTML), "a device with no cookie gets the default face")
    .toHaveAttribute("data-font", DEFAULT_FONT);

  await pick(page, "press-start-2p");
  await expect(page.getByLabel("Typeface")).toHaveValue("press-start-2p");

  // The whole point of a cookie over per-visit state.
  await page.reload();
  await expect(page.locator(HTML), "it must survive a reload or it is not a setting")
    .toHaveAttribute("data-font", "press-start-2p");
  // The disclosure is per-visit state and the face is not: the panel closes on reload and the
  // typeface does not, which is the distinction the cookie exists to make.
  await openHeaderPanel(page);

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
  await expect(page.locator(HTML)).toHaveAttribute("data-font", DEFAULT_FONT);
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

/**
 * PLAN task 49 — **nothing reflows when the face changes**.
 *
 * The owner asked that switching the typeface not move the page. **"Identical positions" is not
 * reachable and was never the goal**: `size-adjust` (D-157) pins cap height and not advance width,
 * so a face that is far wider per character wraps text differently however the descriptors are set.
 * What is reachable is that no *box* changes height — a difference inside a container cannot then
 * move anything outside it.
 *
 * **The remedy was chosen by measurement and it is not the one that was proposed.** Task 49 planned
 * to pin the vertical box with `ascent-override`, `descent-override` and `line-gap-override`. The
 * measurement said those would fix nothing: every line height in this stylesheet is written as an
 * explicit ratio in the `font:` shorthand, so a font's own ascent and descent never reach layout,
 * and the four faces' page geometry was identical on both routes to the pixel — **except the
 * header**. `.header-side` measured 71px in IBM Plex against 88px in Press Start 2P, pushing every
 * landmark below it down 16-17px, and the cause was a width-capped sentence occupying a
 * face-dependent number of lines. Folding it behind the `(i)` (D-156's own rule) removed the last
 * difference and took 23px off the header in *every* face as well.
 *
 * Asserted here rather than left in `.runtime/` because a throwaway proves it once. Signed out is
 * the right state for it: the header is what reflowed, and it is on every route in every session.
 */
test("switching the typeface moves nothing on the page", async ({ page }) => {
  await page.goto("/ledger");

  const measure = () => page.evaluate(() => {
    const header = document.querySelector("header.site-header")!;
    // `.header-toggle` and `.header-panel` are `display: contents` above 700px (D-157), so their
    // children are the header's real flex items and listing `header.children` alone reports two
    // zero-sized wrappers. **Carried into the failure message on purpose**: "the header is 162px
    // against 118px" says a box grew and not which one, and the remedies differ per child.
    const parts = [...header.querySelectorAll(":scope > *, :scope > .header-panel > *, :scope > .header-toggle > *")]
      .map((el) => {
        const box = el.getBoundingClientRect();
        const top = Math.round(box.top - header.getBoundingClientRect().top);
        return `${el.className || el.tagName.toLowerCase()}[y${top} h${Math.round(box.height)} w${Math.round(box.width)}]`;
      })
      .join(" ");
    const heights: Record<string, number> = {};
    for (const el of header.querySelectorAll(":scope > *, :scope > .header-panel > *, :scope > .header-toggle > *")) {
      heights[el.className || el.tagName.toLowerCase()] = Math.round(el.getBoundingClientRect().height);
    }
    return {
      header: Math.round(header.getBoundingClientRect().height),
      heights,
      parts
    };
  });

  const readings: Record<string, Awaited<ReturnType<typeof measure>>> = {};
  for (const font of FONT_CHOICES) {
    await pick(page, font);
    // **`document.fonts.ready` alone is a race and this test caught it being one.** A browser
    // requests a face only once something uses it, so the moment after `router.refresh()` applies
    // `data-font` there may be no pending load yet — `ready` resolves immediately, the fallback's
    // geometry is measured, and the run passes or fails depending on timing. It did both.
    // Asking for the resolved stack by name starts the load and waits for that load.
    await page.evaluate(async () => {
      const stack = getComputedStyle(document.documentElement).getPropertyValue("--font-body").trim();
      await document.fonts.load(`16px ${stack}`);
      await document.fonts.ready;
    });
    readings[font] = await measure();
  }

  const base = readings.system!;
  for (const font of FONT_CHOICES) {
    const here = readings[font]!;
    for (const [part, height] of Object.entries(base.heights)) {
      expect(here.heights[part], `${font}: .${part} is ${here.heights[part]}px against ${height}px in system\n  ${font}: ${here.parts}\n  system: ${base.parts}`).toBe(height);
    }
  }
});
