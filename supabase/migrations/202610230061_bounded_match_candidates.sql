-- Migration 061 — the automatic candidate set is bounded by date; the chooser's set moves to its
-- own function (D-158, design in D-264).
--
-- 021's `list_match_candidates` summed the components of **every** confirmed row before joining to
-- the open slip and card amounts, on every ledger load. The rows it returned were bounded; the work
-- was not.
--
-- ## `list_match_candidates` — what the automatic rules can use
--
-- A row is a candidate when some slip or card could pair with it under the rules in
-- `lib/slip-reconcile.ts` (`proposeSlipMatches`) and `lib/notification-card-reconcile.ts`
-- (`proposeCardMatches`):
--
--   * the same bank (slip) or the same account (card) — unchanged from 021;
--   * a movement equal to the record's amount **in force**, to the minor unit — unchanged;
--   * a `source_date` within one day of the record's date **in force**:
--     `coalesce(overlay.occurred_on, record.occurred_on)`, exactly as `applyCorrection`
--     (`lib/corrections.ts`) resolves it for `slipsInForce` and `cardsInForce`.
--
-- The TypeScript compares `Math.abs(dayNumber(source_date) - dayNumber(occurred_on)) <= 1`, where
-- `dayNumber` (`lib/dates.ts`) is the calendar-day number of a `YYYY-MM-DD` string with no time zone
-- applied. Both columns are `date`, so `source_date between d - 1 and d + 1` is the same predicate.
-- The `1` is `MATCH_WINDOW_DAYS` (slips) and `CARD_MATCH_WINDOW_DAYS` (cards); if either constant
-- changes, this function must change with it.
--
-- Rows are filtered by account and date **before** the components are summed, so only rows near a
-- slip or card are aggregated and `source_transactions_ledger_order_idx`
-- (owner_id, account_id, source_date …) serves the range.
--
-- Every row a stored slip or card decision names is still included whatever its date, as in 021.
-- There is no cap and no truncation (D-063): a capped set could make the rule mark a record
-- `verified` against a row whose rival was cut off.
--
-- ## `list_chooser_candidates` — what the manual chooser offers
--
-- 021's unbounded set, unchanged in body: bank or account and exact amount, no date window (D-067),
-- plus the decided rows. The client calls it only when the owner starts picking a row by hand.
--
-- No table, column or grant on a table changes, so the backup contract is unchanged.

begin;

create or replace function public.list_match_candidates()
returns jsonb language plpgsql stable security definer set search_path = public, private, pg_temp
as $$
declare
  v_owner uuid := auth.uid();
  v_rows jsonb;
begin
  if not private.has_strong_owner_access(v_owner) then return '[]'::jsonb; end if;

  with windows as (
    -- One (account, date in force, amount in force) per slip, for every account at the slip's bank.
    select a.id as account_id,
           coalesce(o.occurred_on, s.occurred_on) as on_date,
           coalesce(o.amount_minor, s.amount_minor) as amount_minor
      from public.slips s
      join public.accounts a on a.bank_code = s.bank_code and a.owner_id = v_owner
      left join public.slip_correction_overlays o on o.slip_id = s.id and o.owner_id = v_owner
     where s.owner_id = v_owner
    union
    select c.account_id,
           coalesce(o.occurred_on, c.occurred_on),
           coalesce(o.amount_minor, c.amount_minor)
      from public.notification_cards c
      left join public.notification_card_correction_overlays o on o.card_id = c.id and o.owner_id = v_owner
     where c.owner_id = v_owner
  ),
  in_window as (
    -- MATCH_WINDOW_DAYS = CARD_MATCH_WINDOW_DAYS = 1.
    select distinct t.id, w.amount_minor
      from windows w
      join public.source_transactions t
        on t.owner_id = v_owner and t.account_id = w.account_id
       and t.source_date between w.on_date - 1 and w.on_date + 1
  ),
  movements as (
    select t.id, sum(c.amount_minor) as movement
      from (select distinct id from in_window) t
      join public.source_components c on c.transaction_id = t.id and c.owner_id = v_owner
     group by t.id
  ),
  candidates as (
    select m.id from movements m
      join in_window w on w.id = m.id and w.amount_minor = m.movement
    union
    select d.transaction_id from public.slip_match_overlays d
     where d.owner_id = v_owner and d.transaction_id is not null
    union
    select d.transaction_id from public.notification_card_decision_overlays d
     where d.owner_id = v_owner and d.transaction_id is not null
  )
  select coalesce(jsonb_agg(
           private.ledger_transaction_json(v_owner, t) || jsonb_build_object('account_id', t.account_id)
           order by t.source_date desc, t.source_time desc nulls last, t.id), '[]')
    into v_rows
    from public.source_transactions t
    join candidates x on x.id = t.id
   where t.owner_id = v_owner;

  return v_rows;
end;
$$;
revoke all on function public.list_match_candidates() from public, anon;
grant execute on function public.list_match_candidates() to authenticated;

-- 021's `list_match_candidates`, body unchanged.
create or replace function public.list_chooser_candidates()
returns jsonb language plpgsql stable security definer set search_path = public, private, pg_temp
as $$
declare
  v_owner uuid := auth.uid();
  v_rows jsonb;
begin
  if not private.has_strong_owner_access(v_owner) then return '[]'::jsonb; end if;

  with movements as (
    select t.id, t.account_id, a.bank_code, sum(c.amount_minor) as movement
      from public.source_transactions t
      join public.accounts a on a.id = t.account_id and a.owner_id = v_owner
      join public.source_components c on c.transaction_id = t.id and c.owner_id = v_owner
     where t.owner_id = v_owner
     group by t.id, t.account_id, a.bank_code
  ),
  slip_amounts as (
    select s.bank_code, coalesce(o.amount_minor, s.amount_minor) as amount_minor
      from public.slips s
      left join public.slip_correction_overlays o on o.slip_id = s.id and o.owner_id = v_owner
     where s.owner_id = v_owner
  ),
  card_amounts as (
    select c.account_id, coalesce(o.amount_minor, c.amount_minor) as amount_minor
      from public.notification_cards c
      left join public.notification_card_correction_overlays o on o.card_id = c.id and o.owner_id = v_owner
     where c.owner_id = v_owner
  ),
  candidates as (
    select m.id from movements m
      join slip_amounts s on s.bank_code = m.bank_code and s.amount_minor = m.movement
    union
    select m.id from movements m
      join card_amounts c on c.account_id = m.account_id and c.amount_minor = m.movement
    union
    select d.transaction_id from public.slip_match_overlays d
     where d.owner_id = v_owner and d.transaction_id is not null
    union
    select d.transaction_id from public.notification_card_decision_overlays d
     where d.owner_id = v_owner and d.transaction_id is not null
  )
  select coalesce(jsonb_agg(
           private.ledger_transaction_json(v_owner, t) || jsonb_build_object('account_id', t.account_id)
           order by t.source_date desc, t.source_time desc nulls last, t.id), '[]')
    into v_rows
    from public.source_transactions t
    join candidates x on x.id = t.id
   where t.owner_id = v_owner;

  return v_rows;
end;
$$;
revoke all on function public.list_chooser_candidates() from public, anon;
grant execute on function public.list_chooser_candidates() to authenticated;

commit;
