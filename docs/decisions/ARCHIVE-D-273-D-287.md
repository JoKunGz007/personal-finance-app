# Private Ledger decision log — archive, D-273 … D-287

D-273 … D-287 relocated from `DECISIONS.md` on 2026-10-23, unchanged, when that file passed its
budget after D-299 (the twenty-second boundary, D-300). Every entry here is settled and shipped, or
is the twenty-first boundary's own record (D-286), superseded by D-300. Append-only still applies:
a decision superseding one of these goes in `DECISIONS.md` and references it here.

## D-287 — `PLAN.md` holds the current state only; finished work moves unchanged to `docs/archive/`, and dead traps retire to their generalisations

- Date: 2026-10-17
- Status: **Done** (`b9591c0`, `702f1a0`; docs only, not pushed). Asked for by the owner through a brief from another session, approved after a proposed split.
- **`PLAN.md` is the current state, not a log**: one checkpoint paragraph, one Open list with each item once and its D-id, undone tasks only, the authorization-gate line and the working constraints (999 → 38 lines). Older checkpoint paragraphs, finished tasks (numbers kept, so "`PLAN.md` task N" resolves there), the resolved review blockers, completed hardening and discharged gates moved unchanged to [`docs/archive/PLAN-2026-10-17.md`](../archive/PLAN-2026-10-17.md). The next time PLAN outgrows ~200 lines, the same move makes a new dated archive file.
- **Task 25 reworded, task 28 closed** on the owner's word: categorising already runs without an LLM (D-245, D-249); an LLM step needs its own research in the local-llm repo first. Task 28's phone leftovers were overtaken by the later UX rounds (D-279).
- **Headers cut, not entries**: the `DECISIONS.md` and `GOTCHAS.md` header essays moved unchanged to [`docs/archive/DOC-HEADERS-2026-10-17.md`](../archive/DOC-HEADERS-2026-10-17.md); the decisions header keeps the open questions, the size rule and a range → file → date table.
- **Traps retire only after a check against the committed tree**, not the local working copy: an audit of `docs/gotchas/` flagged 29; four were retired to their generalisations (merged balance walk, pnpm allowlist, isolated dev-sign-in pin, skill validator), one duplicate privacy trap now points to its twin, and the default-config Playwright traps stayed because the committed `playwright.config.ts` still lacks `testIgnore` and a webServer timeout (the audit had read the local-only copy).
- Evidence: `check:docs --strict` green after each commit (286 decisions, 237 traps); the token-preservation checker clean for PLAN (new + archive), both headers; every original PLAN line found verbatim in the new PLAN or its archive. `docs/archive/` is not scanned by `check:docs`, so references in moved text are no longer checked.

## D-286 — The twenty-first boundary moves D-259 … D-272 on the owner's word

- Date: 2026-10-17
- Status: **Done.** D-259 … D-272 relocated unchanged to [`docs/decisions/ARCHIVE-D-259-D-272.md`](ARCHIVE-D-259-D-272.md); their index bullets moved to that file's Archived section.
- **Asked for by the owner** in the session prompt, with this file at **99%** of its budget after D-284. Same footing as D-267: every entry moved is settled and shipped (the slip re-reads, the overlapping-statement import and its duplicate fix, the Inbox as the way in, the Shopee design, build and read fix, `HANDOFF.md` and `AGENTS.md` retired), or is D-267, the previous boundary's record, which this entry supersedes.
- **A new file**, so no existing link moves. **D-273 … D-284 stay**: the Shopee matching corrections, the UX review, and the current receipt and statistics work. D-141 and D-158 stay as the two open questions.

## D-285 — Receipt discounts keep their printed names; a receipt's completeness and checks change only when its items are replaced (migration 060); stored receipts get names by an equal-rank re-capture

