begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

-- The owner's say over a receipt's ledger row, and the candidate read beneath the automatic
-- rule (migration 030, PLAN task 56, D-212).
--
-- The contract: a decision is stored, audited, revisioned and reversible; writable only through
-- `set_receipt_match`; its history is append-only; a manual link may name a row that does not
-- say TRUE MONEY (the reimbursement case) but never one whose movement differs from the
-- receipt's net, negated; and one row is claimed by at most one receipt. Refusals are asserted
-- by message. Every value is invented.

set local session_replication_role = replica;
delete from public.receipt_match_revisions;
delete from public.receipt_match_overlays;
delete from public.receipt_items;
delete from public.receipt_discounts;
delete from public.receipts;
delete from public.slip_match_revisions;
delete from public.slip_match_overlays;
delete from public.source_components;
delete from public.source_transactions;
delete from public.audit_events;
delete from public.accounts;
update public.mutation_sequences
set sequence = 0, last_exported_sequence = 0, updated_at = '2026-09-23T00:00:00Z'
where owner_id = '11111111-1111-4111-8111-111111111111';
delete from auth.mfa_factors where user_id = '11111111-1111-4111-8111-111111111111';

insert into public.accounts(id, owner_id, bank_code, label, account_type, last_four, currency, timezone)
values ('cccccccc-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'SCB', 'Invented SCB', 'savings', '4242', 'THB', 'Asia/Bangkok');

-- T1: a TRUE MONEY pull two minutes after receipt one, of its exact amount.
-- T2: a PromptPay row of the same amount, one minute after — the reimbursement shape.
-- T3: a TRUE MONEY pull of a different amount.
-- T4: a TRUE MONEY pull of the same amount four days later, outside the candidate read.
insert into public.source_transactions(id, owner_id, account_id, fingerprint_version, fingerprint,
  source_date, source_time, effective_date, transaction_label, description, post_balance_minor, currency)
values
  ('dddddddd-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'cccccccc-0000-4000-8000-000000000001',
   'fingerprint-v1', repeat('a', 64), '2026-09-01', '10:02', '2026-09-01', 'SIPI', 'SIPS TRUE MONEY CO.,LTD. NOTE : -', '500000', 'THB'),
  ('dddddddd-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'cccccccc-0000-4000-8000-000000000001',
   'fingerprint-v1', repeat('b', 64), '2026-09-01', '10:01', '2026-09-01', 'ENET', 'PromptPay invented payee', '490000', 'THB'),
  ('dddddddd-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 'cccccccc-0000-4000-8000-000000000001',
   'fingerprint-v1', repeat('c', 64), '2026-09-01', '10:30', '2026-09-01', 'SIPI', 'SIPS TRUE MONEY CO.,LTD. NOTE : -', '480000', 'THB'),
  ('dddddddd-0000-4000-8000-000000000004', '11111111-1111-4111-8111-111111111111', 'cccccccc-0000-4000-8000-000000000001',
   'fingerprint-v1', repeat('d', 64), '2026-09-05', '10:00', '2026-09-05', 'SIPI', 'SIPS TRUE MONEY CO.,LTD. NOTE : -', '470000', 'THB');

insert into public.source_components(id, owner_id, transaction_id, position, kind, amount_minor, currency)
values
  ('eeeeeeee-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'dddddddd-0000-4000-8000-000000000001', 1, 'withdrawal', -14100, 'THB'),
  ('eeeeeeee-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'dddddddd-0000-4000-8000-000000000002', 1, 'withdrawal', -14100, 'THB'),
  ('eeeeeeee-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 'dddddddd-0000-4000-8000-000000000003', 1, 'withdrawal', -99900, 'THB'),
  ('eeeeeeee-0000-4000-8000-000000000004', '11111111-1111-4111-8111-111111111111', 'dddddddd-0000-4000-8000-000000000004', 1, 'withdrawal', -14100, 'THB');

-- Two receipts of the same invented net, an hour apart, so one row has two possible claimants.
insert into public.receipts(id, owner_id, merchant, store_code, branch_name, receipt_number, purchased_on,
  purchased_at_time, payment_method, net_minor, completeness, sources, items_source, items_complete)
values
  ('ffffffff-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', '7-eleven', '0001', 'Invented branch', '1',
   '2026-09-01', '10:00', 'Invented wallet', 14100, 'complete', '{condensed}', 'condensed', true),
  ('ffffffff-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', '7-eleven', '0001', 'Invented branch', '2',
   '2026-09-01', '11:00', 'Invented wallet', 14100, 'complete', '{condensed}', 'condensed', true);
set local session_replication_role = origin;

insert into auth.mfa_factors(id, user_id, friendly_name, factor_type, status, secret, created_at, updated_at)
values ('aaaaaaaa-0000-4000-8000-000000000031', '11111111-1111-4111-8111-111111111111',
  'receipt match TOTP', 'totp', 'verified', 'SYNTHETICRECEIPTMATCH', '2026-09-23T00:00:00Z', '2026-09-23T00:00:00Z');

select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal2"}',
  true
);

select ok(
  has_table_privilege('authenticated', 'public.receipt_match_overlays', 'select')
    and has_table_privilege('authenticated', 'public.receipt_match_revisions', 'select'),
  'authenticated may read its own receipt match decisions and their history'
);
select ok(
  not has_table_privilege('authenticated', 'public.receipt_match_overlays', 'insert')
    and not has_table_privilege('authenticated', 'public.receipt_match_overlays', 'update')
    and not has_table_privilege('authenticated', 'public.receipt_match_overlays', 'delete')
    and not has_table_privilege('authenticated', 'public.receipt_match_revisions', 'insert')
    and not has_table_privilege('authenticated', 'public.receipt_match_revisions', 'update')
    and not has_table_privilege('authenticated', 'public.receipt_match_revisions', 'delete'),
  'authenticated holds no direct write on either receipt match table'
);
select ok(
  (select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.receipt_match_overlays'::regclass)
    and (select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.receipt_match_revisions'::regclass),
  'both receipt match tables have row level security enabled and forced'
);
select ok(
  not has_function_privilege('anon', 'public.receipt_ledger_candidates()', 'execute')
    and not has_function_privilege('anon', 'public.set_receipt_match(uuid,integer,text,uuid)', 'execute'),
  'anon can call neither the candidate read nor the write path'
);

-- The candidate read, as `authenticated` so row-level security is actually in force.
set local role authenticated;
select is(
  (select string_agg(right(transaction_id::text, 1) || ':' || lag_minutes || ':' || names_true_money, ',' order by transaction_id)
     from public.receipt_ledger_candidates() where receipt_id = 'ffffffff-0000-4000-8000-000000000001'),
  '1:2:true,2:1:false',
  'receipt one''s candidates are the equal-amount rows within three days, with lag and whether they name TRUE MONEY'
);
select is(
  (select string_agg(right(transaction_id::text, 1) || ':' || lag_minutes, ',' order by transaction_id)
     from public.receipt_ledger_candidates() where receipt_id = 'ffffffff-0000-4000-8000-000000000002'),
  '1:-58,2:-59',
  'a row before the receipt still reads, with a negative lag, so the rule can refuse it rather than never see it'
);
reset role;

select is(
  public.set_receipt_match('ffffffff-0000-4000-8000-000000000001', 0, 'matched', 'dddddddd-0000-4000-8000-000000000001')->>'revision',
  '1',
  'a first decision is revision 1'
);
select is(
  (select decision || ' ' || transaction_id::text from public.receipt_match_overlays
    where receipt_id = 'ffffffff-0000-4000-8000-000000000001'),
  'matched dddddddd-0000-4000-8000-000000000001',
  'the decision and its ledger row are stored'
);
select is(
  (select count(*)::text from public.receipt_match_revisions where receipt_id = 'ffffffff-0000-4000-8000-000000000001'),
  '1',
  'the decision is recorded in the append-only history'
);
select is(
  (select event_type from public.audit_events where entity_id = 'ffffffff-0000-4000-8000-000000000001' order by id desc limit 1),
  'receipt.match.matched',
  'the decision writes an audit event naming what was decided'
);
select is(
  (select sequence::text from public.mutation_sequences where owner_id = '11111111-1111-4111-8111-111111111111'),
  '1',
  'the decision advances the mutation sequence, so the backup knows it is stale'
);

select throws_ok(
  $$select public.set_receipt_match('ffffffff-0000-4000-8000-000000000001', 0, 'unmatched', null)$$,
  'receipt match revision conflict',
  'a stale expected revision is refused rather than overwritten'
);

-- The reimbursement case: a manual link to a row that does not name TRUE MONEY is allowed.
select is(
  public.set_receipt_match('ffffffff-0000-4000-8000-000000000001', 1, 'matched', 'dddddddd-0000-4000-8000-000000000002')->>'transaction_id',
  'dddddddd-0000-4000-8000-000000000002',
  'a manual link may name a row that does not say TRUE MONEY, when the amount agrees'
);
select is(
  public.set_receipt_match('ffffffff-0000-4000-8000-000000000001', 2, 'unmatched', null)->>'revision',
  '3',
  'a match can be undone, and the undo is the next revision'
);
select is(
  (select decision || ' ' || coalesce(transaction_id::text, 'none') from public.receipt_match_overlays
    where receipt_id = 'ffffffff-0000-4000-8000-000000000001'),
  'unmatched none',
  'undoing clears the ledger row rather than leaving a stale one behind'
);

select throws_ok(
  $$select public.set_receipt_match('ffffffff-0000-4000-8000-000000000001', 3, 'matched', null)$$,
  'invalid receipt match decision',
  'a match with no ledger row is refused'
);
select throws_ok(
  $$select public.set_receipt_match('ffffffff-0000-4000-8000-000000000001', 3, 'unmatched', 'dddddddd-0000-4000-8000-000000000001')$$,
  'invalid receipt match decision',
  'an undo carrying a ledger row is refused'
);
select throws_ok(
  $$select public.set_receipt_match('ffffffff-0000-4000-8000-000000000001', 3, 'ignored', null)$$,
  'invalid receipt match decision',
  'a decision outside the vocabulary is refused'
);

-- The money guard, which is all a manual link is still held to.
select throws_ok(
  $$select public.set_receipt_match('ffffffff-0000-4000-8000-000000000001', 3, 'matched', 'dddddddd-0000-4000-8000-000000000003')$$,
  'receipt match amount mismatch',
  'a row whose movement is not the receipt''s net is refused, to the minor unit'
);
select throws_ok(
  $$select public.set_receipt_match('ffffffff-0000-4000-8000-00000000dead', 0, 'unmatched', null)$$,
  'receipt not owned',
  'a receipt this owner does not hold is refused'
);
select throws_ok(
  $$select public.set_receipt_match('ffffffff-0000-4000-8000-000000000002', 0, 'matched', 'dddddddd-0000-4000-8000-00000000dead')$$,
  'transaction not owned',
  'a ledger row this owner does not hold is refused'
);

-- One payment, one receipt.
select is(
  public.set_receipt_match('ffffffff-0000-4000-8000-000000000002', 0, 'matched', 'dddddddd-0000-4000-8000-000000000001')->>'decision',
  'matched',
  'the second receipt may claim a row nothing else holds'
);
select throws_ok(
  $$select public.set_receipt_match('ffffffff-0000-4000-8000-000000000001', 3, 'matched', 'dddddddd-0000-4000-8000-000000000001')$$,
  'ledger row already claimed by another receipt',
  'a row already claimed by another receipt is refused rather than silently moved'
);

select throws_ok(
  $$update public.receipt_match_revisions set revision = 99$$,
  'receipt_match_revisions is append-only: UPDATE is forbidden',
  'a stored revision cannot be updated'
);
select throws_ok(
  $$delete from public.receipt_match_revisions$$,
  'receipt_match_revisions is append-only: DELETE is forbidden',
  'a stored revision cannot be deleted'
);

-- In the export, not merely permitted by it (backup v9).
select ok(
  (public.export_backup_snapshot() -> 'tableCounts') ?& array['receipt_match_overlays', 'receipt_match_revisions'],
  'the export carries both receipt match tables'
);

-- Weak access last, so nothing above runs on a downgraded session.
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal1"}',
  true
);
select throws_ok(
  $$select public.set_receipt_match('ffffffff-0000-4000-8000-000000000001', 3, 'unmatched', null)$$,
  'strong owner access required',
  'a session that has not passed MFA cannot decide a match'
);

select * from finish();
rollback;
