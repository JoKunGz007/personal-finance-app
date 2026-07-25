# Private Ledger execution plan

Last verified: 2026-07-25

## Current checkpoint

The five high-risk backup and ledger findings from the original review have been implemented in `supabase/migrations/202607240004_backup_and_ledger_hardening.sql` and the related API/domain code. The four subsequent pgTAP review blockers are resolved: blocker 1 (digest trust) in `supabase/migrations/202607240005_confirm_import_digest_binding.sql` with matching client/pgTAP changes (DECISIONS D-012); blockers 3 and 4 (fractional restore counts, snapshot-sequence overflow) in `supabase/migrations/202607240006_restore_count_and_sequence_bounds.sql`; blocker 2 (empty-table restore) by a populated round-trip in `003_restore_contracts.sql` (DECISIONS D-013).

The end-to-end import path now works against synthetic data: a PDF is parsed on-device into a statement and frame (D-015, D-016), assembled into a payload with checked account binding (D-017), and confirmed through an authenticated aal2 session into `confirm_import` (D-020). Recovery is proven over 1,200 rows (D-019) and the owner mutation lock is proven under real contention (D-018).

That path is now reachable from the app itself rather than only from a test. `GET /api/v1/accounts` lists the owner's accounts and the UI gained a bind stage between parsing and review, so a parsed statement is bound to a chosen account and posted to `/api/v1/imports/confirm` (D-021). The Next.js route wrapper — its zod boundary, its `@supabase/ssr` cookie session, and its own fingerprint and digest computation — is covered by `tests/import-route.test.ts`, which invokes the real handlers against a real aal2 cookie session (D-022). The local-stack harness both authenticated suites use now lives in `tests/helpers/local-owner.ts`.

The blocker-1 fingerprint follow-up is now closed as well. Migrations `202607240007_fingerprint_functions.sql` and `202607240008_confirm_import_fingerprint_binding.sql` add `private.normalize_source_text` / `private.row_fingerprint` and make `confirm_import` recompute each row's fingerprint and reject a claim that does not match; `lib/statement.ts` constrains source text to the charset that keeps JS and PostgreSQL NFKC in agreement (DECISIONS D-014).

**A real statement now reads end to end.** Ten owner-driven reads on 2026-07-25 took the parser from "no PDF opens at all" to 233 rows across 12 pages reaching the account-binding stage, correcting eleven real defects on the way (D-023 … D-032). Nine of the eleven failed closed; the two that did not were a right-aligned column misfile that happened to fail closed by luck of downstream parsing (D-030) and a 543-year calendar shift that parsed cleanly and would have written 1983 dates into the ledger (D-031). What remains is not parsing but *verification*: no global integrity check confirms the row count, the 13-month period has not been checked against the document, and binding has never run because the app could not reach the local Supabase stack.

The local Supabase stack is running on its default Docker network. The most recent clean reset (2026-07-25) applied migrations 001–008 and the synthetic seed and left the project containers healthy. The unrelated older PostgreSQL and pgAdmin containers and the Windows PostgreSQL service were not modified. Several Vitest suites now mutate this database and clean up after themselves; `vitest.config.ts` sets `fileParallelism: false` so they cannot race (GOTCHAS).

Current focused verification:

