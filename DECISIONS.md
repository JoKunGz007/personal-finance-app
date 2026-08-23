# Private Ledger decision log

Last reviewed: 2026-08-09

Entries are append-only. A superseding decision must reference the earlier entry rather than rewriting its history.

This file carries **D-130 onward**. Four settled ranges were relocated unchanged, not rewritten: **D-001 … D-059** to [`docs/decisions/ARCHIVE-D-001-D-059.md`](docs/decisions/ARCHIVE-D-001-D-059.md) on 2026-08-09, **D-060 … D-113** to [`docs/decisions/ARCHIVE-D-060-D-113.md`](docs/decisions/ARCHIVE-D-060-D-113.md) on 2026-08-18, **D-114 … D-119** to [`docs/decisions/ARCHIVE-D-114-D-119.md`](docs/decisions/ARCHIVE-D-114-D-119.md) on 2026-08-19, and **D-120 … D-129** to [`docs/decisions/ARCHIVE-D-120-D-129.md`](docs/decisions/ARCHIVE-D-120-D-129.md) on 2026-08-23. The index below covers all five files, so a reader can find any entry without opening any body.

**Every boundary sits where an argument ends rather than where a number is round**, and the fourth one is the clearest case of that rule so far. It was taken at **93%** of this file's byte budget and moved the whole arc in which both readers went to Cloud Vision and the local OCR engine was deleted. **The third boundary had explicitly refused to move D-120**, on the grounds that whether pre-fill stays was undecided and that question attached to D-120 and D-129 — which was true when written. **What closed it was not an argument but a shipped feature**: D-135 files a machine-read amount into the ledger without the owner looking at it at all, which is a stronger commitment than the trial ever asked for. *A question is closed when the code has stopped asking it*, and that is the test to apply at the next boundary rather than re-reading the prose.

What this file now holds is the continuity-hygiene arc and the current work: the byte-budget correction, the handoff and plan rewrites, the ledger view split, bulk slip upload, and the palette with its phone measurements.

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

### Current 
—
 this file

- **D-130** — The continuity size guard measured lines while the files grew sideways, and reported green at 332 KB
- **D-131** — The handoff and the plan were append-only by habit, and both had gone self-contradictory
- **D-132** — The ledger view's markup became seven files, and the derivation pipeline deliberately did not move
- **D-133** — Both continuity budgets were acted on rather than raised, and the archive boundary excluded every open question
- **D-134** — The traps budget is raised to 260 KB on the lookup-file argument, with the next breach owed a split rather than a third raise
- **D-135** — Bulk slip upload files a slip unseen only when its date is exact, and the printed-date reader that made that possible had shipped uncalled
- **D-136** — The palette becomes warm and the phone gets measured, which found two contrast failures no light-mode look would reveal
- **D-137** — Cornsilk becomes the ground and the dark scheme is dropped, so the app declares one set of colours and measures only those
- **D-138** — The ledger table escaped the viewport on a real phone, because an element selector cannot reset a class and an audit cannot measure a table that was never rendered
- **D-139** — "Where did that card go" is answered in the result banner rather than under the form, because a one-time question must not buy permanent vertical space
- **D-140** — The fourth archive boundary moves the whole Cloud Vision arc, because a shipped feature closed the question the third boundary was blocked on
- **D-141** — Bulk statement import splits at the authentication boundary: many PDFs read in one pass, each bound and confirmed by hand
- **D-142** — The bulk slip form threw away work it had already done, and could not be told to try again
- **D-143** — A third button rank, because "quiet" had been spelled as "unstyled"

## D-130 — The continuity size guard measured lines while the files grew sideways, and reported green at 332 KB

- Date: 2026-08-18
- Status: **Accepted and done.** A correction to `scripts/check-docs.mjs` and an archive taken under the new measure. No application code is involved and nothing about the ledger changes.
- **The defect, in one line.** `check:docs` budgeted `DECISIONS.md` at **1,200 lines** and `GOTCHAS.md` at 1,400. `DECISIONS.md` passed that check at **1,132 lines while being 332 KB** — roughly 80,000 tokens, most of a context window for one file. The guard's own comment says it exists because "a decision log outgrows a single read long before it outgrows a file", and it was measuring the one dimension that could not see that happening.
- **Why the two diverged, which is the part worth keeping.** Entries in this log are long prose paragraphs, not the short `Decision:` / `Rationale:` bullets D-001 … D-020 used. The file grew **sideways**. A line count is a proxy for size only while lines have a roughly constant width, and nothing recorded when that stopped being true — the budget was set in 2026-07 against entries averaging a few hundred bytes and was still being applied to entries averaging 4.5 KB.
- **The measurements, taken before anything was changed.** `DECISIONS.md` 332 KB in 1,132 lines; `PLAN.md` 214 KB in 516 lines and budgeted by nothing at all; `GOTCHAS.md` 182 KB in 1,143 lines; `HANDOFF.md` **91 KB in 86 lines**. Per-entry sizes in the decision log are strikingly uniform — 2.5 KB to 8 KB, with only D-129 above that at 10.9 KB — so the growth is entry *count* times a stable size, not a few bloated entries anyone could have spotted by reading.

### What changed

