# Private Ledger gotchas — App, auth, routing and accessibility

Split out of `GOTCHAS.md` on 2026-08-25 (D-149), unchanged. **40 traps.**

`GOTCHAS.md` keeps the index across every section and is still the way in — it lists every
trap in this file, so a reader finds the one that applies without loading any body. Add a trap
here and add its title to that index; `pnpm check:docs --strict` fails if the two disagree.

Each trap states the symptom, cause, prevention, and verification. What a date on a `Verify:`
line means, and what a backfilled `Dated <date> from <sha>` clause does not, is explained at
the top of `GOTCHAS.md`.


## Strict production CSP can block the Next.js development runtime

- Symptom: Playwright clicks do nothing, no API request is made, and the browser reports that development `eval()` is blocked.
- Cause: React and Next.js development tooling require behavior intentionally forbidden by the production CSP.
- Avoid: run browser acceptance tests against `pnpm build && pnpm start`; do not weaken the production CSP with `unsafe-eval`.
- Verify: the synthetic flow and accessibility tests pass against the production server without CSP console errors. Dated 2026-07-24 from `9203a87`, the foundation commit that set the strict `Content-Security-Policy`.

## Signing in again at aal1 downgrades a shared Supabase cookie session

- Symptom: tests that share one stored session start returning 403 "AAL2 and two verified TOTP factors are required" after an unrelated test deliberately signs in without MFA — and re-storing the aal2 session does not fix them.
- Cause: a password sign-in replaces the stored session for that storage key, and a token later refreshed in that family is no longer aal2. `setSession` with the old access token does not reliably restore the stronger claim.
- Avoid: order aal1 and unauthenticated cases after every test that needs strong access, rather than trying to restore the strong session between them. Mint a fresh aal2 session if a test genuinely needs one after a weak sign-in.
- Verify: `tests/import-route.test.ts` keeps its `without strong owner access` block last; moving it earlier reproduces a cascade of 403s in the tests that follow. Dated 2026-07-28 from `119bba2`, the commit whose subject names this — "the sign-in stops eating itself".

## Only one ledger owner can ever exist locally

- Symptom: inserting `mutation_sequences` or `accounts` for a freshly created auth user fails with a foreign key violation against `ledger_owners`.
- Cause: `public.ledger_owners` holds a single binding row and is immutable — a trigger rejects updates and deletes — so a second owner cannot be bound without resetting the database.
- Avoid: authenticate as the seeded synthetic owner (`supabase/seed.sql` sets its password) instead of creating a new user.
- Verify: `select * from public.ledger_owners` returns exactly one row, and the import e2e signs in as that owner. Dated 2026-07-24 from `9203a87`, the foundation commit that introduced `public.ledger_owners` and its single-owner binding.

## A guard keyed on `NODE_ENV` is unreachable in the build that must exercise it

- Symptom: a development-only route or affordance works under `next dev` and is untestable in the browser suite, or a spec written against `next dev` sees clicks do nothing at all.
- Cause: two constraints meet. Browser tests here run against `pnpm build && pnpm start`, because the strict CSP forbids the `eval()` React needs in development mode (see the CSP entry above) — and `next build` sets `NODE_ENV=production`, so anything gated on `NODE_ENV !== "production"` is switched off in exactly that build.
- Avoid: gate on an explicit opt-in flag the test config sets, not on the build mode — `NEXT_PUBLIC_ALLOW_DEV_OWNER_SESSION` in `playwright.owner.config.ts` (D-036). A `NEXT_PUBLIC_` flag is inlined at build time, so it must be set for `pnpm build` as well as for `next start`; Playwright's `webServer.env` covers both. Never relax the CSP to make `next dev` work.
- Verify: `tests/dev-session.test.ts` asserts a 404 without the flag; `tests/e2e/owner-session.spec.ts` passes only under its own config and self-skips elsewhere. Dated 2026-07-25 from `316cdac`, the commit that introduced `NEXT_PUBLIC_ALLOW_DEV_OWNER_SESSION` in place of a `NODE_ENV` check (D-036).

## A leftover TOTP factor makes a later sign-in unable to reach aal2

- Symptom: an authenticated suite fails at enrollment with `403 insufficient_aal`, "AAL2 required to enroll a new factor", on an owner whose password is correct.
- Cause: GoTrue refuses to enroll a factor at aal1 once the user has a verified one. `tests/backup-roundtrip.test.ts` inserts two factors directly and never removes them, so any suite that afterwards tries to climb to aal2 by enrolling cannot.
- Avoid: delete `auth.mfa_factors` for the owner before signing in, not only in teardown — teardown does not run for a suite that was never reached.
- Verify: the failure reproduces by running `tests/backup-roundtrip.test.ts` and then any suite that enrolls — that is how it was found. `tests/recovery-portability.test.ts` clears factors on both projects before signing in and again in teardown.
- **Its remedy message names the wrong database since D-048.** The hint reads `docker exec -i supabase_db_private-ledger-local …`, hardcoded to the test project. Once `.env.local` points at `private-ledger-live`, the stale factors are in **live** and that command clears nothing — on 2026-07-28 test held 0 factors and live held 2. Substitute `supabase_db_private-ledger-live` when the app is aimed there. Deleting them is safe: `auth.mfa_factors` is not among the eleven backed-up tables, and the development sign-in re-enrols on the next attempt.
- A second route into it, also seen 2026-07-28: the owner Playwright suite signs in against the **test** project and rewrites `.runtime/dev-mfa.json`, so afterwards the secrets on disk no longer match the factors sitting in live. Running the browser gate and then driving the live app by hand reproduces it.
- **`pnpm test` did this too, which the line above missed.** `tests/dev-session.test.ts` drives the real route against the test project, and the route calls `saveFactors` — so any unit run, not only the browser gate, overwrote `.runtime/dev-mfa.json` with test-project secrets. A live browser session already at aal2 kept working because its cookie is minted; the next live *sign-in* is what failed, which is why the lock-out seemed to come from nowhere.
- **Both halves are fixed as of 2026-07-28, and the fix is the reason this entry now reads as history.** The remedy message is derived rather than hardcoded (`containerFor`), so it names the project the running build is aimed at; and the secret store is keyed per project (`.runtime/dev-mfa-<project>.json` via `storeFor`), so a run against one project cannot invalidate another's secrets. `tests/dev-session.test.ts` clears only the test project's file.
- Verify: hash `.runtime/dev-mfa-private-ledger-live.json`, run the full `pnpm test`, hash it again — it must be byte-identical while `dev-mfa-private-ledger-local.json` is rewritten. Confirmed twice on 2026-07-28 after a real live sign-in. **What the fix cannot do is recover secrets already lost**: factors enrolled before it, whose secrets went with the shared file, still have to be cleared once so fresh ones can be enrolled. A stale `.runtime/dev-mfa.json` left over from the shared-store era is inert and can be deleted.

