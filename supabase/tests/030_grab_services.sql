begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

-- Grab orders from other services (migration 049, D-247). What this proves: `service` is stored and
-- defaults to food; LINE MAN is food only; no dish lines is accepted for express and dine_out and
-- refused for food and mart; a Dine Out order with a food subtotal and no lines closes; a repeat
-- with a different service is a disagreement; statistics count food orders only. Every value is invented.

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
delete from public.audit_events;
delete from auth.mfa_factors where user_id = '11111111-1111-4111-8111-111111111111';
set local session_replication_role = origin;

insert into auth.mfa_factors(id, user_id, friendly_name, factor_type, status, secret, created_at, updated_at)
values
  ('aaaaaaaa-0000-4000-8000-000000000049', '11111111-1111-4111-8111-111111111111',
   'grab services TOTP', 'totp', 'verified', 'SYNTHETICGRABSERVICES', '2026-10-11T00:00:00Z', '2026-10-11T00:00:00Z');

select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal2"}',
  true
);

create temporary table base_order as select jsonb_build_object(
  'platform', 'grabfood', 'bookingId', 'A-SERVICE0001', 'restaurant', 'Invented Kitchen',
  'paymentMethod', 'Invented card', 'receiptSentAt', '2026-10-01T19:30:00+07:00',
  'foodMinor', '25000', 'deliveryFeeMinor', '1500', 'totalMinor', '26500',
  'items', jsonb_build_array(
    jsonb_build_object('position', 1, 'quantity', 1, 'name', 'Invented noodles', 'options', '[]'::jsonb, 'amountMinor', '25000')),
  'adjustments', '[]'::jsonb) as value;
grant select on base_order to authenticated;

-- Default and stored value.
select is((select public.capture_delivery(value)->>'captured' from base_order), 'true', 'a request without service is captured');
select is((select service from public.deliveries where booking_id = 'A-SERVICE0001'), 'food', 'an absent service is stored as food');
select is((select public.capture_delivery(value || jsonb_build_object('bookingId', 'A-SERVICE0002', 'service', 'mart'))->>'captured' from base_order),
  'true', 'a mart order is captured');
select is((select service from public.deliveries where booking_id = 'A-SERVICE0002'), 'mart', 'the mart service is stored');
select is((select detail->>'service' from public.audit_events where entity_id = (select id from public.deliveries where booking_id = 'A-SERVICE0002')),
  'mart', 'the audit detail carries the service');

-- Refusals.
select throws_ok(
  $$select public.capture_delivery(value || jsonb_build_object('bookingId', 'A-SERVICE0003', 'service', 'taxi')) from base_order$$,
  'invalid delivery', 'a service outside the four is refused');
select throws_ok(
  $$select public.capture_delivery(value || jsonb_build_object('platform', 'lineman', 'bookingId', 'L-SERVICE0001', 'service', 'mart',
    'orderedAt', '2026-10-01T19:30:00+07:00', 'chargedMinor', '26500')) from base_order$$,
  'invalid delivery', 'a LINE MAN mart order is refused');

-- Zero items.
select is((select public.capture_delivery(value || jsonb_build_object('bookingId', 'A-SERVICE0004', 'service', 'express',
    'foodMinor', '0', 'deliveryFeeMinor', '9000', 'totalMinor', '9000', 'items', '[]'::jsonb))->>'captured' from base_order),
  'true', 'an express order with no items is captured');
select is((select public.capture_delivery(value || jsonb_build_object('bookingId', 'A-SERVICE0005', 'service', 'dine_out',
    'foodMinor', '40000', 'deliveryFeeMinor', null, 'totalMinor', '40000', 'items', '[]'::jsonb))->>'captured' from base_order),
  'true', 'a dine_out order with a food subtotal and no items closes');
select is((select count(*)::integer from public.delivery_items where delivery_id = (select id from public.deliveries where booking_id = 'A-SERVICE0005')),
  0, 'the dine_out order stored no dish rows');
select throws_ok(
  $$select public.capture_delivery(value || jsonb_build_object('bookingId', 'A-SERVICE0006', 'items', '[]'::jsonb)) from base_order$$,
  'invalid delivery', 'a food order with no items is refused');
select throws_ok(
  $$select public.capture_delivery(value || jsonb_build_object('bookingId', 'A-SERVICE0007', 'service', 'mart', 'items', '[]'::jsonb)) from base_order$$,
  'invalid delivery', 'a mart order with no items is refused');
select throws_ok(
  $$select public.capture_delivery(value || jsonb_build_object('bookingId', 'A-SERVICE0008', 'service', 'dine_out',
    'foodMinor', '40000', 'deliveryFeeMinor', null, 'totalMinor', '39000', 'items', '[]'::jsonb)) from base_order$$,
  'delivery food plus delivery plus charges minus discounts does not equal the total',
  'the total check still applies without items');

-- Replay.
select is((select public.capture_delivery(value || jsonb_build_object('bookingId', 'A-SERVICE0002', 'service', 'mart'))->>'captured' from base_order),
  'false', 'a repeat of the stored service is not captured again');
select throws_ok(
  $$select public.capture_delivery(value || jsonb_build_object('bookingId', 'A-SERVICE0002', 'service', 'dine_out')) from base_order$$,
  'delivery disagrees with the stored copy; refusing to guess which reading is right',
  'a repeat with a different service is refused');

-- Statistics count food orders only: A-SERVICE0001 (26500) is the one food order.
set local role authenticated;
create temporary table s on commit drop as select public.delivery_statistics() as v;
reset role;
select is((select v->'totals'->>'orders' from s), '1', 'statistics count the food order only');
select is((select v->'totals'->>'spent' from s), '26500', 'statistics spend excludes mart, express and dine_out');

select * from finish();
rollback;
