# Private Ledger continuity handoff

Last updated: 2026-08-23.

**Thin entry point.** It carries only what is **mutable and current**: live authorizations, the
destructive-operation state of this machine, and where to start reading. Project state lives in
`PLAN.md` — if you are about to add a status paragraph here, add it there instead. Why the rule is
ownership rather than length: D-052.

**This file was 91 KB in 86 lines until 2026-08-18, and every update had prepended a paragraph
without removing one** (D-130, D-131). The history is in `git log` and `DECISIONS.md`; a third
telling of it here was making the file unreadable and, worse, self-contradictory — three separate
lines each claimed a different migration state, all of them stale. **Rewrite this file in place.
Do not prepend to it.**

## Where to start reading

[SPEC.md](SPEC.md) (scope, invariants, gates) → [PLAN.md](PLAN.md) (checkpoint and next actions) →
[DECISIONS.md](DECISIONS.md) (append-only; indexed at the top, carrying **D-134 onward** in full,
with D-001…D-059 in [docs/decisions/ARCHIVE-D-001-D-059.md](docs/decisions/ARCHIVE-D-001-D-059.md),
D-060…D-113 in [docs/decisions/ARCHIVE-D-060-D-113.md](docs/decisions/ARCHIVE-D-060-D-113.md),
D-114…D-119 in [docs/decisions/ARCHIVE-D-114-D-119.md](docs/decisions/ARCHIVE-D-114-D-119.md),
D-120…D-129 in [docs/decisions/ARCHIVE-D-120-D-129.md](docs/decisions/ARCHIVE-D-120-D-129.md) and
D-130…D-133 in [docs/decisions/ARCHIVE-D-130-D-133.md](docs/decisions/ARCHIVE-D-130-D-133.md);
the index at the top of `DECISIONS.md` covers all six) →
[GOTCHAS.md](GOTCHAS.md) (traps worth reading before touching tests or the database).

Claude Code starts at `CLAUDE.md`; Codex at `AGENTS.md`. Product, design, parser, fixture and
recovery contracts are in `PRODUCT.md`, `DESIGN.md` and `docs/`, including the three per-bank layout
contracts ([Krungthai](docs/KRUNGTHAI_CONTRACT.md), [SCB](docs/SCB_CONTRACT.md),
[KBANK](docs/KBANK_CONTRACT.md)). Local setup and the validation order are in
[docs/LOCAL_DEV.md](docs/LOCAL_DEV.md).

After substantive changes, run `/sync-continuity` to reconcile these docs against verified evidence.

## Read this before running anything destructive

- **The real ledger is the hosted Supabase project** (D-094, 2026-08-11), and the app on Vercel
  serves it. **`private-ledger-live` (5434x) is historical**, frozen on migration 012, and receives
  nothing further.
- **Three local Supabase projects**: `private-ledger-local` (5432x, synthetic and disposable — what
  **every** suite, seed and pgTAP fixture targets), `private-ledger-recovery` (5433x, disposable
  rehearsal destination), and `private-ledger-live` (5434x). See `docs/LOCAL_DEV.md`.
- **`pnpm supabase:reset` cannot be guarded** and destroys whatever project the working directory
  names — the repo root names the test project, `live/` names the real one. Back up through the
  `/recovery` route before anything destructive, and never set `ALLOW_DESTRUCTIVE_TESTS=1` merely to
  get a green run.
- **The trap is `.env.local`, not the test database.** `NEXT_PUBLIC_*` are inlined at build time, so
  a browser config that runs `pnpm build` without pinning its target builds against whatever that
  file names. Since D-058 the CSP is inlined from the same variable, so a mis-pin also serves a
  `connect-src` naming the wrong project. All three Playwright configs pin, but `playwright.config.ts`
  is local-only, so a fresh clone does not. GOTCHAS carries the variable list and the Windows
  `$env:VAR = ""` deletion trap that makes a pin look broken.
- **Never inspect `private-statements/`, `.env*`, or backup files.** Preserve the exact-money,
  currency, idempotency, append-only, audit and least-privilege invariants, and do not weaken the CSP.

## Standing authorizations and their conditions

Mutable by nature — granted, spent, re-granted — which is why they live here and not in append-only
`DECISIONS.md`. **Nothing here is inherited by a new session. Ask again.**

