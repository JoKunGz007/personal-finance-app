# Design system

Last rewritten 2026-08-26, and revised 2026-09-01 when the dark schemes landed. **Every token below
was read out of `app/globals.css`, not remembered** — this file documented the cool-mist/navy palette
for five days after the app stopped using it, and `pnpm check:docs --strict` could not see that
because it reads structure rather than meaning. If you change a colour, change it here in the same
commit or this file becomes wrong again silently. **What now also holds this file honest is
`tests/ui-theme.test.ts`**, which measures the real values out of the stylesheet — but it checks
contrast, not prose, so the sentences here are still yours to keep true.

## Direction

A warm paper ledger that reads like a farm almanac rather than a bank portal. In daylight, cornsilk
is the ground itself, not a card floating on something darker; surfaces lift *towards* a warm white
above it. After dark the ladder runs the same way from a darker floor. The interface still borrows
its structure from a reconciliation worksheet — a wide ruled table, restrained labels, one persistent
balance trace, and the balance rail beside the rows where a saffron diamond marks a known gap.

**The pixel typefaces are on trial and so, now, is the ground.** Both switch per device, and for the
same reason: what is comfortable at arm's length on a monitor is a different proposition on a phone
at night.

## Schemes

**Four, since 2026-09-01, and this reverses D-137.** One light and three dark, selected by
`[data-theme]` on `<html>`, written server-side from a cookie so the first paint is already right.
`lib/ui-theme.ts` is the only place that decides which exist.

| Choice | Ground | What it is |
| --- | --- | --- |
| `system` | follows the device | Daylight by day, Night Town after dark. **The default.** |
| `light` | `#fefae0` | Daylight — the cornsilk almanac, unchanged since 2026-08-21 |
| `night` | `#1e2440` | Night Town — deep blue-violet, warm accents as lamplight. **The owner's choice** |
| `lamplit` | `#2b2018` | Dark walnut and cornsilk ink; warm throughout, the game's own furniture |
| `cellar` | `#1a2110` | Near-black green, built by darkening `--navy` into a ground |

**Three darks rather than one is deliberate.** The choice was made from renderings of invented data
on a desktop, and the real test is the owner's own ledger on his own phone at night — a palette that
can only be re-evaluated by editing CSS and redeploying will not be re-evaluated. All three are held
to identical floors, so switching can never ship an unmeasured scheme.

**D-137's argument against a second scheme was that nothing measured it.** That is what
`tests/ui-theme.test.ts` retires: every scheme, every pair with a floor, plus token-set parity,
`themeColor` agreement, and a grep that fails on any colour literal written outside a token block.
Adding a fourth scheme costs one CSS block and one array entry.

## Tokens

Names as they appear in `:root`, with their **light** values; each dark scheme redeclares all 26.
The owner chose the light palette on 2026-08-21 and the dark grounds on 2026-09-01.

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
| `--money-in` | `#4a6f14` | An amount received, as text |
| `--money-out` | `#9b2c2c` | An amount paid, as text |
| `--on-action` | `#ffffff` | Text over an action fill |
| `--warn-ink` | `#7a4a12` | Text on the saffron wash |
| `--resync-ink` | `#8a5518` | The resynchronisation label |
| `--verified-ink` | `#4a5a24` | The verified status chip |
| `--verified-rail` | `#606c38` | The rail beside a verified row |
| `--celadon-dot` | `#7d8c47` | The privacy chip's dot |
| `--backup-edge` | `#86b9a2` | The backup band's border |
| `--chart-in` | `#5c8a1a` | Income, as a chart mark and a calendar ramp |
| `--chart-out` | `#9b2c2c` | Spending, as a chart mark and a calendar ramp |

**`--blue` and `--blue-dark` are copper and have been since 2026-08-21.** The names were not changed
with the values, deliberately: they are referenced from roughly a hundred declarations and a rename
is a large diff that changes nothing on screen. Read them as "the action colour".

**The last nine tokens were literals until 2026-09-01** and every one of them was a latent failure of
the kind `GOTCHAS.md` describes — a rule pairing a `var(--…)` surface with a hardcoded `color` is
correct in one scheme and unreadable in the other. `--chart-in` and `--chart-out` were worse: JS
constants in `app/statistics-charts.tsx`, under a docstring claiming they inherited the palette. Each
light value above is byte-identical to the literal it replaced, so promoting them changed nothing on
screen. **A mark needs 3:1 and text needs 4.5**, which is why `--chart-in` is a lighter step than
`--money-in` rather than the same value reused (D-163).

**One literal survives on purpose**: `#fff` on `.owner-access-qr`. An authenticator reads that square
off the screen and a quiet zone is white at midnight too.

**Colour literals outside the stylesheet.** `themeColor` in `app/layout.tsx` is now generated from
the cookie and asserted against `--mist` by `tests/ui-theme.test.ts` — the check that was missing
when it sat at the pre-retheme blue-grey for a day across two deployments. Still unguarded and still
to be swept by hand: `background_color` and `theme_color` in `public/manifest.webmanifest`, and the
two fills in `public/icon.svg`. **Both are deliberately left on the light palette** — a manifest is
static and cannot follow a cookie, and the icon is a dark plate with cornsilk rules that reads on
either ground.

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

**There are four colour schemes** (2026-09-01), reversing D-137 — which dropped the dark scheme with
the owner's own *"but we'll see"* attached, and whose hedge a later entry withdrew on the
understanding that he would say so if it changed. He said so. `color-scheme` is declared per scheme
in `globals.css` and generated per cookie in `app/layout.tsx`, which is what makes native date
pickers and selects obey the page. The cost D-137 accepted — a bright page on a dark-OS phone at
night — is paid off; what replaces it is the cost of measuring four schemes instead of one, and
`tests/ui-theme.test.ts` is where that is paid.

**Both pickers are one control shape.** `.ui-picker` in `globals.css` carries the geometry for the
typeface and the colour switch alike, because the phone measurements in it — the `px` note cap, the
`:empty` clip, the 44px touch height — are each the fix for a defect found on a real device, and a
copied block would have been the one that missed the next.
