# Private Ledger gotchas — Layout, typography and accessibility

Split out of `docs/gotchas/app.md` on 2026-08-27 (D-158), unchanged. **18 traps.**

**The split was owed rather than chosen.** D-134's rule is that a breach of the byte budget splits
a section along its own seam rather than raising the budget, and D-149 honoured that once already
when `GOTCHAS.md` became an index. `app.md` reached 92% while the paging work was landing, and the
half that had grown fastest was the visual one — the typeface measurements, the colour tokens and
the accessible-name traps. That half is a subject in its own right, which is what makes this a seam
and not just a cut at the halfway mark. What stays behind is auth, routing, session state, client
data flow and the OCR-adjacent traps.

`GOTCHAS.md` keeps the index across every section and is still the way in — it lists every trap in
this file, so a reader finds the one that applies without loading any body. Add a trap here and add
its title to that index; `pnpm check:docs --strict` fails if the two disagree.

Each trap states the symptom, cause, prevention, and verification. What a date on a `Verify:` line
means, and what a backfilled `Dated <date> from <sha>` clause does not, is explained at the top of
`GOTCHAS.md`.


## A `role="status"` added to a static notice breaks every existing spec that looks one up by role

- Symptom: ten owner-session specs that passed the day before all fail at their sign-in step with `strict mode violation: getByRole('status') resolved to 2 elements`, after a change that touched none of them. The new feature's own specs pass.
- Cause: a new section rendered a "this browser cannot do X" notice as `role="status"`. Playwright's `getByRole` is strict, so a second status live region anywhere on the page breaks any helper that resolves one. The new specs passed because they stub the capability the notice reports on — so for them the notice never rendered, while for every other spec, running in headless Chromium without `BarcodeDetector`, it always did. The stub hid the regression from precisely the tests that would have caught it.
- Avoid: `role="status"` is for what just happened, not for what is true. Static explanatory text is a plain paragraph. When adding a live region to a shared page, grep the specs for `getByRole("status")` first — and treat "my new tests pass but old ones fail" as evidence about the new tests' fixtures, not about the old tests.
- Verify: 2026-07-30. Owner suite went 5 passed / 10 failed to 15/15 with the role attribute removed and nothing else changed.

## A second `role="status"` in the shell makes every existing status assertion ambiguous

- Symptom: a live region added to a shared header turns unrelated specs red with `strict mode violation: locator resolved to 2 elements`, on assertions that were not touched.
- Cause: `getByRole("status")` matches every element with that role on the page. Each route here already has exactly one status line, and specs read it unscoped. A shell element carrying `role="status"` — or an `<output>`, which computes to the same role — appears on all of them at once.
- Avoid: a shell-level announcement can use `aria-live="polite"` on a plain element, which announces identically and does **not** compute to `role="status"`, and specs then target it by class. Where a second status role is genuinely wanted, scope the existing assertions to their section first, in a separate change, so the two failures do not arrive together.
- Verify: 2026-07-31. `app/site-header.tsx` uses `aria-live` and `signIn()` reads `.session-state`; owner-session passes 16/16 with per-route status assertions untouched.

## An `aria-label` replaces a button's words rather than adding to them, and axe says nothing

- Symptom: a Playwright locator asking for a button by the words printed on it times out, and the button is plainly there in the trace. It reads as a bad selector.
- Cause: `aria-label` **overrides** the visible text as the accessible name. A button reading `Not this slip` labelled `This slip is not the row dated 10 Jun 2026` has an accessible name that does not contain its own words, so `getByRole("button", { name: "Not this slip" })` cannot match. The real cost is not the test: it breaks WCAG 2.5.3 (label in name), so a voice-control user saying what is written on the button reaches nothing. axe passes it — the element *has* a name, and axe cannot know the name is not the one on screen.
- Avoid: when a repeated control needs a per-row name, **start the label with the visible text** and append the distinguishing detail — `This is it — 10 Jun 2026 at 11:05, balance ฿7,850.00`. Locate it in tests by an anchored prefix on the visible words, and by the row it sits in for the rest.
- Verify: 2026-08-07. Both D-069 controls relabelled; the spec locates them by `/^Not this slip/` and `/^This is it/` and passes, with the two axe passes over the loaded ledger still clean — which is the point: axe was clean before the fix too.

