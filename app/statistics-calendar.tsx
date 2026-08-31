"use client";

import { useId, useMemo, useState } from "react";
import Link from "next/link";
import { formatThb } from "@/lib/money";
import { DEPOSIT, WITHDRAWAL } from "@/app/statistics-charts";
import {
  daysInMonth,
  isoWeekdayOf,
  magnitude,
  monthLabel,
  monthsBetween,
  windowSearch,
  type DailyMovement
} from "@/lib/statistics";

/**
 * The spending calendar (PLAN task 47's heatmap, migration 025).
 *
 * **Two ramps, not one net one.** The owner's own reading, over the recommendation's single-hue
 * net ramp: a day of pure income and a day of pure spending are different findings and a net ramp
 * would show them as opposite ends of the same scale rather than as what they are, so each day
 * carries **both** — income as `DEPOSIT` and spending as `WITHDRAWAL`, the same validated pair
 * `MonthlyChart` uses, split across the top and bottom half of the cell rather than blended into a
 * third colour.
 *
 * **A day with no reportable movement is drawn empty, not as the bottom of the ramp** — the owner's
 * second choice, and it is honest in the same way `dailyMovements` being sparse is: a zero is a fact
 * about a day that had activity summing to nothing, and this app has never had one of those, so
 * drawing it would assert something the ledger never said. **"No reportable movement" is also the
 * wording used, not "no confirmed rows"**: a day whose only transaction was excluded via
 * `include_in_reporting` is absent from `dailyMovements` the same way a genuinely empty day is, and
 * it still has a confirmed row that `/ledger` will show — the calendar's own link one click away.
 * Found by `/code-review high` against the pgTAP fixture that exercises exactly this row.
 *
 * **A day outside the loaded window is drawn as an unfilled placeholder**, so the grid still reads
 * as a calendar — Mondays under Mondays — for a window that starts or ends mid-month, without
 * implying the ledger has an answer for a day it was never asked about.
 *
 * **Every cell is a link to `/ledger`, not a second row renderer.** PLAN task 47's own reasoning: a
 * day's rows are not `source_transactions` filtered by date, because the ledger reconciles slips and
 * cards into the statement row they matched (D-063), and a calendar that re-listed raw rows would
 * quietly disagree with the ledger about the same day. Opening `/ledger` with the day as both ends
 * of its date range reuses the reconciliation the ledger already does, rather than building a second
 * one that could drift from it — via `windowSearch`, the same range-plus-account encoder the window
 * picker uses, rather than a second hand-rolled query-string builder that could drift from it.
 */

/**
 * A colour step on one ramp. `pct` is already clamped to [12, 100].
 *
 * **`ink` is a custom property, not a literal, and both ends of the mix now move with the scheme.**
 * It was a hex string until 2026-09-01; `var(--paper)` was already the surface half, so a dark
 * scheme would have mixed a fixed light-scheme green into a dark panel and produced a ramp that ran
 * the wrong way at its faint end. `color-mix()` accepts a `var()` for either operand.
 */
function ramp(ink: string, pct: number): string {
  return `color-mix(in srgb, ${ink} ${pct}%, var(--paper))`;
}

/** One direction's intensity against the window's own peak for that direction. Floored at 12 so a
    real but small movement still reads as coloured rather than as indistinguishable from empty. */
function intensity(value: bigint, peakValue: bigint): number {
  return value > 0n ? Math.max(12, Number((value * 100n) / peakValue)) : 0;
}

