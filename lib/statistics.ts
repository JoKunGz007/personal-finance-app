import { z } from "zod";
import { isoDateSchema } from "@/lib/dates";
import { appendRange, isUsableRange, type DateRange } from "@/lib/date-range";
import { minorUnitStringSchema, type MinorUnitString } from "@/lib/money";
import { ACCOUNT_ID_PATTERN } from "@/lib/accounts";

/**
 * Wire contract for `GET /api/v1/statistics`, which returns `public.ledger_statistics` verbatim
 * (PLAN task 44, D-160).
 *
 * **Every money field is a canonical minor-unit string, and that is the whole reason this file is
 * strict.** The RPC casts every `bigint` with `::text`; parsing any of it into a `number` here would
 * be the one place a float could enter a money path, and a statistics page is precisely where that
 * habit would first look harmless. Counts and divisors are ordinary integers because they are not
 * money — a divisor is a number of days.
 */

/**
 * An average, kept as the pair that makes it exact.
 *
 * **The quotient alone is lossy and the pair is not**: `quotient * divisor + remainder = total`
 * holds for every case including negative totals, where PostgreSQL truncates toward zero on both
 * operators. This app has never divided money, and this shape is the price of starting — an average
 * of money *is* money, so it cannot become a float and cannot quietly drop what the division left.
 */
export const exactAverageSchema = z.object({
  quotient: minorUnitStringSchema,
  remainder: minorUnitStringSchema
}).strict();

export type ExactAverage = z.infer<typeof exactAverageSchema>;

export const averageGroupSchema = z.object({
  divisor: z.number().int().positive(),
  // Present on the weekly group only. The weekly average is `total * 7 / days` — one division on a
  // scaled numerator, never the daily quotient multiplied by seven, which compounds the daily
  // truncation and drifts. The field records that the numerator was scaled.
  scale: z.number().int().positive().optional(),
  deposits: exactAverageSchema,
  withdrawals: exactAverageSchema
}).strict();

export const monthlyStatisticSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  // The days of this month that fall **inside the window**, which is what makes the first and the
  // current month divide by the right number instead of by their calendar length.
  days: z.number().int().positive(),
  isPartial: z.boolean(),
  deposits: minorUnitStringSchema,
  withdrawals: minorUnitStringSchema,
  net: minorUnitStringSchema,
  transactions: z.number().int().nonnegative(),
  // The previous month's figures travel; the comparison does not. `magnitudeChange` below builds
  // both the exact delta and the display percentage from these, which keeps the magnitude framing in
  // one tested place instead of once per column. Null on the first month, which has no predecessor.
  previousDeposits: minorUnitStringSchema.nullable(),
  previousWithdrawals: minorUnitStringSchema.nullable()
}).strict();

export const dayOfWeekStatisticSchema = z.object({
  isoDayOfWeek: z.number().int().min(1).max(7),
  deposits: minorUnitStringSchema,
  withdrawals: minorUnitStringSchema,
  transactions: z.number().int().nonnegative()
}).strict();

export const largestMovementSchema = z.object({
  id: z.string().uuid(),
  date: isoDateSchema,
  label: z.string(),
  description: z.string(),
  // **`amount`, deliberately not `net`.** These lists rank a transaction's deposit leg and its
  // withdrawal leg separately, and the recognised interest/tax pairing carries both — so one row can
  // appear in each list under each of its legs, and neither figure is that row's net.
  amount: minorUnitStringSchema
}).strict();

export const dailyBalanceSchema = z.object({
  date: isoDateSchema,
  balance: minorUnitStringSchema
}).strict();

/**
 * One day's reportable movement, for the statistics calendar (PLAN task 47, migration 025).
 *
 * **Sparse, not one entry per calendar day.** A date with no reportable movement — nothing
 * happened, or its only movement was excluded from reporting — has no entry at all, on the owner's
 * own choice: a calendar cell with no data is drawn as empty rather than as a zero-value step of the
 * ramp, and a zero here would claim a fact (the day had a reportable movement of exactly nothing)
 * that is different from the truth (the day has nothing to report). The client's job is to leave the
 * gap, not to fill it.
 */
