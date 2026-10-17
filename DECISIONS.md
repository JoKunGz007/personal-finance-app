# Private Ledger decision log

Last reviewed: 2026-08-09

Entries are append-only. A superseding decision must reference the earlier entry rather than rewriting its history.

This file carries **D-141, D-158 and D-259 … D-284** — the two open questions this file has
named since the twelfth boundary, the newest entries, and the twentieth boundary's own record of
itself (D-267). **D-141**:
whether the mailbox source is deleted after import, deferred by the owner. **D-158**:
`list_match_candidates`' unbounded scan, recorded in its own migration and unfixed. `scripts/check-docs.mjs`
pools this file with every archive and checks ids for duplicates and omissions across the whole set,
so the ids stay whole and the maintained file has never been required to be contiguous. Thirteen
settled ranges were relocated unchanged, not rewritten: **D-001 … D-059** to
[`docs/decisions/ARCHIVE-D-001-D-059.md`](docs/decisions/ARCHIVE-D-001-D-059.md) on 2026-08-09,
**D-060 … D-113** to [`docs/decisions/ARCHIVE-D-060-D-113.md`](docs/decisions/ARCHIVE-D-060-D-113.md)
on 2026-08-18, **D-114 … D-119** to
[`docs/decisions/ARCHIVE-D-114-D-119.md`](docs/decisions/ARCHIVE-D-114-D-119.md) on 2026-08-19,
**D-120 … D-129** to [`docs/decisions/ARCHIVE-D-120-D-129.md`](docs/decisions/ARCHIVE-D-120-D-129.md)
on 2026-08-23, **D-130 … D-133** to
[`docs/decisions/ARCHIVE-D-130-D-133.md`](docs/decisions/ARCHIVE-D-130-D-133.md) on 2026-08-24,
**D-134 … D-140** to [`docs/decisions/ARCHIVE-D-134-D-140.md`](docs/decisions/ARCHIVE-D-134-D-140.md)
on 2026-08-25, **D-142 … D-152** to
[`docs/decisions/ARCHIVE-D-142-D-152.md`](docs/decisions/ARCHIVE-D-142-D-152.md) on 2026-08-26,
**D-154 … D-156** to [`docs/decisions/ARCHIVE-D-154-D-156.md`](docs/decisions/ARCHIVE-D-154-D-156.md)
on 2026-08-27, **D-157 … D-163 without D-158 and D-161** to
[`docs/decisions/ARCHIVE-D-157-D-163.md`](docs/decisions/ARCHIVE-D-157-D-163.md) the same day,
**D-153 with D-164 … D-168** to
[`docs/decisions/ARCHIVE-D-153-D-168.md`](docs/decisions/ARCHIVE-D-153-D-168.md) on 2026-08-29,
**D-161 with D-169 and D-170** to
[`docs/decisions/ARCHIVE-D-161-D-170.md`](docs/decisions/ARCHIVE-D-161-D-170.md) on 2026-09-01, and
**D-171 … D-176** to
[`docs/decisions/ARCHIVE-D-171-D-176.md`](docs/decisions/ARCHIVE-D-171-D-176.md) the same day, and
**D-177 … D-197** to
[`docs/decisions/ARCHIVE-D-177-D-197.md`](docs/decisions/ARCHIVE-D-177-D-197.md) — begun on
2026-09-04 without **D-179 … D-181, D-183 and D-184**, which were fenced by an unfinished reading;
**completed to D-186 on 2026-09-13** when the budget asked and that fence had already been
discharged; and **extended to D-197 on 2026-09-16** (the fifteenth boundary, D-198), on the owner's
direct word rather than an argument or a reading, since every entry added was already settled,
shipped and confirmed live; and **D-198 … D-211** to
[`docs/decisions/ARCHIVE-D-198-D-211.md`](docs/decisions/ARCHIVE-D-198-D-211.md) on 2026-09-23
(the sixteenth boundary, D-213), again on the owner's direct word; and **D-212 … D-222** to
[`docs/decisions/ARCHIVE-D-212-D-222.md`](docs/decisions/ARCHIVE-D-212-D-222.md) on 2026-09-25
(the seventeenth boundary, D-227), on the owner's word too; later boundaries add **D-223 … D-234** (D-239), **D-235 … D-244** (D-251) and
**D-245 … D-258** to [`docs/decisions/ARCHIVE-D-245-D-258.md`](docs/decisions/ARCHIVE-D-245-D-258.md)
on 2026-10-11 (the twentieth boundary, D-267). The index below covers all fifteen files, so a reader can find any
entry without opening any body.