- **Importing a real statement: never standing, ask every time.** All fifteen statements are in; the
  next import is a new statement and needs a new ask. The first one silently turned `pnpm test` into
  a destructive command and the fix took a whole second project (D-048) — assume the next creates a
  hazard nobody has thought of yet.
- **Passwords: never, under any authorization.** Not in chat, not in a repo file, not as a CLI
  argument. Statement passwords derive from the owner's date of birth and citizen ID, so they are
  identity-grade and non-rotatable. The harnesses read stdin only.
- **Reading `private-statements/`: never.** What is open, under D-049, is `shared-statements/` —
  password-free copies the owner made with `scripts/repassword-pdfs.py`. Scope is **statement
  contents only**: not passwords, keys, `.env*`, backups or the citizen ID. Subagents stay closed;
  reads route through the parent. Masked dumps are the first resort.
- **Reading `receipts_sample/`, including `line/`: granted per session, never standing.** Exercised
  many times, always through throwaway harnesses under `.runtime/` that print counts and refusal
  codes only. **Nothing observed has ever become a fixture, a doc line, a commit or a quotation** —
  every figure in these documents is a count or a percentage, and that is the rule rather than a
  habit (D-060 is that mistake, already made once and permanent because this repo pushes to GitHub).
- **Real-PDF smoke tests: conditions unchanged since 2026-07-25.** The owner types the document
  password interactively; nothing is logged, retained or committed. Requires the owner present, so
  it cannot run unattended.
- **Commit and push: granted per session and spent.** Every push to `main` **is a production
  deployment** — see below. Read `git status -sb` and `git log` rather than trusting any sentence
  here. Committed straight to `main`, matching this repo's history; nobody has asked for a
  branch-and-PR flow, so raise it rather than assume it.
- **Creating or destroying any hosted resource: never delegable ahead of time.** The Google client,
  the hosted Supabase project, the Vercel project, the Google Cloud project and the Vision key were
  each asked for and granted separately, and each grant is spent. **Any further hosted resource —
  another project, a custom domain, a second region, any new external service — needs explicit
  approval at the time.**
- **`supabase db push`: its own ask, and a fresh backup verified from the database first.** The
  repository stays linked to the hosted project; that link is standing, the push is not.

## State of the machine

Every line here is a **reading**, not a fact. Re-take it rather than trusting it.

- **2026-08-21 pushed three times, and each push is a production deployment**: bulk slip upload
  (`7be667e`, D-135), the warm palette with the phone measurement (`76dc46b`, D-136), and cornsilk
  as the ground with the dark scheme dropped (`8319d5d`, D-137). A fourth is the phone-overflow fix
  (`558435e`, D-138), and 2026-08-22 adds the card banner pointer (D-139). **Read `git log` and `git status -sb` rather than trusting this** — a hash typed
  before the commit that produces it is the exact class of stale line commit `a2efdc7` was about.
- **The owner verifies a deployment in the dashboard; nothing here can.** `76dc46b` shipped a
  palette that reached every screen, and the defect D-138 fixes was found **by him on his own phone
  minutes later**, not by any suite. Treat "the build went Ready" as saying nothing about whether
  the page is usable.
- **The app is on a warm palette as of 2026-08-21** (D-136, amended the same day by D-137): Olive
  Leaf, Black Forest, Cornsilk, Light Caramel, Copper, chosen by the owner. **Cornsilk `#FEFAE0` is
  the ground itself**, with surfaces lifting toward a warm white above it.
- **There is no dark scheme, and that is a decision with the owner's own qualifier on it** (D-137):
  he said *"but we'll see"*. The cost is a bright page on a dark-OS phone at night and **nobody has
  tried that** — so treat it as a position taken, not a settled one. `color-scheme: light` in
  `:root` and `app/layout.tsx` is what makes native date pickers and selects obey it.
- **Four colour literals live outside the stylesheet and none of them is in the gate**:
  `themeColor` in `app/layout.tsx`, `background_color` and `theme_color` in
  `public/manifest.webmanifest`, and the two fills in `public/icon.svg`. **All four were stale for a
  day and across two production deployments** after the palette changed. `grep -rn "eaf0f4\|1f3d57"
  app public lib` is the sweep; it is in `GOTCHAS.md` as its own trap.