- **The budgets are bytes**: `DECISIONS.md` 120 KB, `GOTCHAS.md` 200 KB. Set from what a read costs rather than from what the files happen to be — this project's Markdown runs about 0.33 tokens per byte, so those are roughly 40,000 and 66,000 tokens. **The two files get different numbers because they are read differently**: the decision log is read front-to-back by anyone picking the project up, while `GOTCHAS.md` is a lookup file entered through its index, so its size costs less per use.
- **Measured with `Buffer.byteLength`, not `String.length`.** These documents are full of em dashes, Thai labels and typographic quotes, every one of which is several bytes and one character. Measuring characters would under-report exactly the files most at risk.
- **The remedy is per file rather than one shared sentence.** The decision log's is to archive the oldest contiguous range; `GOTCHAS.md` has no archive and its remedy is to retire traps whose subject no longer exists, keeping whatever generalisation outlived them. A message naming the wrong remedy is how a check gets satisfied the wrong way.
- **A passing run now prints each file's size and percentage.** `DECISIONS.md 90 KB/117 KB (77%), GOTCHAS.md 177 KB/195 KB (91%)`. **A budget nobody sees the approach to is a budget that is only ever met as a surprise**, which is the whole story of this entry.
- **D-060 … D-113 are archived** to `docs/decisions/ARCHIVE-D-060-D-113.md`, moved unchanged. `DECISIONS.md` went **332 KB → 90 KB**. The index still covers all three files, so no entry became harder to find — only harder to read by accident.
- **The boundary is where an argument starts, not where a number is round.** D-114 is the point at which the owner put D-087's no-pre-fill rule on trial instead of keeping or reversing it, and every entry since — the strict pre-fill module, both Vision measurements, both adoptions — is that trial playing out. The maintained file now holds one continuous line of reasoning.

### What this did not do, and what it found

- **`PLAN.md` is 214 KB and is still budgeted by nothing.** It is not added here because its shape is different: it is a task list where completed tasks keep their full record inline, so the remedy is not an archive but a decision about how much of a closed task's history stays in the file. That is the owner's call and it is not made.
- **`HANDOFF.md` is 91 KB in 86 lines** and is the file whose own text says it is the thin entry point and that status paragraphs belong in `PLAN.md` (D-052). Line 3 alone is a chain of "Before that:" history several times the length the rule intends. **The rule has failed in practice and a byte budget would catch it**, but capping it without first moving that history somewhere would make the next session's handoff worse rather than better. Named here so the next change is deliberate.
- **`GOTCHAS.md` is at 91% of its new budget**, which is roughly five more traps. That is the first thing the corrected check says, and it is a real signal rather than an artefact of a tight number: two traps were retired today (the tesseract cache and the WASM core path) and both kept their generalisation, which is the pattern the remedy names.
- **Red-proved rather than assumed**: lowering the decision budget to 80 KB fails the check with `DECISIONS.md: 90 KB exceeds the 78 KB budget` and the archive remedy, and restoring it passes. The failure names the file, both numbers and what to do, which is what the old message did too — the old one was simply never reached.
- Evidence: `scripts/check-docs.mjs`, `docs/decisions/ARCHIVE-D-060-D-113.md`, `DECISIONS.md` (header), `HANDOFF.md`, `docs/LOCAL_DEV.md`. `pnpm check:docs --strict` passes at **129 decisions, 132 traps**, unchanged across the move, which is the assertion that the archive relocated bodies and not entries. D-080 (the archive rule this follows), D-052 (the thin-handoff rule this finds broken), D-082, D-085.

## D-131 — The handoff and the plan were append-only by habit, and both had gone self-contradictory

- Date: 2026-08-18
- Status: **Accepted and done**, on the owner's decision. Follows D-130, which corrected the guard that should have caught this. Documentation only; no application code and nothing about the ledger changes.
- **The defect is not size, it is that nothing was ever removed.** `HANDOFF.md` was **91 KB in 86 lines** and `PLAN.md` **214 KB**. Every update to either had *prepended* a paragraph and removed none, so both files held a third telling of a history that `git log` and `DECISIONS.md` already carry in full.
- **Size was the symptom. The failure was that they had become wrong.** `HANDOFF.md` carried **three separate lines each claiming a different migration state** — one said all three local projects were on 012, another said 001–014, another said 019 — while the truth was 020 everywhere. `PLAN.md`'s gate table said Vitest **522 across 28 files** and pgTAP **252** when the real numbers were 604 across 30 and 266. **Every one of those lines was true when written**, and each was left in place beneath a newer one that contradicted it. A reader has no way to tell which of three dated claims is current except by re-deriving all three, which is the opposite of what a continuity document is for.

### What changed

- **`HANDOFF.md` is rewritten, not trimmed: 91 KB → 15 KB.** It now carries only what its own header always said it should — live authorizations, the destructive-operation state of this machine, live hazards, and where to start reading. **One 33 KB line and one 4.8 KB line were the bulk of it**, both pure "Before that:" chains. The file says in its own opening to rewrite it in place and not to prepend, because the rule alone was not enough: D-052 established the thin-entry-point rule in 2026-07 and the file had grown back to more than twice the length that decision trimmed it from.
- **`PLAN.md`'s gate table records the latest run and not every run: about 50 KB → 3 KB.** One cell was **13.6 KB** on its own. The table now says "replace a cell, never append to it", and the stale headline numbers are corrected to the 2026-08-18 gate.
- **`PLAN.md`'s checkpoint section was 27 stacked paragraphs reaching back to 2026-07-24** and is now the current checkpoint plus a pointer. Every paragraph removed carried a decision id already, which is what made removing them safe — the pointer names the arcs and where to read them.
- **One fact was carried forward rather than dropped, and it is the one that proves the exercise was worth doing.** Buried in the twelfth checkpoint paragraph was the finding that a local build's "resting state" is the **synthetic** project, not the live one, because `private-ledger-live` stopped being the ledger on 2026-08-11 (D-094). Every older row in `PLAN.md` and the `.next` bullet in `HANDOFF.md` still said "unpinned, therefore live-targeted". **That mattered within the hour**: an agent reading `.next` on 2026-08-18 found four chunks naming the synthetic port, could not reconcile it with the handoff, and recorded it as an unexplained discrepancy — when the answer was fifty paragraphs down in the file that had been superseded but not deleted.
- **`PLAN.md` 214 KB → 138 KB.** Less than `HANDOFF.md`'s reduction because its remaining bulk is the task list, where a completed task's full record is genuinely the deliverable rather than history: those entries are how a closed decision stays checkable. Cutting them is a separate judgement and is not made here.

