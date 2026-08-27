# Private Ledger decision log

Last reviewed: 2026-08-09

Entries are append-only. A superseding decision must reference the earlier entry rather than rewriting its history.

This file carries **D-141 and D-153 onward** — a gap, and the seventh boundary is the reason: it began at D-142 rather than at D-141, because **D-141 is still an open question** (the mailbox archive) and a boundary excludes those. `scripts/check-docs.mjs` pools this file with every archive, so the ids stay whole across the set. Six settled ranges were relocated unchanged, not rewritten: **D-001 … D-059** to [`docs/decisions/ARCHIVE-D-001-D-059.md`](docs/decisions/ARCHIVE-D-001-D-059.md) on 2026-08-09, **D-060 … D-113** to [`docs/decisions/ARCHIVE-D-060-D-113.md`](docs/decisions/ARCHIVE-D-060-D-113.md) on 2026-08-18, **D-114 … D-119** to [`docs/decisions/ARCHIVE-D-114-D-119.md`](docs/decisions/ARCHIVE-D-114-D-119.md) on 2026-08-19, **D-120 … D-129** to [`docs/decisions/ARCHIVE-D-120-D-129.md`](docs/decisions/ARCHIVE-D-120-D-129.md) on 2026-08-23, **D-130 … D-133** to [`docs/decisions/ARCHIVE-D-130-D-133.md`](docs/decisions/ARCHIVE-D-130-D-133.md) on 2026-08-24, and **D-134 … D-140** to [`docs/decisions/ARCHIVE-D-134-D-140.md`](docs/decisions/ARCHIVE-D-134-D-140.md) on 2026-08-25. The index below covers all seven files, so a reader can find any entry without opening any body.

**Every boundary sits where an argument ends rather than where a number is round**, and the fourth one is the clearest case of that rule so far. It was taken at **93%** of this file's byte budget and moved the whole arc in which both readers went to Cloud Vision and the local OCR engine was deleted. **The third boundary had explicitly refused to move D-120**, on the grounds that whether pre-fill stays was undecided and that question attached to D-120 and D-129 — which was true when written. **What closed it was not an argument but a shipped feature**: D-135 files a machine-read amount into the ledger without the owner looking at it at all, which is a stronger commitment than the trial ever asked for. *A question is closed when the code has stopped asking it*, and that is the test to apply at the next boundary rather than re-reading the prose.

What this file now holds is the current work and the two open questions the fifth boundary could not move past: bulk slip upload and the palette with its phone measurements, then the statement auto-import arc — bulk import, the local mail fetcher, and the hosted Sync button.

**The fifth boundary is shallower than the fourth and the reason is worth knowing before taking the sixth** (D-146). It landed at 82% where the fourth landed at 56%, because D-134 and D-137 sit immediately behind it holding questions that have not closed: whether `GOTCHAS.md` splits at its next breach, and whether this app really has no dark scheme. **Closing those is what buys the next boundary its depth** — a deeper cut here would have had to break D-133's own rule to get it.

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
- **D-154** — The seventh archive boundary steps over an open question instead of stopping short of it, and the maintained file now has a gap
- **D-155** — The ledger loads on arrival, and what bounds the payload is the width of a row rather than a page of them
- **D-156** — Standing copy folds behind an `(i)`; a warning about an irreversible write does not, and moves closer to the control
- **D-157** — The pixel faces get a measured `size-adjust`, every route opens with a title, and the standing copy folds the rest of the way
- **D-158** — The ledger pages, and reconciliation keeps its rule: a candidate set narrows the input instead of a second engine deciding the answer
- **D-159** — The combined balance is computed once in SQL, because a per-account window cannot see another account's history
- **D-160** — Statistics compute in SQL, and division never produces money: a ratio is not a figure the ledger keeps
- **D-161** — The statistics surface is built, and every real defect in it was found by rendering it or by review, never by the gate

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

## D-154 — The seventh archive boundary steps over an open question instead of stopping short of it, and the maintained file now has a gap

- Date: 2026-08-26
- Status: **Done, uncommitted.** `docs/decisions/ARCHIVE-D-142-D-152.md` (new), `DECISIONS.md`, `HANDOFF.md`. No code, no SQL.
- Context: `DECISIONS.md` hit **95% (112 KB/117 KB)** with 5 KB of headroom, against recent entries running 3–10 KB. The next one would have failed `check:docs --strict` mid-task, which is the interruption `HANDOFF.md` warns about.

### The rule did not change; its shape did

D-133 set it — **a boundary excludes every open question** — and D-140 sharpened it into a test: *a question is closed when the code has stopped asking it*. Every boundary since has begun where the last one ended, and the sixth stopped at **D-140** precisely because **D-141 was still asking**: whether the mailbox source is deleted after import, and so whether it becomes a permanent archive under a password derived from a citizen ID and therefore non-rotatable. That question is **still deferred by the owner and was not re-raised**.

