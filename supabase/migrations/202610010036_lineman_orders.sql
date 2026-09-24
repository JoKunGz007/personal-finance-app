-- Migration 036 — LINE MAN orders in `deliveries`, their order time and charged amount in a table of
-- their own, and backup v13 (PLAN task 58 part 4, D-223).
--
-- ## One orders table, as the owner chose
--
-- A LINE MAN order has what a GrabFood order has — dishes with options, a delivery fee, named
-- discounts, a total — so it is a `deliveries` row with platform `lineman`, and shares the list,
-- the dish and adjustment tables, matching and `/ledger`'s fold. Migration 032 said a second
-- platform widens the CHECK when it lands; this is that.
--
-- ## Its own facts go in a new table, never new columns (D-097)
--
-- Two facts are LINE MAN's alone: **when the order was placed** (the order page prints it; a
-- GrabFood e-receipt prints only its send time) and **what was charged** — less than the total
-- when the food was paid with เป๋าตัง and only the fee by mobile banking or LINE Pay (2 of the 7
-- measured orders). They live in `lineman_order_details`, one row per LINE MAN order, so no
-- existing row shape changes. `deliveries` only relaxes: the platform CHECK widens, and
-- `receipt_sent_at` may be null — for a LINE MAN order, and only for one.
--
-- ## Matching on the charged amount, from the order time
--
-- `delivery_ledger_candidates()` keeps its shape. Its lag is measured from the send time for
-- GrabFood and from the order time for LINE MAN, and it matches a row of the **charged** amount
-- (the total for GrabFood). An order with nothing charged is never a candidate, and
-- `set_delivery_match` refuses it, as it always refused a ฿0 GrabFood order. The window itself is
-- per platform, in `lib/delivery-match.ts`.
--
-- ## Backup v12 -> v13
--
-- One owner table appended after `ride_match_revisions`. Indices 0..37 keep meaning what they
-- meant in v12; v2 through v12 stay restorable.

begin;

alter table public.deliveries
  drop constraint deliveries_platform_check,
  add constraint deliveries_platform_check check (platform in ('grabfood', 'lineman')),
  alter column receipt_sent_at drop not null,
  add constraint deliveries_grabfood_sent_at check (platform <> 'grabfood' or receipt_sent_at is not null);

create table public.lineman_order_details (
  delivery_id uuid primary key,
  owner_id uuid not null references public.ledger_owners(owner_id),
  -- When the order was placed, as the order page prints it.
  ordered_at timestamptz not null,
  -- What reached a bank or wallet: the `Pay … with …` line. Below the total when the food was paid
  -- outside LINE MAN.
  charged_minor bigint not null check (charged_minor >= 0),
  foreign key (delivery_id, owner_id) references public.deliveries(id, owner_id)
);

create trigger lineman_order_details_immutable before update or delete on public.lineman_order_details
  for each row execute function private.reject_change();

alter table public.lineman_order_details enable row level security;
alter table public.lineman_order_details force row level security;
create policy strong_owner_select on public.lineman_order_details for select to authenticated
  using (private.has_strong_owner_access(owner_id));
grant select on public.lineman_order_details to authenticated;
revoke insert, update, delete on public.lineman_order_details from authenticated, anon;

-- Migration 032's write path, taking a LINE MAN order as well. A GrabFood request is read exactly
-- as before; a LINE MAN one also carries `orderedAt` and `chargedMinor`, and no send time.
create or replace function public.capture_delivery(p_request jsonb)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp
as $$
declare
  v_owner uuid := auth.uid();
  v_platform text := p_request->>'platform';
  v_existing public.deliveries%rowtype;
  v_existing_charged bigint;
  v_delivery public.deliveries%rowtype;
  v_sent_at timestamptz;
  v_ordered_at timestamptz;
  v_food bigint;
  v_fee bigint;
  v_total bigint;
  v_charged bigint;
  v_item jsonb;
  v_adjustment jsonb;
  v_item_sum bigint := 0;
  v_adjustment_net bigint := 0;
begin
  if not private.has_strong_owner_access(v_owner) then raise exception 'strong owner access required'; end if;
  if v_platform is null or v_platform not in ('grabfood', 'lineman') then raise exception 'invalid delivery'; end if;
  if jsonb_typeof(p_request->'items') is distinct from 'array' or jsonb_array_length(p_request->'items') = 0
    or jsonb_typeof(p_request->'adjustments') is distinct from 'array' then raise exception 'invalid delivery'; end if;

  begin
    if v_platform = 'grabfood' then
      v_sent_at := (p_request->>'receiptSentAt')::timestamptz;
    else
      v_ordered_at := (p_request->>'orderedAt')::timestamptz;
    end if;
  exception when others then raise exception 'invalid delivery date'; end;
  if coalesce(v_sent_at, v_ordered_at) is null then raise exception 'invalid delivery date'; end if;

  -- Money crosses the wire as canonical non-negative int64 text, as `capture_receipt` requires.
  if jsonb_typeof(p_request->'foodMinor') is distinct from 'string'
    or not private.is_canonical_int64_text(p_request->>'foodMinor', true)
    or jsonb_typeof(p_request->'totalMinor') is distinct from 'string'
    or not private.is_canonical_int64_text(p_request->>'totalMinor', true)
    or jsonb_typeof(p_request->'deliveryFeeMinor') not in ('string', 'null')
    or (jsonb_typeof(p_request->'deliveryFeeMinor') = 'string' and not private.is_canonical_int64_text(p_request->>'deliveryFeeMinor', true))
    or (v_platform = 'lineman' and (jsonb_typeof(p_request->'chargedMinor') is distinct from 'string'
      or not private.is_canonical_int64_text(p_request->>'chargedMinor', true)))
    then raise exception 'delivery money must be canonical int64 text'; end if;
  v_food := (p_request->>'foodMinor')::bigint;
  v_total := (p_request->>'totalMinor')::bigint;
  v_fee := nullif(p_request->>'deliveryFeeMinor', '')::bigint;
  if v_platform = 'lineman' then
    v_charged := (p_request->>'chargedMinor')::bigint;
    if v_charged > v_total then raise exception 'delivery charged more than its total'; end if;
  end if;

  for v_item in select value from jsonb_array_elements(p_request->'items') loop
    if jsonb_typeof(v_item->'amountMinor') is distinct from 'string'
      or not private.is_canonical_int64_text(v_item->>'amountMinor', true)
      then raise exception 'delivery item amount must be canonical int64 text'; end if;
    v_item_sum := v_item_sum + (v_item->>'amountMinor')::bigint;
  end loop;
  for v_adjustment in select value from jsonb_array_elements(p_request->'adjustments') loop
    if jsonb_typeof(v_adjustment->'amountMinor') is distinct from 'string'
      or not private.is_canonical_int64_text(v_adjustment->>'amountMinor', true)
      then raise exception 'delivery adjustment amount must be canonical int64 text'; end if;
    if v_adjustment->>'kind' = 'charge' then
      v_adjustment_net := v_adjustment_net + (v_adjustment->>'amountMinor')::bigint;
    elsif v_adjustment->>'kind' in ('discount', 'unprinted') then
      v_adjustment_net := v_adjustment_net - (v_adjustment->>'amountMinor')::bigint;
    else
      raise exception 'invalid delivery';
    end if;
  end loop;
  if v_item_sum <> v_food then raise exception 'delivery items do not sum to the food subtotal'; end if;
  if v_food + coalesce(v_fee, 0) + v_adjustment_net <> v_total then
    raise exception 'delivery food plus delivery plus charges minus discounts does not equal the total';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_owner::text || ':ledger-mutation', 0));

  select * into v_existing from public.deliveries
    where owner_id = v_owner and platform = v_platform and booking_id = p_request->>'bookingId';
  if v_existing.id is not null then
    select charged_minor into v_existing_charged from public.lineman_order_details
      where delivery_id = v_existing.id and owner_id = v_owner;
    if v_existing.food_minor <> v_food or v_existing.total_minor <> v_total
      or v_existing.delivery_fee_minor is distinct from v_fee
      or v_existing_charged is distinct from v_charged then
      raise exception 'delivery disagrees with the stored copy; refusing to guess which reading is right';
    end if;
    return jsonb_build_object('captured', false, 'id', v_existing.id);
  end if;

  begin
    insert into public.deliveries(owner_id, platform, booking_id, restaurant, payment_method,
      receipt_sent_at, food_minor, delivery_fee_minor, total_minor)
    values (v_owner, v_platform, p_request->>'bookingId', p_request->>'restaurant',
      nullif(p_request->>'paymentMethod', ''), v_sent_at, v_food, v_fee, v_total)
    returning * into v_delivery;

    if v_platform = 'lineman' then
      insert into public.lineman_order_details(delivery_id, owner_id, ordered_at, charged_minor)
      values (v_delivery.id, v_owner, v_ordered_at, v_charged);
    end if;

    for v_item in select value from jsonb_array_elements(p_request->'items') loop
      if jsonb_typeof(coalesce(v_item->'options', '[]'::jsonb)) is distinct from 'array' then raise exception 'invalid delivery'; end if;
      insert into public.delivery_items(owner_id, delivery_id, position, quantity, name, options, amount_minor)
      values (v_owner, v_delivery.id, (v_item->>'position')::integer, (v_item->>'quantity')::integer,
        v_item->>'name',
        (select coalesce(array_agg(value), '{}') from jsonb_array_elements_text(coalesce(v_item->'options', '[]'::jsonb))),
        (v_item->>'amountMinor')::bigint);
    end loop;

    for v_adjustment in select value from jsonb_array_elements(p_request->'adjustments') loop
      insert into public.delivery_adjustments(owner_id, delivery_id, position, kind, name, amount_minor)
      values (v_owner, v_delivery.id, (v_adjustment->>'position')::integer, v_adjustment->>'kind',
        v_adjustment->>'name', (v_adjustment->>'amountMinor')::bigint);
    end loop;
  exception
    when check_violation then raise exception 'invalid delivery';
    when not_null_violation then raise exception 'invalid delivery';
    when invalid_text_representation then raise exception 'invalid delivery';
    when unique_violation then raise exception 'invalid delivery';
  end;

  insert into public.audit_events(owner_id, actor_id, event_type, entity_type, entity_id, detail)
    values (v_owner, v_owner, 'delivery.capture', 'delivery', v_delivery.id,
      jsonb_build_object('platform', v_platform, 'items', jsonb_array_length(p_request->'items'),
        'adjustments', jsonb_array_length(p_request->'adjustments')));
  update public.mutation_sequences set sequence = sequence + 1, updated_at = now() where owner_id = v_owner;

  return jsonb_build_object('captured', true, 'id', v_delivery.id);
