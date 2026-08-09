# Project agent workflow

Use subagents selectively. The parent owns decomposition, integration, final decisions, and user communication. See `CODEX_AGENT_WORKFLOW.md` for explanations and examples.

## Routing

Route by role. Each harness maps these roles onto its own agents and model tiers — Codex in `CODEX_AGENT_WORKFLOW.md`, Claude in `CLAUDE.md` — so agent names and tier names live there and cannot go stale here.

- Parent: owns decomposition, integration, final decisions, and user communication. Handle trivial edits, narrow factual work, and anything cheaper to do than to delegate.
- Discovery: broad, cross-module, unfamiliar, or read-heavy investigation.
- Implementation: bounded substantial work, delegated only after requirements and decisions are complete. Escalate the model tier only for unresolved architecture, migrations, difficult debugging, or repeated validation failures.
- Validation: independently verify non-trivial behavior or configuration changes; never fix defects or edit source.
- Review: monetary, authentication/authorization, credential/PII, migration/audit, concurrency, or public-contract risk only.

## Coordination

- Give each delegation a bounded objective, constraints, and expected handoff.
- Parallelize independent read-heavy work; use one writer unless ownership is explicitly non-overlapping; reuse agents for follow-ups.
- Keep the number of children low. Delegate only when the work is genuinely independent and large enough to repay the agent's context re-establishment; prefer one agent over several on a single task, and never run more than three at once without an explicit instruction.
- Require concise evidence citing relevant files, symbols, commands, results, and unresolved risks.
- Subagents must not commit or push. The parent may commit or push only with explicit user authorization.

## Finance invariants

- Use integer minor units or exact decimals for authoritative money; never binary floating point.
- Keep currency explicit; conversions require dated rates and defined rounding. Define time zones, reporting periods, and recurring-date behavior.
- Make imports, synchronization, retries, transfers, and other replayable operations idempotent.
- Treat financial data, credentials, PII, migrations, and audit history as high-risk; preserve least privilege and traceability.
- When relevant, test rounding boundaries, negatives, duplicates/replays, authorization failures, date boundaries, and migration compatibility.

## Continuity documents

- Read `SPEC.md`, `PLAN.md`, `DECISIONS.md`, and `GOTCHAS.md` before substantive work.
- Update affected continuity docs often and before each final response; use `$sync-continuity` after substantive changes.
- Keep `CLAUDE.md` and `HANDOFF.md` as lean entry points to the maintained docs. `HANDOFF.md` owns only facts that are mutable **and** homeless — authorizations granted or spent, what is uncommitted or unpushed, machine-specific hazards — because `DECISIONS.md` is append-only and `PLAN.md` owns project state. A fact true in both files is a defect in `HANDOFF.md`, not redundancy (D-052).
- Keep entries concise, evidence-based, and linked to source. Write them so a later reader can act without re-deriving: one term per concept used consistently, active voice with the actor named, one bounded action per numbered step, and no nominalizations or stacked-noun compounds.
- Never include credentials, PII, or real financial data, and never inspect `private-statements/`. Real statements are readable only as `shared-statements/` copies (D-049), and reading one never licenses writing a real value into a fixture, doc or commit.

## Codex only

Ignore this section unless running in Codex Code Mode; it does not apply to Claude Code.

Within each bounded stage, run independent, functions.exec-available tool calls concurrently in one functions.exec call. Use await Promise.allSettled([...]) when partial results are useful, and inspect every result; use await Promise.all([...]) only when any failure should abort the batch. Keep dependencies, waits/resumes, approvals, conflicting or interdependent mutations, and adaptive investigations where each result may change the next step sequential. Do not split otherwise batchable inspections across outer tool calls.
