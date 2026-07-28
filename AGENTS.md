# Project agent workflow

Use subagents selectively. The parent owns decomposition, integration, final decisions, and user communication. See `CODEX_AGENT_WORKFLOW.md` for explanations and examples.

## Routing

- Parent: handle trivial edits, narrow factual work, and tasks cheaper to do than delegate.
- `finance-explorer`: broad, cross-module, unfamiliar, or read-heavy discovery.
- `finance-implementer`: bounded substantial implementation after requirements and decisions are complete. Use Sol/low by default; explicitly use Sol/medium only for unresolved architecture, migrations, difficult debugging, or repeated validation failures.
- `finance-validator`: independently verify non-trivial behavior or configuration changes; never fix defects or edit source.
- `finance-reviewer`: review only monetary, authentication/authorization, credential/PII, migration/audit, concurrency, or public-contract risk.

## Coordination

- Give each delegation a bounded objective, constraints, and expected handoff.
- Parallelize independent read-heavy work; use one writer unless ownership is explicitly non-overlapping; reuse agents for follow-ups.
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
- Keep entries concise, evidence-based, and linked to source. Never include credentials, PII, or real financial data, and never inspect `private-statements/`. Real statements are readable only as `shared-statements/` copies (D-049), and reading one never licenses writing a real value into a fixture, doc or commit.

## Codex only

Ignore this section unless running in Codex Code Mode; it does not apply to Claude Code.

Within each bounded stage, run independent, functions.exec-available tool calls concurrently in one functions.exec call. Use await Promise.allSettled([...]) when partial results are useful, and inspect every result; use await Promise.all([...]) only when any failure should abort the batch. Keep dependencies, waits/resumes, approvals, conflicting or interdependent mutations, and adaptive investigations where each result may change the next step sequential. Do not split otherwise batchable inspections across outer tool calls.
