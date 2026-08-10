begin;
create extension if not exists pgtap with schema extensions;
select plan(32);

-- Cash entry and the correction path (migration 013, the rest of PLAN task 22).
--
-- The contract these tests hold: a cash payment is a ledger fact, append-only, audited and
-- carried by the backup; a correction is an overlay whose history cannot be rewritten; and a
-- corrected amount and a stored match can never disagree — checked from **both** directions,
-- because guarding only one of them leaves the other free to create exactly the pairing the
-- guard exists to prevent. Every refusal is asserted by its message, since a check that passes
-- on a different error is the failure this file exists to catch.

set local session_replication_role = replica;
delete from public.slip_correction_revisions;
delete from public.slip_correction_overlays;
delete from public.cash_entry_revisions;
delete from public.cash_entry_overlays;
delete from public.cash_entries;
delete from public.slip_match_revisions;
delete from public.slip_match_overlays;
delete from public.slips;
delete from public.source_components;
delete from public.source_transactions;
delete from public.audit_events;
delete from public.categories;
delete from public.accounts;
update public.mutation_sequences
set sequence = 0, last_exported_sequence = 0, updated_at = '2026-07-24T00:00:00Z'
where owner_id = '11111111-1111-4111-8111-111111111111';
delete from auth.mfa_factors where user_id = '11111111-1111-4111-8111-111111111111';

-- Fixture ledger. Every value invented. Two statement rows of different invented amounts, so a
-- corrected slip can be aimed at the wrong one deliberately.
insert into public.accounts(id, owner_id, bank_code, label, account_type, last_four, currency, timezone)
values ('cccccccc-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111',
        'SCB', 'Invented SCB', 'savings', '4242', 'THB', 'Asia/Bangkok');

