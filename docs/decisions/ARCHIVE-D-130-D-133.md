# Private Ledger decision log — archive, D-130 … D-133

Relocated from `DECISIONS.md` on 2026-08-24, unchanged, because that file reached **94% of its
120 KB byte budget** (D-130) and this was the oldest contiguous range that had genuinely closed.
Append-only still applies — a decision superseding one of these goes in `DECISIONS.md` and
references it here.

**Why the boundary sits at D-133, and why it could not sit any deeper.** These four are the
continuity-hygiene arc, and they close cleanly on each other: the size guard that measured lines
while the files grew sideways (D-130), the handoff and plan rewrites that followed from it (D-131),
the ledger view's markup split (D-132), and the third archive boundary, which is the first
application of the rule this file is a later application of (D-133).

**The next entry is where it stops, and that is the finding worth carrying.** D-134 raises the
traps budget and says the *next* breach is owed a split rather than a third raise — a condition
that has not fired, since `GOTCHAS.md` is at 79%. D-137 drops the dark scheme with the owner's own
qualifier on it, *"but we'll see"*, and nobody has yet looked at a bright page on a dark-OS phone at
night. **D-133's rule is that a boundary excludes every open question**, and those are two open
questions sitting immediately behind this one. So this boundary is shallower than the fourth was —
it lands at 82% rather than 56% — and the honest reason is that the archive cannot go deeper until
those two close. **Closing them is what buys the next boundary its depth**, not a larger cut here.

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
