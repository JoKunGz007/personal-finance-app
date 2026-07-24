# Krungthai layout contract

## Supported signature

Contract version `krungthai-layout-v1` requires a first-page Krungthai/กรุงไทย bank signature and the date, description, and balance anchors. A worker must validate the precise synthetic fixture geometry before it may emit rows. A recognizable bank logo without all anchors is not sufficient.

Required statement metadata: account mapping (bank, type, last four only), period, opening and closing balances, explicit THB currency, and every row's source index and page/row provenance.

## Row rules

Dates must be real calendar dates. Money is parsed from plain decimal text into signed minor units without floating point. A regular row has one component. The recognized interest/tax compound row has one positive interest deposit and one negative tax withdrawal whose sum is the movement.

The parser rejects wrong passwords, unknown layouts, missing metadata, unsupported currencies, invalid money/dates, ambiguous same-statement duplicates, and unknown compound rows. It preserves Thai source text after NFKC normalization for identity/search without translating it.

## Reconciliation

Rows reconcile from the opening balance in order. A known printed interest/tax ordering anomaly creates a warning and a visible resynchronization point; later rows continue from the printed balance. Other unexplained blockers prevent confirmation.

The current worker deliberately returns `LAYOUT_V1_UNSUPPORTED_DOCUMENT` after signature recognition until the geometry has been validated against approved synthetic fixtures. It must not be relaxed using a real statement without explicit approval and privacy-safe smoke-test controls.
