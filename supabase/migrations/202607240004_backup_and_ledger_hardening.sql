begin;

alter table public.import_batches
  add column period_start date,
  add column period_end date,
  add column opening_balance_minor bigint,
  add column closing_balance_minor bigint,
  add column currency text;
alter table public.import_batches
  add constraint import_batches_period_valid check (period_start is null or period_end is null or period_start <= period_end),
  add constraint import_batches_frame_complete check (
    (period_start is null and period_end is null and opening_balance_minor is null and closing_balance_minor is null and currency is null)
    or
    (period_start is not null and period_end is not null and opening_balance_minor is not null and closing_balance_minor is not null and currency = 'THB')
  );

alter table public.restore_runs
  drop constraint if exists restore_runs_schema_version_check,
  add column if not exists manifest jsonb,
  add column if not exists snapshot_sequence bigint,
  add constraint restore_runs_schema_version_check check (schema_version in (1,2)),
  add constraint restore_runs_v2_manifest check (
    schema_version <> 2 or (manifest is not null and snapshot_sequence is not null and snapshot_sequence >= 0)
  );
alter table public.restore_chunks
  add column if not exists chunk_kind text,
  add column if not exists row_count integer,
  add column if not exists chunk_digest text,
  add constraint restore_chunks_v2_binding check (
    chunk_kind is null or (
      chunk_kind in ('accounts','categories','import_artifacts','import_batches','source_transactions',
        'source_components','import_batch_rows','transaction_overlays','overlay_revisions','audit_events','mutation_sequences')
      and row_count >= 0 and chunk_digest ~ '^[a-f0-9]{64}$'
    )
  );

create or replace function private.javascript_key_sort(p_value text)
returns text language plpgsql immutable strict
set search_path = pg_catalog
as $$
declare v_result text:=''; v_code integer; v_index integer;
begin
  for v_index in 1..char_length(p_value) loop
    v_code:=ascii(substr(p_value,v_index,1));
    if v_code>65535 then
      v_code:=v_code-65536;
      v_result:=v_result||lpad(to_hex(55296+(v_code/1024)),4,'0')||lpad(to_hex(56320+(v_code%1024)),4,'0');
    else
      v_result:=v_result||lpad(to_hex(v_code),4,'0');
    end if;
  end loop;
  return v_result;
end;
$$;
revoke all on function private.javascript_key_sort(text) from public,anon,authenticated;

create or replace function private.canonical_jsonb(p_value jsonb)
returns text language plpgsql immutable strict
set search_path = pg_catalog
as $$
declare v_type text := jsonb_typeof(p_value); v_result text;
begin
  if v_type in ('null','boolean','number','string') then return p_value::text; end if;
  if v_type = 'array' then
    select '[' || coalesce(string_agg(private.canonical_jsonb(value), ',' order by ordinality), '') || ']'
      into v_result from jsonb_array_elements(p_value) with ordinality;
    return v_result;
  end if;
  select '{' || coalesce(string_agg(to_json(key)::text || ':' || private.canonical_jsonb(value), ',' order by private.javascript_key_sort(key)), '') || '}'
    into v_result from jsonb_each(p_value);
  return v_result;
end;
$$;
revoke all on function private.canonical_jsonb(jsonb) from public, anon, authenticated;

create or replace function private.sha256_jsonb(p_value jsonb)
returns text language sql immutable strict
set search_path = pg_catalog, extensions, private
as $$ select encode(extensions.digest(convert_to(private.canonical_jsonb(p_value), 'UTF8'), 'sha256'), 'hex') $$;
revoke all on function private.sha256_jsonb(jsonb) from public, anon, authenticated;

create or replace function private.is_canonical_int64_text(p_value text, p_nonnegative boolean default false)
returns boolean language plpgsql immutable
set search_path = pg_catalog
as $$
declare v_number numeric;
begin
  if p_value is null or p_value !~ '^(0|-?[1-9][0-9]*)$' then return false; end if;
  begin
    v_number:=p_value::numeric;
  exception when others then
    return false;
  end;
  return v_number between -9223372036854775808 and 9223372036854775807
    and (not p_nonnegative or v_number>=0);
