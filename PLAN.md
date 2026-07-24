# Private Ledger execution plan

Last verified: 2026-07-25

## Current checkpoint

The five high-risk backup and ledger findings from the original review have been implemented in `supabase/migrations/202607240004_backup_and_ledger_hardening.sql` and the related API/domain code. The four subsequent pgTAP review blockers are resolved: blocker 1 (digest trust) in `supabase/migrations/202607240005_confirm_import_digest_binding.sql` with matching client/pgTAP changes (DECISIONS D-012); blockers 3 and 4 (fractional restore counts, snapshot-sequence overflow) in `supabase/migrations/202607240006_restore_count_and_sequence_bounds.sql`; blocker 2 (empty-table restore) by a populated round-trip in `003_restore_contracts.sql` (DECISIONS D-013).

The blocker-1 fingerprint follow-up is now closed as well. Migrations `202607240007_fingerprint_functions.sql` and `202607240008_confirm_import_fingerprint_binding.sql` add `private.normalize_source_text` / `private.row_fingerprint` and make `confirm_import` recompute each row's fingerprint and reject a claim that does not match; `lib/statement.ts` constrains source text to the charset that keeps JS and PostgreSQL NFKC in agreement (DECISIONS D-014).

The local Supabase stack is running on its default Docker network. A clean reset applied migrations 001–004 and the synthetic seed, restarted the affected services, and left the project containers healthy. The unrelated older PostgreSQL and pgAdmin containers and the Windows PostgreSQL service were not modified.

Current focused verification:

| Check | Result |
| --- | --- |
| ESLint | Passed |
| TypeScript `tsc --noEmit` | Passed |
| Vitest | Passed, 45 passed / 1 skipped (adds 13 Krungthai geometry tests; JS↔PostgreSQL fingerprint parity ran against the live container — the skipped case is its unreachable-container reporter) |
| pgTAP | Passed, 84/84 with migrations 005–008 (001: 24, 002: 30, 003: 30). Red proofs: 002 test 19 fails pre-005; 002 test 23 fails pre-008 (`caught: no exception`) with the other 29 passing; 003 fractional-count and int64-max tests fail pre-006 |
| Production build | Passed |
| Playwright | Passed, 4/4 across desktop and mobile (dated 2026-07-24; not re-run for migrations 005–008 or the charset guard — no UI behavior change, but the charset guard is an unexercised import-path rejection) |
| Clean database reset | Migrations 001–008 and synthetic seed applied |

These results used the ignored project-local Node 24.18.0 runtime and pinned pnpm 11.17.0 because the system Node installation remains Node 20. A clean frozen install succeeds offline after explicitly allowing build scripts only for `esbuild`, `sharp`, `supabase`, and `unrs-resolver`.

Python 3.14.6 and PyYAML 6.0.3 are installed for local Codex skill scaffolding and validation. The project-local `$sync-continuity` skill under `.agents/skills/sync-continuity` passes the official skill validator and a read-only forward audit.

## Current review blockers

All four original review blockers are now resolved with red→green pgTAP evidence (2026-07-24), and the one carried follow-up (fingerprint binding) is also resolved (2026-07-25, D-014). No open review blockers remain.

1. ~~`confirm_import` trusts caller-supplied payload digests.~~ **Resolved** — migration `202607240005_confirm_import_digest_binding.sql` recomputes the canonical digest server-side and rejects mismatches (`payload digest mismatch`); the client computes the identical object (`confirmationDigest`). `002_security_contracts.sql` now uses real computed digests via a `pg_temp` wrapper and includes a tamper test (test 19) that fails on the pre-005 schema and passes after. See DECISIONS D-012. The fingerprint half of the finding is now closed by migrations 007–008 and the source-text charset guard — see DECISIONS D-014.
2. ~~`003_restore_contracts.sql` commits only empty ledger tables.~~ **Resolved** — `003` now populates every ledger table, exports a canonical snapshot, rewrites the owner to a foreign id, wipes, restores, and asserts a re-export reproduces every restored table byte-for-byte (schemas, FKs, money-as-text, audit rows) and that every row is remapped to the caller. See DECISIONS D-013.
3. ~~Restore manifest counts accept fractional JSON numbers.~~ **Resolved** — migration `202607240006_restore_count_and_sequence_bounds.sql` requires `tableCounts[kind]` and each descriptor `rowCount` to be canonical non-negative integer text, failing closed with `invalid restore manifest descriptor` instead of an uncaught `22P02` cast. Red proof: `003` fractional-count test fails on the pre-006 schema.
4. ~~A staged snapshot sequence at signed-int64 maximum overflows on the commit increment.~~ **Resolved** — migration 006 makes the accepted range explicit: `snapshotSequence` must be `< 2^63-1`, reserving headroom for the single post-commit increment. Red proof: `003` int64-max test fails on the pre-006 schema.

## Completed hardening

- Database-locked, count-checked backup snapshot with canonical text bigint boundaries.
- Manifest-bound schema-v2 restore with ordered table kinds, counts, chunk digests, aggregate digest, and exact mutation-sequence checks.
- Persisted statement frame and PostgreSQL reconciliation enforcement.
- Category mutation RPC with audit and backup-staleness sequencing.
- Backup freshness acknowledgement separated from snapshot retrieval.
- Synthetic `.pldemo` explicitly non-restorable and unable to clear authoritative backup staleness.
- Unknown deposit/withdrawal pairs fail closed unless parser provenance carries the recognized interest/tax anomaly marker.
- Strict per-table restore schemas and canonical signed-int64 string validation.
- Pre-release schema version 1 explicitly unsupported.

## Next local tasks

1. Add true multi-session concurrency coverage for the owner mutation advisory lock.
2. Add a real schema-v2 export → encrypt → decrypt → stage → chunk → commit → re-export equality integration test, including more than 1,000 rows.
3. Extract the statement **frame** from the PDF — account mapping (bank, type, last four), period, opening and closing balances, explicit THB currency. The transaction grid is done (D-015: `lib/krungthai-layout.ts`, synthetic fixtures, 13 tests, worker wired), but without the frame a parsed PDF still cannot become a confirmable `ImportPayload`, so the UI reports a row count and stops. Two-digit year resolution currently anchors on the current year and should anchor on the extracted period end.
4. Repeat privacy, browser-storage/network, accessibility, and interface-guideline audits.
5. Exercise the authenticated import path end-to-end. Note that driving the running app through the UI does **not** reach `confirm_import`: `confirmSynthetic` in `app/ledger-app.tsx` only sets browser state, and the sole route to the RPC (`/api/v1/imports/confirm`) is behind authentication plus `private.has_strong_owner_access` (aal2 + two verified TOTP factors). Reaching it needs a locally provisioned owner with enrolled factors. The JS/PostgreSQL fingerprint-agreement risk that motivated this item is now covered separately by `tests/fingerprint-parity.test.ts`, so what remains here is the HTTP/auth wiring, not the fingerprint contract.
6. Re-run Playwright once a UI-visible change lands; the charset guard adds an import-path rejection path that no browser test currently exercises.

## Later authorization gates

Only after every local task above passes:

1. Ask for renewed permission to run one local real-PDF smoke test without logging or retaining values.
2. Ask separately before creating hosted Supabase, OAuth, Vercel, or deployment resources.
3. Test portable recovery into an empty separately bound project before importing real data.

## Working constraints

- Do not inspect `private-statements/`.
- Do not commit, push, deploy, or create hosted resources without explicit authorization.
- Do not request the Windows PostgreSQL password until a separately approved backup/recovery task actually needs it.
- Preserve unrelated and uncommitted files.
