# Private Ledger continuity handoff

Last updated: 2026-07-25

Thin entry point. Project state lives in the maintained docs — do not duplicate it here.

Read in order: [SPEC.md](SPEC.md) (scope, invariants, gates) → [PLAN.md](PLAN.md) (checkpoint and next actions) → [DECISIONS.md](DECISIONS.md) (D-001…D-036) → [GOTCHAS.md](GOTCHAS.md) (traps worth reading before touching tests or the database).

Claude Code starts at `CLAUDE.md`; Codex at `AGENTS.md`. Product, design, parser, fixture, and recovery contracts are in `PRODUCT.md`, `DESIGN.md`, and `docs/`. Local setup and the validation order are in `docs/LOCAL_DEV.md`.

## Where the project stands

No open review blockers and no open parser defect. **A real statement now reads end to end** — 233 rows across 12 pages, through to the account-binding stage — after ten owner-driven reads that found eleven real defects, none detectable without a real file and every one in code the unit suite called green (D-023 … D-032). Two of the eleven did not fail closed, including a 543-year calendar shift that parsed cleanly and would have written 1983 dates into an append-only ledger (D-031). The ledger, backup, restore, and import contracts are hardened and proven end to end against synthetic data.

The parse is now **independently verified** against the document (D-033): the statement's own printed counts sum to exactly the 233 rows the reader found, and its printed totals close the balance chain onto the last row — the first confirmation that D-026's derived opening is right. That cross-check is enforced in code and fails closed on any disagreement. The 13-month period, the account, and the currency position are all confirmed by the owner.

The app now carries a statement the whole way **in a real browser**, which until 2026-07-25 was only ever proven from tests: a PDF is parsed on-device, bound to a chosen ledger account through the chooser, and confirmed through `/api/v1/imports/confirm` into `confirm_import` under an `aal2` session (D-021, D-022, D-036). Reaching that needed a development sign-in, because the app has no login of its own — the real one is Google OAuth and is still unbuilt, behind the hosted authorization gate. The remaining build work is the other five statement and receipt layouts (task 11).

Verified on 2026-07-25 with the project-local Node 24.18.0 runtime and pinned pnpm 11.17.0 (system Node is 20 — see `docs/LOCAL_DEV.md`):

| Check | Result | When |
| --- | --- | --- |
| ESLint / `tsc --noEmit` / production build | Passed | after D-036 |
| Vitest, live container | 123 passed, 6 skipped | after D-036 |
| Playwright, isolated config | 8/8 desktop and mobile | after D-036 |
| Playwright, owner config | 3/3 — binding chooser, refused binding, charset rejection | after D-036 |
| pgTAP | 84/84 (migrations 001–008) | earlier; no migration has changed since |

**A skipped run is not evidence** — start the stack with `pnpm supabase:start` before trusting a green suite. The 6 skips are the unreachable-container reporters, which skip precisely because the container *was* reachable. pgTAP has not been re-run this round; nothing since has touched SQL, a migration, or database code, but re-run it before any change that does.

Order matters between the two browser suites and Vitest: `public.accounts` is unique on (owner_id, bank_code, last_four) and they all want an account ending 7890 for the one owner, so a suite that leaves accounts behind breaks the next one (GOTCHAS). Both clean up in teardown now.

## Next step

**Build work — `PLAN.md` task 11, the other five layouts** (SCB, KBANK, three receipt formats). Its tooling and both authorization gates are now in place (D-035): `scripts/mask-statement.mjs` writes a masked structural dump per format to the gitignored `masked-dumps/`, verified end to end against a synthetic PDF but **not yet run against a real statement**. Each format costs one owner-driven invocation — the owner must be present to type the password once — after which the layout is developed offline from the dump. Get a receipt dump before making any design claim about receipts; they may not be a column grid at all, and they are the case where a dump's unmasked label section could most plausibly pick up a merchant or recipient name.

That is now the only build work left. **Task 10 is closed** (D-036): the owner configured `.env.local`, which turned out to be half the problem — the app had no sign-in at all, so no browser could ever have reached the three remaining paths. A flag-gated development sign-in route now mints the `aal2` session, and `tests/e2e/owner-session.spec.ts` covers all three in a real browser: the binding chooser, an import confirmed into `confirm_import`, a refused non-matching binding, and an out-of-charset statement refused at assembly. Run it with `--config=playwright.owner.config.ts`; any other build renders no sign-in button and its route answers 404. **The real login is still Google OAuth and is still unbuilt**, behind the hosted authorization gate.

Before touching `lib/krungthai-layout.ts`, read D-023 … D-034. The four value-free diagnostics now live in `lib/masked-diagnostics.ts`, which imports nothing on purpose and is re-exported unchanged from the layout module.

Also open, and needing an owner decision before it can be designed: **cross-check provenance is not persisted.** Whether an import was verified against the statement's printed totals is recorded nowhere, so the ledger cannot tell a cross-checked import from an unverified one. `StatementFrame` is hashed into the import digest, so recording it needs a migration and a payload-contract change (D-033).

