# Private Ledger continuity handoff

Last updated: 2026-07-25

Thin entry point. Project state lives in the maintained docs — do not duplicate it here.

Read in order: [SPEC.md](SPEC.md) (scope, invariants, gates) → [PLAN.md](PLAN.md) (checkpoint and next actions) → [DECISIONS.md](DECISIONS.md) (D-001…D-022) → [GOTCHAS.md](GOTCHAS.md) (traps worth reading before touching tests or the database).

Claude Code starts at `CLAUDE.md`; Codex at `AGENTS.md`. Product, design, parser, fixture, and recovery contracts are in `PRODUCT.md`, `DESIGN.md`, and `docs/`. Local setup and the validation order are in `docs/LOCAL_DEV.md`.

## Where the project stands

No open review blockers, and every local task in `PLAN.md` is now complete. The ledger, backup, restore, and import contracts are hardened and proven end to end against synthetic data. As of 2026-07-25 the app itself can carry a statement the whole way: a PDF is parsed on-device, bound to a chosen ledger account through the new chooser, and confirmed through `/api/v1/imports/confirm` into `confirm_import` under an authenticated MFA session (D-021, D-022).

Verified on 2026-07-25 with the project-local Node 24.18.0 runtime and pinned pnpm 11.17.0 (system Node is 20 — see `docs/LOCAL_DEV.md`):

| Check | Result |
| --- | --- |
| ESLint / `tsc --noEmit` / production build | Passed |
| Vitest | 87 passed, 5 skipped |
| pgTAP | 84/84 (migrations 001–008) |
| Playwright | 4/4 desktop and mobile |

The five skipped Vitest cases are unreachable-container reporters. They ran green against the live container; **a skipped run is not evidence** — start the stack with `pnpm supabase:start` before trusting a green suite.

## Next step

**The real-PDF smoke test, authorized 2026-07-25** (conditions below). It is now the only remaining local action, and it is the only way to reach three things a browser has never exercised: the binding chooser, the authenticated import path, and the charset rejection path — all sit behind a real PDF. It also remains the sole check of parser-vs-reality, since the fixture geometry was invented (D-015).

Nothing else is queued. If the smoke test shows the invented geometry is wrong, the parser contract in `docs/KRUNGTHAI_CONTRACT.md` and the fixtures are what change.

## Standing authorizations and their conditions

- **Real-PDF smoke test: approved 2026-07-25.** One local run, to check whether the invented fixture geometry matches an actual Krungthai statement. Conditions from `docs/FIXTURE_POLICY.md` and `PLAN.md` still bind: enter the document password interactively, never log or retain any value, never copy real content into a fixture, never commit anything derived from it, and do not browse `private-statements/` beyond that single run. Requires the owner present for the password, so it cannot run unattended. This is the assumption the whole parser rests on — the geometry was invented, so parser-vs-reality is genuinely unknown until this runs.
- **Commit and push: spent.** Granted and used on 2026-07-25 through `ca57a80`; not re-granted since. This round's source and doc changes are uncommitted — ask before committing them.
- **Hosted Supabase / OAuth / Vercel: still not needed.** Offered and declined 2026-07-25 — `private.has_strong_owner_access` never inspects the auth provider, so a local password session with two verified TOTP factors satisfies it (D-020).

## Before you touch anything

- Run `git status --short`. Four config files (`.gitignore`, `eslint.config.mjs`, `playwright.config.ts`, `pnpm-workspace.yaml`) are **intentionally uncommitted** — preserve them. The account-binding UI, the route-wrapper suite, and this round's doc updates are also uncommitted and awaiting authorization; everything before them is pushed through `ca57a80`.
- `public.ledger_owners` binds exactly one owner and is immutable; a second owner cannot exist without a database reset. Authenticate as the seeded synthetic owner (`supabase/seed.sql` holds its password).
- Several suites mutate the one local database, so `vitest.config.ts` sets `fileParallelism: false`. Leave it — without it, suites pass alone and fail together.
- Never inspect `private-statements/`, `.env*`, or real financial data outside the authorized smoke test. Synthetic data only. Preserve the exact-money, currency, idempotency, append-only, audit, and least-privilege invariants, and do not weaken the CSP.
- After substantive changes, run `/sync-continuity` to reconcile these docs against verified evidence.
