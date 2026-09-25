begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

-- The rows a ride paid in two parts can be (migrations 039 and 040, D-229). What this proves: only
-- `authenticated` may read it; it is one JSON array, so PostgREST's row cap cannot cut it (040);
-- it holds GRAB-named charges and unnamed KBANK card spends from 30 minutes before pickup to 60
-- after, and POS REFUND deposits from the pickup day to eight days after, with their signed
-- amounts and lag from pickup; nothing else; and nothing without strong access. Every value below
-- is invented.

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
delete from public.accounts;
delete from auth.mfa_factors where user_id = '11111111-1111-4111-8111-111111111111';

insert into public.accounts(id, owner_id, bank_code, label, account_type, last_four, currency, timezone)
values ('cccccccc-0000-4000-8000-000000000391', '11111111-1111-4111-8111-111111111111', 'SCB', 'Invented SCB', 'savings', '3939', 'THB', 'Asia/Bangkok');

-- A ฿40 ride picked up 20:05 on 12 Sep in Bangkok.
insert into public.rides(id, owner_id, booking_id, ride_type, picked_up_at, dropped_off_at, pickup_place, dropoff_place,
  distance_meters, duration_minutes, payment_method, fare_minor, platform_fee_minor, total_minor)
values ('bbbbbbbb-0000-4000-8000-000000000391', '11111111-1111-4111-8111-111111111111', 'A-R00391', 'Invented Bike',
  '2026-09-12T13:05:00Z', '2026-09-12T13:20:00Z', 'Invented P', 'Invented Q', 3000, 15, '0000', 3900, 100, 4000);

-- T1 GRAB −฿30 at 20:00; T2 GRAB −฿10 at 20:13; T3 POS REFUND +฿5 three days on; T4 an unnamed KBANK
-- card spend at 20:01. Left out: T5 an unnamed shop; T6 GRAB three days on (a charge, too late);
-- T7 a POS REFUND ten days on; T8 GRAB at 21:10, 65 minutes after pickup.
insert into public.source_transactions(id, owner_id, account_id, fingerprint_version, fingerprint,
  source_date, source_time, effective_date, transaction_label, description, post_balance_minor, currency)
values
  ('dddddddd-0000-4000-8000-000000000391', '11111111-1111-4111-8111-111111111111', 'cccccccc-0000-4000-8000-000000000391', 'fingerprint-v1', repeat('1', 64), '2026-09-12', '20:00', '2026-09-12', 'Card payment', 'INVENTED GRAB MERCHANT', '500000', 'THB'),
  ('dddddddd-0000-4000-8000-000000000392', '11111111-1111-4111-8111-111111111111', 'cccccccc-0000-4000-8000-000000000391', 'fingerprint-v1', repeat('2', 64), '2026-09-12', '20:13', '2026-09-12', 'Card payment', 'INVENTED GRAB MERCHANT', '499000', 'THB'),
  ('dddddddd-0000-4000-8000-000000000393', '11111111-1111-4111-8111-111111111111', 'cccccccc-0000-4000-8000-000000000391', 'fingerprint-v1', repeat('3', 64), '2026-09-15', '13:30', '2026-09-15', 'ATS', 'POS REFUND NOTE : -', '499500', 'THB'),
  ('dddddddd-0000-4000-8000-000000000394', '11111111-1111-4111-8111-111111111111', 'cccccccc-0000-4000-8000-000000000391', 'fingerprint-v1', repeat('4', 64), '2026-09-12', '20:01', '2026-09-12', 'Debit Card Spending', 'Ref Code EDC00001', '497500', 'THB'),
  ('dddddddd-0000-4000-8000-000000000395', '11111111-1111-4111-8111-111111111111', 'cccccccc-0000-4000-8000-000000000391', 'fingerprint-v1', repeat('5', 64), '2026-09-12', '20:10', '2026-09-12', 'Card payment', 'Invented shop', '496500', 'THB'),
  ('dddddddd-0000-4000-8000-000000000396', '11111111-1111-4111-8111-111111111111', 'cccccccc-0000-4000-8000-000000000391', 'fingerprint-v1', repeat('6', 64), '2026-09-15', '09:00', '2026-09-15', 'Card payment', 'INVENTED GRAB MERCHANT', '495500', 'THB'),
  ('dddddddd-0000-4000-8000-000000000397', '11111111-1111-4111-8111-111111111111', 'cccccccc-0000-4000-8000-000000000391', 'fingerprint-v1', repeat('7', 64), '2026-09-22', '13:30', '2026-09-22', 'ATS', 'POS REFUND NOTE : -', '496000', 'THB'),
  ('dddddddd-0000-4000-8000-000000000398', '11111111-1111-4111-8111-111111111111', 'cccccccc-0000-4000-8000-000000000391', 'fingerprint-v1', repeat('8', 64), '2026-09-12', '21:10', '2026-09-12', 'Card payment', 'INVENTED GRAB MERCHANT', '495000', 'THB');
