# Claude Code project handoff

Thin Claude Code entry point. Start with `AGENTS.md` — it carries the finance invariants and lists the maintained authority (`SPEC.md`, `PLAN.md`, `DECISIONS.md`, `GOTCHAS.md`) and routes you to the rest. `HANDOFF.md` is the continuity entry point.

For substantive work, read `HANDOFF` → `PLAN` first (current state + next actions), then `DECISIONS` / `GOTCHAS` / `SPEC` as the task requires — don't slurp all of them for a trivial task. Do not duplicate project state here; task state lives in `PLAN.md`.

## Subagents (Claude)

`.claude/agents/` holds a lean, Sonnet-tier adaptation of the repo's Codex workflow — `finance-implementer` and `finance-reviewer`; use the built-in `Explore` agent for discovery and the `/verify` + `/code-review` skills for validation/review. Rationale: `DECISIONS.md` D-011.

## Local runtime

System Node is v20; use the ignored project runtime before `pnpm`. Full setup, validation order, and Docker/Supabase acceptance notes: `docs/LOCAL_DEV.md`.

## Safety (gating — applies before any Read)

Never inspect `private-statements/`, `.env*`, or backup files. Real statements may be read **only** as the re-passworded copies in `shared-statements/` (D-049) — masked dumps stay the first resort, and nothing read there may become a fixture, a commit, a continuity-doc quotation or a screenshot. Fixtures remain invented; see `docs/FIXTURE_POLICY.md`. Preserve exact-money, currency, idempotency, append-only, audit, and least-privilege invariants; do not weaken the strict CSP. Do not commit, push, deploy, create hosted resources, or request the Windows PostgreSQL password without fresh explicit authorization. The working tree holds three deliberately local-only config files alongside ordinary uncommitted work — run `git status --short` and preserve both; `HANDOFF.md` § Before you touch anything distinguishes them. After substantive changes, run `/sync-continuity` to reconcile the continuity docs (`SPEC`/`PLAN`/`DECISIONS`/`GOTCHAS`/`HANDOFF`) against verified evidence before handoff. Full invariants: `AGENTS.md` § Finance invariants; `PLAN.md` § Working constraints.