export const dailyMovementSchema = z.object({
  date: isoDateSchema,
  deposits: minorUnitStringSchema,
  withdrawals: minorUnitStringSchema,
  transactions: z.number().int().nonnegative()
}).strict();

export const ledgerStatisticsSchema = z.object({
  window: z.object({
    from: isoDateSchema.nullable(),
    to: isoDateSchema.nullable(),
    days: z.number().int().nonnegative(),
    endsToday: z.boolean()
  }).strict(),
  totals: z.object({
    deposits: minorUnitStringSchema,
    withdrawals: minorUnitStringSchema,
    net: minorUnitStringSchema,
    transactions: z.number().int().nonnegative(),
    // How many rows `include_in_reporting` removed. Surfaced rather than hidden: an inert flag and a
    // flag doing real work produce identical totals, and only this number tells them apart.
    excluded: z.number().int().nonnegative()
  }).strict(),
  // Empty when the ledger is, which is the same shape a weak session gets.
  averages: z.union([
    z.object({ perDay: averageGroupSchema, perWeek: averageGroupSchema }).strict(),
    z.object({}).strict()
  ]),
  months: z.array(monthlyStatisticSchema),
  dayOfWeek: z.array(dayOfWeekStatisticSchema),
  // Split by direction on purpose: a combined ranking is dominated by whichever direction moves
  // in bigger lumps, so on an ordinary ledger every row of a joint top ten is a payday.
  largestOut: z.array(largestMovementSchema),
  largestIn: z.array(largestMovementSchema),
  dailyBalances: z.array(dailyBalanceSchema),
  dailyMovements: z.array(dailyMovementSchema)
}).strict();

export type LedgerStatistics = z.infer<typeof ledgerStatisticsSchema>;
export type MonthlyStatistic = z.infer<typeof monthlyStatisticSchema>;
export type DayOfWeekStatistic = z.infer<typeof dayOfWeekStatisticSchema>;
export type DailyBalance = z.infer<typeof dailyBalanceSchema>;
export type DailyMovement = z.infer<typeof dailyMovementSchema>;
export type LargestMovement = z.infer<typeof largestMovementSchema>;

/**
 * The number of whole weeks a window covers, for labelling only.
 *
 * Deliberately **not** the weekly average's divisor — that is the day count, because the average
 * scales the numerator instead of the denominator. This exists so a caption can say "over 8 weeks"
 * without implying the arithmetic went that way.
 */
export function wholeWeeks(days: number): number {
  return Math.floor(days / 7);
}

// Exported for `app/statistics-charts.tsx` and `app/statistics-calendar.tsx`, which each need the
// same BigInt-absolute-value logic for the same money-sign domain and previously carried their own
// copies — found by `/code-review high`.
export const magnitude = (value: MinorUnitString): bigint => {
  const amount = BigInt(value);
  return amount < 0n ? -amount : amount;
};

/**
 * How much bigger or smaller a figure is than the one before it, **compared by magnitude**.
 *
 * **The magnitude framing is the whole point, and a signed subtraction would be actively
 * misleading here.** Withdrawals are stored negative, so spending 15,000 after spending 10,000 gives
 * a raw delta of −5,000 — which prints as a fall and means a rise. Comparing magnitudes gives
 * `+5,000` and `+50%` for both directions: money in that grew and money out that grew both read as
 * growth, and the direction is already carried by which column the reader is looking at.
 *
 * `delta` stays exact minor units. `percent` is **for display only** — nothing is derived from it,
 * none is stored, and it never travels back to the database (D-160). It is `null` when there is no
 * previous figure, and when the previous figure is zero: **a zero denominator is undefined, not
 * zero**, and printing `0%` there would assert something the ledger never said.
 */
