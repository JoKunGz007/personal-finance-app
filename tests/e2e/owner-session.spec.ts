import { expect, test } from "@playwright/test";
import { validStatement } from "../fixtures/krungthai-layout-v1";
import { buildStatementPdf } from "../fixtures/synthetic-pdf";
import { containerReachable, ownerId, psql, resetOwnerImportSurface } from "../helpers/local-owner";

// The three paths that were unreachable in a browser until a session could be minted:
// the binding chooser, the authenticated import path, and the charset rejection path
// (PLAN task 10). Every one of them sits behind an owner-bound route, so no browser test
// could touch them while the app had no way to sign in.
//
// Run with `--config=playwright.owner.config.ts`, which builds with
// NEXT_PUBLIC_ALLOW_DEV_OWNER_SESSION=1. Any other build has neither the button nor a
// route that answers, which is the guard working rather than a problem to route around.
//
// The PDFs are generated from invented fixture geometry, per docs/FIXTURE_POLICY.md.

const MATCHING_ACCOUNT = "cccccccc-0000-4000-8000-000000000021";
const MISMATCHED_ACCOUNT = "cccccccc-0000-4000-8000-000000000022";
const PASSWORD_FIELD = 'input[name="statement-unlock-code"]';
const UNLOCK_CODE = "synthetic-unlock-not-a-real-password";

const reachable = containerReachable();
test.skip(!reachable, "The local Supabase container is unreachable; run `pnpm supabase:start`.");

// A clean import surface per run. Without it the second run re-imports identical rows and
// fails on their fingerprints, which would look like a defect rather than a repeat.
test.beforeEach(() => {
  const owner = ownerId();
  expect(owner, "the seeded owner must exist").toMatch(/^[0-9a-f-]{36}$/);
  const cleaned = resetOwnerImportSurface(owner, [MATCHING_ACCOUNT, MISMATCHED_ACCOUNT]);
  expect(cleaned.ok, `cleanup failed: ${cleaned.output}`).toBe(true);
  // The synthetic statement prints account ending 7890; the seeded account ends 4242, so
  // both are needed — one to bind, one to prove a wrong binding is refused.
  const setup = psql(`
    insert into public.accounts(id, owner_id, bank_code, label, account_type, last_four, currency, timezone)
    values ('${MATCHING_ACCOUNT}', '${owner}', 'KTB', 'Browser synthetic', 'savings', '7890', 'THB', 'Asia/Bangkok'),
           ('${MISMATCHED_ACCOUNT}', '${owner}', 'KTB', 'Browser synthetic other', 'current', '1357', 'THB', 'Asia/Bangkok')
    on conflict (id) do nothing;
  `);
  expect(setup.ok, `account setup failed: ${setup.output}`).toBe(true);
});

// Leave the database as it was found. `public.accounts` is unique on
// (owner_id, bank_code, last_four), and the Vitest suites insert their own account
// ending 7890 for this same owner — so accounts left behind here fail those suites at
// setup, with an error that points at them rather than at this file.
test.afterAll(() => {
  const cleaned = resetOwnerImportSurface(ownerId(), [MATCHING_ACCOUNT, MISMATCHED_ACCOUNT]);
  expect(cleaned.ok, `teardown failed: ${cleaned.output}`).toBe(true);
});

async function signIn(page: import("@playwright/test").Page) {
  await page.goto("/");
  const devButton = page.getByRole("button", { name: "Dev sign-in" });
  // A build without NEXT_PUBLIC_ALLOW_DEV_OWNER_SESSION=1 has no such button, which is
  // the guard doing its job. Skip rather than fail, so this spec is harmless if another
  // config picks it up.
  if (await devButton.count() === 0) {
    test.skip(true, "This build has no development sign-in. Use --config=playwright.owner.config.ts.");
  }
  const status = page.getByRole("status");
  await devButton.click();
  await expect(status).toContainText("aal2", { timeout: 30_000 });
  // A warning here means OWNER_GOOGLE_EMAIL does not match the seeded owner, which would
  // otherwise surface later as an unexplained 403.
  await expect(status).not.toContainText("OWNER_GOOGLE_EMAIL");
}

async function readStatement(page: import("@playwright/test").Page, pdf: Uint8Array) {
  await page.locator('input[type="file"]').setInputFiles({
    name: "synthetic-statement.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(pdf)
  });
  await page.locator(PASSWORD_FIELD).fill(UNLOCK_CODE);
  await page.getByRole("button", { name: "Unlock & check layout" }).click();
  await expect(page.getByRole("heading", { name: "Choose the ledger account" })).toBeVisible({ timeout: 30_000 });
}

