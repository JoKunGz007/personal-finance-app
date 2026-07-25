import { expect, test } from "@playwright/test";
import { validStatement } from "../fixtures/krungthai-layout-v1";
import { buildStatementPdf } from "../fixtures/synthetic-pdf";

// Exercises the one integration no other test reaches: a real PDF file going into the
// real browser worker, through pdf.js, and out as extracted rows. The unit suite feeds
// extractStatement a PageText array, so it proves the layout rules while leaving
// getDocument, getTextContent, the worker bundle, and the CSP entirely unverified.
//
// The PDF is generated from the invented fixture geometry (tests/fixtures/synthetic-pdf.ts);
// no real statement is involved, per docs/FIXTURE_POLICY.md.

test("reads a synthetic PDF through the real pdf.js worker", async ({ page }, testInfo) => {
  const noise: string[] = [];
  page.on("console", (message) => noise.push(`${message.type()}: ${message.text()}`));
  page.on("pageerror", (error) => noise.push(`pageerror: ${error.message}`));

  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles({
    name: "synthetic-statement.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(buildStatementPdf(validStatement))
  });
  // The document password is irrelevant to an unencrypted synthetic file, but the UI
  // requires one before it will start, so this stands in for the interactive entry.
  await page.locator('input[name="statement-unlock-code"]').fill("synthetic-unlock-not-a-real-password");
  await page.getByRole("button", { name: "Unlock & check layout" }).click();

  const status = page.getByRole("status");
  try {
    // Four invented rows across two invented pages, bound for account suffix 7890.
    // The timeout stays well under the test timeout so the diagnostics below still run
    // against a live page — otherwise a failure reports only "browser has been closed".
    await expect(status).toContainText("Read 4 rows across 2 page(s)", { timeout: 10_000 });
    await expect(status).toContainText("account ending 7890");
    await expect(status).toContainText("Nothing has left this device");
  } catch (failure) {
    // A failure here is usually a worker or CSP problem rather than a layout one, and
    // the status line alone does not say which.
    await testInfo.attach("status-line", { body: (await status.textContent()) ?? "", contentType: "text/plain" });
    await testInfo.attach("browser-console", { body: noise.join("\n"), contentType: "text/plain" });
    // The app's own label diagnostic says which heading words pdf.js actually produced,
    // which is precisely what a column-anchor failure needs.
    const diagnostic = page.locator(".label-diagnostic");
    if (await diagnostic.count() > 0) {
      await diagnostic.locator("summary").click();
      const text = await diagnostic.innerText();
      await testInfo.attach("label-candidates", { body: text, contentType: "text/plain" });
      // Terminal reporters truncate attachments, and this one is the whole point of the
      // failure, so allow dumping it somewhere readable in full. Opt-in via env.
      if (process.env.LAYOUT_DIAGNOSTIC_FILE) {
        (await import("node:fs")).writeFileSync(process.env.LAYOUT_DIAGNOSTIC_FILE, text, "utf8");
      }
    }
    throw failure;
  }

  // Reading the statement must move the flow to binding, never straight to a
  // confirmable import: which ledger account this belongs to is still a user decision.
  await expect(page.getByRole("heading", { name: "Choose the ledger account" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Bind statement to this account" })).toBeDisabled();
  // The password field is cleared as soon as the attempt ends.
  await expect(page.locator('input[name="statement-unlock-code"]')).toHaveValue("");
});

test("rejects a PDF that does not match the supported layout, with its code", async ({ page }) => {
  // A structurally valid PDF whose text is nothing like a statement must fail closed
  // and say why, rather than producing a partial or invented reading.
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles({
    name: "not-a-statement.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(buildStatementPdf([[{ str: "Synthetic unrelated document", x: 40, y: 700 }]]))
  });
  await page.locator('input[name="statement-unlock-code"]').fill("synthetic-unlock-not-a-real-password");
  await page.getByRole("button", { name: "Unlock & check layout" }).click();

  await expect(page.getByRole("status")).toContainText("UNSUPPORTED_LAYOUT", { timeout: 30_000 });
  await expect(page.getByRole("status")).toContainText("No data left this device");
  await expect(page.getByRole("heading", { name: "Choose the ledger account" })).toBeHidden();
});
