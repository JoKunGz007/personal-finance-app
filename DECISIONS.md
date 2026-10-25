# Private Ledger decision log

Last reviewed: 2026-08-09

Entries are append-only. A superseding decision must reference the earlier entry rather than rewriting its history.

This file holds **D-141**, **D-158** and **D-302 … D-310**. D-141 and D-158 were the two open questions; both are answered (D-288, D-289), and none is open now. The index below covers every file, so any entry can be found without opening a body; `scripts/check-docs.mjs` pools this file with every archive and checks ids for duplicates and omissions.

**Size rule:** budgeted in bytes, not lines (`scripts/check-docs.mjs`). When the budget is reached, move a settled range unchanged into `docs/decisions/` (D-080), with the boundary where an argument ends rather than where a number is round.

| Range | File | Moved |
|---|---|---|
| D-001 … D-059 | [`ARCHIVE-D-001-D-059.md`](docs/decisions/ARCHIVE-D-001-D-059.md) | 2026-08-09 |
| D-060 … D-113 | [`ARCHIVE-D-060-D-113.md`](docs/decisions/ARCHIVE-D-060-D-113.md) | 2026-08-18 |
| D-114 … D-119 | [`ARCHIVE-D-114-D-119.md`](docs/decisions/ARCHIVE-D-114-D-119.md) | 2026-08-19 |
| D-120 … D-129 | [`ARCHIVE-D-120-D-129.md`](docs/decisions/ARCHIVE-D-120-D-129.md) | 2026-08-23 |
| D-130 … D-133 | [`ARCHIVE-D-130-D-133.md`](docs/decisions/ARCHIVE-D-130-D-133.md) | 2026-08-24 |
| D-134 … D-140 | [`ARCHIVE-D-134-D-140.md`](docs/decisions/ARCHIVE-D-134-D-140.md) | 2026-08-25 |
| D-142 … D-152 | [`ARCHIVE-D-142-D-152.md`](docs/decisions/ARCHIVE-D-142-D-152.md) | 2026-08-26 |
| D-154 … D-156 | [`ARCHIVE-D-154-D-156.md`](docs/decisions/ARCHIVE-D-154-D-156.md) | 2026-08-27 |
| D-157 … D-163 without D-158, D-161 | [`ARCHIVE-D-157-D-163.md`](docs/decisions/ARCHIVE-D-157-D-163.md) | 2026-08-27 |
| D-153, D-164 … D-168 | [`ARCHIVE-D-153-D-168.md`](docs/decisions/ARCHIVE-D-153-D-168.md) | 2026-08-29 |
| D-161, D-169, D-170 | [`ARCHIVE-D-161-D-170.md`](docs/decisions/ARCHIVE-D-161-D-170.md) | 2026-09-01 |
| D-171 … D-176 | [`ARCHIVE-D-171-D-176.md`](docs/decisions/ARCHIVE-D-171-D-176.md) | 2026-09-01 |
| D-177 … D-197 | [`ARCHIVE-D-177-D-197.md`](docs/decisions/ARCHIVE-D-177-D-197.md) | 2026-09-04, completed to D-186 2026-09-13, extended to D-197 2026-09-16 |
| D-198 … D-211 | [`ARCHIVE-D-198-D-211.md`](docs/decisions/ARCHIVE-D-198-D-211.md) | 2026-09-23 |
| D-212 … D-222 | [`ARCHIVE-D-212-D-222.md`](docs/decisions/ARCHIVE-D-212-D-222.md) | 2026-09-25 |
| D-223 … D-234 | [`ARCHIVE-D-223-D-234.md`](docs/decisions/ARCHIVE-D-223-D-234.md) | 2026-10-03 |
| D-235 … D-244 | [`ARCHIVE-D-235-D-244.md`](docs/decisions/ARCHIVE-D-235-D-244.md) | 2026-10-07 |
| D-245 … D-258 | [`ARCHIVE-D-245-D-258.md`](docs/decisions/ARCHIVE-D-245-D-258.md) | 2026-10-11 |
| D-259 … D-272 | [`ARCHIVE-D-259-D-272.md`](docs/decisions/ARCHIVE-D-259-D-272.md) | 2026-10-17 |
| D-273 … D-287 | [`ARCHIVE-D-273-D-287.md`](docs/decisions/ARCHIVE-D-273-D-287.md) | 2026-10-23 |
| D-288 … D-301 | [`ARCHIVE-D-288-D-301.md`](docs/decisions/ARCHIVE-D-288-D-301.md) | 2026-10-24 |

The longer header these lines replace is in [`docs/archive/DOC-HEADERS-2026-10-17.md`](docs/archive/DOC-HEADERS-2026-10-17.md), unchanged.

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

### Archived 
—
 `docs/decisions/ARCHIVE-D-120-D-129.md`

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

### Archived 
—
 `docs/decisions/ARCHIVE-D-130-D-133.md`

- **D-130** — The continuity size guard measured lines while the files grew sideways, and reported green at 332 KB
- **D-131** — The handoff and the plan were append-only by habit, and both had gone self-contradictory
- **D-132** — The ledger view's markup became seven files, and the derivation pipeline deliberately did not move
- **D-133** — Both continuity budgets were acted on rather than raised, and the archive boundary excluded every open question

### Archived 
—
 `docs/decisions/ARCHIVE-D-134-D-140.md`

- **D-134** — The traps budget is raised to 260 KB on the lookup-file argument, with the next breach owed a split rather than a third raise
- **D-135** — Bulk slip upload files a slip unseen only when its date is exact, and the printed-date reader that made that possible had shipped uncalled
- **D-136** — The palette becomes warm and the phone gets measured, which found two contrast failures no light-mode look would reveal
- **D-137** — Cornsilk becomes the ground and the dark scheme is dropped, so the app declares one set of colours and measures only those
- **D-138** — The ledger table escaped the viewport on a real phone, because an element selector cannot reset a class and an audit cannot measure a table that was never rendered
- **D-139** — "Where did that card go" is answered in the result banner rather than under the form, because a one-time question must not buy permanent vertical space
- **D-140** — The fourth archive boundary moves the whole Cloud Vision arc, because a shipped feature closed the question the third boundary was blocked on

### Archived
—
 `docs/decisions/ARCHIVE-D-223-D-234.md`

- **D-223** — LINE MAN orders are read from order-page screenshots, match on what was charged, keep their own facts in a new table, and propose no automatic match until measured
- **D-224** — A ไทยช่วยไทย order shows its real cost, 40% of the wallet-paid food plus the fee, and is not linked to the wallet payment
- **D-225** — Delivery statistics are computed in SQL on `/deliveries` at each order's real cost, and never added to a ledger total
- **D-226** — The co-payment real cost uses the year's rate and a ฿200 daily cap, checked against the owner's เป๋าตัง history
- **D-227** — The seventeenth boundary moves D-212 … D-222 on the owner's word
- **D-228** — A fourth /ux-review over every page: shorter notes and labels, /deliveries lists capped at 20, and /import fitting a 1024px laptop
- **D-229** — A Grab ride paid in two parts matches both rows, and an unnamed KBANK card spend counts as Grab's
- **D-230** — The three older candidate reads return one JSON array, Sync captures in batches, and `/deliveries` becomes `/orders`
- **D-231** — A fifth /ux-review: the header chip claims only what is true, ride totals get a heading, and /import drops developer wording
- **D-232** — 7-Eleven e-tax invoices are read from the statement mailbox, on the server, by a Sync on /receipts
- **D-233** — The Claude session works as an orchestrator: a read-only investigator joins the subagents, and every delegation is kept short
- **D-234** — Plain table reads ask for an exact count and refuse when the 1,000-row cap cuts them
### Archived 
—
 `docs/decisions/ARCHIVE-D-259-D-272.md`

- **D-259** — A refused slip amount is read again from an enlarged crop (2×, then 3×) under the same grammar; a verdict a retry could change is not remembered, and a capture the server refused is
- **D-260** — A statement that overlaps the ledger is imported (its new rows) with a count of new and already-stored rows, instead of being held; Review on Import is a button
- **D-261** — A queued slip that needs checking has "Add on Slips": `/slips?inbox=<name>` loads it into the single-slip form and removes it from the queue once the ledger stores it
- **D-262** — A printed date line may end in a stray mark (`>` read off a Krungthai background); the end-anchored date pattern had reported no date, so the year re-read never ran
- **D-263** — The Inbox is the way in: Import and Slips leave the main nav as Inbox fallbacks, and the `/slips` backlog upload is removed
- **D-264** — Shopee orders come from the web order-detail page saved as PDF, not from mail; D-158's unbounded candidate scan stays until it is slow
- **D-265** — `confirm_import` links a re-printed bank row by its identity facts instead of inserting a duplicate (migration 054); the four duplicates already stored are Excluded; D-260's safety claim holds one way only
- **D-266** — Shopee orders come from a one-click export of the web order pages (a bookmarklet writing JSON), not a printed PDF (amends D-264); order code and link number stored, never the recipient's name, address or phone; import from the ledger's start
- **D-267** — The twentieth boundary moves D-245 … D-258 on the owner's word
- **D-268** — `HANDOFF.md` is retired into the files that own its facts (supersedes D-052)
- **D-269** — `AGENTS.md` is folded into `CLAUDE.md`; Codex is no longer used
- **D-270** — Shopee import design: own tables, JSON dropped on the Inbox, orders fixed at payment, automatic match only when unique, proposed links for combined checkout, wallet top-ups and SPayLater repayments; a tab on `/orders`
- **D-271** — Shopee import built (task 62 steps 2–6); D-270's wallet top-up count corrected
- **D-272** — Migration 058: `shopee_ledger_rows()` reads each source once; 056 timed out as the owner on hosted
### Current 
—
 this file

