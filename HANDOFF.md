# Private Ledger continuity handoff

Last updated: 2026-08-27.

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
[DECISIONS.md](DECISIONS.md) (append-only; indexed at the top, carrying **D-141 onward** in full,
with D-001…D-059 in [docs/decisions/ARCHIVE-D-001-D-059.md](docs/decisions/ARCHIVE-D-001-D-059.md),
D-060…D-113 in [docs/decisions/ARCHIVE-D-060-D-113.md](docs/decisions/ARCHIVE-D-060-D-113.md),
D-114…D-119 in [docs/decisions/ARCHIVE-D-114-D-119.md](docs/decisions/ARCHIVE-D-114-D-119.md),
D-120…D-129 in [docs/decisions/ARCHIVE-D-120-D-129.md](docs/decisions/ARCHIVE-D-120-D-129.md),
D-130…D-133 in [docs/decisions/ARCHIVE-D-130-D-133.md](docs/decisions/ARCHIVE-D-130-D-133.md) and
D-134…D-140 in [docs/decisions/ARCHIVE-D-134-D-140.md](docs/decisions/ARCHIVE-D-134-D-140.md) and
D-142…D-152 in [docs/decisions/ARCHIVE-D-142-D-152.md](docs/decisions/ARCHIVE-D-142-D-152.md);
**the seventh range starts at D-142, not D-141** — D-141 is an open question and a boundary excludes those,
so the maintained file carries D-141 **and** D-153 onward with a gap between them;
the index at the top of `DECISIONS.md` covers all eight) →
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
- **Commit and push: GRANTED and LIVE for the 2026-08-27 session.** The owner's words were that this
  session is free to commit and push **as much as it wants**, which is broader than every earlier
  grant — those were counted and spent. **It is still a production deployment every time** and the
  remedy is Instant Rollback in the dashboard, not a revert push, so the breadth of the grant is not
  a reason to push more often; review before committing still holds (D-125). **It does not extend to
  `supabase db push`**, which is its own ask with a backup verified from the database first, and it
  **does not survive this session**. Earlier the same day: granted twice and used for four commits
  across two pushes — `5418ba2`, `a462a81`, `cbf1c58` (as `48a2259..cbf1c58`), then `758efe6` (as
  `cbf1c58..758efe6`), both deployed and both confirmed by the owner on screen. Before that: granted
  2026-08-26 and used four times (`f46ee64`, `b4bc6be`, `d7411b3`, `fda6c60`), all pushed.
- **Task 45's build grant is DISCHARGED, 2026-08-27.** The owner authorized migration 021, the RPCs,
  the route, the client and the tests, run locally, and all of that is built and green (D-158). **The
  grant covered building and running locally and nothing else.** It did not cover `supabase db push`,
  a commit, or a deploy, and none of those has happened. **Migration 021 exists on
  `private-ledger-local` only**; every other project including hosted is on 020.
- **The backup the owner exported on 2026-08-26 is still unverified from the database.** He said he
  took it, which is his word rather than a reading. **Verify the sequence from the database before
  asking for any push of 021** — the last agent reading was 33 on 2026-08-18. D-152's rule stands.
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

- **PLAN task 44 is BUILT, COMMITTED, PUSHED AND DEPLOYED, 2026-08-27** (D-160 scoped it, D-161
  built it). `9ce1f06`, out as `6a8399b..9ce1f06`, **database first**: the owner ran
  `supabase db push --linked` himself and the result was read back from hosted **before** the code
  went out — head **`202608270023`**, **23** applied, `public.ledger_statistics` present and
  executable by `authenticated` but **not** by `anon`, `private.reportable_movements` executable by
  nobody. **Sequence 37 and 1,604 rows unchanged**, so it moved schema and no owner data. Backup
  contract **unchanged at v7**. **Every project is on 023 except `private-ledger-live`, frozen on
  012.** `/code-review high` ran before the commit and found six defects, all fixed (D-161).
  **Nothing in the app can set `include_in_reporting`**, and the real ledger holds **0** rows with
  it off, so the new filter moves no figure today on either surface.
- **PLAN tasks 48 and 49 are AUTHORIZED BY THE OWNER AND UNSTARTED, 2026-08-27.** He approved all
  four of his appearance requests; three shipped as D-163 and these two are what remain. Their
  shapes, and task 48's data-loss hazard, are in `PLAN.md` — what is recorded here is only that the
  authorization exists and nothing has been built against it.