## Creating a ledger account before the import is proven leaves one that cannot be removed

- Symptom: an account with zero rows sits in the ledger permanently, showing up in the transactions view's `Imported accounts: N of M` line as a gap that never closes.
- Cause: the natural order — create the account, then import into it — writes the account first and only then discovers the import is refused. `public.accounts` has no delete path *by design*, because `source_transactions.account_id` references it, so there is no undoing it.
- Avoid: assemble first. `assembleImportPayload` performs the binding checks and the reconciliation, so a statement that will be refused is known **before** anything is written. Create the account only once assembly returns ok.
- Verify: happened on 2026-07-29 with the Krungthai statement (D-054). The empty account is still there and will be until the statement imports.

## A `role="status"` added to a static notice breaks every existing spec that looks one up by role

- Symptom: ten owner-session specs that passed the day before all fail at their sign-in step with `strict mode violation: getByRole('status') resolved to 2 elements`, after a change that touched none of them. The new feature's own specs pass.
- Cause: a new section rendered a "this browser cannot do X" notice as `role="status"`. Playwright's `getByRole` is strict, so a second status live region anywhere on the page breaks any helper that resolves one. The new specs passed because they stub the capability the notice reports on — so for them the notice never rendered, while for every other spec, running in headless Chromium without `BarcodeDetector`, it always did. The stub hid the regression from precisely the tests that would have caught it.
- Avoid: `role="status"` is for what just happened, not for what is true. Static explanatory text is a plain paragraph. When adding a live region to a shared page, grep the specs for `getByRole("status")` first — and treat "my new tests pass but old ones fail" as evidence about the new tests' fixtures, not about the old tests.
- Verify: 2026-07-30. Owner suite went 5 passed / 10 failed to 15/15 with the role attribute removed and nothing else changed.

## Splitting one page into routes breaks specs whose subject has nothing to do with routing

- Symptom: after a routing change, eight browser specs fail on `locator('input[name="statement-pdf"]') — waiting for locator`, in two files about the PDF reader and the layout readers. Nothing about parsing changed.
- Cause: every spec navigated to `/`, which used to render the whole app. `page.goto("/")` is an invisible dependency on there being one page, and it is spread across files by subject rather than collected anywhere. Updating the specs whose *subject* was the routing (the ledger and owner-session suites) left the rest pointing at a route that no longer holds the control they use.
- Avoid: before splitting a page, grep the whole browser suite for `goto(` and fix every hit, not the files the change is "about". The failure message names a missing locator, so it reads as a broken selector rather than as a spec on the wrong page — which sends you looking at the component that is fine.
- Verify: 2026-07-31. The isolated suite ran 8 failed / 10 passed with two files unfixed, and 18/18 once `parser.spec.ts` and `statement-pdf.spec.ts` were pointed at `/import`.

## A second `role="status"` in the shell makes every existing status assertion ambiguous

- Symptom: a live region added to a shared header turns unrelated specs red with `strict mode violation: locator resolved to 2 elements`, on assertions that were not touched.
- Cause: `getByRole("status")` matches every element with that role on the page. Each route here already has exactly one status line, and specs read it unscoped. A shell element carrying `role="status"` — or an `<output>`, which computes to the same role — appears on all of them at once.
- Avoid: a shell-level announcement can use `aria-live="polite"` on a plain element, which announces identically and does **not** compute to `role="status"`, and specs then target it by class. Where a second status role is genuinely wanted, scope the existing assertions to their section first, in a separate change, so the two failures do not arrive together.
- Verify: 2026-07-31. `app/site-header.tsx` uses `aria-live` and `signIn()` reads `.session-state`; owner-session passes 16/16 with per-route status assertions untouched.

## An `aria-label` replaces a button's words rather than adding to them, and axe says nothing

- Symptom: a Playwright locator asking for a button by the words printed on it times out, and the button is plainly there in the trace. It reads as a bad selector.
- Cause: `aria-label` **overrides** the visible text as the accessible name. A button reading `Not this slip` labelled `This slip is not the row dated 10 Jun 2026` has an accessible name that does not contain its own words, so `getByRole("button", { name: "Not this slip" })` cannot match. The real cost is not the test: it breaks WCAG 2.5.3 (label in name), so a voice-control user saying what is written on the button reaches nothing. axe passes it — the element *has* a name, and axe cannot know the name is not the one on screen.
- Avoid: when a repeated control needs a per-row name, **start the label with the visible text** and append the distinguishing detail — `This is it — 10 Jun 2026 at 11:05, balance ฿7,850.00`. Locate it in tests by an anchored prefix on the visible words, and by the row it sits in for the rest.
- Verify: 2026-08-07. Both D-069 controls relabelled; the spec locates them by `/^Not this slip/` and `/^This is it/` and passes, with the two axe passes over the loaded ledger still clean — which is the point: axe was clean before the fix too.

## A control that disables itself takes the focus with it

- Symptom: activating a button by keyboard appears to work — the mode changes, the live region announces it — but the next Tab starts from the top of the document. Nothing is reported by axe, and every text assertion in the suite passes.
- Cause: a browser blurs an element that becomes `disabled`, and focus falls to `<body>`. Any control whose own click disables it does this: `onClick={() => setMatching(id)}` on a button whose `disabled` prop reads the same state. An `aria-live` announcement does **not** restore a position in the tab order — it says what happened and leaves the user nowhere.
- Avoid: when an interaction replaces the controls on screen, move focus deliberately to a control that is certainly present in the new state — the way out of the mode is usually the right one. A `ref` plus a `useEffect` on the mode flag is enough. Assert it: `await expect(page.getByRole("button", { name: "Cancel" })).toBeFocused()`.
- Verify: 2026-08-07. `app/transactions-view.tsx` focuses the picking mode's `Cancel`; `tests/e2e/owner-session.spec.ts` asserts it. Found by review, not by the suite — the axe passes over that exact screen were green before and after.

