-- Migration 041 — the three older candidate reads return one JSON array, and Sync captures a
-- message's orders or rides in one call (D-230).
--
-- **The row cap.** PostgREST cuts a table-returning RPC at `max_rows` (1000) without saying so,
-- which silently cost five rides their pairs under 039 (D-229, 040). `receipt_ledger_candidates()`
-- (030), `delivery_ledger_candidates()` (036) and `ride_ledger_candidates()` (035) have the same
-- shape and grow with the ledger — 13, 107 and 241 rows on hosted on 2026-09-25. Each now returns
-- one `jsonb` array of the same elements, which the cap does not touch. Same rows, same windows,
-- same element keys: only the envelope changes.
--
-- **Batch capture.** Sync called `capture_delivery` or `capture_ride` once per new document, so a
-- backfill bundle of a hundred rides was a hundred round trips inside one 60-second request.
-- `capture_deliveries` and `capture_rides` take an array of the same requests and call the single
-- function for each, each in its own subtransaction, so one refused document never undoes another.
-- Outcomes come back by position and name no value: `captured`, `alreadyStored`, `disagrees`, or
-- `refused`. The single functions stay the only write path and keep every check, the ledger lock,
-- the audit event and the sequence bump. Security invoker: the gate is theirs. At most 50 per call,
-- so one call stays well inside the role's statement timeout; the caller sends 25.
--
-- No table, no column: the backup stays v13.

begin;

drop function public.receipt_ledger_candidates();

create function public.receipt_ledger_candidates()
returns jsonb language sql stable security invoker set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'receipt_id', x.receipt_id, 'transaction_id', x.transaction_id, 'account_id', x.account_id,
    'source_date', x.source_date, 'source_time', x.source_time,
    'transaction_label', x.transaction_label, 'description', x.description,
    'lag_minutes', x.lag_minutes, 'names_true_money', x.names_true_money
  ) order by x.receipt_id, x.transaction_id), '[]'::jsonb)
  from (
    select r.id as receipt_id, t.id as transaction_id, t.account_id, t.source_date, t.source_time,
      t.transaction_label, t.description,
      case when r.purchased_at_time is null or t.source_time is null then null
        else floor(extract(epoch from (t.source_date + t.source_time) - (r.purchased_on + r.purchased_at_time)) / 60)::integer end
        as lag_minutes,
      (t.description ilike '%TRUE MONEY%' or t.transaction_label ilike '%TRUE MONEY%') as names_true_money
    from public.receipts r
    join public.source_transactions t
      on t.owner_id = r.owner_id and t.source_date between r.purchased_on - 3 and r.purchased_on + 3
    where (select sum(c.amount_minor) from public.source_components c
            where c.transaction_id = t.id and c.owner_id = t.owner_id) = -r.net_minor
  ) x
$$;
revoke all on function public.receipt_ledger_candidates() from public, anon;
grant execute on function public.receipt_ledger_candidates() to authenticated;

drop function public.delivery_ledger_candidates();

create function public.delivery_ledger_candidates()
returns jsonb language sql stable security invoker set search_path = public, pg_temp
as $$
  with o as (
    select d.id, d.owner_id,
      coalesce(d.receipt_sent_at, l.ordered_at) as anchor_at,
      coalesce(l.charged_minor, d.total_minor) as charged_minor
    from public.deliveries d
    left join public.lineman_order_details l on l.delivery_id = d.id and l.owner_id = d.owner_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'delivery_id', x.delivery_id, 'transaction_id', x.transaction_id, 'account_id', x.account_id,
    'source_date', x.source_date, 'source_time', x.source_time,
    'transaction_label', x.transaction_label, 'description', x.description,
    'lag_minutes', x.lag_minutes, 'names_grab', x.names_grab
  ) order by x.delivery_id, x.transaction_id), '[]'::jsonb)
  from (
    select o.id as delivery_id, t.id as transaction_id, t.account_id, t.source_date, t.source_time,
      t.transaction_label, t.description,
      case when t.source_time is null then null
        else floor(extract(epoch from (t.source_date + t.source_time) - (o.anchor_at at time zone 'Asia/Bangkok')) / 60)::integer end
        as lag_minutes,
      (t.description ilike '%GRAB%' or t.transaction_label ilike '%GRAB%') as names_grab
    from o
    join public.source_transactions t
      on t.owner_id = o.owner_id
     and t.source_date between (o.anchor_at at time zone 'Asia/Bangkok')::date - 3
                           and (o.anchor_at at time zone 'Asia/Bangkok')::date + 3
    where o.charged_minor > 0
      and (select sum(c.amount_minor) from public.source_components c
            where c.transaction_id = t.id and c.owner_id = t.owner_id) = -o.charged_minor
  ) x
