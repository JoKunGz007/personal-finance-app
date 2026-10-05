-- Migration 048 — category provenance, category reviews and one-level subcategories (D-245,
-- built from D-090; storage per D-097: new tables, no new columns).
--
-- ## Tables
--
-- `category_parents` links a category to its parent, one level only. Written only by
-- `set_category_parent` (audited, one sequence step). A parent has no parent, a category with
-- children takes none, both are owned, the parent is not archived.
--
-- `category_provenance` is append-only: one row for each overlay revision that changes
-- `category_id`, saying who chose it (`owner`, `rule`, `match`, `model`). A transaction's
-- effective source is its latest row; no row means none (a category set before this migration
-- reads as the owner's).
--
-- `category_reviews` is append-only: one row per provenance row the owner confirmed. Reviewed
-- means the latest provenance row has a review. Written by `review_transaction_category`.
--
-- ## Functions
--
-- `update_transaction_overlay` (the owner's editor) is copied unchanged from 004 and now also
-- records `owner` provenance when the category changes.
--
-- `apply_category_proposals` writes machine categories in one call (one lock, at most one
-- sequence step). It changes only `category_id` and `revision`, so every other overlay field —
-- including `include_in_reporting = false` written by `auto_exclude_internal_transfers` — is kept.
-- It never overwrites a category whose latest provenance is `owner` (a clear included), a set
-- category with no provenance (legacy), or a reviewed one, and may replace one machine source
-- with another.
--
-- `list_auto_excluded_transactions` (from 026) now keeps the "Auto-excluded" label across later
-- revisions that leave `include_in_reporting` false (a category write bumps the revision); any
-- later revision whose snapshot has it true (an owner's toggle) still drops the label.
--
-- `list_category_inputs` (end of this file) is the auto-categoriser's read-only input: every
-- transaction with its amount, description, reporting flag, category and latest provenance, plus
-- every category with its parent.
--
-- Backup v14: the three tables join export and restore (end of this file); a v13 file still restores.

begin;

create table public.category_parents (
  category_id uuid primary key,
  owner_id uuid not null references public.ledger_owners(owner_id),
  parent_id uuid not null,
  created_at timestamptz not null default now(),
  foreign key (category_id, owner_id) references public.categories(id, owner_id),
  foreign key (parent_id, owner_id) references public.categories(id, owner_id),
  check (category_id <> parent_id),
  unique (category_id, owner_id)
);
create index category_parents_owner_parent on public.category_parents(owner_id, parent_id);

create table public.category_provenance (
  owner_id uuid not null references public.ledger_owners(owner_id),
  transaction_id uuid not null,
  overlay_revision integer not null check (overlay_revision > 0),
  source text not null check (source in ('owner','rule','match','model')),
  detail jsonb not null default '{}'::jsonb check (jsonb_typeof(detail) = 'object'),
  created_at timestamptz not null default now(),
  primary key (transaction_id, overlay_revision),
  foreign key (transaction_id, owner_id) references public.source_transactions(id, owner_id),
  foreign key (transaction_id, overlay_revision) references public.overlay_revisions(transaction_id, revision),
  unique (transaction_id, overlay_revision, owner_id)
);
create index category_provenance_owner on public.category_provenance(owner_id, transaction_id);

create table public.category_reviews (
  owner_id uuid not null references public.ledger_owners(owner_id),
  transaction_id uuid not null,
  overlay_revision integer not null,
  created_at timestamptz not null default now(),
  primary key (transaction_id, overlay_revision),
  foreign key (transaction_id, overlay_revision, owner_id)
    references public.category_provenance(transaction_id, overlay_revision, owner_id)
);
create index category_reviews_owner on public.category_reviews(owner_id, transaction_id);

create trigger category_provenance_immutable before update or delete on public.category_provenance
  for each row execute function private.reject_change();
create trigger category_reviews_immutable before update or delete on public.category_reviews
  for each row execute function private.reject_change();

alter table public.category_parents enable row level security;
alter table public.category_parents force row level security;
alter table public.category_provenance enable row level security;
alter table public.category_provenance force row level security;
alter table public.category_reviews enable row level security;
alter table public.category_reviews force row level security;

create policy strong_owner_select on public.category_parents for select to authenticated
  using (private.has_strong_owner_access(owner_id));
create policy strong_owner_select on public.category_provenance for select to authenticated
  using (private.has_strong_owner_access(owner_id));
create policy strong_owner_select on public.category_reviews for select to authenticated
  using (private.has_strong_owner_access(owner_id));

revoke all on public.category_parents from public, anon;
revoke all on public.category_provenance from public, anon;
revoke all on public.category_reviews from public, anon;
grant select on public.category_parents to authenticated;
grant select on public.category_provenance to authenticated;
grant select on public.category_reviews to authenticated;
revoke insert, update, delete on public.category_parents from authenticated, anon;
revoke insert, update, delete on public.category_provenance from authenticated, anon;
revoke insert, update, delete on public.category_reviews from authenticated, anon;

-- Set or remove (p_parent_id null) a category's parent. Unchanged link: no write, no step.
create or replace function public.set_category_parent(p_category_id uuid, p_parent_id uuid)
returns jsonb language plpgsql security definer set search_path=public,private,pg_temp
as $$
declare v_owner uuid:=auth.uid(); v_current uuid; v_parent public.categories%rowtype;
begin
  if not private.has_strong_owner_access(v_owner) then raise exception 'strong owner access required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_owner::text||':ledger-mutation',0));
  if not exists(select 1 from public.categories where id=p_category_id and owner_id=v_owner) then
    raise exception 'category not owned';
  end if;
  select parent_id into v_current from public.category_parents where category_id=p_category_id and owner_id=v_owner for update;
  if p_parent_id is not distinct from v_current then
    return jsonb_build_object('category_id',p_category_id,'parent_id',v_current,'changed',false);
  end if;
  if p_parent_id is null then
    delete from public.category_parents where category_id=p_category_id and owner_id=v_owner;
  else
    if p_parent_id=p_category_id then raise exception 'category cannot be its own parent'; end if;
    select * into v_parent from public.categories where id=p_parent_id and owner_id=v_owner;
    if v_parent.id is null then raise exception 'parent category not owned'; end if;
    if v_parent.archived then raise exception 'parent category is archived'; end if;
    if exists(select 1 from public.category_parents where category_id=p_parent_id and owner_id=v_owner) then
      raise exception 'parent category already has a parent';
    end if;
    if exists(select 1 from public.category_parents where parent_id=p_category_id and owner_id=v_owner) then
      raise exception 'category has children';
    end if;
    insert into public.category_parents(category_id,owner_id,parent_id) values(p_category_id,v_owner,p_parent_id)
    on conflict(category_id) do update set parent_id=excluded.parent_id;
  end if;
  insert into public.audit_events(owner_id,actor_id,event_type,entity_type,entity_id,detail)
    values(v_owner,v_owner,'category.parent_set','category',p_category_id,jsonb_build_object('parent_id',p_parent_id));
  update public.mutation_sequences set sequence=sequence+1,updated_at=now() where owner_id=v_owner;
  return jsonb_build_object('category_id',p_category_id,'parent_id',p_parent_id,'changed',true);
end;
$$;
revoke all on function public.set_category_parent(uuid,uuid) from public,anon;
grant execute on function public.set_category_parent(uuid,uuid) to authenticated;

-- Confirm a machine category. Only the latest provenance row, never an `owner` one, and only while
-- a category is set. Reviewing twice writes nothing the second time.
create or replace function public.review_transaction_category(p_transaction_id uuid, p_overlay_revision integer)
returns jsonb language plpgsql security definer set search_path=public,private,pg_temp
as $$
declare v_owner uuid:=auth.uid(); v_latest public.category_provenance%rowtype; v_category uuid;
begin
  if not private.has_strong_owner_access(v_owner) then raise exception 'strong owner access required'; end if;
  if not exists(select 1 from public.source_transactions where id=p_transaction_id and owner_id=v_owner) then raise exception 'transaction not owned'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_owner::text||':ledger-mutation',0));
  select * into v_latest from public.category_provenance
    where transaction_id=p_transaction_id and owner_id=v_owner order by overlay_revision desc limit 1;
  if v_latest.transaction_id is null or v_latest.overlay_revision<>p_overlay_revision then
    raise exception 'not the latest category provenance';
  end if;
  if v_latest.source='owner' then raise exception 'owner category needs no review'; end if;
  select category_id into v_category from public.transaction_overlays where transaction_id=p_transaction_id and owner_id=v_owner;
  if v_category is null then raise exception 'no category to review'; end if;
  if exists(select 1 from public.category_reviews where transaction_id=p_transaction_id and overlay_revision=p_overlay_revision) then
    return jsonb_build_object('transaction_id',p_transaction_id,'overlay_revision',p_overlay_revision,'reviewed',true,'changed',false);
  end if;
  insert into public.category_reviews(owner_id,transaction_id,overlay_revision) values(v_owner,p_transaction_id,p_overlay_revision);
  insert into public.audit_events(owner_id,actor_id,event_type,entity_type,entity_id,detail)
    values(v_owner,v_owner,'category.reviewed','source_transaction',p_transaction_id,jsonb_build_object('overlay_revision',p_overlay_revision,'source',v_latest.source));
  update public.mutation_sequences set sequence=sequence+1,updated_at=now() where owner_id=v_owner;
  return jsonb_build_object('transaction_id',p_transaction_id,'overlay_revision',p_overlay_revision,'reviewed',true,'changed',true);
end;
$$;
revoke all on function public.review_transaction_category(uuid,integer) from public,anon;
grant execute on function public.review_transaction_category(uuid,integer) to authenticated;

-- Copied from 202607240004 unchanged, plus `owner` provenance when the category changes.
create or replace function public.update_transaction_overlay(p_transaction_id uuid,p_expected_revision integer,p_overlay jsonb)
returns jsonb language plpgsql security definer set search_path=public,private,pg_temp
as $$
declare v_owner uuid:=auth.uid(); v_revision integer; v_snapshot jsonb; v_previous_category uuid;
begin
  if not private.has_strong_owner_access(v_owner) then raise exception 'strong owner access required'; end if;
  if not exists(select 1 from public.source_transactions where id=p_transaction_id and owner_id=v_owner) then raise exception 'transaction not owned'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_owner::text||':ledger-mutation',0));
  select revision,category_id into v_revision,v_previous_category from public.transaction_overlays where transaction_id=p_transaction_id and owner_id=v_owner for update;
  v_revision:=coalesce(v_revision,0);
  if v_revision<>p_expected_revision then raise exception 'overlay revision conflict'; end if;
  v_revision:=v_revision+1;
  insert into public.transaction_overlays(transaction_id,owner_id,category_id,description,counterparty,effective_date,note,include_in_reporting,revision)
  values(p_transaction_id,v_owner,nullif(p_overlay->>'category_id','')::uuid,nullif(p_overlay->>'description',''),
    nullif(p_overlay->>'counterparty',''),nullif(p_overlay->>'effective_date','')::date,nullif(p_overlay->>'note',''),
    coalesce((p_overlay->>'include_in_reporting')::boolean,true),v_revision)
  on conflict(transaction_id) do update set category_id=excluded.category_id,description=excluded.description,
    counterparty=excluded.counterparty,effective_date=excluded.effective_date,note=excluded.note,
    include_in_reporting=excluded.include_in_reporting,revision=excluded.revision,updated_at=now();
  select to_jsonb(o) into v_snapshot from public.transaction_overlays o where transaction_id=p_transaction_id;
  insert into public.overlay_revisions(owner_id,transaction_id,revision,snapshot,changed_by) values(v_owner,p_transaction_id,v_revision,v_snapshot,v_owner);
  if nullif(p_overlay->>'category_id','')::uuid is distinct from v_previous_category then
    insert into public.category_provenance(owner_id,transaction_id,overlay_revision,source,detail)
      values(v_owner,p_transaction_id,v_revision,'owner','{}'::jsonb);
  end if;
  insert into public.audit_events(owner_id,actor_id,event_type,entity_type,entity_id,detail)
    values(v_owner,v_owner,'overlay.updated','source_transaction',p_transaction_id,jsonb_build_object('revision',v_revision));
  update public.mutation_sequences set sequence=sequence+1,updated_at=now() where owner_id=v_owner;
  return v_snapshot;
