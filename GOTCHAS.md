# Private Ledger gotchas

Last reviewed: 2026-07-25

Record only repeatable, non-obvious traps. Each item states the symptom, cause, prevention, and verification.

## Windows project ownership can block safe edits

- Symptom: the safe editor reports an incorrect folder owner or `Access is denied`.
- Cause: the project root ACL owner differs from the logged-in user.
- Avoid: repair only the exact project root from an elevated PowerShell session. Do not recursively change unrelated directories.
- Verify: a small `apply_patch` succeeds and `Get-Acl` reports the expected owner.

## System Node is too old

- Symptom: ESM startup failures or inconsistent Next/Vitest behavior under Node 20.
- Cause: this project requires Node 24.
- Avoid: use the ignored project-local Node 24 runtime and pinned Corepack/pnpm until the system runtime is upgraded. Do not “fix” ESM errors by rewriting dependencies.
- Verify: the active `node --version` is 24.x and lint, typecheck, tests, and build pass.

## pnpm 11 requires an explicit build-script allowlist

- Symptom: a clean install ends with `ERR_PNPM_IGNORED_BUILDS` after packages are linked.
- Cause: pnpm 11 replaced `onlyBuiltDependencies` with the stricter `allowBuilds` map.
- Avoid: review each pending lifecycle script and allow only the required named packages in `pnpm-workspace.yaml`; never enable all dependency builds.
- Verify: `pnpm install --frozen-lockfile --offline` succeeds and `pnpm ignored-builds` reports none.

## Strict production CSP can block the Next.js development runtime

- Symptom: Playwright clicks do nothing, no API request is made, and the browser reports that development `eval()` is blocked.
- Cause: React and Next.js development tooling require behavior intentionally forbidden by the production CSP.
- Avoid: run browser acceptance tests against `pnpm build && pnpm start`; do not weaken the production CSP with `unsafe-eval`.
- Verify: the synthetic flow and accessibility tests pass against the production server without CSP console errors.

## Silent Python installers can outlive the calling shell

- Symptom: a second Python installation logs Windows error `0x80070652`, or the launcher temporarily reports no installed runtime.
- Cause: the signed Python bootstrapper returned while its elevated engine and MSI packages were still running.
- Avoid: after launching the installer, wait for all `python-<version>-amd64` installer processes to exit before retrying or verifying. Do not start overlapping repairs.
- Verify: `%LOCALAPPDATA%\Programs\Python\Python314\python.exe --version`, pip, and `py -0p` all report the installed runtime.

## The skill validator inherits the Windows locale encoding

- Symptom: `quick_validate.py` raises a `UnicodeDecodeError` under the Thai Windows locale.
- Cause: the validator reads `SKILL.md` with the platform default encoding rather than forcing UTF-8.
- Avoid: keep project-local skill instructions in ASCII punctuation unless the validator is updated to specify UTF-8.
- Verify: the official `quick_validate.py` reports `Skill is valid!`.

## Custom Docker binding networks break Supabase DNS

- Symptom: the database remains healthy while auth, storage, and realtime restart because they cannot resolve `supabase_db_private-ledger-local`.
- Cause: the attempted custom Docker network with a localhost bridge binding did not preserve Supabase service discovery after reset.
- Avoid: start Supabase without `--network-id`; use its default project network.
- Verify: `docker ps --filter "name=supabase_"` shows the expected services healthy and not restart-looping.

## Local Supabase is development-only

- Symptom: Supabase warns that services bind to `0.0.0.0` and use shared default credentials.
- Cause: this is the CLI’s local development topology.
- Avoid: use it only on a trusted machine/network with the firewall enabled. Never reuse local keys or defaults in production.
- Verify: application URLs use `127.0.0.1`; do not paste `supabase status` output into docs or chat because it contains secrets.

## Unrelated PostgreSQL containers already exist

- Symptom: `docker ps` shows older `pg_container` and `pgadmin4_container` resources and volumes.
- Cause: they predate this project.
- Avoid: filter Docker operations to names labeled for `private-ledger-local`. Never prune or delete unrelated containers, networks, or volumes.
- Verify: existing non-Supabase containers remain unchanged after project operations.

## A D-drive database is not an independent backup

- Symptom: the ledger and its “backup” can be lost in the same device failure, malware incident, or accidental deletion.
- Cause: two copies on one physical computer share a failure domain.
- Avoid: keep an encrypted restorable file on D only as one extra copy, with another encrypted copy off-machine and the password stored separately.
- Verify: periodically restore into an empty test project and compare the result.

## `trigger_is` argument count is easy to misread

- Symptom: pgTAP reports that a human description such as “components are immutable” is the expected trigger function.
- Cause: omitting the function-name argument selects a different `trigger_is` overload.
- Avoid: pass schema, table, trigger, function schema, function name, then description.
- Verify: the three immutability assertions in `supabase/tests/001_security.sql` pass.

## Untracked files are absent from ordinary diffs

- Symptom: `git diff` appears empty even though most project files exist or changed.
- Cause: untracked files are not included in the normal diff.
- Avoid: pair `git status --short` with direct file inspection; do not infer that an empty diff means no work.
- Verify: review both tracked modifications and untracked paths before handoff.

## Snapshot generation is not backup custody

- Symptom: the UI reports a current backup even though encryption or download failed.
- Cause: freshness was marked before the client possessed the encrypted artifact.
- Avoid: snapshot first, encrypt and hand off the artifact, then acknowledge its digest and sequence. Reject acknowledgement if the ledger sequence changed.
- Verify: failure before acknowledgement leaves backup status stale.

