begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

-- The owner's say over an order's ledger row, and the candidate read beneath the automatic rule
-- (migration 033, PLAN task 58 part 3, D-220).
--
-- The contract: a decision is stored, audited, revisioned and reversible; writable only through
-- `set_delivery_match`; its history is append-only; a manual link may name a row that does not
-- say GRAB but never one whose movement differs from the order's total, negated; one row is
-- claimed by at most one order; and a ฿0 order is never a candidate and never decided. The lag is
-- the row's Bangkok time minus the e-receipt's send time in Bangkok. Every value is invented.

set local session_replication_role = replica;
delete from public.delivery_match_revisions;
delete from public.delivery_match_overlays;
delete from public.delivery_adjustments;
delete from public.delivery_items;
delete from public.deliveries;
delete from public.receipt_match_revisions;
delete from public.receipt_match_overlays;
delete from public.slip_match_revisions;
delete from public.slip_match_overlays;
delete from public.source_components;
delete from public.source_transactions;
delete from public.audit_events;
delete from public.accounts;
update public.mutation_sequences
set sequence = 0, last_exported_sequence = 0, updated_at = '2026-09-24T00:00:00Z'
where owner_id = '11111111-1111-4111-8111-111111111111';
delete from auth.mfa_factors where user_id = '11111111-1111-4111-8111-111111111111';

