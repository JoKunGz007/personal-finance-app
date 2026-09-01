# Private Ledger continuity handoff

Last updated: 2026-09-01.

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
[DECISIONS.md](DECISIONS.md) (append-only; indexed at the top, carrying **D-141, D-158 and
D-177…D-181** in full, with thirteen archive files beside it under
[docs/decisions/](docs/decisions/) — the index at the top of `DECISIONS.md` lists every entry in
all of them, so **read the index rather than opening an archive to find something**.
**The gaps in the archived ranges are the rule, not an accident** — a boundary excludes every open
question and steps over one rather than stopping short (D-133, D-154, D-164, D-167, D-171).
What is left in the maintained file is exactly two shapes. **Two questions nobody has closed**: the
mailbox archive (D-141) and `list_match_candidates`' unbounded scan (D-158). And **five entries that
are settled, shipped, deployed and verified, held back by one shared missing measurement** —
D-177 (the account filter), D-178 (the ledger date filter), D-179 (the calendar heatmap) and
D-180/D-181 (the four colour schemes) have all been confirmed live at desktop width and **none has
been seen at a true 390px viewport on a real device**. That is the weaker kind of fence D-171
invented, and **one reading on a phone frees all five**.) →
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
- **Driving the browser against the real deployment: GRANTED and SPENT, 2026-08-29.** The owner
  connected Claude in Chrome and granted it explicitly. Used **read-only** — `/ledger` and
  `/statistics` were read, nothing was written, no control was pressed, no credential handled.
  **Not standing; it does not survive this session.** What it produced is in D-168 and `PLAN.md`
  tasks 44 and 50.
- **Building PLAN task 46: GRANTED 2026-08-29, both halves, and BOTH ARE NOW SHIPPED** (D-170,
  `0b88ea2`; D-177, `4f51a7e`). The window picker needed no SQL and shipped 2026-08-29. The
  account filter needed migration 024, which reached hosted 2026-08-30 (D-176) under a separate
  `db push` grant; its control was built, reviewed (`/code-review high`, per D-125) and verified
  against `private-ledger-local`. **Committing and pushing: GRANTED and SPENT 2026-08-31**
  ("let's commit and push first, so you can verify") — committed as `4f51a7e`, pushed to
  `origin/main`, and confirmed deployed by reading the real hosted app in the owner's own
  signed-in browser session: the select listed his three real accounts and narrowing to one
  correctly changed every figure. Task 46 is done.
- **Building PLAN task 47's ledger date filter: GRANTED 2026-08-31** ("yep go for task 47") **and
  SHIPPED** (D-178, `5c016a9`). Built, reviewed (`/code-review high`, per D-125), verified locally,
  then **committing and pushing asked and granted separately, in the same turn as task 46's**
  ("Yes, commit and push"). Confirmed deployed by reading the real hosted app in the owner's own
  signed-in browser session: a real month narrowed correctly across all three real accounts and
  the transposed-range refusal reproduced live. **`/api/v1/accounts/[id]/transactions/route.ts`
  and `lib/transactions.ts` were already uncommitted in the tree when this session started**; this
  commit finished and landed that groundwork alongside the control that finally exercises it, on
  the same reasoning D-177 covered `lib/date-range.ts`. **The calendar heatmap PLAN task 47 also
  names was built the same day, under a later, broader grant — see below.** Task 47 is closed in
  full.
- **A new session opened 2026-08-31 with commit, push, deploy, `db push` and real-ledger read all
  GRANTED TOGETHER, unprompted, and the owner opened the hosted ledger in the browser for it** — the
  broadest single grant this file has recorded. **Spent building and shipping the calendar heatmap**
  (D-179, `7d9d4e6`, migration 025). **One sub-grant was asked for separately even so**: exporting a
  fresh backup before the `db push`, because the standing one read stale (sequence 43 against a last
  export of 39) and a write against the owner's real financial data — even an additive, safety-
  mechanism one — was judged outside what "db push" alone was understood to cover. The owner
  exported it himself rather than authorizing it be done through his browser session. **Not
  standing; every one of these gates reverts to not-granted for the next session**, on this file's
  own rule that nothing here survives past the session that spent it.
- **A session opened 2026-09-01 with commit, push, deploy, `db push`, hosted-browser and real-data
  read all GRANTED together, unprompted, and SPENT on `12d0302`** — the four colour schemes (D-180)
  and their live confirmation (D-181). **`db push` was granted and never used**: no SQL moved, so
  no migration needed one, and an unused grant is not a credit. **Every one of these gates reverts
  to not-granted for the next session**, on this file's own rule — ask again.
