begin;
create extension if not exists pgtap with schema extensions;
select plan(30);

-- Keep the test independent of the synthetic seed while preserving its owner.
set local session_replication_role = replica;
delete from public.restore_chunks;
delete from public.restore_runs;
delete from public.backup_records;
delete from public.overlay_revisions;
delete from public.transaction_overlays;
delete from public.import_batch_rows;
delete from public.source_components;
delete from public.source_transactions;
delete from public.audit_events;
delete from public.import_batches;
delete from public.import_artifacts;
delete from public.categories;
delete from public.accounts;
update public.mutation_sequences
set sequence = 0, last_exported_sequence = 0, updated_at = '2026-07-24T00:00:00Z'
where owner_id = '11111111-1111-4111-8111-111111111111';
delete from auth.mfa_factors
where user_id = '11111111-1111-4111-8111-111111111111';
set local session_replication_role = origin;

insert into auth.mfa_factors(id, user_id, friendly_name, factor_type, status, secret, created_at, updated_at)
values
  (
    'aaaaaaaa-0000-4000-8000-000000000011',
    '11111111-1111-4111-8111-111111111111',
    'restore contract TOTP one', 'totp', 'verified', 'SYNTHETICRESTOREONE',
    '2026-07-24T00:00:00Z', '2026-07-24T00:00:00Z'
  ),
  (
    'aaaaaaaa-0000-4000-8000-000000000012',
    '11111111-1111-4111-8111-111111111111',
    'restore contract TOTP two', 'totp', 'verified', 'SYNTHETICRESTORETWO',
    '2026-07-24T00:00:00Z', '2026-07-24T00:00:00Z'
  );

select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal2"}',
  true
);

create temporary table restore_fixtures (
  name text primary key,
  restore_id uuid not null,
  idempotency_key uuid not null,
  chunks jsonb not null,
  payload jsonb,
  manifest jsonb,
  digest text
);

create function pg_temp.finalize_restore_fixture(p_name text)
returns void language plpgsql
as $$
declare
  v_chunks jsonb;
  v_data jsonb := '{}'::jsonb;
  v_counts jsonb := '{}'::jsonb;
  v_descriptors jsonb := '[]'::jsonb;
  v_chunk jsonb;
  v_index integer;
  v_payload jsonb;
  v_digest text;
begin
  select chunks into v_chunks from restore_fixtures where name = p_name;
  for v_index in 0..10 loop
    v_chunk := v_chunks->v_index;
    v_data := jsonb_set(v_data, array[v_chunk->>'kind'], v_chunk->'rows', true);
    v_counts := jsonb_set(v_counts, array[v_chunk->>'kind'], to_jsonb(jsonb_array_length(v_chunk->'rows')), true);
    v_descriptors := v_descriptors || jsonb_build_array(jsonb_build_object(
      'index', v_index,
      'kind', v_chunk->>'kind',
      'rowCount', jsonb_array_length(v_chunk->'rows'),
      'sha256', private.sha256_jsonb(v_chunk)
    ));
  end loop;
  v_payload := jsonb_build_object(
    'schemaVersion', 2,
    'exportedAt', '2026-07-24T00:00:00.000000Z',
    'snapshotSequence', '7',
    'tableCounts', v_counts,
    'data', v_data
  );
  v_digest := private.sha256_jsonb(v_payload);
  update restore_fixtures
  set payload = v_payload,
      digest = v_digest,
      manifest = jsonb_build_object(
        'payloadDigest', v_digest,
        'snapshotSequence', '7',
        'exportedAt', '2026-07-24T00:00:00.000000Z',
        'tableCounts', v_counts,
        'chunks', v_descriptors
      )
  where name = p_name;
end;
$$;

create function pg_temp.restore_request(p_name text, p_index integer default null)
returns jsonb language sql stable
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'restoreId', restore_id,
    'idempotencyKey', idempotency_key,
    'schemaVersion', 2,
    'digest', digest,
    'manifest', case when p_index is null then manifest else null end,
    'chunkIndex', p_index,
    'chunkDigest', case when p_index is null then null else manifest#>>array['chunks',p_index::text,'sha256'] end,
    'chunk', case when p_index is null then null else chunks->p_index end
  ))
  from restore_fixtures
  where name = p_name
$$;

