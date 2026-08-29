-- Migration 024 — statistics take an account, and the ledger takes a date range
-- (PLAN task 46's second half, and the ledger date filter task 47 turned out to need first).
--
-- ## Why these two together
--
-- They are unrelated features and they share one thing that matters more than their similarity:
-- **each needs a signature change on a function the app already calls**, and therefore a
-- `supabase db push` against hosted, a backup verified from the database first, and the owner
-- running it himself (D-152). Two migrations would be two of each. Migration 017 bundled for the
-- same class of reason — pieces designed together because the operational cost is per-migration
-- rather than per-feature (D-104).
--
-- ## The account filter, and why the balance series needs two sources
--
-- 023 said there was no account filter because *"the balance series is the combined position by
-- construction, and an average whose denominator changed with a filter would be a different figure
-- wearing the same label."* Both halves of that are still true, and neither is an argument against
-- the filter — they are the specification for it. Every average here divides by **days in the
-- window**, not by rows, so narrowing to one account changes the numerator and leaves the divisor
-- alone, which is the arithmetic already being correct. What actually needed deciding is the
-- balance chart, and the answer is that it is drawn from a **different source** per mode:
--
--   * **All accounts** — `private.combined_balances`, the derived running total from 022. The only
--     thing that can answer "what did the owner hold", because no single printed balance does.
--   * **One account** — that account's own **printed** `post_balance_minor`. 022's own reasoning
--     says why this is not a shortcut: the printed balance is the truth, and the derived figure
--     drifts from it across a gap between two separately imported statements. Per account, the
--     bank has already done the arithmetic and it is authoritative.
--
-- Deriving the single-account series from `combined_balances` would have been the tidier code and
-- the wrong number: that function's running total is over *every* account, so restricting its
-- output to one account's rows yields the combined position sampled at that account's dates — a
-- real figure, answering a question nobody asked.
--
-- ## The ledger date range, which is not the ledger cursor
--
-- `list_account_transactions_page` already takes `p_before_date` and `p_before_time`. Those are a
-- **cursor** — where the last page stopped — and the new `p_from`/`p_to` are **bounds**. Both are
-- dates on the same function and they do different jobs, so they are named for their jobs: the
-- cursor walks, the bounds fence. A window narrower than a page still pages, because the cursor
-- is applied inside the bounds rather than instead of them.
--
-- **`totals.rows` changes meaning when a bound is supplied, and only then.** 023 says that count is
-- deliberately unfiltered because it is a fact about the account rather than about reporting. With
-- a window on screen, a strip reporting the whole account's row count beside a window's money would
-- be the two-surfaces-disagreeing failure 023 wrote that same paragraph to avoid. Absent bounds the
-- old contract holds exactly.
--
-- ## Why the old signatures are dropped rather than left
--
-- A defaulted parameter added to an existing function is an **overload**, not a replacement:
-- `ledger_statistics(p_from => x, p_to => y)` would then match both the 3-argument and the
-- 4-argument form and PostgreSQL would refuse the call as ambiguous. Dropping is what makes this a
-- change rather than a fork. Grants go with the dropped function and are restated below.
--
-- ## Exact money, and scope
--
-- Nothing here divides and nothing new is cast. Every figure stays `bigint` minor units rendered
-- `::text`, on 023's rule.
--
-- **No table, no column, no trigger, no new grantee.** Four function bodies, reproduced whole
-- rather than patched, on the rule migrations 019, 020, 022 and 023 all state: `create or replace`
-- replaces a body entire, so a migration showing only its changed lines would leave the current
-- definition readable nowhere. Backup contract stays **v7** — `export_backup_snapshot` reads
-- tables and is untouched.

begin;

-- The overloads that would otherwise be created. See the header.
drop function if exists public.ledger_statistics(date, date, integer);
drop function if exists public.list_account_transactions_page(uuid, integer, date, time, uuid);
drop function if exists private.reportable_movements(uuid, date, date);
drop function if exists private.daily_closing_balances(uuid, date, date);

-- ---------------------------------------------------------------- what counts as reportable
--
-- 023's function with `p_account_id` added. One predicate, and it is null-permissive in the same
-- shape as the two date bounds beside it, so "no account chosen" and "no window chosen" are the
-- same kind of absence rather than two conventions in one signature.
--
-- The join to `source_components` is inner: a transaction with no component moved nothing and has
-- no place in a total. The join to `transaction_overlays` is outer, because most rows have no
-- overlay at all and an absent overlay means the default — `true`.
create or replace function private.reportable_movements(
  p_owner uuid, p_from date, p_to date, p_account_id uuid default null)
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
     and (p_account_id is null or t.account_id = p_account_id)
   group by t.id, t.source_date;
$$;
revoke all on function private.reportable_movements(uuid, date, date, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- daily closing balance
--
-- **Two sources, one contract**, for the reason set out in the header: the combined position is
-- derived because nothing prints it, and a single account's position is printed because the bank
-- prints it and its own figure is the authoritative one.
--
-- **The ordering is `combined_balances`' own in both branches**, which is `compareTransactions`
-- reversed: `source_date asc, source_time asc nulls first, id DESC`. The day's *last* row is the
-- maximum of that ordering within the day, which is `source_time desc nulls last, id asc` — what
-- both `distinct on`s below use. Untimed rows sharing a date are ordinary here, so a `distinct on`
-- ordered any other way would pick a different row of the same day and print a balance that is
-- real but is not the day's close.
--
-- Not filtered by `include_in_reporting`, on purpose and unchanged from 023: excluding a row from
-- reporting does not un-move the money, and the balance line is where the money actually went.
--
-- The two branches are guarded on `p_account_id` rather than written as one query with a `case`,
-- because they read different columns of different relations. `union all` and not `union`: the
-- guards are exclusive, so deduplicating would only pay for a sort that can never remove a row.
create or replace function private.daily_closing_balances(
  p_owner uuid, p_from date, p_to date, p_account_id uuid default null)
returns table (on_date date, balance_minor bigint)
language sql stable
as $$
  (
    select distinct on (t.source_date) t.source_date, b.combined_balance_minor
      from private.combined_balances(p_owner) b
      join public.source_transactions t
        on t.id = b.transaction_id and t.owner_id = p_owner
     where p_account_id is null
       and (p_from is null or t.source_date >= p_from)
       and (p_to is null or t.source_date <= p_to)
     order by t.source_date, t.source_time desc nulls last, t.id
  )
  union all
  (
    select distinct on (t.source_date) t.source_date, t.post_balance_minor
      from public.source_transactions t
     where t.owner_id = p_owner
       and p_account_id is not null
       and t.account_id = p_account_id
       and (p_from is null or t.source_date >= p_from)
       and (p_to is null or t.source_date <= p_to)
     order by t.source_date, t.source_time desc nulls last, t.id
  );
$$;
revoke all on function private.daily_closing_balances(uuid, date, date, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- the surface
--
-- 023's function with `p_account_id` threaded through it. Most of the work was already done by
-- `reportable_movements`: totals, months, day-of-week and both largest-movement lists all read
-- through it, so they narrow by construction. **Three things do not and are marked below** — the
-- window resolution, the excluded count, and the balance series.
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
      'largestOut', '[]'::jsonb, 'largestIn', '[]'::jsonb, 'dailyBalances', '[]'::jsonb);
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

  -- **Marked: the two-source series.** See the header — combined when no account is chosen, the
  -- account's own printed balance when one is.
  select coalesce(jsonb_agg(jsonb_build_object(
           'date', b.on_date, 'balance', b.balance_minor::text) order by b.on_date), '[]')
    into v_balances
    from private.daily_closing_balances(v_owner, v_from, v_to, p_account_id) b;

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
revoke all on function public.ledger_statistics(date, date, integer, uuid) from public, anon;
grant execute on function public.ledger_statistics(date, date, integer, uuid) to authenticated;

-- ---------------------------------------------------------------- the ledger page
--
-- 023's function with **date bounds added**, distinct from the cursor it already had. See the
-- header for why they are different things and why both are dates.
create or replace function public.list_account_transactions_page(
  p_account_id uuid,
  p_limit integer default 100,
  p_before_date date default null,
  p_before_time time default null,
  p_before_id uuid default null,
  p_from date default null,
  p_to date default null
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

  -- **A transposed window is refused rather than answered with nothing.** An empty page and a
  -- window that cannot contain anything are different states, and returning the first for the
  -- second would let a typo read as an account with no rows in it.
  if p_from is not null and p_to is not null and p_to < p_from then
    raise exception 'ledger window ends before it begins';
  end if;

  select array_agg(t.id order by t.source_date desc, t.source_time desc nulls last, t.id)
    into v_ids
    from (
      select t.id, t.source_date, t.source_time
        from public.source_transactions t
       where t.owner_id = v_owner
         and t.account_id = p_account_id
         -- The bounds fence; the cursor below walks inside them.
         and (p_from is null or t.source_date >= p_from)
         and (p_to is null or t.source_date <= p_to)
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

  -- **Unbounded on purpose**, and this is the one place the window must not reach. The combined
  -- balance at a row is a fact about the whole ledger up to that row; recomputing it from only the
  -- windowed rows would restart the running total at the window's edge and print a balance that
  -- belongs to no account at any date. The window selects which rows are shown, never what a shown
  -- row's balance was.
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

  -- 023 left this count deliberately unfiltered, as a fact about the account rather than about
  -- reporting. **It now honours the bounds, and only the bounds** — with a window on screen, a strip
  -- reporting the whole account's row count beside a window's money is the two-surfaces-disagreeing
  -- failure 023 wrote that paragraph to avoid. Absent bounds, both nulls, the old contract is
  -- reproduced exactly. It stays unfiltered by `include_in_reporting`, which has not changed.
  select count(*) into v_count
    from public.source_transactions t
   where t.owner_id = v_owner and t.account_id = p_account_id
     and (p_from is null or t.source_date >= p_from)
     and (p_to is null or t.source_date <= p_to);

  -- The money totals honour `include_in_reporting` (023) and now the window too, so the strip
  -- describes what is on screen.
  select coalesce(sum(c.amount_minor) filter (where c.kind = 'deposit'), 0),
         coalesce(sum(c.amount_minor) filter (where c.kind = 'withdrawal'), 0)
    into v_deposits, v_withdrawals
    from public.source_components c
    join public.source_transactions t on t.id = c.transaction_id and t.owner_id = c.owner_id
    left join public.transaction_overlays o on o.transaction_id = t.id and o.owner_id = t.owner_id
   where c.owner_id = v_owner
     and t.account_id = p_account_id
     and coalesce(o.include_in_reporting, true)
     and (p_from is null or t.source_date >= p_from)
     and (p_to is null or t.source_date <= p_to);

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
revoke all on function public.list_account_transactions_page(uuid, integer, date, time, uuid, date, date) from public, anon;
grant execute on function public.list_account_transactions_page(uuid, integer, date, time, uuid, date, date) to authenticated;

commit;
