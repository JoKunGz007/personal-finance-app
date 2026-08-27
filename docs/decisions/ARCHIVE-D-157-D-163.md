# Private Ledger decision log — archive, D-157 … D-163, without D-158 and D-161

Relocated from `DECISIONS.md` on 2026-08-27, unchanged, because that file reached **112 KB of its
120,000-byte budget — 96%** (`scripts/check-docs.mjs`, D-130). Append-only still applies — a
decision superseding one of these goes in `DECISIONS.md` and references it here.

**This is the ninth boundary, it is the second one taken in a single day, and it has two holes in
the middle of it.** The eighth moved three entries and left the file at 85%; two decisions and a
review's worth of findings put it back to 96% the same afternoon. That rate is the thing to watch
rather than the percentage, which D-146 said first and which is now demonstrated twice over.

**What made a deeper cut available was a question closing, exactly as D-164 predicted it would be.**
That entry said the ninth would meet the same wall in the same place until D-153's default face and
D-157's metrics were settled. **PLAN task 49 settled D-157's** — the vertical-metric question it
left open is measured and answered in D-166 — so D-157 moves. D-153 has not been settled and does
not.

## The two holes, each with its own reason

D-154 established that a boundary **steps over** an open question rather than stopping short of it.
This is the first time that has been needed twice inside one range.

- **D-158 stays.** `list_match_candidates` reintroduces an unbounded scan; its own migration comment
  says so and nothing has fixed it. The code is still asking, which is D-140's test.
- **D-161 stays**, and it says so itself under a heading reading *What this task created and did not
  close*: there is no account filter and no window picker on the statistics surface. The RPC takes
  `p_from` and `p_to` and the route parses them, with nothing sending them — the code asking a
  question in the plainest possible form. That is PLAN task 46, scoped and **not authorized**.
- **D-160 was the near miss and it moves.** Its own named follow-on was that *nothing sets
  `include_in_reporting`* — which PLAN task 48 built on the same day (D-165). Had that not shipped,
  this range would have stopped at D-159.

## What this range covers

The typeface `size-adjust` and the route titles (D-157), the combined balance computed once in SQL
(D-159), the rule that **division never produces money** — now an invariant in `SPEC.md` rather than
an argument (D-160), the partial-period comparison the real ledger disproved (D-162), and money
carrying its direction as colour while leaving the pixel stack (D-163).

**What the maintained file is left holding is four singletons and the live frontier**: D-141, D-153,
D-158 and D-161, each alone because each is still asking, then D-164 onward. A reader arriving at
that file gets the open questions and the current work and nothing settled — which is what it is
for, and the fragmentation is the price of the rule being kept rather than a sign of it slipping.

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

## D-162 — A partial period is not comparable to a whole one, and the first look at the real ledger is what said so

- Date: 2026-08-27
- Status: **Done.** `app/statistics-view.tsx`, `app/statistics-charts.tsx`, `tests/statistics.test.ts`.
  Deployed surface only; **no migration and no schema change**, so nothing hosted moved.
- Context: the owner opened the deployed `/statistics` for the first time and sent screenshots.
  Follows D-161 within the hour, on the pattern D-158 → D-159 already set.

### What the real ledger showed that no fixture could

**The opening month rendered a comparison of `+1002%`.** July 2025 is a **partial** month — the
ledger starts on the 3rd — and it was being compared against a full August. The arithmetic was
correct and the figure was meaningless: twenty-nine days of spending against thirty-one is not a
rate, and nothing on the row said so.

**The invented fixture could not have found it.** Five months, and its first month was partial too —
but the *second* month's comparison looked unremarkable because the seeded amounts were flat. A real
ledger's opening month is short **and** unrepresentative, and only the second of those shows up as an
absurd number.

**The rule: a comparison is printed only when both periods are whole.** Suppressed rather than
corrected — rescaling either side to a common length would invent spending no statement records, and
the exact figure for each month is already in its own row. The cell carries a `title` saying which of
the two reasons applies, so an em dash is never unexplained.

**The axis printed `Jul` and `Aug` twice.** Fourteen months from July 2025 to August 2026, and two
pairs of labels were indistinguishable. The year is appended only when the window actually spans more
than one, so the ordinary case stays uncluttered; the label-thinning threshold widens to match.

### What was checked rather than assumed

**The screenshots are in a pixel face, and reading figures off one is not evidence.** Two apparent
discrepancies in the totals were digits misread, not defects. The identities were therefore
**cross-checked against the real distribution in the database**, not against the picture: the
day-of-week split and the monthly series each sum to the same **1,604** transactions and to the same
money as the whole-window total, across **14** months and **7** buckets. That is D-159's move — an
independent derivation over the real data rather than over invented rows — and it is the only thing
that turned "these numbers look odd" into "these numbers are right".

