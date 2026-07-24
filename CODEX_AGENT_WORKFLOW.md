# Codex Agent Workflow

This repository uses a project-scoped Codex workflow with one parent agent and four finance-focused custom agents. The parent owns task decomposition, integration, final decisions, and communication. Subagents are used selectively when specialization or independent verification adds value.

## Configuration map

- [`AGENTS.md`](AGENTS.md) defines durable routing, coordination, and finance rules.
- [`.codex/config.toml`](.codex/config.toml) enables subagents and limits the session to three concurrent child agents.
- [`.codex/agents/finance-explorer.toml`](.codex/agents/finance-explorer.toml) defines the explorer.
- [`.codex/agents/finance-implementer.toml`](.codex/agents/finance-implementer.toml) defines the implementer.
- [`.codex/agents/finance-validator.toml`](.codex/agents/finance-validator.toml) defines the validator.
- [`.codex/agents/finance-reviewer.toml`](.codex/agents/finance-reviewer.toml) defines the reviewer.

## When the workflow applies

The workflow is available when Codex starts a new supported session inside this trusted repository and loads the project configuration. It works in current local Codex app, CLI, and IDE sessions that support subagents.

Subagents are not permanent background workers. The parent creates them only when a task matches the routing rules or when the user asks for a named agent explicitly.

To request explicit delegation, use prompts such as:

```text
Use finance-explorer to trace the transaction import flow.
```

```text
Implement this with finance-implementer, validate it independently with
finance-validator, and use finance-reviewer for the monetary and security risks.
```

## Routing overview

```text
User request
    |
    v
Parent Codex agent
    |
    +-- Trivial or narrow work ----------------------> Parent handles it
    |
    +-- Broad or cross-module investigation --------> finance-explorer
    |
    +-- Decision-complete substantial change -------> finance-implementer
    |                                                    |
    |                                                    v
    |                                               finance-validator
    |
    +-- Financial, security, or contract risk ------> finance-reviewer
                                                         |
                                                         v
Parent integrates the evidence, changes, validation, and review
```

The parent retains ownership of the final result. Subagents return concise, evidence-based handoffs rather than taking over the user conversation.

## Roles

### Parent agent

The parent:

- handles trivial edits and narrow factual work directly;
- decides whether delegation is worthwhile;
- gives subagents bounded tasks and relevant constraints;
- sequences dependent work and integrates handoffs;
- resolves validation failures and reviewer findings;
- owns final user communication;
- may commit or push only with explicit user authorization.

### `finance-explorer`

| Setting | Value |
| --- | --- |
| Model | GPT-5.6 Terra |
| Reasoning | Low |
| Sandbox default | Read-only |

Use the explorer for broad, unfamiliar, or cross-module discovery. It traces actual execution paths, identifies relevant files and symbols, and reports assumptions or missing information.

The explorer must not implement fixes or modify repository files.

Typical tasks:

- trace transaction data from import through persistence and presentation;
- map authentication or authorization checks across modules;
- identify all consumers of a public schema or financial calculation;
- investigate an unfamiliar subsystem before implementation is planned.

### `finance-implementer`

| Setting | Value |
| --- | --- |
| Model | GPT-5.6 Sol |
| Reasoning | Low by default |
| Sandbox default | Workspace-write |

Use the implementer for substantial changes only after requirements and design decisions are sufficiently complete. It edits the workspace, preserves unrelated changes, follows the finance invariants, and runs focused checks.

Explicitly override the implementer to Sol with medium reasoning only for:

- unresolved architecture;
- migrations;
- difficult debugging;
- repeated validation failures.

The implementer must not commit or push.

### `finance-validator`

| Setting | Value |
| --- | --- |
| Model | GPT-5.6 Luna |
| Reasoning | Low |
| Sandbox default | Workspace-write |

Use the validator after non-trivial behavior or configuration changes. It independently tests the result but does not repair defects.

The workspace-write sandbox allows test runners to create caches, coverage output, build output, and other transient artifacts. Its instructions treat source files as read-only: it must not edit code, tests, documentation, configuration, fixtures, snapshots, migrations, manifests, or lockfiles.

The validator checks repository status before and after testing and reports:

- commands and results;
- concrete failures;
- affected files or symbols;
- unexpected artifacts or tracked-file modifications;
- residual risks.

### `finance-reviewer`

| Setting | Value |
| --- | --- |
| Model | GPT-5.6 Sol |
| Reasoning | High |
| Sandbox default | Read-only |

Use the reviewer only for material high-risk changes involving:

- monetary correctness or currency conversion;
- authentication or authorization;
- credentials or PII;
- migrations or audit history;
- concurrency or idempotency;
- public APIs, schemas, or other contracts.

The reviewer leads with findings ordered by severity. Each finding should identify the location, failure mechanism, impact, smallest remediation, and missing test where applicable. It avoids style-only or speculative comments.

## Example task flows

### Trivial edit

Request: rename a dashboard label.

```text
Parent -> edit -> focused check -> final response
```

No subagent is needed.

### Cross-module investigation

Request: find where transaction categories are created, imported, stored, and displayed.

```text
Parent -> finance-explorer -> evidence handoff -> parent response
```

### Planned feature

Request: implement a decision-complete recurring-transactions specification.

```text
Parent -> finance-implementer -> finance-validator -> parent integration
```

### High-risk financial change

Request: change transfer rounding and migrate existing balances.

```text
Parent
  -> finance-explorer
  -> finance-implementer
  -> finance-validator
  -> finance-reviewer
  -> parent integration
```

These stages may be sequenced because only three child agents can be active concurrently and the repository normally uses one writer at a time.

## Coordination rules

- A maximum of three child agents may be active in one session; the parent is not counted.
- Parallelize independent read-heavy investigation, validation, and review when it materially saves time.
- Use one writing agent unless file ownership is explicitly non-overlapping.
- Reuse an existing named agent for follow-up work rather than spawning a replacement.
- Handoffs should cite relevant files, symbols, commands, test results, and unresolved risks.
- Subagents must not commit or push.

## Finance invariants

All roles follow the repository finance invariants. The single source is **`AGENTS.md` § Finance invariants** — integer minor units or exact decimals for money (never binary float); explicit currency with dated rates and defined rounding; defined time-zone, reporting-period, and recurring-date semantics; idempotent replayable operations (imports, sync, retries, transfers); high-risk handling of financial data, credentials, PII, migrations, and audit history with least privilege and traceability; and the boundary tests to run (rounding, negatives, duplicates/replays, authorization failures, date boundaries, migration compatibility). Do not restate them here — update `AGENTS.md` if they change.

## Permission behavior

Agent sandbox values are defaults, not an absolute security boundary. Live permission or sandbox overrides selected for the parent session can be inherited by child agents.

In particular, `finance-validator` technically uses workspace-write so test tools can generate artifacts. Its source-read-only behavior is enforced through its developer instructions and before/after repository-status checks rather than filesystem-level path isolation.

## Session behavior and ephemeral CLI sessions

During validation with Codex CLI `0.145.0`, subagent attachment failed in an ephemeral session:

```text
collab spawn failed: no thread with id: ...
```

The observed reason is that `codex exec --ephemeral` does not register a persistent parent thread in the normal collaboration thread store, while child agents need a registered parent thread to attach, receive follow-ups, and return results.

The smoke tests succeeded in normal fresh sessions. Those sessions may create local Codex session-history records, but they do not modify project files, global Codex configuration, Git history, or a remote repository.

This was observed behavior in the installed CLI version and should not be treated as a guarantee about every future Codex release.

## Benefits

- Specialized roles reduce context switching and keep each task focused.
- Independent validation reduces self-confirmation bias.
- High-risk review is reserved for changes where deeper reasoning is valuable.
- Read-heavy work can run concurrently.
- One-writer coordination reduces edit conflicts.
- Finance-specific invariants make monetary and sensitive-data expectations durable.
- Model and reasoning tiers balance correctness, latency, and credit consumption.
- Evidence-based handoffs keep the parent context cleaner and make results easier to audit.

Subagents consume additional tokens because every agent performs its own model and tool work. Selective routing is therefore intentional: small work stays with the parent, while delegation is reserved for tasks where it materially improves speed, confidence, or correctness.
