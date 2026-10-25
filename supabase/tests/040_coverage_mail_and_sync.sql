begin;
create extension if not exists pgtap with schema extensions;
select plan(29);

-- Statement-mail arrivals, mailbox sync runs and per-account coverage (migration 064).
-- Every account, batch and time here is invented.
--
-- What this proves: both tables force RLS, are select-only for the owner and append-only; the two
-- RPCs refuse a caller without strong owner access, refuse null input, and leave the mutation
-- sequence alone; recording a batch's mail twice is a no-op; list_account_coverage reports the newest
-- row by date, then time (null time last), nulls for an account without rows, and the latest mail
-- time; another caller sees none of it.

set local session_replication_role = replica;
delete from public.statement_mail_arrivals;
delete from public.mail_sync_runs;
delete from public.import_batch_rows;
delete from public.import_batches;
delete from public.import_artifacts;
delete from public.source_components;
delete from public.source_transactions;
delete from public.audit_events;
delete from public.accounts;
update public.mutation_sequences
set sequence = 5, last_exported_sequence = 0, updated_at = '2026-10-25T00:00:00Z'
where owner_id = '11111111-1111-4111-8111-111111111111';
delete from auth.mfa_factors where user_id = '11111111-1111-4111-8111-111111111111';
set local session_replication_role = origin;

insert into auth.mfa_factors(id, user_id, friendly_name, factor_type, status, secret, created_at, updated_at)
values ('aaaaaaaa-0000-4000-8000-000000000401', '11111111-1111-4111-8111-111111111111',
        'coverage TOTP', 'totp', 'verified', 'SYNTHETICCOVERAGE', '2026-10-25T00:00:00Z', '2026-10-25T00:00:00Z');

insert into public.accounts(id, owner_id, bank_code, label, account_type, last_four, currency, timezone)
values
  ('cccccccc-0000-4000-8000-000000000041', '11111111-1111-4111-8111-111111111111',
   'KTB', 'Invented A', 'savings', '4141', 'THB', 'Asia/Bangkok'),
  ('cccccccc-0000-4000-8000-000000000042', '11111111-1111-4111-8111-111111111111',
   'KTB', 'Invented B', 'savings', '4242', 'THB', 'Asia/Bangkok');

insert into public.import_artifacts(id, owner_id, artifact_digest, contract_version, created_at)
values
  ('22220000-0000-4000-8000-000000000041', '11111111-1111-4111-8111-111111111111', repeat('a', 64), 'krungthai-layout-v1', '2026-10-01T00:00:00Z'),
  ('22220000-0000-4000-8000-000000000042', '11111111-1111-4111-8111-111111111111', repeat('b', 64), 'krungthai-layout-v1', '2026-10-01T00:00:00Z');
insert into public.import_batches(id, owner_id, account_id, artifact_id, idempotency_key, payload_digest, status, confirmed_at,
  period_start, period_end, opening_balance_minor, closing_balance_minor, currency)
values
  ('bbbbbbbb-0000-4000-8000-000000000041', '11111111-1111-4111-8111-111111111111', 'cccccccc-0000-4000-8000-000000000041',
   '22220000-0000-4000-8000-000000000041', '33330000-0000-4000-8000-000000000041', repeat('c', 64), 'confirmed', '2026-10-01T00:00:00Z',
   '2026-03-01', '2026-03-31', '10000', '10100', 'THB'),
  ('bbbbbbbb-0000-4000-8000-000000000042', '11111111-1111-4111-8111-111111111111', 'cccccccc-0000-4000-8000-000000000041',
   '22220000-0000-4000-8000-000000000042', '33330000-0000-4000-8000-000000000042', repeat('d', 64), 'confirmed', '2026-10-01T00:00:00Z',
   '2026-04-01', '2026-04-30', '10100', '10200', 'THB');

-- Account A: the newest date holds a null-time row and a timed row; an earlier date has a later time.
-- Account B has no rows.
insert into public.source_transactions(id, owner_id, account_id, fingerprint_version, fingerprint,
  source_date, source_time, effective_date, transaction_label, description, post_balance_minor, currency)
