# Private Ledger decision log

Last reviewed: 2026-08-09

Entries are append-only. A superseding decision must reference the earlier entry rather than rewriting its history.

This file carries **D-141, D-158 and the live frontier from D-177** — two open questions, both below
the range the twelfth boundary moved, and everything the phone-width reading still fences. **D-141**:
whether the mailbox source is deleted after import, deferred by the owner. **D-158**:
`list_match_candidates`' unbounded scan, recorded in its own migration and unfixed. `scripts/check-docs.mjs`
pools this file with every archive and checks ids for duplicates and omissions across the whole set,
so the ids stay whole and the maintained file has never been required to be contiguous. Twelve
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
[`docs/decisions/ARCHIVE-D-171-D-176.md`](docs/decisions/ARCHIVE-D-171-D-176.md) the same day. The
index below covers all thirteen files, so a reader can find any entry without opening any body.

**Every boundary sits where an argument ends rather than where a number is round**, and the fourth one is the clearest case of that rule so far. It was taken at **93%** of this file's byte budget and moved the whole arc in which both readers went to Cloud Vision and the local OCR engine was deleted. **The third boundary had explicitly refused to move D-120**, on the grounds that whether pre-fill stays was undecided and that question attached to D-120 and D-129 — which was true when written. **What closed it was not an argument but a shipped feature**: D-135 files a machine-read amount into the ledger without the owner looking at it at all, which is a stronger commitment than the trial ever asked for. *A question is closed when the code has stopped asking it*, and that is the test to apply at the next boundary rather than re-reading the prose.

**What this file now holds is two open questions and five entries behind one shared reading.** The
mailbox archive (D-141) and the unbounded candidate scan (D-158) remain open and are the whole of
what is unanswered. **D-177 … D-181 are settled, shipped, deployed and verified on the hosted app —
and every one of them is fenced by the same missing measurement**: none has been seen at a true
390px viewport on a real device. The account filter, the ledger date filter, the calendar heatmap
and the four colour schemes were all confirmed live at desktop width; a resize on the hosted tab did
not propagate to the page's own viewport the last time it was tried, so the reading needs a phone.
**One reading frees all five**, which is the cheapest fence this log has ever carried and the reason
the twelfth boundary stopped at 74% instead of 54%.

**The twelfth boundary moved D-171 … D-176 for 95% → 74%, and it is the first contiguous one in
five.** The eighth, ninth, tenth and eleventh each stepped over an open question or grouped a
stranded id with a later range; this one did not have to, because both open questions sit *below*
D-171. What it moved is one arc — the tenth boundary itself, then the four days in which the
statistics surface got its URL state and its account dimension and reached hosted (D-172 … D-176).
**What bought it was not a question closing but a run of work finishing**: everything in the range
was verified on the deployment and nothing in it is waiting on anything. **D-141 and D-158 are not
stepped over this time** — for the first time since the seventh boundary, the range simply began
above them.

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

## D-185 — D-182's day heading declared a band and a rule that both painted nothing, and the fix makes 2px load-bearing

- Date: 2026-09-01
- Status: **Built, reviewed, gated, committed as `0f70c62`, pushed and deployed.** Confirmed in the deployed stylesheet, which now serves `border-top:2px solid var(--navy);background:var(--paper-strong)`. `app/globals.css` and `tests/ui-theme.test.ts` (+1). No SQL, no route, no contract change; every project stays on migration 025.
- Context: the owner looked at the deployed `/ledger` and said the separation between days was still hard to spot. He was describing a preference; what he had actually found was two defects, and neither is visible by reading the CSS.

### Both separators the rule declared were being discarded, each for its own reason

**The band was the ground.** `tr.day-head th` set `background: var(--mist)`. But `.ledger-band` paints no surface of its own, so the ledger table sits directly on `html` — which `globals.css` also paints `var(--mist)`. Measured in the running app under Night, the heading's computed background and the document's were both `rgb(30, 36, 64)`. **The band has never been visible in any scheme since D-182 shipped it**, and no screenshot review would catch it, because there is nothing to see rather than something wrong to see.

**The rule lost a `border-collapse` tie.** The heading's `border-top: 1px solid var(--navy)` meets the preceding row's `td { border-bottom: 1px solid var(--line) }`, and the table is `border-collapse: collapse`. Equal width and equal style, so the tie breaks on document order and the cell higher up wins — the bright `--navy` line is thrown away and the dull `--line` one paints in its place. Distinguishing test, run in the browser rather than reasoned about: forced to red at 1px the border does not appear; at 3px it does, because width beats order.

So the only separation actually reaching the eye was 16px of padding and a slightly smaller uppercase face, competing against an identical `--line` rule beneath every row of the day.

### What was chosen, and why the number matters

Four treatments were rendered on the real markup in all four schemes before the owner picked: a band, whitespace, a whole-day zebra, and a sticky heading. **He chose the band**, which is also the smallest change and the one the existing CSS was already trying to be.

`--paper-strong` is the band, and it needed no new contrast work: `tests/ui-theme.test.ts` already measures "a panel lifting off the ground" as `--paper-strong` against `--mist` at a 1.04 floor in every scheme, so naming the right token *is* the assertion and the ratio is somebody else's test. **2px is load-bearing rather than cosmetic** — it is what wins the collapse. Dropping it to 1px restores the bug with no visible edit and no failing check, which is exactly why it is pinned.

**The ≤700px block is deliberately untouched.** There the heading is `display: block`, so no collapse happens and 1px on the ground paints as written. Nothing changes below that breakpoint — which also means this fix does **not** address the day boundary at phone width, and the owed phone reading still owes that.

### The guard, and the review finding against it

`tests/ui-theme.test.ts` gains one test, red-proved against the pre-fix declaration rather than assumed to work. `/code-review high` found one real defect in its first draft: it selected the rule with `String.match`, which returns the first match in file order, and **two rules carry this selector** — the desktop one and the ≤700px restatement. A mobile-first reshuffle of `globals.css` would have silently moved the assertion onto the phone rule. It now selects by content: the phone rule is the one declaring `display: block`, and this is the one that is not.

### Consequence worth keeping

**A token that resolves to the surface behind it is a live class of defect this repo cannot currently see.** `--mist` on a `--mist` ground is invisible in review, invisible in a screenshot, and invisible to the contrast floors, which only measure pairs somebody thought to list. The trap is recorded in `docs/gotchas/appearance.md`; a general guard is not attempted here.

