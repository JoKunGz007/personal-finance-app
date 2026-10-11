-- Migration 057 — Shopee's monthly strip, computed in SQL (PLAN task 62 step 6, D-270 "Totals").
--
-- One function, no table and no column: the backup contract is unchanged.
--
-- ## What a month counts
--
-- Shopee's own totals, never added to a ledger total (as D-225): a SPayLater purchase is counted
-- once here in its order month and again in the ledger as its repayments. An order belongs to the
-- Bangkok month of its paid time, or of its placed time when Shopee printed no paid time (7 of the
-- 9 cancelled orders, D-270). Refunds count in the order's month, not the refund's, so a month's
-- figure does not move when a refund lands later.
--
-- * `orders` counts orders not cancelled; an order is cancelled when its refunds cover its total.
-- * `spentMinor` is each order's total minus its refunds, summed; a cancelled order adds 0.
-- * `byKind` splits `spentMinor` by the order's payment kind (bank debit, wallet, SPayLater, other).
--
-- The last twelve Bangkok months up to the current one are always returned, empty months as
-- zeros, so the strip has no gaps. Money leaves as int64 text, as every other money read.

begin;

create or replace function public.shopee_monthly_summary()
returns jsonb language sql stable security invoker set search_path = public, pg_temp
as $$
  with months as (
    select generate_series(
             date_trunc('month', (now() at time zone 'Asia/Bangkok')) - interval '11 months',
             date_trunc('month', (now() at time zone 'Asia/Bangkok')),
             interval '1 month')::date as month
  ),
  refunded as (
    select r.order_id, sum(r.refund_minor) as refund_minor
      from public.shopee_refunds r
     group by r.order_id
  ),
  base as (
    select date_trunc('month', coalesce(o.paid_at, o.placed_at) at time zone 'Asia/Bangkok')::date as month,
           o.payment_kind,
           o.total_minor,
           least(coalesce(f.refund_minor, 0), o.total_minor) as refund_minor,
           coalesce(f.refund_minor, 0) >= o.total_minor and f.order_id is not null as cancelled
      from public.shopee_orders o
      left join refunded f on f.order_id = o.id
  ),
  per_month as (
    select m.month,
           count(b.month) filter (where not b.cancelled) as orders,
           count(b.month) filter (where b.cancelled) as cancelled,
           coalesce(sum(b.total_minor - b.refund_minor), 0) as spent,
           coalesce(sum(b.refund_minor), 0) as refunded,
           coalesce(sum(b.total_minor - b.refund_minor) filter (where b.payment_kind = 'bank_debit'), 0) as bank_debit,
           coalesce(sum(b.total_minor - b.refund_minor) filter (where b.payment_kind = 'wallet'), 0) as wallet,
           coalesce(sum(b.total_minor - b.refund_minor) filter (where b.payment_kind = 'spaylater'), 0) as spaylater,
           coalesce(sum(b.total_minor - b.refund_minor) filter (where b.payment_kind = 'other'), 0) as other
      from months m
      left join base b on b.month = m.month
     group by m.month
  )
  select jsonb_build_object('months', coalesce(jsonb_agg(jsonb_build_object(
           'month', to_char(p.month, 'YYYY-MM'),
           'orders', p.orders,
           'cancelled', p.cancelled,
           'spentMinor', p.spent::text,
           'refundedMinor', p.refunded::text,
           'byKind', jsonb_build_object(
             'bank_debit', p.bank_debit::text,
             'wallet', p.wallet::text,
             'spaylater', p.spaylater::text,
             'other', p.other::text)
         ) order by p.month), '[]'::jsonb))
    from per_month p
$$;
revoke all on function public.shopee_monthly_summary() from public, anon;
grant execute on function public.shopee_monthly_summary() to authenticated;

commit;