### What this does not do

- **Neither file gets a byte budget yet.** `PLAN.md` at 138 KB and `HANDOFF.md` at 15 KB are both comfortably readable now, but a budget set today would be set against a shape that has just changed, and the thing worth measuring for `PLAN.md` is whether the *task list* is still earning its size. Named so the next change is deliberate rather than reactive.
- **Nothing removed was summarised into a shorter form.** It was deleted, because a summary of an append-only log is a fourth telling and would go stale the same way. What replaced each cut is a pointer to where the full record lives.
- **The rule that failed is now written where it is read.** Both files carry a sentence at the point of edit telling the next writer to replace rather than prepend. D-052 put the same rule in a decision entry and it was not enough; a rule that lives only in a log nobody opens while editing is a rule that gets re-broken.
- Evidence: `HANDOFF.md`, `PLAN.md`. `pnpm check:docs --strict` passes at 131 decisions and 133 traps, and **it caught this entry's own forward reference before it shipped** — both rewritten files cited D-131 while it was still unwritten. D-130 (the guard that should have caught the growth), D-052 (the thin-handoff rule this finds broken twice), D-094 (why "live-targeted" stopped being true), D-082.

## D-132 — The ledger view's markup became seven files, and the derivation pipeline deliberately did not move

- Date: 2026-08-19
- Status: **Accepted and done.** Front-end structure only: **no behaviour changed, no route, RPC, migration or SQL moved**, so every project stays on 020 and the backup contract stays at **v7**.
- **The defect was one `return`, not one file.** `app/transactions-view.tsx` was **1553 lines** with **29 `useState`, about 25 `useMemo` and roughly 940 lines of JSX in a single `return`** — the four record kinds it renders were four branches of one `map` rather than four things. It was the only file in a whole-repo survey where length was a genuine comprehension problem rather than a number; the other long files are 21–30% comment and are per-bank parsing contracts that belong together.

### What moved

- **The four record kinds are components**: `app/ledger-statement-row.tsx` (378), `app/ledger-card-row.tsx` (216), `app/ledger-slip-row.tsx` (154), `app/ledger-cash-row.tsx` (118). The statement row is the largest because its Status cell is **three modes rather than three styles** — picking a row for a card, picking one for a slip, and the ordinary verified view.
- **The chrome is three more**: `app/ledger-controls.tsx` (128), `app/ledger-summary.tsx` (143), `app/ledger-retired-cards.tsx` (69). The summary is one component because the matching banner and the totals strip are **alternatives rather than neighbours** — the totals are deliberately absent while a row is being chosen, since a subtotal of three unrelated rows reads as a figure.
- **`app/ledger-shared.ts` (77)** holds what they must agree about: one `formatDate`, the `ALL_ACCOUNTS`/`ALL_STATUSES` control values, and two types. **`LedgerLayout` exists because `showCombined ? 7 : 6` was written out at five separate places** and a detail row spanning the wrong number of columns is a silent defect. **`LedgerModes` groups the seven values describing what the owner is in the middle of**, because a row asks "is a write in flight anywhere", not "is this id deciding" — the conditions that read it stay beside the buttons they disable.
- **`app/transactions-view.tsx` is 1553 → 880 lines, and its `return` is 940 → 215.** Two `store*Correction` functions that sat halfway up the derivation pipeline moved down beside the third, because their position read as though the pipeline depended on them and it does not.

### What deliberately did not move, and why

- **The `useMemo` derivation chain stays in the component.** It was the obvious next cut and it is the wrong one: extracting it would need roughly **16 arguments in and 24 values out**, which is not more comprehensible than the pipeline read top to bottom — it only moves the reading cost from one file to two. The chain is a derivation pipeline, not incidental state, and the rules it calls (`lib/slip-reconcile.ts`, `lib/notification-card-reconcile.ts`) already live outside it.
- **`load()` stays too**, for the same arithmetic: it writes fifteen pieces of state across four record types, so a hook owning it would hand all fifteen back.
- **29 `useState` is unchanged.** Grouping them would change update batching and state identity, which is a behaviour change, and no behaviour change was licensed here.

### The test that would have gone quiet

- **`tests/privacy.test.ts` named five files by hand**, one of them `app/transactions-view.tsx`, to assert the ledger surfaces carry no `serviceWorker`, `localStorage`, `sessionStorage` or `console.`. **A split moves guarded code out from under a check like that while it keeps passing** — the exact drift the same file's opening comment was written about after a hardcoded array missed `app/cash-entry.tsx` and `app/correction-form.tsx`.
- It now **walks `app/`** instead, covering `.ts` as well as `.tsx` — the new shared module is a plain `.ts` and a `.tsx`-only walk would have stopped covering it on the way past. **`app/site-header.tsx` is excluded by name**, with its reason: it is the one file allowed to register the service worker.
- **Red-proved rather than assumed**: a `console.log` was put in `app/ledger-shared.ts`, the check failed, and it was removed.
- Evidence: gate re-run green after each of the two extraction steps and against a baseline taken before anything was touched — Vitest **604 passed / 7 skipped across 30 files** unchanged throughout, pgTAP untouched (no SQL moved), Playwright owner **29/29** at baseline and after both steps, production build clean at **eighteen** `/api/v1/` routes. D-011 (the two-agent workflow this was done under), D-064 (why a statement row carries no chip), D-069 (why the chooser is rows and not a dropdown), D-075 (the detail panels), D-103 (retiring a card).

## D-133 — Both continuity budgets were acted on rather than raised, and the archive boundary excluded every open question

