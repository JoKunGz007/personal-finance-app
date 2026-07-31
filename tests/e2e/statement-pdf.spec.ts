import { expect, test } from "@playwright/test";
import { kbankStatement, scbStatement } from "../fixtures/statement-layouts";
import { buildStatementPdf } from "../fixtures/synthetic-pdf";

// The SCB and KBANK readers decide which of two money sub-columns a figure sits in from
// the *right edge* pdf.js reports for its run (D-039). Every unit test supplies that width
// itself, so none of them touches the one number the whole direction check depends on —
// the same gap D-027 found in the Krungthai suite, where 27 green tests never ran pdf.js
// once.
//
// These two put a generated PDF through the real browser worker. The fixtures take their
// glyph advance from the PDF generator, so a rendered run's right edge is the one the
// fixture placed; if that coupling ever breaks, the money columns smear by two units per
// character and these fail while the unit suite stays green.
//
// Both PDFs are generated from invented geometry, per docs/FIXTURE_POLICY.md.

const UNLOCK = "synthetic-unlock-not-a-real-password";

async function readPdf(page: import("@playwright/test").Page, name: string, bytes: Uint8Array) {
  await page.goto("/import");
  await page.locator('input[name="statement-pdf"]').setInputFiles({
    name, mimeType: "application/pdf", buffer: Buffer.from(bytes)
  });
  await page.locator('input[name="statement-unlock-code"]').fill(UNLOCK);
  await page.getByRole("button", { name: "Unlock & check layout" }).click();
}

test("reads a synthetic SCB PDF through the real pdf.js worker", async ({ page }, testInfo) => {
  const noise: string[] = [];
  page.on("console", (message) => noise.push(`${message.type()}: ${message.text()}`));
  page.on("pageerror", (error) => noise.push(`pageerror: ${error.message}`));

  await readPdf(page, "synthetic-scb.pdf", buildStatementPdf(scbStatement));

  const status = page.getByRole("status");
  try {
    // Three invented rows across two invented pages. Reaching this at all means the two
    // money columns were separated from widths the browser measured, not ones a fixture
    // asserted — a misread there fails the row's direction against the balance chain, or
    // fails the cluster check, long before it reaches a row count.
    await expect(status).toContainText("Read 3 rows across 2 page(s)", { timeout: 10_000 });
    await expect(status).toContainText("account ending 7890");
    await expect(status).toContainText("Nothing has left this device");
  } catch (failure) {
    await testInfo.attach("status-line", { body: (await status.textContent()) ?? "", contentType: "text/plain" });
    await testInfo.attach("browser-console", { body: noise.join("\n"), contentType: "text/plain" });
    const structure = page.locator(".structure-diagnostic, .label-diagnostic");
    if (await structure.count() > 0) {
      await structure.first().locator("summary").click();
      await testInfo.attach("structure", { body: await structure.first().innerText(), contentType: "text/plain" });
    }
    throw failure;
  }

  await expect(page.getByRole("heading", { name: "Choose the ledger account" })).toBeVisible();
  await expect(page.locator('input[name="statement-unlock-code"]')).toHaveValue("");

  // The bind stage is the last screen where the owner can decline, so it has to say which
  // of the three layouts read the statement and whether the rows were checked against the
  // bank's own printed totals (D-042). This fixture prints a summary block, so they were.
  const bindPanel = page.locator(".binding-bench");
  await expect(bindPanel).toContainText("Read as a SCB statement");
  await expect(bindPanel).toContainText("scb-layout-v1");
  await expect(bindPanel.locator(".cross-check-note")).toContainText("printed counts and totals agree with all 3 rows");
  await expect(bindPanel.locator(".cross-check-warning")).toHaveCount(0);
});

test("reads a synthetic KBANK PDF, whose money columns sit eight units apart", async ({ page }, testInfo) => {
  const noise: string[] = [];
  page.on("console", (message) => noise.push(`${message.type()}: ${message.text()}`));
  page.on("pageerror", (error) => noise.push(`pageerror: ${error.message}`));

  await readPdf(page, "synthetic-kbank.pdf", buildStatementPdf(kbankStatement));

  const status = page.getByRole("status");
  try {
    // The tighter of the two layouts: withdrawals and deposits are placed twice
    // COLUMN_EDGE_TOLERANCE apart and no more, so any drift between the width the fixture
    // assumed and the width pdf.js measures merges them and the read fails closed.
    await expect(status).toContainText("Read 3 rows across 2 page(s)", { timeout: 10_000 });
    await expect(status).toContainText("account ending 7890");
  } catch (failure) {
    await testInfo.attach("status-line", { body: (await status.textContent()) ?? "", contentType: "text/plain" });
    await testInfo.attach("browser-console", { body: noise.join("\n"), contentType: "text/plain" });
    throw failure;
  }

  await expect(page.getByRole("heading", { name: "Choose the ledger account" })).toBeVisible();
});
