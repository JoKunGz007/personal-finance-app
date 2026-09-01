"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { accountListSchema, type LedgerAccount } from "@/lib/accounts";
import { AccountSelect } from "@/app/account-select";
import { formatThb } from "@/lib/money";
import {
  ISO_DAY_NAMES,
  ledgerStatisticsSchema,
  monthLabel,
  magnitudeChange,
  pickerSearch,
  pickerStateFromSearch,
  wholeWeeks,
  wholeYearOf,
  windowForPreset,
  yearWindow,
  windowSearch,
  isUsableWindow,
  localToday,
  WINDOW_PRESETS,
  WINDOW_PRESET_LABELS,
  type LargestMovement,
  type LedgerStatistics,
  type WindowPreset
} from "@/lib/statistics";
import { ALL_ACCOUNTS } from "@/app/ledger-shared";
import { BalanceChart, MonthlyChart } from "@/app/statistics-charts";
import { SpendingCalendar } from "@/app/statistics-calendar";

/**
 * Direction as colour, **reinforcing a sign that is already printed** rather than replacing it.
 *
 * Applied by value and not by role, because every figure it touches can fall either side of zero:
 * a month's net, and a withdrawal total in a period that saw none. Zero is neutral — calling it an
 * arrival would be a judgement the ledger never made. The two colours are `--money-in` and
 * `--money-out`, which are the **text**-contrast steps and deliberately not the chart's marks.
 */