end;
$$;
revoke all on function public.capture_delivery(jsonb) from public, anon;
grant execute on function public.capture_delivery(jsonb) to authenticated;

/*
 * Every ledger row that could pay for an order: a movement equal to what the order charged,
 * negated — the total for GrabFood, the `Pay …` amount for LINE MAN — within three days of its
 * time: the send time for GrabFood, the order time for LINE MAN. Nothing-charged orders are
 * skipped. Security invoker, so row-level security scopes it as a direct select would.
 *
 * `lag_minutes` is the row's time minus that order time, negative when the row is earlier.
 */
create or replace function public.delivery_ledger_candidates()
returns table (
  delivery_id uuid, transaction_id uuid, account_id uuid, source_date date, source_time time,
  transaction_label text, description text, lag_minutes integer, names_grab boolean
) language sql stable security invoker set search_path = public, pg_temp
as $$
  with o as (
    select d.id, d.owner_id,
      coalesce(d.receipt_sent_at, l.ordered_at) as anchor_at,
      coalesce(l.charged_minor, d.total_minor) as charged_minor
    from public.deliveries d
    left join public.lineman_order_details l on l.delivery_id = d.id and l.owner_id = d.owner_id
  )
  select o.id, t.id, t.account_id, t.source_date, t.source_time, t.transaction_label, t.description,
    case when t.source_time is null then null
      else floor(extract(epoch from (t.source_date + t.source_time) - (o.anchor_at at time zone 'Asia/Bangkok')) / 60)::integer end,
    (t.description ilike '%GRAB%' or t.transaction_label ilike '%GRAB%')
  from o
  join public.source_transactions t
    on t.owner_id = o.owner_id
   and t.source_date between (o.anchor_at at time zone 'Asia/Bangkok')::date - 3
                         and (o.anchor_at at time zone 'Asia/Bangkok')::date + 3
  where o.charged_minor > 0
    and (select sum(c.amount_minor) from public.source_components c
          where c.transaction_id = t.id and c.owner_id = t.owner_id) = -o.charged_minor
$$;
revoke all on function public.delivery_ledger_candidates() from public, anon;
grant execute on function public.delivery_ledger_candidates() to authenticated;

/*
 * Migration 034's `set_delivery_match`, held to the charged amount rather than the total: equal
 * for every GrabFood order, and the `Pay …` amount for a LINE MAN one.
 */
create or replace function public.set_delivery_match(
  p_delivery_id uuid, p_expected_revision integer, p_decision text, p_transaction_id uuid
) returns jsonb language plpgsql security definer set search_path = public, private, pg_temp
as $$
declare
  v_owner uuid := auth.uid();
  v_delivery public.deliveries%rowtype;
  v_charged bigint;
  v_revision integer;
  v_snapshot jsonb;
  v_found boolean;
  v_movement bigint;
begin
  if not private.has_strong_owner_access(v_owner) then raise exception 'strong owner access required'; end if;
  if p_decision is null or p_decision not in ('matched','unmatched') then raise exception 'invalid delivery match decision'; end if;
  if (p_decision = 'matched') <> (p_transaction_id is not null) then
    raise exception 'invalid delivery match decision';
  end if;

  select * into v_delivery from public.deliveries where id = p_delivery_id and owner_id = v_owner;
  if v_delivery.id is null then raise exception 'delivery not owned'; end if;
  select coalesce((select charged_minor from public.lineman_order_details
                    where delivery_id = v_delivery.id and owner_id = v_owner), v_delivery.total_minor)
    into v_charged;
  if v_charged = 0 then raise exception 'delivery paid outside the platform'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_owner::text || ':ledger-mutation', 0));

  if p_decision = 'matched' then
    select true, (select sum(c.amount_minor) from public.source_components c
                   where c.transaction_id = t.id and c.owner_id = v_owner)
      into v_found, v_movement
      from public.source_transactions t
     where t.id = p_transaction_id and t.owner_id = v_owner;
    if v_found is null then raise exception 'transaction not owned'; end if;
    if v_movement is distinct from -v_charged then raise exception 'delivery match amount mismatch'; end if;
    if exists (select 1 from public.ride_match_overlays
                where transaction_id = p_transaction_id and owner_id = v_owner) then
      raise exception 'ledger row already claimed by a ride';
    end if;
  end if;

  select revision into v_revision from public.delivery_match_overlays
    where delivery_id = p_delivery_id and owner_id = v_owner for update;
  v_revision := coalesce(v_revision, 0);
  if v_revision <> p_expected_revision then raise exception 'delivery match revision conflict'; end if;
  v_revision := v_revision + 1;

  begin
    insert into public.delivery_match_overlays(delivery_id, owner_id, decision, transaction_id, revision)
      values (p_delivery_id, v_owner, p_decision, p_transaction_id, v_revision)
    on conflict (delivery_id) do update set decision = excluded.decision,
      transaction_id = excluded.transaction_id, revision = excluded.revision, updated_at = now();
  exception when unique_violation then
    raise exception 'ledger row already claimed by another delivery';
  end;

  select to_jsonb(o) into v_snapshot from public.delivery_match_overlays o
    where o.delivery_id = p_delivery_id and o.owner_id = v_owner;
  insert into public.delivery_match_revisions(owner_id, delivery_id, revision, snapshot, changed_by)
    values (v_owner, p_delivery_id, v_revision, v_snapshot, v_owner);
  insert into public.audit_events(owner_id, actor_id, event_type, entity_type, entity_id, detail)
    values (v_owner, v_owner, 'delivery.match.' || p_decision, 'delivery', p_delivery_id,
      jsonb_build_object('revision', v_revision, 'decision', p_decision));
  update public.mutation_sequences set sequence = sequence + 1, updated_at = now() where owner_id = v_owner;

  return v_snapshot;
end;
$$;
revoke all on function public.set_delivery_match(uuid,integer,text,uuid) from public, anon;
grant execute on function public.set_delivery_match(uuid,integer,text,uuid) to authenticated;

alter table public.restore_runs
  drop constraint if exists restore_runs_schema_version_check,
  add constraint restore_runs_schema_version_check check (schema_version in (1,2,3,4,5,6,7,8,9,10,11,12,13));

alter table public.restore_chunks
  drop constraint if exists restore_chunks_v2_binding,
  add constraint restore_chunks_v2_binding check (
    chunk_kind is null or (
      chunk_kind in ('accounts','categories','import_artifacts','import_batches','source_transactions',
        'source_components','import_batch_rows','transaction_overlays','overlay_revisions','audit_events',
        'mutation_sequences','slips','slip_match_overlays','slip_match_revisions',
        'cash_entries','cash_entry_overlays','cash_entry_revisions',
        'slip_correction_overlays','slip_correction_revisions','notification_cards',
        'notification_card_correction_overlays','notification_card_correction_revisions',
        'notification_card_decision_overlays','notification_card_decision_revisions',
        'receipts','receipt_items','receipt_discounts',
        'receipt_match_overlays','receipt_match_revisions',
        'deliveries','delivery_items','delivery_adjustments',
        'delivery_match_overlays','delivery_match_revisions',
        'rides','ride_adjustments','ride_match_overlays','ride_match_revisions',
        'lineman_order_details')
      and row_count >= 0 and chunk_digest ~ '^[a-f0-9]{64}$'
    )
  );