- Phone width was measured for the first time behind a sign-in (`.runtime/mobile-audit.spec.ts`,
  throwaway and gitignored); the first pass of PLAN task 28 is applied and the remainder is there.
- **The archive rate is the thing to watch, and it is faster than "roughly a fortnight".**
  `DECISIONS.md` went 72% (2026-08-19) → 93% (2026-08-22) → **56% after the fourth boundary**
  (D-140, 2026-08-23) → **89% by the end of that same day**, on five entries. **The raise precedent
  is `GOTCHAS.md`'s alone**: that file is entered through an index rather than read front-to-back,
  which is not true here, so this one is archived instead.
- **The ledger table overflowed a real phone and no suite could see it** (D-138). The audit now seeds
  rows and asserts a table is present before measuring. **Two surfaces are still unmeasured with
  records in them** — the captured-slips list and the batch worklist — because the audit only clicks
  what a button offers and those need records created first.
- **The statement mailbox is live and its credentials are the owner's alone.** A dedicated Gmail with 2FA, an IMAP app password in Bitwarden, and a Gmail filter forwarding three senders. `statement-mailbox.json` at the repo root names the mailbox and the senders — gitignored, no secret in it, but it names an address, so **do not quote it into any document or commit**. **The app password is read from stdin only** by `scripts/fetch-statements.mjs` and has never been in a file, an argument or an environment variable there. `private-statements/inbox/` is where the fetcher writes and is inside the never-read boundary.
- **D-017 is superseded on binding.** A statement whose printed bank and last four resolve to exactly one account is now bound without asking, by default, with a switch in the batch section. **The review and the confirmation are untouched** — a browser test asserts `import_batches` stays at zero after an automatic bind.
- **Four pushes on 2026-08-23, all deployed and none verified in the dashboard by an agent**: `6a6f752` (bulk statement import, D-141), `7f7aa65` (the slip-form review fixes, D-142), `617c2c8` (the tertiary button rank, D-143) and `63b5d24` (the mail fetcher and automatic binding, D-144). **The owner verifies a deployment; nothing here can.**
- **THE HOSTED SYNC BUTTON IS BUILT AND UNCOMMITTED** (D-145, PLAN task 41), and **it does nothing in production until a credential reaches Vercel**. New: `lib/statement-sync.ts`, `lib/server/statement-mailbox-session.ts`, `app/api/v1/imports/mailbox/route.ts`, `app/api/v1/imports/mailbox/attachment/route.ts`, `app/statement-sync.tsx`, `tests/statement-sync.test.ts`. Changed: `app/statement-batch.tsx`, `app/globals.css`, `tests/privacy.test.ts`, `PLAN.md`, `DECISIONS.md`, `GOTCHAS.md`, this file. **The lockfile moved**: `imapflow` went from a devDependency to a dependency, because shipped server code now imports it — read from the build artifact as **one server chunk and zero client chunks**. **Two new routes: twenty `/api/v1/` routes, not eighteen.** No SQL, no contract change, every project still on 020, backup contract still v7.
- **What the Sync button needs that does not exist, and none of it is grantable by an agent.** The three variables are `STATEMENT_MAILBOX_USER`, `STATEMENT_MAILBOX_SENDERS` and `STATEMENT_MAILBOX_APP_PASSWORD`; **putting the app password into Vercel is a hosted-resource change needing a fresh ask**, and the password itself is read by the owner and must never be requested. **`/security-review` is owed** — a new route, a stored credential and a mailbox read. And committing is deploying. **Until the variables are set both routes answer 503 with a sentence naming what is unset**, which is proved in a browser against the real route.
- **`statement-mailbox.json` is gitignored and therefore does not exist in a deployment.** That is why the hosted side reads the same two facts from the environment instead. The variable names are deliberately **not** in `.env.example`, which is inside the never-read boundary and is the owner's to edit.
- **The document password still never leaves the device, and that is asserted rather than intended.** It is not a parameter of either mailbox route, the deployment does not hold it, and `app/statement-sync.tsx` has no prop, state or field that could carry one. What the routes move is the bank's own ciphertext.
- **A privacy guard narrowed in meaning without failing, and it is now said out loud** (D-145). `tests/privacy.test.ts` asserts `app/statement-batch.tsx` constructs no request of any kind; the sync fetch lives in a **separate component** so that stays literally true, and a second guard covers the new one. **The old guard's comment now states what it still means and what it no longer means on its own.** Two new `GOTCHAS.md` traps came out of this, plus one about Playwright route globs.
- **The next actions are the owner's, not an agent's.** Task 41 is built and every remaining step needs him: run `/security-review` over the two new routes, decide whether the app password goes into Vercel, and authorize the commit-and-push that is also a production deployment. **Nothing after that is blocked on code.**
- **The fifth archive boundary was taken on 2026-08-24 and is deliberately shallow** (D-146). `DECISIONS.md` went 94% → **82%** by moving **D-130 … D-133** to `docs/decisions/ARCHIVE-D-130-D-133.md`. **It could not go deeper without breaking D-133's own rule**: D-134 and D-137 sit immediately behind the boundary holding questions that have not closed — whether `GOTCHAS.md` splits at its next breach, and whether this app really has no dark scheme (*"but we'll see"*). **Closing those two is what buys the sixth boundary its depth**, and both are the owner's calls. `GOTCHAS.md` is at 79% and its next breach is owed a **split** along its section headings, not a third raise.
- **`.runtime/mailbox-sync.spec.ts` is 6 tests** (throwaway, gitignored) and is the only browser proof this feature has. It drives the unconfigured path through the **real** route, the download path with both routes intercepted and synthetic bytes, a failed download landing as one line, and the band at 390px. **The mailbox itself was never contacted by anything this session** — no IMAP connection was made, and the route has never spoken to a real server.
- **`/code-review` ran against the Sync button on 2026-08-24 and is discharged** (D-145). **Eleven findings; ten real and fixed, one declined**, the declined one being `playwright.config.ts`'s missing `webServer.timeout` — correct, but that file is the owner's local-only copy and the hazard is already below. **Two were serious and shared a shape: a limit applied after the cost rather than before it** — a batch of unread synced files had no way to be cleared, and the route walked every matching message before applying its own cap. **The agent died once on a session limit before reading the diff**; a failed review is not a passed one, and it was re-run. Two regression tests were added and both fail against the pre-fix code.
- **`/code-review` is no longer owed on anything else.** It ran twice on 2026-08-23: against the uncommitted statement-batch work before `6a6f752`, and against `7be667e`'s files **by path**, which is how a committed commit gets reviewed now that a bare SHA is not one of the skill's documented targets. **The path form found more** — eight findings against shipped code versus five against that day's new work, which is the concrete cost D-125 was written about.
- **Phone width is measured for BOTH batch worklists as of 2026-08-23**, by the throwaway `.runtime/worklist-phone-audit.spec.ts`. It signs in at 390px, feeds synthetic files through each form, **asserts rows are on the page**, and only then measures — the D-138 lesson, since an audit that walks routes cannot see a list that does not exist until files are read. **The statement worklist is clean.** **Both worklists now report every tap target at 44px or more**, after D-143 gave the app a `.tertiary-button` rank and corrected `.batch-fix input` from 42px to the 47px every other control uses. **The 44px threshold is still the audit's own and nothing in the gate enforces it** — PLAN task 28 remains unscoped, and D-143 aligned the stylesheet with itself rather than adopting a standard.
- **The gap that remains: no *committed* spec drives the statement batch form.** Its worklist is proven by unit tests and by a throwaway. The bulk *slip* worklist does have committed browser coverage, in `owner-session.spec.ts`.
- **Bulk slip upload (D-135) shipped as `7be667e` and is deployed**, on the owner's explicit
  authorization, 14 files. **The palette and the phone pass (D-136) are NOT committed** — the theme
  was asked for, committing it was not. Uncommitted: `app/globals.css`, the four continuity docs, and
  the throwaway `.runtime/` audit, which is gitignored and belongs to nobody. **`git status --short`
  will show that alongside the two local-only config files**, and the rule for telling them apart is
  the next bullet.