## D-182 — The ledger reads a day at a time, the strip carries a balance, and the control row stops sizing one row's tracks for another

- Date: 2026-09-01
- Status: **Built, reviewed and gated. Not committed, not pushed, not deployed.** `app/transactions-view.tsx`, `app/ledger-controls.tsx`, `app/ledger-summary.tsx`, `app/ledger-shared.ts`, `lib/slip-reconcile.ts`, `app/globals.css`; `tests/slip-reconcile.test.ts` (+4). No SQL, no route, no contract change — the build still emits **24** `/api/v1/` routes and every project stays on migration 025.
- Context: the owner read the deployed `/ledger` and asked for three things in one message — rows separated by day with a heading, a balance beside Net movement, and a control row whose fields stopped being different widths for no reason. The third turned out to be a defect rather than a preference, and the reasoning behind each of the first two is what this entry is for.

### Day headings, and why the totals could not be summed here

Every row of a day now sits under a heading carrying the weekday, the date, the row count and the day's movements. `lib/slip-reconcile.ts`'s new `dayGroups` returns a map keyed by the **id of the row that opens each day**, so the table asks one question per row while rendering in order rather than restructuring the list into an array of arrays and then keeping two orderings in step.

**The day's figures come from `summarizeRows` — the function the strip above the table already uses — and not from a second summation.** That is the whole design of it: a row the owner excluded through `include_in_reporting` must be absent from the day's money and from the window's money, or present in both. A second loop here is precisely how those two would come to disagree, and D-165 records the last time this app had two answers to one question.

**In and out are printed separately and a net figure is never printed**, which is the owner's own reading on the calendar (D-179) applied one surface along: a day that took 20,000 in and paid 19,500 out is not a 500 day. **A direction that did not move is omitted rather than printed as zero** — the one place this differs from the strip, because the strip is one line read once while this repeats over every day on screen, and a column of `+B0.00` says nothing the absent figure does not.

**Paging needed no special handling and that is worth recording, because it looked like it would.** A day split across a page boundary would grow a second heading only if the rows were grouped per page; they are grouped after `compareRows` has ordered the whole loaded set by date, so every row of a day is contiguous however many fetches they arrived on. `dayGroups` groups **adjacent equals** and says so, and the test asserts both halves — sorted input gives one heading per day, unsorted input gives one per run.

**Grouping is off while a slip or card is being matched by hand, whatever the control says.** That mode lists one captured record and the rows it could be — candidates drawn from across the ledger by bank and amount — so a day heading over them would total unrelated rows. It is the same reason the totals strip disappears entirely in that mode, and the control itself stays live so the setting survives the mode rather than being lost to it.

### The balance follows the account and the window, and deliberately not the search box

The strip goes from four figures to five. The new one is the printed balance of the **newest row in scope**, where scope is the loaded window narrowed by account and by nothing else.

**The owner asked for it to follow the filter, and it does — for the two filters where that is meaningful.** Narrow to March and it reads the balance March closed on, which is why it prints `at` and a date rather than calling itself current. But Status and the search box narrow which rows are *displayed*, and the balance printed on whichever row a search happened to match is not a balance of anything. That is not an omission: it is the same line `app/transactions-view.tsx` already drew for `scope` itself, whose own comment says a running total of whatever a search matched would not be a balance.

**It is uncoloured, alone among the five.** The other four are movements, where the sign is the finding; a balance is a position, and painting a healthy account green would be the strip's opinion rather than the ledger's. An em dash where the scope holds no confirmed row — a window of slips and cash has movements and no printed balance, and no figure is the honest answer.

### The control row was sized for one of its two rows

`.ledger-controls` declared `auto minmax(200px, 260px) minmax(140px, 170px) minmax(200px, 1fr)` — four tracks chosen for the controls that happened to land on the **first** row. The second row inherited them for entirely different controls, so **From** rendered in the 140–170px track while **To** rendered in the 200px–1fr one, and the free-text **Filter** wrapped into that same narrow track and came out narrower than either date. Every complaint the owner made about this row was that one line of CSS.

Four equal `minmax(0, 1fr)` columns now, with the button and the wide field placing themselves, and the grouping toggle on a row of its own because it is a display switch rather than a narrowing.

### The fix for that introduced a phone-width defect that no check could see, and a screenshot caught it

`grid-column: span 2` on the Filter field is correct at four tracks and at two. At the ≤700px breakpoint the grid is **one** track, and a span does not clamp to the tracks that exist — it creates an implicit second column that nothing sizes, so every control landing in it renders at zero width on top of its neighbour. At 390px the Reload button ran off the left edge and the Order and Status labels printed as `ORDSTATUS`.

**`document.documentElement.scrollWidth` read 390 against a 390 viewport throughout.** The phone audit's whole instrument is sideways overflow, and zero-width tracks add nothing to a page's width — so the one committed guard for this surface would have stayed green over an unreadable control bar. It is D-173's family from a new direction, and it is now its own trap in `docs/gotchas/appearance.md`.

### Gate

`tsc` clean; `eslint .` clean (the same 2 pre-existing warnings in `app/transactions-view.tsx`, untouched); `check:docs --strict` clean; `pnpm build` clean at **24** `/api/v1/` routes; Vitest **949 passed / 7 skipped across 43 files** (+8). **pgTAP deliberately not re-run — no SQL has moved since migration 025.** Verified in a real browser against `next build && next start` with **301 invented local rows** seeded for the purpose: 101 day headings over 200 loaded rows, the balance reading the newest row with its date, and the control row correct at 1440px, at 980px and at 390px. No real financial data was read or reproduced.

## D-183 — The calendar reads a year at a time, three across, and every month answers for its own days

- Date: 2026-09-01
- Status: **Built, reviewed and gated. Not committed, not pushed, not deployed.** `app/statistics-calendar.tsx`, `app/statistics-view.tsx`, `lib/statistics.ts`, `app/globals.css`; `tests/statistics.test.ts` (+4). No SQL and no contract change — `dailyMovements` (migration 025) already carries everything this needed.
- Context: the owner read D-179's calendar on the deployment and made three observations: the months stack in one column so no two can be compared, there is no way to ask for one particular year, and the hover readout sits in one fixed place far from the day being pointed at. All three are about reading a year rather than about the data.

### Three columns, and the layout is the feature

`.cal-months` was `flex-direction: column`. Twelve months in one column is a four-thousand-pixel scroll in which comparing March with October means remembering March. Three across and four down is a year on one screen — two across at ≤980px, one at ≤700px, because three columns at phone width would put a day cell below the 44px tap standard D-168 set, and a calendar you cannot press is not a calendar.