end;
$$;

-- Machine categories. Items: {transaction_id, category_id, source in rule/match/model, detail}.
-- A malformed item or a transaction that is not the caller's raises; an unowned or archived
-- category, an unchanged category, or a protected category (owner, legacy, reviewed) is skipped.
create or replace function public.apply_category_proposals(p_items jsonb)
returns jsonb language plpgsql security definer set search_path=public,private,pg_temp
as $$
declare
  v_owner uuid:=auth.uid();
  v_item jsonb;
  v_tx uuid;
  v_category uuid;
  v_source text;
  v_detail jsonb;
  v_revision integer;
  v_current uuid;
  v_latest public.category_provenance%rowtype;
  v_reviewed boolean;
  v_snapshot jsonb;
  v_applied integer:=0;
  v_skipped integer:=0;
  v_uuid constant text:='^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
begin
  if not private.has_strong_owner_access(v_owner) then raise exception 'strong owner access required'; end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' then raise exception 'invalid category proposals'; end if;
  if jsonb_array_length(p_items)>5000 then raise exception 'too many category proposals'; end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_item)<>'object'
      or jsonb_typeof(v_item->'transaction_id') is distinct from 'string' or (v_item->>'transaction_id') !~ v_uuid
      or jsonb_typeof(v_item->'category_id') is distinct from 'string' or (v_item->>'category_id') !~ v_uuid
      or jsonb_typeof(v_item->'source') is distinct from 'string' or (v_item->>'source') not in ('rule','match','model')
      or jsonb_typeof(v_item->'detail') is distinct from 'object' then
      raise exception 'invalid category proposal';
    end if;
  end loop;

  perform pg_advisory_xact_lock(hashtextextended(v_owner::text||':ledger-mutation',0));

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_tx:=(v_item->>'transaction_id')::uuid;
    v_category:=(v_item->>'category_id')::uuid;
    v_source:=v_item->>'source';
    v_detail:=v_item->'detail';
    if not exists(select 1 from public.source_transactions where id=v_tx and owner_id=v_owner) then
      raise exception 'transaction not owned';
    end if;
    if not exists(select 1 from public.categories where id=v_category and owner_id=v_owner and not archived) then
      v_skipped:=v_skipped+1; continue;
    end if;
    select revision,category_id into v_revision,v_current
      from public.transaction_overlays where transaction_id=v_tx and owner_id=v_owner for update;
    if not found then v_revision:=0; v_current:=null; end if;
    if v_current is not distinct from v_category then v_skipped:=v_skipped+1; continue; end if;
    v_latest:=null;
    select * into v_latest from public.category_provenance
      where transaction_id=v_tx and owner_id=v_owner order by overlay_revision desc limit 1;
    v_reviewed:=v_latest.transaction_id is not null and exists(
      select 1 from public.category_reviews where transaction_id=v_tx and overlay_revision=v_latest.overlay_revision);
    -- The owner's latest choice (a clear included), a legacy category, or a reviewed one stays.
    if v_latest.source='owner' or v_reviewed or (v_current is not null and v_latest.transaction_id is null) then
      v_skipped:=v_skipped+1; continue;
    end if;
    v_revision:=v_revision+1;
    insert into public.transaction_overlays(transaction_id,owner_id,category_id,include_in_reporting,revision)
    values(v_tx,v_owner,v_category,true,v_revision)
    on conflict(transaction_id) do update set category_id=excluded.category_id,revision=excluded.revision,updated_at=now();
    select to_jsonb(o) into v_snapshot from public.transaction_overlays o where transaction_id=v_tx;
    insert into public.overlay_revisions(owner_id,transaction_id,revision,snapshot,changed_by) values(v_owner,v_tx,v_revision,v_snapshot,v_owner);
    insert into public.category_provenance(owner_id,transaction_id,overlay_revision,source,detail)
      values(v_owner,v_tx,v_revision,v_source,v_detail);
    insert into public.audit_events(owner_id,actor_id,event_type,entity_type,entity_id,detail)
      values(v_owner,v_owner,'overlay.updated','source_transaction',v_tx,jsonb_build_object('revision',v_revision,'source',v_source));
    v_applied:=v_applied+1;
  end loop;

  if v_applied>0 then
    update public.mutation_sequences set sequence=sequence+1,updated_at=now() where owner_id=v_owner;
  end if;
  return jsonb_build_object('applied',v_applied,'skipped',v_skipped);
