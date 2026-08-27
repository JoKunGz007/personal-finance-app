# Private Ledger decision log — archive, D-154 … D-156

Relocated from `DECISIONS.md` on 2026-08-27, unchanged, because that file reached **116,722 of its
120,000-byte budget — 97%** (`scripts/check-docs.mjs`, D-130). Append-only still applies — a decision
superseding one of these goes in `DECISIONS.md` and references it here.

**This is the eighth boundary and the shallowest of the eight: three entries, 20 KB, where the
seventh moved eleven.** That is not caution and it is not a smaller argument. It is that this range
is fenced on **both** sides by questions the code has not stopped asking, where every earlier
boundary was fenced on one.

**Below it, D-153 is still asking.** The typeface preference shipped with `DEFAULT_FONT` set to
`system`, and D-153 says in its own words that flipping that one constant is the whole of making
Press Start 2P the default. The owner leans to it and has not decided. That is D-137's *"but we'll
see"* in a different costume, and the fifth boundary refused to move D-137 for exactly this reason.

**Above it, D-157 is still asking, and more loudly than when it was written.** PLAN task 49 is
authorized and re-opens the very measurement D-157 took: `size-adjust` pins cap height and not
advance width — D-157 states that as a limit and `app/globals.css` repeats it — and task 49 exists
to decide which of `ascent-override`, `descent-override` and `line-gap-override` are worth pinning
on top of it. Archiving a measurement in the same session as the work that revises it would be
filing a live argument as settled, which is the one thing an archive must not do (D-133).

**D-158 is asking too**, one entry further up: `list_match_candidates` reintroduces an unbounded
scan, its own migration comment says so, and nothing has fixed it.

## What made these three movable

- **D-154 is the seventh boundary, and this file is its answer.** Its forward-looking half was
  advice to whoever took the eighth — that a markdown link written relative to the repo root
  resolves two directories wrong once its entry lives in `docs/decisions/`. Taking the eighth
  discharges that advice, and it is restated in the entry recording this boundary so the maintained
  file does not lose it. Precedent agrees: the fifth boundary was archived by the seventh, the third
  by the fifth. **Nothing in this range carries a relative link**, so no target needed re-pointing;
  `check:docs --strict` would have named it if one had.
- **D-155 is superseded in as many words by D-158**, which paged the ledger that D-155 had
  deliberately left unpaged — and D-155 itself had named the migration as the price of doing so.
  A superseded entry is the least ambiguous case of a closed one.
- **D-156 left one thing unfixed and said so under its own heading** — the phone shell header, which
  it declined to touch because the owner's critiques were about the ledger page and the header is
  every route's. D-157 fixed it one entry later at the owner's direct request. The deferral closed.

## What this costs, stated here rather than discovered at the ninth

`DECISIONS.md` goes **97% → 80%**, which is roughly four ordinary entries of headroom against a rate
that has recently run three to five entries a day. **The ninth boundary is therefore near, and it
will meet the same wall in the same place** until D-153's default and D-157's metrics are settled.
That is what D-146 said about the sixth, and it was true again here. **Depth is bought by closing
questions, not by cutting harder** — and the two that bound this one are both live work, not
neglect.

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
