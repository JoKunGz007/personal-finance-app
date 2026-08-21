# Private Ledger decision log

Last reviewed: 2026-08-09

Entries are append-only. A superseding decision must reference the earlier entry rather than rewriting its history.

This file carries **D-120 onward**. Three settled ranges were relocated unchanged, not rewritten: **D-001 … D-059** to [`docs/decisions/ARCHIVE-D-001-D-059.md`](docs/decisions/ARCHIVE-D-001-D-059.md) on 2026-08-09, **D-060 … D-113** to [`docs/decisions/ARCHIVE-D-060-D-113.md`](docs/decisions/ARCHIVE-D-060-D-113.md) on 2026-08-18, and **D-114 … D-119** to [`docs/decisions/ARCHIVE-D-114-D-119.md`](docs/decisions/ARCHIVE-D-114-D-119.md) on 2026-08-19. The index below covers all four files, so a reader can find any entry without opening any body.

**Every boundary sits where an argument ends rather than where a number is round.** The third one, taken at 90% of this file's byte budget, cut the six entries that *led to* the card reader adopting Cloud Vision — the measurements and repairs — and kept **D-120, which is that adoption**, because it is the arrangement the app still runs. **Nothing with an open question moved**: whether pre-fill stays is still undecided on both paths, and that question attaches to D-120 and D-129, so filing either as settled would have been false. What this file holds is the shipped OCR arrangement and the continuity-hygiene arc after it.

**The size guard measures bytes, not lines, and that correction is the reason this archive exists** (`scripts/check-docs.mjs`). The budget was 1,200 lines and this file passed it at 1,132 while being 332 KB — roughly 80,000 tokens, most of a context window — because the entries grew sideways rather than downward. A guard that exists to stop a log outgrowing a single read has to measure what a read actually costs.

## Index

### Archived 
—
 `docs/decisions/ARCHIVE-D-001-D-059.md`

- **D-001** — Local-first synthetic development
- **D-002** — Canonical integer money
- **D-003** — Worker-contained PDF boundary
- **D-004** — Strong single-owner access
- **D-005** — Schema-v2 recovery is the first supported backup contract
- **D-006** — Synthetic preview is not a backup
- **D-007** — Compound-row resynchronization requires provenance
- **D-008** — Docker Supabase is the acceptance database
- **D-009** — Use Supabase’s default Docker network locally
- **D-010** — Repository continuity files
- **D-011** — Claude subagent workflow is a lean, tiered adaptation of the Codex one
- **D-012** — Import payload digest is server-recomputed and bound, never trusted
- **D-013** — Restore manifest counts are canonical integers and the sequence range reserves increment headroom
- **D-014** — Row fingerprints are server-recomputed and rejected on mismatch, guarded by a source-text charset
- **D-015** — Krungthai geometry is read from the pdf.js text layer against invented fixtures
- **D-016** — The statement frame is extracted from labelled pairs and reduced to last four at the parser
- **D-017** — Account binding is a checked user decision, not a parser inference
- **D-018** — Advisory lock serialization is proven with two real connections
- **D-019** — The recovery chain is proven end to end at scale, non-destructively
- **D-020** — The authenticated import path is proven with a local owner, no hosted resources
- **D-021** — A statement becomes an import through a chooser, not a code path
- **D-022** — The route wrapper is tested by invoking the handler with a real cookie session
- **D-023** — pdf.js gets its own worker, and the browser parse path is tested with a generated PDF
- **D-024** — The column model follows a real statement, corrected by the smoke test
- **D-025** — The currency marker is searched across page one, not only the frame block *(superseded by D-034)*
- **D-026** — The frame contract follows a real statement: no printed balances, two-line rows
- **D-027** — Browser runs use an isolated Playwright config
- **D-028** — The frame/grid boundary comes from the heading line, and the fixtures print the collision
- **D-029** — A printed zero money column is no movement, not a rejection
- **D-030** — Columns are assigned by a run's midpoint, using the width pdf.js reports
- **D-031** — The statement's calendar era is determined once, from its period end
- **D-032** — Row diagnosis is batched and deduplicated, not serialized one defect per read
- **D-033** — The import is cross-checked against the statement's own printed totals
- **D-034** — The currency must be stated in the frame block, restoring the narrow guard
- **D-035** — Private statements are invoked, never read: the masking harness boundary
- **D-036** — A development sign-in, gated by an opt-in flag rather than by `NODE_ENV`
- **D-037** — Receipts are images, so they are a separate build behind reviewed OCR
- **D-038** — What may appear in a masked dump is decided structurally, not by density
- **D-039** — A slash-joined money heading is two right-aligned columns, and direction is arithmetic
- **D-040** — The currency guard moves to the column heading, per layout, rather than being dropped
- **D-041** — Migration 009 admits three banks, and takes the fingerprint's bank from the bound account
- **D-042** — A reader must say how much of the parse it managed to verify
- **D-043** — An import the bank's arithmetic did not confirm is refused, not labelled
- **D-044** — Portable recovery is rehearsed into a second, separately bound local project
- **D-045** — The owner can create an account, through an RPC and nothing else
- **D-046** — Recovery is something a person can do, not something a developer can reconstruct
- **D-047** — The first real import, and the guard it forced
- **D-048** — The real ledger gets its own project; the test project goes back to being disposable
- **D-049** — Agents may read real statements, but only re-passworded copies, and only in one directory
- **D-050** — Slips are provisional entries the statement confirms, and their images are not stored
- **D-051** — Hosting is accepted, and Google OAuth is the gate in front of it
- **D-052** — `HANDOFF.md` owns mutable homeless facts, and the rule is now testable per edit
- **D-053** — The slip sample is four layouts rather than nine, and the QR does not always decode
- **D-054** — Fourteen statements imported through the app's own routes; the fifteenth is refused and stays refused
- **D-055** — A statement's printed row order is not always its balance order, and reconciliation recovers the one order that is
- **D-056** — Slips are a twelfth table, identified by a CRC-checked QR, and the backup reads two versions
- **D-057** — The platform QR reader does not exist on the owner's desktop, so the app carries its own and only downloads it when it must
- **D-058** — `connect-src` is derived from the configured Supabase origin, and an unconfigured build gets a narrower policy rather than a wider one
- **D-059** — Two of the four slip layouts carry the transaction date inside the QR, so it is read rather than typed

- **D-060** — Three real slip references reached the test fixtures, and the entries claiming otherwise are wrong
- **D-061** — The app becomes four routes, and the shell owns everything that is not one surface's business
- **D-062** — A captured slip belongs in the ledger view, as a provisional entry that stays out of every confirmed figure
- **D-063** — Slips are reconciled against statement rows, so the ledger shows one row per payment and one total
- **D-064** — The match window narrows to one day, the chip that said nothing comes off the row, and the rule turns out to be unverifiable until task 21
- **D-065** — The live ledger moves to migration 011, so slip capture and reconciliation finally reach real records
- **D-066** — The one-day match window is measured rather than judged, and the measurement caught a wrong match it would have made
- **D-067** — The owner's say over a match is stored, and a statement row is something only one slip can claim
- **D-068** — The match decision becomes reachable, and the decisions arrive with the slips they are about
- **D-069** — The table is the chooser, because a dropdown cannot describe a row this app's rows repeat
- **D-070** — What the review of the match UI found, and the two of them that were about money
- **D-071** — A fee is its own statement row, so the amount-equality guard stays; what is left open is the slip, not the ledger
- **D-072** — The fee residual is closed, and the slip layout already said so
- **D-073** — The live ledger reaches migration 012, so the owner's override is finally about real records
- **D-074** — A backup's own description must come from the backup, not from the newest constant
- **D-075** — A capture leaves a record, and a pairing can be inspected
- **D-076** — The statements are reimportable, so a backup protects the typed layer rather than the ledger
- **D-077** — The three real slip references are gone from the working tree, and so is the real date inside one
- **D-078** — The owner's real backup is proven to restore, and a v3 file is proven to land in a v4 ledger
- **D-079** — The routing table stops naming agents, because only each harness knows which ones exist
- **D-080** — The decision log gets an index and an archive, because the cost was in the reads nobody chose
- **D-081** — The traps get sections and an index, and three of them were found to be lying
- **D-082** — The continuity documents get a checker, because every way they drifted was mechanical
- **D-083** — Hosting migrates by restoring the backup, not by reimporting the statements
- **D-084** — Cash and corrections reach the app, and the amount in force is resolved once at the edge of the read path
- **D-085** — Every trap gets a date, and a recovered one says it is weaker than a checked one
- **D-086** — The month vocabulary is measured, so the printed date is read — except the one year that would need a guess
- **D-087** — OCR locates the amount and the owner reads it, so no machine-read digit enters the ledger
- **D-088** — The amount finder ships, and the engine's own defaults are the thing it had to be protected from
- **D-089** — The v4-into-v5 restore is exercised, because hosting's first act depends on a version pair nothing had run
- **D-090** — Categorisation is applied automatically, so a machine guess has to stay distinguishable from a decision
- **D-091** — The real sign-in is built, and the half nobody had listed is the two-factor screens
- **D-092** — The hosted project refuses `anon` at the grant layer, because its schema manages its own grants
- **D-093** — Strong access needs one TOTP factor, not two, because the second never bought what it claimed
- **D-094** — The real ledger lives in the hosted project, moved by the restore path rather than by reimporting
- **D-095** — `pnpm-workspace.yaml` is committed, because a hosted build clones `HEAD`
- **D-096** — The app is hosted, and the database was checked separately from it
- **D-097** — New owner data goes in a new table, never a new column, so every backup version stays cheap to keep
- **D-098** — A notification card is its own record, identified by a computed fingerprint the balance makes unique
- **D-099** — A card is read from labels paired with its direction, and direction itself is read twice
- **D-100** — The card reader locates fields and reads no digit, and a screenshot is split into cards before anything is located
- **D-101** — A card is captured through a route that checks the account binding the database only stores
- **D-102** — A card reconciles on its printed balance, which breaks the tie a slip cannot and refuses when it disagrees
- **D-103** — A card's balance disagreement may be overruled and the consent is stored, and a wrong card is retired rather than re-bound
- **D-104** — A card gains a correction overlay, a stored decision and a retirement, and the backup reaches v7
- **D-105** — Migration 017 and its routes pass a security review with no findings, and the review is what caught a stale invariant
- **D-106** — `anon` holds `TRUNCATE` on every table added since migration 002, and a grep of the migrations is what hid it
- **D-107** — Migration 018 takes back the inherited default privileges and stops the next table inheriting them
- **D-108** — The hosted project takes 016, 017 and 018, and the ledger is level with local for the first time since 2026-08-12
- **D-109** — Every push to `main` deploys, so the app has been redeploying itself all along and the ordering rule binds the push
- **D-110** — Two capture forms defaulted their date in UTC, so they offered yesterday for seven hours a day
- **D-111** — No LINE automation is possible on iOS, so the screenshot is the only path and Capture is the better one
- **D-112** — OCR reads a card's digits reliably and fails visibly, which is not the risk D-087 assumed
- **D-113** — Repairing a card's punctuation without touching a digit is what makes a pre-fill viable, and the guard is the design

