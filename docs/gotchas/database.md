# Private Ledger gotchas — Database, migrations and pgTAP

Split out of `GOTCHAS.md` on 2026-08-25 (D-149), unchanged. **15 traps.**

`GOTCHAS.md` keeps the index across every section and is still the way in — it lists every
trap in this file, so a reader finds the one that applies without loading any body. Add a trap
here and add its title to that index; `pnpm check:docs --strict` fails if the two disagree.

Each trap states the symptom, cause, prevention, and verification. What a date on a `Verify:`
line means, and what a backfilled `Dated <date> from <sha>` clause does not, is explained at
the top of `GOTCHAS.md`.


## `trigger_is` argument count is easy to misread

- Symptom: pgTAP reports that a human description such as “components are immutable” is the expected trigger function.
- Cause: omitting the function-name argument selects a different `trigger_is` overload.
- Avoid: pass schema, table, trigger, function schema, function name, then description.
- Verify: the three immutability assertions in `supabase/tests/001_security.sql` pass. Dated 2026-07-24 from `9203a87`, the foundation commit that added `supabase/tests/001_security.sql` and its three immutability assertions.

## JSON numbers cannot carry PostgreSQL bigint safely

- Symptom: values above JavaScript’s safe integer range are rounded before validation or hashing.
- Cause: parsing signed-int64 money or sequences as JSON numbers.
- Avoid: require canonical decimal strings at every HTTP/backup boundary and validate range before SQL casts.
- Verify: numeric `9007199254740993` is rejected and signed-int64 min/max strings round-trip. Dated 2026-07-24 from `9203a87`, which introduced `private.is_canonical_int64_text` and the canonical-string money boundary (D-002).

## SQL `NULL` can bypass ordinary inequality checks

- Symptom: a malformed manifest field reaches later restore logic instead of being rejected.
- Cause: SQL three-valued logic makes `NULL <> value` evaluate to `NULL`, not `TRUE`.
- Avoid: require object types and exact keys, add explicit null guards, and use `IS DISTINCT FROM` where appropriate.
- Verify: missing/null descriptor and mismatched-count tests fail closed. Dated 2026-07-25 from `5e4c5bb`, the commit that hardened the restore contracts with explicit null guards (D-013).

## Fingerprint-bound imports change what pgTAP fixtures may assert

- Symptom: after migration 008, a contract test that hand-writes a `fingerprint` literal fails with `fingerprint mismatch`, or an overlap fixture stops linking to the existing transaction.
- Cause: `confirm_import` now derives the fingerprint from the row's identity facts, so a literal is only accepted when it equals the derived value. Two rows can no longer be made to collide by sharing a literal, and a row can no longer differ in `description` yet claim another row's fingerprint.
- Avoid: let `pg_temp.confirm` inject derived fingerprints by default; pass `p_bind_fingerprints => false` only when the test needs a wrong or deliberately colliding claim. For overlap fixtures, make the fingerprint inputs identical and vary only `provenance`, which is not fingerprinted.
- Verify: `002` test 23 expects `fingerprint mismatch` and fails on the pre-008 schema; the overlap test still asserts `linked_existing`. Dated 2026-07-25 from `eda30bc`, the commit that added migration 008 and bound fingerprints server-side (D-014).

## Order of checks in confirm_import decides which error a fixture sees

- Symptom: a test expecting `fingerprint mismatch` gets `ambiguous duplicate fingerprints` or `payload digest mismatch` instead.
- Cause: `confirm_import` validates the digest and the distinct-fingerprint count before entering the per-row loop where the fingerprint is recomputed.
- Avoid: give a fingerprint-mismatch fixture a fresh artifact and idempotency key, a correct digest, and a single row, so nothing earlier can raise first.
- Verify: `002` test 23 passes with migration 008 applied and fails only on the expected missing exception without it. Dated 2026-07-25 from `eda30bc`, the same fingerprint-binding commit as the trap above (D-014).

## A restore can leave the audit_events identity sequence behind an existing id

