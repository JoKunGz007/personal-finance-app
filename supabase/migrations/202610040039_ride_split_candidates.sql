-- Migration 039 — the rows a Grab ride can be paid by in two parts (PLAN task 58 part 5, D-229).
--
-- `ride_ledger_candidates()` (035) returns only rows of a ride's exact total, so a ride paid in two
-- parts reads "no row". Measured on the hosted ledger 2026-09-25, of the 43 rides inside statement
-- coverage with no such row:
--
-- - **34 were charged twice**: once 2–25 minutes before pickup, then the rest 4–22 minutes after
--   (once 51), the two summing to the ride's total to the satang;
-- - **6 were charged once for more than the total** and refunded the difference 2–5 days later, on
--   a row reading `POS REFUND`, which names no merchant;
-- - **3 were paid by a KBANK debit card**, whose rows read `Debit Card Spending` and name no
--   merchant either, so the GRAB wording the rule asks for is never there.
--
-- This read returns, for every ride with something to pay, the rows the TS rule
-- (`proposeRideSplits` in `lib/delivery-match.ts`) chooses from: charges that name GRAB or are an
-- unnamed KBANK card spend, from a day before pickup to a day after, and `POS REFUND` deposits up
-- to eight days after. Any amount — the rule does the arithmetic, and the automatic match stays a
-- read-time proposal, as every other one is. **No table, no column: the backup stays v13.** A
-- manual link still names one row; a two-row link is not stored, only proposed.

begin;

create or replace function public.ride_split_candidates()
returns table (
  ride_id uuid, transaction_id uuid, account_id uuid, source_date date, source_time time,
  transaction_label text, description text, lag_minutes integer, amount_minor bigint
) language sql stable security invoker set search_path = public, pg_temp
as $$
  select r.id, t.id, t.account_id, t.source_date, t.source_time, t.transaction_label, t.description,
    case when t.source_time is null then null
      else floor(extract(epoch from (t.source_date + t.source_time) - (r.picked_up_at at time zone 'Asia/Bangkok')) / 60)::integer end,
    s.amount
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
        and t.source_date <= (r.picked_up_at at time zone 'Asia/Bangkok')::date + 1
        and (t.description ilike '%GRAB%' or t.transaction_label ilike '%GRAB%'
             or (t.transaction_label = 'Debit Card Spending' and t.description like 'Ref Code EDC%')))
      or (s.amount > 0 and (t.description ilike '%POS REFUND%' or t.transaction_label ilike '%POS REFUND%'))
    )
$$;

revoke all on function public.ride_split_candidates() from public, anon;
grant execute on function public.ride_split_candidates() to authenticated;

commit;
