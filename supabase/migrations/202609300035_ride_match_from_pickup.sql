-- Migration 035 — a ride's candidate rows are timed from its pickup, not its drop-off (PLAN task 58
-- part 5, D-222). Replaces `ride_ledger_candidates()` from migration 034 and nothing else: no
-- table, no write path and no backup kind moves, so the backup stays v12.
--
-- ## Why
--
-- Migration 034 keyed the lag on the drop-off, on the assumption that Grab charges the card when a
-- trip ends. **Measured on the 276 real rides once stored (2026-09-24), it charges at booking**: of
-- the 183 rides with a GRAB row of their exact total within three days, 176 landed 1–15 minutes
-- *before pickup*, two 16–30 before, two within 15 after, and two more than two hours before (a
-- ride booked ahead). None landed after the drop-off. The other 93 rides have no such row — 53
-- predate the first SCB statement.
--
-- The window the owner chose from that distribution — 30 minutes before pickup to 15 after — lives
-- in `lib/delivery-match.ts`, as the order window does. Inside it no ride had two rows, no row was
-- wanted by two rides, and none fell in an order's window. This read stays the wider net (three
-- days either side, any description) the manual link offers from.

begin;

/*
 * Every ledger row that could pay for a ride: a movement equal to the ride's total, negated,
 * within three days either side of the pickup date in Bangkok. ฿0 rides are skipped. Security
 * invoker, so row-level security scopes it exactly as a direct select would.
 *
 * `lag_minutes` is the row's time minus the pickup time, so a card charged at booking is negative.
 * Null when the row has no time — the automatic rule then declines.
 */
create or replace function public.ride_ledger_candidates()
returns table (
  ride_id uuid, transaction_id uuid, account_id uuid, source_date date, source_time time,
  transaction_label text, description text, lag_minutes integer, names_grab boolean
) language sql stable security invoker set search_path = public, pg_temp
as $$
  select r.id, t.id, t.account_id, t.source_date, t.source_time, t.transaction_label, t.description,
    case when t.source_time is null then null
      else floor(extract(epoch from (t.source_date + t.source_time) - (r.picked_up_at at time zone 'Asia/Bangkok')) / 60)::integer end,
    (t.description ilike '%GRAB%' or t.transaction_label ilike '%GRAB%')
  from public.rides r
  join public.source_transactions t
    on t.owner_id = r.owner_id
   and t.source_date between (r.picked_up_at at time zone 'Asia/Bangkok')::date - 3
                         and (r.picked_up_at at time zone 'Asia/Bangkok')::date + 3
  where r.total_minor > 0
    and (select sum(c.amount_minor) from public.source_components c
          where c.transaction_id = t.id and c.owner_id = t.owner_id) = -r.total_minor
$$;
revoke all on function public.ride_ledger_candidates() from public, anon;
grant execute on function public.ride_ledger_candidates() to authenticated;

commit;
