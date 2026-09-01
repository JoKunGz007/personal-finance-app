# Private Ledger decision log — archive, D-171 … D-176

Relocated from `DECISIONS.md` on 2026-09-01, unchanged, because that file reached **111 KB of its
120,000-byte budget — 95%** (`scripts/check-docs.mjs`, D-130). Append-only still applies — a
decision superseding one of these goes in `DECISIONS.md` and references it here.

**This is the twelfth boundary and the first contiguous one in five.** The eighth, ninth, tenth and
eleventh each stepped over an open question or grouped a stranded id with a later range; this one
does not have to, because both open questions — D-141's mailbox archive and D-158's unbounded
candidate scan — sit *below* D-171 rather than inside it. The range is exactly the run between the
last archived id and the first fenced one.

**What fences it from above is the same kind of fence the tenth boundary invented, and it is still
unexpired.** D-171 refused to archive D-169 and D-170 because both changed what renders and nobody
had looked at either on the deployment — *an unverified rendering rather than an unanswered
question, weaker than the other kind*. That exact fence now sits on **D-177 through D-181**: all
five have been verified on the hosted deployment at desktop width, and **none of them has been seen
at a true 390px viewport on a real device**. The account filter (D-177), the ledger date filter
(D-178), the calendar heatmap (D-179) and the four colour schemes (D-180, D-181) are one reading
away from being free to move, and it is the *same* reading for all five — which is why this boundary
stops at 74% rather than pushing to 54%. A resize on the hosted tab did not propagate to the page's
own viewport the last time it was tried, so the reading needs a real phone.

**The tenth boundary's own lesson applies to that fence**: it expires the moment the reading is
taken, and the eleventh boundary existed largely because nobody re-read this header after an earlier
fence had already lifted. Re-read it before assuming these five are still blocked.

**What moved here is one arc**: the tenth boundary itself (D-171), then the four days in which the
statistics surface got its URL state and its account dimension and reached hosted — the window
picker's address-bar state (D-172), the phone audit becoming a committed test that immediately found
a control escaping the viewport (D-173), migration 024 giving `ledger_statistics` an account and
`list_account_transactions_page` a date range (D-174), the production picker's synthetic accounts
turning out not to be a seed leak after two sessions of believing they were (D-175), and 024
reaching hosted along with the correction that an agent could not push it (D-176). The controls that
migration was written for are D-177 and D-178, which stay in the maintained file.

`scripts/check-docs.mjs` pools this file with `DECISIONS.md` and every other archive and checks ids
for duplicates and omissions across the whole set, so the ids stay whole and the maintained file has
never been required to be contiguous.

## D-171 — The tenth boundary moves the question that had fenced the file, and stops below the two changes nobody has looked at

- Date: 2026-08-29
- Status: **Done, uncommitted.** `docs/decisions/ARCHIVE-D-153-D-168.md` (new), `DECISIONS.md`, `HANDOFF.md`, `PLAN.md`. No code, no SQL.
- Context: this file reached **103,210 of its 120,000-byte budget (86%)** after four entries in one day. D-169 closed D-153, which had fenced it from below since the eighth boundary priced a deeper cut and refused it.

### Six entries — D-153 with D-164 … D-168

**D-153 moved because a question closed, the third boundary running to be bought that way.** D-140's test applies cleanly: `DEFAULT_FONT` is `pixelify-sans`, the owner chose it, and `tests/ui-font.test.ts` now asserts the invariant that outlives the choice rather than the choice. D-164 predicted this cut in as many words and D-167 repeated the prediction.

The five behind it closed on each other and on it. **D-164 and D-167** are the eighth and ninth boundaries, and a boundary entry is answered by the next one — this is their answer. **D-166** is the measurement that said a face change moves nothing vertical, which is what D-169 acted on. **D-165** is the `include_in_reporting` control, shipped and verified in the running app on a real internal transfer.

