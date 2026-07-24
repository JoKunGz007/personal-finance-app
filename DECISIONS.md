# Private Ledger decision log

Last reviewed: 2026-07-24

Entries are append-only. A superseding decision must reference the earlier entry rather than rewriting its history.

## D-001 — Local-first synthetic development

- Date: 2026-07-24
- Status: Accepted
- Decision: Complete local implementation and recovery acceptance with invented data before any real statement or hosted resource is used.
- Rationale: Financial data and statement passwords are high-risk; parser and recovery boundaries must be proven without private inputs.
- Evidence: `PRODUCT.md`, `docs/FIXTURE_POLICY.md`, `README.md`.

## D-002 — Canonical integer money

- Date: 2026-07-24
- Status: Accepted
- Decision: Persist authoritative money as PostgreSQL `bigint`; cross JSON boundaries only as canonical signed-int64 decimal strings with explicit currency.
- Rationale: JavaScript numbers cannot preserve all signed-int64 values and binary floating point is unsuitable for authoritative money.
- Evidence: `lib/money.ts`, `lib/backup-contract.ts`, `docs/ARCHITECTURE.md`.

## D-003 — Worker-contained PDF boundary

- Date: 2026-07-24
- Status: Accepted
- Decision: PDF bytes and the document password remain inside a dedicated browser worker. Unsupported geometry fails closed.
- Rationale: The server and main application do not need the original document or password.
- Evidence: `workers/krungthai.worker.ts`, `docs/KRUNGTHAI_CONTRACT.md`.

## D-004 — Strong single-owner access

- Date: 2026-07-24
- Status: Accepted
- Decision: Authoritative access requires a permanently bound owner, `aal2`, and two verified TOTP factors.
- Rationale: The ledger is deliberately single-owner and contains sensitive financial history.
- Evidence: `supabase/migrations/202607240002_security_and_rpcs.sql`, `docs/ARCHITECTURE.md`.

## D-005 — Schema-v2 recovery is the first supported backup contract

- Date: 2026-07-24
- Status: Accepted
- Decision: Restorable backups use schema version 2 with a locked snapshot, exact manifest, canonical strings, authenticated encryption, and acknowledgement only after client custody. Pre-release v1 is unsupported.
- Rationale: Recovery must detect truncation, reordering, mutation races, and tampering before atomic application.
- Evidence: `supabase/migrations/202607240004_backup_and_ledger_hardening.sql`, `lib/backup-contract.ts`, `docs/RECOVERY.md`.

## D-006 — Synthetic preview is not a backup

- Date: 2026-07-24
- Status: Accepted
- Decision: The UI’s `.pldemo` artifact is a non-restorable synthetic preview and never marks the ledger backup-current.
- Rationale: Labeling a partial synthetic payload as schema-v2 recovery would create false confidence.
- Evidence: `app/ledger-app.tsx`, `README.md`.

## D-007 — Compound-row resynchronization requires provenance

- Date: 2026-07-24
- Status: Accepted
- Decision: A one-deposit/one-withdrawal row may resynchronize only when parser provenance explicitly marks the recognized interest/tax ordering anomaly.
- Rationale: Component shape alone cannot distinguish a known bank-layout anomaly from an unexplained balance gap.
- Evidence: `lib/reconcile.ts`, migration 004, `docs/KRUNGTHAI_CONTRACT.md`.

## D-008 — Docker Supabase is the acceptance database

- Date: 2026-07-24
- Status: Accepted
- Decision: Use the project’s Docker-based local Supabase stack for migrations, RLS/RPC behavior, and pgTAP. A standalone Windows PostgreSQL installation is not interchangeable.
- Rationale: Supabase acceptance depends on its extensions, roles, services, and migration environment.
- Evidence: `README.md`, `docs/RECOVERY.md`.

## D-009 — Use Supabase’s default Docker network locally

- Date: 2026-07-24
- Status: Accepted
- Decision: Keep the project on Supabase’s default Docker network. Do not reuse the attempted custom localhost-binding network.
- Rationale: The custom network broke service discovery after `supabase db reset`, causing auth, storage, and realtime restart loops.
- Consequence: Default local services may bind development ports to all interfaces; use only on a trusted machine/network with firewall protection.
- Evidence: `GOTCHAS.md`.

## D-010 — Repository continuity files

- Date: 2026-07-24
- Status: Accepted
- Decision: Maintain `SPEC.md`, `PLAN.md`, `DECISIONS.md`, and `GOTCHAS.md`, enforced through `AGENTS.md` and reconciled with the project-local `$sync-continuity` skill.
- Rationale: Critical state should survive context compaction and new agent sessions without relying on chat history.
- Evidence: `AGENTS.md`, `.agents/skills/sync-continuity/SKILL.md`.

## D-011 — Claude subagent workflow is a lean, tiered adaptation of the Codex one

- Date: 2026-07-24
- Status: Accepted
- Decision: Provide a Claude Code subagent workflow in `.claude/agents/` that mirrors the Codex roles selectively rather than 1:1. Keep only two custom agents — `finance-implementer` (Sonnet) and `finance-reviewer` (Sonnet) — and rely on the built-in `Explore` agent for read-heavy discovery and the `/verify` and `/code-review` skills for validation/review. `CLAUDE.md` is the Claude entry point; `AGENTS.md` remains the tool-neutral routing/invariant authority.
- Rationale: The upstream Codex workflow (`CODEX_AGENT_WORKFLOW.md`, ref `github.com/nsEytgXm/subagents_configs`) optimizes *monetary cost* by delegating-by-default to cheap model tiers, accepting duplicated context because per-token dollar cost drops. On a Claude Pro subscription the scarce resource is the weekly usage limit, which meters cost-weighted tokens — so "delegate by default" burns the limit faster. The transferable value is bias-reduction (independent review/validation) and context hygiene, not cost arbitrage. Therefore: delegate *selectively*, and tier implementation/review subagents down to Sonnet, reserving the Opus parent for decomposition, architecture, migrations, hard debugging, and money/idempotency/migration judgment. Delegating a decision-complete, well-scoped implementation to a Sonnet subagent is the largest weekly-limit saver available, provided the scoping is genuinely complete; the implementer is instructed to return unresolved decisions rather than guess, and the reviewer/validator is the safety net for tiered-down work.
- Evidence: `CLAUDE.md`, `.claude/agents/finance-implementer.md`, `.claude/agents/finance-reviewer.md`, `AGENTS.md`, `CODEX_AGENT_WORKFLOW.md`.