## `readError` takes a parsed body, so handing it a `Response` silently shows the fallback

- Symptom: a route's carefully worded refusal never reaches the screen. The user sees the generic sentence the caller passed as a fallback, every time, for every failure — which reads as "the server said nothing useful" rather than as a bug.
- Cause: `readError(body, fallback)` in `lib/wire.ts` looks for an `error` key on an already-parsed object. A `Response` has no such key, so the check falls through to the fallback and nothing throws. `await readError(response, …)` compiles, runs, and is wrong: `await` on a non-promise is a no-op, and TypeScript accepts it because the parameter is `unknown`. The correct call is two lines — `const body: unknown = await response.json().catch(() => null)` and then `readError(body, …)`.
- Avoid: read the signature rather than the name. Every other caller in `app/` does it correctly, which is what makes the one that does not hard to spot by eye; grep for `readError(response` before trusting an error path you have not seen fire.
- Verify: 2026-08-10, found while writing `app/cash-entry.tsx` by copying the pattern from `app/slip-capture.tsx`, and **fixed in that file the same day**. What it had been hiding: the capture route words two refusals specifically — a Buddhist-era date and an unknown category — and neither had ever reached the screen. No test caught it and none does now; the suites assert the success path, and the two refusals are reachable only from a real form. `grep -rn "readError(response"` returns nothing, which is the check worth repeating.

## Stripping whitespace lets an unanchored numeric group swallow the next field

- Symptom: a reader works on two of three layouts and reports "no line on this image reads as a date" about a slip that plainly prints one. Every unit test passes, because the failing layout's test asserted only that the read was refused, not *which* refusal it was.
- Cause: `normalise` in `lib/slip-ocr.ts` removes all whitespace before matching, because Thai has no inter-word spaces and where an OCR engine breaks a run is its business. Krungthai and SCB separate the year from the time with a hyphen, so `2569 - 09:05` survives as `2569-09:05` and reads correctly. **KBANK separates them with spaces alone**, so `69  11:38 น.` arrives as `6911:38น.` and a greedy `\d{2,4}` takes the year as `6911`. That converts to an implausible era year, fails closed, and the line is discarded as "not a date" — a correct-looking refusal reached for the wrong reason.
- Avoid: anchor the tail. Requiring the match to consume to the end of the line makes the four-digit reading fail and the two-digit one succeed by backtracking, which is the correct split rather than a lucky one. The general rule is the part worth carrying: **once whitespace is stripped, every field boundary has to come from the grammar**, because the only thing separating two numbers is gone. Any `\d{n,m}` sitting next to another numeric field is this bug waiting.
- Verify: 2026-08-10, found while building `readPrintedDate` and caught by the KBANK test asserting `DATE_YEAR_UNRESOLVED` rather than merely `ok === false`. That assertion *is* the check: before the anchor the call returned `DATE_NOT_FOUND`, which a test on `ok` alone cannot distinguish.

## Re-seeding the Supabase cookie jar per `describe` block makes every later test 403

- Symptom: a route suite passes its first group and then returns **403 on every test after it**, including tests that assert a pure zod refusal and never reach the database. The failures read as an authorisation regression in the route, which is exactly what they are not — the first group proves the same route authorises fine.
- Cause: the helper pattern stores one `OwnerSession` in a module-level variable and replays it into `@supabase/ssr`'s cookie writer. **The requests in the first group rotate the tokens.** Calling `setSession` again with the original pair therefore writes a jar built from a refresh token that has already been used, and `strongOwnerClient` refuses it. `seedCookieJar` does not throw, because `setSession` reports no error and the jar is not empty — so nothing points at the cause.
- Avoid: **one `beforeAll` per file**, with the groups nested inside it as plain `describe` blocks. Seeding per group looks tidier and buys nothing; the jar is module state and there is only ever one of it. `tests/cash-and-correction-routes.test.ts` was already written this way, which is why it never met this.
- Verify: 2026-08-12, found while writing `tests/notification-card-routes.test.ts`. The tell is the shape rather than the count: **a 403 on a test whose assertion is a 422 from zod** means the request never got past auth, so the boundary being exercised is not the one that failed. Restructuring to a single `beforeAll` took the file from 9 failed / 5 passed to 14 passed with no change to the route.

## pgTAP run straight after `pnpm test` fails in `001` on a foreign key, and the change is not the cause

- Symptom: `pnpm supabase:test` fails almost immediately with `insert or update on table "source_transactions" violates foreign key constraint "source_transactions_account_id_owner_id_fkey"` in `001_security.sql`, then `account not owned` in `002`, then `Bad plan` parse errors as later files run a fraction of their planned tests. It reads as a migration having broken the seed. It has not.
- Cause: the Vitest suites are owner-scoped rather than test-scoped — `resetOwnerImportSurface` deletes the owner's **accounts** in teardown, including the ones the synthetic seed created. pgTAP's fixtures insert rows against those seeded accounts, so every file that needs one fails on a foreign key against a row `pnpm test` removed twenty seconds earlier.
- Avoid: run `pnpm supabase:reset` **between** `pnpm test` and `pnpm supabase:test`, which is exactly where `docs/LOCAL_DEV.md` puts it. That position is not tidiness and it is not the same reset a new migration needs: a new migration means resetting *before* `pnpm test` as well, so a run with a new migration resets **twice**.
- Verify: 2026-08-14, during the migration 017 gate. Read the *first* failing file rather than the count — `001` failing on a foreign key while the newest file passes in isolation is the signature of a missing reset, not of a broken change. Running the new file alone and watching it pass is the cheapest confirmation.

## A PowerShell `**` path glob does not recurse, so the build's target check silently under-counts