export function magnitudeChange(
  current: MinorUnitString,
  previous: MinorUnitString | null
): { delta: MinorUnitString; percent: number | null } | null {
  if (previous === null) return null;
  const base = magnitude(previous);
  const delta = magnitude(current) - base;
  if (base === 0n) return { delta: delta.toString() as MinorUnitString, percent: null };
  // Scaled in BigInt before the single conversion to a float, so the ratio is computed from exact
  // integers and only its presentation is approximate. Ten thousandths give **two** decimal places.
  return { delta: delta.toString() as MinorUnitString, percent: Number((delta * 10000n) / base) / 100 };
}

/**
 * The share one part is of a whole, **for display only**, on the same terms as `magnitudeChange`.
 *
 * Both operands stay exact until the last step, and the result carries **two** decimal places. Shares
 * **will not always sum to exactly 100** — three exact thirds truncate to 33.33 each and total 99.99
 * — and the remedy is to print the exact parts beside them rather than to adjust the last slice into
 * agreement.
 */
export function shareOf(part: MinorUnitString, whole: MinorUnitString): number | null {
  const total = magnitude(whole);
  if (total === 0n) return null;
  return Number((magnitude(part) * 10000n) / total) / 100;
}

/** Monday-first, matching the ISO numbering the RPC emits. */
export const ISO_DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;

/** `2026-03` as `March 2026`, without pulling a date library in for one label. */
export function monthLabel(month: string): string {
  const [year, index] = month.split("-");
  const names = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];
  return `${names[Number(index) - 1] ?? month} ${year}`;
}

/* ------------------------------------------------------------------ the window picker

   PLAN task 46, the half that needs no SQL. `public.ledger_statistics` has taken `p_from` and
   `p_to` since migration 023 and `app/api/v1/statistics/route.ts` has parsed them from the query
   string since the same day — so the window has always been selectable by hand-editing a URL, and
   what was missing was a control. Everything below is the arithmetic behind that control, kept
   here rather than in the component because **a date boundary is exactly the kind of thing that
   should be provable without a browser.**
*/

/** The offered windows. `all` is first because it is what the page shows with no choice made. */
export const WINDOW_PRESETS = ["all", "this-month", "last-3-months", "last-6-months", "this-year"] as const;

export type WindowPreset = (typeof WINDOW_PRESETS)[number];

/**
 * What each preset is called, and the labels say *what they resolve to* rather than being clever.
 *
 * "Last 3 months" is three **calendar** months ending with the one still running, not ninety days
 * and not three months back from today's date. Both readings are defensible; this one is stated
 * here, computed below, and — the part that actually protects the reader — printed on the page as
 * a resolved from/to pair with its day count, so the label never has to be trusted.
 */
export const WINDOW_PRESET_LABELS: Record<WindowPreset, string> = {
  all: "All time",
  "this-month": "This month",
  "last-3-months": "Last 3 months",
  "last-6-months": "Last 6 months",
  "this-year": "This year"
};

/**
 * How many months a rolling preset reaches back **before** the month still running.
 *
 * A table rather than a subtraction written twice: "Last 3 months" and "Last 6 months" are the
 * same question at two depths, and the defect a second copy invites is an off-by-one in only one
 * of them - three calendar months ending with this one starts two months back, not three.
 */
const PRESET_MONTHS_BACK: Record<"last-3-months" | "last-6-months", number> = {
  "last-3-months": 2,
  "last-6-months": 5
};

/**
 * A resolved window. `null` at either end means "as far as the ledger goes", which the RPC resolves.
 *
 * **The same object the ledger's date filter uses** (`lib/date-range.ts`), and deliberately not a
 * second declaration of the same pair: a window selected here and a window selected there encode
 * identically, so one link opens either page on the same days.
 */
export type StatisticsWindow = DateRange;

const pad2 = (value: number): string => String(value).padStart(2, "0");