### A year is a custom range, not a preset, and the difference is the whole design

`WINDOW_PRESETS` gains `last-6-months` — the owner asked for it beside the three-month one, and both depths now read their offset out of one table so an off-by-one cannot land in only one of them.

**A year does not join that list.** Every preset is a *rolling* question: "This month" resolves differently tomorrow, which is why `pickerSearch` encodes presets by name and a link to one keeps meaning what it said. "2025" is two dates that will never move — the custom shape exactly. So the year control sets a custom range through `yearWindow`, and reads its own selected value back out through `wholeYearOf` rather than storing a second copy of a fact the two date inputs already hold. Choosing a year ticks Custom and fills those inputs, where the owner can see precisely what was asked for.

**A `<select>` rather than a twelfth chip**: the presets are a fixed count, the years grow by one every January, and a control bar that grows without bound stops being readable. The list is learned from the responses — the page opens on All time, so the first response's `window.from` is the ledger's own first row — and only ever reaches further back, so choosing "This month" cannot make 2025 unreachable.

**Naming 31 December for the year still running is not clamped, and the first draft of this code claimed it was.** `/code-review high` caught a docstring asserting the RPC clamps the end to the ledger's last row. It does not: choosing the current year resolves to a genuine 365-day window and every average divides by 365 rather than by the days elapsed, so "per day" reads lower here than under the "This year" preset. **That is the intended reading** — a year means the whole year, and the preset beside it is the one that means "so far" — but the comment had it backwards on a money path, which is the kind of thing that is true until someone believes it. The resolved from/to pair and the day count are printed above the figures they divided, which is the same protection the preset labels rest on.

### The readout moved to the month it describes

The hovered day's figures stood in the figure's single `figcaption`. With twelve months in three columns, reading December's figures meant looking up and across to a fixed spot at the top. Each month now carries its own readout line beside its heading.

**Its height is reserved whether or not it is filled, and that is not tidiness.** A readout that grows the heading pushes that month's grid down, which moves the cell out from under the pointer, which fires `mouseleave`, which clears the readout, which shrinks the heading and puts the cell back — forever. The `min-height` is what stops the flicker.

**The month readouts are `aria-hidden` and the live region stayed exactly one element in one place.** Two regions would race to describe one pointer. `/code-review high` also caught that the sentence left behind in the `figcaption` duplicated the `field-help` printed directly above the figure — permanently, where before it was at least replaced on hover — so what remains there is only the half that is true of this figure alone.

### Gate

`tsc` clean; `eslint .` clean; `check:docs --strict` clean; `pnpm build` clean at 24 routes; Vitest **949 passed / 7 skipped across 43 files**. Verified in a real browser against `next build && next start` over an invented nine-month ledger: three columns of 409px with no document overflow, twelve months in four rows when a year is chosen, the year round-tripping through the URL and back into the select on reload, the readout rendering beside its own month's heading, and one column with 44px cells at 390px. No real financial data was read or reproduced.
## D-184 — D-182 and D-183 deploy, and both are confirmed against the real ledger

- Date: 2026-09-01
- Status: **Committed as `23bce9d`, pushed to `origin/main`, deployed, and confirmed against the owner's real hosted ledger.** Documentation only beyond that commit; no code changed after the verification. Supersedes the "not committed, not pushed, not deployed" status lines D-182 and D-183 carry, which are left standing because this file is append-only.
- Context: D-182 and D-183 were built, reviewed and gated but every reading had been taken against a local build over invented rows. The owner had granted commit, push, deploy, `db push`, hosted-browser and real-data read together at the start of the session. This entry is the reading that discharges the gap, and it is deliberately short.

### What the deployment confirmed

Read in the owner's own signed-in browser session at 1699px, on the real hosted ledger. **No figure below is money** — every one is a count, a width or a label, per D-049.

- **`/ledger`**: **122 day headings over 297 real rows**, the strip carrying **five** boxes ending in **Balance**, the balance printing an `at <date>` qualifier rather than claiming to be current, and the grouping toggle at **44px**.
- **The heading shape is right on real data**: a Sunday with two rows renders `SUN, ## AUG #### · # ROWS · −#` — the out direction alone, because that day had no deposits and a zero direction is omitted rather than printed. That is the behaviour the local reading showed and the first time it has been seen against rows the owner did not invent.
- **The control row is fixed on the real page, measured rather than eyeballed**: Account, From, To, Order and Status all at **293px**, Filter at **600px**, Reload at its own **95px**. Before this change From measured in a 140–170px track and To in a 200px–1fr one. `documentElement.scrollWidth` 1684 against a 1699 viewport — no sideways pan.
- **`/statistics`**: the calendar lays out **three columns of 442px** over the ledger's **fourteen real months** and **424 live cells** — the same cell count D-181 read, which is the incidental cross-check that this change moved the layout and not the data. The preset row carries **Last 6 months**.
- **The year select offers exactly 2026 and 2025**, learned from the real response's own `window.from` rather than from a guess, and choosing 2025 resolves to **twelve months in three columns**, ticks Custom, fills the two date inputs with `2025-01-01`/`2025-12-31`, and round-trips into the address bar — with the select still reading 2025 afterwards, which is `wholeYearOf` doing its only job.
- **The readout renders beside its own month's heading** with the day in bold, and the sentence `/code-review high` flagged as a permanent duplicate now appears **once** in the calendar section rather than twice.

### Nothing new was found, and that is the finding worth recording

D-181's live reading corrected the work it verified — a backdrop that brightened the page, a test measuring a surface the app never paints. This one corrected nothing: every structural fact matched what the local build over invented rows had already shown. **The local reading was therefore load-bearing rather than ceremonial**, which is the argument for seeding invented rows into `private-ledger-local` before asking to deploy rather than after — the `span 2` defect that broke the control bar at 390px was found that way, and it would otherwise have shipped.

### Still owed, and unchanged

**A phone-width reading on a real device.** The 390px readings behind D-182 were an emulated viewport in a browser pane; the hosted app has not been seen on the owner's own phone, and neither have D-177 … D-181. Seven entries now sit behind that one measurement, which is the owner's to take.
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

## D-177 — Task 46's account filter gets its control, reviewed and reused between `/ledger` and `/statistics`, closing D-161 for good