- **`/code-review` was not run before `7be667e`.** It is user-triggered and an agent cannot invoke
  it, so the commit went in on the gate plus a self-review. D-125 exists because that shortcut was
  taken five times in one day; running it against that hash is still owed.
- **`eslint.config.mjs` and `playwright.config.ts` are deliberately local-only and are never
  committed.** `git status --short` is what tells them apart from ordinary uncommitted work.
  `playwright.owner.config.ts` and `playwright.isolated.config.ts` **are** committed — only the bare
  `playwright.config.ts` is local-only, and it will time out before running a single test because it
  sets no `webServer.timeout` for a cold `pnpm build && pnpm start`. Fix it by hand or use the
  isolated config, which `docs/LOCAL_DEV.md` recommends anyway.
- **Every project is on migration 020, the hosted one included, verified against the remote**
  (D-126, 2026-08-18). All twenty match local and remote. `private-ledger-live` stays frozen on 012.
  **The backup contract is v7**, and `restore_backup` still accepts v2 onward.
- **The owner's backup was verified FROM THE DATABASE before and after the 020 push**: sequence
  **33**, last-exported **33**, equal both times, with 5 `backup_records` rows and the newest at 33.
  **It goes stale the moment a card, slip, cash entry or decision is written**, and he uses the app
  daily — **assume stale and re-read.** The hosted ledger held **7 cards** at that reading.
