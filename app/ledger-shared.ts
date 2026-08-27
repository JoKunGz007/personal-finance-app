/**
 * What every ledger row component is handed, and the one date format they all print.
 *
 * `app/transactions-view.tsx` was 1553 lines with about 940 of them in a single `return`, and the
 * four record kinds it renders — a statement row, a slip, a cash entry and a notification card —
 * were four branches of one `map` rather than four things. They are components now
 * (`app/ledger-statement-row.tsx`, `app/ledger-slip-row.tsx`, `app/ledger-cash-row.tsx`,
 * `app/ledger-card-row.tsx`). This module holds what they have to agree about.
 *
 * **No behaviour changed when they were split out.** The markup, the disable conditions, the
 * wordings and the accessible names are the ones that were there; what moved is where they live.
 */

import { type RowStatus } from "@/lib/slip-reconcile";

/** The Account control's "no account chosen" value, which is not an account id. */
export const ALL_ACCOUNTS = "all";
/** The Status control's "ask nothing" value, which is not a `RowStatus`. */
export const ALL_STATUSES = "all";

export type Order = "newest" | "oldest";
export type StatusFilter = typeof ALL_STATUSES | RowStatus;

/**
 * One date format for the whole ledger, because four copies would be four chances to disagree.
 *
 * `+07:00` rather than the browser's zone, matching the rule `lib/dates.ts` carries for every
 * derived instant: a row dated from a statement is a Bangkok date, and formatting it in the
 * viewer's zone would move it across a day boundary for anyone reading from elsewhere.
 */
export function formatDate(date: string) {
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" })
    .format(new Date(`${date}T00:00:00+07:00`));
}

/**
 * Whether the table is showing the all-accounts layout, and how many columns that makes.
 *
 * The two travel together because they cannot be allowed to disagree: `columns` is what a
 * full-width detail or correction row spans, and it was written as `showCombined ? 7 : 6` at
 * five separate places in the file this came out of.
 */
export type LedgerLayout = {
  readonly showCombined: boolean;
  readonly columns: number;
};

/**
 * What the owner is in the middle of — the one thing every row has to consult before it decides
 * whether its own controls are usable.
 *
 * Grouped rather than passed as seven separate props because they are read as a set: a row asks
 * "is a write in flight anywhere", not "is this particular id deciding". The disable conditions
 * that read them stay beside the buttons they disable, which is where their comments are.
 */
export type LedgerModes = {
  /** A slip is being matched by hand, and the mode is fully on (the slip still exists). */
  readonly picking: boolean;
  /** A card is being matched by hand, on the same terms. */
  readonly pickingCard: boolean;
  /** The slip being matched, by id, or null. */
  readonly matching: string | null;
  /** The card being matched, by id, or null. */
  readonly matchingCard: string | null;
  /**
   * The slip whose decision is being written, by id, or null.
   *
   * Every decision control disables on this, not just the one row's: two writes in flight let the
   * first to resolve re-enable a button whose own write is still pending, and the second press
   * then sends a revision the database has already moved past.
   */
  readonly deciding: string | null;
  /** The card whose decision is being written, by id, or null. */
  readonly decidingCard: string | null;
  /** The record whose correction form is open, by its own id. One at a time. */
  readonly correcting: string | null;
  /**
   * The transaction whose `include_in_reporting` is being written, by id, or null.
   *
   * One at a time like every other write here, and for the same reason: two in flight let the
   * first to resolve re-enable a control whose own write is still pending, and the second press
   * then sends a revision the database has already moved past.
   */
  readonly settingReporting: string | null;
};
