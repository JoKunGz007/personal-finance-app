# Private Ledger continuity handoff

Last updated: 2026-07-25

Thin entry point. Project state lives in the maintained docs — do not duplicate it here.

Read in order: [SPEC.md](SPEC.md) (scope, invariants, gates) → [PLAN.md](PLAN.md) (checkpoint and next actions) → [DECISIONS.md](DECISIONS.md) (D-001…D-020) → [GOTCHAS.md](GOTCHAS.md) (traps worth reading before touching tests or the database).

Claude Code starts at `CLAUDE.md`; Codex at `AGENTS.md`. Product, design, parser, fixture, and recovery contracts are in `PRODUCT.md`, `DESIGN.md`, and `docs/`. Local setup and the validation order are in `docs/LOCAL_DEV.md`.

## Where the project stands

No open review blockers. The ledger, backup, restore, and import contracts are hardened and proven end to end against synthetic data. As of 2026-07-25 the full chain works: a PDF is parsed on-device into a statement, assembled into an import payload, and confirmed through an authenticated MFA session into `confirm_import`.

Verified on 2026-07-25 with the project-local Node 24.18.0 runtime and pinned pnpm 11.17.0 (system Node is 20 — see `docs/LOCAL_DEV.md`):

| Check | Result |
| --- | --- |
| ESLint / `tsc --noEmit` / production build | Passed |
| Vitest | 75 passed, 4 skipped |
| pgTAP | 84/84 (migrations 001–008) |
| Playwright | 4/4 desktop and mobile |

The four skipped Vitest cases are unreachable-container reporters. They ran green against the live container; **a skipped run is not evidence** — start the stack with `pnpm supabase:start` before trusting a green suite.

## Next steps (all three approved 2026-07-25)

1. **Account-binding UI.** Add an accounts-list endpoint — only `/api/v1/accounts/[id]/transactions` exists — plus a chooser so an extracted statement can be bound to a ledger account. This is the last piece stopping a real PDF becoming a confirmed import from the app itself; extraction, assembly, and confirmation all work, but only a test wires them together. Binding must stay a checked user decision, never a parser inference (D-017).
2. **Cover the Next.js route wrapper.** `tests/import-confirm-e2e.test.ts` targets PostgREST, so `/api/v1/imports/confirm`'s zod boundary and cookie handling are unexercised. It mirrors the route's fingerprint and digest computation line for line, but that equivalence was verified by reading, not by executing. Folds naturally into task 1 once the UI posts through the route.
3. **Real-PDF smoke test — now authorized** (see the conditions below).

## Standing authorizations and their conditions

- **Real-PDF smoke test: approved 2026-07-25.** One local run, to check whether the invented fixture geometry matches an actual Krungthai statement. Conditions from `docs/FIXTURE_POLICY.md` and `PLAN.md` still bind: enter the document password interactively, never log or retain any value, never copy real content into a fixture, never commit anything derived from it, and do not browse `private-statements/` beyond that single run. Requires the owner present for the password, so it cannot run unattended. This is the assumption the whole parser rests on — the geometry was invented, so parser-vs-reality is genuinely unknown until this runs.
- **Commit and push: granted this session and used.** Treat as spent; ask again next session.
- **Hosted Supabase / OAuth / Vercel: still not needed.** Offered and declined 2026-07-25 — `private.has_strong_owner_access` never inspects the auth provider, so a local password session with two verified TOTP factors satisfies it (D-020).

## Before you touch anything

- Run `git status --short`. Four config files (`.gitignore`, `eslint.config.mjs`, `playwright.config.ts`, `pnpm-workspace.yaml`) are **intentionally uncommitted** — preserve them. Everything else is committed and pushed through `033fac2`.
- `public.ledger_owners` binds exactly one owner and is immutable; a second owner cannot exist without a database reset. Authenticate as the seeded synthetic owner (`supabase/seed.sql` holds its password).
- Several suites mutate the one local database, so `vitest.config.ts` sets `fileParallelism: false`. Leave it — without it, suites pass alone and fail together.
- Never inspect `private-statements/`, `.env*`, or real financial data outside the authorized smoke test. Synthetic data only. Preserve the exact-money, currency, idempotency, append-only, audit, and least-privilege invariants, and do not weaken the CSP.
- After substantive changes, run `/sync-continuity` to reconcile these docs against verified evidence.
