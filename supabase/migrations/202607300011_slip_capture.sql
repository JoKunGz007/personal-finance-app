-- Slip capture: the provisional half of the ledger (D-050, PLAN task 20).
--
-- A slip is **not** an authoritative row and this migration is careful never to let it
-- become one. Every row in `source_transactions` arrived through `confirm_import`, which
-- cross-checks it against the bank's own printed totals; a slip has no arithmetic to check
-- against, so promoting one would invert the trust model the whole ledger rests on. Slips
-- therefore live in their own table, carry no `account_id`, and are matched against
-- statement rows later (task 22) rather than merged into them now.
--
-- Three consequences of that framing show up as structure below:
--
--   * **No account binding.** The QR names a *bank*, not an account. Asking the owner to
--     pick an account at capture time would invite a wrong answer for no benefit, since
--     the statement is what will eventually say which account it was.
--   * **No image.** D-050 stores what cannot be reconstructed: the QR payload and the
--     owner's confirmed values. The image already lives in the owner's photos, better
--     backed up than this app would manage, and storing it would either bloat the backup
--     from kilobytes to hundreds of megabytes or move it outside the backup entirely and
--     cost the property that one file restores everything.
--   * **Identity comes from the QR, values from the owner.** The unique key is the bank
--     and the QR's transaction reference, so sharing the same slip twice is a no-op. That
--     matters more here than anywhere else in the app: share-to-app makes double-capture
--     the *expected* accident rather than an unlikely one.
--
-- The backup schema moves 2 -> 3 because a twelfth table now exists, and `restore_backup`
-- accepts **both**. That compatibility is not politeness: the owner holds exactly one
-- backup covering the whole ledger and it is a v2 file, so a hard bump would strand it the
-- moment this migration landed. A v2 payload restores with no slips, which is exactly what
-- a ledger taken before slips existed contained.

begin;

create table public.slips (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.ledger_owners(owner_id),
  -- Deliberately the same CHECK vocabulary as public.accounts rather than a restatement of
  -- the bank list. Migration 009 exists because `confirm_import` restated 'KTB' as a
  -- literal and silently gated two banks out of the product (D-041); the lesson is that a
  -- bank list belongs in exactly one place per table.
  bank_code text not null check (bank_code in ('KTB','SCB','KBANK')),
  -- What the QR carried, kept beside the resolved bank so a row records what was read and
  -- not only what it was mapped to.
  bank_qr_code text not null check (bank_qr_code ~ '^[0-9]{3}$'),
  slip_reference text not null check (slip_reference ~ '^[0-9A-Za-z]{1,64}$'),
  qr_payload text not null check (length(qr_payload) between 1 and 512),
  -- The same two words `source_components` uses, so task 22 reconciles like against like
  -- instead of translating between two vocabularies for one concept.
  kind text not null check (kind in ('deposit','withdrawal')),
  amount_minor bigint not null,
  currency text not null check (currency = 'THB'),
  occurred_on date not null,
  occurred_at_time time,
  counterparty text check (counterparty is null or length(btrim(counterparty)) between 1 and 240),
  category_id uuid,
  note text check (note is null or length(note) <= 2000),
  captured_at timestamptz not null default now(),
  foreign key (category_id, owner_id) references public.categories(id, owner_id),
  check ((kind = 'deposit' and amount_minor > 0) or (kind = 'withdrawal' and amount_minor < 0)),
  -- The dedup key, and the reason the QR is read before anything is asked of the owner.
  unique (owner_id, bank_code, slip_reference),
  unique (id, owner_id)
);

create index slips_owner_occurred_on on public.slips(owner_id, occurred_on);

-- Append-only, like every other ledger-fact table. The confirm form is where a wrong
-- amount gets caught: the owner reads the slip and types the value, so capture is already
-- a review step. Correcting a captured slip is deliberately not offered yet — the pattern
-- for it exists (`transaction_overlays` plus `overlay_revisions`) and adding it here would
-- have tripled this migration for a case the confirm step is meant to prevent. Recorded as
-- a known limitation rather than an oversight.
create trigger slips_immutable before update or delete on public.slips
  for each row execute function private.reject_change();

alter table public.slips enable row level security;
alter table public.slips force row level security;
create policy strong_owner_select on public.slips for select to authenticated
  using (private.has_strong_owner_access(owner_id));