- Date: 2026-08-19
- Status: **Accepted and done**, on the owner's instruction. Documentation only; no application code, no SQL, nothing about the ledger changes.
- **Both budgeted files were within ten percent of breaching**: `DECISIONS.md` at **106 KB/117 KB (90%)** and `GOTCHAS.md` at **181 KB/195 KB (93%)**. D-130 set those budgets deliberately, so raising either would have removed the guard rather than answered it. Each file has a **different** sanctioned remedy and both were applied.

### `DECISIONS.md`: 106 KB → 78 KB (90% → 67%)

- **D-114 … D-119 archived** to `docs/decisions/ARCHIVE-D-114-D-119.md`, moved unchanged. This file now carries **D-120 onward**.
- **The boundary is where the argument ended, and the test was whether anything is still open.** The six moved are the measurements and repairs that *led to* the card reader adopting Cloud Vision. **D-120 is that adoption and it stayed**, because it is the arrangement the app still runs — and because **whether pre-fill stays at all is still undecided on both the card and the slip path**, a question that attaches to D-120 and D-129. Archiving either would have filed a live argument as settled, which is the one thing an archive must not do.
- A round number would have taken D-114 … D-129 and been wrong for exactly that reason.

### `GOTCHAS.md`: 181 KB → 177 KB (93% → 91%)

- **There is no archive for traps and that is by design** (`scripts/check-docs.mjs`): relocating them would only move the reading cost, so the only remedy is retiring a trap whose subject no longer exists down to the generalisation that outlived it.
- **The 2026-08-18 retirements had annotated two dead traps without shrinking them**, which is why the file kept growing while reporting that traps had been retired. A "no longer live" line appended to a full Symptom/Cause/Avoid/Verify body costs bytes rather than saving them. Both were cut properly this time.
- **`A WASM core path naming a directory…` was removed outright**, because its generalisation is word-for-word the one the live ZXing entry above it already carries; the surviving half — **a library that composes an asset name at runtime keeps a second, invisible copy of your build's file list** — was folded into that entry instead of being kept twice. Trap count 133 → 132.
- **The sweep found no other dead subjects.** Eight further traps mention tesseract.js, and in every one it is an example inside a rule that still binds (the pnpm build allowlist, the store-path mismatch, the scoped-name quoting). A trap is retired when its *subject* is gone, not when a word in it is.
- **Named rather than solved**: at 91% and 132 traps, `GOTCHAS.md` will breach again, and retirement is bounded by how many traps actually die. Raising that budget is the owner's call and is not made here.
- Evidence: `pnpm check:docs --strict` passes at **132 decisions, 132 traps**, indexes match, references and paths resolve, `DECISIONS.md` 78 KB/117 KB (67%) and `GOTCHAS.md` 177 KB/195 KB (91%). D-130 (the budgets and why they are bytes), D-080 (the archive remedy), D-131 (the same instinct applied to the handoff and the plan).

## D-134 — The traps budget is raised to 260 KB on the lookup-file argument, with the next breach owed a split rather than a third raise

- Date: 2026-08-19
- Status: **Accepted and done**, on the owner's decision, taken after D-133 applied the sanctioned remedy and reported what it could and could not achieve. Tooling and documentation only.
- **`GOTCHAS.md`'s budget goes 200 KB → 260 KB** (`scripts/check-docs.mjs`). It sits at **177 KB, so 70%**. `DECISIONS.md` is unchanged at 120 KB.

### Why raising it is not the same as abandoning it

- **The remedy was applied first, and the raise is a response to what it measured.** D-133 retired both traps whose subject no longer existed and moved the file 181 KB → 177 KB. **That 4 KB is the honest ceiling on retirement**: a sweep of all 132 traps found no further dead subjects, because a trap is retired when its *subject* is gone and this project's traps mostly describe things that still exist. Retirement is bounded by how many traps die, which is far fewer than are written.
- **There is no archive for traps and that stays true** — relocating them only moves the reading cost, which is why `check-docs.mjs` says so at the point the remedy is printed. So retirement was the only lever, and it was not enough.
- **The number follows the argument the budgets were already set from.** They are set from what a read costs, and `GOTCHAS.md` was already given the looser one because it is *entered through its index* rather than read front-to-back. Taken to its conclusion: what a reader pays is **the index plus one trap**, and the index is about 10 KB of the 177. The body is therefore bounded by what keeps the file greppable, not by what fits in one context window.

### The condition, which is the substance of this entry

- **The thing that must stay readable in one pass is the index, not the file.** When the index stops being scannable, the answer is **structural** — split along the eight existing section headings, each with its own index — and not a third raise.
- **A budget raised twice has been abandoned.** That sentence is now in `check-docs.mjs` beside the constant and in the failure message the next breach prints, because D-130 established that a rule living only in a log nobody opens while editing is a rule that gets re-broken, and D-131 found the same thing again.
- **What this does not do**: it does not touch `DECISIONS.md`'s 120 KB, which is the tighter budget precisely because that file *is* read front-to-back, and which D-133 just brought to 69% by archiving rather than by raising. The two files have different remedies for a reason and this changes only one of them.
- Evidence: `pnpm check:docs --strict` passes at **134 decisions, 132 traps**, `GOTCHAS.md` **177 KB/254 KB (70%)** and `DECISIONS.md` 84 KB/117 KB (72%). Red-proved by lowering the new constant until the check failed and restoring it, which is how D-130 proved the byte budget in the first place. D-130 (the budgets and why bytes), D-133 (the remedy applied and its ceiling), D-131 (a rule must live where it is read).

## D-135 — Bulk slip upload files a slip unseen only when its date is exact, and the printed-date reader that made that possible had shipped uncalled

- Date: 2026-08-21
- Status: **Accepted and built**, uncommitted at the time of writing. The owner asked for many slips at once with no second look at each. Application code and tests only; **no SQL moved, no route was added**, and the backup contract stays at **v7**.
- What ships: `lib/slip-batch.ts` (policy), `app/slip-batch.tsx` (the form), `lib/browser/qr-detector.ts` (the QR reader both slip forms now share), and the form mounted under the single-slip one on `/slips`.

