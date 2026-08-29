# Private Ledger continuity handoff

Last updated: 2026-08-28.

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
[DECISIONS.md](DECISIONS.md) (append-only; indexed at the top, carrying **D-141, D-153, D-158, D-161 and D-164 onward** in full,
with D-001…D-059 in [docs/decisions/ARCHIVE-D-001-D-059.md](docs/decisions/ARCHIVE-D-001-D-059.md),
D-060…D-113 in [docs/decisions/ARCHIVE-D-060-D-113.md](docs/decisions/ARCHIVE-D-060-D-113.md),
D-114…D-119 in [docs/decisions/ARCHIVE-D-114-D-119.md](docs/decisions/ARCHIVE-D-114-D-119.md),
D-120…D-129 in [docs/decisions/ARCHIVE-D-120-D-129.md](docs/decisions/ARCHIVE-D-120-D-129.md),
D-130…D-133 in [docs/decisions/ARCHIVE-D-130-D-133.md](docs/decisions/ARCHIVE-D-130-D-133.md),
D-134…D-140 in [docs/decisions/ARCHIVE-D-134-D-140.md](docs/decisions/ARCHIVE-D-134-D-140.md),
D-142…D-152 in [docs/decisions/ARCHIVE-D-142-D-152.md](docs/decisions/ARCHIVE-D-142-D-152.md),
D-154…D-156 in [docs/decisions/ARCHIVE-D-154-D-156.md](docs/decisions/ARCHIVE-D-154-D-156.md) and
D-157…D-163 **without D-158 and D-161** in [docs/decisions/ARCHIVE-D-157-D-163.md](docs/decisions/ARCHIVE-D-157-D-163.md);
**the four gaps are the rule, not an accident** — a boundary excludes every open question and steps
over one rather than stopping short (D-133, D-154, D-164, D-167). What is left in the maintained file
is exactly the questions nobody has closed: the mailbox archive (D-141), the default typeface
(D-153), `list_match_candidates`' unbounded scan (D-158) and the statistics filters (D-161);
the index at the top of `DECISIONS.md` covers all ten) →
[GOTCHAS.md](GOTCHAS.md) (**the index to the traps; their bodies are in `docs/gotchas/`, one file
per section, since D-149** — read the index, then open the one section that applies).

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
- **Commit and push: GRANTED and SPENT, 2026-08-27.** The owner authorized the commit first and the
  push **separately, one turn later** — which is the distinction worth preserving, because a commit
  is local and reversible while **a push to `main` is a production deployment** whose only remedy is
  Instant Rollback in the dashboard rather than a revert push. `/code-review high` ran before the
  ask and found four defects, all fixed (D-125, six for six). **Spent on `777e61a..de4acbb`**:
  three commits — `17a93ca` (tasks 48 and 49), `dd64051` (the eighth and ninth archive boundaries
  and the continuity sync) and `de4acbb` (the review fix and what the real deployment corrected).
  **The grant does not survive this session, and it never reached `supabase db push`** — no
  migration was written, so nothing needed one.
  Spent history, for the record: 2026-08-27 granted four times and used for thirteen commits
  across several pushes — `5418ba2`, `a462a81`, `cbf1c58`, then `758efe6`, `6a8399b`, `9ce1f06`,
  `d61485c`, `451b6ae`, `571d628`, `777e61a`; 2026-08-26 granted once and used four times
  (`f46ee64`, `b4bc6be`, `d7411b3`, `fda6c60`).
- **Building PLAN tasks 48 and 49: GRANTED, SPENT, and now SHIPPED, 2026-08-27** (D-165, D-166).
  The build grant covered running locally only; the commit and the push were asked for separately
  and given. Task 48 put the `include_in_reporting` control in the ledger's Status cell; task 49
  measured the typeface question, **did not** build the vertical-metric pins the task prescribed
  because the measurement said they pin nothing, and fixed the one real reflow instead. **Both are
  deployed and the first was verified in the running app.** A further change to either needs a
  fresh ask.
- **Taking the `DECISIONS.md` archive boundary: GRANTED and SPENT, 2026-08-27** (D-164). The eighth
  boundary moved D-154 … D-156 (97% → 85%); the review write-ups then put it back to **96%** the
  same afternoon, and the **ninth** moved D-157, D-159, D-160, D-162 and D-163 — stepping over D-158
  and D-161, both still open — for **96% → 73%** (D-167). Task 49 closing D-157 is what bought the
  depth, exactly as D-164 predicted. **The rate is the thing to watch**: two boundaries in one day.
- **Building PLAN tasks 46 and 47: NOT GRANTED.** Scoped and discussed; the owner has not said to
  start them.
