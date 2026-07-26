# KBANK statement contract — `kbank-layout-v1`

Derived on 2026-07-26 from masked structural dumps of two real statements, per DECISIONS
D-035, and **corrected on 2026-07-26** after the first reading of this contract found it
silent on the money columns (D-039).

**No coordinate from those dumps is recorded here** — the reader resolves x from the
document at runtime, so fixture geometry stays invented (`docs/FIXTURE_POLICY.md`).

Only two statements were available, against twelve for SCB, so treat "verified across
months" as unproven here. What they do give is 89 transaction rows, every one matching
the single row grammar below.

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

## Column headings span three lines, not two

An earlier draft said two. It is three, and only the middle one carries a full row of
headings:

- upper: a `Date/` fragment, and the balance column's heading (`Outstanding Balance`)
- main: `Date` · `Descriptions` · `Withdrawal / Deposit` · `Channel` · `Details`
- lower: `Trn.Time`, completing the `Date/Trn.Time` heading begun on the upper line, and
  `(THB)`, completing the balance heading

Anchoring only on the main line gives five anchors for six data columns, and the balance
column then falls inside the `Withdrawal / Deposit` band — both the amount and the
balance land in one column and the row is unreadable. The reader must compose the
heading from all three lines. All three repeat on every page.

## The heading anchors do not bound the data columns

As in SCB, and for the same reason. The date runs begin left of the `Date` heading; the
description runs begin left of the `Descriptions` heading, under the time column's band.
Banding between heading anchors misfiles a short description as a time.

What is stable is the **row grammar**: all 89 rows are the same ordered sequence of runs
— date, time, description, amount, balance, channel, details — and every field is
identified by its kind and its position in that sequence. Geometry is used for exactly
one thing, below.

## Rows

Each transaction is one line plus zero or more continuation lines carrying only the
details or channel column.

Date and time are **two separate runs on the same line** — a third arrangement, after
Krungthai's time-on-its-own-line and SCB's single combined run.

The date separator is a **hyphen** (`dd-dd-dd`), not a slash. Any shared date probe must
take the separator from the layout rather than assuming one.

**But the frame does not use it.** The period prints as `dd/dd/dddd - dd/dd/dddd`, with
slashes, on the same document whose rows use hyphens — so a layout has one row separator
and not one date separator. Threading the row separator through to the frame made every
KBANK statement report a missing period, which is how this was found.

## Money: one heading, two columns

**`Withdrawal / Deposit` is one printed run over two separately right-aligned columns.**
The earlier draft listed it as a single anchor among five and said nothing about a split,
which would have read **every deposit as a withdrawal**. See D-039.

The heading is a single pdf.js run, so it cannot be split into two x positions — unlike
SCB, whose summary block right-aligns a labelled total on each of the two columns, KBANK
prints both summary amounts in a third column entirely and offers no geometric hint at
all. The evidence is the rows themselves:

- Every row carries **exactly one** run in the money region, and those runs right-align
  into two tight clusters with nothing between them. The two clusters are closer
  together than SCB's, so the tolerance must be small.
- The balance chain agrees, and `kbank-03` shows it at its cleanest: a run in the right
  cluster takes the balance from tens to tens of thousands, and the very next row's run
  in the left cluster — **the same printed shape** — takes it back to single digits.

Withdrawal is the left cluster and deposit the right, matching the order the heading
names them in. Both money columns and the balance are right-aligned, so the right edge,
not the midpoint, is the invariant.

The reader derives direction from the balance delta, requires the two derived directions
to occupy two distinct right-edge clusters, and fails closed when arithmetic and
geometry disagree.

## Brought-forward balance

A pseudo-row at the top of the grid, labelled `Beginning Balance` in the description
position, carrying a date and a balance but **no time and no amount** — the grammar
distinguishes it from a transaction without needing the label.

It is printed **on every page**, confirmed directly: the two-page statement carries one
at the top of each. Only page one's is the statement opening; the rest are
carry-forwards and must be neither imported as rows nor mistaken for a second opening.
Each one is also a free per-page check against the previous page's last balance.

## Frame

A labelled block in the upper right, label and value on one line, repeating on every
page:

`Reference Code` · `Account Number` · `Period` · account name · `Ending Balance`

The account number prints as `ddd-d-ddddd-d` — a different grouping from SCB's
`ddd-dddddd-d`, so the last-four extraction must not assume a group layout.

The period prints with **four-digit years** and slash separators, as SCB's does — see the
note above on why that is not the row separator.

`Ending Balance` is printed on page one only, so unlike SCB and Krungthai the closing
balance need not be derived and the chain has a printed figure to close onto.
`Beginning Balance` is **not** in this block, despite appearing in the same masked
section of the dump — it is the grid's pseudo-row, above.

## Currency

**Not in the frame block**, so D-034's guard as written for Krungthai cannot be
satisfied. It is printed as `(THB)` on the lower heading line, directly under the balance
column's heading — attached to the column it denominates. The guard is kept and
relocated per layout rather than replaced by an assumption (D-040).

## Summary block

**At the top of page one, not the bottom of the last page** — the opposite of both
Krungthai and SCB, and page one only. Two lines:

- `Total Withdrawal <n> items` — with an amount
- `Total Deposit <n> items` — with an amount

The count is **embedded inside the label's own run**, not printed as a separate column,
so it is read by matching the label pattern rather than by taking the next run.
Krungthai prints label-then-count-then-amount; SCB prints counts on their own
`TOTAL ITEMS` line. Three layouts, three encodings of the same fact, and a cross-check
that assumes any one of them fails closed on the other two.

Both amounts are right-aligned in a column of their own, well right of the grid's
balance column — which is why they cannot double as the money columns' geometric anchor
the way SCB's do.

## Confirmed against a real statement

On 2026-07-27 the owner read one real KBANK statement in a browser, on the first attempt:
**55 rows across 2 pages, covering six months**, through to the account-binding stage.

This one is verified rather than merely successful, on two independent grounds. The masked
dump of that same document (`kbank-02`) contains exactly 55 transaction rows, and because
it is a two-page statement the dump covers **every page in full** — so that is complete
coverage, not a sample. And the dump shows its summary block at the top of page one in the
shape this reader matches, so the D-033 cross-check ran: the bank's own printed counts and
per-direction totals agreed with all 55 rows. The row count is therefore confirmed by the
document's own arithmetic, not only by the reader agreeing with itself.

The six-month range is also the first evidence about period length beyond the two dumps.
It is not evidence about month-to-month stability, which remains untested.

## Not yet known

- Whether the summary block ever moves to the last page on a longer statement. The
  five-page SCB statement says nothing about this; the KBANK statement read was two pages.
- Whether more than two continuation lines occur.
- Month-to-month stability: still two statements plus one real read, all of the same
  account. Not evidence.
- Whether a row can ever omit the channel or details column. Neither dump has one, so
  the reader treats both as optional rather than assuming they are always printed.
