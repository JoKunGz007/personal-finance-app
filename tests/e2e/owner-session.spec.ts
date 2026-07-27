import { expect, test } from "@playwright/test";
import { validStatement } from "../fixtures/krungthai-layout-v1";
import { kbankStatement, scbStatement } from "../fixtures/statement-layouts";
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
// Same last four as MATCHING_ACCOUNT, at a different bank. `public.accounts` is unique on
// (owner_id, bank_code, last_four), so this is a legitimate second account — and it is the
// case where matching on digits alone would bind an SCB statement to a Krungthai ledger.
const SCB_ACCOUNT = "cccccccc-0000-4000-8000-000000000023";
const TEST_ACCOUNTS = [MATCHING_ACCOUNT, MISMATCHED_ACCOUNT, SCB_ACCOUNT];
const PASSWORD_FIELD = 'input[name="statement-unlock-code"]';
const UNLOCK_CODE = "synthetic-unlock-not-a-real-password";

const reachable = containerReachable();
test.skip(!reachable, "The local Supabase container is unreachable; run `pnpm supabase:start`.");

// A clean import surface per run. Without it the second run re-imports identical rows and
// fails on their fingerprints, which would look like a defect rather than a repeat.
test.beforeEach(() => {
  const owner = ownerId();
  expect(owner, "the seeded owner must exist").toMatch(/^[0-9a-f-]{36}$/);
  const cleaned = resetOwnerImportSurface(owner, TEST_ACCOUNTS);
  expect(cleaned.ok, `cleanup failed: ${cleaned.output}`).toBe(true);
  // Both synthetic statements print account ending 7890; the seeded accounts end 4242, so
  // these are needed — one to bind, one to prove a wrong binding is refused, and one at
  // another bank sharing the first one's last four.
  const setup = psql(`
    insert into public.accounts(id, owner_id, bank_code, label, account_type, last_four, currency, timezone)
    values ('${MATCHING_ACCOUNT}', '${owner}', 'KTB', 'Browser synthetic', 'savings', '7890', 'THB', 'Asia/Bangkok'),
           ('${MISMATCHED_ACCOUNT}', '${owner}', 'KTB', 'Browser synthetic other', 'current', '1357', 'THB', 'Asia/Bangkok'),
           ('${SCB_ACCOUNT}', '${owner}', 'SCB', 'Browser synthetic SCB', 'savings', '7890', 'THB', 'Asia/Bangkok')
    on conflict (id) do nothing;
  `);
  expect(setup.ok, `account setup failed: ${setup.output}`).toBe(true);
  // The account-creation spec makes a KBANK account ending 7890 through the UI. Removing
  // it here rather than only at the end keeps that spec starting from the dead end it is
  // about, however a previous run ended.
  psql(`delete from public.accounts where owner_id = '${owner}' and bank_code = 'KBANK' and last_four = '7890';`);
});

// The chooser lists every account the owner holds, and the seed now creates one per
// supported bank. Deriving the expected count from the database rather than hard-coding it
// keeps this spec from breaking every time the seed gains an account — which is exactly
// what it did when SCB and KBANK accounts were added.
function expectedOptionCount(): number {
  const counted = psql(`select count(*) from public.accounts where owner_id = '${ownerId()}';`);
  expect(counted.ok, `account count failed: ${counted.output}`).toBe(true);
  return Number(counted.output.trim()) + 1; // + the placeholder option
}