**Every boundary sits where an argument ends rather than where a number is round**, and the fourth one is the clearest case of that rule so far. It was taken at **93%** of this file's byte budget and moved the whole arc in which both readers went to Cloud Vision and the local OCR engine was deleted. **The third boundary had explicitly refused to move D-120**, on the grounds that whether pre-fill stays was undecided and that question attached to D-120 and D-129 — which was true when written. **What closed it was not an argument but a shipped feature**: D-135 files a machine-read amount into the ledger without the owner looking at it at all, which is a stronger commitment than the trial ever asked for. *A question is closed when the code has stopped asking it*, and that is the test to apply at the next boundary rather than re-reading the prose.

**What this file now holds is two open questions, the newest entry and the record of the boundary
that just ran.** The mailbox archive (D-141) and the unbounded candidate scan (D-158) remain open
and are the whole of what is unanswered; D-212 and D-213 sit above them.

**The fourteenth boundary was taken on 2026-09-13, and the budget asked for it rather than an
argument closing.** That is the first time in fourteen that the number moved first — D-192's own
entry took the file to **119 KB against a 117 KB budget**, and `check:docs --strict` failed rather
than warned. The range was available because the fence had already come down: D-188 recorded that
`/statistics` carries the spending calendar, so **D-179 and D-183 were in the owner's phone captures
after all** and D-184 was freed with them, while **D-180 and D-181 were closed by the owner's
decision** to leave the four schemes unphotographed. So the boundary cost nothing that was still
being argued about — it **completed** `ARCHIVE-D-177-D-186.md` rather than opening a fifteenth file,
putting the five held-back entries back beside the five that left on 2026-09-04 and making that
range contiguous and honest about its own name. **75% afterwards, from 99% before the thirteenth.**
The rule is unchanged and worth restating because this boundary is the exception that tests it: a
boundary sits where an argument ends, and when the budget forces one anyway, the right move is to
take a range whose arguments have *already* ended rather than to cut into one that has not.

**The twelfth boundary moved D-171 … D-176 for 95% → 74%, and it is the first contiguous one in
five.** The eighth, ninth, tenth and eleventh each stepped over an open question or grouped a
stranded id with a later range; this one did not have to, because both open questions sit *below*
D-171. What it moved is one arc — the tenth boundary itself, then the four days in which the
statistics surface got its URL state and its account dimension and reached hosted (D-172 … D-176).
**What bought it was not a question closing but a run of work finishing**: everything in the range
was verified on the deployment and nothing in it is waiting on anything. **D-141 and D-158 are not
stepped over this time** — for the first time since the seventh boundary, the range simply began
above them.

**The thirteenth boundary moved D-177, D-178, D-182, D-185 and D-186 for 99% → 72%, and it is the
first one bought by a measurement rather than an argument or a shipped feature.** The twelfth named
its own fence precisely — five entries, one missing reading, a phone — and then that reading
happened, on 2026-09-04, and immediately produced a defect that had been live since the day headings
shipped (D-187). **A fence expires when the question closes, and a question closes when the code has
stopped asking it**: for the ledger day-heading arc the code has now stopped, because the defect the
reading found is fixed and deployed. **It expired for five of the nine and not the other four**,
which is why this boundary has four holes in a ten-wide range — the widest set of holes any boundary
here has carried, and each one names a surface nobody has rendered at 390px rather than an argument
nobody has settled. **The lesson the twelfth was owed is now on the record**: "one reading frees all
five" was optimistic by four, because a reading is of a *page* and the fence was drawn around a
*budget*.

**The rate has not slowed and that is still the thing to watch**: four boundaries in six days, and
this file went 83% → 95% in a single session on the strength of two entries. D-180 and D-181 are 9.3
KB and 4.2 KB. A log whose entries argue at that length will need a boundary roughly every time two
of them land, so the next one is a question of when rather than whether — and D-137's reversal
(D-180) must stay findable from here while anyone might still read the entry it overturns, which is
a reason to keep it rather than a reason it cannot ever move.

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
- **D-272** — Migration 058: `shopee_ledger_rows()` reads each source once; 056 timed out as the owner on hosted
- **D-271** — Shopee import built (task 62 steps 2–6); D-270's wallet top-up count corrected
- **D-270** — Shopee import design: own tables, JSON dropped on the Inbox, orders fixed at payment, automatic match only when unique, proposed links for combined checkout, wallet top-ups and SPayLater repayments; a tab on `/orders`
- **D-269** — `AGENTS.md` is folded into `CLAUDE.md`; Codex is no longer used
- **D-268** — `HANDOFF.md` is retired into the files that own its facts (supersedes D-052)
- **D-267** — The twentieth boundary moves D-245 … D-258 on the owner's word
- **D-266** — Shopee orders come from a one-click export of the web order pages (a bookmarklet writing JSON), not a printed PDF (amends D-264); order code and link number stored, never the recipient's name, address or phone; import from the ledger's start
- **D-265** — `confirm_import` links a re-printed bank row by its identity facts instead of inserting a duplicate (migration 054); the four duplicates already stored are Excluded; D-260's safety claim holds one way only
- **D-264** — Shopee orders come from the web order-detail page saved as PDF, not from mail; D-158's unbounded candidate scan stays until it is slow
- **D-263** — The Inbox is the way in: Import and Slips leave the main nav as Inbox fallbacks, and the `/slips` backlog upload is removed
- **D-262** — A printed date line may end in a stray mark (`>` read off a Krungthai background); the end-anchored date pattern had reported no date, so the year re-read never ran
- **D-261** — A queued slip that needs checking has "Add on Slips": `/slips?inbox=<name>` loads it into the single-slip form and removes it from the queue once the ledger stores it
- **D-260** — A statement that overlaps the ledger is imported (its new rows) with a count of new and already-stored rows, instead of being held; Review on Import is a button
- **D-259** — A refused slip amount is read again from an enlarged crop (2×, then 3×) under the same grammar; a verdict a retry could change is not remembered, and a capture the server refused is

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

