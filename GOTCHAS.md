# Private Ledger gotchas

Last reviewed: 2026-07-24

Record only repeatable, non-obvious traps. Each item states the symptom, cause, prevention, and verification.

## Windows project ownership can block safe edits

- Symptom: the safe editor reports an incorrect folder owner or `Access is denied`.
- Cause: the project root ACL owner differs from the logged-in user.
- Avoid: repair only the exact project root from an elevated PowerShell session. Do not recursively change unrelated directories.
- Verify: a small `apply_patch` succeeds and `Get-Acl` reports the expected owner.

## System Node is too old

- Symptom: ESM startup failures or inconsistent Next/Vitest behavior under Node 20.
- Cause: this project requires Node 24.
- Avoid: install Node 24 and use Corepack/pnpm from the lockfile. Do not “fix” ESM errors by rewriting dependencies.
- Verify: `node --version` is 24.x and lint, typecheck, tests, and build pass.

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

## Never use real statements to develop the parser

- Symptom: private PDF bytes, passwords, or values appear in logs, fixtures, screenshots, or commits.
- Cause: using `private-statements/` as convenient parser input.
- Avoid: use approved synthetic geometry fixtures only. A real-PDF smoke test requires renewed explicit authorization.
- Verify: privacy tests pass and repository searches contain no real values or statement passwords.