- **D-141** — Bulk statement import splits at the authentication boundary: many PDFs read in one pass, each bound and confirmed by hand
### Archived 
—
 `docs/decisions/ARCHIVE-D-142-D-152.md`

- **D-142** — The bulk slip form threw away work it had already done, and could not be told to try again
- **D-143** — A third button rank, because "quiet" had been spelled as "unstyled"
- **D-144** — Auto-import v1 is a local fetcher, and binding becomes automatic where the account is unambiguous
- **D-145** — The hosted Sync button proxies ciphertext, and it is a caller of the mail seam rather than a second one
- **D-146** — The fifth archive boundary is shallow on purpose, because two open questions sit immediately behind it
- **D-147** — Binding announces itself where the owner is looking, because the scroll fix was keyed on a stage auto-binding skips
- **D-148** — The client tier gets its first seam, because every route call had been open-coding the same five steps and had already diverged
- **D-149** — The owner closed the two questions the fifth boundary was stuck behind, so the traps split and the sixth boundary went seven entries deep
- **D-150** — The announce-and-scroll becomes one module and the worklist becomes one value, so two classes of defect stop being representable
- **D-151** — The list of state a discarded statement clears is no longer trusted, because a list is exactly what went stale twice
- **D-152** — The card form's decisions become a tested module, and this time the tests were written before the component moved

### Archived 
—
 `docs/decisions/ARCHIVE-D-153-D-168.md`

- **D-153** — The typeface is a per-device preference in a cookie, because a font is a fact about the screen and not about the ledger
### Archived 
—
 `docs/decisions/ARCHIVE-D-154-D-156.md`

- **D-154** — The seventh archive boundary steps over an open question instead of stopping short of it, and the maintained file now has a gap
- **D-155** — The ledger loads on arrival, and what bounds the payload is the width of a row rather than a page of them
- **D-156** — Standing copy folds behind an `(i)`; a warning about an irreversible write does not, and moves closer to the control

### Archived 
—
 `docs/decisions/ARCHIVE-D-157-D-163.md`

- **D-157** — The pixel faces get a measured `size-adjust`, every route opens with a title, and the standing copy folds the rest of the way
### Current 
—
 this file

- **D-158** — The ledger pages, and reconciliation keeps its rule: a candidate set narrows the input instead of a second engine deciding the answer
### Archived 
—
 `docs/decisions/ARCHIVE-D-157-D-163.md`

- **D-159** — The combined balance is computed once in SQL, because a per-account window cannot see another account's history
- **D-160** — Statistics compute in SQL, and division never produces money: a ratio is not a figure the ledger keeps
### Archived 
—
 `docs/decisions/ARCHIVE-D-161-D-170.md`

- **D-161** — The statistics surface is built, and every real defect in it was found by rendering it or by review, never by the gate
### Archived 
—
 `docs/decisions/ARCHIVE-D-157-D-163.md`

- **D-162** — A partial period is not comparable to a whole one, and the first look at the real ledger is what said so
- **D-163** — Money carries its direction as colour and never renders in a pixel face, and phone rows become real cards
### Archived 
—
 `docs/decisions/ARCHIVE-D-153-D-168.md`

- **D-164** — The eighth archive boundary is fenced on both sides, so the shallowest cut is the only honest one
- **D-165** — `include_in_reporting` gets a control, and the erasure it could have caused is made unrepresentable rather than remembered
- **D-166** — The typeface work pinned nothing vertical, because the measurement said every reflow in this app is a width one
- **D-167** — The ninth boundary steps over two open questions at once, and the rate is now the finding
- **D-168** — Five controls reach the tap standard on a phone, and the instrument that should have caught them had been blind since the change that hid its sign-in
### Archived 
—
 `docs/decisions/ARCHIVE-D-161-D-170.md`

- **D-169** — The default face is Pixelify Sans, which closes D-153's question by answering it with a third option
- **D-170** — The statistics window is a control at last, and holding the response beside the window it came from is what makes the page able to say what it is showing
### Archived 
—
 `docs/decisions/ARCHIVE-D-171-D-176.md`

- **D-171** — The tenth boundary moves the question that had fenced the file, and stops below the two changes nobody has looked at
- **D-172** — The window picker's state moves into the address bar, and a preset is written by name while a custom range is written by its dates
- **D-173** — The phone audit stops being a throwaway, and its first committed run found a control that had been escaping the viewport since before the audit existed
- **D-174** — Migration 024: statistics take an account, and the balance series needs two sources because one account's truth is printed and the ledger's is derived
- **D-175** — The production picker's synthetic accounts were not a seed leak, and the hypothesis that said so survived two sessions until one value-free query killed it
- **D-176** — Migration 024 reaches hosted, and the claim that an agent could not push it was wrong
### Archived 
—
 `docs/decisions/ARCHIVE-D-177-D-197.md`

- **D-177** — Task 46's account filter gets its control, reviewed and reused between `/ledger` and `/statistics`, closing D-161 for good
- **D-178** — The ledger's own date filter, and why it cannot be a client-side filter like every control beside it
- **D-179** — The calendar heatmap, PLAN task 47's deferred second half: two ramps not one, sparse not dense, and migration 025
- **D-180** — Four colour schemes, reversing D-137, and a test that retires the argument against them
- **D-181** — D-180 deploys, and the dark schemes are confirmed against the real ledger
- **D-182** — The ledger reads a day at a time, the strip carries a balance, and the control row stops sizing one row's tracks for another
- **D-183** — The calendar reads a year at a time, three across, and every month answers for its own days
- **D-184** — D-182 and D-183 deploy, and both are confirmed against the real ledger
- **D-185** — D-182's day heading declared a band and a rule that both painted nothing, and the fix makes 2px load-bearing
- **D-186** — The day heading sticks, and the reason it could not was the horizontal scroller rather than the heading
- **D-187** — The phone's day heading kept a desktop column's width, and the audit's question had no vertical half
- **D-188** — A fixture with one row a day was not a ledger, and fixing that failed the audit on a second page
- **D-189** — A repeat mailbox sync re-offered files it had already fetched, and the honest place to record that turned out to be the confirmation, not the download
- **D-190** — PLAN task 25's manual half ships: category CRUD and a per-transaction category/note editor, built on an overlay layer that had carried the columns since migration 001 with no caller
- **D-191** — A row count that looked doubled was a stale test locator counting day-heading rows as data, not a ledger defect — resolved same day, `38ed7d4`
- **D-192** — A quality and architecture audit found the sync reporting an empty mailbox for a truncated scan, and the archived-category carve-out written twice with only one copy right — fixed and deployed as `0573a8a`
- **D-193** — D-192's two recorded-not-built cleanups are built: the ledger's load issues its requests in two waves instead of nine in series, and the row components take one `LedgerActions` prop
- **D-194** — A statement the owner thought Sync had missed was only newer than the sync, and the sync itself is now roughly twice as fast: one IMAP fetch for the listing, three downloads at a time, and step timings on both routes
- **D-195** — "Don't offer this again": the owner can stop Sync re-offering a mailbox PDF the reader refused as not a statement, one file at a time and never automatically
- **D-196** — The stat strip's numbers were still drawn in the pixel face — D-163's rule reached every table amount but missed this one — and the longest field-help on `/import`, `/slips` and `/recovery` is trimmed
- **D-197** — Reading D-196 on the deployed build found three of its own trims running two words together — a JSX whitespace-collapse trap, not a typo — fixed and reconfirmed live
### Archived 
—
 `docs/decisions/ARCHIVE-D-198-D-211.md`

