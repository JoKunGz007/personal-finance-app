begin;

create or replace function public.restore_backup(p_action text, p_request jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_owner uuid := auth.uid();
  v_restore uuid := (p_request ->> 'restoreId')::uuid;
  v_idempotency uuid := (p_request ->> 'idempotencyKey')::uuid;
  v_digest text := p_request ->> 'digest';
  v_run public.restore_runs%rowtype;
  v_chunk record;
  v_row jsonb;
begin
  if not private.has_strong_owner_access(v_owner) then raise exception 'strong owner access required'; end if;
  if (p_request ->> 'schemaVersion')::integer <> 1 or v_digest !~ '^[a-f0-9]{64}$' then raise exception 'invalid restore contract'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_owner::text || ':ledger-mutation', 0));

  if p_action = 'stage' then
    select * into v_run from public.restore_runs where owner_id = v_owner and idempotency_key = v_idempotency;
    if v_run.id is not null then
      if v_run.payload_digest <> v_digest or v_run.id <> v_restore then raise exception 'restore idempotency conflict'; end if;
      return to_jsonb(v_run);
    end if;
    insert into public.restore_runs(id, owner_id, idempotency_key, schema_version, payload_digest, status)
    values (v_restore, v_owner, v_idempotency, 1, v_digest, 'staged') returning * into v_run;
    return to_jsonb(v_run);
  end if;

  select * into v_run from public.restore_runs where id = v_restore and owner_id = v_owner for update;
  if v_run.id is null or v_run.idempotency_key <> v_idempotency or v_run.payload_digest <> v_digest then raise exception 'restore session not found'; end if;
  if p_action = 'abort' then
    delete from public.restore_chunks where restore_id = v_restore and owner_id = v_owner;
    update public.restore_runs set status = 'aborted' where id = v_restore returning * into v_run;
    return to_jsonb(v_run);
  elsif p_action = 'chunk' then
    if v_run.status <> 'staged' or p_request -> 'chunk' is null or (p_request ->> 'chunkIndex')::integer < 0 then raise exception 'restore is not accepting chunks'; end if;
    insert into public.restore_chunks(owner_id, restore_id, chunk_index, chunk)
    values (v_owner, v_restore, (p_request ->> 'chunkIndex')::integer, p_request -> 'chunk')
    on conflict (restore_id, chunk_index) do update set chunk = excluded.chunk;
    return jsonb_build_object('id', v_restore, 'status', 'staged', 'chunkIndex', (p_request ->> 'chunkIndex')::integer);
  elsif p_action <> 'commit' then
    raise exception 'unknown restore action';
  end if;

  if v_run.status = 'applied' then return to_jsonb(v_run); end if;
  if v_run.status <> 'staged' then raise exception 'restore is not staged'; end if;
  if exists (select 1 from public.accounts where owner_id = v_owner)
     or exists (select 1 from public.source_transactions where owner_id = v_owner) then
    raise exception 'restore destination ledger is not empty';
  end if;
  if not exists (select 1 from public.restore_chunks where restore_id = v_restore) then raise exception 'restore has no chunks'; end if;

  delete from public.categories where owner_id = v_owner;
  for v_chunk in
    select chunk from public.restore_chunks where restore_id = v_restore and owner_id = v_owner
    order by case chunk ->> 'kind'
      when 'accounts' then 1 when 'categories' then 2 when 'import_artifacts' then 3 when 'import_batches' then 4
      when 'source_transactions' then 5 when 'source_components' then 6 when 'import_batch_rows' then 7
      when 'transaction_overlays' then 8 when 'overlay_revisions' then 9 when 'audit_events' then 10 else 99 end,
      chunk_index
  loop
    if jsonb_typeof(v_chunk.chunk -> 'rows') <> 'array' then raise exception 'restore chunk rows must be an array'; end if;
    for v_row in select value from jsonb_array_elements(v_chunk.chunk -> 'rows') loop
      case v_chunk.chunk ->> 'kind'
        when 'accounts' then
          insert into public.accounts(id,owner_id,bank_code,label,account_type,last_four,currency,timezone,created_at)
          values ((v_row->>'id')::uuid,v_owner,v_row->>'bank_code',v_row->>'label',v_row->>'account_type',v_row->>'last_four',v_row->>'currency',v_row->>'timezone',(v_row->>'created_at')::timestamptz);
        when 'categories' then
          insert into public.categories(id,owner_id,name,archived,created_at,updated_at)
          values ((v_row->>'id')::uuid,v_owner,v_row->>'name',(v_row->>'archived')::boolean,(v_row->>'created_at')::timestamptz,(v_row->>'updated_at')::timestamptz);
        when 'import_artifacts' then
          insert into public.import_artifacts(id,owner_id,artifact_digest,contract_version,created_at)
          values ((v_row->>'id')::uuid,v_owner,v_row->>'artifact_digest',v_row->>'contract_version',(v_row->>'created_at')::timestamptz);
        when 'import_batches' then
          insert into public.import_batches(id,owner_id,account_id,artifact_id,idempotency_key,payload_digest,status,confirmed_at)
          values ((v_row->>'id')::uuid,v_owner,(v_row->>'account_id')::uuid,(v_row->>'artifact_id')::uuid,(v_row->>'idempotency_key')::uuid,v_row->>'payload_digest',v_row->>'status',(v_row->>'confirmed_at')::timestamptz);
        when 'source_transactions' then
          insert into public.source_transactions(id,owner_id,account_id,fingerprint_version,fingerprint,source_date,source_time,effective_date,transaction_label,description,reference,branch,post_balance_minor,currency,created_at)
          values ((v_row->>'id')::uuid,v_owner,(v_row->>'account_id')::uuid,v_row->>'fingerprint_version',v_row->>'fingerprint',(v_row->>'source_date')::date,nullif(v_row->>'source_time','')::time,(v_row->>'effective_date')::date,v_row->>'transaction_label',v_row->>'description',v_row->>'reference',v_row->>'branch',(v_row->>'post_balance_minor')::bigint,v_row->>'currency',(v_row->>'created_at')::timestamptz);
        when 'source_components' then
          insert into public.source_components(id,owner_id,transaction_id,position,kind,amount_minor,currency,created_at)
          values ((v_row->>'id')::uuid,v_owner,(v_row->>'transaction_id')::uuid,(v_row->>'position')::smallint,v_row->>'kind',(v_row->>'amount_minor')::bigint,v_row->>'currency',(v_row->>'created_at')::timestamptz);
        when 'import_batch_rows' then
          insert into public.import_batch_rows(id,owner_id,batch_id,transaction_id,source_index,page,row_number,parser_fields,linked_existing)
          values ((v_row->>'id')::uuid,v_owner,(v_row->>'batch_id')::uuid,(v_row->>'transaction_id')::uuid,(v_row->>'source_index')::integer,(v_row->>'page')::integer,(v_row->>'row_number')::integer,v_row->'parser_fields',(v_row->>'linked_existing')::boolean);
        when 'transaction_overlays' then
          insert into public.transaction_overlays(transaction_id,owner_id,category_id,description,counterparty,effective_date,note,include_in_reporting,revision,updated_at)
          values ((v_row->>'transaction_id')::uuid,v_owner,nullif(v_row->>'category_id','')::uuid,v_row->>'description',v_row->>'counterparty',nullif(v_row->>'effective_date','')::date,v_row->>'note',(v_row->>'include_in_reporting')::boolean,(v_row->>'revision')::integer,(v_row->>'updated_at')::timestamptz);
        when 'overlay_revisions' then
          insert into public.overlay_revisions(id,owner_id,transaction_id,revision,snapshot,changed_at,changed_by)
          values ((v_row->>'id')::uuid,v_owner,(v_row->>'transaction_id')::uuid,(v_row->>'revision')::integer,(v_row->'snapshot') || jsonb_build_object('owner_id',v_owner),(v_row->>'changed_at')::timestamptz,v_owner);
        when 'audit_events' then
          insert into public.audit_events(owner_id,actor_id,event_type,entity_type,entity_id,detail,occurred_at)
          values (v_owner,v_owner,v_row->>'event_type',v_row->>'entity_type',(v_row->>'entity_id')::uuid,v_row->'detail',(v_row->>'occurred_at')::timestamptz);
        else raise exception 'unsupported restore chunk kind: %', v_chunk.chunk ->> 'kind';
      end case;
    end loop;
  end loop;
  update public.mutation_sequences set sequence = sequence + 1, last_exported_sequence = 0, updated_at = now() where owner_id = v_owner;
  update public.restore_runs set status = 'applied', applied_at = now() where id = v_restore returning * into v_run;
  return to_jsonb(v_run);
end;
$$;

revoke all on function public.restore_backup(text,jsonb) from public, anon;
grant execute on function public.restore_backup(text,jsonb) to authenticated;

commit;
