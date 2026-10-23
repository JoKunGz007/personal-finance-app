# Private Ledger execution plan

Last verified: 2026-10-21

## Current checkpoint

**Read retry and spending by category built — 2026-10-23** (D-291). Server Supabase reads (GET/HEAD) retry once on a network error or 5xx; `/statistics` has a "Spending by category" section over its own window and account (migration 063, `GET /api/v1/statistics/categories`). Last gate: pgTAP 39 files (995), tsc, eslint 0 errors, build, Vitest 1,921 passed with the 2 failing new tests fixed and re-run alone. **Rolled out 2026-10-23:** backup verified at sequence 1322, the owner pushed 063 and `main` (`71c02f4`); amounts then switched to −฿ red on the owner's word. **Next:** Open item 5 with the owner.

**Duplicate marker, bounded candidates and the mail label built; migrations 061–062 on hosted — 2026-10-21** (D-288, D-289, D-290). Statement mail gets a visible `PL Imported` label; `list_match_candidates` is bounded to ±1 day and the chooser's set loads on demand; the owner can mark a row as a duplicate, hidden by default. Also: the `/receipts` re-capture message no longer says "upgraded" (Open item 4 of the previous list), and discount names on ledger rows were checked on production (63 of 63 named). Last gate: pgTAP 38 files (976), tsc, eslint 0 errors, Vitest 98 files (1,902 / 19 skipped), owner Playwright 32 of 32. 061–062 pushed after a backup verified at sequence 1318; sequence unchanged after. **Rolled out 2026-10-21:** the owner pushed `main` (`f9494dd` live); the agent marked the four D-265 duplicates with "Mark as duplicate" on production (sequence 1318 → 1322, 4 marker events, `list_duplicate_transactions` returns exactly those 4, all still Excluded); after a reload the ledger hides them behind "Show duplicates (4)" and `chooser-candidates` answers 200. **Next:** Open item 1 or 5.

Older checkpoint paragraphs, finished tasks, the resolved review blockers, completed hardening and the discharged authorization gates are in [`docs/archive/PLAN-2026-10-17.md`](docs/archive/PLAN-2026-10-17.md), unchanged. Finished tasks keep their numbers there, so "`PLAN.md` task N" for a finished task resolves in that file.

## Open

1. **Intermittent 500s** on production ("could not be loaded in full"): on hold by the owner (2026-10-21). Read the Vercel logs within the hour after the next one (Hobby retention); `readAll` logs a value-free line since `eede966`. One retry on network/5xx for GET/HEAD is built (D-291); a `retryingFetch retry` log line now marks a 500 the retry absorbed. Read-only RPCs (POST) are not retried.
2. The owner links the 6 SPayLater repayment rows on `/orders?view=shopee` (D-276).
3. The owner decides on "Libron (book figures)" now that it reaches amounts (D-284).
4. Check the `PL Imported` Gmail label appears after the next imported statement (D-288).
5. **Auto-categorisation leftovers** — the owner will go through these with the agent later. Measured on hosted 2026-10-21 (read-only): 769 of 1,716 included rows have no category; only 2 rows are owner-settled, so the history step has almost nothing to learn from. Candidates: owner labels one row each for an SCB merchant-QR shop (54 rows), `CP(THAILAND)` (15) and a person-named juice shop (15); decisions on `SIPS TRUE MONEY` at non-round amounts (70, D-249), KTB `tr to ewalletid` (56, Wallet top-up?), `LINE PAY` + LINE MAN QR (14, Delivery?); code options: strip KTB's `~ future amount … tran:` suffix from the history key (17 rows), let history learn from matched rows. Should stay manual: person transfers (~186), KTB `tr fr -`, `-billerid`, `รายการผ่าน INTERNET`.
6. Task 25 below.

## Next local tasks

25. **Automatic categorisation by local LLM — research first.** Automatic categorising already runs without an LLM: own transfers, the app's matches, the owner's history, then keyword rules (D-245, D-249), marked "auto" until reviewed. An LLM step is not planned; if one is added, it needs its own research in the local-llm repo first (the handoff there is on hold). The original scope is in the archive.

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