- **D-198** — The fifteenth boundary is taken on the owner's word rather than an argument closing, and this file returns to holding nothing but its two open questions
- **D-199** — D-196's real scope was every pixelated figure on `/ledger`, not just the stat strip: the day heading, the row timestamp and the account label all still switched to the pixel face
- **D-200** — D-199 put whole words in the figures font along with the digits beside them — "Sept", "row(s)", a bank name — and the owner's correction was exact: only a digit run takes `--font-money`, never a word sharing its span
- **D-201** — The all-accounts ledger showed gaps that read as missing transactions: each account pages on its own, and the merged view printed every loaded row below the shallowest account that still had more to fetch
- **D-202** — Digits take the figures font on every page through a digit-only font face rather than markup, and the last long help paragraphs move behind i icons
- **D-203** — The first /ux-review pass: ten findings approved and fixed, led by ledger density on both viewports
- **D-204** — A second /ux-review, run by a subagent as an outsider: thirteen findings fixed, two verified as not needed, and three places D-203 had not gone far enough
- **D-205** — A third /ux-review, run by a subagent as an outsider: all twelve findings fixed, and the phone row-action fold only shrank the card once the toggle stopped taking a grid row of its own
- **D-206** — An `(i)` note opens as a layer over the page, not a block that pushes content down
- **D-207** — Internal transfers between the owner's own accounts are excluded from reporting automatically, and the row actions fold behind "⋯" on every viewport
- **D-208** — 7-Eleven receipts become a domain of their own: a reader, three tables, backup v8, and the coverage tripwire that was missing all along
- **D-209** — Receipt PDFs are captured through the app: read on the device, keyed on the condensed number, and the first end-to-end run on the real pair found three reader defects the tests could not
- **D-210** — Receipt screenshots are read through Vision and stitched on their overlap; all 21 real screenshots read complete, and an OCR reading never overwrites a PDF's
- **D-211** — Migration 029 reached hosted and the owner's 13 real receipts were captured on the live site; D-210 miscounted them as 12
### Archived 
—
 `docs/decisions/ARCHIVE-D-212-D-222.md`

- **D-212** — Receipts match the ledger on a measured two-hour window, the owner's decision wins, and backup moves to v9
- **D-213** — The sixteenth boundary moves D-198 … D-211 on the owner's word, and this file again holds its two open questions, the newest entry and the boundary's own record
- **D-214** — Receipt statistics are computed in SQL on `/receipts`, never added to a ledger total, and item figures trust only complete item lists
- **D-215** — Receipts read by colour for meaning, and their amounts stay in ink because green and red already mean money in and out
- **D-216** — A matched ledger row shows its receipt, computed at read time from the receipts route
- **D-217** — The `/receipts` UX review's three recommended fixes: desktop fit, 44px receipt fold, load on arrival
- **D-218** — Food delivery orders get their own page, GrabFood is read from email and LINE MAN from its order page
- **D-219** — GrabFood orders are read on the server from the statement mailbox, measured on every real receipt before commit, and stored append-only at backup v10
- **D-220** — GrabFood orders match ledger rows on a measured two-hour window before the e-receipt, and backup moves to v11
- **D-221** — A matched ledger row shows its GrabFood order, and the receipt and delivery match routes share one handler
- **D-222** — Grab rides are read, stored with their places, and matched around the pickup; one ledger row is never claimed by both an order and a ride, and backup moves to v12
### Archived 
—
 `docs/decisions/ARCHIVE-D-235-D-244.md`

- **D-235** — An Inbox page gathers every import: one "Sync all mail" now, a queue of dropped files next, processed when the page is opened, with no LLM
- **D-236** — The Inbox imports slips with one money in/out answer per batch, ties same-address LINE MAN pages by the phone's clock, and names a Vision refusal's status number
- **D-237** — Statements dropped on /inbox are opened on the server with stored passwords and confirmed automatically when clean
- **D-238** — Review fixes for the server statement path, a server masked dump, empty statements flagged, and KBANK's Thai print
- **D-239** — The eighteenth boundary moves D-223 … D-234 on the owner's word
- **D-240** — `/import` warns before Confirm when a statement's rows are already in the ledger
- **D-241** — The LINE bot stores images through a secret-gated holding table, not a service-role key; images only; replies with a count and a link
- **D-242** — D-241's three known limits fixed, and a sixth /ux-review fix loop
- **D-243** — Phone nav as one swipeable row with Cash folded (option E, revisits D-226); no-time receipts match a lone TRUE MONEY row (amends D-212); renamed ride types grouped
- **D-244** — Task 25's category set: 18 flat categories created on hosted through `mutate_category`, no subcategories yet; a read-only export feeds local-llm's measurement
### Archived 
—
 `docs/decisions/ARCHIVE-D-245-D-258.md`

