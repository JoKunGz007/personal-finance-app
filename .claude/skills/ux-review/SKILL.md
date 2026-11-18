---
name: ux-review
description: Review the deployed personal-finance-app's UI/UX in the signed-in browser pane at desktop and phone size, and return a ranked list of fixes, improvements and quality-of-life ideas for the owner to approve. Use when asked for a UX/UI review, audit, polish pass, or "what could be better". Suggests only until items are approved.
argument-hint: "[page(s) e.g. /ledger /slips — default all] [focus e.g. phone, a11y, copy]"
---

# UX review

Combines design-review's phased live audit and severity tiers, Nielsen's 10 heuristics, a WCAG 2.1 AA pass, design-critique's first-impression and top-3 summary, and this app's own rules. **Read-only until the owner approves items.**

## 0. Scope and safety

- Pages: from the argument, else `/ledger /statistics /import /slips /categories /recovery /receipts /orders /inbox` on the deployed URL (memory `reference-deployed-url`); cache-bust with `?_cb=<short sha>`.
- Browser: the built-in pane (`mcp__Claude_Browser__*`), which is signed in (memory `reference-phone-check-browser-pane`). Batch actions; prefer `javascript_tool`/`read_page` over screenshots; screenshots at `scale: 0.5`.
- **Real data:** reading it is allowed (owner, 2026-09-16) — use real rows to judge long content, wrapping and states. **Never record it**: no amount, balance, counterparty, reference or account digit in any doc, file, commit, fixture or saved screenshot; the in-chat report describes it generically ("a long Thai counterparty name"). Never press a control that writes (confirm, capture, exclude, restore, sync, delete); opening a note, menu or picker is fine.
- Never change the owner's typeface/scheme cookie without restoring it.

## 1. Context (once)

Skim `SPEC.md` scope and `docs/gotchas/appearance.md` + `docs/gotchas/app.md` index titles so findings don't re-raise decided trade-offs. A finding that contradicts a recorded decision is reported as "revisit D-xxx", not as a defect.

## 1.5 Delegate the page passes

If the project has a `finance-ux-auditor` agent, don't run §2–3 yourself. Split the pages into groups of 2–3 and call it once per group, **in sequence** (they share the one browser pane). Pass each call the deployed URL, the cache-bust value, the pages, any focus from the argument, and the decided trade-offs from §1 not to re-raise. Merge their rows for §4, and write the first impression and top 3 yourself. Without that agent, run §2–3 inline.

## 2. Per page, at desktop (pane default) then phone (`resize_window` preset `mobile`)

**First impression (≤2 s read):** what the page is for, the primary action, whether it is findable without scrolling.

**Automated checks** (one `javascript_tool` call per page/viewport):
- page scrolls sideways; any element past the viewport outside an intended scroller
- interactive elements under 44×44 (skip checkboxes inside a larger label)
- visible text blocks over ~110 chars not inside a note panel
- buttons/links/inputs with no accessible name; images without alt; heading levels skipped
- text contrast below 4.5:1 (3:1 for ≥24px or bold ≥18.66px) — compute from computed colors
- digits rendered outside the figures font: compare width of `0123456789` in the element's stack vs `"IBM Plex Mono"`
- console errors (`read_console_messages`, errors only)

**Manual passes:**
1. Interaction & flow — primary task path, click count, feedback after an action, disabled states explained.
2. Responsiveness — stacking order, header height before content, sticky elements covering content.
3. Visual polish — alignment, spacing rhythm, type scale, consistent button/label styles.
4. Robustness — empty, loading, error and long-content states (use filters/dates to reach empty states without writing).
5. Content — jargon, ambiguous labels, redundant text, inconsistent terms across pages.
6. Keyboard — Tab through the first screen: visible focus, logical order, no traps; Escape closes notes/menus.

**Nielsen's 10** — tag each finding with the heuristic it breaks: visibility of status, match with real world, user control/undo, consistency, error prevention, recognition over recall, flexibility/efficiency, minimalist design, error recovery, help/documentation.

## 3. App-specific rules (every page)

- Digits never render in a pixel face (D-163, D-200, D-202).
- Long help text sits behind a `LedgerNote` i icon; the visible line keeps any constraint needed before acting (D-202).
- Tap targets ≥44px; no sideways page scroll at 375px (D-136, D-138).
- Spot-check one page under each of the 4 typefaces and 5 colour schemes (restore the owner's choice after).
- Money-in/money-out colors and signs consistent everywhere.

## 4. Report — then STOP

Merge duplicates across pages/viewports. Rank by severity, then effort. Output in the conversation (no file unless asked):

```
## First impression
<2–3 sentences for the app as a whole>

## Top 3
1. … — why it matters most

## Findings
| # | Tier | Page · viewport | What's wrong | Why it matters (heuristic / WCAG) | Proposed fix | Effort |
```

Tiers: **Blocker** (task can't be done / data misleading) · **High** (real friction or WCAG AA fail) · **Medium** (noticeable polish/QoL) · **Nitpick**. Map Nielsen severity 4→Blocker, 3→High, 2→Medium, 1→Nitpick; drop 0.

Also list **What works well** (2–4 bullets) so good patterns aren't "fixed" away.

End with: *"Reply with the numbers to fix (e.g. `1, 4, 7`), `all High+`, or `none`."* Then stop. Reset the pane to `desktop`.

## 5. After approval

Fix only approved numbers, smallest diff each. Then: `tsc`, `eslint` on touched files, relevant unit tests, `/code-review` high. **Ask before commit/push** unless granted this session. After deploy, re-run only the checks behind the approved findings in the pane at both viewports and report before/after. Run `/sync-docs` if a decision was made.