**D-168 is the one that needed an argument, and it moved on the strength of the reading that produced it** — the live look that put `.link-button` on screen at all, a control that renders only when there are more rows than the page holds. Its own fix shipped in `24b894a` *after* that reading and has not been re-read live. It moves anyway, because 18px of line plus 13px either side is arithmetic rather than a rendering judgement, and because the 390px audit was repaired in the same change and passes on five routes plus a disclosure-open pass. **That is a weaker claim than the other five and is recorded as the weaker one.**

### The step-over, for the second boundary running

D-154's rule is what makes this a range rather than three cuts, and the ninth needed the same step in the same two places. **D-158** is unchanged: the unbounded candidate scan, in its own migration comment, unfixed. **D-141** sits below the range, deferred by the owner. **D-161 is the interesting one — half of it closed today and the half that stayed is why it is still a fence**: D-170 shipped the window picker, so `p_from` and `p_to` are no longer parameters nothing sends, but the account filter needs migration 024, a verified backup and the owner's own `db push`. An entry that is half-answered is still asking.

### It stops below D-169 and D-170, and that is the judgement in this entry

Both shipped on 2026-08-29, **both change what renders**, and **nobody has looked at either on the deployment**. The last browser reading was taken before either landed.

D-164 refused to archive a measurement in the session that revised it, because that files a live argument as settled. **The same reasoning refuses to file a rendering change as settled before anything has rendered it where the owner can see it**, and this repository has paid twice for the distinction: `76dc46b` reached Ready and shipped a defect the owner found on his own phone minutes later (D-138), and looking at the deployed ledger found three things a green gate could not, one of them a control rendering as prose (D-159).

**This is a fence the first nine boundaries never met, and naming it is the transferable part.** The other four are *unanswered questions* — something undecided, or recorded and unfixed. This one is an *unverified rendering*: the argument is finished and the decision is the owner's and final, and the only thing missing is that nobody has seen the result. It is the weaker of the two kinds and **should expire the moment either page is looked at**, so it is written as a condition rather than as a property of those entries.

**The cost was priced, not assumed.** Taking D-169 and D-170 as well would have reached **53%** instead of 61% — two entries, about 9 KB. At 61% this file has more headroom than any boundary since the seventh left it.

### Mechanics, and the prose the guard cannot see

**Byte-identity was proved by diff against `git show HEAD:DECISIONS.md` rather than by reading**, normalising line endings first: git stores this file with LF, the working copy is CRLF, and three of the six had picked up bare LF from an agent's own edits. **No entry in the range carried a relative link**, checked before the move — D-154's advice, discharged for the third time.

**Three preamble paragraphs were replaced rather than annotated.** `check:docs` validates the index against the entries and that links resolve; it structurally cannot ask whether the prose describing the archives is true (D-164). All three were about to become false: what this file carries, the count of relocated ranges, and the paragraph naming the eighth and ninth as the ones to read before the tenth.

- Evidence: **103,210 → 72,997 bytes, 86% → 61%**, as `check:docs` reports it. **171 decisions across eleven files**, index matching one for one, `pnpm check:docs --strict` clean. **No test, migration or build re-run, deliberately** — nothing outside `docs/` and the continuity files moved. D-133 (the rule), D-140 (the test), D-154 (the step-over), D-164 (the eighth, and the prediction this confirms a third time), D-167 (the ninth, and the rate), D-169 (the closing that bought this cut), D-138 and D-159 (why an unlooked-at rendering fences), D-130 (the budget).

## D-172 — The window picker's state moves into the address bar, and a preset is written by name while a custom range is written by its dates

- Date: 2026-08-29
- Status: **Accepted, uncommitted.** `lib/statistics.ts`, `app/statistics-view.tsx`, `tests/statistics.test.ts` (+10). No SQL, no route, no contract change.
- Context: D-170 shipped the window picker as component state, so a reload returned to All time and a chosen window could not be linked to. The owner asked for it on 2026-08-29.

### The asymmetry is the design, not an inconsistency

**A preset is encoded by name; a custom range is encoded by its dates.** A preset is a *rolling question* — "This month" should mean this month whenever the link is opened — so resolving it to dates before writing it down would freeze it into the question it happened to answer on the day it was copied. A custom range is already a pair of dates and has no name to give it. All time encodes to nothing, so a bare `/statistics` stays unambiguous.

