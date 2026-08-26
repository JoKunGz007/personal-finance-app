# Private Ledger decision log

Last reviewed: 2026-08-09

Entries are append-only. A superseding decision must reference the earlier entry rather than rewriting its history.

This file carries **D-141 onward**. Six settled ranges were relocated unchanged, not rewritten: **D-001 … D-059** to [`docs/decisions/ARCHIVE-D-001-D-059.md`](docs/decisions/ARCHIVE-D-001-D-059.md) on 2026-08-09, **D-060 … D-113** to [`docs/decisions/ARCHIVE-D-060-D-113.md`](docs/decisions/ARCHIVE-D-060-D-113.md) on 2026-08-18, **D-114 … D-119** to [`docs/decisions/ARCHIVE-D-114-D-119.md`](docs/decisions/ARCHIVE-D-114-D-119.md) on 2026-08-19, **D-120 … D-129** to [`docs/decisions/ARCHIVE-D-120-D-129.md`](docs/decisions/ARCHIVE-D-120-D-129.md) on 2026-08-23, **D-130 … D-133** to [`docs/decisions/ARCHIVE-D-130-D-133.md`](docs/decisions/ARCHIVE-D-130-D-133.md) on 2026-08-24, and **D-134 … D-140** to [`docs/decisions/ARCHIVE-D-134-D-140.md`](docs/decisions/ARCHIVE-D-134-D-140.md) on 2026-08-25. The index below covers all seven files, so a reader can find any entry without opening any body.

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
- **D-142** — The bulk slip form threw away work it had already done, and could not be told to try again
- **D-143** — A third button rank, because "quiet" had been spelled as "unstyled"
- **D-144** — Auto-import v1 is a local fetcher, and binding becomes automatic where the account is unambiguous
- **D-145** — The hosted Sync button proxies ciphertext, and it is a caller of the mail seam rather than a second one
- **D-146** — The fifth archive boundary is shallow on purpose, because two open questions sit immediately behind it
- **D-147** — Binding announces itself where the owner is looking, because the scroll fix was keyed on a stage auto-binding skips
- **D-148** — The client tier gets its first seam, because every route call had been open-coding the same five steps and had already diverged
- **D-149** — The owner closed the two questions the fifth boundary was stuck behind, so the traps split and the sixth boundary went seven entries deep
- **D-150** — The announce-and-scroll becomes one module and the worklist becomes one value, so two classes of defect stop being representable

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

## D-142 — The bulk slip form threw away work it had already done, and could not be told to try again

- Date: 2026-08-23
- Status: **Accepted and done.** `lib/slip-batch.ts`, `app/slip-batch.tsx`, `tests/slip-batch.test.ts` (+6), `tests/privacy.test.ts` (one guard rewritten). **No SQL, no route, no contract change** — eighteen `/api/v1/` routes, every project on 020, backup contract v7.
- Context: `/code-review` run against the two files `7be667e` added, discharging the debt D-125 records. Eight findings, four medium. The form had shipped and been in production since 2026-08-21.

### The one theme, and it is not the one the findings were filed under

**Four of the eight were the same defect wearing different clothes: a failure path that discards information rather than showing it, on a form whose failures cost money.** Bulk slip upload caps at fifty files precisely because every slip is a billed Cloud Vision read (D-135) — and every recovery path it offered was "discard the batch and read all fifty again".

- A transient reader 503 or a momentary `createImageBitmap` failure left rows in `review`/`failed`, and `readAll` processed only `queued` rows. No `queued` rows remained, so the button was permanently disabled.
- A network error on the capture POST set `refused`, which `rowIsSubmittable` excluded forever.
- An unparsable 201 body fell to the outer `catch` and marked the row `refused` — **reporting as rejected a slip `capture_slip` had already written**, with no retry to reveal the truth and a summary line that under-reported the ledger.
- And the sharpest: **when the reader was unreachable, `classifySlip` returned before `resolveSlipDate` ever ran.** But `slipDateFromReference` reads the date out of the QR's CRC-covered reference and never touches a recognised word (D-059). For SCB and the longer Krungthai variant the app **already held the exact date** and discarded it, making the owner hand-type across a whole batch the one value this module's own docstring calls unable to pair and unable to self-correct.

### What changed

`SlipBatchDecision`'s review branch now carries `date` and `amountMinor`, either of which may be null. **Neither field relaxes a rule** — each is the same value the ready path would have carried, so a pre-filled row is still a row the owner is looking at. The disagreement refusal (D-059) still pre-fills nothing: carrying either reading would quietly pick a winner, which is the decision this module declines to make.

`readAll` claims `phase` **before** awaiting `resolveDetector()` and wraps the loop in `try/finally`. The await downloads ~1.1 MB of WebAssembly on any browser without a native `BarcodeDetector` (D-057); throughout that window every control was live, so a second press started a concurrent loop over the same snapshot and **sent every image to the metered reader twice**. `app/slip-capture.tsx` had always set its flag before the identical await. The `finally` closes the other half: a throw anywhere in the loop used to leave the phase at `reading` for good, disabling Discard along with everything else.

`readAll` also reprocesses `failed` rows and `rowIsSubmittable` accepts `refused`. **Re-sending is safe by construction** — `capture_slip` writes nothing for a slip already in the ledger (migration 011), which is the same property that makes the whole batch re-runnable.

`signedSlipAmount` returns `null` instead of `?? 0n`. It had been answering `"0"` for a non-canonical input — a request that looks well-formed, renders as ฿0.00 on the row, and is refused by `slipCaptureSchema`'s sign cross-check at the far end. **The docstring one line above claimed the caller refused it; the database was doing the refusing.** Now the claim is true.

`dateWindow` is recomputed when a pass starts rather than pinned at mount, so a tab left open across midnight stops refusing a slip dated today.

### A privacy guard had to be loosened, and the reasoning is the point

`tests/privacy.test.ts` pinned `plainThb` to **exactly one** call site. Pre-filling a review row is a second, and both take `verdict.amountMinor`. **The count was never the invariant — the source is**: no machine-read digit may reach a stored value except through the strict grammar. The guard now asserts the set of *distinct arguments* is `["verdict.amountMinor"]` and that at least one fill exists. Pinning the count would have blocked a legitimate second fill while proving nothing extra; asserting the source catches the thing the guard exists for, including a fill site added later.

### Consequences

**Two findings were deliberately not actioned**, both naming `eslint.config.mjs` and `playwright.config.ts` — the owner's deliberately local-only files, never committed. One of the two (`webServer.timeout` absent for a cold `pnpm build && pnpm start`) is already recorded in `HANDOFF.md` § Live hazards.

**A review of shipped code found more than a review of new code did**, and cheaply: eight findings against `7be667e`'s two files versus five against the same day's new work. D-125 exists because five commits shipped in one day without a review; this is the evidence for what that costs.

