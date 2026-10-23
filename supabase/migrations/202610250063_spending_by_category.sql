-- Migration 063 — spending by category for the statistics page.
--
-- `public.spending_by_category(p_from, p_to, p_account_id)` splits the statistics page's spending
-- figure by the category in force on each transaction (`transaction_overlays.category_id`).
--
-- ## Definition of spending
--
-- Exactly `ledger_statistics`' withdrawals figure, sign-flipped to a positive magnitude:
-- `-sum(withdrawals_minor)` over `private.reportable_movements`. Nothing here restates that
-- function's filters (include_in_reporting, statement rows, window on source_date, account), and
-- deposit legs never enter, so a refund deposited into a category does not reduce its spending.
-- A bucket whose spending is not above zero is omitted, so the listed categories sum to the top-level
-- `spendingMinor`, which equals `-(ledger_statistics(...)->'totals'->>'withdrawals')`.
--
-- A transaction with no overlay, or an overlay with no category, falls in the uncategorised bucket
-- (`categoryId` null, `name` null). `parentId`/`parentName` come from `category_parents` (one level).
-- Money is `bigint` rendered `::text`; the `sum()` numeric is cast explicitly.
--
-- Window bounds default exactly as `ledger_statistics` does (within the chosen account). No table,
-- column or trigger: backup contract unchanged.

begin;

create or replace function public.spending_by_category(
  p_from date default null,
  p_to date default null,
  p_account_id uuid default null
) returns jsonb language plpgsql stable security definer set search_path = public, private, pg_temp
as $$
declare
  v_owner uuid := auth.uid();
  v_from date;
  v_to date;
  v_total bigint;
  v_categories jsonb;
begin
  if not private.has_strong_owner_access(v_owner) then
    return jsonb_build_object('from', null, 'to', null, 'spendingMinor', '0', 'categories', '[]'::jsonb);
  end if;

  select coalesce(p_from, min(t.source_date)), coalesce(p_to, max(t.source_date))
    into v_from, v_to
    from public.source_transactions t
   where t.owner_id = v_owner
     and (p_account_id is null or t.account_id = p_account_id);

  if v_from is null or v_to is null or v_to < v_from then
    return jsonb_build_object('from', v_from, 'to', v_to, 'spendingMinor', '0', 'categories', '[]'::jsonb);
  end if;

  -- One scan: the total is the sum of the listed buckets, since a bucket left out spent nothing.
  select coalesce(sum(g.spending), 0)::bigint,
         coalesce(jsonb_agg(jsonb_build_object(
           'categoryId', g.category_id,
           'name', g.name,
           'archived', g.archived,
           'parentId', g.parent_id,
           'parentName', g.parent_name,
           'spendingMinor', g.spending::text,
           'transactionCount', g.transactions
         ) order by g.spending desc, g.name nulls last, g.category_id nulls last), '[]')
    into v_total, v_categories
    from (
      select o.category_id,
             c.name,
             coalesce(c.archived, false) as archived,
             cp.parent_id,
             pc.name as parent_name,
             sum(-m.withdrawals_minor)::bigint as spending,
             count(*) filter (where m.withdrawals_minor < 0) as transactions
        from private.reportable_movements(v_owner, v_from, v_to, p_account_id) m
        left join public.transaction_overlays o
          on o.transaction_id = m.transaction_id and o.owner_id = v_owner
        left join public.categories c
          on c.id = o.category_id and c.owner_id = v_owner
        left join public.category_parents cp
          on cp.category_id = o.category_id and cp.owner_id = v_owner
        left join public.categories pc
          on pc.id = cp.parent_id and pc.owner_id = v_owner
       group by o.category_id, c.name, c.archived, cp.parent_id, pc.name
      having sum(-m.withdrawals_minor) > 0
    ) g;

  return jsonb_build_object('from', v_from, 'to', v_to, 'spendingMinor', v_total::text, 'categories', v_categories);
end;
$$;
revoke all on function public.spending_by_category(date, date, uuid) from public, anon;
grant execute on function public.spending_by_category(date, date, uuid) to authenticated;

commit;
