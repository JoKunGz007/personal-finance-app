# Private Ledger continuity handoff

Last updated: 2026-07-25

Thin entry point. Project state lives in the maintained docs — do not duplicate it here.

Read in order: [SPEC.md](SPEC.md) (scope, invariants, gates) → [PLAN.md](PLAN.md) (checkpoint and next actions) → [DECISIONS.md](DECISIONS.md) (D-001…D-027) → [GOTCHAS.md](GOTCHAS.md) (traps worth reading before touching tests or the database).

Claude Code starts at `CLAUDE.md`; Codex at `AGENTS.md`. Product, design, parser, fixture, and recovery contracts are in `PRODUCT.md`, `DESIGN.md`, and `docs/`. Local setup and the validation order are in `docs/LOCAL_DEV.md`.

## Where the project stands

No open review blockers. One local task remains in `PLAN.md`: reading a real statement end to end, which has cost five attempts and found six real defects — none detectable without a real file, and every one in code the unit suite called green. The ledger, backup, restore, and import contracts are hardened and proven end to end against synthetic data. As of 2026-07-25 the app itself can carry a statement the whole way: a PDF is parsed on-device, bound to a chosen ledger account through the new chooser, and confirmed through `/api/v1/imports/confirm` into `confirm_import` under an authenticated MFA session (D-021, D-022).

Verified on 2026-07-25 with the project-local Node 24.18.0 runtime and pinned pnpm 11.17.0 (system Node is 20 — see `docs/LOCAL_DEV.md`):

| Check | Result |
| --- | --- |
| ESLint / `tsc --noEmit` / production build | Passed |
| Vitest | 95 passed, 5 skipped |
| pgTAP | 84/84 (migrations 001–008) |
| Playwright | 8/8 desktop and mobile |

The five skipped Vitest cases are unreachable-container reporters. They ran green against the live container; **a skipped run is not evidence** — start the stack with `pnpm supabase:start` before trusting a green suite.

## Next step

**Read a real statement end to end, authorized 2026-07-25** (conditions below). Five attempts that day, each finding a real defect rather than finishing:

1. `PDF_PARSE_FAILED` — pdf.js had never been given its worker, so no PDF could be opened at all (D-023).
2. `MISSING_COLUMN_ANCHOR` — the invented column model was structurally wrong: one combined `Date/Time` column, a separate `Transaction` column (D-024).
3. `UNSUPPORTED_CURRENCY` — the currency is printed below the grid, not in the frame block (D-025).
4. `MISSING_FRAME_FIELD`, twice — the real frame prints no opening or closing balance at all, its labels are `Account Number` and `Statement Period`, rows span two printed lines, and frame lines carry several label/value pairs (D-026).

Read D-026 before touching the parser. Fixing it exposed three latent defects, including one that read a neighbouring field's digits as the account suffix — a wrong but entirely plausible account binding, which is the worst failure mode this ledger has.

Confirmed against reality: the file opens, the text decodes, the signature matches, all seven headings match, the currency is found, and account type and statement period read. Still unknown: the account number label's exact spacing, the last page's summary-block wordings, and every row value — **the statement has not been re-read since the latest correction**.

Diagnosis costs nothing now. Failures report masked shapes (`dd/dd/dd dd:dd`), the label diagnostic reports digit-free label wordings from the first and last pages, and the structural dump reports every line's shape and column positions. All three are guarded by tests asserting no value can survive them, so an iteration exposes no data.

The statement's last page carries a summary block — item count, total withdrawal and total deposit, each with a count. Reading it would restore a global integrity check stronger than a closing balance, which matters because balances are now derived (D-026). Its label wordings are the next thing to learn.

Those attempts also exposed how thin the parser's coverage was: 27 green layout tests never ran pdf.js even once, because they feed `extractStatement` fixture arrays. Treat "the parser is tested" with suspicion for anything the unit suite cannot see, and verify browser results with `--config=playwright.isolated.config.ts` (D-027).

Still unreached in a browser behind a real PDF: the binding chooser, the authenticated import path, and the charset rejection path.

## Standing authorizations and their conditions

- **Real-PDF smoke test: approved 2026-07-25, and repeatedly re-exercised with the owner present.** Originally scoped as one local run to check the invented geometry; it has taken five, each authorized in the moment by the owner driving the browser, because every run found a defect rather than an answer. The owner twice offered direct access to `private-statements/` and its password and was twice declined in favour of on-device masked diagnostics — see the note below. Conditions from `docs/FIXTURE_POLICY.md` and `PLAN.md` still bind: enter the document password interactively, never log or retain any value, never copy real content into a fixture, never commit anything derived from it, and do not browse `private-statements/` beyond that single run. Requires the owner present for the password, so it cannot run unattended. This is the assumption the whole parser rests on — the geometry was invented, so parser-vs-reality is genuinely unknown until this runs.
- **Direct access to `private-statements/`: offered twice by the owner, declined twice.** Not a refusal of their authority over their own data — the narrower path was simply better. The gap was ever only a handful of boilerplate label strings, and reading the statement would have put real transactions and counterparties into a session transcript, made "invented" unfalsifiable for every fixture written afterwards, and invited tuning the parser to one document. `docs/FIXTURE_POLICY.md` remains in force and unamended. If a future session does accept, record it as a decision first.
- **Commit and push: granted 2026-07-25 and used repeatedly**, most recently for the parser corrections. Treat as spent at the start of a new session; ask again.
- **Hosted Supabase / OAuth / Vercel: still not needed.** Offered and declined 2026-07-25 — `private.has_strong_owner_access` never inspects the auth provider, so a local password session with two verified TOTP factors satisfies it (D-020).

## Before you touch anything

- Run `git status --short`. Four config files (`.gitignore`, `eslint.config.mjs`, `playwright.config.ts`, `pnpm-workspace.yaml`) are **intentionally uncommitted** — preserve them. Everything else is committed and pushed.
- Never rewrite a Markdown file through PowerShell `Get-Content`/`Set-Content`. In PowerShell 5.1 the read defaults to ANSI, so every em dash, ellipsis and arrow in these docs comes back as mojibake and is then written out as real UTF-8. It corrupted `HANDOFF.md` once and had to be restored from git. Use the editing tools.
- `public.ledger_owners` binds exactly one owner and is immutable; a second owner cannot exist without a database reset. Authenticate as the seeded synthetic owner (`supabase/seed.sql` holds its password).
- Several suites mutate the one local database, so `vitest.config.ts` sets `fileParallelism: false`. Leave it — without it, suites pass alone and fail together.
- Never inspect `private-statements/`, `.env*`, or real financial data outside the authorized smoke test. Synthetic data only. Preserve the exact-money, currency, idempotency, append-only, audit, and least-privilege invariants, and do not weaken the CSP.
- After substantive changes, run `/sync-continuity` to reconcile these docs against verified evidence.
