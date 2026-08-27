# Private Ledger decision log

Last reviewed: 2026-08-09

Entries are append-only. A superseding decision must reference the earlier entry rather than rewriting its history.

This file carries **D-141, D-153, D-158, D-161, and D-164 onward** — four gaps, and every one of them is the rule holding rather than an accident. A boundary excludes every open question (D-133), and where such a question sits inside an otherwise settled range the boundary **steps over it rather than stopping short of it** (D-154). What is left here is therefore the four questions nobody has closed, plus the current work. **D-141**: whether the mailbox source is deleted after import, deferred by the owner. **D-153**: whether Press Start 2P becomes the default face, one constant in `lib/ui-font.ts`. **D-158**: `list_match_candidates`' unbounded scan, recorded in its own migration and unfixed. **D-161**: the statistics surface has no window picker and no account filter, and the RPC takes `p_from` and `p_to` that nothing sends. `scripts/check-docs.mjs` pools this file with every archive and checks ids for duplicates and omissions across the whole set, so the ids stay whole and the maintained file has never been required to be contiguous. Nine settled ranges were relocated unchanged, not rewritten: **D-001 … D-059** to [`docs/decisions/ARCHIVE-D-001-D-059.md`](docs/decisions/ARCHIVE-D-001-D-059.md) on 2026-08-09, **D-060 … D-113** to [`docs/decisions/ARCHIVE-D-060-D-113.md`](docs/decisions/ARCHIVE-D-060-D-113.md) on 2026-08-18, **D-114 … D-119** to [`docs/decisions/ARCHIVE-D-114-D-119.md`](docs/decisions/ARCHIVE-D-114-D-119.md) on 2026-08-19, **D-120 … D-129** to [`docs/decisions/ARCHIVE-D-120-D-129.md`](docs/decisions/ARCHIVE-D-120-D-129.md) on 2026-08-23, **D-130 … D-133** to [`docs/decisions/ARCHIVE-D-130-D-133.md`](docs/decisions/ARCHIVE-D-130-D-133.md) on 2026-08-24, **D-134 … D-140** to [`docs/decisions/ARCHIVE-D-134-D-140.md`](docs/decisions/ARCHIVE-D-134-D-140.md) on 2026-08-25, **D-142 … D-152** to [`docs/decisions/ARCHIVE-D-142-D-152.md`](docs/decisions/ARCHIVE-D-142-D-152.md) on 2026-08-26, **D-154 … D-156** to [`docs/decisions/ARCHIVE-D-154-D-156.md`](docs/decisions/ARCHIVE-D-154-D-156.md) on 2026-08-27, and **D-157 … D-163 without D-158 and D-161** to [`docs/decisions/ARCHIVE-D-157-D-163.md`](docs/decisions/ARCHIVE-D-157-D-163.md) the same day. The index below covers all ten files, so a reader can find any entry without opening any body.

**Every boundary sits where an argument ends rather than where a number is round**, and the fourth one is the clearest case of that rule so far. It was taken at **93%** of this file's byte budget and moved the whole arc in which both readers went to Cloud Vision and the local OCR engine was deleted. **The third boundary had explicitly refused to move D-120**, on the grounds that whether pre-fill stays was undecided and that question attached to D-120 and D-129 — which was true when written. **What closed it was not an argument but a shipped feature**: D-135 files a machine-read amount into the ledger without the owner looking at it at all, which is a stronger commitment than the trial ever asked for. *A question is closed when the code has stopped asking it*, and that is the test to apply at the next boundary rather than re-reading the prose.

What this file now holds is four open questions and the live frontier — the mailbox archive, the default typeface, an unbounded candidate scan and the statistics surface's missing filters — then the eighth and ninth archive boundaries, the `include_in_reporting` control, and the typeface reflow work.

**Two boundaries were taken on 2026-08-27 and the second is the one worth reading before the tenth.** The eighth moved three entries and left this file at 85%; two decisions and a review's findings put it back to **96% the same afternoon**, and the ninth then moved five and took it to 70%. **The rate is the thing to watch rather than the percentage** — D-146's line, now demonstrated twice in one day — and the honest conclusion is that a boundary is part of finishing a feature rather than a periodic chore. **What bought the ninth its depth was a question closing, exactly as D-164 predicted**: PLAN task 49 settled D-157's metrics, so D-157 moved. D-153's default face has not been settled and did not.

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

