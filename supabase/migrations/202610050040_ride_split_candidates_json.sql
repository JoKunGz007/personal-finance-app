-- Migration 040 — `ride_split_candidates()` returns one JSON array, over the windows the rule uses
-- (D-229).
--
-- 039 returned a table, and PostgREST caps a table-returning RPC at `max_rows` (1000) **without
-- saying so**. On hosted it produced 1,181 rows, so the route silently lost the tail, and five rides
-- whose pairs fit read "no row" on the live page. Two changes, either of which alone would have
-- been enough today:
--
-- - **one `jsonb` value**, which the row cap does not touch, so no ledger size can truncate it;
-- - **only the rows the rule can use**: charges from 30 minutes before pickup to 60 after (039 took
--   a day either side), and `POS REFUND` deposits from the pickup day to eight days after.
--
-- Same element shape as 039's rows. Still a read: no table, no column, backup stays v13.

begin;

drop function public.ride_split_candidates();

create function public.ride_split_candidates()
returns jsonb language sql stable security invoker set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'ride_id', x.ride_id, 'transaction_id', x.transaction_id, 'account_id', x.account_id,
    'source_date', x.source_date, 'source_time', x.source_time,
    'transaction_label', x.transaction_label, 'description', x.description,
    'lag_minutes', x.lag_minutes, 'amount_minor', x.amount_minor
  ) order by x.ride_id, x.transaction_id), '[]'::jsonb)
  from (
    select r.id as ride_id, t.id as transaction_id, t.account_id, t.source_date, t.source_time,
      t.transaction_label, t.description,
      case when t.source_time is null then null
        else floor(extract(epoch from (t.source_date + t.source_time) - (r.picked_up_at at time zone 'Asia/Bangkok')) / 60)::integer end
        as lag_minutes,
      s.amount as amount_minor
    from public.rides r
    join public.source_transactions t
      on t.owner_id = r.owner_id
     and t.source_date between (r.picked_up_at at time zone 'Asia/Bangkok')::date - 1
                           and (r.picked_up_at at time zone 'Asia/Bangkok')::date + 8
    cross join lateral (
      select sum(c.amount_minor)::bigint as amount from public.source_components c
       where c.transaction_id = t.id and c.owner_id = t.owner_id
    ) s
    where r.total_minor > 0
      and (
        (s.amount < 0
          and t.source_time is not null
          and (t.source_date + t.source_time) between (r.picked_up_at at time zone 'Asia/Bangkok') - interval '30 minutes'
                                                  and (r.picked_up_at at time zone 'Asia/Bangkok') + interval '60 minutes'
          and (t.description ilike '%GRAB%' or t.transaction_label ilike '%GRAB%'
               or (t.transaction_label = 'Debit Card Spending' and t.description like 'Ref Code EDC%')))
        or (s.amount > 0
          and t.source_date >= (r.picked_up_at at time zone 'Asia/Bangkok')::date
          and (t.description ilike '%POS REFUND%' or t.transaction_label ilike '%POS REFUND%'))
      )
  ) x
$$;

revoke all on function public.ride_split_candidates() from public, anon;
grant execute on function public.ride_split_candidates() to authenticated;

commit;
