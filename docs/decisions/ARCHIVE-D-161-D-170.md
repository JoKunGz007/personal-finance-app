# Private Ledger decision log — archive, D-161, D-169 and D-170

Relocated from `DECISIONS.md` on 2026-09-01, unchanged, because that file reached **116 KB of its
120,000-byte budget — 99%** (`scripts/check-docs.mjs`, D-130). Append-only still applies — a
decision superseding one of these goes in `DECISIONS.md` and references it here.

**This is the eleventh boundary, and all three entries here were named as movable and left unmoved
for a session.** D-161 was the statistics surface's missing filters, closed for good on 2026-08-31
when D-177 shipped the account filter beside D-170's already-shipped window picker. D-169 and D-170
were the tenth boundary's own deliberate exception — both shipped 2026-08-29 and both change what
renders, and the tenth boundary (D-171) refused to archive either until the owner had seen the
rendering on the real deployment. **That fence expired on 2026-08-31**, when D-177's own
verification opened `/statistics` live on the hosted app — the default face and the window picker
both rendering in the one place either could be seen — but the DECISIONS.md header still claimed
"nobody has looked" for a full session afterward, until the sync that produced D-179 corrected it.
This boundary is the first one taken since that correction landed.

**D-161 sits with D-169 and D-170 rather than beside D-162 … D-168**, which the ninth and tenth
boundaries already moved to `ARCHIVE-D-157-D-163.md` and `ARCHIVE-D-153-D-168.md` respectively —
D-161 was stepped over both times because it was still open, and only closes here.

**The range steps over D-141 and D-158, which every boundary since the ninth has also stepped
over** (D-154's rule). Both are still asking: whether the mailbox source is deleted after import
remains deferred by the owner, and `list_match_candidates`' unbounded scan is recorded in its own
migration and unfixed. Neither closed this session, so neither moves.

The full reasoning for what closed D-161 is D-177 in `DECISIONS.md`; for D-169 and D-170's rendering
fence lifting, D-177 and D-179.

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
