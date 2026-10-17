begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

-- Read-only pre-count of the rows confirm_import would link (migration 059, D-280 leftover).
--
-- public.count_existing_import_rows and confirm_import share one linking rule
-- (private.existing_source_row): exact fingerprint, then identity facts (same date, time,
-- post balance and ordered components; a source time is required), each stored row claimed
-- once per statement. Every figure, name and reference here is invented.

set local session_replication_role = replica;
delete from public.import_batch_rows;
delete from public.import_batches;
delete from public.import_artifacts;
delete from public.source_components;
delete from public.source_transactions;
delete from public.audit_events;
delete from public.accounts;
update public.mutation_sequences
set sequence = 0, last_exported_sequence = 0, updated_at = '2026-10-21T00:00:00Z'
where owner_id = '11111111-1111-4111-8111-111111111111';
delete from auth.mfa_factors where user_id = '11111111-1111-4111-8111-111111111111';
set local session_replication_role = origin;

insert into auth.mfa_factors(id, user_id, friendly_name, factor_type, status, secret, created_at, updated_at)
values ('aaaaaaaa-0000-4000-8000-000000000371', '11111111-1111-4111-8111-111111111111',
        'precount TOTP', 'totp', 'verified', 'SYNTHETICPRECOUNT', '2026-10-21T00:00:00Z', '2026-10-21T00:00:00Z');

insert into public.accounts(id, owner_id, bank_code, label, account_type, last_four, currency, timezone)
values ('cccccccc-0000-4000-8000-000000000037', '11111111-1111-4111-8111-111111111111',
        'KTB', 'Invented KTB', 'savings', '3737', 'THB', 'Asia/Bangkok');

select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal2"}',
  true
);

-- One deposit row; a null p_time means no source time. The fingerprint is bound later.
create function pg_temp.mkrow(p_idx int, p_date text, p_time text, p_label text, p_desc text, p_post text, p_amount text)
returns jsonb language sql as $fn$
  select jsonb_strip_nulls(jsonb_build_object(
    'sourceIndex', p_idx::text, 'sourceDate', p_date, 'sourceTime', p_time, 'effectiveDate', p_date,
    'transactionLabel', p_label, 'description', p_desc, 'reference', '', 'branch', '',
    'fingerprint', repeat('0', 64),
    'postBalance', jsonb_build_object('minor', p_post, 'currency', 'THB'),
    'components', jsonb_build_array(jsonb_build_object('kind', 'deposit', 'amount', jsonb_build_object('minor', p_amount, 'currency', 'THB'))),
    'provenance', jsonb_build_object('page', '1', 'row', p_idx::text, 'parserFields', jsonb_build_object())
  ))
$fn$;

create function pg_temp.bind(p_rows jsonb) returns jsonb language sql as $fn$
  select coalesce(jsonb_agg(
    r.value || jsonb_build_object('fingerprint',
      private.row_fingerprint('cccccccc-0000-4000-8000-000000000037', 'KTB', r.value))
    order by r.ordinality), '[]'::jsonb)
  from jsonb_array_elements(p_rows) with ordinality r(value, ordinality)
$fn$;

create function pg_temp.confirm37(p_artifact text, p_idem uuid, p_opening text, p_closing text, p_rows jsonb)
returns uuid language plpgsql as $fn$
declare v_rows jsonb := pg_temp.bind(p_rows); v_digest text;
begin
  v_digest := private.sha256_jsonb(jsonb_build_object(
    'accountId', 'cccccccc-0000-4000-8000-000000000037', 'contractVersion', 'krungthai-layout-v1',
    'currency', 'THB', 'periodStart', '2026-03-01', 'periodEnd', '2026-03-31',
    'openingBalance', p_opening, 'closingBalance', p_closing, 'rows', v_rows));
  return public.confirm_import('cccccccc-0000-4000-8000-000000000037', p_artifact, v_digest, p_idem,
    'krungthai-layout-v1', '2026-03-01', '2026-03-31', p_opening, p_closing, 'THB', v_rows);
end;
$fn$;

create function pg_temp.precount(p_rows jsonb) returns integer language sql as $fn$
  select public.count_existing_import_rows('cccccccc-0000-4000-8000-000000000037', pg_temp.bind(p_rows))
$fn$;