Six boundaries in a row were contiguous, and that had quietly hardened into an assumption. It was never the rule. **Eleven entries had accumulated behind one deferred question**, so obeying contiguity meant either waiting for an answer nobody was going to give this session, or raising the budget. The boundary begins at **D-142** instead and leaves D-141 in place, which keeps the rule exactly — nothing unresolved has been filed away — at the price of a gap.

**The alternative was the raise, and it was declined for the reason D-134 records.** That entry raised the traps budget once, attached the condition that the next breach be paid with a split rather than a third raise, and D-149 then paid it. Repeating the move here would have been a knowing repeat of a precedent this repo has already decided against.

### Why the gap is safe, which is a fact about the checker and not a hope

`scripts/check-docs.mjs` pools the maintained file with **every** archive and then checks ids for duplicates and omissions across the whole set. It has never required the maintained file to be contiguous; six boundaries simply happened to leave it that way. Verified rather than assumed: the check passes at **153 decisions, 149 traps, indexes match** with D-141 sitting alone above D-153.

**One thing did have to change and it is worth knowing before the eighth.** "Relocated unchanged" means the prose is unchanged, **not** that every byte is. A markdown link target written relative to the repo root resolves two directories wrong once the entry lives in `docs/decisions/`, and `check:docs --strict` caught exactly that — D-146's link to `ARCHIVE-D-130-D-133.md`. The sixth boundary had already met this and solved it the same way: the **label** keeps the full path, the **target** becomes the bare sibling filename. The eleven entries are otherwise byte-identical, proved by diffing them against the pre-split file rather than by reading them.

