begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

-- Sync's batch capture (migration 041, D-230). What this proves: only `authenticated` may call
-- `capture_rides` or `capture_deliveries`; each answers one outcome per request by position; a
-- refused request leaves nothing behind and does not undo the ones beside it; each capture still
-- bumps the sequence as the single function does; a batch over 50 is refused whole; and a session
-- without strong access captures nothing. Every value below is invented.

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
update public.mutation_sequences
set sequence = 0, last_exported_sequence = 0, updated_at = '2026-09-25T00:00:00Z'
where owner_id = '11111111-1111-4111-8111-111111111111';
delete from auth.mfa_factors where user_id = '11111111-1111-4111-8111-111111111111';
set local session_replication_role = origin;

insert into auth.mfa_factors(id, user_id, friendly_name, factor_type, status, secret, created_at, updated_at)
values ('aaaaaaaa-0000-4000-8000-000000000041', '11111111-1111-4111-8111-111111111111',
  'batch capture TOTP', 'totp', 'verified', 'SYNTHETICBATCHCAPTURE', '2026-09-25T00:00:00Z', '2026-09-25T00:00:00Z');

select ok(
  not has_function_privilege('anon', 'public.capture_rides(jsonb)', 'execute')
    and not has_function_privilege('anon', 'public.capture_deliveries(jsonb)', 'execute')
    and has_function_privilege('authenticated', 'public.capture_rides(jsonb)', 'execute')
    and has_function_privilege('authenticated', 'public.capture_deliveries(jsonb)', 'execute'),
  'only authenticated may call the batch capture functions'
);

create temporary table invented_ride as select jsonb_build_object(
  'platform', 'grab', 'bookingId', 'A-BATCHRIDE1', 'rideType', 'Invented Bike',
  'pickedUpAt', '2026-09-12T20:05:00+07:00', 'droppedOffAt', '2026-09-12T20:22:00+07:00',
  'pickupPlace', 'Invented pickup', 'dropoffPlace', 'Invented drop-off', 'distanceMeters', 4200, 'durationMinutes', 17,
  'paymentMethod', '0000', 'fareMinor', '9000', 'platformFeeMinor', '600', 'totalMinor', '9600',
  'adjustments', '[]'::jsonb
) as value;
create temporary table invented_order as select jsonb_build_object(
  'platform', 'grabfood', 'bookingId', 'A-BATCHORDER1', 'restaurant', 'Invented Kitchen',
  'paymentMethod', 'Invented card', 'receiptSentAt', '2026-09-01T19:30:00+07:00',
  'foodMinor', '15000', 'deliveryFeeMinor', null, 'totalMinor', '15000',
  'items', jsonb_build_array(jsonb_build_object('position', 1, 'quantity', 1, 'name', 'Invented noodles', 'options', '[]'::jsonb, 'amountMinor', '15000')),
  'adjustments', '[]'::jsonb) as value;
grant select on invented_ride, invented_order to authenticated;

select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;

select is(
  (select public.capture_rides(jsonb_build_array(
      value,
      value,
      value || jsonb_build_object('droppedOffAt', '2026-09-12T20:30:00+07:00'),
      value || jsonb_build_object('bookingId', 'A-BATCHRIDE2', 'totalMinor', '9700'),
      value || jsonb_build_object('bookingId', 'A-BATCHRIDE3')))
   from invented_ride),
  '["captured", "alreadyStored", "disagrees", "refused", "captured"]'::jsonb,
  'one outcome per ride, by position: new, repeat, disagreeing copy, bad sum, new'
);
select is(
  (select string_agg(booking_id, ',' order by booking_id) from public.rides),
  'A-BATCHRIDE1,A-BATCHRIDE3',
  'the refused ride left nothing, and the ride after it was still stored'
);
select is(
  (select public.capture_deliveries(jsonb_build_array(value, value)) from invented_order),
  '["captured", "alreadyStored"]'::jsonb,
  'orders answer the same way'
);
reset role;
select is(
  (select sequence from public.mutation_sequences where owner_id = '11111111-1111-4111-8111-111111111111'),
  3::bigint,
  'each capture bumped the sequence once, as the single function does; repeats and refusals did not'
);
set local role authenticated;

select throws_ok(
  $$select public.capture_rides((select jsonb_agg(value) from invented_ride, generate_series(1, 51)))$$,
  'invalid ride batch',
  'a batch over 50 is refused whole'
);
select throws_ok(
  $$select public.capture_deliveries('{}'::jsonb)$$,
  'invalid delivery batch',
  'a batch that is not an array is refused'
);

select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal1"}', true);
select is(
  (select public.capture_rides(jsonb_build_array(value || jsonb_build_object('bookingId', 'A-BATCHRIDE4'))) from invented_ride),
  '["refused"]'::jsonb,
  'a session that has not passed MFA captures nothing'
);
reset role;

select * from finish();
rollback;