This is **not** `windowSearch`'s encoding, which always sends resolved dates because the RPC has no notion of a preset. The keys overlap deliberately: a bare `?from=…&to=…` with no preset named is read as a custom range, because those are the route's own parameters and hand-editing them was the only way to select a window for the two days before the picker existed.

### `window` and `custom` are separate keys, and folding them was a real defect

The first version wrote `window=custom` — one key carrying both the preset and the override — which **dropped the preset underneath it**. Ticking Custom on top of "This year" and unticking returned to This year in-session, but after a reload of the very URL the page had just written, unticking landed on All time. **The control behaved differently depending on whether the page had been reloaded**, which is the worst kind of difference because nothing on screen distinguishes the two states. Found by `/code-review high`. `window=custom` is still *read*, so a link written before the split still opens the window it names.

### Written with `history.replaceState` rather than the router

`router.replace` is the idiomatic call and the wrong one: `/statistics` is `force-dynamic`, so a router navigation fetches a fresh RSC payload from the server to move text in the address bar. **Replace and not push**, because the picker is a filter — pushing would make Back walk through every chip ever pressed, and the way out of a window is to choose another one.

Read once, in a lazy initialiser, and written by an effect: one direction each way, so the URL and the state cannot develop a disagreement with themselves. Safe against a hydration mismatch because the page is `force-dynamic` — the server renders with the request's own parameters.