**Every one of the 1,604 rows is reportable**, so `include_in_reporting` still moves no figure.
**But the real ledger now shows exactly why it will**: a `Transfer Withdrawal` and a
`Transfer in` of the same amount on the same date appear in the two largest-movement lists — one
internal transfer, inflating both money-in and money-out while net stays correct. **That is the
argument for building the control**, and it is no longer hypothetical.

- Evidence: Vitest **853 passed / 7 skipped across 41 files** (from 849; four assert the comparison
  predicate directly, so a refactor that drops the guard fails rather than printing the figure
  again). pgTAP **347 across 11**, Playwright owner **32/32**, isolated **34 / 4 skipped**, build
  clean, `tsc`, `eslint` and `check:docs --strict` clean. Related: D-161, D-159 (look at the deployed
  thing; cross-check against the real distribution), D-138.

## D-163 — Money carries its direction as colour and never renders in a pixel face, and phone rows become real cards

- Date: 2026-08-27
- Status: **Done.** `app/globals.css`, `app/ledger-summary.tsx`, `app/ledger-statement-row.tsx`,
  `app/statistics-view.tsx`. **No migration, no schema, no route.** Three of the owner's four
  requests from 2026-08-27; the fourth (font metrics) is measurement-first and is PLAN task 48.
- Context: the owner asked for red/green on money, for rows that separate on a phone, and for
  amounts that do not shift when the typeface changes.

### The chart's green fails as text, and that is not a detail

`#5c8a1a` clears the dataviz checks as a **mark** — those need 3:1 against the surface. As **text**
it measures **4.03** on this paper against the 4.5 that body text requires. Reusing the chart value
for coloured figures would have shipped an accessibility regression on the strength of a check that
had already passed for a different purpose. Money-in is therefore `--money-in: #4a6f14` (**5.75**),
a darker step of the same hue; money-out is `--money-out: #9b2c2c`, which is `--red` and passes both
bars at **7.37**. **Two tokens, two contrast bars, one hue family.**

**`.positive` already existed and was the reason green read as grey** — it pointed at
`--celadon-ink`, a dark olive. There was no `.negative` at all, so money out had never been coloured.

**Colour is applied by value, not by role, wherever the figure can cross zero.** Deposits are always
money in; a *net* is not, and colouring it by its heading would tell the owner he gained in a month
he lost. Zero stays neutral in every case — calling it an arrival is a judgement the ledger never
made. Every coloured figure still prints its own sign, so colour reinforces and never carries the
meaning alone.

### Amounts leave the pixel stack, and the reason is a mistake that already happened

`--font-data` is redefined per typeface, so **every figure in every table was being drawn in the
chosen pixel face**. That is not cosmetic: at small sizes those faces render `0`, `2`, `5` and `8`
closely enough to be transposed, and it happened for real — two figures were misread off a
screenshot of the deployed statistics page and were nearly reported as arithmetic defects (D-162).
A face that a careful reader misreads on a screenshot is a face the owner misreads at a glance.

`.numeric` now takes `--font-money`, which is the mono stack under every typeface. **The pixel
character stays on prose, headings and labels; the numbers do not take part.** The per-face
`font-size` step-downs that existed to shrink pixel glyphs inside numeric cells are removed with
them — they would otherwise shrink a mono face that never needed the correction.

### A hover cannot fix a phone

The stacked mode already turned each row into a block, but every one shared the page background and
was parted from the next by a single hairline, so a list ran together into one field of figures.
Desktop never showed it: the columns do the separating there, and `tbody tr:hover` picks out the row
under the pointer.

**That hover is exactly why the fix could not be one.** There is no hover on a touch screen, so the
device with the problem is the device the existing remedy never reaches. Rows are real cards now — a
gap, a border, and the `--frame-outer` / `--frame-inner` pair the panels already use, so the
treatment is this app's existing vocabulary rather than one invented for tables. The statistics
tables gained the desktop hover they never had.

- Evidence: Vitest **853 passed / 7 skipped across 41 files**, Playwright owner **32/32**, isolated
  **34 / 4 skipped**, build clean, `tsc`, `eslint` and `check:docs --strict` clean. Re-screenshotted
  at 390px through `.runtime/statistics-audit.spec.ts`: **document 390px against a 390px viewport**,
  zero elements over, zero blank tiles. Contrast measured rather than judged. Related: D-162 (the
  misread figures), D-157 (`size-adjust`, and its standing note that it does not fix width), D-137,
  D-138.