- **Task 45's build grant is DISCHARGED, 2026-08-27.** It covered building and running locally and
  nothing else. Migration 021 has since been superseded by 022 and 023, and **every project is on
  023 except `private-ledger-live`, which stays frozen on 012** — applied to hosted by the owner's
  own `supabase db push --linked` on 2026-08-27 and read back from hosted afterwards.
- **The backup was VERIFIED FROM THE DATABASE on 2026-08-27**, not taken on the owner's word: a
  public `inet_server_addr()`, sequence **37 / last_exported_sequence 37**, backup record at 37 from
  **2026-08-27 01:36 UTC**. Migration 023 changed schema and no owner data, so nothing staled it —
  sequence and row count were identical afterwards. **The next migration needs its own reading**;
  D-152's rule stands and a claim is not a measurement.
- **The deployed ledger was looked at by the owner and found three things the gate could not**
  (D-159): the first load fetches **297 rows, not 100**, because paging is per account and three
  accounts hold rows; the **Load older rows control rendered as prose** for want of a class; and the
  **all-accounts column was blank on every visible row**, because D-158's floor is set by the largest
  account. All three are fixed, the third by moving the derivation into SQL (migration 022).
  **This is the second time in two days that looking at the real deployment found what a green gate
  could not.**
- **Both reviews have run and their findings are fixed.** `/security-review` found nothing, checked
  against live `pg_proc` rather than the migration text. `/code-review` at high effort found nine and
  **six were fixed**, the serious one being that the *merged* combined balance was wrong under uneven
  window depths — see D-158, and note it is the second time a scoping assumption about that column
  has bitten. Three findings were recorded rather than built; the unbounded candidate scan is
  documented in the migration instead of being claimed away. **Previously:** Every push to `main` **is a production
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

**This section was 71 bullets over 300 lines until 2026-08-28**, most of them dated deployment and
gate records from five separate days. That is D-130 and D-131's defect returned to the file whose
own preamble says *rewrite this file in place, do not prepend to it* — and it had gone actively
wrong, not merely long: one bullet still announced PLAN tasks 48 and 49 as *authorized and
unstarted* after both had shipped, which would have sent a fresh session to rebuild finished work.
**What is below is only what is current and homeless.** Every deployment record, gate result and
migration history that was here lives in `git log` and `DECISIONS.md`, which is where it belongs.

### Where the code is

- **`main` is at `de4acbb` and `origin/main` matches it.** Three commits went out on 2026-08-27:
  `17a93ca` (PLAN tasks 48 and 49), `dd64051` (the eighth and ninth archive boundaries) and
  `de4acbb` (the review fix and the deployment findings). **All three are deployed.**
- **The working tree holds only `eslint.config.mjs` and `playwright.config.ts`**, which are the two
  deliberately local-only files and **must never be committed**. `git status --short` is what tells
  them apart from ordinary work. Nothing else is uncommitted.
- **The most recent deployment was verified in the running app, not in the dashboard** — the
  exclude control exercised on a real internal transfer, `/statistics` read back, the round trip
  returning every figure to its start, and the database showing the audit trail. Driven through the
  owner's **own signed-in browser session**; **no credential was handled** and that boundary did not
  move. **Neither page has been seen on a real phone**, which is the reading still owed.

### Where the database is

- **Every project is on migration 023 except `private-ledger-live`, which stays frozen on 012.**
  Read back from hosted after the owner's own `db push`: head `202608270023`, 23 applied,
  `public.ledger_statistics` executable by `authenticated` and not by `anon`,
  `private.reportable_movements` executable by nobody. Backup contract **unchanged at v7**.
- **The backup was verified FROM THE DATABASE on 2026-08-27**, not taken on the owner's word: a
  public `inet_server_addr()`, sequence **37 / last_exported_sequence 37**, a backup record at 37.
  **The next migration needs its own reading** — D-152's rule, and a claim is not a measurement.
- **The real ledger holds 1,604 transactions across 3 accounts.** `transaction_overlays` held
  **zero rows** until 2026-08-27 and now holds **one**, at revision 2 with the flag back to true and
  every other field null — the exclude/include round trip, with two entries each in
  `overlay_revisions` and `audit_events`. **No row is currently out of reporting.**
- **Roughly 18 rows are genuine internal transfers, not the 248 that carry a transfer label.** Most
  transfer-labelled rows name other people and are ordinary spending. That correction is in `PLAN.md`
  task 48 and it matters, because the larger number was briefly used to argue a feature was urgent.

### The gate, as last run