create temporary table fx(name text primary key, rows jsonb);
insert into fx values
  ('s1', jsonb_build_array(
     pg_temp.mkrow(1, '2026-03-01', '10:15:00', 'Transfer in', 'Printed one', '500000', '100000'),
     pg_temp.mkrow(2, '2026-03-02', '11:00:00', 'Transfer in', 'Printed two', '600000', '100000'))),
  ('s1_reprint', jsonb_build_array(
     pg_temp.mkrow(1, '2026-03-01', '10:15:00', 'Thai print', 'Printed one wrapped', '500000', '100000'),
     pg_temp.mkrow(2, '2026-03-02', '11:00:00', 'Thai print', 'Printed two wrapped', '600000', '100000'))),
  ('s3', jsonb_build_array(pg_temp.mkrow(1, '2026-03-03', null, 'Transfer in', 'No time', '700000', '100000'))),
  ('s3_reprint', jsonb_build_array(pg_temp.mkrow(1, '2026-03-03', null, 'Thai print', 'No time wrapped', '700000', '100000'))),
  ('s4', jsonb_build_array(pg_temp.mkrow(1, '2026-03-04', '09:00:00', 'Transfer in', 'Single stored', '800000', '100000'))),
  ('twins', jsonb_build_array(
     pg_temp.mkrow(1, '2026-03-04', '09:00:00', 'Print B', 'Twin B', '800000', '100000'),
     pg_temp.mkrow(2, '2026-03-04', '09:00:00', 'Print C', 'Twin C', '800000', '100000')));

select is(pg_temp.precount((select rows from fx where name = 's1')), 0, 'a fresh statement pre-counts 0');

select lives_ok(
  $$select pg_temp.confirm37(repeat('1', 64), 'bbbbbbbb-0000-4000-8000-000000000371', '400000', '600000', (select rows from fx where name = 's1'))$$,
  'the first statement confirms'
);
select is(pg_temp.precount((select rows from fx where name = 's1')), 2, 'after confirm the same rows pre-count as stored');

select isnt(
  (select pg_temp.bind(rows)->0->>'fingerprint' from fx where name = 's1'),
  (select pg_temp.bind(rows)->0->>'fingerprint' from fx where name = 's1_reprint'),
  'the re-printed row has another fingerprint'
);
select is(pg_temp.precount((select rows from fx where name = 's1_reprint')), 2,
  'a re-printed statement counts as existing by identity facts');

select lives_ok(
  $$select pg_temp.confirm37(repeat('3', 64), 'bbbbbbbb-0000-4000-8000-000000000373', '600000', '700000', (select rows from fx where name = 's3'))$$,
  'a statement row without a source time confirms'
);
select is(pg_temp.precount((select rows from fx where name = 's3_reprint')), 0,
  'a re-print without a source time does not count');
select is(pg_temp.precount((select rows from fx where name = 's3')), 1,
  'the exact row without a source time still counts by fingerprint');

select lives_ok(
  $$select pg_temp.confirm37(repeat('4', 64), 'bbbbbbbb-0000-4000-8000-000000000374', '700000', '800000', (select rows from fx where name = 's4'))$$,
  'a single stored row to be matched twice confirms'
);
select is(pg_temp.precount((select rows from fx where name = 'twins')), 1,
  'two rows with equal identity facts claim one stored row once');

select throws_ok(
  $$select public.count_existing_import_rows('cccccccc-0000-4000-8000-000000000037',
      jsonb_set((select rows from fx where name = 's1'), '{0,fingerprint}', to_jsonb(repeat('7', 64))))$$,
  'P0001', 'fingerprint mismatch', 'a tampered fingerprint is refused'
);
select throws_ok(
  $$select public.count_existing_import_rows('cccccccc-0000-4000-8000-000000000037', '[]'::jsonb)$$,
  'P0001', 'invalid import contract', 'an empty row list is refused'
);
select throws_ok(
  $$select public.count_existing_import_rows('cccccccc-0000-4000-8000-0000000000ff', pg_temp.bind((select rows from fx where name = 's1')))$$,
  'P0001', 'account not owned', 'an account the owner does not hold is refused'
);

select set_config('request.jwt.claims',
  '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated","aal":"aal2"}', true);
select throws_ok(
  $$select pg_temp.precount((select rows from fx where name = 's1'))$$,
  'P0001', 'strong owner access required', 'another user cannot pre-count'
);
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select throws_ok(
  $$select public.count_existing_import_rows('cccccccc-0000-4000-8000-000000000037', '[]'::jsonb)$$,
  '42501', null, 'anon cannot call the pre-count'
);
reset role;

select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal2"}', true);

-- confirm_import still links the re-print and records the identity links.
create temporary table fx_batch(id uuid);
insert into fx_batch
select pg_temp.confirm37(repeat('2', 64), 'bbbbbbbb-0000-4000-8000-000000000372', '400000', '600000', (select rows from fx where name = 's1_reprint'));
select is(
  (select detail->>'identity_links' from public.audit_events
    where event_type = 'import.confirmed' and entity_id = (select id from fx_batch)),
  '2', 'confirm_import records both identity links in the audit detail'
);
select is(
  (select count(*)::int from public.import_batch_rows where batch_id = (select id from fx_batch) and linked_existing),
  2, 'confirm_import marks both re-printed rows as linked_existing'
);
select is((select count(*)::int from public.source_transactions), 4, 'the re-print inserted no second copy of a stored row');

select * from finish();
rollback;
