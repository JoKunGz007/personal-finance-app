# Private Ledger decision log

Last reviewed: 2026-07-25

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

## D-012 — Import payload digest is server-recomputed and bound, never trusted

- Date: 2026-07-24
- Status: Accepted
- Decision: `confirm_import` recomputes the canonical payload digest in PostgreSQL over the statement frame plus the exact rows it receives (`private.sha256_jsonb` over `private.canonical_jsonb`), rejects any mismatch with the caller-supplied digest (`payload digest mismatch`), and uses the recomputed value as the stored/compared idempotency and audit anchor. The client (`app/api/v1/imports/confirm/route.ts` + `confirmationDigest` in `lib/canonical.ts`) computes the identical object — the frame scalars and the `rpcRows` (rows with server `fingerprint`/`sourceIndex` injected) — so the two digests agree byte-for-byte. This is server-authoritative: the caller digest is a verified claim, not the source of truth.
- Rationale: The prior digest was a trusted caller token used as the sole "same payload" discriminator, so materially different rows could be blessed under an unchanged claimed digest (the artifact-reuse path returned the original batch and silently discarded the divergent rows), and a fresh batch could persist rows whose recorded digest did not summarize them — corrupting the audit/backup/restore-equality chain. A digest that anchors idempotency and audit must be a function of the data it claims to summarize.
- Evidence: `supabase/migrations/202607240005_confirm_import_digest_binding.sql`, `supabase/tests/002_security_contracts.sql` (tamper test 19 fails before the fix, passes after), `lib/canonical.ts`, `app/api/v1/imports/confirm/route.ts`.

## D-013 — Restore manifest counts are canonical integers and the sequence range reserves increment headroom

- Date: 2026-07-25
- Status: Accepted
- Decision: `restore_backup` stage validation requires every `tableCounts[kind]` and descriptor `rowCount` to be canonical non-negative integer text (`^(0|[1-9][0-9]*)$`), rejecting fractional/`2.0`/leading-zero/signed forms with `invalid restore manifest descriptor` before any `text::integer` cast. The accepted `snapshotSequence` range is made explicit as `[0, 2^63-2]` (must be `< 9223372036854775807`) so the single post-commit increment (`sequence = restored + 1`) cannot overflow bigint. Restore round-trip integrity is proven by a populated fixture that exports a full ledger, rewrites the owner to a foreign id, wipes, restores, and asserts a re-export reproduces every table byte-for-byte and remaps all rows to the caller.
- Rationale: Counts were validated only as JSON `number`, so a fractional value slipped past the type check and blew up on an uncaught `22P02` cast instead of failing closed; and the sequence range admitted int64 maximum, which overflowed on the commit increment. Both are boundary defects in an authoritative recovery path. The empty-table restore test proved none of the insertion, money-canonicalization, FK-ordering, audit, or owner-remapping logic — a populated round-trip with re-export equality closes that gap.
- Consequences: Restore fixtures that hand-author populated payloads must avoid null row fields, because `restore_request`'s `jsonb_strip_nulls` recursively drops nulls from the chunk and breaks the chunk/aggregate digest binding (see GOTCHAS).
- Evidence: `supabase/migrations/202607240006_restore_count_and_sequence_bounds.sql`, `supabase/tests/003_restore_contracts.sql` (fractional-count and int64-max tests fail pre-006; populated round-trip asserts re-export equality and owner remapping), verified via `supabase db reset` + `supabase test db` with migration 006 held out then restored.
