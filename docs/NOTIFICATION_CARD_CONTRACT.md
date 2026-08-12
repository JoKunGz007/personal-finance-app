# Notification card layout contract

Last measured: 2026-08-12, against the eight gitignored screenshots in `receipts_sample/line/`
under a read grant given the same day. It took two passes. The first read five screenshots and
found four things the 2026-08-11 measurement had not; the second read three more, requested by
name to close named gaps, and **overturned two conclusions the first pass had drawn** — which is
the argument for asking for the missing cases rather than reasoning about them by symmetry.

What a bank's LINE push notification prints, and where — the sizing `PLAN.md` task 27 needs
before a reader can exist. Companion to `docs/SLIP_CONTRACT.md` and the three statement
contracts, under the same rule as all of them and as `lib/masked-diagnostics.ts`: **label
wordings are format knowledge and are recorded here; amounts, balances, dates, times, names,
account digits and counterparties are values and are not.** Nothing in this file came from a
fixture and nothing in it may become one.

The value rules — which calendar a printed year is in, and which digits of the account a layout
reveals — are already settled and live in `lib/notification-card.ts`. This file is about what
is printed and how to find it.

## Sample

Five screenshots. **Two are the in-app transaction lists this task excludes** (`PLAN.md` task
27), and both re-confirmed the exclusion rather than merely being skipped: SCB EASY's deposit
inquiry and Krungthai Connext's account detail each print a month of rows with **no per-row
balance and no totals block**, so neither of `confirm_import`'s balance walk nor D-033's
printed-totals check has anything to work with and a misread row would fail *open*. Krungthai's
is worse still — its rows carry no year at all, only the month tab does.

The remaining six screenshots carry **two cards each, twelve in total**, and **every layout is
now measured in both directions**. The three added on the second pass were asked for by name: an
incoming SCB Connect card, an incoming Krungthai card whose sender is at Krungthai, and a card
carrying a hold. The first two arrived and are what corrected the record below. The third does
not appear to exist for these accounts — see § What is not measured.

## The findings that decide the design

**Read labels, never positions.** The field order, the label set and even the *number of rows*
differ per layout **and per direction**. SCB Connect prints its amount above the labelled rows
with no label at all; KBank Live labels it; Krungthai Connext uses the direction word itself as
the label. Krungthai's incoming card carries a sender row that its outgoing card does not, and
the outgoing card carries two rows the incoming one does not. This is the same lesson
`docs/SLIP_CONTRACT.md` records for slips and D-024/D-026 record for statements, arriving for a
third time: a label is the only stable anchor.

**Direction is printed in words, on every layout, and that is a second signal worth using.**
Every card names its direction in a title or a label — and separately signs its amount. Two
independent signals for one fact means they can be cross-checked and made to fail closed when
they disagree, exactly as the statement readers take direction from the balance chain and
cross-check it against column geometry (D-039). A card whose words and sign disagree is a card
that was misread, and it should refuse rather than pick one.

**A screenshot carries two clocks and only one of them is the transaction.** The card prints
its own transaction timestamp; LINE prints a message timestamp outside the bubble. They are not
the same and are not reliably close — on one KBank pair they differ. The card's timestamp is
what equals the statement row's, so a reader that took the outer one would store a time that
can never match, and the balance cross-check would then be the only thing standing between a
card and a wrong row. **Take the timestamp from inside the card**, anchored as described below,
and never from an unanchored time-shaped string.

**Two layouts print two masked account numbers, and the label that names the owner's own account
in one direction names the counterparty's in the other.** `จากบัญชี` is the owner's account on
an outgoing card and the *sender's* on an incoming one, and both are printed as four digits.
Reading the wrong one binds the card to the wrong account, or to no account at all — the same
silent shape as the KBank offset the owner caught on 2026-08-12.

**The collision was first found on Krungthai Connext and recorded as Krungthai's alone. It is
not.** SCB Connect does exactly the same thing, and that only became visible once an incoming
SCB card was read: the first pass had two outgoing SCB cards, where `จากบัญชี` *is* the owner's
own account, and generalised from them. So the label is looked up **per layout and per
direction**, and the reason to believe that is a measurement rather than an analogy — the
analogy is what got it wrong the first time.

## Per layout

Direction below is the card's own, from the owner's point of view: **in** money arriving, **out**
money leaving.

### SCB Connect (`SCB`)

A coloured header band with a wallet icon, then the title, then the amount, then labelled rows.
The icon's arrow and the amount's colour both encode direction as well.

| Field | Anchor | Notes |
| --- | --- | --- |
| Direction | title line | `รายการเงินเข้า` (in), `รายการเงินออก` (out) |
| Amount | the line under the title | **No label.** Large, coloured, explicitly signed, followed by `บาท` |
| Own account | label `เข้าบัญชี` (in), `จากบัญชี` (out) | Value is the last four, printed with an `X-` prefix |
| Timestamp | label `วันที่/เวลา` | `dd/mm/yyyy hh:mm`, four-digit Gregorian |
| Balance | label `ยอดเงินที่ใช้ได้` | *Available* balance, followed by `บาท` |
| Counterparty | label `จากบัญชี` (**in** only) | **One row carries the sender's name, their masked account and their bank**, wrapping onto a second line when long. Name and account share this anchor rather than having one each |
| Description | label `รายการ` (**out**, sometimes) | A merchant or bill descriptor. Present on a bill payment, absent on a plain transfer — so an outgoing card's row count varies |

