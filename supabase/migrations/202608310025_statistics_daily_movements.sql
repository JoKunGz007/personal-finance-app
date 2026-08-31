-- Migration 025 — per-day movements for the statistics calendar (PLAN task 47's heatmap half).
--
-- ## What this adds
--
-- `public.ledger_statistics` gains one more array field, `dailyMovements`: one row per **date that
-- has at least one reportable movement**, carrying that day's deposits, withdrawals and transaction
-- count. It is `dailyBalances`' sibling in shape — grouped by `source_date`, same window, same
-- account filter — and unlike `dailyBalances` it **does** honour `include_in_reporting`, because a
-- calendar cell showing "how much was spent" is exactly the reporting question `reportable_movements`
-- already answers for every other figure on this page. It is built from that function and adds no
-- new predicate of its own.
--
-- **A day with no reportable movement is absent from the array, not present at zero.** The owner
-- chose this reading explicitly: a day nothing happened on and a day whose only movement was excluded
-- from reporting both produce no row, and the client renders both as an empty cell rather than
-- inventing a zero the ledger never stated. This is also why the array is sparse rather than one
-- entry per calendar day — `generate_series` over the window would manufacture a zero for every quiet
-- day, which is the shape this migration deliberately does not produce.
--
-- ## Scope
--
-- **No table, no column, no trigger, no signature change.** One function body replaced whole, on the
-- rule every prior statistics migration states: `create or replace function` replaces a body entire,
-- so a migration showing only the new lines would leave the current definition readable nowhere.
-- Nothing here divides and nothing new is cast — every figure stays `bigint` minor units rendered
-- `::text`, unchanged from 023 and 024. Backup contract stays **v7**.

begin;

-- 024's function, unchanged except for the two lines marked below.
create or replace function public.ledger_statistics(
  p_from date default null,
  p_to date default null,
  p_top_n integer default 10,
  p_account_id uuid default null
) returns jsonb language plpgsql stable security definer set search_path = public, private, pg_temp
as $$
declare
  v_owner uuid := auth.uid();
  v_from date;
  v_to date;
  v_days bigint;
  v_top integer;
  v_deposits bigint;
  v_withdrawals bigint;
  v_count bigint;
  v_excluded bigint;
  v_months jsonb;
  v_dow jsonb;
  v_largest_out jsonb;
  v_largest_in jsonb;
  v_balances jsonb;
  v_daily_movements jsonb;
  v_today date := (now() at time zone 'Asia/Bangkok')::date;
begin
  if not private.has_strong_owner_access(v_owner) then
    -- The same shape an empty ledger returns, so a caller that lost its session renders an empty
    -- page rather than an error path nobody wrote. `list_account_transactions_page` does this too.
    return jsonb_build_object(
      'window', jsonb_build_object('from', null, 'to', null, 'days', 0, 'endsToday', false),
      'totals', jsonb_build_object('deposits', '0', 'withdrawals', '0', 'net', '0', 'transactions', 0, 'excluded', 0),
      'averages', '{}'::jsonb, 'months', '[]'::jsonb, 'dayOfWeek', '[]'::jsonb,
      'largestOut', '[]'::jsonb, 'largestIn', '[]'::jsonb, 'dailyBalances', '[]'::jsonb,
      'dailyMovements', '[]'::jsonb);
  end if;

  v_top := least(greatest(coalesce(p_top_n, 10), 1), 50);

  -- **Marked: the window now resolves within the chosen account.** Still from every transaction
  -- rather than only the reportable ones, on 023's reasoning — a period the flag empties is still a
  -- period the owner lived through. But an account the owner opened last month has no history
  -- before that, and defaulting its window to the whole ledger's span would divide its figures by
  -- years it did not exist for. "All time" means all of *this* account's time.
  select coalesce(p_from, min(t.source_date)), coalesce(p_to, max(t.source_date))
    into v_from, v_to
    from public.source_transactions t
   where t.owner_id = v_owner
     and (p_account_id is null or t.account_id = p_account_id);

  if v_from is null or v_to is null or v_to < v_from then
    return jsonb_build_object(
      'window', jsonb_build_object('from', v_from, 'to', v_to, 'days', 0, 'endsToday', false),
      'totals', jsonb_build_object('deposits', '0', 'withdrawals', '0', 'net', '0', 'transactions', 0, 'excluded', 0),
      'averages', '{}'::jsonb, 'months', '[]'::jsonb, 'dayOfWeek', '[]'::jsonb,
      'largestOut', '[]'::jsonb, 'largestIn', '[]'::jsonb, 'dailyBalances', '[]'::jsonb,
      'dailyMovements', '[]'::jsonb);
  end if;

  -- Inclusive of both ends: a window of one day is one day, not zero. This is the divisor of every
  -- average below, so an off-by-one here is an off-by-one in every figure on the page.
  v_days := (v_to - v_from) + 1;

  select coalesce(sum(m.deposits_minor), 0)::bigint,
         coalesce(sum(m.withdrawals_minor), 0)::bigint,
         count(*)
    into v_deposits, v_withdrawals, v_count
    from private.reportable_movements(v_owner, v_from, v_to, p_account_id) m;

  -- How many rows the flag removed. Reported rather than hidden: an inert flag and a flag doing
  -- real work look identical from the totals alone, and the owner is entitled to see which he has.
  -- **Marked: narrowed to the account**, because this number sits beside the totals and would
  -- otherwise count exclusions on accounts whose money is not on the page.
  select count(*)
    into v_excluded
    from public.source_transactions t
    join public.transaction_overlays o on o.transaction_id = t.id and o.owner_id = t.owner_id
   where t.owner_id = v_owner
     and not o.include_in_reporting
     and t.source_date between v_from and v_to
     and (p_account_id is null or t.account_id = p_account_id);

  -- Every month the window touches, including months that hold nothing. A bar chart with a missing
  -- month reads as a narrower year rather than as a quiet one.
  --
  -- **Each month's divisor is the days of that month that fall inside the window**, which handles
  -- the partial first month and the partial current month with one expression instead of two special
  -- cases. `isPartial` says so on the row, because a per-day figure over 10 days and one over 31 look
  -- alike on a chart and mean different things.
  with bounds as (
    select generate_series(date_trunc('month', v_from)::date,
                           date_trunc('month', v_to)::date,
                           interval '1 month')::date as month_start
  ),
  spans as (
    select b.month_start,
           greatest(b.month_start, v_from) as span_from,
           least((b.month_start + interval '1 month - 1 day')::date, v_to) as span_to
      from bounds b
  ),
  monthly as (
    select s.month_start,
           ((s.span_to - s.span_from) + 1)::bigint as days,
           (s.span_from <> s.month_start
            or s.span_to <> (s.month_start + interval '1 month - 1 day')::date) as is_partial,
           coalesce(sum(m.deposits_minor), 0)::bigint as deposits,
           coalesce(sum(m.withdrawals_minor), 0)::bigint as withdrawals,
           count(m.transaction_id) as transactions
      from spans s
      left join private.reportable_movements(v_owner, v_from, v_to, p_account_id) m
        on m.source_date between s.span_from and s.span_to
     group by s.month_start, s.span_from, s.span_to
  ),
  -- **Only the previous month's figures travel, and the comparison itself does not.** A signed
  -- month-over-month subtraction was emitted here at first and removed: withdrawals are stored
  -- negative, so spending more produces a *more negative* delta, which prints as a fall and means a
  -- rise. The client compares magnitudes instead (`magnitudeChange`), which reads correctly for both
  -- directions — and a ratio is never computed here at all, being a display label (D-160).
  deltas as (
    select m.*,
           lag(m.deposits) over (order by m.month_start) as prev_deposits,
           lag(m.withdrawals) over (order by m.month_start) as prev_withdrawals
      from monthly m
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'month', to_char(d.month_start, 'YYYY-MM'),
           'days', d.days,
           'isPartial', d.is_partial,
           'deposits', d.deposits::text,
           'withdrawals', d.withdrawals::text,
           'net', (d.deposits + d.withdrawals)::text,
           'transactions', d.transactions,
           'previousDeposits', d.prev_deposits::text,
           'previousWithdrawals', d.prev_withdrawals::text
         ) order by d.month_start), '[]')
    into v_months
    from deltas d;

  -- Which days of the week carry the money. ISO numbering, 1 = Monday, and all seven appear even
  -- when one never sees a transaction. `extract` returns `numeric`, so it is cast at once — the day
  -- number is not money, but a numeric drifting into this file at all is the habit being avoided.
  -- The grouping and the aggregation into JSON are two levels, because `jsonb_agg(sum(...))` is a
  -- nested aggregate and PostgreSQL refuses it outright. Kept as a CTE rather than a lateral, so the
  -- `left join` against all seven days still produces the empty ones.
  with dows as (select generate_series(1, 7) as dow),
  per_dow as (
    select w.dow,
           coalesce(sum(m.deposits_minor), 0)::bigint as deposits,
           coalesce(sum(m.withdrawals_minor), 0)::bigint as withdrawals,
           count(m.transaction_id) as transactions
      from dows w
      left join private.reportable_movements(v_owner, v_from, v_to, p_account_id) m
        on extract(isodow from m.source_date)::int = w.dow
     group by w.dow
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'isoDayOfWeek', p.dow,
           'deposits', p.deposits::text,
           'withdrawals', p.withdrawals::text,
           'transactions', p.transactions
         ) order by p.dow), '[]')
    into v_dow
    from per_dow p;

  -- **The field is `amount`, not `net`, and the distinction is real.** These rank a transaction's
  -- deposit leg and its withdrawal leg separately, and the recognised interest/tax pairing is a row
  -- that carries both — so such a row can appear in each list, under each of its legs, and neither
  -- figure is that row's net. Naming it `net` asserted something false about exactly those rows.
  --
  -- The largest movements, **split by direction rather than ranked together**, and the split is a
  -- correction rather than a refinement. A single list ordered by absolute size is dominated by
  -- whichever direction happens to move in bigger lumps — on a ledger where salary arrives monthly
  -- and spending is daily, every row of a combined top ten is a payday, and the list that was meant
  -- to explain a surprising month explains nothing. Found by looking at the rendered page.
  select coalesce(jsonb_agg(x.row order by x.magnitude desc, x.id), '[]')
    into v_largest_out
    from (
      select t.id, -m.withdrawals_minor as magnitude,
             jsonb_build_object('id', t.id, 'date', t.source_date, 'label', t.transaction_label,
                                'description', t.description, 'amount', m.withdrawals_minor::text) as row
        from private.reportable_movements(v_owner, v_from, v_to, p_account_id) m
        join public.source_transactions t on t.id = m.transaction_id and t.owner_id = v_owner
       where m.withdrawals_minor < 0
       order by magnitude desc, t.id
       limit v_top
    ) x;

  select coalesce(jsonb_agg(x.row order by x.magnitude desc, x.id), '[]')
    into v_largest_in
    from (
      select t.id, m.deposits_minor as magnitude,
             jsonb_build_object('id', t.id, 'date', t.source_date, 'label', t.transaction_label,
                                'description', t.description, 'amount', m.deposits_minor::text) as row
        from private.reportable_movements(v_owner, v_from, v_to, p_account_id) m
        join public.source_transactions t on t.id = m.transaction_id and t.owner_id = v_owner
       where m.deposits_minor > 0
       order by magnitude desc, t.id
       limit v_top
    ) x;

  -- **The two-source series.** See migration 024's header — combined when no account is chosen, the
  -- account's own printed balance when one is.
  select coalesce(jsonb_agg(jsonb_build_object(
           'date', b.on_date, 'balance', b.balance_minor::text) order by b.on_date), '[]')
    into v_balances
    from private.daily_closing_balances(v_owner, v_from, v_to, p_account_id) b;

  -- **New in 025.** One row per date that has at least one reportable movement — sparse, not one per
  -- calendar day. See the migration header for why an absent date and a zero-value date must not be
  -- collapsed into the same row: an absent one is what the client renders as an empty cell.
  select coalesce(jsonb_agg(jsonb_build_object(
           'date', m.source_date,
           'deposits', m.deposits::text,
           'withdrawals', m.withdrawals::text,
           'transactions', m.transactions) order by m.source_date), '[]')
    into v_daily_movements
    from (
      select r.source_date,
             sum(r.deposits_minor)::bigint as deposits,
             sum(r.withdrawals_minor)::bigint as withdrawals,
             count(*) as transactions
        from private.reportable_movements(v_owner, v_from, v_to, p_account_id) r
       group by r.source_date
    ) m;

  return jsonb_build_object(
    'window', jsonb_build_object(
      'from', v_from, 'to', v_to, 'days', v_days,
      -- Whether the window runs up to today in the ledger's own timezone, which is what makes the
      -- last month partial. The page says so rather than letting a short month read as a thrifty one.
      'endsToday', v_to >= v_today),
    'totals', jsonb_build_object(
      'deposits', v_deposits::text,
      'withdrawals', v_withdrawals::text,
      'net', (v_deposits + v_withdrawals)::text,
      'transactions', v_count,
      'excluded', v_excluded),
    -- **Integer division that keeps its remainder.** The quotient alone is lossy; the pair is not,
    -- and `quotient * divisor + remainder = total` is the property the pgTAP suite asserts, for a
    -- positive total and a negative one, because truncation toward zero is what makes the negative
    -- case worth checking rather than assuming.
    'averages', jsonb_build_object(
      'perDay', jsonb_build_object(
        'divisor', v_days,
        'deposits', jsonb_build_object(
          'quotient', (v_deposits / v_days)::text, 'remainder', (v_deposits % v_days)::text),
        'withdrawals', jsonb_build_object(
          'quotient', (v_withdrawals / v_days)::text, 'remainder', (v_withdrawals % v_days)::text)),
      'perWeek', jsonb_build_object(
        'divisor', v_days,
        'scale', 7,
        'deposits', jsonb_build_object(
          'quotient', (v_deposits * 7 / v_days)::text, 'remainder', (v_deposits * 7 % v_days)::text),
        'withdrawals', jsonb_build_object(
          'quotient', (v_withdrawals * 7 / v_days)::text, 'remainder', (v_withdrawals * 7 % v_days)::text))),
    'months', v_months,
    'dayOfWeek', v_dow,
    'largestOut', v_largest_out,
    'largestIn', v_largest_in,
    'dailyBalances', v_balances,
    'dailyMovements', v_daily_movements);
end;
$$;
revoke all on function public.ledger_statistics(date, date, integer, uuid) from public, anon;
grant execute on function public.ledger_statistics(date, date, integer, uuid) to authenticated;

commit;
