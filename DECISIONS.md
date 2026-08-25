# Private Ledger decision log

Last reviewed: 2026-08-09

Entries are append-only. A superseding decision must reference the earlier entry rather than rewriting its history.

This file carries **D-134 onward**. Five settled ranges were relocated unchanged, not rewritten: **D-001 … D-059** to [`docs/decisions/ARCHIVE-D-001-D-059.md`](docs/decisions/ARCHIVE-D-001-D-059.md) on 2026-08-09, **D-060 … D-113** to [`docs/decisions/ARCHIVE-D-060-D-113.md`](docs/decisions/ARCHIVE-D-060-D-113.md) on 2026-08-18, **D-114 … D-119** to [`docs/decisions/ARCHIVE-D-114-D-119.md`](docs/decisions/ARCHIVE-D-114-D-119.md) on 2026-08-19, **D-120 … D-129** to [`docs/decisions/ARCHIVE-D-120-D-129.md`](docs/decisions/ARCHIVE-D-120-D-129.md) on 2026-08-23, and **D-130 … D-133** to [`docs/decisions/ARCHIVE-D-130-D-133.md`](docs/decisions/ARCHIVE-D-130-D-133.md) on 2026-08-24. The index below covers all six files, so a reader can find any entry without opening any body.

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

### Current 
—
 this file

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
- **D-144** — Auto-import v1 is a local fetcher, and binding becomes automatic where the account is unambiguous
- **D-145** — The hosted Sync button proxies ciphertext, and it is a caller of the mail seam rather than a second one
- **D-146** — The fifth archive boundary is shallow on purpose, because two open questions sit immediately behind it
- **D-147** — Binding announces itself where the owner is looking, because the scroll fix was keyed on a stage auto-binding skips

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