- Date: 2026-08-31
- Status: **Built, reviewed, verified against `private-ledger-local`, committed as `4f51a7e`, pushed and deployed** — confirmed live against the real hosted ledger in the owner's own signed-in browser session: the select lists his three real accounts, and narrowing to one correctly changed every figure and the balance-source sentence. **No real figures from that verification are reproduced here** (D-049). `app/statistics-view.tsx`, `app/account-select.tsx` (new), `app/ledger-controls.tsx`, `app/globals.css`, `tests/statistics.test.ts`. `lib/statistics.ts`, `app/api/v1/statistics/route.ts` and `lib/date-range.ts` were already sitting in the working tree, uncommitted, when this session started, unauthored by this session — this entry commits them alongside the control that finally exercises them, since `lib/date-range.ts` turned out to be a genuine compile-time dependency of `lib/statistics.ts` rather than task 47 groundwork that could be left behind. `app/api/v1/accounts/[id]/transactions/route.ts` and `lib/transactions.ts` — task 47's unrelated backend groundwork, also sitting uncommitted — were checked for a dependency (none found) and deliberately left out, unreviewed and uncommitted.
- Context: D-174 wrote migration 024 for both task 46's account filter and task 47's ledger date range; D-176 pushed it to hosted. D-170 closed the window-picker half of D-161 and left the account filter as this file's own words put it, "untouched." The RPC and route side of the filter (`lib/statistics.ts`'s `accountId` plumbing, `windowSearch`, `pickerSearch`, `pickerStateFromSearch`) was already in the tree, unauthored by this session and untested against a component — no `<select>` existed to drive it.

### What shipped

A `<select>` beside the window picker, populated from `GET /api/v1/accounts`. Choosing an account narrows `accountId` into the same `search` key the window already used, so a request in flight is invalidated by an account change exactly as it already was by a date change (D-170's `{ search, data }` pattern, unmodified). The balance section gained one sentence stating which of the two sources (D-174: derived combined position, or the account's own printed `post_balance_minor`) the chart on screen is currently drawn from — the chart itself needed no change, since `BalanceChart` already renders whatever `dailyBalances` the RPC returns.

### `/code-review high` ran before the commit ask, as D-125 requires, and found four things in the first draft

Two were real. **The select could show "All accounts" as selected while the page was genuinely narrowed to an account**: the first draft's "unknown account" fallback option only rendered once `accounts !== null`, so a deep link to `?account=<uuid>` displayed the wrong selection for as long as the separate `GET /api/v1/accounts` request was in flight — not a race that resolves, since a failed request left it wrong forever. And the two-defect classes it sits inside — a `<select>` with no matching `<option>` silently falls back to whichever option is first — was one bug wearing two names: "loading" and "genuinely unknown" are the same condition from the control's point of view, and the fix treats them as one (`!matches`, in `app/account-select.tsx`) rather than two branches that could drift apart. The other two findings were reuse and a redundant condition: this control was a near-verbatim copy of `/ledger`'s own account `<select>` (`app/ledger-controls.tsx`), and the "unknown" branch's guard repeated a check its own antecedent already implied.

**Extracted rather than patched separately**: `app/account-select.tsx`'s `AccountSelect` is now what both pages render, on the ledger's existing `string` + `ALL_ACCOUNTS`-sentinel contract rather than introducing a second `string | null` convention beside it — a caller wanting `null` for "all" translates at its own boundary, which is what `/statistics` now does and `/ledger` did not need to change. The "unknown account" fallback is `showUnknown`, opt-in and off by default, so `/ledger`'s rendered output and behaviour are unchanged by the extraction — verified by driving both pages in a real browser after the change, not inferred from the type check.

### A test gap the review named and this entry closes

Every call site touched by the `accountId`-field repair (below) set it to `null`; nothing asserted the round trip for a real value. Two tests now do: `pickerSearch`/`pickerStateFromSearch` carry a uuid through `?window=...&account=<uuid>` and back, `windowSearch` appends `account` last on the route's own encoding, and a battery of non-uuid strings (`""`, a truncated uuid, no dashes) all fall back to `accountId: null` on the same "a bad link is the default page, not a blank one" rule an unrecognised preset already followed.

### Fixed in passing, not authored this session

`tests/statistics.test.ts` had object literals at nine call sites written before `PickerState` gained `accountId` — seven failing `tsc` outright ("Property 'accountId' is missing"), two more only surfacing at `vitest run` because they compared against `toEqual`, which does not type-check its argument. Each now carries `accountId: null` — the round-trips being asserted are unrelated to the account filter, so `null` is the correct value rather than a stand-in.

- Evidence: the commit was isolated before it was made — `git stash push --keep-index` reduced the working tree to exactly the staged files (the two local-only configs and task 47's backend restored from the stash for reference only, never staged), and the full gate ran against that reduced tree rather than against everything sitting in the working directory: `tsc --noEmit` clean, `eslint .` clean (crashes with an OOM against the committed `eslint.config.mjs`, which lacks this machine's `.runtime/` ignores — confirming why that file must never be committed, not a defect in this change), `check:docs --strict` clean at 177 decisions and 191 traps, `pnpm build` clean, Vitest **892 passed / 7 skipped across 41 files** (+2, the account-id round trip). **No pgTAP re-run — no SQL moved.** Manually verified in a real browser against a `next build && next start` on a throwaway port, signed in through the guarded dev-session route (`app/api/v1/dev/session/route.ts`, loopback-only, `NEXT_PUBLIC_ALLOW_DEV_OWNER_SESSION=1`): on `/statistics`, the select populates with the three seeded accounts, choosing one rewrites the address bar to `?account=<uuid>` and the outgoing `GET /api/v1/statistics` request carries the same `account` parameter, a deep link to an id naming no account renders "Unknown account" as selected rather than falling back to "All accounts", and at a 375px viewport `document.documentElement.scrollWidth` equals `clientWidth` — no sideways pan; on `/ledger`, the extracted control still renders the same three accounts and `onSelectAccount` still fires the same per-account transaction requests it did before the extraction. **Then confirmed against real confirmed rows on the deployed hosted app**, in the owner's own browser session: narrowing to a real account correctly changed every figure and the balance-source sentence — real amounts, dates and labels are not reproduced in this entry or anywhere else in the repository, per D-049. D-161 (the surface and the follow-on this closes for good), D-125 (the review-before-commit practice this followed), D-170 (the pattern this half repeats), D-173 (the CSS class both selects share), D-174 (the migration this is built on), D-176 (hosted has the migration this depends on).