insert into restore_fixtures(name, restore_id, idempotency_key, chunks)
select fixture.name, fixture.restore_id, fixture.idempotency_key, chunks.value
from (
  values
    ('main',       'cccccccc-0000-4000-8000-000000000001'::uuid, 'dddddddd-0000-4000-8000-000000000001'::uuid),
    ('incomplete', 'cccccccc-0000-4000-8000-000000000002'::uuid, 'dddddddd-0000-4000-8000-000000000002'::uuid),
    ('typed',      'cccccccc-0000-4000-8000-000000000003'::uuid, 'dddddddd-0000-4000-8000-000000000003'::uuid),
    ('canonical',  'cccccccc-0000-4000-8000-000000000004'::uuid, 'dddddddd-0000-4000-8000-000000000004'::uuid),
    ('overwrite',  'cccccccc-0000-4000-8000-000000000005'::uuid, 'dddddddd-0000-4000-8000-000000000005'::uuid),
    ('tamper',     'cccccccc-0000-4000-8000-000000000006'::uuid, 'dddddddd-0000-4000-8000-000000000006'::uuid),
    ('fracount',   'cccccccc-0000-4000-8000-000000000007'::uuid, 'dddddddd-0000-4000-8000-000000000007'::uuid),
    ('seqmax',     'cccccccc-0000-4000-8000-000000000008'::uuid, 'dddddddd-0000-4000-8000-000000000008'::uuid)
) as fixture(name, restore_id, idempotency_key)
cross join lateral (
  select jsonb_agg(
    jsonb_build_object(
      'kind', kind,
      'rows', case when kind = 'mutation_sequences'
        then jsonb_build_array(jsonb_build_object(
          'owner_id', '11111111-1111-4111-8111-111111111111',
          'sequence', '7',
          'last_exported_sequence', '7',
          'updated_at', '2026-07-24T00:00:00Z'
        ))
        else '[]'::jsonb
      end
    )
    order by chunk_index
  ) as value
  from unnest(array[
    'accounts','categories','import_artifacts','import_batches','source_transactions',
    'source_components','import_batch_rows','transaction_overlays','overlay_revisions',
    'audit_events','mutation_sequences'
  ]) with ordinality as expected(kind, chunk_index)
) as chunks;

update restore_fixtures
set chunks = jsonb_set(chunks, '{10,rows,0,sequence}', '7'::jsonb)
where name = 'typed';
update restore_fixtures
set chunks = jsonb_set(chunks, '{10,rows,0,sequence}', '"07"'::jsonb)
where name = 'canonical';
select pg_temp.finalize_restore_fixture(name) from restore_fixtures;

select lives_ok(
  $$select public.restore_backup('stage', pg_temp.restore_request('main'))$$,
  'a valid schema-v2 manifest stages'
);
select is(
  public.restore_backup('stage', pg_temp.restore_request('main'))->>'id',
  'cccccccc-0000-4000-8000-000000000001',
  'identical stage replay returns the same restore'
);
select throws_ok(
  $$select public.restore_backup(
    'stage',
    pg_temp.restore_request('main') || '{"restoreId":"cccccccc-0000-4000-8000-000000000099"}'::jsonb
  )$$,
  'P0001',
  'restore idempotency conflict',
  'stage replay with a different restore binding conflicts'
);
select throws_ok(
  $$select public.restore_backup(
    'stage',
    jsonb_set(pg_temp.restore_request('main'), '{manifest,chunks,0,rowCount}', '1'::jsonb)
  )$$,
  'P0001',
  'invalid restore manifest descriptor',
  'a descriptor count inconsistent with tableCounts is rejected'
);

select lives_ok(
  $$select public.restore_backup('chunk', pg_temp.restore_request('main', 0))$$,
  'an exactly bound chunk stages'
);
select lives_ok(
  $$select public.restore_backup('chunk', pg_temp.restore_request('main', 0))$$,
  'an exact chunk replay is idempotent'
);
select is(
  (select count(*)::integer from public.restore_chunks
   where restore_id = 'cccccccc-0000-4000-8000-000000000001' and chunk_index = 0),
  1,
  'exact chunk replay creates no duplicate'
);
select throws_ok(
  $$select public.restore_backup(
    'chunk',
    jsonb_set(pg_temp.restore_request('main', 1), '{chunk,rows}', '[{}]'::jsonb)
  )$$,
  'P0001',
  'restore chunk binding mismatch',
  'a chunk that does not match its descriptor is rejected'
);

