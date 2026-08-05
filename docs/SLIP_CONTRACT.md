# Slip layout contract

Last measured: 2026-08-01, against the 23 real slips in the gitignored `receipts_sample/`.

What a Thai bank transfer slip prints, and where — the sizing `PLAN.md` task 21 was blocked
on. Companion to the three statement contracts; same rule as those, and same rule as
`lib/masked-diagnostics.ts`: **label wordings are format knowledge and are recorded here;
amounts, names, account suffixes, references, dates and counterparties are values and are
not.** Nothing in this file came from a fixture, and nothing in it may become one.

The QR half of the contract is already settled and lives elsewhere: `lib/slip-qr.ts` for the
EMVCo TLV grammar and its CRC, D-053 for the sizing, D-059 for the date carried inside the
reference. This file is about the **printed** half, which is the only source for the amount,
the time, and the counterparty.

## The finding that decides the design

**Region targeting must be anchored on labels, not on fractions of the image.** The obvious
approach — measure where the amount sits as a fraction of height and read that box — fails on
every layout here, for reasons that are structural rather than incidental:

- **SCB prints at least three transaction types** — transfer, bill payment, top-up — whose
  titles differ and whose bodies carry different numbers of rows. A bill payment adds a biller
  block of four lines, moving the amount a fifth of the image down the page.
- **Krungthai's bottom block has a variable number of rows.** A memo line appears only when
  the sender wrote one, and a long recipient name wraps to two lines, moving every row below
  it — including the date.
- **KBANK's blocks move the same way** when a recipient name wraps.

This is the same lesson the statement readers learned the expensive way (D-024, D-026):
invented geometry does not survive contact with a real document, and the label is the only
stable anchor. Read the label, then read the value beside or below it.

## Per bank

Every layout right-aligns its money and prints its label on the left of the same line, except
KBANK which puts the value on the line **below** its label.

### Krungthai (`KTB`)

| Field | Label | Value position |
| --- | --- | --- |
| Reference | `รหัสอ้างอิง` | Same line, immediately right. Top of the slip, beside the QR |
| Amount | `จำนวนเงิน` | Same line, right-aligned, followed by `บาท` |
| Fee | `ค่าธรรมเนียม` | Same line, right-aligned, followed by `บาท` |
| Date and time | `วันที่ทำรายการ` | Same line, right-aligned, `D MMM YYYY - HH:MM` |
| Memo | `บันทึกช่วยจำ` | Same line, right-aligned. **Optional** — present only when the sender wrote one |

Sender and recipient sit under `จาก` and `ไปยัง`, each as a name line, a bank or channel
line, and a masked account line. The QR is top-right and the reference is the only field
printed above the sender block.

### SCB

| Field | Label | Value position |
| --- | --- | --- |
| Date and time | *none* | Centred, directly under the title, `D MMM YYYY - HH:MM` |
| Reference | `รหัสอ้างอิง:` | Same line, immediately right, centred as a pair |
| Amount | `จำนวนเงิน` | Same line, right-aligned. **No `บาท` suffix** |

The title states the transaction type and is the only reliable way to tell a transfer from a
bill payment. A bill payment additionally prints `Biller ID` and up to three
`เลขที่อ้างอิง N` lines between the recipient and the amount. The QR is bottom-right, below
the amount, which is the opposite of Krungthai.

### KBANK (`K+`)

| Field | Label | Value position |
| --- | --- | --- |
| Date and time | *none* | Under the title, left-aligned, `D MMM YY  HH:MM น.` |
| Reference | `เลขที่รายการ:` | **Line below**, indented |
| Amount | `จำนวน:` | **Line below**, right-aligned, followed by `บาท` |
| Fee | `ค่าธรรมเนียม:` | **Line below**, right-aligned, followed by `บาท` |

KBANK is the layout where OCR matters most, because its reference carries no date (D-059) —
so the printed date is the only date there is.

## The era trap, which is the opposite way round from the QR

**Every layout prints a Buddhist year.** Krungthai and SCB print it in full (`2569`, `2568`);
KBANK prints two digits (`69`). Any date read from pixels therefore needs the 543-year
conversion and must fail closed on an implausible result — D-031 is the entry that records
what a silent era misread costs, and it cost this project a ledger dated 1983.

Note the asymmetry, because it is easy to get backwards: a date read from the **QR reference**
is already Gregorian and needs no conversion (D-059), while a date read from the **printed
slip** is Buddhist and always does. The two sources disagree by 543 years on the same slip.

## What this does not yet establish

- **No OCR has been run.** This is a reading of the layouts by eye across a sample of the 23,
  which is what region targeting needs before it can be written; it is not a measurement of
  what an OCR engine actually recovers from these images.
- **The month tokens are unrecorded, and that blocks the printed date.** The tables above give
  the date *layout* — `D MMM YYYY - HH:MM`, `D MMM YY  HH:MM น.` — without saying whether
  `MMM` prints as a Thai abbreviation or a Latin one. Found on 2026-08-05 while writing
  `lib/slip-ocr.ts`: a month table cannot be written from this file, and writing one from
  guesswork would be inventing format knowledge nobody has measured, which is the one thing
  these contracts exist to prevent. The era arithmetic is separable and is built
  (`gregorianFromPrintedYear`); the vocabulary is not. **Measure the month forms per layout
  when the slips are next open** — it is a one-line addition to the tables above and it is the
  only thing standing between the era guard and a working printed-date reader. Note where this
  bites: KBANK's reference carries no date (D-059), so for that layout the printed date is the
  only date there is.
- **Digit confusability is unmeasured.** Thai slips print money in a proportional face, and
  `0`/`o`, `1`/`7` and a comma against a full stop are the errors that would silently change
  an amount. A digit whitelist and a mandatory per-field review against the source image are
  already required by `PLAN.md` task 21; nothing here relaxes that.
- **Counterparty extraction is not sized.** The name lines are structurally clear, but a
  counterparty is free text in two scripts and is the field least suited to a whitelist.
