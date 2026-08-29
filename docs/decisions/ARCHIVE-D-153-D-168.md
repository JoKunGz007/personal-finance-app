# Private Ledger decision log — archive, D-153 and D-164 … D-168

Relocated from `DECISIONS.md` on 2026-08-29, unchanged, because that file reached **103 KB of its
120,000-byte budget — 86%** (`scripts/check-docs.mjs`, D-130). Append-only still applies — a
decision superseding one of these goes in `DECISIONS.md` and references it here.

**This is the tenth boundary, and it is the one D-164 and D-167 both predicted.** Each of them said
the same thing: what buys a boundary its depth is a question closing, not a chore. D-153 — the
default face — had fenced this file from below since the eighth boundary priced a deeper cut and
refused it. **D-169 closed it on 2026-08-29** by answering with Pixelify Sans, a face the question
had not been framed around, and D-153 became movable the moment the owner chose.

**The range steps over D-158 and D-161, which the ninth boundary also stepped over** (D-154's rule).
Both are still asking: `list_match_candidates`' unbounded scan is recorded in its own migration and
unfixed, and D-161's own *did not close* list still names the account filter, which needs migration
024. D-141 sits below the range and stays for the same reason.

**It stops below D-169 and D-170 on purpose.** Both shipped on 2026-08-29 and **both change what
renders**, and nobody has looked at either on the deployment — the default face is what a device
with no cookie now gets, and the window picker is a new control surface. D-164 refused to archive a
measurement in the session that revised it; the same reasoning refuses to file a rendering change as
settled before anything has rendered it where the owner can see. Two entries of headroom is what
that honesty costs, and at 61% the file can afford it.

The full reasoning is D-171 in `DECISIONS.md`.

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

## D-168 — Five controls reach the tap standard on a phone, and the instrument that should have caught them had been blind since the change that hid its sign-in

- Date: 2026-08-29
- Status: **Accepted, committed and deployed** as `3b1205d`. `app/globals.css` only — five rules inside the existing `@media (max-width: 700px)` block. No SQL, no route, no contract, no CSP change. `.runtime/mobile-audit.spec.ts` was repaired and extended alongside it and remains gitignored.
- Context: the owner granted a browser session against the real deployment, which produced the first phone-width reading anyone has taken of `/statistics` and of task 48's control.

### What was wrong

**Task 48's own control was one of the five.** `.match-control .secondary-button` is 36px and `app/ledger-statement-row.tsx` wraps Exclude/Include in `.match-control`, so the control that shipped in `17a93ca` went out **8px under the phone standard this repo set for itself** — on `/ledger`, which is the surface D-138 was found on. Four others sat with it: `.note-toggle` at 26×26, `.header-toggle` at 40px, `.font-picker select` at 34px, and `.matching-banner .secondary-button` at 38px.

**`.note-toggle` is the sharpest of them because D-156 made it load-bearing.** Folding standing copy behind the `(i)` means the `(i)` is the only route back to that copy; at 26px on a phone, the rule that saved vertical space put its own escape hatch under the tap standard.

### Why nothing saw it, which is the part worth keeping

`.runtime/mobile-audit.spec.ts` is the only instrument that measures tap targets at 390px, and it clicks `Dev sign-in` directly. **D-157 put every header control except the brand and the route row behind a `Settings` disclosure below 700px**, and the sign-in went with them — so the audit has timed out at phone width since `d7411b3` and nobody noticed for three days, because a gitignored throwaway only fails when someone asks it to run. **The change that introduced small controls and the change that blinded the audit shipped the same day.**

Behind that sat a second, larger blind spot: **navigation resets the disclosure**, so every measurement the audit has ever taken ran with the panel shut, and the privacy chip and font picker were never inside a measured viewport at all. D-139 had already written the rule this breaks — *a surface that only exists after an action is a surface no walking audit can measure* — and it is now the third entry to be bitten by it.

### What changed, and what deliberately did not

Raised **at phone width only**, which is D-139's rule unchanged: the desktop base stays compact for a pointer. `.match-control` buttons and `.matching-banner` to 44px, `.header-toggle` 40→44, `.note-toggle` 26→44, `.font-picker select` 34→44.

**The `/import` checkbox was measured at 24×24 and left alone.** It sits inside a `<label>`, so the label is what a thumb hits; inflating the box would have fixed the measurement rather than the problem — the same error as measuring the table instead of the cell. The audit now credits a wrapping label, but only when the label itself clears 44px.

**`.matching-banner` is the one change resting on reasoning rather than a measurement**, because the banner exists only after a match and no walking audit reaches it. `/code-review high` confirmed the selector lands on real markup in `ledger-summary` and wins its cascade; that is weaker evidence than a reading and is recorded as such.

### A sixth control, and only the real ledger could show it

**`.link-button` measured 106x42 on the deployed `/ledger` — two pixels short.** The expand-the-hit-area pattern was already applied to it (`padding-block: 12px; margin-block: -12px`) and the arithmetic was simply out: an 18px line plus 12px each side is 42, not 44. Raised to 13px, with the negative margin tracking it so the layout footprint does not move.

**No local audit could have found this.** The only `.link-button` on `/ledger` is *Load older rows*, which renders **only when there are more rows than the page holds** — and the phone harness seeds six. It took the owner opening the real 1,604-row ledger in a narrow window to put the control on screen at all. That is D-138 and D-139 arriving from a third direction: not a surface behind an action this time, but **a surface that exists only with enough data behind it**, which invented fixtures are structurally unable to produce.

**The reading was taken at 478px, not 390.** Chrome clamps a window to roughly 500px wide, so window resizing cannot reach phone width on this machine at all — phone layout was active because the breakpoint is 700px, but this is not a phone-width reading and is not recorded as one. Device emulation remains the only thing that reaches 390, and a real phone remains the only thing that is one.

### The cost is measured, because a comment saying *measured* is a claim that has to be true

The audit shrinks every `.note-toggle` back to 26px in place, reads `body.scrollHeight`, restores and reads again — one pass, no second run. **`/ledger` grew 3788 → 3857 (+69px)** and the other four routes +18px each. Five `(i)` cost 69px and not 90, because some sit beside content already taller than 44px. That is exactly the arithmetic a comment would have gotten wrong (D-153's own lesson, restated).

### Evidence

`app/globals.css`, `.runtime/mobile-audit.spec.ts`. Phone audit at 390px: **all five routes plus a disclosure-open pass report `tap targets: all >= 44px`**, no route pans sideways (390 vs 390), and task 48's Status cell measures 324 against 324. Vitest **873 passed / 7 skipped across 41 files**; Playwright owner **33/33**, isolated **38 passed / 4 skipped** — including *switching the typeface moves nothing on the page* and axe on every route, both on the `mobile` project, which are what hold D-166's invariant across this change. `tsc`, `pnpm exec eslint .` and `check:docs --strict` clean; build clean. **pgTAP deliberately not re-run — no SQL moved.** D-138 (the defect class), D-139 (the rule this breaks for the third time), D-156 (why the `(i)` is load-bearing), D-157 (what hid the sign-in), D-165 (the control that shipped short).

