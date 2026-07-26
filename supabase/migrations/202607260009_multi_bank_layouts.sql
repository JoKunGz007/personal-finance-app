-- Admit the SCB and KBANK layouts (DECISIONS D-041).
--
-- Migration 001 pinned `accounts.bank_code` to 'KTB' and
-- `import_artifacts.contract_version` to 'krungthai-layout-v1', and confirm_import
-- repeated both. That was right while one reader existed and is wrong now that three do:
-- a statement read under scb-layout-v1 could be parsed, bound and reconciled and still
-- not reach the ledger.
--
-- Widening a CHECK is the easy half. The half that matters is that confirm_import
-- recomputed every row fingerprint with the literal 'KTB', while the client computes it
-- from the statement's own bank code (lib/canonical.ts rowFingerprint). Left alone, every
-- SCB and KBANK import would have failed with 'fingerprint mismatch' — a message pointing
-- at tampering for what is in fact a hard-coded constant. The bank code now comes from the
-- bound account, which is the only authority for it that the server trusts.
--
-- That change makes the pairing enforceable, so it is enforced: a contract version reads
-- exactly one bank's layout, and the account it is confirmed into must be that bank's.
-- Without it, binding an SCB statement to a KTB account would surface as a fingerprint
-- mismatch rather than as what it is.
--
-- Everything else about confirm_import is unchanged from migration 008.

-- The same mapping as CONTRACT_BANK in lib/statement-frame.ts. An unknown contract
-- version returns null, which the caller treats as an invalid contract.
create or replace function private.contract_bank_code(p_contract_version text)
returns text language sql immutable
set search_path = pg_catalog
as $$
  select case p_contract_version
    when 'krungthai-layout-v1' then 'KTB'
    when 'scb-layout-v1' then 'SCB'
    when 'kbank-layout-v1' then 'KBANK'
  end
$$;
revoke all on function private.contract_bank_code(text) from public, anon, authenticated;

-- Dropped by discovered name rather than by an assumed one: these were created inline in
-- migration 001, so their names are PostgreSQL's own and a wrong guess would fail the
-- whole migration.
do $$
declare v_name text;
begin
  select conname into v_name from pg_constraint
   where conrelid = 'public.accounts'::regclass and contype = 'c'
     and pg_get_constraintdef(oid) like '%bank_code%';
  if v_name is not null then execute format('alter table public.accounts drop constraint %I', v_name); end if;

  select conname into v_name from pg_constraint
   where conrelid = 'public.import_artifacts'::regclass and contype = 'c'
     and pg_get_constraintdef(oid) like '%contract_version%';
  if v_name is not null then execute format('alter table public.import_artifacts drop constraint %I', v_name); end if;
end $$;

alter table public.accounts
  add constraint accounts_bank_code_check check (bank_code in ('KTB', 'SCB', 'KBANK'));
alter table public.import_artifacts
  add constraint import_artifacts_contract_version_check
  check (contract_version in ('krungthai-layout-v1', 'scb-layout-v1', 'kbank-layout-v1'));

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
    values(v_owner,v_owner,'import.confirmed','import_batch',v_batch,jsonb_build_object('payload_digest',v_digest,'row_count',v_count));
  update public.mutation_sequences set sequence=sequence+1,updated_at=now() where owner_id=v_owner;
  return v_batch;
end;
$$;
revoke all on function public.confirm_import(uuid,text,text,uuid,text,date,date,text,text,text,jsonb) from public,anon;
grant execute on function public.confirm_import(uuid,text,text,uuid,text,date,date,text,text,text,jsonb) to authenticated;
