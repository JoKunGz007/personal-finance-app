# Private Ledger decision log — archive, D-177 … D-186, without D-179 … D-181, D-183 and D-184

Relocated from `DECISIONS.md` on 2026-09-04, unchanged, because that file reached **116 KB of its
120,000-byte budget — 99%** (`scripts/check-docs.mjs`, D-130). Append-only still applies — a
decision superseding one of these goes in `DECISIONS.md` and references it here.

**This is the thirteenth boundary, and it is the one the twelfth said was waiting on a measurement
rather than an argument.** The twelfth stopped at 74% and named its own fence: D-177 … D-181 were
settled, shipped and deployed, and every one of them was held by the same missing reading — none
had been seen at a true 390px viewport on a real device. **That reading happened on 2026-09-04.**
The owner read `/ledger` on his own phone and sent a vector capture of it, and it found a defect on
its first page (D-187).

**The fence expired for part of the range and not the rest, so this boundary has four holes.** What
the reading covered was `/ledger`: the account filter (D-177) and the date filter (D-178) were on
screen and inside the phone audit's own standard, and the day-heading arc — D-182, D-185's band and
D-186's sticky heading — is closed by D-187 having found its defect, fixed it and deployed the fix.
**What it did not cover stays in the maintained file**: D-179's heatmap and D-183's year view are
`/calendar` and were not in the capture at all, D-180 and D-181's four schemes were seen only in the
one the owner had on, and D-184 answers for D-183 as well as D-182 and cannot leave while half its
subject is still fenced.

*A question is closed when the code has stopped asking it* — the fourth boundary's test, and the one
the twelfth deferred to. For the five moved here the code has stopped asking. For the four left
behind it has not, because nothing has yet rendered them at 390px on a device.

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

## D-178 — The ledger's own date filter, and why it cannot be a client-side filter like every control beside it

- Date: 2026-08-31
- Status: **Built, reviewed, isolated-tested, committed as `5c016a9`, pushed and deployed; confirmed against the owner's real ledger.** `app/transactions-view.tsx`, `app/ledger-controls.tsx`, `app/globals.css`, `tests/transactions.test.ts`, `tests/date-range.test.ts` (new). `app/api/v1/accounts/[id]/transactions/route.ts` and `lib/transactions.ts` were already sitting in the working tree, uncommitted and unauthored this session, when this session started — task 47's SQL-and-route half. `app/api/v1/statistics/route.ts` also touched, one line, unrelated to what it answers (see below).
- Context: D-174 wrote migration 024 for both task 46's account filter and task 47's ledger date range; D-176 pushed it to hosted; D-177 built and shipped task 46's half. This closes task 47's plain date filter — not the calendar heatmap PLAN task 47 also names, which the owner explicitly deferred behind this one on 2026-08-29 and remains unauthorized and unbuilt.

### Every other control on `/ledger` filters rows the client already holds. This one cannot.

