# Claude Code project handoff

Thin Claude Code entry point. Start with `AGENTS.md` — it carries the finance invariants and lists the maintained authority (`SPEC.md`, `PLAN.md`, `DECISIONS.md`, `GOTCHAS.md`) and routes you to the rest. `HANDOFF.md` is the continuity entry point.

For substantive work, read `HANDOFF` → `PLAN` first (current state + next actions), then `DECISIONS` / `GOTCHAS` / `SPEC` as the task requires — don't slurp all of them for a trivial task. Do not duplicate project state here; task state lives in `PLAN.md`.

## Subagents (Claude) — work as orchestrator

Every call re-reads the whole context, so raw tool output in this session is the main cost of a session. This session plans, decides, talks to the owner and integrates; subagents do the heavy reading. Rationale: `DECISIONS.md` D-011, D-233.

- **"Where is X"** → built-in `Explore`.
- **"Why does X happen / does X hold"** (debugging, tracing, test or log output) → `finance-investigator` (read-only, session model). Give it one question, where to start, and the answer you need; it returns ≤300 words.
- **Settled implementation** → `finance-implementer` (Sonnet). Name the files, the exact change and the checks to run. If it returns stuck or the task turns into debugging, re-route to the investigator or re-run it with `model: "opus"`; don't retry it on Sonnet.
- **High-risk review** → `finance-reviewer` (Sonnet), plus the `/verify` + `/code-review` skills.
- **Keep each delegation to ~20–40 tool calls.** Split larger work (migration → write path → UI → tests) into sequential delegations. Don't bundle independent items (e.g. several review findings) into one run: give each non-trivial item its own delegation, and group only small items in the same file or function. The only runs past 40 calls so far were bundles (59 and 71 calls). Use `SendMessage` for a short follow-up to the same agent and a fresh spawn for a new topic.
- **`/ux-review`** can run in a `general-purpose` subagent under the skill's own rules, so screenshots stay out of this context.
- **Do inline**: trivial edits, commands with small output, anything touching `shared-statements/` (D-049), money / idempotency / migration judgement calls, anything involving the owner, and continuity-doc updates. Subagents don't edit continuity docs; record what they find yourself.

## Local runtime

System Node is v20; use the ignored project runtime before `pnpm`. Full setup, validation order, and Docker/Supabase acceptance notes: `docs/LOCAL_DEV.md`.

## Safety (gating — applies before any Read)

Never inspect `private-statements/`, `.env*`, or backup files. Real statements may be read **only** as the re-passworded copies in `shared-statements/` (D-049) — masked dumps stay the first resort, and nothing read there may become a fixture, a commit, a continuity-doc quotation or a screenshot. Fixtures remain invented; see `docs/FIXTURE_POLICY.md`. Preserve exact-money, currency, idempotency, append-only, audit, and least-privilege invariants; do not weaken the strict CSP. Do not commit, push, deploy, create hosted resources, or request the Windows PostgreSQL password without fresh explicit authorization. The working tree holds three deliberately local-only config files alongside ordinary uncommitted work — run `git status --short` and preserve both; `HANDOFF.md` § Before you touch anything distinguishes them. After substantive changes, run `/sync-continuity` to reconcile the continuity docs (`SPEC`/`PLAN`/`DECISIONS`/`GOTCHAS`/`HANDOFF`) against verified evidence before handoff. Full invariants: `AGENTS.md` § Finance invariants; `PLAN.md` § Working constraints.