### Current 
—
 this file

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
### Current 
—
 this file

- **D-164** — The eighth archive boundary is fenced on both sides, so the shallowest cut is the only honest one
- **D-165** — `include_in_reporting` gets a control, and the erasure it could have caused is made unrepresentable rather than remembered
- **D-166** — The typeface work pinned nothing vertical, because the measurement said every reflow in this app is a width one
- **D-167** — The ninth boundary steps over two open questions at once, and the rate is now the finding

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

## D-153 — The typeface is a per-device preference in a cookie, because a font is a fact about the screen and not about the ledger

- Date: 2026-08-26
- Status: **Done, uncommitted.** New `lib/ui-font.ts`, `tests/ui-font.test.ts`, `app/api/v1/ui/font/route.ts`, `app/font-picker.tsx`; `app/layout.tsx`, `app/site-header.tsx`, `app/globals.css`, `package.json`. No SQL, no contract change, **no CSP change**.
- Context: the owner asked for a Stardew Valley direction (`PLAN.md` task 42) and, having compared three pixel faces on a design canvas, asked for a way to switch between them rather than a single baked choice.

### Where the preference lives, and why it is not a row

Three places were possible and the argument that settled it is **not** cost.

**A typeface is a fact about the screen, not about the ledger.** The owner reads this app on a phone and on a desktop; a pixel face that is comfortable at arm's length on a monitor is a different proposition at 390px. A per-device preference is therefore the *correct* semantics, and a row in PostgreSQL would force one answer across every device and then need overriding. Server-side storage stays right for preferences that are genuinely account-scoped and must travel — a default account, category rules, saved views for task 44 — and this is not one.

The cost side happens to agree, and is recorded so nobody re-opens it casually. A row would have meant migration 021 on every project **including hosted**, a decision about whether the table joins `BACKUP_TABLE_KINDS` (versioned v2→v6 purely by accretion, so a new table is a contract question rather than a detail), RLS and an owner-bound RPC to satisfy the boundary rule, and pgTAP coverage — to store one of four known words.

**Browser storage was refused for the guard, not for the data.** `tests/privacy.test.ts` forbids every client storage API across `app/`, and **the guard is only worth having while it is a blanket grep**. "No client storage except this one" cannot be checked by the same rule, and the next thing stored there would have no tripwire — which is D-148, D-151 and D-152 in different clothes. A server-set cookie keeps `app/` free of those APIs entirely.

It also resolves **before first paint**. The layout reads the cookie server-side and writes `data-font` on `<html>`; the browser-storage version paints the default face and swaps, and the only cure is a blocking inline script the CSP would then have to admit.

### The allowlist is the security story

The chosen value reaches the DOM as an attribute. React escapes attribute values, so this is not an injection today — but "it is escaped downstream" is a property of a renderer someone can change, and a closed set is a property of `fontChoiceFrom` that they cannot. It is **total over untrusted input**: given `undefined`, `null`, the wrong case, a quote-and-attribute payload or a value of the wrong type, it returns a member of `FONT_CHOICES`. There is no failure branch, deliberately — a preference that cannot be read is not an error to report, it is a device that gets the default.

**The route is not owner-bound, and that is the one thing here worth arguing.** Every other route under `/api/v1/` opens with `strongOwnerClient()` because it reaches records. This one reaches nothing: no database client, no RPC, no query — it parses a four-value enum and writes it back as a cookie on the caller's own response. There is no boundary for an owner check to defend, and requiring aal2 to change a typeface would mean the signed-out page could not be made legible. The strict schema is what bounds it: an unknown key is refused rather than ignored, because a caller sending `{font, theme}` has a broken model of this endpoint and answering it as though the extra key were fine is how a second preference gets half-built.

### What the faces are, and the one thing that must never be removed

All three are **Fontsource packages at OFL-1.1**, matching the two IBM Plex packages `app/layout.tsx` already imported. **The first attempt hand-downloaded `.woff2` files into `public/fonts/` and was wrong** — it missed that this app already had a font mechanism, on the strength of a grep for `next/font` that was simply aimed at the wrong thing. Bundled rather than fetched either way: `font-src 'self'` admits no external host, and weakening the CSP for typography is not a trade this app makes.