- **`/statistics` HAS NOW BEEN SEEN ON THE REAL LEDGER, 2026-08-27, and it found one more defect**
  (D-162). The owner opened the deployed page and sent screenshots. **The opening month is partial**
  — the history starts on the 3rd — and comparing it to a full month printed **+1002%**, correct and
  meaningless. A comparison now prints only when both periods are whole. The axis also showed `Jul`
  and `Aug` twice over fourteen months and now carries the year when the window spans more than one.
  **The identities were cross-checked in the database rather than read off the picture**: the
  day-of-week split and the monthly series each sum to the same **1,604** transactions and the same
  money as the whole-window total, over **14** months and **7** buckets. **Two apparent
  discrepancies were digits misread off a pixel face** — a screenshot proves something rendered, not
  what the number is.
- **The real ledger now shows why `include_in_reporting` will matter, and it is no longer
  hypothetical.** All 1,604 rows are still reportable, so no figure moves yet — but a
  `Transfer Withdrawal` and a `Transfer in` of the same amount on the same date sit in the two
  largest-movement lists. One internal transfer, inflating money-in and money-out alike while net
  stays correct. **Nothing in the app can set the flag**; that control is the next piece of work.
- **The hosted backup was VERIFIED FROM THE DATABASE before the migration, 2026-08-27**, not taken
  on the owner's word: `inet_server_addr()` returned a public address, sequence **37 /
  last_exported_sequence 37**, backup record at 37 from **2026-08-27 01:36 UTC**, 1,604 rows. That
  supersedes the 2026-08-26 13:02 reading. **The migration changed no data, so it did not stale it.**
- **PLAN task 45 is COMPLETE, DEPLOYED AND CONFIRMED BY THE OWNER, 2026-08-27.** `main` is at
  `758efe6` and `origin/main` matches it. Two deploys went out — `48a2259..cbf1c58` (the paging work)
  and `cbf1c58..758efe6` (the combined balance in SQL) — and **the database went first both times**,
  which is the only safe order: 021 is additive so the old code kept working, and 022 had to exist
  before code that reads `combined_balance_minor` could run at all. **The owner opened `/ledger` after
  each and reported on it**, which is what discharges *deployed*. **`eslint.config.mjs` and
  `playwright.config.ts` stayed out of all four commits**; `git status --short` distinguishes them
  from the continuity edits now sitting beside them.
- **EVERY project is on migration 022, hosted included, as of 2026-08-27.** The owner ran
  `supabase db push --linked` himself for both 021 and 022, each after the backup was verified from
  the database. Read back from hosted afterwards: **22 applied, head `202608270022`**,
  `private.combined_balances` present and **executable by nobody**, and the page function confirmed
  to emit `combined_balance_minor` — that last check is the precondition the deployed code depends
  on, and it was taken *before* the code was pushed rather than after. `private-ledger-live` stays
  frozen on 012 and is untouched. Backup contract **unchanged at v7**.
- **The combined balance was cross-checked against the real ledger and agrees on every row.**
  **1,604 rows checked, 0 mismatches**, against an independent derivation — the shipped version is
  one window function, the check re-derived each row by looking up every account's latest balance
  with a lateral join. Two methods, one answer. That is stronger evidence than the pgTAP suite,
  which runs on invented fixtures, and it is the only check that has ever run against the real
  distribution.
- **Earlier that day: every project was on migration 021.** The owner ran
  `supabase db push --linked` himself after the backup was verified from the database; the local
  synthetic project, the recovery destination and hosted all carry it. Read from the hosted database
  afterwards: **21 applied, head `202608260021`**, and the two new functions carry the same grants they
  do locally — `SECURITY DEFINER` with a pinned `search_path`, `authenticated` only, and
  `private.ledger_transaction_json` granted to nobody. Backup contract **unchanged at v7**.
  `private-ledger-live` stays frozen on 012 and is untouched.
- **The backup verified before that push is still current.** `sequence` and `last_exported_sequence`
  both read **37** before and after, and the backup record at sequence 37 dates from 2026-08-26 13:02
  UTC — the migration changed schema and no owner data, so nothing about it staled the file. Row count
  unchanged at 1,604. That reading supersedes the last agent reading of 33 on 2026-08-18.