- **D-114** — Pre-fill is trialled rather than decided, and the statement is the independent check the usage stats cannot be
- **D-115** — A garbled separator hid a label, not just a value, and the month-name reader that looked obvious was worth nothing
- **D-116** — Migration 019 records the pre-fill as field names, and adds two optional payload keys rather than a parameter
- **D-117** — A card is read enlarged and a slip is not, which is D-087's ladder bounded rather than reversed
- **D-118** — Cloud Vision reads what tesseract cannot, and the remaining failures are all in this repository
- **D-119** — Two fixes in this repository take Vision to 99 of 100, and neither helps the local engine
### Current 
—
 this file

- **D-120** — The card reader adopts Cloud Vision behind this app's own route, with no fallback, and slips stay on the device
- **D-121** — The last refused field is a tone mark misread inside a label, reproduced and not repaired
- **D-122** — An empty list is sent as an absent key, because migration 019 refuses `[]` and fails hardest when the pre-fill is perfect
- **D-123** — The direction is filled from the printed sign and never from the direction word, so the cross-check keeps its force
- **D-124** — A capture's result moves to the top of the form and the page follows it
- **D-125** — A review of the day's own work found a missing deadline, a bound that did not bound, and a keyboard left behind
- **D-126** — Migration 020 closes the empty-list refusal, and the test that held it flipped rather than being deleted
- **D-127** — A label survives one misread mark, proven safe by the labels staying distinct rather than by argument
- **D-128** — Vision locates the amount on every real slip and every one parses as money, measured and NOT adopted
- **D-129** — Slip capture adopts Cloud Vision and pre-fills the amount, and the local OCR engine is deleted
- **D-130** — The continuity size guard measured lines while the files grew sideways, and reported green at 332 KB
- **D-131** — The handoff and the plan were append-only by habit, and both had gone self-contradictory
- **D-132** — The ledger view's markup became seven files, and the derivation pipeline deliberately did not move
- **D-133** — Both continuity budgets were acted on rather than raised, and the archive boundary excluded every open question
- **D-134** — The traps budget is raised to 260 KB on the lookup-file argument, with the next breach owed a split rather than a third raise
- **D-135** — Bulk slip upload files a slip unseen only when its date is exact, and the printed-date reader that made that possible had shipped uncalled
- **D-136** — The palette becomes warm and the phone gets measured, which found two contrast failures no light-mode look would reveal
- **D-137** — Cornsilk becomes the ground and the dark scheme is dropped, so the app declares one set of colours and measures only those
- **D-138** — The ledger table escaped the viewport on a real phone, because an element selector cannot reset a class and an audit cannot measure a table that was never rendered

## D-120 — The card reader adopts Cloud Vision behind this app's own route, with no fallback, and slips stay on the device

- Date: 2026-08-17
- Status: **Decided by the owner and built.** `PLAN.md` task 35 is closed. D-118 measured the capability and D-119 fixed the two grammar faults it exposed; this is the adoption those two deliberately did not presume.
- **The decision, in one line.** The **card** path reads through Google Cloud Vision, called from `app/api/v1/notification-cards/read/route.ts` rather than from the browser, with **no local fallback**. `lib/slip-ocr-engine.ts` is untouched and still reads **slips** on the device.
- **Three things in D-118's framing were wrong or overstated, and each narrowed the decision. They were found by reading the code rather than the docs, which is the part worth repeating.**
  1. **"Delete the local engine" was never available.** `lib/slip-ocr-engine.ts` is shared: `app/slip-capture.tsx` calls it as the slip amount finder (16 of 23, D-088) and the card form called it too. Deleting it deletes the slip finder. Vision has never been measured on a slip, and measuring it means sending 23 real slips to a third party — a larger disclosure than a card and a separate ask. **So the local engine stays whatever this decides**; the only live question was whether the card path still calls it.
  2. **"It works offline today" is nearly empty for the deployed app.** There is no offline app shell — `public/share-slip-sw.js` caches exactly one URL and says so — so on Vercel the card form cannot load and the card cannot be saved without a network. Losing an offline read costs nothing the owner can use. It is true only on this machine against a local database.
  3. **The no-image-leaves-the-device promise is narrower than "the app".** The two on-screen strings — `No data left this device` and `Nothing has left this device` — are on the **statement import** path. The card path's promise was architectural (self-hosted tesseract, strict CSP, no client storage) and is held by three tests in `tests/privacy.test.ts` and one browser spec, **all of which name `lib/slip-ocr-engine.ts`**. Writing Vision as a new module beside it leaves every one of them passing and still true.
- **Why a route and not a browser call, which is the only shape question that was real.** Calling Vision from the page means the key ships in a `NEXT_PUBLIC_` value that anyone loading the app can read, and `connect-src` has to name `vision.googleapis.com`; an HTTP-referrer restriction would be the only thing protecting it. Relaying through this app's own origin keeps the key in the deployment environment and **leaves the strict CSP completely untouched** — `connect-src` still names `'self'` and the Supabase origin (D-058). **The cost is stated rather than hidden**: the screenshot now passes through this server as well as through Google, two parties instead of one, which is why neither the route nor the engine module may log and why `tests/privacy.test.ts` asserts that.
- **Why no fallback, which is a decision and not an omission.** The safety argument for one is empty: the pre-fill is blank-on-failure, so a failed read leaves every box blank and the owner types the card, exactly as before 2026-08-16. What a silent tesseract fallback would buy is a partial fill; what it would cost is **two engines behind one grammar**, and `findCards` is already known to depend on where an engine breaks a Thai run (D-119) — every future grammar change would need measuring twice and one side would rot quietly. One engine, one measurement.
- **The 2× enlargement went with the engine that needed it, and this was measured rather than assumed.** D-117's `cardReadingScale` lifted the local engine from 62 of 100 to 70. Measured through the **shipped** Vision path over the same 12 screenshots at **native size**: **25 of 25 cards, 99 of 100 fields**, amount / balance / account digits 25/25 each, the one refusal being the Krungthai `occurredAt` that D-119 left open. So the enlargement bought nothing and would have cost up to four times the bytes leaving the device. It is deleted, and `lib/notification-card-ocr.ts` keeps a note where it stood: **its lesson outlived its mechanism** — a measurement on one subject or one engine does not govern another.
- **Native size also removes the coordinate-space hazard by construction.** The bytes sent to the reader and the pixels the crops are cut from are now one image at one scale, so no box is ever rescaled and none can silently land on the wrong row (GOTCHAS).
- **The screenshot is re-encoded to PNG rather than forwarded.** The picker accepts `image/*`, so an iPhone can hand the form a HEIC that Vision cannot decode; whatever the *browser* decoded re-encodes to a PNG it can. The pixels are the ones already decoded, which is why a measurement taken over half-JPEG samples transfers to it unchanged.
- **The promise is restated on the screen where it happens, not only in a document.** The card form says the screenshot is sent to Google Cloud Vision to be read and stored nowhere. Statement import and slip capture remain wholly on the device and say so as they always did.
- **What did not change, and is the reason adoption was safe at all.** `parseThb`, the digit guard and blank-on-failure all sit **downstream** of whichever engine produced the words, so no engine — including one that hallucinates — can put a wrong-but-plausible figure into a box (D-114, D-118). Nothing is stored: the route writes nothing, in the database or anywhere else. The direction control is still filled by neither engine.
- **The owner's standing question is recorded rather than actioned: should slips use Vision too?** Recommended **no** for now, and it is in `PLAN.md` as an open question rather than a task. A slip read is a *finder* with one field to help, and its QR already carries the bank, the reference and the date on 14 of 23; a card had four fields, no QR and a 70→99 gap. Against that, a slip carries a counterparty name, a reference and account digits, the measurement itself is the disclosure, and adopting it would leave `lib/slip-ocr-engine.ts` with no caller — taking the self-hosted assets, the three privacy tests and the browser spec that proves the CSP against a real engine with it.
- **Operationally this needs one thing from the owner that no commit can do**: `GOOGLE_VISION_KEY` must be set in the Vercel project, server-only and never `NEXT_PUBLIC_`. Without it the reader refuses with a message the owner can act on and the rest of the app is unaffected. `.env.example` documents it, and the same warning that keeps `SUPABASE_SERVICE_ROLE_KEY` out of the hosted environment applies: that file is never copied wholesale.
- Gate: Vitest **595 / 7 skipped across 30 files** (was 580 / 7 across 29), pgTAP **263 across 8** unchanged since no SQL moved, production build clean at **eighteen** `/api/v1/` routes (was seventeen), Playwright owner **29/29** and isolated **18/18**.
- Evidence: `lib/notification-card-vision.ts`, `app/api/v1/notification-cards/read/route.ts`, `app/notification-card-capture.tsx` (`loadCardImage`, `encodeCardForReader`, `readCardWords`), `lib/notification-card-ocr.ts` (where `cardReadingScale` was), `tests/notification-card-vision.test.ts`, `tests/notification-card-routes.test.ts`, `tests/privacy.test.ts`, `.env.example`. A throwaway harness under `.runtime/` measured the shipped path over 12 real screenshots and printed counts only; **it wrote no file and has been deleted**, as D-088's and D-100's were. It is cheap to rewrite because every part it measured is shipped — it imported `readCardWordsWithVision`, `findCards`, `locateCardFields` and `prefillCardFields` and reimplemented none of them, which is the rule D-113's harness is remembered for breaking. D-118, D-119, D-117, D-114, D-087, D-058. `PLAN.md` task 35.

## D-121 — The last refused field is a tone mark misread inside a label, reproduced and not repaired

- Date: 2026-08-17
- Status: **Reproduced and diagnosed. Deliberately not fixed** — the cause is now known instead of guessed at, which is what D-119 left open, and the remedy is a grammar change that deserves its own measurement rather than a ride on an adoption commit.
- **The one field.** `S__18636806_0.jpg`, card 2, Krungthai Connext, incoming: `occurredAt` refuses as `LABEL_NOT_FOUND`. One card of 25 — every other Krungthai card on the same samples finds the same label without trouble.
- **The cause, to the code point.** The label is `วันที่ทำรายการ`. `normalise` applies NFKC, which gives `ำ` (U+0E33) its compatibility decomposition, so the label the matcher compares against holds `ท` + **U+0E4D** (nikhahit, the small circle above) + `า`. On this card Vision returns **U+0E48** (mai ek, the small stroke above) in that position. The line matches the label's first **7** characters and diverges on the 8th. So the row was read and the *label* is unfindable — not the date.
- **It is the same class as D-117's SCB slash and not the same cause, which is what D-119 suspected and could not confirm.** Both are a character carrying **no value** being misread inside a label, which makes the whole field unfindable rather than misread. The slash case was `/` read as `|`; this is one superscript Thai mark read as another that looks like it at notification size. `repairSeparators` exists for exactly the first shape.
- **Why it was not repaired here and now.** A separator repair is safe because `/` and `|` carry nothing; a Thai tone mark **does** carry meaning in ordinary text, so a rule turning U+0E48 into U+0E4D is only safe *inside a comparison against a known label* and would need bounding as carefully as `opensWith` was (D-119). It would also fire on **1 card in 25**, so the measurement that justifies it barely has a subject — the same shape of thin evidence that made D-115's month-name reader worth building, measuring at 0 of 2, and deleting the same day. Recorded so the next attempt starts from the code point rather than from the symptom.
- **What a fix would have to prove**, whenever it is attempted: that no other label on any layout becomes findable-by-accident under the same repair, and that the repair is discarded when it changes anything but a mark — the digit-guard discipline of `repairToken`, applied to glyphs.
- Evidence: a throwaway harness under `.runtime/`, run once and deleted, which printed **no line** — only the label's code points, the count of characters shared, and the single differing character. D-119 (which left this open), D-117 (the slash), D-115 (the thin-evidence precedent), D-120. `PLAN.md` task 35.

