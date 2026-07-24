import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

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
