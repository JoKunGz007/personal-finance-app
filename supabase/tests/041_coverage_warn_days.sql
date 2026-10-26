begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

-- Per-account coverage warning line (migration 065). Every account here is invented.
--
-- What this proves: the settings table forces RLS and is select-only for the owner; anon cannot
-- execute either function; list_account_coverage reports 35 by default, then the stored value, and
-- a second set replaces the first (one row); out-of-range, null and unowned input is refused; a
-- caller without strong access is refused; setting never moves the mutation sequence.

set local session_replication_role = replica;
delete from public.account_coverage_settings;
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
values ('aaaaaaaa-0000-4000-8000-000000000411', '11111111-1111-4111-8111-111111111111',
        'warn days TOTP', 'totp', 'verified', 'SYNTHETICWARNDAYS', '2026-10-25T00:00:00Z', '2026-10-25T00:00:00Z');

insert into public.accounts(id, owner_id, bank_code, label, account_type, last_four, currency, timezone)
values
  ('cccccccc-0000-4000-8000-000000000051', '11111111-1111-4111-8111-111111111111',
   'KTB', 'Invented A', 'savings', '5151', 'THB', 'Asia/Bangkok'),
  ('cccccccc-0000-4000-8000-000000000052', '11111111-1111-4111-8111-111111111111',
   'KTB', 'Invented B', 'savings', '5252', 'THB', 'Asia/Bangkok');

select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal2"}', true);

-- ------------------------------------------------------------------- (a) shape and access

select has_table('public', 'account_coverage_settings', 'settings table exists');
select ok(
  (select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.account_coverage_settings'::regclass),
  'the settings table forces RLS'
);
select ok(
  has_table_privilege('authenticated', 'public.account_coverage_settings', 'select')
    and not has_table_privilege('authenticated', 'public.account_coverage_settings', 'insert')
    and not has_table_privilege('authenticated', 'public.account_coverage_settings', 'update')
    and not has_table_privilege('authenticated', 'public.account_coverage_settings', 'delete')
    and not has_table_privilege('anon', 'public.account_coverage_settings', 'select')
    and not has_table_privilege('anon', 'public.account_coverage_settings', 'insert')
    and not has_table_privilege('anon', 'public.account_coverage_settings', 'update')
    and not has_table_privilege('anon', 'public.account_coverage_settings', 'delete'),
  'authenticated is select-only; anon has nothing'
);
select ok(
  has_function_privilege('authenticated', 'public.set_account_coverage_warn_days(uuid, integer)', 'execute')
    and has_function_privilege('authenticated', 'public.list_account_coverage()', 'execute')
    and not has_function_privilege('anon', 'public.set_account_coverage_warn_days(uuid, integer)', 'execute')
    and not has_function_privilege('anon', 'public.list_account_coverage()', 'execute'),
  'authenticated may execute both functions; anon may execute neither'
);

-- ------------------------------------------------------------------- (b) default, set, replace

select is(
  (select warn_after_days from public.list_account_coverage() where account_id = 'cccccccc-0000-4000-8000-000000000051'),
  35,
  'an account without a setting warns at 35 days'
);
select lives_ok(
  $$select public.set_account_coverage_warn_days('cccccccc-0000-4000-8000-000000000051', 7)$$,
  'a warn line of 7 days is stored'
);
select is(
  (select warn_after_days from public.list_account_coverage() where account_id = 'cccccccc-0000-4000-8000-000000000051'),
  7,
  'the list reports 7'
);
select is(
  (select warn_after_days from public.list_account_coverage() where account_id = 'cccccccc-0000-4000-8000-000000000052'),
  35,
  'the other account keeps the default'
);
select lives_ok(
  $$select public.set_account_coverage_warn_days('cccccccc-0000-4000-8000-000000000051', 14)$$,
  'a second set replaces the first'
);
select is(
  (select warn_after_days from public.list_account_coverage() where account_id = 'cccccccc-0000-4000-8000-000000000051'),
  14,
  'the list reports 14'
);
select is(
  (select count(*)::integer from public.account_coverage_settings),
  1,
  'the upsert left one row'
);

-- ------------------------------------------------------------------- (c) refused input

select throws_ok(
  $$select public.set_account_coverage_warn_days('cccccccc-0000-4000-8000-000000000051', 0)$$,
  'invalid coverage setting', '0 days is refused'
);
select throws_ok(
  $$select public.set_account_coverage_warn_days('cccccccc-0000-4000-8000-000000000051', 366)$$,
  'invalid coverage setting', '366 days is refused'
);
select throws_ok(
  $$select public.set_account_coverage_warn_days('cccccccc-0000-4000-8000-000000000051', null)$$,
  'invalid coverage setting', 'null days is refused'
);
select throws_ok(
  $$select public.set_account_coverage_warn_days(null, 7)$$,
  'invalid coverage setting', 'a null account is refused'
);
select throws_ok(
  $$select public.set_account_coverage_warn_days('cccccccc-0000-4000-8000-0000000000ff', 7)$$,
  'account not owned', 'an account the caller does not own is refused'
);

-- ------------------------------------------------------------------- (d) no ledger effect

select is(
  (select sequence::bigint from public.mutation_sequences where owner_id = '11111111-1111-4111-8111-111111111111'),
  5::bigint,
  'setting a warn line did not move the mutation sequence'
);

-- ------------------------------------------------------------------- (e) callers without strong access

select set_config('request.jwt.claims',
  '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated","aal":"aal2"}', true);
select throws_ok(
  $$select public.set_account_coverage_warn_days('cccccccc-0000-4000-8000-000000000051', 7)$$,
  'strong owner access required',
  'another user cannot set the owner''s warn line'
);

select * from finish();
rollback;
