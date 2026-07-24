# Private Ledger continuity handoff

Last updated: 2026-07-25

Intentionally a thin entry point. Do not duplicate project state here.

Read these maintained sources in order:

1. [SPEC.md](SPEC.md) — scope, invariants, and acceptance gates.
2. [PLAN.md](PLAN.md) — current verified checkpoint and next actions.
3. [DECISIONS.md](DECISIONS.md) — durable architectural and workflow decisions.
4. [GOTCHAS.md](GOTCHAS.md) — recurring operational and implementation traps.

Claude Code sessions start at `CLAUDE.md`; Codex sessions at `AGENTS.md`. Detailed product, design, architecture, parser, fixture, and recovery contracts remain in `PRODUCT.md`, `DESIGN.md`, and `docs/`.

Project headline: all four pgTAP review blockers are now resolved with red→green evidence. Migration `202607240005_confirm_import_digest_binding.sql` binds the `confirm_import` payload digest server-side (blocker 1, DECISIONS D-012, matching client change); migration `202607240006_restore_count_and_sequence_bounds.sql` fixes fractional restore counts and the snapshot-sequence overflow (blockers 3–4, D-013); `003_restore_contracts.sql` gains a populated export→wipe→restore→re-export round-trip proving schemas, FKs, money, audit rows, and owner remapping (blocker 2, D-013). Local gate green: ESLint, TypeScript, 27 Vitest, pgTAP 83/83 with migrations 001–006, production build; each fix verified red by holding its migration out. Playwright not re-run (no UI behavior change). Remaining follow-ups are ordinary Next-local-tasks (fingerprint binding, concurrency coverage, >1,000-row round-trip, Krungthai fixtures) — see `PLAN.md`.

Since the last handoff (workflow/docs only — no project-state or code change): added a lean Claude subagent workflow (`.claude/agents/` — `finance-implementer` + `finance-reviewer`, Sonnet tier; see `DECISIONS.md` D-011), trimmed `CLAUDE.md` to a thin entry point with local commands in `docs/LOCAL_DEV.md`, and de-duplicated the finance invariants to a single source in `AGENTS.md`. These landed on `main`. The working tree still intentionally holds the earlier uncommitted config/continuity edits and the two review-blocked pgTAP files (`supabase/tests/002_security_contracts.sql`, `003_restore_contracts.sql`) — preserve them; run `git status --short` before assuming the tree is clean.

Do not inspect `private-statements/`, use real financial data, commit, push, deploy, or create hosted resources without explicit authorization.