- Evidence: `lib/statistics.ts`, `app/statistics-view.tsx`, `tests/statistics.test.ts`. Vitest **890 passed / 7 skipped across 41 files**. **Red-proved**: mutating `pickerSearch` to encode presets as resolved dates fails exactly the three rolling-question assertions, including the one written for it. D-170 (the picker this completes), D-162 (why a window's extent is reported as requested).

## D-173 — The phone audit stops being a throwaway, and its first committed run found a control that had been escaping the viewport since before the audit existed

- Date: 2026-08-29
- Status: **Accepted, uncommitted.** `tests/e2e/owner-phone-audit.spec.ts` (new), `playwright.owner.config.ts`, `playwright.isolated.config.ts`, `app/globals.css`. PLAN task 51, decided by the owner. No SQL, no route, no contract change.
- Context: D-168 found `.runtime/mobile-audit.spec.ts` had been blind at phone width for three days and nobody could have noticed, because a gitignored throwaway only fails when someone asks it to run.

### What changed in the port, and none of it is cosmetic

**It asserts instead of reporting.** The throwaway printed a list because PLAN task 28 was unscoped and no standard had been agreed. D-168 set one — 44px, at phone width only, per D-139 — and a standard nobody checks is a preference.

**It seeds 120 rows rather than 6.** The page holds 100, so `Load older rows` renders. That is the control D-168 could only see because the owner opened a 1,604-row ledger in a narrow window: *a surface that exists only with enough data behind it*, which invented fixtures are structurally unable to produce unless they are sized to produce it.

**Every route is measured twice, disclosure shut and open**, and `/statistics` a third time with the Custom tick on. The throwaway opened the disclosure on `/ledger` alone, so the privacy chip and font picker were never inside a measured viewport. The third pass came from `/code-review high`: `.window-custom input[type="date"]` renders only after a tick, which put it inside **this file's own definition** of a surface no walking audit can measure.

**All three Playwright configs key off an `owner-` prefix now.** An enumerated pattern would have left this spec uncollected by the owner config and collected by the other two — the failure the file exists to record, on the file recording it. `owner-access.spec.ts` taught this lesson once already (D-149's era); a pattern naming one file is a list of one.

### The defect it found on its first run

**`/ledger` panned sideways at 390px.** The account filter `<select>` measured **404px in a 390px viewport** and took `documentElement.scrollWidth` to 420. A `<select>` is as wide as its longest `<option>`, and its automatic minimum blocked the grid track from shrinking even though the phone rule already sets `minmax(0, 1fr)`.

**The rule predates D-168, so the audit missed it rather than the defect being new.** The committed version waits for the table *and* `Load older rows`; the throwaway waited a fixed 1500ms and measured before the account list arrived. **It is data-dependent** — the overflow is a function of how long the account labels are — so the same layout is clean for one ledger and broken for another. D-138's family from a fourth direction.

**Which line fixes it was measured, not asserted.** `min-width: 0` and `max-width: 100%` are both required; each alone leaves the audit red. A `min-width: 0` on `.account-control` itself was tried and changed nothing, so it is not in the file — D-166's rule, that a comment saying *measured* is a claim that has to be true.

### The reference an overflow check compares against

Measuring every element against the viewport flagged `/import`'s stage list, 810px inside a container that scrolls on purpose. The question is now whether an element escapes **its own scroll container**, with whether the document pans asked separately. A deliberate scroller may be wider than the screen; nothing may spill out of the box holding it.

- Evidence: the files above. Owner suite **34/34** (was 33/33). Isolated **38 passed / 4 skipped**, Vitest **890 / 7 skipped across 41**, `tsc`, `eslint`, `check:docs --strict`, build all clean, exit codes read individually rather than from a chained run (GOTCHAS). **Red-proved**: reverting the CSS returns the audit to red on the exact selector. **390px is not a phone** and this does not claim otherwise — Chrome clamps a real window near 500px, so emulation is the only thing reaching 390 here, and D-138 stands. D-168 (the blindness), D-139 (the rule), D-157 (what hid the sign-in), D-156 (why the `(i)` is load-bearing).

## D-174 — Migration 024: statistics take an account, and the balance series needs two sources because one account's truth is printed and the ledger's is derived

- Date: 2026-08-29
- Status: **Written, applied to `private-ledger-local` only, and NOT on hosted.** `supabase/migrations/202608290024_statistics_account_and_ledger_dates.sql` (new), `supabase/tests/012_statistics_account_and_ledger_dates.sql` (new, 31), `supabase/tests/009_ledger_paging.sql` and `011_ledger_statistics.sql` (signature assertions). PLAN task 46's second half, plus the ledger date range task 47 turned out to need first. **No table, no column, no trigger, no new grantee; backup contract stays v7.**
- Context: the owner authorized task 46 in full on 2026-08-29 and chose, on the calendar heatmap, to have the ledger's date filter built first and see whether the heatmap was still wanted.

### Two features in one migration, because the cost is per-migration

Each needs a signature change on a function the app already calls, and therefore a `db push` against hosted, a backup verified from the database first, and the owner running it himself (D-152). Two migrations would be two of each. Migration 017 bundled for this class of reason (D-104) — pieces designed together because the operational cost does not divide by feature.

### 023 argued against an account filter, and the argument turned out to be its specification

023 said *"the balance series is the combined position by construction, and an average whose denominator changed with a filter would be a different figure wearing the same label."* Both halves are still true and neither is an objection. Every average divides by **days in the window**, not by rows, so narrowing changes the numerator and leaves the divisor alone. What needed deciding was the chart:

- **All accounts** — `private.combined_balances`, the derived running total (022). Nothing prints it.
- **One account** — that account's own **printed** `post_balance_minor`. 022's own reasoning: the printed balance is the truth, and a derived figure drifts from it across a gap between two separately imported statements.

**The tidy implementation is the wrong number.** Restricting `combined_balances` to one account's rows yields the *combined* position sampled at that account's dates — a real figure answering a question nobody asked. The pgTAP fixture is chosen so the two disagree on the same day, 113059 against 43058, and replacing the function with that tidy version fails exactly the two assertions written for it.

### The window resolves inside the account

An unbounded window now starts at the chosen account's own first row. An account opened last month has no history before that, and inheriting the ledger's span would divide its figures by years it did not exist for. "All time" means all of *this* account's time.

### The ledger's bounds are not the ledger's cursor

`list_account_transactions_page` already took `p_before_date`/`p_before_time`. Those are a **cursor**; `p_from`/`p_to` are **bounds**. The cursor walks inside the bounds, so a window narrower than a page still pages. **`totals.rows` describes the window when bounds are supplied and only then** — absent bounds, 023's contract is reproduced exactly.

**One thing the window must not reach**: the combined balance on a row. It is a fact about the whole ledger up to that row, so recomputing it from the windowed rows would restart the running total at the window's edge and print a figure belonging to no account on any date. Asserted directly — a one-day window on one account still carries the whole-ledger figure.

### Old signatures are dropped rather than left

A defaulted parameter added to an existing function is an **overload**, not a replacement, and `ledger_statistics(p_from => x, p_to => y)` would then be ambiguous. Dropping is what makes this a change rather than a fork. **Three `has_function_privilege` assertions failed loudly on the old signatures** — in 011 and, missed on the first pass and caught by `/code-review high`, in 009. That is the check working: a grant assertion silently passing against a signature nobody calls would be a stale exemption.

- Evidence: pgTAP **009: 33, 011: 35, 012: 31**, all against `private-ledger-local`. The partition reconciles — per-account totals sum to all-accounts on deposits, withdrawals, row count and excluded count, written as arithmetic on returned values rather than hard-coded numbers. Owner suite **34/34 against the migrated database**, which is what shows the app's existing calls still resolve through the new defaults and makes a database-first push safe. **`pnpm supabase:test` was not run as a whole**; the three affected files were run directly. **Nothing is built on top of this yet** — neither control exists, deliberately, because the database goes first. D-158 and D-161 (the follow-ons this answers), D-160 (statistics in SQL), D-152 (the backup rule this still owes), D-104 (why one migration).

## D-175 — The production picker's synthetic accounts were not a seed leak, and the hypothesis that said so survived two sessions until one value-free query killed it

- Date: 2026-08-30
- Status: **Done.** Three rows deleted from `public.accounts` on the hosted project by the owner. **No migration, no code, no schema change** — a scoped `delete` run in the dashboard SQL Editor. PLAN task 50.
- Context: the first browser reading of the deployed `/ledger` (D-168) found the account picker offering **six** accounts, three of them `Synthetic … ···· 4242` with zero rows. The owner authorized deleting them on 2026-08-29.

### The leading explanation was wrong, and it was wrong for two sessions

`supabase/seed.sql` inserts exactly those three labels, and `config.toml` has `[db.seed] enabled = true`, so **the seed reaching production was the obvious reading** — and it was written into `HANDOFF.md` as such. It also implied something much worse than three empty rows: the same file inserts a synthetic `auth.users` row and calls `bind_ledger_owner`.

**It is refuted.** Read from hosted: **no `synthetic.owner@example.invalid` in `auth.users`**, `ledger_owners` holds one row and it is not the synthetic id, and **no `categories` or `mutation_sequences` rows** for it. The seed inserts that user in its *first* statement, so it never ran there.

### What was actually true, and why it stops being alarming

The three accounts carried the seed's **exact primary keys** while being **owned by the real owner**, and they **predate all three real accounts**. The seed pins `owner_id` to the synthetic id, so it cannot have written them.

That fingerprint — keys preserved, ownership rewritten to the caller — is what `public.restore_backup` does (D-013). A synthetic backup restored into the new hosted project during setup fits it exactly; so does hand-setup at the same moment. **Nothing distinguishes the two and nothing turns on which**: both are historical, neither can recur, and no process needed changing. That is the finding that made this a deletion rather than an incident.

### The method is the transferable part

**Every question was answered with counts and booleans.** The diagnostic returned nine labelled rows, none of them a label, a digit, a date or a balance, so the owner could paste the result back verbatim with nothing to redact. The provenance question — *did these predate the real accounts* — was asked as a single `boolean` rather than by reading `created_at`. **No real value was read or written anywhere in this investigation**, and it was not a constraint that cost anything: the value-free form was also the form that answered fastest.

**"Success. No rows returned" is not a row count.** The dashboard says that for any statement with no result set, so a guarded `delete` that matched nothing looks identical to one that matched three. The count came from a separate `select` afterwards. D-152's rule in a new place: a claim is not a measurement.

### The delete, and what it deliberately could not do

Scoped to three primary keys, and **self-guarding**: `owner_id = (select owner_id from public.ledger_owners)` plus a `not exists` against each of the three tables holding a foreign key to `public.accounts` — `source_transactions`, `import_batches`, `notification_cards`. It **cannot remove an account holding anything**, so the dependency check was evidence rather than the safety mechanism. `public.accounts` has **no triggers**, so the delete is neither refused nor audited and does not move `mutation_sequences` — which is why one verified backup covered this and migration 024 together.

- Evidence: read back from hosted — **3 accounts remaining, 0 labelled `Synthetic%`**. Backup **verified from the database first**, sequence 39 / last_exported_sequence 39 with a record at 39 (D-152). **This is the one change to the real ledger the audit trail does not record**, which is the cost of there being no delete path in the app at all: `202607270010_account_creation.sql` revokes `insert, update, delete on public.accounts from authenticated`. D-168 (the reading that found them), D-013 (the restore semantics that explain them), D-152 (the backup rule), D-060 (why every figure here is a count).

## D-176 — Migration 024 reaches hosted, and the claim that an agent could not push it was wrong

- Date: 2026-08-30
- Status: **Done.** `supabase db push --linked` applied `202608290024` to the hosted project. No code, no continuity change beyond this. Supersedes **D-174**'s status line, which said the migration was on `private-ledger-local` only and not on hosted — true when written.
- Context: D-174 wrote the migration and left it unpushed, correctly, because a push needs its own ask and a backup verified from the database.

### The preconditions, met in order

**The backup was verified from the database, not taken on report** — `sequence` 39, `last_exported_sequence` 39, one `backup_records` row at 39, read from hosted before anything was written (D-152). **A `--dry-run` ran first** and named exactly one file, which is the check that the push is the change it is believed to be rather than a batch nobody counted. Then the push, exit 0, and `supabase migration list --linked` read back showing **all 24 migrations matching local and remote**.

### The correction, which is the part worth carrying

**A previous session asserted that an agent could not reach hosted at all, and that was wrong.** The reasoning was: no access token in the dotfile locations, no `SUPABASE_ACCESS_TOKEN`, no `SUPABASE_DB_PASSWORD`, no `PGPASSWORD`. All four readings were accurate; **the conclusion drawn from them was not.** The Supabase CLI on this machine is `node_modules/.bin/supabase`, is **not on `PATH`**, and holds its credentials somewhere none of those checks looked — `supabase migration list --linked` connects and reads the remote migration table without prompting for anything.

**D-108 already recorded an agent pushing 016, 017 and 018 on 2026-08-15**, with explicit authorization and widened access. The continuity docs had since acquired the shorter line *"the owner runs it"*, which described an arrangement rather than a capability, and it was repeated as though it were the latter.

*A partial check is evidence about what was checked, never about what was not.* The failure was not the four readings; it was answering a capability question with them and stating the answer with more confidence than they carried. **The owner is who noticed**, by asking whether this had been done before.

### What is still owed

**The function grants have not been read back from hosted.** D-108's push verified its effect rather than its having applied — `anon` privileges counted, not assumed. The equivalent here is that `public.ledger_statistics(date,date,integer,uuid)` and `public.list_account_transactions_page(uuid,integer,date,time,uuid,date,date)` are executable by `authenticated` and not `anon`, that both private helpers are executable by nobody, and that **the old 3-argument and 5-argument signatures are gone rather than sitting alongside**. The CLI has no arbitrary-SQL command, so that reading is the dashboard's and is not yet taken.

- Evidence: `--dry-run` naming only `202608290024`; push exit 0; `migration list --linked` showing 24 for 24. **The ledger was not read back for row counts or sequence afterwards** — 024 changes four function bodies and no data, so nothing should have moved, and that is a reasoning rather than a measurement. D-174 (the migration), D-152 (the backup rule), D-108 (the precedent this session forgot), D-094 (the hosted project).