test("binds a statement through the chooser and confirms the import", async ({ page }) => {
  await signIn(page);
  await readStatement(page, buildStatementPdf(validStatement));

  // The chooser: this is the first time it has been exercised in a browser. It stays
  // empty and the bind button disabled until the owner-bound accounts endpoint answers.
  await expect(page.getByRole("button", { name: "Bind statement to this account" })).toBeDisabled();
  await page.getByRole("button", { name: "Load ledger accounts" }).click();

  const chooser = page.locator("select");
  await expect(chooser.locator("option")).toHaveCount(4, { timeout: 15_000 }); // placeholder + seeded + two inserted
  await chooser.selectOption(MATCHING_ACCOUNT);
  await page.getByRole("button", { name: "Bind statement to this account" }).click();

  // Binding is a checked decision, not a guess: the payload is re-verified against the
  // printed account and currency before the review stage is reached (D-017).
  await expect(page.getByRole("status")).toContainText("Bound to Browser synthetic");

  // And the authenticated import path — a real aal2 cookie session into confirm_import.
  await page.getByRole("button", { name: "Confirm import" }).click();
  await expect(page.getByRole("status")).not.toContainText("could not be confirmed", { timeout: 30_000 });

  // Assert against the database rather than the UI's own account of itself.
  const owner = ownerId();
  const batches = psql(`select count(*) from public.import_batches where owner_id = '${owner}';`);
  expect(batches.output.trim(), "the import must have landed").toBe("1");
  const rows = psql(`select count(*) from public.source_transactions where owner_id = '${owner}';`);
  expect(rows.output.trim(), "all four synthetic rows must have landed").toBe("4");
});

test("refuses to bind a statement to an account it does not match", async ({ page }) => {
  await signIn(page);
  await readStatement(page, buildStatementPdf(validStatement));

  await page.getByRole("button", { name: "Load ledger accounts" }).click();
  const chooser = page.locator("select");
  await expect(chooser.locator("option")).toHaveCount(4, { timeout: 15_000 });
  // Ending 1357, while the statement prints 7890. A plausible-but-wrong binding is the
  // worst failure this ledger has, so it must be refused rather than reconciled.
  await chooser.selectOption(MISMATCHED_ACCOUNT);
  await page.getByRole("button", { name: "Bind statement to this account" }).click();

  // The binding alert specifically. "Binding refused" also appears in the status line,
  // and Next.js mounts its own empty route announcer with role="alert" — so both a bare
  // text match and a bare role match resolve to two elements.
  await expect(page.getByRole("alert").filter({ hasText: "Binding refused" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirm import" })).toHaveCount(0);

  const owner = ownerId();
  const batches = psql(`select count(*) from public.import_batches where owner_id = '${owner}';`);
  expect(batches.output.trim(), "nothing may be imported after a refused binding").toBe("0");
});

test("rejects a statement carrying a character outside the import charset", async ({ page }) => {
  await signIn(page);
  // The valid statement with exactly one character changed: U+4E00, outside every range
  // SOURCE_TEXT_CHARSET allows (lib/statement.ts). Built by substitution rather than by
  // hand so the geometry, the balance chain, and the printed summary all still agree —
  // a hand-built page fails the closing-balance check first and never reaches assembly,
  // which is a different rejection and would prove nothing about the charset.
  //
  // The layout reader has no opinion on charset, so this parses and is refused at
  // assembly, which is where JS and PostgreSQL NFKC agreement is enforced (D-014).
  const outOfCharset = buildStatementPdf(validStatement.map((page) => page.map((item) =>
    item.str === "Synthetic inbound transfer" ? { ...item, str: "Synthetic 一 transfer" } : item)));
  await readStatement(page, outOfCharset);

  await page.getByRole("button", { name: "Load ledger accounts" }).click();
  const chooser = page.locator("select");
  await expect(chooser.locator("option")).toHaveCount(4, { timeout: 15_000 });
  await chooser.selectOption(MATCHING_ACCOUNT);
  await page.getByRole("button", { name: "Bind statement to this account" }).click();

  // The binding alert specifically. "Binding refused" also appears in the status line,
  // and Next.js mounts its own empty route announcer with role="alert" — so both a bare
  // text match and a bare role match resolve to two elements.
  await expect(page.getByRole("alert").filter({ hasText: "Binding refused" })).toBeVisible();
  // The refusal is deliberately generic — the schema's own wording is not echoed to the
  // UI, so a rejection cannot report which cell held what. What makes this specifically
  // the charset guard is the pair: the first test in this file binds and imports the
  // identical statement, and the only difference here is one character.
  await expect(page.getByRole("status")).toContainText("does not satisfy the import contract");

  const owner = ownerId();
  const batches = psql(`select count(*) from public.import_batches where owner_id = '${owner}';`);
  expect(batches.output.trim(), "an out-of-charset statement may not import").toBe("0");
});