## A control that disables itself takes the focus with it

- Symptom: activating a button by keyboard appears to work — the mode changes, the live region announces it — but the next Tab starts from the top of the document. Nothing is reported by axe, and every text assertion in the suite passes.
- Cause: a browser blurs an element that becomes `disabled`, and focus falls to `<body>`. Any control whose own click disables it does this: `onClick={() => setMatching(id)}` on a button whose `disabled` prop reads the same state. An `aria-live` announcement does **not** restore a position in the tab order — it says what happened and leaves the user nowhere.
- Avoid: when an interaction replaces the controls on screen, move focus deliberately to a control that is certainly present in the new state — the way out of the mode is usually the right one. A `ref` plus a `useEffect` on the mode flag is enough. Assert it: `await expect(page.getByRole("button", { name: "Cancel" })).toBeFocused()`.
- Verify: 2026-08-07. `app/transactions-view.tsx` focuses the picking mode's `Cancel`; `tests/e2e/owner-session.spec.ts` asserts it. Found by review, not by the suite — the axe passes over that exact screen were green before and after.

## A token that inverts between colour schemes makes every hardcoded partner a latent failure

- Symptom: a surface is unreadable in exactly one colour scheme — white text on a light fill, or dark text on a dark one — while looking perfect in the other. Nothing in the file draws attention to it, and whichever scheme you develop in is the one that looks right.
- Cause: a rule pairs a **variable** with a **literal** — `background: var(--navy); color: white`. `--navy` is the *text* colour, so it flips from near-black to near-white between schemes while the literal cannot. `app/globals.css` had three: `.skip-link` and `.brand-mark` were white-on-cream in dark, and `.stage-nav li.active span` and `.secondary-button:hover` were white on the brightened action colour at 2.5:1. `.primary-button` had the identical pairing **and** a dark-mode override, which is what made the other two look deliberate.
- Avoid: pair a variable with a variable. `background: var(--navy); color: var(--paper)` is correct in both directions by construction, with no override to keep in step. Where a literal is unavoidable, the test is mechanical: **grep the file for every rule that sets both a `var(--…)` background and a literal colour, and check each one has a dark-mode partner.** An override on one such rule is evidence the author knew, not evidence the others were considered.
- Verify: 2026-08-21 (D-136), all three found while reasoning about every filled surface at once during a palette change — not by looking at the app, which is the point. Neither browser suite's axe check caught them: they run in the default scheme.

## The browser suite that covers the signed-in app is desktop-only, so phone width is unmeasured there

- Symptom: an accessibility or layout question about a phone gets answered from the CSS, because "the browser suite passes" feels like it covers it. It does not, for any surface behind a sign-in.
- Cause: `playwright.isolated.config.ts` has both a `desktop` and a `mobile` project, but it **ignores both owner specs** — so its mobile project only ever sees the signed-out shell. `playwright.owner.config.ts`, which is the one that signs in and drives the ledger, slips and import, declares `projects: [{ name: "desktop" }]` and nothing else. The gap is invisible because the two configs are read separately and each looks complete.
- Avoid: before answering anything about small-screen behaviour, check which config renders the surface and what projects it declares. For a one-off measurement, a throwaway config under `.runtime/` pointing `testDir` at itself is enough — but **set `webServer.cwd`**, because Playwright defaults it to the config file's own directory and `pnpm build` then runs inside `.runtime/` and fails on a module it cannot resolve.
- Verify: 2026-08-21 (D-136). `.runtime/mobile-audit.spec.ts` found a 47px heading floor, four sub-44px tap-target classes and a clipped active-route marker, none of which any passing suite had ever rendered.

## A colour declared outside the stylesheet does not move when the stylesheet does

