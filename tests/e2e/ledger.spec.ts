import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("offers no development sign-in in a build that did not opt into one", async ({ page }) => {
  // This config builds without NEXT_PUBLIC_ALLOW_DEV_OWNER_SESSION, so the branch in
  // ledger-app.tsx is never taken and no such control is rendered (D-036).
  //
  // Note what this does and does not say. The bundler inlines the missing variable as
  // `undefined`, which fails the comparison — it does not eliminate the string literal,
  // so "Dev sign-in" is still findable inside the JavaScript chunk. Nothing renders it,
  // and the route answers 404 without the same flag, but a build is not free of the text.
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Dev sign-in" })).toHaveCount(0);
});

test("reviews and confirms the synthetic statement without a PDF", async ({ page }) => {
  await page.goto("/");
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
  await page.goto("/");
  await page.getByRole("button", { name: "Use synthetic statement" }).click();
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});