insert into public.categories(id, owner_id, name)
values ('bbbbbbbb-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'Invented category');

insert into public.source_transactions(id, owner_id, account_id, fingerprint_version, fingerprint,
  source_date, effective_date, transaction_label, description, post_balance_minor, currency)
values
  ('dddddddd-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'cccccccc-0000-4000-8000-000000000001',
   'fingerprint-v1', repeat('a', 64), '2026-07-20', '2026-07-20', 'Invented label', 'Invented description', '500000', 'THB'),
  ('dddddddd-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'cccccccc-0000-4000-8000-000000000001',
   'fingerprint-v1', repeat('b', 64), '2026-07-20', '2026-07-20', 'Invented label two', 'Invented description two', '400000', 'THB');

insert into public.source_components(id, owner_id, transaction_id, position, kind, amount_minor, currency)
values
  ('eeeeeeee-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'dddddddd-0000-4000-8000-000000000001', 1, 'withdrawal', -12500, 'THB'),
  ('eeeeeeee-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'dddddddd-0000-4000-8000-000000000002', 1, 'withdrawal', -99900, 'THB');

insert into public.slips(id, owner_id, bank_code, bank_qr_code, slip_reference, qr_payload, kind,
  amount_minor, currency, occurred_on)
values
  ('ffffffff-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'SCB', '014',
   '202607200000000000000001x', 'invented payload one', 'withdrawal', -12500, 'THB', '2026-07-20'),
  ('ffffffff-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'SCB', '014',
   '202607200000000000000002x', 'invented payload two', 'withdrawal', -12500, 'THB', '2026-07-20');
set local session_replication_role = origin;

insert into auth.mfa_factors(id, user_id, friendly_name, factor_type, status, secret, created_at, updated_at)
values
  ('aaaaaaaa-0000-4000-8000-000000000041', '11111111-1111-4111-8111-111111111111',
   'cash TOTP one', 'totp', 'verified', 'SYNTHETICCASHONE', '2026-07-24T00:00:00Z', '2026-07-24T00:00:00Z'),
  ('aaaaaaaa-0000-4000-8000-000000000042', '11111111-1111-4111-8111-111111111111',
   'cash TOTP two', 'totp', 'verified', 'SYNTHETICCASHTWO', '2026-07-24T00:00:00Z', '2026-07-24T00:00:00Z');

select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal2"}',
  true
);

-- Least privilege, stated for all five tables rather than assumed from the pattern.
select ok(
  has_table_privilege('authenticated', 'public.cash_entries', 'select')
    and has_table_privilege('authenticated', 'public.cash_entry_overlays', 'select')
    and has_table_privilege('authenticated', 'public.cash_entry_revisions', 'select')
    and has_table_privilege('authenticated', 'public.slip_correction_overlays', 'select')
    and has_table_privilege('authenticated', 'public.slip_correction_revisions', 'select'),
  'authenticated may read cash entries, corrections and both histories'
);
select ok(
  not has_table_privilege('authenticated', 'public.cash_entries', 'insert')
    and not has_table_privilege('authenticated', 'public.cash_entries', 'update')
    and not has_table_privilege('authenticated', 'public.cash_entries', 'delete')
    and not has_table_privilege('authenticated', 'public.cash_entry_overlays', 'insert')
    and not has_table_privilege('authenticated', 'public.cash_entry_overlays', 'update')
    and not has_table_privilege('authenticated', 'public.cash_entry_revisions', 'insert')
    and not has_table_privilege('authenticated', 'public.slip_correction_overlays', 'insert')
    and not has_table_privilege('authenticated', 'public.slip_correction_overlays', 'update')
    and not has_table_privilege('authenticated', 'public.slip_correction_revisions', 'insert'),
  'authenticated holds no direct write on any of the five'
);
select ok(
  (select bool_and(relrowsecurity and relforcerowsecurity) from pg_class where oid in (
    'public.cash_entries'::regclass, 'public.cash_entry_overlays'::regclass,
    'public.cash_entry_revisions'::regclass, 'public.slip_correction_overlays'::regclass,
    'public.slip_correction_revisions'::regclass)),
  'all five tables have row level security enabled and forced'
);

-- ------------------------------------------------------------- create_cash_entry

select is(
  public.create_cash_entry('withdrawal', '-45000', '2026-07-21', '09:30', 'Invented counterparty',
    'bbbbbbbb-0000-4000-8000-000000000001', 'Invented note')->>'kind',
  'withdrawal',
  'a cash payment is recorded and returns what it recorded'
);
select is(
  (select amount_minor::text from public.cash_entries where occurred_on = '2026-07-21'),
  '-45000',
  'the amount is stored exactly, as a signed minor-unit integer'
);
select is(
  (select event_type from public.audit_events order by id desc limit 1),
  'cash.entry.created',
  'recording cash writes an audit event'
);
select is(
  (select sequence::text from public.mutation_sequences where owner_id = '11111111-1111-4111-8111-111111111111'),
  '1',
  'recording cash advances the mutation sequence, so the backup knows it is stale'
);
select throws_ok(
  $$select public.create_cash_entry('withdrawal', '-045000', '2026-07-21', null, null, null, null)$$,
  'cash entry amount must be canonical int64 text',
  'a non-canonical amount is refused rather than silently normalised'
);
select throws_ok(
  $$select public.create_cash_entry('withdrawal', '45000', '2026-07-21', null, null, null, null)$$,
  'cash entry amount sign does not match its kind',
  'a withdrawal recorded as a positive number is refused'
);
select throws_ok(
  $$select public.create_cash_entry('transfer', '-45000', '2026-07-21', null, null, null, null)$$,
  'invalid cash entry kind',
  'a kind outside the vocabulary is refused'
);
select throws_ok(
  $$select public.create_cash_entry('withdrawal', '-45000', '2026-07-21', null, null, 'bbbbbbbb-0000-4000-8000-0000000000ff', null)$$,
  'category not owned',
  'a category this owner does not hold is refused'
);
select throws_ok(
  $$update public.cash_entries set amount_minor = -1$$,
  'cash_entries is append-only: UPDATE is forbidden',
  'a recorded cash payment cannot be edited in place'
);
select throws_ok(
  $$delete from public.cash_entries$$,
  'cash_entries is append-only: DELETE is forbidden',
  'a recorded cash payment cannot be deleted'
);

-- -------------------------------------------------- set_cash_entry_correction

select is(
  public.set_cash_entry_correction(
    (select id from public.cash_entries where occurred_on = '2026-07-21'),
    0, 'withdrawal', '-46000', null, null, null, null, null)->>'revision',
  '1',
  'a first correction is revision 1'
);
select is(
  (select amount_minor::text from public.cash_entry_overlays),
  '-46000',
  'the corrected amount is stored beside the original rather than over it'
);
select is(
  (select amount_minor::text from public.cash_entries where occurred_on = '2026-07-21'),
  '-45000',
  'the original figure is still readable, which is the whole point of correcting by overlay'
);
select is(
  (select count(*)::text from public.cash_entry_revisions),
  '1',
  'the correction is recorded in the append-only history'
);
select is(
  (select event_type from public.audit_events order by id desc limit 1),
  'cash.entry.corrected',
  'correcting cash writes its own audit event'
);
select throws_ok(
  $$select public.set_cash_entry_correction(
      (select id from public.cash_entries where occurred_on = '2026-07-21'),
      0, 'withdrawal', '-47000', null, null, null, null, null)$$,
  'cash correction revision conflict',
  'a stale expected revision is refused rather than overwritten'
);
select throws_ok(
  $$select public.set_cash_entry_correction(
      (select id from public.cash_entries where occurred_on = '2026-07-21'),
      1, null, '-47000', null, null, null, null, null)$$,
  'cash correction amount and kind move together',
  'a corrected amount with no kind is refused, so a sign can never be orphaned'
);
select is(
  public.set_cash_entry_correction(
    (select id from public.cash_entries where occurred_on = '2026-07-21'),
    1, null, null, null, null, null, null, null)->>'revision',
  '2',
  'a correction can be cleared, which is what makes a mistaken correction correctable'
);
select throws_ok(
  $$update public.cash_entry_revisions set revision = 99$$,
  'cash_entry_revisions is append-only: UPDATE is forbidden',
  'a stored correction revision cannot be updated'
);
select throws_ok(
  $$delete from public.cash_entry_revisions$$,
  'cash_entry_revisions is append-only: DELETE is forbidden',
  'a stored correction revision cannot be deleted'
);

-- ------------------------------------------------------ set_slip_correction

select is(
  public.set_slip_correction('ffffffff-0000-4000-8000-000000000001', 0, null, null, '2026-07-19',
    null, 'Invented payee', null, null)->>'revision',
  '1',
  'a slip with no stored match can be corrected'
);
select throws_ok(
  $$select public.set_slip_correction('ffffffff-0000-4000-8000-0000000000ff', 0, null, null, '2026-07-19', null, null, null, null)$$,
  'slip not owned',
  'a slip this owner does not hold is refused'
);

-- Both directions of the amount/match agreement. Guarding one and not the other would leave a
-- corrected slip free to pair with a row its real figure never matched.
select is(
  public.set_slip_match('ffffffff-0000-4000-8000-000000000001', 0, 'matched', 'dddddddd-0000-4000-8000-000000000001')->>'decision',
  'matched',
  'a slip whose amount equals the statement row may be matched'
);
select throws_ok(
  $$select public.set_slip_correction('ffffffff-0000-4000-8000-000000000001', 1, 'withdrawal', '-99900', null, null, null, null, null)$$,
  'slip correction conflicts with stored match',
  'correcting an amount away from the row it is matched to is refused, not silently re-paired'
);
select is(
  public.set_slip_correction('ffffffff-0000-4000-8000-000000000001', 1, 'withdrawal', '-12500',
    null, null, null, null, null)->>'revision',
  '2',
  'a correction that still agrees with the matched row is allowed'
);

-- The other direction, and the one this file was written to catch: a correction that already
-- exists must be what a later match is checked against. Reading the slip's original amount
-- here would accept a pairing the corrected figure contradicts.
select is(
  public.set_slip_correction('ffffffff-0000-4000-8000-000000000002', 0, 'withdrawal', '-99900',
    null, null, null, null, null)->>'revision',
  '1',
  'an unmatched slip can be corrected to a different amount'
);
select is(
  public.set_slip_match('ffffffff-0000-4000-8000-000000000002', 0, 'matched', 'dddddddd-0000-4000-8000-000000000002')->>'decision',
  'matched',
  'a corrected slip matches the row its corrected amount agrees with'
);
select throws_ok(
  $$select public.set_slip_match('ffffffff-0000-4000-8000-000000000002', 1, 'matched', 'dddddddd-0000-4000-8000-000000000001')$$,
  'slip match amount mismatch',
  'and is refused against the row only its uncorrected amount would have matched'
);

-- Weak access last, so nothing above runs on a downgraded session (GOTCHAS).
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal1"}',
  true
);
select throws_ok(
  $$select public.create_cash_entry('withdrawal', '-45000', '2026-07-21', null, null, null, null)$$,
  'strong owner access required',
  'a session that has not passed MFA cannot record cash'
);

select * from finish();
rollback;