- Symptom: a phone shows a band of the *previous* palette in the browser's own chrome above the page, while the page itself is correct. On desktop everything looks right, and no screenshot shows it — a headless capture renders the page, never the surrounding browser.
- Cause: `themeColor` in `app/layout.tsx` is a `<meta>` value, not a custom property, so a palette change in `app/globals.css` leaves it behind. It sat at the pre-retheme `#eaf0f4` for a day and across two production deployments. Nothing in this repo's gate reads it: tsc sees a valid string, ESLint sees a valid string, and both browser suites assert on page content.
- Avoid: treat `app/layout.tsx`'s `viewport` export as part of the palette. `themeColor` must equal `--mist`, and `colorScheme` must match what the stylesheet actually declares — the file says so at the declaration. The general rule is the part worth carrying: **grep for colour literals outside the stylesheet before calling a retheme done** — `themeColor`, `public/manifest.webmanifest`, any inline `style`, and any SVG shipped with a fill.
- Verify: 2026-08-21 (D-137), found by reading `app/layout.tsx` for an unrelated reason — and the sweep this entry prescribes then found **three more the same minute**: `public/manifest.webmanifest` carried the old blue-grey as both `background_color` and `theme_color` (the installed-app splash and chrome), and `public/icon.svg` was still a navy plate with blue-grey rules (the app icon and favicon). Four stale colours, none of which any suite, any type-check or any screenshot would ever have reported. `grep -rn "eaf0f4\|1f3d57\|102b46\|1769aa" app public lib` is the check worth repeating.

## An element selector cannot reset a property a class set, and the rule still reads as if it did

- Symptom: a responsive override looks complete and is ignored for the one element it was written for. `table, tbody { display: block; min-width: 0; }` inside a phone media query, with a table that keeps a 1280px minimum width anyway.
- Cause: specificity, not the media query. `table` is 0,0,1 and `.ledger-table { min-width: 1160px }` is 0,1,0, so the class wins wherever both apply — a media query changes **when** a rule is considered, never how strongly it competes. The rule reads as a blanket reset because it names the element every table is, which is exactly what makes it convincing in review. The damage here needed a second rule to become visible: `.table-scroll { overflow: visible }` in the same block removed the scroll container that had been holding the width in, so the overflow escaped to the document and the whole page zoomed out on a real device.
- Avoid: reset at the specificity that set it — name the class, or every class, in the override. When a media block relaxes a container's `overflow`, check what that container was holding: an `overflow-x: auto` on a wrapper is often the only thing standing between a `min-width` and the viewport. And treat `1fr` in a grid as `minmax(auto, 1fr)`: its floor is min-content, so a track holding a `<select>` with a long option will not shrink and the grid overflows instead. Write `minmax(0, 1fr)` when shrinking is the point.
- Verify: 2026-08-21 (D-138), found by the owner on his own phone after a deployment, then red-proved with `.runtime/mobile-audit.spec.ts` reporting `scrollWidth 1296 vs 390` before the fix and 390 after.

## A layout audit against a page that loads nothing measures the absence of the thing it was written for

- Symptom: a measurement harness reports every route clean, and the defect it was written to find is sitting in production. The numbers are not wrong — the page it measured genuinely had no overflow, because it had no content.
- Cause: nothing in this app loads until an action asks it to, so a harness that signs in and reads the DOM sees empty shells. A `min-width` on a table that was never rendered cannot be measured, and an audit reporting "overflow: none" about a page with no table reads exactly like an audit reporting it about a table that fits. **This is worse than a wrong number**, because a wrong number invites a second look and a clean report closes the question.
- Avoid: make the harness **assert the subject exists** before it measures — `expect(page.locator("table")).toHaveCount(1)` — so a run that finds nothing fails instead of passing. Then seed whatever the route needs: for `source_transactions` that means `set session_replication_role = replica` (it is append-only and refuses DELETE), a 64-hex-character `fingerprint`, `fingerprint_version = 'fingerprint-v1'`, and components at `position` 1 or 2. The general form: **an audit's first assertion should be that it is looking at something.**
- Verify: 2026-08-21 (D-138). The previous version of that audit reported four clean routes on the same commit whose ledger table was 1280px wide at 390px; the gap had been named in D-136 and in `PLAN.md` task 28 the day before, and naming it did not stop it.