## Deposit plus withdrawal is not sufficient anomaly evidence

- Symptom: an arbitrary balance mismatch is silently accepted and used to reset the running balance.
- Cause: classification based only on the component pair.
- Avoid: require `provenance.parserFields.anomaly = "interest-tax-order"` at both TypeScript and SQL boundaries.
- Verify: the unmarked compound-row tests remain blocking.

## JSON numbers cannot carry PostgreSQL bigint safely

- Symptom: values above JavaScript’s safe integer range are rounded before validation or hashing.
- Cause: parsing signed-int64 money or sequences as JSON numbers.
- Avoid: require canonical decimal strings at every HTTP/backup boundary and validate range before SQL casts.
- Verify: numeric `9007199254740993` is rejected and signed-int64 min/max strings round-trip.

## SQL `NULL` can bypass ordinary inequality checks

- Symptom: a malformed manifest field reaches later restore logic instead of being rejected.
- Cause: SQL three-valued logic makes `NULL <> value` evaluate to `NULL`, not `TRUE`.
- Avoid: require object types and exact keys, add explicit null guards, and use `IS DISTINCT FROM` where appropriate.
- Verify: missing/null descriptor and mismatched-count tests fail closed.

## Restore sequence semantics must be exact

- Symptom: zero, duplicate, or mismatched mutation-sequence rows are accepted.
- Cause: treating the last available row as authoritative.
- Avoid: require exactly one sequence row equal to the manifest snapshot sequence; apply one post-restore increment and mark stale.
- Verify: manifest/data sequence mismatch and duplicate-row tests are rejected.

## `.pldemo` is intentionally non-restorable

- Symptom: a user assumes the synthetic UI download can recover the ledger.
- Cause: confusing an encryption demonstration with the schema-v2 backup contract.
- Avoid: preserve its `.pldemo` extension and preview labeling; never clear backup staleness from this path.
- Verify: restore schemas reject it and UI copy calls it a synthetic preview.

## Schema version 1 has no upgrade promise

- Symptom: old pre-release backup files fail schema-v2 restore.
- Cause: v1 existed before real-data authorization and was retired rather than migrated.
- Avoid: do not advertise v1 compatibility. Schema v2 is the first supported recovery contract.
- Verify: docs and validation messages state v1 is unsupported.

## `restore_request` strips nulls inside the chunk, breaking digest binding

- Symptom: a hand-authored populated restore fixture fails with `restore chunk binding mismatch` even though the manifest and chunk look correct.
- Cause: the `pg_temp.restore_request` test helper wraps the whole request in `jsonb_strip_nulls`, which recurses into the chunk and drops any row field whose value is `null` (for example `source_transactions.branch`). The chunk sent to `restore_backup` then differs from the one `finalize_restore_fixture` hashed, so `sha256_jsonb(chunk)` no longer matches the descriptor digest.
- Avoid: give every nullable column a non-null value in populated restore fixtures, or build the request without `jsonb_strip_nulls`. Do not assume export→fixture round-trips are null-safe.
- Verify: the populated round-trip in `supabase/tests/003_restore_contracts.sql` stages all 11 chunks and its re-export equality assertion passes.

## Restore counts must be canonical integers, not merely JSON numbers

- Symptom: a fractional manifest count (e.g. `1.5`) fails with an uncaught `22P02: invalid input syntax for type integer` instead of a controlled contract error.
- Cause: validating counts only as `jsonb_typeof = 'number'` lets non-integers through to a `text::integer` cast.
- Avoid: require canonical non-negative integer text (`^(0|[1-9][0-9]*)$`) for `tableCounts[kind]` and each descriptor `rowCount` before any cast.
- Verify: the `003` fractional-count test expects `invalid restore manifest descriptor` and fails on the pre-006 schema.

## Never use real statements to develop the parser

- Symptom: private PDF bytes, passwords, or values appear in logs, fixtures, screenshots, a session transcript, or commits.
- Cause: using `private-statements/` as convenient parser input.
- Avoid: use approved synthetic geometry fixtures only. Since 2026-07-25 there is exactly one sanctioned route to a real document — **invoke `scripts/mask-statement.mjs`, never read the PDF** — and it emits only masked structure to the gitignored `masked-dumps/` (D-035, `docs/FIXTURE_POLICY.md`). A dump is working material, never a fixture: do not transcribe its coordinates or wordings into one, and never commit it. A real-PDF browser smoke test still requires renewed explicit authorization.
- Verify: privacy tests pass, `git status` never shows a dump, and repository searches contain no real values or statement passwords.

## Fingerprint-bound imports change what pgTAP fixtures may assert

- Symptom: after migration 008, a contract test that hand-writes a `fingerprint` literal fails with `fingerprint mismatch`, or an overlap fixture stops linking to the existing transaction.
- Cause: `confirm_import` now derives the fingerprint from the row's identity facts, so a literal is only accepted when it equals the derived value. Two rows can no longer be made to collide by sharing a literal, and a row can no longer differ in `description` yet claim another row's fingerprint.
- Avoid: let `pg_temp.confirm` inject derived fingerprints by default; pass `p_bind_fingerprints => false` only when the test needs a wrong or deliberately colliding claim. For overlap fixtures, make the fingerprint inputs identical and vary only `provenance`, which is not fingerprinted.
- Verify: `002` test 23 expects `fingerprint mismatch` and fails on the pre-008 schema; the overlap test still asserts `linked_existing`.

