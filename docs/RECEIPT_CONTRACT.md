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

**They are complementary, not ranked.** The full tax invoice is the only form carrying complete
item names, and it was tempting to read it as strictly the best — but it is also the only form
that prints **no payment method, no time, no `TID#` and no unit count**. Measured 2026-09-22:
payment-method tokens, `TID#` and `R#` each occur exactly once in the condensed form and **zero
times** in the full invoice.

| | Screenshot | Condensed PDF | Full invoice |
| --- | --- | --- | --- |
| Obtainable | always | 7 days | 7 days |
| Item list | **only what fit on screen** | complete | complete |
| Item names | truncated at source | truncated at source | **full** |
| Payment method | yes | yes | **no** |
| Time of purchase | yes | yes | **no** (date only) |
| Unit count (`ชิ้น`) | yes | yes | **no** |
| Date cross-check | — | `TID#` vs `R#` | **not possible** |
| VAT breakdown | no | no | **yes** |

The 7-day limit is printed on the document itself (note 2 of the full invoice) and is the
company's own reservation, not an inference.

**Two consequences follow, and both are load-bearing.**

**Upgrading a receipt must never discard a field an earlier form supplied.** A full invoice
arriving after a screenshot improves the item names and adds VAT; it cannot supply the payment
method or the time, and overwriting those with nulls would destroy the better record. The
create-then-upgrade design (`PLAN.md` task 56) is therefore a merge per field, not a replacement
per document.

**The payment method is the field the ledger-matching rule keys on**, and the full invoice does
not have it. So a full invoice **alone can never answer the matching question** — it needs the
condensed form or the screenshot beside it. Anything that treats the full invoice as a complete
replacement for the other two breaks matching silently.

### Checks each form can actually support

The two completeness checksums are not both available everywhere, and a check that cannot run
must be recorded as **inapplicable rather than passed** — a receipt is not "complete" because a
check was skipped.

- `sum(items) − sum(discounts) = net` — **both PDF forms**, and the screenshot when it is whole.
- unit count vs summed quantities — **condensed and screenshot only**; the full invoice prints no
  `ชิ้น`.
- `TID#` against the header date — **condensed only**. The full invoice prints one date and in
  **four-digit** Buddhist era, which is unambiguous alone, so this is not a weakening of D-031's
  rule against trusting a two-digit year — it is that rule not applying.
- pre-VAT + VAT = total including VAT — **full invoice only**, and it partly compensates for the
  unit count it lacks.
- the discount block's own `ส่วนลดที่ได้ทั้งหมด` against the summed discount lines — **full
  invoice only**. Note it matches the `ส่วนลด` prefix and is a *total*, not another discount;
  summing it would double-count.

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

**The list above is the screenshot's and the condensed form's shape. The full invoice does not
merely add to it — it replaces the tail.** Where the condensed form ends `ยอดสุทธิ N ชิ้น`, a
payment line, `TID#` and `R#`, the full invoice runs `มูลค่าสินค้ารวม` (the subtotal), then an
optional discount block opened by a bare `หักส่วนลด` heading whose lines carry **no leading
quantity** and are closed by a `ส่วนลดที่ได้ทั้งหมด` total, then `สินค้าไม่เสียภาษีมูลค่าเพิ่ม`,
then the three VAT lines — the last of which, `มูลค่าสินค้ารวมภาษีมูลค่าเพิ่ม`, **is the net**.
It then repeats its own header on every page.

The full invoice also carries a taxpayer identity block, a VAT breakdown
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

Both PDF forms are **real text**. `pdfjs-dist` — already a dependency, already used for statements
— reads them directly: **no OCR, no Vision, and no image leaving the device**, which makes this the
only capture path in this app that reads a document without either an on-device engine or a third
party.

**Read in raw reading order**, meaning `getTextContent`'s item order with `hasEOL`. This is the
whole trick, and it is worth stating plainly because the first measurement got it wrong:

**Three apparent defects were artifacts of layout-reconstructing extraction, not properties of the
documents.** A first pass with `pdftotext -layout` showed Thai vowel and tone marks reordered
relative to their consonants, the full invoice's NO/quantity column interleaved with its item-name
column on alternating lines, and stray spaces inside words. **All three are gone in raw reading
order**, in both forms, under `pdfjs-dist` and independently under PyMuPDF with identical output.
A layout reconstructor sorts glyphs by x-position; Thai combining marks are zero-width and sit
above their consonant, so x-sorting misplaces them and column inference splits a row. Nothing was
wrong with the PDFs.

**Do not build a Thai normalizer, and do not repair spacing.** A probe for a space directly
following a Thai combining mark found nine occurrences across both documents and **all nine were
legitimate word boundaries** (`ซีพี ออลล์`, `จำกัด (มหาชน)`). A space repair would corrupt them.

### The one real encoding defect, and its exact repair

The full invoice's embedded font maps **sara aa (`า`) to `U+0006`**. It is not dropped and not a
space — the character is present and carries a distinct codepoint, which is why a layout extractor
rendering control characters as spaces made it look lossy.

It is therefore **fully recoverable by two deterministic replacements**, in order:

1. `U+0006` → `U+0E32`.
2. Then `U+0E33 U+0E32` → `U+0E33`. Sara am is encoded decomposed in this font, so rule 1 otherwise
   leaves a spurious trailing `า` on every `ำ`.

Measured 2026-09-22: the full invoice carries **163 occurrences of `U+0006` and no other control
character whatsoever**; the condensed form carries none and needs no repair. After both rules,
eighteen independent probe strings — labels and long product names — match exactly, the only
non-matches being genuine vocabulary differences between the two forms (a full tax invoice says
`มูลค่าสินค้ารวม` where the condensed says `ยอดรวม`) and names the condensed form truncates.

**This is an encoding repair, not a normalizer**, and its correctness is a property of this
issuer's fonts rather than of Thai. A different merchant, or a re-issued template, earns its own
measurement — D-031 is the standing reason one layout's convention is never applied to another.

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
