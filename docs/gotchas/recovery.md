# Private Ledger gotchas — Backup, restore and recovery

Split out of `GOTCHAS.md` on 2026-08-25 (D-149), unchanged. **10 traps.**

`GOTCHAS.md` keeps the index across every section and is still the way in — it lists every
trap in this file, so a reader finds the one that applies without loading any body. Add a trap
here and add its title to that index; `pnpm check:docs --strict` fails if the two disagree.

Each trap states the symptom, cause, prevention, and verification. What a date on a `Verify:`
line means, and what a backfilled `Dated <date> from <sha>` clause does not, is explained at
the top of `GOTCHAS.md`.


## Snapshot generation is not backup custody

- Symptom: the UI reports a current backup even though encryption or download failed.
- Cause: freshness was marked before the client possessed the encrypted artifact.
- Avoid: snapshot first, encrypt and hand off the artifact, then acknowledge its digest and sequence. Reject acknowledgement if the ledger sequence changed.
- Verify: failure before acknowledgement leaves backup status stale. Dated 2026-07-24 from `9203a87`, the foundation commit that introduced `last_exported_sequence` and the acknowledge-after-handoff flow.

## Restore sequence semantics must be exact

- Symptom: zero, duplicate, or mismatched mutation-sequence rows are accepted.
- Cause: treating the last available row as authoritative.
- Avoid: require exactly one sequence row equal to the manifest snapshot sequence; apply one post-restore increment and mark stale.
- Verify: manifest/data sequence mismatch and duplicate-row tests are rejected. Dated 2026-07-25 from `5e4c5bb`, the commit that added migration 006's sequence bounds (D-013).

## `.pldemo` is intentionally non-restorable

- Symptom: a user assumes the synthetic UI download can recover the ledger.
- Cause: confusing an encryption demonstration with the schema-v2 backup contract.
- Avoid: preserve its `.pldemo` extension and preview labeling; never clear backup staleness from this path.
- Verify: 2026-08-10. `.pldemo` is still produced by live code — `lib/download.ts`, `app/recovery-bench.tsx`, `app/import-bench.tsx` and the owner spec all reference it — so the mistake it warns about is still reachable from the running app. It reads like a design note, but the symptom is a person mistaking a demo file for their backup, which is a trap and belongs here.

## Schema version 1 has no upgrade promise

- Symptom: old pre-release backup files fail schema-v2 restore.
- Cause: v1 existed before real-data authorization and was retired rather than migrated.
- Avoid: do not advertise v1 compatibility. Schema v2 is the first supported recovery contract.
- Verify: 2026-08-10, checked against the database rather than the docs. `restore_backup` refuses anything outside `('2','3','4','5')`, so no v1 file can be staged. Note the one place that still says otherwise: `restore_runs_schema_version_check` reads `schema_version = ANY (ARRAY[1,2,3,4,5])`, carried forward unchanged since the foundation migration. Harmless — `restore_backup` is the only writer and it refuses first — but the table and the function disagree on paper, so read the function, not the constraint, when asking which versions are supported.

## `restore_request` strips nulls inside the chunk, breaking digest binding

- Symptom: a hand-authored populated restore fixture fails with `restore chunk binding mismatch` even though the manifest and chunk look correct.
- Cause: the `pg_temp.restore_request` test helper wraps the whole request in `jsonb_strip_nulls`, which recurses into the chunk and drops any row field whose value is `null` (for example `source_transactions.branch`). The chunk sent to `restore_backup` then differs from the one `finalize_restore_fixture` hashed, so `sha256_jsonb(chunk)` no longer matches the descriptor digest.
- Avoid: give every nullable column a non-null value in populated restore fixtures, or build the request without `jsonb_strip_nulls`. Do not assume export→fixture round-trips are null-safe.
- Verify: the populated round-trip in `supabase/tests/003_restore_contracts.sql` stages all 11 chunks and its re-export equality assertion passes. Dated 2026-07-25 from `5e4c5bb`, which added the populated round-trip in `supabase/tests/003_restore_contracts.sql` that met this (D-013).

## Restore counts must be canonical integers, not merely JSON numbers

- Symptom: a fractional manifest count (e.g. `1.5`) fails with an uncaught `22P02: invalid input syntax for type integer` instead of a controlled contract error.
- Cause: validating counts only as `jsonb_typeof = 'number'` lets non-integers through to a `text::integer` cast.
- Avoid: require canonical non-negative integer text (`^(0|[1-9][0-9]*)$`) for `tableCounts[kind]` and each descriptor `rowCount` before any cast.
- Verify: the `003` fractional-count test expects `invalid restore manifest descriptor` and fails on the pre-006 schema. Dated 2026-07-25 from `5e4c5bb`, the commit that added migration 006 (D-013).