## D-122 — An empty list is sent as an absent key, because migration 019 refuses `[]` and fails hardest when the pre-fill is perfect

- Date: 2026-08-17
- Status: **Found in production by the owner's first real card read through Cloud Vision, reproduced in the database, and fixed in the app.** The database defect is real and stays open as `PLAN.md` task 37; nothing in this app can reach it any more.
- **The symptom.** The card form filled all four digit-bearing fields correctly from Vision, the owner changed none of them, and the capture was refused with `The record of what the card pre-filled is invalid, so nothing was captured.` The reader had worked perfectly; the record of the reading is what failed.
- **The cause, reproduced rather than reasoned about.** `private.assert_prefill_field_names` (migration 019) rejects a repeated field name by comparing `array_length(v_names, 1)` against `count(distinct n)`. **PostgreSQL answers NULL, not 0, for `array_length` of an empty array**, while the count answers 0 — so `NULL is distinct from 0` is true and an empty list raises `contains a repeated field name`. Run against the local project: an **absent** key returns an empty list, `["amount"]` returns one name, and **`[]` raises**.
- **Why it fires exactly when everything works.** The form always sent both keys. `prefillChanged` is empty precisely when the owner **changed nothing** — the outcome the whole trial is hoping for. At the local engine's 70% he was always changing something, so the case never arose; Vision at 99 of 100 made it the normal one. **A defect that only appears when the feature succeeds is the kind a gate does not find**, and this one had a full green gate over it.
- **Why no test caught it, which is the more useful half.** Both the pgTAP and route tests for "no pre-fill" **omit the keys**, and omitting takes an early return that never reaches the duplicate check. Nothing anywhere sent `[]`. The two encodings look interchangeable in the migration's own prose — "absent means an empty list" — and one of them was never exercised. **Two spellings of the same intent need two tests, or the untested one is where the defect lives.**
- **The fix, and why it is not a workaround.** `namesOrAbsent` in the card form sends an absent key for an empty list. Migration 019 *defines* absent as empty and `notificationCardCaptureSchema` already marks both keys optional, so this is the contract's own encoding rather than a way around it — the audit row records `[]` either way. It needs no migration, no backup and no ordering ceremony, which is what let it ship the same hour the owner hit it.
- **The database defect stays open deliberately, as `PLAN.md` task 37.** The one-line change is `coalesce(array_length(v_names, 1), 0)`. Writing it today would open a local/hosted migration gap and demand a fresh backup that goes stale the next time a card is captured, to close a hole nothing can reach. `tests/notification-card-routes.test.ts` **holds the current refusal in place with an explicit test that flips to 201 when 020 lands** — a test is the only kind of note that fails when it goes stale.
- **What this says about the adoption it followed.** D-120 argued the pre-fill guarantees were unaffected by the engine swap, and they were: no wrong figure reached a box. What the swap changed was *which paths get exercised*, and that is the thing to look for after any accuracy jump — the success path had never been walked end to end.
- Evidence: `app/notification-card-capture.tsx` (`namesOrAbsent`), `tests/privacy.test.ts`, `tests/notification-card-routes.test.ts`, `supabase/migrations/202608160019_notification_card_prefill_audit.sql` (`private.assert_prefill_field_names`). Reproduced with three one-line queries against `private-ledger-local`; no owner data was read or written. D-120, D-116, D-114. `PLAN.md` tasks 35 and 37.

## D-123 — The direction is filled from the printed sign and never from the direction word, so the cross-check keeps its force

- Date: 2026-08-17
- Status: **Asked for by the owner after capturing his first three cards through Cloud Vision, measured, and built.** He asked for three things: the next card selected automatically after a capture, the direction control filled by the reader, and a result message that is not another line of grey. The second one touched an invariant and is the whole of this entry.
- **What auto-filling the direction naively would have destroyed.** `readDirection` refuses a card whose two printed signals disagree (D-099). It takes the direction **word** from the image and the **sign** from the direction control — so filling that control from the word hands the check back the signal it already holds, and it agrees with itself on every card forever. **It would still look like a check**, which is the dangerous part: the code, the tests and the refusal message would all survive intact while catching nothing.
- **This mattered more this week than last.** Before D-114 the owner typed the amount, so its sign was a human reading and the control was one of two independent signals. Since pre-fill, the amount, balance, timestamp and account digits all come from the image — the direction control had become **the only human signal on the card**.
- **The image carries a second direction signal that the form was throwing away.** Every layout that prints a sign prints it on the amount, and `prefillCardFields` already reads it into `PrefillAmount.sign`; D-115 deliberately did not offer it to the control. Filling from the **sign** and letting the existing check compare it against the **word** keeps two genuinely different printed features in play. They are independent in the way that matters: a misread that garbles a Thai direction word and one that drops a leading `-` are not the same misread, and either alone still blocks the save.
- **Measured before designing, not after.** Over the same 12 real screenshots: **26 of 28 cards print both a word and a sign, and all 26 agree.** The two that do not are **KBank Live incoming**, which names its direction in the title and prints no sign — on those the control stays blank and the owner sets it, exactly as before. So the convenience arrives on 26 of 28 cards without the check being weakened on any.
- **What is honestly given up, stated rather than glossed.** The owner's independent judgement is no longer in the loop on a card that prints both signals. What remains is two printed features cross-checking each other, which is weaker than a human reading and much stronger than a check comparing the image with itself. He asked for it with the trade described.
- **The direction is not recorded in the pre-fill audit lists**, and that is a constraint rather than an oversight: migration 019's closed set is the four digit-bearing fields, enforced in the database, so adding a fifth name would be a migration. The consequence to hold is that the trial's offered/changed rates describe the four figures and say nothing about the direction.
- **The card count moved between two runs of the same harness — 25 yesterday, 28 today, on the same 12 images.** Vision's output is not byte-identical between calls, so the layout the harness picks by "most cards found" can differ. **Ratios from that harness are usable and absolute counts are not**, which extends D-118's warning about its per-layout attribution to its card total as well.
- **The other two changes, which needed no measurement.** A capture now advances to the next card on the same screenshot and re-crops it, because a screenshot carries two cards more often than one (D-100) and re-picking from the chooser was the second half of every capture. And the result is a **coloured banner** — green captured, amber already held, red failed — carrying its meaning in the words as well as the colour. **A banner rather than the modal dialog the owner suggested**: a dialog needs a focus trap, an Escape key, focus restoration and `aria-modal`, each of which is a way to fail the axe pass this route already holds, and it would take the keyboard from someone mid-form. The visibility was the point and a region gets it.
- Evidence: `app/notification-card-capture.tsx` (`offerPrefill`, `selectCard`, the capture-result banner), `app/globals.css` (`.capture-result`), `tests/privacy.test.ts` § keeps a card's two direction signals from collapsing into one. A throwaway harness under `.runtime/` counted the signals over 12 real screenshots and printed the sign character and direction only; deleted after. D-099 (the cross-check), D-115 (which withheld the sign), D-114, D-120, D-100. `PLAN.md` task 38.

## D-124 — A capture's result moves to the top of the form and the page follows it

