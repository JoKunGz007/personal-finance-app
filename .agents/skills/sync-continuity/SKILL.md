---
name: sync-continuity
description: Reconcile a repository's maintained SPEC.md, PLAN.md, DECISIONS.md, GOTCHAS.md, and thin HANDOFF.md with the latest verified source, tests, migrations, and operational evidence. Use after substantive implementation, validation, requirement changes, architecture decisions, recovered failures, environment changes, or whenever the user asks to sync, refresh, audit, update, or prepare project continuity documentation.
---

# Sync Continuity

Keep project continuity documents accurate without turning them into duplicate specifications or unverified status reports.

## Workflow

### 1. Establish authority

Read repository instructions first. Then read, when present:

1. `SPEC.md`
2. `PLAN.md`
3. `DECISIONS.md`
4. `GOTCHAS.md`
5. `HANDOFF.md`

Follow links only to artifacts needed to resolve changed or conflicting claims. Treat detailed product, design, architecture, recovery, parser, migration, test, and source files as owners of their exact contracts.

Do not inspect ignored private-data directories, secret files, environment values, credential stores, or real user data merely to update continuity documentation.

### 2. Gather current evidence

Inspect the evidence relevant to the work being synchronized:

- Use `git status --short` plus direct file inspection. Do not rely on ordinary `git diff` for untracked files.
- Inspect changed source, migrations, tests, configuration, and linked specifications.
- Use command output from the current turn for validation claims.
- Run missing verification only when it is safe, in scope, and proportionate. Never rewrite a previous result as current without rerunning it.
- Preserve dated historical results as historical evidence, but never promote them to current after relevant source or environment changes.
- Prefer evidence in this order: current command result, current source/schema, current detailed contract, continuity document, old handoff or chat summary.

If claims conflict, update the stale continuity document in the same turn. Preserve uncertainty when evidence is incomplete.

### 3. Reconcile each document

Update only affected files:

- `SPEC.md`: current scope, invariants, acceptance gates, and links. Do not copy detailed contracts already owned elsewhere.
- `PLAN.md`: verified checkpoint, exact test results, completed work, remaining tasks, blockers, and authorization gates. Remove work only when evidence proves completion.
- `DECISIONS.md`: append durable decisions with date, status, decision, rationale, consequences when relevant, and evidence paths. Do not rewrite history. Supersede an older entry with a new entry that references it.
- `GOTCHAS.md`: add repeatable, non-obvious traps using symptom, cause, avoidance, and verification. Do not add one-off noise or generic advice.
- `HANDOFF.md`: keep it as a thin index plus a short current headline. Never recreate a long duplicate snapshot.
- `README.md` and `AGENTS.md`: update only if the continuity entry points or maintenance rules changed.

Use the repository's current date. Distinguish "implemented," "applied locally," "tested," and "accepted"; they are not interchangeable.

### 4. Protect sensitive state

Never write:

- API keys, JWTs, passwords, tokens, recovery codes, or connection strings
- PII or real financial values
- private file contents or paths that reveal private data
- command output that contains local development secrets

Summarize sensitive operational results without reproducing their values. If secret-like data already appears in a continuity file, redact it and report the redaction.

### 5. Edit safely

Use `apply_patch` for document edits. Preserve unrelated user changes and existing formatting. Do not commit, push, deploy, install software, mutate external services, or expand task scope merely to synchronize documentation.

"Latest" means latest verified repository state. Browse external sources only when a continuity claim genuinely depends on unstable external facts.

### 6. Validate

Before finishing:

1. Confirm every required continuity file exists.
2. Resolve relative Markdown links in the continuity files.
3. Search only the exact continuity files for credential-like strings. Never scan directories recursively or open `.env*`, ignored private paths, generated output, dependency trees, logs, or credential stores. Report only the affected continuity filename and line number; do not print a matched secret value.
4. Run `git diff --check` for tracked edits and inspect `git status --short` for untracked files.
5. Re-read changed sections and confirm every completion/test claim has evidence.

Report:

- files updated
- evidence used
- verification performed
- unresolved uncertainty or work still open

Do not claim synchronization succeeded if validation failed.
