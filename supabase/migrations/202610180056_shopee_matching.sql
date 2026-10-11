-- Migration 056 — the ledger read beneath Shopee matching (PLAN task 62 step 4a, D-270).
--
-- As for 7-Eleven receipts (030) and GrabFood orders (033), the automatic rule is a proposal
-- computed at read time, in `lib/shopee-match.ts`. `public.shopee_ledger_rows()` is the read it
-- and the manual chooser share. Nothing automatic is stored: only the owner's say (the overlay
-- and the links of migration 055) reaches storage.
--
-- It returns the distinct ledger rows of the caller that are any of:
--
--   (a) naming SHOPEE in the description or the label;
--   (b) a movement equal to a Shopee order's total, negated (total above zero), dated within
--       three days either side of the order's paid time (placed time when unpaid) in Bangkok;
--   (c) a movement equal to a bank-bound refund, positive, dated from the refund's Bangkok
--       request date to 30 days later.
--
-- Movement is the sum of the row's components. Security invoker, so row-level security scopes it
-- exactly as a direct select would. The windows are a wide net; the TypeScript rule decides.

begin;

create or replace function public.shopee_ledger_rows()
returns table (
  transaction_id uuid, account_id uuid, source_date date, source_time time,
  transaction_label text, description text, movement_minor bigint
) language sql stable security invoker set search_path = public, pg_temp
as $$
  with m as (
    select t.id, t.owner_id, t.account_id, t.source_date, t.source_time, t.transaction_label, t.description,
      (select sum(c.amount_minor) from public.source_components c
        where c.transaction_id = t.id and c.owner_id = t.owner_id)::bigint as movement
    from public.source_transactions t
  )
  select m.id, m.account_id, m.source_date, m.source_time, m.transaction_label, m.description, m.movement
  from m
  where m.description ilike '%SHOPEE%'
     or m.transaction_label ilike '%SHOPEE%'
     or exists (
       select 1 from public.shopee_orders o
        where o.owner_id = m.owner_id and o.total_minor > 0
          and m.movement = -o.total_minor
          and m.source_date between (coalesce(o.paid_at, o.placed_at) at time zone 'Asia/Bangkok')::date - 3
                                and (coalesce(o.paid_at, o.placed_at) at time zone 'Asia/Bangkok')::date + 3)
     or exists (
       select 1 from public.shopee_refunds r
        where r.owner_id = m.owner_id and r.refund_to = 'bank'
          and m.movement = r.refund_minor
          and m.source_date between (r.requested_at at time zone 'Asia/Bangkok')::date
                                and (r.requested_at at time zone 'Asia/Bangkok')::date + 30)
$$;
revoke all on function public.shopee_ledger_rows() from public, anon;
grant execute on function public.shopee_ledger_rows() to authenticated;

commit;
