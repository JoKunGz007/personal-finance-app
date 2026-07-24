# Private Ledger

A local-first, single-owner Krungthai statement ledger. PDF bytes and document passwords stay inside a dedicated browser worker; authoritative money uses signed `bigint` minor units and explicit `THB` everywhere.

Portable backups use schema version 2. Snapshot export and restore are database-locked and manifest-bound; all 64-bit integers cross JSON boundaries as canonical decimal strings.
The browser's synthetic `.pldemo` download is an encrypted preview only, not a restorable backup. Pre-release schema-version 1 artifacts are intentionally unsupported because no real-data stage has been authorized.

## Local prerequisites

- Node.js 24 LTS
- Corepack with pnpm 11
- Docker Desktop with the Linux engine running

```powershell
corepack enable
pnpm install
pnpm supabase:start
pnpm supabase:reset
pnpm dev
```

Copy `.env.example` to `.env.local` and use only the values printed by the local Supabase CLI. Do not store a statement password in any environment file; remove legacy `*_STATEMENT_PASSWORD` variables if they exist locally.

## Verification

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm supabase:test
pnpm build
pnpm test:e2e
```

The browser tests use invented transaction data from `lib/synthetic.ts`. `private-statements/` is ignored and must never be used as a fixture source.

No hosted Supabase project, Vercel project, deployment, commit, or push is part of the local stage. Hosted work begins only after a clean `supabase db reset` and all local acceptance checks pass.

## Project continuity

Agents and maintainers should begin with:

- `SPEC.md` for current scope and acceptance requirements.
- `PLAN.md` for verified status and next actions.
- `DECISIONS.md` for durable choices and rationale.
- `GOTCHAS.md` for recurring traps and their verification.

`AGENTS.md` requires these files to be updated whenever substantive work changes their content.
