# Private Ledger continuity handoff

Last updated: 2026-07-28 — trimmed back to a thin entry point and synced; `main` pushed through `94a0144`.

Thin entry point. It carries only what is **mutable and current**: live authorizations, the destructive-operation state of this machine, and where to start reading. Project state lives in `PLAN.md` — if you are about to add a status paragraph here, add it there instead. Why the rule is ownership rather than length, and how this file drifted to 102 lines despite it: D-052.

**Headline.** The real ledger lives in its own Supabase project and the full gate is green against the synthetic one. Statement work is closed. Tasks 17 and 18 are done: the transactions view is verified both ways, and **the ledger now holds 1,232 real rows across 14 batches** (D-054). **Start here: `PLAN.md` task 23** — one statement is refused for a diagnosed reader defect, and the fix touches the highest-risk code in the repo, so read that task before touching `lib/krungthai-layout.ts`. Then tasks 19–22.

Read in order: [SPEC.md](SPEC.md) (scope, invariants, gates) → [PLAN.md](PLAN.md) (checkpoint and next actions) → [DECISIONS.md](DECISIONS.md) (D-001…D-052, append-only) → [GOTCHAS.md](GOTCHAS.md) (traps worth reading before touching tests or the database).

Claude Code starts at `CLAUDE.md`; Codex at `AGENTS.md`. Product, design, parser, fixture and recovery contracts are in `PRODUCT.md`, `DESIGN.md` and `docs/`, including the three per-bank layout contracts ([Krungthai](docs/KRUNGTHAI_CONTRACT.md), [SCB](docs/SCB_CONTRACT.md), [KBANK](docs/KBANK_CONTRACT.md)). Local setup and the validation order are in `docs/LOCAL_DEV.md`.

## Read this before running anything destructive

**The real ledger lives in `private-ledger-live` (5434x)** as of 2026-07-28 (D-047, D-048). Three local Supabase projects: `private-ledger-local` (5432x, synthetic and disposable, what **every** suite targets), `private-ledger-recovery` (5433x, disposable rehearsal destination), and `private-ledger-live` (5434x, real records, Studio on 54343). See `docs/LOCAL_DEV.md`.

**The trap is `.env.local`, not the test database.** It points at the live project, and `NEXT_PUBLIC_*` are inlined at build time — so a browser config that runs `pnpm build` without pinning its target builds against real financial records. All three Playwright configs now pin, but `playwright.config.ts` is one of the uncommitted files below, so a fresh clone does not. GOTCHAS carries the variable list and the Windows `$env:VAR = ""` deletion trap that makes a pin look broken.

`pnpm supabase:reset` cannot be guarded and destroys whatever project the working directory names — the repo root names the test project, `live/` names the real one. **Back up through Recovery / 04 before anything destructive, and never set `ALLOW_DESTRUCTIVE_TESTS=1` merely to get a green run.**

## Standing authorizations and their conditions

Mutable by nature — granted, spent, re-granted — which is why they live here and not in append-only `DECISIONS.md`. Nothing here is inherited by a new session.

- **Importing a real statement: never standing, ask every time.** Fifteen statements have now been imported — one on 2026-07-28 (D-047) and thirteen more on 2026-07-29, the latter by an agent the owner explicitly approved to do it (D-054). None of that is a standing permission, and the scale of the last batch makes re-asking more important rather than less. Note what the first one cost in vigilance: it silently turned `pnpm test` into a destructive command, and the fix took a whole second project (D-048). Assume the next import creates a hazard nobody has thought of yet, and go looking for it.
- **Real-PDF smoke tests: approved 2026-07-25, exercised twelve times, conditions unchanged.** The owner enters the document password interactively; no value is logged or retained; nothing derived is committed. Requires the owner present, so it cannot run unattended.
- **Reading real statements: granted 2026-07-28 (D-049), and narrower than it sounds.** `private-statements/` stays closed. What is open is `shared-statements/` — password-free copies the owner made with `scripts/repassword-pdfs.py`. Scope is **statement contents only**: not passwords, keys, `.env*`, backups or the citizen ID. Subagents stay closed; reads route through the parent. He was told again that agent reads are transmitted and retained in a transcript, and confirmed — respect that rather than re-litigating it each session. Masked dumps stay the first resort, and reading a real value never licenses writing one into a fixture, doc, commit or screenshot.
- **Passwords: never, under any authorization.** Not in chat, not in a repo file, not as a CLI argument — the harnesses read stdin only. Statement passwords derive from the owner's date of birth and citizen ID, so they are identity-grade and non-rotatable.
- **Commit and push: granted 2026-07-28 and spent.** Used that day to push the session's work, leaving `main` level with `origin/main`. Deliberately no commit sha here — one written into this file is stale the moment the file is committed; read `git status -sb` instead. Treat as spent at the start of a new session and ask again.
- **Hosted Supabase / OAuth / Vercel: accepted as direction (D-051), not authorized to execute.** This reverses the 2026-07-25 "not needed" position — hosting is now `PLAN.md` task 19. Creating any hosted resource still needs explicit approval at the time.

## Before you touch anything

- Run `git status --short`. Two kinds of uncommitted file are in the tree and they are not the same thing. **Three config files** — `eslint.config.mjs`, `playwright.config.ts`, `pnpm-workspace.yaml` — are **deliberately local-only**; preserve them, do not commit them. Everything else uncommitted is ordinary work awaiting authorization to commit; as of the end of 2026-07-28 there is none, and those three are the whole of `git status --short`.
- Check `git status -sb` and `git log --oneline -3` for where `main` stands against `origin/main`. Nothing in this file records that, on purpose.
- `shared-statements/` holds 16 password-free files — 12 SCB, 1 Krungthai and 2 KBANK statements, plus `KBANK-01.pdf`, which is a bank-code reference sheet rather than a statement and correctly refuses with `UNSUPPORTED_LAYOUT`. `masked-dumps/` holds the matching `shared-01…16.md`; sorted order maps to 01–03 KBANK, 04 Krungthai, 05–16 SCB. Both are gitignored working material, never fixtures, and neither contains a receipt — tasks 20–21 need their own samples.
- The recovery destination is a **second Supabase project** and may be left stopped. `node scripts/recovery-destination.mjs up` starts and migrates it, `down` discards it. `tests/recovery-portability.test.ts` skips without it, the Vitest totals read the same either way, and a skipped run proves nothing about recovery.
- Never inspect `private-statements/`, `.env*`, or backup files. Preserve the exact-money, currency, idempotency, append-only, audit and least-privilege invariants, and do not weaken the CSP.
- After substantive changes, run `/sync-continuity` to reconcile these docs against verified evidence.