- Date: 2026-08-17
- Status: **Asked for by the owner in use and built.** A small change with one non-obvious part, recorded for that part rather than for its size.
- **What was wrong with the banner where D-123 put it.** Under the submit button was the obvious place and it was nearly useless. A card form runs several screens long, so the message appeared where the owner already was — and the **next card, already loaded and waiting in the fields above, was off-screen behind it**. The result and the thing to do about it were at opposite ends of the page.
- **The result now sits directly above the channel and the screenshot**, and `scrollToResult` sends the page there. Reading what happened and seeing what to do next are one glance. This is only an improvement because the two changes come together: a message moved to the top of a long form is *less* visible than one beside the button, unless the page goes with it.
- **The scroll deliberately passes no `behavior`, which is the accessible choice rather than an omission.** Left unspecified, `scrollIntoView` follows the CSS `scroll-behavior` — `app/globals.css` sets `smooth` and overrides it to `auto` under `prefers-reduced-motion`. Passing `"smooth"` explicitly would ignore that preference for the one person who set it, and it is the kind of thing that never shows up in a review because the code looks more specific, not less.
- **The ref is on a wrapper that is always rendered, not on the banner.** The banner exists only while there is a result, so a ref on it is null at the moment `submit` wants to scroll — React has not committed the element yet. The scroll is also deferred one frame, because running it in the same commit that adds the banner lands short by the banner's own height.
- **Failures scroll too.** An error used to appear beside the button that caused it, which needed no help; now that the banner has moved, the two paths have to behave the same or a failed capture would leave the owner looking at an unchanged form with the explanation somewhere above.
- **A correction made while writing this.** The first version of the CSS comment said the scroll margin cleared a sticky header. **This app's header does not stick** — checked rather than assumed — so the margin is breathing room and the comment now says so. A comment asserting a layout property that is not true is the kind of thing a later reader builds on.
- Evidence: `app/notification-card-capture.tsx` (`resultBanner`, `scrollToResult`, the banner's new position), `app/globals.css` (`.capture-result-anchor`). D-123 (which introduced the banner), D-100.

## D-125 — A review of the day's own work found a missing deadline, a bound that did not bound, and a keyboard left behind

- Date: 2026-08-17
- Status: **Reviewed and fixed.** Recorded because of how it came about as much as what it found.
- **The process failure first, because it is the reusable part.** This repository's practice is a code review *before* asking to commit. Five commits went out today — a new third-party dependency, a new route, a form largely rewritten — and **not one of them had a review**. Every one had a full green gate, which is what made skipping the review feel affordable and is exactly why it was not: a gate proves the old paths still work and says nothing about a path that did not exist that morning.
- **Finding one: the call to Vision had no deadline.** A hung request held the route open until the platform killed the function, so the owner would have watched a spinner and then received whatever generic failure the runtime produces — not the "could not be reached, type the values" sentence written for that case. Fixed with `AbortSignal.timeout(VISION_TIMEOUT_MS)` at 20 seconds, far above the ~1.5s a real read takes and comfortably below the function limit, so **our deadline fires before the platform's** and the failure stays ours to describe. An abort throws, which was already `UNREACHABLE`.
- **Finding two: the size bound did not bound anything, and its comment claimed it did.** `MAX_IMAGE_BYTES` was checked *after* `request.arrayBuffer()`, so an oversized upload was fully buffered and then refused. The declared `Content-Length` is now checked first, before the body is read. **The comment was the more interesting half of the defect**: it said an unbounded relay was "worth closing whether or not anything today would reach it", which described an intent the code did not implement. It now says what is actually true — the bound protects the third party from this app, not this app from its caller, because a chunked or lying request still gets read whole and the real protections are `strongOwnerClient` and the platform's own body cap.
- **Finding three: the scroll moved the viewport and left the keyboard behind.** D-124 sent the page to the result; focus stayed on the submit button, now off-screen at the bottom, so Tab continued from a control the owner could no longer see. **Put to the owner rather than decided**, because D-123 had refused a modal partly on the grounds of not taking the keyboard, and moving focus is a smaller version of the same act. He chose to move it. The banner takes `tabindex="-1"` and is focused with `preventScroll`, so the scroll above keeps its chosen position — and it stays a **region, not a dialog**: Tab and Escape behave normally, nothing is hidden, no `aria-modal`. A test asserts that last part, because the distance between this and the dialog D-123 declined is one attribute.
- **Two smaller things worth having written down.** A source-grep test matched the word `aria-modal` **in the comment explaining the rule** and failed the file for describing itself — the second time today, after `tesseract`; match the attribute or the identifier, never the prose. And a `Proxy` over a `Request` must forward `Reflect.get(target, key, target)`, not the proxy as receiver: `headers` is a getter over a private field and throws "Cannot read private member" otherwise, which reads as a route defect rather than a test one.
- **Docker was down when the route suite was re-run and the suite reported 34 skipped, not 34 passed.** Caught by reading the word rather than the colour, which is the trap `GOTCHAS.md` has carried since 2026-07-31 and which fired again here. Restarted, 15 containers healthy, suite re-run for real.
- Evidence: `lib/notification-card-vision.ts` (`VISION_TIMEOUT_MS`), `app/api/v1/notification-cards/read/route.ts` (the declared-length check and the corrected comment), `app/notification-card-capture.tsx` (`scrollToResult`), `app/globals.css`, `tests/notification-card-vision.test.ts`, `tests/notification-card-routes.test.ts`, `tests/privacy.test.ts`. D-120, D-123, D-124.

## D-126 — Migration 020 closes the empty-list refusal, and the test that held it flipped rather than being deleted

- Date: 2026-08-18
- Status: **Applied everywhere, hosted included, and verified on the remote.** `PLAN.md` task 37 is closed. D-122 diagnosed this and fixed the app around it; this closes the database.
- **The change is one wrapped call.** `private.assert_prefill_field_names` compared `array_length(v_names, 1)` against `count(distinct n)`; `array_length` answers **NULL** for an empty array while the count answers 0, so every empty list raised `contains a repeated field name`. Now `coalesce(array_length(v_names, 1), 0)`. **No table, no column, no signature change** — the backup contract stays at **v7** and `capture_notification_card` picks up the new body through the call it already makes.
- **`cardinality(v_names)` would have been the tidier spelling** and was not used deliberately: `coalesce` leaves the diff against 019 as one wrapped call rather than a swapped function, so the comparison stays legible beside the count it is being made against.
- **Red-proved against the real database before the fix, not reasoned about.** The new pgTAP test died with `P0001: prefillChanged contains a repeated field name` on the pre-020 schema — the exact error the owner saw in production — and passes after. pgTAP went **263 → 266 across 8**.
- **Both spellings of "nothing" are now asserted, which is the whole lesson.** An absent key and an explicit `[]` mean the same thing, and only the first was ever exercised; the second is where the defect lived, which is how it survived a full green gate and surfaced on the first real card whose pre-fill the owner changed nothing on. Three tests cover it: the helper accepts `[]`, `[]` reads as the empty list, and a whole capture with `prefillChanged: []` succeeds.
- **The route test flipped from 422 to 201 rather than being deleted**, which is what D-122 wrote it for: it was a note that fails when it goes stale, and it went stale exactly when intended. Its comment now records what it used to hold and why.
- **The backup was verified from the database before the push and is still current after it.** Sequence **33**, last-exported **33**, equal both times, 5 `backup_records` rows with the newest at 33 — and equal afterwards because DDL mutates no owner data. The owner reported the export and the reading confirmed it rather than taking it on report. `inet_server_addr()` returned a public Singapore address, which rules out the trap where a multi-line `db query --linked` answers from the local database instead.
- **Verified on the remote by running the function there**, not by reading the migration text: `assert_prefill_field_names('[]') = array[]::text[]` returns true on the hosted database, and `migration list --linked` shows all twenty with local and remote matching. The hosted ledger holds **7 cards**, up from 1 on 2026-08-16.
- **The app never needed this to ship**, which is why it was not bundled with D-122's fix: `namesOrAbsent` sends the absent form, so nothing in the deployment could reach the defect. Writing the migration early would have opened a local/hosted gap and demanded a backup that goes stale the next time a card is captured, to close a hole nothing could fall into.
- Evidence: `supabase/migrations/202608180020_prefill_empty_list.sql`, `supabase/tests/007_notification_cards.sql`, `tests/notification-card-routes.test.ts`. D-122 (the diagnosis), D-116 and migration 019 (the defect's origin), D-109 (the ordering rule). `PLAN.md` task 37.

## D-127 — A label survives one misread mark, proven safe by the labels staying distinct rather than by argument

- Date: 2026-08-18
- Status: **Built and measured.** The reader now offers **112 of 112** digit-bearing fields over the real screenshots, with **no refusals at all**. This reverses D-121's "recorded rather than repaired" on better reasoning, not on new evidence about the card.
- **The defect, to the code point.** `normalise` runs NFKC, which gives `ำ` its compatibility decomposition — so `วันที่ทำรายการ` is compared as fifteen characters with a bare **U+0E4D** (nikhahit, a small circle above) at index 7. On one real Krungthai card Vision reads **U+0E48** (mai ek, a small stroke above) there: the same small shape over the same consonant. The row is read correctly and the *label* becomes unfindable, so the whole field is refused. It is D-117's slash problem in a different character class.
- **What changed my mind, and it is a reasoning error worth naming.** D-121 refused the repair because "a Thai tone mark carries meaning where a slash does not". That is true of **general text** and this comparison is never made against general text — it is made against a **closed set of labels** written down in `lib/notification-card.ts`. I had applied a rule about prose to a lookup against a fixed vocabulary, which made a checkable question look like a judgement call.
- **So it became a check.** `labels are distinct under mark tolerance` enumerates every label in the **real** field maps, across both directions of all three layouts, and asserts no two of them differ only by marks above the line. If that ever fails the tolerance must go, and the test says so. **That is the difference between this and D-115's month-name reader**: that one was built on thin evidence about the world, and this one rests on a property of a table this repository owns.
- **Bounded three ways, and the bounds are the design.** Only characters that are **both** Thai marks *above* the line may differ (below-vowels U+0E38–U+0E3A are excluded, because the observed confusion is between shapes drawn above a consonant); **at most one** such substitution across a whole label; and lengths must still agree. A consonant, a digit or a below-vowel differing means a different row, however small the difference looks — both asserted.
- **The prefix check had to move with the completion check.** `labelAtLineStart` accumulates words and abandons a row as soon as it diverges. Relaxing only the completion test would have abandoned the row *at the misread mark* and never reached the relaxed test at all — so `labelStillPossible` is tolerant too. A half-applied tolerance would have looked correct and done nothing.
- **It cannot reach a value.** A label match says only where a field's value begins; every digit still passes `parseThb`, the digit guard and blank-on-failure downstream (D-114). The worst a wrong label match could do is aim a crop at the wrong row, which is what the distinctness proof rules out.
- **Measured through the shipped path**, not a copy of its arithmetic: over the real screenshots the reader now offers **amount, balance, timestamp and account digits at 28/28 each — 112 of 112, no refusal of any kind**, against 99 of 100 before. The sample has grown to 13 images and 28 cards as the owner captures more.
- **`MAX_MARK_SUBSTITUTIONS` is 1 and is not a tuning knob.** A second substitution has never been observed and each one multiplies the chance two labels meet in the middle. Raising it means re-running the distinctness proof, and the constant's comment says so.
- Evidence: `lib/notification-card-ocr.ts` (`markTolerantCompare`, `labelReached`, `labelStillPossible`, `THAI_MARK_ABOVE`), `tests/notification-card-ocr.test.ts` § a label survives one misread mark. A throwaway harness under `.runtime/` measured the shipped path and was deleted; it printed counts only. D-121 (which recorded this and declined to fix it), D-117, D-115, D-114, D-099.

## D-128 — Vision locates the amount on every real slip and every one parses as money, measured and NOT adopted

- Date: 2026-08-18
- Status: **Measured. Nothing is built and adoption is not decided.** The owner asked whether slip capture needed improving, was told the honest sequence was measure first and decide adoption separately — the order that worked for cards — and authorised the measurement.
- **The boundary this crossed, stated plainly because it is wider than the last one.** Twenty-three real slips were sent to Google Cloud Vision. **A slip is a larger disclosure than a card**: a card carries four figures, a slip carries a counterparty's name, a transaction reference and account digits. D-118 said the card crossing did not generalise, and this is the separate authorization that says so about slips. **It does not generalise further** — a statement remains a much larger disclosure again, and nothing here authorises sending one.
- **The result, through the shipped functions rather than a copy of their arithmetic.** Over all 23 real samples at native size:

  | | tesseract (shipped) | Cloud Vision |
  | --- | --- | --- |
  | amount **located** (`locateAmount`) | 16 / 23 | **23 / 23** |
  | amount **parses as money** (`proposeAmount`) | not measured, since nothing reads a figure | **23 / 23** |
  | read failures | — | 0 |

- **The seven slips that gave the owner nothing at all now all resolve**, and that was the actual pain: on those the amount is read off a raw image on the same phone being typed into, with no crop and no enlargement.
- **The anchor ambiguity was flagged in advance as a possible artifact and is ruled out.** The harness cannot decode a QR, so it tried all three bank anchors per slip. `SLIP_FIELD_ANCHORS` gives **SCB and KTB the identical amount label `จำนวนเงิน`** while KBANK uses `จำนวน:` on the next line, so every slip matched either the shared label (counted as two) or KBANK's (counted as one). **No slip matched both**, which is what real ambiguity would look like. In the app the bank comes from the QR under its own CRC, so the correct anchor is always the one used.
- **Native size, deliberately.** D-087 measured that upscaling *hurts* slips — a 2× cubic upscale recovered one image and broke three — and the shipped path reads at native size. The card's opposite finding (D-117) does not govern slips, which is the transfer error this project has now made four times.
- **What is NOT measured, and it is the same gap D-112 hit on cards.** This says a figure was *located* and *parses*, not that it is the **right** figure. No agent can produce that by scoring its own OCR against its own OCR. The independent check already exists and is the same one cards use: a wrongly pre-filled amount fails to pair with a statement row and surfaces as unmatched (D-063, D-102).
- **The upside is larger than the estimate that preceded it.** `PLAN.md` task 36 said the gap was narrow — one field, helped on 16 of 23. It is wider: Vision does not only locate on all 23, it makes an actual **pre-fill** possible, which the slip path has never had (D-087 shipped a *finder* precisely because a machine-read digit could not be trusted). That would take the amount from typed-every-time to offered-and-checked, the shape cards now have.
- **What adoption would cost, unchanged by this measurement.** `lib/slip-ocr-engine.ts` would lose its **last caller**, taking with it the self-hosted `public/tesseract/` assets, the three privacy tests that name that module, and the browser spec that is the only check of the strict CSP against a real engine. Every slip image would then leave the device, where today none does. **The strict pre-fill guarantees would be unaffected either way** — `parseThb`, the digit guard and blank-on-failure sit downstream of whichever engine produced the words, exactly as D-118 established for cards.
- Evidence: a throwaway harness under `.runtime/`, deleted with its output, which imported `locateAmount`, `proposeAmount` and `readCardWordsWithVision` and printed counts, percentages and refusal codes only — no amount, date, reference, counterparty or file content. `lib/slip-ocr.ts` (`SLIP_FIELD_ANCHORS`), unchanged by this. D-087 and D-088 (the finder and its 16 of 23), D-118 and D-120 (the card precedent and its adoption), D-112 (the correctness gap), D-049. `PLAN.md` task 36.

## D-129 — Slip capture adopts Cloud Vision and pre-fills the amount, and the local OCR engine is deleted

- Date: 2026-08-18
- Status: **Decided by the owner and built.** Closes `PLAN.md` task 36. D-128 measured the capability and deliberately did not presume the outcome; this is the adoption. **It is the same shape as the card reader (D-120) and not the two-engine variant**, which the owner chose explicitly.
- **The decision, in one line.** The **slip** path reads through Google Cloud Vision, called from this app's own route rather than from the browser, with **no local fallback** — and the amount it reads now **fills the box** instead of only being cropped and enlarged. `lib/slip-ocr-engine.ts` is deleted, because it had no caller left.
- **What the measurement said, and it is not re-run here** (D-128). Over all 23 real slips at native size, through `locateAmount` and `proposeAmount` themselves: the amount is **located on 23 of 23** against tesseract's 16, and **parses as money on 23 of 23**, with no read failures. The seven slips that gave the owner nothing at all now all resolve. Twenty-three real slips were sent to Google once, under an explicit authorization; **that boundary is wider than the cards and does not generalise to statements**.

### What this reverses, and why the reversal is safe

- **D-087 refused to let a machine-read digit reach the amount box**, and shipped a *finder* instead: locate, crop, enlarge, and the owner types. That refusal rested on a measurement of **tesseract** — digits unstable about one time in fifteen across configurations, with at least one wrong figure passing the strict money grammar. **The engine that was measured no longer exists in this repository.** Under Vision the strict read succeeds on every real sample, which is a materially different proposition from the one D-087 rejected — the same argument D-112 made for cards and D-114 acted on.
- **What did not change is the reason adoption is safe at all.** `parseThb`, the two-fractional-place rule and blank-on-failure sit **downstream** of whichever engine produced the words (`lib/slip-ocr.ts`), so no engine — including one that hallucinates — can put a wrong-but-plausible figure into the box. A figure that will not parse leaves the box empty and says so.
- **The independent check is the statement, and it is the only answer to the thing no measurement here can produce.** Nothing establishes that an offered figure is the *right* figure; no agent can, by scoring its own OCR against its own OCR (D-112). A wrongly pre-filled amount fails to pair with its statement row and surfaces as unmatched, with nobody auditing anything (D-063, D-102).
- **Slip identity is untouched and stays the QR's.** The bank and the transaction reference come out of the QR payload under its own CRC, server-side (`lib/slips.ts`). Nothing OCR reads can change either, which is what makes offering the amount a bounded change rather than a general loosening.
- **`tests/privacy.test.ts` was reversed rather than deleted**, exactly as the same file was reversed for cards in D-115. It used to assert that `setAmount` could not appear in the slip form's reader; it now asserts that the box is filled **once**, with `proposeAmount`'s own value and nothing else — `plainThb(proposed.value)`, matched literally. Red-proved: spelling it `setAmount(proposed.value)` fails exactly that test and nothing else.

### What the route move is for

- **The reader route is now `/api/v1/ocr/read`** and names no record type. It was `/api/v1/notification-cards/read` while the card form was its only caller; a slip reading through a card's URL is a misdescription that later gets reasoned from, and the route has never known or cared what the pixels depict. `lib/notification-card-vision.ts` moved to `lib/vision-ocr.ts` for the same reason and `readCardWordsWithVision` became `readWordsWithVision`. The old paths are recorded in `scripts/check-docs.mjs` as retirements, which is what keeps every historical mention in an append-only log from failing the docs check.
- **The encoding and the POST moved into `lib/browser/ocr-reader.ts`**, which both forms call. Two copies of four lines is how two forms come to encode differently or disagree about what an empty response means; it also gives the one URL, the one `image/png` re-encode and the no-absolute-URL rule a single place to be asserted. It got its own tests when it got its second caller (`tests/ocr-reader.test.ts`).
- **The CSP is unchanged and that is the point of relaying.** The browser posts same-origin; `connect-src` still names `'self'` and the Supabase origin alone (D-058). The key stays in the deployment's environment, and `GOOGLE_VISION_KEY` is the same one variable it always was — no new configuration is owed by this change.

### What was deleted, and what went with it

- `lib/slip-ocr-engine.ts`, `tests/slip-ocr-engine.test.ts`, `scripts/copy-tesseract-assets.mjs` and its `prebuild` step, `public/tesseract/` and its `.gitignore` entry, the `tesseract.js` and `@tesseract.js-data/tha` dependencies, and the `tesseract.js: false` entry in `pnpm-workspace.yaml` that existed only to stop `ERR_PNPM_IGNORED_BUILDS`. **`package.json` and `pnpm-lock.yaml` move for the first time in this run of work**, which is worth noticing rather than discovering later.
- **Three privacy tests went with it and the loss is named rather than absorbed.** They held the engine to serving its worker, core and language data from this origin instead of a CDN, to writing nothing into IndexedDB, and to naming exactly the assets the build copied. Nothing replaces them, because there is no bundled engine left to hold to them.
- **The browser spec that went is the one worth stating loudest: it was the only check anywhere that the strict CSP held against a real OCR engine running in the page.** A worker, a WebAssembly core under `'wasm-unsafe-eval'`, and a 3 MB language model fetched under `connect-src` — all runtime-only failures a build cannot see. It is **replaced rather than dropped**, by a spec driving the shape that actually exists now: the slip form's read button, a same-origin POST to `/api/v1/ocr/read`, no CSP refusal, and **no request to any third-party origin from the page**. That is a real check of the new arrangement and it is *not* the old proof. **Re-adding a bundled engine means re-earning it**, and the spec says so in its own comment.
- **The `Enlarge the amount` control became `Read the amount`, and the crop survived the change.** It is now the owner's check on the offered figure rather than the product itself, and it is shown whenever the region was located — including when the figure refused to parse, which is exactly when it is most worth seeing.

### The promise on the screen

- **Two on-screen sentences became false and are corrected**, which is the rule D-120 followed for cards: say it where it happens, not only in a document. The slip form and the slips page both said the image is read on this device and never uploaded. They now say the **QR** is read on this device and that reading the amount sends the image to Google Cloud Vision, which stores nothing. **Nothing is sent until that button is pressed**, and both sentences say so.
- **`app/site-header.tsx`'s `Documents stay on this device` chip is deliberately left alone.** Its subject is the statement import path, which is unchanged and is now the only path in this app that reads entirely on the device. It is close enough to the line to be worth recording as considered rather than overlooked.
- **`plainThb` is new in `lib/money.ts`** and is the inverse of `parseThb`. `formatThb` could not be used: it prefixes `฿`, groups thousands and uses U+2212 for minus, which `parseThb` rejects outright. A pre-filled box holds text this app parses back with the same grammar that produced it, so the round trip has to be exact rather than usually right — asserted as a property over every int64 amount.

### One thing this got wrong first, recorded because the fix is now committed

- **The new browser spec made a real Cloud Vision call on its first run**, and nothing in the design intended that. `GOOGLE_VISION_KEY` lives in the owner's **Windows user environment**, so `next start` inherits it — the spec expected the missing-key 503 and instead got `The amount's label could not be found on this image.`, which is the honest answer for a synthetic QR fixture that carries no Thai amount label, arriving *after* a live third-party call. **Both committed Playwright configs now pin `GOOGLE_VISION_KEY: ""`** in `webServer.env`, beside the Supabase pins that are there for the same class of reason (D-048): a browser suite must not behave differently according to whose machine it is on, and must not reach a third party at all. The isolated config gets the pin too even though no spec there drives a reader, so one added later cannot call out by accident.
- **What was disclosed by it: one generated QR fixture image**, invented per `docs/FIXTURE_POLICY.md` and carrying no real value. The cost is a charge and a boundary crossing that nobody authorised in that form — small, and worth writing down rather than absorbing, because the mechanism generalises to every credential in that environment.
- Gate, all green with Docker up and checked by `docker ps` before trusting any database-backed row: Vitest **604 passed / 7 skipped across 30 files** (was 605 / 7 across 30 — the deleted engine suite's 8 tests out, `plainThb` and the reader client's 7 in), pgTAP **266 across 8** unchanged since no SQL moved, production build clean at **eighteen** `/api/v1/` routes with the reader at its new path, Playwright owner **29/29** and isolated **18/18**, `pnpm check:docs --strict` at **129 decisions, 132 traps**. **One flake is reported rather than hidden**: `owner-access.spec.ts`'s returning-owner TOTP challenge failed once and passed on an immediate re-run with nothing changed between them. It is not diagnosed and it touches nothing this decision changed.
- Evidence: `app/api/v1/ocr/read/route.ts`, `lib/vision-ocr.ts`, `lib/browser/ocr-reader.ts`, `app/slip-capture.tsx` (`readAmountOnImage`, `cropAmountRegion`), `app/notification-card-capture.tsx` (`readCardWords`), `app/slips/page.tsx`, `lib/money.ts` (`plainThb`), `tests/ocr-reader.test.ts`, `tests/privacy.test.ts`, `tests/domain.test.ts`, `tests/vision-ocr.test.ts`, `tests/notification-card-routes.test.ts`, `tests/e2e/owner-session.spec.ts`, `scripts/check-docs.mjs`, `package.json`, `pnpm-workspace.yaml`, `.gitignore`. **No measurement was re-run and none was needed** — D-128's is the one this rests on, and repeating it would mean sending 23 real slips to a third party a second time for a number already in hand. D-128, D-120, D-118, D-115, D-114, D-112, D-102, D-087, D-063, D-058, D-050. `PLAN.md` tasks 36 and 21.

## D-130 — The continuity size guard measured lines while the files grew sideways, and reported green at 332 KB

- Date: 2026-08-18
- Status: **Accepted and done.** A correction to `scripts/check-docs.mjs` and an archive taken under the new measure. No application code is involved and nothing about the ledger changes.
- **The defect, in one line.** `check:docs` budgeted `DECISIONS.md` at **1,200 lines** and `GOTCHAS.md` at 1,400. `DECISIONS.md` passed that check at **1,132 lines while being 332 KB** — roughly 80,000 tokens, most of a context window for one file. The guard's own comment says it exists because "a decision log outgrows a single read long before it outgrows a file", and it was measuring the one dimension that could not see that happening.
- **Why the two diverged, which is the part worth keeping.** Entries in this log are long prose paragraphs, not the short `Decision:` / `Rationale:` bullets D-001 … D-020 used. The file grew **sideways**. A line count is a proxy for size only while lines have a roughly constant width, and nothing recorded when that stopped being true — the budget was set in 2026-07 against entries averaging a few hundred bytes and was still being applied to entries averaging 4.5 KB.
- **The measurements, taken before anything was changed.** `DECISIONS.md` 332 KB in 1,132 lines; `PLAN.md` 214 KB in 516 lines and budgeted by nothing at all; `GOTCHAS.md` 182 KB in 1,143 lines; `HANDOFF.md` **91 KB in 86 lines**. Per-entry sizes in the decision log are strikingly uniform — 2.5 KB to 8 KB, with only D-129 above that at 10.9 KB — so the growth is entry *count* times a stable size, not a few bloated entries anyone could have spotted by reading.

### What changed

- **The budgets are bytes**: `DECISIONS.md` 120 KB, `GOTCHAS.md` 200 KB. Set from what a read costs rather than from what the files happen to be — this project's Markdown runs about 0.33 tokens per byte, so those are roughly 40,000 and 66,000 tokens. **The two files get different numbers because they are read differently**: the decision log is read front-to-back by anyone picking the project up, while `GOTCHAS.md` is a lookup file entered through its index, so its size costs less per use.
- **Measured with `Buffer.byteLength`, not `String.length`.** These documents are full of em dashes, Thai labels and typographic quotes, every one of which is several bytes and one character. Measuring characters would under-report exactly the files most at risk.
- **The remedy is per file rather than one shared sentence.** The decision log's is to archive the oldest contiguous range; `GOTCHAS.md` has no archive and its remedy is to retire traps whose subject no longer exists, keeping whatever generalisation outlived them. A message naming the wrong remedy is how a check gets satisfied the wrong way.
- **A passing run now prints each file's size and percentage.** `DECISIONS.md 90 KB/117 KB (77%), GOTCHAS.md 177 KB/195 KB (91%)`. **A budget nobody sees the approach to is a budget that is only ever met as a surprise**, which is the whole story of this entry.
- **D-060 … D-113 are archived** to `docs/decisions/ARCHIVE-D-060-D-113.md`, moved unchanged. `DECISIONS.md` went **332 KB → 90 KB**. The index still covers all three files, so no entry became harder to find — only harder to read by accident.
- **The boundary is where an argument starts, not where a number is round.** D-114 is the point at which the owner put D-087's no-pre-fill rule on trial instead of keeping or reversing it, and every entry since — the strict pre-fill module, both Vision measurements, both adoptions — is that trial playing out. The maintained file now holds one continuous line of reasoning.

### What this did not do, and what it found

- **`PLAN.md` is 214 KB and is still budgeted by nothing.** It is not added here because its shape is different: it is a task list where completed tasks keep their full record inline, so the remedy is not an archive but a decision about how much of a closed task's history stays in the file. That is the owner's call and it is not made.
- **`HANDOFF.md` is 91 KB in 86 lines** and is the file whose own text says it is the thin entry point and that status paragraphs belong in `PLAN.md` (D-052). Line 3 alone is a chain of "Before that:" history several times the length the rule intends. **The rule has failed in practice and a byte budget would catch it**, but capping it without first moving that history somewhere would make the next session's handoff worse rather than better. Named here so the next change is deliberate.
- **`GOTCHAS.md` is at 91% of its new budget**, which is roughly five more traps. That is the first thing the corrected check says, and it is a real signal rather than an artefact of a tight number: two traps were retired today (the tesseract cache and the WASM core path) and both kept their generalisation, which is the pattern the remedy names.
- **Red-proved rather than assumed**: lowering the decision budget to 80 KB fails the check with `DECISIONS.md: 90 KB exceeds the 78 KB budget` and the archive remedy, and restoring it passes. The failure names the file, both numbers and what to do, which is what the old message did too — the old one was simply never reached.
- Evidence: `scripts/check-docs.mjs`, `docs/decisions/ARCHIVE-D-060-D-113.md`, `DECISIONS.md` (header), `HANDOFF.md`, `docs/LOCAL_DEV.md`. `pnpm check:docs --strict` passes at **129 decisions, 132 traps**, unchanged across the move, which is the assertion that the archive relocated bodies and not entries. D-080 (the archive rule this follows), D-052 (the thin-handoff rule this finds broken), D-082, D-085.

## D-131 — The handoff and the plan were append-only by habit, and both had gone self-contradictory

- Date: 2026-08-18
- Status: **Accepted and done**, on the owner's decision. Follows D-130, which corrected the guard that should have caught this. Documentation only; no application code and nothing about the ledger changes.
- **The defect is not size, it is that nothing was ever removed.** `HANDOFF.md` was **91 KB in 86 lines** and `PLAN.md` **214 KB**. Every update to either had *prepended* a paragraph and removed none, so both files held a third telling of a history that `git log` and `DECISIONS.md` already carry in full.
- **Size was the symptom. The failure was that they had become wrong.** `HANDOFF.md` carried **three separate lines each claiming a different migration state** — one said all three local projects were on 012, another said 001–014, another said 019 — while the truth was 020 everywhere. `PLAN.md`'s gate table said Vitest **522 across 28 files** and pgTAP **252** when the real numbers were 604 across 30 and 266. **Every one of those lines was true when written**, and each was left in place beneath a newer one that contradicted it. A reader has no way to tell which of three dated claims is current except by re-deriving all three, which is the opposite of what a continuity document is for.

### What changed

- **`HANDOFF.md` is rewritten, not trimmed: 91 KB → 15 KB.** It now carries only what its own header always said it should — live authorizations, the destructive-operation state of this machine, live hazards, and where to start reading. **One 33 KB line and one 4.8 KB line were the bulk of it**, both pure "Before that:" chains. The file says in its own opening to rewrite it in place and not to prepend, because the rule alone was not enough: D-052 established the thin-entry-point rule in 2026-07 and the file had grown back to more than twice the length that decision trimmed it from.
- **`PLAN.md`'s gate table records the latest run and not every run: about 50 KB → 3 KB.** One cell was **13.6 KB** on its own. The table now says "replace a cell, never append to it", and the stale headline numbers are corrected to the 2026-08-18 gate.
- **`PLAN.md`'s checkpoint section was 27 stacked paragraphs reaching back to 2026-07-24** and is now the current checkpoint plus a pointer. Every paragraph removed carried a decision id already, which is what made removing them safe — the pointer names the arcs and where to read them.
- **One fact was carried forward rather than dropped, and it is the one that proves the exercise was worth doing.** Buried in the twelfth checkpoint paragraph was the finding that a local build's "resting state" is the **synthetic** project, not the live one, because `private-ledger-live` stopped being the ledger on 2026-08-11 (D-094). Every older row in `PLAN.md` and the `.next` bullet in `HANDOFF.md` still said "unpinned, therefore live-targeted". **That mattered within the hour**: an agent reading `.next` on 2026-08-18 found four chunks naming the synthetic port, could not reconcile it with the handoff, and recorded it as an unexplained discrepancy — when the answer was fifty paragraphs down in the file that had been superseded but not deleted.
- **`PLAN.md` 214 KB → 138 KB.** Less than `HANDOFF.md`'s reduction because its remaining bulk is the task list, where a completed task's full record is genuinely the deliverable rather than history: those entries are how a closed decision stays checkable. Cutting them is a separate judgement and is not made here.

### What this does not do

- **Neither file gets a byte budget yet.** `PLAN.md` at 138 KB and `HANDOFF.md` at 15 KB are both comfortably readable now, but a budget set today would be set against a shape that has just changed, and the thing worth measuring for `PLAN.md` is whether the *task list* is still earning its size. Named so the next change is deliberate rather than reactive.
- **Nothing removed was summarised into a shorter form.** It was deleted, because a summary of an append-only log is a fourth telling and would go stale the same way. What replaced each cut is a pointer to where the full record lives.
- **The rule that failed is now written where it is read.** Both files carry a sentence at the point of edit telling the next writer to replace rather than prepend. D-052 put the same rule in a decision entry and it was not enough; a rule that lives only in a log nobody opens while editing is a rule that gets re-broken.
- Evidence: `HANDOFF.md`, `PLAN.md`. `pnpm check:docs --strict` passes at 131 decisions and 133 traps, and **it caught this entry's own forward reference before it shipped** — both rewritten files cited D-131 while it was still unwritten. D-130 (the guard that should have caught the growth), D-052 (the thin-handoff rule this finds broken twice), D-094 (why "live-targeted" stopped being true), D-082.

## D-132 — The ledger view's markup became seven files, and the derivation pipeline deliberately did not move

- Date: 2026-08-19
- Status: **Accepted and done.** Front-end structure only: **no behaviour changed, no route, RPC, migration or SQL moved**, so every project stays on 020 and the backup contract stays at **v7**.
- **The defect was one `return`, not one file.** `app/transactions-view.tsx` was **1553 lines** with **29 `useState`, about 25 `useMemo` and roughly 940 lines of JSX in a single `return`** — the four record kinds it renders were four branches of one `map` rather than four things. It was the only file in a whole-repo survey where length was a genuine comprehension problem rather than a number; the other long files are 21–30% comment and are per-bank parsing contracts that belong together.

### What moved

- **The four record kinds are components**: `app/ledger-statement-row.tsx` (378), `app/ledger-card-row.tsx` (216), `app/ledger-slip-row.tsx` (154), `app/ledger-cash-row.tsx` (118). The statement row is the largest because its Status cell is **three modes rather than three styles** — picking a row for a card, picking one for a slip, and the ordinary verified view.
- **The chrome is three more**: `app/ledger-controls.tsx` (128), `app/ledger-summary.tsx` (143), `app/ledger-retired-cards.tsx` (69). The summary is one component because the matching banner and the totals strip are **alternatives rather than neighbours** — the totals are deliberately absent while a row is being chosen, since a subtotal of three unrelated rows reads as a figure.
- **`app/ledger-shared.ts` (77)** holds what they must agree about: one `formatDate`, the `ALL_ACCOUNTS`/`ALL_STATUSES` control values, and two types. **`LedgerLayout` exists because `showCombined ? 7 : 6` was written out at five separate places** and a detail row spanning the wrong number of columns is a silent defect. **`LedgerModes` groups the seven values describing what the owner is in the middle of**, because a row asks "is a write in flight anywhere", not "is this id deciding" — the conditions that read it stay beside the buttons they disable.
- **`app/transactions-view.tsx` is 1553 → 880 lines, and its `return` is 940 → 215.** Two `store*Correction` functions that sat halfway up the derivation pipeline moved down beside the third, because their position read as though the pipeline depended on them and it does not.

### What deliberately did not move, and why

- **The `useMemo` derivation chain stays in the component.** It was the obvious next cut and it is the wrong one: extracting it would need roughly **16 arguments in and 24 values out**, which is not more comprehensible than the pipeline read top to bottom — it only moves the reading cost from one file to two. The chain is a derivation pipeline, not incidental state, and the rules it calls (`lib/slip-reconcile.ts`, `lib/notification-card-reconcile.ts`) already live outside it.
- **`load()` stays too**, for the same arithmetic: it writes fifteen pieces of state across four record types, so a hook owning it would hand all fifteen back.
- **29 `useState` is unchanged.** Grouping them would change update batching and state identity, which is a behaviour change, and no behaviour change was licensed here.

### The test that would have gone quiet

- **`tests/privacy.test.ts` named five files by hand**, one of them `app/transactions-view.tsx`, to assert the ledger surfaces carry no `serviceWorker`, `localStorage`, `sessionStorage` or `console.`. **A split moves guarded code out from under a check like that while it keeps passing** — the exact drift the same file's opening comment was written about after a hardcoded array missed `app/cash-entry.tsx` and `app/correction-form.tsx`.
- It now **walks `app/`** instead, covering `.ts` as well as `.tsx` — the new shared module is a plain `.ts` and a `.tsx`-only walk would have stopped covering it on the way past. **`app/site-header.tsx` is excluded by name**, with its reason: it is the one file allowed to register the service worker.
- **Red-proved rather than assumed**: a `console.log` was put in `app/ledger-shared.ts`, the check failed, and it was removed.
- Evidence: gate re-run green after each of the two extraction steps and against a baseline taken before anything was touched — Vitest **604 passed / 7 skipped across 30 files** unchanged throughout, pgTAP untouched (no SQL moved), Playwright owner **29/29** at baseline and after both steps, production build clean at **eighteen** `/api/v1/` routes. D-011 (the two-agent workflow this was done under), D-064 (why a statement row carries no chip), D-069 (why the chooser is rows and not a dropdown), D-075 (the detail panels), D-103 (retiring a card).

## D-133 — Both continuity budgets were acted on rather than raised, and the archive boundary excluded every open question

- Date: 2026-08-19
- Status: **Accepted and done**, on the owner's instruction. Documentation only; no application code, no SQL, nothing about the ledger changes.
- **Both budgeted files were within ten percent of breaching**: `DECISIONS.md` at **106 KB/117 KB (90%)** and `GOTCHAS.md` at **181 KB/195 KB (93%)**. D-130 set those budgets deliberately, so raising either would have removed the guard rather than answered it. Each file has a **different** sanctioned remedy and both were applied.

### `DECISIONS.md`: 106 KB → 78 KB (90% → 67%)

- **D-114 … D-119 archived** to `docs/decisions/ARCHIVE-D-114-D-119.md`, moved unchanged. This file now carries **D-120 onward**.
- **The boundary is where the argument ended, and the test was whether anything is still open.** The six moved are the measurements and repairs that *led to* the card reader adopting Cloud Vision. **D-120 is that adoption and it stayed**, because it is the arrangement the app still runs — and because **whether pre-fill stays at all is still undecided on both the card and the slip path**, a question that attaches to D-120 and D-129. Archiving either would have filed a live argument as settled, which is the one thing an archive must not do.
- A round number would have taken D-114 … D-129 and been wrong for exactly that reason.

### `GOTCHAS.md`: 181 KB → 177 KB (93% → 91%)

- **There is no archive for traps and that is by design** (`scripts/check-docs.mjs`): relocating them would only move the reading cost, so the only remedy is retiring a trap whose subject no longer exists down to the generalisation that outlived it.
- **The 2026-08-18 retirements had annotated two dead traps without shrinking them**, which is why the file kept growing while reporting that traps had been retired. A "no longer live" line appended to a full Symptom/Cause/Avoid/Verify body costs bytes rather than saving them. Both were cut properly this time.
- **`A WASM core path naming a directory…` was removed outright**, because its generalisation is word-for-word the one the live ZXing entry above it already carries; the surviving half — **a library that composes an asset name at runtime keeps a second, invisible copy of your build's file list** — was folded into that entry instead of being kept twice. Trap count 133 → 132.
- **The sweep found no other dead subjects.** Eight further traps mention tesseract.js, and in every one it is an example inside a rule that still binds (the pnpm build allowlist, the store-path mismatch, the scoped-name quoting). A trap is retired when its *subject* is gone, not when a word in it is.
- **Named rather than solved**: at 91% and 132 traps, `GOTCHAS.md` will breach again, and retirement is bounded by how many traps actually die. Raising that budget is the owner's call and is not made here.
- Evidence: `pnpm check:docs --strict` passes at **132 decisions, 132 traps**, indexes match, references and paths resolve, `DECISIONS.md` 78 KB/117 KB (67%) and `GOTCHAS.md` 177 KB/195 KB (91%). D-130 (the budgets and why they are bytes), D-080 (the archive remedy), D-131 (the same instinct applied to the handoff and the plan).

## D-134 — The traps budget is raised to 260 KB on the lookup-file argument, with the next breach owed a split rather than a third raise

- Date: 2026-08-19
- Status: **Accepted and done**, on the owner's decision, taken after D-133 applied the sanctioned remedy and reported what it could and could not achieve. Tooling and documentation only.
- **`GOTCHAS.md`'s budget goes 200 KB → 260 KB** (`scripts/check-docs.mjs`). It sits at **177 KB, so 70%**. `DECISIONS.md` is unchanged at 120 KB.

### Why raising it is not the same as abandoning it

- **The remedy was applied first, and the raise is a response to what it measured.** D-133 retired both traps whose subject no longer existed and moved the file 181 KB → 177 KB. **That 4 KB is the honest ceiling on retirement**: a sweep of all 132 traps found no further dead subjects, because a trap is retired when its *subject* is gone and this project's traps mostly describe things that still exist. Retirement is bounded by how many traps die, which is far fewer than are written.
- **There is no archive for traps and that stays true** — relocating them only moves the reading cost, which is why `check-docs.mjs` says so at the point the remedy is printed. So retirement was the only lever, and it was not enough.
- **The number follows the argument the budgets were already set from.** They are set from what a read costs, and `GOTCHAS.md` was already given the looser one because it is *entered through its index* rather than read front-to-back. Taken to its conclusion: what a reader pays is **the index plus one trap**, and the index is about 10 KB of the 177. The body is therefore bounded by what keeps the file greppable, not by what fits in one context window.

### The condition, which is the substance of this entry

- **The thing that must stay readable in one pass is the index, not the file.** When the index stops being scannable, the answer is **structural** — split along the eight existing section headings, each with its own index — and not a third raise.
- **A budget raised twice has been abandoned.** That sentence is now in `check-docs.mjs` beside the constant and in the failure message the next breach prints, because D-130 established that a rule living only in a log nobody opens while editing is a rule that gets re-broken, and D-131 found the same thing again.
- **What this does not do**: it does not touch `DECISIONS.md`'s 120 KB, which is the tighter budget precisely because that file *is* read front-to-back, and which D-133 just brought to 69% by archiving rather than by raising. The two files have different remedies for a reason and this changes only one of them.
- Evidence: `pnpm check:docs --strict` passes at **134 decisions, 132 traps**, `GOTCHAS.md` **177 KB/254 KB (70%)** and `DECISIONS.md` 84 KB/117 KB (72%). Red-proved by lowering the new constant until the check failed and restoring it, which is how D-130 proved the byte budget in the first place. D-130 (the budgets and why bytes), D-133 (the remedy applied and its ceiling), D-131 (a rule must live where it is read).

## D-135 — Bulk slip upload files a slip unseen only when its date is exact, and the printed-date reader that made that possible had shipped uncalled

- Date: 2026-08-21
- Status: **Accepted and built**, uncommitted at the time of writing. The owner asked for many slips at once with no second look at each. Application code and tests only; **no SQL moved, no route was added**, and the backup contract stays at **v7**.
- What ships: `lib/slip-batch.ts` (policy), `app/slip-batch.tsx` (the form), `lib/browser/qr-detector.ts` (the QR reader both slip forms now share), and the form mounted under the single-slip one on `/slips`.

### The request, and the two things that stood between it and unconditional auto-submit

The owner's reasoning was that a misread slip fails to pair and surfaces as unmatched once the statements are in, so a second look per slip buys little. **That was checked against the matching rules rather than accepted**, and it holds for the amount and not for two other fields.

- **Direction.** `lib/slip-reconcile.ts` compares the **signed** movement, so a deposit filed as a withdrawal has the wrong sign, **can never pair with any row**, and skews the deposit, withdrawal and net totals until corrected by hand. Not self-healing, so not something a default may quietly get wrong.
- **Date.** `slipDateFromReference` returns a date only where the reference embeds eight date-shaped digits — SCB and Krungthai's longer variant (D-059). The single-slip form falls back to today, which is right for a payment just made. **A backlog dated today can never pair**, because `MATCH_WINDOW_DAYS` is 1. The safety net the request rests on fails precisely in the case the feature is for.

### What changed the shape: a reader that was already built and called by nothing

**`readPrintedDate` (D-086, 2026-08-10) reads the date printed on the slip, and no shipped code called it** — only its own tests. Since a batch already sends every image to Vision for the amount, the same words yield the date at **no extra request and no extra byte leaving the device**. That turns "no date in the QR" from the blocking case into a much smaller residue: **KBANK alone**, whose printed year is two digits and which `readPrintedDate` refuses outright rather than completing a century (D-031). Finding shipped, tested, uncalled code is worth recording as its own class of finding — the handoff scoped this feature around a limitation that a function already in the repository had removed.

### The rules, and why each is where it is

- **Ready means every value that could be wrong was read exactly.** The amount through `proposeAmount` — its own label, the strict money grammar, no lenient second path. The date from the QR reference **or** the printed line, never from the clock. Anything else goes to a review list with the refusing reader's own sentence.
- **The QR's date wins over the printed one**, because the reference is CRC-covered and already Gregorian while the print is pixels plus a 543-year conversion. When only the print carries a **time**, that time travels with the QR's date; nothing reconciles on a time.
- **Two readings that disagree refuse rather than pick.** Nothing available can say which is right, and a wrong date is the failure that never heals. This costs nothing in the ordinary case, where they agree.
- **A printed date is re-checked against the slip window.** `gregorianFromPrintedYear` fails closed on a *year* while `slipDateWindow` bounds a *date*, so the two do not coincide and a slip in the earlier part of the tenth year back passes one and not the other.
- **Direction is asked once for the whole batch and is never read from the image.** A slip prints who paid whom; **which side is the owner is not on the image and is not in this app**, so there is nothing to measure. The handoff proposed measuring it across the 23 real samples before defaulting it; that measurement was **declined as unanswerable rather than skipped for cost**, and one batch-level control replaces it. A mixed batch is two batches, and the form says so.
- **The magnitude is classified and the sign applied at submit**, so changing the direction re-signs every row without re-reading a single image.

### What makes it safe at all, and what it does not change

- **Identity never comes from OCR**: the bank and reference are re-derived server-side from the QR payload under its own CRC (`lib/slips.ts`), so bulk upload cannot misidentify a record.
- **Re-capture is a no-op** (migration 011), so an interrupted batch is re-run over the whole folder. The browser suite proves this through the form with a different amount on the second pass, so a silent overwrite would be visible in the stored figure.
- **No new server surface.** The production build still emits **eighteen** `/api/v1/` routes: the batch reuses `POST /api/v1/ocr/read` and `POST /api/v1/slips`. Nothing new was owed a security review.
- **One read and one write at a time**, deliberately: an unbounded burst at a metered third party, and a queue of captures contending for one owner's advisory lock, are both worse than a slower pass. A batch is capped at **50 files** for the same reason — a mistaken drop of a camera roll should cost a sentence, not a bill.
- Counterparty and category are not captured in bulk. Neither is readable from a slip, and both are correctable afterwards (migration 013).

### Two defects found on the way, one of them by the browser test

- **`app/slip-capture.tsx` dated a slip in UTC**, `new Date().toISOString().slice(0, 10)`, so between midnight and 07:00 Bangkok it named *yesterday*. **D-110 fixed exactly this in the cash and card forms and missed the slip form.** Now `bangkokToday()`. The browser spec asserting that fallback was deriving its expectation the same wrong way, so it moved with the code — it would otherwise have failed for seven hours a day and read as a broken fallback rather than a stale expectation.
- **A `FileList` is live, not a snapshot.** The batch handler cleared previous state first, and `clear()` sets `input.value = ""`, which **empties the `FileList` the handler is still reading**. Every chosen slip vanished and the form went on saying "Choose slip images…" — no error anywhere. Caught by the browser spec on its first run, not by any unit test, because it only exists once a real input holds real files.
- A third was found in the guard rather than the code: the privacy assertion pinning the amount fill anchored on a trailing newline, and an injected second fill one line later passed straight through it. This is the `GOTCHAS.md` trap about a source-grep test passing over code that has moved out from under it, **hit while writing the test meant to prevent it**. It now compares the set of every `plainThb` call.
- Evidence: `tests/slip-batch.test.ts` (16 tests over the date order, the disagreement refusal, the two-digit-year refusal, the window re-check, the amount grammar and the sign rule, with no browser and no engine), two `tests/e2e/owner-session.spec.ts` specs, and two new assertions in `tests/privacy.test.ts` — both **red-proved**, one by making the policy date a slip today and one by adding a second amount fill. The reader-client privacy check now **walks `app/` for `readImageWords(`** instead of naming two files, so a third reader form is covered the moment it is written. Vitest **621 passed / 7 skipped across 31 files**, Playwright owner **31/31** and isolated **18/18**, production build clean at eighteen `/api/v1/` routes, `pnpm check:docs --strict` at 134 decisions and 132 traps, tsc and ESLint clean. **pgTAP not re-run and deliberately so**: no SQL moved. D-059 (which references carry a date), D-086 (the printed-date reader), D-031 (why a two-digit year is refused), D-110 (the UTC date fixed twice before), D-129 (the strict-grammar rule this inherits).

## D-136 — The palette becomes warm and the phone gets measured, which found two contrast failures no light-mode look would reveal

- Date: 2026-08-21
- Status: **Accepted and done**, on the owner's choice of palette. Styling and a throwaway harness only — no application logic, no SQL, no route, no contract.
- What changed: `app/globals.css` alone. **No `.tsx` reads a custom property**, which is what made a whole-app retheme a single-file edit and is worth knowing before anyone proposes a theming abstraction.

### The palette, and the one problem it creates

Olive Leaf `#606C38`, Black Forest `#283618`, Cornsilk `#FEFAE0`, Light Caramel `#DDA15E`, Copper `#BC6C25`.

**It is entirely warm, and the old palette got its state separation for free from blue-versus-amber.** That separation has to be manufactured here: action is copper, verified is olive, provisional is caramel, and `--red` is pushed deliberately toward crimson so an error is not read as a link. In dark mode the two nearest — action and provisional — are pulled further apart than in light, because on a dark ground both otherwise collapse into one warm tan. **What makes near-neighbour hues tolerable rather than a defect is that colour was never the only carrier**: every one of those states also says what it is in words (D-123), and that rule is what this palette spends.

**Contrast was computed, not eyeballed**, and two palette values were darkened until they cleared AA: `--muted` 5.9:1 and `--blue` 5.3:1 against `--paper`, `--red` 7.1:1, `--celadon-ink` on `--celadon` 6.3:1. Both browser suites' axe checks pass unchanged.

### Two failures the retheme surfaced that predate it

Neither is caused by the new palette; both were found by having to reason about every filled surface at once.

- **`.skip-link` and `.brand-mark` were `color: white` over `background: var(--navy)`.** In dark mode `--navy` *is* the light colour, so both were white-on-cream — invisible. They take `var(--paper)` now, which is correct in both directions by construction rather than by two hardcoded values kept in step.
- **`.stage-nav li.active span` and `.secondary-button:hover` are filled with `--blue` and inked white.** `.primary-button` already had a dark-mode override flipping that ink and **the other two did not** — white on the brightened action colour is 2.5:1, a clear failure. All three share the override now. **No amount of looking at this file in light mode would have shown either**, which is the general point: a token that inverts between schemes makes every hardcoded partner a latent failure in exactly one of them.

### The phone measurement (PLAN task 28)

**The committed owner config is desktop-only**, so every signed-in surface had never been rendered at phone width by anything. `.runtime/mobile-audit.spec.ts` signs in, walks the four routes at 390 CSS px, screenshots each, and reports elements wider than the viewport and controls under 44×44.

**Nothing was broken.** No route pans sideways, and the single over-wide element is inside its own scroll container by design. What was wrong was legibility: a `12vw` heading floor rendering at **47px**, the first control on `/ledger` roughly **1,200px down** an 844px viewport, **every nav link 36px tall**, and the active-route marker rendering as a detached rounded box because an inset `box-shadow` is clipped by the link's own `border-radius`. All four are fixed; `/ledger` is ~13% shorter and every control clears 44px.

**What the audit still cannot see, stated so it is not mistaken for coverage**: it signs in but loads no data, because nothing in this app loads until asked. So the ledger table, the captured-slips list and the batch worklist have **still never been seen at phone width with rows in them** — and the table is the surface most likely to read badly. That is the remainder of task 28, not a thing this entry closed.

- Evidence: `app/globals.css`; `.runtime/mobile-audit.spec.ts` and its config, gitignored and throwaway; before-and-after screenshots at 390px. Playwright isolated **18/18** and owner **31/31**, both carrying the axe checks that hold this file to AA; Vitest **621 passed / 7 skipped across 31 files**, tsc and ESLint clean. D-123 (colour is never the only carrier), D-124 (the reduced-motion rule this file already honours).

## D-137 — Cornsilk becomes the ground and the dark scheme is dropped, so the app declares one set of colours and measures only those

- Date: 2026-08-21
- Status: **Accepted and done**, on the owner's instruction, hours after D-136. **Amends D-136 rather than reversing it** — the palette and the phone measurement stand; what changes is which colour is the ground and whether a second scheme exists.
- What changed: `app/globals.css` and `app/layout.tsx`.

### Cornsilk is the ground, not a card colour

D-136 put `#FEFAE0` on the raised surfaces and a duller `#f1ecd4` under them, so the colour a reader actually saw most of was the duller one and the palette's own cornsilk was a highlight. The owner's instruction was that `#FEFAE0` **is** the background. The ladder is now `--mist: #fefae0` → `--paper: #fffdf0` → `--paper-strong: #fffffa`, lifting toward a **warm** white rather than a pure one, which keeps the depth without introducing the one cold value in the file.

**The contrast figures in D-136 were computed against `--paper` and still hold**, because everything above the ground is now lighter than the ground. They are a floor rather than an average, and that is stated in the file so the next person does not re-derive it.

### The dark scheme is dropped, and that is a decision

The owner's reasoning: cornsilk is warm enough to read against for long stretches, so a dark scheme is not buying what a dark scheme is for. Recorded with his own qualifier — *"but we'll see"* — so this is a position taken and reversible, not a conclusion.

**What it costs, stated rather than glossed:** a reader on a dark-OS phone at night now gets a bright page. Nobody has tried that, and the qualifier is why it is worth trying before this is treated as settled.

**What it buys is the part worth keeping.** A second scheme is a second complete set of contrast facts, and **nothing here measures them**: both browser suites' axe checks run in the default scheme only, which is exactly why the two failures D-136 found had survived. Declaring one scheme means the colours that ship are the colours that were measured.

**`color-scheme: light` is what makes the decision real.** Without it a date picker and a select dropdown render dark on a dark-OS device against a cream page — the native controls follow the OS, not the stylesheet, unless told otherwise. This is the whole substance of dropping a scheme properly rather than deleting a media block.

**The `GOTCHAS.md` trap about tokens that invert between schemes is deliberately kept although its subject is gone.** Retirement is for a trap whose subject no longer exists, and the *pairings* still exist — `background: var(--…)` beside a literal colour is still all over this file and will fail again the moment a dark block returns. The palette comment points at it for exactly that reader.

### A colour no screenshot could have caught

**`app/layout.tsx` still declared `themeColor: "#eaf0f4"`** — the pre-retheme blue-grey — for a full day after the palette changed, including across two deployments. It tints the browser's own chrome around the page on a phone, so it renders as a band in the wrong colour above the app and is invisible to a headless audit, which never draws chrome. It is `#fefae0` now, and the file says it must equal `--mist`. **And the sweep that finding prescribes immediately found three more**: the PWA manifest carried the old blue-grey as both `background_color` and `theme_color` — the installed-app splash and chrome, which matter here because share-to-app is why this app is installable at all — and `public/icon.svg` was still a navy plate with blue-grey rules, which is the app icon and the favicon. Four stale colours in total, none reachable by any suite, type-check or screenshot. **The general shape is worth carrying: a colour declared outside the stylesheet does not move when the stylesheet does**, and nothing in this repo's gate looks at it.

- Evidence: `app/globals.css`, `app/layout.tsx`, `public/manifest.webmanifest`, `public/icon.svg`. Playwright isolated **18/18** and owner **31/31**, both carrying the axe checks; `.runtime/mobile-audit.spec.ts` re-run at 390px with every control still clearing 44px and no route panning sideways; tsc and ESLint clean. D-136 (the palette and the phone measurement this amends), D-123 (colour is never the only carrier).

## D-138 — The ledger table escaped the viewport on a real phone, because an element selector cannot reset a class and an audit cannot measure a table that was never rendered

- Date: 2026-08-21
- Status: **Accepted and fixed.** Found by the owner on his own device, minutes after the deployment that D-137 shipped. Styling and a harness only — no application logic, no SQL, no contract.
- What changed: `app/globals.css` (two rules), and `.runtime/mobile-audit.spec.ts` rewritten so it could have found this.

### The defect

`.ledger-table` sets `min-width: 1160px` and `.ledger-table.merged` sets `1280px`. The phone block reset it with `table, tbody { display: block; min-width: 0; }` — and **`table` is an element selector at specificity 0,0,1 while `.ledger-table` is a class at 0,1,0**, so the reset lost and the table stayed 1280px wide. Directly above it, `.table-scroll { overflow: visible; }` removes the horizontal scroll container that holds this table in on desktop, so the width had nothing to scroll inside and escaped to the document. A real phone rendered the whole page zoomed to roughly a third to fit 1296px of scrollable width into 390px of screen.

**A second, independent overflow sat behind it** and was only visible once the first was fixed: `.ledger-controls` used `grid-template-columns: 1fr 1fr`, and **`1fr` is `minmax(auto, 1fr)` whose floor is min-content, not zero**. A select whose longest option is an account label will not shrink, so the grid sized itself to its contents — 591px inside a 358px `main`. `minmax(0, 1fr)` is the fix, and the tracks are now written the long way so the floor is explicit.

### Why nothing caught it, which is the part worth keeping

**The audit written for D-136 signed in and looked, and reported four clean routes.** It was not lying: nothing in this app loads until asked, so the ledger table was **absent** rather than narrow, and *a `min-width` rule with no element to apply to cannot be measured wrong*. The measurement was honest about a page that did not contain the thing being measured — which is a worse failure than a wrong number, because it reads as coverage.

D-136 stated this gap explicitly in its own entry and in `PLAN.md` task 28: "the ledger table has still never been seen at phone width with rows in them". **Naming a gap is not closing one**, and the interval between naming it and the owner hitting it was under a day.

**The audit now seeds rows and asserts the table is really on the page** before it believes anything it measures about it — `expect(page.locator("table")).toHaveCount(1)`, so a future run cannot pass by finding nothing. Seeding needs `session_replication_role = replica`, because `source_transactions` is append-only and refuses DELETE; the components carry `position` in `{1,2}` and the fingerprint must be 64 hex characters. All seeded values are invented.

**Red-proved**: the rewritten audit was run against the shipped CSS and reported `pans sideways: true, scrollWidth 1296 vs 390` with `table.ledger-table.merged [16..1296]` named directly, then against the fix and reported 390 on every route.

- Evidence: `app/globals.css`, `.runtime/mobile-audit.spec.ts`. Playwright isolated **18/18** and owner **31/31**; the audit clean at 390px on all four routes with six seeded rows loaded, every control ≥44px. The one remaining reported overflow is `.stage-nav ol` inside its own `overflow-x: auto`, which is deliberate and does not pan the document. D-136 (the audit this repairs), D-137 (the deployment this followed).
