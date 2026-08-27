"use client";

import { useId, useState } from "react";
import { formatThb } from "@/lib/money";
import { monthLabel, type DailyBalance, type MonthlyStatistic } from "@/lib/statistics";

/**
 * The two charts, as inline SVG.
 *
 * **Why not a charting library.** `lib/security-headers.ts` names `'self'` and the Supabase origin
 * in `connect-src` and `script-src`, and its stated rule is that widening the policy is never how a
 * problem gets solved — so a CDN-loaded library is not available at any price. That leaves a bundled
 * dependency or this. At two charts, a dozen monthly pairs and a few hundred daily points, a library
 * would be a large dependency earning very little, and it would arrive with its own colours to
 * override. These inherit the app's palette and its one declared colour scheme for free (D-137).
 *
 * **The series colours were validated rather than chosen.** `#5c8a1a` against `#9b2c2c` clears every
 * check in the dataviz palette validator on this app's paper surface — lightness band, chroma floor,
 * CVD separation (ΔE 11.1 worst case, deutan), normal-vision separation (25.9) and contrast — where
 * the app's own celadon and copper inks failed two of them. `#9b2c2c` is already `--red` in
 * `globals.css`; only the green is new. **Colour is never the only encoding**: both series carry a
 * legend, a hover read-out, and the same figures again in the table below the charts.
 */

const INK = "#283618";
const MUTED = "#5c6636";
const GRID = "#ddd5b0";
const DEPOSIT = "#5c8a1a";
const WITHDRAWAL = "#9b2c2c";

// Short names rather than `04`, which reads as a day as easily as a month.
const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/**
 * A compact axis label such as `฿1.5k`.
 *
 * **Display only, and it divides — which is allowed here for exactly the reason a percentage is**
 * (D-160): an axis tick is a label, nothing is derived from it, and it never travels back. The
 * division runs in `BigInt` so the tick is computed from the exact figure rather than from a float,
 * and every number the owner might act on — the totals, the averages, the table, the hover read-out
 * — comes from `formatThb` on the exact minor units instead.
 */
function compactThb(minor: bigint): string {
  const negative = minor < 0n;
  const baht = (negative ? -minor : minor) / 100n;
  const sign = negative ? "−" : "";
  if (baht >= 1_000_000n) return `${sign}฿${Number(baht / 1_000n) / 1_000}M`;
  if (baht >= 1_000n) return `${sign}฿${Number(baht / 100n) / 10}k`;
  return `${sign}฿${baht}`;
}

/** Ticks that land on round numbers rather than on the data's own extremes. */
function niceTicks(max: bigint, count = 4): bigint[] {
  if (max <= 0n) return [0n];
  const rough = max / BigInt(count);
  let step = 1n;
  while (step * 10n <= rough) step *= 10n;
  for (const factor of [1n, 2n, 5n, 10n]) {
    if (step * factor >= rough) { step *= factor; break; }
  }
  const ticks: bigint[] = [];
  for (let value = 0n; value <= max + step; value += step) ticks.push(value);
  return ticks;
}

// ------------------------------------------------------------------ balance over time

/**
 * The owner's combined position, one point per day.
 *
 * **A single series, so there is no legend** — the heading names it, and the dataviz rule is that a
 * legend box for one line is furniture. The x axis is scaled by **actual date**, not by index, so a
 * month with no statement rows reads as the gap it is rather than being closed up.
 */