export function SpendingCalendar(
  { movements, periodFrom, periodTo, accountId }:
  { movements: readonly DailyMovement[]; periodFrom: string; periodTo: string; accountId: string | null }
) {
  const titleId = useId();
  const [active, setActive] = useState<string | null>(null);

  // **Memoized on `movements` alone.** Hovering or focusing a cell moves `active`, which re-renders
  // this component on every cell the pointer crosses — without this, that re-render also rebuilt
  // the whole lookup map and re-scanned every movement for its peak, on every cell entered. Found
  // by `/code-review high` against the real ledger's multi-year "All time" window.
  const byDate = useMemo(() => new Map(movements.map((m) => [m.date, m] as const)), [movements]);
  const maxIn = useMemo(
    () => movements.reduce((peak, m) => { const v = BigInt(m.deposits); return v > peak ? v : peak; }, 1n),
    [movements]
  );
  const maxOut = useMemo(
    () => movements.reduce((peak, m) => { const v = magnitude(m.withdrawals); return v > peak ? v : peak; }, 1n),
    [movements]
  );

  const active_ = active === null ? null : byDate.get(active) ?? null;

  return (
    <figure className="chart cal-figure">
      <div className="chart-legend">
        <span><i style={{ background: DEPOSIT }} aria-hidden="true" />Money in</span>
        <span><i style={{ background: WITHDRAWAL }} aria-hidden="true" />Money out</span>
      </div>
      <div className="cal-months" onMouseLeave={() => setActive(null)}>
        {monthsBetween(periodFrom, periodTo).map((month) => {
          const year = Number(month.slice(0, 4));
          const monthNum = Number(month.slice(5, 7));
          const total = daysInMonth(year, monthNum);
          const leading = isoWeekdayOf(year, monthNum, 1) - 1;
          const cells: Array<{ date: string; day: number } | null> = [
            ...Array.from({ length: leading }, (): null => null),
            ...Array.from({ length: total }, (_, i) => ({
              date: `${month}-${String(i + 1).padStart(2, "0")}`,
              day: i + 1
            }))
          ];
          return (
            <section key={month} className="cal-month" aria-labelledby={`${titleId}-${month}`}>
              <h3 id={`${titleId}-${month}`}>{monthLabel(month)}</h3>
              {/* A plain grid of links, not an ARIA `grid` widget — there is no row/column
                  navigation to expose, only a list of days that happen to be laid out in a
                  calendar shape. */}
              <div className="cal-grid">
                {cells.map((cell, index) => {
                  if (cell === null) return <span key={index} className="cal-day cal-day-blank" aria-hidden="true" />;
                  const inWindow = cell.date >= periodFrom && cell.date <= periodTo;
                  if (!inWindow) {
                    return (
                      <span key={cell.date} className="cal-day cal-day-outside" aria-hidden="true">
                        {cell.day}
                      </span>
                    );
                  }
                  const movement = byDate.get(cell.date);
                  const pctIn = movement ? intensity(BigInt(movement.deposits), maxIn) : 0;
                  const pctOut = movement ? intensity(magnitude(movement.withdrawals), maxOut) : 0;
                  const label = movement
                    ? `${cell.date}: ${movement.transactions} confirmed row${movement.transactions === 1 ? "" : "s"}, `
                      + `${formatThb(movement.deposits)} in, ${formatThb(movement.withdrawals)} out`
                    : `${cell.date}: no reportable movement`;
                  return (
                    <Link key={cell.date} href={`/ledger${windowSearch({ from: cell.date, to: cell.date }, accountId)}`}
                          className="cal-day cal-day-live" aria-label={label}
                          onMouseEnter={() => setActive(cell.date)}
                          onFocus={() => setActive(cell.date)}
                          onBlur={() => setActive(null)}>
                      <span className="cal-day-in" style={{ background: pctIn > 0 ? ramp(DEPOSIT, pctIn) : undefined }} />
                      <span className="cal-day-number">{cell.day}</span>
                      <span className="cal-day-out" style={{ background: pctOut > 0 ? ramp(WITHDRAWAL, pctOut) : undefined }} />
                    </Link>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
      {/* The chart's accessible twin for a pointer or a keyboard, on `MonthlyChart`'s pattern —
          `aria-label` alone would need a screen reader to land on the exact cell to hear a figure.
          Only two cases, not three: `active` can only ever be a date a live cell set it to, and
          every live cell is already inside the window by construction, so a third "hovered but
          outside the window" branch was unreachable dead code. Found by `/code-review high`. */}
      <figcaption aria-live="polite">
        {active === null
          ? <>Pick a day to open the ledger filtered to it. Hover or focus a day for its figures.</>
          : active_
            ? <><strong>{active}</strong> · {active_.transactions} row{active_.transactions === 1 ? "" : "s"} ·
                in {formatThb(active_.deposits)} · out {formatThb(active_.withdrawals)}</>
            : <><strong>{active}</strong> · no reportable movement</>}
      </figcaption>
    </figure>
  );
}