## A wiped ledger and a wiped session look the same from a failing restore

- Symptom: a browser test that empties the ledger and then restores it fails with `strong owner access required`, though the page is still signed in and the JWT still claims `aal2`.
- Cause: reaching for `resetOwnerImportSurface` to empty the ledger. It also deletes the owner's `auth.mfa_factors`, and `private.has_strong_owner_access` counts verified factors in the database rather than trusting the token — so the session the restore needs is gone with the rows.
- Avoid: for a mid-test wipe, delete the ledger tables directly under `session_replication_role = replica` and leave `auth` alone. Keep `resetOwnerImportSurface` for setup and teardown, where dropping the factors is harmless.
- Verify: `tests/e2e/owner-session.spec.ts` "backs up a confirmed ledger and restores it after the ledger is destroyed" restores under the same session that took the backup. Dated 2026-07-27 from `b4df30c`, the commit that added the destroy-and-restore browser spec this was found in (D-046).

## A cleanup helper that predates a migration makes the next restore fail, at commit, naming no table

- Symptom: a restore stages cleanly, every chunk is accepted, and then `commit` refuses because the destination is not empty — with nothing to say which table is not empty. The suite that ran before it passed.
- Cause: `restore_backup` checks emptiness across the tables the **destination's own migration** knows about, which grows with every schema version. A test helper that empties the destination by naming tables is a hard-coded list frozen at the day it was written; `tests/recovery-portability.test.ts`'s cleared only the original eleven while the destination had since gained `slips`, the two match-decision tables and migration 013's five. A row left in any of them is invisible to the helper and fatal to the next restore.
- Avoid: derive the cleanup from `BACKUP_TABLE_KINDS` rather than from a literal list, so a new backup table is cleared by the same change that adds it — the same "build it from the contract, not from memory" rule `lib/restore-plan.ts` follows for the kind list. Keep `mutation_sequences` out of it: that row is a per-owner singleton the destination must retain.
- Note where the cost lands, which is what makes this worth an entry: the failure surfaces at the **end** of the sequence, so every chunk has to be re-sent to reach it, and the message is about emptiness rather than about the table — so the natural suspicion is the restore contract rather than the fixture that ran before it.
- Verify: 2026-08-10. Adding a second restore test to that file surfaced it immediately; deriving the delete list from `BACKUP_TABLE_KINDS` fixed it and left the original test passing unchanged (D-089).

## A wrong backup password and a corrupted backup file report identically

- Symptom: Recovery / 04 reports "The backup could not be decrypted. Check the password; if it is right, the file has been altered", and there is no way to tell from the app which of the two it is.
- Cause: AES-256-GCM authenticates ciphertext and key together, so a wrong PBKDF2 key and a tampered ciphertext both surface as one auth-tag failure. The hedged wording is honest rather than evasive.
- Avoid: diagnose the envelope separately before suspecting the file. `lib/backup.ts` wraps the ciphertext in plain JSON — header, base64 salt and nonce — and corruption from a move, a sync client or a re-encode breaks *that* long before it reaches the cipher. If the JSON parses, the header matches exactly, the salt is 16 bytes and the nonce is 12, the file is intact and the password is the remaining explanation. This reads no plaintext and needs no password.
- Verify: done on the real 2026-07-28 backup after a failed restore — 14,784 bytes, envelope structurally perfect, so the file was exonerated without anyone typing a password. Moving a file between volumes copies its bytes; it cannot change them.

## A recovery destination can start non-empty, which makes portable recovery fail rather than skip

- Symptom: `node scripts/recovery-destination.mjs up` reports `This project is NOT empty — a restore into it will be refused`, and `tests/recovery-portability.test.ts` then fails rather than skipping. This is a **third** reading of that gate row, and the one nobody expects: the two documented outcomes are "ran" and "skipped", and both of those are readings of a destination that is either up or down.
- Cause: `up` starts and migrates the project; it does not discard what an earlier run left in it. `restore_backup` refuses a destination holding any owner record, so leftovers from a previous run make every restore fail at commit — after every chunk has been accepted, with a message about emptiness that names no table.
- Avoid: `down` then `up`, always, before a run that matters. `up` alone is only safe on a destination nothing has ever restored into.
- Verify: 2026-08-12, twice. First met with 4 ledger accounts left behind, where `down` then `up` gave a clean destination on migration 015; met again the same day taking the destination to 016, where `down` then `up` was run pre-emptively and reported `Ledger accounts: 0`.
