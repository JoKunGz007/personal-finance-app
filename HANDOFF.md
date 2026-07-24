# Private Ledger continuity handoff

Last updated: 2026-07-25

Intentionally a thin entry point. Do not duplicate project state here.

Read these maintained sources in order:

1. [SPEC.md](SPEC.md) — scope, invariants, and acceptance gates.
2. [PLAN.md](PLAN.md) — current verified checkpoint and next actions.
3. [DECISIONS.md](DECISIONS.md) — durable architectural and workflow decisions.
4. [GOTCHAS.md](GOTCHAS.md) — recurring operational and implementation traps.

Claude Code sessions start at `CLAUDE.md`; Codex sessions at `AGENTS.md`. Detailed product, design, architecture, parser, fixture, and recovery contracts remain in `PRODUCT.md`, `DESIGN.md`, and `docs/`.

Project headline: no open review blockers. All four pgTAP blockers plus the carried fingerprint follow-up are resolved with red→green evidence — payload digest bound server-side (D-012), restore counts/sequence bounds and a populated restore round-trip (D-013), and row fingerprints now recomputed and rejected on mismatch behind a source-text charset guard (D-014, migrations 007–008 + `lib/statement.ts`). Local gate green on 2026-07-25: ESLint, TypeScript, Vitest 59 passed / 1 skipped, pgTAP 84/84 with migrations 001–008, production build; each fix verified red by holding its migration out. Playwright is dated 2026-07-24 and not re-run. Remaining work is ordinary next-local-tasks — see `PLAN.md`.

Migrations `202607240007`/`202607240008` are committed and applied to the local database. Four config files (`.gitignore`, `eslint.config.mjs`, `playwright.config.ts`, `pnpm-workspace.yaml`) remain intentionally uncommitted — run `git status --short` before assuming the tree is clean, and preserve them.

JS↔PostgreSQL fingerprint agreement — the risk migration 008 makes load-bearing, since a divergence fails every import closed — is now covered by `tests/fingerprint-parity.test.ts`, which hashes the same rows with the real `lib/canonical.ts` and compares against `private.row_fingerprint` over psql. It was confirmed distinguishing by desyncing the bank code and observing a concrete hash mismatch. It skips when the container is unreachable, so a skipped run is not evidence.

Krungthai parsing now reads a whole statement: `lib/krungthai-layout.ts` extracts the transaction grid and the frame (account type, last four, period, opening/closing balances, THB) from the pdf.js text layer against invented synthetic fixtures, cross-checks the closing balance against the last row, and anchors two-digit years on the extracted period end (D-015, D-016, 27 tests). The worker no longer hard-stops at `LAYOUT_V1_UNSUPPORTED_DOCUMENT`. Two limits to carry forward — the fixture geometry is invented, so agreement with a real Krungthai PDF is unverified until the authorized smoke test; and binding an extracted statement to a ledger account is deliberately not inferred by the parser, so a PDF still cannot produce a confirmable payload. The UI reports what was read and stops.

Remaining gap: the authenticated HTTP import path is still unexercised. A UI walkthrough does not reach it — `confirmSynthetic` only sets browser state, and `/api/v1/imports/confirm` sits behind `has_strong_owner_access` (see GOTCHAS). The charset rejection path likewise has no end-to-end coverage.

Do not inspect `private-statements/`, use real financial data, commit, push, deploy, or create hosted resources without explicit authorization.
