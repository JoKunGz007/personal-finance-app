# Private Ledger decision log

Last reviewed: 2026-08-09

Entries are append-only. A superseding decision must reference the earlier entry rather than rewriting its history.

This file carries **D-141, D-158, D-198, D-199, D-200, D-201, D-202 and D-203** — the two open questions this file has
named since the twelfth boundary, the fifteenth boundary's own record of itself, and the two
entries it was taken a turn too early for (both landed right after D-198, still well inside the
new budget). **D-141**:
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
shipped and confirmed live. The index below covers all thirteen files, so a reader can find any
entry without opening any body.

**Every boundary sits where an argument ends rather than where a number is round**, and the fourth one is the clearest case of that rule so far. It was taken at **93%** of this file's byte budget and moved the whole arc in which both readers went to Cloud Vision and the local OCR engine was deleted. **The third boundary had explicitly refused to move D-120**, on the grounds that whether pre-fill stays was undecided and that question attached to D-120 and D-129 — which was true when written. **What closed it was not an argument but a shipped feature**: D-135 files a machine-read amount into the ledger without the owner looking at it at all, which is a stronger commitment than the trial ever asked for. *A question is closed when the code has stopped asking it*, and that is the test to apply at the next boundary rather than re-reading the prose.

**What this file now holds is two open questions and the record of the boundary that just ran.**
The mailbox archive (D-141) and the unbounded candidate scan (D-158) remain open and are the whole
of what is unanswered; D-198 sits above them, settled the moment it was written.

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
### Current 
—
 this file

- **D-198** — The fifteenth boundary is taken on the owner's word rather than an argument closing, and this file returns to holding nothing but its two open questions
- **D-199** — D-196's real scope was every pixelated figure on `/ledger`, not just the stat strip: the day heading, the row timestamp and the account label all still switched to the pixel face
- **D-200** — D-199 put whole words in the figures font along with the digits beside them — "Sept", "row(s)", a bank name — and the owner's correction was exact: only a digit run takes `--font-money`, never a word sharing its span
- **D-201** — The all-accounts ledger showed gaps that read as missing transactions: each account pages on its own, and the merged view printed every loaded row below the shallowest account that still had more to fetch
- **D-202** — Digits take the figures font on every page through a digit-only font face rather than markup, and the last long help paragraphs move behind i icons
- **D-203** — The first /ux-review pass: ten findings approved and fixed, led by ledger density on both viewports

## D-203 — The first /ux-review pass: ten findings approved and fixed, led by ledger density on both viewports

- Date: 2026-09-16
- Status: **Shipped as `91a6cea`, `64b787e`, `8294e22`, pushed, and confirmed live** at desktop (Chrome) and 375px/360px (browser pane, signed in).
- Context: the owner added a global `/ux-review` skill (live audit in the signed-in pane; design-review phases and tiers, Nielsen's 10, WCAG AA, design-critique summary, this app's own rules; suggests until approved) and approved all ten findings of its first run.
- **What changed.** Phone ledger cards use grid areas — description, then time and amount, then the account on a full row, then the two balances, then the controls — with self-evident cell labels dropped. Desktop row buttons sit side by side in a 205px Status column (Date 95px, Account 150px, net width unchanged); a statement-only row's dash becomes screen-reader-only when controls follow it. Grouped by day, a row shows only its time. Phone ledger filters fold behind a *Filters* button (Reload and a range warning stay out); statistics on a phone shows the latest 3 calendar months and top 5 largest rows until asked. `/import`'s sync controls shrink instead of scrolling the page at 360px. Every `(i)` sits beside its heading (`display: contents` on `.heading-note`). The header waits for the first session lookup before offering Google sign-in. `.link-button` keeps its 44px hit area on every viewport.
- **Kept rather than changed, on recorded decisions.** The finding proposed a separate actions column and a "Statement only" label; D-156/task 48 refused the column on width and D-064 refused a badge on every row, so the buttons stayed in the Status cell and the dash stayed for screen readers.
- **A root cause found during verification.** `td time, td strong, td span, td small { display: block }` also blocked every *nested* span, so the account label's `···· NNNN` and D-200's `.figure` digit runs each started a new line. Nested spans are inline again. Recorded as a trap.
- Gate: `tsc` clean; `eslint` 0 errors on the touched files; 116 unit tests (dev-session, privacy, ui-theme, owner-access, ledger-window); `pnpm build`. **Not run:** Docker-backed suites and Playwright, including `owner-phone-audit.spec.ts` (Docker stopped).
- Evidence (live): phone ledger card 436px → 262–286px, first row 1,666px → 1,170px, page ~57k → ~35k px, no control under 44px, no sideways scroll; `/import` no sideways scroll at 360px; phone statistics 12,750px → 8,023px; desktop row ~134px → 76–88px with both buttons on one line and the date cell showing only the time; `(i)` within 4–9px of its heading's top; Sign out 58×46.

