# Private Ledger gotchas — Tests, Playwright and the gate

Split out of `GOTCHAS.md` on 2026-08-25 (D-149), unchanged. **26 traps.**

`GOTCHAS.md` keeps the index across every section and is still the way in — it lists every
trap in this file, so a reader finds the one that applies without loading any body. Add a trap
here and add its title to that index; `pnpm check:docs --strict` fails if the two disagree.

Each trap states the symptom, cause, prevention, and verification. What a date on a `Verify:`
line means, and what a backfilled `Dated <date> from <sha>` clause does not, is explained at
the top of `GOTCHAS.md`.


## Narrowing a threshold constant makes its tests pass for the wrong reason, not fail

- Symptom: `MATCH_WINDOW_DAYS` drops from 3 to 1, the whole reconciliation suite stays green, and two tests have quietly stopped testing what they are named for.
- Cause: a test that discriminates between two candidates has to place both **inside** the window, or the window excludes the far one before the clause under test ever runs. "Prefers the nearest date instead of treating everything in the window as equal" and "does not let a far candidate block a pairing it could never win" both built their far candidate three days out. Under a one-day window that candidate is not a candidate at all, so each test passed while exercising the window rather than the nearest-date preference or the claim-resolution it names. Widening a threshold makes a bad fixture fail loudly; narrowing one makes it pass silently, which is why this direction is the dangerous one.
- Avoid: when a threshold moves, re-read every fixture built against the old value and ask what would still fail if the clause under test were deleted. Assert the constant itself in one place — `expect(MATCH_WINDOW_DAYS).toBe(1)` — so the value is pinned somewhere obvious, but do not mistake that assertion for coverage of the behaviour around it.
- Verify: with the far candidates moved to one day out, both tests still pass; delete the nearest-date filter in `proposeSlipMatches` and the preference test fails, which it did not before the fixtures were rebuilt (D-064). Dated 2026-08-05 from `0f32ad1`, the commit that narrowed `MATCH_WINDOW_DAYS` from three days to one (D-064).

## The synthetic path in the app UI does not exercise confirm_import

- Symptom: clicking through the running app reports a confirmed batch, yet no import reaches PostgreSQL and server-side contracts (digest binding, fingerprint binding) are never tested.
- Cause: `confirmSynthetic` in `app/import-bench.tsx` only sets browser state. Only the *bound* path — a parsed statement bound to a ledger account through the chooser — posts to `/api/v1/imports/confirm`, and that route is gated by authentication and `private.has_strong_owner_access` (aal2 + two verified TOTP factors). Reaching it needs a real PDF, so no automated browser run covers it.
- Avoid: do not treat a synthetic UI walkthrough as end-to-end evidence for import contracts. Check which button was pressed: "Confirm synthetic batch" is browser state, "Confirm import" is the route. Route contracts are covered by `tests/import-route.test.ts`, the RPC by pgTAP and `tests/import-confirm-e2e.test.ts`.
- Verify: `confirmSynthetic` contains no `fetch`; `confirmBoundImport` posts to `/api/v1/imports/confirm` and is reachable only once `boundAccount` is set. Dated 2026-07-24 from `9203a87`, the foundation commit that introduced `confirmSynthetic` as browser-only state.

## Playwright reuses a server someone else started, so browser runs can test stale code

- Symptom: a browser test keeps failing on behaviour you just fixed, with the identical error every run, while the unit suite covering the same logic is green. Or the reverse — it passes after a change that could not possibly work.
- Cause: `playwright.config.ts` **as committed** sets `reuseExistingServer: !process.env.CI`, so if anything is already listening on port 3000 the `pnpm build && pnpm start` command never runs. A server started by hand keeps serving the build it booted with, no matter how much source changes afterwards.
- **Verified 2026-08-09, and the state is split.** All three configs in this working tree read `reuseExistingServer: false`; `playwright.isolated.config.ts` and `playwright.owner.config.ts` carry that in git, but `playwright.config.ts` does not — it is one of the deliberately uncommitted files (D-070), so **`git show HEAD:playwright.config.ts` still reads `!process.env.CI`**. The trap is therefore fixed on this machine and live for any fresh clone. Do not read a comment as the code: `playwright.isolated.config.ts:5` quotes `!process.env.CI` while describing the *default* config, and its own setting on line 27 is `false`.
- Avoid: run `pnpm exec playwright test --config=playwright.isolated.config.ts`, which uses port 3100 and never reuses a server (D-027). If using the default config, first compare the listening process's start time with the source mtime — `Get-NetTCPConnection -LocalPort 3000 -State Listen` for the pid, `(Get-Item .next\BUILD_ID).LastWriteTime` for the build.
- Verify: three consecutive runs reported `MISSING_COLUMN_ANCHOR` against a reader that no longer had those anchors; the build was 16 minutes older than `lib/krungthai-layout.ts`.

## The default config runs the owner suite twice at once, so its two copies wipe each other's fixtures

