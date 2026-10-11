-- Migration 058 — `shopee_ledger_rows()` rewritten for speed; same rows, same contract (D-272).
--
-- 056's version ran a correlated subquery per ledger row: a components sum and an `exists` over
-- every Shopee order and refund. Under row-level security each of those inner rows re-ran
-- `private.has_strong_owner_access`, so on hosted (1,812 rows, 171 orders) one call took about
-- 6 s as the owner, and the loader's `count: "exact"` read runs it twice: past the 8 s
-- statement timeout for `authenticated`. Every Shopee read, and with it auto-categorise, failed.
--
-- Here the orders, the refunds and the component sums are each read once (materialized), so each
-- source row passes its policy once. Measured on hosted as the owner: 119 ms, and the same 179
-- rows as 056 (an `except` both ways was empty). Security invoker still, so RLS scopes it exactly
-- as before.

begin;

create or replace function public.shopee_ledger_rows()
returns table (
  transaction_id uuid, account_id uuid, source_date date, source_time time,
  transaction_label text, description text, movement_minor bigint
) language sql stable security invoker set search_path = public, pg_temp
as $$
  with o as materialized (
    select o.owner_id, -o.total_minor as movement,
           (coalesce(o.paid_at, o.placed_at) at time zone 'Asia/Bangkok')::date as day
      from public.shopee_orders o where o.total_minor > 0
  ),
  r as materialized (
    select r.owner_id, r.refund_minor as movement, (r.requested_at at time zone 'Asia/Bangkok')::date as day
      from public.shopee_refunds r where r.refund_to = 'bank'
  ),
  c as materialized (
    select c.transaction_id, c.owner_id, sum(c.amount_minor)::bigint as movement
      from public.source_components c group by c.transaction_id, c.owner_id
  ),
  m as materialized (
    select t.id, t.owner_id, t.account_id, t.source_date, t.source_time, t.transaction_label, t.description, c.movement
      from public.source_transactions t
      left join c on c.transaction_id = t.id and c.owner_id = t.owner_id
  )
  select m.id, m.account_id, m.source_date, m.source_time, m.transaction_label, m.description, m.movement
  from m
  where m.description ilike '%SHOPEE%'
     or m.transaction_label ilike '%SHOPEE%'
     or exists (select 1 from o where o.owner_id = m.owner_id and o.movement = m.movement
                  and m.source_date between o.day - 3 and o.day + 3)
     or exists (select 1 from r where r.owner_id = m.owner_id and r.movement = m.movement
                  and m.source_date between r.day and r.day + 30)
$$;
revoke all on function public.shopee_ledger_rows() from public, anon;
grant execute on function public.shopee_ledger_rows() to authenticated;

commit;