Two cautions the real-statement reads earned. The unit suite is weaker evidence than it looks: 27 green layout tests never ran pdf.js once, because they feed `extractStatement` fixture arrays — so verify anything browser-shaped with `--config=playwright.isolated.config.ts` (D-027). And diagnosis costs nothing: failures report masked shapes (`dd/dd/dd dd:dd`), and every diagnostic is guarded by a test asserting no value survives it, so an iteration exposes no data.

## Standing authorizations and their conditions

- **Real-PDF smoke test: approved 2026-07-25, and repeatedly re-exercised with the owner present.** Originally scoped as one local run to check the invented geometry; it has taken six, each authorized in the moment by the owner driving the browser, because every run found a defect rather than an answer. The owner twice offered direct access to `private-statements/` and its password and was twice declined in favour of on-device masked diagnostics — see the note below. Conditions from `docs/FIXTURE_POLICY.md` and `PLAN.md` still bind: enter the document password interactively, never log or retain any value, never copy real content into a fixture, never commit anything derived from it, and do not browse `private-statements/` beyond that single run. Requires the owner present for the password, so it cannot run unattended. This is the assumption the whole parser rests on — the geometry was invented, so parser-vs-reality is genuinely unknown until this runs.
- **Direct access to `private-statements/`: granted 2026-07-25; both gates now satisfied; still NOT YET USED.** The owner offered three times; the first two were declined. The grant came with a correction they accepted: they believed agent reads keep data on-device, which is false — the app's on-device guarantee (D-003) belongs to the app, not to an agent, whose reads are transmitted and retained in a session transcript. If a future session finds the owner reasoning from the older belief, correct it before acting on this authorization. The two gates are now written: **D-035** records the grant, its boundary and its cost, and `docs/FIXTURE_POLICY.md` § Masked structural dumps carries the amendment. The boundary is **invoke, don't read**: an agent may run `scripts/mask-statement.mjs` against a file in that directory and may read the dump it writes to the gitignored `masked-dumps/`; an agent may not open, list, or read the PDF itself. Once folder access exists that is discipline, not structure — say so plainly rather than implying otherwise. Statement passwords are the owner's date of birth and citizen ID — identity-grade and non-rotatable. Never accept one in chat, in a repo file, or as a CLI argument; the harness reads stdin only and needs it once per file. A dump is working material, never a fixture and never committed.
- **Direct access to `private-statements/`: the two earlier refusals, for context.** Not a refusal of their authority over their own data — the narrower path was simply better. The gap was ever only a handful of boilerplate label strings, and reading the statement would have put real transactions and counterparties into a session transcript, made "invented" unfalsifiable for every fixture written afterwards, and invited tuning the parser to one document. `docs/FIXTURE_POLICY.md` remains in force and unamended. If a future session does accept, record it as a decision first.
- **Commit and push: granted 2026-07-25 and used repeatedly**, most recently for the parser corrections. Treat as spent at the start of a new session; ask again.
- **Hosted Supabase / OAuth / Vercel: still not needed.** Offered and declined 2026-07-25 — `private.has_strong_owner_access` never inspects the auth provider, so a local password session with two verified TOTP factors satisfies it (D-020).

## Before you touch anything

- Run `git status --short`. Four config files (`.gitignore`, `eslint.config.mjs`, `playwright.config.ts`, `pnpm-workspace.yaml`) are **intentionally uncommitted** — preserve them, and note that `.gitignore` now also carries `masked-dumps/`. `main` is level with `origin/main` at `92e091d`, which carries the D-028 frame-boundary fix, the D-029…D-032 parser corrections from the real-statement reads, the D-033/D-034 cross-check and currency guard, and the two docs commits that followed. Treat commit and push authorization as spent; ask again. **Uncommitted beyond those four:** two rounds of work. D-035, the masking harness — `scripts/mask-statement.mjs`, `lib/masked-diagnostics.ts`. D-036, the development sign-in — `app/api/v1/dev/session/route.ts`, `lib/dev/totp.ts`, `playwright.owner.config.ts`, `tests/dev-session.test.ts`, `tests/e2e/owner-session.spec.ts`. Plus edits to `lib/krungthai-layout.ts`, `app/ledger-app.tsx`, `tests/privacy.test.ts`, `tests/helpers/local-owner.ts`, `playwright.isolated.config.ts`, and the continuity docs.
- Never rewrite a Markdown file through PowerShell `Get-Content`/`Set-Content`. In PowerShell 5.1 the read defaults to ANSI, so every em dash, ellipsis and arrow in these docs comes back as mojibake and is then written out as real UTF-8. It corrupted `HANDOFF.md` once and had to be restored from git. Use the editing tools.
- `public.ledger_owners` binds exactly one owner and is immutable; a second owner cannot exist without a database reset. Authenticate as the seeded synthetic owner (`supabase/seed.sql` holds its password).
- Several suites mutate the one local database, so `vitest.config.ts` sets `fileParallelism: false`. Leave it — without it, suites pass alone and fail together.
- Never inspect `private-statements/`, `.env*`, or real financial data outside the authorized smoke test. Synthetic data only. Preserve the exact-money, currency, idempotency, append-only, audit, and least-privilege invariants, and do not weaken the CSP.
- After substantive changes, run `/sync-continuity` to reconcile these docs against verified evidence.