- **The dark scheme: ASKED FOR BY THE OWNER 2026-09-01, and it reverses a decision he had closed.**
  D-137 dropped it with a *"but we'll see"*; a later entry withdrew that hedge and recorded that he
  would say so if it changed. He said so. **Night Town is his choice**, from three candidates he
  asked to compare on a canvas before deciding; Lamplit and Cellar stay switchable at his request.
  Any change to which schemes exist, or to which one `system` resolves to, is his call and not a
  maintenance decision — `SYSTEM_DARK` in `lib/ui-theme.ts` is the one constant that encodes it.
- **The default face: DECIDED BY THE OWNER 2026-08-29 and SHIPPED** (D-169). Pixelify Sans, not
  the Press Start 2P the question had been framed around.
- **Fixing the phone tap targets: GRANTED, SPENT and SHIPPED, 2026-08-29** (D-168).
  `/code-review high` ran before the commit ask, as D-125 requires, and found **nothing** in the
  committed file — its six findings are all in the two never-committed local-only configs.
- **Deleting two leftover synthetic accounts from `private-ledger-local`: GRANTED and SPENT,
  2026-08-29.** This session's own residue from a run that accidentally collected every spec under
  `.runtime/`; they blocked both Vitest and the owner suite through D-048's guard. Scoped to those
  two ids on the disposable local project, and the row counts showed **zero** dependents, so no
  trigger was disabled and the approved `session_replication_role` step proved unnecessary.
  **`ALLOW_DESTRUCTIVE_TESTS` was not set and must not be** — that guard firing correctly is the
  first time it has ever fired at all.
- **Building PLAN tasks 48 and 49: GRANTED, SPENT, and now SHIPPED, 2026-08-27** (D-165, D-166).
  The build grant covered running locally only; the commit and the push were asked for separately
  and given. Task 48 put the `include_in_reporting` control in the ledger's Status cell; task 49
  measured the typeface question, **did not** build the vertical-metric pins the task prescribed
  because the measurement said they pin nothing, and fixed the one real reflow instead. **Both are
  deployed and the first was verified in the running app.** A further change to either needs a
  fresh ask.
- **Taking the `DECISIONS.md` archive boundary: GRANTED, SPENT, COMMITTED and PUSHED, 2026-08-29**
  (D-171, `9a97f70`). The owner named it as the session's next action, then authorized the commit
  and the push in two separate turns — the distinction D-125 exists to preserve. The **tenth**
  moved six entries — D-153 with D-164 … D-168 — for **86% → 61%**, stepping over D-158 and D-161
  and stopping below D-169 and D-170 because both change what renders and neither has been looked
  at on the deployment. **`/code-review high` did not run**, and the owner was told why before the
  ask: the change is four Markdown files with no code path to review. Previously: the eighth moved
  D-154 … D-156 (97% → 85%) and the **ninth** moved D-157, D-159, D-160, D-162 and D-163 for
  **96% → 73%**, both on 2026-08-27 (D-164, D-167). **The rate is the thing to watch**: three
  boundaries in three days, each bought by a question closing rather than by the calendar.
- **Building PLAN task 46's account filter and task 51's phone audit: GRANTED 2026-08-29, BUILT,
  COMMITTED and PUSHED as `676a8ea`.** Task 51 is done end to end and deployed (D-173). Task 46's
  second half was **half done on purpose at the time**: migration 024 was written and applied to
  `private-ledger-local` only, with no control above it, because the database goes first and 024
  was not yet on hosted. **Both preconditions have since cleared**: 024 reached hosted 2026-08-30
  (D-176) and the control itself was built, reviewed, committed, pushed and deployed 2026-08-31
  (D-177) — see the task 46 bullet above for its current, shipped state. The owner also chose **the
  ledger's date filter ahead of the calendar heatmap** (task 47), whose SQL rides in the same
  migration; **that control remains entirely unbuilt** — `lib/date-range.ts` is committed (D-177
  needed it as a dependency of `lib/statistics.ts`) but nothing under `app/` imports it for a
  ledger date filter yet.
- **`supabase db push` for migration 024: GRANTED, RUN AND SPENT, 2026-08-30.** It needs a **backup
  verified from the database first** — the last reading is sequence 37 / last_exported_sequence 37
  from 2026-08-27, and D-152's rule is that the next migration needs its own. **Who runs it has varied**: an
  agent pushed 016, 017 and 018 on 2026-08-15 with explicit authorization and widened access
  (D-108, after a `--dry-run`); the owner ran 021, 022 and 023 himself on 2026-08-27.
  **Hosted is reachable from this machine and a previous claim that it was not was wrong.**
  `supabase migration list --linked` connects and reads the remote migration table without
  prompting — verified 2026-08-30, with hosted at 023 and `202608290024` showing an empty remote.
  The CLI is `node_modules/.bin/supabase`, **not on `PATH`**, and its credentials live in neither
  the dotfiles nor the environment variables an agent checks first, which is how that wrong claim
  was reached: a capability limit asserted from a partial check. **Whether the harness treats
  `db push` differently from a read is untested.**
