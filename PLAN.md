# Private Ledger execution plan

Last verified: 2026-07-24

## Current checkpoint

The five high-risk backup and ledger findings from the original review have been implemented in `supabase/migrations/202607240004_backup_and_ledger_hardening.sql` and the related API/domain code.

The local Supabase stack is running on its default Docker network. After the network was restored, the database, auth, storage, realtime, gateway, Studio, and supporting containers passed a successful health check. This does not replace the still-open clean-reset acceptance task below. The unrelated older PostgreSQL and pgAdmin containers and the Windows PostgreSQL service were not modified.

Current focused verification:

| Check | Result |
| --- | --- |
| ESLint | Passed |
| TypeScript `tsc --noEmit` | Passed |
| Vitest | Passed, 27/27 |
| pgTAP | Passed, 24/24 |
| Migration application | Migrations 001–004 and synthetic seed applied |

These results used an isolated Node 24.18.0 runtime because the system Node installation is still Node 20.

Pre-commit verification on 2026-07-24 reran ESLint and TypeScript successfully under system Node 20; Vitest could not start there because of the known ESM incompatibility. The 27/27 Vitest result above remains the latest Node 24 run.

Python 3.14.6 and PyYAML 6.0.3 are installed for local Codex skill scaffolding and validation. The project-local `$sync-continuity` skill under `.agents/skills/sync-continuity` passes the official skill validator and a read-only forward audit.

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

1. Install Node 24 normally, enable Corepack, and perform a clean `pnpm install` from `pnpm-lock.yaml`.
2. On the stable default Docker network, rerun `pnpm supabase:reset` and `pnpm supabase:test` together. The last reset applied all migrations but its health phase failed because a temporary custom Docker network broke inter-container DNS.
3. Rerun the production build and Playwright suite against the final hardened source.
4. Expand pgTAP coverage for forged claims, AAL1/AAL2, two-factor counts, replay/conflict/overlap, concurrency, restore tampering, and int64 boundaries.
5. Add a real schema-v2 export → encrypt → decrypt → stage → chunk → commit → equality integration test, including more than 1,000 rows.
6. Build approved synthetic Krungthai PDF geometry fixtures and implement exact parsing without weakening the fail-closed worker boundary.
7. Repeat privacy, browser-storage/network, accessibility, and interface-guideline audits.

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