| Check | Result |
| --- | --- |
| ESLint | Passed |
| TypeScript `tsc --noEmit` | Passed |
| Vitest | Passed, 114 passed / 5 skipped (Krungthai geometry and frame, import assembly, JS↔PostgreSQL fingerprint parity, advisory lock contention, 1,200-row recovery chain, authenticated import confirmation, Next.js route handlers; all five skips are unreachable-container reporters and ran green against the live container) |
| pgTAP | Passed, 84/84 with migrations 005–008 (001: 24, 002: 30, 003: 30). Red proofs: 002 test 19 fails pre-005; 002 test 23 fails pre-008 (`caught: no exception`) with the other 29 passing; 003 fractional-count and int64-max tests fail pre-006 |
| Production build | Passed |
| Playwright | Passed, 8/8 across desktop and mobile — the synthetic review path plus two specs that put a generated PDF through the real pdf.js worker (D-023). Run with `--config=playwright.isolated.config.ts`, which never reuses a stale server (D-027) |
| Clean database reset | Migrations 001–008 and synthetic seed applied (last run earlier on 2026-07-25; no migration has changed since, and this round's work touched no SQL) |

These results used the ignored project-local Node 24.18.0 runtime and pinned pnpm 11.17.0 because the system Node installation remains Node 20. A clean frozen install succeeds offline after explicitly allowing build scripts only for `esbuild`, `sharp`, `supabase`, and `unrs-resolver`.

Python 3.14.6 and PyYAML 6.0.3 are installed for local Codex skill scaffolding and validation. The project-local `$sync-continuity` skill under `.agents/skills/sync-continuity` passes the official skill validator and a read-only forward audit.

## Current review blockers

All four original review blockers are now resolved with red→green pgTAP evidence (2026-07-24), and the one carried follow-up (fingerprint binding) is also resolved (2026-07-25, D-014). No open review blockers remain.

The one open **task** blocker — the parser's `headerY` resolution — is fixed as of 2026-07-25 (D-028) and the fixtures now reproduce it. No blocker of either kind is open.

1. ~~`confirm_import` trusts caller-supplied payload digests.~~ **Resolved** — migration `202607240005_confirm_import_digest_binding.sql` recomputes the canonical digest server-side and rejects mismatches (`payload digest mismatch`); the client computes the identical object (`confirmationDigest`). `002_security_contracts.sql` now uses real computed digests via a `pg_temp` wrapper and includes a tamper test (test 19) that fails on the pre-005 schema and passes after. See DECISIONS D-012. The fingerprint half of the finding is now closed by migrations 007–008 and the source-text charset guard — see DECISIONS D-014.
2. ~~`003_restore_contracts.sql` commits only empty ledger tables.~~ **Resolved** — `003` now populates every ledger table, exports a canonical snapshot, rewrites the owner to a foreign id, wipes, restores, and asserts a re-export reproduces every restored table byte-for-byte (schemas, FKs, money-as-text, audit rows) and that every row is remapped to the caller. See DECISIONS D-013.
3. ~~Restore manifest counts accept fractional JSON numbers.~~ **Resolved** — migration `202607240006_restore_count_and_sequence_bounds.sql` requires `tableCounts[kind]` and each descriptor `rowCount` to be canonical non-negative integer text, failing closed with `invalid restore manifest descriptor` instead of an uncaught `22P02` cast. Red proof: `003` fractional-count test fails on the pre-006 schema.
4. ~~A staged snapshot sequence at signed-int64 maximum overflows on the commit increment.~~ **Resolved** — migration 006 makes the accepted range explicit: `snapshotSequence` must be `< 2^63-1`, reserving headroom for the single post-commit increment. Red proof: `003` int64-max test fails on the pre-006 schema.

## Completed hardening

- Database-locked, count-checked backup snapshot with canonical text bigint boundaries.
- Manifest-bound schema-v2 restore with ordered table kinds, counts, chunk digests, aggregate digest, and exact mutation-sequence checks.
- Persisted statement frame and PostgreSQL reconciliation enforcement.
- Category mutation RPC with audit and backup-staleness sequencing.
- Backup freshness acknowledgement separated from snapshot retrieval.
- Synthetic `.pldemo` explicitly non-restorable and unable to clear authoritative backup staleness.
- Unknown deposit/withdrawal pairs fail closed unless parser provenance carries the recognized interest/tax anomaly marker.
- Strict per-table restore schemas and canonical signed-int64 string validation.
- Pre-release schema version 1 explicitly unsupported.

## Next local tasks

1. ~~Add true multi-session concurrency coverage for the owner mutation advisory lock.~~ **Done** (D-018) — `tests/advisory-lock.test.ts` contends for the key from two real connections and asserts same-owner blocking, different-owner independence, and release on backend termination. Not yet covered: contention through the RPCs themselves, which needs an authenticated owner (task 3).
2. ~~Add a real schema-v2 export → encrypt → decrypt → stage → chunk → commit → re-export equality integration test, including more than 1,000 rows.~~ **Done** (D-019) — `tests/backup-roundtrip.test.ts` over 1,200 rows, non-destructive, confirmed distinguishing.
3. ~~Drive a real authenticated request into `confirm_import`.~~ **Done** (D-020) — `tests/import-confirm-e2e.test.ts` signs in as the seeded owner, reaches aal2 with two verified TOTP factors, and posts fingerprints and a digest computed by `lib/canonical.ts` from a parser-extracted statement; asserts the import lands, a tampered fingerprint is rejected, and the same request without MFA is refused. No hosted resources were needed. The follow-up gap it left — the Next.js route wrapper — is now closed by `tests/import-route.test.ts` (D-022).
4. ~~Repeat privacy, browser-storage/network, accessibility, and interface-guideline audits.~~ **Done 2026-07-25** — re-audited against this round's new code. No storage APIs (`localStorage`/`sessionStorage`/`indexedDB`/`document.cookie`) anywhere in `app/`, `lib/`, `workers/`; one client `fetch`, same-origin to `/api/v1/demo`; no `console.*` in shipped code; CSP and Permissions-Policy unchanged and strict. Two regression guards added to `tests/privacy.test.ts` for the new parser surface: the worker may not post the password or raw page text, and the extracted frame may not carry a full account number. Accessibility re-verified by the axe checks in the Playwright run.
5. ~~Build the account-binding UI: an accounts-list endpoint plus a chooser, so an extracted statement can be bound and confirmed from the app rather than from a test.~~ **Done** (D-021) — `GET /api/v1/accounts` plus a bind stage in `app/ledger-app.tsx`; the bound payload is posted to `/api/v1/imports/confirm` with the PDF's own SHA-256 as the artifact digest and one idempotency key per bound statement. Route coverage came with it (D-022). Still uncovered: the chooser in a browser, which needs a real PDF to reach.
6. ~~Re-run Playwright.~~ **Done 2026-07-25** — 4/4 across desktop and mobile, re-run after the binding UI landed. Still unexercised in a browser: the charset rejection path, the binding chooser, and the authenticated import path — all three sit behind a real PDF.

7. **Read a real statement end to end.** Six attempts on 2026-07-25, all productive, none complete. Each was driven by the owner in their own browser with the document password entered interactively; every finding came from on-device masked diagnostics, so no statement content was read by an agent or written to the repo:
   - Attempt 1 failed with `PDF_PARSE_FAILED` before pdf.js read a page — `GlobalWorkerOptions` had never been configured, so no PDF could be opened at all (D-023). Not a geometry result.
   - Attempt 2 reached `MISSING_COLUMN_ANCHOR`, and the on-device label diagnostic showed the real column model: one combined `Date/Time` column and a separate `Transaction` column, neither of which the invented geometry had. The reader and fixtures are corrected (D-024).
   - Attempt 3 reached `UNSUPPORTED_CURRENCY`: the currency is printed below the grid, not in the frame block (D-025).
   - Attempts 4 and 5 reached `MISSING_FRAME_FIELD`. A masked structural dump of the whole statement identified the real frame contract in one pass (D-026): labels are `Account Number` and `Statement Period`, no opening or closing balance is printed anywhere, each row's time sits on its own line, and frame lines carry several label/value pairs. Three latent defects were fixed as a result — a neighbouring field's digits being read as the account suffix, a footer aborting a valid statement, and an anchored label pattern rejecting padded whitespace.
   - Attempt 6 reached `MISSING_FRAME_FIELD` again, this time reporting `account number (label not found)` while account type and statement period read. Root cause: `headerY` was taken from the first line containing *any* column anchor, and a real statement prints `Branch` as a frame label above the grid, which matches the `branch` column anchor — so the frame/grid boundary landed on that frame line and `extractFrame` dropped every field printed below it. **Fixed 2026-07-25** (D-028): `findColumns` now returns the `y` of the line carrying all seven headings, and that is the boundary. Attempt 6 also returned the last page's summary-block label wordings.

   - Attempt 7 (D-028 landed) reached `INVALID_ROW_CONTENT` at page 6 row 14 on a zero withholding-tax column, fixed as D-029.
   - Attempt 8 reached page 7 row 6, where the balance first exceeded 10,000 and a right-aligned figure misfiled one column left, fixed as D-030 along with batched failure reporting (D-032).
   - **Attempt 9 read the whole statement: 233 rows across 12 pages, through to the bind stage.** It exposed the one defect in the sequence that did not fail closed — two-digit years read as Buddhist when the statement prints Gregorian, dating everything 1983 (D-031). Fixed, and attempt 10 reads the period as 2025-07-01 to 2026-07-31.

   **The reader now works against a real statement end to end.** Confirmed against reality: the file opens and decodes, the signature matches, all seven column headings match, the currency is found, the frame reads (account type, account number, statement period), all 233 rows parse, and the app reaches the account-binding stage. The date format is confirmed as `dd/mm/yy` with the time on its own line.

   Verified by the owner against the document on 2026-07-25, closing every parser question this task opened:
   - **The row count is confirmed.** Page 12 prints 131 withdrawal rows and 102 deposit rows; 131 + 102 = 233, exactly the number the reader found. Now enforced in code (task 8, D-033).
   - **The balance chain is confirmed.** The first row is a withdrawal leaving a zero balance, so the opening figure derives cleanly; opening + printed deposits − printed withdrawals lands exactly on the last row's printed balance. This is the first independent evidence that D-026's derived opening is correct.
   - **The 13-month period is confirmed.** The document prints `Statement Period 01/07/25 to 31/07/26` and `Requested Date 24/07/26` — Gregorian, and a genuinely 13-month range.
   - **The account is confirmed** as the right one by the owner, against the last four the bind screen shows.
   - **The currency position is confirmed** as the frame block, above the grid; the guard is restored (task 9, D-034).

   The counts summing to *exactly* 233 also confirms D-029 independently: the bank does not count the `0.00` withholding-tax column of a zero-tax interest posting as a withdrawal either.

   Still unreached behind a real PDF: the binding chooser, the authenticated import path, and the charset rejection path — all three blocked on task 10, not on the parser.

8. ~~Read the last page's summary block as a global integrity check.~~ **Done** (D-033) — `extractTotals` reads `Total Page`, `Total Withdrawal` and `Total Deposit` from below the grid on the last page, and `verifyTotals` checks the page count, the per-kind row counts and the per-kind absolute totals against the rows parsed. A disagreement fails closed as `SUMMARY_MISMATCH`; an absent block is tolerated as "no cross-check"; a block printed but unreadable fails closed. The open product question is resolved in favour of failing closed, because an append-only ledger cannot take back a dropped row.

   Verified against the real statement on 2026-07-25 by the owner reading page 12: the printed counts sum exactly to the 233 rows the reader found, and the printed totals close the chain from the opening figure derived from the first row to the last row's printed balance. That is the first independent confirmation that the parse is complete and that D-026's derived opening is correct.

   Left undone: whether an import *was* cross-checked is not persisted. `StatementFrame` is hashed into the import digest, so recording it needs a migration and a payload-contract change — until then the ledger cannot distinguish a cross-checked import from an unverified one.

9. ~~Restore the currency guard to the frame block.~~ **Done** (D-034, supersedes D-025) — confirmed directly against the real statement, which prints `Currency THB` above the grid.

10. **Configure the app's local Supabase env so binding can run.** `.env.local` exists but `lib/server/supabase.ts` still reports `Local Supabase is not configured`, which means `NEXT_PUBLIC_SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` is missing or still holds the `replace-with…` placeholder from `.env.example`. The values are printed by `supabase status`. Until this is set, the binding chooser, the authenticated import path and the charset rejection path remain unreached behind a real PDF — the last three gaps in the end-to-end proof. Owner action; agents must not read `.env*`.

11. **Extend the reader to the remaining statement and receipt layouts.** Two further statement formats (SCB, KBANK) and three receipt formats are in scope. Most of the eleven defects found on the Krungthai layout were reader-architecture faults rather than bank-specific ones — the worker, the frame/grid boundary, midpoint column assignment, zero money columns and the calendar era all carry over — so the per-format cost should be far below Krungthai's ten reads. Planned approach: a local masking harness that writes a masked structural dump per format to a gitignored path, so a layout can be developed offline from one dump instead of one owner-driven read per defect, plus layout descriptors as data rather than a hand-written reader per bank. Receipts may not be a column grid at all and need one dump before any design claim.

Tasks 1–9 are complete and verified. Task 10 is owner action and blocks the last three end-to-end gaps; task 11 is the remaining build work.

## Later authorization gates

Only after every local task above passes:

1. ~~Ask for renewed permission to run one local real-PDF smoke test without logging or retaining values.~~ **Granted 2026-07-25.** One local run only. The password is entered interactively and never logged; no value, screenshot, or derived fixture may be retained or committed; `private-statements/` stays outside automated discovery apart from that single run. Requires the owner present, so it cannot run unattended. Purpose: the fixture geometry is invented (D-015), so this is the only check of parser-vs-reality.
2. Ask separately before creating hosted Supabase, OAuth, Vercel, or deployment resources.
3. Test portable recovery into an empty separately bound project before importing real data.

## Working constraints

- Do not inspect `private-statements/`.
- Do not commit, push, deploy, or create hosted resources without explicit authorization.
- Do not request the Windows PostgreSQL password until a separately approved backup/recovery task actually needs it.
- Preserve unrelated and uncommitted files.