grant select on public.slips to authenticated;
-- The only write path is `capture_slip`. Stated rather than assumed, matching migration
-- 010's closing note: a future blanket grant must not quietly open a way around it.
revoke insert, update, delete on public.slips from authenticated, anon;

-- A captured slip is a new fact in the ledger, so the previous backup no longer covers
-- everything. Widening the accepted restore versions is what lets a v2 file still land.
alter table public.restore_runs
  drop constraint if exists restore_runs_schema_version_check,
  add constraint restore_runs_schema_version_check check (schema_version in (1,2,3));

-- The second place the table list is written down. Migration 004 enumerated the eleven
-- kinds as a CHECK on staged chunks, so a twelfth chunk was refused by the constraint
-- before `restore_backup` ever saw it — the failure surfaced as a raw row-level violation
-- naming chunk_index 11, not as a contract error. Both enumerations have to move together;
-- that they are two is exactly the D-041 shape, where one restated bank list gated two
-- banks out of the product.
alter table public.restore_chunks
  drop constraint if exists restore_chunks_v2_binding,
  add constraint restore_chunks_v2_binding check (
    chunk_kind is null or (
      chunk_kind in ('accounts','categories','import_artifacts','import_batches','source_transactions',
        'source_components','import_batch_rows','transaction_overlays','overlay_revisions','audit_events',
        'mutation_sequences','slips')
      and row_count >= 0 and chunk_digest ~ '^[a-f0-9]{64}$'
    )
  );

create or replace function public.capture_slip(p_request jsonb)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp
as $$
declare
  v_owner uuid := auth.uid();
  v_slip public.slips%rowtype;
  v_existing public.slips%rowtype;
  v_amount text := p_request->>'amountMinor';
  v_occurred_on date;
  v_captured boolean := true;
begin
  if not private.has_strong_owner_access(v_owner) then raise exception 'strong owner access required'; end if;

  -- Money crosses the wire as canonical text and is validated as such before any cast.
  -- The int64 bound is the point: a value outside it would otherwise surface as an
  -- uncaught 22P02 halfway through, rather than as a refusal the route can map.
  if jsonb_typeof(p_request->'amountMinor') is distinct from 'string'
    or not private.is_canonical_int64_text(v_amount)
    then raise exception 'slip amount must be canonical int64 text'; end if;

  begin
    v_occurred_on := (p_request->>'occurredOn')::date;
  exception when others then raise exception 'invalid slip date'; end;

  -- The Buddhist-era guard D-050 asked for, and the reason it is here rather than in a
  -- CHECK: a CHECK constraint cannot call current_date. A Thai slip printing `2569` typed
  -- through unconverted lands 543 years in the future and is refused outright, which is
  -- the fail-closed behaviour D-031 established for the same 543-year shift in statements.
  if v_occurred_on > current_date + 1 or v_occurred_on < (current_date - interval '10 years')::date then
    raise exception 'slip date is outside the plausible window';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_owner::text || ':ledger-mutation', 0));

  -- Idempotent on the QR identity. A re-share returns what was already stored and changes
  -- nothing — including when the owner types a different amount the second time, because
  -- the table is append-only and silently overwriting a confirmed value would be worse
  -- than refusing to. The caller is told which of the two happened.
  select * into v_existing from public.slips
    where owner_id = v_owner
      and bank_code = p_request->>'bankCode'
      and slip_reference = p_request->>'slipReference';
  if v_existing.id is not null then
    v_slip := v_existing;
    v_captured := false;
  else
    begin
      insert into public.slips(owner_id, bank_code, bank_qr_code, slip_reference, qr_payload, kind,
        amount_minor, currency, occurred_on, occurred_at_time, counterparty, category_id, note)
      values (v_owner, p_request->>'bankCode', p_request->>'bankQrCode', p_request->>'slipReference',
        p_request->>'qrPayload', p_request->>'kind', v_amount::bigint, coalesce(p_request->>'currency','THB'),
        v_occurred_on, nullif(p_request->>'occurredAtTime','')::time,
        nullif(btrim(coalesce(p_request->>'counterparty','')),''), nullif(p_request->>'categoryId','')::uuid,
        nullif(p_request->>'note',''))
      returning * into v_slip;
    exception
      when check_violation then raise exception 'invalid slip';
      when foreign_key_violation then raise exception 'slip category not owned';
      when not_null_violation then raise exception 'invalid slip';
      -- A malformed category id or time casts inside this INSERT, so a 22P02 would
      -- otherwise escape as a bare SQL error rather than something the route can map.
      when invalid_text_representation then raise exception 'invalid slip';
      -- Unreachable while the select above holds the advisory lock, but a unique violation
      -- here would mean the dedup check and the constraint disagree, which is worth naming.
      when unique_violation then raise exception 'slip already captured';
    end;

    insert into public.audit_events(owner_id, actor_id, event_type, entity_type, entity_id, detail)
      values (v_owner, v_owner, 'slip.capture', 'slip', v_slip.id,
        jsonb_build_object('bank_code', v_slip.bank_code, 'kind', v_slip.kind,
          'occurred_on', v_slip.occurred_on, 'currency', v_slip.currency));

    update public.mutation_sequences set sequence = sequence + 1, updated_at = now() where owner_id = v_owner;
  end if;

  return jsonb_build_object('captured', v_captured, 'slip',
    to_jsonb(v_slip) - 'amount_minor' || jsonb_build_object('amount_minor', v_slip.amount_minor::text));
