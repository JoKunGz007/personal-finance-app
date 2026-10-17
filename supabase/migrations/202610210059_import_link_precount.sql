-- Read-only pre-count of statement rows confirm_import would link to stored rows.
--
-- The Inbox/mailbox decided "all rows already stored" from an exact-fingerprint count, so a
-- re-printed statement whose rows all link by identity (migration 054) still confirmed an
-- empty batch and artifact (D-280 leftover). The linking rule now lives once, in
-- private.existing_source_row; confirm_import and public.count_existing_import_rows both call
-- it, so the pre-count and the confirm cannot disagree. A stored row is claimed once per
-- statement: every transaction id already linked or inserted for an earlier row of the same
-- payload is passed in p_claimed (equivalent to 054's import_batch_rows exclusion).

create or replace function private.existing_source_row(
  p_owner uuid, p_account_id uuid, p_row jsonb, p_claimed uuid[]
) returns uuid
language plpgsql stable set search_path = public, private, pg_temp
as $$
declare v_tx uuid; v_row_components text[];
begin
  -- 1. Exact fingerprint: the same print of the same row.
  select id into v_tx from public.source_transactions
    where owner_id=p_owner and account_id=p_account_id and fingerprint=p_row->>'fingerprint';
  if v_tx is not null then return v_tx; end if;
  -- 2. Identity match: the same bank row printed differently. Needs a source time.
  if coalesce(p_row->>'sourceTime','') <> '' then
    select array_agg((c.value->>'kind')||':'||(c.value#>>'{amount,minor}') order by c.ordinality)
      into v_row_components from jsonb_array_elements(p_row->'components') with ordinality c(value,ordinality);
    select t.id into v_tx from public.source_transactions t
      where t.owner_id=p_owner and t.account_id=p_account_id
        and t.source_date=(p_row->>'sourceDate')::date
        and t.source_time=(p_row->>'sourceTime')::time
        and t.post_balance_minor=(p_row#>>'{postBalance,minor}')::bigint
        and (select array_agg(sc.kind||':'||sc.amount_minor order by sc.position)
               from public.source_components sc where sc.transaction_id=t.id) = v_row_components
        and t.id <> all(coalesce(p_claimed,'{}'::uuid[]))
      order by t.created_at, t.id limit 1;
  end if;
  return v_tx;
end;
$$;
revoke all on function private.existing_source_row(uuid,uuid,jsonb,uuid[]) from public,anon,authenticated;

create or replace function public.confirm_import(
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
  v_digest text; v_bank_code text; v_account_bank text;
  v_identity_links integer := 0; v_claimed uuid[] := '{}';
begin
  if not private.has_strong_owner_access(v_owner) then raise exception 'strong owner access required'; end if;
  if p_artifact_digest !~ '^[a-f0-9]{64}$' or p_payload_digest !~ '^[a-f0-9]{64}$' then raise exception 'invalid digest'; end if;
  v_bank_code := private.contract_bank_code(p_contract_version);
  if v_bank_code is null or p_currency <> 'THB' or p_period_start > p_period_end
     or p_opening_balance_minor !~ '^(0|-?[1-9][0-9]*)$' or p_closing_balance_minor !~ '^(0|-?[1-9][0-9]*)$'
     or (p_opening_balance_minor::numeric not between -9223372036854775808 and 9223372036854775807)
     or (p_closing_balance_minor::numeric not between -9223372036854775808 and 9223372036854775807)
     or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then raise exception 'invalid import contract'; end if;
  select bank_code into v_account_bank from public.accounts where id=p_account_id and owner_id=v_owner and currency=p_currency;
  if v_account_bank is null then raise exception 'account not owned'; end if;
  -- A layout reads one bank. Binding a statement to another bank's account is a
  -- different mistake from a tampered fingerprint and is named as one.
  if v_account_bank <> v_bank_code then raise exception 'contract version does not match account bank'; end if;

  v_digest := private.sha256_jsonb(jsonb_build_object(
    'accountId', p_account_id::text,
    'contractVersion', p_contract_version,
    'currency', p_currency,
    'periodStart', to_char(p_period_start, 'YYYY-MM-DD'),
    'periodEnd', to_char(p_period_end, 'YYYY-MM-DD'),
    'openingBalance', p_opening_balance_minor,
    'closingBalance', p_closing_balance_minor,
    'rows', p_rows
  ));
  if p_payload_digest <> v_digest then raise exception 'payload digest mismatch'; end if;

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
    -- Bind the fingerprint to the row's identity facts (never trust the caller's claim).
    -- The bank code is the bound account's, not a literal: the client hashes the bank the
    -- statement was read as, and the account is the server's only authority on which that
    -- is. Hard-coding 'KTB' here rejected every non-Krungthai import.
    if v_row->>'fingerprint' is distinct from private.row_fingerprint(p_account_id, v_account_bank, v_row) then
      raise exception 'fingerprint mismatch';
    end if;
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
    if v_existing.payload_digest<>v_digest or v_existing.period_start<>p_period_start
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
      if v_existing.payload_digest=v_digest and v_existing.period_start=p_period_start
        and v_existing.period_end=p_period_end and v_existing.opening_balance_minor::text=p_opening_balance_minor
        and v_existing.closing_balance_minor::text=p_closing_balance_minor and v_existing.currency=p_currency
        then return v_existing.id; end if;
      raise exception 'artifact reused with different payload';
    end if;
  end if;
  insert into public.import_batches(owner_id,account_id,artifact_id,idempotency_key,payload_digest,period_start,period_end,opening_balance_minor,closing_balance_minor,currency)
    values(v_owner,p_account_id,v_artifact,p_idempotency_key,v_digest,p_period_start,p_period_end,p_opening_balance_minor::bigint,p_closing_balance_minor::bigint,p_currency)
    returning id into v_batch;
  for v_row in select value from jsonb_array_elements(p_rows) loop
    -- 1 and 2. The one linking rule (exact fingerprint, then identity facts), shared with
    -- count_existing_import_rows. Rows of this batch already linked or inserted are claimed.
    v_tx := private.existing_source_row(v_owner, p_account_id, v_row, v_claimed);
    v_inserted := v_tx is null;
    if v_tx is not null and (select fingerprint from public.source_transactions where id=v_tx) <> v_row->>'fingerprint' then
      v_identity_links := v_identity_links + 1;
    end if;
    -- 3. Otherwise a new row.
    if v_inserted then
      insert into public.source_transactions(owner_id,account_id,fingerprint_version,fingerprint,source_date,source_time,effective_date,transaction_label,description,reference,branch,post_balance_minor,currency)
      values(v_owner,p_account_id,'fingerprint-v1',v_row->>'fingerprint',(v_row->>'sourceDate')::date,nullif(v_row->>'sourceTime','')::time,(v_row->>'effectiveDate')::date,
        v_row->>'transactionLabel',v_row->>'description',nullif(v_row->>'reference',''),nullif(v_row->>'branch',''),(v_row#>>'{postBalance,minor}')::bigint,p_currency)
      returning id into v_tx;
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
    v_claimed := v_claimed || v_tx;
  end loop;
  insert into public.audit_events(owner_id,actor_id,event_type,entity_type,entity_id,detail)
    values(v_owner,v_owner,'import.confirmed','import_batch',v_batch,jsonb_build_object('payload_digest',v_digest,'row_count',v_count,'identity_links',v_identity_links));
  update public.mutation_sequences set sequence=sequence+1,updated_at=now() where owner_id=v_owner;
  return v_batch;
end;
$$;
revoke all on function public.confirm_import(uuid,text,text,uuid,text,date,date,text,text,text,jsonb) from public,anon;
grant execute on function public.confirm_import(uuid,text,text,uuid,text,date,date,text,text,text,jsonb) to authenticated;

create or replace function public.count_existing_import_rows(p_account_id uuid, p_rows jsonb)
returns integer
language plpgsql stable security definer set search_path = public, private, pg_temp
as $$
declare
  v_owner uuid := auth.uid(); v_account_bank text; v_row jsonb; v_tx uuid;
  v_claimed uuid[] := '{}'; v_found integer := 0;
begin
  if not private.has_strong_owner_access(v_owner) then raise exception 'strong owner access required'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then raise exception 'invalid import contract'; end if;
  select bank_code into v_account_bank from public.accounts where id=p_account_id and owner_id=v_owner;
  if v_account_bank is null then raise exception 'account not owned'; end if;
  for v_row in select value from jsonb_array_elements(p_rows) loop
    if v_row->>'fingerprint' is distinct from private.row_fingerprint(p_account_id, v_account_bank, v_row) then
      raise exception 'fingerprint mismatch';
    end if;
    v_tx := private.existing_source_row(v_owner, p_account_id, v_row, v_claimed);
    if v_tx is not null then v_found := v_found + 1; v_claimed := v_claimed || v_tx; end if;
  end loop;
  return v_found;
end;
$$;
revoke all on function public.count_existing_import_rows(uuid,jsonb) from public,anon;
grant execute on function public.count_existing_import_rows(uuid,jsonb) to authenticated;
