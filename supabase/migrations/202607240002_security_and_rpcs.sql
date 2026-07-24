begin;

create or replace function private.has_strong_owner_access(p_owner uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, auth
as $$
  select auth.uid() = p_owner
    and coalesce((nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'aal') = 'aal2', false)
    and (select count(*) from auth.mfa_factors f where f.user_id = p_owner and f.factor_type = 'totp' and f.status = 'verified') >= 2;
$$;

revoke all on function private.has_strong_owner_access(uuid) from public;
grant usage on schema private to authenticated, service_role;
grant execute on function private.has_strong_owner_access(uuid) to authenticated, service_role;

create or replace function public.bind_ledger_owner(p_user_id uuid, p_google_email text)
returns uuid
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_user auth.users%rowtype;
  v_existing public.ledger_owners%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended('private-ledger-owner-binding', 0));
  select * into v_user from auth.users where id = p_user_id;
  if v_user.id is null
     or v_user.email_confirmed_at is null
     or lower(v_user.email) <> lower(btrim(p_google_email))
     or not (v_user.raw_app_meta_data ->> 'provider' = 'google' or v_user.raw_app_meta_data -> 'providers' ? 'google') then
    raise exception 'A verified Google identity is required';
  end if;
  select * into v_existing from public.ledger_owners limit 1;
  if v_existing.owner_id is not null then
    if v_existing.owner_id = p_user_id and v_existing.google_email = lower(btrim(p_google_email)) then return v_existing.owner_id; end if;
    raise exception 'The ledger owner is already bound';
  end if;
  insert into public.ledger_owners(owner_id, google_email, bound_by) values (p_user_id, lower(btrim(p_google_email)), p_user_id);
  insert into public.categories(owner_id, name) values (p_user_id, 'Uncategorized');
  insert into public.mutation_sequences(owner_id) values (p_user_id);
  return p_user_id;
end;
$$;
revoke all on function public.bind_ledger_owner(uuid, text) from public, anon, authenticated;
grant execute on function public.bind_ledger_owner(uuid, text) to service_role;

create or replace function private.reject_change()
returns trigger language plpgsql set search_path = pg_catalog as $$
begin
  raise exception '% is append-only: % is forbidden', tg_table_name, tg_op;
end;
$$;

create trigger ledger_owners_immutable before update or delete on public.ledger_owners for each row execute function private.reject_change();
create trigger import_artifacts_immutable before update or delete on public.import_artifacts for each row execute function private.reject_change();
create trigger import_batches_immutable before update or delete on public.import_batches for each row execute function private.reject_change();
create trigger source_transactions_immutable before update or delete on public.source_transactions for each row execute function private.reject_change();
create trigger source_components_immutable before update or delete on public.source_components for each row execute function private.reject_change();
create trigger import_batch_rows_immutable before update or delete on public.import_batch_rows for each row execute function private.reject_change();
create trigger overlay_revisions_immutable before update or delete on public.overlay_revisions for each row execute function private.reject_change();
create trigger audit_events_immutable before update or delete on public.audit_events for each row execute function private.reject_change();

do $$
declare v_table text;
begin
  foreach v_table in array array[
    'ledger_owners','accounts','categories','import_artifacts','import_batches','source_transactions',
    'source_components','import_batch_rows','transaction_overlays','overlay_revisions','audit_events',
    'mutation_sequences','backup_records','restore_runs','restore_chunks'
  ] loop
    execute format('alter table public.%I enable row level security', v_table);
    execute format('alter table public.%I force row level security', v_table);
    execute format('create policy strong_owner_select on public.%I for select to authenticated using (private.has_strong_owner_access(owner_id))', v_table);
  end loop;
end $$;

create policy strong_owner_category_insert on public.categories for insert to authenticated
with check (private.has_strong_owner_access(owner_id));
create policy strong_owner_category_update on public.categories for update to authenticated
using (private.has_strong_owner_access(owner_id)) with check (private.has_strong_owner_access(owner_id));

revoke all on all tables in schema public from anon, authenticated;
grant select on all tables in schema public to authenticated;
grant insert, update on public.categories to authenticated;

create or replace function public.confirm_import(
  p_account_id uuid,
  p_artifact_digest text,
  p_payload_digest text,
  p_idempotency_key uuid,
  p_contract_version text,
  p_rows jsonb
) returns uuid
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_owner uuid := auth.uid();
  v_artifact uuid;
  v_batch uuid;
  v_existing public.import_batches%rowtype;
  v_row jsonb;
  v_component jsonb;
  v_tx uuid;
  v_inserted boolean;
  v_position integer;
  v_count integer;
  v_distinct integer;