**Every switched stack keeps `IBM Plex Sans Thai` behind the pixel face.** All three cover Latin only. Thai reaches this app as *data* — a counterparty name off a statement, a note the owner typed — and never as interface copy, since `app/` contains no Thai at all. Removing the Thai family from those stacks would drop those cells to whatever the device happens to have. The picker says so beside the control rather than leaving it to be discovered in a table and read as a defect.

**The default is `system`, not the owner's leading candidate.** He leans to Press Start 2P and can choose it in one gesture, which the cookie then remembers per device; defaulting to it would impose a face nobody had lived with on every fresh device, including whichever one he next opens to check a balance. The pixel faces are on trial, and the way back to something legible must not itself depend on the trial going well. Flipping `DEFAULT_FONT` is the whole of that change.

### Proved where it can be

`tests/ui-font.test.ts` is **17 tests**, most of them about untrusted input, and they are the half a source grep cannot do. The other half needed a browser: the cookie is `httpOnly`, so a throwaway spec under `.runtime/` watches `data-font` change, survive a reload, and lead the computed `font-family` with Thai still behind it — and watches an unknown face refused **422** with the stored value unchanged.

**The client-storage guard fired on this change's own comments, which is the fifth time this trap has bitten in this repo** — the prose explaining why browser storage was *avoided* named the API it forbids. The comments were reworded and the guard left alone, which is the **opposite** of the remedy `docs/gotchas/app.md` records for `aria-modal`: that one was narrowed to the construct. The distinction is that this is a **prohibition on an API with non-dotted uses** (`const s = localStorage`, `window.localStorage`, destructuring), so narrowing it to `localStorage\.` would open a real bypass. A bare-word ban is correct where the word *is* the capability; match-the-construct is correct where the word also names a concept. Both are now in the trap.

### What `/code-review` caught, and the guard that could not fail

**Choosing a pixel face pushed the page wider than the phone, which is D-138 arriving from a new direction.** `.header-side` was `display: flex` with no wrap, and `.font-picker .field-help` capped its width in **`ch`** — a unit of the very font being switched, so the note grew from 208px to 353px exactly when the header had least room. Measured on `/ledger` under iPhone 13: `scrollWidth` 390 → **504**. The page then shrink-to-fits and every glyph gets *smaller*, which is the opposite of what the trial is for. `flex-wrap` and a px cap fix it.

**The guard written for that defect passed with the defect fully present, and that is the more useful finding.** It asserted `scrollWidth <= window.innerWidth` — which is the same number twice, because a phone widens its *layout* viewport to fit overflowing content: measured at 504 and 504. `document.documentElement.clientWidth` stayed at **390** and is the only honest reference. Same family as the trap about asserting a scrolled element sits near the viewport top: **a ratio that adjusts to the thing it is checking cannot fail.** Red-proved after correction by reverting both fixes and watching it name the face and the numbers.

**An element selector cannot out-rank a class, again.** `:root[data-font=…] th` is (0,2,1) and `:root[data-font=…] .numeric` is (0,3,0), so the header step-down silently lost every `<th class="numeric">` — Movement, Balance and All accounts kept the cell size while every other header shrank. The same shape as the `table` versus `.ledger-table` trap already recorded. Both selectors now name `th`, and the cell rule is scoped to `td` so it cannot reach back.

**A comment claimed a measurement that had not been taken.** The 10px figure size said *measured against the widest real shape* and was asserted. Press Start 2P advances 1em per glyph, so `-1,234,567.89` at 13 characters is 130px against a 117px content box — it spilled. 8px fits at 104px. The lesson is not the number: **this repo's own rule is that a measurement beats a conclusion, and a comment saying *measured* is a claim that has to be true.**

**Two picker defects.** `disabled` covered only the refresh and not the request, so the control was live and silent through the slow half — it snapped back to the old face with no busy affordance, which invites a second click and a second concurrent POST whose `Set-Cookie` races the first. And a failed `router.refresh()` was silent: the cookie stored, the page unchanged, nothing said. The control now shows the in-flight choice while disabled, and says which of *refused* and *stored but not shown* happened, because those read identically and their remedies are opposite.

**The only test of the mechanism was gitignored**, which is the committed-spec gap in another costume: the feature rests on Next re-rendering the **root layout**, a framework behaviour rather than app code, and the spec proving it lived under `.runtime/`. It is now `tests/e2e/font-picker.spec.ts` and runs on both projects.