end;
$$;
revoke all on function private.is_canonical_int64_text(text,boolean) from public,anon,authenticated;

drop function public.confirm_import(uuid,text,text,uuid,text,jsonb);
create function public.confirm_import(
  p_account_id uuid, p_artifact_digest text, p_payload_digest text, p_idempotency_key uuid,
  p_contract_version text, p_period_start date, p_period_end date, p_opening_balance_minor text,
  p_closing_balance_minor text, p_currency text, p_rows jsonb
) returns uuid
language plpgsql security definer set search_path = public, private, pg_temp
as $$
declare
  v_owner uuid := auth.uid(); v_artifact uuid; v_batch uuid; v_existing public.import_batches%rowtype;
  v_row jsonb; v_component jsonb; v_tx uuid; v_inserted boolean; v_position integer;
  v_count integer; v_distinct integer; v_expected_index integer := 0;
  v_running numeric; v_printed numeric; v_component_sum numeric; v_is_resync boolean;
begin
  if not private.has_strong_owner_access(v_owner) then raise exception 'strong owner access required'; end if;
  if p_artifact_digest !~ '^[a-f0-9]{64}$' or p_payload_digest !~ '^[a-f0-9]{64}$' then raise exception 'invalid digest'; end if;
  if p_contract_version <> 'krungthai-layout-v1' or p_currency <> 'THB' or p_period_start > p_period_end
     or p_opening_balance_minor !~ '^(0|-?[1-9][0-9]*)$' or p_closing_balance_minor !~ '^(0|-?[1-9][0-9]*)$'
     or (p_opening_balance_minor::numeric not between -9223372036854775808 and 9223372036854775807)
     or (p_closing_balance_minor::numeric not between -9223372036854775808 and 9223372036854775807)
     or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then raise exception 'invalid import contract'; end if;
  if not exists (select 1 from public.accounts where id=p_account_id and owner_id=v_owner and currency=p_currency) then raise exception 'account not owned'; end if;
  select count(*), count(distinct value->>'fingerprint') into v_count,v_distinct from jsonb_array_elements(p_rows);
  if v_count <> v_distinct then raise exception 'ambiguous duplicate fingerprints'; end if;
  v_running := p_opening_balance_minor::numeric;
  for v_row in select value from jsonb_array_elements(p_rows) loop
    v_expected_index := v_expected_index + 1;
    if (v_row->>'sourceIndex') !~ '^[1-9][0-9]*$' or (v_row->>'sourceIndex')::integer <> v_expected_index
       or (v_row->>'sourceDate')::date not between p_period_start and p_period_end
       or (v_row->>'fingerprint') !~ '^[a-f0-9]{64}$'
       or jsonb_typeof(v_row->'components') <> 'array' or jsonb_array_length(v_row->'components') not between 1 and 2
       or v_row#>>'{postBalance,currency}' <> p_currency
       or (v_row#>>'{postBalance,minor}') !~ '^(0|-?[1-9][0-9]*)$'
       or (v_row#>>'{postBalance,minor}')::numeric not between -9223372036854775808 and 9223372036854775807
       then raise exception 'invalid source row'; end if;
    select coalesce(sum((c#>>'{amount,minor}')::numeric),0),
      bool_and(c#>>'{amount,currency}' = p_currency and (c#>>'{amount,minor}') ~ '^(0|-?[1-9][0-9]*)$'
        and (c#>>'{amount,minor}')::numeric between -9223372036854775808 and 9223372036854775807
        and ((c->>'kind'='deposit' and (c#>>'{amount,minor}')::numeric > 0)
          or (c->>'kind'='withdrawal' and (c#>>'{amount,minor}')::numeric < 0)))
      into v_component_sum, v_is_resync from jsonb_array_elements(v_row->'components') c;
    if not coalesce(v_is_resync,false) then raise exception 'invalid component'; end if;
    v_printed := (v_row#>>'{postBalance,minor}')::numeric;
    v_is_resync := jsonb_array_length(v_row->'components')=2
      and (select count(*) from jsonb_array_elements(v_row->'components') c where c->>'kind'='deposit')=1
      and (select count(*) from jsonb_array_elements(v_row->'components') c where c->>'kind'='withdrawal')=1
      and v_row#>>'{provenance,parserFields,anomaly}'='interest-tax-order';
    if v_running + v_component_sum <> v_printed and not v_is_resync then raise exception 'balance reconciliation failed'; end if;
    v_running := v_printed;
  end loop;
  if v_running <> p_closing_balance_minor::numeric then raise exception 'closing balance mismatch'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_owner::text || ':ledger-mutation',0));
  select * into v_existing from public.import_batches where owner_id=v_owner and idempotency_key=p_idempotency_key;
  if v_existing.id is not null then
    if v_existing.payload_digest<>p_payload_digest or v_existing.period_start<>p_period_start
      or v_existing.period_end<>p_period_end or v_existing.opening_balance_minor::text<>p_opening_balance_minor
      or v_existing.closing_balance_minor::text<>p_closing_balance_minor or v_existing.currency<>p_currency
      or (select artifact_digest from public.import_artifacts where id=v_existing.artifact_id)<>p_artifact_digest
      then raise exception 'idempotency key reused with different payload'; end if;
    return v_existing.id;
  end if;
  select id into v_artifact from public.import_artifacts where owner_id=v_owner and artifact_digest=p_artifact_digest;
  if v_artifact is null then
    insert into public.import_artifacts(owner_id,artifact_digest,contract_version) values(v_owner,p_artifact_digest,p_contract_version) returning id into v_artifact;
  else
    select * into v_existing from public.import_batches where owner_id=v_owner and artifact_id=v_artifact;
    if v_existing.id is not null then
      if v_existing.payload_digest=p_payload_digest and v_existing.period_start=p_period_start
        and v_existing.period_end=p_period_end and v_existing.opening_balance_minor::text=p_opening_balance_minor
        and v_existing.closing_balance_minor::text=p_closing_balance_minor and v_existing.currency=p_currency
        then return v_existing.id; end if;
      raise exception 'artifact reused with different payload';
    end if;
  end if;
  insert into public.import_batches(owner_id,account_id,artifact_id,idempotency_key,payload_digest,period_start,period_end,opening_balance_minor,closing_balance_minor,currency)
    values(v_owner,p_account_id,v_artifact,p_idempotency_key,p_payload_digest,p_period_start,p_period_end,p_opening_balance_minor::bigint,p_closing_balance_minor::bigint,p_currency)
    returning id into v_batch;
  for v_row in select value from jsonb_array_elements(p_rows) loop
    insert into public.source_transactions(owner_id,account_id,fingerprint_version,fingerprint,source_date,source_time,effective_date,transaction_label,description,reference,branch,post_balance_minor,currency)
    values(v_owner,p_account_id,'fingerprint-v1',v_row->>'fingerprint',(v_row->>'sourceDate')::date,nullif(v_row->>'sourceTime','')::time,(v_row->>'effectiveDate')::date,
      v_row->>'transactionLabel',v_row->>'description',nullif(v_row->>'reference',''),nullif(v_row->>'branch',''),(v_row#>>'{postBalance,minor}')::bigint,p_currency)
    on conflict(owner_id,account_id,fingerprint) do nothing returning id into v_tx;
    v_inserted := v_tx is not null;
    if not v_inserted then select id into strict v_tx from public.source_transactions where owner_id=v_owner and account_id=p_account_id and fingerprint=v_row->>'fingerprint'; end if;
    if v_inserted then
      v_position:=0;
      for v_component in select value from jsonb_array_elements(v_row->'components') loop
        v_position:=v_position+1;
        insert into public.source_components(owner_id,transaction_id,position,kind,amount_minor,currency)
          values(v_owner,v_tx,v_position,v_component->>'kind',(v_component#>>'{amount,minor}')::bigint,p_currency);
      end loop;
    end if;
    insert into public.import_batch_rows(owner_id,batch_id,transaction_id,source_index,page,row_number,parser_fields,linked_existing)
      values(v_owner,v_batch,v_tx,(v_row->>'sourceIndex')::integer,(v_row#>>'{provenance,page}')::integer,(v_row#>>'{provenance,row}')::integer,
        coalesce(v_row#>'{provenance,parserFields}','{}'),not v_inserted);
    v_tx:=null;
  end loop;
  insert into public.audit_events(owner_id,actor_id,event_type,entity_type,entity_id,detail)
    values(v_owner,v_owner,'import.confirmed','import_batch',v_batch,jsonb_build_object('payload_digest',p_payload_digest,'row_count',v_count));
  update public.mutation_sequences set sequence=sequence+1,updated_at=now() where owner_id=v_owner;
  return v_batch;
end;
$$;
revoke all on function public.confirm_import(uuid,text,text,uuid,text,date,date,text,text,text,jsonb) from public,anon;
grant execute on function public.confirm_import(uuid,text,text,uuid,text,date,date,text,text,text,jsonb) to authenticated;

create or replace function public.mutate_category(p_action text,p_id uuid,p_name text,p_archived boolean)
returns jsonb language plpgsql security definer set search_path=public,private,pg_temp
as $$
declare v_owner uuid:=auth.uid(); v_category public.categories%rowtype;
begin
  if not private.has_strong_owner_access(v_owner) then raise exception 'strong owner access required'; end if;
  if p_action not in ('create','update') or length(btrim(p_name)) not between 1 and 80 then raise exception 'invalid category mutation'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_owner::text||':ledger-mutation',0));
  if p_action='create' then
    if p_id is not null then raise exception 'create id must be null'; end if;
    insert into public.categories(owner_id,name,archived) values(v_owner,btrim(p_name),coalesce(p_archived,false)) returning * into v_category;
  else
    update public.categories set name=btrim(p_name),archived=coalesce(p_archived,false),updated_at=now()
      where id=p_id and owner_id=v_owner returning * into v_category;
    if v_category.id is null then raise exception 'category not owned'; end if;
  end if;
  insert into public.audit_events(owner_id,actor_id,event_type,entity_type,entity_id,detail)
    values(v_owner,v_owner,'category.'||p_action,'category',v_category.id,jsonb_build_object('name',v_category.name,'archived',v_category.archived));
  update public.mutation_sequences set sequence=sequence+1,updated_at=now() where owner_id=v_owner;
  return jsonb_build_object('id',v_category.id,'name',v_category.name,'archived',v_category.archived);
end;
$$;
revoke all on function public.mutate_category(text,uuid,text,boolean) from public,anon;
grant execute on function public.mutate_category(text,uuid,text,boolean) to authenticated;
revoke insert,update on public.categories from authenticated;
drop policy if exists strong_owner_category_insert on public.categories;
drop policy if exists strong_owner_category_update on public.categories;

create or replace function public.update_transaction_overlay(p_transaction_id uuid,p_expected_revision integer,p_overlay jsonb)
returns jsonb language plpgsql security definer set search_path=public,private,pg_temp
as $$
declare v_owner uuid:=auth.uid(); v_revision integer; v_snapshot jsonb;
begin
  if not private.has_strong_owner_access(v_owner) then raise exception 'strong owner access required'; end if;
  if not exists(select 1 from public.source_transactions where id=p_transaction_id and owner_id=v_owner) then raise exception 'transaction not owned'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_owner::text||':ledger-mutation',0));
  select revision into v_revision from public.transaction_overlays where transaction_id=p_transaction_id and owner_id=v_owner for update;
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
  insert into public.audit_events(owner_id,actor_id,event_type,entity_type,entity_id,detail)
    values(v_owner,v_owner,'overlay.updated','source_transaction',p_transaction_id,jsonb_build_object('revision',v_revision));
  update public.mutation_sequences set sequence=sequence+1,updated_at=now() where owner_id=v_owner;
  return v_snapshot;
end;
$$;

create or replace function public.list_account_transactions(p_account_id uuid)
returns jsonb language sql stable security definer set search_path=public,private,pg_temp
as $$
  select case when private.has_strong_owner_access(auth.uid()) then coalesce(jsonb_agg(
    jsonb_build_object('id',t.id,'source_date',t.source_date,'source_time',t.source_time,'effective_date',t.effective_date,
      'transaction_label',t.transaction_label,'description',t.description,'reference',t.reference,'branch',t.branch,
      'post_balance_minor',t.post_balance_minor::text,'currency',t.currency,'fingerprint',t.fingerprint,
      'source_components',(select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'kind',c.kind,'amount_minor',c.amount_minor::text,'currency',c.currency) order by c.position),'[]') from public.source_components c where c.owner_id=t.owner_id and c.transaction_id=t.id),
      'import_batch_rows',(select coalesce(jsonb_agg(jsonb_build_object('batch_id',r.batch_id,'source_index',r.source_index,'page',r.page,'row_number',r.row_number,'parser_fields',r.parser_fields,'linked_existing',r.linked_existing) order by r.source_index),'[]') from public.import_batch_rows r where r.owner_id=t.owner_id and r.transaction_id=t.id),
      'transaction_overlays',(select coalesce(jsonb_agg(to_jsonb(o)-'owner_id'-'transaction_id'),'[]') from public.transaction_overlays o where o.owner_id=t.owner_id and o.transaction_id=t.id)
    ) order by t.source_date desc,t.source_time desc nulls last,t.id),'[]') else '[]' end
  from public.source_transactions t where t.owner_id=auth.uid() and t.account_id=p_account_id;
$$;
revoke all on function public.list_account_transactions(uuid) from public,anon;
grant execute on function public.list_account_transactions(uuid) to authenticated;

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
    'mutation_sequences',(select coalesce(jsonb_agg(to_jsonb(x)-'sequence'-'last_exported_sequence'||jsonb_build_object('sequence',sequence::text,'last_exported_sequence',last_exported_sequence::text) order by owner_id),'[]') from public.mutation_sequences x where owner_id=v_owner)
  );
  select jsonb_object_agg(key,jsonb_array_length(value)) into v_counts from jsonb_each(v_data);
  return jsonb_build_object('schemaVersion',2,'exportedAt',to_char(v_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'snapshotSequence',v_sequence::text,'tableCounts',v_counts,'data',v_data);
end;
$$;
revoke all on function public.export_backup_snapshot() from public,anon;
grant execute on function public.export_backup_snapshot() to authenticated;

drop function public.mark_backup_exported(text);
create function public.mark_backup_exported(p_payload_digest text,p_expected_sequence text)
returns text language plpgsql security definer set search_path=public,private,pg_temp
as $$
declare v_owner uuid:=auth.uid(); v_sequence bigint;
begin
 if not private.has_strong_owner_access(v_owner) then raise exception 'strong owner access required'; end if;
 if p_payload_digest!~'^[a-f0-9]{64}$' or p_expected_sequence!~'^(0|[1-9][0-9]*)$'
   or p_expected_sequence::numeric>9223372036854775807 then raise exception 'invalid backup marker'; end if;
 perform pg_advisory_xact_lock(hashtextextended(v_owner::text||':ledger-mutation',0));
 select sequence into v_sequence from public.mutation_sequences where owner_id=v_owner for update;
 if v_sequence<>p_expected_sequence::bigint then raise exception 'snapshot sequence changed'; end if;
 insert into public.backup_records(owner_id,mutation_sequence,payload_digest,confirmed_by)
   values(v_owner,v_sequence,p_payload_digest,v_owner) on conflict(owner_id,payload_digest) do update set mutation_sequence=excluded.mutation_sequence,exported_at=now(),confirmed_by=excluded.confirmed_by;
 update public.mutation_sequences set last_exported_sequence=v_sequence,updated_at=now() where owner_id=v_owner;
 return v_sequence::text;
end;
$$;
revoke all on function public.mark_backup_exported(text,text) from public,anon;
grant execute on function public.mark_backup_exported(text,text) to authenticated;

create or replace function public.restore_backup(p_action text,p_request jsonb)
returns jsonb language plpgsql security definer set search_path=public,private,pg_temp
as $$
declare
 v_owner uuid:=auth.uid(); v_restore uuid; v_idempotency uuid; v_digest text;
 v_run public.restore_runs%rowtype; v_descriptor jsonb; v_chunk record; v_row jsonb;
 v_index integer; v_kind text; v_count integer; v_chunk_digest text; v_manifest jsonb; v_payload jsonb;
 v_expected_kinds text[]:=array['accounts','categories','import_artifacts','import_batches','source_transactions',
  'source_components','import_batch_rows','transaction_overlays','overlay_revisions','audit_events','mutation_sequences'];
 v_restored_sequence bigint;
begin
 if not private.has_strong_owner_access(v_owner) then raise exception 'strong owner access required'; end if;
 begin
  v_restore:=(p_request->>'restoreId')::uuid; v_idempotency:=(p_request->>'idempotencyKey')::uuid; v_digest:=p_request->>'digest';
 exception when others then raise exception 'invalid restore contract'; end;
 if (p_request->>'schemaVersion')<>'2' or v_digest!~'^[a-f0-9]{64}$' then raise exception 'invalid restore contract'; end if;
 perform pg_advisory_xact_lock(hashtextextended(v_owner::text||':ledger-mutation',0));
  if p_action='stage' then
   v_manifest:=p_request->'manifest';
   if jsonb_typeof(v_manifest) is distinct from 'object'
     or jsonb_typeof(v_manifest->'payloadDigest') is distinct from 'string'
     or v_manifest->>'payloadDigest' is distinct from v_digest
     or jsonb_typeof(v_manifest->'snapshotSequence') is distinct from 'string'
     or not private.is_canonical_int64_text(v_manifest->>'snapshotSequence',true)
     or jsonb_typeof(v_manifest->'exportedAt') is distinct from 'string'
     or jsonb_typeof(v_manifest->'chunks') is distinct from 'array'
     or jsonb_array_length(v_manifest->'chunks')<>11
     or jsonb_typeof(v_manifest->'tableCounts') is distinct from 'object'
     or (select count(*) from jsonb_object_keys(v_manifest->'tableCounts'))<>11
     or (v_manifest->>'exportedAt')::timestamptz is null then raise exception 'invalid restore manifest'; end if;
  for v_index in 0..10 loop
   v_descriptor:=v_manifest->'chunks'->v_index;
   v_kind:=v_expected_kinds[v_index+1];
    if jsonb_typeof(v_descriptor) is distinct from 'object'
      or (select count(*) from jsonb_object_keys(v_descriptor))<>4
      or not (v_manifest->'tableCounts' ? v_kind)
      or jsonb_typeof(v_manifest#>array['tableCounts',v_kind]) is distinct from 'number'
      or jsonb_typeof(v_descriptor->'index') is distinct from 'number'
      or jsonb_typeof(v_descriptor->'rowCount') is distinct from 'number'
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
   if v_run.id<>v_restore or v_run.payload_digest<>v_digest or v_run.manifest<>v_manifest then raise exception 'restore idempotency conflict'; end if;
   return to_jsonb(v_run);
  end if;
  insert into public.restore_runs(id,owner_id,idempotency_key,schema_version,payload_digest,status,manifest,snapshot_sequence)
   values(v_restore,v_owner,v_idempotency,2,v_digest,'staged',v_manifest,(v_manifest->>'snapshotSequence')::bigint) returning * into v_run;
  return to_jsonb(v_run);
 end if;
  select * into v_run from public.restore_runs where id=v_restore and owner_id=v_owner for update;
  if v_run.id is null or v_run.schema_version is distinct from 2
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
   if v_index not between 0 and 10 or v_kind is distinct from v_expected_kinds[v_index+1] then raise exception 'restore chunk ordering mismatch'; end if;
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
    then raise exception 'restore destination ledger is not empty'; end if;
 if (select count(*) from public.restore_chunks where restore_id=v_restore and owner_id=v_owner)<>11 then raise exception 'restore chunks incomplete'; end if;
 v_payload:=jsonb_build_object('schemaVersion',2,'exportedAt',v_run.manifest->'exportedAt',
   'snapshotSequence',v_run.manifest->'snapshotSequence','tableCounts',v_run.manifest->'tableCounts','data','{}'::jsonb);
 for v_index in 0..10 loop
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