- **The Vercel project deploys on every push to `main`** (D-109, verified in the dashboard).
  Treat `git push origin main` as a deployment, including for a documentation-only commit. Remedy if
  it slips is **Instant Rollback in the dashboard, not a revert push**, which would be another
  deployment. Read the Overview panel's Production Deployment block, never the deployment list.
- **The deployment's configuration**: three environment variables plus `ENABLE_EXPERIMENTAL_COREPACK`,
  and **`SUPABASE_SERVICE_ROLE_KEY` is deliberately not among them** — nothing here reads it and it
  bypasses RLS, so `.env.example` must never be copied wholesale. The Supabase redirect allowlist
  names exactly one production callback and no wildcard, so preview deployments cannot complete a
  sign-in; that is intended. The two `NEXT_PUBLIC_*` values are inlined at build time, so changing
  either needs a rebuild rather than a redeploy. **D-145 would add three more and has not**:
  `STATEMENT_MAILBOX_USER`, `STATEMENT_MAILBOX_SENDERS` and `STATEMENT_MAILBOX_APP_PASSWORD` are the
  Sync button's, the last is a credential at a third party, and **setting them is a hosted-resource
  change needing a fresh ask**. Read the dashboard rather than this line for what is actually set.
- **`GOOGLE_VISION_KEY` lives in the owner's Windows user environment**, not in this repository, not
  in any file, not in any transcript. Read it with
  `[Environment]::GetEnvironmentVariable("GOOGLE_VISION_KEY","User")`, never print it, and report
  only its length (39) if presence must be proven. **Shells spawned by tools do not inherit it — but
  `next start` does**, which is how a browser spec made a real Vision call on 2026-08-18 (D-129).
  Both committed Playwright configs now pin it empty.
- **Three capture surfaces now call Google Cloud Vision** through `POST /api/v1/ocr/read` — the card
  form, the single-slip form and bulk slip upload (D-120, D-129, D-135). **The batch is the one that
  can spend without anyone watching**: one read per slip, up to fifty per batch, so a mistaken drop
  of a camera roll is a real bill. That cap is in `app/slip-batch.tsx` and is the only thing bounding
  it. Nothing is sent until the owner presses **Read these slips**.
  **Statement import is still the only path that *reads* entirely on the device, and as of D-145
  that sentence needs its verb read carefully.** The hosted Sync button proxies the locked PDFs
  through this app's own server — ciphertext it cannot open — and every bit of the *reading* still
  happens in the pdf.js worker on the device, with a password the server never sees. The Vision key
  never reaches the browser and **the CSP is unchanged**: proxying same-origin is what avoided
  widening `connect-src` to call Gmail directly (D-058).
- **Gate, all green 2026-08-23 over the uncommitted Sync button** (D-145): Vitest **696 passed /
  7 skipped across 34 files**, Playwright owner **31/31** and isolated **18/18**, throwaway
  `.runtime/mailbox-sync.spec.ts` **6/6**, production build clean at **twenty** `/api/v1/` routes,
  `pnpm check:docs --strict` at **145 decisions, 144 traps**, tsc and ESLint clean. **pgTAP was not
  re-run and that is deliberate** — it stands at **266 across 8** from 2026-08-18 and nothing since
  has moved SQL. **Read the skip count, not the total**: it is still 7, and a stopped Docker would
  turn the database-backed suites into skips while leaving the totals looking the same.