- Symptom: `owner-session.spec.ts` fails against `playwright.config.ts` with rows missing, an account absent, or a count short — and the same spec passes against `playwright.owner.config.ts`. The failures move between runs and between tests, so each one reads as a different defect.
- Cause: `playwright.config.ts` sets `fullyParallel: true` with **two projects** (`desktop`, `mobile`) and **no `testIgnore`**, so that spec is collected under both and the two copies run concurrently against one database. Its `beforeEach` deletes the *shared seeded owner's* ledger tables — it is not scoped to a project, a worker or a test — so each copy's cleanup destroys the other's fixtures mid-test. `playwright.owner.config.ts` sets `fullyParallel: false` and a single project for exactly this reason.
- **This was masked until 2026-08-10 and is newly reachable.** The committed copy of this config runs `pnpm dev`, which never hydrates under the strict CSP, so those tests could not really execute and the collision never showed. The deliberately uncommitted working copy runs `pnpm build && pnpm start`, which makes them execute — so the trap is **live on this machine and dormant in a fresh clone**, the reverse of the `reuseExistingServer` entry above.
- Avoid: run the owner specs through `playwright.owner.config.ts`, which is what the gate uses. Never use the default config for a green run — it is the port-3000 config for driving the app by hand.
- Verify: `playwright.config.ts` has `fullyParallel: true`, two entries under `projects`, and no `testIgnore` key; `playwright.owner.config.ts` has `fullyParallel: false` and one project. Dated 2026-08-10, read from both files rather than from a failing run — the collision is structural and was found by reading, not reproduced.

## The default config gives `prebuild` and a full `next build` the 60-second webServer default

- Symptom: a browser run against `playwright.config.ts` dies with a Playwright webServer timeout before any test starts, on a checkout where nothing is wrong. Most often on a fresh clone, after `.next/cache` is cleared, or on the first run after a dependency change.
- Cause: that config sets no `webServer.timeout`, so Playwright's 60-second default has to cover the whole `pnpm build && pnpm start` command — including `prebuild`, which copies the ZXing reader and the four tesseract assets, and then a full Next production build. A warm build fits comfortably; a cold one need not, and the failure names the web server rather than the build that actually ran long.
- Avoid: set `webServer.timeout` on any config whose `command` builds. `playwright.owner.config.ts` sets 180 seconds for the same command shape and is the value to copy.
- Verify: `playwright.config.ts` has no `timeout` key inside `webServer` while `playwright.owner.config.ts` sets one; both run `pnpm build && pnpm start`. Dated 2026-08-10, read from the two configs — the slow path was not reproduced, so this is a bound that has been shown to be missing rather than one measured against a cold build.

## `fullyParallel: false` serialises a file, not a suite, and looks serial while there is one file

- Symptom: a browser test that passes every time it is run alone fails whenever the whole config runs. Here the message was `That code was not accepted: Auth session missing!` from a client that had demonstrably just used its session — the enrolment call immediately before it succeeded. An earlier run of the same fault showed a factor count that never advanced, with no error anywhere.
- Cause: `fullyParallel: false` serialises tests **within** a file. Separate files still go to separate workers, and Playwright's default worker count is half the machine's cores. `playwright.owner.config.ts` had one spec file from the day it was written, so it had always *behaved* serially without ever *being* serial. Adding a second file on 2026-08-10 put two suites on one seeded owner at once: `owner-session.spec.ts` signs in on every test, `owner-access.spec.ts` deletes and re-enrols that owner's MFA factors, and a second sign-in rotates the refresh token the first one's browser client is holding — so its next auto-refresh fails and supabase-js clears the session locally. Nothing in the message names a worker, a file, or the other suite.
- **The tell that separates this from an ordinary flake**: the reporter's `[n/total]` indices interleave the two files (`[1]` access, `[2]` session, `[3]` session, `[4]` access). Under one worker the indices for a file are adjacent. Read the interleaving, not the failure.
- Avoid: set `workers: 1` explicitly on any config whose specs share one database identity. `fullyParallel: false` is not that guarantee and never was. `playwright.owner.config.ts` now sets both.
- Verify: with `workers: 1` the same 25 tests pass and the two files' indices are adjacent; removing it reproduces two failures in `owner-access.spec.ts` alone, both of which pass when that file is run by itself. Dated 2026-08-10.

## A 200 from the app proves a server is running, not that it is the one you just started

- Symptom: a server is started in the background, a health check answers `HTTP 200` with the expected headers, and the app being driven is nonetheless the *previous* build — old wording, old constants, old behaviour. The background task quietly reports failure some time later, long after the check appeared to succeed.
- Cause: `next start` cannot bind a port another `next start` already holds, so the second one dies with `EADDRINUSE` while the first keeps serving. Every response still looks right, because the CSP, the route list and the status code are identical across builds — the differences are in a client chunk nobody fetched. On 2026-08-11 a server from 16:58 served a check against a build made at 17:52.
- Avoid: stop the old server before starting a new one, and **verify by timestamp rather than by response**. `Get-NetTCPConnection -LocalPort 3000 -State Listen` gives the pid, `(Get-Process -Id <pid>).StartTime` its age, and `(Get-Item .next\BUILD_ID).LastWriteTime` the build's — the server must be the newer of the two. This is the same lesson as the `reuseExistingServer` entry above, arriving by a different route: there Playwright reused someone else's server, here a new one failed to displace it.
- Verify: with the stale process killed and the server restarted, `StartTime` is later than `BUILD_ID`'s mtime. Dated 2026-08-11.

## An assertion that a scrolled element sits near the viewport top measures the document's length, not the scroll

- Symptom: a spec asserting `boundingBox().top < 160` after a scroll passes on one branch of the same feature and fails on the other at 296px, with nothing wrong on either.
- Cause: `scrollIntoView({ block: "start" })` cannot scroll past the end of the document. Where the branch under test renders a long section below the target the element reaches the top; where it renders a short one the page runs out of scroll and the element comes to rest wherever the bottom of the document leaves it. The number the assertion reads is therefore a fact about how much content follows the target, and it changes whenever that content does — so the test fails on a UI change that is not a regression and passes on a build where nothing scrolls at all, provided the page happens to be short.
- Avoid: assert the claim a person would notice the absence of — the element is **fully inside the viewport** (`top >= 0` and `bottom <= innerHeight`) and the page **scrolled as far as it had to give** (`scrollY >= scrollHeight - innerHeight - 2`). Keep a near-the-top bound only for a branch known to render enough below the target to reach it. And poll rather than measure once: `app/globals.css` sets `scroll-behavior: smooth`, so a single read lands mid-animation.
- Verify: 2026-08-25 (D-147). `.runtime/bind-scroll.spec.ts` failed at 296 against a correct build with the `top < 160` form and passes on both branches with the in-viewport-and-exhausted form.