### The request, and the two things that stood between it and unconditional auto-submit

The owner's reasoning was that a misread slip fails to pair and surfaces as unmatched once the statements are in, so a second look per slip buys little. **That was checked against the matching rules rather than accepted**, and it holds for the amount and not for two other fields.

- **Direction.** `lib/slip-reconcile.ts` compares the **signed** movement, so a deposit filed as a withdrawal has the wrong sign, **can never pair with any row**, and skews the deposit, withdrawal and net totals until corrected by hand. Not self-healing, so not something a default may quietly get wrong.
- **Date.** `slipDateFromReference` returns a date only where the reference embeds eight date-shaped digits — SCB and Krungthai's longer variant (D-059). The single-slip form falls back to today, which is right for a payment just made. **A backlog dated today can never pair**, because `MATCH_WINDOW_DAYS` is 1. The safety net the request rests on fails precisely in the case the feature is for.

### What changed the shape: a reader that was already built and called by nothing

**`readPrintedDate` (D-086, 2026-08-10) reads the date printed on the slip, and no shipped code called it** — only its own tests. Since a batch already sends every image to Vision for the amount, the same words yield the date at **no extra request and no extra byte leaving the device**. That turns "no date in the QR" from the blocking case into a much smaller residue: **KBANK alone**, whose printed year is two digits and which `readPrintedDate` refuses outright rather than completing a century (D-031). Finding shipped, tested, uncalled code is worth recording as its own class of finding — the handoff scoped this feature around a limitation that a function already in the repository had removed.

### The rules, and why each is where it is

- **Ready means every value that could be wrong was read exactly.** The amount through `proposeAmount` — its own label, the strict money grammar, no lenient second path. The date from the QR reference **or** the printed line, never from the clock. Anything else goes to a review list with the refusing reader's own sentence.
- **The QR's date wins over the printed one**, because the reference is CRC-covered and already Gregorian while the print is pixels plus a 543-year conversion. When only the print carries a **time**, that time travels with the QR's date; nothing reconciles on a time.
- **Two readings that disagree refuse rather than pick.** Nothing available can say which is right, and a wrong date is the failure that never heals. This costs nothing in the ordinary case, where they agree.
- **A printed date is re-checked against the slip window.** `gregorianFromPrintedYear` fails closed on a *year* while `slipDateWindow` bounds a *date*, so the two do not coincide and a slip in the earlier part of the tenth year back passes one and not the other.
- **Direction is asked once for the whole batch and is never read from the image.** A slip prints who paid whom; **which side is the owner is not on the image and is not in this app**, so there is nothing to measure. The handoff proposed measuring it across the 23 real samples before defaulting it; that measurement was **declined as unanswerable rather than skipped for cost**, and one batch-level control replaces it. A mixed batch is two batches, and the form says so.
- **The magnitude is classified and the sign applied at submit**, so changing the direction re-signs every row without re-reading a single image.

### What makes it safe at all, and what it does not change

- **Identity never comes from OCR**: the bank and reference are re-derived server-side from the QR payload under its own CRC (`lib/slips.ts`), so bulk upload cannot misidentify a record.
- **Re-capture is a no-op** (migration 011), so an interrupted batch is re-run over the whole folder. The browser suite proves this through the form with a different amount on the second pass, so a silent overwrite would be visible in the stored figure.
- **No new server surface.** The production build still emits **eighteen** `/api/v1/` routes: the batch reuses `POST /api/v1/ocr/read` and `POST /api/v1/slips`. Nothing new was owed a security review.
- **One read and one write at a time**, deliberately: an unbounded burst at a metered third party, and a queue of captures contending for one owner's advisory lock, are both worse than a slower pass. A batch is capped at **50 files** for the same reason — a mistaken drop of a camera roll should cost a sentence, not a bill.
- Counterparty and category are not captured in bulk. Neither is readable from a slip, and both are correctable afterwards (migration 013).

### Two defects found on the way, one of them by the browser test

- **`app/slip-capture.tsx` dated a slip in UTC**, `new Date().toISOString().slice(0, 10)`, so between midnight and 07:00 Bangkok it named *yesterday*. **D-110 fixed exactly this in the cash and card forms and missed the slip form.** Now `bangkokToday()`. The browser spec asserting that fallback was deriving its expectation the same wrong way, so it moved with the code — it would otherwise have failed for seven hours a day and read as a broken fallback rather than a stale expectation.
- **A `FileList` is live, not a snapshot.** The batch handler cleared previous state first, and `clear()` sets `input.value = ""`, which **empties the `FileList` the handler is still reading**. Every chosen slip vanished and the form went on saying "Choose slip images…" — no error anywhere. Caught by the browser spec on its first run, not by any unit test, because it only exists once a real input holds real files.
- A third was found in the guard rather than the code: the privacy assertion pinning the amount fill anchored on a trailing newline, and an injected second fill one line later passed straight through it. This is the `GOTCHAS.md` trap about a source-grep test passing over code that has moved out from under it, **hit while writing the test meant to prevent it**. It now compares the set of every `plainThb` call.
- Evidence: `tests/slip-batch.test.ts` (16 tests over the date order, the disagreement refusal, the two-digit-year refusal, the window re-check, the amount grammar and the sign rule, with no browser and no engine), two `tests/e2e/owner-session.spec.ts` specs, and two new assertions in `tests/privacy.test.ts` — both **red-proved**, one by making the policy date a slip today and one by adding a second amount fill. The reader-client privacy check now **walks `app/` for `readImageWords(`** instead of naming two files, so a third reader form is covered the moment it is written. Vitest **621 passed / 7 skipped across 31 files**, Playwright owner **31/31** and isolated **18/18**, production build clean at eighteen `/api/v1/` routes, `pnpm check:docs --strict` at 134 decisions and 132 traps, tsc and ESLint clean. **pgTAP not re-run and deliberately so**: no SQL moved. D-059 (which references carry a date), D-086 (the printed-date reader), D-031 (why a two-digit year is refused), D-110 (the UTC date fixed twice before), D-129 (the strict-grammar rule this inherits).

