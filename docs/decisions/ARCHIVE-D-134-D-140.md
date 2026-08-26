# Private Ledger decision log — archive, D-134 … D-140

Relocated from `DECISIONS.md` on 2026-08-25, unchanged, because that file reached **94% of its
120 KB byte budget** (D-130). Append-only still applies — a decision superseding one of these goes
in `DECISIONS.md` and references it here.

**This is the sixth boundary, and it is the one the fifth could not take.** D-146 stopped at D-133
and said exactly why: D-133's rule is that *a boundary excludes every open question*, D-140
sharpened it into a test — *a question is closed when the code has stopped asking it* — and two
entries in this very range were still asking. **Both were closed by the owner on 2026-08-25**
(D-149), which is what bought this boundary its depth:

- **D-134** held whether `GOTCHAS.md` splits at its next breach rather than taking a third budget
  raise. The owner chose the split, and it was performed rather than merely promised, so
  `scripts/check-docs.mjs` has stopped asking.
- **D-137** dropped the dark scheme with the owner's own qualifier on it, *"but we'll see"*. He
  settled it: there is no dark scheme, and he will say so if that changes. The qualifier is gone.

**Why it stops at D-140 and not deeper.** D-141 still asks. Its mailbox questions were written
before the mailbox existed, and the mailbox has since been built and run against a real server
(D-144, D-145) — but **whether the source is deleted after import, and so whether the mailbox
becomes a permanent archive of every statement under a non-rotatable password, is deliberately
deferred and unanswered.** Filing D-141 as settled would be false in exactly the way D-146
refused to be, so the same rule that let this boundary go seven entries deep is what stops it here.
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
- **D-120 … D-129 relocated unchanged** to [`docs/decisions/ARCHIVE-D-120-D-129.md`](ARCHIVE-D-120-D-129.md). `DECISIONS.md` goes **109 KB → 62 KB**, from **93% to 53%** of its 117 KB budget, and now carries **D-130 onward**.

### Why this boundary, and why it was not available four days ago

**D-133 explicitly refused to move D-120**, and said why in its own text: *"whether pre-fill stays is still undecided on both paths, and that question attaches to D-120 and D-129, so filing either as settled would have been false."* That was correct when written, and it is the reason the third boundary stopped at D-119 and left a ten-entry arc behind.

**What closed it is not an argument but a shipped feature.** D-135 built bulk slip upload, which files a machine-read amount into the ledger **without the owner looking at it at all** — a stronger commitment to the pre-fill than the trial D-114 opened ever asked for, and one the owner requested directly. *A question is closed when the code has stopped asking it.* That is the test worth carrying to the next boundary, because it is checkable against the repository rather than against how confident the prose sounds.

**The arc that moved is coherent and finished**: both readers going to Cloud Vision (D-120, D-129), the label and tone-mark work that bounded what a misread mark can do (D-121, D-127), the empty-list refusal and the migration closing it (D-122, D-126), the direction cross-check and the result banner (D-123, D-124), the self-review that found three defects in one day's own work (D-125), and the slip measurement (D-128). **Nothing after D-129 reopens the engine question**, and no entry in the range carries an open one.

### What the rate says, which is the part worth acting on

**Four days of ordinary work took this file 72% → 93%.** The third boundary was treated as an event; at this pace a boundary is due roughly every fortnight and should be routine. The failure mode is not a breach — `check:docs` catches that loudly — it is taking the boundary *under pressure*, where the temptation is to cut at a round number instead of where an argument ends, or to raise the budget because a raise is quicker. **`GOTCHAS.md`'s budget was raised and this one has not been**, and the difference stands: that file is entered through an index, this one is read front to back.

- Evidence: `docs/decisions/ARCHIVE-D-120-D-129.md` (the ten entries, byte-identical to their previous text, under a header carrying the boundary argument), `DECISIONS.md` (index re-pointed, header prose rewritten, bodies removed), `HANDOFF.md`. `pnpm check:docs --strict` passes at **139 decisions, 139 traps** — the same 139 as before the move, which is what proves nothing was dropped — with indexes matching and every reference and path resolving. `DECISIONS.md` **62 KB/117 KB (53%)**, `GOTCHAS.md` **189 KB/254 KB (74%)**. D-133 (the boundary this one was blocked by), D-130 (the byte budget and why bytes), D-134 (the raise precedent and why it does not transfer), D-135 (the feature that closed the question).