## D-202 — Digits take the figures font on every page through a digit-only font face rather than markup, and the last long help paragraphs move behind i icons

- Date: 2026-09-16
- Status: **Shipped as `bda7ba0`, pushed, and confirmed live** on the deployed build.
- Context: the owner asked for D-200's number-font fix "webwide, not only ledger page", and for the remaining long label/help text to sit behind an i icon as the ledger page's already does.
- **Digits: a font face, not markup.** D-200 split text per call site with `.figure`; repeating that on every page would only reach the places someone remembered. A `"Figures"` `@font-face` (`app/globals.css`) points at IBM Plex Mono's own files with `unicode-range: U+0030-0039` and leads each pixel typeface's `--font-body` and `--font-data` stack, so the browser picks Plex Mono for each digit and the pixel face for everything else, per character, on every page. No `size-adjust` is needed because the pixel faces are already fitted to Plex's cap height. The `system` typeface is untouched (already Plex). D-200's `.figure` markup stays; it is now redundant but harmless.
- **Long text.** A scan of the deployed pages for visible text blocks over ~110 characters found eleven, all on `/import`, `/slips` and `/recovery`; each moved into a `LedgerNote`, keeping a short visible lead where the sentence carried a constraint the owner needs before acting (the auto-bind checkbox's bold label, "One direction for the whole batch.", "Requires an empty ledger."). No safety wording was removed.
- Gate: `tsc` clean, `eslint` clean on the seven touched components, `pnpm build` compiled, `tests/ui-theme.test.ts` + `tests/ledger-window.test.ts` 58/58. **Not run: `tests/e2e/font-picker.spec.ts`** (Docker stopped), which measures per-typeface text heights and is the suite most likely to notice this.
- Evidence: live, under Pixelify Sans, `0123456789` measured the same width in the page's own stack as in IBM Plex Mono while letters did not, and both `Figures` faces reported `loaded`; the same scan re-run on `/import`, `/slips` and `/recovery` returned no block over the threshold; the mailbox-sync note opened correctly beside its button. D-163, D-196, D-200 (the rule this widens).

## D-201 — The all-accounts ledger showed gaps that read as missing transactions: each account pages on its own, and the merged view printed every loaded row below the shallowest account that still had more to fetch

- Date: 2026-09-16
- Status: **Shipped as `0e486b0`, pushed, and confirmed live** on the deployed build, cache-busted.
- Context: the owner sent a screenshot of the all-accounts `/ledger` with a run of days holding no rows at all and asked why transactions were missing. Nothing was missing from the ledger. Since task 45 (D-158) each account loads its newest `LEDGER_PAGE_SIZE` rows on its own, and the merged view rendered the union. One account's first page ended weeks after another's reached back a year, so below that point only the deeper accounts' rows appeared, which reads exactly like a ledger with transactions lost. The combined-balance column jumped across the gap by the unloaded account's movements.
- **Why it had not surfaced before.** D-158 did name a floor, but for the combined *balance* only (`combinedBalanceFloor`), and migration 022 retired it once the server computed that figure per row. Nothing ever floored the *rows*. The comment in `load()` — any row among the newest N of the union is among the newest N of its own account — is true and answers the other direction: it proves nothing shown above the floor is missing, not that nothing below it is.
- **The fix is the same floor, applied to rows.** `windowFloor` (`lib/ledger-window.ts`) takes, among the accounts in scope with `hasMore`, the newest of their last loaded rows; `shownRows` keeps only rows at or above it under `compareTransactions`. `windowRows`, `windowIds` and `windowReach.loaded` all read through it, so the table, the held-id set and the "Showing N of M" line agree. One account in scope is never cut (its own window is already contiguous), and a scope with nothing left to fetch is never cut. Reconciliation is untouched — `reconciliationRows` still reads every loaded row plus candidates, so no match or status can move because of the cut. Captured records (slips, cards, cash) are fetched whole and are not cut.
- **Review (`/code-review`, high) found one regression, fixed before commit.** `importedAccounts` was derived from `scope`, which now stops at the floor, so an account whose every loaded row sits below it would have been reported as not imported. It reads the window directly now.
- Gate: `vitest run tests/ledger-window.test.ts` 25/25, with the new cut case **red against the pre-fix `lib/ledger-window.ts`** and green after; `tsc --noEmit` clean; `eslint` 0 errors on the three touched files (the two pre-existing `exhaustive-deps` warnings in `app/transactions-view.tsx`). **The Docker-backed suites, pgTAP and Playwright were not run** — Docker was stopped and the change touches no schema or route.
- Evidence: `lib/ledger-window.ts`, `app/transactions-view.tsx`, `tests/ledger-window.test.ts`. On the deployed build: the first page now ends at the shallowest paged account's last row; one *Load older rows* extends the view and fills the previously empty days; the combined-balance column's remaining row-to-row mismatches net to zero (same-timestamp ordering, not missing rows). D-158 (the paging this corrects), migration 022 (why the balance floor was retired). No figure from the real ledger is recorded here.

## D-200 — D-199 put whole words in the figures font along with the digits beside them — "Sept", "row(s)", a bank name — and the owner's correction was exact: only a digit run takes `--font-money`, never a word sharing its span

- Date: 2026-09-16
- Status: **Shipped as `baae8e5`, pushed, and confirmed live** via `getComputedStyle` on the deployed build, split at the character level between a digit run and the word beside it.
- Context: the owner sent a third screenshot, of `/ledger` again, with green boxes around individual digit runs inside otherwise-pixel text — "15", "2026" inside "Tue, 15 Sept 2026"; "4451" inside "Krungthai savings ···· 4451" — and said plainly: **"i meant like only number, not english letter."** D-199's fix had applied `var(--font-money)` to the whole `<span>`/`<time>`/`.mono` element, which is correct when the element holds nothing but digits (an amount, a masked account suffix alone) and wrong the moment it holds a word too.
- **The fix is a font boundary at the character level, not the element level.** A new `.figure` class carries `font-family: var(--font-money)` and is applied only to the digit run itself; the element around it keeps whatever font it already had. `.day-head-line > span`'s blanket rule is gone; `td time`'s font-money override is gone; `.ledger-table .mono`'s font-money is gone. Nothing lost legibility — every digit that was readable after D-199 still is, and everything that shouldn't have moved (weekday and month names, "row"/"rows", "Krungthai savings", "SCB") moved back.
- **Two new helpers do the splitting, in `app/ledger-shared.ts`.** `formatDateParts`/`formatDayHeadingParts` use `Intl.DateTimeFormat.formatToParts` — the same formatter `formatDate`/`formatDayHeading` already used, asked for its parts instead of its string — and classify `day`/`year` as numeric, `weekday`/`month`/every literal (spaces, the comma) as not. `formatDate` and `formatDayHeading` themselves are untouched: both still return plain strings, because roughly twenty other call sites use them inside `aria-label`s and template literals where a string is the only shape that fits, and none of those needed to change.
- **Free-form bank-printed text has no `Intl` API to lean on, so `splitFigures` does the equivalent with a regex** — a run of digits, optionally joined by `.`, `,`, `:` or `-` the way an amount, a time or an account number actually prints, is a figure; everything else, letters included, is not. Used for `transaction.reference` and `slip.slip_reference`, the two places raw bank text reaches the ledger table.
- **Where a whole element genuinely holds nothing but digits, it stays untouched**: `.day-head-line b` (the day's signed totals — an amount has no letters in it), `.statement-strip dd`, `.numeric` cells. Adding `.figure` there would have been a no-op; the bug was specifically about elements holding a mix.
- Gate: `tsc` clean, `eslint .` clean on the six touched files (the same 2 pre-existing warnings elsewhere, untouched).
- Evidence: `app/globals.css`, `app/ledger-shared.ts`, `app/transactions-view.tsx`, `app/ledger-statement-row.tsx`, `app/ledger-card-row.tsx`, `app/ledger-slip-row.tsx`. `getComputedStyle` read on the deployed build, cache-busted, showing the day heading's "Tue"/"Sept" in Pixelify Sans beside its "15"/"2026" in IBM Plex Mono, and the account label's "Krungthai savings ···· " in Pixelify Sans beside its "4451" in IBM Plex Mono. D-199 (what this corrects), D-163 and D-196 (the rule this still serves, now scoped correctly).

## D-199 — D-196's real scope was every pixelated figure on `/ledger`, not just the stat strip: the day heading, the row timestamp and the account label all still switched to the pixel face

- Date: 2026-09-16
- Status: **Shipped as `1951568`, pushed, and confirmed live** via `getComputedStyle` on the deployed build (the owner's real-data-read grant from the D-197 session carried into this request).
- Context: the owner sent a screenshot of the deployed `/ledger` with red circles around the day heading's date/row-count/totals, a row's timestamp, and an account label ("SCB savings ···· 9970") — all still rendering in Pixelify Sans. **This is what the owner's original request ("all the numbers might need a change") already asked for**; D-196 only fixed the one spot the first screenshot showed.
- **Same root cause as D-196, four more places.** None of `.day-head-line b` (the day's totals), `.day-head-date`, the row-count span, `td time` (the per-row timestamp) or `.ledger-table .mono` (account labels, reference codes) had ever been migrated off `--font-data`, which still switches to the chosen pixel face. `.mono` in particular was never actually mono under a pixel typeface, despite its name.
- **Fixed, not redesigned**: `.day-head-line`'s date, row-count and both signed totals, `td time`, and `.ledger-table .mono` all take `--font-money` now, the same token D-163 and D-196 already established for figures. Three row components (`ledger-statement-row.tsx`, `ledger-card-row.tsx`, `ledger-slip-row.tsx`) had an account-label `<span>` missing the `.mono` class its own reference-code sibling already carried — added for consistency. **Left alone on purpose**: prose, headings, category chips, status badges and form labels, per D-163's own carve-out ("prose, headings and labels" keep the pixel character) — none of these are figures, and the owner hasn't asked for the pixel face's character to go entirely.
- **A stale-cache false alarm during verification, worth recording since it cost a detour.** The first `getComputedStyle` read after the push showed `"Pixelify Sans Fitted", "IBM Plex Mono", ...` — looking exactly like the fix had failed — because the tab had loaded before the new deployment propagated. A cache-busted reload (`?_cb=2`) read back the correct `"IBM Plex Mono", "Cascadia Mono", monospace` with no Pixelify prefix at all. **Always force a fresh navigation before trusting a live read that contradicts a just-shipped fix.**
- Gate: `tsc` clean, `eslint .` clean on the four touched files (the same 2 pre-existing warnings elsewhere, untouched).
- Evidence: `app/globals.css`, `app/ledger-statement-row.tsx`, `app/ledger-card-row.tsx`, `app/ledger-slip-row.tsx`, a `getComputedStyle` read of all four fixed elements on the deployed build post-fix. D-196 (what this completes), D-163 (the rule both draw on).

## D-198 — The fifteenth boundary is taken on the owner's word rather than an argument closing, and this file returns to holding nothing but its two open questions

- Date: 2026-09-16
- Status: Documentation only — no code path moved, nothing to gate beyond `check:docs --strict`.
- Context: the owner asked directly to "deal with archiving" after D-197 left this file at 96% of its byte budget (112 KB of 117 KB). Unlike the tenth through fourteenth boundaries, nothing here was waiting on an argument to close or a reading to happen — every candidate entry was already settled, shipped and, as of this session, confirmed live.
- **D-187 … D-197 move to `docs/decisions/ARCHIVE-D-177-D-197.md`, extending rather than opening a new file** — the same choice the fourteenth boundary made, and for the same reason: the range sits immediately above the existing D-177 … D-186 archive with nothing between them, so one contiguous file reads better than two adjacent small ones. **This also corrects a standing error this file's own index had carried since the fourteenth boundary**: D-177 … D-186 were already archived then, but the index kept listing them under "Current — this file" rather than pointing at the archive — `check:docs --strict` never catches this, because the script validates that every id's title matches between the index and wherever its body actually lives, not which heading the index files it under. Folding the whole D-177 … D-197 range under one corrected "Archived" heading fixes both the stale label and the new move in the same edit.
- **What is left in the maintained file is exactly the two open questions this file has named since the twelfth boundary, and nothing else**: the mailbox archive (D-141, deferred by the owner) and `list_match_candidates`' unbounded scan (D-158, recorded in its own migration and unfixed). Both predate every entry that just moved and neither has closed.
- `check:docs --strict` clean after the move at **198 decisions and 205 traps**, `DECISIONS.md` at **57 KB of 117 KB (49%)**, down from 96% — no id lost, no gap opened, both archive-side ids (D-177 … D-197) and maintained-side ids (D-141, D-158, D-198) read back correctly.
- Evidence: `DECISIONS.md`, `docs/decisions/ARCHIVE-D-177-D-197.md` (renamed from `ARCHIVE-D-177-D-186.md`), `HANDOFF.md`, `PLAN.md`. D-171 (the tenth boundary, the precedent for taking one on a budget rather than an argument), D-192 (the fourteenth, the precedent for extending rather than opening a file).

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