- Evidence: Vitest **807 passed / 7 skipped across 38 files** (up 17). Playwright owner **31/31**, isolated **28/28** (up ten — the promoted spec, four of them the per-face viewport measurement) including the axe pass on every route, production build clean at **twenty-one** `/api/v1/` routes, `check:docs --strict`, tsc and ESLint clean. pgTAP not re-run and deliberately so — no SQL has moved since 2026-08-18. D-148 (the wire seam the picker calls through), D-147 (why the control holds no optimistic value), D-137 (the one declared colour scheme this sits beside), D-152 (the guard-follows-the-code discipline).

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

## D-164 — The eighth archive boundary is fenced on both sides, so the shallowest cut is the only honest one

- Date: 2026-08-27
- Status: **Done, uncommitted.** `docs/decisions/ARCHIVE-D-154-D-156.md` (new), `DECISIONS.md`, `HANDOFF.md`. No code, no SQL.
- Context: this file reached **116,722 of its 120,000-byte budget (97%)** against entries running 3–10 KB, so the next decision would have failed `check:docs --strict` mid-task. Every authorized task appends one, so it blocked all of them.

### Three entries, because this is the first range fenced on both sides

D-133's rule — **a boundary excludes every open question** — with D-140's test, *a question is closed when the code has stopped asking it*, and D-154's step-over. Applied honestly they stop the range at **D-154 … D-156, 20 KB**, where the seventh moved eleven entries and 75 KB. Every earlier boundary had settled ground above it; this one does not.

- **D-153, below.** `DEFAULT_FONT` is `system`, and D-153 says flipping that one constant is the whole of making Press Start 2P the default. The owner leans to it and has not decided — D-137's *"but we'll see"* in different clothes, and the fifth boundary refused D-137 for that reason.
- **D-157, above.** PLAN task 49 was authorized the same day and revises D-157's own measurement: `size-adjust` pins cap height and not advance width, and task 49 decides which of `ascent-override`, `descent-override` and `line-gap-override` go on top. Archiving a measurement in the session that revises it files a live argument as settled.
- **D-158, beyond it.** `list_match_candidates`' unbounded scan, recorded in its migration and unfixed.

The three that moved closed on each other: **D-154** is the seventh boundary and this entry answers it; **D-155** is superseded in as many words by D-158, which paged the ledger D-155 left unpaged; **D-156** deferred the phone shell header under its own heading and D-157 fixed it one entry later.

**The cheaper cut was priced and refused.** D-153 too would have reached 71%, D-157 and D-158 as well 54% — the difference between three entries of headroom and fifteen. Raising the budget was not considered, for the reason D-134 records and D-149 paid.

### D-154's advice was aimed here, and is carried forward so the maintained file keeps it

**"Relocated unchanged" means the prose is unchanged, not that every byte is**: a link written relative to the repo root resolves two directories wrong from `docs/decisions/`, and the remedy is that the label keeps the full path while the target becomes the bare sibling filename. **This range carries no relative link**, checked before the move rather than after. Byte-identity was **proved by diff against `git show HEAD:DECISIONS.md`**, not by reading — normalising line endings first, since git stores this CRLF file with LF.

### Three prose drifts in this file's preamble that `check:docs` structurally cannot see

It validates the index against the entries and that every link resolves; it never asks whether the prose describing the archives is true. **The seventh archive was missing from the list of relocated ranges entirely** — the paragraph said *"Six settled ranges"* and named six, while `ARCHIVE-D-142-D-152.md` existed, was linked from `HANDOFF.md`, and had its own index section here. And **two paragraphs still described the file as of the fifth boundary**. All three replaced, not annotated: D-052's rule for `HANDOFF.md` binds a maintained pointer wherever it lives.

### This entry is short on purpose

D-146 already found that a shallow boundary argues for **shorter entries** rather than more archives, and a boundary entry that spends 7 KB saying it moved 20 is the clearest available counter-example. **The ninth boundary is two or three ordinary entries away** and will meet the same wall in the same place until the default face and task 49 are settled.

- Evidence: **116,722 → 96,270 bytes on the move (97% → 80%)**, and **100 KB (85%)** with this entry appended, as `check:docs` reports it. **164 decisions across nine files**, index matching one for one, `pnpm check:docs --strict` clean. **No test, migration or build re-run, deliberately** — nothing outside `docs/` and the continuity files moved. D-133 (the rule), D-140 (the test), D-154 (the step-over and the link advice discharged), D-146 (shallow on purpose, the first time), D-134/D-149 (why the budget is not raised), D-130 (the budget), D-052 (replace, do not append).