## Order of checks in confirm_import decides which error a fixture sees

- Symptom: a test expecting `fingerprint mismatch` gets `ambiguous duplicate fingerprints` or `payload digest mismatch` instead.
- Cause: `confirm_import` validates the digest and the distinct-fingerprint count before entering the per-row loop where the fingerprint is recomputed.
- Avoid: give a fingerprint-mismatch fixture a fresh artifact and idempotency key, a correct digest, and a single row, so nothing earlier can raise first.
- Verify: `002` test 23 passes with migration 008 applied and fails only on the expected missing exception without it.

## The synthetic path in the app UI does not exercise confirm_import

- Symptom: clicking through the running app reports a confirmed batch, yet no import reaches PostgreSQL and server-side contracts (digest binding, fingerprint binding) are never tested.
- Cause: `confirmSynthetic` in `app/ledger-app.tsx` only sets browser state. Only the *bound* path — a parsed statement bound to a ledger account through the chooser — posts to `/api/v1/imports/confirm`, and that route is gated by authentication and `private.has_strong_owner_access` (aal2 + two verified TOTP factors). Reaching it needs a real PDF, so no automated browser run covers it.
- Avoid: do not treat a synthetic UI walkthrough as end-to-end evidence for import contracts. Check which button was pressed: "Confirm synthetic batch" is browser state, "Confirm import" is the route. Route contracts are covered by `tests/import-route.test.ts`, the RPC by pgTAP and `tests/import-confirm-e2e.test.ts`.
- Verify: `confirmSynthetic` contains no `fetch`; `confirmBoundImport` posts to `/api/v1/imports/confirm` and is reachable only once `boundAccount` is set.

## pdf.js needs its worker handed over explicitly, and pointing at the package path backfires

- Symptom: every PDF fails identically with `PDF_PARSE_FAILED / Error` — a bare `Error`, not one of pdf.js's named exceptions — no matter what the file contains. Setting `GlobalWorkerOptions.workerSrc` to `pdfjs-dist/build/pdf.worker.mjs` then changes the symptom to a status line of `undefined (undefined)`.
- Cause: with `GlobalWorkerOptions` unconfigured, pdf.js falls back to loading its worker module inline and throws before reading any page. Setting `workerSrc` to a package path does not help under Turbopack: the module is bundled into the parser worker's own chunk, executes in that global scope, replaces `self.onmessage`, and posts pdf.js's internal protocol messages straight to the main thread — so the UI renders pdf.js's message shape instead of the parser's.
- Avoid: give pdf.js a real `Worker` through `GlobalWorkerOptions.workerPort`, built from a dedicated entry module (`workers/pdf.worker.entry.ts`) with `new URL("./pdf.worker.entry.ts", import.meta.url)`. That is the same relative-URL form the app already uses for the parser worker, and it emits a separate chunk, so the two never share a scope or a channel.
- Verify: `tests/e2e/parser.spec.ts` parses a generated PDF in a real browser. Both of its tests fail with `PDF_PARSE_FAILED / Error` on the pre-fix worker, which is the red proof; no unit test can catch this, because none of them run pdf.js.

## A frame label that equals a column heading moves the grid header

- Symptom: one frame field reports `MISSING_FRAME_FIELD … (label not found)` while other frame fields on lines printed *higher up the page* read correctly. The column anchors all matched, so the failure looks like a wording problem in the one field.
- Cause: `extractStatement` resolves `headerY` from the first line containing *any* column anchor, while `findColumns` requires all seven on one line. A real statement prints `Branch` as a frame label above the grid, which matches the `branch` column anchor, so `headerY` lands on that frame line. `extractFrame` then filters `frameLines` to `y > headerY + LINE_TOLERANCE` and silently drops every frame line below it — the fields printed above the stray match survive, which is what makes it read as a per-field problem.
- Avoid: take `headerY` from the line `findColumns` actually matched — it returns its `y` alongside the columns — rather than from the first anchor hit anywhere. Do not special-case the colliding word; any frame label equal to a column heading (`Branch`, `Balance`, `Transaction` …) reproduces this. Fixed 2026-07-25, D-028.
- Verify: the fixtures print a `Branch` frame label between `Account Type` and `Account Number`, and `tests/krungthai-layout.test.ts` ("finds the grid header even when a frame label matches a column heading") asserts that printed order as well as the resulting suffix — the order is what makes the failure partial and therefore misleading. Restoring the any-anchor search fails 26 of the 32 layout tests with the real statement's exact message.
- Related trap: a fixture whose frame is a flat list of labels cannot reproduce this at all. Adding a frame label to `FRAME_LABEL_STOPS` without also printing it in the fixture leaves the same class of bug undetectable.

## PowerShell mangles commit messages two different ways

- Symptom one: `git commit -m @'…'@` fails with `error: pathspec 'word' did not match any file(s)` and a wall of message text quoted back as more pathspecs.
- Cause one: a here-string is only recognized when `@'` is the last thing on its line. A single trailing space after it silently makes it not a here-string, so PowerShell word-splits the message and every apostrophe inside starts a new quoted token.
- Symptom two: the commit lands, but `git log --oneline` shows an invisible character before the subject (`﻿docs: …`).
- Cause two: `Out-File -Encoding utf8` in PowerShell 5.1 writes a UTF-8 **BOM**, and `git commit -F` takes those bytes as the first characters of the subject line.
- Avoid: write the message with the `Write` tool (no BOM) and pass it to `git commit -F`. Do not hand-build message files through `Out-File`/`Set-Content`, and do not rely on here-strings for anything multi-line.
- Verify: `git log --format=%s -1 | Format-Hex | Select-Object -First 1` — the first bytes must be the subject's own characters, not `EF BB BF`. Note the blemish is not worth a force push to fix on an already-pushed commit.