- **The same shape recurred on 2026-08-26 in a viewport-overflow guard** (D-153), which is why this entry is worth reading as a *family* rather than as one incident. A test asserted `document.documentElement.scrollWidth <= window.innerWidth` to catch a header that a pixel typeface pushed past a phone. **It passed with the defect fully present.** A mobile browser widens its *layout* viewport to fit overflowing content, so `innerWidth` grows to match `scrollWidth` — both measured **504** where the device is 390. The reference that stays honest is `document.documentElement.clientWidth`, which held at 390. **The general rule: a guard whose reference adjusts to the thing it is checking cannot fail.** Before trusting a ratio, ask what moves when the defect appears — and red-prove it by reintroducing the defect, which is what turned this one from green to a named failure.
## A fixture whose identifiers match nothing sends the test down the fallback branch, and it passes there

- Symptom: a browser test for automatic account binding passes, and would have passed just as well against a build where automatic binding did not exist.
- Cause: the shared statement fixtures print an account number ending **7890** and the synthetic seed holds accounts ending **4242**. `soleMatchingAccount` therefore finds nothing, the auto-bind branch is never entered, and the press falls through to the manual chooser — which renders, accepts input and satisfies every assertion written about "the statement was taken off the worklist". The branch under test was never executed and nothing said so. This is the same shape as the layout audit that measured an empty page, one level up: the test looked at *a* working path rather than *the* path.
- Avoid: make the fixture's identifiers match the seed on purpose and **assert the precondition** — here `select count(*) from public.accounts where bank_code = 'SCB' and last_four = '4242'` equals 1 before the press, so a seed change fails the test instead of silently rerouting it. More generally, when a feature has a match/no-match fork, assert which side the fixture lands on rather than inferring it from the outcome.
- Verify: 2026-08-25 (D-147). With the default fixture the auto-bind test passed while exercising the manual branch; with `accountNumber: "123-456-4242"` and the count assertion it exercises the automatic one and fails red against the pre-fix build.

## A config that ignores one spec file by name is a list of one, not a rule

- Symptom: a new browser spec fails under a config it was never meant for, four times over — once per project — with `SyntaxError: Unexpected token 'N', "Not Found" is not valid JSON`. That is a 404 body being parsed as the JSON the test expected, and it names neither the route nor the config.
- Cause: `playwright.isolated.config.ts` carried `testIgnore: /owner-session\.spec\.ts/u`, which reads as a rule about owner-signed-in specs and is actually one file name. It builds with `NEXT_PUBLIC_ALLOW_DEV_OWNER_SESSION: "0"`, so the development sign-in route correctly answers 404 — the guard working — and any spec needing a session fails on the response body rather than on the guard. The same shape applies to `playwright.owner.config.ts`'s `testMatch`, which had to grow too.
- Avoid: when adding an owner-signed-in spec, change **both** patterns in the same edit — `testMatch` in the owner config to collect it, `testIgnore` in the isolated config to skip it. Both now read `/owner-(session|access)\.spec\.ts/u`.
- Verify: the isolated config reports 18 passed with no owner spec collected; the owner config reports 25 and lists both files. Dated 2026-08-10.

## A unit suite that feeds the layout reader fixtures proves nothing about reading a PDF

- Symptom: 27 green parser tests, a green build, and a green Playwright run, while the app cannot open any PDF at all.
- Cause: `tests/krungthai-layout.test.ts` calls `extractStatement` with `PageText` arrays, and the synthetic UI path fetches `/api/v1/demo`, so neither touches `getDocument`, the worker bundle, or the CSP. The layout rules and the PDF integration are separate risks, and only the first was covered.
- Avoid: keep at least one test that puts real PDF bytes through the real worker in a real browser. `tests/fixtures/synthetic-pdf.ts` generates those bytes from the same invented geometry, so this needs no real statement — a Type0/Identity-H font with an identity ToUnicode CMap and no embedded glyphs is enough, because pdf.js recovers text from ToUnicode rather than from outlines.
- Verify: `pnpm test:e2e` runs 8 tests, of which 4 are the parser specs across desktop and mobile. Dated 2026-07-25 from `6c1e536`, which added `tests/e2e/parser.spec.ts` — the first test to put real PDF bytes through the real worker (D-023, D-027).

## Database-driving tests race each other under Vitest file parallelism

- Symptom: suites pass individually but fail when the whole suite runs — typically the backup round-trip and the import e2e, which wipe or insert against the same owner.
- Cause: Vitest runs test files in parallel by default, and every suite here shares one local Postgres instance.
- Avoid: keep `fileParallelism: false` in `vitest.config.ts`. The suite takes seconds, so serial execution costs little compared with debugging a nondeterministic failure.
- Verify: `pnpm test` passes with all nine files; reverting the setting reproduces three failures across the two database-mutating files. Dated 2026-07-25 from `b138c72`, the commit that set `fileParallelism: false` after the second database-mutating suite landed.

## Leftover test accounts collide on a unique constraint in another suite