- **Docker had to be started by hand at the beginning of 2026-08-21's session**, and a full Vitest
  run launched while it was still coming up reported **9 failures in `tests/slip-match-route.test.ts`
  that were purely the race** — every one passed on an immediate re-run against a settled database.
  Worth knowing before diagnosing anything: check `docker ps` first, and re-run once before
  believing a database-backed failure.
- **The 2026-08-18 TOTP flake has not recurred** in any run since. `owner-access.spec.ts`'s
  returning-owner challenge failed once that day and passed on an immediate re-run. Still
  undiagnosed, now unreproduced across several full owner runs.
- **Both budgets are handled by different means on purpose, and `DECISIONS.md` has now been archived
  twice in five days.** It is **62 KB/117 KB (53%)** after **D-120 … D-129** moved to
  `docs/decisions/ARCHIVE-D-120-D-129.md` on 2026-08-23 (D-140), from 93% the day before; the
  previous boundary took D-114 … D-119 at 90% (D-133). **The rate is the thing to watch** — four
  days of ordinary work took it 72% → 93%, so expect to take a boundary roughly every fortnight at
  this pace rather than treating each one as an event.
  `GOTCHAS.md` is **177 KB/254 KB (70%)** because its budget was **raised** from 195 KB on the
  owner's decision (D-134) — retirement had been applied first and moved it only 181 → 177 KB, which
  is the honest ceiling on that remedy since a trap is retired only when its *subject* is gone.
  **The next `GOTCHAS.md` breach is owed a split along its eight section headings, not a third
  raise.** That condition is in `check-docs.mjs` beside the constant and in the failure message.
- **`.next` rests on the synthetic project, and "unpinned" no longer means "live-targeted".**
  `.env.local` names `private-ledger-local`, so an unpinned `pnpm build` aims there. The old phrasing
  was written when `private-ledger-live` was the ledger, and it has not been since 2026-08-11
  (D-094). **Confirm from the artifact rather than the file**: grep `.next/server` and expect four
  chunks carrying `127.0.0.1:54321` and none carrying the hosted ref or `54341`. Any `.supabase.co`
  match is a library's own wildcard hostname list, not a build target. Re-confirmed 2026-08-18 after
  `rm -rf .next` and a rebuild. `PLAN.md` carries the reasoning.
- **No app server is running.** Both browser suites start and stop their own on ports 3100 and 3200
  and never reuse a server.
- **`public/zxing_reader.wasm` is generated, not committed** — `prebuild` copies it from
  `node_modules`, so a checkout that has been installed but never built has a slip capture that
  silently decodes nothing (D-057).
- **The recovery destination is a second Supabase project** and may be left stopped.
  `node scripts/recovery-destination.mjs up` starts and migrates it, `down` discards it. It receives
  no migration automatically — run `up` again after adding one, or the portability test fails on a
  missing relation rather than on anything real. `tests/recovery-portability.test.ts` **skips**
  without it and the Vitest totals read the same either way, so **read its named lines, never the
  totals**. **It is up and on migration 020 as of 2026-08-21**, read from
  `supabase_migrations.schema_migrations` in its own container, and its four named lines passed that
  day — which retires the earlier note that it was stale at 017. The fifth test is the "not
  verified" placeholder and **skips when the destination is up**, so a run where that one *reports*
  is the run that proved nothing.

## Live hazards on this machine

- **The local-only `playwright.config.ts` does not pin `GOOGLE_VISION_KEY`, and on this machine it
  runs a real build.** Found by the 2026-08-19 security review. The **committed** copy runs
  `pnpm dev`, which never hydrates under the strict CSP, so its tests cannot really execute — but
  the **working copy** runs `pnpm build && pnpm start`, which they do (GOTCHAS records this reversal
  for a different trap). It has no `testIgnore`, so it collects `owner-session.spec.ts` including
  the reader spec, and it pins three environment variables while `next start` inherits the real
  Vision key from the Windows user environment. **That is the 2026-08-18 incident still reachable.**
  Both sibling configs pin the key empty; this one is the owner's file and was left alone. One line
  in its `env` block closes it.
