/**
 * A date range, and the one spelling of it that both surfaces taking one agree on.
 *
 * **This exists so that `/statistics?from=…&to=…` and `/ledger?from=…&to=…` mean the same thing.**
 * The statistics window picker (PLAN task 46, D-170/D-172) and the ledger's date filter (task 47)
 * are different controls answering different questions, but the pair of dates underneath them is
 * the same object with the same encoding — so a link that names a day opens either page on that
 * day, and the calendar task 47 was originally about can hand a date to the ledger without a
 * translation step. Two independently written `from`/`to` builders would have been two conventions
 * that agreed until the first time one of them changed.
 *
 * Everything here is **pure string arithmetic and no `Date` is constructed**, for the reason
 * `windowForPreset` states at length: parsing an ISO day into a `Date` invites the local-versus-UTC
 * offset and month-length clamping, and neither has any business in a query-string encoder.
 */

/** Either end may be open. An open end means "as far as the ledger goes", which the RPCs resolve. */
export type DateRange = { readonly from: string | null; readonly to: string | null };

/** No bounds at all — what both surfaces show until someone narrows them. */
export const OPEN_RANGE: DateRange = { from: null, to: null };

/**
 * Writes a range into a parameter set that may already hold other things.
 *
 * **An open end is omitted rather than sent blank**, and that is a wire fact rather than a
 * preference: both routes read `searchParams.get`, which yields `null` when a parameter is absent
 * and `""` when it is present and empty, and `""` fails their date patterns with a 400.
 */
export function appendRange(params: URLSearchParams, range: DateRange): void {
  if (range.from !== null) params.set("from", range.from);
  if (range.to !== null) params.set("to", range.to);
}

/** A range on its own as a query string, empty when both ends are open. */
export function rangeSearch(range: DateRange): string {
  const params = new URLSearchParams();
  appendRange(params, range);
  const query = params.toString();
  return query === "" ? "" : `?${query}`;
}

/**
 * The inverse, and **total**: every string yields a range, because the input is a URL and a URL is
 * whatever someone typed.
 *
 * An empty parameter reads as an open end rather than as the empty string, which is the same
 * equivalence `appendRange` writes in the other direction. The dates are returned **as written** —
 * `isUsableRange` is what refuses a transposed pair, and validating here as well would put one rule
 * in two places and let them disagree.
 */
export function rangeFromSearch(search: string): DateRange {
  const params = new URLSearchParams(search);
  const from = params.get("from");
  const to = params.get("to");
  return {
    from: from === null || from === "" ? null : from,
    to: to === null || to === "" ? null : to
  };
}

/**
 * Whether a range is one the routes will accept, so a surface never sends a known 400.
 *
 * A half-open range is usable: the absent end is resolved by the database, not by the caller. Only
 * a pair that is present and out of order is refused — and `list_account_transactions_page` refuses
 * it too (`ledger window ends before it begins`), so neither side is trusting the other to check.
 */
export function isUsableRange(range: DateRange): boolean {
  if (range.from === null || range.to === null) return true;
  return range.from <= range.to;
}