end;
$$;
revoke all on function public.apply_category_proposals(jsonb) from public,anon;
grant execute on function public.apply_category_proposals(jsonb) to authenticated;

-- Copied from 026; "current" now means no revision after the auto-exclude event turned reporting
-- back on, instead of the event's revision equalling the overlay's.
create or replace function public.list_auto_excluded_transactions()
returns jsonb language plpgsql stable security definer set search_path=public,private,pg_temp
as $$
declare v_owner uuid := auth.uid();
begin
  if not private.has_strong_owner_access(v_owner) then raise exception 'strong owner access required'; end if;
  return coalesce((
    select jsonb_agg(o.transaction_id order by o.transaction_id)
    from public.transaction_overlays o
    where o.owner_id = v_owner and not o.include_in_reporting
      and exists (
        select 1 from public.audit_events e
        where e.owner_id = v_owner and e.entity_id = o.transaction_id
          and e.event_type = 'overlay.auto_excluded'
          and not exists (
            select 1 from public.overlay_revisions r
            where r.owner_id = v_owner and r.transaction_id = o.transaction_id
              and r.revision > (e.detail->>'revision')::integer
              and (r.snapshot->>'include_in_reporting')::boolean is not false))
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.list_auto_excluded_transactions() from public, anon;
grant execute on function public.list_auto_excluded_transactions() to authenticated;


-- Backup v14 (D-245 step 2). Copied from 036, the latest definitions: the three tables join the
-- export, the restore's kind list, its chunk-kind CHECK and its emptiness check, and are inserted
-- last, so each lands after what it references (categories, overlay_revisions, provenance). A v13
-- file still restores and leaves them empty.

alter table public.restore_runs
  drop constraint if exists restore_runs_schema_version_check,
  add constraint restore_runs_schema_version_check check (schema_version in (1,2,3,4,5,6,7,8,9,10,11,12,13,14));

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
        'lineman_order_details',
        'category_parents','category_provenance','category_reviews')
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
    'lineman_order_details',(select coalesce(jsonb_agg(to_jsonb(x)-'charged_minor'||jsonb_build_object('charged_minor',charged_minor::text) order by delivery_id),'[]') from public.lineman_order_details x where owner_id=v_owner),
    'category_parents',(select coalesce(jsonb_agg(to_jsonb(x) order by category_id),'[]') from public.category_parents x where owner_id=v_owner),
    'category_provenance',(select coalesce(jsonb_agg(to_jsonb(x) order by transaction_id,overlay_revision),'[]') from public.category_provenance x where owner_id=v_owner),
    'category_reviews',(select coalesce(jsonb_agg(to_jsonb(x) order by transaction_id,overlay_revision),'[]') from public.category_reviews x where owner_id=v_owner)
  );
  select jsonb_object_agg(key,jsonb_array_length(value)) into v_counts from jsonb_each(v_data);
  return jsonb_build_object('schemaVersion',14,'exportedAt',to_char(v_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'snapshotSequence',v_sequence::text,'tableCounts',v_counts,'data',v_data);
end;
$$;
revoke all on function public.export_backup_snapshot() from public,anon;
grant execute on function public.export_backup_snapshot() to authenticated;

-- The kind list is built up by version, so a fifteenth version adds one line and strands nothing.
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
 if v_schema_text not in ('2','3','4','5','6','7','8','9','10','11','12','13','14') or v_digest!~'^[a-f0-9]{64}$' then raise exception 'invalid restore contract'; end if;
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
 if v_schema>=14 then v_expected_kinds:=v_expected_kinds||array['category_parents','category_provenance','category_reviews']; end if;
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
    or exists(select 1 from public.category_provenance where owner_id=v_owner)
    or exists(select 1 from public.category_reviews where owner_id=v_owner)
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
 -- A parent link is part of the category set, which the restore replaces whole.
 delete from public.category_parents where owner_id=v_owner;
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
   when 'category_parents' then insert into public.category_parents(category_id,owner_id,parent_id,created_at)
    values((v_row->>'category_id')::uuid,v_owner,(v_row->>'parent_id')::uuid,(v_row->>'created_at')::timestamptz);
   when 'category_provenance' then insert into public.category_provenance(owner_id,transaction_id,overlay_revision,source,detail,created_at)
    values(v_owner,(v_row->>'transaction_id')::uuid,(v_row->>'overlay_revision')::integer,v_row->>'source',v_row->'detail',(v_row->>'created_at')::timestamptz);
   when 'category_reviews' then insert into public.category_reviews(owner_id,transaction_id,overlay_revision,created_at)
    values(v_owner,(v_row->>'transaction_id')::uuid,(v_row->>'overlay_revision')::integer,(v_row->>'created_at')::timestamptz);
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

-- The auto-categoriser's inputs (D-245 step 3), as one jsonb value so PostgREST's row cap never
-- cuts it (D-230's precedent). Per transaction: the signed amount (sum of components, as text,
-- D-018), the description in force (the overlay's, else the source's), the label, reporting
-- (default true), the current category, and the latest provenance source and whether it is
-- reviewed. Plus every category with its parent. Read-only: the TypeScript decides.
create or replace function public.list_category_inputs()
returns jsonb language plpgsql stable security definer set search_path=public,private,pg_temp
as $$
declare v_owner uuid := auth.uid();
begin
  if not private.has_strong_owner_access(v_owner) then raise exception 'strong owner access required'; end if;
  return jsonb_build_object(
    'transactions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id,
        'amount_minor', (select coalesce(sum(c.amount_minor), 0) from public.source_components c
                          where c.transaction_id = t.id and c.owner_id = v_owner)::text,
        'description', coalesce(o.description, t.description),
        'transaction_label', t.transaction_label,
        'include_in_reporting', coalesce(o.include_in_reporting, true),
        'category_id', o.category_id,
        'source', p.source,
        'reviewed', p.transaction_id is not null and exists(
          select 1 from public.category_reviews r
          where r.transaction_id = t.id and r.overlay_revision = p.overlay_revision and r.owner_id = v_owner)
      ) order by t.id)
      from public.source_transactions t
      left join public.transaction_overlays o on o.transaction_id = t.id and o.owner_id = v_owner
      left join lateral (
        select cp.transaction_id, cp.overlay_revision, cp.source from public.category_provenance cp
        where cp.transaction_id = t.id and cp.owner_id = v_owner
        order by cp.overlay_revision desc limit 1
      ) p on true
      where t.owner_id = v_owner
    ), '[]'::jsonb),
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'archived', c.archived, 'parent_id', cp.parent_id) order by c.id)
      from public.categories c
      left join public.category_parents cp on cp.category_id = c.id and cp.owner_id = v_owner
      where c.owner_id = v_owner
    ), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.list_category_inputs() from public, anon;
