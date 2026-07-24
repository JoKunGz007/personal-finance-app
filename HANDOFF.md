# Private Ledger continuity handoff

Last updated: 2026-07-25

Intentionally a thin entry point. Do not duplicate project state here.

Read these maintained sources in order:

1. [SPEC.md](SPEC.md) — scope, invariants, and acceptance gates.
2. [PLAN.md](PLAN.md) — current verified checkpoint and next actions.
3. [DECISIONS.md](DECISIONS.md) — durable architectural and workflow decisions.
4. [GOTCHAS.md](GOTCHAS.md) — recurring operational and implementation traps.

Claude Code sessions start at `CLAUDE.md`; Codex sessions at `AGENTS.md`. Detailed product, design, architecture, parser, fixture, and recovery contracts remain in `PRODUCT.md`, `DESIGN.md`, and `docs/`.

Project headline: no open review blockers. All four pgTAP blockers plus the carried fingerprint follow-up are resolved with red→green evidence — payload digest bound server-side (D-012), restore counts/sequence bounds and a populated restore round-trip (D-013), and row fingerprints now recomputed and rejected on mismatch behind a source-text charset guard (D-014, migrations 007–008 + `lib/statement.ts`). Local gate green on 2026-07-25: ESLint, TypeScript, Vitest 31/31, pgTAP 84/84 with migrations 001–008, production build; each fix verified red by holding its migration out. Playwright is dated 2026-07-24 and not re-run. Remaining work is ordinary next-local-tasks — see `PLAN.md`.

Uncommitted and intentional: migrations `202607240007`/`202607240008` are untracked but **already applied** to the local database, alongside edits to `lib/statement.ts`, `tests/domain.test.ts`, `supabase/tests/002_security_contracts.sql`, and the earlier config/continuity changes. Run `git status --short` before assuming the tree is clean, and preserve these. Nothing in this round has been committed.

Two gaps worth knowing before trusting the green gate: no test drives a real browser-computed fingerprint through `confirm_import` (the pgTAP wrapper computes fingerprints server-side, so it proves SQL self-consistency, not client/server agreement), and the new charset rejection path has no end-to-end coverage.

Do not inspect `private-statements/`, use real financial data, commit, push, deploy, or create hosted resources without explicit authorization.