end;
$$;
revoke all on function public.capture_slip(jsonb) from public, anon;
grant execute on function public.capture_slip(jsonb) to authenticated;

-- Backup now carries twelve tables and states version 3. `slips` is appended rather than
-- slotted in alphabetically so that indices 0..10 keep meaning exactly what they meant in
-- v2 — the manifest binds a chunk to its index, so reordering would invalidate every
-- descriptor in a way no digest could distinguish from tampering.
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
    'slips',(select coalesce(jsonb_agg(to_jsonb(x)-'amount_minor'||jsonb_build_object('amount_minor',amount_minor::text) order by id),'[]') from public.slips x where owner_id=v_owner)
  );
  select jsonb_object_agg(key,jsonb_array_length(value)) into v_counts from jsonb_each(v_data);
  return jsonb_build_object('schemaVersion',3,'exportedAt',to_char(v_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'snapshotSequence',v_sequence::text,'tableCounts',v_counts,'data',v_data);
end;
$$;
revoke all on function public.export_backup_snapshot() from public,anon;
grant execute on function public.export_backup_snapshot() to authenticated;

-- restore_backup, version-parametrized.
--
-- The 11s and the 0..10 loops are gone: the table list and its length are now derived from
-- the payload's own declared schema version, which is bound into the restore run at stage
-- time and re-checked on every subsequent action. A v2 payload therefore restores exactly
-- as it did before this migration — same kinds, same indices, same digests — and cannot
-- silently acquire a twelfth chunk, while a v3 payload must carry one.
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
 if v_schema_text not in ('2','3') or v_digest!~'^[a-f0-9]{64}$' then raise exception 'invalid restore contract'; end if;
 v_schema:=v_schema_text::integer;
 v_expected_kinds:=case when v_schema=3 then v_base_kinds||array['slips'] else v_base_kinds end;
 v_kind_count:=array_length(v_expected_kinds,1);
 perform pg_advisory_xact_lock(hashtextextended(v_owner::text||':ledger-mutation',0));
  if p_action='stage' then
   v_manifest:=p_request->'manifest';
   if jsonb_typeof(v_manifest) is distinct from 'object'
     or jsonb_typeof(v_manifest->'payloadDigest') is distinct from 'string'
     or v_manifest->>'payloadDigest' is distinct from v_digest
     or jsonb_typeof(v_manifest->'snapshotSequence') is distinct from 'string'
     or not private.is_canonical_int64_text(v_manifest->>'snapshotSequence',true)
     -- Reserve headroom for the single post-commit increment (blocker 4, migration 006).
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
      -- Counts must be canonical non-negative integers, not fractional numbers (blocker 3).
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
  -- The staged version is the authority from here on. A run staged as v2 cannot be
  -- continued as v3, which is what stops a payload from growing a chunk mid-restore.
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
    -- Slips count as a non-empty destination even when a v2 payload is being restored:
    -- the check asks whether this ledger already holds records, not whether the incoming
    -- payload has an opinion about them.
    or exists(select 1 from public.slips where owner_id=v_owner)
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