select lives_ok(
  $$select public.restore_backup('stage', pg_temp.restore_request('overwrite'));
    select public.restore_backup('chunk', pg_temp.restore_request('overwrite', 0))$$,
  'overwrite test fixture stages its original chunk'
);
update public.restore_chunks
set chunk = '{"kind":"accounts","rows":[{}]}'::jsonb,
    row_count = 1,
    chunk_digest = repeat('f', 64)
where restore_id = 'cccccccc-0000-4000-8000-000000000005' and chunk_index = 0;
select throws_ok(
  $$select public.restore_backup('chunk', pg_temp.restore_request('overwrite', 0))$$,
  'P0001',
  'restore chunk overwrite rejected',
  'an existing divergent chunk cannot be overwritten through the RPC'
);

select lives_ok(
  $$select public.restore_backup('stage', pg_temp.restore_request('incomplete'))$$,
  'incomplete test fixture stages'
);
select throws_ok(
  $$select public.restore_backup('commit', pg_temp.restore_request('incomplete'))$$,
  'P0001',
  'restore chunks incomplete',
  'commit rejects an incomplete chunk set'
);

select lives_ok(
  $$select public.restore_backup('stage', pg_temp.restore_request('typed'))$$,
  'typed-sequence test fixture stages'
);
select throws_ok(
  $$select public.restore_backup('chunk', pg_temp.restore_request('typed', 10))$$,
  'P0001',
  'restore mutation sequence mismatch',
  'mutation sequence encoded as a JSON number is rejected'
);
select lives_ok(
  $$select public.restore_backup('stage', pg_temp.restore_request('canonical'))$$,
  'canonical-sequence test fixture stages'
);
select throws_ok(
  $$select public.restore_backup('chunk', pg_temp.restore_request('canonical', 10))$$,
  'P0001',
  'restore mutation sequence mismatch',
  'non-canonical mutation sequence text is rejected'
);

select lives_ok(
  $test$
  do $body$
  begin
    for v_index in 0..10 loop
      perform public.restore_backup('chunk', pg_temp.restore_request('main', v_index));
    end loop;
  end
  $body$
  $test$,
  'all 11 ordered chunk kinds stage'
);
select is(
  public.restore_backup('commit', pg_temp.restore_request('main'))->>'status',
  'applied',
  'the complete aggregate commits successfully'
);
select is(
  public.restore_backup('commit', pg_temp.restore_request('main'))->>'status',
  'applied',
  'an applied commit replay returns the applied restore'
);
select is(
  (select sequence::text from public.mutation_sequences
   where owner_id = '11111111-1111-4111-8111-111111111111'),
  '8',
  'restore increments the restored mutation sequence exactly once'
);
select is(
  (select last_exported_sequence::text from public.mutation_sequences
   where owner_id = '11111111-1111-4111-8111-111111111111'),
  '0',
  'restore marks the ledger backup stale'
);

-- The minimal successful fixture restores no ledger rows, so a separate session
-- can prove commit-time detection of direct staged-chunk alteration.
select lives_ok(
  $test$
  do $body$
  begin
    perform public.restore_backup('stage', pg_temp.restore_request('tamper'));
    for v_index in 0..10 loop
      perform public.restore_backup('chunk', pg_temp.restore_request('tamper', v_index));
    end loop;
  end
  $body$
  $test$,
  'tamper test fixture stages all chunks'
);
update public.restore_chunks
set chunk = '{"kind":"accounts","rows":[{}]}'::jsonb,
    row_count = 1
where restore_id = 'cccccccc-0000-4000-8000-000000000006' and chunk_index = 0;
select throws_ok(
  $$select public.restore_backup('commit', pg_temp.restore_request('tamper'))$$,
  'P0001',
  'restore chunk altered',
  'commit detects direct staged-chunk tampering'
);

-- Blocker 3: a fractional manifest count must fail closed with a controlled
-- contract error rather than an uncaught integer cast.
select throws_ok(
  $$select public.restore_backup(
    'stage',
    jsonb_set(pg_temp.restore_request('fracount'), '{manifest,chunks,0,rowCount}', '0.5'::jsonb)
  )$$,
  'P0001',
  'invalid restore manifest descriptor',
  'a fractional manifest row count is rejected'
);