- Evidence: `lib/slip-batch.ts`, `app/slip-batch.tsx`, `tests/slip-batch.test.ts`, `tests/privacy.test.ts`. Vitest **643 passed / 7 skipped across 32 files** (up 6, all in `tests/slip-batch.test.ts` covering the partial-verdict and refusal behaviour); Playwright owner **31/31** and isolated **18/18**; production build clean at **eighteen** `/api/v1/` routes; tsc and ESLint clean; `.runtime/worklist-phone-audit.spec.ts` still passes both worklists. **pgTAP was not re-run and that is deliberate** — it stands at 266 across 8 from earlier the same day and nothing here moves SQL. D-135 (the form this reviews), D-125 (the review debt this discharges), D-059 (the QR reference's date), D-057 (the WASM fallback behind the await), D-129 (the strict-grammar rule the guard protects).

## D-143 — A third button rank, because "quiet" had been spelled as "unstyled"

- Date: 2026-08-23
- Status: **Accepted and done.** `app/globals.css` (one new rank, one outlier corrected), `app/slip-batch.tsx` and `app/slip-capture.tsx` (three buttons given the class). Styling only — no logic, no SQL, no route, no contract.

### What was actually there

The phone audit reported two undersized tap targets in the bulk slip worklist: a button at 24px tall and an input at 42px. **They looked like one finding and were two different things.**

The **input** was a plain outlier. Every other control in the stylesheet sits at 47px — `.owner-access-panel input`, `.password-control input`, `.account-control select`, `.slip-fields input`, `.batch-direction select`, and the `min-height` shared by all three button ranks. `.batch-fix input` alone was 42. Nothing was being expressed by that; it read as deliberate and was not.

The **button** was a real position badly executed. Three buttons in the app carried no class at all — `Discard` in `app/slip-batch.tsx`, `Discard` in `app/slip-capture.tsx`, and the amount finder's control. Two of them being the same word in two different forms is a *choice*: a destructive action kept out of the way beside the loud `secondary-button` next to it. **The choice was right and the execution was a browser default**, which is 24px tall and not hittable on a phone.

So promoting them to `secondary-button` would have been the wrong fix — it makes discarding a batch as prominent as reading one.

### The decision

`.tertiary-button`: no border, no fill, muted until hovered — the quietness kept — with `min-height: 47px` so the hit area matches the controls beside it and a row of buttons lines up instead of one sitting short. `min-height` rather than `height`, so a wrapped label grows the button rather than spilling out of it.

Applied to all three bare buttons. **The amount finder's is a different kind of action from a discard** and got the class anyway: it was equally unstyled, it should stay equally quiet, and leaving one bare button behind would recreate the inconsistency this closes.

### Consequences

**The 44px threshold is the audit's, not the repo's, and still nothing in the gate enforces it.** PLAN task 28 remains unscoped and no standard has been agreed; this change aligns the stylesheet with itself rather than adopting a rule. The two existing phone-width raises — `.site-nav a` and `.capture-result .secondary-button` — stay where they are, inside the mobile block, because both are compact by intent on a desktop where a pointer does the aiming. This rank is 47px at every width instead, because it is aligning with siblings that are.

- Evidence: `app/globals.css`, `app/slip-batch.tsx`, `app/slip-capture.tsx`. `.runtime/worklist-phone-audit.spec.ts` now reports **tap targets: all >= 44px** on both worklists, where the slip one previously reported two under. Vitest **643 passed / 7 skipped across 32 files**, Playwright isolated **18/18** — its axe checks are what hold this stylesheet to AA and they cover the changed rules — owner **31/31**, production build clean at eighteen `/api/v1/` routes, tsc and ESLint clean. D-136 and D-137 (the palette these vars carry), D-138 (the phone-width work this belongs to), D-142 (the review that produced the measurement).

## D-144 — Auto-import v1 is a local fetcher, and binding becomes automatic where the account is unambiguous

- Date: 2026-08-23
- Status: **Accepted and built**, both halves on the owner's decision. **Supersedes D-017** on the binding question; everything else D-017 said still holds.
- What changed: `lib/server/statement-mailbox.ts`, `scripts/fetch-statements.mjs`, `tests/statement-mailbox.test.ts` (23) for the fetcher; `app/import-bench.tsx`, `app/statement-batch.tsx`, `app/globals.css`, `tests/privacy.test.ts` for the binding and the two pieces of import feedback. **No SQL, no route, no contract change** — eighteen `/api/v1/` routes, every project on 020, backup contract v7. One new **devDependency**, `imapflow`, which nothing in the app bundle imports.

### The mailbox half, and why the design got cheaper rather than dearer

D-141 recommended a hosted "Sync" button: a route fetching the encrypted attachment and streaming it to the browser to decrypt. **That was right when the import queue did not exist and wrong once it did.** With bulk statement import shipped, a local script that drops files in a folder reaches the same place with **no route, no server-side credential, no CSP question and no security review** — and it is strictly more private, because the app password never leaves the machine and the PDFs never touch a server.

So v1 is `scripts/fetch-statements.mjs`. The IMAP work lives in `lib/server/statement-mailbox.ts` **so that the hosted button, if it is ever wanted, is a second caller of that module rather than a second implementation of the protocol** — the same seam as `lib/slip-batch.ts` against its form.

**The app password is read from stdin only**, never an argument, a file or an environment variable. That is D-035's rule for document passwords applied to a merely-rotatable credential, because the habit is what protects the stronger secret. Input is masked with a star per character: hiding it entirely gave no way to tell a failed paste from a wrong password, and the length is not the secret. Raw mode rather than `readline` — muting readline breaks its line editing, and a paste then renders wrongly, which looks like the paste failing.

**Retention: the mail is left untouched.** The owner's reasoning, and it is better than the concern it answers: the files already live in his main mail, so the second mailbox duplicates an archive rather than creating one.

**Two things the first real fetch taught us.** A statement mail carries **more than one PDF** — one bank sent two months in a single message, another sent a statement beside an unrelated document — so the fetcher takes every PDF and decides nothing about which is which. And the Gmail *filter* that forwards them needs `OR` rather than a comma-separated `from:` list; the comma form works in the search box and silently does not in a filter. The IMAP grammar has the same trap in different syntax, which is why `senderSearch` nests `or` two arguments at a time.

### Binding: what D-017 said, and what is left of it

**D-017 held that account binding is a checked user decision, not a parser inference.** The owner asked for it to be automatic. It now is, by default, with a switch in the batch section.

**The argument for relaxing it is that the match is a lookup, not a guess.** `public.accounts` is unique on `(owner_id, bank_code, last_four)`, so a statement's printed bank code and last four digits identify **at most one** account. `soleMatchingAccount` binds only when exactly one matches and returns null otherwise — an ambiguous match is refused rather than resolved, and a partial one yields nothing rather than a best effort.

**What is not relaxed is the part that mattered.** Auto-binding removes the dropdown, not the owner: `assembleImportPayload` still re-checks bank, suffix and currency and still refuses a mismatch; the review table still shows every balance; and confirming is still an explicit act. **That last one is load-bearing** — `out-of-order-run` says rows were reordered to make the balance close (D-055), and nothing but the review surfaces it. A refused automatic bind lands on the chooser rather than the review, so the refusal appears beside the control that can answer it.

### The guard that was supposed to prevent this, and did not

`tests/privacy.test.ts` carried a test named "never infers which ledger account a statement belongs to". **It passed after auto-binding was added.** It asserted `not.toMatch(/find\([^)]*accountLastFour/)` — a *spelling* — and the new code uses `.filter(...)`. The guard written to stop precisely this change never noticed it.

That is the source-grep trap `GOTCHAS.md` already records, hit by the test meant to enforce a rule. It is now rewritten to assert the behaviour: the match is exact on **both** halves of the identity, `matches.length === 1` is required, no fuzzy matching exists anywhere in the file, and **no binding path reaches the confirmation**. A `section()` helper slices a function by name instead of matching a phrasing, and every assertion first checks its own marker so it cannot pass vacuously.

### Import feedback, on the owner's report from using it

**Pressing "Bind & review" appeared to do nothing**, because it changed a section far above the fold. It now scrolls the chooser into view. **Confirming left its sentence at the bottom of the single-import section**, several screens from the list being worked — so a confirmation banner now appears in the batch section, naming the file, the rows, the account and the batch, then takes focus. That is D-139's finding in a second place: a one-time answer belongs where the question was asked.

**Three defects were found only in a browser, and all three would have passed a source review.** The scroll anchor used `.capture-result-anchor`, which carries `:empty { display: none }` and is therefore invisible when always-empty, so `scrollIntoView` did nothing. Then the check for it was wrong twice: first accepting anything inside the viewport, and passing while the chooser sat at y=635 of 664; then tightening the bound but measuring before the animation finished, and failing a scroll that worked. `scroll-behavior: smooth` means any such assertion must poll.

**And the audit caught a regression within minutes of the fix that produced it**: the new checkbox measured 20x20. It is 24 now, and the audit learned that a control wrapped in its own label is hit by tapping the label — the measurement had been aimed at the wrong element.

- Evidence: the files above. Vitest **666 passed / 7 skipped across 33 files** (up 23, all `tests/statement-mailbox.test.ts`), Playwright owner **31/31** and isolated **18/18**, production build clean at **eighteen** `/api/v1/` routes, tsc and ESLint clean. `.runtime/worklist-phone-audit.spec.ts` is **4 tests** now and covers the bind scroll and the auto-bind path end to end, asserting `import_batches` stays at zero — the browser proof that binding does not confirm. **pgTAP not re-run and deliberately so**: nothing here moves SQL. **The fetcher was run against the real mailbox**: 3 messages, 5 PDFs, and all four statements imported by the owner. D-141 (the design this completes and revises), D-017 (superseded on binding), D-035 (the stdin rule), D-055 (why confirming stays manual), D-139 (the banner precedent), D-138 (why a browser check).

## D-145 — The hosted Sync button proxies ciphertext, and it is a caller of the mail seam rather than a second one

- Date: 2026-08-23
- Status: **Built, uncommitted, and not deployed — and it cannot work until the owner puts a credential into Vercel, which is a gate that has not been asked for.** `lib/statement-sync.ts` (policy), `lib/server/statement-mailbox-session.ts` (the server-side caller), `app/api/v1/imports/mailbox/route.ts` and `app/api/v1/imports/mailbox/attachment/route.ts` (the two routes), `app/statement-sync.tsx` (the button), plus `app/statement-batch.tsx`, `app/globals.css`, `tests/statement-sync.test.ts` (29) and `tests/privacy.test.ts` (two guards added, one comment corrected). **No SQL and no contract change**; every project stays on migration 020 and the backup contract stays at **v7**. **Two new routes**: the build emits **twenty** `/api/v1/` routes where it emitted eighteen.
- Context: PLAN task 41, asked for by the owner on 2026-08-23 immediately after auto-import v1 landed (D-144). **The design was settled in D-141 and was not re-derived**: the server proxies the still-encrypted bytes and the browser decrypts them.

### What was already decided, and what this had to decide

D-141 chose the shape and rejected the two alternatives for reasons that have not changed. **Server-side decrypt** would put a secret derived from the owner's citizen ID onto a third party's infrastructure and would end statements being the only path in this app that reads entirely on the device (D-128, D-129). **A browser calling Gmail directly** would need `connect-src` widened past `'self'` and the Supabase origin, and the CSP is not weakened to make a feature work (D-058). Proxying ciphertext needs neither: what crosses is a file the bank locked and this app cannot open, and it was already sitting on Google's servers before it moved.

**`lib/server/statement-mailbox.ts` is reused byte-for-byte unchanged**, which is what its own header said it existed for. This adds a *caller*. The IMAP session handling that both callers need — sign in, take the INBOX lock, release once — is a new sibling rather than an edit to the seam, so `scripts/fetch-statements.mjs` is untouched too.

**Task 41 left two questions open and both are answered here.**

**One: the route lists first and fetches on demand.** Fetching everything in one call would hold every attachment in one server process and return them in one response body — a memory bound nobody set, and a response size the hosting platform caps independently of anything in this repository, which would surface as a truncated PDF rather than an error. Listing first keeps the server holding one attachment at a time and makes a failure specific: one statement that will not download is one row saying so. The cost is one IMAP session per request rather than one per sync, which is seconds on a button pressed by hand. **The page still spends both calls on one press**, because what the owner asked for was a Sync button and the split is the server's concern.

**Two: it never claims a statement is already present, and that is a refusal rather than an omission.** The local fetcher skips by filename because it owns the directory it writes to; a route has no folder. The alternative was inventing server-side state to hold a watermark — a new persisted thing, for a button pressed by hand. The import worklist already blocks a repeat on the PDF's own SHA-256 (D-141), which is a stronger check than a filename and happens where the bytes actually are. A weaker check that *sounded* authoritative would be worse than none.

### The credential, and why it is a different risk class from the one the rules were written about

**The app password moves from stdin to an environment variable, and that is a real change that the design accepts rather than hides.** D-035's rule — passwords from stdin only, never a file, an argument or an environment — was written about *document* passwords, which derive from the owner's date of birth and citizen ID and are therefore identity-grade and non-rotatable. The mailbox app password is rotatable from a Google account page and scoped to reading one mailbox that receives nothing but bank mail. A route cannot prompt anybody, so a hosted deployment necessarily holds it.

**The document password never comes near any of this.** It is not a parameter of either route, is not held by the deployment, and no path there could use it. `app/statement-sync.tsx` takes two props and neither is one; it has no such state and renders no field that could collect one. The PDFs move locked and are opened by pdf.js on the device, exactly as before.

**Three environment variables, and the routes fail closed and say which is missing**: `STATEMENT_MAILBOX_USER`, `STATEMENT_MAILBOX_SENDERS` and `STATEMENT_MAILBOX_APP_PASSWORD`. Absent, both routes answer **503** with a sentence naming the unset variables and pointing at local files — the same shape `strongOwnerClient()` uses for an unconfigured Supabase, because "not set up" and "broken" want different words. `statement-mailbox.json` is gitignored and therefore does not exist in a deployment, so the configuration comes from the environment instead. **The variable names are not in `.env.example`**, which is inside the never-read boundary and is the owner's to edit.

### Two checks on the pair the browser names, and the second is the load-bearing one

`uid` and `part` arrive from the page, so they are **client input into a mail server query**. `lib/statement-sync.ts` refuses anything that is not a positive integer and a dotted-digit part path — a part path is a selector, not a value with a safe encoding, so an unexpected one is refused rather than escaped.

**That is not sufficient on its own, and assuming it was would have been the defect.** A *well-formed* pair still names an arbitrary part of an arbitrary message. So the mailbox is asked a second question before anything is downloaded: is this uid in the set matching the configured senders, and is this part one of its PDF attachments? Either no is a **404**, and deliberately the same 404 for "no such message", "not from a configured sender" and "not a PDF part" — distinguishing them would let the shape of the mailbox be mapped one request at a time. Without that check, an owner-gated download route would also be a way to read any mail in the mailbox, which is more than this feature needs and therefore more than it should have.

Both routes take `strongOwnerClient()` — aal2 plus a verified TOTP factor, matching `private.has_strong_owner_access` (D-093). **Reading the owner's bank mail is not a lesser act than reading his ledger.** Both pin `runtime = "nodejs"`, because a TLS socket cannot be opened from the edge runtime and a silent fallback would fail at request time rather than at build time. Neither logs, and `imapflow`'s own logger is off: the library prints subjects and addresses at info level, and a hosting platform retains stdout.

### The guard that changed meaning, and why it is said out loud

`tests/privacy.test.ts` asserted that `app/statement-batch.tsx` and `lib/statement-batch.ts` **construct no request of any kind**. That assertion still passes — and it would have gone on passing while meaning less, which is precisely the trap D-144 was written about one file along.

**So the fetching lives in a separate component on purpose.** `app/statement-sync.tsx` talks to the server and hands `File` objects across; the batch still fetches nothing. The old guard's comment now states what it still means (the bytes, the password and the parse never leave the device) and what it no longer means on its own (that nothing in the import section talks to a server), and a second guard covers the new file: two GETs and no third, both built from a named constant or from `attachmentPath`, no absolute URL anywhere, no request body of any kind, no storage API, and no worker, digest or reader.

**One of those assertions was written as a word-grep and was wrong the way word-greps are.** It forbade `password` anywhere in `app/statement-sync.tsx` — and the component *tells* the owner to "type the document password" into the form below, which is the correct instruction. Asserting the shapes that would actually carry a secret (a prop, a state, a `type="password"` field) is what the grep was standing in for, so that is what it asserts now. The same correction applies to the routes: they say "check that the app password is current" in a message the owner needs when the mailbox credential expires, and that is the rotatable one.

### The dependency moved, and it had to

**`imapflow` was a devDependency and shipped server code now imports it.** It is a runtime dependency and is declared as one; the lockfile moved three lines and nothing else. Confirmed from the build artifact rather than from the file: `imapflow` and `imap.gmail.com` appear in **one server chunk and zero client chunks**.

### What is proved in a browser, and what is not

**`.runtime/mailbox-sync.spec.ts` is 4 tests** (throwaway, gitignored) and exists because the sharpest lesson of this day was that three defects were visible only in a browser and would each have passed a source review. It proves, at 390px behind a real sign-in:

- **The unconfigured path, through the real route.** This machine has no mailbox credential and must not have one, so pressing the button actually runs `strongOwnerClient()` and `mailboxConfig()` and returns a 503 — and the owner sees a sentence naming the unset variable, with the button enabled again rather than left dead.
- **The download path**, with both routes intercepted and synthetic bytes served: a manifest becomes `File` objects, they land in the batch, they are marked as ones he did not choose, the pdf.js worker opens them, binding reaches the review — and `import_batches` is asserted to stay at zero.
- **A failed download is one line, not a failed sync.** The one that arrived still reaches the batch. That is the "failure path that discards work" shape D-142 was about.
- **The band is clean at 390px** with every tap target at 44px or more.

**What is not proved is the mailbox.** No IMAP connection was made by anything this session; the route has never spoken to a real server, and it cannot until the credential is in Vercel. The seam it calls *is* proven against the real mailbox, by the fetcher, on 2026-08-23 (D-144).

### Two smaller decisions, recorded because they change shipped behaviour

**Choosing local files now adds to the batch instead of replacing it.** It replaced the batch before, which was harmless while the chooser was the only way in and stopped being harmless the moment a sync could fill the list — one local PDF chosen afterwards would have silently discarded everything downloaded. "Clear this batch" is now the only way to start over. The entry id became a monotonic counter for the same reason: `${index}-${name}` is unique within one selection and is not unique across two arrivals, and a duplicate React key makes two rows render as one.

**A synced row says "from the mailbox".** It matters most on the blocked list: a local file that will not open is one the owner picked, and a mailbox one is a bank attaching something that is not a statement — which is a thing the owner's real banks do (D-144).

### What `/code-review` found, run before asking to commit (D-125)

Eleven findings. **Ten were real and are fixed; one was declined.** The agent died once on a session limit before reading the diff and was re-run — a failed review is not a passed one, and the second run is the one that counts.

**Two were serious, and both are the same mistake: a limit applied after the cost instead of before it.**

1. **A batch of unread files could not be cleared, and there was no other way out.** Making selection additive (below) removed the old escape — re-choosing used to replace the batch — and "Clear this batch" was rendered only when `plan` had rows. `plan` is built solely from files that have been through the worker, so a sync that queued forty unwanted PDFs left **no** Clear button, a cap refusing every further add, and a chooser that could only append. A page reload was the only recovery. It is now shown whenever the batch holds anything, reading "*n* waiting to be unlocked" before any parse. **The lesson is that a change which removes a recovery path owes a replacement in the same commit**, and this one silently did not.

2. **The route walked every matching message before applying its own cap.** `findAttachments` issued one `fetchOne` per UID and `buildManifest` capped afterwards — while the page offers "everything the senders ever sent". On a mailbox holding years of bank mail that is thousands of sequential IMAP round trips inside one request, ending as a gateway timeout with no sentence in it: **exactly the failure the bounded socket timeouts were added to prevent, reached by a different road.** The loop now stops at `MAX_SYNC_ATTACHMENTS`, and because it stops it can no longer count what it did not look at — so `omitted: number` became `truncated: boolean`, which says *there is more* without inventing a figure. Counting would have been the scan the cap exists to avoid.

**Three more were the same shape in the browser.** The sync capped its manifest against an *empty* batch, so with thirty-five files already queued it downloaded forty and discarded thirty-five **after** paying for them over the network — the opposite of the reason the cap was documented to exist. It now receives the remaining room and trims before downloading. It also announced what it had downloaded rather than what was accepted, putting "40 added" beside the batch's own correct "5 added, and 35 left out" — two contradictory sentences with the false one nearer the button; `onFetched` now returns the accepted count. And `room` was computed from a render-time `files.length` captured at click time, so choosing local files during a long sync could leave a batch capped at forty holding seventy; it reads a ref written in the same handler that queues the files, and the chooser is held while a sync runs.

**One was a defect in a route that no test would have reached.** `Content-Disposition` interpolated the attachment's name directly. `safeFileName` preserves non-ASCII — correctly, since it names a file on disk — and Node refuses a header value carrying a code point above `\xFF`. **The banks this app reads are Thai**, so a Thai filename would have failed the whole download with `ERR_INVALID_CHAR` rather than delivering the PDF: the ordinary case, not an exotic one. `contentDisposition` now emits both RFC 6266 forms, and it percent-encodes against RFC 5987's `attr-char` set explicitly because `encodeURIComponent` leaves `!'()*` alone.

**And one was in a guard written this same day, which is the sharpest of them.** The "no absolute URL" assertion ran against a comment-stripped copy of the source — and `.replace(/\/\/.*/gu, "")` knows nothing about string literals, so `fetch("https://mail.google.com/…")` becomes `fetch("https:` before the pattern looks at it. **The check would have passed for precisely the drift it was written to catch.** It runs against the raw source now. This is the third distinct way a source-grep guard has failed at its own job in two days — after the spelling trap (D-144) and the word-grep on prose (above) — and all three are in `GOTCHAS.md`.

**The remaining three were small and are fixed**: the "stream" drained its source inside `async start`, which enqueues everything regardless of the consumer and buffers the whole PDF — the memory profile a buffered response was rejected for, while calling itself a stream; it reads one chunk per `pull` now, releasing the session on all three exits. `messages` counted every mail with a body structure, so a mailbox of ordinary correspondence could report "2 PDF(s) across 60 message(s)", which reads like 58 statements went missing. And the local file chooser's label was fed by the whole batch, so it read "40 chosen" after a sync the owner chose nothing in — the one place the new `source` field earns its keep.

**One finding was declined**, and on precedent rather than judgement: `playwright.config.ts` sets no `webServer.timeout` for a cold `pnpm build && pnpm start`. It is correct — the sibling config sets 180 s for the same shape — but that file is the owner's deliberately local-only copy, is never committed, and the same hazard is already recorded in `HANDOFF.md` § Live hazards. D-141 declined findings against it for the same reason.

**One of the review's assertions was itself wrong and the spec settled it.** A new test claimed `!` must be percent-encoded in an extended filename; `!` is a legitimate RFC 5987 `attr-char`, and only the other four of `!'()*` are not. The implementation was right and the test was corrected.


### What this is still owed

- **`/security-review`.** Two new routes, a stored credential and a mailbox read is exactly what it exists for, and only the owner can run it. **`/code-review` is discharged**: it ran against this work before asking to commit, per D-125, and its ten real findings are fixed above.
- **The credential in Vercel**, which is a hosted-resource change and needs the owner's authorization at the time. Until then the feature is inert in production and says so.
- **A committed spec.** The gap D-141 left is unchanged and this widens it: the statement batch is covered by unit tests and a throwaway, and the sync now is too.

- Evidence: the files above. Vitest **696 passed / 7 skipped across 34 files** (up 30, one new file), Playwright owner **31/31** and isolated **18/18**, production build clean at **twenty** `/api/v1/` routes, tsc and ESLint clean. `.runtime/mailbox-sync.spec.ts` is **6 tests** — two of them added for the review findings above, and both fail against the code as it stood before the fix. All re-run in full after the review. **pgTAP not re-run and deliberately so**: nothing here moves SQL, and it stands at 266 across 8 from 2026-08-18. D-141 (the design this implements, not revisits), D-144 (the seam this calls, and the guard-spelling trap), D-035 (the stdin rule and why a mailbox credential is a different class), D-058 (why the CSP was not widened), D-093 (the gate both routes take), D-125 (review before asking to commit), D-128/D-129 (device-only statement reading, which is unchanged).


## D-146 — The fifth archive boundary is shallow on purpose, because two open questions sit immediately behind it

- Date: 2026-08-24
- Status: **Done.** **D-130 … D-133** relocated unchanged to [`docs/decisions/ARCHIVE-D-130-D-133.md`](docs/decisions/ARCHIVE-D-130-D-133.md). No entry was rewritten, no index bullet was lost, and every cross-reference still resolves — `check:docs --strict` reads the archives, so a reference to an archived id is not a dangling one.
- Context: `DECISIONS.md` hit **94% of its 120 KB budget** on 2026-08-24, one day after the fourth boundary had taken it to 56%. Five entries did that — D-141 … D-145, of which D-145 alone is 18 KB.

### What moved, and why the range ends where it does

The four are the continuity-hygiene arc and they close on each other: the size guard that measured lines while the files grew sideways (D-130), the handoff and plan rewrites that followed (D-131), the ledger view's markup split (D-132), and the third archive boundary (D-133) — which is the first statement of the rule this entry is a later application of.

### The finding, which is not the archive itself

**This boundary lands at 82% where the fourth landed at 56%, and that is not a failure of nerve.** D-133's rule is that *a boundary excludes every open question*, and D-140 sharpened it into a test: *a question is closed when the code has stopped asking it.* Applying that test honestly stops the range at D-133, because the next two entries both still ask:

- **D-134** raises the traps budget and says the **next** breach is owed a split rather than a third raise. That condition has not fired — `GOTCHAS.md` is at 79% — and the code is still asking it: the rule sits in `scripts/check-docs.mjs` beside the constant and in its failure message.
- **D-137** drops the dark scheme with the owner's own qualifier on it, *"but we'll see"*. Nobody has looked at a bright page on a dark-OS phone at night, so the code is asking that question every time it serves `color-scheme: light`.

Archiving either would have bought roughly ten more points and hidden a live argument to get them. **The cheaper cut was available and was refused**, which is the whole content of this entry.

### What this means for the sixth boundary

**Depth is bought by closing questions, not by cutting harder.** The two above are the owner's to close — one is a decision about how `GOTCHAS.md` grows, the other needs a phone in a dark room — and until they do, the sixth boundary faces the same wall at the same place. **The alternative worth naming rather than doing quietly**: this file's budget has never been raised, and D-134's own argument for raising `GOTCHAS.md`'s does not transfer, because that file is entered through an index and this one is read front to back. So the answer here stays archiving.

**And the rate is now the thing to watch rather than the percentage.** Four days of ordinary work took this file 72% → 93%; *one* day took it 56% → 94%. At five entries a day a boundary is not a fortnightly event, it is part of finishing a feature — which is an argument for shorter entries, not only for more archives.

- Evidence: `docs/decisions/ARCHIVE-D-130-D-133.md`, the index in this file, `pnpm check:docs --strict` passing at **146 decisions, 145 traps** with `DECISIONS.md` back under budget. D-130 (the byte guard that makes this measurable), D-133 (the rule this applies), D-140 (the test it applies), D-134 and D-137 (the two questions that bound it).


## D-147 — Binding announces itself where the owner is looking, because the scroll fix was keyed on a stage auto-binding skips

- Date: 2026-08-25
- Status: **Done, uncommitted at the time of writing.** `app/import-bench.tsx` and `app/globals.css`. No SQL, no route, no contract change: every project stays on migration 020, the backup contract stays at **v7**, and the build still emits **twenty** `/api/v1/` routes.
- Context: **the first thing the owner did with the hosted Sync button was find a defect in the feature under it.** With the three mailbox variables in Vercel (see below) the button worked on the first real attempt — five statements from the mailbox, read on the device — and pressing **Bind & review** on a row then appeared to do nothing at all.

### What was actually wrong

`workBatchEntry` takes an early return on the automatic path: `if (autoBind && match) { bindTo(...); return; }`. `bindTo` sets the stage to `review`. The scroll effect that brings the answer into view was guarded `if (stage !== "bind" || workingLabel === null) return`.

So the branch that is **on by default** never scrolled. The review table rendered below the worklist and the status sentence landed in the Import / 01 section several screens above, while the worklist under the cursor did not change — its button only flips to "Confirmed — open again" after a confirmation, which is correct and which removed the last visible sign that the press had registered.

**This was a fixed bug that came back.** The scroll exists because the same complaint was made about the manual chooser and answered in D-141; its comment still said so. D-144 then added a path around the stage the fix was keyed on. Nothing failed, because a guard that returns early is indistinguishable from a guard that was not needed.

### The decision, which is about where an answer belongs rather than about scrolling

**An action's result goes where the action was, and it is announced rather than merely rendered.** The scroll is now keyed on the **binding outcome** — a value every branch sets — instead of on a stage that one branch skips. A stage is a waypoint; the outcome is the subject.

Beside it, the anchor the page moves to now carries a **banner** in the established `.capture-result` shape: `role="status"`, `tabIndex={-1}`, focused with `preventScroll`, matching `app/statement-batch.tsx`'s confirmation banner and `app/notification-card-capture.tsx` (D-139). Three states, because a press has three outcomes — bound to an account, read but needing one, or refused by `assembleImportPayload`. **The owner asked for this directly**, in the form "why is there no notification box so it is guaranteed I will see it", and he is right that a scroll alone is a weaker promise than an announced region: scrolling depends on where the viewport was, and `role="status"` does not.

`bindTo` returns the refusal message or null so the banner can state which happened; a `useState` setter does not update the variable it was called with, so the caller could not read `bindingError` back in the same tick.

### What `/code-review` found, and the one that was not mine

Ten findings at high effort, **six fixed**. Two were leaks of the same kind the new banner had just made visible, and one of those predates this change:

- **`workingLabel` was only ever set, never cleared.** Confirm a worklist entry, then confirm an unrelated single import, and the worklist announced that the *earlier* statement had reached the ledger carrying this one's numbers. Latent since D-141 and reachable by hand.
- **`batchBinding` was not cleared on the single-import paths**, which was the same mistake made fresh.
- Both, plus `batchConfirmation`, are now cleared by one `leaveTheWorklist()` that the two single-import entry points call.
- **`setChosenAccountId` sat after the auto-bind early return**, so a refused automatic bind left the previous statement's account selected under a banner saying to choose one. Moved above the branch.
- **The refusal was announced twice** — the new `role="status"` banner and the existing `role="alert"` carrying the same message. The alert is suppressed only while the banner already carries it.
- **`.scroll-anchor` became dead CSS** and its comment contradicted the new code; removed, with a note saying not to re-add it without a caller.

**Four were declined and three of those are not this change's to fix**: `playwright.config.ts` and `eslint.config.mjs` are the owner's deliberately local-only files, and the `webServer.timeout` finding is the same one declined on 2026-08-24. The `playwright.config.ts` finding is real and now sharper than `HANDOFF.md` had it — with a production build the owner specs actually execute, and that config has no `testIgnore`, `fullyParallel: true` and default workers, so a bare `pnpm exec playwright test` runs a ledger-wiping spec concurrently with siblings asserting against those tables. It stays in `HANDOFF.md` § Live hazards as the owner's to close.

### Coverage, and the gap this does not close

`.runtime/bind-scroll.spec.ts` — **3 tests, throwaway and gitignored** — drives the automatic branch, the manual branch and the worklist-to-single-import leak. The first two are **red against the pre-fix component and green after**, run by reverting the file and re-running. Honest about how they are red: they fail on the banner's absence rather than on the scroll specifically, since the banner is new.

**No committed spec drives any of this**, which is the gap D-145 widened and this does not close either. The statement batch form and the mailbox sync are still covered by unit tests and throwaways only.

- Evidence: `app/import-bench.tsx`, `app/globals.css`, `.runtime/bind-scroll.spec.ts` (3/3). Vitest **696 passed / 7 skipped across 34 files** — unchanged, which is what a change touching only component wiring should produce — Playwright owner **31/31** and isolated **18/18**, production build clean at **twenty** `/api/v1/` routes, `check:docs --strict` clean, tsc and ESLint clean. **pgTAP not re-run and deliberately so**: nothing here moves SQL, and it stands at 266 across 8 from 2026-08-18. **The owner suite reported 30/31 on one run and 31/31 on a full re-run** — `captures a slip from its QR` timed out at 30s, on a route this change does not touch; recorded in `HANDOFF.md` rather than treated as caused here. D-141 (the scroll this restores), D-144 (the path that skipped it), D-139 (the banner pattern), D-125 (review before asking to commit), D-145 (the guard that narrowed without failing, which is this shape one level up).

## D-148 — The client tier gets its first seam, because every route call had been open-coding the same five steps and had already diverged

- Date: 2026-08-25
- Status: **Done, uncommitted.** `lib/wire.ts`, `tests/wire.test.ts` (new), `app/transactions-view.tsx`, `app/import-bench.tsx`, `app/slips-bench.tsx`. No SQL, no route, no contract change: every project stays on migration 020, the backup contract stays at **v7**, and the build still emits **twenty** `/api/v1/` routes.
- Context: the owner installed two review skills and asked for both to be run, then delegated the follow-up work. `/improve-codebase-architecture` produced this as its first candidate; `/thermo-nuclear-code-quality-review` had independently found the same duplication one level down. **Both were treated as opinions to judge, not verdicts** — see § What was declined.

### The measurement this turns on

**33 of this repo's 34 unit-test files import from `lib/`. None imports from `app/`** — 696 passing tests, none crossing roughly 7,400 lines of client-tier orchestration, verified by import rather than inferred. That is the tier every defect of the preceding week lived in: D-139, D-141, D-142, D-147 and the leaks beside it. The cause is structural, not diligence: `lib/` is made of deep modules (`import-assembly.ts`, 151 lines behind one exported function; `statement-layout.ts`, 1,174 behind three) so each has an interface to test through, while in `app/` the interface *is* the rendered component and the only test surface is a browser. **A file-size review would have flagged `statement-layout.ts` and been wrong** — 1,174 lines behind three functions is depth, and line count means nothing until it is checked against interface width.

### What was actually wrong

`lib/wire.ts` held one 10-line function, `readError(body: unknown, fallback)`. The other five steps of a route call — issue it, survive a body that is not JSON, check `ok`, read the route's own `{ error }`, validate against the contract — were open-coded at **26 `fetch` call sites**, each re-deciding them independently. **They had already diverged, and the divergence was backwards.** `app/transactions-view.tsx` guarded three of its five loads with `.catch(() => null)` and left the two **blocking** ones bare, so a platform error page on the accounts or transactions path threw, was caught by the outer handler, and reported as *"the ledger could not be reached — check that the local Supabase stack is running"* — sending the owner to diagnose Docker while the route had in fact answered him. Nine of the twenty-six validated nothing at all.

`readError` is shallow in the way that bites: its parameter is `unknown`, so handing it the wrong thing type-checks and fails **silently**. That has happened — passing the `Response` instead of its parsed body replaced every specifically-worded refusal with the generic sentence, in two files, and is in `GOTCHAS.md`. A trap that a caller must remember to avoid is an interface defect, not a discipline problem.

### The decision

`ledgerRequest(path, schema, wording, init?)` owns the whole round trip and returns a discriminated `WireResult<T>`, so a caller cannot read `data` without having checked `ok`. Three properties are the substance:

- **`schema` is a required parameter**, so validation cannot be the step a hurried call site leaves out. Nine sites had left it out and the omission was invisible at each one.
- **`ok` is read before the schema**, so a route that refuses in its own words is never reported as a contract failure.
- **Three failure kinds, because they send the owner to three different places**: `unreachable` (diagnose the stack), `refused` (read the route's words), `off-contract` (diagnose the build). Each keeps the wording the call site already owned.

`cache: "no-store"` is the default, because all thirteen call sites that named a cache mode named that one and a ledger read served from a cache is a wrong answer rather than a fast one.

### What is deliberately not done

**The write paths have not moved.** `POST /api/v1/imports/confirm`, the slip and cash captures, and the two `PUT` decision routes still call `fetch` directly, because they carry idempotency keys and money and deserve their own pass rather than being swept along with a read migration. `readError` therefore stays exported and stays a trap for those seven callers until it moves; it becomes private to `lib/wire.ts` when they do.

**Two further candidates were surfaced and not built**: a shared capture-outcome module (the announce-and-scroll sequence is on its third verbatim copy, and the newest one queries `data-bind-result` where the other two query `data-capture-result`), and lifting the import stage machine into a pure reducer. The second is close enough to `PLAN.md` task 19 that it is the owner's call and not an agent's, and it is the one that would actually close the committed-spec gap.

### Two defects fixed alongside it

`leaveTheWorklist()` was called at **two of the four** ways a statement stops being a worklist entry, so choosing a different PDF through the picker left the previous statement's *"is bound to …"* banner over the controls for this one. **This is the trap D-147 wrote down and did not finish closing**; the sharpened entry is in `GOTCHAS.md`. Fixed at the picker, the one point every single-import path passes through. Separately, `loadSynthetic` checked no `ok` and parsed bare, so a refusal reported as *"the synthetic fixture failed its own contract"* and a non-JSON answer threw out of an `onClick` and hung the status line permanently.

### Coverage

`tests/wire.test.ts` — **17 tests, committed, not a throwaway.** What the app shows when a route answers HTML, 500s with no body, returns JSON its schema rejects, or does not answer; and that `ok` is read before the schema. One test documents the `readError` trap by passing it a `Response` and asserting the fallback comes back.

**The stale-banner fix has no committed spec**, stated rather than glossed: nothing committed drives the batch worklist. It rests on the owner suite still passing and on the reasoning above.

- Evidence: Vitest **713 passed / 7 skipped across 35 files**, up exactly the 17 new tests from 696/7/34 with the skip count unchanged at **7** — the number to read, not the total. Playwright owner **31/31** (no intermittent this run) and isolated **18/18**, production build clean at **twenty** `/api/v1/` routes, `check:docs --strict` clean, tsc and ESLint clean. **pgTAP not re-run and deliberately so**: no SQL moved, and it stands at 266 across 8 from 2026-08-18. D-147 (the trap this finishes closing), D-145 and D-141 (the committed-spec gap), D-125 (review before asking to commit).

## D-149 — The owner closed the two questions the fifth boundary was stuck behind, so the traps split and the sixth boundary went seven entries deep

- Date: 2026-08-25
- Status: **Done, uncommitted.** `GOTCHAS.md`, `docs/gotchas/` (eight new files), `docs/decisions/ARCHIVE-D-134-D-140.md` (new), `DECISIONS.md`, `scripts/check-docs.mjs`, `PLAN.md`, `HANDOFF.md`. No source, no SQL, no route, no contract change.
- Context: D-146 recorded that the fifth archive boundary landed at 82% where the fourth landed at 56%, and named exactly what was blocking it — **D-134 and D-137, both the owner's to close.** He closed both on 2026-08-25, in one sentence each, which is all either needed.

### What he decided

- **`GOTCHAS.md` splits along its section headings.** D-134 had raised the budget once from 200 KB to 260 KB and attached a condition: *the next breach is owed a split, not a third raise.* The breach came and the condition was honoured.
- **There is no dark scheme, and the qualifier is withdrawn.** D-137 dropped it with the owner's own *"but we'll see"* attached, which is why D-146 could not file it as settled. He settled it: no dark scheme, and he will say so if that changes. **This does not reverse D-137 — it removes the hedge on it.** `color-scheme: light` in `:root` and `app/layout.tsx` stands, and a bright page on a dark-OS phone at night is now an accepted cost rather than an unexamined one.

### The split, and what it changed about the budget

**149 trap bodies moved to `docs/gotchas/`, one file per section, byte-identical.** `GOTCHAS.md` goes **208 KB → 14 KB** and keeps the index alone, which is the part read in full. Nothing inside a trap changed and no index bullet was lost.

**The 260 KB figure is retired rather than raised**, and that is the substantive part. It bounded a single body nobody read front-to-back, and there is no longer a single body to bound. Two budgets replace it in `scripts/check-docs.mjs`, each measuring something a reader actually pays: **40 KB for the index**, because its scannability was the whole condition D-134 attached, and **80 KB per section**, because a reader arrives through the index and opens exactly one. A section that breaches splits in two and both halves get index entries. There is still no archive for traps, by design — retirement remains the only lever, and it is bounded by how many traps actually die.

The checker had to follow the bodies. `gotchaFiles()` gathers them, the index is still verified against every trap one for one — the property the split existed to preserve — and **the Verify-line scan runs per file rather than over a concatenation**, because a trap's block ends at the next heading in its own file and a joined scan would let the last trap of a section swallow the next section's header and borrow its date.

### The sixth boundary, and why it stops where it does

**D-134 … D-140 relocated unchanged** to `docs/decisions/ARCHIVE-D-134-D-140.md`. `DECISIONS.md` goes **110 KB → 82 KB**, from 94% to about 68%, and now carries **D-141 onward**. Seven entries where the fifth boundary managed four, which is precisely the depth the two closures bought — D-146 predicted this and said so: *depth is bought by closing questions, not by cutting harder.*

**It stops at D-140 because D-141 still asks.** Its mailbox questions were written before the mailbox existed and most have since been answered by building it (D-144, D-145) — but **whether the source is deleted after import, and so whether the mailbox becomes a permanent archive of every statement under a password derived from a citizen ID and therefore non-rotatable, is deliberately deferred and unanswered.** Filing D-141 as settled would be false in exactly the way D-146 refused to be. The rule that bought this boundary its depth is the same rule that stops it here.

**One deviation from "relocated unchanged" is worth naming.** D-140's body links to `ARCHIVE-D-120-D-129.md` by a repo-root-relative path, which stops resolving once the file sits inside `docs/decisions/`. The link **target** was corrected to the sibling path; the display text is byte-identical, so the entry still reads exactly as it did. `check:docs --strict` caught it, which is the check earning its keep on the first archive that ever contained one.

- Evidence: `pnpm check:docs --strict` passing at **149 decisions, 149 traps**, indexes matching and every reference and path resolving — the same 149 traps as before the split, which is what proves nothing was dropped. `DECISIONS.md` **82 KB/117 KB**, `GOTCHAS.md` **14 KB/39 KB**, largest section `docs/gotchas/app.md` **56 KB/78 KB**. D-134 and D-137 (the two closed), D-146 (which named them and predicted this depth), D-133 (the rule), D-140 (the test it applies), D-130 (the byte guard that makes any of this measurable).

## D-150 — The announce-and-scroll becomes one module and the worklist becomes one value, so two classes of defect stop being representable

- Date: 2026-08-26
- Status: **Done, uncommitted.** `app/result-banner.ts` and `lib/import-flow.ts` (both new), `tests/import-flow.test.ts` (new), `app/import-bench.tsx`, `app/statement-batch.tsx`, `app/notification-card-capture.tsx`, `tests/privacy.test.ts`. No SQL, no route, no contract change: migration 020, backup contract **v7**, still **twenty** `/api/v1/` routes.
- Context: the owner read the architecture review (D-148) and asked for its second and third candidates to be built. They are one entry because they are one finding at two altitudes — the same three capture surfaces, the same drift, one in the markup and one in the state behind it.

### Candidate 2 — the announce-and-scroll was on its third copy

`requestAnimationFrame` → `scrollIntoView({ block: "start" })` → `focus({ preventScroll: true })`, with its six-line rationale about `prefers-reduced-motion` and `scroll-margin-top`, existed **three times**: in the card form, the batch worklist, and — as of D-147 — the import bench. **They had already drifted**: the newest queried `[data-bind-result]` where its two siblings queried `[data-capture-result]`, for the same role, under the same CSS class.

`app/result-banner.ts` is now the only copy. **It offers two call shapes because the three sites genuinely have two**: pass a value and the banner is revealed when it becomes non-null (the batch worklist, the import bench), or call `reveal()` where the announcement has several origins (the card form announces from three handlers). Neither wraps the other — the first is an effect that calls the second.

**The markup deliberately did not move.** The three banners differ in content and one carries action buttons, so a shared component would have taken arbitrary children and become the pass-through wrapper this review was written to remove. What is shared is the behaviour and the accessibility contract, which is what was actually duplicated.

### Candidate 3 — the worklist was three `useState` slots

`workingLabel`, `batchBinding` and `batchConfirmation` each said "a worklist entry is being worked", each set independently. **The seam between them is where both of the week's defects lived** — D-147 (a flag only ever set, so a confirmation was labelled with an earlier statement's name) and D-148 (the helper written to fix that, called at two of four exits). `GOTCHAS.md` already recorded that a helper is not the answer, because a helper is still a thing to remember.

They are one `Worklist | null` now, with the phase a **discriminated union** rather than two nullable strings carrying a prose invariant that they are never both set. `null` is the only way to be out of the worklist, so it cannot be cleared by halves; the confirmation is **derived** rather than stored; and `bindTo` returns a `BindOutcome` instead of `string | null` with null meaning success.

**The refusal suppression now asks where a message came from rather than what it says.** It was `bindingError !== batchBinding?.refusal` — string equality between two independently-set states, which held only while no two wordings converged and would have made the alert vanish silently on the day they did.

### What this is not

**It is not the whole stage machine as a reducer**, which is what the review proposed. `stage`, the parsed statement and the bound account stay in the component: moving them is a far larger change to the path that files money into an append-only ledger, the defects were never there, and the benefit the reducer was proposed *for* — testable decisions, an unrepresentable stale mode — is delivered by the part that moved. `app/import-bench.tsx` is 891 lines from 931 and holds 29 `useState` rather than 30; the win is not the count, it is that the three that mattered became one.

### Coverage, and the gap this actually closes

`tests/import-flow.test.ts` — **17 tests, committed.** Both defects are asserted as properties rather than fixed as incidents: confirming off the worklist cannot label anything (D-147), and every derived value goes at once when the one value goes (D-148). **This is the first committed coverage the batch worklist has ever had** — the gap `PLAN.md` calls the largest thing owed, closed for the decisions, still open for the markup.

**`tests/privacy.test.ts` moved with the code and is stronger for it.** Its focus-and-scroll guard read `scrollToResult` out of the card form — the only copy when written, one of three by D-147, so it covered two thirds of the rule while appearing to cover all of it. It now asserts the shared module and then walks **all three surfaces**, requiring each to go through it, to carry no private `scrollIntoView` call, and to spell the focus target one way. **The guard failed when the code moved**, which is what `GOTCHAS.md` asks of a source grep and what the two traps about narrowing guards are about.

Two of those traps were then hit while writing this, both in the same shape and both caught by the gate: a comment naming `scrollIntoView` failed a grep for the word (fixed by matching the **call**), and a comment naming the browser-logging API failed the no-observation-tooling walk. **A runtime warning was written and then removed** for that second reason — `app/` may not log, and a guard firing in the gate beats one firing in a browser nobody is watching.

- Evidence: Vitest **730 passed / 7 skipped across 36 files**, up the 17 new tests with the skip count unchanged at **7**. Playwright owner **31/31** — the suite that drives the import flow end to end, which is what protects this refactor — and isolated **18/18**, production build clean at **twenty** `/api/v1/` routes, `check:docs --strict` clean, tsc and ESLint clean. **pgTAP not re-run and deliberately so**: no SQL moved, 266 across 8 from 2026-08-18. D-148 (the review that proposed both), D-147 and D-141 (the defects this makes unrepresentable), D-139 and D-124 (the banner pattern), D-125 (focus follows the eye).