**Its incoming title is identical to KBank Live's**, so the printed words cannot tell those two
layouts apart at all. The channel has to come from the LINE conversation the screenshot was
taken in, never from the card body.

### KBank Live (`KBANK`)

A circular icon and a title, then the timestamp **directly under the title with no label**, then
labelled rows, then the balance row set off by a divider and printed in grey.

| Field | Anchor | Notes |
| --- | --- | --- |
| Direction | title line | `รายการเงินเข้า` (in), `รายการโอน/ถอน` (out) |
| Amount | label `จำนวนเงิน` | Bold, coloured, explicitly signed when negative, followed by `บาท` |
| Own account | label `เข้าบัญชี` (in), `จากบัญชี` (out) | Printed `xxx-x-xNNNN-x`: digits 6–9 of ten, final digit masked — **not** the last four |
| Timestamp | the line under the title | **No label.** `d <thai-month-abbrev> yy hh:mm` then the marker `น.`, two-digit Buddhist |
| Balance | label `ยอดเงินคงเหลือ` | *Remaining* balance, followed by `บาท` |
| Counterparty | — | Not printed |

### Krungthai Connext (`KTB`)

No header band, no icon and no title: the card is label/value rows alone, and the **first row is
the amount**, whose label is the direction word.

| Field | Anchor | Notes |
| --- | --- | --- |
| Direction | the amount's own label | `เงินเข้า` (in), `เงินออก` (out) |
| Amount | label `เงินเข้า` / `เงินออก` | Coloured, explicitly signed, followed by `บาท` |
| Type | label `ประเภท` | A transfer-kind phrase. Not stored; recorded because it occupies a row |
| Own account | label `เข้าบัญชี` (in), `จากบัญชี` (out) | Last four. **See the collision below** |
| Counterparty account | label `จากบัญชี` (in); `ไปยังบัญชี` **or** `หมายเลข` (out) | Last four, **always prefixed by the other party's bank code** — including when that bank is Krungthai itself, which is what makes the prefix a reliable second signal for telling this row from the owner's own |
| Counterparty name | label `ผู้โอน` (in); `ผู้รับโอน` **or** `ไปยัง` (out) | Truncated with an ellipsis when long |
| Timestamp | label `วันที่ทำรายการ` | `dd/mm/yy hh:mm`, two-digit Buddhist |
| Balance | label `ยอดที่ใช้ได้` | *Available* balance, followed by `บาท` |

**The collision, restated because it is the trap:** on an **out** card `จากบัญชี` is the owner's
account; on an **in** card the owner's account is `เข้าบัญชี` and `จากบัญชี` is the *sender's*.
Both values are four digits and neither is marked as belonging to the owner. Only the pairing of
label **and** direction distinguishes them.

**One direction, two measured variants.** An outgoing Krungthai card to a **bank account** uses
`ไปยังบัญชี` and `ผู้รับโอน`; the same card to a **wallet** uses `หมายเลข` and `ไปยัง`. A reader
keyed to one label reads one variant and silently misses the other, so both are registered.

The `ประเภท` value is free text and **is not always Thai** — one measured card reads
`Education Loan`. It is not stored; it is recorded because it occupies a row.

## Balance wording is not uniform, and the difference may matter

Two layouts print an **available** balance (`ยอดเงินที่ใช้ได้`, `ยอดที่ใช้ได้`) and one prints a
**remaining** balance (`ยอดเงินคงเหลือ`). At many banks those diverge exactly when a hold is
outstanding. All six measured cards matched their statement row's balance to the satang, but
none was captured while a hold existed, so the equality is proven for the ordinary case only —
which is enough to make the balance a tie-breaker and a fail-closed cross-check, and **not**
enough to make it identity. `PLAN.md` task 27 records the same limit.

## What is not measured

Stated so a reader refuses these rather than guessing at them.

- **No card captured while a hold was outstanding**, so *available* and *remaining* have never
  been observed diverging here. Asked for on 2026-08-12, and **the owner is unsure such a card
  exists for these accounts** — which is itself the useful answer: a hold is rare on ordinary
  Thai retail savings accounts, so the divergence may never occur in this ledger. Kept as a
  recorded limit rather than closed, because the cost of being wrong is a balance cross-check
  that refuses a correct pairing — a visible failure rather than a silent one, and the design
  already treats the balance as a tie-breaker rather than as identity.
- **Nothing distinguishes an SCB Connect card from a KBank Live one by wording** in the incoming
  direction, because the titles are identical. The channel is not derivable from the card.
- **n is 12**, four per layout, and both cards within a screenshot share an account and a day.
- **Row variants certainly exist beyond those seen.** Two were found for one direction of one
  layout only because two transfer types happened to be in the sample, and SCB's `รายการ` row
  appeared only when a bill payment did. Treat the label lists as open rather than closed, and
  prefer refusing an unrecognised row to guessing at it.