create or replace function public.export_backup_snapshot()
returns jsonb language plpgsql security definer set search_path=public,private,pg_temp
as $$
declare v_owner uuid:=auth.uid(); v_at timestamptz:=clock_timestamp(); v_sequence bigint; v_data jsonb; v_counts jsonb;
begin
  if not private.has_strong_owner_access(v_owner) then raise exception 'strong owner access required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_owner::text||':ledger-mutation',0));
  select sequence into v_sequence from public.mutation_sequences where owner_id=v_owner;
  v_data:=jsonb_build_object(
    'accounts',(select coalesce(jsonb_agg(to_jsonb(x) order by id),'[]') from (select * from public.accounts where owner_id=v_owner) x),
    'categories',(select coalesce(jsonb_agg(to_jsonb(x) order by id),'[]') from (select * from public.categories where owner_id=v_owner) x),
    'import_artifacts',(select coalesce(jsonb_agg(to_jsonb(x) order by id),'[]') from (select * from public.import_artifacts where owner_id=v_owner) x),
    'import_batches',(select coalesce(jsonb_agg(to_jsonb(x)-'opening_balance_minor'-'closing_balance_minor'||jsonb_build_object('opening_balance_minor',opening_balance_minor::text,'closing_balance_minor',closing_balance_minor::text) order by id),'[]') from public.import_batches x where owner_id=v_owner),
    'source_transactions',(select coalesce(jsonb_agg(to_jsonb(x)-'post_balance_minor'||jsonb_build_object('post_balance_minor',post_balance_minor::text) order by id),'[]') from public.source_transactions x where owner_id=v_owner),
    'source_components',(select coalesce(jsonb_agg(to_jsonb(x)-'amount_minor'||jsonb_build_object('amount_minor',amount_minor::text) order by transaction_id,position),'[]') from public.source_components x where owner_id=v_owner),
    'import_batch_rows',(select coalesce(jsonb_agg(to_jsonb(x) order by batch_id,source_index),'[]') from public.import_batch_rows x where owner_id=v_owner),
    'transaction_overlays',(select coalesce(jsonb_agg(to_jsonb(x) order by transaction_id),'[]') from public.transaction_overlays x where owner_id=v_owner),
    'overlay_revisions',(select coalesce(jsonb_agg(to_jsonb(x) order by transaction_id,revision),'[]') from public.overlay_revisions x where owner_id=v_owner),
    'audit_events',(select coalesce(jsonb_agg(to_jsonb(x)-'id'||jsonb_build_object('id',id::text) order by id),'[]') from public.audit_events x where owner_id=v_owner),
    'mutation_sequences',(select coalesce(jsonb_agg(to_jsonb(x)-'sequence'-'last_exported_sequence'||jsonb_build_object('sequence',sequence::text,'last_exported_sequence',last_exported_sequence::text) order by owner_id),'[]') from public.mutation_sequences x where owner_id=v_owner),
    'slips',(select coalesce(jsonb_agg(to_jsonb(x)-'amount_minor'||jsonb_build_object('amount_minor',amount_minor::text) order by id),'[]') from public.slips x where owner_id=v_owner),
    'slip_match_overlays',(select coalesce(jsonb_agg(to_jsonb(x) order by slip_id),'[]') from public.slip_match_overlays x where owner_id=v_owner),
    'slip_match_revisions',(select coalesce(jsonb_agg(to_jsonb(x) order by slip_id,revision),'[]') from public.slip_match_revisions x where owner_id=v_owner),
    'cash_entries',(select coalesce(jsonb_agg(to_jsonb(x)-'amount_minor'||jsonb_build_object('amount_minor',amount_minor::text) order by id),'[]') from public.cash_entries x where owner_id=v_owner),
    'cash_entry_overlays',(select coalesce(jsonb_agg(case when amount_minor is null then to_jsonb(x)
      else to_jsonb(x)-'amount_minor'||jsonb_build_object('amount_minor',amount_minor::text) end order by cash_entry_id),'[]') from public.cash_entry_overlays x where owner_id=v_owner),
    'cash_entry_revisions',(select coalesce(jsonb_agg(to_jsonb(x) order by cash_entry_id,revision),'[]') from public.cash_entry_revisions x where owner_id=v_owner),
    'slip_correction_overlays',(select coalesce(jsonb_agg(case when amount_minor is null then to_jsonb(x)
      else to_jsonb(x)-'amount_minor'||jsonb_build_object('amount_minor',amount_minor::text) end order by slip_id),'[]') from public.slip_correction_overlays x where owner_id=v_owner),
    'slip_correction_revisions',(select coalesce(jsonb_agg(to_jsonb(x) order by slip_id,revision),'[]') from public.slip_correction_revisions x where owner_id=v_owner),
    'notification_cards',(select coalesce(jsonb_agg(to_jsonb(x)-'amount_minor'-'balance_minor'
      ||jsonb_build_object('amount_minor',amount_minor::text,'balance_minor',balance_minor::text) order by id),'[]')
      from public.notification_cards x where owner_id=v_owner),
    'notification_card_correction_overlays',(select coalesce(jsonb_agg(
      to_jsonb(x)-'amount_minor'-'balance_minor'
        ||case when amount_minor is null then jsonb_build_object('amount_minor',null) else jsonb_build_object('amount_minor',amount_minor::text) end
        ||case when balance_minor is null then jsonb_build_object('balance_minor',null) else jsonb_build_object('balance_minor',balance_minor::text) end
      order by card_id),'[]') from public.notification_card_correction_overlays x where owner_id=v_owner),
    'notification_card_correction_revisions',(select coalesce(jsonb_agg(to_jsonb(x) order by card_id,revision),'[]') from public.notification_card_correction_revisions x where owner_id=v_owner),
    'notification_card_decision_overlays',(select coalesce(jsonb_agg(to_jsonb(x) order by card_id),'[]') from public.notification_card_decision_overlays x where owner_id=v_owner),
    'notification_card_decision_revisions',(select coalesce(jsonb_agg(to_jsonb(x) order by card_id,revision),'[]') from public.notification_card_decision_revisions x where owner_id=v_owner),
    -- Five nullable money columns plus the one not-null (`net_minor`). Each is stringified only
    -- when present, the same shape every nullable money column above uses, applied five times
    -- because a receipt carries that many.
    'receipts',(select coalesce(jsonb_agg(
      to_jsonb(x)-'subtotal_minor'-'net_minor'-'vat_pre_minor'-'vat_minor'-'vat_total_minor'
        ||jsonb_build_object('net_minor',net_minor::text)
        ||case when subtotal_minor is null then jsonb_build_object('subtotal_minor',null) else jsonb_build_object('subtotal_minor',subtotal_minor::text) end
        ||case when vat_pre_minor is null then jsonb_build_object('vat_pre_minor',null) else jsonb_build_object('vat_pre_minor',vat_pre_minor::text) end
        ||case when vat_minor is null then jsonb_build_object('vat_minor',null) else jsonb_build_object('vat_minor',vat_minor::text) end
        ||case when vat_total_minor is null then jsonb_build_object('vat_total_minor',null) else jsonb_build_object('vat_total_minor',vat_total_minor::text) end
      order by id),'[]') from public.receipts x where owner_id=v_owner),
    'receipt_items',(select coalesce(jsonb_agg(
      to_jsonb(x)-'unit_price_minor'-'amount_minor'
        ||jsonb_build_object('amount_minor',amount_minor::text)
        ||case when unit_price_minor is null then jsonb_build_object('unit_price_minor',null) else jsonb_build_object('unit_price_minor',unit_price_minor::text) end
      order by receipt_id,position),'[]') from public.receipt_items x where owner_id=v_owner),
    'receipt_discounts',(select coalesce(jsonb_agg(to_jsonb(x)-'amount_minor'||jsonb_build_object('amount_minor',amount_minor::text) order by receipt_id,position),'[]') from public.receipt_discounts x where owner_id=v_owner),
    'receipt_match_overlays',(select coalesce(jsonb_agg(to_jsonb(x) order by receipt_id),'[]') from public.receipt_match_overlays x where owner_id=v_owner),
    'receipt_match_revisions',(select coalesce(jsonb_agg(to_jsonb(x) order by receipt_id,revision),'[]') from public.receipt_match_revisions x where owner_id=v_owner),
    'deliveries',(select coalesce(jsonb_agg(
      to_jsonb(x)-'food_minor'-'delivery_fee_minor'-'total_minor'
        ||jsonb_build_object('food_minor',food_minor::text,'total_minor',total_minor::text)
        ||case when delivery_fee_minor is null then jsonb_build_object('delivery_fee_minor',null) else jsonb_build_object('delivery_fee_minor',delivery_fee_minor::text) end
      order by id),'[]') from public.deliveries x where owner_id=v_owner),
    'delivery_items',(select coalesce(jsonb_agg(to_jsonb(x)-'amount_minor'||jsonb_build_object('amount_minor',amount_minor::text) order by delivery_id,position),'[]') from public.delivery_items x where owner_id=v_owner),
    'delivery_adjustments',(select coalesce(jsonb_agg(to_jsonb(x)-'amount_minor'||jsonb_build_object('amount_minor',amount_minor::text) order by delivery_id,position),'[]') from public.delivery_adjustments x where owner_id=v_owner),
    'delivery_match_overlays',(select coalesce(jsonb_agg(to_jsonb(x) order by delivery_id),'[]') from public.delivery_match_overlays x where owner_id=v_owner),
    'delivery_match_revisions',(select coalesce(jsonb_agg(to_jsonb(x) order by delivery_id,revision),'[]') from public.delivery_match_revisions x where owner_id=v_owner),
    'rides',(select coalesce(jsonb_agg(
      to_jsonb(x)-'fare_minor'-'platform_fee_minor'-'total_minor'
        ||jsonb_build_object('fare_minor',fare_minor::text,'platform_fee_minor',platform_fee_minor::text,'total_minor',total_minor::text)
      order by id),'[]') from public.rides x where owner_id=v_owner),
    'ride_adjustments',(select coalesce(jsonb_agg(to_jsonb(x)-'amount_minor'||jsonb_build_object('amount_minor',amount_minor::text) order by ride_id,position),'[]') from public.ride_adjustments x where owner_id=v_owner),
    'ride_match_overlays',(select coalesce(jsonb_agg(to_jsonb(x) order by ride_id),'[]') from public.ride_match_overlays x where owner_id=v_owner),
    'ride_match_revisions',(select coalesce(jsonb_agg(to_jsonb(x) order by ride_id,revision),'[]') from public.ride_match_revisions x where owner_id=v_owner),
    'lineman_order_details',(select coalesce(jsonb_agg(to_jsonb(x)-'charged_minor'||jsonb_build_object('charged_minor',charged_minor::text) order by delivery_id),'[]') from public.lineman_order_details x where owner_id=v_owner)
  );
  select jsonb_object_agg(key,jsonb_array_length(value)) into v_counts from jsonb_each(v_data);
  return jsonb_build_object('schemaVersion',13,'exportedAt',to_char(v_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'snapshotSequence',v_sequence::text,'tableCounts',v_counts,'data',v_data);
end;
$$;
revoke all on function public.export_backup_snapshot() from public,anon;
grant execute on function public.export_backup_snapshot() to authenticated;

-- The kind list is built up by version, so a fourteenth version adds one line and strands nothing.
create or replace function public.restore_backup(p_action text,p_request jsonb)
returns jsonb language plpgsql security definer set search_path=public,private,pg_temp
as $$
declare
 v_owner uuid:=auth.uid(); v_restore uuid; v_idempotency uuid; v_digest text;
 v_run public.restore_runs%rowtype; v_descriptor jsonb; v_chunk record; v_row jsonb;
 v_index integer; v_kind text; v_count integer; v_chunk_digest text; v_manifest jsonb; v_payload jsonb;
 v_base_kinds text[]:=array['accounts','categories','import_artifacts','import_batches','source_transactions',
  'source_components','import_batch_rows','transaction_overlays','overlay_revisions','audit_events','mutation_sequences'];
 v_expected_kinds text[]; v_kind_count integer; v_schema integer; v_schema_text text;
 v_restored_sequence bigint;
begin
 if not private.has_strong_owner_access(v_owner) then raise exception 'strong owner access required'; end if;
 begin
  v_restore:=(p_request->>'restoreId')::uuid; v_idempotency:=(p_request->>'idempotencyKey')::uuid; v_digest:=p_request->>'digest';
 exception when others then raise exception 'invalid restore contract'; end;
 v_schema_text:=p_request->>'schemaVersion';
 if v_schema_text not in ('2','3','4','5','6','7','8','9','10','11','12','13') or v_digest!~'^[a-f0-9]{64}$' then raise exception 'invalid restore contract'; end if;
 v_schema:=v_schema_text::integer;
 v_expected_kinds:=v_base_kinds;
 if v_schema>=3 then v_expected_kinds:=v_expected_kinds||array['slips']; end if;
 if v_schema>=4 then v_expected_kinds:=v_expected_kinds||array['slip_match_overlays','slip_match_revisions']; end if;
 if v_schema>=5 then v_expected_kinds:=v_expected_kinds||array['cash_entries','cash_entry_overlays','cash_entry_revisions','slip_correction_overlays','slip_correction_revisions']; end if;
 if v_schema>=6 then v_expected_kinds:=v_expected_kinds||array['notification_cards']; end if;
 if v_schema>=7 then v_expected_kinds:=v_expected_kinds||array['notification_card_correction_overlays','notification_card_correction_revisions','notification_card_decision_overlays','notification_card_decision_revisions']; end if;
 if v_schema>=8 then v_expected_kinds:=v_expected_kinds||array['receipts','receipt_items','receipt_discounts']; end if;
 if v_schema>=9 then v_expected_kinds:=v_expected_kinds||array['receipt_match_overlays','receipt_match_revisions']; end if;
 if v_schema>=10 then v_expected_kinds:=v_expected_kinds||array['deliveries','delivery_items','delivery_adjustments']; end if;
 if v_schema>=11 then v_expected_kinds:=v_expected_kinds||array['delivery_match_overlays','delivery_match_revisions']; end if;
 if v_schema>=12 then v_expected_kinds:=v_expected_kinds||array['rides','ride_adjustments','ride_match_overlays','ride_match_revisions']; end if;
 if v_schema>=13 then v_expected_kinds:=v_expected_kinds||array['lineman_order_details']; end if;
 v_kind_count:=array_length(v_expected_kinds,1);
 perform pg_advisory_xact_lock(hashtextextended(v_owner::text||':ledger-mutation',0));
  if p_action='stage' then
   v_manifest:=p_request->'manifest';
   if jsonb_typeof(v_manifest) is distinct from 'object'
     or jsonb_typeof(v_manifest->'payloadDigest') is distinct from 'string'
     or v_manifest->>'payloadDigest' is distinct from v_digest
     or jsonb_typeof(v_manifest->'snapshotSequence') is distinct from 'string'
     or not private.is_canonical_int64_text(v_manifest->>'snapshotSequence',true)
     or (v_manifest->>'snapshotSequence')::numeric >= 9223372036854775807
     or jsonb_typeof(v_manifest->'exportedAt') is distinct from 'string'
     or jsonb_typeof(v_manifest->'chunks') is distinct from 'array'
     or jsonb_array_length(v_manifest->'chunks')<>v_kind_count
     or jsonb_typeof(v_manifest->'tableCounts') is distinct from 'object'
     or (select count(*) from jsonb_object_keys(v_manifest->'tableCounts'))<>v_kind_count
     or (v_manifest->>'exportedAt')::timestamptz is null then raise exception 'invalid restore manifest'; end if;
  for v_index in 0..v_kind_count-1 loop
   v_descriptor:=v_manifest->'chunks'->v_index;
   v_kind:=v_expected_kinds[v_index+1];
    if jsonb_typeof(v_descriptor) is distinct from 'object'
      or (select count(*) from jsonb_object_keys(v_descriptor))<>4
      or not (v_manifest->'tableCounts' ? v_kind)
      or jsonb_typeof(v_manifest#>array['tableCounts',v_kind]) is distinct from 'number'
      or jsonb_typeof(v_descriptor->'index') is distinct from 'number'
      or jsonb_typeof(v_descriptor->'rowCount') is distinct from 'number'
      or (v_manifest#>>array['tableCounts',v_kind]) !~ '^(0|[1-9][0-9]*)$'
      or (v_descriptor->>'rowCount') !~ '^(0|[1-9][0-9]*)$'
      or (v_descriptor->>'index')::integer is distinct from v_index
      or v_descriptor->>'kind' is distinct from v_kind
      or (v_descriptor->>'rowCount')::integer<0
      or v_descriptor->>'sha256' is null or v_descriptor->>'sha256'!~'^[a-f0-9]{64}$'
      or (v_manifest#>>array['tableCounts',v_kind])::integer is distinct from (v_descriptor->>'rowCount')::integer
      or (v_kind='mutation_sequences' and (v_descriptor->>'rowCount')::integer<>1)
      then raise exception 'invalid restore manifest descriptor'; end if;
  end loop;
  select * into v_run from public.restore_runs where owner_id=v_owner and idempotency_key=v_idempotency;
  if v_run.id is not null then
   if v_run.id<>v_restore or v_run.payload_digest<>v_digest or v_run.manifest<>v_manifest
     or v_run.schema_version is distinct from v_schema then raise exception 'restore idempotency conflict'; end if;
   return to_jsonb(v_run);
  end if;
  insert into public.restore_runs(id,owner_id,idempotency_key,schema_version,payload_digest,status,manifest,snapshot_sequence)
   values(v_restore,v_owner,v_idempotency,v_schema,v_digest,'staged',v_manifest,(v_manifest->>'snapshotSequence')::bigint) returning * into v_run;
  return to_jsonb(v_run);
 end if;
  select * into v_run from public.restore_runs where id=v_restore and owner_id=v_owner for update;
  if v_run.id is null or v_run.schema_version is distinct from v_schema
    or v_run.idempotency_key is distinct from v_idempotency
    or v_run.payload_digest is distinct from v_digest then raise exception 'restore session not found'; end if;
  if p_action='abort' then
   if v_run.status='applied' then return to_jsonb(v_run); end if;
   if v_run.status<>'staged' then raise exception 'restore is not staged'; end if;
   delete from public.restore_chunks where restore_id=v_restore and owner_id=v_owner;
   update public.restore_runs set status='aborted' where id=v_restore returning * into v_run; return to_jsonb(v_run);
 elsif p_action='chunk' then
  if v_run.status<>'staged' or jsonb_typeof(p_request->'chunk')<>'object'
    or jsonb_typeof(p_request#>'{chunk,rows}')<>'array' then raise exception 'restore is not accepting chunks'; end if;
  v_index:=(p_request->>'chunkIndex')::integer; v_kind:=p_request#>>'{chunk,kind}'; v_chunk_digest:=p_request->>'chunkDigest';
   if v_index not between 0 and v_kind_count-1 or v_kind is distinct from v_expected_kinds[v_index+1] then raise exception 'restore chunk ordering mismatch'; end if;
   v_descriptor:=v_run.manifest->'chunks'->v_index;
   v_count:=jsonb_array_length(p_request#>'{chunk,rows}');
   if v_kind is distinct from v_descriptor->>'kind'
     or v_count is distinct from (v_descriptor->>'rowCount')::integer
     or v_chunk_digest is distinct from v_descriptor->>'sha256'
     or private.sha256_jsonb(p_request->'chunk') is distinct from v_chunk_digest
     then raise exception 'restore chunk binding mismatch'; end if;
   if v_kind='mutation_sequences' then
    v_row:=p_request#>'{chunk,rows,0}';
    if v_count<>1
      or jsonb_typeof(v_row->'sequence') is distinct from 'string'
      or jsonb_typeof(v_row->'last_exported_sequence') is distinct from 'string'
      or not private.is_canonical_int64_text(v_row->>'sequence',true)
      or not private.is_canonical_int64_text(v_row->>'last_exported_sequence',true)
      or (v_row->>'sequence')::bigint is distinct from v_run.snapshot_sequence
      or (v_row->>'last_exported_sequence')::bigint>(v_row->>'sequence')::bigint
      then raise exception 'restore mutation sequence mismatch'; end if;
   end if;
  if exists(select 1 from public.restore_chunks where restore_id=v_restore and chunk_index=v_index
    and (chunk<>p_request->'chunk' or chunk_digest<>v_chunk_digest)) then raise exception 'restore chunk overwrite rejected'; end if;
  insert into public.restore_chunks(owner_id,restore_id,chunk_index,chunk,chunk_kind,row_count,chunk_digest)
   values(v_owner,v_restore,v_index,p_request->'chunk',v_kind,v_count,v_chunk_digest) on conflict(restore_id,chunk_index) do nothing;
  return jsonb_build_object('id',v_restore,'status','staged','chunkIndex',v_index);
 elsif p_action<>'commit' then raise exception 'unknown restore action'; end if;
 if v_run.status='applied' then return to_jsonb(v_run); end if;
 if v_run.status<>'staged' then raise exception 'restore is not staged'; end if;
  if exists(select 1 from public.accounts where owner_id=v_owner)
    or exists(select 1 from public.import_artifacts where owner_id=v_owner)
    or exists(select 1 from public.import_batches where owner_id=v_owner)
    or exists(select 1 from public.source_transactions where owner_id=v_owner)
    or exists(select 1 from public.source_components where owner_id=v_owner)
    or exists(select 1 from public.import_batch_rows where owner_id=v_owner)
    or exists(select 1 from public.transaction_overlays where owner_id=v_owner)
    or exists(select 1 from public.overlay_revisions where owner_id=v_owner)
    or exists(select 1 from public.audit_events where owner_id=v_owner)
    or exists(select 1 from public.slips where owner_id=v_owner)
    or exists(select 1 from public.slip_match_overlays where owner_id=v_owner)
    or exists(select 1 from public.slip_match_revisions where owner_id=v_owner)
    or exists(select 1 from public.cash_entries where owner_id=v_owner)
    or exists(select 1 from public.cash_entry_overlays where owner_id=v_owner)
    or exists(select 1 from public.cash_entry_revisions where owner_id=v_owner)
    or exists(select 1 from public.slip_correction_overlays where owner_id=v_owner)
    or exists(select 1 from public.slip_correction_revisions where owner_id=v_owner)
    or exists(select 1 from public.notification_cards where owner_id=v_owner)
    or exists(select 1 from public.notification_card_correction_overlays where owner_id=v_owner)
    or exists(select 1 from public.notification_card_correction_revisions where owner_id=v_owner)
    or exists(select 1 from public.notification_card_decision_overlays where owner_id=v_owner)
    or exists(select 1 from public.notification_card_decision_revisions where owner_id=v_owner)
    or exists(select 1 from public.receipts where owner_id=v_owner)
    or exists(select 1 from public.receipt_items where owner_id=v_owner)
    or exists(select 1 from public.receipt_discounts where owner_id=v_owner)
    or exists(select 1 from public.receipt_match_overlays where owner_id=v_owner)
    or exists(select 1 from public.receipt_match_revisions where owner_id=v_owner)
    or exists(select 1 from public.deliveries where owner_id=v_owner)
    or exists(select 1 from public.delivery_items where owner_id=v_owner)
    or exists(select 1 from public.delivery_adjustments where owner_id=v_owner)
    or exists(select 1 from public.delivery_match_overlays where owner_id=v_owner)
    or exists(select 1 from public.delivery_match_revisions where owner_id=v_owner)
    or exists(select 1 from public.rides where owner_id=v_owner)
    or exists(select 1 from public.ride_adjustments where owner_id=v_owner)
    or exists(select 1 from public.ride_match_overlays where owner_id=v_owner)
    or exists(select 1 from public.ride_match_revisions where owner_id=v_owner)
    or exists(select 1 from public.lineman_order_details where owner_id=v_owner)
    then raise exception 'restore destination ledger is not empty'; end if;
 if (select count(*) from public.restore_chunks where restore_id=v_restore and owner_id=v_owner)<>v_kind_count then raise exception 'restore chunks incomplete'; end if;
 v_payload:=jsonb_build_object('schemaVersion',v_schema,'exportedAt',v_run.manifest->'exportedAt',
   'snapshotSequence',v_run.manifest->'snapshotSequence','tableCounts',v_run.manifest->'tableCounts','data','{}'::jsonb);
 for v_index in 0..v_kind_count-1 loop
  select * into v_chunk from public.restore_chunks where restore_id=v_restore and owner_id=v_owner and chunk_index=v_index;
  v_descriptor:=v_run.manifest->'chunks'->v_index;
   if v_chunk.chunk_kind is distinct from v_expected_kinds[v_index+1]
     or v_chunk.row_count is distinct from jsonb_array_length(v_chunk.chunk->'rows')
     or v_chunk.chunk_digest is distinct from private.sha256_jsonb(v_chunk.chunk)
     or v_chunk.chunk_digest is distinct from v_descriptor->>'sha256'
     then raise exception 'restore chunk altered'; end if;
  v_payload:=jsonb_set(v_payload,array['data',v_chunk.chunk_kind],v_chunk.chunk->'rows',true);
 end loop;
 if private.sha256_jsonb(v_payload)<>v_run.payload_digest then raise exception 'restore aggregate digest mismatch'; end if;
 delete from public.categories where owner_id=v_owner;
 for v_chunk in select * from public.restore_chunks where restore_id=v_restore and owner_id=v_owner order by chunk_index loop
  for v_row in select value from jsonb_array_elements(v_chunk.chunk->'rows') loop
   case v_chunk.chunk_kind
   when 'accounts' then insert into public.accounts(id,owner_id,bank_code,label,account_type,last_four,currency,timezone,created_at)
    values((v_row->>'id')::uuid,v_owner,v_row->>'bank_code',v_row->>'label',v_row->>'account_type',v_row->>'last_four',v_row->>'currency',v_row->>'timezone',(v_row->>'created_at')::timestamptz);
   when 'categories' then insert into public.categories(id,owner_id,name,archived,created_at,updated_at)
    values((v_row->>'id')::uuid,v_owner,v_row->>'name',(v_row->>'archived')::boolean,(v_row->>'created_at')::timestamptz,(v_row->>'updated_at')::timestamptz);
   when 'import_artifacts' then insert into public.import_artifacts(id,owner_id,artifact_digest,contract_version,created_at)
    values((v_row->>'id')::uuid,v_owner,v_row->>'artifact_digest',v_row->>'contract_version',(v_row->>'created_at')::timestamptz);
    when 'import_batches' then
     if jsonb_typeof(v_row->'opening_balance_minor') is distinct from 'string'
       or jsonb_typeof(v_row->'closing_balance_minor') is distinct from 'string'
       or not private.is_canonical_int64_text(v_row->>'opening_balance_minor')
       or not private.is_canonical_int64_text(v_row->>'closing_balance_minor')
       then raise exception 'restore import-batch money must be canonical int64 text'; end if;
     insert into public.import_batches(id,owner_id,account_id,artifact_id,idempotency_key,payload_digest,status,confirmed_at,period_start,period_end,opening_balance_minor,closing_balance_minor,currency)
      values((v_row->>'id')::uuid,v_owner,(v_row->>'account_id')::uuid,(v_row->>'artifact_id')::uuid,(v_row->>'idempotency_key')::uuid,v_row->>'payload_digest',v_row->>'status',(v_row->>'confirmed_at')::timestamptz,
        (v_row->>'period_start')::date,(v_row->>'period_end')::date,(v_row->>'opening_balance_minor')::bigint,(v_row->>'closing_balance_minor')::bigint,v_row->>'currency');
    when 'source_transactions' then
     if jsonb_typeof(v_row->'post_balance_minor') is distinct from 'string'
       or not private.is_canonical_int64_text(v_row->>'post_balance_minor')
       then raise exception 'restore transaction money must be canonical int64 text'; end if;
     insert into public.source_transactions(id,owner_id,account_id,fingerprint_version,fingerprint,source_date,source_time,effective_date,transaction_label,description,reference,branch,post_balance_minor,currency,created_at)
      values((v_row->>'id')::uuid,v_owner,(v_row->>'account_id')::uuid,v_row->>'fingerprint_version',v_row->>'fingerprint',(v_row->>'source_date')::date,nullif(v_row->>'source_time','')::time,(v_row->>'effective_date')::date,v_row->>'transaction_label',v_row->>'description',v_row->>'reference',v_row->>'branch',(v_row->>'post_balance_minor')::bigint,v_row->>'currency',(v_row->>'created_at')::timestamptz);
    when 'source_components' then
     if jsonb_typeof(v_row->'amount_minor') is distinct from 'string'
       or not private.is_canonical_int64_text(v_row->>'amount_minor')
       then raise exception 'restore component money must be canonical int64 text'; end if;
     insert into public.source_components(id,owner_id,transaction_id,position,kind,amount_minor,currency,created_at)
      values((v_row->>'id')::uuid,v_owner,(v_row->>'transaction_id')::uuid,(v_row->>'position')::smallint,v_row->>'kind',(v_row->>'amount_minor')::bigint,v_row->>'currency',(v_row->>'created_at')::timestamptz);
   when 'import_batch_rows' then insert into public.import_batch_rows(id,owner_id,batch_id,transaction_id,source_index,page,row_number,parser_fields,linked_existing)
    values((v_row->>'id')::uuid,v_owner,(v_row->>'batch_id')::uuid,(v_row->>'transaction_id')::uuid,(v_row->>'source_index')::integer,(v_row->>'page')::integer,(v_row->>'row_number')::integer,v_row->'parser_fields',(v_row->>'linked_existing')::boolean);
   when 'transaction_overlays' then insert into public.transaction_overlays(transaction_id,owner_id,category_id,description,counterparty,effective_date,note,include_in_reporting,revision,updated_at)
    values((v_row->>'transaction_id')::uuid,v_owner,nullif(v_row->>'category_id','')::uuid,v_row->>'description',v_row->>'counterparty',nullif(v_row->>'effective_date','')::date,v_row->>'note',(v_row->>'include_in_reporting')::boolean,(v_row->>'revision')::integer,(v_row->>'updated_at')::timestamptz);
   when 'overlay_revisions' then insert into public.overlay_revisions(id,owner_id,transaction_id,revision,snapshot,changed_at,changed_by)
    values((v_row->>'id')::uuid,v_owner,(v_row->>'transaction_id')::uuid,(v_row->>'revision')::integer,(v_row->'snapshot')||jsonb_build_object('owner_id',v_owner),(v_row->>'changed_at')::timestamptz,v_owner);
    when 'audit_events' then
     if jsonb_typeof(v_row->'id') is distinct from 'string'
       or not private.is_canonical_int64_text(v_row->>'id',true)
       then raise exception 'restore audit id must be canonical int64 text'; end if;
     insert into public.audit_events(id,owner_id,actor_id,event_type,entity_type,entity_id,detail,occurred_at) overriding system value
      values((v_row->>'id')::bigint,v_owner,v_owner,v_row->>'event_type',v_row->>'entity_type',(v_row->>'entity_id')::uuid,v_row->'detail',(v_row->>'occurred_at')::timestamptz);
    when 'slips' then
     if jsonb_typeof(v_row->'amount_minor') is distinct from 'string'
       or not private.is_canonical_int64_text(v_row->>'amount_minor')
       then raise exception 'restore slip money must be canonical int64 text'; end if;
     insert into public.slips(id,owner_id,bank_code,bank_qr_code,slip_reference,qr_payload,kind,amount_minor,currency,occurred_on,occurred_at_time,counterparty,category_id,note,captured_at)
      values((v_row->>'id')::uuid,v_owner,v_row->>'bank_code',v_row->>'bank_qr_code',v_row->>'slip_reference',v_row->>'qr_payload',v_row->>'kind',(v_row->>'amount_minor')::bigint,v_row->>'currency',
        (v_row->>'occurred_on')::date,nullif(v_row->>'occurred_at_time','')::time,v_row->>'counterparty',nullif(v_row->>'category_id','')::uuid,v_row->>'note',(v_row->>'captured_at')::timestamptz);
   when 'slip_match_overlays' then insert into public.slip_match_overlays(slip_id,owner_id,decision,transaction_id,revision,updated_at)
    values((v_row->>'slip_id')::uuid,v_owner,v_row->>'decision',nullif(v_row->>'transaction_id','')::uuid,(v_row->>'revision')::integer,(v_row->>'updated_at')::timestamptz);
   when 'slip_match_revisions' then insert into public.slip_match_revisions(id,owner_id,slip_id,revision,snapshot,changed_at,changed_by)
    values((v_row->>'id')::uuid,v_owner,(v_row->>'slip_id')::uuid,(v_row->>'revision')::integer,(v_row->'snapshot')||jsonb_build_object('owner_id',v_owner),(v_row->>'changed_at')::timestamptz,v_owner);
    when 'cash_entries' then
     if jsonb_typeof(v_row->'amount_minor') is distinct from 'string'
       or not private.is_canonical_int64_text(v_row->>'amount_minor')
       then raise exception 'restore cash entry money must be canonical int64 text'; end if;
     insert into public.cash_entries(id,owner_id,kind,amount_minor,currency,occurred_on,occurred_at_time,counterparty,category_id,note,created_at)
      values((v_row->>'id')::uuid,v_owner,v_row->>'kind',(v_row->>'amount_minor')::bigint,v_row->>'currency',(v_row->>'occurred_on')::date,
        nullif(v_row->>'occurred_at_time','')::time,v_row->>'counterparty',nullif(v_row->>'category_id','')::uuid,v_row->>'note',(v_row->>'created_at')::timestamptz);
    when 'cash_entry_overlays' then
     if v_row->'amount_minor' is not null and jsonb_typeof(v_row->'amount_minor') <> 'null' then
      if jsonb_typeof(v_row->'amount_minor') is distinct from 'string'
        or not private.is_canonical_int64_text(v_row->>'amount_minor')
        then raise exception 'restore cash correction money must be canonical int64 text'; end if;
     end if;
     insert into public.cash_entry_overlays(cash_entry_id,owner_id,kind,amount_minor,occurred_on,occurred_at_time,counterparty,category_id,note,revision,updated_at)
      values((v_row->>'cash_entry_id')::uuid,v_owner,v_row->>'kind',nullif(v_row->>'amount_minor','')::bigint,nullif(v_row->>'occurred_on','')::date,
        nullif(v_row->>'occurred_at_time','')::time,v_row->>'counterparty',nullif(v_row->>'category_id','')::uuid,v_row->>'note',(v_row->>'revision')::integer,(v_row->>'updated_at')::timestamptz);
   when 'cash_entry_revisions' then insert into public.cash_entry_revisions(id,owner_id,cash_entry_id,revision,snapshot,changed_at,changed_by)
    values((v_row->>'id')::uuid,v_owner,(v_row->>'cash_entry_id')::uuid,(v_row->>'revision')::integer,(v_row->'snapshot')||jsonb_build_object('owner_id',v_owner),(v_row->>'changed_at')::timestamptz,v_owner);
    when 'slip_correction_overlays' then
     if v_row->'amount_minor' is not null and jsonb_typeof(v_row->'amount_minor') <> 'null' then
      if jsonb_typeof(v_row->'amount_minor') is distinct from 'string'
        or not private.is_canonical_int64_text(v_row->>'amount_minor')
        then raise exception 'restore slip correction money must be canonical int64 text'; end if;
     end if;
     insert into public.slip_correction_overlays(slip_id,owner_id,kind,amount_minor,occurred_on,occurred_at_time,counterparty,category_id,note,revision,updated_at)
      values((v_row->>'slip_id')::uuid,v_owner,v_row->>'kind',nullif(v_row->>'amount_minor','')::bigint,nullif(v_row->>'occurred_on','')::date,
        nullif(v_row->>'occurred_at_time','')::time,v_row->>'counterparty',nullif(v_row->>'category_id','')::uuid,v_row->>'note',(v_row->>'revision')::integer,(v_row->>'updated_at')::timestamptz);
   when 'slip_correction_revisions' then insert into public.slip_correction_revisions(id,owner_id,slip_id,revision,snapshot,changed_at,changed_by)
    values((v_row->>'id')::uuid,v_owner,(v_row->>'slip_id')::uuid,(v_row->>'revision')::integer,(v_row->'snapshot')||jsonb_build_object('owner_id',v_owner),(v_row->>'changed_at')::timestamptz,v_owner);
    when 'notification_cards' then
     if jsonb_typeof(v_row->'amount_minor') is distinct from 'string'
       or not private.is_canonical_int64_text(v_row->>'amount_minor')
       or jsonb_typeof(v_row->'balance_minor') is distinct from 'string'
       or not private.is_canonical_int64_text(v_row->>'balance_minor')
       then raise exception 'restore notification card money must be canonical int64 text'; end if;
     insert into public.notification_cards(id,owner_id,account_id,channel,printed_account_digits,kind,amount_minor,currency,
       occurred_on,occurred_at_time,balance_minor,counterparty,category_id,note,fingerprint_version,fingerprint,captured_at)
      values((v_row->>'id')::uuid,v_owner,(v_row->>'account_id')::uuid,v_row->>'channel',v_row->>'printed_account_digits',v_row->>'kind',
        (v_row->>'amount_minor')::bigint,v_row->>'currency',(v_row->>'occurred_on')::date,(v_row->>'occurred_at_time')::time,
        (v_row->>'balance_minor')::bigint,v_row->>'counterparty',nullif(v_row->>'category_id','')::uuid,v_row->>'note',
        v_row->>'fingerprint_version',v_row->>'fingerprint',(v_row->>'captured_at')::timestamptz);
    when 'notification_card_correction_overlays' then
     if v_row->'amount_minor' is not null and jsonb_typeof(v_row->'amount_minor') <> 'null' then
      if jsonb_typeof(v_row->'amount_minor') is distinct from 'string'
        or not private.is_canonical_int64_text(v_row->>'amount_minor')
        then raise exception 'restore notification card correction money must be canonical int64 text'; end if;
     end if;
     if v_row->'balance_minor' is not null and jsonb_typeof(v_row->'balance_minor') <> 'null' then
      if jsonb_typeof(v_row->'balance_minor') is distinct from 'string'
        or not private.is_canonical_int64_text(v_row->>'balance_minor')
        then raise exception 'restore notification card correction money must be canonical int64 text'; end if;
     end if;
     insert into public.notification_card_correction_overlays(card_id,owner_id,kind,amount_minor,balance_minor,occurred_on,occurred_at_time,counterparty,category_id,note,revision,updated_at)
      values((v_row->>'card_id')::uuid,v_owner,v_row->>'kind',nullif(v_row->>'amount_minor','')::bigint,nullif(v_row->>'balance_minor','')::bigint,
        nullif(v_row->>'occurred_on','')::date,nullif(v_row->>'occurred_at_time','')::time,v_row->>'counterparty',
        nullif(v_row->>'category_id','')::uuid,v_row->>'note',(v_row->>'revision')::integer,(v_row->>'updated_at')::timestamptz);
   when 'notification_card_correction_revisions' then insert into public.notification_card_correction_revisions(id,owner_id,card_id,revision,snapshot,changed_at,changed_by)
    values((v_row->>'id')::uuid,v_owner,(v_row->>'card_id')::uuid,(v_row->>'revision')::integer,(v_row->'snapshot')||jsonb_build_object('owner_id',v_owner),(v_row->>'changed_at')::timestamptz,v_owner);
   when 'notification_card_decision_overlays' then insert into public.notification_card_decision_overlays(card_id,owner_id,decision,transaction_id,accepted_balance_mismatch,revision,updated_at)
    values((v_row->>'card_id')::uuid,v_owner,v_row->>'decision',nullif(v_row->>'transaction_id','')::uuid,(v_row->>'accepted_balance_mismatch')::boolean,(v_row->>'revision')::integer,(v_row->>'updated_at')::timestamptz);
   when 'notification_card_decision_revisions' then insert into public.notification_card_decision_revisions(id,owner_id,card_id,revision,snapshot,changed_at,changed_by)
    values((v_row->>'id')::uuid,v_owner,(v_row->>'card_id')::uuid,(v_row->>'revision')::integer,(v_row->'snapshot')||jsonb_build_object('owner_id',v_owner),(v_row->>'changed_at')::timestamptz,v_owner);
    when 'receipts' then
     -- `net_minor` is not nullable; the other four are, and each is checked only when present —
     -- the same shape the cash and notification-card correction overlays use for their own
     -- nullable money columns above.
     if jsonb_typeof(v_row->'net_minor') is distinct from 'string'
       or not private.is_canonical_int64_text(v_row->>'net_minor')
       then raise exception 'restore receipt money must be canonical int64 text'; end if;
     if v_row->'subtotal_minor' is not null and jsonb_typeof(v_row->'subtotal_minor') <> 'null' then
      if jsonb_typeof(v_row->'subtotal_minor') is distinct from 'string'
        or not private.is_canonical_int64_text(v_row->>'subtotal_minor')
        then raise exception 'restore receipt money must be canonical int64 text'; end if;
     end if;
     if v_row->'vat_pre_minor' is not null and jsonb_typeof(v_row->'vat_pre_minor') <> 'null' then
      if jsonb_typeof(v_row->'vat_pre_minor') is distinct from 'string'
        or not private.is_canonical_int64_text(v_row->>'vat_pre_minor')
        then raise exception 'restore receipt money must be canonical int64 text'; end if;
     end if;
     if v_row->'vat_minor' is not null and jsonb_typeof(v_row->'vat_minor') <> 'null' then
      if jsonb_typeof(v_row->'vat_minor') is distinct from 'string'
        or not private.is_canonical_int64_text(v_row->>'vat_minor')
        then raise exception 'restore receipt money must be canonical int64 text'; end if;
     end if;
     if v_row->'vat_total_minor' is not null and jsonb_typeof(v_row->'vat_total_minor') <> 'null' then
      if jsonb_typeof(v_row->'vat_total_minor') is distinct from 'string'
        or not private.is_canonical_int64_text(v_row->>'vat_total_minor')
        then raise exception 'restore receipt money must be canonical int64 text'; end if;
     end if;
     insert into public.receipts(id,owner_id,merchant,store_code,branch_name,receipt_number,purchased_on,
       purchased_at_time,payment_method,subtotal_minor,net_minor,unit_count,vat_pre_minor,vat_minor,
       vat_total_minor,vat_code,supersedes_receipt_number,completeness,failed_checks,inapplicable_checks,
       sources,items_source,items_complete,created_at,updated_at)
      values((v_row->>'id')::uuid,v_owner,v_row->>'merchant',v_row->>'store_code',v_row->>'branch_name',v_row->>'receipt_number',
        (v_row->>'purchased_on')::date,nullif(v_row->>'purchased_at_time','')::time,v_row->>'payment_method',
        nullif(v_row->>'subtotal_minor','')::bigint,(v_row->>'net_minor')::bigint,nullif(v_row->>'unit_count','')::integer,
        nullif(v_row->>'vat_pre_minor','')::bigint,nullif(v_row->>'vat_minor','')::bigint,nullif(v_row->>'vat_total_minor','')::bigint,
        v_row->>'vat_code',v_row->>'supersedes_receipt_number',v_row->>'completeness',
        (select coalesce(array_agg(value),'{}') from jsonb_array_elements_text(coalesce(v_row->'failed_checks','[]'::jsonb))),
        (select coalesce(array_agg(value),'{}') from jsonb_array_elements_text(coalesce(v_row->'inapplicable_checks','[]'::jsonb))),
        (select coalesce(array_agg(value),'{}') from jsonb_array_elements_text(coalesce(v_row->'sources','[]'::jsonb))),
        v_row->>'items_source',(v_row->>'items_complete')::boolean,(v_row->>'created_at')::timestamptz,(v_row->>'updated_at')::timestamptz);
    when 'receipt_items' then
     if jsonb_typeof(v_row->'amount_minor') is distinct from 'string'
       or not private.is_canonical_int64_text(v_row->>'amount_minor')
       then raise exception 'restore receipt item money must be canonical int64 text'; end if;
     if v_row->'unit_price_minor' is not null and jsonb_typeof(v_row->'unit_price_minor') <> 'null' then
      if jsonb_typeof(v_row->'unit_price_minor') is distinct from 'string'
        or not private.is_canonical_int64_text(v_row->>'unit_price_minor')
        then raise exception 'restore receipt item money must be canonical int64 text'; end if;
     end if;
     insert into public.receipt_items(id,owner_id,receipt_id,line_no,position,quantity,name,display_name,
       unit_price_minor,amount_minor,vat_exempt,is_promotion)
      values((v_row->>'id')::uuid,v_owner,(v_row->>'receipt_id')::uuid,(v_row->>'line_no')::integer,(v_row->>'position')::integer,
        (v_row->>'quantity')::integer,v_row->>'name',v_row->>'display_name',nullif(v_row->>'unit_price_minor','')::bigint,
        (v_row->>'amount_minor')::bigint,(v_row->>'vat_exempt')::boolean,(v_row->>'is_promotion')::boolean);
    when 'receipt_discounts' then
     if jsonb_typeof(v_row->'amount_minor') is distinct from 'string'
       or not private.is_canonical_int64_text(v_row->>'amount_minor')
       then raise exception 'restore receipt discount money must be canonical int64 text'; end if;
     insert into public.receipt_discounts(id,owner_id,receipt_id,position,name,amount_minor)
      values((v_row->>'id')::uuid,v_owner,(v_row->>'receipt_id')::uuid,(v_row->>'position')::integer,v_row->>'name',(v_row->>'amount_minor')::bigint);
   when 'receipt_match_overlays' then insert into public.receipt_match_overlays(receipt_id,owner_id,decision,transaction_id,revision,updated_at)
    values((v_row->>'receipt_id')::uuid,v_owner,v_row->>'decision',nullif(v_row->>'transaction_id','')::uuid,(v_row->>'revision')::integer,(v_row->>'updated_at')::timestamptz);
   -- The snapshot carries an owner id; rebound like every other revisions table's (D-044).
   when 'receipt_match_revisions' then insert into public.receipt_match_revisions(id,owner_id,receipt_id,revision,snapshot,changed_at,changed_by)
    values((v_row->>'id')::uuid,v_owner,(v_row->>'receipt_id')::uuid,(v_row->>'revision')::integer,(v_row->'snapshot')||jsonb_build_object('owner_id',v_owner),(v_row->>'changed_at')::timestamptz,v_owner);
    when 'deliveries' then
     if jsonb_typeof(v_row->'food_minor') is distinct from 'string'
       or not private.is_canonical_int64_text(v_row->>'food_minor',true)
       or jsonb_typeof(v_row->'total_minor') is distinct from 'string'
       or not private.is_canonical_int64_text(v_row->>'total_minor',true)
       then raise exception 'restore delivery money must be canonical int64 text'; end if;
     if v_row->'delivery_fee_minor' is not null and jsonb_typeof(v_row->'delivery_fee_minor') <> 'null' then
      if jsonb_typeof(v_row->'delivery_fee_minor') is distinct from 'string'
        or not private.is_canonical_int64_text(v_row->>'delivery_fee_minor',true)
        then raise exception 'restore delivery money must be canonical int64 text'; end if;
     end if;
     insert into public.deliveries(id,owner_id,platform,booking_id,restaurant,payment_method,receipt_sent_at,
       food_minor,delivery_fee_minor,total_minor,created_at)
      values((v_row->>'id')::uuid,v_owner,v_row->>'platform',v_row->>'booking_id',v_row->>'restaurant',v_row->>'payment_method',
        (v_row->>'receipt_sent_at')::timestamptz,(v_row->>'food_minor')::bigint,nullif(v_row->>'delivery_fee_minor','')::bigint,
        (v_row->>'total_minor')::bigint,(v_row->>'created_at')::timestamptz);
    when 'delivery_items' then
     if jsonb_typeof(v_row->'amount_minor') is distinct from 'string'
       or not private.is_canonical_int64_text(v_row->>'amount_minor',true)
       then raise exception 'restore delivery item money must be canonical int64 text'; end if;
     insert into public.delivery_items(id,owner_id,delivery_id,position,quantity,name,options,amount_minor)
      values((v_row->>'id')::uuid,v_owner,(v_row->>'delivery_id')::uuid,(v_row->>'position')::integer,(v_row->>'quantity')::integer,
        v_row->>'name',(select coalesce(array_agg(value),'{}') from jsonb_array_elements_text(coalesce(v_row->'options','[]'::jsonb))),
        (v_row->>'amount_minor')::bigint);
    when 'delivery_adjustments' then
     if jsonb_typeof(v_row->'amount_minor') is distinct from 'string'
       or not private.is_canonical_int64_text(v_row->>'amount_minor',true)
       then raise exception 'restore delivery adjustment money must be canonical int64 text'; end if;
     insert into public.delivery_adjustments(id,owner_id,delivery_id,position,kind,name,amount_minor)
      values((v_row->>'id')::uuid,v_owner,(v_row->>'delivery_id')::uuid,(v_row->>'position')::integer,v_row->>'kind',v_row->>'name',(v_row->>'amount_minor')::bigint);
   when 'delivery_match_overlays' then insert into public.delivery_match_overlays(delivery_id,owner_id,decision,transaction_id,revision,updated_at)
    values((v_row->>'delivery_id')::uuid,v_owner,v_row->>'decision',nullif(v_row->>'transaction_id','')::uuid,(v_row->>'revision')::integer,(v_row->>'updated_at')::timestamptz);
   when 'delivery_match_revisions' then insert into public.delivery_match_revisions(id,owner_id,delivery_id,revision,snapshot,changed_at,changed_by)
    values((v_row->>'id')::uuid,v_owner,(v_row->>'delivery_id')::uuid,(v_row->>'revision')::integer,(v_row->'snapshot')||jsonb_build_object('owner_id',v_owner),(v_row->>'changed_at')::timestamptz,v_owner);
    when 'rides' then
     if jsonb_typeof(v_row->'fare_minor') is distinct from 'string'
       or not private.is_canonical_int64_text(v_row->>'fare_minor',true)
       or jsonb_typeof(v_row->'platform_fee_minor') is distinct from 'string'
       or not private.is_canonical_int64_text(v_row->>'platform_fee_minor',true)
       or jsonb_typeof(v_row->'total_minor') is distinct from 'string'
       or not private.is_canonical_int64_text(v_row->>'total_minor',true)
       then raise exception 'restore ride money must be canonical int64 text'; end if;
     insert into public.rides(id,owner_id,booking_id,ride_type,picked_up_at,dropped_off_at,pickup_place,dropoff_place,
       distance_meters,duration_minutes,payment_method,fare_minor,platform_fee_minor,total_minor,created_at)
      values((v_row->>'id')::uuid,v_owner,v_row->>'booking_id',v_row->>'ride_type',(v_row->>'picked_up_at')::timestamptz,
        (v_row->>'dropped_off_at')::timestamptz,v_row->>'pickup_place',v_row->>'dropoff_place',(v_row->>'distance_meters')::integer,
        (v_row->>'duration_minutes')::integer,v_row->>'payment_method',(v_row->>'fare_minor')::bigint,(v_row->>'platform_fee_minor')::bigint,
        (v_row->>'total_minor')::bigint,(v_row->>'created_at')::timestamptz);
    when 'ride_adjustments' then
     if jsonb_typeof(v_row->'amount_minor') is distinct from 'string'
       or not private.is_canonical_int64_text(v_row->>'amount_minor',true)
       then raise exception 'restore ride adjustment money must be canonical int64 text'; end if;
     insert into public.ride_adjustments(id,owner_id,ride_id,position,kind,name,amount_minor)
      values((v_row->>'id')::uuid,v_owner,(v_row->>'ride_id')::uuid,(v_row->>'position')::integer,v_row->>'kind',v_row->>'name',(v_row->>'amount_minor')::bigint);
   when 'ride_match_overlays' then insert into public.ride_match_overlays(ride_id,owner_id,decision,transaction_id,revision,updated_at)
    values((v_row->>'ride_id')::uuid,v_owner,v_row->>'decision',nullif(v_row->>'transaction_id','')::uuid,(v_row->>'revision')::integer,(v_row->>'updated_at')::timestamptz);
   when 'ride_match_revisions' then insert into public.ride_match_revisions(id,owner_id,ride_id,revision,snapshot,changed_at,changed_by)
    values((v_row->>'id')::uuid,v_owner,(v_row->>'ride_id')::uuid,(v_row->>'revision')::integer,(v_row->'snapshot')||jsonb_build_object('owner_id',v_owner),(v_row->>'changed_at')::timestamptz,v_owner);
    when 'lineman_order_details' then
     if jsonb_typeof(v_row->'charged_minor') is distinct from 'string'
       or not private.is_canonical_int64_text(v_row->>'charged_minor',true)
       then raise exception 'restore LINE MAN order money must be canonical int64 text'; end if;
     insert into public.lineman_order_details(delivery_id,owner_id,ordered_at,charged_minor)
      values((v_row->>'delivery_id')::uuid,v_owner,(v_row->>'ordered_at')::timestamptz,(v_row->>'charged_minor')::bigint);
    when 'mutation_sequences' then v_restored_sequence:=(v_row->>'sequence')::bigint;
   else raise exception 'unsupported restore chunk kind';
   end case;
  end loop;
 end loop;
 perform setval(pg_get_serial_sequence('public.audit_events','id'),greatest(coalesce((select max(id) from public.audit_events),1),1),true);
 update public.mutation_sequences set sequence=coalesce(v_restored_sequence,v_run.snapshot_sequence)+1,last_exported_sequence=0,updated_at=now() where owner_id=v_owner;
 update public.restore_runs set status='applied',applied_at=now() where id=v_restore returning * into v_run;
 return to_jsonb(v_run);
end;
$$;
revoke all on function public.restore_backup(text,jsonb) from public,anon;
grant execute on function public.restore_backup(text,jsonb) to authenticated;

commit;
