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
import { type AccountTransaction, type TransactionOverlay } from "@/lib/transactions";

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
 * The same date with its weekday in front, for a day-group heading row.
 *
 * **The weekday is the whole reason this exists.** A heading that read "30 Aug 2026" would repeat
 * what the Date column already prints on every row beneath it; "Sat 30 Aug 2026" says the thing the
 * table cannot, which is where the week fell - and a ledger read for spending habits is read by
 * weekday as often as by date. Same `+07:00` rule as `formatDate`, and for the same reason: the
 * weekday of a Bangkok date must not be computed in the reader's zone, or a Monday becomes a Sunday
 * for anyone west of here.
 */
export function formatDayHeading(date: string) {
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric" })
    .format(new Date(`${date}T00:00:00+07:00`));
}

/**
 * The balance a window closes on, and what it is a balance of.
 *
 * `date` travels with the figure rather than being inferred at the point of display, because the
 * whole hazard of this number is that it looks current and is only as current as the window: a
 * ledger narrowed to March closes on March's balance, and a strip that printed it without saying
 * so would be quietly wrong on every date filter. `combined` distinguishes the all-accounts figure
 * (`combined_balance_minor`, migration 022) from one account's own `post_balance_minor`; the two
 * are different facts and only the row knows which it is carrying.
 */
export type LedgerBalance = {
  readonly minor: string;
  readonly date: string;
  readonly combined: boolean;
};

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

/**
 * Everything a row can ask the view to do, assembled once in `app/transactions-view.tsx`.
 *
 * **One prop rather than one per action**, which is `LedgerModes`' own reasoning applied to the
 * other direction: a row reads what the owner is in the middle of as a set, and it asks for things
 * from the same single owner of that state. Threaded one by one, each new row action cost a prop on
 * the row's type, a destructured name and a line at its call site — twenty-one of them across the
 * four components. A row still calls only the actions its own markup offers; the rest are simply unread.
 *
 * Data a row renders from (`categories`, `categorySaving`) stays a prop of its own. This carries
 * verbs only.
 */
export type LedgerActions = {
  /** Asks the table to show only this slip and the rows it could be. */
  readonly chooseRowForSlip: (slipId: string) => void;
  /** The same for a card. */
  readonly chooseRowForCard: (cardId: string) => void;
  readonly decideSlip: (slipId: string, decision: "matched" | "unmatched", transactionId: string | null) => void;
  readonly decideCard: (
    cardId: string,
    decision: "matched" | "unmatched" | "not-a-payment",
    transactionId: string | null,
    acceptBalanceMismatch?: boolean
  ) => void;
  /**
   * Takes a row in or out of income and spending totals (PLAN task 48).
   *
   * It is handed the **whole transaction** rather than an id, because the write replaces the whole
   * overlay and the row is where the rest of that overlay lives. An id would leave the caller to
   * find the row again, which is the shape that invites sending nulls for the fields it did not
   * find — the erasure `overlayWriteBody` exists to make unrepresentable.
   */
  readonly setReporting: (transaction: AccountTransaction, includeInReporting: boolean) => void;
  /** Opens or closes a statement row's slip detail, by transaction id. */
  readonly togglePair: (transactionId: string) => void;
  /** Opens or closes a statement row's card detail, by transaction id. */
  readonly toggleCard: (transactionId: string) => void;
  /**
   * Opens or closes the one correction panel, keyed by the record's own id.
   *
   * **Shared by every row kind, a statement row's category editor included**, rather than one
   * piece of state per kind — it already means exactly "the record whose correction form is open,
   * by its own id, one at a time, table-wide", and a transaction id never collides with a slip's,
   * a cash entry's or a card's in any comparison the ledger makes. A second, parallel "one thing
   * open" gate would only be a second invariant to keep in sync with this one.
   */
  readonly toggleCorrecting: (recordId: string) => void;
  /** Closes whichever correction panel is open. */
  readonly stopCorrecting: () => void;
  /** A saved correction, folded back into ledger state, keyed by the record it corrects. */
  readonly storeSlipCorrection: (slipId: string, saved: unknown) => void;
  readonly storeCashCorrection: (entryId: string, saved: unknown) => void;
  readonly storeCardCorrection: (cardId: string, saved: unknown) => void;
  /** The saved overlay, folded back into ledger state and closing the panel on success. */
  readonly saveCategoryOverlay: (transactionId: string, overlay: TransactionOverlay) => void;
  /** A refused or unreachable category write, reported for the view's own error line. */
  readonly reportCategoryError: (message: string) => void;
  /** Whether a category write is in flight, which disables that row's own toggle meanwhile. */
  readonly setCategorySaving: (busy: boolean) => void;
};
