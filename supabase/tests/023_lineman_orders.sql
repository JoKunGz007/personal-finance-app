begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

-- LINE MAN orders in `deliveries`, their order time and charged amount in `lineman_order_details`
-- (migration 036, PLAN task 58 part 4, D-223).
--
-- What this proves: the new table is select-only with RLS forced; `capture_delivery` stores a
-- LINE MAN order with its details, refuses a charge above the total, and still requires a send
-- time for GrabFood; a second copy whose charged amount disagrees is refused; the candidate read
-- times a LINE MAN order from its order time and matches its charged amount; and
-- `set_delivery_match` holds a link to that amount. Every value below is invented.

set local session_replication_role = replica;
delete from public.ride_match_revisions;
delete from public.ride_match_overlays;
delete from public.ride_adjustments;
delete from public.rides;
delete from public.delivery_match_revisions;
delete from public.delivery_match_overlays;
delete from public.lineman_order_details;
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

-- T1: ฿15 two minutes after the 18:20 order — the split order's charged fee.
-- T2: ฿195, the split order's total, which it must not match.
insert into public.source_transactions(id, owner_id, account_id, fingerprint_version, fingerprint,
  source_date, source_time, effective_date, transaction_label, description, post_balance_minor, currency)
values
  ('dddddddd-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'cccccccc-0000-4000-8000-000000000001',
   'fingerprint-v1', repeat('a', 64), '2026-08-22', '18:22', '2026-08-22', 'Invented payment', 'INVENTED LINE MAN', '500000', 'THB'),
  ('dddddddd-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'cccccccc-0000-4000-8000-000000000001',
   'fingerprint-v1', repeat('b', 64), '2026-08-22', '18:23', '2026-08-22', 'Invented payment', 'INVENTED LINE MAN', '490000', 'THB');
insert into public.source_components(id, owner_id, transaction_id, position, kind, amount_minor, currency)
values
  ('eeeeeeee-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'dddddddd-0000-4000-8000-000000000001', 1, 'withdrawal', -1500, 'THB'),
  ('eeeeeeee-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'dddddddd-0000-4000-8000-000000000002', 1, 'withdrawal', -19500, 'THB');
set local session_replication_role = origin;

insert into auth.mfa_factors(id, user_id, friendly_name, factor_type, status, secret, created_at, updated_at)
values ('aaaaaaaa-0000-4000-8000-000000000036', '11111111-1111-4111-8111-111111111111',
  'lineman TOTP', 'totp', 'verified', 'SYNTHETICLINEMAN', '2026-09-24T00:00:00Z', '2026-09-24T00:00:00Z');
select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal2"}', true);

select ok(
  has_table_privilege('authenticated', 'public.lineman_order_details', 'select')
    and not has_table_privilege('authenticated', 'public.lineman_order_details', 'insert')
    and not has_table_privilege('authenticated', 'public.lineman_order_details', 'update')
    and not has_table_privilege('authenticated', 'public.lineman_order_details', 'delete')
    and (select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.lineman_order_details'::regclass),
  'LINE MAN details are select-only with RLS forced'
);

create temporary table invented_order as select jsonb_build_object(
  'platform', 'lineman', 'bookingId', 'LMF-260822-000000001', 'restaurant', 'Invented kitchen',
  'paymentMethod', 'Pay delivery fee with mobile banking', 'orderedAt', '2026-08-22T18:20:00+07:00',
  'foodMinor', '18000', 'deliveryFeeMinor', '3000', 'totalMinor', '19500', 'chargedMinor', '1500',
  'items', jsonb_build_array(jsonb_build_object('position', 1, 'quantity', 1, 'name', 'Invented dish', 'options', '[]'::jsonb, 'amountMinor', '18000')),
  'adjustments', jsonb_build_array(jsonb_build_object('position', 1, 'kind', 'discount', 'name', 'Invented delivery discount', 'amountMinor', '1500'))
) as value;
grant select on invented_order to authenticated;

select is((public.capture_delivery((select value from invented_order)))->>'captured', 'true', 'a LINE MAN order is captured');
select is(
  (select d.platform || '|' || coalesce(d.receipt_sent_at::text, 'no send time') || '|' || l.charged_minor || '|' || d.total_minor
     from public.deliveries d join public.lineman_order_details l on l.delivery_id = d.id),
  'lineman|no send time|1500|19500',
  'it is a deliveries row with no send time, and its charged amount is in the details'
);
select is(
  (select ordered_at from public.lineman_order_details),
  '2026-08-22T18:20:00+07:00'::timestamptz,
  'its order time is stored'
);
select is((public.capture_delivery((select value from invented_order)))->>'captured', 'false', 'a second copy is a no-op');
select throws_ok(
  $$select public.capture_delivery((select value || jsonb_build_object('chargedMinor', '1600') from invented_order))$$,
  'delivery disagrees with the stored copy; refusing to guess which reading is right',
  'a second copy whose charged amount disagrees is refused'
);
select throws_ok(
  $$select public.capture_delivery((select value || jsonb_build_object('bookingId', 'LMF-260822-000000002', 'chargedMinor', '19600') from invented_order))$$,
  'delivery charged more than its total',
  'more charged than the total is refused'
);
select throws_ok(
  $$select public.capture_delivery((select value || jsonb_build_object('bookingId', 'LMF-260822-000000003', 'chargedMinor', 1500) from invented_order))$$,
  'delivery money must be canonical int64 text',
  'the charged amount must cross as canonical text'
);
select throws_ok(
  $$select public.capture_delivery((select value || jsonb_build_object('platform', 'grabfood', 'bookingId', 'A-INVENTED0009') from invented_order))$$,
  'invalid delivery date',
  'a GrabFood order still needs its send time'
);
select throws_ok(
  $$update public.deliveries set receipt_sent_at = null$$,
  'deliveries is append-only: UPDATE is forbidden',
  'stored orders stay append-only'
);

set local role authenticated;
select is(
  (select string_agg(right(transaction_id::text, 1) || ':' || lag_minutes, ',') from public.delivery_ledger_candidates()),
  '1:2',
  'the candidate read matches the charged amount, not the total, timed from the order'
);
reset role;

select throws_ok(
  $$select public.set_delivery_match((select id from public.deliveries), 0, 'matched', 'dddddddd-0000-4000-8000-000000000002')$$,
  'delivery match amount mismatch',
  'a link to a row of the total, not the charged amount, is refused'
);
select is(
  public.set_delivery_match((select id from public.deliveries), 0, 'matched', 'dddddddd-0000-4000-8000-000000000001')->>'decision',
  'matched',
  'a link to the charged amount is stored'
);
select ok(
  (public.export_backup_snapshot() -> 'tableCounts') ? 'lineman_order_details'
    and (public.export_backup_snapshot() ->> 'schemaVersion') = '13',
  'the export carries the LINE MAN table at schema version 13'
);

select * from finish();
rollback;
