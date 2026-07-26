# SCB statement contract — `scb-layout-v1`

Derived on 2026-07-26 from masked structural dumps of 12 real statements
(`scb-01` … `scb-12`), per DECISIONS D-035, and **corrected on 2026-07-26** after the
first reading of this contract found it wrong about the money columns (D-039).

**No coordinate from those dumps is recorded here**, and none belongs in a fixture: like
the Krungthai reader, the SCB reader resolves every x position from the document at
runtime, so the geometry in `tests/fixtures/` stays invented
(`docs/FIXTURE_POLICY.md`).

Verified identical across all 12 months: 361 transaction rows, every one of them
matching the single row grammar below.

## Column headings

One heading line, printed in English, with a Thai mirror line directly beneath it. Seven
anchors, left to right:

`Date` · `Time` · `Code` · `Channel` · `Debit/Credit` · `Balance/Baht` ·
`Description/Note`

The Thai line beneath carries only six runs, because it prints the Time and Code
headings as one. It is boilerplate, it is not a valid anchor set, and the reader must
not treat it as a second heading row.

## The heading anchors do not bound the data columns

This is the correction that matters most, and it applies to the whole layout rather than
to any one column. **A heading's x position does not tell you where its data sits.** The
date runs begin left of the `Date` heading; the description runs begin far left of the
`Description/Note` heading, under `Balance/Baht`. Assigning runs to columns by banding
between heading anchors — the rule `lib/krungthai-layout.ts` uses, and the rule the
first draft of this contract assumed — misfiles most of a row.

What is stable is the **row grammar**: every one of the 361 rows is the same ordered
sequence of runs, and every field is identified by its kind and its position in that
sequence rather than by an x band. Geometry is used for exactly one thing, below.

## Rows

Each transaction is **two printed lines**, and the second is always present — 361 rows,
361 continuation lines.

1. The row: a combined date-and-time run, a short code, a channel name, the amount, the
   balance, the literal `DESC :`, then the description.
2. The continuation: the literal `DESC :` and one further detail value, frequently `-`.

Three things differ from Krungthai and each one is a defect waiting to happen:

- **Date and time share one run** (`dd/dd/dd dd:dd`). Krungthai prints the time on its
  own line (D-026). Splitting on whitespace inside the date cell is required here and
  forbidden there.
- **`DESC :` is a literal on both lines**, so a continuation is recognised by that
  marker rather than by vertical proximity alone.
- The row has no separate transaction-type column, so Krungthai's
  transaction-plus-description pair has no analogue and the interest/tax compound-row
  guard has nothing to key on.

## Money: one heading, two columns

**`Debit/Credit` is one printed heading over two separately right-aligned columns.** An
earlier draft of this contract said the opposite — one signed column, with direction not
encoded by position. That was wrong, and building on it would have read **every deposit
as a withdrawal**, which parses cleanly and inverts a real transaction. See D-039.

Three independent facts in the dumps say so:

- Across all 12 statements every row carries **exactly one** run in the money region —
  never none, never two — and those runs right-align into **two tight clusters**, well
  separated, with no run between them.
- The summary block right-aligns `TOTAL AMOUNTS (Debit)` on one cluster and
  `TOTAL AMOUNTS (Credit)` on the other, and prints the two `TOTAL ITEMS` counts on
  those same two edges. The document labels its own columns.
- The balance chain agrees: a run in the left cluster always decreases the printed
  balance and a run in the right cluster always increases it.

Debit is the left cluster and credit the right, matching the order the heading names
them in. Money and balance are **right-aligned**, so D-030's midpoint reasoning applies
— but for these two columns the right edge, not the midpoint, is the invariant, because
that is what alignment fixes.

The reader must not take the split from a hard-coded x. It derives direction from the
balance delta, requires the two derived directions to occupy two distinct right-edge
clusters, and fails closed when arithmetic and geometry disagree.

## Brought-forward balance

Printed as a pseudo-row above the first transaction, with a parenthesised English label
(`Balance Brought Forward`) beside a Thai one in the description position, and the
figure in the balance column. It is not a transaction and must not be read as one — but
it does mean the opening balance is **printed**, so the derivation D-026 forced on
Krungthai is unnecessary here.

It is printed on page one and on the last page. **Whether it repeats on the middle pages
is not knowable from these dumps** — the harness prints page one and the last page in
full and truncates the pages between them — so the reader must accept it at the top of
any page and treat only page one's as the statement opening. Where it does appear, it
carries a free per-page check: the carry-forward must equal the previous page's last
balance.

## Frame

Printed above the grid on the right, repeating on every page. Labels are Thai
(`เลขที่บัญชี` for the account number, `ที่อยู่` for the address, `วันที่` for the period). The
account number prints as `ddd-dddddd-d`.

The period prints with **four-digit years** (`dd/dd/dddd - dd/dd/dddd`), so the
Buddhist/Gregorian ambiguity that caused D-031 cannot arise in the frame. Row dates are
still two-digit (`dd/dd/dd`), so the era resolved from the period end must still be
threaded to every row exactly as `resolveStatementEra` does.

## Currency

**Not in the frame block.** No `Currency` label appears there, so D-034's guard as
written for Krungthai cannot be satisfied and must not simply be dropped.

The currency is printed, though — in the column heading itself, as `Balance/Baht`. That
is a stronger place than the frame, not a weaker one: it is attached to the very column
whose figures it denominates. The guard is therefore kept and relocated per layout,
never replaced by an assumption (D-040).

## Summary block

Bottom of the last page, three lines:

- `TOTAL AMOUNTS (Debit)` — one amount
- `TOTAL AMOUNTS (Credit)` — one amount
- `TOTAL ITEMS` — **two counts**, one per direction, right-aligned on the two money
  columns

Present in all 12 statements. This supports the D-033 cross-check in full: per-direction
counts and per-direction totals. The shape differs from Krungthai's `Total Page` /
`Total Withdrawal` / `Total Deposit`, where each label carries its own count, and from
KBANK's, which embeds the count in the label text.

No closing balance is printed anywhere, so it is derived from the last row as D-026
does for Krungthai.

## Not yet known

- Whether the brought-forward row is printed on the middle pages (see above).
- Whether the transaction heading line repeats on the middle pages. Page one and the
  last page carry it, and the frame block above it repeats on every page including the
  truncated ones, so the reader requires it per page and fails closed — but that is an
  inference from symmetry, not an observation.
- Whether a statement with no transactions prints the grid at all.
- Whether amounts above ~1,000,000 keep the same alignment. Right-edge matching is
  insensitive to a value's width, which is part of why it was chosen over banding.
