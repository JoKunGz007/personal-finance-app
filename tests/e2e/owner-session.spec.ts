import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { bangkokToday } from "../../lib/dates";
import { formatThb } from "../../lib/money";
import { buildSlipQrPng, KBANK_SLIP, KTB_SLIP, KTB_SLIP_DATED, SCB_SLIP, type SlipFixture } from "../fixtures/synthetic-slip";
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
// Invented, and only ever used against synthetic rows in a local container. The backup
// envelope requires at least twelve characters (lib/backup.ts).
const BACKUP_PASSWORD = "synthetic-recovery-rehearsal-2026";

const reachable = containerReachable();
test.skip(!reachable, "The local Supabase container is unreachable; run `pnpm supabase:start`.");

// A clean import surface per run. Without it the second run re-imports identical rows and
// fails on their fingerprints, which would look like a defect rather than a repeat.
test.beforeEach(() => {
  const owner = ownerId();
  expect(owner, "the seeded owner must exist").toMatch(/^[0-9a-f-]{36}$/);
  // Before the reset, not after: the account-creation spec makes a KBANK account through
  // the UI with a database-assigned id, so one left by a previous run is an account the
  // reset's guard cannot recognise and would refuse to proceed past.
  psql(`delete from public.accounts where owner_id = '${owner}' and bank_code = 'KBANK' and last_four = '7890';`);
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

// Signs in from whichever route the spec is about to work on. The control lives in the
// shell since routing landed (PLAN task 19), so it is reachable from all four — and the
// session is a cookie, so it survives every navigation these specs make.
async function signIn(page: import("@playwright/test").Page, path = "/import") {
  await page.goto(path);
  const devButton = page.getByRole("button", { name: "Dev sign-in" });
  // A build without NEXT_PUBLIC_ALLOW_DEV_OWNER_SESSION=1 has no such button, which is
  // the guard doing its job. Skip rather than fail, so this spec is harmless if another
  // config picks it up.
  if (await devButton.count() === 0) {
    test.skip(true, "This build has no development sign-in. Use --config=playwright.owner.config.ts.");
  }
  // The header's own line, which is a polite live region rather than a second role="status":
  // every route already has a status line, and two would make `getByRole("status")`
  // ambiguous on every page — including in the assertions below.
  const session = page.locator(".session-state");
  await devButton.click();
  await expect(session).toContainText("aal2", { timeout: 30_000 });
  // A warning here means OWNER_GOOGLE_EMAIL does not match the seeded owner, which would
  // otherwise surface later as an unexplained 403.
  await expect(session).not.toContainText("OWNER_GOOGLE_EMAIL");
}

async function readStatement(page: import("@playwright/test").Page, pdf: Uint8Array) {
  await page.locator('input[name="statement-pdf"]').setInputFiles({
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

  const chooser = page.locator('select[name="ledger-account"]');
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

// Recovery driven entirely from the app, which until now it could not be: the export
// button produced a `.pldemo` preview that is explicitly not restorable, and there was no
// restore surface at all, so a real recovery meant writing code (PLAN task 14).
//
// Import, back up, destroy the ledger, restore it. Wiping between the two halves is what
// makes this a recovery rather than a round trip against data that never left.
test("backs up a confirmed ledger and restores it after the ledger is destroyed", async ({ page }) => {
  const owner = ownerId();

  await signIn(page);
  await readStatement(page, buildStatementPdf(validStatement));
  await page.getByRole("button", { name: "Load ledger accounts" }).click();
  const chooser = page.locator('select[name="ledger-account"]');
  await expect(chooser.locator("option")).toHaveCount(expectedOptionCount(), { timeout: 15_000 });
  await chooser.selectOption(MATCHING_ACCOUNT);
  await page.getByRole("button", { name: "Bind statement to this account" }).click();
  await expect(page.getByRole("status")).toContainText("Bound to Browser synthetic");
  await page.getByRole("button", { name: "Confirm import" }).click();
  // Asserted positively. `not.toContainText` passes while the import is still in flight,
  // which reports a failure several assertions later and in the wrong place.
  await expect(page.getByRole("status")).toContainText("Confirmed 4 rows", { timeout: 30_000 });
  expect(psql(`select count(*) from public.source_transactions where owner_id = '${owner}';`).output.trim()).toBe("4");

  // Export, from the recovery route — its own surface since routing (PLAN task 19), which
  // is also what makes this spec cross two routes under one session.
  // The download is the artifact — there is no server-side copy, by design.
  await page.goto("/recovery");
  await page.locator('input[name="ledger-backup-password"]').fill(BACKUP_PASSWORD);
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export encrypted backup" }).click();
  const download = await downloading;
  const artifact = await download.path();
  expect(artifact, "the backup must have been written to a file").toBeTruthy();
  await expect(page.getByText(/Encrypted backup written and custody recorded/u)).toBeVisible({ timeout: 30_000 });

  // Destroy the ledger. Deliberately not resetOwnerImportSurface: that also removes the
  // owner's TOTP factors, which would drop the very session the restore needs.
  const wiped = psql(`
    begin;
    set local session_replication_role = replica;
    delete from public.restore_chunks; delete from public.restore_runs;
    delete from public.overlay_revisions; delete from public.transaction_overlays;
    delete from public.import_batch_rows; delete from public.source_components;
    delete from public.source_transactions; delete from public.audit_events;
    delete from public.import_batches; delete from public.import_artifacts;
    delete from public.categories; delete from public.accounts;
    set local session_replication_role = origin;
    commit;
  `);
  expect(wiped.ok, `wipe failed: ${wiped.output}`).toBe(true);
  expect(psql(`select count(*) from public.source_transactions where owner_id = '${owner}';`).output.trim()).toBe("0");

  // Restore, from the file and the password alone.
  await page.locator('input[name="restore-file"]').setInputFiles(artifact!);
  await page.locator('input[name="restore-password"]').fill(BACKUP_PASSWORD);
  await page.getByRole("button", { name: "Restore this ledger" }).click();
  await expect(page.getByText(/Ledger restored/u)).toBeVisible({ timeout: 60_000 });

  // Assert against the database. Every row, its account, and its provenance must be back.
  expect(psql(`select count(*) from public.source_transactions where owner_id = '${owner}';`).output.trim(), "all four rows must return").toBe("4");
  expect(psql(`select count(*) from public.import_batches where owner_id = '${owner}';`).output.trim(), "the batch must return").toBe("1");
  expect(psql(`select label from public.accounts where id = '${MATCHING_ACCOUNT}';`).output.trim(), "the bound account must return").toBe("Browser synthetic");
});

test("refuses a restore into a ledger that still holds rows", async ({ page }) => {
  // The check that makes a restore a recovery rather than an overwrite. It is enforced at
  // commit, after all eleven chunks are accepted, so the failure arrives at the end.
  await signIn(page);
  await readStatement(page, buildStatementPdf(validStatement));
  await page.getByRole("button", { name: "Load ledger accounts" }).click();
  const chooser = page.locator('select[name="ledger-account"]');
  await expect(chooser.locator("option")).toHaveCount(expectedOptionCount(), { timeout: 15_000 });
  await chooser.selectOption(MATCHING_ACCOUNT);
  await page.getByRole("button", { name: "Bind statement to this account" }).click();
  await expect(page.getByRole("status")).toContainText("Bound to Browser synthetic");
  await page.getByRole("button", { name: "Confirm import" }).click();
  // Asserted positively. `not.toContainText` passes while the import is still in flight,
  // which reports a failure several assertions later and in the wrong place.
  await expect(page.getByRole("status")).toContainText("Confirmed 4 rows", { timeout: 30_000 });

  await page.goto("/recovery");
  await page.locator('input[name="ledger-backup-password"]').fill(BACKUP_PASSWORD);
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export encrypted backup" }).click();
  const artifact = await (await downloading).path();

  // No wipe this time: the ledger it came from is still populated.
  await page.locator('input[name="restore-file"]').setInputFiles(artifact!);
  await page.locator('input[name="restore-password"]').fill(BACKUP_PASSWORD);
  await page.getByRole("button", { name: "Restore this ledger" }).click();
  await expect(page.getByText(/Restore requires an empty destination ledger/u)).toBeVisible({ timeout: 60_000 });
});

test("refuses to bind a statement to an account it does not match", async ({ page }) => {
  await signIn(page);
  await readStatement(page, buildStatementPdf(validStatement));

  await page.getByRole("button", { name: "Load ledger accounts" }).click();
  const chooser = page.locator('select[name="ledger-account"]');
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
  const chooser = page.locator('select[name="ledger-account"]');
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
  const chooser = page.locator('select[name="ledger-account"]');
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
  const chooser = page.locator('select[name="ledger-account"]');
  await expect(chooser.locator("option")).toHaveCount(expectedOptionCount(), { timeout: 15_000 });
  await chooser.selectOption(MATCHING_ACCOUNT);
  await page.getByRole("button", { name: "Bind statement to this account" }).click();

  await expect(page.getByRole("alert").filter({ hasText: "Binding refused" })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("not held at the bank that issued this statement");
  await expect(page.getByRole("button", { name: "Confirm import" })).toHaveCount(0);

  const owner = ownerId();
  expect(psql(`select count(*) from public.import_batches where owner_id = '${owner}';`).output.trim()).toBe("0");
});

// PLAN task 17. The unit suite covers the wire contract and the pure derivations, which
// is exactly the evidence D-027 warns is weaker than it looks: none of it renders a row.
// These two specs are the first thing that runs the view itself.

async function importStatement(
  page: import("@playwright/test").Page,
  pdf: Uint8Array,
  accountId: string,
  boundLabel: string,
  expectedRowsAfter: number
) {
  await readStatement(page, pdf);
  await page.getByRole("button", { name: "Load ledger accounts" }).click();
  const chooser = page.locator('select[name="ledger-account"]');
  await expect(chooser.locator("option")).toHaveCount(expectedOptionCount(), { timeout: 15_000 });
  await chooser.selectOption(accountId);
  await page.getByRole("button", { name: "Bind statement to this account" }).click();
  await expect(page.getByRole("status")).toContainText(`Bound to ${boundLabel}`);
  await page.getByRole("button", { name: "Confirm import" }).click();
  await expect(page.getByRole("status")).not.toContainText("could not be confirmed", { timeout: 30_000 });

  // Assert the rows are in the database before moving on. A negative assertion on the
  // status line passes for a confirm that never rendered anything at all, so without
  // this a lost import surfaces later as a puzzling row count in a different assertion.
  await expect.poll(
    () => psql(`select count(*) from public.source_transactions where owner_id = '${ownerId()}';`).output.trim(),
    { message: `the ${boundLabel} import must have landed`, timeout: 15_000 }
  ).toBe(String(expectedRowsAfter));
}

test("reads a confirmed import back, and switches between merged and per-account", async ({ page }) => {
  await signIn(page);
  await importStatement(page, buildStatementPdf(validStatement), MATCHING_ACCOUNT, "Browser synthetic", 4);

  await page.goto("/ledger");
  const ledger = page.locator("section.ledger-band");
  // Nothing loads until asked, so the table cannot exist before the button is pressed.
  await expect(ledger.locator("table")).toHaveCount(0);
  await ledger.getByRole("button", { name: "Load transactions" }).click();

  const rows = ledger.locator("tbody tr");
  await expect(rows).toHaveCount(4, { timeout: 30_000 });
  await expect(ledger.getByText("Imported accounts: 1 of")).toBeVisible();

  // Merged is the default and carries both money columns.
  await expect(ledger.getByRole("columnheader", { name: "Account balance" })).toBeVisible();
  await expect(ledger.getByRole("columnheader", { name: "All accounts" })).toBeVisible();

  // Choosing one account drops the combined column and shows the printed reference
  // instead of the account name, because neither is useful in the other mode.
  await ledger.getByLabel("Account").selectOption(MATCHING_ACCOUNT);
  await expect(ledger.getByRole("columnheader", { name: "All accounts" })).toHaveCount(0);
  await expect(ledger.getByRole("columnheader", { name: "Reference" })).toBeVisible();
  await expect(ledger.getByRole("columnheader", { name: "Balance", exact: true })).toBeVisible();
  await expect(rows).toHaveCount(4);

  // An account holding nothing shows the empty state rather than an empty table.
  await ledger.getByLabel("Account").selectOption(MISMATCHED_ACCOUNT);
  await expect(ledger.locator("table")).toHaveCount(0);
  await expect(ledger.getByText("No transaction matches this filter")).toBeVisible();
});

test("orders both ways and derives the all-accounts balance from every account", async ({ page }) => {
  await signIn(page);
  await importStatement(page, buildStatementPdf(validStatement), MATCHING_ACCOUNT, "Browser synthetic", 4);
  // A second account with rows is what makes the combined column mean anything: with one
  // account it is trivially that account's own balance and a broken derivation would pass.
  await page.goto("/import");
  await importStatement(page, buildStatementPdf(scbStatement), SCB_ACCOUNT, "Browser synthetic SCB", 7);

  const owner = ownerId();
  await page.goto("/ledger");
  const ledger = page.locator("section.ledger-band");
  await ledger.getByRole("button", { name: "Load transactions" }).click();

  const rows = ledger.locator("tbody tr");
  await expect(rows).toHaveCount(7, { timeout: 30_000 });
  await expect(ledger.getByText("Imported accounts: 2 of")).toBeVisible();

  // The newest row sits after every account's latest row, so the combined figure there
  // must equal the sum of each account's final printed balance. Computed in SQL rather
  // than restated in the spec, so this checks the app against the database and not
  // against a number someone typed twice.
  const expected = psql(`
    select sum(x)::text from (
      select distinct on (account_id) post_balance_minor as x
      from public.source_transactions where owner_id = '${owner}'
      order by account_id, source_date desc, source_time desc nulls last, id
    ) latest;
  `);
  expect(expected.ok, `balance query failed: ${expected.output}`).toBe(true);

  const newest = rows.first();
  await expect(newest.locator('td[data-label="All accounts"]')).toHaveText(formatThb(expected.output.trim()));
  // And it is genuinely a different number from that row's own account balance, which is
  // what a regression collapsing the two columns would break.
  await expect(newest.locator('td[data-label="Account balance"]'))
    .not.toHaveText(formatThb(expected.output.trim()));

  // Oldest-first reverses the list. Comparing the two ends rather than a fixed date keeps
  // this independent of the fixtures' calendar.
  const newestDate = await newest.locator("time").getAttribute("datetime");
  const oldestDate = await rows.last().locator("time").getAttribute("datetime");
  expect(newestDate! >= oldestDate!, "default order must be newest first").toBe(true);

  await ledger.getByLabel("Order").selectOption("oldest");
  await expect(rows.first().locator("time")).toHaveAttribute("datetime", oldestDate!);
  await expect(rows.last().locator("time")).toHaveAttribute("datetime", newestDate!);

  // The filter narrows the list without touching the balances, which are a fact about the
  // ledger rather than about the rows a search matched.
  await ledger.getByLabel("Filter").fill("no-such-description-anywhere");
  await expect(ledger.locator("table")).toHaveCount(0);
  await ledger.getByLabel("Filter").fill("");
  await expect(rows).toHaveCount(7);
});

// Slip capture (PLAN task 20, D-050).
//
// **Nothing is stubbed.** These specs render a real QR to a real PNG, hand it to the file
// input, and let the app's own decoder read it — so they cover the whole path from image
// bytes to a stored row. They were originally written against a stubbed `BarcodeDetector`,
// which proved only the wiring; that stub also hid a defect, because headless Chromium has
// no native detector and the stub concealed which code path was actually running (D-057).
//
// The QR is generated by `tests/fixtures/synthetic-slip.ts`, and every reference there is
// invented. `KTB_SLIP_DATED` was the exception until 2026-08-09 — a real one, recorded as a
// standing violation of `docs/FIXTURE_POLICY.md` rather than quietly fixed (D-060), then
// replaced along with its date, which was equally real (D-077).
//
// What these still do not cover: camera noise, glare and JPEG artefacts. That is why the 23
// real samples were measured separately rather than being replaced by this.
const SLIP_REFERENCE = SCB_SLIP.reference;

async function chooseSlipImage(page: import("@playwright/test").Page, slip = SCB_SLIP, scale?: number) {
  await page.locator('.slip-bench input[type="file"]').setInputFiles({
    name: "slip.png",
    mimeType: "image/png",
    buffer: await buildSlipQrPng(slip, scale)
  });
}

test("captures a slip from its QR and stores it as a provisional entry", async ({ page }) => {
  await signIn(page, "/slips");

  const bench = page.locator(".slip-bench");
  await chooseSlipImage(page);

  // Identity comes from the QR, so it is displayed rather than typed.
  await expect(bench.getByText(SLIP_REFERENCE)).toBeVisible();
  await expect(bench.getByText("SCB", { exact: true })).toBeVisible();

  await bench.getByLabel("Amount (THB)").fill("1,250.75");
  // The parsed value is echoed before anything is submitted, so a typo is caught here
  // rather than becoming a stored value only a reconciliation notices.
  await expect(bench.getByText(`Will be recorded as ${formatThb("-125075")}.`)).toBeVisible();
  await bench.getByLabel("Date", { exact: true }).fill("2026-07-20");
  await bench.getByLabel("Counterparty (optional)").fill("Browser synthetic payee");
  await bench.getByRole("button", { name: "Capture slip" }).click();

  await expect(bench.getByText(/Captured as a provisional entry/)).toBeVisible({ timeout: 15_000 });

  // Read the ledger itself rather than the status line. A status line asserting success is
  // the exact trap PLAN task 17 recorded: it can be true of a page that stored nothing.
  const owner = ownerId();
  const stored = psql(`
    select kind || ' ' || amount_minor || ' ' || bank_code || ' ' || occurred_on
    from public.slips where owner_id = '${owner}' and slip_reference = '${SLIP_REFERENCE}';
  `);
  expect(stored.ok, stored.output).toBe(true);
  expect(stored.output).toContain("withdrawal -125075 SCB 2026-07-20");

  // Provisional means provisional: nothing was written to the authoritative ledger.
  const authoritative = psql(`select count(*) from public.source_transactions where owner_id = '${owner}';`);
  expect(authoritative.output.trim()).toContain("0");

  // The capture route now keeps a record of what it captured (D-075). Before this, the form
  // cleared itself and left nothing on the page, so a real capture read as "nothing happened"
  // — the owner found that by doing it, which is how D-062 was found too.
  const captured = page.locator(".captured-slips");
  await captured.getByRole("button", { name: "Show captured slips" }).click();
  await expect(captured.getByText(SLIP_REFERENCE)).toBeVisible();
  await expect(captured.getByText("Browser synthetic payee")).toBeVisible();

  // And a second capture refreshes it without being asked again: the list exists to answer
  // "did that land", so it must not answer for the capture before last.
  // No Discard first: a successful capture resets the form, so that button is gone. Clicking a
  // locator that will never resolve does not fail fast — it burns the whole test timeout and
  // then reports the *next* action as the failure.
  await chooseSlipImage(page, KTB_SLIP);
  await bench.getByLabel("Amount (THB)").fill("500.00");
  await bench.getByLabel("Date", { exact: true }).fill("2026-01-09");
  await bench.getByRole("button", { name: "Capture slip" }).click();
  await expect(captured.locator("tbody tr")).toHaveCount(2, { timeout: 15_000 });
});

test("reads a slip from each supported bank, not just the one layout", async ({ page }) => {
  // Three banks, three reference lengths, one decoder. The 2x retry ladder is no longer
  // reachable with a generated QR — the bundled reader reads every fixture at native size
  // (D-057) — so the ladder is covered by `tests/slip-scan.test.ts`, and this covers what a
  // browser uniquely can: that each bank's QR reaches the form as the right identity.
  await signIn(page, "/slips");
  const bench = page.locator(".slip-bench");

  for (const [slip, bank] of [[SCB_SLIP, "SCB"], [KTB_SLIP, "KTB"], [KBANK_SLIP, "KBANK"]] as const) {
    await chooseSlipImage(page, slip);
    await expect(bench.getByText(slip.reference)).toBeVisible();
    await expect(bench.getByText(bank, { exact: true })).toBeVisible();
    await bench.getByRole("button", { name: "Discard" }).click();
  }
});

test("reports a re-shared slip as already captured and stores no second row", async ({ page }) => {
  // Share-to-app makes double capture the expected accident rather than an unlikely one,
  // so the second share has to be a plain outcome and not an error to interpret.
  await signIn(page, "/slips");

  const bench = page.locator(".slip-bench");
  for (const [attempt, amount] of [["first", "1250.75"], ["second", "9999.00"]] as const) {
    await chooseSlipImage(page);
    await bench.getByLabel("Amount (THB)").fill(amount);
    await bench.getByLabel("Date", { exact: true }).fill("2026-07-20");
    await bench.getByRole("button", { name: "Capture slip" }).click();
    await expect(
      bench.getByText(attempt === "first" ? /Captured as a provisional entry/ : /Already captured/)
    ).toBeVisible({ timeout: 15_000 });
  }

  const owner = ownerId();
  const rows = psql(`select count(*), min(amount_minor) from public.slips where owner_id = '${owner}';`);
  // One row, still holding the amount confirmed the first time. An append-only table must
  // not let a second share quietly overwrite a value the owner already reviewed.
  expect(rows.output).toContain("1");
  expect(rows.output).toContain("-125075");
});

test("keeps a Buddhist-era year outside the date the capture form will accept", async ({ page }) => {
  // The 543-year shift, which D-031 established must fail closed rather than be silently
  // reinterpreted. The input's own bounds are the first line; `capture_slip` refuses it
  // server-side regardless (pgTAP 004).
  //
  // Deliberately a KBANK slip: its reference carries no date, so this is the path where the
  // owner types one and the warning is the thing standing between 2569 and the ledger.
  await signIn(page, "/slips");

  const bench = page.locator(".slip-bench");
  await chooseSlipImage(page, KBANK_SLIP);
  const date = bench.getByLabel("Date", { exact: true });
  const max = await date.getAttribute("max");
  expect(max).not.toBeNull();
  expect("2569-07-20" > max!).toBe(true);
  await expect(bench.getByText(/Gregorian year/)).toBeVisible();
});

test("fills the date from the QR when the reference carries one, and says so", async ({ page }) => {
  // SCB embeds YYYYMMDD at the start of its reference and Krungthai's longer variant puts it
  // after one letter, so for those the date is read rather than assumed — exact, covered by
  // the QR's CRC, and Gregorian, which removes the Buddhist-era hazard instead of warning
  // about it (D-059). KBANK carries none and must fall back to today.
  await signIn(page, "/slips");
  const bench = page.locator(".slip-bench");
  const date = bench.getByLabel("Date", { exact: true });
  // **`bangkokToday`, not `toISOString`.** The form's fallback moved to it when the slip form
  // finally got the fix D-110 applied to the cash and card forms and missed here, and this
  // assertion is the reason it has to move with it: `toISOString` is UTC, so between midnight and
  // 07:00 Bangkok the two disagree and this test would have failed for seven hours a day —
  // reported as a broken date fallback rather than as a stale expectation.
  const today = bangkokToday();

  await chooseSlipImage(page, SCB_SLIP);
  await expect(date).toHaveValue(SCB_SLIP.reference.slice(0, 8).replace(/(\d{4})(\d{2})(\d{2})/u, "$1-$2-$3"));
  await expect(bench.getByText(/Read from the slip's QR code/)).toBeVisible();
  await bench.getByRole("button", { name: "Discard" }).click();

  await chooseSlipImage(page, KTB_SLIP_DATED);
  // Derived from the fixture rather than written out, so replacing an invented reference
  // cannot leave a hard-coded date behind claiming to be read from it.
  await expect(date).toHaveValue(KTB_SLIP_DATED.reference.slice(1, 9).replace(/(\d{4})(\d{2})(\d{2})/u, "$1-$2-$3"));
  await bench.getByRole("button", { name: "Discard" }).click();

  // A pre-filled date the owner did not type must not be silently presented as one they did,
  // and a slip with no date must not claim to have read one.
  await chooseSlipImage(page, KBANK_SLIP);
  await expect(date).toHaveValue(today);
  await expect(bench.getByText(/carries no date, so today is filled in/)).toBeVisible();
});

// Bulk slip upload (PLAN task 39, D-135).
//
// **What this covers that no unit test can**: many files through one input, the worklist that
// results, and the fact that a slip the reader could not read stays in front of the owner instead
// of being filed. Both browser configs pin `GOOGLE_VISION_KEY` empty (D-129), so
// `POST /api/v1/ocr/read` answers 503 here — which makes this the *reader-unavailable* path, and
// that is the more valuable one to hold in a browser. **Nothing may be captured unseen when the
// reader is down**, and this is what proves it.
//
// The classification itself — QR date, printed date, the disagreement refusal, the amount grammar —
// is `tests/slip-batch.test.ts`, where it needs no browser and no third party.
async function chooseBatchImages(page: import("@playwright/test").Page, slips: readonly SlipFixture[]) {
  await page.locator('.batch-bench input[type="file"]').setInputFiles(
    await Promise.all(slips.map(async (slip, index) => ({
      name: `slip-${index}.png`,
      mimeType: "image/png",
      buffer: await buildSlipQrPng(slip)
    })))
  );
}

test("reads many slips at once, files none unseen, and captures the ones filled in", async ({ page }) => {
  await signIn(page, "/slips");
  const bench = page.locator(".batch-bench");

  await chooseBatchImages(page, [SCB_SLIP, KTB_SLIP]);
  // Nothing has left the device yet, and the form says so before the button is pressed.
  await expect(bench.getByText("2 slips chosen. Nothing has been read or sent yet.")).toBeVisible();

  await bench.getByRole("button", { name: "Read these slips" }).click();

  const rows = bench.locator(".batch-row");
  await expect(rows).toHaveCount(2);
  // Identity came from the QR on this device, so it is displayed even though the reader failed.
  await expect(bench.getByText(SCB_SLIP.reference)).toBeVisible({ timeout: 30_000 });
  await expect(bench.getByText(KTB_SLIP.reference)).toBeVisible();

  // The property this spec exists for. The reader is unavailable, so both slips are in front of
  // the owner and neither is capturable — a bulk form that filed them with a guessed amount or
  // today's date would still look like it had worked.
  await expect(rows.first().getByText("needs a value")).toBeVisible();
  await expect(rows.nth(1).getByText("needs a value")).toBeVisible();
  await expect(bench.getByRole("button", { name: /^Capture / })).toBeDisabled();

  for (const [index, amount, date] of [[0, "1,250.75", "2026-07-20"], [1, "500.00", "2026-01-09"]] as const) {
    await rows.nth(index).getByLabel("Amount (THB)").fill(amount);
    await rows.nth(index).getByLabel("Date", { exact: true }).fill(date);
  }

  await expect(bench.getByRole("button", { name: "Capture 2 slips" })).toBeEnabled();
  await bench.getByRole("button", { name: "Capture 2 slips" }).click();

  await expect(rows.first().getByText("captured")).toBeVisible({ timeout: 30_000 });
  await expect(rows.nth(1).getByText("captured")).toBeVisible();

  // The ledger itself, not the chips. A status saying "captured" can be true of a page that
  // stored nothing, which is the trap PLAN task 17 recorded.
  const owner = ownerId();
  const stored = psql(`
    select kind || ' ' || amount_minor || ' ' || bank_code || ' ' || occurred_on
    from public.slips where owner_id = '${owner}' order by occurred_on;
  `);
  expect(stored.ok, stored.output).toBe(true);
  // The batch's one direction applied to both, and negative because "money out" is the default.
  expect(stored.output).toContain("withdrawal -50000 KTB 2026-01-09");
  expect(stored.output).toContain("withdrawal -125075 SCB 2026-07-20");

  // Provisional means provisional: nothing reached the authoritative ledger.
  const authoritative = psql(`select count(*) from public.source_transactions where owner_id = '${owner}';`);
  expect(authoritative.output.trim()).toContain("0");
});

test("re-running a batch over the same slips writes no second row", async ({ page }) => {
  // The property that makes a backlog safe to retry: a batch interrupted halfway can simply be run
  // again over the whole folder. `capture_slip` is idempotent on (owner, bank, reference)
  // (migration 011), and this is that guarantee exercised through the form rather than the RPC.
  await signIn(page, "/slips");
  const bench = page.locator(".batch-bench");

  for (const attempt of ["first", "second"] as const) {
    await chooseBatchImages(page, [SCB_SLIP]);
    await bench.getByRole("button", { name: "Read these slips" }).click();
    const row = bench.locator(".batch-row").first();
    await expect(row.getByText("needs a value")).toBeVisible({ timeout: 30_000 });
    // A different amount the second time, so a row silently overwritten would be visible in the
    // stored figure rather than hidden behind an identical one.
    await row.getByLabel("Amount (THB)").fill(attempt === "first" ? "1,250.75" : "9,999.00");
    await row.getByLabel("Date", { exact: true }).fill("2026-07-20");
    await bench.getByRole("button", { name: "Capture 1 slip" }).click();
    await expect(row.getByText(attempt === "first" ? "captured" : "already captured")).toBeVisible({ timeout: 30_000 });
  }

  const owner = ownerId();
  const stored = psql(`select count(*), min(amount_minor) from public.slips where owner_id = '${owner}';`);
  expect(stored.output).toContain("1");
  expect(stored.output).toContain("-125075");
});

// Reconciliation in the ledger view (PLAN task 22, D-063). The gap the owner found by using
// the app: a captured slip was stored correctly and shown nowhere, while `GET /api/v1/slips`
// had existed with no caller. Slips now appear in the ledger, a matched pair collapses onto
// its statement row, and the totals count each payment exactly once.
//
// No layout prints the slip's reference, so a match is a proposal from bank, exact amount and
// a date within one day (D-064) — which is why both halves are covered here: the pair that
// collapses, and the slip that has nothing to collapse onto.

async function captureSlip(
  page: import("@playwright/test").Page,
  options: { slip?: Parameters<typeof buildSlipQrPng>[0]; amount: string; date: string; counterparty?: string }
) {
  await page.goto("/slips");
  const bench = page.locator(".slip-bench");
  await chooseSlipImage(page, options.slip);
  await bench.getByLabel("Amount (THB)").fill(options.amount);
  await bench.getByLabel("Date", { exact: true }).fill(options.date);
  if (options.counterparty) await bench.getByLabel("Counterparty (optional)").fill(options.counterparty);
  await bench.getByRole("button", { name: "Capture slip" }).click();
  await expect(bench.getByText(/Captured as a provisional entry/)).toBeVisible({ timeout: 15_000 });
}

test("collapses a slip onto the statement row it matches, and counts the payment once", async ({ page }) => {
  await signIn(page, "/slips");
  // 500.00 out on 09/01/69 is one row of the Krungthai fixture, and the only row of that
  // amount — so this is the unambiguous case the matcher is allowed to act on.
  await captureSlip(page, { slip: KTB_SLIP, amount: "500.00", date: "2026-01-09", counterparty: "Browser synthetic payee" });

  await page.goto("/import");
  await importStatement(page, buildStatementPdf(validStatement), MATCHING_ACCOUNT, "Browser synthetic", 4);

  await page.goto("/ledger");
  const ledger = page.locator("section.ledger-band");
  await ledger.getByRole("button", { name: "Load transactions" }).click();

  // Four rows, not five: the pair is one payment. This is the assertion that would fail if
  // matching regressed to showing both records.
  await expect(ledger.locator("tbody tr")).toHaveCount(4, { timeout: 30_000 });
  await expect(ledger.locator("tr.provisional-row")).toHaveCount(0);

  const verified = ledger.locator("tr.verified-row");
  await expect(verified).toHaveCount(1);
  await expect(verified.getByText("Verified by slip")).toBeVisible();
  // The statement row survives, carrying its printed balance — and takes the counterparty the
  // owner typed, which the bank's own description does not carry.
  await expect(verified.locator('td[data-label="Account balance"]')).toHaveText(formatThb("1024950"));
  await expect(verified.getByText("Browser synthetic payee (from slip)")).toBeVisible();

  // The pair collapsed onto the statement row, so the slip is on screen nowhere until this is
  // opened — and "verified" would be something the owner could only take on trust (D-075).
  await verified.getByRole("button", { name: /^Show slip/u }).click();
  const detail = ledger.locator("tr.pair-detail");
  await expect(detail.getByText(KTB_SLIP.reference)).toBeVisible();
  // The claim is checkable rather than asserted: the slip's own amount is shown beside the
  // row's movement, and they are equal to the satang or the pairing could not exist.
  await expect(detail.getByText(formatThb("-50000"))).toBeVisible();
  await expect(detail.getByText(/the rule — same bank, same amount to the satang, within one day/u)).toBeVisible();

  // The total counts four payments and reports none of them provisional.
  await expect(ledger.locator(".ledger-strip dd").first()).toHaveText("4");
  await expect(ledger.getByText("1 verified")).toBeVisible();

  // And the authoritative ledger is untouched by any of it: the slip did not become a row.
  const owner = ownerId();
  expect(psql(`select count(*) from public.source_transactions where owner_id = '${owner}';`).output.trim()).toBe("4");
  expect(psql(`select count(*) from public.slips where owner_id = '${owner}';`).output.trim()).toBe("1");
});

test("keeps a slip with no matching row as its own provisional entry, counted in the total", async ({ page }) => {
  await signIn(page, "/slips");
  // An SCB slip against a Krungthai statement: right owner, wrong bank, so nothing can match
  // however well the amount reads. It stays a row of its own.
  await captureSlip(page, { amount: "1250.75", date: "2026-07-20" });

  await page.goto("/import");
  await importStatement(page, buildStatementPdf(validStatement), MATCHING_ACCOUNT, "Browser synthetic", 4);

  await page.goto("/ledger");
  const ledger = page.locator("section.ledger-band");
  await ledger.getByRole("button", { name: "Load transactions" }).click();

  await expect(ledger.locator("tbody tr")).toHaveCount(5, { timeout: 30_000 });
  const provisional = ledger.locator("tr.provisional-row");
  await expect(provisional).toHaveCount(1);
  await expect(provisional.getByText("Awaiting statement")).toBeVisible();

  // Counted as money that moved — five rows, one of them provisional, said in the strip.
  await expect(ledger.locator(".ledger-strip dd").first()).toContainText("5");
  await expect(ledger.locator(".ledger-strip dd").first()).toContainText("1 provisional");
  await expect(ledger.getByText("1 awaiting a statement")).toBeVisible();

  // No balance in either money column: a slip is not in the statement's balance chain, and a
  // derived figure there would be invented.
  await expect(provisional.locator('td[data-label="Account balance"]')).toHaveText("—");
  await expect(provisional.locator('td[data-label="All accounts"]')).toHaveText("—");

  // This owner holds two SCB accounts, so the QR's bank does not identify one — the row says
  // so rather than filing the slip under a guess (D-056).
  await expect(provisional.getByText("SCB · account unknown")).toBeVisible();
  await ledger.getByLabel("Account").selectOption(MATCHING_ACCOUNT);
  await expect(ledger.locator("tr.provisional-row")).toHaveCount(0);
  await expect(ledger.getByText(/hidden while one account is selected/)).toBeVisible();
});

test("lets the owner overrule a match and put it back, and stores every decision", async ({ page }) => {
  // The second half of PLAN task 22 (migration 012, D-067), which shipped as an RPC with no
  // route and no UI — the same shape of gap as D-063, where a write path had no read path and
  // it took the owner using the app to find it. This is that path driven end to end: the
  // decision is made in the browser, stored by `set_slip_match`, and reconciled against on the
  // next render, with the ledger's own totals following it.
  await signIn(page, "/slips");
  await captureSlip(page, { slip: KTB_SLIP, amount: "500.00", date: "2026-01-09", counterparty: "Browser synthetic payee" });

  await page.goto("/import");
  await importStatement(page, buildStatementPdf(validStatement), MATCHING_ACCOUNT, "Browser synthetic", 4);

  await page.goto("/ledger");
  const ledger = page.locator("section.ledger-band");
  await ledger.getByRole("button", { name: "Load transactions" }).click();
  await expect(ledger.locator("tbody tr")).toHaveCount(4, { timeout: 30_000 });

  // The rule paired these two. The owner disagrees, and that is the whole feature.
  await ledger.locator("tr.verified-row").getByRole("button", { name: /^Not this slip/u }).click();

  // Five rows again: the pair is two records, the slip is visible rather than absorbed, and
  // the totals count it as money that moved but not yet confirmed.
  await expect(ledger.locator("tbody tr")).toHaveCount(5, { timeout: 15_000 });
  await expect(ledger.locator("tr.verified-row")).toHaveCount(0);
  const provisional = ledger.locator("tr.provisional-row");
  await expect(provisional).toHaveCount(1);
  // Said in words, because "no statement has arrived" and "you decided this is on none of
  // them" are the same picture otherwise, and only one of them is take-back-able.
  await expect(provisional.getByText("Your decision · on no statement row")).toBeVisible();
  await expect(ledger.locator(".ledger-strip dd").first()).toContainText("1 provisional");

  // Stored, audited and revisioned — not merely on screen.
  const owner = ownerId();
  expect(psql(`select decision from public.slip_match_overlays where owner_id = '${owner}';`).output.trim()).toBe("unmatched");
  expect(psql(`select count(*) from public.audit_events
    where owner_id = '${owner}' and event_type = 'slip.match.unmatched';`).output.trim()).toBe("1");

  // Both controls sit inside a table cell and are labelled per row rather than by a heading,
  // so they are checked where they are: a select whose only visible text is its options, and a
  // button whose four words repeat down the column, are exactly what an accessible name has to
  // carry. This is the only automatic coverage they have — the axe pass in the isolated suite
  // runs against a ledger nobody has loaded, where neither control exists.
  expect((await new AxeBuilder({ page }).include("section.ledger-band").analyze()).violations).toEqual([]);

  // And it goes back, by choosing the row rather than picking its name out of a list (D-069).
  // The table becomes the chooser: it shows the slip and only the rows that could be it — bank
  // and exact amount, not the automatic date window, which is what lets an override reach a row
  // the rule refused.
  await provisional.getByRole("button", { name: /Choose a statement row/u }).click();
  await expect(ledger.getByText("Choosing a statement row")).toBeVisible();
  // Focus follows the mode. The button that opened it disables itself in the same update, and a
  // browser blurs a disabled element — so without this a keyboard user lands on <body>, hears
  // the announcement, and has nowhere to be. axe cannot see this; only a focus assertion can.
  await expect(ledger.getByRole("button", { name: "Cancel" })).toBeFocused();
  // Two rows on screen: the slip, and the one row of that amount. The totals are gone, because
  // a subtotal of a slip and its candidates is not a figure about anything.
  await expect(ledger.locator("tbody tr")).toHaveCount(2);
  await expect(ledger.locator(".ledger-strip")).toHaveCount(0);
  // The filters cannot be used to hide the answer while the question is being asked.
  await expect(ledger.getByLabel("Status")).toBeDisabled();

  // Located by the row it sits in, not by the button's own words — every candidate's button
  // says the same thing, which is the point: the row is what identifies it, and the accessible
  // name carries the time and balance that distinguish this one.
  await ledger.locator("tr:not(.provisional-row)").getByRole("button", { name: /^This is it/u }).click();

  await expect(ledger.locator("tbody tr")).toHaveCount(4, { timeout: 15_000 });
  const verified = ledger.locator("tr.verified-row");
  await expect(verified).toHaveCount(1);
  await expect(verified.getByText("Your match")).toBeVisible();
  await expect(ledger.locator(".ledger-strip dd").first()).toHaveText("4");

  // Two decisions about one slip, one current row and two revisions of it: the current value
  // is mutable and the history is not, which is why this is an overlay pair and not a column.
  expect(psql(`select decision from public.slip_match_overlays where owner_id = '${owner}';`).output.trim()).toBe("matched");
  expect(psql(`select count(*) from public.slip_match_revisions where owner_id = '${owner}';`).output.trim()).toBe("2");

  expect((await new AxeBuilder({ page }).include("section.ledger-band").analyze()).violations).toEqual([]);
});

test("says a statement row is already another slip's before letting this one take it", async ({ page }) => {
  // `matchCandidates` offers a row the rule paired with some *other* slip, deliberately: taking
  // it is a legitimate overrule and the database accepts it. What must not happen is taking it
  // without being told — the losing slip drops back to provisional, and the only cue left would
  // be a green edge, which is colour alone.
  await signIn(page, "/slips");
  // Both 500.00 at Krungthai. Only the 09 Jan one is on the row's own day, so the rule pairs
  // that and leaves the other provisional — which is the shape where this can happen at all.
  await captureSlip(page, { slip: KTB_SLIP, amount: "500.00", date: "2026-01-09", counterparty: "Browser synthetic payee" });
  await captureSlip(page, { slip: KTB_SLIP_DATED, amount: "500.00", date: "2026-01-05", counterparty: "Browser synthetic other" });

  await page.goto("/import");
  await importStatement(page, buildStatementPdf(validStatement), MATCHING_ACCOUNT, "Browser synthetic", 4);

  await page.goto("/ledger");
  const ledger = page.locator("section.ledger-band");
  await ledger.getByRole("button", { name: "Load transactions" }).click();
  await expect(ledger.locator("tbody tr")).toHaveCount(5, { timeout: 30_000 });
  await expect(ledger.locator("tr.verified-row")).toHaveCount(1);

  await ledger.locator("tr.provisional-row").getByRole("button", { name: /Choose a statement row/u }).click();

  // The candidate keeps its status and gains the consequence in words.
  const candidate = ledger.locator("tr:not(.provisional-row)");
  await expect(candidate.getByText("Verified by slip")).toBeVisible();
  await expect(candidate.getByText(/Already matched to the .+ slip/u)).toBeVisible();
  await expect(candidate.getByText(/unmatches that one/u)).toBeVisible();

  await candidate.getByRole("button", { name: /^This is it/u }).click();

  // The swap happened and is visible from both sides: the row is now the owner's match, and the
  // slip that lost it is back as its own provisional row rather than gone.
  await expect(ledger.locator("tbody tr")).toHaveCount(5, { timeout: 15_000 });
  await expect(ledger.locator("tr.verified-row").getByText("Your match")).toBeVisible();
  await expect(ledger.locator("tr.provisional-row").getByText("Browser synthetic payee")).toBeVisible();

  const owner = ownerId();
  expect(psql(`select count(*) from public.slip_match_overlays where owner_id = '${owner}';`).output.trim()).toBe("1");
});

// Cash and corrections in the ledger view (migration 013, the rest of PLAN task 22). The same
// shape of gap as D-063 and D-067 twice over: three RPCs shipped with no route and no UI, so
// nothing built in 013 could be reached from the app. This is that path driven end to end.
test("records a cash payment into the ledger and corrects it without losing what was typed", async ({ page }) => {
  await signIn(page, "/ledger");

  const cash = page.locator("section.cash-bench");
  await cash.getByRole("button", { name: "Record a cash payment" }).click();
  await cash.getByLabel("Amount (THB)").fill("250.00");
  await cash.getByLabel("Date", { exact: true }).fill("2026-01-09");
  await cash.getByLabel("Counterparty (optional)").fill("Browser synthetic stall");
  await cash.getByRole("button", { name: "Record this payment" }).click();
  // The words say the thing the owner most needs to know about this table: it is append-only.
  await expect(cash.getByText(/cannot be deleted/)).toBeVisible({ timeout: 15_000 });

  const ledger = page.locator("section.ledger-band");
  await ledger.getByRole("button", { name: "Load transactions" }).click();

  const row = ledger.locator("tr.cash-row");
  await expect(row).toHaveCount(1, { timeout: 30_000 });
  await expect(row.getByText("Cash · no statement")).toBeVisible();
  await expect(row.locator('td[data-label="Movement"]')).toHaveText(formatThb("-25000"));
  // No balance in either money column, and for a stronger reason than a slip's: cash is in no
  // bank's balance chain at all, so there is not even a later statement that could supply one.
  await expect(row.locator('td[data-label="Account balance"]')).toHaveText("—");
  // Counted apart from `provisional`: a slip is waiting for a statement, and this never will be.
  await expect(ledger.locator(".ledger-strip dd").first()).toContainText("1 cash");

  const owner = ownerId();
  expect(psql(`select count(*) from public.cash_entries where owner_id = '${owner}';`).output.trim()).toBe("1");

  // Correcting it. The entry itself cannot be changed — `cash_entries_immutable` refuses an
  // update outright — so this writes an overlay beside it and keeps both figures.
  await row.getByRole("button", { name: /^Correct/u }).click();
  const form = ledger.locator("form.correction-form");
  await form.getByLabel("Amount (THB)").fill("260.00");
  await form.getByRole("button", { name: "Save the correction" }).click();

  await expect(ledger.locator("tr.cash-row").locator('td[data-label="Movement"]'))
    .toHaveText(formatThb("-26000"), { timeout: 15_000 });
  await expect(ledger.locator("tr.cash-row").getByText("Corrected by you")).toBeVisible();

  // What was first typed is still there, which is the entire argument for an overlay rather
  // than an update: cash has no statement behind it, so both figures are the only record.
  expect(psql(`select amount_minor from public.cash_entries where owner_id = '${owner}';`).output.trim()).toBe("-25000");
  expect(psql(`select amount_minor from public.cash_entry_overlays where owner_id = '${owner}';`).output.trim()).toBe("-26000");
  expect(psql(`select count(*) from public.cash_entry_revisions where owner_id = '${owner}';`).output.trim()).toBe("1");

  expect((await new AxeBuilder({ page }).include("section.ledger-band").analyze()).violations).toEqual([]);
});

test("matches a slip only after the amount is corrected to the one the statement carries", async ({ page }) => {
  // The read-side half of migration 014, driven through the browser. The captured amount
  // matches no row; the corrected one matches exactly one. If the view reconciled on the
  // figure first typed — which is precisely what `set_slip_match` did before 014 — this slip
  // would stay provisional after a correction that makes it pair.
  await signIn(page, "/slips");
  await captureSlip(page, { slip: KTB_SLIP, amount: "505.00", date: "2026-01-09", counterparty: "Browser synthetic payee" });

  await page.goto("/import");
  await importStatement(page, buildStatementPdf(validStatement), MATCHING_ACCOUNT, "Browser synthetic", 4);

  await page.goto("/ledger");
  const ledger = page.locator("section.ledger-band");
  await ledger.getByRole("button", { name: "Load transactions" }).click();

  // Five rows: nothing carries 505.00, so the slip is its own row.
  await expect(ledger.locator("tbody tr")).toHaveCount(5, { timeout: 30_000 });
  const provisional = ledger.locator("tr.provisional-row");
  await expect(provisional).toHaveCount(1);

  await provisional.getByRole("button", { name: /^Correct what you typed/u }).click();
  const form = ledger.locator("form.correction-form");
  await form.getByLabel("Amount (THB)").fill("500.00");
  await form.getByRole("button", { name: "Save the correction" }).click();

  // Four rows: the corrected figure equals the row's movement to the satang, so the pair
  // collapses and the payment is counted once.
  await expect(ledger.locator("tbody tr")).toHaveCount(4, { timeout: 15_000 });
  await expect(ledger.locator("tr.verified-row")).toHaveCount(1);

  // The identity the QR carried is untouched, and the original amount survives beside the
  // correction — what the owner typed is what the owner may correct, and nothing more.
  const owner = ownerId();
  expect(psql(`select amount_minor from public.slips where owner_id = '${owner}';`).output.trim()).toBe("-50500");
  expect(psql(`select slip_reference from public.slips where owner_id = '${owner}';`).output.trim()).toBe(KTB_SLIP.reference);
  expect(psql(`select amount_minor from public.slip_correction_overlays where owner_id = '${owner}';`).output.trim()).toBe("-50000");
});

/**
 * Capturing a notification card **through its real route** rather than through its form.
 *
 * The form is deliberately not driven here, and that is the same gap D-088 left for the OCR
 * amount finder: reaching the submit button needs the engine to recognise a rendered Thai label,
 * and the measured finding is that labels are missed often enough to make that flaky by
 * construction. The *ledger view* has no such dependency, so it is tested — this posts the card
 * through `POST /api/v1/notification-cards` under the browser's own signed-in session, which
 * exercises every check the route makes, including the per-layout account binding.
 *
 * `page.request` shares the page's cookie jar, so this is the owner's real aal2 session rather
 * than a second one.
 */
async function captureCard(
  page: import("@playwright/test").Page,
  card: { amountMinor: string; balanceMinor: string; occurredOn: string; occurredAtTime: string }
) {
  const response = await page.request.post("/api/v1/notification-cards", {
    data: {
      accountId: MATCHING_ACCOUNT,
      channel: "Krungthai Connext",
      // Krungthai prints the account's last four, which is what `accounts.last_four` holds — so
      // the route's binding check passes on the value itself rather than on an offset (D-101).
      printedAccountDigits: "7890",
      kind: "withdrawal",
      amountMinor: card.amountMinor,
      balanceMinor: card.balanceMinor,
      occurredOn: card.occurredOn,
      occurredAtTime: card.occurredAtTime,
      counterparty: "Browser synthetic card payee",
      categoryId: null,
      note: null
    }
  });
  expect(response.status(), await response.text()).toBe(201);
}

test("collapses a notification card onto its statement row, and the printed balance is what paired them", async ({ page }) => {
  await signIn(page, "/import");
  await importStatement(page, buildStatementPdf(validStatement), MATCHING_ACCOUNT, "Browser synthetic", 4);

  // 500.00 out on 09/01/69 is one row of the Krungthai fixture, and it leaves the account at
  // 10,249.50 — so this card carries the amount **and** the balance that row prints.
  await captureCard(page, {
    amountMinor: "-50000",
    balanceMinor: "1024950",
    occurredOn: "2026-01-09",
    occurredAtTime: "09:30"
  });

  await page.goto("/ledger");
  const ledger = page.locator("section.ledger-band");
  await ledger.getByRole("button", { name: "Load transactions" }).click();

  // Four rows, not five: the pair is one payment, exactly as a matched slip is.
  await expect(ledger.locator("tbody tr")).toHaveCount(4, { timeout: 30_000 });
  await expect(ledger.locator("tr.card-row")).toHaveCount(0);

  const verified = ledger.locator("tr.verified-row");
  await expect(verified).toHaveCount(1);
  await expect(verified.getByText("Verified by card")).toBeVisible();
  await expect(verified.locator('td[data-label="Account balance"]')).toHaveText(formatThb("1024950"));
  // Attributed to the card, not to a slip. This row has no slip, so "(from slip)" would name a
  // record that is not here — and the two are corrected in different places.
  await expect(verified.getByText("Browser synthetic card payee (from card)")).toBeVisible();

  // The pair collapsed onto the statement row, so the card is on screen nowhere until this is
  // opened — and the panel is what makes "verified by card" checkable rather than trusted.
  await verified.getByRole("button", { name: /^Show card/u }).click();
  const detail = ledger.locator("tr.pair-detail");
  await expect(detail.getByText("Krungthai Connext")).toBeVisible();
  await expect(detail.getByText(/equal to this row's printed balance, which is what paired them/u)).toBeVisible();
  await expect(detail.getByText(/same account, same amount to the satang, within one day, and the same printed balance/u)).toBeVisible();

  await expect(ledger.locator(".ledger-strip dd").first()).toHaveText("4");
  await expect(ledger.getByText("1 verified")).toBeVisible();

  // And the authoritative ledger is untouched: the card did not become a statement row.
  const owner = ownerId();
  expect(psql(`select count(*) from public.source_transactions where owner_id = '${owner}';`).output.trim()).toBe("4");
  expect(psql(`select count(*) from public.notification_cards where owner_id = '${owner}';`).output.trim()).toBe("1");
});

/**
 * The fail-closed half, in a real browser. This is the case a slip cannot even have: a slip prints
 * no balance, so nothing about it can contradict the row it otherwise fits.
 */
test("refuses to pair a card whose printed balance contradicts the row that otherwise fits", async ({ page }) => {
  await signIn(page, "/import");
  await importStatement(page, buildStatementPdf(validStatement), MATCHING_ACCOUNT, "Browser synthetic", 4);

  // The same amount and the same day as the row above, and a balance that row does not carry.
  await captureCard(page, {
    amountMinor: "-50000",
    balanceMinor: "999999",
    occurredOn: "2026-01-09",
    occurredAtTime: "09:30"
  });

  await page.goto("/ledger");
  const ledger = page.locator("section.ledger-band");
  await ledger.getByRole("button", { name: "Load transactions" }).click();

  // Five rows, not four: refusing to pair means the card stays its own row and the statement row
  // stays unclaimed. Both halves are asserted, because a rule that dropped the card instead would
  // also produce four.
  await expect(ledger.locator("tbody tr")).toHaveCount(5, { timeout: 30_000 });
  await expect(ledger.locator("tr.verified-row")).toHaveCount(0);

  const cardRow = ledger.locator("tr.card-row");
  await expect(cardRow).toHaveCount(1);
  await expect(cardRow.getByText("Balance disagrees")).toBeVisible();
  // It says what was measured rather than that something went wrong, and the count is the number
  // of rows that fitted on everything but the balance.
  await expect(cardRow.getByText(/1 statement row on this account carries this exact amount within a day/u)).toBeVisible();
  // The balance it printed is shown, marked as the card's own rather than the statement's.
  await expect(cardRow.locator('td[data-label="Account balance"]')).toContainText(formatThb("999999"));

  await expect(ledger.getByText(/1 whose balance disagrees/u)).toBeVisible();
});

/**
 * Retirement, driven end to end — the remedy for a card captured against the wrong account or
 * captured twice (D-103). The card row is append-only and the binding cannot be re-made, so this
 * is the only thing a wrong card can have, and it has to be reversible on screen as well as in
 * the database. Without the retired-cards list below the table it would not be.
 */
test("retires a card out of the ledger and the totals, and brings it back", async ({ page }) => {
  await signIn(page, "/import");
  await importStatement(page, buildStatementPdf(validStatement), MATCHING_ACCOUNT, "Browser synthetic", 4);

  // A card matching nothing, so it is its own row and its amount is in the totals.
  await captureCard(page, {
    amountMinor: "-2500",
    balanceMinor: "880000",
    occurredOn: "2026-01-09",
    occurredAtTime: "16:20"
  });

  await page.goto("/ledger");
  const ledger = page.locator("section.ledger-band");
  await ledger.getByRole("button", { name: "Load transactions" }).click();
  await expect(ledger.locator("tbody tr")).toHaveCount(5, { timeout: 30_000 });
  await expect(ledger.locator("tr.card-row")).toHaveCount(1);
  await expect(ledger.locator(".ledger-strip dd").first()).toContainText("5");

  await ledger.getByRole("button", { name: /^Not a payment/u }).click();

  // Out of the rows and out of the totals — the whole point of `not-a-payment`.
  await expect(ledger.locator("tbody tr")).toHaveCount(4);
  await expect(ledger.locator("tr.card-row")).toHaveCount(0);
  await expect(ledger.locator(".ledger-strip dd").first()).toHaveText("4");

  // And still in the database, because nothing here is ever deleted.
  const owner = ownerId();
  expect(psql(`select count(*) from public.notification_cards where owner_id = '${owner}';`).output.trim()).toBe("1");
  expect(psql(`select decision from public.notification_card_decision_overlays where owner_id = '${owner}';`).output.trim()).toBe("not-a-payment");

  // Reversible on screen, which is what makes retiring safe to offer at all.
  await ledger.getByRole("button", { name: /^Show 1 retired card/u }).click();
  await ledger.getByRole("button", { name: /^Bring back/u }).click();
  await expect(ledger.locator("tr.card-row")).toHaveCount(1);
  await expect(ledger.locator(".ledger-strip dd").first()).toContainText("5");
  expect(psql(`select decision from public.notification_card_decision_overlays where owner_id = '${owner}';`).output.trim()).toBe("unmatched");
});

/**
 * The balance overrule, driven end to end. The rule refuses this pairing (D-102); the owner may
 * still make it, and the acknowledgement is what gets stored (D-103). The row must say the
 * disagreement out loud **before** the click, because after it there is no undo that un-writes an
 * append-only revision.
 */
test("lets the owner match a card whose balance disagrees, after saying so in words", async ({ page }) => {
  await signIn(page, "/import");
  await importStatement(page, buildStatementPdf(validStatement), MATCHING_ACCOUNT, "Browser synthetic", 4);

  // The right amount and day for one of the fixture's rows, and a balance that row does not
  // print — so the automatic rule refuses it and the ledger says the balance disagrees.
  await captureCard(page, {
    amountMinor: "-50000",
    balanceMinor: "111111",
    occurredOn: "2026-01-09",
    occurredAtTime: "09:30"
  });

  await page.goto("/ledger");
  const ledger = page.locator("section.ledger-band");
  await ledger.getByRole("button", { name: "Load transactions" }).click();
  await expect(ledger.locator("tbody tr")).toHaveCount(5, { timeout: 30_000 });
  await expect(ledger.locator("tr.card-row").getByText("Balance disagrees")).toBeVisible();

  await ledger.getByRole("button", { name: /^Choose a statement row for the card/u }).click();

  // The consequence is named before the click, not after it. This is the assertion that would
  // fail if the disagreement were ever stored silently.
  await expect(ledger.getByText(/Choosing it records that you accepted the disagreement/u)).toBeVisible();
  await ledger.getByRole("button", { name: /^This is it/u }).click();

  // The pair collapses and the row says the overrule stands.
  await expect(ledger.locator("tbody tr")).toHaveCount(4);
  await expect(ledger.locator("tr.verified-row").getByText("Verified by card")).toBeVisible();
  await expect(ledger.getByText(/You matched this despite the card and the row printing different balances/u)).toBeVisible();

  // Stored as the owner's consent rather than as a comparison that could be recomputed.
  const owner = ownerId();
  expect(psql(`select accepted_balance_mismatch from public.notification_card_decision_overlays where owner_id = '${owner}';`).output.trim()).toBe("t");
});

test("slip capture has no automatically detectable accessibility violations", async ({ page }) => {
  await signIn(page, "/slips");
  await chooseSlipImage(page);
  await expect(page.locator(".slip-bench").getByText(SLIP_REFERENCE)).toBeVisible();
  const results = await new AxeBuilder({ page }).include(".slip-bench").analyze();
  expect(results.violations).toEqual([]);
});

// Reading a slip in a real browser under the strict CSP, which is the one thing no unit test can
// reach (D-087, D-129).
//
// **This spec replaced a different one on 2026-08-18, and what was lost is worth naming.** Until
// then it drove `lib/slip-ocr-engine.ts` — a worker, a WebAssembly core and a 3 MB language model,
// each governed by `worker-src`, `script-src`'s `'wasm-unsafe-eval'` and `connect-src` — and it was
// **the only check anywhere that the strict CSP held against a real OCR engine running in the
// page**. That engine is gone (D-129) and there is nothing left to hold it to. Nothing now proves
// the policy would survive a bundled engine, because the app no longer has one; re-adding one means
// re-earning that proof rather than assuming this spec covers it.
//
// **What this proves instead is the shape that replaced it**: the browser reaches this app's own
// route and nothing else. The image is POSTed same-origin to `/api/v1/ocr/read`, which holds the key
// and names the third party (D-058, D-120) — so a `connect-src` naming only `'self'` and the
// Supabase origin has to permit the call, and no request may reach `vision.googleapis.com` from the
// page at all. Both fail at runtime only; a build cannot tell you the browser will refuse.
//
// **The refusal is the evidence and it is deterministic** — but only because the config pins
// `GOOGLE_VISION_KEY` to the empty string, which it does for a reason found by this spec failing
// (D-129). The key lives in the owner's Windows *user* environment, so `next start` inherits it on
// this machine and the first run of this spec made a **real Cloud Vision call** with the generated
// QR fixture. A browser suite must not depend on whose machine it is running on, and must not reach
// a third party at all. With the key pinned empty the route answers 503 with the sentence written
// for a deployment missing its key, and the form shows it. That sentence proves the whole chain ran:
// the encode, the same-origin POST, the route's auth and guards, and the form's handling of a
// refusal. A blocked request would produce a different sentence — "could not be reached" — which is
// what makes the two worth distinguishing on screen.
//
// **The success path is deliberately not asserted here.** It would need a real Vision call from a
// test, which is a third party, a credential and a charge inside a browser suite. What produces a
// filled box is covered where it is deterministic: `locateAmount`, `proposeAmount` and `paddedCrop`
// in `tests/slip-ocr.test.ts`, and the reader seam in `tests/vision-ocr.test.ts`.
test("reads a slip through this app's own route under the strict CSP", async ({ page }) => {
  test.setTimeout(120_000);

  const refusals: string[] = [];
  const requested: string[] = [];
  const failed: string[] = [];
  // Registered before anything loads: a policy violation during hydration would otherwise be
  // missed, and that is exactly the failure mode a build cannot see.
  page.on("console", (message) => {
    if (message.type() === "error" && /Content Security Policy|Refused to/iu.test(message.text())) {
      refusals.push(message.text());
    }
  });
  page.on("request", (request) => requested.push(request.url()));
  page.on("requestfailed", (request) => failed.push(`${request.url()} — ${request.failure()?.errorText ?? "failed"}`));

  await signIn(page, "/slips");
  const bench = page.locator(".slip-bench");
  await chooseSlipImage(page);
  await expect(bench.getByText(SLIP_REFERENCE)).toBeVisible();

  await bench.getByRole("button", { name: "Read the amount" }).click();
  await expect(bench.getByText("The reader is not configured on this deployment. Type the values yourself."))
    .toBeVisible({ timeout: 60_000 });

  expect(refusals, `the browser refused something: ${refusals.join(" | ")}`).toEqual([]);
  // Scoped deliberately. Next's router cancels its own RSC prefetches on navigation and those
  // arrive here as `ERR_ABORTED` — routine, unrelated, and not something this spec should fail
  // on. What must never happen is anything at all being blocked by the policy.
  expect(failed.filter((entry) => /BLOCKED_BY/u.test(entry)), `a request was blocked: ${failed.join(" | ")}`).toEqual([]);

  // The POST went to this origin, which is the whole reason the CSP did not have to change.
  const origin = new URL(page.url()).origin;
  expect(requested, "the reader route was never called").toContain(`${origin}/api/v1/ocr/read`);
  // And nothing reached a third party. The key lives on the server precisely so this list stays
  // empty — a browser-side Vision call would show up here and would need `connect-src` widened.
  expect(requested.filter((url) => /googleapis|jsdelivr|unpkg|cdn\./iu.test(url))).toEqual([]);
  expect(requested.filter((url) => !url.startsWith(origin) && /^https?:/u.test(url))).toEqual([]);
});