- Symptom: an import that worked yesterday fails with `duplicate key value violates unique constraint "audit_events_pkey"`, naming an id that already exists, on a database nobody changed.
- Cause: `public.audit_events` is append-only, so rows accumulate, while `public.restore_backup` re-inserts audit rows with explicit ids and then sets the identity sequence to `greatest(max(id),1)`. A restore that ran while the table was empty or held only low ids leaves the sequence at or below an id a later run re-introduces, and the next audit insert collides. The failed insert consumes a value, so a retry can appear to fix itself — which is what makes this look intermittent.
- Avoid: in tests, clear the owner's audit rows and realign the sequence together — `resetOwnerImportSurface` in `tests/helpers/local-owner.ts` does both. In product code, leave the `setval` in migration 006 alone; it is correct for the table it is given.
- Verify: `select last_value from public.audit_events_id_seq` is at least `max(id)` from `public.audit_events`. When it is lower, `tests/import-confirm-e2e.test.ts` fails on its first confirmation with a 409 whose body names `audit_events_pkey`. Dated 2026-07-25 from `381cbda`, the commit that added the `audit_events_id_seq` realignment to the test wipe.

## A hard-coded literal inside a security-definer function can gate a whole feature silently

- Symptom: a new bank's import fails with `fingerprint mismatch` — a message that names tampering — after every CHECK constraint has been widened and the client is demonstrably correct.
- Cause: `confirm_import` recomputed each row fingerprint with the literal `'KTB'` while the client hashes the statement's own bank code. The constant was invisible from the outside and produced an error that pointed at the caller.
- Avoid: when widening an enumerated value, grep the RPC bodies for the old literal, not just the constraints — `grep -n "'KTB'\|krungthai-layout-v1" supabase/migrations/` finds every one. Derive such a value from the row the server already trusts (here, the bound account) rather than restating it (D-041).
- Verify: the red proof in `supabase/tests/002_security_contracts.sql` — with the constraints widened but the literal left in place, the SCB import dies with `fingerprint mismatch` rather than passing. Dated 2026-07-26 from `192798f`, the commit that added migration 009 and took the fingerprint's bank code from the bound account (D-041).

## An id remapped in every column can still survive inside jsonb

- Symptom: a restore into a project bound to a different owner passes every ownership check — no row anywhere carries the previous owner in `owner_id`, `actor_id` or `changed_by` — and that owner's uuid is still in the database.
- Cause: `overlay_revisions.snapshot` is `to_jsonb` of the whole overlay row, so it embeds `owner_id` as data. Foreign keys, RLS and column-level assertions all look past it. `restore_backup` merges `jsonb_build_object('owner_id', v_owner)` over the snapshot precisely to rebind it.
- Avoid: when checking a remap, check the jsonb payloads as text as well as the columns, and build the fixture the way the product builds the row — a hand-written snapshot that embeds no owner id cannot fail this test, which is how the first version of it passed for the wrong reason.
- Verify: `tests/recovery-portability.test.ts` asserts no `overlay_revisions.snapshot` mentions the source owner. Red proof: strip the merge from the destination's `restore_backup` and that one assertion fails while every column-level check still passes. Dated 2026-07-27 from `db87117`, the commit that added `tests/recovery-portability.test.ts` and found this (D-044).

## Per-slip mutable state cannot be a column on `public.slips`

- Symptom: the obvious design for "remember which statement row this slip matches" — a nullable column on `public.slips` — fails at run time with the trigger's own refusal, not at design time.
- Cause: migration 011 puts `slips_immutable before update or delete` on the table, calling `private.reject_change()`. Slips are append-only like every other ledger-fact table, so **no** column on them can ever be updated, whatever it holds. The same is true of `source_transactions`; the ledger's answer to mutable per-row state is the `transaction_overlays` + `overlay_revisions` pair, where the current value lives in one table and the history in an append-only other.
- Avoid: put per-slip decisions in a separate append-only table keyed by slip, where the latest revision wins, and reach for the overlay pattern rather than a column. Note the knock-on before starting: any new owner-record table is a table the backup must carry, so it bumps the backup schema version and every older version must stay restorable (`SPEC.md` gate 6, D-056).
- Verify: 2026-08-01, while designing the second half of task 22. Reading migration 011 before writing 012 is what caught it; the column design would have failed on its first update.

