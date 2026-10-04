-- Migration 045 — group stores and ride types by whitespace-normalised name.
--
-- Replaces only `delivery_statistics()` (copied from 038). `restaurant` and `ride_type` were grouped
-- on the raw text, so "A  B" and "A B" were two rows. The key now trims and collapses whitespace
-- runs; the displayed name is the lexically smallest original spelling in the group. No table, no
-- column: backup contract unchanged.
--
-- receipt_statistics() is unchanged on purpose: `receipt_items` stores no item code or barcode, only
-- the printed name, so there is no stable key to merge truncated names by.

begin;

create or replace function public.delivery_statistics()
returns jsonb language sql stable security invoker set search_path = public, pg_temp
as $$
  with scheme_line as (
    select a.delivery_id, min(a.amount_minor) as amount, count(*) as lines
      from public.delivery_adjustments a
     where a.kind = 'discount' and a.name ~ '^TH[0-9]+GF[0-9]+ALL$'
     group by a.delivery_id
  ),
  base as (
    select d.id, d.platform, d.restaurant, d.food_minor, coalesce(d.delivery_fee_minor, 0) as fee,
           d.total_minor,
           (coalesce(l.ordered_at, d.receipt_sent_at) at time zone 'Asia/Bangkok') as local_at,
           coalesce(l.charged_minor, d.total_minor) as charged,
           case
             when d.platform = 'grabfood' and d.total_minor = 0 and s.lines = 1 then s.amount
             when d.platform = 'lineman' and d.total_minor - l.charged_minor > 0 then d.total_minor - l.charged_minor
           end as wallet
      from public.deliveries d
      left join public.lineman_order_details l on l.delivery_id = d.id and l.owner_id = d.owner_id
      left join scheme_line s on s.delivery_id = d.id
  ),
  o as (
    select s.*,
           case when s.wallet is null then s.charged else s.charged + s.wallet - s.government end as cost
      from (
        select c.*,
               -- The day's running total, capped: min(after, cap) - min(before, cap).
               least(c.run_after, 20000) - least(c.run_after - c.uncapped, 20000) as government
          from (
            select u.*,
                   sum(u.uncapped) over (partition by (u.wallet is not null), u.local_at::date
                                         order by u.local_at, u.id rows between unbounded preceding and current row) as run_after
              from (
                select f.*,
                       -- The owner's share rounds to the nearest satang: 50% in 2025 half up, 40% never a tie.
                       f.food_share - ((case when f.local_at::date < date '2026-01-01' then 5 else 4 end) * f.food_share + 5) / 10 as uncapped
                  from (select b.*, least(b.food_minor, b.wallet) as food_share from base b) f
              ) u
          ) c
      ) s
  ),
  r as (
    select ride_type, total_minor, platform_fee_minor, (dropped_off_at at time zone 'Asia/Bangkok') as local_at
      from public.rides
  ),
  totals as (
    select count(*)::integer as orders,
           coalesce(sum(cost), 0)::bigint as spent,
           coalesce(sum(fee), 0)::bigint as fees,
           (count(*) filter (where wallet is not null))::integer as scheme_orders,
           -- What the government paid, after the daily cap.
           coalesce(sum(government) filter (where wallet is not null), 0)::bigint as scheme_paid,
           min(local_at)::date as first_on, max(local_at)::date as last_on
      from o
  ),
  ride_totals as (
    select count(*)::integer as rides, coalesce(sum(total_minor), 0)::bigint as spent,
           coalesce(sum(platform_fee_minor), 0)::bigint as platform_fees
      from r
  )
  select jsonb_build_object(
    'totals', (select jsonb_build_object(
      'orders', t.orders,
      'spent', t.spent::text,
      'averageSpent', case when t.orders = 0 then null else jsonb_build_object(
        'quotient', (t.spent / t.orders)::text, 'remainder', (t.spent % t.orders)::text) end,
      'firstDate', t.first_on,
      'lastDate', t.last_on,
      'deliveryFees', t.fees::text,
      -- Printed discounts other than the scheme's own line, which is the wallet, not a discount.
      'discounts', (select coalesce(sum(a.amount_minor), 0)::bigint from public.delivery_adjustments a
                     where a.kind = 'discount' and a.name !~ '^TH[0-9]+GF[0-9]+ALL$')::text,
      'schemeOrders', t.scheme_orders,
      'schemePaid', t.scheme_paid::text
    ) from totals t),
    'platforms', coalesce((select jsonb_agg(jsonb_build_object(
        'platform', p.platform, 'orders', p.orders, 'spent', p.spent::text) order by p.spent desc, p.platform)
      from (select platform, count(*)::integer as orders, sum(cost)::bigint as spent from o group by platform) p), '[]'::jsonb),
    'restaurants', coalesce((select jsonb_agg(jsonb_build_object(
        'restaurant', x.restaurant, 'orders', x.orders, 'spent', x.spent::text) order by x.spent desc, x.orders desc, x.restaurant)
      from (select regexp_replace(btrim(restaurant), '\s+', ' ', 'g') as restaurant, count(*)::integer as orders,
                   sum(cost)::bigint as spent
              from o group by 1
             order by spent desc, orders desc, 1 limit 10) x), '[]'::jsonb),
    'months', coalesce((select jsonb_agg(jsonb_build_object(
        'month', m.month, 'orders', m.orders, 'spent', m.spent::text, 'rides', m.rides, 'rideSpent', m.ride_spent::text)
        order by m.month)
      from (select month, sum(orders)::integer as orders, sum(spent)::bigint as spent,
                   sum(rides)::integer as rides, sum(ride_spent)::bigint as ride_spent
              from (select to_char(local_at, 'YYYY-MM') as month, 1 as orders, cost as spent, 0 as rides, 0::bigint as ride_spent from o
                    union all
                    select to_char(local_at, 'YYYY-MM'), 0, 0, 1, total_minor from r) u
             group by month) m), '[]'::jsonb),
    'rides', (select jsonb_build_object(
      'rides', rt.rides,
      'spent', rt.spent::text,
      'averageSpent', case when rt.rides = 0 then null else jsonb_build_object(
        'quotient', (rt.spent / rt.rides)::text, 'remainder', (rt.spent % rt.rides)::text) end,
      'platformFees', rt.platform_fees::text
    ) from ride_totals rt),
    'rideTypes', coalesce((select jsonb_agg(jsonb_build_object(
        'rideType', y.ride_type, 'rides', y.rides, 'spent', y.spent::text) order by y.rides desc, y.spent desc, y.ride_type)
      from (select regexp_replace(btrim(ride_type), '\s+', ' ', 'g') as ride_type, count(*)::integer as rides,
                   sum(total_minor)::bigint as spent
              from r group by 1) y), '[]'::jsonb)
  )
$$;

revoke all on function public.delivery_statistics() from public, anon;
grant execute on function public.delivery_statistics() to authenticated;

commit;
