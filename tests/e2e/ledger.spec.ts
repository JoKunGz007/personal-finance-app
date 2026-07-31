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
    ["Import", "/import", "Open a statement locally"],
    ["Slips", "/slips", "Capture a transfer slip"],
    ["Recovery", "/recovery", "Back up and restore the ledger"],
    ["Ledger", "/ledger", "Confirmed transactions"]
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