/**
 * Today, in the **viewer's own calendar**.
 *
 * **`toISOString().slice(0, 10)` is the wrong thing here and it is the obvious thing.** That yields
 * the UTC date, and this ledger is kept in Bangkok at UTC+7 — so for the first seven hours of every
 * local day it names *yesterday*, and on the first of the month "this month" would resolve to a
 * window starting in the previous one. The local getters are correct precisely because they are
 * local: a month starts when the owner's calendar says it does, not when Greenwich agrees.
 */
export function localToday(now: Date): string {
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

/**
 * Resolves a preset against a given day, as pure string arithmetic.
 *
 * **No `Date` is constructed from the input and none is needed.** Parsing `"2026-03-01"` into a
 * `Date` and subtracting months invites two separate classes of defect — the local-versus-UTC
 * offset above, and month-length clamping, where "three months before 31 May" is a date that does
 * not exist. Working in year/month integers has neither: a month index is subtracted, and the day
 * of month is only ever set to `01`, which every month has.
 */
export function windowForPreset(preset: WindowPreset, today: string): StatisticsWindow {
  if (preset === "all") return { from: null, to: null };

  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));

  if (preset === "this-year") return { from: `${year}-01-01`, to: today };
  if (preset === "this-month") return { from: `${year}-${pad2(month)}-01`, to: today };

  // N calendar months ending with the current one, so the span starts N-1 months back.
  const index = year * 12 + (month - 1) - PRESET_MONTHS_BACK[preset];
  return { from: `${Math.floor(index / 12)}-${pad2((index % 12) + 1)}-01`, to: today };
}

/**
 * One whole calendar year, as the fixed range it is.
 *
 * **Deliberately not a preset.** Every entry in `WINDOW_PRESETS` is a *rolling* question - "This
 * month" resolves differently tomorrow, which is why `pickerSearch` encodes those by name and a
 * link to one keeps meaning what it said. "2025" is the opposite: it is two dates that will never
 * move, so it encodes as a custom range and needs no new spelling in the URL.
 *
 * **`to` is 31 December even for the year still running, and nothing clamps it.** An earlier
 * version of this comment claimed the RPC clamped the end to the ledger's own last row; it does
 * not, and `/code-review high` caught the claim before it could mislead anyone. What actually
 * happens is what the window says: choosing the current year resolves to a **365-day** window, and
 * every average on the page divides by 365 rather than by the days elapsed - so "per day" reads
 * lower for the current year here than the same figures read under the "This year" preset, which
 * stops at today.
 *
 * **That is the intended reading and not an oversight.** "2026" as a *year* is the whole year; the
 * preset beside it is the one that means "so far". The two are different questions and the page
 * never leaves the reader to guess which was asked, because `window.days` and the resolved
 * from/to pair are printed above the figures they divided - the same protection D-174's preset
 * labels rest on.
 */
export function yearWindow(year: number): { from: string; to: string } {
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}

/**
 * The year a custom range names, when it names exactly one whole year, and null otherwise.
 *
 * The inverse of `yearWindow`, and the reason the year control can show itself as selected after a
 * reload without storing a second copy of the state that `customFrom`/`customTo` already hold.
 */
export function wholeYearOf(from: string, to: string): number | null {
  const start = /^(\d{4})-01-01$/.exec(from);
  if (start === null) return null;
  return to === `${start[1]}-12-31` ? Number(start[1]) : null;
}

/**
 * The query string for a window, which is also the definition of "no query string means all time".
 *
 * An absent parameter and an empty one are different to the route's schema — it reads
 * `searchParams.get`, which yields `null` when absent and `""` when present and empty, and `""`
 * fails the date pattern with a 400. So a null end is **omitted** rather than sent blank.
 */
export function windowSearch(window: StatisticsWindow, accountId: string | null = null): string {
  const params = new URLSearchParams();
  appendRange(params, window);
  // **Last, so that an all-accounts request is byte-for-byte what it was before the filter
  // existed.** The account is also the reason this string is the cache key the view compares
  // against: narrowing to one account changes every figure on the page without moving either
  // date, so a key built from the window alone would leave the previous account's figures on
  // screen under the new account's name and never call them stale.
  if (accountId !== null) params.set("account", accountId);
  const query = params.toString();
  return query === "" ? "" : `?${query}`;
}