- **`main` was at `fda6c60` and `origin/main` matched it**, pushed 2026-08-26. Four pushes went out
  that day: `f46ee64` (the ledger restructure, which also carried the long-local `1d2ca59`),
  `b4bc6be` and `fda6c60` (docs), and `d7411b3` (the typeface sizing, the route titles and the
  phone header).
  **The owner opened `f46ee64` in a browser and reported on it, so that one is confirmed by use
  rather than only Ready.** `d7411b3` has not been looked at by anyone. **`eslint.config.mjs` and
  `playwright.config.ts` stayed out of every commit**, which is what `git status --short` is for.
- **The owner exported a fresh backup on 2026-08-26**, which is what unblocks a migration. He said so;
  nothing here has verified it from the database, and D-152's rule still stands — **re-read the
  sequence from the database before anything destructive** rather than trusting this line. The last
  reading taken by an agent was sequence 33 on 2026-08-18.
- **He also reported the deployed ledger at 1,604 rows**, up from the 1,552 read from the hosted
  database on 2026-08-15. A count, not a value. It is what task 45's sizing rests on.
- **The full gate is green on the uncommitted tree, 2026-08-27**, re-run in full after the review's
  fixes. The numbers live in `PLAN.md`'s gate table, which is the file that owns them. **pgTAP was
  re-run and is owed no longer** — 299 across 9 with migrations 001–021, after a clean
  `pnpm supabase:reset`. **Read `Result: PASS`, never the exit
  code**: `pnpm supabase:test` exits 1 on a passing run, which was confirmed by moving the new file
  aside and getting the identical code.
- **The "QR intermittent" is solved, and it was never intermittent.** `zxing-wasm`'s *writer* resolved
  its WebAssembly from a CDN, so every slip fixture reached the internet and failed whenever the
  network did — which is exactly what happened on 2026-08-27, when seven slip specs failed twice in a
  row with the network genuinely down. `tests/fixtures/synthetic-slip.ts` now hands the module the
  installed bytes, and the owner suite passes **32/32 with no network at all**. `copy-zxing-wasm.mjs`
  was the long-standing suspect and is innocent: it copies the *reader*, which the app needs served
  from its own origin, and the writer never runs in the app.
- **`docs/gotchas/app.md` was split on 2026-08-27 and is no longer the file to watch: 70%**
  (54 KB/78 KB), down from 92%. Fourteen layout, typography, colour and accessibility traps moved to
  the new **`docs/gotchas/appearance.md`** (19 KB, 25%), which is a subject of its own rather than a
  cut at the halfway mark. **This is D-134's standing condition discharged a second time** — a breach
  splits a section rather than raising a budget, as D-149 did for `GOTCHAS.md` itself. The reasoning
  is in `appearance.md`'s own header. **The file to watch now is `docs/gotchas/tests.md` at 54%.** **D-134's condition is that a breach splits the
  section in two rather than raising the budget**, and D-149 has already honoured it once. The next
  substantial app change is likely to be the one that pays it. **It is the section to watch**, and D-134's condition says a breach splits it in two
  rather than raising the budget. `DECISIONS.md` is at **65% (77 KB/117 KB)** after D-158.
- **The ledger pages as of D-158, and `fingerprint` is off the wire.** `list_account_transactions` is
  superseded but **still in place and still granted**, because `supabase/tests/001_security.sql` pins
  its grants; nothing in the app calls it. **Two of task 45's three predicted hazards turned out not to
  exist** — read D-158 rather than the scoping text, which is kept in `PLAN.md` only as a record of what
  was believed. **Nobody has seen any of this in the deployed app**, because none of it is deployed.
- **The phone header is fixed as of `d7411b3`** (D-157) and no longer eats the first screen: the brand
  and the route row stay, everything else is behind a Settings disclosure below 700px. **Nobody has
  opened it on a real phone yet** — it is measured at iPhone 13 width in the suite, which is what
  D-138 proved is not the same thing.
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
  which is not true here, so this one is archived instead. **The seventh boundary took it 95% → 31% on 2026-08-26** (112 KB → 37 KB), which is the deepest yet at **eleven entries** where the sixth managed seven. It is the first that does not start where the previous one stopped: it begins at **D-142** and steps over **D-141**, which is still asking whether the mailbox becomes a permanent archive. Waiting for that answer meant breaching the budget first, and the owner chose the gap over a raise. **scripts/check-docs.mjs pools the maintained file with every archive**, so a gap is safe — six contiguous boundaries were a coincidence, not a requirement. **The seventh boundary is still bounded at D-141**, because whether the mailbox source is deleted after import is deferred and unanswered — so the next reader either gets that decision or raises the budget.
