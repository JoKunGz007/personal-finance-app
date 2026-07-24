# Claude Code project handoff

This is a thin Claude Code entry point. The maintained authority lives elsewhere — read, in order:

1. `AGENTS.md` — routing, coordination, and finance invariants (tool-neutral; shared with Codex).
2. `SPEC.md` — scope, invariants, acceptance gates.
3. `PLAN.md` — current verified checkpoint, review blockers, and next actions.
4. `DECISIONS.md` — durable architectural and workflow decisions.
5. `GOTCHAS.md` — recurring operational and implementation traps.
6. `HANDOFF.md` — continuity entry point.

Do not duplicate project state here. The current priority and its task breakdown live in `PLAN.md` (§ Current review blockers / § Next local tasks); update those, not this file.

## Subagent workflow (Claude)

This repo also carries a Codex subagent workflow (`AGENTS.md`, `CODEX_AGENT_WORKFLOW.md`, `.codex/agents/`). The Claude equivalents live in `.claude/agents/` and follow the same *selective* routing — the parent owns decomposition, integration, and judgment; subagents handle bounded, well-scoped work. Deliberately leaner than the Codex set: use the built-in `Explore` agent for read-heavy discovery and the `/verify` and `/code-review` skills for validation/review, plus two custom agents:

- `finance-implementer` (Sonnet) — bounded, decision-complete implementation. Returns to the parent on any unresolved design, unclear acceptance criteria, or money/idempotency/migration judgment call.
- `finance-reviewer` (Sonnet) — read-only high-risk review (money, auth, PII, migrations, audit, concurrency, idempotency, public contracts).

Rationale in `DECISIONS.md` (D-011): the Codex workflow optimizes *dollar cost* via cheap model tiers; on a Claude subscription the scarce resource is the weekly usage limit (cost-weighted tokens), so delegate *selectively* and tier subagents down to Sonnet/Haiku rather than delegating by default. Claude Code's persistent memory for this project also carries this as `project-claude-subagent-workflow` (a background pointer; `DECISIONS.md` D-011 is the authority).

## Local commands

System Node is v20. Use the ignored project runtime in PowerShell:

```powershell
$nodeDir = "D:\Projects\personal-finance-app\.runtime\node-v24.18.0-win-x64"
$env:PATH = "$nodeDir;$env:PATH"
$env:COREPACK_HOME = "D:\Projects\personal-finance-app\.runtime\corepack"
pnpm --version
```

Validation order:

```powershell
pnpm install --frozen-lockfile --offline
pnpm lint
pnpm typecheck
pnpm test
pnpm supabase:reset
pnpm supabase:test
pnpm build
pnpm test:e2e
```

Docker acceptance uses only the `private-ledger-local` Supabase project on `supabase_network_private-ledger-local`. Do not modify older PostgreSQL/pgAdmin containers or the Windows PostgreSQL service.

## Safety

Full invariants are in `AGENTS.md` (§ Finance invariants) and `PLAN.md` (§ Working constraints). In short: never inspect `private-statements/`, `.env*`, or real financial data; synthetic data only; preserve exact-money, currency, idempotency, append-only, audit, and least-privilege invariants; do not weaken the strict CSP; do not commit, push, deploy, create hosted resources, or request the Windows PostgreSQL password without fresh explicit authorization. Run `git status --short` — the working tree intentionally contains uncommitted config, continuity, and pgTAP changes. Update affected continuity docs before handoff.
