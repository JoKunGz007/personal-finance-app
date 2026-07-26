# Private Ledger continuity handoff

Last updated: 2026-07-26

Thin entry point. Project state lives in the maintained docs — do not duplicate it here.

Read in order: [SPEC.md](SPEC.md) (scope, invariants, gates) → [PLAN.md](PLAN.md) (checkpoint and next actions) → [DECISIONS.md](DECISIONS.md) (D-001…D-038) → [GOTCHAS.md](GOTCHAS.md) (traps worth reading before touching tests or the database).

Claude Code starts at `CLAUDE.md`; Codex at `AGENTS.md`. Product, design, parser, fixture, and recovery contracts are in `PRODUCT.md`, `DESIGN.md`, and `docs/` — including the three per-bank layout contracts, [docs/KRUNGTHAI_CONTRACT.md](docs/KRUNGTHAI_CONTRACT.md), [docs/SCB_CONTRACT.md](docs/SCB_CONTRACT.md) and [docs/KBANK_CONTRACT.md](docs/KBANK_CONTRACT.md). Local setup and the validation order are in `docs/LOCAL_DEV.md`.

## Where the project stands

No open review blockers and no open parser defect. **A real statement now reads end to end** — 233 rows across 12 pages, through to the account-binding stage — after ten owner-driven reads that found eleven real defects, none detectable without a real file and every one in code the unit suite called green (D-023 … D-032). Two of the eleven did not fail closed, including a 543-year calendar shift that parsed cleanly and would have written 1983 dates into an append-only ledger (D-031). The ledger, backup, restore, and import contracts are hardened and proven end to end against synthetic data.

The parse is now **independently verified** against the document (D-033): the statement's own printed counts sum to exactly the 233 rows the reader found, and its printed totals close the balance chain onto the last row — the first confirmation that D-026's derived opening is right. That cross-check is enforced in code and fails closed on any disagreement. The 13-month period, the account, and the currency position are all confirmed by the owner.

The app now carries a statement the whole way **in a real browser**, which until 2026-07-25 was only ever proven from tests: a PDF is parsed on-device, bound to a chosen ledger account through the chooser, and confirmed through `/api/v1/imports/confirm` into `confirm_import` under an `aal2` session (D-021, D-022, D-036). Reaching that needed a development sign-in, because the app has no login of its own — the real one is Google OAuth and is still unbuilt, behind the hosted authorization gate.

**Remaining build work is two statement layouts, SCB and KBANK.** Both are mapped from masked dumps and contracted in `docs/`; neither reader exists. The three receipt formats turned out to be JPGs and left this task entirely — they need OCR and are task 13 (D-037).

Verified on 2026-07-26 with the project-local Node 24.18.0 runtime and pinned pnpm 11.17.0 (system Node is 20 — see `docs/LOCAL_DEV.md`):

| Check | Result |
| --- | --- |
| ESLint / `tsc --noEmit` / production build | Passed |
| Vitest, live container | 125 passed, 6 skipped |
| Playwright, isolated config | 10/10 desktop and mobile |
| Playwright, owner config | 3/3 — binding chooser, refused binding, charset rejection |
| pgTAP | 84/84 (migrations 001–008) — **last run 2026-07-25**, not re-run since; no SQL has changed |

**A skipped run is not evidence** — start the stack with `pnpm supabase:start` before trusting a green suite. The 6 skips are the unreachable-container reporters, which skip precisely because the container *was* reachable. pgTAP has not been re-run this round; nothing since has touched SQL, a migration, or database code, but re-run it before any change that does.

Order matters between the two browser suites and Vitest: `public.accounts` is unique on (owner_id, bank_code, last_four) and they all want an account ending 7890 for the one owner, so a suite that leaves accounts behind breaks the next one (GOTCHAS). Both clean up in teardown now.

## Next step

**Build the SCB and KBANK readers** — `PLAN.md` task 11, and the only build work left. Both layouts are mapped from masked dumps of 12 SCB and 2 KBANK statements and written up in `docs/SCB_CONTRACT.md` and `docs/KBANK_CONTRACT.md`. Read those two before writing any code; each records what differs from Krungthai and what is still unknown.

The design decision, already made: build the descriptor-driven reader for **SCB and KBANK only**, and leave `lib/krungthai-layout.ts` alone until it is proven. That reader is the highest-risk proven code in the repo — eleven defects across ten owner-driven reads, one of which did not fail closed — and refactoring it into an abstraction that has never run against a second layout trades working financial code for a design hypothesis. Migrate it afterwards, with its 48 tests as the safety net.

Five things vary across the three layouts, and most of them are not guessable: date and time packing (own line / one combined run / two runs), the date separator (`/` vs `-`), one money column versus two, where the summary block sits (last page versus **top of page one** for KBANK), and how row counts are encoded (per label / an own `TOTAL ITEMS` line / **inside the label text**). KBANK's heading row also spans **two printed lines**, with the balance column's heading on the upper one — anchor on the main line alone and both the amount and the balance land in one band.

**Task 10 is closed** (D-036). The owner configured `.env.local`, which was half the problem — the app had no sign-in at all, so no browser could ever have reached the last three paths. A flag-gated development sign-in now mints the `aal2` session and `tests/e2e/owner-session.spec.ts` covers all three. Run it with `--config=playwright.owner.config.ts`; any other build renders no sign-in button and its route answers 404. **The real login is still Google OAuth and is still unbuilt**, behind the hosted authorization gate.