/** Whether a custom range is one the route will accept, so the page never sends a known 400. */
export function isUsableWindow(window: StatisticsWindow): boolean {
  return isUsableRange(window);
}

/* ------------------------------------------------------ the picker's state in the address bar

   The window picker was component state when it shipped (D-170), so a reload returned to All time
   and a chosen window could not be linked to. What follows is the encoding that fixes it, kept
   beside the window arithmetic and out of the component for the same reason the rest is: it is
   decidable from a string and a string alone.
*/

/** Everything the picker holds. The component's four `useState` calls, as one value. */
export type PickerState = {
  readonly preset: WindowPreset;
  readonly custom: boolean;
  readonly customFrom: string;
  readonly customTo: string;
  /**
   * The account every figure is narrowed to, or `null` for the combined ledger.
   *
   * **It belongs to the picker rather than beside it**, because it is the other half of the same
   * question — "which money, over which days" — and a link that carried the days but not the
   * account would reopen to a different page than the one that was copied.
   */
  readonly accountId: string | null;
};

/** What the page shows with no choice made, and what any unreadable URL falls back to. */
export const DEFAULT_PICKER_STATE: PickerState = {
  preset: "all",
  custom: false,
  customFrom: "",
  customTo: "",
  accountId: null
};

/**
 * The picker's state as a query string, and **a preset is encoded by name while a custom range is
 * encoded by its dates**. That asymmetry is the whole design and it is not an inconsistency.
 *
 * A preset is a *rolling question*: "This month" means this month whenever the link is opened, so
 * resolving it to dates before writing it down would freeze it into a different question — the one
 * it happened to answer on the day it was copied. A custom range is the opposite: it is already a
 * pair of dates and there is no name to give it.
 *
 * **All time encodes to nothing**, so a bare `/statistics` is unambiguous and the common case
 * leaves no query string to explain.
 *
 * This is *not* the same encoding as `windowSearch`, which speaks to the route. That one always
 * sends resolved dates because the RPC has no notion of a preset. The keys overlap deliberately —
 * see `pickerStateFromSearch`.
 */
export function pickerSearch(state: PickerState): string {
  const params = new URLSearchParams();
  // **`window` and `custom` are separate keys, because Custom is an override rather than a fifth
  // preset.** Writing `window=custom` folded the two into one and lost the preset underneath it:
  // ticking Custom on top of "This year" and unticking it returned to This year in-session, but
  // after a reload of the very URL the page had just written, unticking landed on All time. The
  // control behaved differently depending on whether the page had been reloaded, which is the
  // worst kind of difference. Found by `/code-review high`.
  if (state.preset !== "all") params.set("window", state.preset);
  if (state.custom) {
    params.set("custom", "1");
    if (state.customFrom !== "") params.set("from", state.customFrom);
    if (state.customTo !== "") params.set("to", state.customTo);
  }
  // **After the window, and read back with a shape check rather than trusted.** An account id is
  // the one part of this state that is not self-describing — a preset is checked against a list
  // and a date against the route's pattern, while an account is a uuid the page cannot verify
  // without asking the server. What it can do is refuse anything that is not a uuid at all, which
  // is what keeps a hand-edited link from turning into a 400 the reader cannot act on.
  if (state.accountId !== null) params.set("account", state.accountId);
  const query = params.toString();
  return query === "" ? "" : `?${query}`;
}