- Symptom: `tests/import-route.test.ts` and `tests/import-confirm-e2e.test.ts` both fail at setup with `duplicate key value violates unique constraint "accounts_owner_id_bank_code_last_four_key"`, naming neither the suite nor the file that caused it.
- Cause: `public.accounts` is unique on (owner_id, bank_code, last_four), there is exactly one owner, and every suite that binds the synthetic statement wants an account ending 7890. A suite that inserts one and does not remove it breaks the next suite rather than itself.
- Avoid: clean up in `afterAll`, not only in `beforeEach` — a run that ends leaves the database as it found it. `resetOwnerImportSurface` takes the account ids to drop.
- Verify: run the browser suite and then `pnpm test`; both pass in either order. Dated 2026-07-25 from `a49fad3`, the commit that recorded the collision and the `afterAll` cleanup for it.

## `pnpm test` deletes every row the owner has, not just the test's own

- Symptom: a ledger holding a real import is empty after a routine test run, or a suite aborts with "Refusing to wipe the ledger: N account(s) … created by neither the seed nor this suite".
- Cause: `resetOwnerImportSurface` deletes `source_transactions`, `source_components`, `import_batch_rows`, `import_batches`, `import_artifacts` and `audit_events` **scoped to the owner**, not to the suite — and there is one owner. `tests/backup-roundtrip.test.ts` goes further and deletes every row unscoped between its export and its restore. Harmless against a seed; destructive against anything real.
- Avoid: the abort is the guard (`assertOnlyDisposableLedgerData`) doing its job — do not reach for `ALLOW_DESTRUCTIVE_TESTS=1` to make it quiet. Take a backup through Recovery / 04 first, and only then decide the data is disposable. Note `pnpm supabase:reset` is the Supabase CLI and cannot be guarded at all.
- Verify: with a real account present, `pnpm exec vitest run tests/backup-roundtrip.test.ts` fails with the refusal instead of wiping; with that account passed in as recognised, the same check counts zero. Dated 2026-07-28 from `663f626`, the commit that added `assertOnlyDisposableLedgerData` after the first real import made this destructive (D-047, D-048).

## A bare tag locator is a contract only while the page holds one of that tag

- Symptom: every browser spec in a suite fails at once with `strict mode violation: locator('input[type="file"]') resolved to 2 elements`, after a change that touched none of them.
- Cause: the specs located the statement file input and the account chooser by tag. Adding a restore file input and an account-type select — both on unrelated parts of the page — made each selector ambiguous everywhere.
- Avoid: give form controls a `name` and locate by it (`statement-pdf`, `ledger-account`, `restore-file`, `restore-password`, `ledger-backup-password`, `new-account-label`, `new-account-type`). Treat a bare tag locator as a latent failure whenever a page is about to gain a second control of that kind.
- Verify: the owner suite passes 8/8 with two file inputs and two selects rendered on the same page. Dated 2026-07-27 from `b4df30c`, the recovery commit whose second file input and account-type select made the bare selectors ambiguous (D-046).

## Running a browser suite leaves `.next` aimed at whatever that suite pinned

- Symptom: after a Playwright run, `pnpm start` serves an app talking to the **test** project. The real ledger appears empty — three seeded accounts, no transactions — and an export taken then would be a backup of the seed rather than of anything real.
- Cause: every browser config's `webServer.command` begins with `pnpm build`, and `NEXT_PUBLIC_*` are inlined at build time. `playwright.owner.config.ts` pins `54321`, and shell pins used for the other configs do the same, so the last build left in `.next` is whichever the suite wanted — not what `.env.local` says.
- Avoid: **rebuild before driving the app by hand after any suite run.** `pnpm build` with a clean shell picks `.env.local` back up. Confirm rather than assume.
- Verify: grep the build for the **full URL**, `http://127.0.0.1:5434 1` without the space — `grep -rlo 'http://127.0.0.1:54341' .next/server .next/static` should hit and the `54321` form should not. After the 2026-07-28 gate the live form appeared in no file and the test form in two, despite `.env.local` pointing at live.
- **Do not grep the bare port. That check was valid until 2026-07-28 and is not any more:** `containerFor` in `app/api/v1/dev/session/route.ts` embeds `54321`, `54331` and `54341` as a lookup table so its remedy message can name the right container, so every build now contains all three numbers regardless of what it targets. A bare-port grep on a correctly aimed build reads as ambiguous and invites exactly the wrong conclusion.

## Two of the three Playwright configs pin their Supabase target in git; the third's pin is uncommitted

- Symptom: after `.env.local` was pointed at the live ledger (D-048), a browser suite builds and runs against **real financial records**. Nothing announces it, because the app behaves identically.
- Cause: `NEXT_PUBLIC_*` are inlined at build time, so a config that runs `pnpm build` with no `webServer.env` inherits whatever `.env.local` names. **Originally only `playwright.owner.config.ts` pinned** — its comment claimed pinning "removes the one path by which a configuration change could aim the suite at real data", true of that config alone and worth reading as scoped rather than general.
- Avoid: **fixed 2026-07-28** — both now carry `webServer.env` (PLAN task 16). The isolated config pins all four variables, the default config the three database ones. The database-level wipes in `tests/helpers/local-owner.ts` hardcode the test container and were safe either way; it is the *browser* half that follows the build.
- **Still open:** `playwright.config.ts` is intentionally uncommitted, so its pin is local to this machine and a fresh clone gets the unpinned file. Check it before running that config on a new checkout.
- Verify: the isolated suite passes 14/14 in a shell with no pins set, where it read 12/14 before; live's account-id, transaction-id and fingerprint digests were unchanged by the run. That comparison, not the passing count, is what shows the target was right.