export function BalanceChart({ points }: { points: readonly DailyBalance[] }) {
  const titleId = useId();
  const [hover, setHover] = useState<number | null>(null);
  if (points.length < 2) {
    return <p className="chart-empty">A balance line needs at least two days of rows.</p>;
  }

  const width = 820;
  const height = 260;
  const pad = { top: 18, right: 18, bottom: 32, left: 66 };
  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;

  // Built once as objects rather than read back by index: `noUncheckedIndexedAccess` is on, and
  // threading `| undefined` through every axis calculation would bury the arithmetic in guards.
  const series = points.map((p) => ({
    date: p.date,
    value: BigInt(p.balance),
    time: Date.parse(`${p.date}T00:00:00Z`)
  }));
  const first = series.at(0);
  const last = series.at(-1);
  if (!first || !last) return null;

  const span = Math.max(1, last.time - first.time);
  const max = series.reduce((peak, p) => (p.value > peak ? p.value : peak), first.value);
  const min = series.reduce((low, p) => (p.value < low ? p.value : low), first.value);
  // The axis floors at zero when every balance is positive, because a line drawn between its own
  // extremes exaggerates every wobble into a cliff.
  const base = min > 0n ? 0n : min;
  const range = max - base === 0n ? 1n : max - base;

  const x = (time: number) => pad.left + ((time - first.time) / span) * plotWidth;
  const y = (value: bigint) =>
    pad.top + plotHeight - Number(((value - base) * 10000n) / range) / 10000 * plotHeight;

  // **A step, not a slope.** A balance is constant between transactions, so interpolating between
  // two points asserts intermediate balances that never existed — a row on the 20th at 100,000 and
  // the next on the 10th of the following month draws three weeks of steady decline that no
  // statement agrees with. Each segment runs horizontally to the next date and then vertically to
  // the new balance, which is what the ledger actually did.
  const path = series
    .map((p, i) => i === 0
      ? `M${x(p.time).toFixed(2)},${y(p.value).toFixed(2)}`
      : `H${x(p.time).toFixed(2)}V${y(p.value).toFixed(2)}`)
    .join(" ");
  const active = hover === null ? null : series.at(hover) ?? null;

  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={titleId} aria-describedby={`${titleId}-desc`}
           preserveAspectRatio="xMidYMid meet"
           onMouseLeave={() => setHover(null)}>
        <title id={titleId}>Combined balance across every account, one point per day.</title>
        {/* **The chart's accessible twin, and it is here rather than as a table.** The monthly chart
            has one below it; this one cannot — three hundred daily rows would be a worse answer than
            none. What a reader actually needs from a balance line is its shape, so the description
            carries the four figures that give it: where it started, where it ended, and its extremes.
            Without this the series was reachable only by hovering, which no keyboard reaches. */}
        <desc id={`${titleId}-desc`}>
          {`From ${first.date} at ${formatThb(first.value.toString())} to ${last.date} at `
           + `${formatThb(last.value.toString())}. Lowest ${formatThb(min.toString())}, `
           + `highest ${formatThb(max.toString())}, over ${series.length} days holding rows.`}
        </desc>
        {niceTicks(max - base).map((tick) => {
          const value = base + tick;
          if (value > max) return null;
          return (
            <g key={tick.toString()}>
              <line x1={pad.left} x2={width - pad.right} y1={y(value)} y2={y(value)}
                    stroke={GRID} strokeWidth={1} />
              <text x={pad.left - 8} y={y(value) + 4} textAnchor="end" fontSize={11} fill={MUTED}>
                {compactThb(value)}
              </text>
            </g>
          );
        })}
        <path d={path} fill="none" stroke={INK} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {/* The first and last dates only. Labelling every point is the anti-pattern; these two are
            what tell the reader which window they are looking at. */}
        <text x={pad.left} y={height - 10} fontSize={11} fill={MUTED}>{first.date}</text>
        <text x={width - pad.right} y={height - 10} fontSize={11} fill={MUTED} textAnchor="end">
          {last.date}
        </text>
        {active && (
          <g pointerEvents="none">
            <line x1={x(active.time)} x2={x(active.time)} y1={pad.top} y2={pad.top + plotHeight}
                  stroke={MUTED} strokeWidth={1} strokeDasharray="3 3" />
            {/* A 2px surface ring, so the marker stays legible wherever it lands on the line. */}
            <circle cx={x(active.time)} cy={y(active.value)} r={5}
                    fill={INK} stroke="#fffdf0" strokeWidth={2} />
          </g>
        )}
        {/* Hit targets are wider than the marks, which is what makes a 300-point line hoverable.
            `pointerEvents` on a transparent rect rather than on the path: a 2px stroke is not a
            target anyone can hit on a phone. */}
        {series.map((p, i) => (
          <rect key={p.date} x={x(p.time) - plotWidth / series.length / 2} y={pad.top}
                width={Math.max(2, plotWidth / series.length)} height={plotHeight}
                fill="transparent" onMouseEnter={() => setHover(i)} />
        ))}
      </svg>
      {/* Not `aria-live`: the hover layer is three hundred adjacent hit targets, so dragging a pointer
          across the chart queued an announcement per point crossed. The `<desc>` above is what makes
          this series readable without a pointer, and it does not depend on hover at all. */}
      <figcaption>
        {active
          ? <><strong>{active.date}</strong> · {formatThb(active.value.toString())}</>
          : <>Combined balance across every account. Hover for a day.</>}
      </figcaption>
    </figure>
  );
}

// ------------------------------------------------------------------ money in against money out

/**
 * Incoming against spending, one pair of bars per month.
 *
 * Both series are drawn **upward from a shared baseline as magnitudes**, with the direction carried
 * by colour and legend rather than by sign, because two bars of the same orientation are what let a
 * reader compare their heights. The exact signed figures are in the hover read-out and in the table.
 */