Account, Order, Status and Filter all narrow `ledgerWindow`, which `app/transactions-view.tsx` already fetched in full (D-159's line: every page holds only the newest rows for its account). An owner asking for March cannot be answered by hiding whatever happens to already be on screen — the *fetch* has to be bounded, not the display. That is why the date inputs do not filter live like their neighbours: they take effect only on the next Reload, the one control here that already means "go back to the server."

### `appliedRange` versus the live `dateFrom`/`dateTo` — Statistics' `{ search, data }` split, here for a different reason

D-170 held the response beside the search it came from so the page could tell *loading* from *quietly wrong*. Here the split exists because **a second caller reads the applied state**: `loadMore` walks a cursor that `list_account_transactions_page` produced under a specific `p_from`/`p_to`, and it must fence the next page with the *same* bounds — sending the live (possibly just-edited, not-yet-reloaded) values instead would return a page whose rows and whose account totals belong to two different windows stitched into one account. `appliedRange` is set only where `ledgerWindow` is, never from the inputs directly.

### `totals.rows` needed no client-side change to become correct under a window

Migration 024 makes `list_account_transactions_page`'s `totals` bounded by `p_from`/`p_to` when they are supplied, exactly as `ledger_statistics`' did for D-174. `lib/ledger-window.ts`'s `scopeTotals`/`windowReach` already read `AccountWindow.totals` as a server-computed whole-scope fact rather than deriving anything themselves — so once the fetch carries the range, every downstream figure is correct with zero changes to that module. Verified by reading the migration's SQL directly rather than trusting the comment describing it, the same discipline D-177 used on the two-source balance.

### What the reach line would have quietly started meaning, and the line added to say so

"Showing 40 of 40 confirmed rows" reads as *the whole ledger*. Once a window is applied, both numbers are the RPC's bounded count, so 40 could as easily be everything in one narrow month — the same class of silent narrowing D-159 and D-162 both exist to refuse. `Showing confirmed rows {from} to {to}.` now states what the fraction below it is a fraction *of*, on the same rule `app/statistics-view.tsx` states its own window before any figure derived from it.

### `/code-review high` ran before the commit ask, as D-125 requires, and found the same defect class D-177's review found — duplicated, not new

`windowSchema`'s `refine` in this route reimplemented `isUsableRange` instead of calling it — and the identical duplicate already existed in `app/api/v1/statistics/route.ts`, planted when D-174 wrote it. **Both are now `refine(isUsableRange, …)`.** Fixing only the new copy and leaving the shipped one would have been fixing the symptom the review named and not the recurring cause — a comparison this simple reads as obviously correct wherever it is retyped, which is exactly how it drifts unnoticed the day one copy changes and the other does not. Re-verified against the running route after the edit, by request rather than by type-check: an ordered range still answers 200 and a transposed one still answers 400 with its original wording, on both routes.

The review also named `lib/date-range.ts` as untested — `windowSchema` now delegates to it, so its correctness became this route's correctness with nothing exercising it directly. `tests/date-range.test.ts` is new and covers all four functions and the round trip between `rangeSearch` and `rangeFromSearch`; `OPEN_RANGE` and `rangeSearch` itself have no caller yet anywhere in the app, kept rather than deleted because the module's own header names them as the encoding a future calendar/day view (PLAN task 47's other half) would read a deep-linked date through — removing them now would be solving the review's finding by deleting the thing under test rather than testing it.

- Evidence: isolated the same way D-177 was — `git stash push --keep-index` reduced the tree to exactly the intended commit before every check ran. `tsc --noEmit` clean, `eslint .` clean (2 pre-existing warnings in `app/transactions-view.tsx`, both predating this diff — `load` deliberately omitted from two `useEffect` dependency arrays, per their own comments), `check:docs --strict` clean at 177 decisions and 191 traps, `pnpm build` clean, Vitest **906 passed / 7 skipped across 42 files** (+14 over D-177's baseline: 9 for `lib/date-range.ts`, 5 for `ledgerPageSearch`/`cursorAfter`). **No pgTAP re-run — no SQL moved; migration 024 already carries and tests the bounded RPCs (D-174).** Manually verified in a real browser against `next build && next start` with the guarded dev-session route: a transposed range on `/ledger` shows the refusal sentence and disables Reload; a corrected range fires `GET .../transactions?from=…&to=…` for every account and the applied-window sentence renders; separately, direct requests against both routes confirm the `isUsableRange` refactor is behaviour-preserving — 200 for an ordered range, 400 with the original message for a transposed one, on `/api/v1/statistics` and `/api/v1/accounts/[id]/transactions` alike. **Then confirmed against real confirmed rows on the deployed hosted app**, in the owner's own signed-in browser session: narrowing to a real month across all three real accounts changed the figures correctly, the applied-window sentence stated it, and the transposed-range refusal reproduced identically live. No real account ids, dates or amounts are reproduced in this entry or anywhere else in the repository, per D-049. D-174 (the migration this is built on), D-177 (the sibling half and the review pattern this repeats), D-125 (the review-before-commit practice), D-170 (the `{ search, data }` / `{ ledgerWindow, appliedRange }` pattern), D-159 and D-162 (why a silent narrowing is treated as a defect class rather than a one-off).

## D-182 — The ledger reads a day at a time, the strip carries a balance, and the control row stops sizing one row's tracks for another

- Date: 2026-09-01
- Status: **Built, reviewed and gated. Not committed, not pushed, not deployed.** `app/transactions-view.tsx`, `app/ledger-controls.tsx`, `app/ledger-summary.tsx`, `app/ledger-shared.ts`, `lib/slip-reconcile.ts`, `app/globals.css`; `tests/slip-reconcile.test.ts` (+4). No SQL, no route, no contract change — the build still emits **24** `/api/v1/` routes and every project stays on migration 025.
- Context: the owner read the deployed `/ledger` and asked for three things in one message — rows separated by day with a heading, a balance beside Net movement, and a control row whose fields stopped being different widths for no reason. The third turned out to be a defect rather than a preference, and the reasoning behind each of the first two is what this entry is for.

### Day headings, and why the totals could not be summed here

Every row of a day now sits under a heading carrying the weekday, the date, the row count and the day's movements. `lib/slip-reconcile.ts`'s new `dayGroups` returns a map keyed by the **id of the row that opens each day**, so the table asks one question per row while rendering in order rather than restructuring the list into an array of arrays and then keeping two orderings in step.

**The day's figures come from `summarizeRows` — the function the strip above the table already uses — and not from a second summation.** That is the whole design of it: a row the owner excluded through `include_in_reporting` must be absent from the day's money and from the window's money, or present in both. A second loop here is precisely how those two would come to disagree, and D-165 records the last time this app had two answers to one question.

**In and out are printed separately and a net figure is never printed**, which is the owner's own reading on the calendar (D-179) applied one surface along: a day that took 20,000 in and paid 19,500 out is not a 500 day. **A direction that did not move is omitted rather than printed as zero** — the one place this differs from the strip, because the strip is one line read once while this repeats over every day on screen, and a column of `+B0.00` says nothing the absent figure does not.

**Paging needed no special handling and that is worth recording, because it looked like it would.** A day split across a page boundary would grow a second heading only if the rows were grouped per page; they are grouped after `compareRows` has ordered the whole loaded set by date, so every row of a day is contiguous however many fetches they arrived on. `dayGroups` groups **adjacent equals** and says so, and the test asserts both halves — sorted input gives one heading per day, unsorted input gives one per run.

**Grouping is off while a slip or card is being matched by hand, whatever the control says.** That mode lists one captured record and the rows it could be — candidates drawn from across the ledger by bank and amount — so a day heading over them would total unrelated rows. It is the same reason the totals strip disappears entirely in that mode, and the control itself stays live so the setting survives the mode rather than being lost to it.

### The balance follows the account and the window, and deliberately not the search box

The strip goes from four figures to five. The new one is the printed balance of the **newest row in scope**, where scope is the loaded window narrowed by account and by nothing else.

**The owner asked for it to follow the filter, and it does — for the two filters where that is meaningful.** Narrow to March and it reads the balance March closed on, which is why it prints `at` and a date rather than calling itself current. But Status and the search box narrow which rows are *displayed*, and the balance printed on whichever row a search happened to match is not a balance of anything. That is not an omission: it is the same line `app/transactions-view.tsx` already drew for `scope` itself, whose own comment says a running total of whatever a search matched would not be a balance.

**It is uncoloured, alone among the five.** The other four are movements, where the sign is the finding; a balance is a position, and painting a healthy account green would be the strip's opinion rather than the ledger's. An em dash where the scope holds no confirmed row — a window of slips and cash has movements and no printed balance, and no figure is the honest answer.

### The control row was sized for one of its two rows

`.ledger-controls` declared `auto minmax(200px, 260px) minmax(140px, 170px) minmax(200px, 1fr)` — four tracks chosen for the controls that happened to land on the **first** row. The second row inherited them for entirely different controls, so **From** rendered in the 140–170px track while **To** rendered in the 200px–1fr one, and the free-text **Filter** wrapped into that same narrow track and came out narrower than either date. Every complaint the owner made about this row was that one line of CSS.

Four equal `minmax(0, 1fr)` columns now, with the button and the wide field placing themselves, and the grouping toggle on a row of its own because it is a display switch rather than a narrowing.

### The fix for that introduced a phone-width defect that no check could see, and a screenshot caught it

`grid-column: span 2` on the Filter field is correct at four tracks and at two. At the ≤700px breakpoint the grid is **one** track, and a span does not clamp to the tracks that exist — it creates an implicit second column that nothing sizes, so every control landing in it renders at zero width on top of its neighbour. At 390px the Reload button ran off the left edge and the Order and Status labels printed as `ORDSTATUS`.

**`document.documentElement.scrollWidth` read 390 against a 390 viewport throughout.** The phone audit's whole instrument is sideways overflow, and zero-width tracks add nothing to a page's width — so the one committed guard for this surface would have stayed green over an unreadable control bar. It is D-173's family from a new direction, and it is now its own trap in `docs/gotchas/appearance.md`.

### Gate

`tsc` clean; `eslint .` clean (the same 2 pre-existing warnings in `app/transactions-view.tsx`, untouched); `check:docs --strict` clean; `pnpm build` clean at **24** `/api/v1/` routes; Vitest **949 passed / 7 skipped across 43 files** (+8). **pgTAP deliberately not re-run — no SQL has moved since migration 025.** Verified in a real browser against `next build && next start` with **301 invented local rows** seeded for the purpose: 101 day headings over 200 loaded rows, the balance reading the newest row with its date, and the control row correct at 1440px, at 980px and at 390px. No real financial data was read or reproduced.

## D-185 — D-182's day heading declared a band and a rule that both painted nothing, and the fix makes 2px load-bearing

- Date: 2026-09-01
- Status: **Built, reviewed, gated, committed as `0f70c62`, pushed and deployed.** Confirmed in the deployed stylesheet, which now serves `border-top:2px solid var(--navy);background:var(--paper-strong)`. `app/globals.css` and `tests/ui-theme.test.ts` (+1). No SQL, no route, no contract change; every project stays on migration 025.
- Context: the owner looked at the deployed `/ledger` and said the separation between days was still hard to spot. He was describing a preference; what he had actually found was two defects, and neither is visible by reading the CSS.

### Both separators the rule declared were being discarded, each for its own reason

**The band was the ground.** `tr.day-head th` set `background: var(--mist)`. But `.ledger-band` paints no surface of its own, so the ledger table sits directly on `html` — which `globals.css` also paints `var(--mist)`. Measured in the running app under Night, the heading's computed background and the document's were both `rgb(30, 36, 64)`. **The band has never been visible in any scheme since D-182 shipped it**, and no screenshot review would catch it, because there is nothing to see rather than something wrong to see.

**The rule lost a `border-collapse` tie.** The heading's `border-top: 1px solid var(--navy)` meets the preceding row's `td { border-bottom: 1px solid var(--line) }`, and the table is `border-collapse: collapse`. Equal width and equal style, so the tie breaks on document order and the cell higher up wins — the bright `--navy` line is thrown away and the dull `--line` one paints in its place. Distinguishing test, run in the browser rather than reasoned about: forced to red at 1px the border does not appear; at 3px it does, because width beats order.

So the only separation actually reaching the eye was 16px of padding and a slightly smaller uppercase face, competing against an identical `--line` rule beneath every row of the day.

### What was chosen, and why the number matters

Four treatments were rendered on the real markup in all four schemes before the owner picked: a band, whitespace, a whole-day zebra, and a sticky heading. **He chose the band**, which is also the smallest change and the one the existing CSS was already trying to be.

`--paper-strong` is the band, and it needed no new contrast work: `tests/ui-theme.test.ts` already measures "a panel lifting off the ground" as `--paper-strong` against `--mist` at a 1.04 floor in every scheme, so naming the right token *is* the assertion and the ratio is somebody else's test. **2px is load-bearing rather than cosmetic** — it is what wins the collapse. Dropping it to 1px restores the bug with no visible edit and no failing check, which is exactly why it is pinned.

**The ≤700px block is deliberately untouched.** There the heading is `display: block`, so no collapse happens and 1px on the ground paints as written. Nothing changes below that breakpoint — which also means this fix does **not** address the day boundary at phone width, and the owed phone reading still owes that.

### The guard, and the review finding against it

`tests/ui-theme.test.ts` gains one test, red-proved against the pre-fix declaration rather than assumed to work. `/code-review high` found one real defect in its first draft: it selected the rule with `String.match`, which returns the first match in file order, and **two rules carry this selector** — the desktop one and the ≤700px restatement. A mobile-first reshuffle of `globals.css` would have silently moved the assertion onto the phone rule. It now selects by content: the phone rule is the one declaring `display: block`, and this is the one that is not.

### Consequence worth keeping

**A token that resolves to the surface behind it is a live class of defect this repo cannot currently see.** `--mist` on a `--mist` ground is invisible in review, invisible in a screenshot, and invisible to the contrast floors, which only measure pairs somebody thought to list. The trap is recorded in `docs/gotchas/appearance.md`; a general guard is not attempted here.

## D-186 — The day heading sticks, and the reason it could not was the horizontal scroller rather than the heading

- Date: 2026-09-01
- Status: **Built, reviewed, gated, committed as `9e8b75c`, pushed and deployed.** Confirmed on the deployed build with no injected styles: at 1600px the scroller reads `visible`, the heading reads `sticky` and pins across 500px of scroll; at 1200px the scroller reads `auto`, the heading reads `static` and carries its 2px border with no shadow. `app/globals.css` and `tests/ui-theme.test.ts` (+1). No SQL, no route, no contract change.
- Context: the owner asked for the sticky heading after living with D-185's band. It looks like a two-line change and is not.

### `position: sticky` alone does nothing here, and the heading is not the reason

`.table-scroll` carries `overflow-x: auto` so the 1280px ledger table stays reachable on a narrow screen. **CSS drags the other axis to `auto` along with it**, so that element becomes a scroll container and therefore the sticky scrollport. It has no height of its own and never scrolls vertically, so a sticky heading inside it has nowhere to stick. Measured on the deployment before any code was written: with sticky applied and nothing else, scrolling 500px moved the heading the full 500px.

`overflow-y: clip` does not rescue it — paired with `overflow-x: auto` it computes to `hidden`, which is still a scroll container. So the scroller itself has to go, and it may only go where the table does not need it.

### Two options were built and the owner chose after using both

A **width-gated** sticky (drop the scroller only where the table already fits) and a **scroll pane** (give `.table-scroll` a bounded height so it scrolls vertically and sticky works at every width) were rendered behind a switch on the owner's own signed-in deployment. He chose width-gated, and the recommendation agreed, for reasons that were measured rather than asserted: at a 775px viewport with 90px rows, full-page scrolling shows **8 rows** while a pane showing permanent controls shows **6** — the pane charges a quarter of the visible rows for the pinned heading, on the one surface whose job is reading rows in sequence. It also splits the page into two scroll contexts with **Load older rows** stranded in the outer one, since that control is a button after the table rather than a scroll trigger.

### The threshold was measured, and the arithmetic that preceded it was wrong

The first estimate assumed the shell's gutter was a fixed 308px and put the safe floor near 1588px. **The gutter scales with the viewport**, so that was wrong by roughly 200px. Read off the real ledger instead: the page still overflows at **1320px** and no longer does at **1360px**. The gate is **1400px**, verified directly at 1400, 1420, 1440, 1600 and 1688. Below it nothing changes at all.

### A collapsed border does not travel with a pinned cell

A collapsed border belongs to the table rather than the cell, so it stays at the row's original position and scrolls away while the pinned cell moves — the heading arrives at the top of the screen with no rule above it. Proved in an isolated repro over invented rows, pinned and in flow, with the shadow on and off. So `border-top-color: transparent` hands the rule to `box-shadow: inset 0 2px 0 var(--navy)`, which is painted on the cell and travels with the pin; the border keeps its 2px of layout so nothing shifts, and dropping its colour is what stops the in-flow headings drawing the line twice. The outer `0 1px 0 var(--line)` gives the pinned heading a bottom edge against the rows sliding under it.

### `/code-review high` found three, all fixed before the commit

**The rule was unscoped.** `.table-scroll` is shared by six surfaces — the slips list, the import review and three statistics tables besides the ledger — and taking the scroller off all of them to give the ledger a sticky heading is a change nobody asked for. Every one of those tables sits under 1280px and would survive it today, **which is exactly what makes it a trap**: it looks correct until the first wider table is added. Now `.table-scroll:has(> .ledger-table)`, which also fails safe — an engine without `:has()` drops the block and gets the pre-sticky behaviour rather than a broken page.

**The first heading gained a doubled rule.** It sits directly under the `thead`, whose bottom border is already the line there, which is what `border-top: 0` on `:first-child` has always been for. The inset shadow does not inherit that reasoning and painted a second line a pixel below the first. It now takes the bottom edge only.

**The guard pinned neither.** It asserted the substring `.table-scroll`, which matches the scoped and unscoped selector alike, and said nothing about the first-child exception — both defects were reintroduced and the test stayed green. All five assertions now red-prove individually.

### Consequence

**This is desktop-only and deliberately so.** Below 1400px, and at the ≤700px block where the heading is `display: block`, nothing changes — so the phone still shows what it showed before D-185. The owed phone reading now covers ten entries.

