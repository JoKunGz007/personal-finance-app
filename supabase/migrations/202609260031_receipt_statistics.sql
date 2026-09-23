-- Migration 031 — receipt statistics (PLAN task 56, the last unbuilt part).
--
-- ## A separate lens, never a ledger total
--
-- A receipt is never money (`docs/RECEIPT_CONTRACT.md`): every purchase it describes already
-- reached the ledger as a TrueMoney pull, a wallet top-up or a reimbursement. So nothing here is
-- read by `ledger_statistics`, and nothing in `ledger_statistics` reads this. These figures answer
-- "what did the receipts show", beside the ledger, and they are never added to it.
--
-- ## What counts, and where
--
-- - **Every receipt's net counts**, partial or not: a partial receipt's header, net, payment and
--   timestamp are trustworthy (the contract's "Truncation is detected, never guessed").
-- - **Item figures read only receipts whose stored items are complete** (`items_complete`), and
--   only merchandise: a promotion line or a zero-priced line is not a purchase, or the most-bought
--   item is a stamp forever. The number of receipts left out is returned beside the figures, so
--   the page can say so rather than present a partial basket as the basket.
-- - Discounts are item-list figures (they come from the same parse), so they follow the same rule.
-- - An item is named by the owner's `display_name` when set, else the printed name. A name a
--   screenshot truncated and the full invoice printed whole are two names here; that is a
--   property of the source, and the owner's display name is what joins them.
--
-- ## Computed in SQL, over every receipt
--
-- D-160's rule for `/statistics`: never over the rows a page happened to hold — which is also
-- what keeps this clear of PostgREST's row cap on the receipt list. **No division of money**:
-- the average basket is the exact quotient/remainder pair `ledger_statistics` uses.
--
-- Security invoker, so row-level security scopes it to the strong owner exactly as a direct select
-- would. No table, no column: backup contract stays **v9**.

begin;

create or replace function public.receipt_statistics()
returns jsonb language sql stable security invoker set search_path = public, pg_temp
as $$
  with r as (
    select * from public.receipts
  ),
  merch as (
    select coalesce(i.display_name, i.name) as name, i.quantity, i.amount_minor, i.receipt_id
      from public.receipt_items i
      join r on r.id = i.receipt_id and r.items_complete
     where not i.is_promotion and i.amount_minor > 0
  ),
  items as (
    select name, sum(quantity)::bigint as quantity, sum(amount_minor)::bigint as spend,
           count(distinct receipt_id)::integer as receipts
      from merch group by name
  ),
  totals as (
    select count(*)::integer as receipts,
           coalesce(sum(net_minor), 0)::bigint as net,
           (count(*) filter (where not items_complete))::integer as partial,
           min(purchased_on) as first_on, max(purchased_on) as last_on
      from r
  )
  select jsonb_build_object(
    'totals', (select jsonb_build_object(
      'receipts', t.receipts,
      'net', t.net::text,
      'averageNet', case when t.receipts = 0 then null else jsonb_build_object(
        'quotient', (t.net / t.receipts)::text, 'remainder', (t.net % t.receipts)::text) end,
      'firstDate', t.first_on,
      'lastDate', t.last_on,
      'partialReceipts', t.partial,
      'units', (select coalesce(sum(quantity), 0)::bigint from merch),
      'itemSpend', (select coalesce(sum(amount_minor), 0)::bigint from merch)::text,
      'discounts', (select coalesce(sum(d.amount_minor), 0)::bigint
                      from public.receipt_discounts d join r on r.id = d.receipt_id and r.items_complete)::text
    ) from totals t),
    'months', coalesce((select jsonb_agg(jsonb_build_object(
        'month', m.month, 'receipts', m.receipts, 'net', m.net::text) order by m.month)
      from (select to_char(purchased_on, 'YYYY-MM') as month, count(*)::integer as receipts,
                   sum(net_minor)::bigint as net
              from r group by 1) m), '[]'::jsonb),
    'mostBought', coalesce((select jsonb_agg(jsonb_build_object(
        'name', x.name, 'quantity', x.quantity, 'spend', x.spend::text, 'receipts', x.receipts)
        order by x.quantity desc, x.spend desc, x.name)
      from (select * from items order by quantity desc, spend desc, name limit 10) x), '[]'::jsonb),
    'mostSpent', coalesce((select jsonb_agg(jsonb_build_object(
        'name', x.name, 'quantity', x.quantity, 'spend', x.spend::text, 'receipts', x.receipts)
        order by x.spend desc, x.quantity desc, x.name)
      from (select * from items order by spend desc, quantity desc, name limit 10) x), '[]'::jsonb),
    'paymentMethods', coalesce((select jsonb_agg(jsonb_build_object(
        'method', p.method, 'receipts', p.receipts, 'net', p.net::text)
        order by p.receipts desc, p.net desc, p.method nulls last)
      from (select payment_method as method, count(*)::integer as receipts, sum(net_minor)::bigint as net
              from r group by payment_method) p), '[]'::jsonb),
    'branches', coalesce((select jsonb_agg(jsonb_build_object(
        'storeCode', b.store_code, 'branchName', b.branch_name, 'receipts', b.receipts, 'net', b.net::text)
        order by b.receipts desc, b.net desc, b.store_code)
      from (select store_code, min(branch_name) as branch_name, count(*)::integer as receipts,
                   sum(net_minor)::bigint as net
              from r group by store_code) b), '[]'::jsonb)
  )
$$;

revoke all on function public.receipt_statistics() from public, anon;
grant execute on function public.receipt_statistics() to authenticated;

commit;