- Symptom: the `.next` resting-state check reads **three** chunks carrying the synthetic project's port where every previous run recorded four. Nothing errors. The safety-relevant halves — zero chunks carrying the hosted ref, zero carrying the historical live port — read correctly, so the artifact looks *almost* right and the missing chunk reads as a build that changed rather than a search that missed.
- Cause: `Select-String -Path .next\server\**\*.js` treats `**` as a single-level wildcard. It matches `.next/server/chunks/*.js` and stops; `.next/server/chunks/ssr/*.js` is one level deeper and is never opened. The count is therefore a function of how the bundler happened to nest the chunks, not of what the build targets.
- Avoid: enumerate the files first and pipe them in — `Get-ChildItem -Path .next\server -Recurse -Filter *.js -File | Select-String -Pattern … -List`. Print the file count alongside the match count, so a search that scanned the wrong tree is visible rather than inferred: 147 files scanned is a plausible `.next/server`, and a number far below that is the tell.
- Verify: 2026-08-13, during the D-102 gate. The glob reported 3 and the recursive enumeration reported 4, from the same build, with the fourth match in `.next/server/chunks/ssr/`. **The failure direction is the dangerous one**: this check exists to prove no chunk carries the hosted project, and a search that quietly skips a directory would report zero for a chunk it never opened. Read the file count, not only the match count.

## A misread separator hides the label, not just the value, and the field reads as "not printed"

- Symptom: a card's timestamp is refused as `LABEL_NOT_FOUND` on most SCB Connect cards, which reads as *this layout does not print a timestamp on this card*. The value grammar is blameless and gets debugged anyway. Measured: **7 of 19 real cards** refused their date this way, against 2 that reached the value grammar and failed there.
- Cause: D-113 established that `/` comes back as `|` or `!` on essentially every card, and treated it as a problem for a date's **value**. Two of the wordings this grammar anchors on carry a slash themselves — SCB Connect's `วันที่/เวลา` and KBank Live's outgoing title `รายการโอน/ถอน` — so the same misread makes the **anchor** unfindable. `normalise` does not repair it, and a label that does not match is indistinguishable from a label that is not there.
- Avoid: repair the separator before matching any label or title, not only before parsing a figure (`repairSeparators` in `lib/notification-card-ocr.ts`). It is safe there for a stronger reason than in the value path: that text matches labels only, never builds a crop and never yields a digit, so no substitution can move a pixel or a figure. **Look for this class wherever a label contains punctuation an engine confuses** — the fix belongs at every anchor, not at the one field whose number was being investigated.
- Verify: 2026-08-16. Date and time went **10/19 → 12/19** on the real sample with amount, balance, own account and the card count all unchanged; five labels remain garbled some other way. A test asserts the crop is identical with and without the misread.

## Running the harness config without naming a file re-runs every harness under `.runtime/`

- Symptom: a measurement run prints results for a harness nobody invoked, and a file of real values that was awaiting the owner's marking is silently rewritten.
- Cause: `.runtime/vitest.harness.config.ts` includes `.runtime/**/*.harness.ts`, so `pnpm vitest run --config .runtime/vitest.harness.config.ts` collects **every** harness present, not the one being worked on. Harnesses here write their output files unconditionally, so an unrelated one re-running overwrites whatever state that file had accumulated.
- Avoid: always name the harness file as well as the config. Before running anything under that config, list `.runtime/` and see what else is there — harnesses are deleted after use precisely so this cannot happen, and one left in place is the hazard.
- Verify: 2026-08-16. A run intended for a new harness also re-ran D-113's and rewrote `.runtime/card-ocr-readings.tsv`; the values were identical but any y/n marks on it were lost, and marking that file is the only open way to establish whether an accepted figure was correct.

## Enlarging an image for OCR moves every box, so the crops must come from the same image

- Symptom: after reading an enlarged screenshot, every cropped field shows the wrong row — or a blank strip — while the reader reports each field as found. Nothing errors, and the picture beside the input looks like a plausible piece of the card.
- Cause: the reader returns a box in the coordinate space of **whatever it read**. Read a 2× image and crop from the original file with the same box and every crop lands at twice its intended offset. It is silent by construction, because a crop of the wrong row is still a crop.
- Avoid: hold **one** image and use it for both. `app/notification-card-capture.tsx` carries a `CardImage` — the enlarged source plus its dimensions — built once by `loadCardImage` and passed to both the reader and `cropRegion`; the `File` is not kept, so there is nothing to accidentally crop from. `paddedCrop` must be given the same dimensions for the same reason.
- Verify: 2026-08-16 (D-117). The enlargement lands with the shared `CardImage`, and the card-switch path re-crops from the held image rather than re-decoding the file.
- **Still live, and closed by construction rather than by care as of 2026-08-17** (D-120). The card path no longer enlarges anything — Vision reads at native size — so the reading and the crops are one image at one scale and no box is ever rescaled. The entry stays because the hazard returns the moment any engine wants a different scale from the one the crops are cut at, and because the `CardImage` that holds the two together is the thing that must not be split.

## A measurement taken on slips does not govern cards, and this is the fourth time

- Symptom: a decision entry states a limit with numbers behind it, the limit is inherited without re-testing, and it turns out not to hold on the record it is being applied to.
- Cause: slips and cards are read by the same engine and the same seam, so a finding about one reads as a finding about both. They are different subjects — a photographed receipt against small grey label text inside a phone-notification screenshot — and the engine behaves differently on each. **D-087's 2× upscale ladder** (recovered 1 slip, broke 3) does not hold for cards, where a capped 2× took fields filled from 62 to 70 of 100 (D-117). D-087's accuracy claim did not hold for cards either, and was measured on an older engine version besides (D-112). D-113 found the same for its date grammar.
- Avoid: before inheriting any OCR limit, check what it was measured **on** and on which engine version. Re-run it against the record in hand rather than reasoning from the entry. Where a finding is genuinely per-subject, apply it at the **call site** rather than in the shared engine — the card form scales its own image and `lib/slip-ocr-engine.ts` is untouched, so slip capture keeps the behaviour its own measurement supports.
- Verify: 2026-08-16 (D-117, D-112, D-113). Three inherited limits, three re-measurements, three that did not transfer.

## A reader tuned to one OCR engine's word boundaries fails silently on another's

