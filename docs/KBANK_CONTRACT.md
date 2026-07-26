# KBANK statement contract — `kbank-layout-v1`

Derived on 2026-07-26 from masked structural dumps of two real statements, per DECISIONS
D-035. **No coordinate from those dumps is recorded here** — the reader anchors on
heading words and resolves x from the document at runtime, so fixture geometry stays
invented (`docs/FIXTURE_POLICY.md`).

Only two statements were available, against twelve for SCB, so treat "verified across
months" as unproven here.

## A glossary is not a statement

The KBANK folder contained a third PDF that is a **bank-abbreviation reference table** —
three columns of code plus Thai, Chinese and English bank names, no transactions. Its
Thai and Chinese runs decode to arbitrary code points (embedded subset fonts with no
usable `ToUnicode`), which briefly looked like proof that KBANK statements were
unreadable. They are not: the real statements decode cleanly.

Two consequences worth keeping:

- The reader must reject a non-statement PDF on its signature, not attempt it.
- Mis-decoded text is why `maskShape` now masks to `?` outside an allowlist rather than
  passing symbols through — those glyphs were a substitution cipher of real content.

## Column headings

The heading row spans **two printed lines**, and one column's heading sits on the upper
one. This is the structural fact that no amount of reasoning from Krungthai or SCB would
have produced:

- upper line: a `Date/` fragment, and the balance column's heading
- main line: `Date` · `Descriptions` · `Withdrawal / Deposit` · `Channel` · `Details`

Anchoring only on the main line gives five anchors for six columns, and the balance
column then falls inside the `Withdrawal / Deposit` band — both the amount and the
balance land in one column and the row is unreadable. The reader must compose the
heading from both lines.

## Rows

Each transaction is one line plus zero or more continuation lines carrying only the
details column.

Date and time are **two separate runs on the same line** — a third arrangement, after
Krungthai's time-on-its-own-line and SCB's single combined run.

The date separator is a **hyphen** (`dd-dd-dd`), not a slash. Any shared date probe must
take the separator from the layout rather than assuming one.

Money and balance are right-aligned, so D-030's midpoint rule applies.

## Frame

A labelled block in the upper right, label and value on one line:

`Reference Code` · `Account Number` · `Period` · account name · `Beginning Balance` ·
`Ending Balance`

The account number prints as `ddd-d-ddddd-d` — a different grouping from SCB's
`ddd-dddddd-d`, so the last-four extraction must not assume a group layout.

The period prints with **four-digit years**, as SCB's does.

## Summary block

**At the top of page one, not the bottom of the last page** — the opposite of both
Krungthai and SCB. Two lines:

- `Total Withdrawal <n> items` — with an amount
- `Total Deposit <n> items` — with an amount

The count is **embedded inside the label text**, not printed as a separate column.
Krungthai prints label-then-count-then-amount; SCB prints counts on their own
`TOTAL ITEMS` line. Three layouts, three encodings of the same fact, and a cross-check
that assumes any one of them fails closed on the other two.

Beginning and Ending Balance are both printed, so balances need not be derived (D-026).

## Not yet known

- Whether the summary block ever moves to the last page on a longer statement.
- Whether more than two continuation lines occur.
- Whether a currency marker appears anywhere in the frame (D-034).
- Anything about month-to-month stability: two statements is not evidence.
