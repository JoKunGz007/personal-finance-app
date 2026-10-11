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

- Start at `PLAN.md` § Current checkpoint (its newest paragraph is the current state and next action), then read `SPEC.md`, `DECISIONS.md` and `GOTCHAS.md` as the task requires. `DECISIONS.md` opens with an index of every entry, archives included: read the index rather than opening an archive. `GOTCHAS.md` is an index; the trap bodies are in `docs/gotchas/`. Machine facts, local-only files and local hazards are in `docs/LOCAL_DEV.md` § This machine. A session note from `/handoff` covers what a session leaves in flight.
- Update affected continuity docs often and before each final response; use `$sync-continuity` after substantive changes.
- Each fact has one home: project state in `PLAN.md`, decisions in `DECISIONS.md` (append-only), traps in `GOTCHAS.md`, machine facts in `docs/LOCAL_DEV.md`. `CLAUDE.md` stays a thin entry point. `HANDOFF.md` was retired into these files (D-268).

## Authorizations and destructive operations

- **Nothing is inherited by a new session. Ask again.** The owner grants commit, push, `db push`, real-data read, hosted queries and hosted site use per session; what a grant was spent on is recorded in commits and decisions, not kept as a list.
- Never under any grant: passwords (statement passwords are in Vercel Sensitive variables the owner set; never seen, read or echoed), reading `private-statements/`, `.env*` or backup files (`dev-backup/` excepted, see `docs/LOCAL_DEV.md`).
- Ask every time, even within a granted session: importing a new real statement; creating or destroying any hosted resource. Reading `receipts_sample/` is granted per session, through throwaway harnesses that print counts only.
- `supabase db push` needs its own ask and a backup verified from the database first: the owner exports, then read `mutation_sequences` on hosted (sequence equals last exported) and dry-run before pushing.
- Every push to `main` is a production deployment. Review (`/code-review`) before asking to commit (D-125).
- Before anything destructive, read `docs/LOCAL_DEV.md` § This machine: the hosted project is the real ledger, `pnpm supabase:reset` cannot be guarded, and `.env.local` decides what a build targets.

## Protocol

- **Value-free writing.** Counts, percentages, field names, label wordings and date distances are reportable. Amounts, balances, dates, names, counterparties, account numbers and slip references are not.
- Never score OCR against its own output; measure the shipped function, not a copy of its arithmetic; when a measurement contradicts a conclusion, the measurement wins; reproduce before diagnosing.
- The database is the authority on what is granted, the Vercel dashboard on what is deployed. An agent cannot widen its own permissions.
- Keep entries concise, evidence-based, and linked to source. Write them so a later reader can act without re-deriving: one term per concept used consistently, active voice with the actor named, one bounded action per numbered step, and no nominalizations or stacked-noun compounds.
- Never include credentials, PII, or real financial data, and never inspect `private-statements/`. Real statements are readable only as `shared-statements/` copies (D-049), and reading one never licenses writing a real value into a fixture, doc or commit.

## Codex only

Ignore this section unless running in Codex Code Mode; it does not apply to Claude Code.

Within each bounded stage, run independent, functions.exec-available tool calls concurrently in one functions.exec call. Use await Promise.allSettled([...]) when partial results are useful, and inspect every result; use await Promise.all([...]) only when any failure should abort the batch. Keep dependencies, waits/resumes, approvals, conflicting or interdependent mutations, and adaptive investigations where each result may change the next step sequential. Do not split otherwise batchable inspections across outer tool calls.