- Evidence: `DECISIONS.md` **112 KB → 37 KB, 95% → 31%** — the deepest boundary yet at **eleven entries**, where the sixth managed seven and the fifth four. Counts unchanged at **153 decisions, 149 traps**, which is what proves nothing was dropped. D-133 (the rule), D-140 (the test that sharpened it), D-146 (the fifth boundary, and the entry whose link had to be re-pointed), D-149 (the sixth, and the split that paid D-134's condition), D-130 (the byte budget).

## D-155 — The ledger loads on arrival, and what bounds the payload is the width of a row rather than a page of them

- Date: 2026-08-26
- Status: **Shipped 2026-08-26 as `f46ee64`, deployed, unconfirmed in the dashboard.** `app/transactions-view.tsx`, `app/ledger-controls.tsx`, `app/api/v1/accounts/[id]/transactions/route.ts`, `lib/transactions.ts`, `lib/wire.ts`, `lib/owner-ready.ts` (new), `app/owner-access.tsx`, `app/site-header.tsx`, `tests/owner-ready.test.ts` (new), `tests/wire.test.ts`, `tests/transactions.test.ts`, `tests/e2e/owner-session.spec.ts`, `tests/e2e/ledger.spec.ts`. **No SQL, no new route, no contract version change.** Supersedes the task 17 decision quoted below.
- Context: PLAN task 43, decided by the owner on 2026-08-26. Task 17 recorded *"Nothing loads until asked"*, and `app/transactions-view.tsx` said the same in its own words.

### The rule that was reversed was a consistency argument, and it never was an invariant

Task 17's reason was that every other read surface here is driven by an explicit action, so a section fetching the ledger on page load would be the one place that stopped being deliberate about it. **No money, privacy or append-only property rested on it** — which is exactly what makes it reversible where D-114's pre-fill guarantees are not, and the distinction is the reason this entry exists rather than a stylesheet diff.

**The owner's reason for reversing it is the stronger half and is recorded because a later review will re-derive it badly.** The page reads like an advertisement partly *because it is empty*, and the standing copy was filling the hole the table should occupy (D-156). A press the owner performs every single time is not a decision, it is a toll.

### The payload was measured before the code was written, because auto-loading an unbounded fetch is a different act from auto-loading a bounded one

PLAN task 43 named this as the open question and required it answered first. The answer: **`list_account_transactions` bounds nothing.** No `limit`, no `offset` — one `jsonb_agg` of every row for the account, each row carrying its components, its batch provenance and its overlays.

**It is deliberately still unpaged, and that is a finding rather than an omission.** The balances on this view are derived over *whole accounts*, and reconciliation runs over the *whole* ledger before any account or text filter — which is D-063, a defect already fixed once here. A first page would silently change both: the all-accounts figure would become a running total of whatever happened to be fetched, which is the precise thing the disclosed copy promises it never is. **Paging this properly means computing balances in SQL, which means a migration**, and that was not authorized.

**So the bound taken is on the width of a row, not on the number of them.** `import_batch_rows` was parsed by `lib/transactions.ts` and read by *nothing* — no component, no reconciliation, no total; provenance reaches the backup through `export_backup_snapshot`, a different path, untouched. Measured on a row carrying the field shape the parsers actually write, it is **241 of 848 bytes — 28.4%** of the object, so at the ledger's present size roughly **290 KB of a 1,020 KB** response, now paid on every visit rather than on a press. The route drops the key; the RPC still builds it, because removing it there needs the migration this task did not have.

**The trim is guarded from the side that would notice it returning.** `ledgerTransactionSchema` is `.strict()` and no longer lists the field, so a route that regresses and sends it again fails the parse by name instead of quietly paying for it. That is asserted directly (`tests/transactions.test.ts`), and the 31-test owner suite is the end-to-end proof the route really drops it — every one of those tests reads real rows back through this schema.

### Signing in does not navigate, and that turned an empty table into a dead end

The load on arrival means a visitor who is not signed in issues a request before touching anything, and `strongOwnerClient` answers it **401** — correctly. Two consequences had to be handled and the second was found by the suite rather than by reasoning.

**A refusal for want of a session is not a failure to report.** Rendering "Not loaded" in red on the first surface anyone sees, describing a route working exactly as designed, is worse than saying nothing. `lib/wire.ts` now carries the HTTP `status` on a failure — `refused` only, `null` for the two kinds where nothing usable answered — and only the *automatic* load treats 401/403 as a quiet line. A press still reports it in full: the owner asked, so the owner is answered.

**The dead end: sign-in does not reload the page.** Land on `/ledger` signed out, sign in from the header, and nothing below reacts — an empty table and a "sign in" line in front of someone who just did. The fix is an announcement (`lib/owner-ready.ts`) rather than a second reader of the session, because `app/owner-access.tsx` owns that sequence deliberately and says why: two places reading the same Supabase state disagree whenever one refreshes and the other does not.

**Two details of that announcement were learned from failures and neither is visible in the shape of the code.**

1. **It has two producers.** `OwnerAccess` announces when it reaches `ready`, which is the real login's TOTP challenge completing in place. But the browser suites sign in through the header's development route, which does not go through `OwnerAccess` at all — that component stays `signed-out` behind it. Announcing from only one left the other silent, and the owner suite failed by name on it.
2. **It is a counter, not a flag, because the two halves race and the listener loses.** The refusal that makes a page want this news travels over the network; the sign-in producing it is local. On the path this was written for, the announcement fires *before* the 401 lands, so a listener subscribing on the refusal subscribes to something that has already happened. A subscriber therefore reads the generation as well as listening. The same comparison is what stops a retry loop: a page acts once per announcement, so being refused again ends the sequence instead of restarting it.

**Red-proved rather than reasoned about.** The owner suite failed by name twice — `waiting for … 'Reload'` against a page reading "Sign in to read the ledger." — once for each of the two details above, and passed once each was fixed.

### What the tests had to become, which is itself the evidence

Twelve `Load transactions` presses in the owner suite are gone, replaced by `ledgerLoaded()`, which waits for the control's own label to reach `Reload`. That is a real assertion and not a sleep: the label reads `Loading…` in flight and `Reload` only once rows have arrived, so it waits for exactly the state the press used to produce **and** proves the automatic load happened at all. The one spec that asserted the opposite — that the table could not exist before a press — now asserts the reversal directly.

### What `/code-review` changed after the fact, and both were about the reversal rather than the code that did it

**A 403 means two different things and the first version discarded the difference.** `strongOwnerClient` answers 403 both for an identity that is not the ledger owner *and* for the owner without aal2. One fixed line for both told someone signed in on the wrong Google account to "sign in", which he had just done — and the `owner-ready` retry could never repair it, because signing in again produces the same 403. **401 keeps this view's own wording; 403 now shows the route's sentence**, because only the route knows which case it is.

**A guard written for "nothing loads until asked" became a defect the moment something did.** Recording a cash payment refreshed the rows `if (transactions !== null)` — which meant "only if the owner has already pressed Load", and after this change means *"only if the first load has already finished"*. Sign in on `/ledger` and record a payment while that load is in flight, and the row just written is missing from the table. The guard had no case left to cover: the callback fires only after a successful write. **This is the general shape to look for when reversing a load-on-demand decision** — conditions that read as null-safety and are really standing in for "has the owner asked yet".

The same reversal lets two loads overlap for the first time, so each is now stamped with a sequence number and a superseded load drops its results **and** its claim on `busy`. Without the second half the control returns to "Reload" while a load is still running, and the owner suite waits on that label to know rows have arrived.

- Evidence: Vitest **823 passed / 7 skipped across 39 files** (from 807/7/38), skip count unchanged at 7. Playwright owner **31/31**, isolated **32 passed / 4 skipped** (from 28), axe clean on every route. `tsc` and `pnpm exec eslint .` clean. Production build clean at **twenty-one** `/api/v1/` routes — unchanged, because this adds none. `check:docs --strict` at 154 decisions, 149 traps. **pgTAP deliberately not re-run**: no SQL moved. D-063 (reconciliation over the whole ledger), D-114 (what is *not* reversible), D-148 (`ledgerRequest`, extended here), D-156 (the copy half of the same restructure).

## D-156 — Standing copy folds behind an `(i)`; a warning about an irreversible write does not, and moves closer to the control

- Date: 2026-08-26
- Status: **Shipped 2026-08-26 as `f46ee64`, deployed, unconfirmed in the dashboard.** `app/ledger-note.tsx` (new), `app/ledger/page.tsx`, `app/ledger-controls.tsx`, `app/cash-entry.tsx`, `app/globals.css`, `tests/e2e/ledger.spec.ts`, `tests/e2e/owner-session.spec.ts`. No SQL, no route, no contract change.
- Context: PLAN task 42's restructure. The owner's three critiques of the ledger page, in his words: *"there is too much text, it's almost like its an ad for a product, not product itself"*; *"the transactions/ledger table should be what's most visible/dominant in the page"*; *"record a cash payment might better be contracted into smaller button and section"*.

### The distinction that decided every sentence, and it is not word count

**Copy explaining a principle goes behind the `(i)`. A warning about the irreversible thing the owner is about to do stays on the screen and moves closer to its control.** Applied rather than eyeballed, that split three paragraphs cleanly:

- *"Balances are exact and computed over whole accounts, never over the rows a filter happened to match"* — a principle, worth stating once, not worth re-reading on every visit. Folded, onto the `h1`.
- *"Everything committed to the ledger … source facts are immutable here"* — describes what the table already shows and what the rows already say. Folded, onto the ledger `h2`.
- *"Cash leaves no statement row and no slip, so what you type here is the only record the amount has"* — why the form exists at all. Folded.
- *"It is written once and never edited — a mistake is corrected, and both figures stay on the record"* — **not folded.** It is guarding an append-only write, not describing a philosophy, and it has **moved down** from the section heading to sit beside the submit button that performs the write. D-114's *"once you submit, a figure you did not type is as much yours as one you did"* is the same category on a different surface.

**One sentence was deleted rather than folded**, and only because it had stopped being true: *"Nothing loads until asked"* is what D-155 reversed.

### A disclosure button, not a hover tooltip, and the reason is the device

Hover does not exist on the phone this ledger is read on, and `title` reaches neither the keyboard nor a screen reader reliably. `app/ledger-note.tsx` is a real `<button aria-expanded>` toggling a panel, and the panel is **rendered only when open rather than hidden with CSS**, so collapsed copy is out of the accessibility tree and cannot be announced as though it were on the page. Each button names what it explains — *About this ledger*, *About these transactions*, *About cash entries* — because three controls called "More" are three identical rows in a screen reader's list.

**Two sizing traps were avoided by construction, both of them ones this repo has already paid for.** Every dimension in `.note-toggle` is absolute, because one of these sits inside an `h1` at `clamp(40px, 6.2vw, 86px)` and any `em` would make the badge track the heading — D-153's `ch` cap grew with the face it was capping, which is the same mistake. And the target is **26px rather than the 18px the glyph needs**, because it is the smallest control on the page and axe checks target size on every route rather than leaving it to the eye.

### The table was made dominant by subtraction, and the cash bench was contracted rather than moved

The intro on this route alone (`intro tight`) drops from up to 112px of padding plus a paragraph to a compressed heading and its `(i)`; its second grid column went with the paragraph. The cash bench is now one line — index, heading, `(i)`, button — where it was a titled section with a paragraph above the table.

**It stays above the table, and the alternative was tried and rejected.** Moving it below would have let the table start marginally higher and cost more than it bought: recording a payment reloads the rows, so the row just written would appear in a table the owner had scrolled past. **Heading levels did not change** — `h1`, `h2`, `h2` is still the outline, and axe's `heading-order` rule runs on this route — the headings are only smaller and inline with their controls.

### What is not fixed, and is not this entry's to fix

On a phone the **shell header** occupies most of the first screen before the ledger's own heading begins: brand, privacy chip, typeface picker with its note, two sign-in buttons, the route row and the session line. The table cannot be the most visible thing on that device while that is true, and no amount of trimming below it changes that. Measured at iPhone 13 width and **not acted on**, because the owner's critiques were about the ledger page and this is the shell every route shares.

### The disclosure had to come out of the heading, and `/code-review` is what measured it

**A descendant's accessible name joins its ancestor's.** Every heading here is an `aria-labelledby` target for its `<section>`, so a button inside one put its own label — and the disclosed paragraph once open — into the name of both the heading and the landmark: measured as `"Transactions About these transactions Everything committed to the ledger…"`. **axe reports no violation for this**, because the name is non-empty and contains the visible text, so every accessibility pass in both suites went on passing. Only the computed name finds it. `LedgerNote` now returns a **fragment** and the caller places it beside the heading, never inside; `tests/e2e/ledger.spec.ts` pins it with `exact: true`, which is the only form that catches it, and it was red-proved by putting the button back.

**And `display: block` on a flex item is blockified away.** The panel was written as a block inside an `inline-flex` span, with a comment claiming that made it drop onto its own line. It cannot: a flex container blockifies every child, so the panel sat beside a 26px button, shrink-to-fit — at 390px a narrow column wedged into a heading. `flex-wrap: wrap` with `flex-basis: 100%` is what actually gives it a line, and it is the pattern `.session-state` in the same stylesheet already used. **The comment was the worse half of that defect**, and it is the trap this repo has already recorded once: a comment asserting a behaviour is a claim that has to be true.

A third comment claimed the contracted cash bench still sat at the shared 167px indent while the numbers produced 145px. The numbers were corrected to match the claim rather than the claim softened, because the alignment was the intent.

- Evidence: Playwright isolated **34 passed / 4 skipped** (from 28) — three new specs across both desktop and phone projects: the disclosure driven by keyboard-reachable role with the collapsed copy asserted absent from the DOM, the accessible names of heading and landmark pinned with `exact`, and a 401 on the load-on-arrival raising no alert. Axe clean on every route with the panels closed and after the review's own pass. Owner suite **31/31**. Screenshots at both widths under `.runtime/shots/` (throwaway, synthetic project, gitignored). D-114 (the other warning of this class), D-137 (Cornsilk as the ground, which the panel treatment uses), D-153 (the `ch`-cap trap), D-155 (the loading half of the same restructure).

## D-157 — The pixel faces get a measured `size-adjust`, every route opens with a title, and the standing copy folds the rest of the way

- Date: 2026-08-26
- Status: **Done.** `app/globals.css`, `app/layout.tsx`, `app/site-header.tsx`, `app/ledger-note.tsx`, `app/ledger-summary.tsx`, `app/transactions-view.tsx`, the four route intros, `tests/e2e/font-picker.spec.ts`, `DESIGN.md`. No SQL, no route, no contract change.
- Context: the owner ran the deployed app in Press Start 2P and asked why that face was so much bigger than the others; he also judged the ledger headline advertising rather than naming, asked for the same pattern on every route, and found the totals block still too verbose. Supersedes **D-136** and **D-137** on the palette's documentation, and completes PLAN task 42.

### Why one face was bigger, which is a measurement and not a preference

Cap heights per 100px of font-size, measured in the real browser through `TextMetrics`: IBM Plex **70**, Press Start 2P **100**, Pixelify Sans **63**, Silkscreen **63**. **Press Start 2P draws its capitals on a full em** — most faces sit near 0.7 — so at the same CSS size every heading, button and label came out **1.43x** what the layout was designed for, while the other two came out slightly small.

**The previous answer was a symptom fix and could only ever be partial.** It stepped down individual selectors — table headers, figure cells, the eyebrow, the brand line — and reached only what somebody remembered to name. Everything else stayed 43% too big, which is exactly what the owner was looking at.

`size-adjust` fixes it at the cause: the descriptor scales glyphs against the em, so one CSS `font-size` means one visual size in every face. 70% / 111% / 111% put all three on IBM Plex's cap height. The faces are therefore declared **locally** rather than imported from Fontsource's CSS, since a descriptor can only be set on the `@font-face` rule — and under a **different family name**, because two rules with matching descriptors resolve by declaration order and CSS bundling does not promise one.

**Heights normalise; widths do not**, and pretending otherwise would have re-opened D-138. After adjustment the widest real shape measures 910 units in Press Start 2P and 958 in Silkscreen against IBM Plex Mono's 780, so the numeric columns keep a step-down — 12px where it used to be 8px, which is the size the measurement allows rather than the one that looked right. `tests/e2e/font-picker.spec.ts` re-measures every face at phone width.

### A title is not a headline

*"Every confirmed row, and nothing else."* was the owner's own example of the problem he had named a day earlier: a line written to sell the thing rather than to name it. Every route now opens with a plain noun — **Ledger, Import, Slips, Recovery** — with what stood there behind the `(i)` where it was worth keeping. Two of the four sentences were worth keeping and are: where a slip's image goes, and where a backup's password does not.

The two-column intro band went with them. It existed to hold a paragraph in its right-hand column.

**The totals block folded on the same rule** (D-156's rule, applied where it had not been): each line was a bold count followed by three or four sentences of matching rule. The count is what changes and what the owner is looking for; the rule is true, worth writing down once, and was being re-read on every visit.

### The header was the real obstacle on a phone, and the page could not fix it

D-156 recorded this and declined to act on it, because the owner's critiques were about the ledger page and the header is every route's. He then asked for it directly. At iPhone 13 width the shell ran past 600px before any page's own heading began — brand, privacy chip, typeface picker and its two-line note, two sign-in controls, the route row, the session line.

**The route row and the brand stay; everything touched about once a week folds behind one Settings control.** The wrapper is `display: contents` above 700px, so the desktop header is laid out exactly as before rather than re-derived — its children go on being flex items of the header itself. The strapline is hidden on phones because it is decoration costing a line of the first screen.

**A disclosure that hides a control the suite drives has to be opened by the suite**, and `tests/e2e/font-picker.spec.ts` now does — by checking whether the toggle is visible rather than by checking the project name, so the breakpoint stays the stylesheet's business.

### One defect written and caught in the same change

Folding the totals prose put a `LedgerNote` inside `<p className="ledger-status">`, and the note rendered a `<p>`. **A `<p>` cannot contain a `<p>`**: the browser closes the outer one where the inner begins and the rest of the line escapes the paragraph. The panel is a `<span>` now, carrying both `display: block` and `flex-basis: 100%` because it lands in two kinds of container and each ignores the other's mechanism.

### What supersedes D-136 and D-137, and what does not

**The palette itself is unchanged** — Cornsilk still the ground, Copper still the action colour, no dark scheme. What is superseded is their *documentation*: `DESIGN.md` described the cool-mist/navy palette for five days after the app stopped using it, and `check:docs --strict` could not see it because it reads structure rather than meaning. It is rewritten from `app/globals.css` rather than from memory, and it now carries the panel chrome, the type measurements and the standing-copy rule as well as the tokens.

**Panel chrome is the last of task 42's visual direction**: a doubled edge — `--frame-outer` outside the hairline, `--frame-inner` inside — on the surfaces that are genuinely panels, as `box-shadow` so nothing moves. Page furniture deliberately does not get it, because framing everything is the same mistake as explaining everything.

- Evidence: Vitest **823 passed / 7 skipped across 39 files**, unchanged — this touches no `lib/` decision. Playwright isolated **34 passed / 4 skipped** including the per-face viewport measurement at phone width and axe on every route; owner **31/31** on a re-run, after one run hit the documented `captures a slip from its QR` wasm intermittent on two adjacent slip specs. `tsc` and `pnpm exec eslint .` clean. D-136 and D-137 (the palette, superseded as documentation only), D-138 (the phone overflow this had to avoid re-opening), D-153 (the switch itself), D-156 (the rule this applies).

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


## D-159 — The combined balance is computed once in SQL, because a per-account window cannot see another account's history

- Date: 2026-08-27
- Status: **Done.** Migration `202608270022_combined_balance.sql`, `lib/transactions.ts`,
  `lib/ledger-window.ts`, `app/transactions-view.tsx`, `supabase/tests/010_combined_balance.sql` (new),
  `tests/transactions.test.ts`, `tests/ledger-window.test.ts`. Applied to the local synthetic project
  and the recovery destination; **hosted is on 021 and this has not been pushed there.**
- Context: the owner ran the deployed ledger from D-158 and sent a screenshot. Supersedes the
  **floor** that D-158 shipped hours earlier, and closes the last of that entry's open behaviour.

### What the deployment showed, which no test could have

Three things at once, and two were defects. **The first load fetched 297 rows, not 100** — paging is
per account and three accounts hold rows (about 1,259, 248 and 97), so the first load is one page
each. Correct, and three times the figure the scoping had quoted; the saving is real but nearer
170 KB against 785 KB than the 50 KB claimed. **The "Load older rows" control rendered as prose**,
because it was given no class and inherited the surrounding paragraph — the only route to the rest
of the ledger read as the last three words of a sentence. `.link-button` already existed for exactly
this. **And the all-accounts column was an em dash on every visible row.**

### The floor was correct and the wrong shape

D-158's floor suppressed the combined figure below the date where every account's balance is known,
rather than printing a plausible number that is not the ledger's. That judgement stands and would
stand again. What it could not survive is the real distribution: **the largest account sets the
floor**, its window reaches back only a hundred rows, and everything older went blank. A column that
is right and empty is better than one that is wrong, and worse than one that works.

### Why the derivation moved to SQL, and why that is not D-120's mistake

D-120 refused re-implementing the **matching rule** in PL/pgSQL, because that would be one rule in
two languages with tests for only one. This is the opposite move. The balance had a client
implementation that a page **cannot feed correctly** — the combined figure is a fact about *every*
account at a moment, and a per-account window has no way to know another account's history further
back than its own rows reach. So it now has exactly one implementation instead of one-and-a-floor,
and `combinedBalanceByTransaction` is deleted rather than left to disagree.

**The owner's reason is the better one and is why it is a helper rather than an inlined query.**
PLAN task 44 wants this number too: the combined balance over time is the series any balance chart
is drawn from. `private.combined_balances(uuid)` is callable by whatever task 44 becomes, which is
the same argument D-158 made for one candidate query serving two callers.

### The identity, which is what makes it one pass rather than a lateral join

An account's balance at a row is its opening plus everything it has moved since, so summed over
accounts the combined balance is `sum(openings) + running total of every account's movement`. That
is a window function over one ordering, not a per-row subquery over every account.

**`delta` is the difference between printed balances, not the row's own movement**, and the
distinction is load-bearing rather than stylistic. They agree whenever a statement chain is intact.
They differ across a gap between two separately imported statements — and there the printed balance
is the truth while a movement sum would drift from it silently. The client's walk read printed
balances for that reason and this keeps the property. `010_combined_balance.sql` asserts it by
writing a gap directly, since no import path produces one on purpose.

**The ordering had to match `compareTransactions` reversed exactly**, which is `source_date asc,
source_time asc nulls first, id DESC`. The id direction is the one to get wrong: it does not flip in
the display sort, so negating the first two clauses and keeping the third gives a different sequence
at every tie — and untimed rows sharing a date are ordinary here.

### Exact money

Every term is a `bigint` of minor units and nothing divides. `sum(...) over (...)` over `bigint`
returns `numeric`, so the running total is cast back explicitly; an implicit numeric leaking into a
money path is the habit this app does not have, and pgTAP caught the same thing in the test's own
cross-check before it caught anything else.

### What moved rather than being lost

The client's combined-balance suite moved to `supabase/tests/010_combined_balance.sql` with the
derivation: an account seeded from its own opening, the answer being independent of the order rows
arrive in, an account with no rows contributing nothing — plus the case the client could never
satisfy, two accounts of unequal window depth. **That case is the defect written down**: the client
printed 110000 against an early row where the truth was 10000, because the shallow account's later
balance leaked backwards.

- Evidence: Vitest **830 passed / 7 skipped across 40 files** (from 845/7/40 — nine client
  balance assertions moved into pgTAP and are not lost, plus the slip-exclusion test whose subject
  no longer exists). pgTAP **312 across 10 files** (from 299 across 9) with migrations 001–**022**,
  13 of them the new suite. Playwright owner **32/32**, isolated **34 passed / 4 skipped**, portable
  recovery re-run against a destination rebuilt on 022. Production build clean at **twenty-two**
  `/api/v1/` routes, unchanged. `tsc`, `pnpm exec eslint .` and `check:docs --strict` clean. Backup
  contract **unchanged at v7** — no table, no column. D-120 (the two-engines refusal, and why this is
  not it), D-158 (superseded on the floor), and PLAN task 44, which is the reason this is reusable.

## D-160 — Statistics compute in SQL, and division never produces money: a ratio is not a figure the ledger keeps

- Date: 2026-08-27
- Status: **Scoped and settled. Nothing is built and nothing is measured.** The owner answered all
  three open questions on 2026-08-27, before this entry was ever committed, so the answers are
  recorded here rather than in a superseding entry. `PLAN.md` task 44 carries the full scoping;
  this entry records the rules it settled, because both outlive the task's text — a PLAN entry
  gets rewritten and this file does not.
- Context: the owner asked for task 44 to be scoped rather than built, on the reasoning that D-158
  and D-159 both went better because their questions were answered before their SQL was written.
  Three questions were open. Two are answered by precedent this repository already set; the third is
  a policy this app has never needed, because until now nothing in it divided.

### The category breakdown is not this task's, and saying so early is the point

The page everyone pictures is spend by category, and **the ledger has no categories**: the columns
and both routes have existed since migration 001, and live holds **1 category against 1,465
transactions**. A chart drawn over that is *a figure that is right and empty* — D-158's all-accounts
column again, caught this time in a scoping document instead of in a screenshot of production. The
breakdown belongs to task 25, and task 44 is shaped so it arrives later as one more grouping key.

What is populated on every confirmed row today is time, account, direction, and the bank's own
`transaction_label`. `cash_entries` is the only population in this ledger that is categorised at all,
because it takes `category_id` and `counterparty` at capture.

### Statistics compute in PostgreSQL, and this is D-159's line rather than D-120's

A statistic is whole-ledger by definition and **the client no longer holds the whole ledger** — it
holds a page (D-158). Computing on the device means fetching everything again, which is precisely
the payload task 45 removed. D-159 already decided this shape for the same reason and built
`private.combined_balances(uuid)` as a reusable helper *for this task*.

**It is not the two-engines mistake D-120 refused**, and the distinction is the one D-159 drew:
D-120 protects a *rule that judges a specific row*, carrying ~85 tested cases, from being written a
second time in a language with no tests for it. An aggregate judges nothing — it sums. The shape
follows `list_account_transactions_page`: `security definer`, pinned `search_path`, gated on
`private.has_strong_owner_access`, returning an empty shape rather than raising, revoked from
`public` and `anon`, granted to `authenticated`, with the private helper still granted to nobody.
**SQL computes and the client formats**; money crosses the wire as canonical minor-unit strings.

### Division never produces money

This is the new rule. Every average, share and trend is a division, and money in this app is a
signed 64-bit integer of minor units (D-002) that has never been divided by anything.

**A ratio is not money.** Three tiers follow from that:

1. **Totals, nets and subtotals do not divide at all.** Sums of `bigint`, exactly as the shipped
   totals strip does. They are money and stay money.
2. **A share travels as its numerator and its denominator**, two exact minor-unit strings, and
   becomes a percentage in the presentation layer for display only. **A percentage is a label**:
   nothing is derived from one and none is stored. Two consequences are accepted rather than papered
   over — shares printed to one decimal **will not sum to exactly 100.0**, and the remedy is to show
   the exact parts beside them rather than fudge the last slice; and **a zero denominator is
   undefined, not zero**, so a period with no spending prints an absence.
3. **An average of money is money**, which is why it is the trap. Two forms are permitted and no
   third: **integer division that keeps its remainder** — `sum / n` with `sum % n`, so
   `quotient * n + remainder = sum` holds exactly — or **no average at all**. Twelve exact monthly
   totals answer the question better than one average of them, and a chart reads them better than a
   number does. **Prefer the series to the average.**

**The specific way this will be got wrong: `avg()` over `bigint` returns `numeric`, and so does
`sum() over ()`.** D-159 already had to cast one back explicitly. The first person who writes the
obvious `avg(amount_minor)` puts a `numeric` into a money path with nothing complaining, so **the
return types become a contract asserted in pgTAP** — every money column declared `bigint` or `text`,
with a test that fails by name the moment a `numeric` or a `double precision` appears there. A rule
that is only written down is a rule that is only remembered.

### Two findings that are decisions, not details

**`include_in_reporting` exists and nothing has ever read it.** The column is on
`transaction_overlays` from migration 001, `mutate_overlay` writes it,
`PUT /api/v1/transactions/[id]/overlay` accepts it, and both `lib/backup-contract.ts` and
`lib/transactions.ts` carry it — and **no query in this repository filters on it**. Task 44 would be
its first consumer. If the statistics page honours the flag and the ledger's totals strip does not,
two totals over one ledger disagree on one screen and both are right. Either both honour it or the
flag is retired.

**Slips and cards must never be summed.** A paired slip *is* the statement row (D-063), so summing
`source_components` counts each payment exactly once; adding slips would double it. An unmatched slip
is money that moved with no statement row yet, and the honest treatment is to report how many there
are beside the totals rather than fold their amounts in. **`cash_entries` is out of v1 by the owner's
decision** — cash is real money that no statement carries, and **the balance series could not include
it in any case**, a cash entry having no `post_balance_minor` and never having entered a printed
balance chain.

### What the owner settled, the same day and before this entry was committed

All three questions were answered on 2026-08-27, so this entry records answers rather than leaving
them open. **Cash is out of v1**: `cash_entries` is not read, and the page says on its face that its
figures are about statement rows alone rather than letting a total quietly stand for all spending.
**`include_in_reporting` is honoured, and the ledger's totals strip is retrofitted in the same
change** — the alternative was retiring the flag, and the reason to keep it arrived with the figures
the owner asked for, below. **The figures are monthly incoming, spending and net as a series; average
incoming and spending per day and per week; daily closing balance; the largest transactions in the
window; and a per-month transaction count.** The owner also asked for charts, so the page is
chart-led: a **line of balance over time** and **paired bars of incoming against spending per month**,
with the averages as stat tiles and the largest transactions as a table.

**Internal transfers are why the flag survives.** Money moved between the owner's own accounts leaves
one as a withdrawal and arrives at the other as a deposit, and both are real statement rows. Summed
naively, **incoming and spending are each inflated while net stays correct** — so the two figures the
owner actually asked for are precisely the two the flag protects. Honouring it is one predicate.
**What is missing is a way to set it**: nothing in the app toggles it, so it defaults `true`
everywhere and the filter is inert until a control exists, which is the smallest piece of follow-on
work this task creates. Detecting transfers automatically is a matching rule and belongs beside
task 25.

**The denominator is the decision inside an average**, and getting it wrong is undetectable from the
figure alone. *Average daily spending* over **calendar days elapsed** is a burn rate; over **days that
had a transaction** it answers how big a busy day is. **Calendar days elapsed is the answer.** Two
boundaries follow: **the current period is partial**, so dividing this month by 31 on the 10th
understates it threefold and the current period must divide by days elapsed so far; and **the first
period is partial too**, because the history starts where the first import starts. And **an average of
an average is not an average** — `avg_week` is the total over its weeks, never `avg_day × 7`, because
the partial weeks at either end make those different numbers.

**The chart wants daily closing balance, not the per-transaction series.** `private.combined_balances`
returns one row per transaction — 1,604 of them — where a chart draws at most one point per day.
A `distinct on` over the existing helper narrows it: no new derivation, no division, and a payload
sized by the history's length rather than its row count.

**The strict CSP rules out a charting library from a CDN**, and `lib/security-headers.ts` states that
widening the policy is never the remedy. Either an installed dependency bundled by Next, or **inline
SVG drawn by the app** — the recommendation, on a dozen monthly pairs and a few hundred daily points,
because it adds no dependency, inherits the palette and both themes, and raises no CSP question.

**Task 44 goes before task 25.** Nothing on this page needs a category: it is one function, one route,
one page, where task 25 is a migration, a provenance table, a backup-contract version and a
measurement of a model against a rules baseline. Building 44 first also gives 25 somewhere to land,
where the reverse order categorises 1,465 rows with nothing able to show what it bought.

- Evidence: scoping only — no code, no migration, no measurement. Read from source:
  `supabase/migrations/202607240001_foundation.sql` (the overlay columns and `include_in_reporting`),
  `202608090013_cash_entries_and_corrections.sql` (`cash_entries` carries `category_id`),
  `202608270022_combined_balance.sql` (`private.combined_balances`, and the explicit `::bigint` cast),
  `lib/money.ts`, `lib/transactions.ts`. Related: D-002 (canonical integer money), D-063 (a paired
  slip is the statement row), D-120 (the two-engines refusal, and why this is not it), D-155, D-158,
  D-159, and PLAN tasks 25, 44 and 45.

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