// Leave the database as it was found. `public.accounts` is unique on
// (owner_id, bank_code, last_four), and the Vitest suites insert their own account
// ending 7890 for this same owner — so accounts left behind here fail those suites at
// setup, with an error that points at them rather than at this file.
test.afterAll(() => {
  const owner = ownerId();
  psql(`delete from public.accounts where owner_id = '${owner}' and bank_code = 'KBANK' and last_four = '7890';`);
  const cleaned = resetOwnerImportSurface(owner, TEST_ACCOUNTS);
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
  await expect(chooser.locator("option")).toHaveCount(expectedOptionCount(), { timeout: 15_000 });
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

// The dead end this closes was real: every account came from the seed, so a statement
// printing a suffix none of them carried could be read, cross-checked, and then bound to
// nothing at all. The seeded KBANK account ends 4242; this statement prints 7890.
test("creates the account a statement needs, from the bind stage", async ({ page }) => {
  await signIn(page);
  await readStatement(page, buildStatementPdf(kbankStatement));

  await page.getByRole("button", { name: "Load ledger accounts" }).click();

  const create = page.getByRole("button", { name: /Create KBANK account/u });
  await expect(create).toBeVisible({ timeout: 15_000 });
  // Offered, but not before the account has a name.
  await expect(create).toBeDisabled();

  await page.locator('input[name="new-account-label"]').fill("Browser created KBANK");
  await expect(create).toBeEnabled();
  await create.click();

  await expect(page.getByRole("status")).toContainText("Created Browser created KBANK", { timeout: 30_000 });

  // Assert against the database, not the UI's account of itself. The audit row is the
  // evidence this went through public.mutate_account rather than a direct insert —
  // `authenticated` has no insert grant, and pgTAP holds it that way.
  const owner = ownerId();
  const created = psql(`select label, account_type from public.accounts
    where owner_id = '${owner}' and bank_code = 'KBANK' and last_four = '7890';`);
  expect(created.output.trim(), "the account must exist at the bank and suffix the statement printed").toBe("Browser created KBANK|savings");
  const audited = psql(`select count(*) from public.audit_events
    where owner_id = '${owner}' and event_type = 'account.create';`);
  expect(audited.output.trim(), "creating an account must be audited").toBe("1");

  // And the new account is already selected, so the statement binds without a second
  // trip through the chooser — which is the whole point of offering it here.
  await page.getByRole("button", { name: "Bind statement to this account" }).click();
  await expect(page.getByRole("status")).toContainText("Bound to Browser created KBANK");
});

test("refuses to bind a statement to an account it does not match", async ({ page }) => {
  await signIn(page);
  await readStatement(page, buildStatementPdf(validStatement));

  await page.getByRole("button", { name: "Load ledger accounts" }).click();
  const chooser = page.locator("select");
  await expect(chooser.locator("option")).toHaveCount(expectedOptionCount(), { timeout: 15_000 });
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
  await expect(chooser.locator("option")).toHaveCount(expectedOptionCount(), { timeout: 15_000 });
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

test("carries an SCB statement through the chooser into confirm_import", async ({ page }) => {
  // The whole new path in a browser: an SCB PDF read by the descriptor-driven reader,
  // bound through the chooser, and confirmed into a real SCB account. Until migration 009
  // this could not reach the database at all — `accounts.bank_code` and
  // `import_artifacts.contract_version` were both pinned to Krungthai's (D-041).
  await signIn(page);
  await readStatement(page, buildStatementPdf(scbStatement));

  await page.getByRole("button", { name: "Load ledger accounts" }).click();
  const chooser = page.locator("select");
  await expect(chooser.locator("option")).toHaveCount(expectedOptionCount(), { timeout: 15_000 });
  await chooser.selectOption(SCB_ACCOUNT);
  await page.getByRole("button", { name: "Bind statement to this account" }).click();
  await expect(page.getByRole("status")).toContainText("Bound to Browser synthetic SCB");

  await page.getByRole("button", { name: "Confirm import" }).click();
  await expect(page.getByRole("status")).not.toContainText("could not be confirmed", { timeout: 30_000 });

  const owner = ownerId();
  expect(psql(`select count(*) from public.import_batches where owner_id = '${owner}';`).output.trim()).toBe("1");
  expect(psql(`select count(*) from public.source_transactions where owner_id = '${owner}';`).output.trim()).toBe("3");
  // The artifact records the layout that read it, rather than inheriting a hard-coded one.
  expect(psql(`select contract_version from public.import_artifacts where owner_id = '${owner}';`).output.trim())
    .toBe("scb-layout-v1");
  // And the directions are the ones the balance chain says, not the ones a heading-band
  // reader would have produced — one deposit among three rows, positive (D-039).
  expect(psql(`select count(*) from public.source_components where owner_id = '${owner}' and kind = 'deposit';`).output.trim())
    .toBe("1");
});

test("refuses an SCB statement bound to a Krungthai account with the same last four", async ({ page }) => {
  // Two accounts, one owner, the same last four, different banks — legitimate, because
  // `public.accounts` is unique on (owner_id, bank_code, last_four). Matching on the
  // digits alone would post SCB transactions into a Krungthai ledger, so the bank is
  // checked first and named in the refusal.
  await signIn(page);
  await readStatement(page, buildStatementPdf(scbStatement));

  await page.getByRole("button", { name: "Load ledger accounts" }).click();
  const chooser = page.locator("select");
  await expect(chooser.locator("option")).toHaveCount(expectedOptionCount(), { timeout: 15_000 });
  await chooser.selectOption(MATCHING_ACCOUNT);
  await page.getByRole("button", { name: "Bind statement to this account" }).click();

  await expect(page.getByRole("alert").filter({ hasText: "Binding refused" })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("not held at the bank that issued this statement");
  await expect(page.getByRole("button", { name: "Confirm import" })).toHaveCount(0);

  const owner = ownerId();
  expect(psql(`select count(*) from public.import_batches where owner_id = '${owner}';`).output.trim()).toBe("0");
});