- **D-245** — D-090 built: category provenance and reviews as append-only tables, one-level subcategories, and machine categories applied on their own when the ledger opens; backup v14
- **D-246** — The 15 unmatched Grab charges traced to services the reader skips (Dine Out, GrabMart, GrabExpress, late-delivery mails), refunds and voucher packages; a reader for those comes next; TRUE MONEY rows get no rule
- **D-247** — Grab Dine Out, GrabMart, GrabExpress and late-delivery mails are read and stored as orders with a `service` column (migration 049); statistics count food only
- **D-248** — Libron, an OFL book serif, joins the typeface picker and becomes the default; vendored in `app/fonts/libron/`, figures stay in Plex Mono
- **D-249** — Keyword rules round 2: 11 merchant rules, Transport › Fuel, and TrueMoney charges called top-ups only at round top-up amounts; amount-split descriptions never key history
- **D-250** — A two-digit printed slip year is completed when exactly one candidate across both eras fits the slip window
- **D-251** — The nineteenth boundary moves D-235 … D-244 on the owner's word
- **D-252** — Inbox slips are always money out and are captured without a question; the payee and memo read off a slip are stored with it; remembered Inbox verdicts expire with the build
- **D-253** — Slip payee read from Vision's own space flags, after K PLUS's first masked account, without SCB's icon; a re-sent duplicate fills a blank payee or memo through the correction overlay
- **D-254** — The Inbox queue is a table by default with a Cards view one tap away, both showing previews of queued images that enlarge on a tap; Review is a button like Remove
- **D-255** — Slip backfill through LINE: SCB payee icons stripped per spaced word, the Inbox reads 3 files at once, the LINE cap raised to 600 a day (migration 050); slip payees found to add little to categorising
- **D-256** — Krungthai slip payee read by layout (a transfer's wrapped name under `ไปยัง`, a bill payment's biller after the sender's masked account, logo dropped); a doubled date hyphen reads; a kept measurement script
- **D-257** — Vision reads Krungthai's printed 6 as 5: a doubtful year is refused, and a year the window refuses is read again from an enlarged crop
- **D-258** — A slip with no readable QR imports on its printed reference (Krungthai and SCB; migration 052), guarded against duplicates on bank, date, time and amount; Krungthai payee skips a one-letter logo line
### Archived 
—
 `docs/decisions/ARCHIVE-D-273-D-287.md`

- **D-273** — A `Direct Debit` naming ShopeePay is a bank debit, not a SPayLater repayment (task 63; corrects D-270)
- **D-274** — The Shopee matcher proposes no row the owner Excluded (task 64); an owner match or link on one is kept
- **D-275** — "Payment to Shopee" rows are PromptPay QR order payments: `other`-kind orders match like bank debits; no SPayLater repayment wording is known yet (supersedes D-273's repayment rule)
- **D-276** — A SPayLater repayment is a leftover ShopeePay outflow on day 7–13 of the month; candidate orders reach back 366 days (supersedes D-270/D-275's repayment wording and 10–60 day window)
- **D-277** — Two of D-271's leftover findings fixed: matches read only the Shopee match state, and an unknown refund destination is refused instead of stored as a bank; three left on purpose
- **D-278** — Haiku trial for settled UI-only changes via a new `finance-ui-implementer`; money, data and server code stay on Sonnet `finance-implementer`
- **D-279** — UX review 2026-10-11 closed: 23 of 25 fixed (two reduced), 2 declined (desktop calendar cells stay 38px wide; "Use synthetic statement" stays per D-204)
- **D-280** — Inbox/mailbox statement counts read back what `confirm_import` linked (task 60): a re-printed overlapping statement reports its linked rows, an all-linked batch reports duplicate; no migration
- **D-281** — Owner's 2026-10-17 visual asks: no divider under Cash payments on `/ledger`; Grab and LINE MAN chips in brand green on `/orders`; a "Libron (book figures)" typeface choice to trial Libron digits
- **D-282** — D-277's bank-refund rule checked against the real export and widened: one mask character then four or more digits is also a masked account number
- **D-283** — D-280's leftover fixed: a read-only `count_existing_import_rows` (migration 059) shares `confirm_import`'s linking rule, so an all-linked re-printed statement records no import batch
- **D-284** — `/statistics` sections collapse, the spending calendar shows newest month first with a toggle, the header line no longer touches `/statistics` and `/orders` content, and "Libron (book figures)" now reaches amounts
- **D-285** — Receipt discounts keep their printed names; a receipt's completeness and checks change only when its items are replaced (migration 060); stored receipts get names by an equal-rank re-capture
- **D-286** — The twenty-first boundary moves D-259 … D-272 on the owner's word
- **D-287** — `PLAN.md` holds the current state only; finished work moves unchanged to `docs/archive/`, and dead traps retire to their generalisations
### Archived 
—
 `docs/decisions/ARCHIVE-D-288-D-301.md`

- **D-288** — D-141 answered: imported statement mail stays in the mailbox and gets a visible Gmail label `PL Imported` beside the hidden keyword
- **D-289** — D-158 closed: the automatic candidate set is bounded to ±1 day of each slip or card (migration 061); the manual chooser's unbounded set loads only when picking starts
- **D-290** — Task 59: the owner marks a ledger row as a duplicate — Excluded plus an audit marker that only re-including clears (migration 062); marked rows hidden by default
- **D-291** — Server reads retry once on a network error or 5xx (GET/HEAD only); `/statistics` gains Spending by category over the page's own window (migration 063)
- **D-292** — Architecture review (Open item 7): Grab matches decided in one pure module (owner links hold against two-part rides), one device statement reader, every import entry point discards first
- **D-293** — The ledger view's derivation becomes `deriveLedgerView` and its load `loadLedgerSnapshot` (Open item 7 #4–5); supersedes D-132's refusal
- **D-294** — One Grab mail dispatch, `parseGrabMail`, called by Sync and by `scripts/measure-grab-mail.ts` (Open item 7 #7)
- **D-295** — The printed-totals check and the row-failure batching shared by the Krungthai and descriptor-driven readers, `lib/statement-checks.ts` (Open item 7 #8)
- **D-296** — A pick never starts while a correction form is open: both "Choose a statement row" buttons disable on `correcting` (Open item 7 #9)
- **D-297** — Backup versions: a drift test holds `restore_backup`'s version list and table ladder to `lib/backup-contract.ts`; the one-record TS refactor is refused (Open item 7 #11)
- **D-298** — Shopee refund deposits go through `proposeLedgerMatches`, so one inflow is never proposed for two refunds; the other Shopee passes stay their own (Open item 7 #12)
- **D-299** — The ride candidate RPCs' SQL bounds are held to `lib/delivery-match.ts`'s ride minutes and days by a drift test (Open item 7 #15)
- **D-300** — The twenty-second boundary moves D-273 … D-287, because the file passed its byte budget
- **D-301** — Five benches share one list load, `useBenchList`, and only the newest load commits (Open item 7 #14)
### Current 
—
 this file

- **D-310** — The ledger runs the categoriser once per visit, not on every load; imports still run it on the server (supersedes D-245's every-open wording)
- **D-309** — A mailbox statement is fetched and flagged on one IMAP login, the route allows 300 s, and every step and IMAP command is logged by name and milliseconds only
- **D-308** — "From the mailbox" shows Source · Status · Details on desktop and checklist rows on phone, from one grid list (Open item 10)
- **D-307** — The twenty-third boundary moves D-288 … D-301, before D-308, because the file had reached 97% of its budget
- **D-306** — A failed mailbox Sync request logs one value-free line, and the browser names "could not reach the server" apart from "the server answered N" (Open item 9)
- **D-305** — A PGRST303 refusal is resent once for any method, and PostgREST's message is logged for PGRST3xx codes (Open item 1: the 500 recurred under D-303 with a fresh token)
- **D-304** — Large-file pass and leftovers (Open item 8): eleven fixes and test sets; the import-session reducer and the ride-total bigint are refused
- **D-303** — A token about to expire after `getUser()` is refused before any read, and the browser retries a GET once (Open item 1: the intermittent 500 was PGRST303)
- **D-302** — A refused Shopee save reads "Not saved", and the two statistics panels load through `useBenchList` (Open item 7 leftovers)

## D-310 — The ledger runs the categoriser once per visit, not on every load; imports still run it on the server (supersedes D-245's every-open wording)

- Date: 2026-10-25
- Status: **Built and live** (`eb59a01`). On production, opening the ledger and pressing Reload twice made 3 loads and 1 `POST /api/v1/transactions/auto-categorised`.
- **Why.** `finance-investigator` read the path: `autoCategorise` (`lib/server/auto-categorise.ts:185`) reads every transaction, every category, the auto-excluded list and about 17 match-source queries on each run, and writes nothing when nothing changed (no audit event, no sequence bump). The ledger started it on every `load()` (mount, Reload, a cash entry, the sign-in retry and its own reload after a write), about 1.8 s of function time each, nearly always for nothing. It never blocked the screen.
- **Rule.** `categorisedThisVisit` (`app/transactions-view.tsx`) gates the request; a failed request clears it, so the next load retries. A remount (a new visit) runs it again. An import still runs it after `auto_exclude_internal_transfers` (`lib/server/confirm-import.ts`).
- **Cost accepted.** An owner category change, a new match or a deploy that changes the keyword rules is applied on the next visit, not the next Reload; the rows stay uncategorised meanwhile.
- **Refused:** a server-side skip keyed on (`mutation_sequences.sequence`, build id), because it needs a stored marker (a new table kept out of backups) and a missed bump would leave rows silently uncategorised; browser storage, because the privacy guard forbids it on ledger surfaces.
- **Correction to D-245.** D-245 says the auto-exclusion also runs on ledger open. The ledger only reads it (`GET /api/v1/transactions/auto-excluded`); detection runs after an import or a manual POST.
- Evidence: `tests/auto-categorise-wiring.test.ts` asserts the guard and the failure reset (red-proved by removing the guard); full Vitest 2,039 passed / 115 skipped (Docker down).

## D-309 — A mailbox statement is fetched and flagged on one IMAP login, the route allows 300 s, and every step and IMAP command is logged by name and milliseconds only

- Date: 2026-10-25
- Status: **Built and live** (`8f64a42`, `05d8c44`, `d707ae8`; `eb59a01` tried and `8e55702` removed `noDelay`). PLAN Open item 11 holds the measurements.
- **Trigger.** A Sync's `POST /api/v1/imports/mailbox/statement` was killed at `maxDuration` 60 (Vercel 504) and the rest showed as waiting. The statement had been committed; the next Sync answered "already in the ledger".
- **Measured.** A Gmail IMAP login takes about 2 s or 13–18 s. Per command (`imapCommandLogger`): before AUTHENTICATE every step is about 190 ms; from AUTHENTICATE on, every command on that socket is about 195 ms, 0.5–1.3 s, or 3.5–12 s, in runs. Same socket, so the slowness is Gmail's account backend, not the network. The PDF read is 0.1–0.6 s; the categoriser about 1.8 s. `noDelay` on the socket left the 190 ms floor unchanged, so it is server time and was removed.
- **Rules.** `maxDuration = 300` (Fluid compute is on, Hobby allows 300 s). The route keeps the download's login, releases only the INBOX lock through decrypt and confirm, and flags on the same login (`markFetchedOnSession`); it signs in again only when that login has dropped or refused the store. An `error` listener stops an idle connection's timeout from crashing the function. Steps log through `logMailSyncStep` (`lib/server/mail-sync-log.ts`); `imapCommandLogger` keeps only the tag and a verb from a fixed list, never the line.
- **Refused:** a reconnect on a slow AUTHENTICATE (slow draws came in runs, so a second login is likely slow too); a `pdf-read` lap (the privacy guard holds `readStatementPdf` to one hand-off). **Left:** one login for the whole Sync (listing plus every statement), the remaining lever.
- Evidence: `tests/statement-mailbox-session.test.ts` (step timer `onLap`, four `markFetchedOnSession` cases, two `imapCommandLogger` cases incl. no mail words; each red-proved); on production two import-mode calls on a stored statement answered `duplicate`, `flagged: true`, with no `flag-open` step.

## D-308 — "From the mailbox" shows Source · Status · Details on desktop and checklist rows on phone, from one grid list (Open item 10)

- Date: 2026-10-24
- Status: **Built** (UI only: no route, stored value or migration changes). The owner chose the layout on 2026-10-24 from four variants mocked on the production Inbox: C (three columns with a status) on desktop and D (checklist rows) on phone, with D using C's colours.
- **One markup, two layouts.** `SyncTable` (`app/inbox-bench.tsx`) renders `ul.sync-table`. On desktop it is a grid (`max-content max-content 1fr`) with each `li` and its body set to `display: contents`, under a header row hidden from assistive technology. At `max-width: 700px` each row becomes a two-column grid: a mark, then the source and details inline, with further detail lines as blocks below. It is not a `<table>`, because the global table rules (900px floor, fixed cell height, the ≤700px card layout) would all apply to one.
- **Status rule.** `sourceStatus` is a pure function of a source line: waiting, running, done, failed, or check. A finish with an error, a failed source and a statements total with an error are Failed. A held statement, or one left for the device import, is Check. An error outranks a held statement. On phone the status word stays in the accessible tree, visually hidden, and the mark is `aria-hidden`.
- **Colours.** Done uses `color-mix(in srgb, var(--grab) 70%, var(--navy))`, because raw `--grab` is about 2.3:1 on the light paper. Check mixes `--saffron` the same way, Failed uses `--red` and Waiting uses `--muted`. Details stay in the body text colour, and error lines stay red.
- **Review fix.** `/code-review` found that `.cash-bench .status { margin: 0 }` outranked the phone rule that spaces later detail lines, so an error line sat flush on phone. The rule is now scoped under `.sync-table`. Accepted without change: `display: contents` on `li` can drop list semantics in some engines (PLAN prescribed the pattern), and the phone status copies `.sr-only`'s declarations because a class cannot apply per breakpoint.
- Evidence: `tests/inbox-bench.test.ts` adds 3 `sourceStatus` cases (one red-proved by removing the error-first line) and 2 `SyncTable` render cases. The agent checked the shipped component, rendered with the real `app/globals.css` into a static page, in the browser pane at 1200px and at the mobile preset, in the light and `night` themes. Docker was down, so the page was not checked inside the running app.

## D-307 — The twenty-third boundary moves D-288 … D-301, before D-308, because the file had reached 97% of its budget

- Date: 2026-10-24
- Status: **Done.** D-288 … D-301 relocated unchanged to [`docs/decisions/ARCHIVE-D-288-D-301.md`](docs/decisions/ARCHIVE-D-288-D-301.md); their index bullets moved to that file's Archived section. One link target changed, rebased to the archive's folder. Supersedes D-300 as the latest boundary.
- **Why now.** The owner asked for it before the next decision, because `DECISIONS.md` was at 97% of its 120,000-byte budget.
- **Where the argument ends.** D-288 … D-291 are the mail-label, candidate-bound, duplicate-marker and read-retry work; D-292 … D-301 are the whole architecture queue, which D-301 closed (with D-300, the previous boundary, inside it). D-302 onward is the current leftovers and the intermittent-500 work, and it stays. D-141 and D-158 stay again: their answers (D-288, D-289) moved, and the archive index points to both.

## D-306 — A failed mailbox Sync request logs one value-free line, and the browser names "could not reach the server" apart from "the server answered N" (Open item 9)

- Date: 2026-10-24
- Status: **Built and pushed** (the owner asked for both halves). Logging and wording only: what Sync reads, stores and flags is unchanged.
- **Why.** A production Sync run showed Grab "The mailbox could not be read." and the 7-Eleven "could not be opened" message, and nothing was left to diagnose it with. The Sync routes logged nothing on failure. The Grab sentence was the browser's fallback, so it read the same whether nothing answered at all or Vercel answered with a timeout or crash page.
- **Server.** `logMailSyncFailure` (`lib/server/mail-sync-log.ts`) writes `mail sync failed { route, stage, status, code }`. It runs on every answer of 500 or more, and every caught exception, in `deliveries/sync`, `receipts/sync`, `imports/mailbox` and `imports/mailbox/statement`. The stages are `config`, `open`, `read` and `store`. `code` is the error's `code` or `name` only when it is a plain token of up to 40 characters, else null. The message is never logged, because an IMAP reply can quote the account address. Owner-auth refusals, 4xx input answers and a statement's own 404/413 are answers, not faults, and are not logged.
- **Browser.** `describeSyncFailure` (`lib/wire.ts`) words a failed mailbox request. It is used by the Grab and 7-Eleven loops, the statement listing and the per-statement POST.
  - Nothing answered, or a 2xx was not JSON: "The server could not be reached, so the mailbox was not read."
  - A failing status with no reason from the route: "The server answered 504, so …"
  - A route that refused in its own words: shown as is.
  - The callers pass the sentinel `NO_ROUTE_TEXT` as their fallback, so no `ledgerRequest` result shape changed. The per-statement transport sentence no longer says "It will be tried again next time".
- **Agent fix in review.** The helper first lived in `lib/browser/mail-sync.ts`, which `inbox-statement-client.ts` imports and which imports it back. The agent moved it to `lib/wire.ts`, which removed that circular import.
- **Watch.** On the next Sync failure, read the request log status and the `mail sync failed` line: a 504 with no line means a platform timeout, and `open` with a code names the IMAP fault.
- Evidence: `tests/mail-sync-log.test.ts` (7: code sanitiser; route tests for Grab open and read failures and the listing, and that a fake address in a message never reaches the log; a 403 logs nothing) and `tests/describe-sync-failure.test.ts` (6). Red-proved: against the HEAD files, 3 of 7 and 5 of 6 fail. The `receipts/sync` and per-statement routes use the same helper but have no route test of their own. The `pnpm verify` result is recorded in `PLAN.md`.

## D-305 — A PGRST303 refusal is resent once for any method, and PostgREST's message is logged for PGRST3xx codes (Open item 1: the 500 recurred under D-303 with a fresh token)

- Date: 2026-10-24
- Status: **Built and pushed** (`97d846b`; the owner said to proceed with the proposed fix). About a minute after the push, three owner GETs on production answered 200; which deployment served them was not checked. Server fetch and logging only: no route contract, RPC, migration or stored-value change. Supplements D-303 and does not supersede it: D-303's floor stays, but its stated cause is now doubtful.
- **Evidence against D-303's cause.** On production 2026-10-24, with D-303 live, the browser pane's first `GET /api/v1/shopee` after a long idle answered 500. The Vercel runtime log read `PGRST303` on `shopee_monthly_summary` only, and three immediate retries answered 200. That RPC runs in one `Promise.all` with eight paged reads on the same client (`lib/server/shopee.ts:157`), and none of them logged a failure. Every call in a request takes its token from one in-memory session, read in the installed `@supabase/ssr` and `supabase-js` by `finance-investigator` and checked against `shopee.ts` by the agent. So the siblings passed with the same token. After a long idle `getUser()` refreshes successfully: a failed refresh gives a 401, not a 500. So the token had about an hour left and the 30 s floor could not apply. D-303's own incident has the same shape: one label out of several. PGRST303 is PostgREST's code for any JWT claim failure, not only expiry. The real cause is unknown (clock skew on a just-minted token is one guess), because the log held only the code.
- **Fix.**
  - `retryingFetch` (`lib/server/retry-fetch.ts`) sends a request once more when the answer is a 401 whose JSON body has `code: "PGRST303"`. This applies to every method, writes included. PostgREST validates the JWT before it opens a transaction, so that refusal means no SQL ran. The second answer is returned whatever it is: there is never a third send. The GET/HEAD rule for a 5xx or a network failure is unchanged.
  - `authErrorMessage` (`lib/server/row-cap.ts`) adds PostgREST's message, cut to 120 characters, to the `readAll failed` log line. It applies to PGRST3xx codes only, in `readAll` and in the Shopee summary log. Those messages are fixed auth texts that quote no row values. Every other message stays unlogged.
- **Left, on purpose.** A resend after a real expiry fails the same way, which is harmless. A `Request` with a stream body could not be resent; supabase-js sends string bodies.
- **Watch.** On the next 500, the log line now carries the message. "JWT expired" would put D-303's cause back in play; "JWT issued at future" or similar would point to clock skew.
- Evidence: `tests/retry-fetch.test.ts` (+6: a GET and a POST resent once, never a third send, no resend on PGRST301 or a non-JSON 401, no resend after an abort) and `tests/row-cap.test.ts` (+1: the message is logged for PGRST303 and not for `42501`). Red-proved: against the HEAD `retry-fetch.ts`, 4 of the new tests fail. The `pnpm verify` result is recorded in `PLAN.md`.

## D-304 — Large-file pass and leftovers (Open item 8): eleven fixes and test sets; the import-session reducer and the ride-total bigint are refused

- Date: 2026-10-24
- Status: **Built, pushed and live** (`c1369f0`; the owner granted commit and push). On production 2026-10-24, read-only: Shopee and `/ledger` load with no alert. No migration, RPC or stored-value change. One route contract widens (C1).
- **Pass.** `finance-investigator` read the eight 800+ line files two at a time; findings were ranked with Open item 8 (b). Each fix below was built by a subagent and red-proved unless noted.
- **Fixes (A).**
  - A1 `app/notification-card-capture.tsx`: changing the channel empties the typed form, so a card can no longer be submitted on one signal with boxes pre-filled for the other channel.
  - A2 `lib/delivery-grab.ts`: `readAmount` wraps `parseThb`, so a malformed amount is a `MALFORMED_LINE` refusal of that receipt instead of a throw that aborted the whole Grab Sync batch.
  - A3 Dates format with `timeZone: "Asia/Bangkok"`: four formatters in `app/ledger-shared.ts`, two in `app/import-bench.tsx`, `shortDay` in `app/statistics-calendar.tsx` (now exported). See the GOTCHAS trap on `Intl.DateTimeFormat` without `timeZone`.
  - A4 `lib/backup-contract.ts`: delivery, ride, LINE MAN and Shopee money columns restate their SQL sign CHECKs through `nonNegativeMinorUnitStringSchema` / `positiveMinorUnitStringSchema` (new in `lib/money.ts`).
- **Tests only (B).** B1 seven statement-layout refusal and era tests (existing branches, so no red-proof) and a comment fix at `lib/statement-layout.ts:576`; B2 39 backup row-rule tests; B3 Grab refusal tests.
- **Leftovers (C, D).**
  - C1 (D-283 leftover): `POST /api/v1/imports/existing` takes `{ payload }` and returns `{ existing, existingCount }` from `count_existing_import_rows`; the confirm route returns `linkedRows`; the review notice and status line use them (`lib/existing-rows.ts`). No migration: the count RPC already existed. Per-row tags stay exact-fingerprint, so tags can be fewer than the count; the notice says so (`/code-review` fix).
  - C2 `app/import-bench.tsx`: `discardLoadedStatement` bumps `parseRun`, so a slow parse can no longer overwrite a later synthetic or batch statement.
  - C3 `applyReportingChange` (`lib/ledger-view.ts`), used by `app/transactions-view.tsx`; the browser copies matched the server, so no defect.
  - C4 One month-name date matcher, `MONTH_NAME_DATE` in `lib/slip-ocr.ts`, also serves `lib/notification-card-prefill.ts` (the card gains multi-dash and trailing-mark tolerance).
  - C5 `lib/import-review.ts` (`statementTotals`, `movedRowIndexes`, `pageCountOf`) out of the bench.
  - D Render tests for both statistics panels; `removeInboxObject` inlined.
  - Shopee "Not saved" moves to a fixed bottom bar with Dismiss (`.save-toast`): the owner chose variant C of four mocked on the production page.
- **Refused.**
  - The import-session reducer (D-292 candidate 3): with C2 the reset is already one helper, so a reducer adds structure without removing a copy.
  - Ride totals via bigint (`lib/delivery-match.ts:310`): candidates are JS numbers already and the comparison is exact.
  - Hand-written fetches moved onto `ledgerRequest`, and the copied crop/date/total loops: identical, not drifted.
  - Grab `receiptSentAt` `Z` form: nothing slices it.
- **Left open.** An era plausibility bound in `resolveStatementEra`: it needs a clock, and a clock-free bound is a design choice of low value. Card money leading zeros: already fail-closed.
- Evidence: new tests `tests/notification-card-capture.test.tsx`, `tests/bangkok-date-format.test.ts`, `tests/backup-row-rules.test.ts`, `tests/existing-rows.test.ts`, `tests/import-confirm-linked.test.ts`, `tests/import-bench-stale-parse.test.tsx`, `tests/import-review.test.ts`, `tests/delivery-statistics-panel.test.tsx`, `tests/receipt-statistics-panel.test.tsx`, plus additions to the Grab, statement-layout, ledger-view, prefill, slip-ocr, import-route and Shopee bench suites. `/code-review` (high) over the whole diff: 6 findings, 1 fixed (notice vs tags). The `pnpm verify` result is recorded in `PLAN.md`.

## D-303 — A token about to expire after `getUser()` is refused before any read, and the browser retries a GET once (Open item 1: the intermittent 500 was PGRST303)

- Date: 2026-10-24
- Status: **Built, pushed and live** (`1ae6011`; the owner said "go ahead" to the fix). On production 2026-10-24, read-only: Shopee loaded with no alert, and five owner GETs answered 200 with no `Retry-After` on a healthy session. The renewing 503 itself was not provoked on production. Auth path only: no RPC, migration or stored-value change.
- **Cause, from the log.** The owner's Chrome read the Vercel runtime log for the 500 recorded in D-302. The one error line was `readAll failed`, label `shopee_refunds`, code `PGRST303` (PostgREST: JWT expired). It was not a timeout and not a network fault. In the installed auth-js (2.110.8), a session refreshes only when less than 90 s are left. A failed refresh keeps the old still-valid token and caches the failure for 60 s per refresh token, and supabase-js re-reads that session for every PostgREST call. So `strongOwnerClient`'s `getUser()` passed, and a later paged read arrived after `exp`. The agent checked those library lines itself after `finance-investigator` reported them. What made the refresh fail is not known: no auth log was read.
- **Fix.**
  - `strongOwnerClient` (`lib/server/supabase.ts`) calls `getSession()` after `getUser()`. That call makes no network refresh; it reads the state `getUser()` left. If the token has under 30 s left, it answers 503 `SESSION_RENEWING` before any owner check or read.
  - Under 30 s left after `getUser()` only happens when a refresh failed, because a successful refresh leaves about an hour. A session with no readable expiry is not refused here, and the owner checks still decide.
  - `routeError` adds `Retry-After: 1` to that message only. The other 503s mean "not configured" and stay unmarked.
  - `ledgerRequest` (`lib/wire.ts`) retries a GET once on a 503 that carries a `Retry-After` of 1–5 s, by when the browser's own client has normally renewed the cookies. It never retries a write. Nothing has run when this 503 is answered, so the retry is safe.
- **Rejected.** Retrying on PGRST303 after `refreshSession()` on the same client: the 60 s cooldown hands back the cached failure. A Next `proxy.ts` that refreshes first: it would run the same keep-the-old-token logic on every request and touch CSP and headers.
- **Left, on purpose.**
  - A token with 30–90 s left and a failed refresh still goes through. A route that runs longer than that can still reach PGRST303.
  - A local clock that lags the auth container by about an hour would refuse every request (`finance-reviewer`, local dev only).
  - A 503 with `Retry-After` from the platform also gets the one GET retry.
- Evidence:
  - Tests: `tests/owner-session-floor.test.ts` (4: 29 s refused, 31 s passes, no expiry passes, `Retry-After` only on the renewing 503) and `tests/wire.test.ts` (+4: one GET retry, no second retry, no write resend, no retry without `Retry-After`). Red-proved: against the HEAD `supabase.ts` and `wire.ts`, 4 of the new tests fail.
  - `finance-reviewer`: no high-severity findings; fail-closed preserved; every caller answers through `routeError`.
  - The `pnpm verify` result is recorded in `PLAN.md`.

## D-302 — A refused Shopee save reads "Not saved", and the two statistics panels load through `useBenchList` (Open item 7 leftovers)

- Date: 2026-10-23
- Status: **Built, pushed and live** (`1caefda`). On production 2026-10-23, read-only: Shopee, the `/orders` statistics and the `/receipts` statistics loaded with no alert. A double Reload on the order statistics sent one request (the second press met a disabled button), and the tables stayed intact. No write was attempted. Front end only: no route, RPC, migration or stored-value change.
- **Defect (low).** `act` in `app/shopee-bench.tsx` set the write's refusal into the hook's `error` after the reload, so a refused match or link (a 409 clash included) appeared under "Not loaded" although the list had loaded.
- **Fix.** Shopee keeps the refusal in its own `saveError`, shown under **"Not saved"**, the heading categories and the ledger already use for a refused write. That made it a wording precedent, not a visual choice, so no variants were rendered. `act` clears it before each write and sets it before the reload, and Reload clears it too. `useBenchList`'s `error` is now the load's alone: `setError` left its return, since Shopee was its only caller. `setBusy` stays for `act`.
- **Statistics panels.** `app/delivery-statistics.tsx` and `app/receipt-statistics.tsx` load through `useBenchList`, which gives them the stale-answer guard. They need it: each reloads when a Sync, a LINE MAN save or a receipt save bumps its counter, and that reload can overlap the arrival load. Every message, sign-in text, reload trigger and disabled rule is unchanged.
- **Small cleanups.** `removeQueuedFile` (`lib/browser/inbox-slip.ts`) is now the one Inbox removal that both `releaseInboxSlip` and the import bench's statement removal word. `readCardDirection` stays exported: about a dozen assertions in `tests/notification-card-ocr.test.ts` exercise it, so dropping it would mean deleting coverage.
- **Observed, not caused by this change.** The first `GET /api/v1/shopee` after the deploy answered 500 ("could not be loaded in full"), and every retry answered 200. That is Open item 1's intermittent 500; the agent could not read the Vercel logs (the dashboard was signed out in the browser pane).
- Evidence: `tests/shopee-bench.test.tsx` (2 tests; red-proved: against the HEAD hook and bench, the refused-link test fails and shows "Not loaded"). `/code-review` (high) found nothing blocking: three minor findings (the alert sits at the top of the page, the panels have no render test, and a one-line wrapper could be inlined). `pnpm verify` green (lint 0 errors, tsc, docs, build). Vitest: 1,904 passed and 115 skipped of 2,019, because Docker was not running, so the DB-backed tests skipped; this diff touches no server or SQL.

## D-141 — Bulk statement import splits at the authentication boundary: many PDFs read in one pass, each bound and confirmed by hand

- Date: 2026-08-23
- Status: **Accepted and built.** `lib/statement-batch.ts` (policy), `app/statement-batch.tsx` (form), `app/import-bench.tsx` (the join), `tests/statement-batch.test.ts` (14), `tests/privacy.test.ts` (2 guards). **No SQL, no new route, no contract change** — the build still emits eighteen `/api/v1/` routes and every project stays on migration 020.
- Context: the owner proposed auto-importing statements end to end — banks mail them to a new mailbox, a script decrypts them unattended, they appear in the ledger. This is the first step of that, taken deliberately before the mailbox.

### What reading the code changed about the proposal

The handoff framed the **statement password** as the blocking question. It is not the first one. `/api/v1/imports/confirm` goes through `strongOwnerClient()`, which requires `aal2` **and** a verified TOTP factor, and there is no service-role bypass — `SUPABASE_SERVICE_ROLE_KEY` is deliberately not in the deployment's environment. **An unattended importer therefore needs the TOTP seed on disk as well as the document password**, which collapses the ledger's authentication factor into one always-on laptop. The password protects one bank's PDFs; the seed protects every write route, the backup export and the restore surface. That reordering is why this task exists in the shape it does.

The second finding cut the other way. **The expensive-looking half is nearly free**: `scripts/mask-statement.mjs` already reads real encrypted statements outside a browser (`pdfjs-dist/legacy`, no worker, password from stdin), and `readStatement(pages)` and `assembleImportPayload(...)` are both pure functions over plain data. Nothing about bulk import needed a second parser or a headless browser.

### The decision

**Automate up to the write, and not through it.** Many PDFs are unlocked and parsed in one pass on the device; binding, the review table and the confirmation stay exactly where they were, once per statement. The join is one function — a batched statement is indistinguishable from one opened on its own from `bind` onward, which is what stops bulk import becoming a second way to reach the ledger.

**Per-statement confirm is the load-bearing part, and it is not caution.** `assembleImportPayload` returns reconciliation warnings alongside a *valid* payload, and `out-of-order-run` means rows were reordered to make the balance close (D-055). Re-reconciling the finished payload cannot reproduce it, because its rows are already in applied order — the comment in `lib/import-assembly.ts` says so in as many words. A single batch-wide confirm would file every such warning unseen, which is the only failure mode here that writes to an append-only ledger while hiding what it did.

**Binding is still never inferred (D-017).** A batch makes the inference more tempting, not less: bank code plus four digits resolves unambiguously against a table unique on `(owner_id, bank_code, last_four)`, and it would save one choice per statement. It remains the ledger's routing decision. The policy module takes no account list, which is the structural version of the promise, and `tests/privacy.test.ts` asserts it over both new files.

### What a batch can see that a single import cannot

This is the only new policy in the feature. Duplicate files are blocked on their artifact digest. A statement whose printed totals never confirmed its rows is blocked *before* the owner picks accounts for it, because no account would make it importable (D-043). And **intersecting periods for one account are warned about, never refused** — the exact guard is `unique (owner_id, account_id, fingerprint)`, which refuses the individual shared rows; a period overlap only predicts that, and two statements can legitimately overlap while sharing no row. Blocking on a prediction would refuse valid work. What it buys is that the collision is visible before anything is sent, rather than arriving at confirm as a unique violation the route flattens into "could not be confirmed atomically" — indistinguishable from a real database fault, which is tolerable for a person at a screen and not for anything unattended.

### Consequences

**Statement import remains the only path in this app that reads entirely on the device** (D-128, D-129), and opening many at once is where that would erode quietly — so it is asserted rather than intended: neither new file constructs a request of any kind, and the password reaches the worker and nothing else.

**The cap is forty and its reason differs from bulk slips'.** Fifty there bounds *spend*, because every slip is a billed Vision call (D-135). Nothing here is metered, so forty bounds memory and wall time only. Stating the reason matters more than the number: copying the fifty without copying the reasoning is how a cap outlives its argument.

**The mailbox is not built and nothing about it is decided.** It swaps the input and changes nothing downstream, so it ships second against machinery already in use — D-047 is the argument, and it is the owner's call in any case since the mailbox is a hosted resource. Its open questions, none answered: where an unattended decrypt password could live (Windows DPAPI is the only supportable answer, and typing it once per pass may be the better trade); whether the source is deleted after import, since otherwise the mailbox becomes a permanent archive of every statement under a password derived from a citizen ID and therefore non-rotatable; that an auto-forward rule on the main mail is itself a standing exfiltration path; and that a mailbox accepts a PDF from anyone, so the readers' fail-closed chain would be the only thing between a stranger's attachment and the ledger.

### What `/code-review` found, run before asking to commit (D-125)

The policy layer came through clean. **Five defects were in the component, and four of them shared one shape: a failure path that removes information instead of showing it.**

1. **`retryRefused` discarded every refusal reason before checking a password had been typed.** `parseMany` clears the password at the end of each pass, so the field is *always* empty when the retry button first appears — pressing it before typing was the ordinary case, not an edge one. It re-queued the failed files, nulling their digests and reasons; `parseMany` then early-returned; the entries dropped out of the plan, the blocked list emptied and the button disappeared. The owner asked for a retry and was told nothing. The check now runs before anything is discarded.
2. **`parseOne` could leave its promise permanently unresolved.** Only `arrayBuffer()` was inside the `try`; `sha256HexBytes` and `new Worker` were not. A throw in either rejected the async IIFE without ever calling `resolve()`, so `parseMany` awaited forever, `setBusy(false)` never ran, and **every control including "Clear this batch" is `disabled={busy}`** — the section was unrecoverable without a page reload. `crypto.subtle` is the concrete way in: it is `undefined` outside a secure context, so this fires on the first file over plain HTTP.
3. **A file that failed before it could be hashed vanished from the worklist**, because the plan was built only from entries carrying a digest. Its id now stands in as a non-colliding placeholder — an unhashed file can never be mistaken for a duplicate, which is correct, because nothing knows what it held.
4. **`rowCategories` survived a change of statement in `app/import-bench.tsx`.** It is keyed by row *index* and was reset nowhere. Categorise row 2, confirm, open the next statement off the worklist, and its row 2 arrives pre-labelled with a category the owner never chose for it. It never reaches the ledger — only `payload: statement` is posted — so it is a wrong label over real rows rather than wrong data. Latent before today; **working a worklist is what makes it ordinary**, which is the general lesson of the batch surfacing it.
5. **The blocked list printed the raw `BlockedReason` discriminant** — `not-cross-checked` on screen as though it were a sentence — and, because both lists render identical markup with no heading between them, that enum was also the only signal that a row was blocked rather than ready. Both lists now carry a heading and the verdict is shown in words.

**One efficiency finding was taken and one was declined.** Duplicate files were fully parsed before being discarded, though the digest that condemns them is computed before the worker starts; they are now skipped, and they still reach the plan carrying that digest, which is what keeps them `duplicate-file` rather than unreadable. **The two findings against `eslint.config.mjs` and `playwright.config.ts` were left alone**: both are the owner's deliberately local-only files, never committed, and one of the two is already recorded in `HANDOFF.md`.

- Evidence: `lib/statement-batch.ts`, `app/statement-batch.tsx`, `app/import-bench.tsx`, `tests/statement-batch.test.ts`, `tests/privacy.test.ts`. Vitest **637 passed / 7 skipped across 32 files** — up 16 on 2026-08-21's 621/7, with the skip count back at its baseline. pgTAP **266 across 8**, Playwright isolated **18/18** and owner **31/31**, production build clean at **eighteen** `/api/v1/` routes, tsc and ESLint clean, `pnpm check:docs --strict` at 141 decisions and 140 traps. Re-run in full after the review fixes. **Phone width is measured for both batch worklists** by `.runtime/worklist-phone-audit.spec.ts` (throwaway): the statement worklist is clean at 390px, and the slip worklist does not overflow but carries two tap targets under 44px that predate this change. D-017 (binding is a user decision), D-043 (refusal over labelling), D-055 (the reordering warning this is built around), D-128/D-129 (device-only statement reading), D-135 (the bulk pattern this follows and where it deliberately differs).

## D-158 — The ledger pages, and reconciliation keeps its rule: a candidate set narrows the input instead of a second engine deciding the answer

- Date: 2026-08-27
- Status: **Done.** Migration `202608260021_ledger_paging.sql`, `app/api/v1/accounts/[id]/transactions/route.ts`, the new `app/api/v1/transactions/match-candidates/route.ts`, `lib/ledger-window.ts` (new), `lib/transactions.ts`, `app/transactions-view.tsx`, `supabase/tests/009_ledger_paging.sql` (new), `tests/ledger-window.test.ts` (new), `tests/e2e/owner-session.spec.ts`, `tests/fixtures/synthetic-slip.ts`, `tests/privacy.test.ts`. **Migration 021 is applied to the local synthetic project only** — no hosted project has it, and applying it beyond there is its own ask.
- Context: PLAN task 45, authorized by the owner and scoped the day before. Supersedes **D-155**'s deliberate decision to leave the ledger unpaged, which said in its own words that paging properly needed a migration.

### The free step first, because it needed no migration

`fingerprint` is 64 hex characters on every row and the ledger view has never read one — no component, no total, and not reconciliation, which matches on bank, exact amount and date window. About **80 of the ~584 bytes** a row costs after D-155's trim, a further **~14%**. **The column is untouched and keeps every job it had**: `unique (owner_id, account_id, fingerprint)` is what makes a re-imported statement idempotent, `confirm_import` still recomputes and rebinds it, and `export_backup_snapshot` still emits it. What ended is shipping a server-verified identity to a screen that never displays it.

### The open question task 45 named, answered before any SQL was written

Status is derived from reconciliation rather than stored, so whether it can be computed for a page decided the shape of both functions. **It can, and the reason is that the six statuses partition by population.**

`awaiting-statement`, `needs-review`, `balance-conflict` and `cash` belong only to **records** — slips, cards and cash entries, which are few, fetched whole and never paged. Filtering to any of them is a complete answer with no page involved at all. `verified` and `statement-only` belong only to **confirmed rows**, the population that pages, and they resolve asymmetrically: a row can only be verified if some slip or card claimed it, so every verified row in the ledger is in the candidate set by construction, while `statement-only` is the ledger's bulk and pages — which is the right behaviour for it and the only one of the six where the window's depth is visible to the owner.

**`STATUS_POPULATION` in `lib/ledger-window.ts` is that claim written as code**, and a test asserts exactly two statuses sit on the paged side — so a seventh status added later cannot quietly join the wrong half.

### What the migration adds, and what it refuses to add

`list_account_transactions_page` is keyset-paged rather than `offset`, which re-reads everything above the page and shifts the window under a concurrent write. It carries whole-account totals computed in SQL as sums of `bigint` minor units with **no division anywhere** — which is what keeps the totals strip meaning *this ledger* rather than *this screenful*, and is precisely the line task 44 will have to argue separately.

`list_match_candidates` returns every row some record could be paired with: bank and exact amount for a slip, **account** and exact amount for a card, deliberately unbounded in date because that is what the manual choosers already need (D-067). **The matching rule does not move.** It is ~85 tested cases in TypeScript, and re-implementing it in PL/pgSQL is the two-engines mistake D-120 already refused. SQL narrows the input; TypeScript decides the answer.

**The union is load-bearing, and it is the whole of why this is not "add LIMIT".** The client reconciles over `page ∪ candidates`. Handed a page alone, a slip that is genuinely ambiguous ledger-wide — two rows it could be, one of them off-page — sees a single match and pairs with it, rendering `verified` on a row nobody was ever asked about. That is a wrong answer about money rather than a slow one, and it is exactly what D-063 exists to prevent.

### The combined balance: the predicted hazard was not real, and the real one is subtler

Task 45's first named hazard was that `combinedBalanceByTransaction` seeds each account from `post_balance − movement` of its oldest row, so a page would seed from the wrong row and every figure would be wrong. **Per account that is not true.** The expression is a fact about the row it is applied to — the balance immediately *before* it — whichever row that is, so handed a window it already yields the balance carried into the window. The test written to demonstrate the breakage is what showed there was none, and the server's `carriedBalance` was therefore removed rather than kept.

**The merged view is where it does break, and `/code-review` found it after that field was already gone.** The combined figure at a row is the sum of *every* account's balance at that moment, and the walk supplies an account's seed for every row older than that account's oldest **held** row. Unpaged the seed is the account's true opening, so it is right. Paged it is a balance from the middle of that account's history, and every earlier row in the merged list is summed against it. With A loaded to its opening and B windowed to its newest row, a January row of A printed **1100** where the truth is **100** — B's unfetched February movement leaking backwards — and pressing *Load older rows* re-seeded B and silently rewrote a figure already on screen. **Only the merged view renders that column**, which is why nothing caught it earlier.

**`carriedBalance` would not have fixed it either**, which is worth stating because it looks like the field's obvious purpose: it is the same quantity as the seed the client already derives. What the merged view needs is each account's balance at *arbitrary earlier dates*, which no single number can carry.

**What was built instead is a floor rather than a figure** (`combinedBalanceFloor`). An account's balance at a row is known when the account holds a row at or before it, or when its window is complete — so each account with more to fetch contributes its oldest held row's date, and the combined figure is exact at and after the newest of those. Below it the column renders an em dash. **Nothing is approximated**: a running total that quietly means something else is the exact failure this task exists to prevent, and the previous code fell back to the row's own account balance under a heading saying "All accounts", which is a different number wearing the same label.

### The decided-rows union does not close a live hole

**The decided-rows union does not close a live hole.** The migration's first draft claimed that a slip corrected after its match decision would drop out of the candidate set, so the owner's own decision would be silently discarded. **Checked rather than asserted, and it is unreachable**: migration 013 refuses a slip correction that would falsify a stored match, migration 017 refuses the card's equivalent in both amount and balance, and neither a slip's bank nor a card's account is correctable. The union is kept for the one case those guards do not cover — **a decision stored before the guard that protects it existed**, since slip decisions have been writable since 012, the correction guard arrived in 013, and 014 then found that `set_slip_match` had been reading the uncorrected figure the whole time. Neither migration re-validated the rows already stored, and a guess about which historical rows are clean is not worth saving a union against two small tables.

### What `/code-review` found, beyond the balance

Five further findings, all fixed. **`statusIsComplete` called `verified` complete and it is not**: every verified row is in the candidate set, so *reconciliation* sees them all, but a confirmed row outside the window is filtered out of the *table* — so a slip matched to a row three pages down produced a verified row the owner could not see, under a line telling him the answer was complete. Only the four record statuses are complete now. **`loadMore` paged every account regardless of the selected scope**, while the reach line above it counts one — and since window depth decides where the merged balance is knowable, that also moved figures on a view the owner was not looking at. **`loadMore` wrote `error` without a supersession check**, so a deeper page could clear or overwrite a concurrent reload's message. **The candidate rows shown during a manual pick** fell back to their own account balance under the combined heading, which the floor now renders as an em dash. And **`transactionListSchema` had no consumer left**, so it is gone.

**`list_match_candidates` reintroduces an unbounded scan and the migration now says so.** Its `movements` CTE aggregates every transaction and component the owner holds on every ledger load. The set it *returns* is bounded by how many slips and cards exist — that is the claim worth making and the one that keeps the payload small — but the work is not bounded, and the first draft's comment implied otherwise. Making it cheap needs a stored per-transaction movement to index against, which is a column on an append-only table and therefore a backup-contract change, deliberately out of scope. At order 10^3 rows it is not worth a migration; it is written down as the thing to fix the moment it shows up in a page load.

### What the totals mean now, stated because paging is where a number changes meaning silently

Records are complete on the client at any window depth, so their contribution is exact. The confirmed contribution comes from SQL — but only while nothing narrows the confirmed population beyond the account, because the account is all the server was asked about. Under a text query or either confirmed status the figure falls back to meaning what it has always meant, *over the rows on screen*, and a reach line beneath the table (`Showing N of M confirmed rows`) is what stops that being a silent difference. **That line is the answer to "…within this page"**, which task 45 named as the worse half of every paging bug.

### Two defects written and caught inside the change

**The empty state started lying about the whole ledger.** Replacing `transactions.length === 0` with a window count scoped it to the selected account, so choosing an account holding nothing said *"This ledger holds no confirmed transactions yet"* to an owner holding four rows elsewhere. The owner suite failed by name on it. The distinction that message draws — nothing imported versus this filter matched nothing — is deliberately unscoped now, with the reason written beside it.

**A duplicating page cannot reach the table, and that was found by trying to break it.** The keyset predicate was deliberately changed to `<=` at the date boundary so the second page re-returns the cursor's own row; the end-to-end paging spec went on passing, because everything the table renders comes through `reconciliationRows` and that union is keyed by id. So the dedup there is not tidiness — it is what stands between a boundary bug and a row counted twice in every total, and it is now asserted at the level that actually holds it. **The break in the other direction is not absorbed**: `hasMore` was broken so the ledger silently stops at one page, and the spec failed by name on the reach line.

### `list_account_transactions` is superseded, not retired

Nothing in the app calls it after this. It is left in place and still granted because `supabase/tests/001_security.sql` pins its grants, and dropping a published, granted function is a contract change of its own rather than a side effect of this one.

- Evidence, after the review's fixes: Vitest **845 passed / 7 skipped across 40 files** (from 823/7/39) — 21 in the new `tests/ledger-window.test.ts` and 1 in `tests/transactions.test.ts`, skip count unchanged at 7. pgTAP **299 across 9 files** (from 266 across 8) with migrations 001–**021**: 33 assertions covering the keyset order including `nulls last`, three pages covering the ledger with no repeat and no gap, whole-account totals from any page, the limit clamp, the refused partial cursor, all four clauses of the candidate predicate, a weak session reading nothing, and the page's key set pinned at three so `carriedBalance` cannot quietly return. Playwright owner **32/32** including a new end-to-end paging spec over 105 seeded rows; isolated **34 passed / 4 skipped**. Production build clean at **twenty-two** `/api/v1/` routes, up one. `tsc` and `pnpm exec eslint .` clean with zero warnings. `check:docs --strict` clean. Backup contract **unchanged at v7** — no table gains a column. **`/security-review` found nothing**, verified against live `pg_proc` rather than read off the migration: both new functions are `SECURITY DEFINER` with a pinned `search_path`, granted to `authenticated` only, and `private.ledger_transaction_json` — which takes an owner id — is granted to nobody and is not `SECURITY DEFINER`. No dynamic SQL anywhere. D-063 (reconciliation over the whole ledger, preserved), D-067 (the manual override reaching past the automatic window), D-120 (the two-engines refusal this obeys), D-125 (review before asking to commit, four for four now), D-155 (superseded), D-157 (the change before this one).