begin
  if not private.has_strong_owner_access(v_owner) then raise exception 'strong owner access required'; end if;
  if p_artifact_digest !~ '^[a-f0-9]{64}$' or p_payload_digest !~ '^[a-f0-9]{64}$' then raise exception 'invalid digest'; end if;
  if p_contract_version <> 'krungthai-layout-v1' or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then raise exception 'invalid import contract'; end if;
  if not exists (select 1 from public.accounts where id = p_account_id and owner_id = v_owner) then raise exception 'account not owned'; end if;
  select count(*), count(distinct value ->> 'fingerprint') into v_count, v_distinct from jsonb_array_elements(p_rows);
  if v_count <> v_distinct then raise exception 'ambiguous duplicate fingerprints'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_owner::text || ':ledger-mutation', 0));

  select * into v_existing from public.import_batches where owner_id = v_owner and idempotency_key = p_idempotency_key;
  if v_existing.id is not null then
    if v_existing.payload_digest <> p_payload_digest then raise exception 'idempotency key reused with different payload'; end if;
    if (select artifact_digest from public.import_artifacts where id = v_existing.artifact_id) <> p_artifact_digest then
      raise exception 'idempotency key reused with different artifact';
    end if;
    return v_existing.id;
  end if;

  select id into v_artifact from public.import_artifacts where owner_id = v_owner and artifact_digest = p_artifact_digest;
  if v_artifact is not null then
    select * into v_existing from public.import_batches where owner_id = v_owner and artifact_id = v_artifact;
    if v_existing.id is not null and v_existing.payload_digest = p_payload_digest then return v_existing.id; end if;
    if v_existing.id is not null then raise exception 'artifact reused with different payload'; end if;
  else
    insert into public.import_artifacts(owner_id, artifact_digest, contract_version)
    values (v_owner, p_artifact_digest, p_contract_version) returning id into v_artifact;
  end if;

  insert into public.import_batches(owner_id, account_id, artifact_id, idempotency_key, payload_digest)
  values (v_owner, p_account_id, v_artifact, p_idempotency_key, p_payload_digest) returning id into v_batch;

  for v_row in select value from jsonb_array_elements(p_rows) loop
    if (v_row ->> 'fingerprint') !~ '^[a-f0-9]{64}$'
       or jsonb_typeof(v_row -> 'components') <> 'array'
       or jsonb_array_length(v_row -> 'components') not between 1 and 2
       or v_row #>> '{postBalance,currency}' <> 'THB' then
      raise exception 'invalid source row';
    end if;
    if jsonb_array_length(v_row -> 'components') = 2 and (
      (select count(*) from jsonb_array_elements(v_row -> 'components') c where c ->> 'kind' = 'deposit') <> 1 or
      (select count(*) from jsonb_array_elements(v_row -> 'components') c where c ->> 'kind' = 'withdrawal') <> 1
    ) then raise exception 'invalid compound row'; end if;
    v_tx := null;
    insert into public.source_transactions(
      owner_id, account_id, fingerprint_version, fingerprint, source_date, source_time, effective_date,
      transaction_label, description, reference, branch, post_balance_minor, currency
    ) values (
      v_owner, p_account_id, 'fingerprint-v1', v_row ->> 'fingerprint', (v_row ->> 'sourceDate')::date,
      nullif(v_row ->> 'sourceTime','')::time, (v_row ->> 'effectiveDate')::date,
      v_row ->> 'transactionLabel', v_row ->> 'description', nullif(v_row ->> 'reference',''),
      nullif(v_row ->> 'branch',''), (v_row #>> '{postBalance,minor}')::bigint, 'THB'
    ) on conflict (owner_id, account_id, fingerprint) do nothing returning id into v_tx;
    v_inserted := v_tx is not null;
    if not v_inserted then
      select id into strict v_tx from public.source_transactions where owner_id = v_owner and account_id = p_account_id and fingerprint = v_row ->> 'fingerprint';
    end if;
    if v_inserted then
      v_position := 0;
      for v_component in select value from jsonb_array_elements(v_row -> 'components') loop
        v_position := v_position + 1;
        insert into public.source_components(owner_id, transaction_id, position, kind, amount_minor, currency)
        values (v_owner, v_tx, v_position, v_component ->> 'kind', (v_component #>> '{amount,minor}')::bigint, v_component #>> '{amount,currency}');
      end loop;
    end if;
    insert into public.import_batch_rows(owner_id, batch_id, transaction_id, source_index, page, row_number, parser_fields, linked_existing)
    values (
      v_owner, v_batch, v_tx, (v_row ->> 'sourceIndex')::integer,
      (v_row #>> '{provenance,page}')::integer, (v_row #>> '{provenance,row}')::integer,
      coalesce(v_row #> '{provenance,parserFields}', '{}'::jsonb), not v_inserted
    );
  end loop;

  insert into public.audit_events(owner_id, actor_id, event_type, entity_type, entity_id, detail)
  values (v_owner, v_owner, 'import.confirmed', 'import_batch', v_batch, jsonb_build_object('payload_digest', p_payload_digest, 'row_count', v_count));
  update public.mutation_sequences set sequence = sequence + 1, updated_at = now() where owner_id = v_owner;
  return v_batch;
end;
$$;
revoke all on function public.confirm_import(uuid,text,text,uuid,text,jsonb) from public, anon;
grant execute on function public.confirm_import(uuid,text,text,uuid,text,jsonb) to authenticated;

create or replace function public.update_transaction_overlay(p_transaction_id uuid, p_expected_revision integer, p_overlay jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_owner uuid := auth.uid();
  v_revision integer;
  v_snapshot jsonb;
begin
  if not private.has_strong_owner_access(v_owner) then raise exception 'strong owner access required'; end if;
  if not exists (select 1 from public.source_transactions where id = p_transaction_id and owner_id = v_owner) then raise exception 'transaction not owned'; end if;
  select revision into v_revision from public.transaction_overlays where transaction_id = p_transaction_id and owner_id = v_owner for update;
  v_revision := coalesce(v_revision, 0);
  if v_revision <> p_expected_revision then raise exception 'overlay revision conflict'; end if;
  v_revision := v_revision + 1;
  insert into public.transaction_overlays(transaction_id, owner_id, category_id, description, counterparty, effective_date, note, include_in_reporting, revision)
  values (
    p_transaction_id, v_owner, nullif(p_overlay ->> 'category_id','')::uuid, nullif(p_overlay ->> 'description',''),
    nullif(p_overlay ->> 'counterparty',''), nullif(p_overlay ->> 'effective_date','')::date, nullif(p_overlay ->> 'note',''),
    coalesce((p_overlay ->> 'include_in_reporting')::boolean, true), v_revision
  ) on conflict (transaction_id) do update set
    category_id = excluded.category_id, description = excluded.description, counterparty = excluded.counterparty,
    effective_date = excluded.effective_date, note = excluded.note, include_in_reporting = excluded.include_in_reporting,
    revision = excluded.revision, updated_at = now();
  select to_jsonb(o) into v_snapshot from public.transaction_overlays o where transaction_id = p_transaction_id;
  insert into public.overlay_revisions(owner_id, transaction_id, revision, snapshot, changed_by)
  values (v_owner, p_transaction_id, v_revision, v_snapshot, v_owner);
  insert into public.audit_events(owner_id, actor_id, event_type, entity_type, entity_id, detail)
  values (v_owner, v_owner, 'overlay.updated', 'source_transaction', p_transaction_id, jsonb_build_object('revision', v_revision));
  update public.mutation_sequences set sequence = sequence + 1, updated_at = now() where owner_id = v_owner;
  return v_snapshot;
end;
$$;
revoke all on function public.update_transaction_overlay(uuid,integer,jsonb) from public, anon;
grant execute on function public.update_transaction_overlay(uuid,integer,jsonb) to authenticated;

create or replace function public.mark_backup_exported(p_payload_digest text)
returns bigint
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare v_owner uuid := auth.uid(); v_sequence bigint;
begin
  if not private.has_strong_owner_access(v_owner) then raise exception 'strong owner access required'; end if;
  if p_payload_digest !~ '^[a-f0-9]{64}$' then raise exception 'invalid digest'; end if;
  select sequence into v_sequence from public.mutation_sequences where owner_id = v_owner for update;
  insert into public.backup_records(owner_id, mutation_sequence, payload_digest, confirmed_by)
  values (v_owner, v_sequence, p_payload_digest, v_owner) on conflict (owner_id, payload_digest) do nothing;
  update public.mutation_sequences set last_exported_sequence = v_sequence, updated_at = now() where owner_id = v_owner;
  return v_sequence;
end;
$$;
revoke all on function public.mark_backup_exported(text) from public, anon;
grant execute on function public.mark_backup_exported(text) to authenticated;

commit;
