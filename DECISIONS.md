# Private Ledger decision log

Last reviewed: 2026-08-09

Entries are append-only. A superseding decision must reference the earlier entry rather than rewriting its history.

This file carries **D-141, D-158, the four entries the phone reading did not reach, and D-187** — two
open questions, both below the range the twelfth boundary moved, and what the thirteenth left behind
because it is still fenced. **D-141**:
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
**D-177 … D-186** to
[`docs/decisions/ARCHIVE-D-177-D-186.md`](docs/decisions/ARCHIVE-D-177-D-186.md) — begun on
2026-09-04 without **D-179 … D-181, D-183 and D-184**, which were fenced by an unfinished reading,
and **completed on 2026-09-13** when the budget asked and that fence had already been discharged.
The index below covers all fourteen files, so a reader can find any entry without opening any body.

**Every boundary sits where an argument ends rather than where a number is round**, and the fourth one is the clearest case of that rule so far. It was taken at **93%** of this file's byte budget and moved the whole arc in which both readers went to Cloud Vision and the local OCR engine was deleted. **The third boundary had explicitly refused to move D-120**, on the grounds that whether pre-fill stays was undecided and that question attached to D-120 and D-129 — which was true when written. **What closed it was not an argument but a shipped feature**: D-135 files a machine-read amount into the ledger without the owner looking at it at all, which is a stronger commitment than the trial ever asked for. *A question is closed when the code has stopped asking it*, and that is the test to apply at the next boundary rather than re-reading the prose.

**What this file now holds is two open questions and the seven entries above them.** The mailbox
archive (D-141) and the unbounded candidate scan (D-158) remain open and are the whole of what is
unanswered; D-187 … D-193 sit above them, each settled but recent.

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
### Current 
—
 this file

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

## D-193 — D-192's two recorded-not-built cleanups are built: the ledger's load issues its requests in two waves instead of nine in series, and the row components take one `LedgerActions` prop

- Date: 2026-09-13
- Status: **Built, reviewed and gated.** No SQL, no route, no contract change, nothing the owner sees changes except how soon the ledger arrives. Commit and push were granted this session, re-stated from the D-192 handoff's list (real-data read via the hosted browser, commit, push); read `git log` for the hash rather than this entry, which cannot record its own.
- Context: D-192 recorded both as structural debt in `app/transactions-view.tsx`, the busiest file in the repo, and left them for a session of their own so neither rode along with a bug fix.
- **The load: requests start together, results are still read in the old order.** After `accounts` resolves, every per-account page, `match-candidates`, `slips`, `cash`, `notification-cards` and `categories` are issued at once, and the existing sequence of `await`s now reads those already-started promises. **That one change is the whole design**, because it keeps every property D-192 named as load-bearing without re-deriving any of them: a failed page or candidate set still returns before slips, cash or cards are touched; each `superseded()` guard still sits before the commit it protects; the fail-hard/fail-soft split still reads exactly as it did; the clear-before-read of slips, cash and cards and the deliberate non-clear of `categories` are in the same places; the first failing account is still the one reported. The fail policy stayed control flow rather than becoming a value, because with the reading order unchanged there was nothing left for a value to protect.
- **Two waves, not the three D-192 estimated.** `accounts` stays alone in the first wave for two reasons beyond the page loop needing its list: a signed-out arrival still costs one 401 rather than six, and any session-cookie refresh `strongOwnerClient`'s `getUser` performs lands in the browser once, before the concurrent wave, rather than being attempted by six requests at once.
- **Safe to start early because `ledgerRequest` never rejects** (`lib/wire.ts` catches transport failure and unparseable bodies and returns a result), so a request left unawaited by an early return cannot surface as an unhandled rejection. **The five routes are reads** — `select`s and `list_match_candidates` — so issuing them when a page then fails costs load, not state. The one real cost: D-158's unbounded candidate scan now runs alongside the page RPCs rather than after them.
- **Whether the old sequence was incidental was inferred from the code and then tested, not timed.** Nothing in the comments justified the order, only the failure policy; the owner suite, which exercises loads racing a cash payment's reload, slip and card decisions and corrections, passes unchanged. No network-timing measurement was taken, and nothing has been read on the deployment.
- **The actions: `LedgerActions` in `app/ledger-shared.ts`, assembled once in `transactions-view.tsx`.** It replaces **twenty-one** threaded callback props across the four row components (statement 9, card 5, slip 4, cash 3) with one prop of fifteen verbs; the card row's inline `not-a-payment` closure became a direct `actions.decideCard` call. The doc comments that justified individual props (why `setReporting` takes the whole transaction, why `toggleCorrecting` is shared table-wide) moved onto the type rather than being dropped. `categories` and `categorySaving` stay separate props, as D-192 asked — data, not verbs.
- **`LedgerControls`' eight callbacks were deliberately left alone**, although D-192 listed them beside the row's. They are value/setter pairs rendered at exactly one call site, so bundling them removes no threading and separates each setter from the value it pairs with — the cost D-192 described is per row kind, and the controls have none.
- **`/code-review high` found one defect, fixed**: the new type's comment said seventeen props, a figure carried over from the handoff that mixed in `LedgerControls`' eight. No code finding.
- Gate, sequential, against the running local stack: `tsc` clean, `eslint .` clean (the same 2 pre-existing `exhaustive-deps` warnings in `app/transactions-view.tsx`), `check:docs --strict` clean, Vitest **970 passed / 7 skipped across 44 files**, `pnpm build` clean, Playwright **isolated 70 passed / 8 skipped** and **owner 34 passed** — every figure identical to D-192's baseline, which is the expected result for a change meant to alter no behaviour. pgTAP not re-run — no SQL moved. **No new assertion was added, so there is nothing to red-prove**; the evidence is that the existing suites did not move.
- Evidence: `app/transactions-view.tsx` (`load()`, the `actions` object and the four row call sites), `app/ledger-shared.ts`, `app/ledger-statement-row.tsx`, `app/ledger-card-row.tsx`, `app/ledger-slip-row.tsx`, `app/ledger-cash-row.tsx`. D-192 (where both were recorded), D-158 (the scan now running concurrently), D-125 (review before the commit).