- Symptom: swapping the OCR engine for a demonstrably better one **finds fewer cards**, not more. Three screenshots yielded no card at all under Google Cloud Vision where tesseract found one, while every field Vision did reach read better than tesseract managed.
- Cause: `findCards` requires a line to **start** with the layout's direction word, and `labelAtLineStart` requires the same of every label. That rule is right — it is what stops a `ประเภท` row carrying the direction word inside a phrase from inventing a card — but it makes the splitter depend on where the engine chose to break a Thai run, and Thai has no word separator to make that choice obvious. Two engines break the same pixels differently, so a rule anchored at a word boundary silently means "a boundary *this* engine would produce".
- Avoid: treat word segmentation as engine-specific rather than as a property of the image. When comparing engines, compare **through the same grammar** so the difference is attributable, and read a drop in *cards found* as a grammar problem before concluding anything about the engine. The same fragility applies to a tesseract upgrade moving its own boundaries, so it is latent on the local path too, not only when swapping.
- Verify: 2026-08-16 (D-118). Vision filled 88 fields against tesseract's 70 over the same 12 screenshots while finding 23 cards against 25 — the entire card-count regression is in this repository's splitter, not in the engine.

## A route test that stubs `globalThis.fetch` breaks the owner's own session lookup

- Symptom: a route test that fakes a third-party call fails long before reaching it, with a sign-in or session error that has nothing to do with the code under test.
- Cause: `strongOwnerClient` authenticates the owner over HTTP against the local Supabase project, using the same `globalThis.fetch` the stub replaced. Replacing it wholesale takes out the auth the route runs *first*.
- Avoid: stub selectively and pass everything else through — match on the third party's origin, return the fake for that, and call the captured real `fetch` for anything else. Restore it in a `finally`, or every later test in the file inherits the stub.
- Verify: 2026-08-17 (D-120). `tests/notification-card-routes.test.ts` § reading a card screenshot stubs only `https://vision.googleapis.com` and restores the real `fetch` afterwards.

## A `setx` variable does not reach a shell an already-running tool spawns

- Symptom: a harness reports a credential missing when the environment variable is demonstrably set — visible in a fresh terminal, and readable with `[Environment]::GetEnvironmentVariable(...,"User")`.
- Cause: `setx` writes the user environment, and a process inherits that environment **when it starts**. Every shell spawned by a tool that was already running inherits the *old* copy. Nothing reports this; the variable is simply absent.
- Avoid: read it explicitly in the command that needs it and assign it into the child's environment — `$env:NAME = [Environment]::GetEnvironmentVariable("NAME","User")` on the same line as the run. Report a credential's **length** to prove it is present, never its value.
- Verify: 2026-08-16 and again 2026-08-17 (D-118, D-120). The Vision measurement harness reads `GOOGLE_VISION_KEY` from `process.env` and prints its length alone.

## `normalise` decomposes Thai `ำ`, so a label the source spells with one character is matched as two

- Symptom: a label that is plainly on the card is refused as `LABEL_NOT_FOUND`, and comparing the strings by eye — or by pasting them side by side — shows no difference at all.
- Cause: `normalise` runs `NFKC`, and U+0E33 (`ำ`, sara am) has a **compatibility** decomposition to U+0E4D (nikhahit) + U+0E32 (sara aa) that NFKC applies and does not recompose. So `วันที่ทำรายการ` is 14 characters in the source and **15** in the matcher, with a bare nikhahit at index 7. Any engine that reads that small circle as a different superscript mark — U+0E48 mai ek is the one observed — diverges from the label at a position no visual comparison shows.
- Avoid: diagnose a Thai label refusal **by code point**, never by eye or by string equality in a console. Compute the longest shared prefix against the normalised label and print the first differing character's code point; that names the failure in one line. Do not "fix" it by removing the normalisation — the same NFKC is what makes Arabic-digit and whitespace handling work everywhere else.
- Verify: 2026-08-17 (D-121). One card of 25 refuses this way; the divergence is at label character 8 of 15, U+0E48 where the label holds U+0E4D. **Tolerated as of 2026-08-18** (D-127): `labelAtLineStart` now allows one mark-above-the-line substitution, bounded and proven safe by the labels staying distinct under it. The trap stays because the NFKC decomposition is still the thing that makes a Thai label longer than it looks, and the next surprise will come from that.

## `array_length` of an empty array is NULL, so a count-the-duplicates check fires on an empty list

- Symptom: a payload that is plainly valid is refused, and the message names a rule it does not break — an empty list rejected as "contains a repeated field name". The same operation with the key **omitted** succeeds, which makes the two look like different payloads when they are two spellings of one.
- Cause: PostgreSQL's `array_length(arr, 1)` returns **NULL** for an empty array, not 0. So the idiom `array_length(v, 1) is distinct from (select count(distinct n) from unnest(v) as n)` is true for an empty array — NULL against 0 — and every guard written that way refuses the empty case while claiming a duplicate. `cardinality(v)` returns 0 and does not have this behaviour.
- Avoid: write `coalesce(array_length(v, 1), 0)` or use `cardinality`. And **test both spellings of "nothing"** — an absent key and an explicitly empty array — because a validator with an early return for one will never exercise the other, which is exactly how this survived a full green gate.
- Verify: 2026-08-17 (D-122). `private.assert_prefill_field_names` refused `[]` in production while accepting an absent key; reproduced with three one-line queries against `private-ledger-local`. **Fixed by migration 020 on 2026-08-18** (D-126) and red-proved first — the pgTAP test died with the exact production error on the pre-020 schema. The trap stays because the idiom is the danger, not the one function that used it.

## A defect that only appears when a feature succeeds will not be in the gate

- Symptom: an accuracy improvement ships green on every suite and immediately breaks in production, on the path that only opens when the feature works perfectly.
- Cause: tests are written against the cases that existed when they were written, and a partly-working feature never produces its own success path. A card pre-fill at 70% always had *some* field the owner corrected, so the "changed nothing" payload was never sent by anything — until the engine reached 99 of 100 and it became the normal case (D-122).
- Avoid: after any change that raises a success rate, ask **which paths become reachable that were not**, and walk those before shipping. The empty collection, the zero-length list, the no-corrections case and the everything-matched case are the usual ones. A green gate says the old paths still work, and says nothing at all about the new one.
- Verify: 2026-08-17 (D-122, D-120). Vitest 595, pgTAP 263 and both browser suites were green over a card capture that could not succeed.

## Pre-filling one half of a two-signal cross-check leaves a check that agrees with itself

