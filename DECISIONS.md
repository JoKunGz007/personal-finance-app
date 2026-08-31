# Private Ledger decision log

Last reviewed: 2026-08-09

Entries are append-only. A superseding decision must reference the earlier entry rather than rewriting its history.

This file carries **D-141, D-158, D-161, D-169 and D-170** — two open questions, one newly-closed one still sitting with them, and the live frontier, and every gap in that list is the rule holding rather than an accident. A boundary excludes every open question (D-133), and where such a question sits inside an otherwise settled range the boundary **steps over it rather than stopping short of it** (D-154). **D-141**: whether the mailbox source is deleted after import, deferred by the owner. **D-158**: `list_match_candidates`' unbounded scan, recorded in its own migration and unfixed. **D-161**: the statistics surface's missing filters — **closed for good on 2026-08-31**, the window picker on 2026-08-29 (D-170) and the account filter, reviewed, committed, pushed and deployed (D-177) two days later; a future boundary is free to move it, none has yet. **D-169 and D-170 are here for a different reason**: they are settled arguments whose *rendering* nobody has looked at on the deployment, which is a fence the first nine boundaries never met — see D-171. `scripts/check-docs.mjs` pools this file with every archive and checks ids for duplicates and omissions across the whole set, so the ids stay whole and the maintained file has never been required to be contiguous. Ten settled ranges were relocated unchanged, not rewritten: **D-001 … D-059** to [`docs/decisions/ARCHIVE-D-001-D-059.md`](docs/decisions/ARCHIVE-D-001-D-059.md) on 2026-08-09, **D-060 … D-113** to [`docs/decisions/ARCHIVE-D-060-D-113.md`](docs/decisions/ARCHIVE-D-060-D-113.md) on 2026-08-18, **D-114 … D-119** to [`docs/decisions/ARCHIVE-D-114-D-119.md`](docs/decisions/ARCHIVE-D-114-D-119.md) on 2026-08-19, **D-120 … D-129** to [`docs/decisions/ARCHIVE-D-120-D-129.md`](docs/decisions/ARCHIVE-D-120-D-129.md) on 2026-08-23, **D-130 … D-133** to [`docs/decisions/ARCHIVE-D-130-D-133.md`](docs/decisions/ARCHIVE-D-130-D-133.md) on 2026-08-24, **D-134 … D-140** to [`docs/decisions/ARCHIVE-D-134-D-140.md`](docs/decisions/ARCHIVE-D-134-D-140.md) on 2026-08-25, **D-142 … D-152** to [`docs/decisions/ARCHIVE-D-142-D-152.md`](docs/decisions/ARCHIVE-D-142-D-152.md) on 2026-08-26, **D-154 … D-156** to [`docs/decisions/ARCHIVE-D-154-D-156.md`](docs/decisions/ARCHIVE-D-154-D-156.md) on 2026-08-27, **D-157 … D-163 without D-158 and D-161** to [`docs/decisions/ARCHIVE-D-157-D-163.md`](docs/decisions/ARCHIVE-D-157-D-163.md) the same day, and **D-153 with D-164 … D-168** to [`docs/decisions/ARCHIVE-D-153-D-168.md`](docs/decisions/ARCHIVE-D-153-D-168.md) on 2026-08-29. The index below covers all eleven files, so a reader can find any entry without opening any body.

**Every boundary sits where an argument ends rather than where a number is round**, and the fourth one is the clearest case of that rule so far. It was taken at **93%** of this file's byte budget and moved the whole arc in which both readers went to Cloud Vision and the local OCR engine was deleted. **The third boundary had explicitly refused to move D-120**, on the grounds that whether pre-fill stays was undecided and that question attached to D-120 and D-129 — which was true when written. **What closed it was not an argument but a shipped feature**: D-135 files a machine-read amount into the ledger without the owner looking at it at all, which is a stronger commitment than the trial ever asked for. *A question is closed when the code has stopped asking it*, and that is the test to apply at the next boundary rather than re-reading the prose.

What this file now holds is two open questions, one closed one still sitting with them, and the live frontier — the mailbox archive and an unbounded candidate scan remain open; the statistics surface's missing filters **closed for good on 2026-08-31 (D-177)**, reviewed, built, committed, pushed and deployed, confirmed against the owner's real ledger — then the two changes that shipped on 2026-08-29 and that nobody has looked at where they render: the default face and the statistics window picker.

**Three boundaries in three days, and the rate is still the finding rather than the percentage.** The eighth moved three entries and left this file at 85%; two decisions and a review's findings put it back to **96% the same afternoon**, and the ninth then moved five for **70%**. Four entries on 2026-08-29 took it to **86%**, and the tenth moved six — D-153 with D-164 … D-168 — for **86% → 61%**. **What bought the depth was a question closing, exactly as D-164 and D-167 both predicted it would**: D-169 answered the default face, so D-153 stopped fencing the file from below and took the arc that had been stacked behind it. **What the tenth stopped short of is new**, and D-171 is the entry to read for it: a decision can be settled and its rendering still unseen, and this file does not archive the second thing as though it were the first.

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
### Current 
—
 this file

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
### Current 
—
 this file