- Date: 2026-10-17
- Status: **Built; migration 060 on hosted** (backup verified at sequence 1292, dry run 060 only, sequence unchanged after the push). Owner chose both follow-ups of task 56 the same day (PLAN Open item 5). Backfill not yet run: on hosted all 44 discount rows have no name (19 on 11 receipts whose items came from a full invoice, 25 on 9 from a screenshot).
- **Names (TS only):** `ParsedReceipt.discounts` is `{ name, amountMinor }[]`; every reader branch (full item-table discount rows, the full `หักส่วนลด` block, the condensed discount block in both line shapes) keeps the printed line's text, trimmed. The capture schema accepts a name of 1–240 characters, the same cap as an item name; `captureReceiptRequest` passes it to `capture_receipt`, which already stored `receipt_discounts.name` (027). The stored schema and the `/receipts` read select `name`, nullable for receipts captured before; `/receipts` and the ledger row show it, "Discount" when null.
- **Completeness (migration 060):** 029's merge set `completeness`, `failed_checks` and `inapplicable_checks` from every capture, so a lower-ranked partial screenshot merged onto a complete full invoice marked the receipt partial while its items (and `items_complete`) stayed the invoice's. Now the three change only when `v_replace_items`, so they describe the stored items. Rule 3 ranks complete before partial, so this keeps the better one. Rest of `capture_receipt` unchanged; no table, column or grant change, backup contract unchanged.
- **Backfill path** (finance-investigator, before building): an equal-rank capture replaces items and discounts, so re-capturing a stored receipt writes its names. Mailbox Sync skips any message carrying the IMAP keyword `PLReceipt` and nothing clears it, so full invoices re-capture only after that keyword is removed from them; screenshots re-upload on `/receipts`, but a screenshot (rank ≤4) never replaces a full invoice's (rank 6) discounts.
- Evidence: pgTAP 37 files (940); `015_receipt_storage.sql` plan 40, its two 060 assertions red-proved (fail on 029's function, pass on 060's); tsc, eslint 0 errors, Vitest 97 files (1,894 passed / 19 skipped). `/code-review` high: 4 findings, 3 fixed (named discount schema, one name extraction per branch, a null-name stored-schema test), 1 left: an over-long printed discount name refuses the whole capture, as an over-long item name already does.

## D-284 — `/statistics` sections collapse, the spending calendar shows newest month first with a toggle, the header line no longer touches `/statistics` and `/orders` content, and "Libron (book figures)" now reaches amounts

