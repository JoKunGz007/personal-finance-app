begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

-- The owner's say over a slip match (migration 012, PLAN task 22 second half).
--
-- The contract these tests hold: a decision is stored, audited, revisioned and reversible;
-- it is writable only through `set_slip_match`; its history is append-only even though the
-- current value is not; and it may not pair records whose bank or money disagree, nor let
-- two slips claim one statement row. Every refusal is asserted **by its message**, because a
-- check that passes on a different error is the failure this file exists to prevent.

set local session_replication_role = replica;
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

-- Fixture ledger. Every value invented; the two accounts differ in bank so the bank guard
-- can be exercised against a real row rather than a missing one.
insert into public.accounts(id, owner_id, bank_code, label, account_type, last_four, currency, timezone)
values
  ('cccccccc-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'SCB', 'Invented SCB', 'savings', '4242', 'THB', 'Asia/Bangkok'),
  ('cccccccc-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'KTB', 'Invented KTB', 'savings', '1357', 'THB', 'Asia/Bangkok');

insert into public.source_transactions(id, owner_id, account_id, fingerprint_version, fingerprint,
  source_date, source_time, effective_date, transaction_label, description, post_balance_minor, currency)
values
  ('dddddddd-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'cccccccc-0000-4000-8000-000000000001',
   'fingerprint-v1', repeat('a', 64), '2026-07-20', '13:45', '2026-07-20', 'Invented label', 'Invented description', '500000', 'THB'),
  ('dddddddd-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'cccccccc-0000-4000-8000-000000000001',
   'fingerprint-v1', repeat('b', 64), '2026-07-20', '14:00', '2026-07-20', 'Invented label two', 'Invented description two', '490000', 'THB'),
  ('dddddddd-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 'cccccccc-0000-4000-8000-000000000002',
   'fingerprint-v1', repeat('c', 64), '2026-07-20', '15:00', '2026-07-20', 'Invented label three', 'Invented description three', '300000', 'THB');

insert into public.source_components(id, owner_id, transaction_id, position, kind, amount_minor, currency)
values
  ('eeeeeeee-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'dddddddd-0000-4000-8000-000000000001', 1, 'withdrawal', -12500, 'THB'),
  ('eeeeeeee-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'dddddddd-0000-4000-8000-000000000002', 1, 'withdrawal', -99900, 'THB'),
  ('eeeeeeee-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 'dddddddd-0000-4000-8000-000000000003', 1, 'withdrawal', -12500, 'THB');

-- Two SCB slips of the same invented amount, so one statement row has two possible claimants.
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
  ('aaaaaaaa-0000-4000-8000-000000000031', '11111111-1111-4111-8111-111111111111',
   'slip match TOTP one', 'totp', 'verified', 'SYNTHETICMATCHONE', '2026-07-24T00:00:00Z', '2026-07-24T00:00:00Z'),
  ('aaaaaaaa-0000-4000-8000-000000000032', '11111111-1111-4111-8111-111111111111',
   'slip match TOTP two', 'totp', 'verified', 'SYNTHETICMATCHTWO', '2026-07-24T00:00:00Z', '2026-07-24T00:00:00Z');

select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal2"}',
  true
);

-- Least privilege, stated for both tables: readable, writable only through the function.
select ok(
  has_table_privilege('authenticated', 'public.slip_match_overlays', 'select')
    and has_table_privilege('authenticated', 'public.slip_match_revisions', 'select'),
  'authenticated may read its own match decisions and their history'
);
select ok(
  not has_table_privilege('authenticated', 'public.slip_match_overlays', 'insert')
    and not has_table_privilege('authenticated', 'public.slip_match_overlays', 'update')
    and not has_table_privilege('authenticated', 'public.slip_match_overlays', 'delete')
    and not has_table_privilege('authenticated', 'public.slip_match_revisions', 'insert')
    and not has_table_privilege('authenticated', 'public.slip_match_revisions', 'update')
    and not has_table_privilege('authenticated', 'public.slip_match_revisions', 'delete'),
  'authenticated holds no direct write on either match table'
);
select ok(
  (select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.slip_match_overlays'::regclass)
    and (select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.slip_match_revisions'::regclass),
  'both match tables have row level security enabled and forced'
);

-- A first decision: this slip is that row.
select is(
  public.set_slip_match('ffffffff-0000-4000-8000-000000000001', 0, 'matched', 'dddddddd-0000-4000-8000-000000000001')->>'revision',
  '1',
  'a first decision is revision 1'
);
select is(
  (select decision || ' ' || transaction_id::text from public.slip_match_overlays
    where slip_id = 'ffffffff-0000-4000-8000-000000000001'),
  'matched dddddddd-0000-4000-8000-000000000001',
  'the decision and its statement row are stored'
);
select is(
  (select count(*)::text from public.slip_match_revisions where slip_id = 'ffffffff-0000-4000-8000-000000000001'),
  '1',
  'the decision is recorded in the append-only history'
);
select is(
  (select event_type from public.audit_events where entity_id = 'ffffffff-0000-4000-8000-000000000001' order by id desc limit 1),
  'slip.match.matched',
  'the decision writes an audit event naming what was decided'
);
select is(
  (select sequence::text from public.mutation_sequences where owner_id = '11111111-1111-4111-8111-111111111111'),
  '1',
  'the decision advances the mutation sequence, so the backup knows it is stale'
);

-- Optimistic concurrency. Two tabs disagreeing is a conflict worth surfacing, because the
-- loser's intent is invisible afterwards.
select throws_ok(
  $$select public.set_slip_match('ffffffff-0000-4000-8000-000000000001', 0, 'unmatched', null)$$,
  'slip match revision conflict',
  'a stale expected revision is refused rather than overwritten'
);

-- Undo: the thing D-063 recorded as missing.
select is(
  public.set_slip_match('ffffffff-0000-4000-8000-000000000001', 1, 'unmatched', null)->>'revision',
  '2',
  'a match can be undone, and the undo is the next revision'
);
select is(
  (select decision || ' ' || coalesce(transaction_id::text, 'none') from public.slip_match_overlays
    where slip_id = 'ffffffff-0000-4000-8000-000000000001'),
  'unmatched none',
  'undoing clears the statement row rather than leaving a stale one behind'
);
select is(
  (select count(*)::text from public.slip_match_revisions where slip_id = 'ffffffff-0000-4000-8000-000000000001'),
  '2',
  'the history keeps both decisions'
);

-- The decision vocabulary, and the null that must travel with it.
select throws_ok(
  $$select public.set_slip_match('ffffffff-0000-4000-8000-000000000001', 2, 'matched', null)$$,
  'invalid slip match decision',
  'a match with no statement row is refused'
);
select throws_ok(
  $$select public.set_slip_match('ffffffff-0000-4000-8000-000000000001', 2, 'unmatched', 'dddddddd-0000-4000-8000-000000000001')$$,
  'invalid slip match decision',
  'an undo carrying a statement row is refused'
);
select throws_ok(
  $$select public.set_slip_match('ffffffff-0000-4000-8000-000000000001', 2, 'ignored', null)$$,
  'invalid slip match decision',
  'a decision outside the vocabulary is refused'
);

-- The two facts a manual match is still held to. Overriding resolves ambiguity; it does not
-- license declaring that two unrelated sums are one payment.
select throws_ok(
  $$select public.set_slip_match('ffffffff-0000-4000-8000-000000000001', 2, 'matched', 'dddddddd-0000-4000-8000-000000000003')$$,
  'slip match bank mismatch',
  'a row at another bank is refused however well the amount agrees'
);
select throws_ok(
  $$select public.set_slip_match('ffffffff-0000-4000-8000-000000000001', 2, 'matched', 'dddddddd-0000-4000-8000-000000000002')$$,
  'slip match amount mismatch',
  'a row whose money differs is refused, to the minor unit'
);

select throws_ok(
  $$select public.set_slip_match('ffffffff-0000-4000-8000-00000000dead', 0, 'unmatched', null)$$,
  'slip not owned',
  'a slip this owner does not hold is refused'
);
select throws_ok(
  $$select public.set_slip_match('ffffffff-0000-4000-8000-000000000002', 0, 'matched', 'dddddddd-0000-4000-8000-00000000dead')$$,
  'transaction not owned',
  'a statement row this owner does not hold is refused'
);

-- One payment, one row. The reader enforces mutual uniqueness for a *proposal*; a stored
-- decision is a fact, and two slips claiming one row would double-count the very payment
-- reconciliation exists to count once.
select is(
  public.set_slip_match('ffffffff-0000-4000-8000-000000000002', 0, 'matched', 'dddddddd-0000-4000-8000-000000000001')->>'decision',
  'matched',
  'the second slip may claim a row nothing else holds'
);
select throws_ok(
  $$select public.set_slip_match('ffffffff-0000-4000-8000-000000000001', 2, 'matched', 'dddddddd-0000-4000-8000-000000000001')$$,
  'statement row already claimed by another slip',
  'a row already claimed by another slip is refused rather than silently moved'
);

-- History is append-only even though the current value is not. That asymmetry is the whole
-- reason this is two tables instead of a column on public.slips.
select throws_ok(
  $$update public.slip_match_revisions set revision = 99$$,
  'slip_match_revisions is append-only: UPDATE is forbidden',
  'a stored revision cannot be updated'
);
select throws_ok(
  $$delete from public.slip_match_revisions$$,
  'slip_match_revisions is append-only: DELETE is forbidden',
  'a stored revision cannot be deleted'
);

-- Weak access last, so nothing above runs on a downgraded session (GOTCHAS).
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal1"}',
  true
);
select throws_ok(
  $$select public.set_slip_match('ffffffff-0000-4000-8000-000000000001', 2, 'unmatched', null)$$,
  'strong owner access required',
  'a session that has not passed MFA cannot decide a match'
);

select * from finish();
rollback;
