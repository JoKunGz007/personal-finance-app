# Private Ledger continuity handoff

Last updated: 2026-07-25

Thin entry point. Project state lives in the maintained docs — do not duplicate it here.

Read in order: [SPEC.md](SPEC.md) (scope, invariants, gates) → [PLAN.md](PLAN.md) (checkpoint and next actions) → [DECISIONS.md](DECISIONS.md) (D-001…D-024) → [GOTCHAS.md](GOTCHAS.md) (traps worth reading before touching tests or the database).

Claude Code starts at `CLAUDE.md`; Codex at `AGENTS.md`. Product, design, parser, fixture, and recovery contracts are in `PRODUCT.md`, `DESIGN.md`, and `docs/`. Local setup and the validation order are in `docs/LOCAL_DEV.md`.

## Where the project stands

No open review blockers. One local task remains in `PLAN.md`: reading a real statement end to end, which has now cost two attempts and found two real bugs — a pdf.js integration that could not open any PDF, and an invented column model that no statement could match. The ledger, backup, restore, and import contracts are hardened and proven end to end against synthetic data. As of 2026-07-25 the app itself can carry a statement the whole way: a PDF is parsed on-device, bound to a chosen ledger account through the new chooser, and confirmed through `/api/v1/imports/confirm` into `confirm_import` under an authenticated MFA session (D-021, D-022).

Verified on 2026-07-25 with the project-local Node 24.18.0 runtime and pinned pnpm 11.17.0 (system Node is 20 — see `docs/LOCAL_DEV.md`):

| Check | Result |
| --- | --- |
| ESLint / `tsc --noEmit` / production build | Passed |
| Vitest | 88 passed, 5 skipped |
| pgTAP | 84/84 (migrations 001–008) |
| Playwright | 8/8 desktop and mobile |

The five skipped Vitest cases are unreachable-container reporters. They ran green against the live container; **a skipped run is not evidence** — start the stack with `pnpm supabase:start` before trusting a green suite.

## Next step

**Read a real statement end to end, authorized 2026-07-25** (conditions below). Two attempts that day each found a real bug rather than finishing:

1. `PDF_PARSE_FAILED` — pdf.js had never been given its worker, so no PDF could be opened at all (D-023).
2. `MISSING_COLUMN_ANCHOR` — the invented column model was structurally wrong: a real statement prints one combined `Date/Time` column and a separate `Transaction` column. Reader and fixtures corrected (D-024).

Confirmed against reality: the file opens, the text decodes, the bank signature matches, the seven headings are known and matched. Still unknown: the date format inside the `Date/Time` cell, the frame label wording behind the redacted lines, and every row value — **the statement has not been re-read since the correction**. Expect more iterations; each failure now reports a masked shape rather than an opaque code.

Those two attempts exposed how thin the parser's coverage was: 27 green layout tests never ran pdf.js even once, because they feed `extractStatement` fixture arrays. Treat "the parser is tested" with suspicion for anything the unit suite cannot see — and check the Playwright server is not stale before believing a browser result (GOTCHAS).

Still unreached in a browser behind a real PDF: the binding chooser, the authenticated import path, and the charset rejection path. If the retry shows the invented geometry is wrong, `docs/KRUNGTHAI_CONTRACT.md` and the fixtures are what change.

## Standing authorizations and their conditions

- **Real-PDF smoke test: approved 2026-07-25.** One local run, to check whether the invented fixture geometry matches an actual Krungthai statement. Conditions from `docs/FIXTURE_POLICY.md` and `PLAN.md` still bind: enter the document password interactively, never log or retain any value, never copy real content into a fixture, never commit anything derived from it, and do not browse `private-statements/` beyond that single run. Requires the owner present for the password, so it cannot run unattended. This is the assumption the whole parser rests on — the geometry was invented, so parser-vs-reality is genuinely unknown until this runs.
- **Commit and push: spent.** Granted and used on 2026-07-25 through `01c27e0`, which carries the account-binding UI and the route-wrapper suite. Treat as spent; ask again before committing the pdf.js fix.
- **Hosted Supabase / OAuth / Vercel: still not needed.** Offered and declined 2026-07-25 — `private.has_strong_owner_access` never inspects the auth provider, so a local password session with two verified TOTP factors satisfies it (D-020).

## Before you touch anything

- Run `git status --short`. Four config files (`.gitignore`, `eslint.config.mjs`, `playwright.config.ts`, `pnpm-workspace.yaml`) are **intentionally uncommitted** — preserve them. The pdf.js worker fix, the generated-PDF fixtures, the browser parser specs, and this round's doc updates are also uncommitted and awaiting authorization; everything before them is pushed through `01c27e0`.
- `public.ledger_owners` binds exactly one owner and is immutable; a second owner cannot exist without a database reset. Authenticate as the seeded synthetic owner (`supabase/seed.sql` holds its password).
- Several suites mutate the one local database, so `vitest.config.ts` sets `fileParallelism: false`. Leave it — without it, suites pass alone and fail together.
- Never inspect `private-statements/`, `.env*`, or real financial data outside the authorized smoke test. Synthetic data only. Preserve the exact-money, currency, idempotency, append-only, audit, and least-privilege invariants, and do not weaken the CSP.
- After substantive changes, run `/sync-continuity` to reconcile these docs against verified evidence.
