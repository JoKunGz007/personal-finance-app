-- Migration 023 — the statistics surface (PLAN task 44, D-160).
--
-- ## Why this is SQL and not the client
--
-- A statistic is whole-ledger by definition and the client holds a page (D-158). This is D-159's
-- line applied a second time, and it is deliberately **not** D-120's refusal: that one protects a
-- *rule that judges a specific row*, carrying ~85 tested cases, from being written twice. An
-- aggregate judges nothing — it sums.
--
-- ## Exact money, which is the whole difficulty of this migration
--
-- Every total is a sum of `bigint` minor units and **`sum()` over `bigint` returns `numeric`**, so
-- every one is cast back explicitly. `avg()` appears nowhere in this file and must never appear:
-- it returns `numeric` too, and it would put a rounded figure into a money path with nothing
-- complaining. The averages here are **integer division that keeps its remainder**, so
-- `quotient * divisor + remainder = total` holds exactly — including for withdrawals, which are
-- stored negative and where PostgreSQL truncates toward zero on both operators, so the identity
-- survives the sign. `010_combined_balance.sql`'s sibling suite asserts it in both directions.
--
-- **The weekly average is `total * 7 / days`, one division, and not `avg_day * 7`.** Multiplying a
-- daily quotient by seven compounds the daily truncation and drifts; scaling the numerator first
-- divides once. The unit is satang and the scale is ~10^9, nowhere near the `bigint` ceiling.
--
-- ## `include_in_reporting` gets its first reader in this migration
--
-- The column has existed since migration 001 and **no query in this repository has ever read it**.
-- Internal transfers between the owner's own accounts are the reason it now matters: money leaving
-- one account and arriving at another is two real statement rows, so a naive sum inflates incoming
-- and spending alike while net stays correct — which is precisely the pair of figures this surface
-- exists to show. `list_account_transactions_page` is retrofitted in the same change, because two
-- totals over one ledger disagreeing on one screen would both be right and that is worse than either
-- being wrong.
--
-- **Nothing in the app can set the flag yet**, so `coalesce(o.include_in_reporting, true)` is true
-- everywhere today and both surfaces are unchanged in behaviour. That is the intended shape of this
-- step: the reader lands first, the control follows, and the numbers move only when the owner says so.
--
-- **The balance series deliberately does NOT honour the flag.** The flag says "do not count this as
-- income or spending"; it does not say the money failed to move. A transfer still changes the
-- owner's position, so filtering it out of `private.combined_balances` would draw a balance line
-- that no statement agrees with.
--
-- ## Scope
--
-- **No table, no column, no trigger.** Two private helpers, one new public function, one replaced
-- function body. Backup contract stays **v7** — `export_backup_snapshot` reads tables and is
-- untouched. Cash is out of v1 by the owner's decision, so `cash_entries` is not read here.

begin;

-- ---------------------------------------------------------------- reportable movement per row
--
-- One row per transaction, with its deposit and withdrawal legs summed separately. This is the only
-- place `include_in_reporting` is applied, so every money figure downstream inherits it from exactly
-- one predicate rather than repeating it and eventually disagreeing with itself.
--
-- The join to `source_components` is inner: a transaction with no component moved nothing and has
-- no place in a total. The join to `transaction_overlays` is outer, because most rows have no
-- overlay at all and an absent overlay means the default — `true`.
create or replace function private.reportable_movements(p_owner uuid, p_from date, p_to date)
returns table (transaction_id uuid, source_date date, deposits_minor bigint, withdrawals_minor bigint)
language sql stable
as $$
  select t.id,
         t.source_date,
         coalesce(sum(c.amount_minor) filter (where c.kind = 'deposit'), 0)::bigint,
         coalesce(sum(c.amount_minor) filter (where c.kind = 'withdrawal'), 0)::bigint
    from public.source_transactions t
    join public.source_components c
      on c.transaction_id = t.id and c.owner_id = t.owner_id
    left join public.transaction_overlays o
      on o.transaction_id = t.id and o.owner_id = t.owner_id
   where t.owner_id = p_owner
     and coalesce(o.include_in_reporting, true)
     and (p_from is null or t.source_date >= p_from)
     and (p_to is null or t.source_date <= p_to)
   group by t.id, t.source_date;
$$;
revoke all on function private.reportable_movements(uuid, date, date) from public, anon, authenticated;