insert into public.source_components(id, owner_id, transaction_id, position, kind, amount_minor, currency)
values
  ('eeeeeeee-0000-4000-8000-000000000391', '11111111-1111-4111-8111-111111111111', 'dddddddd-0000-4000-8000-000000000391', 1, 'withdrawal', -3000, 'THB'),
  ('eeeeeeee-0000-4000-8000-000000000392', '11111111-1111-4111-8111-111111111111', 'dddddddd-0000-4000-8000-000000000392', 1, 'withdrawal', -1000, 'THB'),
  ('eeeeeeee-0000-4000-8000-000000000393', '11111111-1111-4111-8111-111111111111', 'dddddddd-0000-4000-8000-000000000393', 1, 'deposit', 500, 'THB'),
  ('eeeeeeee-0000-4000-8000-000000000394', '11111111-1111-4111-8111-111111111111', 'dddddddd-0000-4000-8000-000000000394', 1, 'withdrawal', -2000, 'THB'),
  ('eeeeeeee-0000-4000-8000-000000000395', '11111111-1111-4111-8111-111111111111', 'dddddddd-0000-4000-8000-000000000395', 1, 'withdrawal', -1000, 'THB'),
  ('eeeeeeee-0000-4000-8000-000000000396', '11111111-1111-4111-8111-111111111111', 'dddddddd-0000-4000-8000-000000000396', 1, 'withdrawal', -1000, 'THB'),
  ('eeeeeeee-0000-4000-8000-000000000397', '11111111-1111-4111-8111-111111111111', 'dddddddd-0000-4000-8000-000000000397', 1, 'deposit', 500, 'THB'),
  ('eeeeeeee-0000-4000-8000-000000000398', '11111111-1111-4111-8111-111111111111', 'dddddddd-0000-4000-8000-000000000398', 1, 'withdrawal', -1000, 'THB');
set local session_replication_role = origin;

insert into auth.mfa_factors(id, user_id, friendly_name, factor_type, status, secret, created_at, updated_at)
values ('aaaaaaaa-0000-4000-8000-000000000039', '11111111-1111-4111-8111-111111111111',
  'ride split TOTP', 'totp', 'verified', 'SYNTHETICRIDESPLIT', '2026-09-25T00:00:00Z', '2026-09-25T00:00:00Z');

select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;

select ok(
  not has_function_privilege('anon', 'public.ride_split_candidates()', 'execute')
    and has_function_privilege('authenticated', 'public.ride_split_candidates()', 'execute'),
  'authenticated may read two-part ride candidates and anon may not'
);
create temporary table c on commit drop as
  select e from jsonb_array_elements(public.ride_split_candidates()) e;
select is(jsonb_typeof(public.ride_split_candidates()), 'array', 'one JSON array, which the row cap cannot cut');
select is(
  (select array_agg(right(e->>'transaction_id', 3) order by e->>'transaction_id') from c),
  array['391', '392', '393', '394'],
  'GRAB and unnamed KBANK charges within the window and a POS REFUND within eight days; nothing else'
);
select is(
  (select array_agg((e->>'lag_minutes')::integer order by e->>'transaction_id') from c where e->>'source_date' = '2026-09-12'),
  array[-5, 8, -4],
  'lag is minutes from the Bangkok pickup'
);
select is(
  (select array_agg((e->>'amount_minor')::bigint order by e->>'transaction_id') from c),
  array[-3000, -1000, 500, -2000]::bigint[],
  'amounts are signed: charges negative, the refund positive'
);

reset role;
select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select is(public.ride_split_candidates(), '[]'::jsonb, 'a session that has not passed MFA sees nothing');
reset role;

select * from finish();
rollback;