- **The three synthetic accounts in the production picker (task 50): DONE 2026-08-30** (D-175). The
  hypothesis first written here — that `supabase/seed.sql` had reached production — **was wrong and
  is refuted**: hosted holds no `synthetic.owner@example.invalid`, `ledger_owners` is not the
  synthetic id, and there are no `categories` or `mutation_sequences` rows for it. The accounts
  carried the seed's primary keys while being **owned by the real owner** and predating all three
  real accounts, which is `public.restore_backup`'s fingerprint (D-013) or hand-setup — historical
  either way, and not recurring. **Three rows deleted by the owner in the dashboard SQL Editor,
  after a backup verified from the database at sequence 39 / 39.** Read back: **3 accounts
  remaining, 0 labelled `Synthetic%`.** `public.accounts` has no triggers, so **this change is not
  in the audit trail** — the app has no delete path at all, migration 010 having revoked it.
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

- **`main` is at `cf46a49` and `origin/main` matches it.** `cf46a49` is the eleventh archive
  boundary (docs only); the three deployed feature commits before it are `4f51a7e` (task 46's
  account filter, D-177), `5c016a9` (task 47's ledger date filter, D-178) and `7d9d4e6` (task 47's
  calendar heatmap, D-179) — task 47 is closed in full. **D-180's four colour schemes are not in
  any of them**; they are uncommitted, see below. **This entry has been stale twice** (it named
  `676a8ea` for two sessions after D-177 and D-178 shipped past it, then `7d9d4e6` after `cf46a49`
  landed) — read `git log` rather than trusting how current this line looks, on the same D-131
  lesson the paragraph below already names.
- **Every commit since 2026-08-29 that changes what renders has now been looked at on the
  deployment** — D-177 and D-178 both verified `/statistics` and `/ledger` live, which is also what
  closed D-169 and D-170's rendering fence in `DECISIONS.md` (corrected there 2026-09-01; it had
  still claimed "nobody has looked" after D-177 already had). **Two readings are owed and they
  should be taken in one pass**, because both need the deployment and a phone:
  *(a)* **phone width** — neither the account filter, the date filter, the calendar heatmap nor any
  dark scheme has been seen on a real phone or at a true 390px viewport, and a resize on the hosted
  tab did not propagate last time it was tried; and *(b)* **the awaiting-slip chip and the resync
  label in a dark scheme** — neither appeared in the window loaded on 2026-09-01, so both are
  measured only in the unit suite. **The larger half of (b) is discharged**: D-181 read 297 real
  rows in Night Town and confirmed the status chips, the verified rail and the calendar on their
  real surfaces. Phone width is now the single reading that three entries are all waiting on.
- **The twelfth archive boundary is taken, `DECISIONS.md` at 74%.** D-171 … D-176 moved to
  [`docs/decisions/ARCHIVE-D-171-D-176.md`](docs/decisions/ARCHIVE-D-171-D-176.md) on 2026-09-01,
  the same day as the eleventh — the file had gone **83% → 95% in one session**, because D-180 and
  D-181 are 9.3 KB and 4.2 KB between them. **The first contiguous boundary in five**: both open
  questions sit below D-171, so nothing had to be stepped over. `check:docs --strict` clean at
  **181 decisions and 192 traps** after the move — no id lost, no gap opened.
  **`docs/gotchas/app.md` at 79% is now the file to watch**, and it is the one nobody has split
  since D-158.
- **`eslint.config.mjs` and `playwright.config.ts` are the two deliberately local-only files and
  must never be committed.** That is the durable fact; **what else the tree holds changes by the
  hour, so read `git status --short` rather than any sentence here** and stage explicitly, never
  with `git add -A`.
- **The four colour schemes are committed as `12d0302`, pushed and deployed, 2026-09-01** (D-180,
  D-181, PLAN task 52), and confirmed against the real hosted ledger in the owner's own signed-in
  session. **No SQL moved, so nothing needed `db push`** — the broad grant this session opened with
  was spent on commit, push, deploy and the real-ledger read only.

### Where the database is