## A descendant's accessible name joins its ancestor's, and axe reports no violation for it

- Symptom: a landmark or heading is announced with text that belongs to a control inside it — measured here as the ledger region named `"Transactions About these transactions Everything committed to the ledger…"` once a disclosure was open. Every accessibility check still passes.
- Cause: accessible-name computation walks descendants. A `<button>` inside an `<h2>` contributes its own name to the heading's, and if that heading is an `aria-labelledby` target the whole thing becomes the `<section>`'s name too. **axe has nothing to report**: the name is non-empty and contains the visible text, which is all it checks.
- Avoid: put an interactive affordance **beside** the heading, not inside it, whenever the heading names a region. `aria-label` on the button does not help — an ancestor's name computation uses a descendant's `aria-label` just as readily as its text.
- Verify: `tests/e2e/ledger.spec.ts`, "keeps the disclosure out of the name of the heading and the landmark", which matches with `exact: true` — the only form that catches it. Red-proved by putting the button back inside the `<h2>` and watching it fail. Dated 2026-08-26.

## `display: block` on a flex item is blockified away, so it cannot break onto its own line

- Symptom: a panel written as `display: block` inside an `inline-flex` wrapper renders *beside* its trigger instead of below it, shrink-to-fit against whatever width is left — at 390px a narrow tall column wedged into a heading. The rule reads as if it should work and the comment beside it says so.
- Cause: a flex container blockifies every child's `display`, so `block` is exactly equivalent to the `flex item` it already was. Nothing about `display` affects line breaking inside a flex row.
- Avoid: `flex-wrap: wrap` on the container and `flex-basis: 100%` on the item that must own a line. `.session-state` in `app/globals.css` was already doing it that way.
- Verify: `app/globals.css`, `.heading-note` / `.note-panel`. Dated 2026-08-26, found by `/code-review`.

## A typeface's cap height, not its `font-size`, decides how big it looks

- Symptom: one face in a switcher renders far larger than the others at identical CSS sizes — measured here as Press Start 2P at **1.43x** IBM Plex — and stepping down individual selectors fixes only the elements somebody thought to name, leaving headings and buttons wrong.
- Cause: `font-size` sets the em, and faces place their capitals differently within it. Cap heights per 100px: IBM Plex **70**, Press Start 2P **100** (a full em, which is unusual), Pixelify Sans and Silkscreen **63**.
- Avoid: give each face a measured `size-adjust` on its own `@font-face`, so one CSS size means one visual size everywhere. That requires declaring the face locally — a descriptor cannot be added to someone else's `@font-face` — and under a **distinct family name**, because two rules with matching descriptors resolve by declaration order and CSS bundling does not promise one. **Widths do not normalise with heights**, so column-width step-downs still have to be measured separately.
- Verify: measure with canvas `TextMetrics.actualBoundingBoxAscent` on a capital, per face, at a fixed size — do not judge by eye. `tests/e2e/font-picker.spec.ts` re-checks viewport overflow per face at phone width. Dated 2026-08-26.

## A disclosure component that renders a `<p>` breaks the moment it is used inside one

- Symptom: a line of text escapes its paragraph and the layout below it shifts, with no error anywhere. Only in the places where the component was nested in a `<p>`.
- Cause: `<p>` cannot contain `<p>`. The parser closes the outer one where the inner begins, so the remaining siblings land outside it. A component that was written for one container gets reused in another and nothing warns.
- Avoid: render a shared inline-ish component as a `<span>` and give it `display: block` in CSS. When it must also work as a flex item, carry **both** `display: block` and `flex-basis: 100%` — a flex container blockifies the first and a paragraph ignores the second, so each container uses the mechanism the other drops.
- Verify: `app/ledger-note.tsx` and `.note-panel` in `app/globals.css`; the component is used beside a heading in a flex row and inside `<p class="ledger-status">`. Dated 2026-08-26.

## Wrapping existing children in a element to make them collapsible re-lays-out every viewport