## D-192 — A quality and architecture audit found the sync reporting an empty mailbox for a truncated scan, and the archived-category carve-out written twice with only one copy right — fixed and deployed as `0573a8a`

- Date: 2026-09-13
- Status: **SHIPPED.** Committed as `0573a8a`, pushed to `origin/main`, deployed, and the reachable half confirmed on the real hosted ledger in the owner's own signed-in session.
- Context: the owner asked for two strict reviews of the whole codebase at `4d63dc9` — a maintainability audit and an architecture-depth scan. Three read-only reviewers ran in parallel over the two most recent feature landings (D-189's mailbox sync, D-190's categories) and the ledger/statistics hot spot. **Every finding was re-verified by hand against source before being acted on, and three did not survive that check** — which is the part of this entry worth keeping.
- **The defect that mattered: `describeManifest` could tell the owner his mailbox was empty when the scan had simply stopped.** `7eb2b93` (D-189) added `MAX_SYNC_MESSAGES_SCANNED` as a second, independent trigger for `truncated`, bounding messages *examined* rather than attachments *found*. `describeManifest` answered its empty case before ever consulting the flag — provably safe while the attachment cap was the only setter, since that cap cannot trip with an empty list, and wrong the moment the scan cap could. With the newest 200 matching messages all already flagged, a sync examines all 200, finds nothing new, and reported *"No statement mail found from the configured senders."* The search is newest-first and the window control offers no "older than", so **the owner had no route past it and every retry repeated the same false sentence**. Missed by two rounds of `/code-review high` and two `/security-review` passes on D-189.
- **It may already have misled this repo's own records.** `HANDOFF.md` and `PLAN.md` both cited that exact sentence as evidence that no unflagged mail remained in the mailbox, and used it to explain why D-189's live verification could not be completed. That inference is only sound if the mailbox holds fewer than 200 matching messages. It probably does — the measured shape is 14 PDFs across 10 messages — so the conclusion is most likely correct, but it was never a safe reading and is no longer offered as one.
- **The two truncation cases are now worded apart deliberately, and the asymmetry is the design.** With attachments found, confirming them flags their parts, so the next scan skips past and reaches deeper — *"import these and sync again"* is true advice. With nothing found, the same newest messages are re-examined, all still flagged, and the answer cannot change — so that branch says so plainly instead of sending the owner back to a button that cannot change its own outcome. A test pins both directions.
- **The second defect: an archived category could still silently erase an assignment.** D-190 reasoned this through in `OverlayCategoryForm` and left the logic inline. `CorrectionForm` — mounted by every slip, cash and card panel, and never reviewed for it — filtered archived categories with no carve-out for the record's own. Dropped from the list, the select's `value` matches no `<option>`, the browser paints it blank while `category_id` is untouched, and an owner "correcting" the blank erases a real assignment. Now `pickableCategories` in `lib/categories.ts`, called by both: a net deletion that closes the path in the component that carried it.
- **The third: `CorrectionForm` went around the canonical wire layer** — a raw `fetch` with a bare `.json()`, a cast standing in for `categoryListSchema`, a failure swallowed by a bare `return`, and a mount effect that re-ran per instance, so expanding three panels issued three more requests for a list the ledger already held in state. Two sources of one list, free to disagree. It takes the list as a prop now, as `OverlayCategoryForm` already did.
- **Reviewing that change found two defects of its own making, and this is the second time in two sessions that reviewing the fix mattered more than reviewing the bug.** (1) The new truncation sentence advised a retry that provably cannot work — corrected before commit. (2) `setCategories([])` ran before the categories fetch, so every reload passed through an empty-list moment; harmless while the form fetched its own list, a regression the instant it read a prop, because an open correction panel's picker would blank exactly as the defect above describes. Removing the clear also made the code match what its own comment had always claimed it did.
- **Three claims were refuted by verification and are recorded so they are not re-proposed.** (a) The slip, card and cash pipelines look like duplicated triplets by their exported names, but already share `applyCorrection` in `lib/corrections.ts`; where they diverge, **D-102** (a card reconciles on its printed balance, breaking a tie a slip cannot), D-117 and D-120 explain why. Merging them would contradict three decisions to delete perhaps fifteen lines. (b) `lib/statement-layout.ts` is not a 1,174-line problem: **7 exports over 1,174 lines**, 252 of them comment, most of the bulk declarative bank-layout descriptors — a deep module, and what good looks like here. (c) D-189's `uid`/`part` threading earns its keep; the alternatives need either a third durable store or coupling the append-only ledger write to IMAP latency on every confirm.
- **The file-size alarm was recalibrated rather than acted on.** These files run 21–33% comment, and the comments carry incident history rather than restating code. `app/transactions-view.tsx` is 1,583 lines but ~1,061 of code; `lib/statement-layout.ts` ~922; `tests/privacy.test.ts` ~697. **Nothing in the repo exceeds 1,000 *code* lines.** `transactions-view.tsx` remains the one genuine concern, mostly because it is also the busiest file in the repo — nine of the last sixty commits.
- **Recorded rather than built**, and left for a deliberate session because both touch that busiest file: `load()` serializes nine round trips where three dependency waves would do (only `accounts` is a real dependency; `match-candidates`, `slips`, `cash`, `cards` and `categories` are mutually independent, as are the per-account pages) — and `app/notification-card-capture.tsx:334` already establishes the `Promise.all` precedent, so this is the codebase following itself rather than a new abstraction; and `LedgerStatementRow`'s nine callback props with `LedgerControls`' eight are a shallow interface that costs a new prop at every call site per feature.
- Fixed: `lib/statement-sync.ts` (the flag consulted first, both branches reworded, the `truncated` field's own doc corrected — it still claimed the attachment cap was the only setter), `lib/categories.ts` (`pickableCategories`), `app/correction-form.tsx`, `app/overlay-category-form.tsx`, the three ledger row components, and `app/transactions-view.tsx`.
- Gate: `tsc` clean, `eslint .` clean (the same 2 pre-existing warnings in `app/transactions-view.tsx`, untouched), `check:docs --strict` clean, Vitest **970 passed / 7 skipped across 44 files** (+8), `pnpm build` clean at the same route count, Playwright **isolated 70 passed / 8 skipped** and **owner 34 passed**. **pgTAP not re-run — no SQL moved.**
- **The truncation fix red-proves.** Reverted to the pre-fix early return, the new assertion fails on the exact false sentence the owner would have read: *"expected 'No statement mail found from the conf…' not to contain 'No statement mail found'"*. The fix was restored from a backup taken before the revert and the suite re-confirmed green.
- **What could not be verified live, stated rather than glossed.** `CorrectionForm` is unreachable on the real ledger right now — every slip and card is verified and collapsed onto its statement row, and no cash entry is in the window — so its picker was confirmed by the owner Playwright suite (which does exercise correcting a cash entry and a slip) rather than by eye. The truncation branch cannot be triggered live either: the mailbox holds far fewer than 200 matching messages, so the honest empty case is what a real sync would print. Its evidence is the red-proof, not the deployment.
- Evidence: `git log` — `0573a8a` on `main`, `origin/main` matching. On the deployed build, in the owner's own signed-in session: `/ledger` renders, a row's "Edit category" panel opens with its picker populated and closes on Cancel, and the console carries no errors. **Read-only — nothing was saved, no category created or archived, no note written.** No real financial figures are reproduced in this entry, per D-049; every number here is a line count, a test count or a commit hash. D-189 (the commit this corrects), D-190 (whose carve-out this makes canonical), D-102 (why the pipelines stay separate), D-125 (review before every commit ask, honoured here on the audit's own diff), D-049 (value-free writing).

## D-191 — A row count that looked doubled was a stale test locator counting day-heading rows as data, not a ledger defect — resolved same day, `38ed7d4`

- Date: 2026-09-12
- Status: **RESOLVED, same session, fixed and pushed as `38ed7d4`.** Opened as an apparent data-integrity emergency; closed as a test-suite staleness bug once traced to its source. The corrected severity matters as much as the fix — read both halves below.
- Context: while gating D-190 for commit, `tests/e2e/owner-session.spec.ts`'s `reads a confirmed import back, and switches between merged and per-account` failed — importing a 4-row synthetic statement through the real "Confirm import" button showed **8** `tbody tr` elements, exactly double, with no "could not be confirmed" refusal shown.
- **What the first pass of isolation correctly ruled out, and what it wrongly implied.** Reproduced against `main` at `5d8ba83` (the commit immediately before D-190, via a throwaway `git worktree`, no categories code present) with a freshly `supabase db reset` local project immediately before the single test ran alone — same result. This correctly ruled out D-190's code and the separate cross-suite collision this same session hit from running several database-backed suites concurrently (see `HANDOFF.md` and the new `docs/gotchas/tests.md` trap). **What it did not do is check whether the ledger itself held 8 rows, or only looked like it did** — the framing at that point ("the confirm believes it succeeded once; the ledger holds two copies") was a plausible-sounding inference from a locator count, not a measurement of the database.
- **The actual measurement, taken next, closed it in one pass.** Three independent readings, each against the same reproduction: (1) the Playwright trace's own network log showed exactly **one** `POST /api/v1/imports/confirm`, response `201`, with exactly **4** fingerprints in both the request and the response; (2) `docker exec`-ing `psql` directly against `private-ledger-local` mid-run, polled every two seconds, showed exactly **4** rows in `source_transactions` for the imported account, with the 4 distinct fingerprints matching the confirm response byte for byte; (3) the same GET `/api/v1/accounts/.../transactions` response the page itself received carried `"totals":{"rows":4,...}` and exactly 4 row objects. **The database, the RPC and the route were correct at every layer, on the first attempt, with no fix needed anywhere in application code.**
- **The actual mechanism.** `app/transactions-view.tsx`'s ledger table renders one `<tr className="day-head">` per distinct calendar date, on top of each transaction row, whenever `groupByDay` is true — which it is by default (`useState(true)`) and was never toggled off by this test. D-182 (2026-09-01) shipped this, verified it on the real deployment, and it has worked correctly ever since. The synthetic statement's 4 rows land on 4 different dates, so the table legitimately renders 4 heading rows + 4 data rows = 8 `<tr>` elements. `tests/e2e/owner-session.spec.ts` was written before day headings existed and its `ledger.locator("tbody tr")` assertions were never updated to exclude them — every one of the thirteen tests that failed in this session's runs did so for this exact reason, on fixtures spanning more than one date.
- **Why nobody caught this for eleven days.** The owner Playwright suite had not completed a clean run since D-187/D-188 on 2026-09-04, three days *before* D-182 shipped — every session in between either had no Docker running (this repo's most common local hazard) or, this one, hit the failure and initially misread it rather than tracing it before moving on. The gap between a feature shipping and its own regression test suite next running clean was eleven days, not because the feature was wrong but because nothing ran the suite that would have caught the drift the day it happened.
- Fixed: all 23 occurrences of `.locator("tbody tr")` in `tests/e2e/owner-session.spec.ts` now read `.locator("tbody tr:not(.day-head)")` — a single mechanical, uniform replacement, verified safe because `.day-head` is a class unique to the ledger's own heading rows and never appears on any other table this spec queries. Full owner suite re-run against a fresh reset: **34 passed**, zero failures, zero skips.
- Evidence: the trace network log and its request/response bodies (both showing exactly 4 rows), the polled `psql` count during a live re-run (exactly 4, matching fingerprints), the GET response body (`totals.rows: 4`), `eslint` clean on the changed file, and the full owner suite at 34/34 green post-fix. D-182 (the feature this test never accounted for), D-190 (ruled out as a cause), the new `docs/gotchas/tests.md` trap on running database-backed suites concurrently (a genuine, separate issue this same session also hit and fixed).
- **The lesson worth keeping**: a locator count is a claim about the DOM, not about the database, and the two were conflated for most of this investigation's first half. The fix that mattered was reading the trace and the database directly rather than trusting the test's own interpretation of what it saw.

## D-190 — PLAN task 25's manual half ships: category CRUD and a per-transaction category/note editor, built on an overlay layer that had carried the columns since migration 001 with no caller

- Date: 2026-09-12
- Status: **Built, reviewed, three defects fixed, committed and pushed** (`acb853e`). `lib/categories.ts`, `app/categories/page.tsx`, `app/categories-bench.tsx`, `app/categories-list.tsx`, `app/overlay-category-form.tsx`, `tests/categories.test.ts`, plus wiring in `app/ledger-statement-row.tsx`, `app/transactions-view.tsx`, `app/site-header.tsx`, `app/globals.css`, and three e2e specs adding `/categories` to their route lists. No SQL: `public.categories`, `mutate_category` and the `transaction_overlays.category_id` column all predate this by PLAN task 25's own account — the RPCs existed with no UI ever calling them (live held 1 category against 1,465 transactions).
- Context: this is PLAN task 25's manual half only — a category picker and CRUD, not the automatic categorisation by local LLM the task also describes, which remains entirely unbuilt and unscoped by this work.
- What shipped: `/categories` creates, renames and archives categories (`GET`/`POST`/`PATCH /api/v1/categories`, pre-existing routes, first real caller). Each confirmed ledger row gets an "Edit category" panel writing `category_id` and `note` through the existing `PUT /api/v1/transactions/[id]/overlay` via `overlayWriteBody`, which narrows rather than replaces the overlay so an unrelated field is never erased. An archived category stays visible (never hidden) on any row that already carries it, read from the unfiltered `categories` list rather than the picker's active-only one.
- `/code-review high` found ten defects across recall-biased finder angles; three real correctness bugs were fixed before commit:
  1. The edit picker filtered archived categories out of its `<option>` list while still seeding the select's value from an archived assignment, so the control silently rendered as "Uncategorised" for a row that still carried one — risking exactly the erasure `overlayWriteBody` exists to prevent, reintroduced through the UI rather than the wire format. Fixed: the row's own assigned category, even archived, now always rides along as a labelled option.
  2. `saveCategoryOverlay` closed whichever panel was open (`setCorrecting(null)`) rather than only its own, so a slow save for one row could discard a different row's still-open, unsaved edit. Fixed with a functional updater comparing the resolving transaction id.
  3. The row's own "Edit category" toggle stayed enabled during its own in-flight save (only cross-row toggling was blocked), allowing the panel to be closed and unmounted mid-request. Fixed by lifting a `categorySaving` flag out of `OverlayCategoryForm` into `TransactionsView`, mirroring how `settingReporting` already gates the reporting control.
- Recorded rather than fixed, all lower-severity or requiring scope this pass did not cover: `mutate_category`'s update path has no optimistic-concurrency/revision check (`update ... where id=p_id and owner_id=v_owner`, no `expected_revision` compare) unlike every overlay write in this app — pre-existing, newly reachable now that categories has real usage; fixing it needs a migration plus its own backup-verified `db push` ask, not taken this session. Also recorded: the edit form's `categoryId`/`note` don't resync if the transaction's overlay changes while the panel stays open across a background Reload; category create and rename/archive are not mutually exclusive despite the file's own comment claiming they are (low real-world cost — different ids); the categories fetch sits sequentially on `TransactionsView`'s load-and-commit critical path though nothing renders synchronously from it; a row's category-chip lookup is a linear `find` where `accountsById`'s `Map` pattern already exists one prop over; the load-on-arrival/retry-after-sign-in effect pair is duplicated near-verbatim from `TransactionsView` into `CategoriesBench` rather than shared; and `tests/e2e/owner-phone-audit.spec.ts` now visits `/categories` but never seeds an actual category, so the new rename `.link-button`'s real tap-target size (text-width only, the same shape `Load older rows` once shipped undersized as, D-168) is never measured.
- `/security-review` found nothing: cross-owner access is scoped by the pre-existing RLS/RPC `owner_id = auth.uid()` checks and the overlay's composite FK to `(category_id, owner_id)`; no `dangerouslySetInnerHTML`; all user-controlled strings render as JSX text.
- Evidence: full sequential gate against a freshly reset `private-ledger-local` (concurrent runs earlier in the session collided on shared owner state and were discarded, not counted) — `eslint .` clean (the same 2 pre-existing warnings), `tsc --noEmit` clean, `check:docs --strict` clean at **189 decisions and 202 traps**, Vitest **962 passed / 7 skipped across 44 files** (+85 net vs. the D-189 skip-heavy run, now that Docker/local Supabase is up), pgTAP **all 13 files, 390 assertions**, `pnpm build` clean at the same route count, Playwright isolated **70 passed / 8 skipped** including axe over `/categories` in all four colour schemes on desktop and mobile. **Playwright owner not counted as evidence for this feature**: see D-191 — it fails on an unrelated, pre-existing defect that reproduces identically with this commit's code absent.

## D-189 — A repeat mailbox sync re-offered files it had already fetched, and the honest place to record that turned out to be the confirmation, not the download

- Date: 2026-09-12
- Status: **Built, reviewed twice over, fixed, committed.** `lib/statement-sync.ts`, `lib/server/statement-mailbox.ts`, `lib/server/statement-mailbox-session.ts`, `app/api/v1/imports/mailbox/attachment/route.ts`, `app/statement-sync.tsx`, `app/statement-batch.tsx`, `app/import-bench.tsx`, `tests/statement-mailbox.test.ts` (+5), `tests/privacy.test.ts` (+1). No SQL, no new route, no contract change — the existing attachment route gains a `POST` beside its `GET`.
- Context: the owner noticed the hosted Sync button (D-145) re-listed every matching statement on each pass, so a repeat sync re-downloaded files already fetched through it. D-145 had explicitly declined a watermark for this on the grounds that inventing server-side state for a button pressed by hand was not worth it, and D-144's local fetcher had separately decided to leave the mail untouched **because it believed the dedicated mailbox also lived in the owner's main mail** — flagging a message there would have flagged it in his main inbox too. The owner confirmed this session that the statement mailbox is in fact a fully separate account, which is what made marking it available at all.

### The mechanism, settled from the first draft and unchanged since

**Mark each fetched attachment with a custom IMAP keyword on the mailbox itself, and leave it out of the next manifest.** `fetchedFlag(part)` in `lib/server/statement-mailbox.ts` folds a part path's dots into dashes to make a legal keyword (`PLFetched-1-2`), and `unfetchedParts` filters a message's PDF parts against its own flags before they reach the page — **per-part rather than per-message**, because a statement mail routinely carries two PDFs (D-144) and downloading one must not hide the sibling that has not been fetched yet. `markFetched` in `lib/server/statement-mailbox-session.ts` sets it via `imapflow`'s `messageFlagsAdd` and is best-effort: a failed flag call costs one repeat offer next sync, never a failed operation the owner is looking at.

**This reverses D-144's retention call for the hosted route only, not for the local script.** The script still owns the folder it writes to and dedupes by checking whether a same-named file already exists there — it has no need to mark anything on the server and stays untouched. The route has no folder, so it now asks the mailbox what it has already been told to keep.

**Client-side `localStorage` and a new server-side ledger table were both considered and rejected**, for the same reasons D-145 rejected a watermark in the first place: `localStorage` resets on cleared site data or a different browser/device, and a fetched-log table is exactly the persisted state D-145 argued against, needing a migration for a fact the mailbox can already hold itself.

### What moved: when the flag gets set, and why the first answer was wrong

**The first draft flagged a message the moment its download stream completed**, called from inside `GET .../attachment`. Built, reviewed (`/code-review high` found one real regression, below; `/security-review` found nothing) and **verified against the real mailbox**: two syncs of "Last 30 days" against 14 real PDFs across 10 real messages (two of them carrying 2 statements each) showed the second sync correctly reporting nothing.

**That verification is also what exposed the defect in the design, not just in the code.** The 14 real statements it downloaded were left sitting in the batch, unconfirmed — and because they were already flagged, a browser closed before typing the password would make them permanently unrecoverable by Sync, with no path back except finding the PDFs some other way. **The owner asked for the fix directly: flag on confirm, not on download.** The mailbox's record of "fetched" needs to agree with the ledger's own record of "imported," and only the confirmation actually establishes that.

**The redesign moves the write to a new `POST` on the same route** (`app/api/v1/imports/mailbox/attachment/route.ts`), called once from `app/import-bench.tsx`'s `confirmBoundImport` right after `/api/v1/imports/confirm` succeeds — fire-and-forget, since the confirmation the owner is looking at has already happened and this call failing only costs one repeat offer. Getting there took carrying a `uid`/`part` pair the whole way from the mailbox listing through to the confirmation, a path that previously ended at a bare `File`: `MailboxRef`/`MailboxFile` (`lib/statement-sync.ts`) are carried by `BatchFile.mailboxRef` and `BatchHandoff.mailboxRef` through the batch and the stage machine, reset to `null` at every point a chosen file or a synthetic statement takes their place, since neither has anything to report to a mailbox. `POST` re-verifies `uid`/`part` against the configured senders exactly as `GET` does, at the cost of one more IMAP round trip on a path that already pays for one — a route that skipped that check here while paying for it on `GET` would be an inconsistency with no argument behind it.

### What `/code-review high` found across both passes

**First pass, one real regression**: skipping already-fetched messages removed the only practical bound on how many messages `findAttachments` examines, reopening the exact failure D-145's own review had closed. Before dedup, `found.length >= MAX_SYNC_ATTACHMENTS` also bounded iterations in practice, because almost every matching message contributed at least one attachment; after dedup a message whose only PDFs are already fetched contributes zero and the loop does not stop for it, so a mailbox synced long enough that most old mail carries the flag can walk its entire search result — one IMAP round trip per message — under a wide window, without ever finding forty *new* attachments. `MAX_SYNC_MESSAGES_SCANNED` (200) in `lib/statement-sync.ts` caps messages examined independently of attachments found, and `findAttachments` stops at either cap. **Second pass, nothing** — the flag-on-confirm redesign came through clean, including a new structural guard in `tests/privacy.test.ts` asserting the mailbox report is unreachable except after `confirm`'s own success check, carries no body, and that `GET` no longer names `markFetched` at all. **`/security-review` ran both times and found nothing either time**: the new write only ever targets a `uid`/`part` pair `verifyAttachment` has already re-validated, so it adds no forgery surface, and the new `POST`'s worst-case misuse — flagging the owner's own message wrongly — costs one repeat offer, never a boundary crossed.

- Evidence: full unit suite **877 passed / 92 skipped across 41 files** on the final shape (skips are the database-backed suites, `private-ledger-local` not running this session), `tsc --noEmit` clean, `eslint` clean, `pnpm build` clean at the same route count (the attachment route now answers `GET` and `POST`). pgTAP not run — no SQL moved. **Verified live against the real mailbox on the first draft** (two real syncs, 14 real PDFs, second sync correctly empty) — **not yet re-verified end to end on the final shape**, which needs an actual confirm to exercise the new `POST` call from the client; the batch of 14 real statements downloaded during the first draft's live pass are already flagged from that pass and remain staged, unconfirmed, in the owner's browser. D-145 (the button and manifest this changes), D-144 (the retention call this reverses only for the route), D-141 (the design both build on).

## D-188 — A fixture with one row a day was not a ledger, and fixing that failed the audit on a second page

- Date: 2026-09-04
- Status: **Built, reviewed, gated, committed as `b6bcf92`, pushed and deployed.** `tests/e2e/owner-phone-audit.spec.ts`, `app/statistics-charts.tsx` and `.gitignore`. No SQL, no route, no contract change.
- Context: D-187 shipped a guard that red-proved by 3px where the real ledger overflowed by 39.4px, and said so in its own comment. This closes that.

### A day with one row in it is not a day

The audit seeded `date '2026-01-01' + g`, one row per date across 120 dates, so every day heading read a short date, "1 row" and a two-figure total — one wrapped line fewer than the real thing. **Ten rows across each of twelve days** now, which red-proves at **20–21px on 12 headings of 12** against the previous 3px on 85 of 102.

**The printed-balance chain is what constrained the change.** Rows carry `500000 - g * 1000` as the printed balance against a flat `-1000` movement, so each movement must equal the difference between two printed balances *in the order the ledger reads them*. Ten rows sharing one `09:15` leaves that order ambiguous, so each row within a day steps seven minutes later and `(date, time)` still matches ascending `g`. 120 rows over 12 days still crosses the 100-row page, so `Load older rows` stays on screen (D-168).

**Ten is the busy end, not the average, and the comment says so.** The owner's ledger runs about four rows a day — 1,660 rows over the 424 days its own statistics page reports — and ten was the count on the one day his capture happened to show. `/code-review high` caught the first draft calling ten the average, which is the D-187 trap repeating itself inside the fix for D-187.

### A representative fixture failed a page nobody was looking at

Reseeding immediately turned `/statistics` red, which is the entire point of one. The balance chart's hover hit targets are centred on their points, so the first and last extend half a band beyond the plot. At 300 days that half-band is a pixel; at twelve it is 31 units, and the last one left the `viewBox` by 12.7 — about 6px on screen. **The root `<svg>` clipped it, so nothing ever painted wrong; what got cut was that point's own hit target.** Both ends are clamped to the plot now.

**PLAN task 46 predicted a defect of this shape, in this chart, at a narrow window, and left it for whoever created the data shape that shows it.** That turned out to be a fixture change rather than a feature — which is the argument for representative fixtures stated better than any of these entries could state it.

### What the owner's captures settled, and what he decided instead

Five captures of `/ledger`, `/statistics`, `/import`, `/slips` and `/recovery` at 390px. **`/statistics` carries the spending calendar, so D-179's heatmap and D-183's year view were in the reading after all** — there is no `/calendar` route, and an earlier ask for one in this session was wrong. Both render correctly: months stack one per row rather than three across, both ramps read, day cells clear the 44px standard, nothing overflows. **`Load older rows` was seen at the foot of a real phone ledger for the first time**, which the PDF capture could not show because Safari caps a full-page export at 14400pt.

**D-180 and D-181's fence is closed by the owner's decision rather than by a reading**: asked whether he wanted the four schemes photographed, he said to leave it, because they are barely different between his desktop and his phone. *A question is closed when it stops being asked* — here the owner stopped asking it, which is a weaker close than a measurement and is recorded as such rather than dressed up as one. **All four entries the thirteenth boundary held back are now free**; the fourteenth is available whenever the budget wants it, and at 74% it does not yet.

### The captures live in the repository and are one `git add .` from being committed

`phone_screenshots/` is where the owner drops them. It was not ignored, and everything else in that directory is committable, so nothing would have asked. Now ignored (D-049). **An agent may read them under a granted real-data read; nothing in them may become a fixture, a commit, or a quotation in these documents** — every figure quoted here is a count, a width or a percentage.

## D-187 — The phone's day heading kept a desktop column's width, and the audit's question had no vertical half

- Date: 2026-09-04
- Status: **Found, fixed, reviewed, gated, committed as `b10fadd`, pushed and deployed.** Confirmed on the deployed build at 390px in the owner's own signed-in session with no injected styles: 122 headings, **0 spilling and 0 pinched**, the heading cell 358×33.8px against 115×58px before. `app/globals.css` and `tests/e2e/owner-phone-audit.spec.ts`. No SQL, no route, no contract change.
- Context: the owner read `/ledger` at 390px on his own device and sent the capture — an iOS Safari full-page export, 390 × 14400pt and **vector rather than a screenshot**, so it could be measured rather than eyeballed. **This is the phone reading D-177 … D-186 were all fenced behind**, and it found a defect on its first page.

### The band was never the question

D-185's band and D-186's sticky heading both stop at 1400px by design, so neither was ever going to appear on a phone and neither was the thing to look at. The day heading *is* on the phone, and it had been painting its day total across the top border of the first transaction card since the headings shipped — **117 of 122 headings on the real ledger, the worst by 39.4px**.

### Two rules were missing from the stacked mode, not one

**The width is what made it wrap.** The heading is a `colspan=7` `<th>` and therefore its row's *first* child, so `.ledger-table th:nth-child(1) { width: 115px }` — which sits outside every media query because it sizes a column — went on pinning it to 115px at phone width. In 111px of usable space its three parts wrapped to three or four lines.

**The height is what made the wrap land on the card.** The cell's used height stayed **58px whatever it contained** — measured against a 70.4px child, and still 58px after the width was freed. So `width: auto` alone takes the heading to a single 16.8px line and looks like a fix, but forcing a wrap back put the spill straight back at +3.6px. With `height: auto` as well the box tracks its content: 33.5px for one line, 70.3px for a forced three. The `td` rule on the next line already resets `height` and `min-width` for exactly this reason; the one `<th>` in `tbody` was never given the same treatment.

*A `display: block` cell releases neither its table's column width nor its row height.* That is the general shape, and it is now a trap.

### The audit that should have caught it asks only half a question

`tests/e2e/owner-phone-audit.spec.ts` has measured this page at exactly 390px since D-168, and it passed throughout. `measure()` asks whether an element escapes its container **horizontally**; a heading escaping *downwards* was outside its question entirely. **D-138's family from a fourth direction** — after *a surface that does not exist until asked for*, *a surface only reachable after an action* and *a surface that needs enough data behind it*, this is **a defect on an axis the instrument does not measure**.

It now asserts the spill and its cause, and **both red-prove individually**: the spill on 85 of 102 seeded headings, the pinched cell on 102 of 102 by 243px. The structural one is the unconditional half, since it does not depend on how long the heading's text is — which matters here, because the spill clears by only **3px** on this fixture against the real ledger's 39.4px. One seeded row per day gives a shorter heading that wraps one line fewer. **A fixture whose days each held ten rows would exercise this as the real ledger does; seeding one row per day under-exercises the day heading, and that is left as owed work** (PLAN task 56).

### One claim in this session was wrong, and the red-proof is what caught it

A live-DOM simulation of the fixture's heading text predicted it would clear by 14.8px and therefore could not red-prove. The real run showed 85 headings spilling. **A simulated fixture is not the fixture** — the comment asserting otherwise was written, and corrected before it shipped. `/code-review high` found two more, both fixed: two adjacent comments left contradicting each other once that correction landed, and a `?? cell` fallback that would have computed `pinched` as 0 and retired the structural check silently.

### The fence is only partly discharged

This reading covered `/ledger`. D-177's account filter and D-178's date filter were on screen and inside the audit's standard. **D-179 and D-183 were not in the capture at all, since both are `/calendar`, and D-180/D-181's four schemes were seen only in the one the owner had on.** Those four stay fenced; the thirteenth archive boundary is therefore a smaller move than it looked, and is the owner's to place.

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
