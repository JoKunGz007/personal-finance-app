# Private Ledger continuity handoff

Last updated: 2026-07-25

Thin entry point. Project state lives in the maintained docs — do not duplicate it here.

Read in order: [SPEC.md](SPEC.md) (scope, invariants, gates) → [PLAN.md](PLAN.md) (checkpoint and next actions) → [DECISIONS.md](DECISIONS.md) (D-001…D-028) → [GOTCHAS.md](GOTCHAS.md) (traps worth reading before touching tests or the database).

Claude Code starts at `CLAUDE.md`; Codex at `AGENTS.md`. Product, design, parser, fixture, and recovery contracts are in `PRODUCT.md`, `DESIGN.md`, and `docs/`. Local setup and the validation order are in `docs/LOCAL_DEV.md`.

## Where the project stands

No open review blockers and no open parser defect. Two local tasks remain in `PLAN.md`: reading a real statement end to end, which has cost six attempts and found seven real defects — none detectable without a real file, every one in code the unit suite called green, and the last of them **now fixed and reproduced by the fixtures** (D-028) — and then reading the last page's summary block as a global integrity check. The ledger, backup, restore, and import contracts are hardened and proven end to end against synthetic data. As of 2026-07-25 the app itself can carry a statement the whole way: a PDF is parsed on-device, bound to a chosen ledger account through the new chooser, and confirmed through `/api/v1/imports/confirm` into `confirm_import` under an authenticated MFA session (D-021, D-022).

Verified on 2026-07-25 with the project-local Node 24.18.0 runtime and pinned pnpm 11.17.0 (system Node is 20 — see `docs/LOCAL_DEV.md`):

| Check | Result |
| --- | --- |
| ESLint / `tsc --noEmit` / production build | Passed |
| Vitest | 96 passed, 5 skipped |
| pgTAP | 84/84 (migrations 001–008) |
| Playwright | 8/8 desktop and mobile |

The five skipped Vitest cases are unreachable-container reporters. They ran green against the live container; **a skipped run is not evidence** — start the stack with `pnpm supabase:start` before trusting a green suite.

## Next step

**Read a real statement end to end — attempt 7** (authorization conditions below). The blocker that stopped attempt 6 is fixed; nothing in the parser is known to be wrong. `PLAN.md` task 7 carries the six attempts, what each found, and the fix.

The fix in one line: `headerY` came from the first line matching *any* column anchor, and the statement prints `Branch` as a frame label, so the frame region was cut short and the account-number line was never searched; `findColumns` now returns the `y` of the line carrying all seven headings and that is the boundary (D-028). The fixtures print the collision, and restoring the old search fails 26 of 32 layout tests with the real statement's exact message.

Read D-023 … D-026 and D-028 before touching `lib/krungthai-layout.ts`. Fixing the frame contract exposed three further latent defects, including one that read a neighbouring field's digits as the account suffix — a wrong but entirely plausible account binding, which is the worst failure mode this ledger has.

Confirmed against reality: the file opens, the text decodes, the signature matches, all seven headings match, the currency is found, and account type and statement period read. Everything past the frame is still unknown, including every row value and the date format inside the `Date/Time` cell — so `INVALID_ROW_CONTENT` on attempt 7 would be progress, not a regression. The owner drives the run in their own browser on port 3000, enters the document password interactively, and must restart their server after any code change to see it.

Diagnosis costs nothing now. Failures report masked shapes (`dd/dd/dd dd:dd`), the label diagnostic reports digit-free label wordings from the first and last pages, and the structural dump reports every line's shape and column positions. All three are guarded by tests asserting no value can survive them, so an iteration exposes no data.

The statement's last page carries a summary block, and its labels are now known: `Total Page`, `Total Withdrawal` and `Total Deposit`, each printing a count then an amount. Reading them would restore a global integrity check stronger than a closing balance, which matters because balances are now derived (D-026). Nothing reads them yet — `PLAN.md` task 8, deliberately kept behind the first successful read, and it carries an open product question about what a mismatch should do.

Those attempts also exposed how thin the parser's coverage was: 27 green layout tests never ran pdf.js even once, because they feed `extractStatement` fixture arrays. Treat "the parser is tested" with suspicion for anything the unit suite cannot see, and verify browser results with `--config=playwright.isolated.config.ts` (D-027).

Still unreached in a browser behind a real PDF: the binding chooser, the authenticated import path, and the charset rejection path.

## Standing authorizations and their conditions

- **Real-PDF smoke test: approved 2026-07-25, and repeatedly re-exercised with the owner present.** Originally scoped as one local run to check the invented geometry; it has taken six, each authorized in the moment by the owner driving the browser, because every run found a defect rather than an answer. The owner twice offered direct access to `private-statements/` and its password and was twice declined in favour of on-device masked diagnostics — see the note below. Conditions from `docs/FIXTURE_POLICY.md` and `PLAN.md` still bind: enter the document password interactively, never log or retain any value, never copy real content into a fixture, never commit anything derived from it, and do not browse `private-statements/` beyond that single run. Requires the owner present for the password, so it cannot run unattended. This is the assumption the whole parser rests on — the geometry was invented, so parser-vs-reality is genuinely unknown until this runs.
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