- Symptom: none, ever. The refusal path still exists, its tests still pass, its message is still written — and it stops firing. This is the trap: a cross-check that has been made vacuous looks exactly like a cross-check that is never triggered because nothing is wrong.
- Cause: a check comparing two signals is only worth its code while the two come from different places. `readDirection` compares the direction **word** on the card against the **sign** carried by the owner's direction control; fill that control from the word and both operands trace to one reading. Convenience work is where this happens, because pre-filling a control is exactly the change that looks like it only touches presentation.
- Avoid: before pre-filling any control, ask **what compares against it**. If the answer is "something derived from the same source", either leave it alone or find a genuinely different source — for the card's direction that is the **printed sign**, a separate feature that a single misread cannot corrupt alongside the word. Then assert the source in a test, so re-pointing it at the easy value fails loudly.
- Verify: 2026-08-17 (D-123). `tests/privacy.test.ts` asserts the direction is set from `prefill.amount.value.sign` and never from `picked.direction`, and only when the two agree.

## Cloud Vision's output is not byte-identical between calls, so a harness card count is not a fixed number

- Symptom: the same harness over the same 12 images reports 25 cards one day and 28 the next, with no code change in between.
- Cause: the hosted engine does not guarantee identical output for identical input, and the measurement harness picks a layout by "whichever finds the most cards" — so a handful of words landing differently moves the tie and the total. D-118 already warned that the harness's **per-layout attribution** is an artifact; the **card total** is one too.
- Avoid: quote **ratios** from that harness and not absolute counts, and never compare a count taken on one day against one taken on another as though the difference meant something changed. Where a number must be stable, derive it from something the app controls rather than from what the engine returned.
- Verify: 2026-08-17 (D-123, D-118). 25 cards on 2026-08-16 and 28 on 2026-08-17, same images, same code.

## A source-grep test matches the comment that explains its own rule

- Symptom: a test that forbids a pattern fails on a file that does not use it. The match is inside the comment written to explain why the pattern is forbidden.
- Cause: these tests read a source file as text, and a comment is text. Any rule expressed as a bare word — `tesseract`, `aria-modal` — matches its own documentation, so writing the reason down breaks the check. It reads as a real violation, and the instinct is to delete the comment.
- Avoid: match the **construct**, not the word. `aria-modal=` rather than `aria-modal`; `readSlipWords|slip-ocr-engine` rather than `tesseract`; an import or a call shape rather than a name that could appear in prose. Then say so beside the assertion, or the next person tightens it back.
- Verify: 2026-08-17 (D-125). It happened twice in one day in `tests/privacy.test.ts`, on `tesseract` and then on `aria-modal`.
- **It has now happened four times in that one file, and the fourth was a different mechanism.** The first three were bare words matching prose. The fourth (2026-08-26, D-152) was a pattern matching **the tail of a longer identifier**: a guard listing every `setTyped(` call in the card form matched `resetTyped()` inside a comment naming the helper that value replaced, and reported the comment's own text as an illegal write. A word boundary fixed it — `\bsetTyped\(` does not match inside `resetTyped` — which is the same remedy one level down: the **call**, not a string that a call contains.
- **The fifth (2026-08-26, D-153) shows the remedy is not universal, and reaching for it by reflex is the new mistake.** A comment explaining why a preference is held in a cookie *rather than* browser storage named the storage API, and failed the guard that forbids it across `app/`. The instinct — narrow the pattern to the construct, `localStorage\.` — **would have opened a real bypass**: that API has non-dotted uses (`const s = localStorage`, `window.localStorage`, destructuring), so the bare word is what makes the ban a ban. The prose was reworded instead and the guard left alone. **The rule underneath both cases**: match the construct where the word also names a *concept* people must be able to write about (`aria-modal`, `tesseract`, `scrollIntoView`); keep the bare word where the word **is** the capability and any looser pattern lets it back in. When the two conflict, the prohibition wins and the comment moves — to a file outside the guard's reach, which is where `lib/ui-font.ts` carries the reasoning `app/` may not state.

## A `Proxy` over a `Request` throws on `headers` unless the target is the receiver

- Symptom: wrapping a `Request` in a `Proxy` to observe one method makes the route under test fail with `Cannot read private member #headers from an object whose class did not declare it` — an error that reads as a defect in the route.
- Cause: the default `get` trap forwards `Reflect.get(target, key, receiver)` with the **proxy** as receiver. `Request.headers` is a getter over a private field, and a private field lookup is keyed to the real instance, so running the getter with the proxy as `this` throws. The same holds for `body`, `url` and the other accessors, and for every method unless it is bound.
- Avoid: forward with the **target** as receiver — `Reflect.get(target, key, target)` — and `.bind(target)` anything callable. Or skip the proxy and hand the route a minimal object with just the members it touches.
- Verify: 2026-08-17 (D-125). `tests/notification-card-routes.test.ts` § refuses an oversized upload from its declared length.

## A size bound checked after the body is read bounds nothing

- Symptom: a route carries a `MAX_BYTES` check and a comment about refusing oversized uploads, and the check never prevents one being received — only forwarded.
- Cause: `await request.arrayBuffer()` buffers the whole body before returning, so a `byteLength` test after it runs when the cost has already been paid. The code looks like a guard and reads like one in review, because the constant and the 413 are both right there.
- Avoid: check the declared `Content-Length` **before** reading, and keep the post-read check for the chunked and lying cases. Where neither is enough, stream and count. And make the comment say what the bound actually protects — in this repo it protects the *third party* from the app, not the app from its caller, and the first draft claimed otherwise.
- Verify: 2026-08-17 (D-125). `app/api/v1/notification-cards/read/route.ts` now refuses from the header first, with a test asserting the body was never read.

## A `FileList` is a live view of its input, so resetting the input empties it mid-handler

- Symptom: a multi-file picker silently accepts nothing. Files are chosen, the change handler runs, and the form goes on saying "Choose slip images…" — no error, no console line, nothing to grep for. The handler *looks* correct on the page: it reads `event.target.files`, copies the array, and builds its rows from the copy.
- Cause: `event.target.files` is a **live `FileList`**, a view onto the input rather than a snapshot of it. Anything that sets `input.value = ""` empties it, and clearing the input is exactly what a "start a fresh batch" reset does. So a handler shaped `reset(); const files = [...chosen];` reads zero files from a list that held several a line earlier. The single-file forms in this repo do not have the hazard, and that is what makes it easy to reproduce by copying one: they take `files?.[0]` — a `File` reference, which survives the reset — before their own reset runs.
- Avoid: copy the list out **before** any reset, teardown or state clear: `const files = chosen ? [...chosen] : []` on the first line, then reset. The general rule is the part worth carrying: **a DOM live collection is not an argument, it is a query re-run on every access** — the same applies to `HTMLCollection` and to `NodeList` from `getElementsByTagName`.
- Verify: 2026-08-21 (D-135), found by `tests/e2e/owner-session.spec.ts` § reads many slips at once on its first run. **No unit test could have caught it**: it needs a real `<input type="file">` holding real files, so it exists only in a browser.