## The summary block sits inside the row region, so it can be eaten by the last transaction

- Symptom: the final row of a statement carries extra text in its cells, or fails with an unreadable date/time cell whose shape has trailing words and digits — but only on statements whose last page ends tightly.
- Cause: `Total Page` / `Total Withdrawal` / `Total Deposit` are printed below the grid heading, which is exactly the region the row scanner walks. They carry no date, so they fall through to the continuation branch, and a block printed within `DETAIL_TOLERANCE` of the last row is merged into it.
- Avoid: match `SUMMARY_LABELS` in the row loop and end the current row there. Distance alone is not a guard — it works on the one statement measured (33 units of clearance) and silently does not on a tighter one.
- Verify: `tests/krungthai-layout.test.ts` ("never absorbs a summary line into the last row, even printed close to it") shifts the block to within `DETAIL_TOLERANCE` and still expects one clean row.

## A right-aligned number's left edge is not inside its own column

- Symptom: a statement reads correctly for hundreds of rows, then one row fails with two amounts joined in one money cell and the next cell empty — `deposit[ddd.dd dd,ddd.dd] balance[]`. The trigger is a *magnitude*, not a row type: it appears the first time a figure gets wide enough.
- Cause: money and branch columns are right-aligned while text columns are left-aligned, so a wider figure starts further left. Banding by left edge therefore drifts one column left as magnitudes grow. Measured on a real statement: the balance column is right-aligned to ~518 with a digit width of 4, so `d,ddd.dd` starts at 491 but `dd,ddd.dd` starts at 487 — under the 489 boundary. The margin was 2 units, and a 7-digit branch code sat exactly on its boundary with none.
- Avoid: band by the run's **midpoint**, using the `width` pdf.js reports (`centreOf` in `lib/krungthai-layout.ts`). A midpoint moves half a glyph per extra character where a left edge moves a whole one. Do not widen the left-edge tolerance instead — that only moves the magnitude at which it breaks.
- Verify: `tests/krungthai-layout.test.ts` ("assigns a right-aligned amount by its midpoint") starts a `dd,ddd.dd` balance left of its anchor with its midpoint inside. Restoring the left-edge rule fails it with the real statement's exact shape. Note the worker must keep forwarding `item.width`; drop it and fixtures still pass on their estimate while real statements regress.

## A two-digit year on a Thai statement belongs to either calendar, and guessing wrong is silent

- Symptom: the statement parses, every row reads, nothing fails closed — and the dates are 43 years off. A period shows as `1983-07-01` when the file says July 2026.
- Cause: `2500 + 26 - 543 = 1983`. A Thai-language statement dates 2026 as `69` (Buddhist 2569); an English-language one dates it `26`. Assuming either calendar unconditionally shifts every date in the file by 543 years, and because rows anchor on the period-end year, the whole import shifts together and stays internally consistent — so reconciliation, balances and fingerprints all still agree.
- Avoid: determine the era once from the period end via `resolveStatementEra`, then apply it to every date. The two readings are always exactly 543 years apart, so a plausibility window narrower than that admits at most one — that makes it arithmetic rather than a heuristic. Fail closed when neither reading is plausible; never fall back to a default calendar.
- Verify: `tests/domain.test.ts` walks all 100 two-digit years and asserts the ambiguous branch is unreachable (Gregorian admits 06–27, Buddhist 49–70, disjoint). `tests/krungthai-layout.test.ts` reads a Gregorian statement as 2026 and a Buddhist one as 2026. **This class cannot be caught by a fail-closed check** — only by asserting a resolved date against an independently known one, which is why the bind screen prints the period.

## A frame label's value runs into the next field on the same line

- Symptom: the account's last four digits are wrong but plausible — no error, no failed check, just the wrong account bound to an import.
- Cause: frame lines carry several label/value pairs (`Account Number … 1234567890 … Branch Code … 555`). Reading everything to the right of a label concatenates the following field's digits, and `digits.slice(-4)` then takes them from the wrong field.
- Avoid: stop a label's value at the next item matching any known frame label — `FRAME_LABEL_STOPS` in `lib/krungthai-layout.ts`, which lists the fields that are printed but not read as well as the ones that are. Add new frame labels there, not only to `FRAME_LABELS`.
- Verify: `tests/krungthai-layout.test.ts` prints `Branch Code 555` on the account-number line and asserts the suffix is `7890`, never `5555`.

## An anchored label pattern rejects padded whitespace you cannot see

- Symptom: one frame field reports as missing while its neighbours on the same printed line read correctly, and every diagnostic shows the label spelled exactly as the pattern expects.
- Cause: `^…$` against the raw run, where the label is printed with padded or non-standard internal spacing (`Account  Number`). NFKC folds a non-breaking space to a normal one but does not collapse runs of them, and neither a rendered page nor a copied diagnostic shows the difference.
- Avoid: collapse internal whitespace before matching a label (`str.replace(/\s+/gu, " ").trim()`), and do not abandon the search when a label occurrence carries no value — the same wording can appear as a bare heading above the pair that actually holds the value.
- Verify: `tests/krungthai-layout.test.ts` rewrites the label to `Account  Number` and still expects a successful read.

