begin;
create extension if not exists pgtap with schema extensions;
select plan(28);

select has_table('public', 'source_transactions', 'source transaction table exists');
select has_table('public', 'source_components', 'source component table exists');
select has_table('public', 'overlay_revisions', 'overlay revision table exists');
select has_table('public', 'restore_runs', 'restore session table exists');
select has_function('public', 'confirm_import', array['uuid','text','text','uuid','text','date','date','text','text','text','jsonb'], 'hardened atomic import RPC exists');
select has_function('public', 'restore_backup', array['text','jsonb'], 'restore RPC exists');
select has_function('public', 'export_backup_snapshot', array[]::text[], 'snapshot export RPC exists');
select has_function('public', 'mark_backup_exported', array['text','text'], 'snapshot-aware backup marker exists');
select has_function('public', 'mutate_category', array['text','uuid','text','boolean'], 'audited category mutation RPC exists');
select has_function('public', 'list_account_transactions', array['uuid'], 'canonical transaction list RPC exists');
select has_function('private', 'has_strong_owner_access', array['uuid'], 'strong owner predicate exists');
select has_function('private', 'canonical_jsonb', array['jsonb'], 'canonical JSON helper exists');

select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.source_transactions'::regclass), 'source facts force RLS');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.audit_events'::regclass), 'audit events force RLS');
select trigger_is('public', 'source_transactions', 'source_transactions_immutable', 'private', 'reject_change', 'source facts are immutable');
select trigger_is('public', 'source_components', 'source_components_immutable', 'private', 'reject_change', 'components are immutable');
select trigger_is('public', 'audit_events', 'audit_events_immutable', 'private', 'reject_change', 'audit is append-only');

insert into public.source_transactions(
  id, owner_id, account_id, fingerprint_version, fingerprint, source_date, effective_date,
  transaction_label, description, post_balance_minor, currency
) values (
  '33333333-3333-4333-8333-333333333333',
  '11111111-1111-4111-8111-111111111111',
  '11111111-2222-4333-8444-555555555555',
  'fingerprint-v1', repeat('a', 64), '2026-06-01', '2026-06-01',
  'Synthetic', 'Synthetic pgTAP row', 10000, 'THB'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated","aal":"aal2"}', true);
select is((select count(*)::integer from public.accounts), 0, 'a forged non-owner JWT sees no accounts');

select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal1"}', true);
select is((select count(*)::integer from public.accounts), 0, 'the owner at AAL1 sees no accounts');

reset role;
select throws_ok(
  $$update public.source_transactions set description = 'changed' where id = '33333333-3333-4333-8333-333333333333'$$,
  'P0001',
  'source_transactions is append-only: UPDATE is forbidden',
  'database rejects source fact mutation'
);

select ok(
  not has_table_privilege('anon', 'public.source_transactions', 'SELECT'),
  'anonymous PostgREST has no source table privilege'
);
select ok(not has_table_privilege('authenticated', 'public.categories', 'INSERT'), 'categories cannot be inserted directly');
select ok(not has_table_privilege('authenticated', 'public.categories', 'UPDATE'), 'categories cannot be updated directly');

-- The account write path is `public.mutate_account` and nothing else. If these ever pass
-- by grant rather than by RPC, the strong-access gate, the audit row and the mutation
-- sequence bump all become optional — a caller could create an account without any of them.
select has_function('public', 'mutate_account', array['text','uuid','text','text','text','text'], 'audited account mutation RPC exists');
select ok(not has_table_privilege('authenticated', 'public.accounts', 'INSERT'), 'accounts cannot be inserted directly');
select ok(not has_table_privilege('authenticated', 'public.accounts', 'UPDATE'), 'accounts cannot be updated directly');
select ok(not has_table_privilege('authenticated', 'public.accounts', 'DELETE'), 'accounts cannot be deleted directly');
select is(private.canonical_jsonb('{"z":1,"a":{"y":true,"x":"v"}}'::jsonb), '{"a":{"x":"v","y":true},"z":1}', 'database canonical JSON matches TypeScript ordering');

select * from finish();
rollback;