## Shipped, tested code with no caller looks identical to code that does not exist

- Symptom: a feature is scoped, and sometimes descoped, around a limitation the repository had already removed. The handoff for bulk slip upload named the date fallback as the thing that made a backlog unfileable — while `readPrintedDate` in `lib/slip-ocr.ts` had read the date printed on a slip since 2026-08-10 (D-086), with 40 tests over it. Nothing in `app/` or `lib/` called it, so it was invisible to every way anyone looks at a working system.
- Cause: a function built ahead of its caller passes the gate, appears in coverage, appears in the decision log as done, and never appears in a stack trace or a diff of the path being reasoned about. Both greps someone actually runs — the failing behaviour, and the module they are editing — miss it.
- Avoid: before scoping around a limitation, grep the repo for the *capability* rather than the defect. `grep -rn "<function>" lib app` returning only its own test file is the signal, and it is worth a moment for any function a `docs/` contract or a decision entry describes as built. The cheaper habit: when a decision records a reader as built, record what calls it — or that nothing does yet, and why.
- Verify: 2026-08-21 (D-135). `grep -rn "readPrintedDate" lib app` returned only `lib/slip-ocr.ts` itself before bulk upload, and the D-086 entry does not say so.

## A token that inverts between colour schemes makes every hardcoded partner a latent failure

- Symptom: a surface is unreadable in exactly one colour scheme — white text on a light fill, or dark text on a dark one — while looking perfect in the other. Nothing in the file draws attention to it, and whichever scheme you develop in is the one that looks right.
- Cause: a rule pairs a **variable** with a **literal** — `background: var(--navy); color: white`. `--navy` is the *text* colour, so it flips from near-black to near-white between schemes while the literal cannot. `app/globals.css` had three: `.skip-link` and `.brand-mark` were white-on-cream in dark, and `.stage-nav li.active span` and `.secondary-button:hover` were white on the brightened action colour at 2.5:1. `.primary-button` had the identical pairing **and** a dark-mode override, which is what made the other two look deliberate.
- Avoid: pair a variable with a variable. `background: var(--navy); color: var(--paper)` is correct in both directions by construction, with no override to keep in step. Where a literal is unavoidable, the test is mechanical: **grep the file for every rule that sets both a `var(--…)` background and a literal colour, and check each one has a dark-mode partner.** An override on one such rule is evidence the author knew, not evidence the others were considered.
- Verify: 2026-08-21 (D-136), all three found while reasoning about every filled surface at once during a palette change — not by looking at the app, which is the point. Neither browser suite's axe check caught them: they run in the default scheme.

## The browser suite that covers the signed-in app is desktop-only, so phone width is unmeasured there

- Symptom: an accessibility or layout question about a phone gets answered from the CSS, because "the browser suite passes" feels like it covers it. It does not, for any surface behind a sign-in.
- Cause: `playwright.isolated.config.ts` has both a `desktop` and a `mobile` project, but it **ignores both owner specs** — so its mobile project only ever sees the signed-out shell. `playwright.owner.config.ts`, which is the one that signs in and drives the ledger, slips and import, declares `projects: [{ name: "desktop" }]` and nothing else. The gap is invisible because the two configs are read separately and each looks complete.
- Avoid: before answering anything about small-screen behaviour, check which config renders the surface and what projects it declares. For a one-off measurement, a throwaway config under `.runtime/` pointing `testDir` at itself is enough — but **set `webServer.cwd`**, because Playwright defaults it to the config file's own directory and `pnpm build` then runs inside `.runtime/` and fails on a module it cannot resolve.
- Verify: 2026-08-21 (D-136). `.runtime/mobile-audit.spec.ts` found a 47px heading floor, four sub-44px tap-target classes and a clipped active-route marker, none of which any passing suite had ever rendered.

## A colour declared outside the stylesheet does not move when the stylesheet does

- Symptom: a phone shows a band of the *previous* palette in the browser's own chrome above the page, while the page itself is correct. On desktop everything looks right, and no screenshot shows it — a headless capture renders the page, never the surrounding browser.
- Cause: `themeColor` in `app/layout.tsx` is a `<meta>` value, not a custom property, so a palette change in `app/globals.css` leaves it behind. It sat at the pre-retheme `#eaf0f4` for a day and across two production deployments. Nothing in this repo's gate reads it: tsc sees a valid string, ESLint sees a valid string, and both browser suites assert on page content.
- Avoid: treat `app/layout.tsx`'s `viewport` export as part of the palette. `themeColor` must equal `--mist`, and `colorScheme` must match what the stylesheet actually declares — the file says so at the declaration. The general rule is the part worth carrying: **grep for colour literals outside the stylesheet before calling a retheme done** — `themeColor`, `public/manifest.webmanifest`, any inline `style`, and any SVG shipped with a fill.
- Verify: 2026-08-21 (D-137), found by reading `app/layout.tsx` for an unrelated reason — and the sweep this entry prescribes then found **three more the same minute**: `public/manifest.webmanifest` carried the old blue-grey as both `background_color` and `theme_color` (the installed-app splash and chrome), and `public/icon.svg` was still a navy plate with blue-grey rules (the app icon and favicon). Four stale colours, none of which any suite, any type-check or any screenshot would ever have reported. `grep -rn "eaf0f4\|1f3d57\|102b46\|1769aa" app public lib` is the check worth repeating.

## An element selector cannot reset a property a class set, and the rule still reads as if it did