## D-272 — Migration 058: `shopee_ledger_rows()` reads each source once; 056 timed out as the owner on hosted

- Date: 2026-10-11
- Status: **Done; pushed to hosted.** Fixes D-271's matching read.
- **Found on production, after the deploy and the first import.** The Shopee tab refused ("could not be loaded in full"). Every read ran fast as `postgres`; timed as the owner (`authenticated`, aal2 claims), 056's `shopee_ledger_rows()` took about 6 s. Its correlated subqueries (a component sum and an `exists` over every order and refund, per ledger row) re-ran the RLS policy for each inner row. The loader reads it with `count: "exact"`, which runs it twice, past the 8 s statement timeout for `authenticated`. `loadCurrentMatches` reads the same view, so **auto-categorise refused every row** from the deploy until 058 landed.
- **Fix:** migration 058 reads the orders, the refunds and the component sums once each (materialized CTEs), so each source row passes its policy once. Same contract, security invoker. Measured on hosted as the owner: 119 ms; the same 179 rows as 056 (`except` both ways empty).
- **Pushed** after the owner exported a fresh backup (the import had moved the sequence; it then equalled the newest backup record) and a dry-run listing only 058. Local: pgTAP 36 files (918), Shopee e2e, loader and match tests green.
- **Why the gate missed it:** the local database is small, and RLS cost grows with ledger rows × orders. Trap recorded in `docs/gotchas/database.md`.
- **Hosted import (same day, owner-authorised):** both exports through `/inbox` (Claude in Chrome's file upload; the built-in pane cannot attach files): 171 orders and 8 refunds stored, 82 orders before the ledger's first row skipped, 0 refused.

## D-271 — Shopee import built (task 62 steps 2–6); D-270's wallet top-up count corrected

- Date: 2026-10-11
- Status: **Built and tested locally; `db push` of 055–057 and the deploy follow in the same session.** Implements D-270.
- **Built.** Migration 055: seven tables, `capture_shopee_orders` (idempotent per order code, a changed order refused, one bad order never sinks the batch), `set_shopee_payment_match` (a group of orders on one row; amounts must sum exactly; a combined checkout is undone whole), `set_shopee_order_links` (an append-only event log), backup v16. Migration 056: `shopee_ledger_rows()`, the read beneath matching. Migration 057: `shopee_monthly_summary()`, twelve Bangkok months, refunds in the order's month, no table. `lib/shopee-match.ts` computes every proposal at read time; nothing automatic is stored. The Inbox takes the export (both versions). `/orders?view=shopee` shows the month figures, a 12-month bar strip, what is waiting for the owner, and the order list with Undo / Unlink. A matched ledger row shows its order; categories follow D-270.
- **Measured with the shipped code on the owner's exports (counts only):** the parser reads all 253 orders (244 + 9), 0 refused, 9 refunds (8 to the wallet, 1 to a bank). 143 of 150 bank-debit orders match automatically, 2 are one proposed combined checkout, and no VIP charge is claimed.
- **Corrects D-270's "11 of 12 wallet orders".** That count included rows already matched to other orders. With those excluded, the shipped rule proposes a top-up for **4 of 12** wallet orders; the rest stay unproposed (the owner links them, or not).
- **Deploy order matters.** `loadCurrentMatches` (auto-categorise) refuses everything when the Shopee read fails, like a failed receipt or delivery read. So 055–057 are pushed to hosted **before** the code that reads them; the reverse order stops auto-categorising for every row.
- **Review (`/code-review` high, 10 findings).** Fixed: an import cut mid-batch now says how many orders landed; the parser refuses an order with no payment method itself (the database refused it as "invalid order"); refund-deposit candidates skip rows Shopee already holds; the waiting list drops repayments with nothing left to link; wallet and SPayLater chips say "linked", "Proposal" or the payment kind, not always "Proposal"; Undo on one order of a combined checkout undoes the whole row. **Left, low risk:** the full Shopee view is loaded for auto-categorise and `/ledger` (a lighter read would also stop a summary failure from refusing categorisation); a refund-deposit candidate already matched to a non-Shopee document can still be proposed; a combined match to a row without `SHOPEE` text shows "ledger row not in view"; a refund destination other than the two ShopeePay wordings is read as a bank; refunds are checked one by one against the total, not as a sum (057 clamps).
- **Evidence:** Vitest 97 files, 1,870 passed / 7 skipped (including `tests/shopee-e2e.test.ts` against the local database, which caught the movement arriving as a JSON number); pgTAP 36 files, 918; tsc; lint 0 errors; docs check strict.

## D-270 — Shopee import design: own tables, JSON dropped on the Inbox, orders fixed at payment, automatic match only when unique, proposed links for combined checkout, wallet top-ups and SPayLater repayments; a tab on `/orders`

- Date: 2026-10-11
- Status: **Decided (owner, `/grilling`), not built.** Answers D-266's open points. Build order: `PLAN.md` task 62.
- **Storage.** Separate tables, not `deliveries` (Shopee is shopping, needs status, refunds, the link number and SPayLater; the delivery checks and statistics stay untouched): orders, items (display only), price lines, refunds, a payment-match table that lets several orders claim one bank row, and an informational link table (kinds `wallet_topup`, `spaylater_repayment`; many-to-many). Backup moves to v16.
- **Way in.** The bookmarklet's JSON is dropped on `/inbox` (D-263), recognised by its `source`, read on the server. The order code is the idempotency key: re-exporting the whole history stores only new orders and new refunds; a stored order whose money facts differ is refused and reported. The Inbox reports new, already stored and refused.
- **Order facts are fixed at payment.** Code, link number, paid time, shop, items, price lines, total and payment method; never the recipient's name, address or phone (D-266). Status changes arrive as separate records. An order cancelled before payment is skipped (none exist).
- **Matching bank-debit orders.** Automatic when the row's description contains `SHOPEEPAY`, the amount is exact, the row is within ±1 minute of the paid time, and the pairing is unique both ways; anything else is proposed. Undoable, with revisions.
- **Combined checkout.** Proposed, never automatic: orders paid within the same minute whose totals sum exactly to one `SHOPEEPAY` row, none with its own single match, and exactly one such grouping. Seen once in 142.
- **Wallet-paid orders.** No bank match, not shown as unmatched. A link to an unmatched `SHOPEEPAY` row up to 60 minutes before the paid time is proposed (one tap) when no other wallet order shares the window. Measured 2026-10-11: 11 of 12 wallet orders since the ledger's start have such a row 0–37 minutes before, and none equals the order amount (smaller same-minute rows look like a part-payment of the shortfall; larger ones like a round top-up).
- **SPayLater.** No bank match. Repayment rows (`Direct Debit` / `Payment to Shopee`) link to the orders they repay, many-to-many, through a picker listing SPayLater orders paid 10–60 days earlier (pre-ticked when only one), always confirmed. Measured: 4 orders since the ledger's start, repayments 15–21 days later at amounts that are not a clean fraction of any one order.
- **Cancellations and refunds.** The bookmarklet reads `/user/purchase/cancellation/<id>` (request ID and time, steps, refund amount, refund destination, requested by, original order code, reason; no delivery block). A refund record attaches to its order; the order keeps its bank match. Measured 2026-10-11: 5 cancelled orders, all paid and refunded in full to the ShopeePay balance; the Return Refund tab is empty. **Corrected the same day by the step-1 export: 9 cancelled orders** (the list lazy-loads; the first count stopped early). All 9 paid and refunded in full; 8 to the ShopeePay balance (printed as `ShopeePay Balance` or `ShopeePay`) and **1 to a bank account** (a QR-paid order; printed as the bank's name and a masked account), which is the first case for the deposit match. 7 of the 9 order pages print no `Order Paid`, only `Order Placed` and `Order Cancelled`; the placed time stands in. A refund to a bank account is proposed as a deposit match, never automatic until measured.
- **Totals.** Shopee's own totals count every non-cancelled order in its order month, net of refunds in the order's month; they are never added to a ledger total (as D-225). A SPayLater purchase therefore appears once in Shopee's month and again as ledger repayments.
- **Categories (machine, owner-overridable).** Matched to an order: Shopping. Wallet top-up link: Wallet Top-up. SPayLater repayment link: Shopping. Unmatched at the recurring VIP amount: Subscriptions & Digital, by an amount-specific rule (as D-249). Anything else unmatched: left uncategorised.
- **Where.** A tab on `/orders` ("Food & rides | Shopee", `?view=shopee`), no new nav item: a monthly strip (order count, spent net of refunds, split by payment: bank debit, wallet, SPayLater, other) with a 12-month bar strip computed in SQL, the order list with match states, and the proposals waiting. A matched ledger row shows its order. Not yet: per-shop spending, item search, item categories.

## D-269 — `AGENTS.md` is folded into `CLAUDE.md`; Codex is no longer used

- Date: 2026-10-11
- Status: **Done.**
- **Owner, 2026-10-11:** he no longer uses Codex, so `AGENTS.md`, the cross-harness file, has no second reader. `CLAUDE.md` loads on its own in every Claude Code session, so the rules belong there; a stub pointing at `AGENTS.md` would cost a read every session.
- **Moved:** the finance invariants, the authorization rules and the protocol (D-268's new sections) into `CLAUDE.md`. **Dropped:** the role-routing and coordination prose (`CLAUDE.md` § Subagents already routes to the Claude agents) and the Codex-only section. `.claude/agents/finance-implementer.md`, `finance-investigator.md`, `README.md` and `scripts/check-docs.mjs` now point at `CLAUDE.md`.
- **Removed the same day on the owner's word:** `CODEX_AGENT_WORKFLOW.md`, `.codex/` and `.agents/skills/` (Codex's copies of `sync-continuity` and `impeccable`), 136 files; recoverable from `git log`. The `.agents/**` and `.codex/**` lint ignores are now inert and left alone.

## D-268 — `HANDOFF.md` is retired into the files that own its facts (supersedes D-052)

- Date: 2026-10-11
- Status: **Done** (PLAN task 61, owner's call).
- **Why.** D-052 gave `HANDOFF.md` the facts that were mutable and homeless. In practice it grew to 796 lines, most of them a history of spent grants that no session ever inherits, and every fact it kept had a better home. The `/handoff` skill now writes the per-session note (what is in flight, unpushed, ungranted) outside the repo, so nothing is left for a repo file to carry between sessions.
- **Where each part went.** The headline and next action: `PLAN.md` § Current checkpoint, which was already the first thing read. The reading order, authorization rules and protocol: `AGENTS.md` (§ Continuity documents, § Authorizations and destructive operations, § Protocol). Local-only files, ignored folders, hosted and deploy facts, and local hazards: `docs/LOCAL_DEV.md` § This machine. The per-session grants history is dropped: grants never carried over, and what each one was spent on is in the commits and in the decision entries. Gate histories are dropped: `git log` and the decisions carry them.
- **What else changed.** `CLAUDE.md` starts at the PLAN checkpoint; `scripts/check-docs.mjs` checks `docs/LOCAL_DEV.md` in place of `HANDOFF.md`; the Codex `sync-continuity` skill and the owner's memory prompts point to the new homes. The archives and older gotchas still name `HANDOFF.md` as history; two code comments (`lib/krungthai-layout.ts`, `lib/statement-frame.ts`) cite it as the source of a past rule, read through `git log` if needed.

## D-267 — The twentieth boundary moves D-245 … D-258 on the owner's word

- Date: 2026-10-11
- Status: **Done.** D-245 … D-258 relocated unchanged to [`docs/decisions/ARCHIVE-D-245-D-258.md`](docs/decisions/ARCHIVE-D-245-D-258.md); their index bullets moved to that file's Archived section.
- **Asked for by the owner** with this file at **96%** of its budget after D-266. Same footing as D-251: every entry moved is settled and shipped (categorising and its rules, the Grab services, Libron, the slip readers and the LINE backfill), or is D-251, the previous boundary's record, which this entry supersedes.
- **A new file**, so no existing link moves. **D-259 … D-266 stay**: the slip re-reads, the overlapping-statement import and its duplicate fix (D-260, D-265), the Inbox as the way in, and the Shopee arc the next session starts from. D-141 and D-158 stay as the two open questions.

## D-266 — Shopee orders come from a one-click export of the web order pages (a bookmarklet writing JSON), not a printed PDF (amends D-264); order code and link number stored, never the recipient's name, address or phone; import from the ledger's start

- **Status:** measured and decided 2026-10-11 (owner), import not built. Amends D-264's source; D-264's open questions are answered below.
- **Why not the PDF:** the owner's printed order page keeps a text layer but drops all Thai text and the ฿ sign, and shifts the discount amounts down one row (a reader would store wrong numbers silently). "Webpage, Single File" (MHTML) and "Complete" HTML keep every field exactly; "HTML only" is Shopee's empty app shell.
- **The export:** `scripts/shopee-orders-bookmarklet.js` (uncommitted on purpose: it ships with the import), installed by dragging a link the script prints (`--print`). On the order list it scrolls until the list stops growing, opens each order in a hidden same-origin iframe, reads only order code, status, timeline, shop, items, price rows, total and payment method (never the delivery block), checks in satang that the price rows sum to the total, and downloads one JSON. About 5–15 s per order; the tab must stay open. The owner ran it on his whole history (244 orders, 2020–2026): every order total reconciled; item prices do not sum on gift and bundle-deal orders (Shopee spreads the bundle discount by a few baht), so items are display-only. **Cancelled orders are skipped:** their card links to `/user/purchase/cancellation/<id>`, a different page (refund amount, "Refund to ShopeePay Balance", the original order code) — the script must learn it.
- **Matching, measured against hosted (read-only):** of the 163 orders since the ledger's first row, 139 of the 142 paid "ShopeePay - ตัดบัญชีธนาคาร" matched a `SIPS SHOPEEPAY` bank row by **exact amount in the same minute** (one case had two candidates). Leftovers: one combined checkout (two orders in one minute, one charge equal to their sum); wallet-balance "ShopeePay" orders, which reach the bank only as top-ups; SPayLater, repaid in equal monthly instalments; a monthly Shopee VIP charge (owner); cancelled orders refunded to the wallet; four orders before the first Shopee bank row.
- **Owner decisions:** store the order code (the idempotency key) and the number in the order link (build the URL from it; `?type=6` is only the list tab); never store the recipient's name, address or phone (some are other people's); export everything, import from the ledger's first row onward. The JSON export stays in `receipts_sample/shopee/` (ignored).
- **Open (next: `/grilling`):** SPayLater instalments ↔ orders, wallet top-ups, the combined-checkout rule, cancellations and refunds, and where the import lives (beside `/orders`).

## D-265 — `confirm_import` links a re-printed bank row by its identity facts instead of inserting a duplicate (migration 054); the four duplicates already stored are Excluded; D-260's safety claim holds one way only

- **Status:** live 2026-10-11 — migration 054 pushed to hosted (dry-run named only 054; the hosted function carries the change and `anon` still has no execute), commit `a50f8fa` (not yet pushed to GitHub).
- **Found** while matching Shopee orders: two KBank rows with the same account, minute, amount and post balance. A hosted scan found four such pairs, each from two statements whose periods overlap: three are KBank's English and Thai prints of the same rows (D-238), one is the same row with its Details wrapped differently. `rowFingerprint` (`lib/canonical.ts`) hashes the printed label, description and branch, so each re-print hashed new and was inserted. **D-260's "a stored fingerprint is that same bank row" holds one way only:** the same bank row does not always give the same fingerprint.
- **Fix:** when no row has the exact fingerprint, `confirm_import` links to an existing row of the same owner and account with the same date, a non-empty equal time, the same post balance and the same ordered components, not already claimed by the current batch, oldest first; otherwise it inserts. Rows without a time keep exact-only matching. Two genuinely different rows cannot share all of these in a running balance (components are never zero). The audit detail counts `identity_links`. The per-owner advisory lock already serialises writers, so the plain select-then-insert replaces `on conflict do nothing`; a clash raises rather than merging.
- **The stored duplicates:** the four later copies were marked Excluded with the ledger's Exclude button (owner preferred that to a new "duplicate" kind; rows are never deleted). Overlay notes have no edit control and are not shown, so they carry no note; this entry is the record.
- **Known gaps:** the Inbox and mailbox pre-count (`lib/server/inbox-statement.ts`, `lib/server/fingerprint-lookup.ts`) still counts stored rows by exact fingerprint, so a re-printed overlapping statement is reported as new rows and records an all-linked batch (the ledger is right; the sentence is not). Claim-once within a batch has no test (no reconciling statement can contain two such rows).
- **Evidence:** three cases in `tests/import-confirm-e2e.test.ts`, the link case red-proved (fails with 054 removed, passes with it); Vitest 89 files, 1,736 passed / 18 skipped; pgTAP 32 files, 818; tsc clean; lint 0 errors; `finance-reviewer`: ship.

## D-264 — Shopee orders come from the web order-detail page saved as PDF, not from mail; D-158's unbounded candidate scan stays until it is slow

- **Status:** decided 2026-10-11 (owner), nothing built. Recorded in `PLAN.md` § Current checkpoint.
- **Shopee source.** The owner places under 10 orders a month (ShopeePay, card/bank, SPayLater) and wants bank-row matching, items and monthly totals. Shopee TH sends no per-order mail: `from:shopee` in his main Gmail holds only 15 e-Tax invoice PDFs since 2025-05 (Scommerce, sent only when a seller issues one). The phone app needs several screenshots per order; the web order-detail page (`shopee.co.th/user/purchase/order/<id>`, read once in Claude in Chrome on the owner's ask, nothing kept) carries order ID, placed and paid times, shop, items, vouchers, total and payment method on one page. **Chosen: print it to PDF and drop it on the Inbox** — expected to carry a text layer (no Vision, exact amounts) and keeps the delivery address off Google Vision. Not chosen: a web screenshot (longer than a screen; sends the address to Vision), a PDPA data-access request (slow, format unknown; at most a one-off backfill), scripting Shopee's API (fragile; no order-list request seen in the page's traffic). **Open:** whether the saved PDF has a text layer and keeps every section; SPayLater pays as one monthly repayment, so its orders cannot match a single bank row.
- **D-158's scan.** `list_match_candidates` sums every ledger row's components before filtering: 43 ms over 1,812 rows on hosted (`explain analyze` of its `movements` CTE). Left as is (owner). When slow: bound the automatic candidates to `MATCH_WINDOW_DAYS` / `CARD_MATCH_WINDOW_DAYS` (±1 day, `lib/slip-reconcile.ts`, `lib/notification-card-reconcile.ts`) on the in-force (corrected) date, keep the decided-row union, and fetch the manual chooser's unbounded set lazily — the eager "N rows could be this" counts are what tie the page to the unbounded set. A stored movement column with an index would change no answer but is a backup-contract change; a cap with a truncated flag risks a wrong `verified` (D-063).

## D-263 — The Inbox is the way in: Import and Slips leave the main nav as Inbox fallbacks, and the `/slips` backlog upload is removed

- **Status:** live 2026-10-11 (`06f2471`), no migration. Owner's call on the agent's recommendation.
- **Why not delete the pages:** the Inbox hands off to both — "Review on Import" and "Open the rest on Import" (locked or held statements; password, account choice, review before confirm), and "Add on Slips" (D-261). So `/import` and `/slips` stay, linked from the Inbox intro ("By hand: import a statement · add a slip"), and leave `ROUTES` in `app/site-header.tsx`.
- **The backlog upload** (`app/slip-batch.tsx`) duplicated Inbox "Add files" and is deleted, which also retires PLAN's old step "the year re-read on the `/slips` batch page". `lib/slip-batch.ts` stays: the Inbox drain uses it. Possibly orphaned `.batch-*` rules remain in `app/globals.css`; some also serve `app/statement-batch.tsx`.
- **Evidence:** Vitest 89 files, 1,733 passed / 18 skipped; tsc; lint 0 errors; the header e2e in `tests/e2e/ledger.spec.ts` (desktop and mobile) asserts the two links are absent from the header and reachable from `/inbox`.

## D-262 — A printed date line may end in a stray mark (`>` read off a Krungthai background); the end-anchored date pattern had reported no date, so the year re-read never ran

- **Status:** live 2026-10-08 (`2106e5b`), no migration. Investigated on the owner's ask, on the last queued slip ("No line on this image reads as a date").
- **Measured** in the pane (owner's grant; nothing kept): the slip's year was the known 6-read-as-5, and its enlarged year crop read correctly — the re-read was never reached. Encoded the way the Inbox encodes it (`createImageBitmap` → PNG), Vision read the date line with a trailing `>` from the background pattern, 3 of 3 times; drawn from the page's `<img>` it did not. `PRINTED_DATE` is anchored at the end (D-250's KBANK split depends on it), so the line was not a date: `DATE_NOT_FOUND` instead of `DATE_OUT_OF_RANGE`.
- **Fix:** `PRINTED_DATE` accepts trailing characters that are neither letter nor digit. They cannot move the year/time split, which is digits only. Two tests (a trailing mark reads; a misread year with one still reports out of range) red-proved.
- **Live:** the slip imported on the next open (632 slips); the queue is empty. **Lesson:** reproduce a drain refusal with the drain's own encoding; the page's `<img>` gives Vision different pixels.
- **Evidence:** Vitest 89 files, 1,733 passed / 18 skipped; eslint clean.

## D-261 — A queued slip that needs checking has "Add on Slips": `/slips?inbox=<name>` loads it into the single-slip form and removes it from the queue once the ledger stores it

- **Status:** live 2026-10-08 (`33a7763`), no migration. Asked for by the owner: the queue's "Add it on the Slips page" had no link, so a slip meant re-picking the image from his phone.
- **How:** the queue row shows a `secondary-button` "Add on Slips" for every slip that needs checking (a review verdict, a remembered one, a refused amount, or a capture the ledger refused), not for a network failure. `isInboxImageName` (`lib/inbox-queue.ts`) accepts only an upload's `<uuid>.png|jpg|webp` or a LINE `line-<ms>-<id>.jpg|png` before any Storage call. `app/slip-capture.tsx` downloads that object from the owner's folder and hands it to the same `onFile` a picked file uses (preview through the `blob:` URL that path already made; CSP unchanged). After the ledger answers captured or already stored, the object is removed and the page says so with a link back; a refused capture keeps it; removal failure says the slip is saved but still queued. A file picked by hand afterwards never removes the queued one.
- **Limits:** the single-slip form takes a QR identity only, so a no-QR slip (D-258) still cannot be finished there (cash entry remains). The amount is not read automatically on arrival — the page's own promise is that nothing goes to Vision until "Read the amount" is pressed.
- **Live:** the queued Krungthai slip opened from its button with its QR read and reference filled; not saved by the agent.
- **Evidence:** Vitest 89 files passed (9 new in `tests/slip-inbox.test.tsx`; the removal tests red-proved); tsc clean.

## D-260 — A statement that overlaps the ledger is imported (its new rows) with a count of new and already-stored rows, instead of being held; Review on Import is a button

- **Status:** live 2026-10-08 (`b09cfe7`), no migration. The owner's choice, after three mailbox statements were held as "Some rows … already in the ledger, so it waits for a look" and he had not seen that "Review on Import" was a link.
- **Why it is safe:** `rowFingerprint` (`lib/canonical.ts`) covers date, time, label, description, reference, amounts, **post-balance** and branch, so a stored fingerprint is that same bank row; `confirm_import` skips it (`on conflict do nothing`). The old hold existed because the skip is silent, not because it is wrong — the count now makes it visible.
- **How:** `lib/server/inbox-statement.ts` pre-counts stored fingerprints; some stored → the same `confirmImport` as a clean statement (so the same transfer exclusion and categoriser), returning `existingRows` beside `rowCount`; all stored → nothing confirmed, `{kind: "duplicate"}`, handled like an already-imported file (removed from the queue, mailbox message flagged). `confirm_import` returns only the batch id, so "new" is `rowCount − existingRows` from the pre-count; a concurrent import between count and confirm could make the sentence slightly off, never the ledger. Wording: "Statement X: 12 new rows imported, 30 already in the ledger." The remaining holds keep their reasons, and the mailbox "Bank statements" line's Review on Import is now a `secondary-button`.
- **Evidence:** Vitest 88 files, 1,722 passed / 18 skipped; the 5 new overlap and all-stored tests red-proved against the old server file; tsc, eslint clean. Not yet seen live with a real overlapping statement (the owner's next Sync).

## D-259 — A refused slip amount is read again from an enlarged crop (2×, then 3×) under the same grammar; a verdict a retry could change is not remembered, and a capture the server refused is

- **Status:** live 2026-10-08 (`54dac39`), no migration. Owner-approved (D-258's PLAN steps 1 and 2); he wants a slip that still fails to stay queued so it can be studied.
- **Amount:** when `proposeAmount` refuses beside a label it found, `locateAmount`'s box is cropped (`paddedCrop`) and read at 2×, then 3× only if 2× still fails: at most 2 extra Vision calls. The crop's words go through the *same* `proposeAmount` (label and strict grammar), so nothing lenient is added; a label Vision misreads in the crop leaves the slip in review. The year re-read (D-257) became one case of `rereadBox(file, box, crop)` with its own crop unchanged (3×). Live: the queued slip whose `23.00` Vision read as `23,00` imported on the first open.
- **Remembering:** a review decision carries `retryable`, set where it is made: true when the reader failed or a second read (amount or year) was tried and gave nothing usable, and then the verdict is **not** remembered, so the next open reads the slip again. A definite review stays remembered per build. A capture refused with 409 or another 4xx carrying a reason is remembered too, so a refused slip stops costing a Vision read each open; 401, 403, 408 and 429 are not (session or load, not the slip), nor network or 5xx failures. The remembered entry shows the generic "needs checking" reason, not the server's text (the memory format is unchanged).
- **Cost to know:** a retryable slip is re-read through Vision on every `/inbox` open until it imports or is removed — the queued ฿-amount slip whose year re-read fails is one now.
- **Evidence:** Vitest 87 files, 1,712 passed / 18 skipped (DB suites skipped locally); 12 new tests; the 2× success and the not-remembered tests red-proved; tsc and eslint clean.

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