function signClass(minor: string): string {
  const amount = BigInt(minor);
  return amount > 0n ? "positive" : amount < 0n ? "negative" : "";
}

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
                    <td className={`numeric ${signClass(movement.amount)}`} data-label="Amount">{formatThb(movement.amount)}</td>
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
  // **The window the data came from is kept beside the data.** Holding the response alone cannot
  // answer "do these figures belong to the window that is currently selected?", and that question
  // is the whole difference between a page that is loading and a page that is quietly wrong.
  const [loaded, setLoaded] = useState<{ search: string; data: LedgerStatistics } | null>(null);
  const [message, setMessage] = useState("Loading statistics…");

  // **The picker starts from the address bar, so a reload returns to the window that was chosen.**
  // Read once, in a lazy initialiser, rather than kept in sync both ways: the URL seeds the state
  // and the state writes the URL, and a single direction cannot develop a disagreement with itself.
  //
  // Safe against a hydration mismatch because `app/statistics/page.tsx` is `force-dynamic` — the
  // server renders this component with the request's own parameters, so the first client render
  // computes the same state from the same string rather than from a default the server never used.
  const initialSearch = useSearchParams().toString();
  const [initial] = useState(() => pickerStateFromSearch(initialSearch));
  const [preset, setPreset] = useState<WindowPreset>(initial.preset);
  const [custom, setCustom] = useState(initial.custom);
  const [customFrom, setCustomFrom] = useState(initial.customFrom);
  const [customTo, setCustomTo] = useState(initial.customTo);
  // **The account filter** (PLAN task 46's second half, migration 024). Null is the combined
  // ledger, which is what the page shows until someone narrows it.
  const [accountId, setAccountId] = useState<string | null>(initial.accountId);

  /**
   * The accounts the filter offers, which are **labels for a choice the page can already make**.
   *
   * Deliberately not blocking: the window and every figure on the page are answerable without this
   * list, so a failed accounts request leaves the statistics intact and only leaves the filter with
   * nothing to offer. `null` is "not loaded yet" and `[]` is "loaded and there are none" — the
   * select needs to tell those apart to know whether an id it holds is unknown or merely early.
   */
  const [accounts, setAccounts] = useState<LedgerAccount[] | null>(null);

  /**
   * How far back the year control may offer, learned from the responses rather than assumed.
   *
   * **The page opens on All time**, so the first response resolves `window.from` to the ledger's
   * own first row and this is exact from the first load. It only ever moves earlier, which is what
   * keeps a later narrow window from shortening the list: choosing "This month" must not make 2025
   * unreachable. A deep link straight into a narrow window is the one case it starts short, and
   * `yearOptions` covers it - the current year and any year already selected are always offered.
   */
  const [earliestYear, setEarliestYear] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const response = await fetch("/api/v1/accounts", { cache: "no-store" }).catch(() => null);
      if (cancelled || !response || !response.ok) return;
      const parsed = accountListSchema.safeParse(await response.json().catch(() => null));
      if (cancelled || !parsed.success) return;
      setAccounts(parsed.data.accounts);
    })();
    return () => { cancelled = true; };
  }, []);

  // **Held in state rather than read per render, and re-read on every deliberate press.** Calling
  // `localToday` inside the memo would make the resolved window a function of render timing, so a
  // tab left open would refetch by itself at midnight. Freezing it at mount has the opposite
  // defect: a tab open across midnight would answer a *deliberate* press of "This month" with last
  // month, correctly labelled and wrong. Re-reading the clock where the owner acts has neither.
  const [today, setToday] = useState(() => localToday(new Date()));

  // An empty custom field is not a bound: it means that end is open, which is exactly what `null`
  // says to the RPC. So a half-filled custom range is usable rather than an error state.
  const window_ = useMemo(
    () => (custom
      ? { from: customFrom === "" ? null : customFrom, to: customTo === "" ? null : customTo }
      : windowForPreset(preset, today)),
    [custom, customFrom, customTo, preset, today]
  );
  const usable = isUsableWindow(window_);
  // **The account is part of the key, not only part of the request.** `loaded.search` is compared
  // against this to decide whether the figures on screen belong to the selection currently made,
  // and an account that changed without either date moving would otherwise leave one account's
  // totals standing under another account's name with nothing calling them stale.
  const search = windowSearch(window_, accountId);

  // **The address bar follows the picker, through `history.replaceState` rather than the router.**
  //
  // `router.replace` would be the idiomatic call and it is the wrong one here: this page is
  // `force-dynamic`, so a router navigation fetches a fresh RSC payload from the server for a
  // change that is entirely client state — a round trip, and a re-render, to move text in the
  // address bar. `replaceState` moves the address bar and nothing else, which is all that is
  // wanted. Next supports it explicitly for this case.
  //
  // **Replace and not push**, because the picker is a filter rather than navigation: pushing would
  // make the Back button walk backwards through every chip that was ever pressed, and the way out
  // of a window is to choose another one, not to undo.
  const pickerUrl = pickerSearch({ preset, custom, customFrom, customTo, accountId });
  useEffect(() => {
    const current = `${globalThis.location.pathname}${globalThis.location.search}`;
    const next = `${globalThis.location.pathname}${pickerUrl}`;
    // Guarded only to skip a no-op call — on first load of a bare `/statistics` the two are
    // already equal. A hand-edited `?from=x&to=y` **is** rewritten, to the canonical
    // `?window=custom&from=x&to=y`, and that is wanted: the address bar should show what the page
    // understood the link to mean, and the canonical form is the one worth copying.
    if (current !== next) globalThis.history.replaceState(null, "", next);
  }, [pickerUrl]);

  useEffect(() => {
    // A transposed range is refused here rather than sent: the route answers 400 and the page would
    // replace a correct table with an error the owner can see is his own typing.
    if (!usable) return;
    let cancelled = false;
    // **No synchronous setState here.** Setting a "loading" message in the effect body causes a
    // cascading render, and on a window change it never rendered anyway: `statistics` is still the
    // previous window's, so the page shows figures rather than the message. What the owner actually
    // needs to know is that the figures on screen belong to a *different* window than the one
    // selected — which is derived below from the search the loaded data came with, not stored.
    void (async () => {
      const response = await fetch(`/api/v1/statistics${search}`, { cache: "no-store" }).catch(() => null);
      if (cancelled) return;
      if (!response || !response.ok) {
        // **Clearing the data is what makes the message reachable, and that is the point.** Keeping
        // the previous window's figures on a failure would leave the page showing numbers it can no
        // longer vouch for, under a window line describing a window it never loaded — and the
        // message below would render nowhere, because it only shows when there is nothing else to
        // show. A ledger that cannot say what it is displaying displays nothing.
        setLoaded(null);
        setMessage("Statistics could not be loaded. Sign in as the owner and try again.");
        return;
      }
      const parsed = ledgerStatisticsSchema.safeParse(await response.json().catch(() => null));
      if (cancelled) return;
      // A parse failure is reported rather than swallowed: the schema is `.strict()`, so this is
      // what a migration adding a field looks like, and a page that silently rendered the fields it
      // recognised would hide the mismatch until a figure went wrong.
      if (!parsed.success) {
        setLoaded(null);
        setMessage("The statistics response did not match the expected shape.");
        return;
      }
      setLoaded({ search, data: parsed.data });
      // **Recorded where the response lands, not in an effect watching for it.** The same fact
      // could be derived by watching `statistics` change, but setting state synchronously in an
      // effect body is a cascading render this repo's lint refuses - and this is the more honest
      // place regardless: the earliest date the page has ever been told about is a property of the
      // responses, so it is learned as one arrives rather than rediscovered from the last one.
      const first = parsed.data.window.from;
      if (first !== null) {
        const year = Number(first.slice(0, 4));
        setEarliestYear((current) => (current === null || year < current ? year : current));
      }
      setMessage("");
    })();
    return () => { cancelled = true; };
  }, [search, usable]);

  // Derived, not stored: no second setState, and no way for the flag and the data to disagree.
  const statistics = loaded?.data ?? null;

  /**
   * The year the picker is currently showing, or null when the window is not exactly one.
   *
   * **Read back out of the custom range rather than stored beside it.** A year *is* a custom range
   * (`yearWindow`), so a separate `year` state would be a second copy of the same fact, free to
   * disagree with it the moment either date input is touched by hand - and the date inputs are
   * right there, visible, the moment a year is chosen.
   */
  const selectedYear = custom ? wholeYearOf(customFrom, customTo) : null;
  const currentYear = Number(today.slice(0, 4));
  const yearOptions = useMemo(() => {
    const floor = Math.min(earliestYear ?? currentYear, selectedYear ?? currentYear, currentYear);
    const years: number[] = [];
    for (let year = currentYear; year >= floor; year -= 1) years.push(year);
    return years;
  }, [earliestYear, selectedYear, currentYear]);
  // **Gated on `usable`, because a refused range is not a request in flight.** Without it a
  // transposed custom range says "updating…" directly above an alert saying nothing was requested.
  const stale = loaded !== null && loaded.search !== search && usable;
  // **The window the figures describe, which is not the one the picker currently shows.** Every
  // sentence about what the data contains has to be written against this, not against `preset` —
  // otherwise an empty month followed by a click on All time claims the ledger is empty while a
  // full one is loading.
  const loadedAllTime = loaded !== null && loaded.search === "";

  // **The control renders before the guard below.** A window that returns no rows is an ordinary
  // answer — pick a quiet month and the page should say so *with the picker still on screen*,
  // because the way out of an empty window is to change it. An early return above the control
  // would strand the owner on a dead page needing a reload.
  const picker = (
    <div className="statistics-picker">
    <fieldset className="window-picker">
      <legend>Window</legend>
      <div className="window-presets">
        {WINDOW_PRESETS.map((option) => (
          <button
            key={option}
            type="button"
            className={!custom && preset === option ? "chip current" : "chip"}
            aria-pressed={!custom && preset === option}
            onClick={() => { setCustom(false); setToday(localToday(new Date())); setPreset(option); }}
          >
            {WINDOW_PRESET_LABELS[option]}
          </button>
        ))}
        <label className="window-custom-toggle">
          <input type="checkbox" checked={custom} onChange={(event) => setCustom(event.target.checked)} />
          <span>Custom</span>
        </label>
        {/* **A whole year, and it sets a custom range rather than a preset.** Twelve months in
            three columns is the calendar's best reading, and there was no way to ask for exactly
            one year: "This year" stops at today and "All time" is everything. A year is two dates
            that will never move, which is the custom shape and not the preset one - so choosing
            one ticks Custom and fills the two inputs below, where the owner can see precisely what
            was asked for. Clearing it unticks Custom and hands the window back to whichever chip
            was last pressed, which is what unticking Custom by hand already does. */}
        <label className="window-year">
          <span className="sr-only">Year</span>
          <select
            value={selectedYear === null ? "" : String(selectedYear)}
            onChange={(event) => {
              if (event.target.value === "") { setCustom(false); return; }
              const range = yearWindow(Number(event.target.value));
              setCustomFrom(range.from);
              setCustomTo(range.to);
              setCustom(true);
            }}
          >
            <option value="">Year…</option>
            {yearOptions.map((year) => <option key={year} value={String(year)}>{year}</option>)}
          </select>
        </label>
      </div>
      {custom && (
        <div className="window-custom">
          <label>
            <span>From</span>
            <input type="date" value={customFrom} max={customTo === "" ? undefined : customTo}
              onChange={(event) => setCustomFrom(event.target.value)} />
          </label>
          <label>
            <span>To</span>
            <input type="date" value={customTo} min={customFrom === "" ? undefined : customFrom}
              onChange={(event) => setCustomTo(event.target.value)} />
          </label>
          {/* Both ends are optional on purpose — an empty field means "as far as the ledger goes",
              which is what the RPC already does with a null bound. */}
          <p className="field-help">Leave either end empty to run to the edge of the ledger.</p>
        </div>
      )}
      {!usable && (
        <p className="field-help" role="alert">That window ends before it starts, so nothing was requested.</p>
      )}
    </fieldset>
      {/* Shared with `/ledger` (`app/account-select.tsx`) rather than a second copy of the same
          options list — including `.account-control`'s overflow fix, the rule D-173's phone audit
          found missing at 404px in a 390px viewport. `showUnknown` is on here and off on the
          ledger: an id in this page's URL genuinely narrows every figure below, so the control has
          to say so rather than fall back to "All accounts" while `accounts` is still loading or the
          id names nothing the owner holds. */}
      <AccountSelect
        accounts={accounts}
        value={accountId ?? ALL_ACCOUNTS}
        onChange={(value) => setAccountId(value === ALL_ACCOUNTS ? null : value)}
        className="statistics-account"
        showUnknown
      />
    </div>
  );

  if (!statistics) return <>{picker}<p className="field-help">{message}</p></>;

  const { window: period, totals, averages, months, dayOfWeek, largestOut, largestIn, dailyBalances, dailyMovements } = statistics;
  // **Both ends checked, not just `from`.** The RPC only ever sets them together — both null or
  // both a real date — but the schema carries them as independently nullable, and the calendar
  // below needs both narrowed to `string` rather than trusting that pairing by cast.
  if (period.from === null || period.to === null || totals.transactions === 0) {
    return (
      <>
        {picker}
        <p className="field-help">
          {loadedAllTime
            ? "There are no confirmed rows to summarise yet. Import a statement first."
            : "No confirmed rows fall in this window. Widen it, or choose All time."}
          {stale ? " · updating…" : ""}
        </p>
      </>
    );
  }

  const perDay = "perDay" in averages ? averages.perDay : null;
  const perWeek = "perWeek" in averages ? averages.perWeek : null;
  const busiest = [...dayOfWeek].sort((a, b) =>
    Number(BigInt(b.transactions) - BigInt(a.transactions)))[0];

  return (
    <>
      {picker}
      {/* The window, stated before any figure derived from it. A per-day average over 61 days and
          one over 6 look identical on screen and mean very different things. **This line is what
          makes the picker's labels safe to be casual about**: whatever "Last 3 months" resolves to,
          the resolved pair and its day count are printed here, so the reader never has to trust a
          label over a figure. */}
      <p className="field-help">
        {period.from} to {period.to} · {period.days} days ({wholeWeeks(period.days)} whole weeks)
        {period.endsToday ? " · the last month is still running" : ""}
        {totals.excluded > 0
          ? ` · ${totals.excluded} row${totals.excluded === 1 ? "" : "s"} excluded from reporting`
          : ""}
        {/* **Said on the line that states the window, because that is the line it contradicts.**
            While a new window is in flight the figures below belong to the previous one, and this
            sentence is the only thing on the page that would otherwise be read as describing them. */}
        {stale ? " · updating…" : ""}
      </p>

      <dl className="statement-strip">
        <div><dt>Money in</dt><dd className="positive">{formatThb(totals.deposits)}</dd></div>
        <div><dt>Money out</dt><dd className={BigInt(totals.withdrawals) < 0n ? "negative" : ""}>{formatThb(totals.withdrawals)}</dd></div>
        <div><dt>Net</dt><dd className={signClass(totals.net)}>{formatThb(totals.net)}</dd></div>
        <div><dt>Transactions</dt><dd>{totals.transactions}</dd></div>
        {perDay && <div><dt>In · per day</dt><dd className="positive">{formatThb(perDay.deposits.quotient)}</dd></div>}
        {perDay && <div><dt>Out · per day</dt><dd className={signClass(perDay.withdrawals.quotient)}>{formatThb(perDay.withdrawals.quotient)}</dd></div>}
      </dl>
      {perWeek && (
        <dl className="statement-strip">
          <div><dt>In · per week</dt><dd className="positive">{formatThb(perWeek.deposits.quotient)}</dd></div>
          <div><dt>Out · per week</dt><dd className={signClass(perWeek.withdrawals.quotient)}>{formatThb(perWeek.withdrawals.quotient)}</dd></div>
          <div>
            <dt>Busiest day</dt>
            <dd>{busiest && busiest.transactions > 0 ? ISO_DAY_NAMES[busiest.isoDayOfWeek - 1] : "—"}</dd>
          </div>
        </dl>
      )}

      {/* **Which balance this is, said on the page, because the filter changes where the figure
          comes from** (migration 024, D-174). With no account chosen the line is the derived
          combined position, since no statement prints what the owner held across accounts; with one
          chosen it is that account's own printed closing balance, because per account the bank has
          already done the arithmetic and its figure is the authoritative one. Two different sources
          under one heading would be the page's most quietly misleading line without this. */}
      <section className="stats-section" aria-labelledby="balance-chart-title">
        <h2 id="balance-chart-title">Balance over time</h2>
        <p className="field-help">
          {accountId === null
            ? "Your combined position across every account, derived over the whole ledger."
            : "This account's own closing balance for each day, as its statements printed it."}
        </p>
        <BalanceChart points={dailyBalances} />
      </section>

      {/* **New, PLAN task 47's heatmap half.** Every field it needs was already exact money and a
          date — see `lib/statistics.ts`'s `dailyMovementSchema` for why the array is sparse rather
          than one entry per calendar day. */}
      <section className="stats-section" aria-labelledby="calendar-title">
        <h2 id="calendar-title">Spending calendar</h2>
        <p className="field-help">Pick a day to open the ledger filtered to it.</p>
        <SpendingCalendar
          movements={dailyMovements}
          periodFrom={period.from}
          periodTo={period.to}
          accountId={accountId}
        />
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
                    <td className="numeric positive" data-label="In">{formatThb(month.deposits)}</td>
                    <td className={`numeric ${signClass(month.withdrawals)}`} data-label="Out">{formatThb(month.withdrawals)}</td>
                    <td className={`numeric ${signClass(month.net)}`} data-label="Net">{formatThb(month.net)}</td>
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
                  <td className="numeric positive" data-label="In">{formatThb(day.deposits)}</td>
                  <td className={`numeric ${signClass(day.withdrawals)}`} data-label="Out">{formatThb(day.withdrawals)}</td>
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