## D-165 — `include_in_reporting` gets a control, and the erasure it could have caused is made unrepresentable rather than remembered

- Date: 2026-08-27
- Status: **Done, uncommitted.** `lib/transactions.ts`, `lib/ledger-window.ts`, `app/api/v1/transactions/[id]/overlay/route.ts`, `app/ledger-statement-row.tsx`, `app/ledger-shared.ts`, `app/transactions-view.tsx`, `app/globals.css`, `tests/transactions.test.ts`, `tests/ledger-window.test.ts`, `tests/e2e/owner-session.spec.ts`, `tests/helpers/local-owner.ts`. **No SQL and no new route** — the build still emits twenty-three `/api/v1/` routes.
- Context: PLAN task 48, authorized by the owner. The column has existed since migration 001 and has been read by statistics and the ledger's totals since 023, and **nothing in the app could set it**, so the filter was inert. The deployed page showed an internal transfer inflating money-in and money-out alike.

### The hazard is a silent success, so the guard is a type rather than a rule

`PUT .../overlay` takes the **whole** overlay and `update_transaction_overlay` writes it with `on conflict do update set` over every column. A body naming only the flag is refused by a `.strict()` schema and is therefore safe. **A body sending the rest as `null` is accepted**, and erases the description, counterparty, effective date, category and note the owner typed on a row he was only trying to mark.

So no caller builds a body. `overlayWriteBody(transaction, change)` derives it from the row and `change` may only narrow that derivation, which hands the same guarantee to the next field editor for free. `overlayWriteBodySchema` moved out of the route and next to it, so a test asserts the builder's output against the contract the route **actually enforces** rather than against a copy.

**Red-proved twice rather than assumed.** With the builder returning nulls, three Vitest cases fail by name and the browser spec fails on *the description the owner typed must survive a toggle*. The end-to-end case is the one that matters: it seeds a populated overlay through `psql` — nothing in the app could write those fields before this — toggles through the real UI, and reads the row back to find only the flag and the revision moved.

### Two things found while building it

**The route was returning the owner's uuid.** The RPC answers `to_jsonb(o)`, the whole row; the ledger reads overlays as that row minus `owner_id` and `transaction_id`, and `transactionOverlaySchema` is strict about the difference. The route strips both now, which both stops shipping an identity to a screen that never reads it (D-155's rule on `fingerprint`) and lets a stored overlay be folded straight back into the window with no second contract.

**`resetOwnerImportSurface` never cleared `transaction_overlays`** — the fourth table in that function needing the "delete before the rows it references" comment the other three already carry. It never bit because nothing but `confirm_import` could write one, and those ids are fresh every run. The moment a test seeded one it did not look like a leak: `session_replication_role = replica` disables the FK triggers, so the overlay outlived its transaction and the *next* run failed on a primary key in a table that test never mentioned.

### Where the control went, and why the totals move with it

**The Status cell**, not a new column and not a detail panel. A column was refused on width — the table sets 1160px and the merged view 1280px, and D-138 is what a wide ledger costs. A detail panel was refused because **on these rows there is none**: `pair-detail` exists only where a slip or card matched, and internal transfers are statement-only. The Status cell is already a single em dash on exactly those rows, so the control costs no width — **measured 148px of content in a 148px cell in all four faces, both states**, and the check was proved able to fail (457px and 523px under a deliberate break).

**`withOverlay` corrects the account's totals, because they came from SQL that honours the flag.** Replacing the overlay and stopping would leave the strip stating a figure the rows contradict. The client can do it exactly rather than approximately — it holds the row's whole component array, which is the set the server summed, every term a `bigint`, nothing divided. `totals.rows` is untouched, matching the migration's own words. A test writes the same flag twice to prove the adjustment keys on the *change* and not on the write.

### What `/code-review` found, and the serious one was reachable in one keystroke

**The totals honoured the flag on one branch and not the other.** The strip prefers the server's whole-account figure, which has applied `include_in_reporting` in SQL since 023 — but falls back to `summarizeRows` the moment a text query or a confirmed-status filter narrows the population beyond what SQL was asked about. That function summed every confirmed row's components regardless. So: exclude a row, watch Money in fall, **type one character in the search box, and it is counted again** — with the row still wearing its "Excluded" chip. That is the exact inverse of the disclosure the chip exists to make. The filter belongs in `summarizeRows` rather than at the call site, so the two branches cannot disagree; only confirmed rows are filtered, because the flag is a column on `transaction_overlays` and a slip is not a transaction. Red-proved: without it, three cases fail by name.