## A replica-mode wipe deletes parent rows without complaining about their children

- Symptom: nothing at all, for as long as it takes to matter. Later, a slip appears in a fresh run already carrying a decision nobody made, or a restore into an apparently empty ledger refuses with `restore destination ledger is not empty`.
- Cause: `resetOwnerImportSurface` and the mid-test wipes run under `session_replication_role = replica`, which is there to get past the append-only triggers — but it disables **foreign-key** triggers too. Deleting `public.slips` while `public.slip_match_overlays` still references it therefore succeeds and orphans the children, where the same delete in ordinary mode would have failed loudly and told you exactly which table you forgot. The gap arrived with migration 012 and could not surface until something wrote a decision from a test.
- Avoid: when a migration adds a table referencing an existing one, add its delete to every wipe **above** the parent's, in child-first order, in the same change as the migration. Do not rely on the delete failing to remind you — under replica mode it cannot. `restore_backup`'s emptiness check is the other half of the cost: it counts every owner-record table, including ones a wipe forgot.
- Verify: 2026-08-07. `tests/helpers/local-owner.ts` now deletes `slip_match_revisions` then `slip_match_overlays` then `slips`; `tests/slip-match-route.test.ts` writes decisions and leaves none behind, and the owner browser suite passes 19/19 with the restore specs running after it in the same file.
- **Met again on 2026-08-10**, exactly as predicted, for migration 013's five tables — the two correction overlays, their two revision tables, and `cash_entries`. The wipe now deletes all five, corrections above `slips` and cash in its own child-first group. Note the second half of the cost that 012 did not have: **a cash entry hangs off no account**, so `assertOnlyDisposableLedgerData` cannot see one — its whole signal is an unrecognised row in `public.accounts` — and a leftover cash entry would simply be counted into the next run's ledger totals as money that moved.

## `create_cash_entry` bounds no date, while `capture_slip` bounds one

- Symptom: a cash entry dated 2569 is accepted by the database without complaint, and appears in the ledger 543 years out. The equivalent slip is refused server-side with `outside the plausible window`.
- Cause: `capture_slip` (migration 011) checks the date against a plausibility window precisely because Thai receipts print Buddhist-era years; `create_cash_entry` (migration 013) checks only that the date is **not null**. The asymmetry is easy to miss because the two RPCs are otherwise near-twins, and easy to assume away because the form does bound it — `CASH_MAX_AGE_YEARS` in `lib/cash.ts` sets `min`/`max` on the date input and the API route trusts what zod parsed.
- Avoid: treat `app/cash-entry.tsx` as the **only** guard there is, and do not add a second caller of `POST /api/v1/cash` that skips it. Closing it properly means a new migration — 013 is applied and published, and this repository does not edit an applied artifact (D-084, and the same reason 014 exists rather than 013 being amended).
- Verify: 2026-08-10, by reading both RPCs side by side while writing the cash form. Not covered by any test: the suites go through the form or through a zod-validated route, so neither reaches the unbounded path.

## `supabase db query --linked` can answer from the local database, and the CLI names neither

- Symptom: a query meant for the hosted project returns correct-looking numbers that are actually the local project's. The output carries no indication of which database answered.
- Cause: the CLI falls back to the local database when the SQL spans multiple lines, and `--linked` after the SQL argument is not always honoured. Worse, the tell is gone: an earlier version printed `Connecting to remote database...` on the working path, and **v2.109.1 prints `Initialising login role...` and names neither remote nor local**. So the one-word check that used to distinguish them no longer exists.
- Avoid: pass the SQL as a **single line** with `--linked` **before** it, and then prove the destination rather than trusting the invocation. Three independent proofs, all cheap: `inet_server_addr()` returns a public address rather than a loopback or Docker one; the row counts match what the intended ledger holds; and `docker ps` says whether any local project could have answered at all — a stopped daemon rules them out entirely.
- Verify: 2026-08-12. All three were used to establish that the hosted backup verification read the hosted database, and the daemon happened to be down at the time, which is the strongest of the three. The missing tell was found by looking for it and reading a different first line.

