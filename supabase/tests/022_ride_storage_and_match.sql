begin;
create extension if not exists pgtap with schema extensions;
select plan(31);

-- Grab rides: storage, the write path, matching, and the one-payment-one-document guard across
-- orders and rides (migration 034, PLAN task 58 part 5, D-222).
--
-- What this proves: the four tables are select-only to `authenticated` with RLS forced;
-- `capture_ride` stores a ride with its breakdown, audits it and bumps the sequence; a second
-- copy is a no-op and a disagreeing one is refused; the server re-checks the sum; the rows are
-- append-only; the candidate read keys its lag on the drop-off; `set_ride_match` holds the amount,
-- the revision and one claim per row; and a row an order holds cannot go to a ride, nor the
-- reverse. Every value below is invented.

set local session_replication_role = replica;
delete from public.ride_match_revisions;
delete from public.ride_match_overlays;
delete from public.ride_adjustments;
delete from public.rides;
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

-- T1: a GRAB row of ฿81 three minutes after the ride's 20:22 drop-off.
-- T2: a GRAB row of ฿95, held by an order below.
-- T3: a GRAB row of ฿81 on the next day — a second candidate, outside any window the page uses.
insert into public.source_transactions(id, owner_id, account_id, fingerprint_version, fingerprint,
  source_date, source_time, effective_date, transaction_label, description, post_balance_minor, currency)
values
  ('dddddddd-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'cccccccc-0000-4000-8000-000000000001',
   'fingerprint-v1', repeat('a', 64), '2026-09-12', '20:25', '2026-09-12', 'Card payment', 'INVENTED GRAB MERCHANT', '500000', 'THB'),
  ('dddddddd-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'cccccccc-0000-4000-8000-000000000001',
   'fingerprint-v1', repeat('b', 64), '2026-09-12', '21:00', '2026-09-12', 'Card payment', 'INVENTED GRAB MERCHANT', '490000', 'THB'),
  ('dddddddd-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 'cccccccc-0000-4000-8000-000000000001',
   'fingerprint-v1', repeat('c', 64), '2026-09-13', '09:00', '2026-09-13', 'Card payment', 'INVENTED GRAB MERCHANT', '480000', 'THB');
