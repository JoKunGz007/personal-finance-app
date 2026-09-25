# Private Ledger decision log

Last reviewed: 2026-08-09

Entries are append-only. A superseding decision must reference the earlier entry rather than rewriting its history.

This file carries **D-141, D-158 and D-223 … D-227** — the two open questions this file has
named since the twelfth boundary, the newest entries, and the sixteenth boundary's own record of
itself. **D-141**:
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
(the seventeenth boundary, D-227), on the owner's word too. The index below covers all fifteen files, so a reader can find any
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
### Current 
—
 this file

- **D-229** — A Grab ride paid in two parts matches both rows, and an unnamed KBANK card spend counts as Grab's
- **D-228** — A fourth /ux-review over every page: shorter notes and labels, /deliveries lists capped at 20, and /import fitting a 1024px laptop
- **D-227** — The seventeenth boundary moves D-212 … D-222 on the owner's word
- **D-226** — The co-payment real cost uses the year's rate and a ฿200 daily cap, checked against the owner's เป๋าตัง history
- **D-225** — Delivery statistics are computed in SQL on `/deliveries` at each order's real cost, and never added to a ledger total
- **D-224** — A ไทยช่วยไทย order shows its real cost, 40% of the wallet-paid food plus the fee, and is not linked to the wallet payment
- **D-223** — LINE MAN orders are read from order-page screenshots, match on what was charged, keep their own facts in a new table, and propose no automatic match until measured

## D-229 — A Grab ride paid in two parts matches both rows, and an unnamed KBANK card spend counts as Grab's