- Symptom: a responsive override looks complete and is ignored for the one element it was written for. `table, tbody { display: block; min-width: 0; }` inside a phone media query, with a table that keeps a 1280px minimum width anyway.
- Cause: specificity, not the media query. `table` is 0,0,1 and `.ledger-table { min-width: 1160px }` is 0,1,0, so the class wins wherever both apply — a media query changes **when** a rule is considered, never how strongly it competes. The rule reads as a blanket reset because it names the element every table is, which is exactly what makes it convincing in review. The damage here needed a second rule to become visible: `.table-scroll { overflow: visible }` in the same block removed the scroll container that had been holding the width in, so the overflow escaped to the document and the whole page zoomed out on a real device.
- Avoid: reset at the specificity that set it — name the class, or every class, in the override. When a media block relaxes a container's `overflow`, check what that container was holding: an `overflow-x: auto` on a wrapper is often the only thing standing between a `min-width` and the viewport. And treat `1fr` in a grid as `minmax(auto, 1fr)`: its floor is min-content, so a track holding a `<select>` with a long option will not shrink and the grid overflows instead. Write `minmax(0, 1fr)` when shrinking is the point.
- Verify: 2026-08-21 (D-138), found by the owner on his own phone after a deployment, then red-proved with `.runtime/mobile-audit.spec.ts` reporting `scrollWidth 1296 vs 390` before the fix and 390 after.

## A layout audit against a page that loads nothing measures the absence of the thing it was written for

- Symptom: a measurement harness reports every route clean, and the defect it was written to find is sitting in production. The numbers are not wrong — the page it measured genuinely had no overflow, because it had no content.
- Cause: nothing in this app loads until an action asks it to, so a harness that signs in and reads the DOM sees empty shells. A `min-width` on a table that was never rendered cannot be measured, and an audit reporting "overflow: none" about a page with no table reads exactly like an audit reporting it about a table that fits. **This is worse than a wrong number**, because a wrong number invites a second look and a clean report closes the question.
- Avoid: make the harness **assert the subject exists** before it measures — `expect(page.locator("table")).toHaveCount(1)` — so a run that finds nothing fails instead of passing. Then seed whatever the route needs: for `source_transactions` that means `set session_replication_role = replica` (it is append-only and refuses DELETE), a 64-hex-character `fingerprint`, `fingerprint_version = 'fingerprint-v1'`, and components at `position` 1 or 2. The general form: **an audit's first assertion should be that it is looking at something.**
- Verify: 2026-08-21 (D-138). The previous version of that audit reported four clean routes on the same commit whose ledger table was 1280px wide at 390px; the gap had been named in D-136 and in `PLAN.md` task 28 the day before, and naming it did not stop it.

## A fix guarded on an intermediate stage dies silently when a later feature skips that stage

- Symptom: a defect that was found, fixed and documented comes back on the path most users take, while the fix is still in the file and its test still passes.
- Cause: the fix was guarded on a *waypoint* rather than on the thing it was about. `app/import-bench.tsx` scrolled the owner to the answer only when its stage machine reached `bind`; automatic binding (D-144) took the statement straight to `review`, so the guard was never true on the branch that is on by default. Nothing failed — the guard is a `return`, so skipping it is indistinguishable from not needing it — and the original comment still described a fix that no longer ran. **A new path around a state is the ordinary way features grow**, which is what makes this class recurrent rather than a one-off; it is the same shape as the privacy guard that narrowed in meaning when the behaviour moved to a file it did not name (D-145), one level up.
- Avoid: key an effect on **the outcome it exists to announce**, not on a stage the outcome happens to pass through today. Here that is "a worklist entry produced a binding result", which every branch sets. When a feature adds a route around an existing state, grep for guards naming that state and ask which of them the new route silently skips.
- Verify: 2026-08-25 (D-147). `.runtime/bind-scroll.spec.ts` is red against the stage-keyed guard on both branches and green against the outcome-keyed one; the defect was reported from production by the owner, not by any suite.

## State that marks a mode is only ever set, and the stale mode answers a later action

- Symptom: a confirmation banner names the wrong document — the right row count, account and batch id, attached to a statement worked several minutes earlier.
- Cause: `workingLabel` recorded which worklist entry was being worked and was assigned in exactly one place, never cleared. Confirming a *single* import afterwards still found it non-null, so the code took the "this belongs to the worklist" branch and labelled the confirmation with a name from the previous task. A mode flag with one writer reads as obviously correct in review, because the bug is not in any line that exists — it is in a line that does not. The related state added beside it repeated the mistake within the same change, which is how it was noticed.
- Avoid: when adding state that means "the user is in mode X", write the clearing path in the same commit as the setting path, and give every exit from the mode one helper to call rather than three setters to remember. A useful review question: *what puts this back?* — if the answer is "a page reload", it is this trap.
- **A helper is not the fix, and this trap proved it on itself within one day.** `leaveTheWorklist()` was written as the remedy above and was then called at **two of the four** ways a statement stops being a worklist entry — the file picker and the failed-parse branch were both missed, so choosing an unrelated PDF left the previous statement's binding banner over the controls for this one. One helper to remember is still a thing to remember. **Count the exits before trusting the helper**: grep every assignment of the state, then every place the mode can end, and check the two lists have the same length. The structural answer is for the mode to be *one* value whose absence is the only way to be out of it, so clearing cannot be done by halves — proposed and not built, D-148 § What is deliberately not done.
- **The general answer is that the mode should be one value whose absence is the only way out, and where that is too large a change, the list must be checkable.** Both were done on 2026-08-26 (D-150, D-151). The worklist became one `Worklist | null`, so it cannot be cleared by halves. The *document* being reviewed is still eleven slots cleared by a helper, because grouping it is a much larger change to a path that writes money — so a guard now reads the component and requires **every** `useState` to be either cleared by that helper or named in an allowlist **with a reason**. A twelfth slot that is neither fails the gate. **The failure message is the point**: not "you forgot", but "say which of these two this is".
- Verify: 2026-08-25 (D-147), found by `/code-review`. `leaveTheWorklist()` clears all three, and `.runtime/bind-scroll.spec.ts`'s third test drives a worklist entry then a single import and asserts the banner is gone. **Extended the same day (D-148)** after the two uncalled exits were found by `/thermo-nuclear-code-quality-review`; the picker now clears, which is the one point every single-import path passes through. **Extended again 2026-08-26 (D-151)**: `tests/import-flow.test.ts` holds the accounting guard, proved by injecting a 27th `useState` and watching it fail by name. It found two real omissions when written — `chosenAccountId` and `createAccountError` — and rejected its author's own lazy `"as above"` reason.
