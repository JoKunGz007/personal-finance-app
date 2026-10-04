-- Migration 046 — a receipt with no purchase time can match automatically (amends D-212).
--
-- Replaces only `receipt_ledger_candidates()` (copied from 041). A full 7-Eleven e-tax invoice
-- prints no time (D-232), so its `purchased_at_time` is null and `lag_minutes` is null: the timed
-- rule could never take it. The candidate now also carries `date_only_match`, true when the receipt
-- has no time, the row names TRUE MONEY (the same ilike test as `names_true_money`), and the row's
-- date is the receipt's date or the next day before 02:00. The amount test is unchanged (the row's
-- components sum to exactly minus the receipt's net, so it is money out of the exact amount).
-- Uniqueness and "not already claimed" stay in `lib/receipt-match.ts` with the timed rule.
-- Same rows and same window of three days, so the manual options are unchanged; one added key.
-- No table, no column: backup contract unchanged.

begin;

drop function public.receipt_ledger_candidates();

create function public.receipt_ledger_candidates()
returns jsonb language sql stable security invoker set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'receipt_id', x.receipt_id, 'transaction_id', x.transaction_id, 'account_id', x.account_id,
    'source_date', x.source_date, 'source_time', x.source_time,
    'transaction_label', x.transaction_label, 'description', x.description,
    'lag_minutes', x.lag_minutes, 'names_true_money', x.names_true_money,
    'date_only_match', x.date_only_match
  ) order by x.receipt_id, x.transaction_id), '[]'::jsonb)
  from (
    select r.id as receipt_id, t.id as transaction_id, t.account_id, t.source_date, t.source_time,
      t.transaction_label, t.description,
      case when r.purchased_at_time is null or t.source_time is null then null
        else floor(extract(epoch from (t.source_date + t.source_time) - (r.purchased_on + r.purchased_at_time)) / 60)::integer end
        as lag_minutes,
      (t.description ilike '%TRUE MONEY%' or t.transaction_label ilike '%TRUE MONEY%') as names_true_money,
      (r.purchased_at_time is null
        and (t.description ilike '%TRUE MONEY%' or t.transaction_label ilike '%TRUE MONEY%')
        and (t.source_date = r.purchased_on
             or (t.source_date = r.purchased_on + 1 and t.source_time is not null and t.source_time < time '02:00')))
        as date_only_match
    from public.receipts r
    join public.source_transactions t
      on t.owner_id = r.owner_id and t.source_date between r.purchased_on - 3 and r.purchased_on + 3
    where (select sum(c.amount_minor) from public.source_components c
            where c.transaction_id = t.id and c.owner_id = t.owner_id) = -r.net_minor
  ) x
$$;
revoke all on function public.receipt_ledger_candidates() from public, anon;
grant execute on function public.receipt_ledger_candidates() to authenticated;

commit;