- **Green on `de4acbb`**: Vitest **873 passed / 7 skipped across 41 files**; Playwright owner
  **33/33**, isolated **38 passed / 4 skipped**; `tsc`, `pnpm exec eslint .` and
  `check:docs --strict` clean at **167 decisions and 184 traps**; production build clean at
  **twenty-three** `/api/v1/` routes. **pgTAP was deliberately not re-run — no SQL has moved since
  migration 023**, which the owner applied himself.
- **`DECISIONS.md` is at 73% after two boundaries in one day.** `docs/gotchas/app.md` is at 79% and
  is the next file to watch.

### Machine facts that have no other home

- **The Vercel project deploys on every push to `main`** (D-109, confirmed in the dashboard). The
  remedy for a bad one is **Instant Rollback in the dashboard**, never a revert push.
- **The owner verifies a deployment; an agent can only read the running app** — and now can do even
  that only when the owner grants a browser session. A Ready badge is not a working page: `76dc46b`
  reached Ready and shipped a defect the owner found on his own phone minutes later (D-138).
- **A relative timestamp in the Vercel dashboard is not a reading of when a push happened.** One
  displayed as *7h ago* seconds after it landed, which is the UTC-against-UTC+7 signature. **Trust
  the commit hash, never the elapsed time.**
- **`GOOGLE_VISION_KEY` lives in the owner's Windows user environment**, not in this repository and
  not in any file here — so `next start` inherits it on this machine, and a browser config that does
  not pin it empty can make a real, billable call. Every throwaway config pins it to `""`.
- **The statement mailbox credentials are the owner's alone**: a dedicated Gmail with 2FA and an
  IMAP app password in his password manager. `statement-mailbox.json` is gitignored, holds no
  secret, but **names an address — do not quote it into any document or commit**. The app password
  is read from stdin only.
- **No app server is running.** Both browser suites start and stop their own, on ports 3100 and
  3200; the throwaway configs under `.runtime/` use their own ports and `reuseExistingServer: false`,
  because a server someone left running is silently reused and the suite then tests a stale build.
- **`public/zxing_reader.wasm` is generated, not committed** — `prebuild` copies it from
  `node_modules`, so a fresh clone has no reader until a build has run once.
- **The recovery destination is a second Supabase project and may be left stopped.**
  `node scripts/recovery-destination.mjs up` starts and migrates it, `down` discards it. It receives
  no migration automatically. `tests/recovery-portability.test.ts` **skips** without it and the
  Vitest totals read the same either way, so **read its named lines, never the totals**.
- **Docker has had to be started by hand at the start of a session** more than once, and a full
  Vitest run against a cold stack fails in ways that look like defects.

## Live hazards on this machine

- **CLOSED 2026-08-25 in the owner's working copy, and restated because the file is never
  committed.** The local-only `playwright.config.ts` now pins `GOOGLE_VISION_KEY` empty and carries
  a `testIgnore` for both owner specs, so the incident below is no longer reachable through it. It
  is recorded rather than deleted because **a fresh clone has none of those lines**, and because
  `/code-review` flagged this section as stale on 2026-08-25 while it still described all three as
  open. What follows is the hazard as it stood. **The local-only `playwright.config.ts` does not pin
  `GOOGLE_VISION_KEY`, and on this machine it runs a real build.** Found by the 2026-08-19 security
  review. The **committed** copy runs
  `pnpm dev`, which never hydrates under the strict CSP, so its tests cannot really execute — but
  the **working copy** runs `pnpm build && pnpm start`, which they do (GOTCHAS records this reversal
  for a different trap). It has no `testIgnore`, so it collects `owner-session.spec.ts` including
  the reader spec, and it pins three environment variables while `next start` inherits the real
  Vision key from the Windows user environment. **That is the 2026-08-18 incident still reachable.**
  Both sibling configs pin the key empty; this one is the owner's file and was left alone. One line
  in its `env` block closes it. **`/code-review` sharpened this on 2026-08-25 and it is worse than
  the paragraph above says.** Because the working copy runs a real build, the owner specs actually
  execute — and this config has no `testIgnore`, `fullyParallel: true`, the default worker count and
  two projects. So a bare `pnpm exec playwright test` collects `owner-session.spec.ts` and
  `owner-access.spec.ts` and runs them **concurrently against one seeded owner**, while one of those
  tests issues a full ledger wipe that its siblings are asserting against. That is the exact
  configuration `playwright.owner.config.ts` sets `workers: 1` and one project to prevent.
  **`testIgnore: /owner-(session|access)\.spec\.ts/u` closes it, and it is the owner's call**;
  the unexplained slip-capture timeout recorded above is what this hazard would look like.
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