- **D-169** — The default face is Pixelify Sans, which closes D-153's question by answering it with a third option
- **D-170** — The statistics window is a control at last, and holding the response beside the window it came from is what makes the page able to say what it is showing
- **D-171** — The tenth boundary moves the question that had fenced the file, and stops below the two changes nobody has looked at
- **D-172** — The window picker's state moves into the address bar, and a preset is written by name while a custom range is written by its dates
- **D-173** — The phone audit stops being a throwaway, and its first committed run found a control that had been escaping the viewport since before the audit existed
- **D-174** — Migration 024: statistics take an account, and the balance series needs two sources because one account's truth is printed and the ledger's is derived
- **D-175** — The production picker's synthetic accounts were not a seed leak, and the hypothesis that said so survived two sessions until one value-free query killed it
- **D-176** — Migration 024 reaches hosted, and the claim that an agent could not push it was wrong
- **D-177** — Task 46's account filter gets its control, reviewed and reused between `/ledger` and `/statistics`, closing D-161 for good

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

## D-161 — The statistics surface is built, and every real defect in it was found by rendering it or by review, never by the gate

- Date: 2026-08-27
- Status: **Built and validated against the local synthetic project only.** Migration
  `202608270023_ledger_statistics.sql`, `lib/statistics.ts` (new), `app/api/v1/statistics/route.ts`
  (new), `app/statistics/page.tsx` (new), `app/statistics-view.tsx` (new),
  `app/statistics-charts.tsx` (new), `app/globals.css`, `app/site-header.tsx`,
  `supabase/tests/011_ledger_statistics.sql` (new), `tests/statistics.test.ts` (new).
  **Not pushed to any hosted or live project**; every project but the local one is on 022.
- Context: implements D-160's scoping. The owner chose the figures, ruled cash out of v1, left
  `include_in_reporting` to this session's judgement, and asked for charts.

### What shipped

One RPC returns the whole page, because every figure on it is a fact about the same window and
assembling them from several round trips would let them disagree while the owner watches. Monthly
incoming, spending, net and row count as a series; averages per day and per week; daily closing
balance; the largest movements in each direction; a day-of-week split; and the count of rows the
reporting flag removed. Two charts as **inline SVG** — a balance line and paired monthly bars — with
the averages as stat tiles and every charted figure repeated as an exact-money table.

**`include_in_reporting` has its first reader in this migration**, and
`list_account_transactions_page`'s money totals were retrofitted in the same change so two surfaces
cannot disagree about one ledger. **Nothing in the app can set the flag yet**, so both are unchanged
in behaviour today; the control is this task's follow-on work. The **balance series deliberately
does not honour it** — the flag says do not count this as income or spending, not that the money
failed to move.

### The money rule, and the guard that proves it

Every average is integer division that keeps its remainder, so
`quotient * divisor + remainder = total` holds exactly — asserted for a positive total and for a
negative one, because withdrawals are stored negative and PostgreSQL truncates toward zero on both
operators. **The weekly average is `total * 7 / days`, one division on a scaled numerator**, and the
pgTAP fixture is chosen so that formula and `avg_day * 7` give **different** answers: 17219 against
17213. A suite that only checked the identity would have passed against either.

**Both new guards were broken deliberately and watched to fail by name.** Compounding the daily
truncation failed *"the weekly average divides once on a scaled numerator and is NOT the daily
quotient times seven"*; dropping the reporting predicate failed four assertions across the totals and
the monthly series. Reverted, and green again.

### The four defects, and where each was caught

1. **`jsonb_agg(sum(...))` is a nested aggregate** and PostgreSQL refuses it at run time, not at
   apply time — the migration applied cleanly and the function failed on first call. Caught by the
   pgTAP suite.
2. **`sum()` over `bigint` returns `numeric`** — the exact trap this migration's own header warns
   about, and it surfaced **in the test written to check the surface**, not in the surface.
3. **A signed month-over-month delta inverts for spending.** Caught by reading a passing test back
   and disbelieving it: `-15000 − (-10000) = -5000` is "5,000 more went out" and prints as a fall.
   The comparison now works on magnitudes, so growth reads as growth in both directions, and the
   sign-ambiguous delta was removed from the wire entirely.
4. **Two failures visible only in a screenshot.** At 390px every statistics table became screens of
   unlabelled figures, because the phone stacked-table mode renders `attr(data-label)` and these
   tables carried none — right, and unreadable. And a single largest-movements list ranked by
   absolute size was **ten deposits**, since income moves in bigger lumps than spending does; the
   list meant to explain a surprising month explained nothing. Both are now fixed, and both are
   exactly what D-159 said would keep happening: *look at the real thing after every deploy*, and
   before asking for one.

### The charts

**Inline SVG rather than a library.** The strict CSP admits no CDN, so the choice was a bundled
dependency or this; at two charts and a few hundred points a library would be a large dependency
earning very little and would arrive with its own colours to override.

**The series colours were validated rather than chosen.** `#5c8a1a` against `#9b2c2c` clears all
five checks of the dataviz validator on this app's paper surface — CVD separation ΔE 11.1 worst case
(deutan), normal-vision 25.9. The app's own celadon and copper inks were tried first and **failed**
the chroma floor and the normal-vision floor, which is the argument for running the check rather
than trusting the palette. `#9b2c2c` is already `--red`; only the green is new. Colour is never the
only encoding: legend, hover read-out, and the same figures again as tables.

### What this task created and did not close