- **The ledger table overflowed a real phone and no suite could see it** (D-138). The audit now seeds
  rows and asserts a table is present before measuring. **Two surfaces are still unmeasured with
  records in them** — the captured-slips list and the batch worklist — because the audit only clicks
  what a button offers and those need records created first.
- **`cbf1c58` and `758efe6` ARE DEPLOYED AND THE OWNER HAS LOOKED AT BOTH, 2026-08-27.** He opened
  `/ledger` after each and sent a screenshot. **The paging works**: 297 rows on the first load, the
  reach line, the totals still reading 1,604, and after `758efe6` the all-accounts column populated
  on every row with `Load older rows` rendering as a link. **What is still unlooked-at is a phone** —
  both readings were desktop. **Both defects in this task were found this way and neither by the
  gate**, which is the thing to carry forward: a suite asserts a control exists, not that anyone can
  find it. The paragraph below is kept as the reading it was made from.
- **`cbf1c58` was DEPLOYED AND UNVERIFIED when written, 2026-08-27** — task 45, the largest user-visible change to
  the ledger since it started loading on arrival. **What to look at, on `/ledger`, signed in:**
  the table should show **100 rows** and a line reading *Showing 100 of 1,604 confirmed rows* with a
  **Load older rows** button; pressing it should add rows without the ones above changing. **The
  totals strip must still read 1,604 rows** — it is computed in SQL over the whole account, and a
  figure matching the rows on screen instead would mean the page's totals are being shown, which is
  the defect this whole task exists to avoid.
  **Two things are new and may look wrong when they are right.** An **em dash** in the *All accounts*
  column means the merged balance is not knowable that far back because some account's window is
  shallower — honest rather than broken, and it should not appear at all while one account holds
  almost every row. And the **Status filter no longer claims completeness** for *Verified*, because a
  verified row can sit outside the loaded window.
  **The remedy for a bad deploy is Instant Rollback in the dashboard, not a revert push.**