- **Hosted and `private-ledger-local` are on migration 025; `private-ledger-recovery` is on 023 and
  `private-ledger-live` stays frozen on 012.** **025 was pushed to hosted on 2026-08-31**, authorized
  the same session as commit/push/deploy/`db push`/real-ledger-read together, after a `--dry-run`
  naming only `202608310025`. **The standing backup was found stale before the push** — sequence 43
  against a last export of 39, four mutations behind — and the owner exported a fresh one when
  asked rather than the push proceeding on the old reading; re-verified at 43/43 before `db push`
  ran. **Read back from hosted rather than trusted**: `supabase migration list --linked` shows all
  **25** migrations matching local and remote, and `public.ledger_statistics(date,date,integer,uuid)`
  reads back executable by `authenticated` and not by `anon`. Backup contract **unchanged at v7**.
- **The backup was verified FROM THE DATABASE on 2026-08-31**, not taken on the owner's word: a
  sequence and last-exported reading, taken before and after the export, both from
  `public.mutation_sequences` via `supabase db query --linked`. **The next migration needs its own
  reading** — D-152's rule, and a claim is not a measurement.
- **The real ledger's row and account counts are not restated here** — read them from the database
  or the deployed app rather than from a figure that ages the moment it is written; the last reading
  this file carried (1,604 rows, 3 accounts, 2026-08-27) is superseded by every import since and is
  exactly the kind of homeless-but-stale fact this file's own rule warns against restating.
- **Roughly 18 rows are genuine internal transfers, not the 248 that carry a transfer label.** Most
  transfer-labelled rows name other people and are ordinary spending. That correction is in `PLAN.md`
  task 48 and it matters, because the larger number was briefly used to argue a feature was urgent.

### The gate, as last run

- **Green on the uncommitted working tree, 2026-09-01** (`cf46a49` plus D-180): `tsc --noEmit`
  clean; `eslint .` clean (the same 2 pre-existing warnings in `app/transactions-view.tsx`,
  untouched since before D-178); `check:docs --strict` clean at **180 decisions and 192 traps**;
  `pnpm build` clean at **twenty-four** `/api/v1/` routes (+1, `/api/v1/ui/theme`); Vitest
  **941 passed / 7 skipped across 43 files**; Playwright **isolated 70 passed / 8 skipped**,
  re-run because the header gained a control — it now includes axe over every route in each of the
  three dark schemes, on desktop and mobile. **pgTAP not re-run: no SQL has moved since migration
  025.** **Playwright owner not re-run** — that suite wipes the seeded owner and nothing in this
  change touches a signed-in surface's data path, but it is untested against the new header and is
  the obvious thing to run first if anything looks wrong.
- **Previously green on `7d9d4e6`**: Vitest **910 / 7 across 42 files**, pgTAP **all 13 files, 390
  assertions**, build at twenty-three routes, `check:docs` at 179 and 191.

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

- **CLOSED 2026-08-29, on the owner's instruction, and restated because the file is never
  committed.** The local-only `playwright.config.ts` now pins **all three** `STATEMENT_MAILBOX_*`
  variables empty. It had pinned `GOOGLE_VISION_KEY` on the stated grounds that nothing in a
  browser suite should reach a third party, and left the mailbox inherited from `.env.local` while
  `/import` exposes `.sync-controls` — so a spec added later that clicked Sync would have opened
  IMAP to the real statement mailbox with the real app password. Identical reasoning, one service
  short. `lib/server/statement-mailbox-session.ts` treats an empty password as **missing**, so the
  session fails closed rather than attempting an anonymous connection. **A fresh clone still has
  none of these lines**, which is why this stays written down.
  **The same gap existed in both *committed* configs and `/code-review high` found it there** —
  `playwright.owner.config.ts` (which now collects the phone audit, and that spec walks `/import`)
  and `playwright.isolated.config.ts` (where `parser.spec.ts` and `statement-pdf.spec.ts` do).
  Both are pinned now, and those two fixes **are** committed.
- **CLOSED 2026-08-29, same file.** Its `webServer.command` is `pnpm build && pnpm start`, which
  inlines `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_ALLOW_DEV_OWNER_SESSION=0` into the shared
  `.next` — so running the suite and then `pnpm start` on 3000 by hand served the **test** build,
  pointed at local Supabase with no Dev sign-in, whatever `.env.local` said. Baked at build time,
  so a restart did not clear it and only a rebuild did. Same class as D-027, on the one config
  whose stated job is manual driving. A `globalTeardown` at `.runtime/clear-next-build.ts`
  (gitignored, like the config's only permissible reference) now deletes `.next` after the run,
  **turning a silent wrong answer into a loud absence**: the next `pnpm start` reports that it
  cannot find a production build. **It does not run if the suite is interrupted**, so the hazard is
  narrowed rather than gone.

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