insert into public.accounts(id, owner_id, bank_code, label, account_type, last_four, currency, timezone)
values ('cccccccc-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'SCB', 'Invented SCB', 'savings', '4242', 'THB', 'Asia/Bangkok');

-- T1: a GRAB card row eight minutes before order one's e-receipt, of its exact total.
-- T2: a row of the same amount that does not say GRAB.
-- T3: a GRAB row of a different amount.
-- T4: a GRAB row of the same amount five days later, outside the candidate read.
insert into public.source_transactions(id, owner_id, account_id, fingerprint_version, fingerprint,
  source_date, source_time, effective_date, transaction_label, description, post_balance_minor, currency)
values
  ('dddddddd-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'cccccccc-0000-4000-8000-000000000001',
   'fingerprint-v1', repeat('a', 64), '2026-09-01', '19:02', '2026-09-01', 'Card payment', 'INVENTED GRAB MERCHANT', '500000', 'THB'),
  ('dddddddd-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'cccccccc-0000-4000-8000-000000000001',
   'fingerprint-v1', repeat('b', 64), '2026-09-01', '19:05', '2026-09-01', 'Card payment', 'Invented other merchant', '490000', 'THB'),
  ('dddddddd-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 'cccccccc-0000-4000-8000-000000000001',
   'fingerprint-v1', repeat('c', 64), '2026-09-01', '19:06', '2026-09-01', 'Card payment', 'INVENTED GRAB MERCHANT', '480000', 'THB'),
  ('dddddddd-0000-4000-8000-000000000004', '11111111-1111-4111-8111-111111111111', 'cccccccc-0000-4000-8000-000000000001',
   'fingerprint-v1', repeat('d', 64), '2026-09-06', '19:00', '2026-09-06', 'Card payment', 'INVENTED GRAB MERCHANT', '470000', 'THB');

insert into public.source_components(id, owner_id, transaction_id, position, kind, amount_minor, currency)
values
  ('eeeeeeee-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'dddddddd-0000-4000-8000-000000000001', 1, 'withdrawal', -14100, 'THB'),
  ('eeeeeeee-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'dddddddd-0000-4000-8000-000000000002', 1, 'withdrawal', -14100, 'THB'),
  ('eeeeeeee-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 'dddddddd-0000-4000-8000-000000000003', 1, 'withdrawal', -99900, 'THB'),
  ('eeeeeeee-0000-4000-8000-000000000004', '11111111-1111-4111-8111-111111111111', 'dddddddd-0000-4000-8000-000000000004', 1, 'withdrawal', -14100, 'THB');

-- Two orders of the same invented total, sent at 19:10 and 20:00 Bangkok, and one ฿0 order.
insert into public.deliveries(id, owner_id, platform, booking_id, restaurant, payment_method, receipt_sent_at,
  food_minor, delivery_fee_minor, total_minor)
values
  ('ffffffff-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'grabfood', 'A-INVENTED01', 'Invented kitchen',
   'Invented card', '2026-09-01T12:10:00Z', 12000, 2100, 14100),
  ('ffffffff-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'grabfood', 'A-INVENTED02', 'Invented kitchen',
   'Invented card', '2026-09-01T13:00:00Z', 12000, 2100, 14100),
  ('ffffffff-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 'grabfood', 'A-INVENTED03', 'Invented kitchen',
   null, '2026-09-01T12:05:00Z', 14100, null, 0);
set local session_replication_role = origin;

insert into auth.mfa_factors(id, user_id, friendly_name, factor_type, status, secret, created_at, updated_at)
values ('aaaaaaaa-0000-4000-8000-000000000033', '11111111-1111-4111-8111-111111111111',
  'delivery match TOTP', 'totp', 'verified', 'SYNTHETICDELIVERYMATCH', '2026-09-24T00:00:00Z', '2026-09-24T00:00:00Z');

select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal2"}',
  true
);

select ok(
  has_table_privilege('authenticated', 'public.delivery_match_overlays', 'select')
    and has_table_privilege('authenticated', 'public.delivery_match_revisions', 'select')
    and not has_table_privilege('authenticated', 'public.delivery_match_overlays', 'insert')
    and not has_table_privilege('authenticated', 'public.delivery_match_overlays', 'update')
    and not has_table_privilege('authenticated', 'public.delivery_match_overlays', 'delete')
    and not has_table_privilege('authenticated', 'public.delivery_match_revisions', 'insert')
    and not has_table_privilege('authenticated', 'public.delivery_match_revisions', 'update')
    and not has_table_privilege('authenticated', 'public.delivery_match_revisions', 'delete'),
  'authenticated may read its delivery match decisions and write neither table directly'
);
select ok(
  (select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.delivery_match_overlays'::regclass)
    and (select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.delivery_match_revisions'::regclass),
  'both delivery match tables have row level security enabled and forced'
);
select ok(
  not has_function_privilege('anon', 'public.delivery_ledger_candidates()', 'execute')
    and not has_function_privilege('anon', 'public.set_delivery_match(uuid,integer,text,uuid)', 'execute'),
  'anon can call neither the candidate read nor the write path'
);

-- The candidate read, as `authenticated` so row-level security is actually in force.
set local role authenticated;
select is(
  (select string_agg(right(transaction_id::text, 1) || ':' || lag_minutes || ':' || names_grab, ',' order by transaction_id)
     from public.delivery_ledger_candidates() where delivery_id = 'ffffffff-0000-4000-8000-000000000001'),
  '1:-8:true,2:-5:false',
  'order one''s candidates are the equal-amount rows within three days, lag in Bangkok time, and whether they name GRAB'
);
select is(
  (select string_agg(right(transaction_id::text, 1) || ':' || lag_minutes, ',' order by transaction_id)
     from public.delivery_ledger_candidates() where delivery_id = 'ffffffff-0000-4000-8000-000000000002'),
  '1:-58,2:-55',
  'a second order of the same total sees the same rows, so the rule can refuse the contest'
);
select is(
  (select count(*)::integer from public.delivery_ledger_candidates() where delivery_id = 'ffffffff-0000-4000-8000-000000000003'),
  0,
  'a ฿0 order has no candidates'
);
reset role;

select is(
  public.set_delivery_match('ffffffff-0000-4000-8000-000000000001', 0, 'matched', 'dddddddd-0000-4000-8000-000000000001')->>'revision',
  '1',
  'a first decision is revision 1'
);
select is(
  (select decision || ' ' || transaction_id::text from public.delivery_match_overlays
    where delivery_id = 'ffffffff-0000-4000-8000-000000000001'),
  'matched dddddddd-0000-4000-8000-000000000001',
  'the decision and its ledger row are stored'
);
select is(
  (select count(*)::text from public.delivery_match_revisions where delivery_id = 'ffffffff-0000-4000-8000-000000000001'),
  '1',
  'the decision is recorded in the append-only history'
);
select is(
  (select event_type from public.audit_events where entity_id = 'ffffffff-0000-4000-8000-000000000001' order by id desc limit 1),
  'delivery.match.matched',
  'the decision writes an audit event naming what was decided'
);
select is(
  (select sequence::text from public.mutation_sequences where owner_id = '11111111-1111-4111-8111-111111111111'),
  '1',
  'the decision advances the mutation sequence, so the backup knows it is stale'
);

select throws_ok(
  $$select public.set_delivery_match('ffffffff-0000-4000-8000-000000000001', 0, 'unmatched', null)$$,
  'delivery match revision conflict',
  'a stale expected revision is refused rather than overwritten'
);
select is(
  public.set_delivery_match('ffffffff-0000-4000-8000-000000000001', 1, 'matched', 'dddddddd-0000-4000-8000-000000000002')->>'transaction_id',
  'dddddddd-0000-4000-8000-000000000002',
  'a manual link may name a row that does not say GRAB, when the amount agrees'
);
select is(
  public.set_delivery_match('ffffffff-0000-4000-8000-000000000001', 2, 'unmatched', null)->>'revision',
  '3',
  'a match can be undone, and the undo is the next revision'
);
select throws_ok(
  $$select public.set_delivery_match('ffffffff-0000-4000-8000-000000000001', 3, 'matched', null)$$,
  'invalid delivery match decision',
  'a match with no ledger row is refused'
);

-- The money guard, which is all a manual link is still held to.
select throws_ok(
  $$select public.set_delivery_match('ffffffff-0000-4000-8000-000000000001', 3, 'matched', 'dddddddd-0000-4000-8000-000000000003')$$,
  'delivery match amount mismatch',
  'a row whose movement is not the order''s total is refused, to the minor unit'
);
select throws_ok(
  $$select public.set_delivery_match('ffffffff-0000-4000-8000-000000000003', 0, 'matched', 'dddddddd-0000-4000-8000-000000000001')$$,
  'delivery paid outside the platform',
  'a ฿0 order cannot be linked to a card row'
);
select throws_ok(
  $$select public.set_delivery_match('ffffffff-0000-4000-8000-00000000dead', 0, 'unmatched', null)$$,
  'delivery not owned',
  'an order this owner does not hold is refused'
);
select throws_ok(
  $$select public.set_delivery_match('ffffffff-0000-4000-8000-000000000002', 0, 'matched', 'dddddddd-0000-4000-8000-00000000dead')$$,
  'transaction not owned',
  'a ledger row this owner does not hold is refused'
);

-- One payment, one order.
select is(
  public.set_delivery_match('ffffffff-0000-4000-8000-000000000002', 0, 'matched', 'dddddddd-0000-4000-8000-000000000001')->>'decision',
  'matched',
  'the second order may claim a row nothing else holds'
);
select throws_ok(
  $$select public.set_delivery_match('ffffffff-0000-4000-8000-000000000001', 3, 'matched', 'dddddddd-0000-4000-8000-000000000001')$$,
  'ledger row already claimed by another delivery',
  'a row already claimed by another order is refused rather than silently moved'
);

select throws_ok(
  $$delete from public.delivery_match_revisions$$,
  'delivery_match_revisions is append-only: DELETE is forbidden',
  'a stored revision cannot be deleted'
);

-- In the export, not merely permitted by it (backup v11).
select ok(
  (public.export_backup_snapshot() -> 'tableCounts') ?& array['delivery_match_overlays', 'delivery_match_revisions'],
  'the export carries both delivery match tables'
);

-- Weak access last, so nothing above runs on a downgraded session.
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal1"}',
  true
);
select throws_ok(
  $$select public.set_delivery_match('ffffffff-0000-4000-8000-000000000001', 3, 'unmatched', null)$$,
  'strong owner access required',
  'a session that has not passed MFA cannot decide a match'
);

select * from finish();
rollback;