Three review findings landed on the picker and are in D-166 with the rest of task 49.

- Evidence: Vitest **873 passed / 7 skipped across 41 files** (from 853/7/41). Playwright owner **33/33** (from 32), isolated **38 passed / 4 skipped** (from 34). `tsc`, `pnpm exec eslint .` and the production build clean at twenty-three routes. axe already covers the ledger with rows at three places in the owner suite, so the control passed it. **pgTAP deliberately not re-run — no SQL moved.** D-161 (the readers), D-155 (dropping an identity from a payload), D-138 (the width this avoided), D-064 (no chip for the ordinary state), D-152 (the guard-follows-the-code discipline).

## D-166 — The typeface work pinned nothing vertical, because the measurement said every reflow in this app is a width one

- Date: 2026-08-27
- Status: **Done, uncommitted.** `app/font-picker.tsx`, `app/globals.css`, `tests/e2e/font-picker.spec.ts`, `.runtime/font-reflow.spec.ts` and its config (throwaway). No SQL, no route, no contract change.
- Context: PLAN task 49, authorized. The owner asked that switching the face not move the page. The task prescribed a remedy — pin the vertical box with `ascent-override`, `descent-override` and `line-gap-override` — and required measurement first.

### The prescribed remedy was measured and not built

Font boxes per 100px of the stack each face resolves to: IBM Plex **165**, Press Start 2P **70** (with **zero** descent), Pixelify Sans **133**, Silkscreen **142**. A spread that wide should reflow everything — and **nothing reflowed**. Page geometry across both routes was identical to the pixel in three of the four faces.

The reason is that **every line height in this stylesheet is an explicit ratio** in the `font:` shorthand, so a font's own ascent and descent never reach layout. Three descriptors on three faces would have been dead weight and a claim the numbers do not support. **When a measurement contradicts a conclusion the measurement wins**, and here it contradicted the plan rather than the code.

### What did move was one flex row, and the cause was text capped by width

**`.header-side` measured 71px in IBM Plex against 88px in Press Start 2P**, pushing every landmark below it down 16–17px on both routes. The header was the only box on either route whose height changed at all.

The cause was the font picker's standing note: a sentence in a **width-capped** box occupies a face-dependent number of lines. Folding it behind the `(i)` is D-156's own rule applied where it had not been — *standing copy folds; a message about the write you just made does not* — so the refusal and the "stored but not shown" line stay on screen and only the standing sentence moves. It took the header from 171px to **148px in every face**, which is 23px of first screen that D-156 and D-157 were both trying to buy.

**The same defect was one control along.** The phone's privacy chip was capped at 130px, which made `.header-side` 83px against 100px at 390px. Given the panel's full width the sentence fits one line in every face.

### The guard is committed, and it caught two things a throwaway could not

`tests/e2e/font-picker.spec.ts` now asserts that **every box in the shell header keeps its height in every face**, on both the desktop and phone projects.

- It found the phone case at all. The throwaway harness ran desktop only, which is D-138's standing lesson arriving again: a measured desktop width is not a phone.
- **It was racy and said so.** `document.fonts.ready` resolves immediately when nothing is pending, and a browser requests a face only once something uses it — so the moment after `router.refresh()` applies `data-font` there may be no load yet, the fallback's geometry gets measured, and the run passes or fails on timing. It did both, in consecutive runs. Asking for the resolved stack by name starts the load and then waits for it.

**The whole document's height is deliberately not asserted.** Body prose re-wraps when the face changes — `size-adjust` pins cap height and not advance width — so a paragraph taking one more line is the reachable boundary rather than a defect: 979px against 961px at phone width with **both headers identical**. Asserting it would be asserting "identical positions", which task 49 named as not reachable and which this entry did not deliver.

### Three review findings, all on the disclosure, and all three were the same mistake