## The isolated suite's "no dev sign-in" test fails once `.env.local` opts in

- Symptom: `ledger.spec.ts` "offers no development sign-in in a build that did not opt into one" fails on desktop and mobile, 12/14 instead of 14/14, against code that did not change.
- Cause: D-048's migration requires `NEXT_PUBLIC_ALLOW_DEV_OWNER_SESSION=1` in `.env.local` permanently, and `playwright.isolated.config.ts` does not pin it, so the build *does* opt in and the test's premise is false. The same shape as D-047: a milestone changed the environment and an existing command silently became wrong.
- Avoid: pin `NEXT_PUBLIC_ALLOW_DEV_OWNER_SESSION` to `"0"` — **not** `""`. On Windows, `$env:VAR = ""` deletes the variable rather than blanking it, so `.env.local` wins and the failure persists, which reads misleadingly like the pin not working.
- Verify: 12/14 with the flag inherited, 14/14 with it pinned to `"0"`, no code change between the two runs. Dated 2026-07-28 from `663f626`, the D-048 work that made the opt-in flag permanent in `.env.local`.

## Stubbing a browser API can hide which code path the test is exercising

- Symptom: new specs pass, ten unrelated specs fail, and later the stubbed feature turns out never to have worked on this platform at all.
- Cause: the slip specs stubbed `BarcodeDetector`. Headless Chromium has none — a fact the stub concealed twice over. It hid that the "no QR reader" notice rendered for every *other* spec (breaking their `getByRole("status")` lookups), and it hid that the native detector is unavailable on Windows desktop entirely, so the feature could not run on the developer's own machine (D-057).
- Avoid: prefer a real artifact through the real code path when one can be generated. A QR can be rendered to a PNG from an invented payload (`tests/fixtures/synthetic-slip.ts`), exactly as statements are rendered to real PDFs — after which the specs exercise the decoder instead of a fake. Where a stub is genuinely unavoidable, assert what the *unstubbed* environment does somewhere too, or the stub becomes the only thing keeping the test green.
- Verify: 2026-07-30. Replacing the stub with generated QR images kept all five specs green and additionally caught the wasm resolution failure above, which the stubbed versions passed straight through.

## A size budget in lines reports green about a file nothing can read in one pass

- Symptom: `check:docs` passes, and `DECISIONS.md` is **332 KB** — about 80,000 tokens, most of a context window for one file. The budget it passed was 1,200 **lines**, and the file was at 1,132.
- Cause: the budget was set when entries were short `Decision:` / `Rationale:` bullets and was still being applied when they had become 4.5 KB prose paragraphs. **The file grew sideways, and a line count cannot see that.** A line count is a proxy for size only while lines have a roughly constant width, and nothing records the moment that stops being true — which is exactly the moment the proxy silently stops working.
- Avoid: budget the dimension you actually care about. If the concern is "can someone read this in one pass", measure **bytes** — with `Buffer.byteLength`, not `String.length`, because em dashes, Thai labels and typographic quotes are several bytes and one character each, so a character count under-reports the files most at risk. Then **print the size on a passing run**, not only on a failing one: a budget nobody sees the approach to is a budget that is only ever met as a surprise.
- The generalisation, and it is the same shape as the source-grep trap below: a check that measures a **proxy** for the thing it cares about keeps passing after the proxy and the thing come apart, and it is read as evidence the whole time. Ask what would have to change for this check to be green and wrong.
- Verify: 2026-08-18 (D-130). The budgets are now 120 KB and 200 KB, `DECISIONS.md` is 90 KB after D-060 … D-113 were archived, and a passing run prints `DECISIONS.md 90 KB/117 KB (77%), GOTCHAS.md 177 KB/195 KB (91%)`. Red-proved: lowering the decision budget to 80 KB fails with `90 KB exceeds the 78 KB budget` and names the archive remedy. **`PLAN.md` at 214 KB and `HANDOFF.md` at 91 KB in 86 lines are both still unbudgeted** and are named in D-130 rather than capped, because capping either without first moving its content would make the next handoff worse.

## A source-grep test keeps passing after the thing it names becomes false

- Symptom: a test called "does not register a service worker or install observation tooling" passes green in a commit that registers a service worker. Separately, a test asserting responses are `no-store` fails for a reason that has nothing to do with caching.
- Cause: both assert by reading source files. The first greps `app/ledger-app.tsx` and `app/transactions-view.tsx`; the worker was registered in `app/slip-capture.tsx`, so the grep looked at two files that happened to still be innocent and the test's own name became a lie. The second greps `next.config.ts` for the literal `value: "no-store"`; moving the header into `lib/security-headers.ts` broke it without changing any behaviour at all.
- Avoid: assert the produced value, not the text that produces it, whenever the value is importable — `securityHeaders(...)` returns the real header, so the test now checks it. Where a source grep is genuinely the right tool (proving an *absence* across a directory), derive the file list rather than hard-coding two of them, and make the assertion say which files it inspected.
- The sharper lesson: a green test whose name asserts something false is worse than no test, because it is read as evidence. When adding a capability the codebase previously forbade, grep the suite for the old prohibition before assuming nothing covered it.
- **It recurred on 2026-08-19, in the test sitting immediately above the one that was fixed.** The 2026-07-30 remedy — derive the file list — was applied to the service-worker test and not to its neighbour, which went on naming five files by hand to assert the ledger surfaces carry no client storage. One of the five was `app/transactions-view.tsx`, and splitting it into seven files (D-132) would have moved roughly 940 lines of markup out from under a check that kept passing. **A fix applied to one test in a file is not applied to the file**: when a remedy is "stop hard-coding the list", grep the whole suite for the other lists before closing it.
- The **silent** direction is the dangerous one and this repo has both. A split that *breaks* a spec is a loud, cheap failure (see "Splitting one page into routes breaks specs whose subject has nothing to do with routing"). A split that leaves a source-grep test passing over files the code has left is quiet, and nothing will ever raise it.
- Avoid, second form: after moving code between files, **red-prove the guard still covers it** — put the forbidden construct in the new file and watch the test fail. That is what caught nothing on 2026-08-19 only because the walk had already been widened to `.ts`; the new shared module is not a `.tsx` and a `.tsx`-only walk would have skipped it.
- Verify: 2026-07-30 for the service-worker half, which now enumerates candidate files and asserts registration appears in exactly one, plus that the worker has a single fetch handler, no precache list and exactly one `cache.put`. **2026-08-19 for the client-storage half**, which now walks `app/` for `.ts` and `.tsx`, excludes `app/site-header.tsx` by name as the one permitted registrar, and was red-proved with a `console.log` in `app/ledger-shared.ts`.