- Date: 2026-09-25
- Status: **Shipped as `4c5f377`, migrations 039 and 040 on hosted, confirmed live.** Task: `PLAN.md` 58 part 5. Extends D-222 (rides) and D-220 (orders). Files: `supabase/migrations/202610040039_ride_split_candidates.sql` (`public.ride_split_candidates()`), `lib/delivery-match.ts` (`proposeRideSplits`, the unnamed-card rule), `app/api/v1/deliveries/route.ts`, `lib/deliveries.ts` (`ridesOnRows`), `app/ledger-match-panel.tsx`, `supabase/tests/025_ride_split_candidates.sql`, `tests/delivery-match.test.ts`, `tests/deliveries-route.test.ts`.
- **Asked for by the owner**, who suspected a cancelled-and-rebooked ride shows as two bank rows. **Measured on hosted (counts, lags and masked wording; values shown in chat only):** of 95 rides with no row, 52 predate the first SCB statement. The other 43 are all explained:
  - **34 were charged twice**: first 2–25 minutes before pickup, the rest 4–22 minutes after (once 51), summing to the total. The second charge is after pickup, so this is not a rebooking. It is not only tolls either: it rarely equals the printed toll, and most are bike rides.
  - **6 were charged once for more than the total**, and the difference came back as `POS REFUND` 2–5 days later. The refund names no merchant.
  - **3 were a KBANK debit card** (Visa 1105, the owner's KBANK account), whose rows read `Debit Card Spending` with no merchant. The same card paid 3 GrabFood orders on those days.
- **The rules:**
  - **Unnamed KBANK card spends count as Grab's wording**, for orders and rides alike. The whole ledger holds 7 such rows, all inside Grab windows, so nothing collides.
  - **Two-part match**, only for a ride that no single row paid and the owner has not decided: either
    - two charges, the first in the usual window (30 before to 15 after pickup) and the second from pickup to 60 minutes after, summing to the total; or
    - one charge in the usual window for more than the total, plus a `POS REFUND` of exactly the difference within 7 days.
  - **Fail-closed like the rest:** exactly one pair must fit; no row may be held or contested by another document; a row two rides' pairs want goes to neither.
- **Read-time only, so no table and no column: backup stays v13.** The automatic match is a proposal, as every other is; "Not this row" stores a decline as before. **Not built: a manual two-row link.** `set_ride_match` still holds one row to the exact total. The match panel names both rows, and a row's time gap reads in days once it passes a day. `/ledger` folds the ride under both rows.
- **The first deploy matched only 35 of the 40, and the cause is a trap worth keeping.** 039 returned a table, and PostgREST cuts a table-returning RPC at `max_rows` (1000) **silently**. On hosted the function returned 1,181 rows, so 5 rides lost their candidates. **Migration 040** returns one `jsonb` array, which the cap does not touch, and narrows the windows to what the rule uses (charges from 30 minutes before pickup to 60 after; refunds from the pickup day to 8 days after): **357 elements**. The older candidate reads return 241, 107 and 13 rows, so they are under the cap for now, but they grow with the ledger. See GOTCHAS.
- **Confirmed live** after 040: rides **181 → 224 matched** (34 two-charge, 6 charge plus refund, 3 KBANK) and orders **96 → 99** (3 KBANK). The only unmatched rides are the **52 from before the first SCB statement**. The panel names both rows, and a refund's gap reads "2 days after".
- **Other findings from the same look, recorded only:** the 11 no-row food orders are 7 from before SCB coverage, 3 on KBANK (now matched by the card rule), and 1 LINE MAN fee paid from the LINE Pay balance, which has no bank row by nature. The owner is fine with that.
- Gate: `pnpm supabase:reset` on 39 migrations; pgTAP `Result: PASS` (025 new, 5 tests); Vitest **1208 / 7 skipped** (the rule red-proved by loosening uniqueness); `tsc` clean; `eslint` 0 errors; Playwright isolated **70 / 8 skipped**, owner **34 / 34**. Hosted: backup **466 / 466** before the push, `--dry-run` named only 039, pushed; `anon` may not execute, `authenticated` may; sequence unchanged.

## D-228 — A fourth /ux-review over every page: shorter notes and labels, /deliveries lists capped at 20, and /import fitting a 1024px laptop

- Date: 2026-09-25
- Status: **Shipped as `98fe5b5`, confirmed live.** Asked for by the owner, who pre-approved every recommended fix and asked that wordy text be cut without losing a needed detail. Files: the 16 notes named below, `app/import-bench.tsx`, `app/receipts-bench.tsx`, `app/statistics-view.tsx`, `app/deliveries/page.tsx`, `app/deliveries-bench.tsx`, `app/globals.css`, `tests/e2e/ledger.spec.ts`.
- **Measured over all eight pages at 1024px, 1440px and 375px** in the signed-in pane: no missing names, no skipped heading levels, no contrast failures, and no target under 44px outside the known header and calendar exceptions. **Two defects:** `/import` scrolled sideways between 981px and about 1100px (the controls row's 167px indent), and `/deliveries` was **59,000px tall on a phone** because every order and ride rendered.
- **Wordiness was in the (i) notes, not on the page**: 32 notes held 7.6k characters. The 16 over 180 were cut by about 40%, keeping every rule a reader acts on: match windows, what is never stored, what Vision sees, what excluded rows do, and the co-payment rule (D-226). Visible jargon was replaced: "fail closed" → "refused", "held in worker memory" → "used for this attempt only", "binding is checked" → "must match". The receipts line and the statistics balance caption were shortened.
- **Lists:** `/deliveries` shows the newest 20 orders and 20 rides, with "Show all N". **A filter or search shows every match**, so an order waiting for you to pick its row is never hidden (a `/code-review high` finding). LINE MAN options are now rejoined with a space rather than a comma, because the screenshot wraps one comma-separated run mid-phrase. Display only; stored data is unchanged.
- **Not taken: folding the desktop header's settings behind Settings** (163px at 1440). On the phone the same panel holds the sign-in controls, so hiding it on desktop could hide sign-in. Revisit D-157 only if the owner asks.
- Also measured on the real stored orders (PLAN task 58 part 1's open item): **no dish option is a note to the restaurant**. Every GrabFood option is a menu choice. That item is closed.
- Gate: `tsc` clean; `eslint` 0 errors; Vitest **1200 / 7 skipped**; Playwright isolated **70 / 8 skipped**, owner **34 / 34**.
- **Confirmed live**: `/import` at 1024px no longer scrolls sideways (document 1009px wide, was 1059px). `/deliveries` at 375px is **13,200px, down from 59,000px**, with 20 + 20 rows and two 48px Show-all buttons. The "no ledger row" filter listed all 11 + 95 matches, with no cut.

## D-227 — The seventeenth boundary moves D-212 … D-222 on the owner's word

- Date: 2026-09-25
- Status: **Done.** D-212 … D-222 relocated unchanged to [`docs/decisions/ARCHIVE-D-212-D-222.md`](docs/decisions/ARCHIVE-D-212-D-222.md); their index bullets moved to that file's Archived section.
- **Asked for by the owner** after D-226 left this file at **88%** of its budget; **63%** afterwards. Same footing as D-198 and D-213: every entry moved is settled, shipped and confirmed live (receipt matching, statistics and restyle; GrabFood reading and matching; Grab rides), or is D-213, the previous boundary's record, which this entry supersedes.
- **A new file**, as D-213 chose, so no existing link moves.
- **D-223 … D-226 stay**: the LINE MAN and co-payment arc the next session starts from. D-141 and D-158 stay as the two open questions.

## D-226 — The co-payment real cost uses the year's rate and a ฿200 daily cap, checked against the owner's เป๋าตัง history

- Date: 2026-09-25
- Status: **Shipped as `9fa1896`, migration 038 on hosted, confirmed live.** Task: `PLAN.md` 58 part 2. Amends D-224 and D-225. Files: `lib/delivery-cost.ts` (`schemeCosts`, `schemeWallet`), `supabase/migrations/202610030038_scheme_daily_cap.sql`, `app/deliveries-bench.tsx`, `app/delivery-statistics.tsx`, `tests/delivery-cost.test.ts`, `supabase/tests/024_delivery_statistics.sql`.
- **The owner checked 9 of the 16 orders against the เป๋าตัง app.** 6 agreed. The two split LINE MAN orders differed by exactly the ฿16 fee the bank was charged: the เป๋าตัง app shows only the wallet part, so the chip now shows both (real cost = เป๋าตัง amount + delivery fee by bank). One more differed: 60% of its food was over ฿200, and the government pays at most ฿200 a day.
- **The rule now, confirmed against the published terms:** the government pays 50% of the food in 2025 (คนละครึ่งพลัส, 29 Oct to 31 Dec 2025) and 60% from 2026 (ไทยช่วยไทยพลัส). In both years it pays at most ฿200 per Bangkok day, and the owner says the cap is per day. The cap is a running total over the day's orders, in time order with ties broken by id. The owner's share rounds to the nearest satang, and 50% rounds half up. 2025 means a Bangkok date before 2026-01-01. The 7 orders the owner could not check are all from Nov–Dec 2025, because the 2025 history is gone from the app.
- **Known limits, both reading low:** the ฿200 is shared with scheme spending no table holds (a shop, a market), and each campaign's total limit is not modelled.
- **The same rule lives in two places**, the TS chip and 038's SQL, and each side's tests pin the same cases. The chip is computed over every stored order, not the filtered list, because the cap depends on the day's other orders. The new pgTAP cases were red-proved against 037's function (3 of 17 fail).
- Hosted: the backup read **466 / 466** before the push, `--dry-run` named only 038, and it was pushed. Afterwards `anon` still may not execute, `authenticated` may, and the sequence is unchanged. **Backup stays v13.**
- Gate: `pnpm supabase:reset` on 38 migrations; pgTAP `Result: PASS`; Vitest **1200 passed / 7 skipped**; `tsc` clean; `eslint` 0 errors (2 pre-existing warnings); `check:docs --strict` clean. Both Playwright suites green: isolated 70 / 8 skipped, owner 34 / 34. The run also found `font-picker.spec.ts` red since the Deliveries nav link (`6dd867d`): at 390px, three faces wrapped the nav to 3 rows against the system face's 2. The owner chose a 3-column grid from screenshots, and the suite is green again. `/code-review high`: 6 findings; 3 fixed (two stale help notes, the fee label), 2 recorded as the limits above, 1 not needed.
- **Confirmed live** (Claude in Chrome, then the browser pane at 375px): all 16 scheme chips render, 7 of them labelled คนละครึ่ง; the 9 figures the owner checked now all equal the เป๋าตัง app; the two split orders show both amounts; the one capped order says so. The statistics' Cost total equals a recount of the order list. At 375px the phone nav is 3 columns and 136px in Pixelify Sans, with no sideways scroll. Values not recorded.

## D-225 — Delivery statistics are computed in SQL on `/deliveries` at each order's real cost, and never added to a ledger total

- Date: 2026-09-25
- Status: **Shipped as `152b03d`, migration 037 on hosted, confirmed live.** Task: `PLAN.md` 58. Precedents: D-160 (statistics in SQL, no division of money), D-214 (receipt statistics). Files: `supabase/migrations/202610020037_delivery_statistics.sql` (`public.delivery_statistics()`), `lib/delivery-statistics.ts`, `app/api/v1/deliveries/statistics/route.ts`, `app/delivery-statistics.tsx`, `supabase/tests/024_delivery_statistics.sql`, `tests/delivery-statistics.test.ts`.
- **Asked for by the owner**, including that ไทยช่วยไทย orders count at their real cost (D-224). The figures were chosen by the agent while the owner checked D-224's numbers; they are a starting set to revise: orders, what they cost, the average order, delivery fees, printed discounts (the scheme's own line is the wallet, not a discount), what ไทยช่วยไทย paid; by app; the ten restaurants most spent at; by month with rides beside orders; rides with their average and platform fees; rides by type.
- **Computed in SQL, D-160's rule**, although the order list is fully loaded today: the same reasons hold as for 031, and rides will reach PostgREST's row cap first. **The real-cost rule now lives twice**, in `lib/delivery-cost.ts` for the chip and in 037 for the totals. pgTAP 024 pins the same cases as `tests/delivery-cost.test.ts`, and the live check below recomputed every total from the list in the page and found them equal.
- **Months are Bangkok months**, dated as the lists date them: an order by its order time (LINE MAN) or e-receipt send time (GrabFood), a ride by its drop-off. Averages are exact quotient/remainder pairs. Security invoker; a session without MFA sees nothing (asserted). No table, no column: **backup stays v13**.
- **Hosted**: the backup read **466 / 466** before the push; `--dry-run` named only 037; pushed; read back: `authenticated` may execute, `anon` may not, sequence unchanged.
- Gate: `pnpm supabase:reset` on 37 migrations; pgTAP **599 across 24 files**, `Result: PASS`; Vitest **1197 passed / 7 skipped across 61 files** (Docker up); `tsc` and `eslint` clean; `pnpm build` clean. **Confirmed live**: the panel loads with no error at desktop and 375px, with no sideways scroll, no target under 44px and no empty card label. Orders, cost, rides, ride cost, each app's cost and the month sums all equal a recount from the order list made in the page. Values not recorded.

## D-224 — A ไทยช่วยไทย order shows its real cost, 40% of the wallet-paid food plus the fee, and is not linked to the wallet payment

- Date: 2026-09-25
- Status: **Shipped as `bcec3ac`, confirmed live.** Task: `PLAN.md` 58 part 2. Files: `lib/delivery-cost.ts`, `tests/delivery-cost.test.ts`, `app/deliveries-bench.tsx`.
- **Why not a link.** Part 2 was to link a ฿0 order to its เป๋าตัง payment. The owner: the wallet has no statement, and a payment made inside Grab or LINE MAN leaves no slip, only a line in the เป๋าตัง app's history, which refuses screenshots and screen recording. Getting past that would mean rooting or defeating the app's protection, which a banking app detects, so it was not proposed. A photo taken with a second device would work and was offered; the owner chose the rule below instead. The ledger's balance is already right, because the wallet top-up is a bank row.
- **The rule, the owner's, 2026-09-25.** ไทยช่วยไทย pays 60% of the food and none of the delivery fee. Of what the wallet covered, the food share costs 40% and the fee share all of it; promo codes and delivery promos reduce the fee only (the owner's answer when asked). A ฿0 GrabFood order's wallet amount is its one discount line named like `TH…GF…ALL` (all 14 ฿0 orders carry exactly one, measured on hosted, masked names only); a split LINE MAN order's is its total less what the bank was charged, which is added back. Integer satang; 40% rounds to the nearest satang, and 4 × a whole satang count is even, so there is never a tie.
- **Display only**, as an order is never money (D-209): a chip on `/deliveries` reading ไทยช่วยไทย and the real cost. The owner asked that it also count in statistics; there are no delivery statistics yet, and when they are built they take `schemeRealCost` for these orders.
- Gate: Vitest **1090 passed / 106 skipped** (Docker off), `tsc` and `eslint` clean. **Confirmed live**: 16 orders carry the chip (the 14 ฿0 GrabFood orders and the 2 split LINE MAN orders), and no ฿0 order lacks it. The owner offered to check a few against the เป๋าตัง history.

## D-223 — LINE MAN orders are read from order-page screenshots, match on what was charged, keep their own facts in a new table, and propose no automatic match until measured

- Date: 2026-09-24
- Status: **Shipped as `18ee369`, migration 036 on hosted; automatic match measured and turned on as `4cdf9ec` (2026-09-25), confirmed live over 7 real orders.** Task: `PLAN.md` 58 part 4. Precedents: D-210 (screenshots through Vision), D-219/D-220 (orders, matching), D-097 (new data in new tables). Files: `lib/delivery-lineman.ts`, `app/lineman-capture.tsx`, `supabase/migrations/202610010036_lineman_orders.sql`, `lib/deliveries.ts`, `lib/delivery-match.ts`, `app/api/v1/deliveries/route.ts` (`POST`), `app/deliveries-bench.tsx`, `supabase/tests/023_lineman_orders.sql`, `tests/delivery-lineman.test.ts`.
- **Measured before building**, under the owner's real-data grant: the 14 screenshots in `receipts_sample/food_delivery/lineman/` (7 orders, 2 each) were sent once through the app's own Vision call, and the words were cached under the gitignored `.runtime/lineman-vision/`. The layout is in `docs/DELIVERY_CONTRACT.md`. **The reader read 7 of 7**; the dishes summed to Food and food + fee − discounts = total on every one; pairs picked in reverse were refused. The dump that found the layout showed the owner's name, phone and addresses in the session; none of it went into a file.
- **The join's known limit.** Only the first screenshot carries the order number. A later screenshot is joined by a line repeated just above `Menu`, and by the first screenshot's priced dishes reappearing. For two orders to the same address those lines are identical: pairing one order's first screenshot with another's second read in 30 of 42 cross pairs. **The safety is D-218's: one order per pick**, with the parsed order shown for the owner to check before saving.
- **Split payment, the owner's call.** In 2 of 7 orders the food was paid with เป๋าตัง and only the fee was charged (`Pay delivery fee with mobile banking`, or with LINE Pay). The `Pay …` line is the order's **charged** amount, and it alone is matched to the ledger; the rest was paid outside the app.
- **Storage, the owner's call and D-097 together.** A LINE MAN order is a `deliveries` row (platform `lineman`), sharing the dishes, adjustments, matching and `/ledger` fold. The owner chose the same table; D-097's rule (new data in a new table, never a new column) put its own two facts, `ordered_at` and `charged_minor`, in **`lineman_order_details`**. `deliveries` only relaxes: the platform CHECK widens, and `receipt_sent_at` may be null for LINE MAN only, which a CHECK enforces. `capture_delivery`, `delivery_ledger_candidates()` and `set_delivery_match` work from the charged amount and the order time. **Backup v12 → v13**, one kind appended. The v12-into-v13 restore and a split LINE MAN order across a restore were proven against the recovery project.
- **Capture.** The page reads each screenshot through `POST /api/v1/ocr/read`, parses on the device, and posts only the parse to `POST /api/v1/deliveries` (strict schema). `capture_delivery` re-checks the sums and the charge, and refuses a charge above the total.
- **No automatic match yet**, from the finance review. The provisional rule (lag −5 to +30 minutes from the order time) had no bank-description filter, unlike the GrabFood and ride rules, so an unrelated payment of the same amount could have been proposed. `LINEMAN_AUTOMATIC_MATCH = false` until the stored orders are measured and the owner picks a window and what the bank row must name. The manual link still offers rows.
- Gate: `pnpm supabase:reset` on 36 migrations; pgTAP **585 across 23 files**, `Result: PASS`; Vitest **1159 passed / 7 skipped across 56 files**, recovery rehearsal running; `tsc` clean; `eslint` 0 errors, 2 pre-existing warnings; `pnpm build` clean. After the auto-match change: the three affected test files (37 tests), `tsc` and `eslint` were re-run.
- **Hosted**: the backup read **459 / 459** before the push; `--dry-run` named only 036; pushed. Live after deploy: `/deliveries` shows the LINE MAN picker, and orders (90 / 10 / 14) and rides (181 / 95) are unchanged. **No LINE MAN order is stored yet.**
- **Automatic match on, 2026-09-25, `4cdf9ec`.** The agent stored the 7 sample orders through the live picker (Claude in Chrome, on the owner's word); none was refused, so the app's re-encoded images read as the raw ones did. Measured on hosted, counts, lags and masked wording only: **6 of 7 had exactly one row of the charged amount, 0–1 minutes after the order time, every one reading `จ่ายบิล LINE PAY`** — so a LINE PAY bill payment is the order's own payment, not a wallet top-up. No row was wanted by another order or claimed by a GrabFood order or ride. The only other equal-amount row within three days was a BTS fare paid through LINE Pay (`LINEPAY*LP_BTS`, no space), 22 hours away. The one order with no row is a split order (฿16 charged) with no LINE-worded row within a day: most likely paid from an account whose statement is not loaded. **The owner kept the window at 5 minutes before to 30 after and chose the filter `LINE PAY` or `LINE MAN`** (the latter being the mobile-banking QR form, 2 rows on the ledger, not among these 7). The flag is gone; the filter is in TS (`linemanQualifiesAutomatically`), so the candidate read's shape is unchanged and no migration was needed. Tests pin the window's edges, the wording, and the BTS exclusion (red-proven by loosening the space). Gate: Vitest **1064 passed / 106 skipped** (Docker off), `tsc` and `eslint` clean on the changed files. **Confirmed live**: LINE MAN **6 matched, 1 no row**; the rest unchanged at 271 matched (90 orders + 181 rides), 105 no row, 14 paid outside, 0 ambiguous. **The backup is now stale**: 7 saves since the 459 / 459 read.

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