## Playwright reuses a server someone else started, so browser runs can test stale code

- Symptom: a browser test keeps failing on behaviour you just fixed, with the identical error every run, while the unit suite covering the same logic is green. Or the reverse — it passes after a change that could not possibly work.
- Cause: `playwright.config.ts` sets `reuseExistingServer: !process.env.CI`, so if anything is already listening on port 3000 the `pnpm build && pnpm start` command never runs. A server started by hand keeps serving the build it booted with, no matter how much source changes afterwards.
- Avoid: run `pnpm exec playwright test --config=playwright.isolated.config.ts`, which uses port 3100 and never reuses a server (D-027). If using the default config, first compare the listening process's start time with the source mtime — `Get-NetTCPConnection -LocalPort 3000 -State Listen` for the pid, `(Get-Item .next\BUILD_ID).LastWriteTime` for the build.
- Verify: three consecutive runs reported `MISSING_COLUMN_ANCHOR` against a reader that no longer had those anchors; the build was 16 minutes older than `lib/krungthai-layout.ts`.

## A unit suite that feeds the layout reader fixtures proves nothing about reading a PDF

- Symptom: 27 green parser tests, a green build, and a green Playwright run, while the app cannot open any PDF at all.
- Cause: `tests/krungthai-layout.test.ts` calls `extractStatement` with `PageText` arrays, and the synthetic UI path fetches `/api/v1/demo`, so neither touches `getDocument`, the worker bundle, or the CSP. The layout rules and the PDF integration are separate risks, and only the first was covered.
- Avoid: keep at least one test that puts real PDF bytes through the real worker in a real browser. `tests/fixtures/synthetic-pdf.ts` generates those bytes from the same invented geometry, so this needs no real statement — a Type0/Identity-H font with an identity ToUnicode CMap and no embedded glyphs is enough, because pdf.js recovers text from ToUnicode rather than from outlines.
- Verify: `pnpm test:e2e` runs 8 tests, of which 4 are the parser specs across desktop and mobile.

## A restore can leave the audit_events identity sequence behind an existing id

- Symptom: an import that worked yesterday fails with `duplicate key value violates unique constraint "audit_events_pkey"`, naming an id that already exists, on a database nobody changed.
- Cause: `public.audit_events` is append-only, so rows accumulate, while `public.restore_backup` re-inserts audit rows with explicit ids and then sets the identity sequence to `greatest(max(id),1)`. A restore that ran while the table was empty or held only low ids leaves the sequence at or below an id a later run re-introduces, and the next audit insert collides. The failed insert consumes a value, so a retry can appear to fix itself — which is what makes this look intermittent.
- Avoid: in tests, clear the owner's audit rows and realign the sequence together — `resetOwnerImportSurface` in `tests/helpers/local-owner.ts` does both. In product code, leave the `setval` in migration 006 alone; it is correct for the table it is given.
- Verify: `select last_value from public.audit_events_id_seq` is at least `max(id)` from `public.audit_events`. When it is lower, `tests/import-confirm-e2e.test.ts` fails on its first confirmation with a 409 whose body names `audit_events_pkey`.

## Signing in again at aal1 downgrades a shared Supabase cookie session

- Symptom: tests that share one stored session start returning 403 "AAL2 and two verified TOTP factors are required" after an unrelated test deliberately signs in without MFA — and re-storing the aal2 session does not fix them.
- Cause: a password sign-in replaces the stored session for that storage key, and a token later refreshed in that family is no longer aal2. `setSession` with the old access token does not reliably restore the stronger claim.
- Avoid: order aal1 and unauthenticated cases after every test that needs strong access, rather than trying to restore the strong session between them. Mint a fresh aal2 session if a test genuinely needs one after a weak sign-in.
- Verify: `tests/import-route.test.ts` keeps its `without strong owner access` block last; moving it earlier reproduces a cascade of 403s in the tests that follow.

## A blocked event loop silently starves a spawned child's stdin

- Symptom: a `spawn`ed helper process appears to hang or never run its work, while the identical command works from a shell.
- Cause: writes to a child's stdin are flushed by the event loop. Code that blocks synchronously after spawning — `Atomics.wait`, `execFileSync` in a poll loop — never lets the write drain, so the child sits waiting on input it will never receive.
- Avoid: pass the work as an argument (`psql -c "…"`) instead of piping it, or do not block the event loop while a child is expected to consume stdin.
- Verify: `tests/advisory-lock.test.ts` holds a lock through `psql -c`; running the same SQL through `-f -` with a synchronous poll loop leaves the holder idle and every contention assertion fails.

## Killing `docker exec` does not stop the process inside the container

- Symptom: a lock, transaction, or temp resource created by a spawned `docker exec` survives `child.kill()` and leaks into later tests.
- Cause: `kill` terminates the local client, not the process the daemon started in the container.
- Avoid: end the work from inside the database instead — for a Postgres session, tag it (`PGAPPNAME`) and `pg_terminate_backend` it by `application_name`.
- Verify: the advisory lock release test terminates the holder through SQL and then observes the lock become available.

## Database-driving tests race each other under Vitest file parallelism

- Symptom: suites pass individually but fail when the whole suite runs — typically the backup round-trip and the import e2e, which wipe or insert against the same owner.
- Cause: Vitest runs test files in parallel by default, and every suite here shares one local Postgres instance.
- Avoid: keep `fileParallelism: false` in `vitest.config.ts`. The suite takes seconds, so serial execution costs little compared with debugging a nondeterministic failure.
- Verify: `pnpm test` passes with all nine files; reverting the setting reproduces three failures across the two database-mutating files.