## Running the browser gate deletes whatever you captured by hand in the test project

- Symptom: a slip captured through the UI, or a statement imported by hand, is simply gone the next time you look — with no error and no sign anything happened.
- Cause: `tests/e2e/owner-session.spec.ts` calls `resetOwnerImportSurface` in `beforeEach` **and** `afterAll`, which deletes the seeded owner's slips, transactions, batches and artifacts. That is correct — a suite that left rows behind would fail its own next run on their fingerprints — but the owner drives the app as that same seeded owner in that same project, so hand-made data is inside the blast radius.
- Avoid: treat anything you create by hand in `private-ledger-local` as disposable, and re-create it after a gate run. Do not reach for the live project instead to keep it — since 2026-08-05 it does have a `slips` table (D-065), which makes this *more* dangerous rather than less: a slip captured there is a real mutation of real records, it is append-only and cannot be deleted, and it invalidates the standing backup by bumping the mutation sequence. If a hand-captured state must survive a test run, note what it was and re-enter it; there is no fixture path for it by design, since fixtures are invented.
- Verify: 2026-07-31. `public.slips` held 1 row captured through the UI; after `playwright.owner.config.ts` ran, the same query returned 0, alongside 0 transactions and the 3 seeded accounts.

## An axe pass on a route that loads nothing proves nothing about what the route renders

- Symptom: an accessibility gate reports a clean pass on `/ledger` while a control added to every row of the ledger table has never been examined by it.
- Cause: `tests/e2e/ledger.spec.ts` visits each route and analyses it as delivered. This app loads nothing until asked (`PLAN.md` task 17), so the ledger it checks has no table, no rows, and none of the per-row controls — and a per-row control is precisely where an accessible name is most likely to be missing or duplicated down a column.
- Avoid: read the isolated suite's axe rows as covering the *shell* of a route. Anything behind a load button needs its own axe call in the owner suite, where a session and real rows exist — one per state, since a table that shows a matched row and one that shows a provisional row have different controls on them.
- Verify: 2026-08-07. Two `AxeBuilder` passes scoped to `section.ledger-band` inside the D-068 spec, one after the undo and one after the re-match, both clean; the isolated suite's 18/18 is unchanged by controls it never sees.

## `locator.click().catch(() => {})` does not skip a missing control, it burns the timeout

- Symptom: a spec fails on a line that has nothing to do with the problem — typically `Target page, context or browser has been closed` at the *next* action — after running for the full test timeout.
- Cause: a Playwright locator action on an element that never appears waits until the test deadline before rejecting. Wrapping it in `.catch()` swallows the rejection but not the wait, so the whole budget is gone and everything after it fails against a torn-down page. Written as an "optional step", it reads as harmless and is the most expensive line in the file.
- Avoid: decide whether the control is there rather than trying it optionally. `if (await locator.count())`, or a short explicit `{ timeout: 2000 }` when a genuine race is being tolerated. Better still, know the state: after a successful capture the form resets, so the Discard button is *gone* — the optional click existed only because the spec had not thought about what the previous step left behind.
- Verify: 2026-08-09. The second capture in `captures a slip from its QR…` now chooses the next image directly; the spec runs in ~7s where the optional click made it fail at 30s.

## A rediscovered trap is not a new one — check before adding an entry

- Symptom: an entry is written up as a fresh discovery, in detail, describing something this file already recorded three days earlier.
- Cause: on 2026-07-31 the bare-port `.next` grep was hit again, investigated from scratch, and written up as new. **The existing entry above already covered it** — "Do not grep the bare port. That check was valid until 2026-07-28 and is not any more" — including the same `containerFor` cause and the same remedy. The duplicate was caught only by a validation pass on the following day.
- Avoid: grep this file for the symptom before writing an entry. It is long enough that reading it end to end is not realistic, which is exactly why the grep is the habit — and the same applies before "discovering" anything in `DECISIONS.md`.
- Verify: 2026-08-01. The duplicate was removed and this entry replaces it; the original coverage is under the build-target entry earlier in this file.

## Next.js mounts an empty `role="alert"` of its own, so a page-wide alert count never reaches zero

