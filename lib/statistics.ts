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
