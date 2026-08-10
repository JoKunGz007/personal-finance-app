# Slip layout contract

Last measured: 2026-08-10, against the 23 real slips in the gitignored `receipts_sample/`. The
2026-08-10 pass read four of them by eye under a fresh grant, to settle the month vocabulary;
2026-08-01 established everything above it and 2026-08-05 added the OCR measurement.

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

## The month vocabulary, measured 2026-08-10

**All three layouts print the month as an abbreviated Thai name with periods** — the `ก.ค.`
form, not a Latin `Jul` and not the full `กรกฎาคม`. That was the one thing standing between the
era arithmetic and a working printed-date reader, and the answer is simpler than feared: one
month table serves every layout. Confirmed by eye across all three, on more than one month and
more than one Buddhist year, so it is not an artefact of a single period.

The date grammars differ only in the year and the suffix:

| Layout | Grammar | Year |
| --- | --- | --- |
| Krungthai | `D MMM YYYY - HH:MM`, right-aligned after `วันที่ทำรายการ` | Four digits |
| SCB | `D MMM YYYY - HH:MM`, centred under the title | Four digits |
| KBANK | `D MMM YY  HH:MM น.`, left-aligned under the title | **Two digits** |

**The table is standard Thai calendar vocabulary, not something these slips revealed** — which
is why it can be written in full here while the dates on the slips cannot:

`ม.ค. ก.พ. มี.ค. เม.ย. พ.ค. มิ.ย. ก.ค. ส.ค. ก.ย. ต.ค. พ.ย. ธ.ค.`

**Three of the twelve break the obvious matcher, and that is the trap worth carrying.** A
pattern like `[ก-ฮ]\.[ก-ฮ]\.` reads nine of them and silently misses `มี.ค.`, `เม.ย.` and
`มิ.ย.`, which carry a vowel — `เม.ย.` even begins with one. A reader built against a sample
that happens to hold none of those three months passes its tests and fails in March, April and
June. Match against the token list, never against a shape.

## The era trap, which is the opposite way round from the QR

**Every layout prints a Buddhist year.** Krungthai and SCB print it in full (`2569`, `2568`);
KBANK prints two digits (`69`). Any date read from pixels therefore needs the 543-year
conversion and must fail closed on an implausible result — D-031 is the entry that records
what a silent era misread costs, and it cost this project a ledger dated 1983.

Note the asymmetry, because it is easy to get backwards: a date read from the **QR reference**
is already Gregorian and needs no conversion (D-059), while a date read from the **printed
slip** is Buddhist and always does. The two sources disagree by 543 years on the same slip.

## What this does not yet establish

- ~~**No OCR has been run.**~~ **Measured 2026-08-05** (D-066), by a throwaway harness under
  `.runtime/diag/`, deleted after use. Engine: tesseract.js 7.0.0 with `tha+eng`, default
  settings, native resolution, no upscaling, over the 14 samples whose QR carries a date.
  **Thai script was recognised on 14 of 14** at a mean of 187 words per image, so the engine
  reads these documents. **The amount's label was found on 11 of 14 (79%)**, and on all 11 of
  those the label anchoring and the money grammar returned a usable amount — so where OCR
  reads the label, the rest of the path works. The 3 failures are the engine not recognising
  the label, not a targeting fault.
- **A retry ladder is the obvious next thing to try, and is untested.** D-053 measured that 3
  of 23 samples do not decode their QR at native resolution and need a 2× upscale; the amount
  label also failed on 3. Whether they are the same 3 low-resolution images is unmeasured and
  would be the first thing to check, because `lib/slip-scan.ts` already owns exactly that
  ladder for the QR and the OCR path would want the same one.
- ~~**The month tokens are unrecorded, and that blocks the printed date.**~~ **Measured
  2026-08-10** — see § The month vocabulary above. All three layouts print the abbreviated Thai
  form, so one table serves them all, and the finding that matters is that three of the twelve
  tokens defeat the obvious two-consonant pattern.

- **KBANK's two-digit year is now the blocker, and the current guard refuses it by design.**
  `gregorianFromPrintedYear` returns null for any year below 1000, and its comment says why: a
  reader that resolves a two-digit year by assuming a century is guessing at the point where
  D-031 already burned this project. But KBANK prints `YY` **and** its reference carries no
  date (D-059), so under the present rule that layout has no readable date from either source.
  Worth reopening rather than accepting, because the same arithmetic D-031 used may settle it
  without guessing: completing a two-digit year gives a small candidate set across both eras,
  and if a plausibility window admits **exactly one**, that is arithmetic rather than a
  heuristic — the identical argument that made the four-digit case safe. If more than one
  candidate survives, it must fail closed. **Not implemented, and it is a decision rather than
  an oversight** (`PLAN.md` task 21).
- **Digit confusability is unmeasured.** Thai slips print money in a proportional face, and
  `0`/`o`, `1`/`7` and a comma against a full stop are the errors that would silently change
  an amount. A digit whitelist and a mandatory per-field review against the source image are
  already required by `PLAN.md` task 21; nothing here relaxes that.
- **Counterparty extraction is not sized.** The name lines are structurally clear, but a
  counterparty is free text in two scripts and is the field least suited to a whitelist.
