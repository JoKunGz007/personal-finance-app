"use client";

import { useEffect, useState } from "react";
import { formatThb } from "@/lib/money";
import {
  ISO_DAY_NAMES,
  ledgerStatisticsSchema,
  monthLabel,
  magnitudeChange,
  wholeWeeks,
  type LargestMovement,
  type LedgerStatistics
} from "@/lib/statistics";
import { BalanceChart, MonthlyChart } from "@/app/statistics-charts";

/**
 * The statistics surface (PLAN task 44, D-160).
 *
 * **One request, because every figure here is a fact about the same window.** Assembling the page
 * from several round trips would let the totals, the chart and the table disagree while the owner
 * watches — the same reasoning that put the combined balance in one place (D-159).
 *
 * **Nothing on this page divides money.** The averages arrive already divided, as a quotient and the
 * remainder that makes the division lossless, and the only ratios computed here are percentage
 * labels that nothing is derived from.
 */
function MovementTable(
  { id, title, movements }: { id: string; title: string; movements: readonly LargestMovement[] }
) {
  return (
    <section className="stats-section" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>{title}</h2>
      {movements.length === 0
        ? <p className="field-help">Nothing in this window.</p>
        : (
          <div className="table-scroll">
            <table>
              <caption className="sr-only">{title} in the selected window.</caption>
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Transaction</th>
                  <th scope="col" className="numeric">Amount</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((movement) => (
                  <tr key={movement.id}>
                    <td data-label="Date"><time dateTime={movement.date}>{movement.date}</time></td>
                    <td data-label="Transaction">{movement.label}</td>
                    <td className="numeric" data-label="Amount">{formatThb(movement.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </section>
  );
}

export function StatisticsView() {
  const [statistics, setStatistics] = useState<LedgerStatistics | null>(null);
  const [message, setMessage] = useState("Loading statistics…");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const response = await fetch("/api/v1/statistics", { cache: "no-store" }).catch(() => null);
      if (cancelled) return;
      if (!response || !response.ok) {
        setMessage("Statistics could not be loaded. Sign in as the owner and try again.");
        return;
      }
      const parsed = ledgerStatisticsSchema.safeParse(await response.json().catch(() => null));
      if (cancelled) return;
      // A parse failure is reported rather than swallowed: the schema is `.strict()`, so this is
      // what a migration adding a field looks like, and a page that silently rendered the fields it
      // recognised would hide the mismatch until a figure went wrong.
      if (!parsed.success) {
        setMessage("The statistics response did not match the expected shape.");
        return;
      }
      setStatistics(parsed.data);
      setMessage("");
    })();
    return () => { cancelled = true; };
  }, []);

  if (!statistics) return <p className="field-help">{message}</p>;

  const { window: period, totals, averages, months, dayOfWeek, largestOut, largestIn, dailyBalances } = statistics;
  if (period.from === null || totals.transactions === 0) {
    return <p className="field-help">There are no confirmed rows to summarise yet. Import a statement first.</p>;
  }

  const perDay = "perDay" in averages ? averages.perDay : null;
  const perWeek = "perWeek" in averages ? averages.perWeek : null;
  const busiest = [...dayOfWeek].sort((a, b) =>
    Number(BigInt(b.transactions) - BigInt(a.transactions)))[0];

  return (
    <>
      {/* The window, stated before any figure derived from it. A per-day average over 61 days and
          one over 6 look identical on screen and mean very different things. */}
      <p className="field-help">
        {period.from} to {period.to} · {period.days} days ({wholeWeeks(period.days)} whole weeks)
        {period.endsToday ? " · the last month is still running" : ""}
        {totals.excluded > 0
          ? ` · ${totals.excluded} row${totals.excluded === 1 ? "" : "s"} excluded from reporting`
          : ""}
      </p>

      <dl className="statement-strip">
        <div><dt>Money in</dt><dd>{formatThb(totals.deposits)}</dd></div>
        <div><dt>Money out</dt><dd>{formatThb(totals.withdrawals)}</dd></div>
        <div><dt>Net</dt><dd>{formatThb(totals.net)}</dd></div>
        <div><dt>Transactions</dt><dd>{totals.transactions}</dd></div>
        {perDay && <div><dt>In · per day</dt><dd>{formatThb(perDay.deposits.quotient)}</dd></div>}
        {perDay && <div><dt>Out · per day</dt><dd>{formatThb(perDay.withdrawals.quotient)}</dd></div>}
      </dl>
      {perWeek && (
        <dl className="statement-strip">
          <div><dt>In · per week</dt><dd>{formatThb(perWeek.deposits.quotient)}</dd></div>
          <div><dt>Out · per week</dt><dd>{formatThb(perWeek.withdrawals.quotient)}</dd></div>
          <div>
            <dt>Busiest day</dt>
            <dd>{busiest && busiest.transactions > 0 ? ISO_DAY_NAMES[busiest.isoDayOfWeek - 1] : "—"}</dd>
          </div>
        </dl>
      )}

      <section className="stats-section" aria-labelledby="balance-chart-title">
        <h2 id="balance-chart-title">Balance over time</h2>
        <BalanceChart points={dailyBalances} />
      </section>

      <section className="stats-section" aria-labelledby="monthly-chart-title">
        <h2 id="monthly-chart-title">Money in against money out</h2>
        <MonthlyChart months={months} />
      </section>

      {/* **The table is the chart's accessible twin**, not an extra. Every figure the bars encode is
          here as exact money, which is also what discharges the dataviz contrast relief. */}
      <section className="stats-section" aria-labelledby="monthly-table-title">
        <h2 id="monthly-table-title">By month</h2>
        <div className="table-scroll">
          <table>
            <caption className="sr-only">Money in, money out, net and transaction count for each month.</caption>
            <thead>
              <tr>
                <th scope="col">Month</th>
                <th scope="col" className="numeric">In</th>
                <th scope="col" className="numeric">Out</th>
                <th scope="col" className="numeric">Net</th>
                <th scope="col" className="numeric">Rows</th>
                <th scope="col" className="numeric">Out vs previous</th>
              </tr>
            </thead>
            <tbody>
              {months.map((month, index) => {
                // **A partial month cannot be compared to a full one**, and the real ledger proved it
                // on the first look: a 29-day opening month against a full August rendered
                // "+1002%" — a number that is arithmetically right and means nothing, because the
                // two periods are not the same length. Suppressed rather than corrected, since
                // rescaling either side to a common length would invent spending that no statement
                // records. The exact figures for both months are in their own rows above.
                const previous = index > 0 ? months[index - 1] : undefined;
                const comparable = previous !== undefined && !previous.isPartial && !month.isPartial;
                const change = comparable ? magnitudeChange(month.withdrawals, month.previousWithdrawals) : null;
                return (
                  <tr key={month.month}>
                    <th scope="row">
                      {monthLabel(month.month)}
                      {month.isPartial && <span className="field-help"> {month.days} days</span>}
                    </th>
                    <td className="numeric" data-label="In">{formatThb(month.deposits)}</td>
                    <td className="numeric" data-label="Out">{formatThb(month.withdrawals)}</td>
                    <td className="numeric" data-label="Net">{formatThb(month.net)}</td>
                    <td className="numeric" data-label="Rows">{month.transactions}</td>
                    {/* The exact delta leads and the percentage follows it as a label. Both compare
                        **magnitudes**, so more spending reads as a rise in both — a signed delta
                        would print a fall. A month with no predecessor, or one whose predecessor was
                        zero, drops the percentage: a zero denominator is undefined (D-160). */}
                    <td className="numeric" data-label="Out vs previous"
                        title={comparable ? undefined
                          : previous === undefined
                            ? "No earlier month to compare with."
                            : "Not compared: one of the two months is partial, so the periods are different lengths."}>
                      {change === null
                        ? "—"
                        : <>{BigInt(change.delta) > 0n ? "+" : ""}{formatThb(change.delta)}
                            {change.percent === null ? "" : ` (${change.percent > 0 ? "+" : ""}${change.percent}%)`}</>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* **Two lists, not one ranking.** A combined top ten is dominated by whichever direction
          moves in bigger lumps — on a ledger where salary arrives monthly and spending is daily,
          every row would be a payday and the list meant to explain a surprising month would explain
          nothing. Found by rendering the page and reading it, which is the D-159 habit. */}
      <MovementTable id="largest-out" title="Largest spending" movements={largestOut} />
      <MovementTable id="largest-in" title="Largest incoming" movements={largestIn} />

      <section className="stats-section" aria-labelledby="dow-title">
        <h2 id="dow-title">By day of the week</h2>
        <div className="table-scroll">
          <table>
            <caption className="sr-only">Money in, money out and transaction count by day of the week.</caption>
            <thead>
              <tr>
                <th scope="col">Day</th>
                <th scope="col" className="numeric">In</th>
                <th scope="col" className="numeric">Out</th>
                <th scope="col" className="numeric">Rows</th>
              </tr>
            </thead>
            <tbody>
              {dayOfWeek.map((day) => (
                <tr key={day.isoDayOfWeek}>
                  <th scope="row">{ISO_DAY_NAMES[day.isoDayOfWeek - 1]}</th>
                  <td className="numeric" data-label="In">{formatThb(day.deposits)}</td>
                  <td className="numeric" data-label="Out">{formatThb(day.withdrawals)}</td>
                  <td className="numeric" data-label="Rows">{day.transactions}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