## D-136 — The palette becomes warm and the phone gets measured, which found two contrast failures no light-mode look would reveal

- Date: 2026-08-21
- Status: **Accepted and done**, on the owner's choice of palette. Styling and a throwaway harness only — no application logic, no SQL, no route, no contract.
- What changed: `app/globals.css` alone. **No `.tsx` reads a custom property**, which is what made a whole-app retheme a single-file edit and is worth knowing before anyone proposes a theming abstraction.

### The palette, and the one problem it creates

Olive Leaf `#606C38`, Black Forest `#283618`, Cornsilk `#FEFAE0`, Light Caramel `#DDA15E`, Copper `#BC6C25`.

**It is entirely warm, and the old palette got its state separation for free from blue-versus-amber.** That separation has to be manufactured here: action is copper, verified is olive, provisional is caramel, and `--red` is pushed deliberately toward crimson so an error is not read as a link. In dark mode the two nearest — action and provisional — are pulled further apart than in light, because on a dark ground both otherwise collapse into one warm tan. **What makes near-neighbour hues tolerable rather than a defect is that colour was never the only carrier**: every one of those states also says what it is in words (D-123), and that rule is what this palette spends.

**Contrast was computed, not eyeballed**, and two palette values were darkened until they cleared AA: `--muted` 5.9:1 and `--blue` 5.3:1 against `--paper`, `--red` 7.1:1, `--celadon-ink` on `--celadon` 6.3:1. Both browser suites' axe checks pass unchanged.

### Two failures the retheme surfaced that predate it

Neither is caused by the new palette; both were found by having to reason about every filled surface at once.

- **`.skip-link` and `.brand-mark` were `color: white` over `background: var(--navy)`.** In dark mode `--navy` *is* the light colour, so both were white-on-cream — invisible. They take `var(--paper)` now, which is correct in both directions by construction rather than by two hardcoded values kept in step.
- **`.stage-nav li.active span` and `.secondary-button:hover` are filled with `--blue` and inked white.** `.primary-button` already had a dark-mode override flipping that ink and **the other two did not** — white on the brightened action colour is 2.5:1, a clear failure. All three share the override now. **No amount of looking at this file in light mode would have shown either**, which is the general point: a token that inverts between schemes makes every hardcoded partner a latent failure in exactly one of them.

### The phone measurement (PLAN task 28)

**The committed owner config is desktop-only**, so every signed-in surface had never been rendered at phone width by anything. `.runtime/mobile-audit.spec.ts` signs in, walks the four routes at 390 CSS px, screenshots each, and reports elements wider than the viewport and controls under 44×44.

**Nothing was broken.** No route pans sideways, and the single over-wide element is inside its own scroll container by design. What was wrong was legibility: a `12vw` heading floor rendering at **47px**, the first control on `/ledger` roughly **1,200px down** an 844px viewport, **every nav link 36px tall**, and the active-route marker rendering as a detached rounded box because an inset `box-shadow` is clipped by the link's own `border-radius`. All four are fixed; `/ledger` is ~13% shorter and every control clears 44px.

**What the audit still cannot see, stated so it is not mistaken for coverage**: it signs in but loads no data, because nothing in this app loads until asked. So the ledger table, the captured-slips list and the batch worklist have **still never been seen at phone width with rows in them** — and the table is the surface most likely to read badly. That is the remainder of task 28, not a thing this entry closed.

- Evidence: `app/globals.css`; `.runtime/mobile-audit.spec.ts` and its config, gitignored and throwaway; before-and-after screenshots at 390px. Playwright isolated **18/18** and owner **31/31**, both carrying the axe checks that hold this file to AA; Vitest **621 passed / 7 skipped across 31 files**, tsc and ESLint clean. D-123 (colour is never the only carrier), D-124 (the reduced-motion rule this file already honours).

## D-137 — Cornsilk becomes the ground and the dark scheme is dropped, so the app declares one set of colours and measures only those

- Date: 2026-08-21
- Status: **Accepted and done**, on the owner's instruction, hours after D-136. **Amends D-136 rather than reversing it** — the palette and the phone measurement stand; what changes is which colour is the ground and whether a second scheme exists.
- What changed: `app/globals.css` and `app/layout.tsx`.

### Cornsilk is the ground, not a card colour

D-136 put `#FEFAE0` on the raised surfaces and a duller `#f1ecd4` under them, so the colour a reader actually saw most of was the duller one and the palette's own cornsilk was a highlight. The owner's instruction was that `#FEFAE0` **is** the background. The ladder is now `--mist: #fefae0` → `--paper: #fffdf0` → `--paper-strong: #fffffa`, lifting toward a **warm** white rather than a pure one, which keeps the depth without introducing the one cold value in the file.

**The contrast figures in D-136 were computed against `--paper` and still hold**, because everything above the ground is now lighter than the ground. They are a floor rather than an average, and that is stated in the file so the next person does not re-derive it.

### The dark scheme is dropped, and that is a decision

The owner's reasoning: cornsilk is warm enough to read against for long stretches, so a dark scheme is not buying what a dark scheme is for. Recorded with his own qualifier — *"but we'll see"* — so this is a position taken and reversible, not a conclusion.

**What it costs, stated rather than glossed:** a reader on a dark-OS phone at night now gets a bright page. Nobody has tried that, and the qualifier is why it is worth trying before this is treated as settled.

