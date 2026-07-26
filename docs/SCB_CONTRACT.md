# SCB statement contract — `scb-layout-v1`

Derived on 2026-07-26 from masked structural dumps of 12 real statements
(`scb-01` … `scb-12`), per DECISIONS D-035. **No coordinate from those dumps is
recorded here**, and none belongs in a fixture: like the Krungthai reader, the SCB
reader anchors on heading *words* and resolves every x position from the document at
runtime, so the geometry in `tests/fixtures/` stays invented (`docs/FIXTURE_POLICY.md`).

Verified identical across all 12 months.

## Column headings

One heading line, printed in English, with a Thai mirror line directly beneath it that
carries no separate columns. Seven anchors, left to right:

`Date` · `Time` · `Code` · `Channel` · `Debit/Credit` · `Balance/Baht` · `Description/Note`

The Thai line beneath is boilerplate and is not an anchor. The reader must not treat it
as a second heading row.

## Rows

Each transaction is **two printed lines**:

1. The row itself: date and time as a **single run** (`dd/dd/dd dd:dd`), then a short
   channel code, a channel name, the amount, the balance, then the literal `DESC :` and
   the description.
2. A continuation line carrying only `DESC :` and a second detail value, frequently `-`.

Three things differ from Krungthai and each one is a defect waiting to happen:

- **Date and time share one run.** Krungthai prints the time on its own line (D-026).
  Splitting on whitespace inside the date cell is required here and forbidden there.
- **One signed money column, not two.** `Debit/Credit` is a single column; direction is
  not encoded by which column the figure sits in. Krungthai's withdrawal/deposit pair
  does not apply, and the interest/tax compound-row guard has no analogue.
- **`DESC :` is a literal on both lines**, so a continuation line is recognised by that
  marker rather than by vertical proximity alone.

Money and the balance are **right-aligned**, so D-030's midpoint rule applies unchanged.

## Opening balance

Printed as a pseudo-row above the first transaction, with a parenthesised label in the
description position and the figure in the balance column. It is not a transaction and
must not be read as one — but it does mean the opening balance is **printed**, so the
derivation D-026 forced on Krungthai is unnecessary here.

## Frame

Labels are Thai (`เลขที่บัญชี` for the account number, `ที่อยู่` for the address,
`วันที่` for the date). The account number prints as `ddd-dddddd-d`.

The statement period prints with **four-digit years** (`dd/dd/dddd - dd/dd/dddd`), so
the Buddhist/Gregorian ambiguity that caused D-031 cannot arise in the frame. Row dates
are still two-digit (`dd/dd/dd`), so the era resolved from the period end must still be
threaded to every row exactly as `resolveStatementEra` does.

## Summary block

Bottom of the last page, three lines:

- `TOTAL AMOUNTS (Debit)` — one amount
- `TOTAL AMOUNTS (Credit)` — one amount
- `TOTAL ITEMS` — **two counts**, one per direction

This supports the D-033 cross-check in full: per-direction counts and per-direction
totals. Note the shape differs from Krungthai's `Total Page` / `Total Withdrawal` /
`Total Deposit`, where each label carries its own count.

## Not yet known

- Whether a statement with no transactions prints the grid at all.
- Whether the currency is stated in the frame block (D-034 requires it for Krungthai);
  no `Currency` label appeared in the dumps' frame region, so the guard may need a
  layout-specific answer rather than a shared one.
- Whether amounts above ~1,000,000 keep the same alignment.