/**
 * The inverse, and **total**: every string yields a state, because the input is a URL and a URL is
 * whatever someone typed. Anything unrecognised falls back to All time rather than throwing, since
 * the failure mode of a bad link should be the default page and not a blank one.
 *
 * **A bare `?from=…&to=…` with no `window` is read as a custom range**, which is leniency with a
 * reason rather than politeness. Those are the exact parameters `app/api/v1/statistics/route.ts`
 * has taken since migration 023, and hand-editing them was the only way to select a window for the
 * two days before the picker existed (D-170). A URL that used to work keeps working, and it lands
 * in the state that shows the reader what it did.
 *
 * The dates are returned **as written**. They are free text in the form and the component already
 * treats an empty end as an open one and refuses a transposed pair (`isUsableWindow`); validating
 * here as well would put the rule in two places and let them disagree.
 */
export function pickerStateFromSearch(search: string): PickerState {
  const params = new URLSearchParams(search);
  const named = params.get("window");
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";

  const preset = WINDOW_PRESETS.find((option) => option === named) ?? "all";
  // Anything that is not a uuid falls back to the combined ledger, on the same rule as an
  // unrecognised preset: the failure mode of a bad link is the default page, not a blank one.
  const account = params.get("account");
  const accountId = account !== null && ACCOUNT_ID_PATTERN.test(account) ? account : null;
  const custom =
    params.get("custom") === "1"
    // `window=custom` is the encoding this replaced, and it is still read so that a link written
    // before the split keeps opening the window it names. It carries no preset, so it lands on
    // All time underneath — which is exactly what it meant when it was written.
    || named === "custom"
    // A bare `from`/`to`, only when no preset is named. A URL saying both is a URL saying two
    // things, and the named preset is the more deliberate of them.
    || (named === null && (from !== "" || to !== ""));

  // **The account survives both branches**, because it is orthogonal to the window: unticking
  // Custom changes which days are counted and must not silently widen which account they are
  // counted on.
  return custom
    ? { preset, custom: true, customFrom: from, customTo: to, accountId }
    : { preset, custom: false, customFrom: "", customTo: "", accountId };
}

/* ------------------------------------------------------------------ the calendar's own arithmetic

   PLAN task 47's heatmap. Laying out a month grid needs two things `windowForPreset` above does not:
   which weekday a day-of-month falls on, and how many days a month has. Both are ordinary calendar
   facts rather than anything to do with "now", so the local-versus-UTC trap above does not apply
   here — but a `Date` is still avoided, on the same reasoning: these are provable as integer
   arithmetic, and a `Date` would smuggle in a runtime timezone for a question that has none.
*/

const isLeapYear = (year: number): boolean =>
  (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

/** How many days a given month has. `month` is 1-12. */
export function daysInMonth(year: number, month: number): number {
  const lengths = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return lengths[month - 1] ?? 30;
}

/**
 * The ISO weekday (1 = Monday … 7 = Sunday) of a calendar date, by Sakamoto's algorithm.
 *
 * Pure integer arithmetic over the proleptic Gregorian calendar — no `Date`, so no timezone can
 * enter a question that has none. Matches `ISO_DAY_NAMES`' own numbering.
 */
export function isoWeekdayOf(year: number, month: number, day: number): number {
  const t = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];
  const y = month < 3 ? year - 1 : year;
  const shift = (t[month - 1] ?? 0);
  // Sakamoto's algorithm yields 0 = Sunday; ISO numbers Monday as 1, so Sunday becomes 7.
  const sunday0 = (y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) + shift + day) % 7;
  return sunday0 === 0 ? 7 : sunday0;
}

/** Every `YYYY-MM` a range touches, inclusive of both ends' months, earliest first. */
export function monthsBetween(from: string, to: string): string[] {
  const fromIndex = Number(from.slice(0, 4)) * 12 + (Number(from.slice(5, 7)) - 1);
  const toIndex = Number(to.slice(0, 4)) * 12 + (Number(to.slice(5, 7)) - 1);
  const months: string[] = [];
  for (let index = fromIndex; index <= toIndex; index += 1) {
    months.push(`${Math.floor(index / 12)}-${pad2((index % 12) + 1)}`);
  }
  return months;
}
