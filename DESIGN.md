# Design system

Last rewritten 2026-08-26. **Every token below was read out of `app/globals.css`, not remembered** —
this file documented the cool-mist/navy palette for five days after the app stopped using it, and
`pnpm check:docs --strict` could not see that because it reads structure rather than meaning. If you
change a colour, change it here in the same commit or this file becomes wrong again silently.

## Direction

A warm paper ledger that reads like a farm almanac rather than a bank portal. Cornsilk is the ground
itself, not a card floating on something darker; surfaces lift *towards* a warm white above it. The
interface still borrows its structure from a reconciliation worksheet — a wide ruled table, restrained
labels, one persistent balance trace, and the balance rail beside the rows where a saffron diamond
marks a known gap.

**The pixel typefaces are on trial and the palette is not.** The faces can be switched per device; the
colours are fixed and reach every route.

## Tokens

Names as they appear in `:root`. The owner chose the palette on 2026-08-21.

| Token | Value | Role |
| --- | --- | --- |
| `--mist` | `#fefae0` | Cornsilk. **The ground**, and the page's own background |
| `--paper` | `#fffdf0` | The header band above the ground |
| `--paper-strong` | `#fffffa` | Fields, panels and anything lifted off the ground |
| `--navy` | `#283618` | Black Forest. Primary text and rules |
| `--muted` | `#5c6636` | Secondary text, labels, help |
| `--line` | `#ddd5b0` | Hairlines, field borders, table rules |
| `--blue` | `#9c5518` | Copper. Actions and active state — the name is historical |
| `--blue-dark` | `#7f4412` | The pressed and hovered form of it |
| `--celadon` | `#cbd6a5` | Confirmation and the privacy chip |
| `--celadon-ink` | `#3d4a1e` | Text on celadon |
| `--saffron` | `#dda15e` | Warnings, resynchronisation, the `(i)` panel's edge |
| `--saffron-wash` | `#f8edd7` | The fill behind a warning |
| `--red` | `#9b2c2c` | Blocking errors only |
| `--frame-outer` | `#8a4a15` | Panel chrome: the outer ring |
| `--frame-inner` | `#f0e2bd` | Panel chrome: the inner ring |

**`--blue` and `--blue-dark` are copper and have been since 2026-08-21.** The names were not changed
with the values, deliberately: they are referenced from roughly a hundred declarations and a rename
is a large diff that changes nothing on screen. Read them as "the action colour".

**Four colour literals live outside this stylesheet and none is in the gate**: `themeColor` in
`app/layout.tsx`, `background_color` and `theme_color` in `public/manifest.webmanifest`, and the two
fills in `public/icon.svg`. All four were stale for a day and across two deployments after the
palette changed. Sweep them by hand when a colour moves.

## Panel chrome

Panels — the `(i)` disclosure, the owner-access panel, the slip identity block — carry a doubled
edge: `--frame-outer` outside the existing hairline, `--frame-inner` just inside it, both as
`box-shadow` so nothing moves. The totals strip takes it on its two long edges only.

**Page furniture deliberately does not get it.** The intro rule, the bench dividers and the table
keep their single hairline, because framing everything is the same mistake as explaining everything.

## Type

`IBM Plex Sans Thai` is the body face and `IBM Plex Mono` the data face, both bundled through
Fontsource rather than requested from a CDN — `font-src 'self'` admits no external host.

Three OFL pixel faces can replace the Latin half per device (`lib/ui-font.ts`): **Press Start 2P**,
**Pixelify Sans**, **Silkscreen**. `system` is the default and stays so while the trial runs.

**Every switched stack keeps `IBM Plex Sans Thai` behind the pixel face and that is load-bearing.**
All three are Latin-only. Thai reaches this app as *data* — a counterparty name off a statement, a
note the owner typed — never as interface copy, because `app/` contains no Thai at all.

**Each pixel face is declared locally so it can carry a `size-adjust`, and the numbers are
measured.** Cap heights per 100px: IBM Plex **70**, Press Start 2P **100**, Pixelify Sans **63**,
Silkscreen **63**. Press Start 2P draws its capitals on a full em, so unadjusted it rendered every
heading and button at **1.43x** the size the layout was designed for. `size-adjust` of 70% / 111% /
111% lands them all on IBM Plex's cap height, so one CSS `font-size` means one visual size in every
face. **Widths do not normalise with heights** — the numeric columns still take a per-face step-down,
sized by measurement and re-checked at phone width by `tests/e2e/font-picker.spec.ts`.

Tabular financial values use the data face with `font-variant-numeric: tabular-nums`.

## Standing copy

**A principle folds behind an `(i)`; a warning about an irreversible write does not.** The disclosure
is `app/ledger-note.tsx`. Copy explaining how a rule works — how balances are derived, how slips are
matched, why cash lives on the ledger page — is worth stating once and not worth re-reading, so it
goes behind the button. Copy warning about the thing you are one press from doing stays on screen and
sits beside the control that does it.

Each route opens with a **short title**, not a sentence: `Ledger`, `Import`, `Slips`, `Recovery`. The
headline phrases they replaced read as advertising for the product rather than as the product.

The disclosure is a `<button aria-expanded>` and never a hover tooltip — hover does not exist on the
phone this ledger is read on. It must sit **beside** its heading and never inside it: a descendant's
accessible name joins its ancestor's, and axe reports nothing about it.

## Constraints

Avoid gradients, nested cards, KPI tiles, decorative motion, observation tooling, and colour-only
status. Support 320px layouts, visible keyboard focus, native semantics and reduced motion.

**There is no dark scheme** (D-137), and that is a decision with the owner's own qualifier on it — he
said *"but we'll see"*. `color-scheme: light` in `:root` and in `app/layout.tsx` is what makes native
date pickers and selects obey it. The cost is a bright page on a dark-OS phone at night and nobody
has tried that.
