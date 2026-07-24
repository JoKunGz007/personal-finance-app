# Krungthai layout contract

## Supported signature

Contract version `krungthai-layout-v1` requires a first-page Krungthai/กรุงไทย bank signature and the date, description, and balance anchors. A worker must validate the precise synthetic fixture geometry before it may emit rows. A recognizable bank logo without all anchors is not sufficient.

Required statement metadata: account mapping (bank, type, last four only), period, opening and closing balances, explicit THB currency, and every row's source index and page/row provenance.

## Row rules

Dates must be real calendar dates. Money is parsed from plain decimal text into signed minor units without floating point. A regular row has one component. The recognized interest/tax compound row has one positive interest deposit and one negative tax withdrawal whose sum is the movement.

The parser rejects wrong passwords, unknown layouts, missing metadata, unsupported currencies, invalid money/dates, ambiguous same-statement duplicates, and unknown compound rows. It preserves Thai source text after NFKC normalization for identity/search without translating it.

## Reconciliation

Rows reconcile from the opening balance in order. A known printed interest/tax ordering anomaly creates a warning and a visible resynchronization point; later rows continue from the printed balance. Other unexplained blockers prevent confirmation.

## Geometry

The transaction grid is read by `lib/krungthai-layout.ts` against approved synthetic fixtures (`tests/fixtures/krungthai-layout-v1.ts`). Columns are located from a heading line that must carry every anchor — date, time, description, withdrawal, deposit, balance, channel — and each column owns the horizontal band from its own anchor to the next. Rows are grouped by printed line; a following line with no date of its own is a wrapped detail line belonging to the row above, and becomes that row's description. Withdrawals print unsigned and are stored negative.

The frame is read from label/value pairs printed above the grid on page one: account type, account number, period, opening balance, closing balance, and an explicit THB marker. Each value is whatever is printed to the right of its label on the same line. The account number is reduced to its **last four digits at the point of extraction**, so no full account number is ever carried past the parser. The period end year anchors every two-digit year in the statement, including its own start date, so a statement reads identically regardless of when it is parsed.

Every failure is a typed code and no row is guessed: `UNSUPPORTED_LAYOUT` (no bank signature), `MISSING_COLUMN_ANCHOR` (a page without a complete heading line), `AMBIGUOUS_ROW_GEOMETRY`, `INVALID_ROW_CONTENT` (unreadable date/time/money, impossible calendar date, no amount in either money column, an unknown compound row, or no rows at all), `MISSING_FRAME_FIELD`, `INVALID_FRAME_CONTENT` (unreadable or inverted period, unparsable balances), `UNSUPPORTED_CURRENCY` (the frame does not state THB), and `CLOSING_BALANCE_MISMATCH` (the final row balance disagrees with the printed closing balance, meaning rows were dropped or misread).

The fixture geometry is **invented**, per `docs/FIXTURE_POLICY.md`: no real statement was measured to derive it. The extractor is therefore proven against the synthetic layout only, and whether it matches a real Krungthai PDF is unknown until the separately authorized smoke test. It must not be adjusted using a real statement without explicit approval and privacy-safe smoke-test controls.

Not yet implemented: binding an extracted statement to a ledger account. The parser reads the account type and last four digits, but choosing which `accounts` row those map to is an explicit user action the parser must not infer, so a PDF still does not produce a confirmable import payload on its own.