## Only one ledger owner can ever exist locally

- Symptom: inserting `mutation_sequences` or `accounts` for a freshly created auth user fails with a foreign key violation against `ledger_owners`.
- Cause: `public.ledger_owners` holds a single binding row and is immutable — a trigger rejects updates and deletes — so a second owner cannot be bound without resetting the database.
- Avoid: authenticate as the seeded synthetic owner (`supabase/seed.sql` sets its password) instead of creating a new user.
- Verify: `select * from public.ledger_owners` returns exactly one row, and the import e2e signs in as that owner.

## A dense digit-free line is a transaction row as often as it is a heading

- Symptom: a masked dump's label section lists real merchant or counterparty names beside the column headings.
- Cause: judging "this is a heading" by density. A real SCB statement prints every transaction as `<code> | DESC : | <merchant>` — three short digit-free items, which is exactly the shape a heading row has. Judging by position instead does not fix it: rows sit on a fixed pitch, so the same `y` recurs on every page and a frequent counterparty lands in the same slot twice.
- Avoid: drop the whole line if any item on it carries a digit. A transaction row always has a date or an amount; a heading row never does. Keep the same-position-across-pages rule as a second filter, not the first (D-038).
- Verify: `tests/privacy.test.ts` "never reports a transaction row, however heading-shaped it looks" — and note its fixture includes the date and amounts, because an earlier version omitted them and passed against a rule that did not hold.

## Mis-decoded text hides in the character classes a masker leaves alone

- Symptom: a masked dump contains runs like `⤎x xxd⁄d⏟` or `$d=%$d. d+$, dd%/,&&d/d'` instead of `x` and `d`.
- Cause: a PDF that embeds subset fonts with no usable `ToUnicode` map makes pdf.js resolve glyphs to arbitrary code points, often symbols. A masker that replaces letters and digits and *keeps everything else* passes those through verbatim — a deterministic remapping of real content, undoable by anyone with the font's cmap.
- Avoid: mask by allowlist. Keep only the punctuation that genuinely carries format (`. , / - :` and friends) and replace everything else with `?` (D-038).
- Verify: `tests/privacy.test.ts` "masks a character that decoded to a symbol rather than letting it through", which also asserts the format shapes still read as `dd/dd/dd dd:dd` and `d,ddd.dd`.

## A folder of statements may contain something that is not a statement

- Symptom: a layout looks catastrophically unreadable — amounts decoding to punctuation — and the obvious conclusion is that the bank's format cannot be parsed.
- Cause: the file was not a statement. A KBANK export folder contained a bank-abbreviation glossary whose Thai and Chinese names decode to garbage; it has no transactions at all. The two real statements beside it decode cleanly.
- Avoid: confirm a file is a statement before drawing conclusions about a format from it — check for the grid, the frame block, and the summary, not just that text came out. Check every file in the folder before concluding, not the first one.
- Verify: the reader rejects a non-statement on its bank signature; a glossary produces `UNSUPPORTED_LAYOUT` rather than an attempted parse.

## Plain Node can run this repo's TypeScript, but only a module that imports nothing

- Symptom: `scripts/mask-statement.mjs` dies with `ERR_MODULE_NOT_FOUND` on `@/lib/dates` after an unrelated edit to the diagnostics.
- Cause: Node 24 strips types, so it loads a `.ts` file directly — but it does not resolve the `@/` alias and does not accept an extensionless specifier. Both are bundler features the app gets from Next.js and Vitest and the harness does not.
- Avoid: keep `lib/masked-diagnostics.ts` free of imports. That is why the diagnostics live there rather than in `lib/krungthai-layout.ts`, which imports three aliased modules and therefore cannot be loaded by the harness at all. The same constraint applies to any throwaway Node script that reaches into `tests/fixtures/` — a `import type` line is erased and is fine, a value import of an aliased module is not.
- Verify: `tests/privacy.test.ts` ("keeps the masked diagnostics module dependency-free") fails the moment an import is added, before the harness does.

## A guard keyed on `NODE_ENV` is unreachable in the build that must exercise it

- Symptom: a development-only route or affordance works under `next dev` and is untestable in the browser suite, or a spec written against `next dev` sees clicks do nothing at all.
- Cause: two constraints meet. Browser tests here run against `pnpm build && pnpm start`, because the strict CSP forbids the `eval()` React needs in development mode (see the CSP entry above) — and `next build` sets `NODE_ENV=production`, so anything gated on `NODE_ENV !== "production"` is switched off in exactly that build.
- Avoid: gate on an explicit opt-in flag the test config sets, not on the build mode — `NEXT_PUBLIC_ALLOW_DEV_OWNER_SESSION` in `playwright.owner.config.ts` (D-036). A `NEXT_PUBLIC_` flag is inlined at build time, so it must be set for `pnpm build` as well as for `next start`; Playwright's `webServer.env` covers both. Never relax the CSP to make `next dev` work.
- Verify: `tests/dev-session.test.ts` asserts a 404 without the flag; `tests/e2e/owner-session.spec.ts` passes only under its own config and self-skips elsewhere.

## Leftover test accounts collide on a unique constraint in another suite