Before touching `lib/krungthai-layout.ts`, read D-023 … D-034. The four value-free diagnostics now live in `lib/masked-diagnostics.ts`, which imports nothing on purpose and is re-exported unchanged from the layout module. Before touching those diagnostics, read D-038: they leaked real counterparty names on their first use against a real statement, and the rules that now prevent it are structural for a reason.

Also open, and needing an owner decision before it can be designed: **cross-check provenance is not persisted.** Whether an import was verified against the statement's printed totals is recorded nowhere, so the ledger cannot tell a cross-checked import from an unverified one. `StatementFrame` is hashed into the import digest, so recording it needs a migration and a payload-contract change (D-033).

Two cautions the real-statement reads earned. The unit suite is weaker evidence than it looks: 27 green layout tests never ran pdf.js once, because they feed `extractStatement` fixture arrays — so verify anything browser-shaped with `--config=playwright.isolated.config.ts` (D-027). And diagnosis costs nothing: failures report masked shapes (`dd/dd/dd dd:dd`), and every diagnostic is guarded by a test asserting no value survives it, so an iteration exposes no data.

## Standing authorizations and their conditions

- **Real-PDF smoke test: approved 2026-07-25, and repeatedly re-exercised with the owner present.** Originally scoped as one local run to check the invented geometry; it has taken six, each authorized in the moment by the owner driving the browser, because every run found a defect rather than an answer. The owner twice offered direct access to `private-statements/` and its password and was twice declined in favour of on-device masked diagnostics — see the note below. Conditions from `docs/FIXTURE_POLICY.md` and `PLAN.md` still bind: enter the document password interactively, never log or retain any value, never copy real content into a fixture, never commit anything derived from it, and do not browse `private-statements/` beyond that single run. Requires the owner present for the password, so it cannot run unattended. This is the assumption the whole parser rests on — the geometry was invented, so parser-vs-reality is genuinely unknown until this runs.
- **Direct access to `private-statements/`: granted 2026-07-25; both gates now satisfied; still NOT YET USED.** The owner offered three times; the first two were declined. The grant came with a correction they accepted: they believed agent reads keep data on-device, which is false — the app's on-device guarantee (D-003) belongs to the app, not to an agent, whose reads are transmitted and retained in a session transcript. If a future session finds the owner reasoning from the older belief, correct it before acting on this authorization. The two gates are now written: **D-035** records the grant, its boundary and its cost, and `docs/FIXTURE_POLICY.md` § Masked structural dumps carries the amendment. The boundary is **invoke, don't read**: an agent may run `scripts/mask-statement.mjs` against a file in that directory and may read the dump it writes to the gitignored `masked-dumps/`; an agent may not open, list, or read the PDF itself. Once folder access exists that is discipline, not structure — say so plainly rather than implying otherwise. Statement passwords are the owner's date of birth and citizen ID — identity-grade and non-rotatable. Never accept one in chat, in a repo file, or as a CLI argument; the harness reads stdin only and needs it once per file. A dump is working material, never a fixture and never committed.
- **Direct access to `private-statements/`: the two earlier refusals, for context.** Not a refusal of their authority over their own data — the narrower path was simply better. The gap was ever only a handful of boilerplate label strings, and reading the statement would have put real transactions and counterparties into a session transcript, made "invented" unfalsifiable for every fixture written afterwards, and invited tuning the parser to one document. `docs/FIXTURE_POLICY.md` remains in force and unamended. If a future session does accept, record it as a decision first.
- **Commit and push: granted 2026-07-25 and used repeatedly**, most recently for the parser corrections. Treat as spent at the start of a new session; ask again.
- **Hosted Supabase / OAuth / Vercel: still not needed.** Offered and declined 2026-07-25 — `private.has_strong_owner_access` never inspects the auth provider, so a local password session with two verified TOTP factors satisfies it (D-020).

## Before you touch anything

- Run `git status --short`. **Three** config files (`eslint.config.mjs`, `playwright.config.ts`, `pnpm-workspace.yaml`) are **intentionally uncommitted** — preserve them. `.gitignore` used to be a fourth and is now committed: it had to be, because it is the only thing ignoring `.runtime/` (where the development sign-in writes TOTP secrets) and `masked-dumps/`, and the committed copy ignored neither. A fresh clone would have tracked both.
- `main` is level with `origin/main` at `a49fad3`, pushed 2026-07-25: the D-035 masking harness, the D-036 development sign-in, and the docs recording them, on top of the D-028…D-034 parser work. Treat commit and push authorization as spent; ask again.
- Never rewrite a Markdown file through PowerShell `Get-Content`/`Set-Content`. In PowerShell 5.1 the read defaults to ANSI, so every em dash, ellipsis and arrow in these docs comes back as mojibake and is then written out as real UTF-8. It corrupted `HANDOFF.md` once and had to be restored from git. Use the editing tools.
- `public.ledger_owners` binds exactly one owner and is immutable; a second owner cannot exist without a database reset. Authenticate as the seeded synthetic owner (`supabase/seed.sql` holds its password).
- Several suites mutate the one local database, so `vitest.config.ts` sets `fileParallelism: false`. Leave it — without it, suites pass alone and fail together.
- Never inspect `private-statements/`, `.env*`, or real financial data outside the authorized smoke test. Synthetic data only. Preserve the exact-money, currency, idempotency, append-only, audit, and least-privilege invariants, and do not weaken the CSP.
- After substantive changes, run `/sync-continuity` to reconcile these docs against verified evidence.