The `(i)` was first written **inside** the `<label>` wrapping the select. That is the defect `app/ledger-note.tsx` documents in its own docblock and D-156 records having shipped once: a `<label>`'s accessible name is computed from its subtree, so the button's `sr-only` text joined it and the select announced as *"Typeface About this typeface"* — plus the whole note once open. It also broke the HTML content model, since a `<button>` is labelable and a label may hold only its own control. **The comment written beside it claimed axe had verified it**, which is a claim the docblock being quoted says in as many words cannot be true: axe reports no violation here, because the name is non-empty and contains the visible text. `tests/e2e/font-picker.spec.ts` now pins the computed name with `exact: true`, panel open and closed, and it was red-proved by putting the note back.

The same placement made `.font-picker label > span` (0,1,2) outrank `.note-panel` (0,1,0), so the panel would have drawn at 10px, uppercase, in `--font-data` — and `.note-panel` carries `letter-spacing: normal; text-transform: none` precisely to undo an ancestor's label styling, which is the one place that defence loses. Moving the note to a sibling ends all three.

**And `:empty { display: none }` defeated the reason the message region was made unconditional.** The paragraph is `aria-live` and is always rendered so the screen reader is watching it *before* it has news — but `display: none` removes it from the accessibility tree, so for assistive technology it appeared at the same moment as its text after all, which is the failure the unconditional render exists to prevent. It is clipped now: in the tree, zero height.

- Evidence: Playwright isolated **38 passed / 4 skipped** (from 34), including the new guard and the accessible-name pin on both projects, and axe on every route; owner **33/33**. Vitest **873 / 7 across 41 files** — the three added are D-165's. `tsc`, ESLint and the production build clean. D-157 (the `size-adjust` this revises and the limit it states), D-156 (the fold rule), D-153 (the `ch`-cap defect of the same family), D-138 (a measured width is not a phone).

## D-167 — The ninth boundary steps over two open questions at once, and the rate is now the finding

- Date: 2026-08-27
- Status: **Done, uncommitted.** `docs/decisions/ARCHIVE-D-157-D-163.md` (new), `DECISIONS.md`, `HANDOFF.md`. No code, no SQL.
- Context: this file hit **112 KB of 120,000 bytes (96%)** — the second breach of the day. The eighth boundary had left it at 85% that same afternoon.

### Five entries, and two holes in the middle of one range

**D-157, D-159, D-160, D-162 and D-163 moved. D-158 and D-161 did not**, and D-154's step-over is what makes that a range rather than three. It is the first time the step has been needed twice inside one cut.

- **D-158** — `list_match_candidates`' unbounded scan, written into its own migration comment and unfixed. Still asking.
- **D-161** — it says so under its own heading, *What this task created and did not close*: no window picker and no account filter. `public.ledger_statistics` takes `p_from` and `p_to` and the route parses them, with nothing sending them, which is the code asking in the plainest available form. That is PLAN task 46, scoped and **not authorized**.
- **D-160 was the near miss.** Its named follow-on was that *nothing sets `include_in_reporting`* — built the same day as D-165. Without that, this range would have stopped at D-159 and moved 16 KB instead of 31.

**D-157 moved because a question closed, which is what D-164 said the ninth would need.** That entry predicted the ninth would meet the same wall in the same place until D-153's default face and D-157's metrics were settled. Task 49 settled D-157's and D-166 records the answer. D-153 is unchanged and stays.

### The rate, which is the part worth carrying

**Two boundaries in one day, 85% → 96% in an afternoon.** D-146 first said the rate matters more than the percentage; this is the second demonstration and the clearest. Two decision entries and one review's findings were enough to breach a budget the previous boundary had just cleared 15 KB of headroom in. **A boundary is part of finishing a feature, not a periodic chore** — and the lever is shorter entries, which D-164 argued and this entry is trying to obey.

**What the maintained file holds now is unusual and is the intended shape**: four singletons — D-141, D-153, D-158, D-161 — each alone because each is still asking, then D-164 onward. A reader gets the open questions and the current work and nothing settled. The fragmentation is the price of keeping D-133's rule exactly, not a sign of it slipping.

- Evidence: **114,607 → 83,771 bytes, 96% → 70%**, the deepest cut since the seventh. The five relocated entries proved byte-identical to `HEAD` by diff rather than by reading, after normalising line endings. **Nothing in the range carried a relative link**, checked before the move. `pnpm check:docs --strict` passes with the counts unchanged, which is what proves nothing was dropped. D-133 (the rule), D-140 (the test), D-154 (the step-over), D-164 (the eighth, and the prediction this confirms), D-146 (the rate), D-130 (the budget).