- Symptom: `tests/import-route.test.ts` and `tests/import-confirm-e2e.test.ts` both fail at setup with `duplicate key value violates unique constraint "accounts_owner_id_bank_code_last_four_key"`, naming neither the suite nor the file that caused it.
- Cause: `public.accounts` is unique on (owner_id, bank_code, last_four), there is exactly one owner, and every suite that binds the synthetic statement wants an account ending 7890. A suite that inserts one and does not remove it breaks the next suite rather than itself.
- Avoid: clean up in `afterAll`, not only in `beforeEach` — a run that ends leaves the database as it found it. `resetOwnerImportSurface` takes the account ids to drop.
- Verify: run the browser suite and then `pnpm test`; both pass in either order.

## An absolute Windows path is not a valid ESM specifier

- Symptom: a one-off Node script fails with `ERR_UNSUPPORTED_ESM_URL_SCHEME`, naming a perfectly correct path.
- Cause: ESM resolves an absolute specifier as a URL, and `D:/…` parses as a `d:` scheme rather than a path. Only relative specifiers and `file://` URLs work.
- Avoid: write `file:///D:/Projects/…` in the import, or use a relative specifier. `node --experimental-strip-types` reports it the same way whether the target is `.ts` or `.mjs`, so the message does not point at type stripping.
- Verify: the scratch script that builds a synthetic PDF from the repo fixtures imports them by `file:///` URL and runs.

## A bank's name appears on other banks' statements

- Symptom: every KBANK statement is routed to the SCB reader and fails on a column anchor, or an SCB statement is routed to the Krungthai reader.
- Cause: identifying a layout by the bank's name on page one. Both real KBANK statements print `Internet/Mobile SCB` as an ordinary channel on transfer rows, because that is what a transfer is. Worse, a masked dump masks every letter, so the name a statement actually prints is not knowable from one — the signature would be a guess that the only available evidence cannot check.
- Avoid: identify a layout by its **heading anchor set** appearing in full on one line. It is unique per bank, present on every page, and a transaction description cannot forge it (D-039). Krungthai keeps its name signature because it is proven against a real statement, and is tried only after the heading sets fail.
- Verify: `tests/statement-layout.test.ts` "keeps a KBANK statement whose rows name another bank on the KBANK reader" and "keeps an SCB statement whose rows name Krungthai on the SCB reader".

## Heading x positions do not bound the data columns, except on the layout you wrote them for

- Symptom: a reader ported from one bank to another misfiles most of a row — short descriptions land in the time column, descriptions land under the balance heading — while the heading anchors all match.
- Cause: assuming a column's heading sits above its data. On Krungthai it does, which is why midpoint banding works there. On SCB the description runs print far left of `Description/Note`, under `Balance/Baht`; on KBANK short descriptions print left of `Descriptions`, inside the time column's band. Nothing requires a bank to align the two.
- Avoid: for a new layout, read the row as an ordered **grammar** — the runs before the money, the money, the runs after — and identify each field by its kind and position in that sequence. Use geometry only where it carries information nothing else does (D-039). Do not generalize a working reader onto a second layout before seeing the second layout's dump.
- Verify: `tests/statement-layout.test.ts` "maps the channel, code and DESC text to distinct row fields" and its KBANK counterpart.

## A fixture that supplies its own run widths cannot test right-edge geometry

- Symptom: the unit suite is green on a layout whose money columns are separated by right edge, and the browser reads the same statement with both columns merged — or with a smear that grows with the length of each figure.
- Cause: `TextItem.width` is optional, so a hand-written fixture asserts the width instead of measuring it. pdf.js reports the *rendered* width. If the fixture assumes a different per-character advance than the PDF generator emits, every right edge lands somewhere else, off by the difference times the character count — so short figures look fine and long ones do not.
- Avoid: take the fixture's glyph advance from the generator (`SYNTHETIC_GLYPH_ADVANCE` in `tests/fixtures/synthetic-pdf.ts`) rather than choosing one, and put the layout through a real PDF in the browser suite. This is the same gap as D-027: a green unit suite that never ran pdf.js.
- Verify: `tests/e2e/statement-pdf.spec.ts` reads generated SCB and KBANK PDFs through the real worker; the KBANK fixture places its two money columns twice `COLUMN_EDGE_TOLERANCE` apart and no more, so any drift merges them and the read fails closed.

## A layout has one row date separator, not one date separator

- Symptom: every statement of a layout reports a missing statement period, while its rows parse.
- Cause: threading the row separator through to the frame. KBANK prints its rows as `dd-dd-dd` and its period as `dd/dd/dddd - dd/dd/dddd`, on the same document.
- Avoid: match the frame's period on either separator, requiring both of its dates to use the same one, and keep the row separator to rows.
- Verify: the KBANK fixtures print hyphen rows and a slash period, and `tests/statement-layout.test.ts` reads both.

## A hard-coded literal inside a security-definer function can gate a whole feature silently

- Symptom: a new bank's import fails with `fingerprint mismatch` — a message that names tampering — after every CHECK constraint has been widened and the client is demonstrably correct.
- Cause: `confirm_import` recomputed each row fingerprint with the literal `'KTB'` while the client hashes the statement's own bank code. The constant was invisible from the outside and produced an error that pointed at the caller.
- Avoid: when widening an enumerated value, grep the RPC bodies for the old literal, not just the constraints — `grep -n "'KTB'\|krungthai-layout-v1" supabase/migrations/` finds every one. Derive such a value from the row the server already trusts (here, the bound account) rather than restating it (D-041).
- Verify: the red proof in `supabase/tests/002_security_contracts.sql` — with the constraints widened but the literal left in place, the SCB import dies with `fingerprint mismatch` rather than passing.

