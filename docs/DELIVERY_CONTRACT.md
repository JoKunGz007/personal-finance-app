# Food delivery order contract

Last measured: 2026-09-23, against the owner's real GrabFood and LINE MAN orders in the gitignored
`receipts_sample/food_delivery/` and two Grab e-receipt emails read in the owner's signed-in
mailbox, under an explicit owner request to look at them. Read in the session only.

What a GrabFood and a LINE MAN order prints, in each form it can be obtained in, and which form
this app reads. Companion to `RECEIPT_CONTRACT.md`; **same rule: label wordings and layout are
format knowledge and are recorded here; dish names, amounts, booking and order numbers, card
digits, promo codes, restaurant names, names, phone numbers and addresses are values and are
not.** Nothing in this file came from a fixture, and nothing in it may become one.

This file is format knowledge only. The design that consumes it is `PLAN.md` task 58.

## The finding that decides the design

**An order is never money in this app**, for the same reason a 7-Eleven receipt is not
(`RECEIPT_CONTRACT.md`): the card or bank payment is already a ledger row. An order itemizes it.

**Except that an order's total is not always what the owner paid.** An order paid under the
government co-payment scheme (Thais Help Thais, 60/40, settled through เป๋าตัง) prints the
**whole food price as a discount** and a total of ฿0. The owner's own share appears on neither
the email nor the screenshot, and no card is charged, though the email still names the card.
So a ฿0 total must be read as "paid outside the platform", never as a free meal, and must never
be matched to a card row.

## GrabFood: two forms, and email is the one read

| | E-receipt email | In-app order page (screenshots) |
| --- | --- | --- |
| Arrives | automatically, one per order, subject "Your Grab E-Receipt" | only if the owner screenshots it |
| Booking ID | yes | first screenshot only |
| Dishes, options, quantities, prices | yes, options as indented lines | yes, across screenshots |
| Food subtotal, delivery fee, each discount, total | yes | yes, second screenshot |
| Discount **names** | some only as promo codes | readable names |
| Payment | card brand and last four digits | card logo only |
| Time | when the email was sent (after delivery) | when the order was placed |
| Owner's address, phone, rider details | **no**, only the owner's saved label for the destination | **yes**: address, rider name, photo and plate, note to rider |

**The email is the form this app reads.** One email is one whole order, it needs no OCR, and it
carries none of the personal details the screenshots do. Its only loss is a readable name for
some discounts, including the co-payment scheme, which the email shows only as a promo code. The
code seen did not encode the scheme's split, so **no split may be inferred from a code**.

**The screenshots cannot be joined safely.** The second screenshot, which holds the money,
carries only the date and time in its header: no booking ID. Two orders the same evening, or one
missing screenshot, would attach a total to the wrong order.

**Rides come from the same sender in a different template**: subject "Your Grab E-Receipt", body
headed "E-Receipt/Abbreviated Tax Invoice" with the ride type ("Standard Bike", "Saver Bike").
Not read yet. The same mailbox also carries "Sorry your order was cancelled" and GrabCoins
promotions, which are not receipts.

## LINE MAN: two forms, and no email

LINE MAN sends no food receipt by email and has no setting for it; its help centre says only a
short receipt is issued, delivered through the **LINE MAN Notice** account in LINE.

| | LINE MAN Notice (in LINE) | In-app order page (screenshots) |
| --- | --- | --- |
| Order number | top of the first screenshot and in the tax-invoice footer of the last | first screenshot only |
| Dishes and options | **no** | yes |
| Food subtotal, total, payment method | yes | yes |
| Delivery fee | **after discounts only** | gross, with each discount on its own line |
| Owner's name, address, phone | name and address | name, phone, both addresses, note to rider |

**The order page is the form this app reads**, because the owner wants the dishes. It prints
everything the Notice does and more. It is read through Google Cloud Vision, so it stops when the
Vision trial ends (2026-11-15) unless the owner upgrades.

Its second screenshot has no order number and no date, so the join is made safe by rules rather
than by a key: the screenshots of one order are picked together, the first must show the order
number and date, dishes must sum to the food line, food plus fee minus each discount must equal
the total, and the second screenshot's opening lines must overlap the first's closing ones.

## What is never stored

The owner's name, phone number, delivery and restaurant addresses, notes to the rider, and every
rider detail (name, photo, vehicle, plate). Dropped by the reader before anything is sent or
written, as the 7-Eleven taxpayer block is (`RECEIPT_CONTRACT.md`).

## The GrabFood e-receipt's layout, measured 2026-09-23

Measured over all 114 real food receipts in the four backfill bundles by `scripts/measure-grab-mail.ts`, as masked line shapes and counts only (D-219). Read on the server by `lib/delivery-grab.ts`.

- **Every label and every amount is its own line** once the HTML is flattened: `ค่าอาหาร` on one line, `฿ 250` on the next. A dish is `1x`, its name, its price, then zero or more priceless option lines (0 to 11 measured).
- **The total is printed twice**: `รวม` under the heading, and again after the discounts. They must agree.
- The date line reads `dd Mon yy HH:MM +0700` and is the email's send time.
- `รหัสการจอง`, `สถานที่เริ่มต้นการเดินทาง:` and `รูปแบบการชำระเงิน:` each carry their value on the next line. The destination and the name on the receipt sit between them under their own labels and are never read.
- After `ค่าจัดส่ง`, each line is a **discount printed with a minus sign** (`- ฿ n`; rides print `฿ -n`) or, on 2 receipts, a **charge printed without one**. A discount's name can itself contain a baht figure, so only an amount-only line is an amount.
- **A GrabCoins redemption is not printed on the e-receipt.** One receipt's lines do not reach its printed total, and the Grab app's order page shows the missing deduction as GrabCoins. The reader stores such an order with an `unprinted` line sized to the gap, only when both printed totals agree and more was taken off than printed (D-219).
- Rides use the "E-Receipt/Abbreviated Tax Invoice" template and are skipped.