-- ---------------------------------------------------------------- daily closing balance
--
-- `private.combined_balances` returns one row per transaction — 1,604 of them on the real ledger —
-- where a chart draws at most one point per day. This narrows to the chronologically **last** row of
-- each day, which is that day's closing position.
--
-- **The ordering must be `combined_balances`' own**, which is `compareTransactions` reversed:
-- `source_date asc, source_time asc nulls first, id DESC`. The id direction does not flip, and
-- untimed rows sharing a date are ordinary here, so a `distinct on` that ordered any other way would
-- pick a different row of the same day and print a balance that is real but not the day's last.
--
-- Not filtered by `include_in_reporting`, on purpose — see the header.
create or replace function private.daily_closing_balances(p_owner uuid, p_from date, p_to date)
returns table (on_date date, balance_minor bigint)
language sql stable
as $$
  select distinct on (t.source_date) t.source_date, b.combined_balance_minor
    from private.combined_balances(p_owner) b
    join public.source_transactions t
      on t.id = b.transaction_id and t.owner_id = p_owner
   where (p_from is null or t.source_date >= p_from)
     and (p_to is null or t.source_date <= p_to)
   order by t.source_date, t.source_time desc nulls last, t.id;
$$;
revoke all on function private.daily_closing_balances(uuid, date, date) from public, anon, authenticated;

-- ---------------------------------------------------------------- the surface
--
-- One call returns the whole page, because every figure on it is a fact about the same window and
-- assembling them from several round trips would let them disagree while the owner watches.
--
-- **Whole-ledger, all accounts.** There is no account filter in v1: the balance series is the
-- *combined* position by construction, and an average whose denominator changed with a filter would
-- be a different figure wearing the same label. A per-account view is follow-on work, not a default.
create or replace function public.ledger_statistics(
  p_from date default null,
  p_to date default null,
  p_top_n integer default 10
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
  v_today date := (now() at time zone 'Asia/Bangkok')::date;
begin
  if not private.has_strong_owner_access(v_owner) then
    -- The same shape an empty ledger returns, so a caller that lost its session renders an empty
    -- page rather than an error path nobody wrote. `list_account_transactions_page` does this too.
    return jsonb_build_object(
      'window', jsonb_build_object('from', null, 'to', null, 'days', 0, 'endsToday', false),
      'totals', jsonb_build_object('deposits', '0', 'withdrawals', '0', 'net', '0', 'transactions', 0, 'excluded', 0),
      'averages', '{}'::jsonb, 'months', '[]'::jsonb, 'dayOfWeek', '[]'::jsonb,
      'largestOut', '[]'::jsonb, 'largestIn', '[]'::jsonb, 'dailyBalances', '[]'::jsonb);
  end if;

  v_top := least(greatest(coalesce(p_top_n, 10), 1), 50);

  -- The window defaults to the whole history. Resolved from every transaction rather than only the
  -- reportable ones: a period the flag empties is still a period the owner lived through, and a
  -- window that silently shrank around the excluded rows would move every denominator with it.
  select coalesce(p_from, min(t.source_date)), coalesce(p_to, max(t.source_date))
    into v_from, v_to
    from public.source_transactions t
   where t.owner_id = v_owner;

  if v_from is null or v_to is null or v_to < v_from then
    return jsonb_build_object(
      'window', jsonb_build_object('from', v_from, 'to', v_to, 'days', 0, 'endsToday', false),
      'totals', jsonb_build_object('deposits', '0', 'withdrawals', '0', 'net', '0', 'transactions', 0, 'excluded', 0),
      'averages', '{}'::jsonb, 'months', '[]'::jsonb, 'dayOfWeek', '[]'::jsonb,
      'largestOut', '[]'::jsonb, 'largestIn', '[]'::jsonb, 'dailyBalances', '[]'::jsonb);
  end if;

  -- Inclusive of both ends: a window of one day is one day, not zero. This is the divisor of every
  -- average below, so an off-by-one here is an off-by-one in every figure on the page.
  v_days := (v_to - v_from) + 1;

  select coalesce(sum(m.deposits_minor), 0)::bigint,
         coalesce(sum(m.withdrawals_minor), 0)::bigint,
         count(*)
    into v_deposits, v_withdrawals, v_count
    from private.reportable_movements(v_owner, v_from, v_to) m;

  -- How many rows the flag removed. Reported rather than hidden: an inert flag and a flag doing
  -- real work look identical from the totals alone, and the owner is entitled to see which he has.
  select count(*)
    into v_excluded
    from public.source_transactions t
    join public.transaction_overlays o on o.transaction_id = t.id and o.owner_id = t.owner_id
   where t.owner_id = v_owner
     and not o.include_in_reporting
     and t.source_date between v_from and v_to;

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
      left join private.reportable_movements(v_owner, v_from, v_to) m
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
      left join private.reportable_movements(v_owner, v_from, v_to) m
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
        from private.reportable_movements(v_owner, v_from, v_to) m
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
        from private.reportable_movements(v_owner, v_from, v_to) m
        join public.source_transactions t on t.id = m.transaction_id and t.owner_id = v_owner
       where m.deposits_minor > 0
       order by magnitude desc, t.id
       limit v_top
    ) x;

  select coalesce(jsonb_agg(jsonb_build_object(
           'date', b.on_date, 'balance', b.balance_minor::text) order by b.on_date), '[]')
    into v_balances
    from private.daily_closing_balances(v_owner, v_from, v_to) b;

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
    'dailyBalances', v_balances);