## A new table is NOT born with zero privileges, and grepping the migrations cannot tell you what it holds

- Symptom: a table added by a recent migration silently carries `TRUNCATE`, `REFERENCES`, `TRIGGER` and `MAINTAIN` for **`anon`** and `authenticated`, while every migration in the repository appears to grant it nothing but `select`. Thirteen tables are in that state today — every `slips`, `cash_entry` and `notification_card` table, i.e. everything added after migration 002. `TRUNCATE` **bypasses RLS entirely**, so the row-level policies say nothing about it.
- Cause: two things compose, and neither is visible in this repository's SQL. Supabase's own bootstrap runs `alter default privileges in schema public grant ... to anon, authenticated, service_role`, which hands every **future** table created by `postgres` the `Dxtm` set. Migration 002 then runs `revoke all on all tables in schema public from anon, authenticated` — but that form expands **at execution time** over the tables then existing, so it cleaned up 001–002's tables and reaches nothing created afterwards. **No migration since has repeated it.** The later migrations revoke only `insert, update, delete`, which the default never granted, so those revokes are no-ops against the real default and the protection they look like they provide comes from those privileges simply never being granted.
- **Fixed by migration 018 as of 2026-08-15** (D-107), and the entry stays because the trap is about how to *reason*, not about the state it found. 018 revokes the inherited set from every existing table and sequence, re-grants `select` to `authenticated`, and — the part that matters here — runs `alter default privileges in schema public revoke all on tables / on sequences from anon, authenticated`, so a table added by migration 019 no longer inherits anything. The steady state is now one row: `authenticated | SELECT | 28`.
- Avoid: when adding a table, do not reason from the migration text. The defaults are handled now, so a new table starts with nothing — but confirm that from the catalog rather than from this sentence. Do not write `revoke insert, update, delete` and believe it did something; it did not before 018 and it does not after.
- Verify: **query the database, never the repository.** `select grantee, table_name, privilege_type from information_schema.role_table_grants where table_schema='public' and grantee in ('anon','authenticated')`, and `select defaclrole::regrole, defaclnamespace::regnamespace, defaclacl from pg_default_acl` for the defaults that produced it. Confirmed 2026-08-15 by actually doing it: `set local role anon; truncate public.notification_card_decision_revisions;` **succeeded**, inside a transaction that was then rolled back.
- **The meta-lesson, which cost a wrong entry in this very file.** The security review of migration 017 (D-105) grepped the migrations for `alter default privileges`, found none, and concluded that a new table starts with no privileges. That is a conclusion about the **database** drawn from a search of the **repository**, and it was wrong — the platform sets defaults the repository never mentions. D-106 records the correction. A grant question is a database question and only a database can answer it.

## Every push to `main` is a production deployment, including a docs-only one

- Symptom: the live app changes version without anyone deciding to deploy. Worse, the app can go live expecting tables the hosted database does not have yet — the exact inversion of the "migrations before the app" ordering rule — and the only symptom is a form that fails for whoever is using the ledger from their phone.
- Cause: the Vercel project is connected to this GitHub repository and builds on every push to `main`. **There is no separate deploy step to forget, and no separate deploy step to sequence.** Nothing in this repository shows it: there is no `.vercel` directory, no `vercel.json`, no Vercel dependency, and no `.github/workflows`. The wiring lives entirely in the Vercel dashboard, so grepping the repo says "nothing deploys" and is wrong. **A documentation-only commit deploys the code beside it**, which is how a push that changes no source can still put new source in front of the owner.
- Avoid: treat `git push origin main` as a deployment, because it is one. **The ordering rule therefore binds the push, not a later button**: migrations reach the hosted database *before* the commit that needs them reaches `main`, and if that ordering slips the remedy is Instant Rollback in the dashboard rather than a revert-and-push, which would itself be another deployment.
- Verify: read the Production Deployment panel in the Vercel dashboard — `Source` names the branch and the exact commit. Confirmed 2026-08-15 (D-109), where it read `main 943e143` minutes after that commit was pushed. **Do not read it off the deployment list**, which shows older builds beside the current one and is easy to misread as production; the Overview panel is the one that names what is serving.
- **What it cost before it was written down.** `HANDOFF.md` claimed for three days that production served the 2026-08-12 build, and nothing had ever checked. In fact every push since had deployed, so the card work went live on 2026-08-14 against a database still on migration 015 and stayed that way until 2026-08-15 — the ordering trap firing unobserved, in the window where card capture would simply have failed.

