import { z } from "zod";
import { isoDateSchema } from "@/lib/dates";
import { minorUnitStringSchema, type MinorUnitString } from "@/lib/money";

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
  dailyBalances: z.array(dailyBalanceSchema)
}).strict();

export type LedgerStatistics = z.infer<typeof ledgerStatisticsSchema>;
export type MonthlyStatistic = z.infer<typeof monthlyStatisticSchema>;
export type DayOfWeekStatistic = z.infer<typeof dayOfWeekStatisticSchema>;
export type DailyBalance = z.infer<typeof dailyBalanceSchema>;
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

const magnitude = (value: MinorUnitString): bigint => {
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
export const WINDOW_PRESETS = ["all", "this-month", "last-3-months", "this-year"] as const;

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
  "this-year": "This year"
};

/** A resolved window. `null` at either end means "as far as the ledger goes", which the RPC resolves. */
export type StatisticsWindow = { readonly from: string | null; readonly to: string | null };

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

  // Three calendar months ending with the current one, so the span starts two months back.
  const index = year * 12 + (month - 1) - 2;
  return { from: `${Math.floor(index / 12)}-${pad2((index % 12) + 1)}-01`, to: today };
}

/**
 * The query string for a window, which is also the definition of "no query string means all time".
 *
 * An absent parameter and an empty one are different to the route's schema — it reads
 * `searchParams.get`, which yields `null` when absent and `""` when present and empty, and `""`
 * fails the date pattern with a 400. So a null end is **omitted** rather than sent blank.
 */
export function windowSearch(window: StatisticsWindow): string {
  const params = new URLSearchParams();
  if (window.from !== null) params.set("from", window.from);
  if (window.to !== null) params.set("to", window.to);
  const query = params.toString();
  return query === "" ? "" : `?${query}`;
}

/** Whether a custom range is one the route will accept, so the page never sends a known 400. */
export function isUsableWindow(window: StatisticsWindow): boolean {
  if (window.from === null || window.to === null) return true;
  return window.from <= window.to;
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
};

/** What the page shows with no choice made, and what any unreadable URL falls back to. */
export const DEFAULT_PICKER_STATE: PickerState = {
  preset: "all",
  custom: false,
  customFrom: "",
  customTo: ""
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
  const custom =
    params.get("custom") === "1"
    // `window=custom` is the encoding this replaced, and it is still read so that a link written
    // before the split keeps opening the window it names. It carries no preset, so it lands on
    // All time underneath — which is exactly what it meant when it was written.
    || named === "custom"
    // A bare `from`/`to`, only when no preset is named. A URL saying both is a URL saying two
    // things, and the named preset is the more deliberate of them.
    || (named === null && (from !== "" || to !== ""));

  return custom
    ? { preset, custom: true, customFrom: from, customTo: to }
    : { preset, custom: false, customFrom: "", customTo: "" };
}