## An id remapped in every column can still survive inside jsonb

- Symptom: a restore into a project bound to a different owner passes every ownership check — no row anywhere carries the previous owner in `owner_id`, `actor_id` or `changed_by` — and that owner's uuid is still in the database.
- Cause: `overlay_revisions.snapshot` is `to_jsonb` of the whole overlay row, so it embeds `owner_id` as data. Foreign keys, RLS and column-level assertions all look past it. `restore_backup` merges `jsonb_build_object('owner_id', v_owner)` over the snapshot precisely to rebind it.
- Avoid: when checking a remap, check the jsonb payloads as text as well as the columns, and build the fixture the way the product builds the row — a hand-written snapshot that embeds no owner id cannot fail this test, which is how the first version of it passed for the wrong reason.
- Verify: `tests/recovery-portability.test.ts` asserts no `overlay_revisions.snapshot` mentions the source owner. Red proof: strip the merge from the destination's `restore_backup` and that one assertion fails while every column-level check still passes.

## `supabase db push --db-url` cannot reach a local container

- Symptom: `failed to connect to postgres: tls error (server refused TLS connection)` against a database that psql connects to happily, and adding `?sslmode=disable` changes nothing.
- Cause: given `--db-url` the CLI treats the target as a remote project and requires TLS, ignoring the URL's sslmode. Its `--local` flag is not an alternative: it pushes the *workdir's* migrations to the *workdir's* database, which for a second project whose migrations directory is deliberately empty is nothing at all.
- Avoid: apply the migration files to a second local project directly, in filename order, and record each in `supabase_migrations.schema_migrations` — which the CLI creates during `db reset`/`db push`, so a stack started with no migrations does not have it. Each file opens its own transaction, so feed them verbatim rather than wrapping them, or psql warns `there is already a transaction in progress` and the history insert lands outside the file's commit.
- Verify: `node scripts/recovery-destination.mjs up` reports nine migrations applied, and `status` shows the owner bound and an empty ledger.

## `pnpm test` deletes every row the owner has, not just the test's own

- Symptom: a ledger holding a real import is empty after a routine test run, or a suite aborts with "Refusing to wipe the ledger: N account(s) … created by neither the seed nor this suite".
- Cause: `resetOwnerImportSurface` deletes `source_transactions`, `source_components`, `import_batch_rows`, `import_batches`, `import_artifacts` and `audit_events` **scoped to the owner**, not to the suite — and there is one owner. `tests/backup-roundtrip.test.ts` goes further and deletes every row unscoped between its export and its restore. Harmless against a seed; destructive against anything real.
- Avoid: the abort is the guard (`assertOnlyDisposableLedgerData`) doing its job — do not reach for `ALLOW_DESTRUCTIVE_TESTS=1` to make it quiet. Take a backup through Recovery / 04 first, and only then decide the data is disposable. Note `pnpm supabase:reset` is the Supabase CLI and cannot be guarded at all.
- Verify: with a real account present, `pnpm exec vitest run tests/backup-roundtrip.test.ts` fails with the refusal instead of wiping; with that account passed in as recognised, the same check counts zero.

## A bare tag locator is a contract only while the page holds one of that tag

- Symptom: every browser spec in a suite fails at once with `strict mode violation: locator('input[type="file"]') resolved to 2 elements`, after a change that touched none of them.
- Cause: the specs located the statement file input and the account chooser by tag. Adding a restore file input and an account-type select — both on unrelated parts of the page — made each selector ambiguous everywhere.
- Avoid: give form controls a `name` and locate by it (`statement-pdf`, `ledger-account`, `restore-file`, `restore-password`, `ledger-backup-password`, `new-account-label`, `new-account-type`). Treat a bare tag locator as a latent failure whenever a page is about to gain a second control of that kind.
- Verify: the owner suite passes 8/8 with two file inputs and two selects rendered on the same page.

## A wiped ledger and a wiped session look the same from a failing restore

- Symptom: a browser test that empties the ledger and then restores it fails with `strong owner access required`, though the page is still signed in and the JWT still claims `aal2`.
- Cause: reaching for `resetOwnerImportSurface` to empty the ledger. It also deletes the owner's `auth.mfa_factors`, and `private.has_strong_owner_access` counts verified factors in the database rather than trusting the token — so the session the restore needs is gone with the rows.
- Avoid: for a mid-test wipe, delete the ledger tables directly under `session_replication_role = replica` and leave `auth` alone. Keep `resetOwnerImportSurface` for setup and teardown, where dropping the factors is harmless.
- Verify: `tests/e2e/owner-session.spec.ts` "backs up a confirmed ledger and restores it after the ledger is destroyed" restores under the same session that took the backup.

## A leftover TOTP factor makes a later sign-in unable to reach aal2

- Symptom: an authenticated suite fails at enrollment with `403 insufficient_aal`, "AAL2 required to enroll a new factor", on an owner whose password is correct.
- Cause: GoTrue refuses to enroll a factor at aal1 once the user has a verified one. `tests/backup-roundtrip.test.ts` inserts two factors directly and never removes them, so any suite that afterwards tries to climb to aal2 by enrolling cannot.
- Avoid: delete `auth.mfa_factors` for the owner before signing in, not only in teardown — teardown does not run for a suite that was never reached.
- Verify: the failure reproduces by running `tests/backup-roundtrip.test.ts` and then any suite that enrolls — that is how it was found. `tests/recovery-portability.test.ts` clears factors on both projects before signing in and again in teardown.