## A version or count written into `SPEC.md` is a claim no gate re-reads

- Symptom: every check is green and an invariant in `SPEC.md` contradicts the database. It has happened twice. On 2026-08-12 the strong-access rule said two verified TOTP factors where migration 015 had made it one, and it was wrong for a day. On 2026-08-15 gate 6 declared the backup contract as reading v2 … v6 and writing v6, which migration 017 had falsified when it landed.
- Cause: `check:docs --strict` reads **structure** — that files exist, that links resolve, that sections are present. It does not read meaning, and no automated check compares a number written in prose against the source that owns it. So a version, a count or a threshold in `SPEC.md` decays silently and the failure is invisible to the gate by construction.
- Avoid: when a migration moves a number that `SPEC.md` states, edit `SPEC.md` in the same commit as the migration. When reading `SPEC.md` later, treat every number in it as a claim to check rather than a fact to use — the owning source is `lib/backup-contract.ts` for backup versions, `lib/owner-access.ts` and `private.has_strong_owner_access` for the factor count. This is the same failure as a test title naming a destination that moves (`955253c`), and the same remedy: name the thing that does not move, or assert against the constant.
- Verify: 2026-08-15. Both instances were found by a human-style read — the first by a continuity sync, the second by a security review — and neither by any command. That is the point of the entry: there is no command to add.

## A correction overlay's `kind` and `amount_minor` are one fact, and writing either alone violates a check

- Symptom: a fixture insert into `public.slip_correction_overlays` fails with `new row … violates check constraint "slip_correction_overlays_check"`, naming a row that reads as entirely reasonable.
- Cause: the table carries `check ((kind is null) = (amount_minor is null))` and a second check that the sign agrees with the word. A corrected amount without its kind is not a partial correction, it is an invalid one — the same shape `public.notification_card_correction_overlays` uses.
- Avoid: always write the pair — `(slip_id, owner_id, kind, amount_minor, revision)`. This only bites fixtures that set a corrected figure directly; `set_slip_correction` fills both, which is why no application path meets it.
- Verify: 2026-08-27, building `supabase/tests/009_ledger_paging.sql`. The amount-only form raised the constraint by name; adding `kind` made the file green.

## A figure that is right and empty is not the same as a figure that works

- Symptom: the all-accounts balance column shows an em dash on every visible row of a paged ledger, on a design that was deliberately chosen to avoid printing a wrong number.
- Cause: the combined balance was derived on the client from a per-account window, and a window cannot know another account's history further back than its own rows reach. A **floor** was added so the column showed nothing below the date where every account's balance is known — correct, and useless in practice, because **the largest account sets the floor**: with about 1,259 / 248 / 97 rows across three accounts, the biggest one's window reaches back only a hundred rows and everything older goes blank.
- Avoid: when a derived figure needs facts from outside the unit being paged, compute it where all the facts are rather than suppressing it where they are missing. `private.combined_balances` (migration 022) does it in one window function over the whole ledger: `sum(openings) + running total of delta`, where **delta is the difference between printed balances, not the row's movement** — those agree only while a statement chain is intact, and across a gap between separately imported statements the printed balance is the truth.
- Also: the chronological ordering must be `compareTransactions` reversed **exactly** — `source_date asc, source_time asc nulls first, id DESC`. The id direction does not flip in the display sort, so negating the first two clauses and keeping the third gives a different sequence at every tie, and untimed rows sharing a date are ordinary here.
- Verify: 2026-08-27 (D-159). The blank column was seen on the real deployment; `supabase/tests/010_combined_balance.sql` pins the two-account case the client could never satisfy, recording the wrong figure as well as the right one.
