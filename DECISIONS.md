# Private Ledger decision log

Last reviewed: 2026-08-09

Entries are append-only. A superseding decision must reference the earlier entry rather than rewriting its history.

This file holds **D-141**, **D-158** and **D-273 … D-290**. D-141 and D-158 were the two open questions; both are answered (D-288, D-289), and none is open now. The index below covers every file, so any entry can be found without opening a body; `scripts/check-docs.mjs` pools this file with every archive and checks ids for duplicates and omissions.

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
### Current 
—
 this file

- **D-290** — Task 59: the owner marks a ledger row as a duplicate — Excluded plus an audit marker that only re-including clears (migration 062); marked rows hidden by default
- **D-289** — D-158 closed: the automatic candidate set is bounded to ±1 day of each slip or card (migration 061); the manual chooser's unbounded set loads only when picking starts
- **D-288** — D-141 answered: imported statement mail stays in the mailbox and gets a visible Gmail label `PL Imported` beside the hidden keyword
- **D-287** — `PLAN.md` holds the current state only; finished work moves unchanged to `docs/archive/`, and dead traps retire to their generalisations
- **D-286** — The twenty-first boundary moves D-259 … D-272 on the owner's word
- **D-285** — Receipt discounts keep their printed names; a receipt's completeness and checks change only when its items are replaced (migration 060); stored receipts get names by an equal-rank re-capture
- **D-284** — `/statistics` sections collapse, the spending calendar shows newest month first with a toggle, the header line no longer touches `/statistics` and `/orders` content, and "Libron (book figures)" now reaches amounts
- **D-283** — D-280's leftover fixed: a read-only `count_existing_import_rows` (migration 059) shares `confirm_import`'s linking rule, so an all-linked re-printed statement records no import batch
- **D-282** — D-277's bank-refund rule checked against the real export and widened: one mask character then four or more digits is also a masked account number
- **D-281** — Owner's 2026-10-17 visual asks: no divider under Cash payments on `/ledger`; Grab and LINE MAN chips in brand green on `/orders`; a "Libron (book figures)" typeface choice to trial Libron digits
- **D-280** — Inbox/mailbox statement counts read back what `confirm_import` linked (task 60): a re-printed overlapping statement reports its linked rows, an all-linked batch reports duplicate; no migration
- **D-279** — UX review 2026-10-11 closed: 23 of 25 fixed (two reduced), 2 declined (desktop calendar cells stay 38px wide; "Use synthetic statement" stays per D-204)
- **D-278** — Haiku trial for settled UI-only changes via a new `finance-ui-implementer`; money, data and server code stay on Sonnet `finance-implementer`
- **D-277** — Two of D-271's leftover findings fixed: matches read only the Shopee match state, and an unknown refund destination is refused instead of stored as a bank; three left on purpose
- **D-276** — A SPayLater repayment is a leftover ShopeePay outflow on day 7–13 of the month; candidate orders reach back 366 days (supersedes D-270/D-275's repayment wording and 10–60 day window)
- **D-275** — "Payment to Shopee" rows are PromptPay QR order payments: `other`-kind orders match like bank debits; no SPayLater repayment wording is known yet (supersedes D-273's repayment rule)
- **D-274** — The Shopee matcher proposes no row the owner Excluded (task 64); an owner match or link on one is kept
- **D-273** — A `Direct Debit` naming ShopeePay is a bank debit, not a SPayLater repayment (task 63; corrects D-270)

## D-290 — Task 59: the owner marks a ledger row as a duplicate — Excluded plus an audit marker that only re-including clears (migration 062); marked rows hidden by default

- Date: 2026-10-21
- Status: **Built; migration 062 on hosted** (backup verified at sequence 1318 = last export = newest record, dry run 061 and 062 only, sequence unchanged after the push; grants and index read back). Owner: "go ahead" on task 59, which overrides D-265's preference for plain Excluded; duplicates hidden by default with a toggle.
- **Chosen (lightest of four designs):** no column, enum or table. `mark_duplicate(tx, expected_revision)` writes Excluded through `update_transaction_overlay` (every other overlay field carried over), then appends `overlay.marked_duplicate` with `{revision}`. `list_duplicate_transactions()` lists a row while it is excluded, has a marker, and no `overlay_revisions` snapshot after the marker's revision has `include_in_reporting = true` — so a later note or category edit keeps the mark, and only Include clears it. An already-marked row returns its overlay unchanged whatever revision the request carried (a retried request is a no-op, not a 409). Index `audit_events (owner_id, entity_id, event_type, id)` serves the marker lookup. Backup contract unchanged: `event_type` is free text, no version bump.
- **Rejected:** a new state or reason column, or a separate table — each needs a backup bump (16 → 17) and another `restore_backup` rewrite.
- **UI:** "Mark as duplicate" beside Exclude/Include on every unmarked confirmed row, Excluded ones too (so the four D-265 rows can be relabelled); a marked row shows a "Duplicate" chip; "Show duplicates (N)" in the ledger controls, only when N > 0, not persisted. Hiding is display only: totals, balance, reconciliation and paging read the full set; the strip's row count still includes hidden rows. The manual chooser never offers a marked row.
- Evidence: pgTAP `038_duplicate_marker.sql` (24; the note-edit and idempotency assertions red-proved); `tests/duplicate-hiding.test.ts` (4: money and balances identical hidden vs shown). `/code-review` high: 7 findings, 5 fixed (index, retry no-op, chooser offers, Gmail label logging, a stale comment), 2 simplifications skipped.

## D-289 — D-158 closed: the automatic candidate set is bounded to ±1 day of each slip or card (migration 061); the manual chooser's unbounded set loads only when picking starts

- Date: 2026-10-21
- Status: **Built; migration 061 on hosted** (pushed with 062, same backup check). Owner approved the lazy chooser. Design from D-264.
- **`list_match_candidates()`** now filters `source_transactions` by account and `source_date` within one day of each slip's or card's date in force (`coalesce(correction.occurred_on, record.occurred_on)`) before summing components, then keeps rows whose movement equals that record's amount in force; decided rows stay in whatever their date; no cap (D-063). This mirrors `proposeSlipMatches` / `proposeCardMatches` (`MATCH_WINDOW_DAYS` = `CARD_MATCH_WINDOW_DAYS` = 1, calendar days, no time zone); if either constant changes, the SQL must change too.
- **`list_chooser_candidates()`** is 021's unbounded body unchanged, behind the new route `/api/v1/transactions/chooser-candidates`, fetched when the owner presses "Choose a statement row" and dropped after a decision or a reload.
- **Visible change:** slip and card rows always show "Choose a statement row" with no count; the count, or "No … row carries this exact amount", appears in the banner once the chooser's rows load (loading and error lines while they don't).
- Evidence: pgTAP `009_ledger_paging.sql` plan 33 → 45 (2 days out of the window but in the chooser, a corrected date moves the window, a decided row 14 days away stays in), three red-proved against 021's body. Index use not measured (local data too small for EXPLAIN to show it).

## D-288 — D-141 answered: imported statement mail stays in the mailbox and gets a visible Gmail label `PL Imported` beside the hidden keyword

- Date: 2026-10-21
- Status: **Built** (app code only). Owner: "stay but labelled".
- Already true before this: nothing is moved or deleted; each imported part carries the IMAP keyword `PLFetched-<part>`, the dedup authority Sync reads. Gmail's UI does not show keywords.
- **Added:** `markFetched` (`lib/server/statement-mailbox-session.ts`), after the keyword succeeds, stores the Gmail label `PL Imported` (imapflow `useLabels`, X-GM-LABELS). Best-effort: a refused label logs one value-free line and leaves the result true. Receipts (`PLReceipt`) and deliveries keep hidden keywords only.
- **Not verified against the real mailbox**: whether Gmail creates the label on first store. Check after the next imported statement.
- Evidence: 3 new tests in `tests/statement-mailbox-session.test.ts`.

## D-287 — `PLAN.md` holds the current state only; finished work moves unchanged to `docs/archive/`, and dead traps retire to their generalisations

- Date: 2026-10-17
- Status: **Done** (`b9591c0`, `702f1a0`; docs only, not pushed). Asked for by the owner through a brief from another session, approved after a proposed split.
- **`PLAN.md` is the current state, not a log**: one checkpoint paragraph, one Open list with each item once and its D-id, undone tasks only, the authorization-gate line and the working constraints (999 → 38 lines). Older checkpoint paragraphs, finished tasks (numbers kept, so "`PLAN.md` task N" resolves there), the resolved review blockers, completed hardening and discharged gates moved unchanged to [`docs/archive/PLAN-2026-10-17.md`](docs/archive/PLAN-2026-10-17.md). The next time PLAN outgrows ~200 lines, the same move makes a new dated archive file.
- **Task 25 reworded, task 28 closed** on the owner's word: categorising already runs without an LLM (D-245, D-249); an LLM step needs its own research in the local-llm repo first. Task 28's phone leftovers were overtaken by the later UX rounds (D-279).
- **Headers cut, not entries**: the `DECISIONS.md` and `GOTCHAS.md` header essays moved unchanged to [`docs/archive/DOC-HEADERS-2026-10-17.md`](docs/archive/DOC-HEADERS-2026-10-17.md); the decisions header keeps the open questions, the size rule and a range → file → date table.
- **Traps retire only after a check against the committed tree**, not the local working copy: an audit of `docs/gotchas/` flagged 29; four were retired to their generalisations (merged balance walk, pnpm allowlist, isolated dev-sign-in pin, skill validator), one duplicate privacy trap now points to its twin, and the default-config Playwright traps stayed because the committed `playwright.config.ts` still lacks `testIgnore` and a webServer timeout (the audit had read the local-only copy).
- Evidence: `check:docs --strict` green after each commit (286 decisions, 237 traps); the token-preservation checker clean for PLAN (new + archive), both headers; every original PLAN line found verbatim in the new PLAN or its archive. `docs/archive/` is not scanned by `check:docs`, so references in moved text are no longer checked.

## D-286 — The twenty-first boundary moves D-259 … D-272 on the owner's word

- Date: 2026-10-17
- Status: **Done.** D-259 … D-272 relocated unchanged to [`docs/decisions/ARCHIVE-D-259-D-272.md`](docs/decisions/ARCHIVE-D-259-D-272.md); their index bullets moved to that file's Archived section.
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