- Symptom: `expect(page.getByRole("alert")).toHaveCount(0)` fails with `Received: 1` on a page that renders no alert, and the snapshot shows a bare `- alert` after `contentinfo`, outside the app's own tree.
- Cause: the Next.js route announcer is an always-present element with `role="alert"`, empty until a navigation gives it text. Nothing in `app/` renders it and nothing can remove it.
- Avoid: scope the assertion to the region under test rather than to the page — `page.locator("section.ledger-band").getByRole("alert")`. The same applies to any page-wide count of a role the framework also uses.
- Verify: `tests/e2e/ledger.spec.ts`, the signed-out ledger test, which asserts a 401 on the automatic load raises no alert. Unscoped it fails against a correct page. Dated 2026-08-26.

## A fixture that renders a QR reaches the internet for its WebAssembly, so the slip specs need the network

- Symptom: five to seven adjacent slip specs fail together with `wasm streaming compile failed: TypeError: fetch failed` and `Aborted(both async and sync fetching of the wasm failed)`, thrown from inside `zxing-wasm/dist/cjs/writer`. Re-running usually clears it, which is what earned it the name *the QR intermittent* — and why it was blamed on the build's own `copy-zxing-wasm.mjs` step racing.
- Cause: **it is not a race and it is not intermittent.** `zxing-wasm`'s *writer* resolves its binary from a jsDelivr URL when nothing overrides it, so `tests/fixtures/synthetic-slip.ts` was fetching it from the internet every time it drew a QR. It fails whenever the network is unavailable or slow and passes on a retry because the second attempt found the network. `scripts/copy-zxing-wasm.mjs` deliberately does not cover this: it copies the **reader** into `public/` because the reader has to be served from the app's own origin under the CSP, while the writer never runs in the app at all.
- Avoid: hand the module the bytes. `prepareZXingModule({ overrides: { wasmBinary: readFileSync(writerWasm) } })` at the top of the fixture, resolving `writerWasm` out of the installed package. **`locateFile` does not work here** — it was tried first and this build reaches for its URL regardless; emscripten checks for an already-loaded binary *before* it resolves a path, so `wasmBinary` skips the fetch instead of redirecting it.
- Also: anchor that `createRequire` at `process.cwd()`, not `import.meta.url`. Playwright loads spec-adjacent modules through a CJS transform where `import.meta` does not exist, and the result is a *warning* plus a module that silently fails to load rather than an error naming the line.
- Verify: 2026-08-27. Confirmed with outbound network genuinely unreachable — a `HEAD` to the CDN times out and the same run's PostHog calls report `context deadline exceeded`. Before the override `captures a slip from its QR` failed on every attempt; after it the whole owner suite passes 32/32 with the network still down.

## `pnpm supabase:test` exits non-zero on a passing run, so the exit code is not the result

- Symptom: every file reports `ok`, the summary reads `Result: PASS`, and the command still exits 1 with `[ELIFECYCLE] Command failed with exit code 1`.
- Cause: the Supabase CLI's own container teardown and telemetry flush, not the tests. It shows as `error running container: exit 1` or a PostHog `Timeout while shutting down` line after the summary.
- Avoid: **read the `Result:` line and the `Files=… Tests=…` line, never `$LASTEXITCODE`.** Confirm any suspicion by moving the file under suspicion aside and re-running: an identical exit code with it absent is what separates this from a real failure.
- Verify: 2026-08-27, while adding `009_ledger_paging.sql`. `Result: PASS` with `Files=9, Tests=301` and exit 1; `Files=8, Tests=266` and exit 1 with the new file moved aside.

## A pgTAP plan that undercounts reports every subtest passing, and fails anyway

- Symptom: `All 30 subtests passed` printed immediately above `Failed 30/30 subtests`, with `Parse errors: Bad plan. You planned 30 tests but ran 35`.
- Cause: `select plan(N)` is a promise about how many assertions will run, and TAP treats a mismatch as a harness failure rather than an assertion failure — so the reassuring line and the failing line are both true and sit next to each other.
- Avoid: derive the number instead of counting by hand. `grep -c '^select \(ok\|is\|throws_ok\)(' supabase/tests/<file>.sql` is what the plan should say, and it is worth re-running after any edit that adds an assertion.
- Verify: 2026-08-27. `plan(30)` against 35 assertions produced exactly that output; `plan(35)` turned the same file green with nothing else changed.

## A reset helper that skips an overlay table leaves an orphan the FK triggers were disabled to allow

- Symptom: a browser spec seeds `public.transaction_overlays` for a transaction it also creates, passes, and then **the next run** fails with `duplicate key value violates unique constraint "transaction_overlays_pkey"` — naming a table that run has not touched yet.
- Cause: `resetOwnerImportSurface` runs under `set session_replication_role = replica`, which disables the FK triggers as well as the append-only ones. It deleted `source_transactions` and never `transaction_overlays`, so the overlay outlived its transaction instead of failing — and sat there until a fixture reused the id. Three other overlay tables in that same function carry a comment saying exactly this; the transaction overlay was missed because nothing in the app could write one outside `confirm_import`, whose ids are fresh every run, so the gap was unreachable until a test seeded one directly (PLAN task 48, D-165).
- Avoid: when a reset disables FK triggers, every table pointing at a deleted row must be listed **before** it, and "no code writes this yet" is not a reason to leave one out — a test is code. Grep the migrations for tables carrying the id being deleted rather than working from memory of which ones the app uses.
- Verify: 2026-08-27. Seeding an overlay, running the spec twice, and watching the second run fail on the primary key; adding `overlay_revisions` and `transaction_overlays` before `source_transactions` turned it green and repeatable (D-165).

## A backtick inside a `psql` template literal closes the SQL string and the error names a TypeScript line

