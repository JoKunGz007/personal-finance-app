# Private Ledger — project instructions

The single entry point (D-269 folded `AGENTS.md` in; Codex is no longer used). Maintained authority: `SPEC.md` (scope, invariants, gates), `PLAN.md` (checkpoint and next actions), `DECISIONS.md` (append-only), `GOTCHAS.md` (traps), `docs/LOCAL_DEV.md` (runtime, validation, this machine).

## Reading order

Start at `PLAN.md` § Current checkpoint: its newest paragraph is the current state and next action. Then read `DECISIONS` / `GOTCHAS` / `SPEC` as the task requires — don't slurp all of them for a trivial task. `DECISIONS.md` opens with an index of every entry, archives included: read the index rather than opening an archive. `GOTCHAS.md` is an index; the trap bodies are in `docs/gotchas/`. A temp note from `/handoff` covers what a session left in flight.

## Subagents (Claude) — work as orchestrator

Every call re-reads the whole context, so raw tool output in this session is the main cost of a session. This session plans, decides, talks to the owner and integrates; subagents do the heavy reading. Rationale: `DECISIONS.md` D-011, D-233.

- **"Where is X"** → built-in `Explore`.
- **"Why does X happen / does X hold"** (debugging, tracing, test or log output) → `finance-investigator` (read-only, session model). Give it one question, where to start, and the answer you need; it returns ≤300 words.
- **Settled implementation** → `finance-implementer` (Sonnet). Name the files, the exact change and the checks to run. If it returns stuck or the task turns into debugging, re-route to the investigator or re-run it with `model: "opus"`; don't retry it on Sonnet. Whenever it runs on Opus, start the description with `[re-run]` (Sonnet failed) or `[opus]` (chosen up front), so usage checks can count them.
- **High-risk review** → `finance-reviewer` (Sonnet), plus the `/verify` + `/code-review` skills.
- **Keep each delegation to ~20–40 tool calls.** Split larger work (migration → write path → UI → tests) into sequential delegations. Don't bundle independent items (e.g. several review findings) into one run: give each non-trivial item its own delegation, and group only small items in the same file or function. The only runs past 40 calls so far were bundles (59 and 71 calls). Use `SendMessage` for a short follow-up to the same agent and a fresh spawn for a new topic.
- **`/ux-review`** → `finance-ux-auditor`, one 2–3 page group at a time, in sequence (they share the browser pane). Not `general-purpose`: it starts at ~48K context and ran 41–64 calls per whole-app round.
- **Do inline**: trivial edits, commands with small output, anything touching `shared-statements/` (D-049), money / idempotency / migration judgement calls, anything involving the owner, and continuity-doc updates. Subagents don't edit continuity docs; record what they find yourself.

## Local runtime

System Node is v20; use the ignored project runtime before `pnpm`. Full setup, validation order, and Docker/Supabase acceptance notes: `docs/LOCAL_DEV.md`.

## Safety (gating — applies before any Read)

Never inspect `private-statements/`, `.env*`, or backup files. Real statements may be read **only** as the re-passworded copies in `shared-statements/` (D-049) — masked dumps stay the first resort, and nothing read there may become a fixture, a commit, a continuity-doc quotation or a screenshot. Fixtures remain invented; see `docs/FIXTURE_POLICY.md`. Preserve exact-money, currency, idempotency, append-only, audit, and least-privilege invariants; do not weaken the strict CSP. Do not commit, push, deploy, create hosted resources, or request the Windows PostgreSQL password without fresh explicit authorization. The working tree holds two deliberately local-only config files (`eslint.config.mjs`, `playwright.config.ts`) alongside ordinary uncommitted work — run `git status --short` and preserve both; `docs/LOCAL_DEV.md` § This machine lists them with the machine's hazards. After substantive changes, run `/sync-continuity` to reconcile the continuity docs (`SPEC`/`PLAN`/`DECISIONS`/`GOTCHAS`, plus `docs/LOCAL_DEV.md` for machine facts) against verified evidence before handoff. More constraints: `PLAN.md` § Working constraints.

## Finance invariants

- Use integer minor units or exact decimals for authoritative money; never binary floating point.
- Keep currency explicit; conversions require dated rates and defined rounding. Define time zones, reporting periods, and recurring-date behavior.
- Make imports, synchronization, retries, transfers, and other replayable operations idempotent.
- Treat financial data, credentials, PII, migrations, and audit history as high-risk; preserve least privilege and traceability.
- When relevant, test rounding boundaries, negatives, duplicates/replays, authorization failures, date boundaries, and migration compatibility.

## Authorizations and destructive operations

- **Nothing is inherited by a new session. Ask again.** The owner grants commit, push, `db push`, real-data read, hosted queries and hosted site use per session; what a grant was spent on is recorded in commits and decisions, not kept as a list. Subagents never commit or push.
- Never under any grant: passwords (statement passwords are in Vercel Sensitive variables the owner set; never seen, read or echoed), reading `private-statements/`, `.env*` or backup files (`dev-backup/` excepted, see `docs/LOCAL_DEV.md`).
- Ask every time, even within a granted session: importing a new real statement; creating or destroying any hosted resource. Reading `receipts_sample/` is granted per session, through throwaway harnesses that print counts only.
- `supabase db push` needs its own ask and a backup verified from the database first: the owner exports, then read `mutation_sequences` on hosted (sequence equals last exported) and dry-run before pushing.
- Every push to `main` is a production deployment. Review (`/code-review`) before asking to commit (D-125).
- Before anything destructive, read `docs/LOCAL_DEV.md` § This machine: the hosted project is the real ledger, `pnpm supabase:reset` cannot be guarded, and `.env.local` decides what a build targets.

## Continuity documents and protocol

- Each fact has one home: project state in `PLAN.md`, decisions in `DECISIONS.md` (supersede with a new entry, never rewrite), traps in `GOTCHAS.md` (symptom, cause, avoidance, verification), machine facts in `docs/LOCAL_DEV.md`. This file stays instructions only. `HANDOFF.md` was retired into these (D-268).
- Write entries so a later reader can act without re-deriving: one term per concept, active voice with the actor named, one bounded action per numbered step.
- **Value-free writing.** Counts, percentages, field names, label wordings and date distances are reportable. Amounts, balances, dates, names, counterparties, account numbers and slip references are not — reading a real value never licenses writing one into a fixture, a doc, a commit or a screenshot.
- Never score OCR against its own output; measure the shipped function, not a copy of its arithmetic; when a measurement contradicts a conclusion, the measurement wins; reproduce before diagnosing.
- The database is the authority on what is granted, the Vercel dashboard on what is deployed. An agent cannot widen its own permissions.
