# 7-Eleven receipt contract

Last measured: 2026-09-22, against the real receipts in the gitignored `receipts_sample/7-11/`
under an explicit owner grant — four screenshots, one condensed e-tax PDF and one full e-tax
invoice, the last two being the same purchase as one of the screenshots.

What a 7-Eleven receipt prints, in each of the three forms it can be obtained in, and which of
those forms can be trusted for what. Companion to the three statement contracts and
`SLIP_CONTRACT.md`; **same rule as those: label wordings are format knowledge and are recorded
here; item names, amounts, quantities, dates, receipt numbers, store codes, member identifiers
and every field of the taxpayer identity block are values and are not.** Nothing in this file
came from a fixture, and nothing in it may become one.

This file is format knowledge only. The design that consumes it is `PLAN.md` task 56.

## The finding that decides the design

**A receipt is never money in this app. It is itemization of money the ledger already holds.**

Every payment route already lands in the ledger on its own:

- A per-purchase TrueMoney pull is a `SIPS TRUE MONEY CO.,LTD.` row on the SCB account.
- A wallet-balance purchase was counted when the wallet was topped up.
- A purchase paid by someone else and reimbursed is the reimbursement row.

So a receipt that contributed to income or spending totals would double-count in all three cases.
Receipts attach detail to money already recorded, and receipt statistics are a **separate lens**
beside the ledger rather than a second ledger inside it. This is what keeps the exact-money,
append-only and audit invariants untouched by the whole feature, and it is why this is a new
domain rather than a change to the ledger's core.

**An unmatched receipt therefore costs nothing.** The totals are already correct without it.

## The three forms, and what each is good for

| Form | Obtainable | Item list | Item names | Extra |
| --- | --- | --- | --- | --- |
| In-app screenshot | always | **only what fit on screen** | truncated at source | — |
| Condensed e-tax PDF | 7 days | complete | truncated at source | member points, coupon balances |
| Full e-tax invoice | 7 days | complete | **full** | VAT breakdown |

The 7-day limit is printed on the document itself (note 2 of the full invoice) and is the
company's own reservation, not an inference.

### The screenshot truncates silently, and that is the hazard

The in-app item list is a scroll region. A screenshot captures only the visible portion and
**says nothing about what it cut** — no ellipsis, no count, no scroll indicator that survives
into the image reliably. One of the four screenshots measured was truncated this way; three were
complete.

**The receipt carries its own checksum, so this is detectable with certainty rather than
guessed at.** Two independent checks:

1. `sum(line amounts) − sum(discount lines) = ยอดสุทธิ` (the net).
2. The unit count printed beside `ยอดสุทธิ` equals the summed quantities of the priced lines.

A receipt failing either is **partial**: its header, net, payment method and timestamp are still
trustworthy and go to statistics; its item lines are marked incomplete and are excluded from
item-level statistics. Nothing may present a partial item list as if it were the basket.

### Item names are truncated by the source, not by the reader

Both the screenshot and the condensed PDF cut item names to a fixed width — around twenty
characters, mid-word, with no marker. **The full tax invoice does not**, and is the only form
that carries the complete name.

This is a property of what 7-Eleven prints. No amount of reading quality recovers it from the
first two forms.

## Structure

In printed order:

- Date and time, Thai Buddhist era with a **two-digit year**.
- Receipt number (`เลขที่ใบเสร็จ`).
- Branch name and store code (`รหัสร้าน`).
- Item lines: quantity, name, an `@unit-price` shown **only when quantity is greater than one**,
  and the line amount. A trailing `N` marks a line exempt from VAT.
- `ยอดรวม` — the subtotal. **Printed only when discounts follow**; a receipt with no discount
  goes straight to the net.
- Discount lines (`ส่วนลด…`, and `ฟรี…` for a free item), printed as **positive** figures to be
  subtracted.
- `ยอดสุทธิ N ชิ้น` — the net, and the unit count.
- The payment method line.
- `TID#` and `R#`.
- `บิลนี้ประหยัด` — the amount saved, when any.

The full invoice adds a taxpayer identity block, a VAT breakdown
(`มูลค่าสินค้าก่อนภาษีมูลค่าเพิ่ม`, `ภาษีมูลค่าเพิ่ม`, `มูลค่าสินค้ารวมภาษีมูลค่าเพิ่ม`), and a
note block defining the line suffixes: `N` exempt, `P` promotion, `NP` both, `PM` price mismatch,
`MD`/`MN` branch discount, `WS` special branch discount.

### Zero-priced lines are not purchases

`M-Stamp(บาท)`, `AMBสิทธิ์แลกซื้อ` and the `ภารกิจช้อป…` lines are stamps, redemption rights and
campaign missions. They carry a quantity and a zero amount, and they are **not merchandise**.
They must be excluded from item statistics or the most-bought item is a stamp forever.

The printed `ชิ้น` count already excludes them, which is what makes check 2 above meaningful.

### Dates

The header prints Buddhist era with a two-digit year. `TID#` opens with the **full Gregorian
date**, so the two are independent representations of the same day.

**Take the date from the `TID#` and cross-check the header**, in the same fail-closed shape as
`NOTIFICATION_CARD_CONTRACT.md`'s two printed direction signals: a disagreement is a refusal,
not a tie to be broken. D-031 is the standing reason two-digit years are never trusted alone.