export function MonthlyChart({ months }: { months: readonly MonthlyStatistic[] }) {
  const titleId = useId();
  const [hover, setHover] = useState<number | null>(null);
  if (months.length === 0) return <p className="chart-empty">No months in this window.</p>;

  const width = 820;
  const height = 280;
  const pad = { top: 18, right: 18, bottom: 46, left: 66 };
  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;

  const magnitude = (value: string) => { const v = BigInt(value); return v < 0n ? -v : v; };
  const max = months.reduce((peak, m) => {
    const local = magnitude(m.deposits) > magnitude(m.withdrawals) ? magnitude(m.deposits) : magnitude(m.withdrawals);
    return local > peak ? local : peak;
  }, 1n);

  const active = hover === null ? null : months.at(hover) ?? null;
  const slot = plotWidth / months.length;
  // **A fourteen-month window prints `Jul` twice**, which the real ledger did on the first look —
  // the axis ran Jul 2025 to Aug 2026 and two pairs of labels were indistinguishable. The year is
  // added only when the window actually spans more than one, so the ordinary case stays uncluttered.
  const spansYears = new Set(months.map((m) => m.month.slice(0, 4))).size > 1;
  // One label needs roughly 34px to stay legible at 11px type, and about 52px once it carries a year.
  const labelEvery = Math.max(1, Math.ceil((spansYears ? 52 : 34) / slot));
  // A 2px surface gap between the two bars of a pair, and a wider one between pairs, so the grouping
  // is visible without a box around it.
  const barWidth = Math.max(3, (slot - 10) / 2 - 1);
  const scale = (value: bigint) => Number((value * 10000n) / max) / 10000 * plotHeight;

  return (
    <figure className="chart">
      <div className="chart-legend">
        <span><i style={{ background: DEPOSIT }} aria-hidden="true" />Money in</span>
        <span><i style={{ background: WITHDRAWAL }} aria-hidden="true" />Money out</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={titleId} aria-describedby={`${titleId}-desc`}
           preserveAspectRatio="xMidYMid meet" onMouseLeave={() => setHover(null)}>
        <title id={titleId}>Money in against money out, by month.</title>
        {niceTicks(max).map((tick) => tick > max ? null : (
          <g key={tick.toString()}>
            <line x1={pad.left} x2={width - pad.right}
                  y1={pad.top + plotHeight - scale(tick)} y2={pad.top + plotHeight - scale(tick)}
                  stroke={GRID} strokeWidth={1} />
            <text x={pad.left - 8} y={pad.top + plotHeight - scale(tick) + 4}
                  textAnchor="end" fontSize={11} fill={MUTED}>{compactThb(tick)}</text>
          </g>
        ))}
        {months.map((month, index) => {
          const left = pad.left + index * slot + 5;
          const inHeight = scale(magnitude(month.deposits));
          const outHeight = scale(magnitude(month.withdrawals));
          return (
            <g key={month.month} onMouseEnter={() => setHover(index)}>
              <rect x={pad.left + index * slot} y={pad.top} width={slot} height={plotHeight}
                    fill={hover === index ? "rgba(92,102,54,.06)" : "transparent"} />
              {/* `rx` rounds all four corners; the baseline end is covered by the axis line below,
                  which is the cheap way to get a rounded data-end without a clip path. */}
              <rect x={left} y={pad.top + plotHeight - inHeight} width={barWidth} height={inHeight}
                    rx={4} fill={DEPOSIT} />
              <rect x={left + barWidth + 2} y={pad.top + plotHeight - outHeight}
                    width={barWidth} height={outHeight} rx={4} fill={WITHDRAWAL} />
              {/* **Thinned, because this surface is all-time and has no window picker yet** (task 46).
                  A real ledger spanning three years gives thirty-odd slots of about 20px against 20px
                  of text, and every label drawn is an unreadable smear rather than an axis. */}
              {index % labelEvery === 0 && (
                <text x={pad.left + index * slot + slot / 2} y={height - 26}
                      textAnchor="middle" fontSize={11} fill={MUTED}>
                  {(SHORT_MONTHS[Number(month.month.slice(5)) - 1] ?? month.month.slice(5))
                    + (spansYears ? ` ${month.month.slice(2, 4)}` : "")}
                </text>
              )}
              {month.isPartial && index % labelEvery === 0 && (
                <text x={pad.left + index * slot + slot / 2} y={height - 12}
                      textAnchor="middle" fontSize={9} fill={MUTED}>part</text>
              )}
            </g>
          );
        })}
        <line x1={pad.left} x2={width - pad.right} y1={pad.top + plotHeight} y2={pad.top + plotHeight}
              stroke={MUTED} strokeWidth={1} />
      </svg>
      <figcaption aria-live="polite">
        {active === null
          ? <>Money in against money out, by month. Hover for a month.</>
          : (
            <>
              <strong>{monthLabel(active.month)}</strong>
              {active.isPartial ? ` (${active.days} days of the month)` : ""} ·
              {" "}in {formatThb(active.deposits)} · out {formatThb(active.withdrawals)} ·
              {" "}net {formatThb(active.net)}
            </>
          )}
      </figcaption>
    </figure>
  );
}