**What it buys is the part worth keeping.** A second scheme is a second complete set of contrast facts, and **nothing here measures them**: both browser suites' axe checks run in the default scheme only, which is exactly why the two failures D-136 found had survived. Declaring one scheme means the colours that ship are the colours that were measured.

**`color-scheme: light` is what makes the decision real.** Without it a date picker and a select dropdown render dark on a dark-OS device against a cream page — the native controls follow the OS, not the stylesheet, unless told otherwise. This is the whole substance of dropping a scheme properly rather than deleting a media block.

**The `GOTCHAS.md` trap about tokens that invert between schemes is deliberately kept although its subject is gone.** Retirement is for a trap whose subject no longer exists, and the *pairings* still exist — `background: var(--…)` beside a literal colour is still all over this file and will fail again the moment a dark block returns. The palette comment points at it for exactly that reader.

### A colour no screenshot could have caught

**`app/layout.tsx` still declared `themeColor: "#eaf0f4"`** — the pre-retheme blue-grey — for a full day after the palette changed, including across two deployments. It tints the browser's own chrome around the page on a phone, so it renders as a band in the wrong colour above the app and is invisible to a headless audit, which never draws chrome. It is `#fefae0` now, and the file says it must equal `--mist`. **And the sweep that finding prescribes immediately found three more**: the PWA manifest carried the old blue-grey as both `background_color` and `theme_color` — the installed-app splash and chrome, which matter here because share-to-app is why this app is installable at all — and `public/icon.svg` was still a navy plate with blue-grey rules, which is the app icon and the favicon. Four stale colours in total, none reachable by any suite, type-check or screenshot. **The general shape is worth carrying: a colour declared outside the stylesheet does not move when the stylesheet does**, and nothing in this repo's gate looks at it.

- Evidence: `app/globals.css`, `app/layout.tsx`, `public/manifest.webmanifest`, `public/icon.svg`. Playwright isolated **18/18** and owner **31/31**, both carrying the axe checks; `.runtime/mobile-audit.spec.ts` re-run at 390px with every control still clearing 44px and no route panning sideways; tsc and ESLint clean. D-136 (the palette and the phone measurement this amends), D-123 (colour is never the only carrier).

## D-138 — The ledger table escaped the viewport on a real phone, because an element selector cannot reset a class and an audit cannot measure a table that was never rendered

- Date: 2026-08-21
- Status: **Accepted and fixed.** Found by the owner on his own device, minutes after the deployment that D-137 shipped. Styling and a harness only — no application logic, no SQL, no contract.
- What changed: `app/globals.css` (two rules), and `.runtime/mobile-audit.spec.ts` rewritten so it could have found this.

### The defect

`.ledger-table` sets `min-width: 1160px` and `.ledger-table.merged` sets `1280px`. The phone block reset it with `table, tbody { display: block; min-width: 0; }` — and **`table` is an element selector at specificity 0,0,1 while `.ledger-table` is a class at 0,1,0**, so the reset lost and the table stayed 1280px wide. Directly above it, `.table-scroll { overflow: visible; }` removes the horizontal scroll container that holds this table in on desktop, so the width had nothing to scroll inside and escaped to the document. A real phone rendered the whole page zoomed to roughly a third to fit 1296px of scrollable width into 390px of screen.

**A second, independent overflow sat behind it** and was only visible once the first was fixed: `.ledger-controls` used `grid-template-columns: 1fr 1fr`, and **`1fr` is `minmax(auto, 1fr)` whose floor is min-content, not zero**. A select whose longest option is an account label will not shrink, so the grid sized itself to its contents — 591px inside a 358px `main`. `minmax(0, 1fr)` is the fix, and the tracks are now written the long way so the floor is explicit.

### Why nothing caught it, which is the part worth keeping

**The audit written for D-136 signed in and looked, and reported four clean routes.** It was not lying: nothing in this app loads until asked, so the ledger table was **absent** rather than narrow, and *a `min-width` rule with no element to apply to cannot be measured wrong*. The measurement was honest about a page that did not contain the thing being measured — which is a worse failure than a wrong number, because it reads as coverage.

D-136 stated this gap explicitly in its own entry and in `PLAN.md` task 28: "the ledger table has still never been seen at phone width with rows in them". **Naming a gap is not closing one**, and the interval between naming it and the owner hitting it was under a day.

**The audit now seeds rows and asserts the table is really on the page** before it believes anything it measures about it — `expect(page.locator("table")).toHaveCount(1)`, so a future run cannot pass by finding nothing. Seeding needs `session_replication_role = replica`, because `source_transactions` is append-only and refuses DELETE; the components carry `position` in `{1,2}` and the fingerprint must be 64 hex characters. All seeded values are invented.

**Red-proved**: the rewritten audit was run against the shipped CSS and reported `pans sideways: true, scrollWidth 1296 vs 390` with `table.ledger-table.merged [16..1296]` named directly, then against the fix and reported 390 on every route.

- Evidence: `app/globals.css`, `.runtime/mobile-audit.spec.ts`. Playwright isolated **18/18** and owner **31/31**; the audit clean at 390px on all four routes with six seeded rows loaded, every control ≥44px. The one remaining reported overflow is `.stage-nav ol` inside its own `overflow-x: auto`, which is deliberate and does not pan the document. D-136 (the audit this repairs), D-137 (the deployment this followed).

## D-139 — "Where did that card go" is answered in the result banner rather than under the form, because a one-time question must not buy permanent vertical space

- Date: 2026-08-22
- Status: **Accepted and done**, after the owner asked the question directly while using the app on his phone. Copy and styling only — no logic, no SQL, no route, no contract.
- What changed: `app/notification-card-capture.tsx` (two message strings and one link), `app/globals.css` (two rules).

### The asymmetry that produced the question