## Identity and deduplication

The full invoice **cancels and replaces** the condensed one and says so, naming the condensed
receipt number in its own body. So the two are the same purchase, and the link between them is
**printed on the document** rather than inferred from amount and time.

Identity is therefore the store code plus the receipt number, with the full invoice resolving to
the condensed number it names. A purchase captured three times — screenshot, condensed PDF, full
invoice — is one receipt with three sources, never three receipts.

## Reading each form

### The condensed PDF

Real text. `pdftotext -enc UTF-8 -layout` reads it directly — **no OCR, no Vision, no image
leaving the device**, which makes it the only capture path in this app that reads a document
without either an on-device engine or a third party.

Thai extracts with **vowel and tone marks reordered** relative to their consonants. The damage is
deterministic — the same input yields the same output every time — so an extracted string is
usable as an identity key unchanged. It is **not** usable for display, and it will not compare
equal to the same text typed by hand.

### The full invoice

Also real text, and harder to read than the condensed one in two distinct ways.

**The columns interleave.** `-layout` emits the NO/quantity column and the item-name column on
alternating lines, so line-by-line parsing attaches quantities to the wrong items. Coordinate-aware
extraction is required; splitting on newlines is not sufficient.

**There is an independent recovery for quantity, and it should be used as a cross-check even once
the columns are parsed correctly**: the unit-price and amount columns give the quantity by
division, and an `@unit-price` is printed exactly when the quantity exceeds one. A quantity that
the two disagree on is a refusal.

**`า` is dropped.** This font's glyph for sara aa carries no usable mapping and extracts as a
space — the label `รายการสินค้า` comes out as `ร ยก รสินค้`. This is **lossy in a way the
condensed PDF's reordering is not**: a real space and a dropped `า` are indistinguishable without
a dictionary. It affects the one form that carries the full item names, which is precisely the
form we want them from.

### The screenshot

The existing image path applies: `POST /api/v1/ocr/read`, Google Cloud Vision, the same route the
slip and card readers use (D-120, D-128, D-129). The image leaves the device, and the capture
surface must say so on screen exactly as the slip and card forms do.

A receipt too long for one screen is captured as **several screenshots of one receipt**, stitched
on the receipt number. The checksum above is what says whether the stitch is complete — not the
number of images, and not the owner's judgment at capture time.

## What must never be stored

The full invoice carries a taxpayer identity block: the buyer's full name, home address,
telephone number and **national taxpayer identification number**.

**None of it is stored.** It is dropped at the reader, before anything is written. The purchase
is what this feature wants; the identity block is the tax authority's business and carries far
more exposure than the ledger itself does. The condensed PDF carries a member name and point
balances, which are likewise not purchase data and are likewise dropped.

This is a reader-level rule rather than a column that is left null, so that there is no schema in
which the field could later be filled.

## Matching to the ledger

Measured 2026-09-22 against the real ledger under an explicit owner grant, counts and
descriptions only.

The SCB account carries a substantial run of outgoing `SIPS TRUE MONEY CO.,LTD.` rows. The
majority are **not round figures**, which is the evidence that TrueMoney pulls per purchase
rather than only on top-up — a top-up-only model would show round amounts and nothing else. Round
figures also appear, and those are the genuine top-ups. Both models are in use at once.

**The rule is fail-closed:**

- Only rows whose description names `TRUE MONEY` are candidates. This single constraint is what
  refuses the false match described below.
- The amount must be exact.
- The bank row must fall **at or after** the receipt time, within a lag window.
- Two candidates in the window is a **refusal**, not a choice — the slip rule (D-063) exactly.
- **Unmatched is a normal outcome and must not read as an error.** A wallet-balance purchase can
  never have a row.

### The lag window is not yet measured

Two confirmed matches were observed: one at the same minute, one at roughly three quarters of an
hour later. **Two points is not a distribution.** The window must be measured over a real run of
captured receipts before a number is fixed, and a guessed window that is too wide is how a false
match gets in.

### The case that proves the rule

One measured receipt had no TrueMoney row at all — it was paid from a third party's wallet
against the owner's member number and reimbursed immediately by PromptPay. An unrelated-looking
PromptPay row of the same amount sat about a minute away, and amount-and-time matching alone
would have taken it.

It happened to be the economically correct row. **That is luck, not a rule** — the matcher cannot
distinguish an immediate exact reimbursement from an unrelated payment that happens to agree, and
a rule that took it would take the unrelated one too.

So the automatic path declines this case, and a **manual link** covers it: the owner may attach a
receipt to any ledger row himself, explicitly and audited, in the same shape as the slip match
decisions and D-207's owner-decision guard. Declining a rare valid case is the right side of the
trade against accepting a wrong one.

## Scope

7-Eleven only, by the owner's decision — other convenience stores are rare enough not to pay for
a second layout. This file is one merchant's contract in the same sense that
`KRUNGTHAI_CONTRACT.md` is one bank's, and a second merchant would be a second file rather than a
generalisation of this one. D-031 is the standing reason: one layout's convention applied to all
is the exact failure that entry records.
