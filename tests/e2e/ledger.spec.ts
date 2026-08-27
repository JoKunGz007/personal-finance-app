import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("sends the root at the ledger and offers no development sign-in", async ({ page }) => {
  // `/` is a redirect rather than a fifth surface, so there is one canonical URL per route
  // (PLAN task 19). Asserted here because a redirect that silently stops working looks like
  // a blank page rather than like a routing defect.
  await page.goto("/");
  await expect(page).toHaveURL(/\/ledger$/u);

  // This config builds without NEXT_PUBLIC_ALLOW_DEV_OWNER_SESSION, so the branch in
  // app/site-header.tsx is never taken and no such control is rendered (D-036). It moved to
  // the shell with routing, so it is now absent from every route rather than from one page.
  //
  // Note what this does and does not say. The bundler inlines the missing variable as
  // `undefined`, which fails the comparison — it does not eliminate the string literal,
  // so "Dev sign-in" is still findable inside the JavaScript chunk. Nothing renders it,
  // and the route answers 404 without the same flag, but a build is not free of the text.
  await expect(page.getByRole("button", { name: "Dev sign-in" })).toHaveCount(0);
  await page.goto("/import");
  await expect(page.getByRole("button", { name: "Dev sign-in" })).toHaveCount(0);
});

test("reaches every route from the header, without a signed-in owner", async ({ page }) => {
  // The nav is the whole point of task 19's routing half: reaching the ledger used to mean
  // scrolling past the import bench. Each link must land on its own surface, and the one the
  // owner is on must say so — `aria-current` is what a screen reader has to go on.
  await page.goto("/ledger");
  // Scoped to the nav and matched exactly: the brand link is "Private Ledger home", so a
  // loose match on "Ledger" resolves to two elements.
  const nav = page.getByRole("navigation", { name: "Sections" });
  for (const [label, path, heading] of [
    ["Statistics", "/statistics", "Statistics"],
    ["Import", "/import", "Open a statement locally"],
    ["Slips", "/slips", "Capture a transfer slip"],
    ["Recovery", "/recovery", "Back up and restore the ledger"],
    ["Ledger", "/ledger", "Transactions"]
  ] as const) {
    const link = nav.getByRole("link", { name: label, exact: true });
    await link.click();
    await expect(page).toHaveURL(new RegExp(`${path}$`, "u"));
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    await expect(link).toHaveAttribute("aria-current", "page");
  }
});

test("reviews and confirms the synthetic statement without a PDF", async ({ page }) => {
  await page.goto("/import");
  await page.getByRole("button", { name: "Use synthetic statement" }).click();
  await expect(page.getByRole("heading", { name: /Synthetic current account/ })).toBeVisible();
  await expect(page.getByText("Reconciliation resumes at row 4")).toBeVisible();
  await page.getByRole("button", { name: /View source details for Synthetic salary/ }).click();
  await expect(page.getByRole("dialog")).toContainText("Immutable source facts");
  await page.getByRole("button", { name: "Close transaction details" }).click();
  await page.getByRole("button", { name: "Confirm synthetic batch" }).click();
  await expect(page.getByText("The synthetic preview has changed")).toBeVisible();
});

/**
 * The standing copy behind the `(i)` (PLAN task 42).
 *
 * The owner's complaint was that this page read "like an ad for a product, not the product
 * itself". The remedy was not deletion — every sentence moved is still true and still worth
 * having once — but disclosure, so the table is what the page opens with.
 *
 * **A button and not a tooltip**, which is why this is a browser test rather than a unit one:
 * hover does not exist on the phone this ledger is read on, and `title` reaches neither the
 * keyboard nor a screen reader reliably. The signed-out page carries three of these, so it can
 * be checked without a session.
 */
test("folds the standing copy behind a disclosure the keyboard can reach", async ({ page }) => {
  await page.goto("/ledger");

  const toggle = page.getByRole("button", { name: "About this ledger" });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");

  // Not merely hidden with CSS: the collapsed copy is out of the document, so no screen reader
  // announces it as though it were on the page.
  await expect(page.getByText(/computed over whole accounts/)).toHaveCount(0);

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByText(/computed over whole accounts/)).toBeVisible();

  await toggle.click();
  await expect(page.getByText(/computed over whole accounts/)).toHaveCount(0);

  // Each one names what it explains. Three buttons called "More" would be three identical rows
  // in a screen reader's list of controls.
  for (const name of ["About this ledger", "About these transactions", "About cash entries"]) {
    await expect(page.getByRole("button", { name })).toHaveCount(1);
  }
});

/**
 * The `(i)` must not be inside the heading it explains, and `exact` is what says so.
 *
 * **A descendant's accessible name joins its ancestor's.** The first version of this put the
 * button in the `<h2>`, and because that heading is the `aria-labelledby` target for its
 * `<section>`, the button's label — and the whole disclosed paragraph once open — became part of
 * the name of both the heading and the landmark: `"Transactions About these transactions
 * Everything committed to the ledger…"`. **axe reports no violation for it**, since the name is
 * non-empty and contains the visible text, so the accessibility sweep three tests below passes
 * either way. Only the computed name catches it, which is what `exact: true` checks here.
 */
test("keeps the disclosure out of the name of the heading and the landmark", async ({ page }) => {
  await page.goto("/ledger");

  const heading = page.getByRole("heading", { name: "Transactions", exact: true });
  const region = page.getByRole("region", { name: "Transactions", exact: true });
  await expect(heading).toHaveCount(1);
  await expect(region).toHaveCount(1);

  // And still exact with the panel open, which is the case that was worst: the paragraph itself
  // was being read back as the name of the region.
  await page.getByRole("button", { name: "About these transactions" }).click();
  await expect(page.getByText(/Source facts are immutable here/)).toBeVisible();
  await expect(heading).toHaveCount(1);
  await expect(region).toHaveCount(1);
});

/**
 * Signed out is not a failure (PLAN task 43).
 *
 * The ledger loads on arrival, so a visitor who is not signed in now issues a request before
 * touching anything, and `strongOwnerClient` answers it 401 — correctly. Reporting that as
 * "Not loaded" would put a red alert on the first surface anyone sees, describing a route
 * working exactly as designed.
 */
test("says why the ledger is empty when signed out, without raising an alert", async ({ page }) => {
  await page.goto("/ledger");

  const ledger = page.locator("section.ledger-band");
  await expect(ledger.getByText("Sign in to read the ledger.")).toBeVisible();
  // Scoped to the section, because Next.js mounts its own empty `role="alert"` route announcer
  // outside the app tree and a page-wide count finds that instead of anything this app rendered.
  await expect(ledger.getByRole("alert")).toHaveCount(0);
  await expect(ledger.getByText("Not loaded")).toHaveCount(0);
});

test("review has no automatically detectable accessibility violations", async ({ page }) => {
  await page.goto("/import");
  await page.getByRole("button", { name: "Use synthetic statement" }).click();
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test("every route has no automatically detectable accessibility violations", async ({ page }) => {
  // Routing multiplied the surfaces an audit has to cover: three of these four never
  // rendered without the import bench above them before, and the shared header is now on
  // all of them.
  for (const path of ["/ledger", "/import", "/slips", "/recovery"]) {
    await page.goto(path);
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations, `accessibility violations on ${path}`).toEqual([]);
  }
});