- Symptom: `Failed to type check. ./tests/helpers/local-owner.ts:216:9 Type error: ',' expected.` pointing at a line of SQL **comment**, during a Playwright run's `webServer` build.
- Cause: the helper builds its SQL in a JavaScript template literal, so a backtick anywhere inside it — including inside a `--` comment written in this repo's usual style of quoting `identifiers` — terminates the string. Everything after it is parsed as TypeScript. The existing comments in that function avoid backticks for exactly this reason and nothing says so.
- Avoid: no backticks and no `${` in SQL comments inside a template literal. Write the identifier bare. Running `pnpm typecheck` after editing a helper catches it in seconds; discovering it through a browser suite's build costs a full server start.
- Verify: 2026-08-27. The error above, from a comment reading ``the categories `confirm_import` stores``; removing the two backticks compiled (D-165).

## `document.fonts.ready` resolves before a newly applied face has been requested

- Symptom: a spec that switches typeface and measures the page passes and fails on alternate runs with no change in between, reporting header heights that differ by 44px one run and not at all the next.
- Cause: a browser requests a font file only when something actually uses it. Immediately after `router.refresh()` rewrites `data-font`, there may be no pending load at all — so `document.fonts.ready` resolves at once, the **fallback's** metrics are what gets measured, and whether the real face has arrived by the time the assertion runs is a race. Both outcomes look like a real result.
- Avoid: name the stack and start the load — read `--font-body` off the computed style, `await document.fonts.load("16px " + stack)`, then `await document.fonts.ready`. That makes the request rather than hoping one is outstanding. The same applies to any canvas `measureText` probe: an unloaded family silently measures the fallback and every face reads identical, which looks like success.
- Verify: 2026-08-27. Two consecutive runs of the same unchanged spec, one green and one failing by 44px; with the explicit load both projects are stable across repeated runs (D-166).

## A Playwright config with `testDir: "."` and no `testMatch` runs every spec in that directory

- Symptom: naming one throwaway config to run one harness starts 21 unrelated specs across parallel workers, and the run fails with foreign-key and "is not present in table" errors that read like real defects in the code under test.
- Cause: `testDir: "."` collects **every** matching file beside the config, not the one the config was written for. Under `.runtime/` that is every harness anyone has ever left there. They then run concurrently against one database, and several seed and delete rows for the *same* synthetic owner — `mobile-audit.spec.ts` inserts a `source_transactions` row and `statistics-audit.spec.ts` deletes `source_transactions where owner_id = …` between that insert and its component insert. Each harness is correct alone; the failure exists only in the overlap, and it names the innocent one.
- Avoid: pass the spec path as an argument (`playwright test --config <cfg> <spec>`) and add `--workers=1`. This is the same family as the standing rule about not running the bare `playwright.config.ts` and expecting the owner suite — a config's *scope* is not its filename. A throwaway config that will only ever drive one spec should carry a `testMatch` naming it.
- Verify: 2026-08-29. The full-directory run reported 20 failed / 4 passed / 1 skipped in 12.7m; the identical harness passed alone in 26.5s once the spec was named and workers pinned to one.

## A harness that signs in through a control the app later hid fails as a timeout, not as a missing selector

- Symptom: a phone-width harness times out after 120s on `waiting for getByRole('button', { name: 'Dev sign-in' })`. The page snapshot shows a fully rendered, healthy app — nav, banner, main landmark, headings — with no sign-in button anywhere.
- Cause: D-157 put every header control except the brand and the route row behind a `Settings` disclosure below 700px, and the sign-in went with it. `.header-panel[data-open="false"]` is `display: none`, so the button exists in the DOM, is not visible, and Playwright waits for actionability rather than reporting an absence. **The harness had been unrunnable at phone width since `d7411b3` and nobody noticed for three days**, because a gitignored throwaway only fails when somebody asks it to run — so the one instrument that measures phone tap targets was blind across exactly the window in which new small controls shipped.
- Avoid: open the disclosure first, guarded so it stays a no-op at desktop width where the toggle is `display: none`: click `Settings` when it is visible and not already `aria-expanded="true"`. More generally — a harness that reaches the app through a control is coupled to that control's *responsive* behaviour, not just its existence, and a change that hides it at one breakpoint breaks the harness silently at that breakpoint only. Re-run the phone harnesses after any header change.
- Verify: 2026-08-29. The timeout above, with `error-context.md` showing `button "Settings"` present and no sign-in; adding the disclosure step made the same spec pass in 11s and report all five routes (D-168).

## `resize_window` reports success on a maximized window and moves nothing

- Symptom: a browser-automation resize to 390×844 returns "Successfully resized", three times in a row, while the page keeps reporting `innerWidth: 1699`. Every measurement taken afterwards is a desktop reading wearing a phone label.
- Cause: Chromium's window API silently ignores width and height on a window whose state is `maximized`; the call succeeds and is a no-op. The tool has no way to say so. `window.outerWidth >= screen.width` is the cheap test for it — 1707 against 1707 here. `window.open(url, name, "width=390,…")` is not a way around it either: without a user gesture the popup is blocked and returns `null`.
- Avoid: **read `window.innerWidth` back after any resize** and treat the reading, not the tool's return value, as the result. This is the same family as the audit that measured `documentElement.clientWidth` after the viewport had already grown to contain the overflow, and as a ratio that adjusts to the thing it is checking: a success signal that describes something other than what was asked. A real device-emulation project (`devices["iPhone 13"]`) does not have this failure mode at all, and is the right instrument when the measurement matters.
- Verify: 2026-08-29. Three consecutive resizes reported success with `innerWidth` unchanged at 1699 and `outerWidth` equal to `screen.width`; the popup fallback returned `blocked: true`.