end;
$$;
revoke all on function public.ledger_statistics(date, date, integer) from public, anon;
grant execute on function public.ledger_statistics(date, date, integer) to authenticated;

-- ---------------------------------------------------------------- the retrofit
--
-- Reproduced whole rather than patched, on migrations 019, 020 and 022's reasoning: `create or
-- replace function` replaces a body entire, so a migration showing only the changed lines would
-- leave the current definition readable nowhere. This is 022's function with **one predicate added
-- to the totals**, marked below. Nothing else moves.
--
-- The totals strip is the ledger's own whole-account aggregate, and it now answers the same question
-- the statistics page answers. Two surfaces disagreeing about one ledger is the failure this avoids.
create or replace function public.list_account_transactions_page(
  p_account_id uuid,
  p_limit integer default 100,
  p_before_date date default null,
  p_before_time time default null,
  p_before_id uuid default null
) returns jsonb language plpgsql stable security definer set search_path = public, private, pg_temp
as $$
declare
  v_owner uuid := auth.uid();
  v_limit integer;
  v_rows jsonb;
  v_ids uuid[];
  v_page uuid[];
  v_combined jsonb;
  v_more boolean;
  v_count bigint;
  v_deposits bigint;
  v_withdrawals bigint;
begin
  if not private.has_strong_owner_access(v_owner) then
    return jsonb_build_object('rows', '[]'::jsonb, 'hasMore', false,
      'totals', jsonb_build_object('rows', 0, 'deposits', '0', 'withdrawals', '0', 'net', '0'));
  end if;

  v_limit := least(greatest(coalesce(p_limit, 100), 1), 500);

  if (p_before_date is null) <> (p_before_id is null) then
    raise exception 'incomplete ledger page cursor';
  end if;

  select array_agg(t.id order by t.source_date desc, t.source_time desc nulls last, t.id)
    into v_ids
    from (
      select t.id, t.source_date, t.source_time
        from public.source_transactions t
       where t.owner_id = v_owner
         and t.account_id = p_account_id
         and (
           p_before_date is null
           or t.source_date < p_before_date
           or (t.source_date = p_before_date and (
                (p_before_time is not null and t.source_time is null)
                or (p_before_time is not null and t.source_time is not null and t.source_time < p_before_time)
                or (t.source_time is not distinct from p_before_time and t.id > p_before_id)
              ))
         )
       order by t.source_date desc, t.source_time desc nulls last, t.id
       limit v_limit + 1
    ) t;

  v_ids := coalesce(v_ids, array[]::uuid[]);
  v_more := array_length(v_ids, 1) > v_limit;
  v_page := v_ids[1:v_limit];

  select coalesce(jsonb_object_agg(b.transaction_id::text, b.combined_balance_minor::text), '{}')
    into v_combined
    from private.combined_balances(v_owner) b
   where b.transaction_id = any(v_page);

  select coalesce(jsonb_agg(
           private.ledger_transaction_json(v_owner, t)
             || jsonb_build_object('combined_balance_minor', v_combined->>t.id::text)
           order by t.source_date desc, t.source_time desc nulls last, t.id), '[]')
    into v_rows
    from public.source_transactions t
   where t.owner_id = v_owner and t.id = any(v_page);

  -- The row count is deliberately **not** filtered: it says how many rows this account holds, which
  -- is a fact about the ledger rather than about reporting, and the paging cursor walks all of them.
  select count(*) into v_count
    from public.source_transactions t
   where t.owner_id = v_owner and t.account_id = p_account_id;

  -- **New in 023.** The money totals honour `include_in_reporting`, matching `ledger_statistics`.
  -- Inert today because nothing sets the flag, and correct on the day something does.
  select coalesce(sum(c.amount_minor) filter (where c.kind = 'deposit'), 0),
         coalesce(sum(c.amount_minor) filter (where c.kind = 'withdrawal'), 0)
    into v_deposits, v_withdrawals
    from public.source_components c
    join public.source_transactions t on t.id = c.transaction_id and t.owner_id = c.owner_id
    left join public.transaction_overlays o on o.transaction_id = t.id and o.owner_id = t.owner_id
   where c.owner_id = v_owner
     and t.account_id = p_account_id
     and coalesce(o.include_in_reporting, true);

  return jsonb_build_object(
    'rows', v_rows,
    'hasMore', coalesce(v_more, false),
    'totals', jsonb_build_object(
      'rows', v_count,
      'deposits', v_deposits::text,
      'withdrawals', v_withdrawals::text,
      'net', (v_deposits + v_withdrawals)::text
    )
  );
end;
$$;
revoke all on function public.list_account_transactions_page(uuid, integer, date, time, uuid) from public, anon;
grant execute on function public.list_account_transactions_page(uuid, integer, date, time, uuid) to authenticated;

commit;