- **The statement mailbox is live and its credentials are the owner's alone.** A dedicated Gmail with 2FA, an IMAP app password in Bitwarden, and a Gmail filter forwarding three senders. `statement-mailbox.json` at the repo root names the mailbox and the senders — gitignored, no secret in it, but it names an address, so **do not quote it into any document or commit**. **The app password is read from stdin only** by `scripts/fetch-statements.mjs` and has never been in a file, an argument or an environment variable there. `private-statements/inbox/` is where the fetcher writes and is inside the never-read boundary.
- **D-017 is superseded on binding.** A statement whose printed bank and last four resolve to exactly one account is now bound without asking, by default, with a switch in the batch section. **The review and the confirmation are untouched** — a browser test asserts `import_batches` stays at zero after an automatic bind.
- **Five pushes across 2026-08-23 and 2026-08-24, all deployed and NONE verified in the dashboard by an agent**: `6a6f752` (bulk statement import, D-141), `7f7aa65` (the slip-form review fixes, D-142), `617c2c8` (the tertiary button rank, D-143), `63b5d24` (the mail fetcher and automatic binding, D-144) and `0a4bf9a` (the hosted Sync button and the fifth archive boundary, D-145 and D-146). **The owner verifies a deployment; nothing here can.**
- **Nothing of this session's work is uncommitted. D-148, D-149 and D-150 went in as `2da46fe`, pushed 2026-08-26**, 25 files, and the working tree holds **only** the two deliberately local-only config files again. **`GOTCHAS.md` shrank 208 KB to 15 KB in that commit and it is a move, not a deletion** — `check:docs --strict` reports the same **149 traps** it did before, which is the proof.
- **That push is a production deployment and NOBODY HAS VERIFIED IT IN THE DASHBOARD.** Seven now stand unverified across 2026-08-23…26. This one carries no SQL, no route and no contract change, but it did move the ledger view's five loads onto `ledgerRequest` — so **the page to look at is `/ledger`**, and what to look for is that accounts and transactions still load rather than reporting an error.
- **The commit-and-push grant is spent on `a123929`, pushed 2026-08-26.** Two pushes were granted and used this day — `2da46fe` (D-148, D-149, D-150) and `a123929` (D-151). **Superseded by the `1376b55` lines below**, which carry the current count and the current grant state.
- **D-152 is COMMITTED AND PUSHED as `1376b55`, 2026-08-26** (8 files), on a grant the owner gave for exactly this. The card capture restructure: new `lib/notification-card-form.ts` and `tests/notification-card-form.test.ts`, plus `app/notification-card-capture.tsx`, `tests/privacy.test.ts`, `docs/gotchas/app.md`, `DECISIONS.md`, `PLAN.md` and the `HANDOFF.md` correction that had been carried since `a123929`. **No SQL, no route, no contract and no CSP change**, so `/security-review` is not owed — the reader route, the Vision call and the stored key were all left alone.
- **`1376b55` REACHED READY AND THE OWNER CONFIRMED IT IN THE DASHBOARD, 2026-08-26.** Production, `main`, the hash matches. **That discharges *deployed*, and nothing more.** The preview shown is the signed-out landing page; the component this commit rewrote is behind sign-in on `/slips` and **has still never been exercised against the real deployment**. `76dc46b` is the standing reminder that a Ready build shipped a defect the owner found on his own phone minutes later (D-138). **What is still owed on this one**: open the card form, choose a channel, read a screenshot, and check the crops appear beside their boxes and Capture enables.
- **The other eight deployments across 2026-08-23…26 remain unverified**, `/ledger` from `2da46fe` among them.
- **A relative timestamp in that dashboard is not a reading of when the push happened.** `1376b55` displayed as *7h ago* seconds after it landed, which is exactly the UTC-against-UTC+7 signature. **Trust the commit hash, never the elapsed time** — an agent reading *7h ago* as real would conclude it was looking at a stale deployment and go hunting for one that does not exist.
- **The commit-and-push grant is spent again.** Three pushes were granted and used on 2026-08-26 — `2da46fe`, `a123929` and `1376b55`. The next one needs a new ask. **The tree holds these very bullets plus the two deliberately local-only config files** — a handoff cannot record its own push inside that push, so this correction is uncommitted by construction rather than by oversight. **Commit it with the next change**, as `a123929`'s was; `git status --short` is what tells the config files apart from ordinary work.
- **The hosted Sync button is COMMITTED, PUSHED, DEPLOYED and now CONFIGURED** (D-145, PLAN task 41). The owner set the three variables in Vercel at Production scope on **2026-08-25** and redeployed, and **the first real sync worked on the first attempt** — five statements out of the dedicated mailbox, decrypted on the device. That is the first time any of this code had spoken to a real mail server, so the standing warning that it never had is discharged. The 503-when-unset path is still what an unconfigured deployment gets. **D-145's own Status line still reads "uncommitted and not deployed"**: it was true when written, `DECISIONS.md` is append-only, and this line is the correction — which is the division of labour D-052 sets, not an oversight. **The archive boundary went in the same commit rather than its own**, deviating from `592a1b0`'s precedent, because both edits touch interleaved regions of `DECISIONS.md`.
- **The Sync button's three variables are set and that grant is spent.** `STATEMENT_MAILBOX_USER`, `STATEMENT_MAILBOX_SENDERS` and `STATEMENT_MAILBOX_APP_PASSWORD`, Production scope, the password Sensitive, none prefixed `NEXT_PUBLIC_`. **The two non-secret values live in `statement-mailbox.json` at the repo root** — gitignored, no secret in it, but it names an address, so do not quote it anywhere. **A sender pasted with its JSON quotes still contains an `@`, so it passes validation and then matches nothing**, which looks exactly like a bank that stopped sending; strip the quotes. **Any further hosted-resource change needs its own ask.** **`/security-review` ran on 2026-08-24 and found nothing** — it verified the owner gate on both routes, that the validated uid/part cannot reach unauthorized bytes, TLS certificate validation, that the app password cannot leak into a body or a log, and that the mail-supplied filename is neither a header-injection nor an XSS vector. **Until the variables are set both routes answer 503 with a sentence naming what is unset**, which is proved in a browser against the real route.
- **`statement-mailbox.json` is gitignored and therefore does not exist in a deployment.** That is why the hosted side reads the same two facts from the environment instead. The variable names are deliberately **not** in `.env.example`, which is inside the never-read boundary and is the owner's to edit.
- **The document password still never leaves the device, and that is asserted rather than intended.** It is not a parameter of either mailbox route, the deployment does not hold it, and `app/statement-sync.tsx` has no prop, state or field that could carry one. What the routes move is the bank's own ciphertext.
- **A privacy guard narrowed in meaning without failing, and it is now said out loud** (D-145). `tests/privacy.test.ts` asserts `app/statement-batch.tsx` constructs no request of any kind; the sync fetch lives in a **separate component** so that stays literally true, and a second guard covers the new one. **The old guard's comment now states what it still means and what it no longer means on its own.** Two new `GOTCHAS.md` traps came out of this, plus one about Playwright route globs.
- **The next action, 2026-08-25: commit and push D-147, on the owner's explicit authorization given this session.** He authorized building it, running `/code-review`, and committing and pushing afterwards, in one grant. `/code-review` ran at high effort and is discharged — ten findings, six fixed. **`/security-review` is not owed**: D-147 adds no route, no credential and no external call. **Two questions remain the owner's and nothing is queued behind them**: D-134 and D-137, which is what the sixth archive boundary is waiting on.
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
  `playwright.config.ts` is local-only. **It was repaired on 2026-08-25 on the owner's instruction
  and now runs green, 18/18, which it had never done**: `testIgnore` for the two owner specs,
  `webServer.timeout: 180_000` for a cold `pnpm build && pnpm start`, and
  `NEXT_PUBLIC_ALLOW_DEV_OWNER_SESSION: "0"`. The three hazards this bullet used to describe are
  therefore closed **in the owner's working copy only** — a fresh clone still has none of it,
  because the file is never committed. `docs/LOCAL_DEV.md` still recommends the isolated config.
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
  either needs a rebuild rather than a redeploy. **D-145's three are set as of 2026-08-25, so the count is six**:
  `STATEMENT_MAILBOX_USER`, `STATEMENT_MAILBOX_SENDERS` and `STATEMENT_MAILBOX_APP_PASSWORD`, the last
  a credential at a third party, marked Sensitive, none prefixed `NEXT_PUBLIC_`. They are read at
  request time, so they took a redeploy rather than a rebuild. Read the dashboard rather than this
  line for what is actually set.
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
- **Gate, all green 2026-08-25 with D-147 in the tree**: Vitest **696 passed /
  7 skipped across 34 files**, Playwright owner **31/31** and isolated **18/18**, throwaway
  `.runtime/bind-scroll.spec.ts` **3/3**, production build clean at **twenty** `/api/v1/` routes,
  `pnpm check:docs --strict` at **147 decisions, 149 traps**, tsc and ESLint clean. **pgTAP was not
  re-run and that is deliberate** — it stands at **266 across 8** from 2026-08-18 and nothing since
  has moved SQL. **Read the skip count, not the total**: it is still 7, and a stopped Docker would
  turn the database-backed suites into skips while leaving the totals looking the same.
- **Docker had to be started by hand at the beginning of 2026-08-21's session**, and a full Vitest
  run launched while it was still coming up reported **9 failures in `tests/slip-match-route.test.ts`
  that were purely the race** — every one passed on an immediate re-run against a settled database.
  Worth knowing before diagnosing anything: check `docker ps` first, and re-run once before
  believing a database-backed failure.
- **A SECOND intermittent appeared in the owner suite on 2026-08-25**, distinct from the TOTP one.
  `captures a slip from its QR and stores it as a provisional entry` timed out at 30s in one full
  run, passed when run alone, and passed in a complete 31/31 re-run minutes later. It is on `/slips`
  and the change in the tree that day touches only `/import`. **Undiagnosed. The likeliest cause is
  the local-only `playwright.config.ts` hazard below**, if a bare `pnpm exec playwright test` was
  ever run against this stack — that config wipes the ledger from one spec while siblings assert
  against it. Re-run before believing any single failure in this suite.
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