select ('dddddddd-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, '11111111-1111-4111-8111-111111111111',
       'cccccccc-0000-4000-8000-000000000041', 'fingerprint-v1', repeat(to_hex(n), 64),
       d::date, t::time, d::date, 'Invented ' || n, 'Invented ' || n, 1000, 'THB'
  from (values (1, '2026-03-10', null), (2, '2026-03-10', '09:00'), (3, '2026-03-09', '23:00')) v(n, d, t);

select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal2"}', true);

-- ------------------------------------------------------------------- (a) shape and access

select has_table('public', 'statement_mail_arrivals', 'statement mail arrivals table exists');
select has_table('public', 'mail_sync_runs', 'mail sync runs table exists');
select ok(
  (select bool_and(relrowsecurity and relforcerowsecurity) from pg_class
    where oid in ('public.statement_mail_arrivals'::regclass, 'public.mail_sync_runs'::regclass)),
  'both tables force RLS'
);
select trigger_is('public', 'statement_mail_arrivals', 'statement_mail_arrivals_immutable', 'private', 'reject_change', 'arrivals are append-only');
select trigger_is('public', 'mail_sync_runs', 'mail_sync_runs_immutable', 'private', 'reject_change', 'sync runs are append-only');
select ok(
  has_table_privilege('authenticated', 'public.statement_mail_arrivals', 'select')
    and has_table_privilege('authenticated', 'public.mail_sync_runs', 'select')
    and not has_table_privilege('authenticated', 'public.statement_mail_arrivals', 'insert')
    and not has_table_privilege('authenticated', 'public.statement_mail_arrivals', 'update')
    and not has_table_privilege('authenticated', 'public.statement_mail_arrivals', 'delete')
    and not has_table_privilege('authenticated', 'public.mail_sync_runs', 'insert')
    and not has_table_privilege('authenticated', 'public.mail_sync_runs', 'update')
    and not has_table_privilege('authenticated', 'public.mail_sync_runs', 'delete')
    and not has_table_privilege('anon', 'public.statement_mail_arrivals', 'select')
    and not has_table_privilege('anon', 'public.mail_sync_runs', 'select'),
  'authenticated is select-only; anon has nothing'
);

-- ------------------------------------------------------------------- (b) record_statement_mail

select lives_ok(
  $$select public.record_statement_mail('bbbbbbbb-0000-4000-8000-000000000041', '2026-10-01T00:00:00Z')$$,
  'a batch''s mail time is recorded'
);
select is((select count(*)::integer from public.statement_mail_arrivals), 1, 'one arrival row');
select lives_ok(
  $$select public.record_statement_mail('bbbbbbbb-0000-4000-8000-000000000041', '2026-10-20T00:00:00Z')$$,
  'a replay for the same batch does not fail'
);
select is(
  (select count(*) = 1 and min(received_at) = '2026-10-01T00:00:00Z'::timestamptz from public.statement_mail_arrivals),
  true,
  'the replay is a no-op: still one row, first time kept'
);
select throws_ok(
  $$select public.record_statement_mail('bbbbbbbb-0000-4000-8000-0000000000ff', '2026-10-01T00:00:00Z')$$,
  'batch not owned',
  'an unknown batch is refused'
);
select throws_ok(
  $$select public.record_statement_mail('bbbbbbbb-0000-4000-8000-000000000042', null)$$,
  'invalid statement mail',
  'a null received time is refused'
);
select lives_ok(
  $$select public.record_statement_mail('bbbbbbbb-0000-4000-8000-000000000042', '2026-10-05T00:00:00Z')$$,
  'a second batch is recorded'
);

-- ------------------------------------------------------------------- (c) record_mail_sync

select isnt(public.record_mail_sync(true), null, 'a sync run returns its finish time');
select throws_ok(
  $$select public.record_mail_sync(null)$$,
  'invalid mail sync',
  'a null completeness flag is refused'
);
select is((select count(*)::integer from public.mail_sync_runs), 1, 'one sync run stored');
select is(
  (select sequence::bigint from public.mutation_sequences where owner_id = '11111111-1111-4111-8111-111111111111'),
  5::bigint,
  'neither RPC moved the mutation sequence'
);

-- ------------------------------------------------------------------- (d) append-only

select throws_ok(
  $$update public.statement_mail_arrivals set received_at = now()$$,
  'statement_mail_arrivals is append-only: UPDATE is forbidden',
  'an arrival cannot be updated'
);
select throws_ok(
  $$delete from public.mail_sync_runs$$,
  'mail_sync_runs is append-only: DELETE is forbidden',
  'a sync run cannot be deleted'
);

-- ------------------------------------------------------------------- (e) list_account_coverage

select is(
  (select newest_date::text || ' ' || coalesce(newest_time::text, 'null')
     from public.list_account_coverage() where account_id = 'cccccccc-0000-4000-8000-000000000041'),
  '2026-03-10 09:00:00',
  'the newest row is by date first, then time, with a null time last'
);
select is(
  (select last_statement_mail_at = '2026-10-05T00:00:00Z'::timestamptz
     from public.list_account_coverage() where account_id = 'cccccccc-0000-4000-8000-000000000041'),
  true,
  'the latest mail time is the maximum'
);
select ok(
  (select newest_date is null and newest_time is null and last_statement_mail_at is null
     from public.list_account_coverage() where account_id = 'cccccccc-0000-4000-8000-000000000042'),
  'an account without rows or mail reports nulls'
);

-- ------------------------------------------------------------------- (f) callers without strong access

select set_config('request.jwt.claims',
  '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated","aal":"aal2"}', true);
select throws_ok(
  $$select public.record_statement_mail('bbbbbbbb-0000-4000-8000-000000000041', '2026-10-01T00:00:00Z')$$,
  'strong owner access required',
  'another user cannot record mail for the owner''s batch'
);
select throws_ok(
  $$select public.record_mail_sync(true)$$,
  'strong owner access required',
  'another user cannot record a sync run'
);

set local role authenticated;
select is(
  (select count(*)::integer from public.list_account_coverage()),
  0,
  'another user sees no coverage rows'
);
select is(
  (select count(*)::integer from public.statement_mail_arrivals) + (select count(*)::integer from public.mail_sync_runs),
  0,
  'and none of the owner''s arrivals or sync runs'
);
select throws_ok(
  $$insert into public.mail_sync_runs(owner_id, complete) values ('22222222-2222-4222-8222-222222222222', true)$$,
  '42501',
  'permission denied for table mail_sync_runs',
  'direct inserts are not granted'
);
reset role;

select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;
select is((select count(*)::integer from public.list_account_coverage()), 2, 'the owner sees both accounts through RLS');
reset role;

select ok(
  has_function_privilege('authenticated', 'public.list_account_coverage()', 'execute')
    and not has_function_privilege('anon', 'public.list_account_coverage()', 'execute')
    and not has_function_privilege('anon', 'public.record_statement_mail(uuid, timestamptz)', 'execute')
    and not has_function_privilege('anon', 'public.record_mail_sync(boolean)', 'execute'),
  'authenticated may execute the coverage function; anon may execute none of the three'
);

select * from finish();
rollback;