insert into public.source_components(id, owner_id, transaction_id, position, kind, amount_minor, currency)
values
  ('eeeeeeee-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'dddddddd-0000-4000-8000-000000000001', 1, 'withdrawal', -8100, 'THB'),
  ('eeeeeeee-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'dddddddd-0000-4000-8000-000000000002', 1, 'withdrawal', -9500, 'THB'),
  ('eeeeeeee-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 'dddddddd-0000-4000-8000-000000000003', 1, 'withdrawal', -8100, 'THB');

-- An order of ฿95, to contest T2 with a ride of ฿95 below.
insert into public.deliveries(id, owner_id, platform, booking_id, restaurant, payment_method, receipt_sent_at,
  food_minor, delivery_fee_minor, total_minor)
values ('ffffffff-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'grabfood', 'A-INVENTEDFOOD1',
  'Invented kitchen', 'Invented card', '2026-09-12T14:10:00Z', 8000, 1500, 9500);
set local session_replication_role = origin;

insert into auth.mfa_factors(id, user_id, friendly_name, factor_type, status, secret, created_at, updated_at)
values ('aaaaaaaa-0000-4000-8000-000000000034', '11111111-1111-4111-8111-111111111111',
  'ride TOTP', 'totp', 'verified', 'SYNTHETICRIDEMATCH', '2026-09-24T00:00:00Z', '2026-09-24T00:00:00Z');

select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal2"}',
  true
);

-- Least privilege.
select ok(
  (select bool_and(has_table_privilege('authenticated', t, 'select')
      and not has_table_privilege('authenticated', t, 'insert')
      and not has_table_privilege('authenticated', t, 'update')
      and not has_table_privilege('authenticated', t, 'delete'))
    from unnest(array['public.rides','public.ride_adjustments','public.ride_match_overlays','public.ride_match_revisions']) t),
  'authenticated may read the four ride tables and write none of them directly'
);
select ok(
  (select bool_and(relrowsecurity and relforcerowsecurity) from pg_class
    where oid in ('public.rides'::regclass, 'public.ride_adjustments'::regclass,
                  'public.ride_match_overlays'::regclass, 'public.ride_match_revisions'::regclass)),
  'all four ride tables have RLS enabled and forced'
);
select ok(
  not has_function_privilege('anon', 'public.capture_ride(jsonb)', 'execute')
    and not has_function_privilege('anon', 'public.ride_ledger_candidates()', 'execute')
    and not has_function_privilege('anon', 'public.set_ride_match(uuid,integer,text,uuid)', 'execute'),
  'anon can call none of the ride functions'
);
select ok(
  not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'rides'
    and column_name ~ '(driver|passenger|rating|plate|phone)'),
  'no column exists for a driver, a passenger, a rating, a plate or a phone number'
);

create temporary table invented_ride as select jsonb_build_object(
  'platform', 'grab', 'bookingId', 'A-INVENTEDRIDE1', 'rideType', 'Invented Bike',
  'pickedUpAt', '2026-09-12T20:05:00+07:00', 'droppedOffAt', '2026-09-12T20:22:00+07:00',
  'pickupPlace', 'Invented pickup', 'dropoffPlace', 'Invented drop-off', 'distanceMeters', 4200, 'durationMinutes', 17,
  'paymentMethod', '0000', 'fareMinor', '9000', 'platformFeeMinor', '600', 'totalMinor', '8100',
  'adjustments', jsonb_build_array(jsonb_build_object('position', 1, 'kind', 'discount', 'name', 'Promo', 'amountMinor', '1500'))
) as value;
grant select on invented_ride to authenticated;

select is(
  (public.capture_ride((select value from invented_ride)))->>'captured',
  'true',
  'a ride is captured'
);
select is(
  (select ride_type || '|' || pickup_place || '|' || dropoff_place || '|' || total_minor || '|' || distance_meters
     from public.rides where booking_id = 'A-INVENTEDRIDE1'),
  'Invented Bike|Invented pickup|Invented drop-off|8100|4200',
  'its type, places, total and distance are stored'
);
select is(
  (select kind || ' ' || name || ' ' || amount_minor from public.ride_adjustments),
  'discount Promo 1500',
  'its promo is stored as a positive discount'
);
select is(
  (select event_type from public.audit_events order by id desc limit 1),
  'ride.capture',
  'the capture is audited'
);
select is(
  (select sequence::text from public.mutation_sequences where owner_id = '11111111-1111-4111-8111-111111111111'),
  '1',
  'the capture advances the mutation sequence'
);
select is(
  (public.capture_ride((select value from invented_ride)))->>'captured',
  'false',
  'a second copy of the same booking is a no-op'
);
select throws_ok(
  $$select public.capture_ride((select value || jsonb_build_object('droppedOffAt', '2026-09-12T20:30:00+07:00') from invented_ride))$$,
  'ride disagrees with the stored copy; refusing to guess which reading is right',
  'a second copy whose times disagree is refused'
);
select throws_ok(
  $$select public.capture_ride((select value || jsonb_build_object('bookingId', 'A-INVENTEDRIDE2', 'totalMinor', '8200') from invented_ride))$$,
  'ride fare plus fee plus charges minus discounts does not equal the total',
  'the server re-checks the breakdown'
);
select throws_ok(
  $$select public.capture_ride((select value || jsonb_build_object('bookingId', 'A-INVENTEDRIDE3', 'fareMinor', 9000) from invented_ride))$$,
  'ride money must be canonical int64 text',
  'money must cross as canonical text'
);
select throws_ok(
  $$select public.capture_ride((select value || jsonb_build_object('bookingId', 'A-INVENTEDRIDE4', 'droppedOffAt', '2026-09-12T19:00:00+07:00') from invented_ride))$$,
  'invalid ride',
  'a drop-off before the pickup is refused'
);

-- A second ride of ฿95, to contest T2 with the order.
select is(
  (public.capture_ride((select value || jsonb_build_object('bookingId', 'A-INVENTEDRIDE5', 'fareMinor', '8900', 'totalMinor', '9500',
     'adjustments', '[]'::jsonb, 'pickedUpAt', '2026-09-12T20:40:00+07:00', 'droppedOffAt', '2026-09-12T20:55:00+07:00') from invented_ride)))->>'captured',
  'true',
  'a second ride with no adjustments is captured'
);

-- The candidate read, as `authenticated` so row-level security is in force.
set local role authenticated;
select is(
  (select string_agg(right(c.transaction_id::text, 1) || ':' || c.lag_minutes || ':' || c.names_grab, ',' order by c.transaction_id)
     from public.ride_ledger_candidates() c join public.rides r on r.id = c.ride_id where r.booking_id = 'A-INVENTEDRIDE1'),
  '1:3:true,3:758:true',
  'a ride''s candidates are the equal-amount rows within three days, lag after the drop-off in Bangkok time'
);
reset role;

select is(
  public.set_ride_match((select id from public.rides where booking_id = 'A-INVENTEDRIDE1'), 0, 'matched',
    'dddddddd-0000-4000-8000-000000000001')->>'revision',
  '1',
  'a first ride decision is revision 1'
);
select is(
  (select count(*)::text from public.ride_match_revisions),
  '1',
  'the decision is recorded in the append-only history'
);
select is(
  (select event_type from public.audit_events order by id desc limit 1),
  'ride.match.matched',
  'the decision is audited'
);
select throws_ok(
  $$select public.set_ride_match((select id from public.rides where booking_id = 'A-INVENTEDRIDE1'), 0, 'unmatched', null)$$,
  'ride match revision conflict',
  'a stale expected revision is refused'
);
select throws_ok(
  $$select public.set_ride_match((select id from public.rides where booking_id = 'A-INVENTEDRIDE1'), 1, 'matched', 'dddddddd-0000-4000-8000-000000000002')$$,
  'ride match amount mismatch',
  'a row whose movement is not the ride''s total is refused'
);
select throws_ok(
  $$select public.set_ride_match('ffffffff-0000-4000-8000-00000000dead', 0, 'unmatched', null)$$,
  'ride not owned',
  'a ride this owner does not hold is refused'
);

-- One payment, one document, across the two kinds.
select is(
  public.set_delivery_match('ffffffff-0000-4000-8000-000000000001', 0, 'matched', 'dddddddd-0000-4000-8000-000000000002')->>'decision',
  'matched',
  'the order links T2'
);
select throws_ok(
  $$select public.set_ride_match((select id from public.rides where booking_id = 'A-INVENTEDRIDE5'), 0, 'matched', 'dddddddd-0000-4000-8000-000000000002')$$,
  'ledger row already claimed by a delivery',
  'a ride cannot take a row an order holds'
);
select is(
  public.set_delivery_match('ffffffff-0000-4000-8000-000000000001', 1, 'unmatched', null)->>'decision',
  'unmatched',
  'the order lets T2 go'
);
select is(
  public.set_ride_match((select id from public.rides where booking_id = 'A-INVENTEDRIDE5'), 0, 'matched', 'dddddddd-0000-4000-8000-000000000002')->>'decision',
  'matched',
  'the ride may then take it'
);
select throws_ok(
  $$select public.set_delivery_match('ffffffff-0000-4000-8000-000000000001', 2, 'matched', 'dddddddd-0000-4000-8000-000000000002')$$,
  'ledger row already claimed by a ride',
  'an order cannot take a row a ride holds'
);
select throws_ok(
  $$delete from public.rides$$,
  'rides is append-only: DELETE is forbidden',
  'a stored ride cannot be deleted'
);
select throws_ok(
  $$delete from public.ride_match_revisions$$,
  'ride_match_revisions is append-only: DELETE is forbidden',
  'a stored ride revision cannot be deleted'
);

-- In the export, not merely permitted by it (backup v12).
select ok(
  (public.export_backup_snapshot() -> 'tableCounts') ?& array['rides', 'ride_adjustments', 'ride_match_overlays', 'ride_match_revisions'],
  'the export carries all four ride tables'
);

-- Weak access last, so nothing above runs on a downgraded session.
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal1"}',
  true
);
select throws_ok(
  $$select public.capture_ride((select value || jsonb_build_object('bookingId', 'A-INVENTEDRIDE6') from invented_ride))$$,
  'strong owner access required',
  'a session that has not passed MFA cannot capture a ride'
);

select * from finish();
rollback;