-- Blocker 4: a staged snapshot sequence at signed-int64 maximum must be refused so
-- the single post-commit increment cannot overflow bigint.
select throws_ok(
  $$select public.restore_backup(
    'stage',
    jsonb_set(pg_temp.restore_request('seqmax'), '{manifest,snapshotSequence}', '"9223372036854775807"'::jsonb)
  )$$,
  'P0001',
  'invalid restore manifest',
  'a snapshot sequence at int64 maximum is rejected'
);

-- Blocker 2: prove a fully populated ledger round-trips. Populate every ledger table
-- for the owner, export the canonical snapshot, derive a restore fixture from it,
-- rewrite the owner to a foreign id to prove remapping, wipe, then restore. A
-- re-export must reproduce the payload byte-for-byte (schemas, foreign keys, money
-- fields, and audit rows), and every restored row must be owned by the caller.
set local session_replication_role = replica;
insert into public.accounts(id, owner_id, bank_code, label, account_type, last_four, currency, timezone, created_at)
values ('22220000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'KTB', 'Synthetic round-trip account', 'savings', '4242', 'THB', 'Asia/Bangkok', '2026-07-01T00:00:00Z');
insert into public.categories(id, owner_id, name, archived, created_at, updated_at)
values ('22220000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'Synthetic category', false, '2026-07-01T00:00:00Z', '2026-07-01T00:00:00Z');
insert into public.import_artifacts(id, owner_id, artifact_digest, contract_version, created_at)
values ('22220000-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', repeat('b',64), 'krungthai-layout-v1', '2026-07-01T00:00:00Z');
insert into public.import_batches(id, owner_id, account_id, artifact_id, idempotency_key, payload_digest, status, confirmed_at, period_start, period_end, opening_balance_minor, closing_balance_minor, currency)
values ('22220000-0000-4000-8000-000000000004', '11111111-1111-4111-8111-111111111111', '22220000-0000-4000-8000-000000000001', '22220000-0000-4000-8000-000000000003', '22220000-0000-4000-8000-000000000009', repeat('c',64), 'confirmed', '2026-07-01T00:00:00Z', '2026-06-01', '2026-06-30', '10000', '10100', 'THB');
insert into public.source_transactions(id, owner_id, account_id, fingerprint_version, fingerprint, source_date, source_time, effective_date, transaction_label, description, reference, branch, post_balance_minor, currency, created_at)
values ('22220000-0000-4000-8000-000000000005', '11111111-1111-4111-8111-111111111111', '22220000-0000-4000-8000-000000000001', 'fingerprint-v1', repeat('a',64), '2026-06-02', '09:15:00', '2026-06-02', 'Synthetic credit', 'Synthetic round-trip row', 'SYNTHETIC-RT', 'BR01', 10100, 'THB', '2026-07-01T00:00:00Z');
insert into public.source_components(id, owner_id, transaction_id, position, kind, amount_minor, currency, created_at)
values ('22220000-0000-4000-8000-000000000006', '11111111-1111-4111-8111-111111111111', '22220000-0000-4000-8000-000000000005', 1, 'deposit', 100, 'THB', '2026-07-01T00:00:00Z');
insert into public.import_batch_rows(id, owner_id, batch_id, transaction_id, source_index, page, row_number, parser_fields, linked_existing)
values ('22220000-0000-4000-8000-000000000007', '11111111-1111-4111-8111-111111111111', '22220000-0000-4000-8000-000000000004', '22220000-0000-4000-8000-000000000005', 1, 1, 1, '{"fixture":"roundtrip"}'::jsonb, false);
insert into public.transaction_overlays(transaction_id, owner_id, category_id, description, counterparty, effective_date, note, include_in_reporting, revision, updated_at)
values ('22220000-0000-4000-8000-000000000005', '11111111-1111-4111-8111-111111111111', '22220000-0000-4000-8000-000000000002', 'Overlay note', 'Synthetic payee', '2026-06-02', 'synthetic', true, 1, '2026-07-01T00:00:00Z');
insert into public.overlay_revisions(id, owner_id, transaction_id, revision, snapshot, changed_at, changed_by)
values ('22220000-0000-4000-8000-000000000008', '11111111-1111-4111-8111-111111111111', '22220000-0000-4000-8000-000000000005', 1, jsonb_build_object('owner_id','11111111-1111-4111-8111-111111111111','note','synthetic'), '2026-07-01T00:00:00Z', '11111111-1111-4111-8111-111111111111');
insert into public.audit_events(owner_id, actor_id, event_type, entity_type, entity_id, detail, occurred_at)
values ('11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'import.confirmed', 'import_batch', '22220000-0000-4000-8000-000000000004', '{}'::jsonb, '2026-07-01T00:00:00Z');
update public.mutation_sequences set sequence = 7, last_exported_sequence = 0
where owner_id = '11111111-1111-4111-8111-111111111111';
set local session_replication_role = origin;

create temporary table populated_export as select public.export_backup_snapshot() as snapshot;

insert into restore_fixtures(name, restore_id, idempotency_key, chunks)
select 'populated', 'cccccccc-0000-4000-8000-000000000010', 'dddddddd-0000-4000-8000-000000000010',
  (select jsonb_agg(jsonb_build_object('kind', kind, 'rows', coalesce(snapshot->'data'->kind, '[]'::jsonb)) order by ord)
   from populated_export,
     unnest(array[
       'accounts','categories','import_artifacts','import_batches','source_transactions',
       'source_components','import_batch_rows','transaction_overlays','overlay_revisions',
       'audit_events','mutation_sequences'
     ]) with ordinality as expected(kind, ord));
-- Rewrite the caller's owner to a foreign id everywhere it appears (owner_id, actor_id,
-- changed_by, nested snapshot owner). Restore must ignore these and force the caller.
update restore_fixtures
set chunks = replace(chunks::text, '11111111-1111-4111-8111-111111111111', 'ffffffff-1111-4111-8111-111111111111')::jsonb
where name = 'populated';
select pg_temp.finalize_restore_fixture('populated');

select ok(
  (select chunks::text like '%ffffffff-1111-4111-8111-111111111111%' from restore_fixtures where name='populated'),
  'the populated payload carries a foreign owner so remapping is observable'
);

set local session_replication_role = replica;
delete from public.overlay_revisions where owner_id = '11111111-1111-4111-8111-111111111111';
delete from public.transaction_overlays where owner_id = '11111111-1111-4111-8111-111111111111';
delete from public.audit_events where owner_id = '11111111-1111-4111-8111-111111111111';
delete from public.import_batch_rows where owner_id = '11111111-1111-4111-8111-111111111111';
delete from public.source_components where owner_id = '11111111-1111-4111-8111-111111111111';
delete from public.source_transactions where owner_id = '11111111-1111-4111-8111-111111111111';
delete from public.import_batches where owner_id = '11111111-1111-4111-8111-111111111111';
delete from public.import_artifacts where owner_id = '11111111-1111-4111-8111-111111111111';
delete from public.categories where owner_id = '11111111-1111-4111-8111-111111111111';
delete from public.accounts where owner_id = '11111111-1111-4111-8111-111111111111';
set local session_replication_role = origin;

select lives_ok(
  $test$
  do $body$
  declare v_index integer;
  begin
    perform public.restore_backup('stage', pg_temp.restore_request('populated'));
    for v_index in 0..10 loop
      perform public.restore_backup('chunk', pg_temp.restore_request('populated', v_index));
    end loop;
  end
  $body$
  $test$,
  'the populated fixture stages all chunks'
);
select is(
  public.restore_backup('commit', pg_temp.restore_request('populated'))->>'status',
  'applied',
  'the populated ledger commits successfully'
);
select is(
  (select owner_id::text from public.accounts limit 1),
  '11111111-1111-4111-8111-111111111111',
  'restore remaps rows to the caller despite a foreign owner in the payload'
);
create temporary table repopulated_export as select public.export_backup_snapshot() as snapshot;
select is(
  (select (snapshot->'data') - 'mutation_sequences' from repopulated_export),
  (select (snapshot->'data') - 'mutation_sequences' from populated_export),
  're-export reproduces every restored ledger table exactly (schemas, keys, money, audit)'
);

select * from finish();
rollback;
