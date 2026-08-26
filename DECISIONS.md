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