- **Windows had reserved the whole local Supabase port block, and the fix is now permanent, 2026-08-23.** A dynamic WinNAT reservation over `54243-54342` covered `private-ledger-local` entirely, so Docker started every container and published none of their ports — all ten read `Up (healthy)` while nothing answered on 54321, and `docker restart` could not touch it. **The owner cleared it in an elevated shell** (`net stop winnat`, then `netsh int ipv4 add excludedportrange protocol=tcp startport=54320 numberofports=30 store=persistent`, then `net start winnat`), and `netsh interface ipv4 show excludedportrange protocol=tcp` now shows `54320  54349` as an administered exclusion covering all three projects. **That should stop it recurring**, but the reservation is machine state and nothing in the repository enforces it — if the symptom returns, check `netsh` before suspecting anything that changed. Full trap in `GOTCHAS.md`.
- **Docker Desktop stops often.** It went down twice on 2026-08-18 alone. **A stopped Docker makes
  the database-backed suites SKIP rather than fail, and the totals read identically** — read the
  word, not the colour, and run `docker ps` before trusting any database-backed row. **A stack that
  is up but unreachable is worse**: the suites *fail* with `ECONNREFUSED` instead of skipping, which
  is the port trap above and not a defect in whatever was just changed.
- **Restarting the database container is not enough.** After `supabase db reset` or a `docker restart`
  of a `supabase_db_…` container, restart that project's `auth`, `rest`, `realtime`, `storage`,
  `pg_meta` and `kong` containers too. They stay `(healthy)` while holding dead connections, and
  `pg_isready` says `rejecting connections` in the meantime.
- **Editing `pnpm-workspace.yaml` makes every `pnpm <script>` want to purge `node_modules`**, and in
  the browser suites the only symptom is `Process from config.webServer was not able to start`.
  `pnpm install --frozen-lockfile --offline --store-dir ".pnpm-store"` clears it. **Never set
  `confirmModulesPurge=false`** to silence it — that turns an abort into a silent deletion of a
  working offline install (GOTCHAS).
- **`check:docs --strict` must be run as its own command.** Piping through `tail` makes `&&` guard
  `tail`'s exit code.
- **`.runtime/card-ocr-readings.tsv` holds real financial values.** Gitignored, never committed, and
  **the owner's to mark or delete** — marking each row against the card is the only way to establish
  whether an *accepted* pre-filled figure was correct, which is the one number D-112 and D-113 could
  not produce. `card-ocr-accuracy.harness.ts` and `vitest.harness.config.ts` sit beside it and are
  throwaway.
- **Always name the harness file** when running `--config .runtime/vitest.harness.config.ts`, or
  every `*.harness.ts` under `.runtime/` runs and overwrites that readings file.
- **The test project is empty after every browser-gate run.** `tests/e2e/owner-session.spec.ts`
  deletes the seeded owner's slips, transactions, batches and artifacts in `beforeEach` and
  `afterAll`, so anything captured by hand there is inside the blast radius. Re-create it afterwards.
- **`shared-statements/` holds 16 password-free files** and `receipts_sample/` holds 23 real slips,
  both gitignored working material. **All fifteen statements are imported, so both have served their
  purpose**; deleting them is the owner's call and has not been made.

## Protocol that must keep holding

- **Value-free writing.** Counts, percentages, field names, label wordings and date *distances* are
  reportable. Amounts, balances, dates, names, counterparties, account numbers and slip references
  are not. Reading a real value never licenses writing one into a fixture, a doc, a commit or a
  screenshot.
- **An agent must not score its own OCR against its own OCR.** Stability is not accuracy.
- **Measure the shipped function, not a copy of its arithmetic.**
- **When a measurement contradicts a conclusion, the measurement wins.** D-127 reversed D-121 and
  D-128 reversed the estimate in task 36, both on the same day.
- **Reproduce before diagnosing**, and check the instrument before quoting its output.
- **The database is the only authority on what is granted; the dashboard is the only authority on
  what is deployed.** A backup reported by the owner is verified from the database before any push.
- **An agent cannot widen its own permissions.**
- **Review before asking to commit.** D-125 records five commits shipped in one day without one as a
  process failure — a green gate proves the *old* paths still work and says nothing about a path that
  did not exist that morning.