$$;
revoke all on function public.delivery_ledger_candidates() from public, anon;
grant execute on function public.delivery_ledger_candidates() to authenticated;

drop function public.ride_ledger_candidates();

create function public.ride_ledger_candidates()
returns jsonb language sql stable security invoker set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'ride_id', x.ride_id, 'transaction_id', x.transaction_id, 'account_id', x.account_id,
    'source_date', x.source_date, 'source_time', x.source_time,
    'transaction_label', x.transaction_label, 'description', x.description,
    'lag_minutes', x.lag_minutes, 'names_grab', x.names_grab
  ) order by x.ride_id, x.transaction_id), '[]'::jsonb)
  from (
    select r.id as ride_id, t.id as transaction_id, t.account_id, t.source_date, t.source_time,
      t.transaction_label, t.description,
      case when t.source_time is null then null
        else floor(extract(epoch from (t.source_date + t.source_time) - (r.picked_up_at at time zone 'Asia/Bangkok')) / 60)::integer end
        as lag_minutes,
      (t.description ilike '%GRAB%' or t.transaction_label ilike '%GRAB%') as names_grab
    from public.rides r
    join public.source_transactions t
      on t.owner_id = r.owner_id
     and t.source_date between (r.picked_up_at at time zone 'Asia/Bangkok')::date - 3
                           and (r.picked_up_at at time zone 'Asia/Bangkok')::date + 3
    where r.total_minor > 0
      and (select sum(c.amount_minor) from public.source_components c
            where c.transaction_id = t.id and c.owner_id = t.owner_id) = -r.total_minor
  ) x
$$;
revoke all on function public.ride_ledger_candidates() from public, anon;
grant execute on function public.ride_ledger_candidates() to authenticated;

/*
 * One outcome per request, by position. The message is read only to tell a disagreement from any
 * other refusal and is never returned: it can name a stored value.
 */
create function public.capture_deliveries(p_requests jsonb)
returns jsonb language plpgsql security invoker set search_path = public, pg_temp
as $$
declare
  v_request jsonb;
  v_outcomes jsonb := '[]'::jsonb;
  v_result jsonb;
begin
  if jsonb_typeof(p_requests) is distinct from 'array' or jsonb_array_length(p_requests) > 50 then
    raise exception 'invalid delivery batch';
  end if;
  for v_request in select e from jsonb_array_elements(p_requests) with ordinality a(e, n) order by n loop
    begin
      v_result := public.capture_delivery(v_request);
      v_outcomes := v_outcomes || to_jsonb(case when (v_result->>'captured')::boolean then 'captured' else 'alreadyStored' end);
    exception when others then
      v_outcomes := v_outcomes || to_jsonb(case when sqlerrm like '%disagrees with the stored copy%' then 'disagrees' else 'refused' end);
    end;
  end loop;
  return v_outcomes;
end;
$$;
revoke all on function public.capture_deliveries(jsonb) from public, anon;
grant execute on function public.capture_deliveries(jsonb) to authenticated;

create function public.capture_rides(p_requests jsonb)
returns jsonb language plpgsql security invoker set search_path = public, pg_temp
as $$
declare
  v_request jsonb;
  v_outcomes jsonb := '[]'::jsonb;
  v_result jsonb;
begin
  if jsonb_typeof(p_requests) is distinct from 'array' or jsonb_array_length(p_requests) > 50 then
    raise exception 'invalid ride batch';
  end if;
  for v_request in select e from jsonb_array_elements(p_requests) with ordinality a(e, n) order by n loop
    begin
      v_result := public.capture_ride(v_request);
      v_outcomes := v_outcomes || to_jsonb(case when (v_result->>'captured')::boolean then 'captured' else 'alreadyStored' end);
    exception when others then
      v_outcomes := v_outcomes || to_jsonb(case when sqlerrm like '%disagrees with the stored copy%' then 'disagrees' else 'refused' end);
    end;
  end loop;
  return v_outcomes;
end;
$$;
revoke all on function public.capture_rides(jsonb) from public, anon;
grant execute on function public.capture_rides(jsonb) to authenticated;

commit;