## D-178 — The ledger's own date filter, and why it cannot be a client-side filter like every control beside it

- Date: 2026-08-31
- Status: **Built, reviewed, isolated-tested, committed as `5c016a9`, pushed and deployed; confirmed against the owner's real ledger.** `app/transactions-view.tsx`, `app/ledger-controls.tsx`, `app/globals.css`, `tests/transactions.test.ts`, `tests/date-range.test.ts` (new). `app/api/v1/accounts/[id]/transactions/route.ts` and `lib/transactions.ts` were already sitting in the working tree, uncommitted and unauthored this session, when this session started — task 47's SQL-and-route half. `app/api/v1/statistics/route.ts` also touched, one line, unrelated to what it answers (see below).
- Context: D-174 wrote migration 024 for both task 46's account filter and task 47's ledger date range; D-176 pushed it to hosted; D-177 built and shipped task 46's half. This closes task 47's plain date filter — not the calendar heatmap PLAN task 47 also names, which the owner explicitly deferred behind this one on 2026-08-29 and remains unauthorized and unbuilt.

### Every other control on `/ledger` filters rows the client already holds. This one cannot.

Account, Order, Status and Filter all narrow `ledgerWindow`, which `app/transactions-view.tsx` already fetched in full (D-159's line: every page holds only the newest rows for its account). An owner asking for March cannot be answered by hiding whatever happens to already be on screen — the *fetch* has to be bounded, not the display. That is why the date inputs do not filter live like their neighbours: they take effect only on the next Reload, the one control here that already means "go back to the server."

### `appliedRange` versus the live `dateFrom`/`dateTo` — Statistics' `{ search, data }` split, here for a different reason

D-170 held the response beside the search it came from so the page could tell *loading* from *quietly wrong*. Here the split exists because **a second caller reads the applied state**: `loadMore` walks a cursor that `list_account_transactions_page` produced under a specific `p_from`/`p_to`, and it must fence the next page with the *same* bounds — sending the live (possibly just-edited, not-yet-reloaded) values instead would return a page whose rows and whose account totals belong to two different windows stitched into one account. `appliedRange` is set only where `ledgerWindow` is, never from the inputs directly.

### `totals.rows` needed no client-side change to become correct under a window

Migration 024 makes `list_account_transactions_page`'s `totals` bounded by `p_from`/`p_to` when they are supplied, exactly as `ledger_statistics`' did for D-174. `lib/ledger-window.ts`'s `scopeTotals`/`windowReach` already read `AccountWindow.totals` as a server-computed whole-scope fact rather than deriving anything themselves — so once the fetch carries the range, every downstream figure is correct with zero changes to that module. Verified by reading the migration's SQL directly rather than trusting the comment describing it, the same discipline D-177 used on the two-source balance.

### What the reach line would have quietly started meaning, and the line added to say so

"Showing 40 of 40 confirmed rows" reads as *the whole ledger*. Once a window is applied, both numbers are the RPC's bounded count, so 40 could as easily be everything in one narrow month — the same class of silent narrowing D-159 and D-162 both exist to refuse. `Showing confirmed rows {from} to {to}.` now states what the fraction below it is a fraction *of*, on the same rule `app/statistics-view.tsx` states its own window before any figure derived from it.

### `/code-review high` ran before the commit ask, as D-125 requires, and found the same defect class D-177's review found — duplicated, not new

`windowSchema`'s `refine` in this route reimplemented `isUsableRange` instead of calling it — and the identical duplicate already existed in `app/api/v1/statistics/route.ts`, planted when D-174 wrote it. **Both are now `refine(isUsableRange, …)`.** Fixing only the new copy and leaving the shipped one would have been fixing the symptom the review named and not the recurring cause — a comparison this simple reads as obviously correct wherever it is retyped, which is exactly how it drifts unnoticed the day one copy changes and the other does not. Re-verified against the running route after the edit, by request rather than by type-check: an ordered range still answers 200 and a transposed one still answers 400 with its original wording, on both routes.

The review also named `lib/date-range.ts` as untested — `windowSchema` now delegates to it, so its correctness became this route's correctness with nothing exercising it directly. `tests/date-range.test.ts` is new and covers all four functions and the round trip between `rangeSearch` and `rangeFromSearch`; `OPEN_RANGE` and `rangeSearch` itself have no caller yet anywhere in the app, kept rather than deleted because the module's own header names them as the encoding a future calendar/day view (PLAN task 47's other half) would read a deep-linked date through — removing them now would be solving the review's finding by deleting the thing under test rather than testing it.

- Evidence: isolated the same way D-177 was — `git stash push --keep-index` reduced the tree to exactly the intended commit before every check ran. `tsc --noEmit` clean, `eslint .` clean (2 pre-existing warnings in `app/transactions-view.tsx`, both predating this diff — `load` deliberately omitted from two `useEffect` dependency arrays, per their own comments), `check:docs --strict` clean at 177 decisions and 191 traps, `pnpm build` clean, Vitest **906 passed / 7 skipped across 42 files** (+14 over D-177's baseline: 9 for `lib/date-range.ts`, 5 for `ledgerPageSearch`/`cursorAfter`). **No pgTAP re-run — no SQL moved; migration 024 already carries and tests the bounded RPCs (D-174).** Manually verified in a real browser against `next build && next start` with the guarded dev-session route: a transposed range on `/ledger` shows the refusal sentence and disables Reload; a corrected range fires `GET .../transactions?from=…&to=…` for every account and the applied-window sentence renders; separately, direct requests against both routes confirm the `isUsableRange` refactor is behaviour-preserving — 200 for an ordered range, 400 with the original message for a transposed one, on `/api/v1/statistics` and `/api/v1/accounts/[id]/transactions` alike. **Then confirmed against real confirmed rows on the deployed hosted app**, in the owner's own signed-in browser session: narrowing to a real month across all three real accounts changed the figures correctly, the applied-window sentence stated it, and the transposed-range refusal reproduced identically live. No real account ids, dates or amounts are reproduced in this entry or anywhere else in the repository, per D-049. D-174 (the migration this is built on), D-177 (the sibling half and the review pattern this repeats), D-125 (the review-before-commit practice), D-170 (the `{ search, data }` / `{ ledgerWindow, appliedRange }` pattern), D-159 and D-162 (why a silent narrowing is treated as a defect class rather than a one-off).

## D-179 — The calendar heatmap, PLAN task 47's deferred second half: two ramps not one, sparse not dense, and migration 025

- Date: 2026-08-31
- Status: **Built, reviewed, isolated-tested, committed as `7d9d4e6`, migration 025 pushed to hosted, code pushed and deployed; confirmed against the owner's real ledger.** New: `app/statistics-calendar.tsx`, `supabase/migrations/202608310025_statistics_daily_movements.sql`, `supabase/tests/013_statistics_daily_movements.sql`. Changed: `app/statistics-view.tsx`, `app/statistics-charts.tsx` (exports `DEPOSIT`/`WITHDRAWAL`, `magnitude` moved to `lib/statistics.ts`), `app/transactions-view.tsx` and `app/ledger-controls.tsx` (`/ledger` now seeds its date range and account filter from the URL on first load, one-way, and its own `AccountSelect` gets `showUnknown`), `lib/accounts.ts` (`ACCOUNT_ID_PATTERN` extracted, shared with `lib/statistics.ts`), `lib/statistics.ts` (`dailyMovementSchema`, `daysInMonth`/`isoWeekdayOf`/`monthsBetween`), `tests/statistics.test.ts`.
- Context: D-178 closed task 47's plain date filter and left the calendar heatmap "unauthorized, unscoped and unbuilt beyond the paragraph in `PLAN.md`", deferred by the owner on 2026-08-29 pending whether it was still wanted once the filter shipped. Authorized this session, along with commit, push, deploy, `db push` and real-ledger read together in one grant.

### Three open design questions, settled by the owner rather than by the recommendation PLAN.md carried

PLAN.md's own text recommended a single net ramp, `include_in_reporting` honoured "for the same reason" every other total does, and an empty day drawn as an empty cell. The owner kept the second and third and overrode the first: **the cell shows both directions**, income as `DEPOSIT` and spending as `WITHDRAWAL` — the same validated pair `MonthlyChart` already uses — split across the top and bottom half of the cell, because a day of pure income and a day of pure spending are different findings that a net ramp would draw as opposite ends of one scale.

### `dailyMovements` is sparse, and a day absent from it is not the same day as a day present at zero

Migration 025 adds one field to `public.ledger_statistics`, built from `private.reportable_movements` (024) grouped by `source_date` — no new predicate, so it inherits the account filter and `include_in_reporting` for free. A date with no reportable movement — nothing happened, or its only movement was excluded from reporting — gets no row at all rather than a zero-valued one. **This is not the same question `dailyBalances` answers**: the balance series deliberately does not honour the flag, because excluding a row from reporting does not un-move the money; the calendar's own totals do honour it, because it is answering the same "how much was spent" question every other figure on the page answers. pgTAP `013` proves both properties against 011's fixture: an excluded-only day is present in `dailyBalances` and absent from `dailyMovements`, in the same four-day window.

### `/code-review high` ran before the commit ask and found ten defects; nine are fixed, one is recorded

Two were real correctness bugs found by tracing the fixture rather than by inspection: the empty-cell wording said "no confirmed rows" for a day whose only transaction was excluded, contradicting the row `/ledger` would actually show one click away — reworded to "no reportable movement". And `/ledger`'s own `AccountSelect` had no `showUnknown`, so a calendar link carrying `account=` could show "All accounts" selected while the page was genuinely narrowed — the exact defect class D-177 fixed on `/statistics`, reintroduced here because `selected` had never before been reachable from anywhere but the dropdown itself. Also fixed: a hand-rolled query-string builder where `windowSearch` already existed; a third copy of the same BigInt-magnitude helper (now exported once, from `lib/statistics.ts`); zero test coverage for the new hand-rolled calendar-day arithmetic (`isoWeekdayOf`'s Sakamoto's-algorithm table, `daysInMonth`, `monthsBetween` — seven fixed points cross-checked against an independent `Date.UTC(...).getUTCDay()` computation, not against the algorithm itself); a stale hover/focus readout for a keyboard user who tabs out of the grid without the mouse ever leaving it; missing memoization that rebuilt the day-lookup map and rescanned every movement on each cell hovered; and unvalidated date seeding on `/ledger`'s first load, now checked against `isoDateSchema` before being accepted. **Recorded rather than fixed**: the calendar renders one grid per month in the window with no cap, and "All time" is exactly the case that spans the ledger's whole history — confirmed harmless in shape on the real fourteen-month ledger (no crash, no visible break), but the render cost of a much longer history is untested and unbounded.

### `windowSearch` grew a second caller instead of the calendar growing a second encoder

`app/statistics-calendar.tsx`'s day links build `/ledger${windowSearch({ from, to }, accountId)}` — the same range-plus-account encoder the window picker already uses and `tests/statistics.test.ts` already asserts, rather than a second hand-rolled query string that could drift from it. This is also what makes `/ledger`'s new URL-seeding exact: `rangeFromSearch` and the shared `ACCOUNT_ID_PATTERN` read back precisely what `windowSearch` wrote.

### `/ledger` now reads its filters from a URL once, and deliberately does not write them back

Unlike `/statistics`'s picker (D-170, D-172), which round-trips through `history.replaceState` on every change, `/ledger`'s new `dateFrom`/`dateTo`/`selected` seeding is one-way: read on mount, never synced back to the address bar. `/ledger` has never round-tripped any of its filters — Account, Order, Status and Filter are all plain component state — so writing only the two new ones back would have made this control alone inconsistent with its five siblings, not consistent with `/statistics`. Left as a known asymmetry rather than resolved either way, since resolving it is a separate design question the owner has not been asked.

- Evidence: `tsc --noEmit` clean, `eslint .` clean (the same 2 pre-existing warnings D-178 already recorded, unrelated to this diff), `check:docs --strict` clean at 178 decisions and 191 traps, `pnpm build` clean (23 `/api/v1/` routes, unchanged), Vitest **910 passed / 7 skipped across 42 files** (+4 over D-178's baseline, all in the new calendar-arithmetic suite), pgTAP **all 13 files, 390 assertions**, including the new `013_statistics_daily_movements.sql` (12 assertions against 011's fixture). Verified in a real browser against `next build && next start` with the guarded dev-session route and invented local-only data (never committed, never real): cell colour and intensity scale correctly by direction, a day link opens `/ledger` already filtered with no Reload needed and figures matching the calendar exactly, and an account-carrying link correctly pre-selects that account rather than falling back to "All accounts". **Then pushed to hosted and confirmed against the real ledger**: migration 025 applied after a backup verified from the database at sequence 43 / last_exported_sequence 43 (the owner exported a fresh one when the reading found the standing backup four mutations stale — the D-152 gate holding as designed, not a formality), `authenticated`/`anon` grants read back correctly narrow, and the deployed calendar renders all fourteen months of the real ledger's history without error. A real day's click-through was confirmed to match the ledger exactly on row count and both direction totals, in the owner's own signed-in browser session. No real account ids, dates or amounts are reproduced in this entry or anywhere else in the repository, per D-049. **Not verified**: the calendar at phone width — a resize on the real signed-in tab did not propagate to the page's own viewport, so this is an owed reading, on the same terms D-178 already recorded for its two controls. D-178 (the filter this completes), D-177 (the `showUnknown` defect class), D-174/D-176 (migration 024, whose `reportable_movements` this reuses), D-125 (review before the commit ask), D-049 (value-free writing).

## D-180 — Four colour schemes, reversing D-137, and a test that retires the argument against them

- Date: 2026-09-01
- Status: **Built, reviewed, gated and verified in a real browser locally. Not committed, not pushed, not deployed.** New: `lib/ui-theme.ts`, `app/theme-picker.tsx`, `app/api/v1/ui/theme/route.ts`, `tests/ui-theme.test.ts`, `tests/e2e/theme-picker.spec.ts`. Changed: `app/globals.css` (three dark blocks, nine promoted tokens, `.font-picker` → `.ui-picker`), `app/layout.tsx` (`generateViewport`, `data-theme`), `app/site-header.tsx`, `app/font-picker.tsx`, `app/statistics-charts.tsx`, `app/statistics-calendar.tsx`, `DESIGN.md`.
- Context: **D-137 dropped the dark scheme** and a later entry withdrew the owner's *"but we'll see"* hedge, recording that he would say so if it changed. He said so, and asked for a Stardew-grounded palette. Three candidates were rendered on the real app surfaces and measured; he chose Night Town and asked that all three stay switchable.

### D-137's argument was right, and the answer to it is a test rather than a promise

D-137 dropped the scheme because *"a second scheme is a second set of contrast facts that nothing here measures"*. That is not a taste objection and enthusiasm does not answer it. `tests/ui-theme.test.ts` does: it parses `app/globals.css`, and for **every** declared scheme asserts 36 contrast pairs, identical token sets, `THEME_GROUNDS` agreement with each block's `--mist`, that no scheme block redeclares a non-colour token, and that no colour literal is written outside a token block. A fourth scheme now costs one CSS block and one array entry — and cannot ship unmeasured.

**The floors were calibrated from the shipped palette, and the calibration found the instrument at fault.** A first pass used textbook numbers — 3:1 for every non-text boundary, 1.1 for a surface lift — and the **light palette failed five of them**: the privacy dot, the backup band's border, the warning's edge and both surface lifts. Light is accepted, deployed and axe-clean, so the floors were wrong rather than the palette; they are now the light scheme's own measured values, rounded down. The claim the test defends is therefore *"at least as good as daylight"*, which this repo can actually defend. The same discipline applied to series separation: a contrast ratio is the wrong instrument for two marks of similar lightness — the shipped pair measures 1.83 against each other — so separation is asserted as distance, not as ratio.

### Three darks rather than one, because the choice was made from the wrong evidence to make it from

Night Town (`#1e2440`) is the owner's pick; Lamplit (`#2b2018`, dark walnut — the game's own furniture) and Cellar (`#1a2110`, `--navy` darkened into a ground) ship alongside it. The decision was made from renderings of **invented** data on a desktop, and the real test is his own ledger on his own phone at night. A palette reachable only by editing CSS and redeploying does not get re-evaluated. All three are held to identical floors, so keeping them costs measurement that is already automated.

### The eleven literal colours the `GOTCHAS.md` inversion trap predicted would fail again

`app/globals.css` carried eleven rules pairing a `var(--…)` surface with a hardcoded `color` — correct in light, unreadable in dark. The trap entry had named exactly this and said the pairings *"are still in this file and will fail again"*. All eleven are now tokens (`--on-action`, `--warn-ink`, `--resync-ink`, `--verified-ink`, `--verified-rail`, `--celadon-dot`, `--backup-edge`), each light value byte-identical to the literal it replaced, so **daylight renders unchanged**. One literal survives deliberately: `#fff` on `.owner-access-qr`, because a QR quiet zone is white at midnight too.

**Worse than the CSS was `app/statistics-charts.tsx`**, whose docstring claimed its five colours *"inherit the app's palette and its one declared colour scheme for free (D-137)"*. They were JS constants and inherited nothing; the claim was unfalsified only because there was one scheme to agree with. On a dark ground its `#283618` ink would have drawn at 1.2:1. They are `var(--…)` strings now, and the same pair feeds D-179's calendar ramps — which mixed a fixed light-scheme green into `var(--paper)` and would have run backwards at the faint end.

### `/code-review high` found the same trap in a subtler form that no contrast floor could catch

`.detail-dialog::backdrop` mixed `var(--navy)` — the **text** colour — at 65%. Not a literal paired with a variable, but a variable used for a role that flips: correct in daylight where the ink is near-black, exactly backwards where it is near-white. Measured, the backdrop went from **19% luminance in daylight to 38% in all three darks** — opening a dialog washed the page *lighter* than the app behind it, glaring in the dark room the scheme exists for. A contrast floor cannot report it because both states have ample contrast; only the *direction* is wrong. Fixed with a `--scrim` token whose light value is `--navy`'s, and guarded by an assertion that the composited backdrop is darker than the ground in every scheme — red-proved, reproducing 38% exactly. The review's second finding was in the test rather than the app: a pair measured the privacy dot against solid `--celadon`, a surface `.privacy-chip` never paints, so it could have passed while the real halo failed. **Recorded rather than fixed**: `public/manifest.webmanifest` stays light-only, so an installed app launched in a dark scheme flashes a cornsilk splash — a manifest is static and cannot read the cookie.

### A second route rather than a second field, on the first route's own reasoning

`app/api/v1/ui/font/route.ts` is `.strict()` and its docstring named `{font, theme}` as the exact shape it refuses, *"because a caller sending both has a broken model of this endpoint and answering it as though the extra key were fine is how a second preference gets half-built"*. That was written before this existed and it was right, so the second preference was built whole: its own closed set, its own cookie, its own route. Both remain httpOnly and server-read, so the ground is correct on first paint and `app/` stays free of client storage APIs — the blanket grep `tests/privacy.test.ts` depends on.

`system` is the default and resolves through `prefers-color-scheme`. Because CSS cannot alias one rule to another and the server never learns the device's preference, Night Town's tokens are written **twice** — once for `[data-theme="night"]`, once inside the media query for `[data-theme="system"]`. The alternative was the blocking inline script the CSP would have to admit, which `lib/ui-font.ts` already refused for the typeface. The duplication is asserted equal token-for-token rather than left to a comment.

### axe had never run in a scheme other than the default, which is how the 2026-08-21 inversions shipped

The `GOTCHAS.md` trap ends: *"Neither browser suite's axe check caught them: they run in the default scheme."* Three white-on-copper pairings shipped behind a fully green accessibility pass for that reason. `tests/e2e/theme-picker.spec.ts` now runs axe over all five routes in each of the three dark schemes, on desktop and mobile — 30 route-scheme passes that did not exist before.

- Evidence: `tsc --noEmit` clean; `eslint .` clean (the same 2 pre-existing warnings in `app/transactions-view.tsx` D-178 and D-179 already recorded, untouched); `check:docs --strict` clean at 179 decisions and 191 traps **before this entry**; `pnpm build` clean at **24** `/api/v1/` routes (+1, the theme route); Vitest **941 passed / 7 skipped across 43 files** (+31 over D-179's baseline, all in `tests/ui-theme.test.ts`); Playwright isolated **70 passed / 8 skipped** (+32 over the pre-change 38, from `tests/e2e/theme-picker.spec.ts`, desktop and mobile). **No pgTAP re-run — no SQL moved.** Four of the structural guards were **red-proved** rather than trusted: darkening a dark scheme's secondary text, desynchronising the duplicated Night Town block, writing a literal colour back into an ordinary rule, and letting a scheme block redeclare `--radius` each failed in exactly the intended assertion, and the file was restored from a backup and re-run green after each. Verified in a real browser against `next build && next start` with the guarded dev-session route and the local synthetic project: all four schemes paint their declared ground, `color-scheme` reaches the native date input in each, the picker's round trip stores and re-renders, daylight is visually unchanged, and at a 375px viewport both pickers sit behind the Settings disclosure with 44px targets and `document.scrollWidth` equal to the viewport. **Not verified**: rows, status chips, the verified rail and the calendar heatmap in any dark scheme — the local project's ledger is empty, so those surfaces had no data to render, and the deployed app is where they exist. That reading is owed, and it joins the phone-width reading D-178 and D-179 already owe. No real financial data was read or reproduced for this entry (D-049). D-137 (the decision this reverses), D-136 (the palette it keeps), D-163 (mark 3:1 against text 4.5:1), D-157 and D-166 (why the picker notes stay one line), D-156 (the accessible-name defect both pickers avoid), D-125 (review before the commit ask), D-179 (the calendar ramps this repairs).

## D-181 — D-180 deploys, and the dark schemes are confirmed against the real ledger

- Date: 2026-09-01
- Status: **Committed as `12d0302`, pushed to `origin/main`, deployed, and confirmed against the owner's real hosted ledger.** Documentation only beyond that commit; no code changed after the verification.
- Context: D-180 was built, reviewed and gated but recorded an explicit owed reading — no dark scheme had been seen against real rows, because the local project's ledger is empty and every surface that carries a promoted token (status chips, the verified rail, the provisional tag, the calendar) renders only with data. The owner had granted commit, push, deploy and real-ledger read at the start of the session. This entry is that reading.

### What the deployment confirmed that no local run could

Measured in the owner's own signed-in browser session, on **297 real rows** in Night Town, against each element's **real composited surface** rather than the idealized one `tests/ui-theme.test.ts` assumes:

- secondary text **7.59:1**, money-in **8.79:1**, the verified chip **7.26:1** — every one above its floor;
- the verified row rail paints `--verified-rail`, on six rows;
- the calendar renders **424 cells, 173 income-painted and 359 spending-painted**, both ramps mixing correctly into the dark paper — the surface D-180 repaired, since it had mixed a fixed light-scheme green into `var(--paper)`;
- the chart's text resolves through `var(--muted)`, which is the direct evidence that the five promoted JS constants now inherit rather than merely claiming to.

**The backdrop fix was confirmed on the live surface, not inferred**: `--scrim` composites to **0.7% luminance against a 1.9% ground**. The pre-fix value on that same real surface was 38%. This is the one finding of the three that a user would have met immediately, and it is the only one that no contrast floor would ever have reported.

### The measurement found one thing the unit suite had assumed and the deployment corrected

The status chips are `<em>` elements, so `td em`'s `background: var(--saffron-wash)` applies to **every** chip including the verified one — a pre-existing choice, not a D-180 change. `tests/ui-theme.test.ts` measures `--verified-ink` against the ground and the panel, neither of which is where that chip actually sits. It clears its floor on the real surface (7.26:1), so nothing is broken, but **the test is measuring a surface the app does not paint for that element** — the same defect class the review already caught once in this suite, surviving in a second place. Recorded rather than fixed: correcting it needs the chip's real stacking read out of the deployment rather than guessed, and that is a change to the test, not to the app.

### What is still owed

**Phone width, shared with D-178 and D-179** — none of the account filter, the date filter, the calendar or any dark scheme has been seen at a true 390px viewport on a real device; a resize on the hosted tab did not propagate the last time it was tried. **The awaiting-slip chip and the resync label** did not appear in the loaded window, so they are measured only in the unit suite. Both are readings rather than work.

- Evidence: `git log` — `12d0302` on `main`, `origin/main` matching. The deployment read back live: `data-theme="system"` resolving to Night Town on a dark-OS browser, the ground at `#1e2440`, `--scrim` present, the picker offering all five values, and **`themeColor` shipping both media-conditioned values** (`#fefae0` for light, `#1e2440` for dark) — the meta that sat stale for a day across two deployments in D-137's own aftermath, now generated per cookie and asserted against `--mist`. Contrast figures above were computed in the page from `getComputedStyle`, against each element's real surface. **No real account ids, dates, amounts or counterparties were read into this entry or any other document**, per D-049; the row count, the cell counts and the ratios are the only figures taken, and all are counts or measurements rather than money. D-180 (the work this deploys), D-179 (the calendar whose ramps it repairs), D-137 (the decision D-180 reverses), D-049 (value-free writing), D-138 and D-159 (why looking at the deployment is treated as a separate gate from a green suite).