**Nothing sets `include_in_reporting`**, so the filter is inert until a control ships — the smallest
piece of follow-on work here. **Automatic transfer detection** (equal amount, opposite direction,
adjacent date, two of the owner's own accounts) is a matching rule and belongs beside task 25.
**A run-rate projection was declined by the owner** as a prediction rather than a fact; recorded in
`PLAN.md` as a far-future maybe. **Cash is out of v1**, and the page says so on its face rather than
letting a total quietly stand for all spending. **There is no account filter and no window picker**:
the surface is whole-ledger, all accounts, all time.

### What `/code-review` found afterwards, including one the audit was structurally unable to see

Run at `high` before the commit, per D-125 — **five for five** on finding a real defect.

**The one that mattered: `.stats-section table { min-width: 560px }` escaped the viewport at 390px,
and this is D-138 reintroduced on a new surface.** It sits after the phone block, so at specificity
0,1,1 it outranks that block's `table, tbody, … { min-width: 0 }` reset at 0,0,1 — media queries add
none — and with `.table-scroll` set to `overflow: visible` there the width had nothing to scroll
inside. A 390px viewport rendered a 576px document.

**The audit had screenshotted that exact page and reported no overflow, because the check measured
against `document.documentElement.clientWidth`.** Once content overflows, the document element grows
to contain it, so every element is compared against the width the bug itself produced and nothing can
ever be wider than it. **A check that expands to fit the defect is not a check.** Corrected to
`window.innerWidth`, it reproduced the fault immediately — *viewport 390px, document 576px, 8
elements over* — and reports 390/390 after the fix. The screenshot had carried the evidence all
along: it came back 576px wide for a 390px viewport, and that was not read as the symptom it was.

**Four more, all real.** The balance line interpolated between points, drawing a smooth slope across
gaps where the balance was in fact **constant** — it is a step function and is now drawn as one. The
balance chart was reachable only by hover, with no keyboard path and no table twin (three hundred
daily rows would be a worse answer than none), so the series now carries a `<desc>` with its opening,
closing and extremes; and its `aria-live` figcaption, which announced once per point crossed while
dragging, is no longer live. The largest-movement lists emitted a **leg** amount under the field name
`net`, so the interest/tax pairing appears in both lists under figures that are neither row's net —
renamed to `amount`. And the monthly axis drew every label, which on a multi-year window is a smear
rather than an axis; it thins on slot width now.

**Two in the tests themselves, which is the uncomfortable half.** The share test named *"does not
force three shares to sum to exactly one hundred"* used 3333/3333/3334 of 10000 — which **does**
reconcile to 100.00 — so it asserted the opposite of its name and proved nothing. Three exact thirds
were the case that shows the gap, and it now uses those. And `shareOf`'s docblock promised one
decimal place where the scale yields two. Neither would have changed a figure; both were documents
disagreeing with the code they sat above, which is how the next reader gets it wrong.
- Evidence: pgTAP **347 across 11 files** (from 346 across 10; 35 of them the new suite) with
  migrations 001–**023**. Vitest **849 passed / 7 skipped across 41 files** (from 830/7/40, 19 of
  them new). Playwright owner **32/32**. Production build clean at **twenty-three** `/api/v1/`
  routes (from twenty-two). `tsc`, `pnpm exec eslint .` and `check:docs --strict` clean
  (**160 decisions, 171 traps**). Backup contract **unchanged at v7** — no table, no column.
  `.runtime/statistics-audit.spec.ts` seeds five months, reads back all nine stat tiles, counts the
  marks and screenshots desktop and 390px; **zero blank tiles, zero elements wider than the
  viewport**. Related: D-160 (the scoping this implements), D-159 (compute where the facts are, and
  look at the deployed thing), D-158, D-138 (an audit of an absent element reports a clean route),
  D-137 (one declared colour scheme), D-120, D-002.

## D-169 — The default face is Pixelify Sans, which closes D-153's question by answering it with a third option

- Date: 2026-08-29
- Status: **Accepted, uncommitted at the time of writing.** `lib/ui-font.ts` (one constant and its comment) and `tests/ui-font.test.ts` (one assertion rewritten). No SQL, no route, no contract, no CSP change.
- Context: D-153 left one question open — whether Press Start 2P becomes the default face — and it has fenced `DECISIONS.md` from archiving ever since. The owner answered it on 2026-08-29 by choosing **Pixelify Sans** instead.

### The answer is not the one the question was framed around, and that is worth recording

D-153 wrote the question as *whether Press Start 2P becomes the default*, because that was the owner's leading candidate. **The answer chose the third face.** So this closes the question rather than confirming it, and a reader who finds only D-153 would conclude the opposite of what happened.

The choice is coherent with what has been measured since. `FONT_NOTES` describes Pixelify Sans as **closest to ordinary proportions**, and Press Start 2P advances a full em per glyph — which is what forced ledger figures down to 8px, because `-1,234,567.89` at thirteen characters wants 130px in a 117px box (D-153). Defaulting to the widest face would impose that trade on every device before anyone had chosen anything. Pixelify Sans keeps the pixel character and asks less of the layout.

### What did not change, and must not

**`system` stays first in `FONT_CHOICES` and one press away.** D-153's real invariant was never *which* face is default but that **the way back to something legible must not depend on the trial going well** — a cookie is per device, so a default is a starting point rather than a commitment. That is now asserted directly rather than implied by the default's value.

**The Thai fallback is unchanged and is not a regression here.** All three pixel faces are Latin-only, and every switched stack keeps `IBM Plex Sans Thai` behind the pixel face, because Thai reaches this app as *data* — a counterparty name off a statement — and never as interface copy.

### The test that failed is the reason to write tests this way

`tests/ui-font.test.ts` asserted `DEFAULT_FONT === "system"` with a comment reading *"a change here is a real decision, so it fails loudly rather than drifting."* **It did exactly that**, on the first run after the constant changed. The assertion was rewritten to hold the decision *and* the invariant that outlives it: `system` present and first, and `DEFAULT_FONT` a member of the closed set — the last of which stops being guaranteed by the type the moment someone widens `FontChoice`.

### Consequence for the archive, which is why this was cheap and valuable at once

**D-153 no longer fences this file.** It was one of four open questions holding `DECISIONS.md` above its archive floor, and the cheapest of them to settle — one constant. The tenth boundary can now move D-153 and everything settled around it. The remaining fences are **D-141** (whether the mailbox source is deleted after import, deferred), **D-158** (`list_match_candidates`' unbounded scan) and **D-161** (the statistics filters, now `PLAN.md` task 46). D-164's prediction holds a second time: *what buys a boundary its depth is a question closing, not a chore.*

- Evidence: `lib/ui-font.ts`, `tests/ui-font.test.ts`. Vitest **873 passed / 7 skipped across 41 files** after the change, `tsc` clean. D-153 (the question this closes), D-166 (why a face change moves nothing), PLAN task 42 (the trial this concludes).

## D-170 — The statistics window is a control at last, and holding the response beside the window it came from is what makes the page able to say what it is showing

- Date: 2026-08-29
- Status: **Accepted, committed and deployed** as `0b88ea2`. `lib/statistics.ts`, `app/statistics-view.tsx`, `app/statistics/page.tsx`, `app/globals.css`, `tests/statistics.test.ts`. **No SQL, no route change, no contract change** — `PLAN.md` task 46's second half, the account filter, is untouched and needs migration 024.
- Context: D-161 named the missing filters as follow-on and the owner authorized both halves on 2026-08-29, choosing presets **plus** a Custom tick rather than one or the other.

### The feature was already reachable; what was missing was a control

`public.ledger_statistics` has taken `p_from` and `p_to` since migration 023 and `app/api/v1/statistics/route.ts` has parsed them from the query string since the same day. **The window has therefore been selectable by hand-editing a URL for two days.** That is why this half ships alone and first: it is a control and its wiring, and it does not touch the database at all.

### The arithmetic is a pure function, and two defect classes are designed out rather than tested around

It lives beside the wire contract rather than in the component, because **a date boundary should be provable without a browser**. Month arithmetic works on a month *index*, so January minus two months is November of the previous year rather than month `-1`, which would render as `"-1"` and be refused by the route. A window always starts on the **first** of a month, so *"three months before 31 May"* — the classic clamping bug — cannot arise.

**`localToday` reads the local getters and not `toISOString()`, and that is the sharpest of the three.** The UTC date names *yesterday* for the first seven hours of every local day at UTC+7, so on the first of a month "This month" would resolve to a window starting in the previous one. It is a defect that appears for part of the day and disappears, and it is what the obvious one-liner does. There is a test at 06:30 on the first.

### What `/code-review high` caught, and the serious one was this change's own regression

Holding the response alongside the window it came from — `{ search, data }` rather than `data` — is what lets the page distinguish *loading* from *quietly wrong*. **The first draft of it made the error path unreachable.** `setMessage` on a failed fetch or a failed parse changed nothing, because the message only renders when there is no data and the previous window's data was still there. A session expiring mid-change would have left correct-looking figures under a window line describing a window that never loaded, with an `· updating…` that could never clear — and it silently absorbed the strict-schema mismatch whose own comment says it *is reported rather than swallowed*. Both failure branches now clear the data: **a ledger that cannot say what it is displaying displays nothing.**

Two more were staleness read from the wrong side. The empty-window sentence was derived from the **live picker** while the emptiness came from the **loaded response**, so a quiet month followed by a press of All time asserted *"There are no confirmed rows to summarise yet"* about a ledger with 1,604 of them. And `today` was frozen at mount, so a tab open across midnight answered a *deliberate* press of "This month" with last month — correctly labelled and wrong.

### Three spec defects and no app defects, which is the finding about the harness rather than the feature

The browser spec failed five times before it passed and **every failure was in the spec**. Three were traps this repository had already written down: the header's font-picker help paragraph renders unconditionally empty as an `aria-live` region (D-153), so `p.field-help` first is a blank node in a landmark the spec was not about; Next.js mounts its own empty `role="alert"` route announcer, which `GOTCHAS` already records; and a scripted replacement's escapes were eaten by a shell layer, which was added to `GOTCHAS` the same morning. **Having a trap written down did not prevent hitting it**, which is worth weighing against `PLAN.md` task 51.

The fourth was new and is now recorded: `getByLabel` matches a **case-insensitive substring**, so a field labelled `To` also resolves a checkbox labelled `Custom`. The fifth was an assertion that encoded a misunderstanding of the feature rather than a defect in it — the window line reports the range *requested*, not the extent of the rows inside it, which is correct because the per-day average divides by the days requested.

- Evidence: the files above; `.runtime/window-picker.spec.ts` (gitignored) drives it at iPhone 13 and asserts the narrowing through the **transaction count** rather than the caption, because a chip that highlights while the figures stand still is the defect D-159 was written about. Vitest **881 passed / 7 skipped across 41 files** (+8), Playwright owner **33/33**, isolated **38 passed / 4 skipped**, `tsc`, `eslint` and `check:docs --strict` clean, build clean. **pgTAP deliberately not re-run — no SQL moved.** D-159 (a control that renders as prose), D-160 and D-161 (the surface and the follow-on this closes half of), D-168 (why every control here is born at 44px).

## D-171 — The tenth boundary moves the question that had fenced the file, and stops below the two changes nobody has looked at

- Date: 2026-08-29
- Status: **Done, uncommitted.** `docs/decisions/ARCHIVE-D-153-D-168.md` (new), `DECISIONS.md`, `HANDOFF.md`, `PLAN.md`. No code, no SQL.
- Context: this file reached **103,210 of its 120,000-byte budget (86%)** after four entries in one day. D-169 closed D-153, which had fenced it from below since the eighth boundary priced a deeper cut and refused it.

### Six entries — D-153 with D-164 … D-168

**D-153 moved because a question closed, the third boundary running to be bought that way.** D-140's test applies cleanly: `DEFAULT_FONT` is `pixelify-sans`, the owner chose it, and `tests/ui-font.test.ts` now asserts the invariant that outlives the choice rather than the choice. D-164 predicted this cut in as many words and D-167 repeated the prediction.

The five behind it closed on each other and on it. **D-164 and D-167** are the eighth and ninth boundaries, and a boundary entry is answered by the next one — this is their answer. **D-166** is the measurement that said a face change moves nothing vertical, which is what D-169 acted on. **D-165** is the `include_in_reporting` control, shipped and verified in the running app on a real internal transfer.

**D-168 is the one that needed an argument, and it moved on the strength of the reading that produced it** — the live look that put `.link-button` on screen at all, a control that renders only when there are more rows than the page holds. Its own fix shipped in `24b894a` *after* that reading and has not been re-read live. It moves anyway, because 18px of line plus 13px either side is arithmetic rather than a rendering judgement, and because the 390px audit was repaired in the same change and passes on five routes plus a disclosure-open pass. **That is a weaker claim than the other five and is recorded as the weaker one.**

### The step-over, for the second boundary running

D-154's rule is what makes this a range rather than three cuts, and the ninth needed the same step in the same two places. **D-158** is unchanged: the unbounded candidate scan, in its own migration comment, unfixed. **D-141** sits below the range, deferred by the owner. **D-161 is the interesting one — half of it closed today and the half that stayed is why it is still a fence**: D-170 shipped the window picker, so `p_from` and `p_to` are no longer parameters nothing sends, but the account filter needs migration 024, a verified backup and the owner's own `db push`. An entry that is half-answered is still asking.

### It stops below D-169 and D-170, and that is the judgement in this entry

Both shipped on 2026-08-29, **both change what renders**, and **nobody has looked at either on the deployment**. The last browser reading was taken before either landed.

D-164 refused to archive a measurement in the session that revised it, because that files a live argument as settled. **The same reasoning refuses to file a rendering change as settled before anything has rendered it where the owner can see it**, and this repository has paid twice for the distinction: `76dc46b` reached Ready and shipped a defect the owner found on his own phone minutes later (D-138), and looking at the deployed ledger found three things a green gate could not, one of them a control rendering as prose (D-159).

**This is a fence the first nine boundaries never met, and naming it is the transferable part.** The other four are *unanswered questions* — something undecided, or recorded and unfixed. This one is an *unverified rendering*: the argument is finished and the decision is the owner's and final, and the only thing missing is that nobody has seen the result. It is the weaker of the two kinds and **should expire the moment either page is looked at**, so it is written as a condition rather than as a property of those entries.

**The cost was priced, not assumed.** Taking D-169 and D-170 as well would have reached **53%** instead of 61% — two entries, about 9 KB. At 61% this file has more headroom than any boundary since the seventh left it.

### Mechanics, and the prose the guard cannot see

**Byte-identity was proved by diff against `git show HEAD:DECISIONS.md` rather than by reading**, normalising line endings first: git stores this file with LF, the working copy is CRLF, and three of the six had picked up bare LF from an agent's own edits. **No entry in the range carried a relative link**, checked before the move — D-154's advice, discharged for the third time.

**Three preamble paragraphs were replaced rather than annotated.** `check:docs` validates the index against the entries and that links resolve; it structurally cannot ask whether the prose describing the archives is true (D-164). All three were about to become false: what this file carries, the count of relocated ranges, and the paragraph naming the eighth and ninth as the ones to read before the tenth.

- Evidence: **103,210 → 72,997 bytes, 86% → 61%**, as `check:docs` reports it. **171 decisions across eleven files**, index matching one for one, `pnpm check:docs --strict` clean. **No test, migration or build re-run, deliberately** — nothing outside `docs/` and the continuity files moved. D-133 (the rule), D-140 (the test), D-154 (the step-over), D-164 (the eighth, and the prediction this confirms a third time), D-167 (the ninth, and the rate), D-169 (the closing that bought this cut), D-138 and D-159 (why an unlooked-at rendering fences), D-130 (the budget).

## D-172 — The window picker's state moves into the address bar, and a preset is written by name while a custom range is written by its dates

- Date: 2026-08-29
- Status: **Accepted, uncommitted.** `lib/statistics.ts`, `app/statistics-view.tsx`, `tests/statistics.test.ts` (+10). No SQL, no route, no contract change.
- Context: D-170 shipped the window picker as component state, so a reload returned to All time and a chosen window could not be linked to. The owner asked for it on 2026-08-29.

### The asymmetry is the design, not an inconsistency

**A preset is encoded by name; a custom range is encoded by its dates.** A preset is a *rolling question* — "This month" should mean this month whenever the link is opened — so resolving it to dates before writing it down would freeze it into the question it happened to answer on the day it was copied. A custom range is already a pair of dates and has no name to give it. All time encodes to nothing, so a bare `/statistics` stays unambiguous.

This is **not** `windowSearch`'s encoding, which always sends resolved dates because the RPC has no notion of a preset. The keys overlap deliberately: a bare `?from=…&to=…` with no preset named is read as a custom range, because those are the route's own parameters and hand-editing them was the only way to select a window for the two days before the picker existed.

### `window` and `custom` are separate keys, and folding them was a real defect

The first version wrote `window=custom` — one key carrying both the preset and the override — which **dropped the preset underneath it**. Ticking Custom on top of "This year" and unticking returned to This year in-session, but after a reload of the very URL the page had just written, unticking landed on All time. **The control behaved differently depending on whether the page had been reloaded**, which is the worst kind of difference because nothing on screen distinguishes the two states. Found by `/code-review high`. `window=custom` is still *read*, so a link written before the split still opens the window it names.

### Written with `history.replaceState` rather than the router

`router.replace` is the idiomatic call and the wrong one: `/statistics` is `force-dynamic`, so a router navigation fetches a fresh RSC payload from the server to move text in the address bar. **Replace and not push**, because the picker is a filter — pushing would make Back walk through every chip ever pressed, and the way out of a window is to choose another one.

Read once, in a lazy initialiser, and written by an effect: one direction each way, so the URL and the state cannot develop a disagreement with themselves. Safe against a hydration mismatch because the page is `force-dynamic` — the server renders with the request's own parameters.

- Evidence: `lib/statistics.ts`, `app/statistics-view.tsx`, `tests/statistics.test.ts`. Vitest **890 passed / 7 skipped across 41 files**. **Red-proved**: mutating `pickerSearch` to encode presets as resolved dates fails exactly the three rolling-question assertions, including the one written for it. D-170 (the picker this completes), D-162 (why a window's extent is reported as requested).

## D-173 — The phone audit stops being a throwaway, and its first committed run found a control that had been escaping the viewport since before the audit existed

- Date: 2026-08-29
- Status: **Accepted, uncommitted.** `tests/e2e/owner-phone-audit.spec.ts` (new), `playwright.owner.config.ts`, `playwright.isolated.config.ts`, `app/globals.css`. PLAN task 51, decided by the owner. No SQL, no route, no contract change.
- Context: D-168 found `.runtime/mobile-audit.spec.ts` had been blind at phone width for three days and nobody could have noticed, because a gitignored throwaway only fails when someone asks it to run.

### What changed in the port, and none of it is cosmetic

**It asserts instead of reporting.** The throwaway printed a list because PLAN task 28 was unscoped and no standard had been agreed. D-168 set one — 44px, at phone width only, per D-139 — and a standard nobody checks is a preference.

**It seeds 120 rows rather than 6.** The page holds 100, so `Load older rows` renders. That is the control D-168 could only see because the owner opened a 1,604-row ledger in a narrow window: *a surface that exists only with enough data behind it*, which invented fixtures are structurally unable to produce unless they are sized to produce it.

**Every route is measured twice, disclosure shut and open**, and `/statistics` a third time with the Custom tick on. The throwaway opened the disclosure on `/ledger` alone, so the privacy chip and font picker were never inside a measured viewport. The third pass came from `/code-review high`: `.window-custom input[type="date"]` renders only after a tick, which put it inside **this file's own definition** of a surface no walking audit can measure.

**All three Playwright configs key off an `owner-` prefix now.** An enumerated pattern would have left this spec uncollected by the owner config and collected by the other two — the failure the file exists to record, on the file recording it. `owner-access.spec.ts` taught this lesson once already (D-149's era); a pattern naming one file is a list of one.

### The defect it found on its first run

**`/ledger` panned sideways at 390px.** The account filter `<select>` measured **404px in a 390px viewport** and took `documentElement.scrollWidth` to 420. A `<select>` is as wide as its longest `<option>`, and its automatic minimum blocked the grid track from shrinking even though the phone rule already sets `minmax(0, 1fr)`.

**The rule predates D-168, so the audit missed it rather than the defect being new.** The committed version waits for the table *and* `Load older rows`; the throwaway waited a fixed 1500ms and measured before the account list arrived. **It is data-dependent** — the overflow is a function of how long the account labels are — so the same layout is clean for one ledger and broken for another. D-138's family from a fourth direction.

**Which line fixes it was measured, not asserted.** `min-width: 0` and `max-width: 100%` are both required; each alone leaves the audit red. A `min-width: 0` on `.account-control` itself was tried and changed nothing, so it is not in the file — D-166's rule, that a comment saying *measured* is a claim that has to be true.

### The reference an overflow check compares against

Measuring every element against the viewport flagged `/import`'s stage list, 810px inside a container that scrolls on purpose. The question is now whether an element escapes **its own scroll container**, with whether the document pans asked separately. A deliberate scroller may be wider than the screen; nothing may spill out of the box holding it.

- Evidence: the files above. Owner suite **34/34** (was 33/33). Isolated **38 passed / 4 skipped**, Vitest **890 / 7 skipped across 41**, `tsc`, `eslint`, `check:docs --strict`, build all clean, exit codes read individually rather than from a chained run (GOTCHAS). **Red-proved**: reverting the CSS returns the audit to red on the exact selector. **390px is not a phone** and this does not claim otherwise — Chrome clamps a real window near 500px, so emulation is the only thing reaching 390 here, and D-138 stands. D-168 (the blindness), D-139 (the rule), D-157 (what hid the sign-in), D-156 (why the `(i)` is load-bearing).

## D-174 — Migration 024: statistics take an account, and the balance series needs two sources because one account's truth is printed and the ledger's is derived

- Date: 2026-08-29
- Status: **Written, applied to `private-ledger-local` only, and NOT on hosted.** `supabase/migrations/202608290024_statistics_account_and_ledger_dates.sql` (new), `supabase/tests/012_statistics_account_and_ledger_dates.sql` (new, 31), `supabase/tests/009_ledger_paging.sql` and `011_ledger_statistics.sql` (signature assertions). PLAN task 46's second half, plus the ledger date range task 47 turned out to need first. **No table, no column, no trigger, no new grantee; backup contract stays v7.**
- Context: the owner authorized task 46 in full on 2026-08-29 and chose, on the calendar heatmap, to have the ledger's date filter built first and see whether the heatmap was still wanted.

### Two features in one migration, because the cost is per-migration

Each needs a signature change on a function the app already calls, and therefore a `db push` against hosted, a backup verified from the database first, and the owner running it himself (D-152). Two migrations would be two of each. Migration 017 bundled for this class of reason (D-104) — pieces designed together because the operational cost does not divide by feature.

### 023 argued against an account filter, and the argument turned out to be its specification

023 said *"the balance series is the combined position by construction, and an average whose denominator changed with a filter would be a different figure wearing the same label."* Both halves are still true and neither is an objection. Every average divides by **days in the window**, not by rows, so narrowing changes the numerator and leaves the divisor alone. What needed deciding was the chart:

- **All accounts** — `private.combined_balances`, the derived running total (022). Nothing prints it.
- **One account** — that account's own **printed** `post_balance_minor`. 022's own reasoning: the printed balance is the truth, and a derived figure drifts from it across a gap between two separately imported statements.

**The tidy implementation is the wrong number.** Restricting `combined_balances` to one account's rows yields the *combined* position sampled at that account's dates — a real figure answering a question nobody asked. The pgTAP fixture is chosen so the two disagree on the same day, 113059 against 43058, and replacing the function with that tidy version fails exactly the two assertions written for it.

### The window resolves inside the account

An unbounded window now starts at the chosen account's own first row. An account opened last month has no history before that, and inheriting the ledger's span would divide its figures by years it did not exist for. "All time" means all of *this* account's time.

### The ledger's bounds are not the ledger's cursor

`list_account_transactions_page` already took `p_before_date`/`p_before_time`. Those are a **cursor**; `p_from`/`p_to` are **bounds**. The cursor walks inside the bounds, so a window narrower than a page still pages. **`totals.rows` describes the window when bounds are supplied and only then** — absent bounds, 023's contract is reproduced exactly.

**One thing the window must not reach**: the combined balance on a row. It is a fact about the whole ledger up to that row, so recomputing it from the windowed rows would restart the running total at the window's edge and print a figure belonging to no account on any date. Asserted directly — a one-day window on one account still carries the whole-ledger figure.

### Old signatures are dropped rather than left

A defaulted parameter added to an existing function is an **overload**, not a replacement, and `ledger_statistics(p_from => x, p_to => y)` would then be ambiguous. Dropping is what makes this a change rather than a fork. **Three `has_function_privilege` assertions failed loudly on the old signatures** — in 011 and, missed on the first pass and caught by `/code-review high`, in 009. That is the check working: a grant assertion silently passing against a signature nobody calls would be a stale exemption.

- Evidence: pgTAP **009: 33, 011: 35, 012: 31**, all against `private-ledger-local`. The partition reconciles — per-account totals sum to all-accounts on deposits, withdrawals, row count and excluded count, written as arithmetic on returned values rather than hard-coded numbers. Owner suite **34/34 against the migrated database**, which is what shows the app's existing calls still resolve through the new defaults and makes a database-first push safe. **`pnpm supabase:test` was not run as a whole**; the three affected files were run directly. **Nothing is built on top of this yet** — neither control exists, deliberately, because the database goes first. D-158 and D-161 (the follow-ons this answers), D-160 (statistics in SQL), D-152 (the backup rule this still owes), D-104 (why one migration).

## D-175 — The production picker's synthetic accounts were not a seed leak, and the hypothesis that said so survived two sessions until one value-free query killed it

- Date: 2026-08-30
- Status: **Done.** Three rows deleted from `public.accounts` on the hosted project by the owner. **No migration, no code, no schema change** — a scoped `delete` run in the dashboard SQL Editor. PLAN task 50.
- Context: the first browser reading of the deployed `/ledger` (D-168) found the account picker offering **six** accounts, three of them `Synthetic … ···· 4242` with zero rows. The owner authorized deleting them on 2026-08-29.

### The leading explanation was wrong, and it was wrong for two sessions

`supabase/seed.sql` inserts exactly those three labels, and `config.toml` has `[db.seed] enabled = true`, so **the seed reaching production was the obvious reading** — and it was written into `HANDOFF.md` as such. It also implied something much worse than three empty rows: the same file inserts a synthetic `auth.users` row and calls `bind_ledger_owner`.

**It is refuted.** Read from hosted: **no `synthetic.owner@example.invalid` in `auth.users`**, `ledger_owners` holds one row and it is not the synthetic id, and **no `categories` or `mutation_sequences` rows** for it. The seed inserts that user in its *first* statement, so it never ran there.

### What was actually true, and why it stops being alarming

The three accounts carried the seed's **exact primary keys** while being **owned by the real owner**, and they **predate all three real accounts**. The seed pins `owner_id` to the synthetic id, so it cannot have written them.

That fingerprint — keys preserved, ownership rewritten to the caller — is what `public.restore_backup` does (D-013). A synthetic backup restored into the new hosted project during setup fits it exactly; so does hand-setup at the same moment. **Nothing distinguishes the two and nothing turns on which**: both are historical, neither can recur, and no process needed changing. That is the finding that made this a deletion rather than an incident.

### The method is the transferable part

**Every question was answered with counts and booleans.** The diagnostic returned nine labelled rows, none of them a label, a digit, a date or a balance, so the owner could paste the result back verbatim with nothing to redact. The provenance question — *did these predate the real accounts* — was asked as a single `boolean` rather than by reading `created_at`. **No real value was read or written anywhere in this investigation**, and it was not a constraint that cost anything: the value-free form was also the form that answered fastest.

**"Success. No rows returned" is not a row count.** The dashboard says that for any statement with no result set, so a guarded `delete` that matched nothing looks identical to one that matched three. The count came from a separate `select` afterwards. D-152's rule in a new place: a claim is not a measurement.

### The delete, and what it deliberately could not do

Scoped to three primary keys, and **self-guarding**: `owner_id = (select owner_id from public.ledger_owners)` plus a `not exists` against each of the three tables holding a foreign key to `public.accounts` — `source_transactions`, `import_batches`, `notification_cards`. It **cannot remove an account holding anything**, so the dependency check was evidence rather than the safety mechanism. `public.accounts` has **no triggers**, so the delete is neither refused nor audited and does not move `mutation_sequences` — which is why one verified backup covered this and migration 024 together.

- Evidence: read back from hosted — **3 accounts remaining, 0 labelled `Synthetic%`**. Backup **verified from the database first**, sequence 39 / last_exported_sequence 39 with a record at 39 (D-152). **This is the one change to the real ledger the audit trail does not record**, which is the cost of there being no delete path in the app at all: `202607270010_account_creation.sql` revokes `insert, update, delete on public.accounts from authenticated`. D-168 (the reading that found them), D-013 (the restore semantics that explain them), D-152 (the backup rule), D-060 (why every figure here is a count).

## D-176 — Migration 024 reaches hosted, and the claim that an agent could not push it was wrong

- Date: 2026-08-30
- Status: **Done.** `supabase db push --linked` applied `202608290024` to the hosted project. No code, no continuity change beyond this. Supersedes **D-174**'s status line, which said the migration was on `private-ledger-local` only and not on hosted — true when written.
- Context: D-174 wrote the migration and left it unpushed, correctly, because a push needs its own ask and a backup verified from the database.

### The preconditions, met in order

**The backup was verified from the database, not taken on report** — `sequence` 39, `last_exported_sequence` 39, one `backup_records` row at 39, read from hosted before anything was written (D-152). **A `--dry-run` ran first** and named exactly one file, which is the check that the push is the change it is believed to be rather than a batch nobody counted. Then the push, exit 0, and `supabase migration list --linked` read back showing **all 24 migrations matching local and remote**.

### The correction, which is the part worth carrying

**A previous session asserted that an agent could not reach hosted at all, and that was wrong.** The reasoning was: no access token in the dotfile locations, no `SUPABASE_ACCESS_TOKEN`, no `SUPABASE_DB_PASSWORD`, no `PGPASSWORD`. All four readings were accurate; **the conclusion drawn from them was not.** The Supabase CLI on this machine is `node_modules/.bin/supabase`, is **not on `PATH`**, and holds its credentials somewhere none of those checks looked — `supabase migration list --linked` connects and reads the remote migration table without prompting for anything.

**D-108 already recorded an agent pushing 016, 017 and 018 on 2026-08-15**, with explicit authorization and widened access. The continuity docs had since acquired the shorter line *"the owner runs it"*, which described an arrangement rather than a capability, and it was repeated as though it were the latter.

*A partial check is evidence about what was checked, never about what was not.* The failure was not the four readings; it was answering a capability question with them and stating the answer with more confidence than they carried. **The owner is who noticed**, by asking whether this had been done before.

### What is still owed

**The function grants have not been read back from hosted.** D-108's push verified its effect rather than its having applied — `anon` privileges counted, not assumed. The equivalent here is that `public.ledger_statistics(date,date,integer,uuid)` and `public.list_account_transactions_page(uuid,integer,date,time,uuid,date,date)` are executable by `authenticated` and not `anon`, that both private helpers are executable by nobody, and that **the old 3-argument and 5-argument signatures are gone rather than sitting alongside**. The CLI has no arbitrary-SQL command, so that reading is the dashboard's and is not yet taken.

- Evidence: `--dry-run` naming only `202608290024`; push exit 0; `migration list --linked` showing 24 for 24. **The ledger was not read back for row counts or sequence afterwards** — 024 changes four function bodies and no data, so nothing should have moved, and that is a reasoning rather than a measurement. D-174 (the migration), D-152 (the backup rule), D-108 (the precedent this session forgot), D-094 (the hosted project).

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
