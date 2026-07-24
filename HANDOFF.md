# Private Ledger continuity handoff

Last verified: 2026-07-24

This file is intentionally a thin entry point. Do not duplicate project state here.

Read these maintained sources in order:

1. [SPEC.md](SPEC.md) — scope, invariants, and acceptance gates.
2. [PLAN.md](PLAN.md) — current verified checkpoint and next actions.
3. [DECISIONS.md](DECISIONS.md) — durable architectural and workflow decisions.
4. [GOTCHAS.md](GOTCHAS.md) — recurring operational and implementation traps.

Detailed product, design, architecture, parser, fixture, and recovery contracts remain in `PRODUCT.md`, `DESIGN.md`, and `docs/`.

Current headline: the five original hardening findings are implemented; the dated local checkpoint records passing ESLint, TypeScript, 27 Vitest tests, and 24 pgTAP tests. Supabase services passed a health check after returning to the default Docker network, but a clean reset and the remaining local acceptance work are still open in `PLAN.md`.

Do not inspect `private-statements/`, use real financial data, commit, push, deploy, or create hosted resources without explicit authorization.
