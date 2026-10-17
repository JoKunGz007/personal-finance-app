# Private Ledger execution plan

Last verified: 2026-10-17

## Current checkpoint

**Receipt discount names shipped; nothing in flight — 2026-10-17** (D-285, D-286). Discounts keep their printed names on `/receipts` and the ledger row; migration 060 is on hosted (a receipt's completeness and checks change only when its items are replaced). Backfill done: 44 of 44 discount rows named, still 25 receipts, sequence 1318. `DECISIONS.md` is at 78% after the twenty-first boundary. Last gate: pgTAP 37 files (940), tsc, eslint 0 errors, Vitest 97 files (1,894 / 19 skipped). **Next:** take an item from Open below; none is started.

Older checkpoint paragraphs, finished tasks, the resolved review blockers, completed hardening and the discharged authorization gates are in [`docs/archive/PLAN-2026-10-17.md`](docs/archive/PLAN-2026-10-17.md), unchanged. Finished tasks keep their numbers there, so "`PLAN.md` task N" for a finished task resolves in that file.

## Open

1. **Intermittent 500s** on production ("could not be loaded in full"): read the Vercel logs within the hour after the next one (Hobby retention); `readAll` logs a value-free line since `eede966`. Likely fix: one retry on network/5xx for idempotent reads.
2. The owner links the 6 SPayLater repayment rows on `/orders?view=shopee` (D-276).
3. The owner decides on "Libron (book figures)" now that it reaches amounts (D-284).
4. `/receipts` copy: an equal-rank re-capture reports "its item list was upgraded" though the rank is unchanged (D-285).
5. Discount names on the ledger row are not yet checked in the browser; only `/receipts` was (D-285).
6. Open decision questions: whether the mailbox source is deleted after import (D-141), and `list_match_candidates`' unbounded scan (D-158).
7. Tasks 25 and 59 below.

## Next local tasks

25. **Automatic categorisation by local LLM — research first.** Automatic categorising already runs without an LLM: own transfers, the app's matches, the owner's history, then keyword rules (D-245, D-249), marked "auto" until reviewed. An LLM step is not planned; if one is added, it needs its own research in the local-llm repo first (the handoff there is on hold). The original scope is in the archive.
59. **A "duplicate" (or hidden) state for ledger rows.** Owner, 2026-10-11: maybe later. Today a duplicate is marked Excluded like any row the owner hides (D-265), and overlay notes have no edit control. Would separate "same bank row stored twice" from the owner's own exclusions, possibly hiding such rows from the default ledger view. Not needed for correctness: migration 054 stops new duplicates.

## Later authorization gates

None open; the three past gates are discharged and archived. Standing rules are in `CLAUDE.md` § Authorizations.

## Working constraints

- **The migration is done and verified (2026-07-28).** The real ledger lives in `private-ledger-live` (5434x); `private-ledger-local` (5432x) was reset to migrations + seed and is purely synthetic again, which is what every suite targets. `.env.local` points at `http://127.0.0.1:54341`. Verified after the move: all eleven table counts match the backup (175 rows), and the account-id, transaction-id and fingerprint digests are byte-identical across both projects, so every row returned under its original id.
- **`.env.local` now aims the app at real financial records, and that leaks into any build.** `NEXT_PUBLIC_*` are inlined at build time, so a browser config that runs `pnpm build` without pinning its target builds against the live ledger. Only `playwright.owner.config.ts` pins; `playwright.isolated.config.ts` and `playwright.config.ts` do not. Pin `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `OWNER_GOOGLE_EMAIL` and `NEXT_PUBLIC_ALLOW_DEV_OWNER_SESSION` in the shell before running either. See GOTCHAS.
- `pnpm supabase:reset` still cannot be guarded and still destroys whatever project the working directory names — the repo root names `private-ledger-local`, `live/` names the real one. Back up through the `/recovery` route before anything destructive, and never silence `assertOnlyDisposableLedgerData` with `ALLOW_DESTRUCTIVE_TESTS=1` to get a green run.
- Do not inspect `private-statements/`. Real statements are readable only as the re-passworded copies in `shared-statements/`, produced by `scripts/repassword-pdfs.py` (D-049). Try `scripts/mask-statement.mjs` dumps first. Reading a real value never permits writing one into a fixture, a doc or a commit.
- Do not commit, push, deploy, or create hosted resources without explicit authorization.
- Do not request the Windows PostgreSQL password until a separately approved backup/recovery task actually needs it.
- Preserve unrelated and uncommitted files.