grant execute on function public.list_category_inputs() to authenticated;

-- The ledger row (from 021, unchanged) plus where its category came from (D-245 step 4):
-- `category_source` is the latest provenance source or null, `category_source_revision` the overlay
-- revision of that provenance row (what `review_transaction_category` is called with),
-- `category_reviewed` whether that row has a review, and `category_parent_name` the category's
-- parent's name or null. Pages and match candidates both read this, so both carry them.
create or replace function private.ledger_transaction_json(p_owner uuid, p_transaction public.source_transactions)
returns jsonb language sql stable
as $$
  select jsonb_build_object(
    'id', p_transaction.id,
    'source_date', p_transaction.source_date,
    'source_time', p_transaction.source_time,
    'effective_date', p_transaction.effective_date,
    'transaction_label', p_transaction.transaction_label,
    'description', p_transaction.description,
    'reference', p_transaction.reference,
    'branch', p_transaction.branch,
    'post_balance_minor', p_transaction.post_balance_minor::text,
    'currency', p_transaction.currency,
    'source_components', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', c.id, 'kind', c.kind, 'amount_minor', c.amount_minor::text, 'currency', c.currency
      ) order by c.position), '[]')
      from public.source_components c
      where c.owner_id = p_owner and c.transaction_id = p_transaction.id
    ),
    'transaction_overlays', (
      select coalesce(jsonb_agg(to_jsonb(o) - 'owner_id' - 'transaction_id'), '[]')
      from public.transaction_overlays o
      where o.owner_id = p_owner and o.transaction_id = p_transaction.id
    ),
    'category_source', p.source,
    'category_source_revision', p.overlay_revision,
    'category_reviewed', p.overlay_revision is not null and exists(
      select 1 from public.category_reviews r
      where r.owner_id = p_owner and r.transaction_id = p_transaction.id and r.overlay_revision = p.overlay_revision),
    'category_parent_name', (
      select pc.name from public.transaction_overlays o
      join public.category_parents cp on cp.category_id = o.category_id and cp.owner_id = p_owner
      join public.categories pc on pc.id = cp.parent_id and pc.owner_id = p_owner
      where o.owner_id = p_owner and o.transaction_id = p_transaction.id)
  )
  from (select null::integer as dummy) d
  left join lateral (
    select cp.source, cp.overlay_revision from public.category_provenance cp
    where cp.owner_id = p_owner and cp.transaction_id = p_transaction.id
    order by cp.overlay_revision desc limit 1
  ) p on true;
$$;
revoke all on function private.ledger_transaction_json(uuid, public.source_transactions) from public, anon, authenticated;

commit;