- Symptom: adding a phone-only disclosure around header controls silently changes the desktop layout, because what were several flex items of the header became one.
- Cause: a new wrapper is a new box in the parent's formatting context. The children stop participating in the layout that was tuned around them.
- Avoid: `display: contents` on the wrapper at the sizes where it should not exist, and a real `display` only inside the media query where it should. The desktop layout then stays byte-identical rather than being re-derived and re-tested. Check the wrapper carries no semantics of its own first — `display: contents` on a landmark or a list removes it from the accessibility tree.
- Verify: `.header-panel` in `app/globals.css`, `display: contents` above 700px and a flex row below it. Dated 2026-08-26.

## The phone stacked-table mode renders `attr(data-label)`, so a table without those attributes becomes unlabelled figures

- Symptom: a new table is correct on desktop and, at phone width, becomes several screens of bare numbers with no idea which column each belongs to. Nothing fails: every figure is present and every one is right.
- Cause: below 700px `globals.css` turns `table` into stacked cards, hides `thead`, and puts the column name back with `td::before { content: attr(data-label) }`. A table whose cells carry no `data-label` renders the content and no name. The same block also imposes the ledger's card geometry — a 145px minimum row height and full-width spans on the 2nd, 3rd and last cells — which is wrong for any table with a different column count.
- Avoid: give **every** `<td>` a `data-label`, and scope a new table out of the ledger's geometry with its own rules inside the same media query. A `<th scope="row">` needs its own treatment too; it is not a `<td>` and the `::before` rule does not reach it.
- Verify: `.stats-section` in `app/globals.css` and the `data-label` attributes in `app/statistics-view.tsx`; `.runtime/statistics-audit.spec.ts` screenshots the page at 390px, which is how this was found. Dated 2026-08-27 (D-161).

## A colour that passes as a chart mark can still fail as text

- Symptom: a palette is validated, ships, and the same value reused for coloured figures is unreadable for some readers — with nothing failing, because the check that passed was the wrong check.
- Cause: a chart mark needs **3:1** against its surface; body text needs **4.5:1**. A validator run for categorical marks answers the first question and says nothing about the second. This app's chart green measures 4.03 on its paper — a pass as a bar, a fail as a figure.
- Avoid: keep two steps of the hue, one for marks and one for text, and measure the text step against the real surface rather than assuming a validated palette transfers. Reusing one value for both is the failure.
- Verify: `--money-in` (#4a6f14, 5.75) against the chart's `#5c8a1a` (4.03) in `app/globals.css`. Dated 2026-08-27 (D-163).

## A pixel typeface applied to figures makes digits transposable

- Symptom: numbers are misread — by the owner at a glance, and by an agent reading a screenshot. Two figures on the deployed statistics page were reported as not reconciling when they did.
- Cause: `--font-data` is redefined per typeface, so choosing a pixel face silently applies it to every `.numeric` cell as well as to prose. At table sizes those faces render `0`, `2`, `5` and `8` close enough to transpose.
- Avoid: give figures their own token — `--font-money`, a mono stack that no typeface choice overrides — and let the pixel character stay on prose, headings and labels. Remove the per-face `font-size` step-downs at the same time; they existed to shrink pixel glyphs and will otherwise shrink a mono face that never needed it.
- Verify: `.numeric` uses `var(--font-money)` in `app/globals.css` under all four `data-font` values. Dated 2026-08-27 (D-163, after D-162).

## A row hover cannot separate rows on a phone

- Symptom: a table reads as distinct rows on a desktop and as one continuous field of figures on a phone, and the hover treatment that fixes it on desktop appears to do nothing.
- Cause: the stacked card mode gives each row the page background and a single hairline, which is not separation. The desktop remedy is `tbody tr:hover` — and **there is no hover on a touch screen**, so the device with the problem is the one the remedy never reaches.
- Avoid: make the stacked rows real cards — a margin between them, a border, and the app's existing panel shadow — rather than relying on an interaction the device does not have. Check a phone-width screenshot, not a desktop one with a narrow window.
- Verify: `tbody tr` inside the ≤700px block in `app/globals.css`; `.runtime/statistics-audit.spec.ts` screenshots at 390px. Dated 2026-08-27 (D-163).