- Date: 2026-10-17
- Status: **Built; committed with D-283.** Owner's asks, same day.
- Figures: amounts read `--font-money`, which no typeface block redefined, so D-281's `libron-figures` changed only digits inside prose. Its block now sets `--font-money` to Libron too; `libron` and the pixel faces keep Plex Mono amounts (D-162).
- Header line: `.intro`'s bottom border sat at 0px above the next content on `/statistics` (window legend) and `/orders` (view tabs); measured on all eight pages, the rest have 20–47px. Both get `margin-top: 20px`.
- Collapse: `app/collapsible-section.tsx`, an `h2` wrapping an `aria-expanded` button, open on every load, state not persisted (no client storage in `app/`). Used for every `stats-section` on `/statistics` and the statistics tables on `/receipts` and `/orders`. Rejected: `<details>` with the `h2` inside `summary` (a summary's button role can strip heading semantics; `/code-review` finding).
- Calendar: newest month first by default, a "Show oldest first" / "Show newest first" button (no `aria-pressed`, whose state contradicted the flipping label). The phone cap shows the first three months in either order; the arrow keys sort days by date, so they move in date order whatever the DOM order.
- Evidence: tsc, eslint, Vitest 97 files (1,891 passed / 19 skipped). **Not browser-checked before the commit**; checked on production after the owner's push.

## D-283 — D-280's leftover fixed: a read-only `count_existing_import_rows` (migration 059) shares `confirm_import`'s linking rule, so an all-linked re-printed statement records no import batch

- Date: 2026-10-17
- Status: **Shipped to hosted** (migration 059 pushed after a backup verified at sequence 1292 = last export = newest record, and a dry run listing only 059); code committed.
- Chosen: `private.existing_source_row(owner, account, row, claimed[])` holds migration 054's rule (exact fingerprint, then identity facts with a source time, oldest first, each stored row claimed once per statement). `confirm_import` calls it, otherwise unchanged from 054 (the claimed array replaces the `import_batch_rows` exclusion: same set). `public.count_existing_import_rows(account, rows)` loops the same function read-only, after the strong-owner, ownership and fingerprint-binding checks. The Inbox/mailbox pre-count calls it with the rows `confirm_import` receives (`buildRpcRows`, one builder); every row linked → `duplicate`, no confirm. The post-confirm read-back (D-280) stays.
- A failed pre-count no longer fails the statement: it skips the shortcut and lets `confirm_import` decide, so a statement both refuse is held (`confirm-failed`) rather than returned as a 502 every Sync (`/code-review` finding).
- Left: the manual Import review screen still counts exact fingerprints only (`existingFingerprints`); the pre-count does not check currency (every account is THB).
- Evidence: pgTAP 37 files (936), new `supabase/tests/037` (18 assertions; claim-once red-proved); Vitest new tests for the identity-duplicate and failed-count paths (the duplicate one red-proved).

## D-282 — D-277's bank-refund rule checked against the real export and widened: one mask character then four or more digits is also a masked account number

- Date: 2026-10-17
- Status: **Done; committed.** Closes D-277's "not verified" item.
- Found: the owner's real exports are in `receipts_sample/shopee/` (orders and cancelled, 2026-10-11). Read under this session's real-data grant through throwaway harnesses printing counts and character-class shapes only. The shipped `parseShopeeExport` refused 1 of the 9 cancelled orders as "not ShopeePay or a bank account". Its destination prints a bank name, a bracketed single `*` and four digits. `BANK_DESTINATION` required two or more mask characters.
- Chosen: `BANK_DESTINATION` also accepts one mask character followed by at least four digits, still not preceded by a letter. Measured after the change on the same files: 9 parsed, 0 refused, 8 wallet and 1 bank. The order stored on hosted under the pre-D-277 rule is already `bank`, so a re-import cannot raise "refund differs".
- Evidence: an invented string of the same shape added to the D-277 test, red-proved against the old rule. Shopee import and route tests 57 passing; `tsc`, `eslint` clean.
- Process note: one harness run's broken regex escapes printed the destination only partly masked (the bank name and some digits). That output went to this conversation only; nothing was written to a file, doc or commit, and the harness was deleted.

## D-281 — Owner's 2026-10-17 visual asks: no divider under Cash payments on `/ledger`; Grab and LINE MAN chips in brand green on `/orders`; a "Libron (book figures)" typeface choice to trial Libron digits

- Date: 2026-10-17
- Status: **Shipped** (`76b7af0`).
- Divider: `.cash-bench.cash-fold { border-bottom: 0 }`. Only the `/ledger` cash section carries `.cash-fold`; the seven other `.cash-bench` sections keep their divider.
- Chips: every order on `/orders` gets a filled platform chip, "Grab" in `--grab` (#00B14F, Grab's commonly cited screen green for PMS 355C) and "LINE MAN" in `--lineman` (#06C755, the LINE palette green; no LINE MAN-specific value was found), with `--brand-ink` (#04210F) text. The three are tokens with the same value in every scheme block (`THEME_TOKENS`), because the colour-literal guard allows no literal outside a token block. Grab rides keep no chip: their section is already Grab-only.
- Figures: a new `FONT_CHOICES` entry `libron-figures` drops "Figures" (Plex Mono digits) from both stacks. Measured before choosing it: Libron's digits are equal-width (four 1s, 8s and 0s each 72.6px at 30px), 0.605em against Plex Mono's 0.600em, so columns keep their alignment. This contradicts the 2026-10-07 CSS comment that called them proportional. `libron` stays the default, and Plex figures remain one tap away.
- Rejected: changing `libron` itself (the owner asked to try it first, and losing options stay switchable).

## D-280 — Inbox/mailbox statement counts read back what `confirm_import` linked (task 60): a re-printed overlapping statement reports its linked rows, an all-linked batch reports duplicate; no migration

- Date: 2026-10-17
- Status: **Shipped** (`75e976a`); PLAN task 60 closed.
- Chosen: after a successful confirm, `processInboxStatement` counts `import_batch_rows` of the new batch with `linked_existing = true` (`linkedBatchRowCount`). `confirm_import` sets that flag for both exact and identity links (migration 054), so the identity rule lives only in SQL. All linked → `duplicate` (the mailbox flags it fetched); otherwise `captured` with `existingRows` = linked. A failed read-back keeps the fingerprint pre-count. Read access is the `strong_owner_select` policy every ledger table got in migration 002.
- Rejected: mirroring migration 054's identity rule in TypeScript (a second copy that can drift); a read-only pre-count SQL function (needs a migration and a `db push`).
- Left: a re-printed all-linked statement still records an import batch and artifact, because the count is known only after `confirm_import` runs. Nothing is inserted or linked differently.
- Evidence: four new tests in `tests/inbox-statement.test.ts`, two red-proved against the old code; full Vitest 93 files passed / 4 skipped (database files skipped, local Supabase down). The real read is mocked; no database-backed run.

## D-279 — UX review 2026-10-11 closed: 23 of 25 fixed (two reduced), 2 declined (desktop calendar cells stay 38px wide; "Use synthetic statement" stays per D-204)

- Date: 2026-10-17
- Status: **Shipped** (`4780f96`, `b0357a2`); task 65 done; `docs/UX_REVIEW_2026-10-11.md` deleted.
- Fixed: Shopee repayment picks as 44px rows with a 20px checkbox in a labelled group; distinct accessible names on Link / Link selected; 46px-tall order links; a trailing empty `NOTE : -` stripped from displayed bank text (display only, `withoutEmptyNote`); a "Tick the order(s)" hint; the summary line cut to 60 characters. `.file-control` gains a focus ring and replaces the native pickers on `/receipts` and `/recovery`; disabled Export / Restore show a reason; receipt summaries get a chevron, the match-state chip first, and fixed date, branch and count columns on desktop; "1 change"; no duplicate placeholder; the h1 note toggle is 26px with a 46px hit area on phone. `/statistics` gets a Skip calendar link and 12px axis labels. `/categories`: name at body size, Archive as a tertiary button (Bring it back undoes it; a parent change still saves on select, reversible the same way), and on phone an Edit toggle per row (list 5,149px → 2,027px at 375px). `/slips` heading "Captured slips".
- Reduced: #3, the restore fields stay enabled: the page has no empty-ledger state and the restore route already refuses a non-empty ledger (409). #12, no instalment facts are stored, so a candidate shows "also on N other repayments" (a count from the view) instead of "n of N" or a share.
- Declined: #20, 44px-wide calendar cells overflow the 3-column (981–1120px) and 2-column month grids; 38×44 passes WCAG 2.5.8 (24px), recorded as a desktop exception to D-136. #25, D-204 keeps "Use synthetic statement" as the safe trial path.
- Round 2 (production, 375px and 1280px): every fixed item re-measured; no horizontal scroll on any page. The file-picker focus ring was confirmed in Chrome with a real Tab key. Not verified: the skip link's visual reveal (the hidden pane gives the document no focus; it reuses the skip-to-content class).

## D-278 — Haiku trial for settled UI-only changes via a new `finance-ui-implementer`; money, data and server code stay on Sonnet `finance-implementer`

- Date: 2026-10-17
- Status: **Trial started; not committed.** Agent and routing only, no app code.
- Context: claude-usage's 2026-10-17 check found the Sonnet implementer holding (19 runs since 10-08, 0 re-runs, none on Opus), which answers claude-usage D-010's reason to keep Haiku out. Its replay benchmarks (rounds 1–3) passed Haiku 5.5 on editor and web changes, and ge150-fw's Haiku trial had 0 re-runs in 12 runs.
- Chosen: `.claude/agents/finance-ui-implementer.md` (Haiku) for decision-complete layout, styling, markup and copy in `app/**/*.tsx` / `app/globals.css`. It stops and returns anything touching `lib/`, `supabase/`, `workers/`, `app/api/`, server actions, money parsing or formatting, form submit, data loading or validation. A mixed task goes whole to `finance-implementer`. A failed Haiku run is re-run there with `[re-run]`. `CLAUDE.md` § Subagents routes it.
- Rejected: Haiku as the default implementer (money invariants; the benchmarks never covered this kind of code).
- Check (claude-usage): after ~5 sessions with UI work, `finance-ui-implementer` runs, `[re-run]` count on `finance-implementer`, runs past 40 calls. Revert if re-runs rise or a Haiku run edits out of scope.

## D-277 — Two of D-271's leftover findings fixed: matches read only the Shopee match state, and an unknown refund destination is refused instead of stored as a bank; three left on purpose

- Date: 2026-10-11
- Status: **Done; committed.** App code only.
- **Fixed — the matches read.** `loadCurrentMatches` (auto-categorise, `/ledger`) loaded the full Shopee view, so a failed summary, items or price-line read refused every row's categorisation (D-272's outage showed the risk). `loadShopeeMatchState` (`lib/server/shopee.ts`) now reads only orders, refunds, overlays, links, ledger rows and Excluded ids and runs the matcher; `loadShopeeView` builds on it. Messages unchanged.
- **Fixed — the refund destination.** `mapRefund` (`lib/shopee-import.ts`) stored any wording other than exactly "ShopeePay"/"ShopeePay Balance" as `bank`, and `refund_to` cannot change once stored (055 raises "refund differs"). Now: ShopeePay in any case → wallet; a masked account number (two or more `x`/`*` then a digit) → bank; anything else refuses that order (`cancelDestination`). **Not verified against the one real bank refund's printed shape** (its text is never stored); if it does not match, re-importing that order is refused by name, never mis-stored.
- **Left on purpose:** a refund deposit held by a non-Shopee document can be proposed (only inflows qualify, and the owner confirms); "ledger row not in view" is unreachable from the UI (every confirmable row comes from `shopee_ledger_rows()`); refunds are checked one by one, but the parser reads at most one per order and 057 clamps.
- Evidence: red-proofs (current matches with a failing summary; lower-case wallet and refusal wordings); Shopee, auto-categorise and current-matches tests 171 passing; `tsc`, `eslint` clean.

## D-276 — A SPayLater repayment is a leftover ShopeePay outflow on day 7–13 of the month; candidate orders reach back 366 days (supersedes D-270/D-275's repayment wording and 10–60 day window)

- Date: 2026-10-11
- Status: **Done; committed.** App code only.
- **Owner's fact:** the repayment lands on the 10th of the month, ±3 days.
- **Measured on hosted:** the repayments carry the same `SIPI` / "SIPS SHOPEEPAY" wording as ordinary order payments on the same account, one a month, matching no order; one SPayLater order was repaid in 5 monthly instalments, the last about 140 days after the order. No wording separates a repayment, so D-275's empty wording list is replaced by position.
- **Rule:** after the automatic, combined and wallet top-up passes, a repayment row is a free Shopee-paying outflow that none of them holds, is not the 49.00 VIP charge, is not Excluded, and falls on day 7–13 (`SPAYLATER_REPAY_DAY_FIRST/LAST`); a row already linked as a repayment is always listed. Candidate orders are SPayLater orders 10–366 days earlier (`SPAYLATER_REPAY_MAX_DAYS` 60 → 366). An automatic order match always wins; a repayment is never linked automatically.
- **UI:** the "Waiting for you" card now waits only until any order is linked; under the old "until every candidate is linked" rule, a finished plan's order would hold every later card open for a year.
- **Measured on hosted (shipped function):** exactly the 6 expected repayment rows listed; order states unchanged (auto 149, none 4); five preselect the instalment order, the latest lists 4 candidates and preselects none.
- Evidence: 16 new repayment tests, 10 red-proved against the old rule; `tests/shopee*` 131 passing; `tsc`, `eslint` clean; `/code-review` low: no findings.

## D-275 — "Payment to Shopee" rows are PromptPay QR order payments: `other`-kind orders match like bank debits; no SPayLater repayment wording is known yet (supersedes D-273's repayment rule)

- Date: 2026-10-11
- Status: **Done; committed.** App code only.
- **Measured on hosted:** the 2 SCB `ENET` "Payment to Shopee" rows D-273 kept as repayments are each exactly one order paid by PromptPay QR (payment kind `other`), lag 0 minutes. No other outflow on any account mentions Shopee, SPayLater, PayLater or SPL, so the bank ledger holds no row D-270's repayment wording describes.
- **Rule:** `paysShopee` (names ShopeePay, or reads "Payment to Shopee") defines the matchable outflows; orders of kind `bank_debit` or `other` (PromptPay QR, Mobile Banking) match under the same window, uniqueness and combined-checkout rules; `SPAYLATER_REPAYMENT_WORDING` is empty, so the repayment picker lists nothing until a real repayment row's wording is added. The match write (migration 055) and the UI never gated on payment kind, so neither changed.
- **Effect on hosted:** auto 147 → 149, none 6 → 4, repayment rows 2 → 0. The 4 left have no ledger row of their amount (3 are July 2025 Mobile Banking orders; the paying statements are likely not imported).
- **Tests:** the repayment day-window tests could no longer be reached and were replaced by one asserting a "Payment to Shopee" row is not a repayment; they come back with the first real wording. Shopee test files 117 passing; new tests red-proved; `tsc`, `eslint` clean; `/code-review` low: no findings.

## D-274 — The Shopee matcher proposes no row the owner Excluded (task 64); an owner match or link on one is kept

- Date: 2026-10-11
- Status: **Done; committed.** App code only: no migration, no `db push`, no contract change.
- **Why:** a duplicate copy the owner Excluded (D-265) still reached the matcher through `shopee_ledger_rows()`, so its order saw two candidates and proposed nothing (D-063's ambiguity rule).
- **Change:** `loadShopeeView` reads `transaction_overlays` ids with `include_in_reporting = false` (paged, refuses on failure) and passes them as `excludedTransactionIds`; `proposeShopeeMatches` leaves those rows out of auto, combined, wallet top-up, SPayLater repayment and refund-deposit proposals. Owner overlays and links are unchanged, and the view still receives every row, so a matched Excluded row still displays. Filtering in the app rather than in SQL avoided a migration and a `db push`.
- **Measured on hosted** (shipped function, read-only dump): auto 146 → 147, none 7 → 6; the duplicate-pair order auto-matches its non-Excluded copy. The overlay read, timed as the owner (aal2, `authenticated`): under 6 ms, 116 rows.
- Evidence: `tests/shopee-match.test.ts` + `tests/shopee-loader.test.ts` 56/56; 2 of the 3 new matcher tests failed before the change (the third guards owner overlays and passed by design); `tsc`, `eslint` clean; `/code-review` low: no findings.

## D-273 — A `Direct Debit` naming ShopeePay is a bank debit, not a SPayLater repayment (task 63; corrects D-270)

- Date: 2026-10-11
- Status: **Done; committed.** No migration, no contract change.
- **Measured on hosted** (shipped `proposeShopeeMatches` over a read-only dump; 179 ledger rows, 171 orders): `isSpayLaterRepayment` classified 7 rows as repayments. The 5 `Direct Debit` + `SHOPEEPAY` rows were all on one account and each equalled the total of exactly one `bank_debit` order within ±1 minute; none equalled any SPayLater order or subset sum. They are that bank's ordinary ShopeePay bank-debit payments. The 2 `ENET` "Payment to Shopee" rows coincided with no order.
- **Rule:** a repayment is an outflow whose description matches `Payment to Shopee`; the `Direct Debit` branch is dropped, so those rows return to the matchable outflows. **Corrects D-270's** repayment wording, and its "repayments 15–21 days later" measurement, which was taken on the misread `Direct Debit` rows.
- **Effect on hosted:** auto 143 → 146, none 10 → 7, repayment rows 7 → 2. The fourth released row is one copy of a duplicate pair (one debit, two overlapping imports, worded differently; D-265); the owner had already marked the other copy Excluded, but `shopee_ledger_rows()` does not filter Excluded rows, so the order sees two candidates and proposes nothing (PLAN task 64).
- **Open:** the 2 `ENET` rows have no SPayLater order 10–60 days before them, so whether they are repayments is unconfirmed (the orders they repay may predate the import).
- Evidence: `tests/shopee-match.test.ts` 46/46; the new task-63 test failed on the old rule and passes on the new one; `tsc` and `eslint` clean; `/code-review` low: no findings.