`/slips` carries four things: the single-slip form, the bulk form, the card form, and **"On this ledger" — which lists slips only**. There is no captured-cards component and never has been. Cards appear in the **ledger view** instead (`app/ledger-card-row.tsx`, plus the retired-cards panel), which is deliberate: a card is a bank transaction awaiting its statement row, and the ledger is where the two meet (D-102).

So the route answers "where did that go" for one record kind and stays silent for the other, **with the two forms stacked one above the other**. That is the whole of the confusion, and the owner hit it in ordinary use rather than in review.

### Why not a captured-cards list, and why not a line under the form

**A second list was rejected as duplication.** The ledger already shows every card with its match state; a list here would be a second place to check and a second thing to keep in step, to answer a question the ledger answers better.

**A standing line under the form was rejected on cost.** PLAN task 28 had just finished measuring this exact surface and found that the first control on a route sat ~1,200px down a phone viewport behind prose. Adding a permanent sentence to solve a **one-time** learning moment spends the thing that pass had just recovered — and once the owner knows cards go to the ledger, he does not ask again.

**The banner is where it belongs, and this is the substance of the entry.** The question is not "where do cards go" in the abstract; it is "where did *that one* go", asked in the seconds after a capture. The result banner (D-123, D-124) already exists, already renders only after a capture, and is already scrolled and focused. Putting the sentence there **costs zero permanent space and lands exactly when the question is asked**. Both branches carry it — the already-captured branch too, because "nothing was added" raises the same question about the card already held.

**A link, not only a sentence.** On a phone this banner sits far below the header and its nav, so naming the ledger without offering it costs a scroll back up to act on what the sentence just said.

### Two things the link needed that the sentence did not

- **`.secondary-button` was written for a `<button>`.** An inline `<a>` honours neither `min-height` nor vertical centring, so the link sat shorter than the button beside it with its label off-centre. Fixed as a rule naming `a.secondary-button` rather than nudged with padding, because the next control borrowed onto a link has the same problem.
- **The banner's controls are 36px and no audit has ever seen them**, since `.runtime/mobile-audit.spec.ts` never captures a card — so they were never in the 44×44 sweep that PLAN task 28 applied everywhere else. Raised to 44px at phone width only; the base stays compact for a desktop where a pointer does the aiming. **This is the same shape as D-138**: a surface that only exists after an action is a surface no walking audit can measure.

- Evidence: `app/notification-card-capture.tsx`, `app/globals.css`. Playwright owner **31/31** (it drives card capture and reads the banner) and isolated **18/18** with its axe checks; `tests/privacy.test.ts` 35/35, including the assertions that hold this form's pre-fill and its banner to their rules; tsc and ESLint clean. D-102 (the ledger is where a card meets its row), D-123 and D-124 (the banner and why it is a region rather than a dialog), D-138 (the audit's blind spot this shares).

## D-140 — The fourth archive boundary moves the whole Cloud Vision arc, because a shipped feature closed the question the third boundary was blocked on

- Date: 2026-08-23
- Status: **Accepted and done**, on the owner's decision, taken before the next entry forced it rather than after. Documentation only.
- **D-120 … D-129 relocated unchanged** to [`docs/decisions/ARCHIVE-D-120-D-129.md`](docs/decisions/ARCHIVE-D-120-D-129.md). `DECISIONS.md` goes **109 KB → 62 KB**, from **93% to 53%** of its 117 KB budget, and now carries **D-130 onward**.

### Why this boundary, and why it was not available four days ago

**D-133 explicitly refused to move D-120**, and said why in its own text: *"whether pre-fill stays is still undecided on both paths, and that question attaches to D-120 and D-129, so filing either as settled would have been false."* That was correct when written, and it is the reason the third boundary stopped at D-119 and left a ten-entry arc behind.

**What closed it is not an argument but a shipped feature.** D-135 built bulk slip upload, which files a machine-read amount into the ledger **without the owner looking at it at all** — a stronger commitment to the pre-fill than the trial D-114 opened ever asked for, and one the owner requested directly. *A question is closed when the code has stopped asking it.* That is the test worth carrying to the next boundary, because it is checkable against the repository rather than against how confident the prose sounds.

**The arc that moved is coherent and finished**: both readers going to Cloud Vision (D-120, D-129), the label and tone-mark work that bounded what a misread mark can do (D-121, D-127), the empty-list refusal and the migration closing it (D-122, D-126), the direction cross-check and the result banner (D-123, D-124), the self-review that found three defects in one day's own work (D-125), and the slip measurement (D-128). **Nothing after D-129 reopens the engine question**, and no entry in the range carries an open one.

### What the rate says, which is the part worth acting on

**Four days of ordinary work took this file 72% → 93%.** The third boundary was treated as an event; at this pace a boundary is due roughly every fortnight and should be routine. The failure mode is not a breach — `check:docs` catches that loudly — it is taking the boundary *under pressure*, where the temptation is to cut at a round number instead of where an argument ends, or to raise the budget because a raise is quicker. **`GOTCHAS.md`'s budget was raised and this one has not been**, and the difference stands: that file is entered through an index, this one is read front to back.

- Evidence: `docs/decisions/ARCHIVE-D-120-D-129.md` (the ten entries, byte-identical to their previous text, under a header carrying the boundary argument), `DECISIONS.md` (index re-pointed, header prose rewritten, bodies removed), `HANDOFF.md`. `pnpm check:docs --strict` passes at **139 decisions, 139 traps** — the same 139 as before the move, which is what proves nothing was dropped — with indexes matching and every reference and path resolving. `DECISIONS.md` **62 KB/117 KB (53%)**, `GOTCHAS.md` **189 KB/254 KB (74%)**. D-133 (the boundary this one was blocked by), D-130 (the byte budget and why bytes), D-134 (the raise precedent and why it does not transfer), D-135 (the feature that closed the question).

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
