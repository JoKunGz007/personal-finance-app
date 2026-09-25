begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

-- Delivery statistics (migrations 037 and 038, PLAN task 58). The contract: an order counts at what it
-- really cost — a co-payment order at the owner's share of the wallet's food (50% in 2025, 40% from
-- 2026, the government's share capped at ฿200 a Bangkok day) plus the rest (D-224, D-226), the same
-- cases `tests/delivery-cost.test.ts` pins on `lib/delivery-cost.ts`; averages are an exact
-- quotient and remainder; months are Bangkok months; nothing is visible without strong access.
-- Every value is invented.

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
delete from auth.mfa_factors where user_id = '11111111-1111-4111-8111-111111111111';

-- D1 a plain GrabFood order, sent 00:30 on 1 Aug in Bangkok (still July in UTC).
-- D2 ฿0 under the scheme, a delivery promo cancelling the fee: costs 40% of ฿300.
-- D3 ฿0 under the scheme, a ฿99 promo taking more than the fee: costs 40% of the ฿241 left.
-- D4 a split LINE MAN order: ฿16 charged, ฿189 of food by the wallet.
-- D5 a split LINE MAN order of 3 satang of food: 40% of 3 rounds to 1.
insert into public.deliveries(id, owner_id, platform, booking_id, restaurant, receipt_sent_at, food_minor, delivery_fee_minor, total_minor)
values
  ('dddddddd-0000-4000-8000-000000000241', '11111111-1111-4111-8111-111111111111', 'grabfood', 'A-000241', 'Invented A', '2026-07-31T17:30:00Z', 10000, 2000, 12000),
  ('dddddddd-0000-4000-8000-000000000242', '11111111-1111-4111-8111-111111111111', 'grabfood', 'A-000242', 'Invented B', '2026-09-02T05:00:00Z', 30000, 4000, 0),
  ('dddddddd-0000-4000-8000-000000000243', '11111111-1111-4111-8111-111111111111', 'grabfood', 'A-000243', 'Invented B', '2026-09-03T05:00:00Z', 30000, 4000, 0),
  ('dddddddd-0000-4000-8000-000000000244', '11111111-1111-4111-8111-111111111111', 'lineman', 'LMF-000244', 'Invented C', null, 18900, 1600, 20500),
  ('dddddddd-0000-4000-8000-000000000245', '11111111-1111-4111-8111-111111111111', 'lineman', 'LMF-000245', 'Invented D', null, 3, 0, 3);

insert into public.lineman_order_details(delivery_id, owner_id, ordered_at, charged_minor)
values
  ('dddddddd-0000-4000-8000-000000000244', '11111111-1111-4111-8111-111111111111', '2026-09-05T05:00:00Z', 1600),
  ('dddddddd-0000-4000-8000-000000000245', '11111111-1111-4111-8111-111111111111', '2026-09-06T05:00:00Z', 0);

insert into public.delivery_adjustments(owner_id, delivery_id, position, kind, name, amount_minor)
values
  ('11111111-1111-4111-8111-111111111111', 'dddddddd-0000-4000-8000-000000000242', 1, 'discount', 'Invented free delivery', 4000),
  ('11111111-1111-4111-8111-111111111111', 'dddddddd-0000-4000-8000-000000000242', 2, 'discount', 'TH26GF0001ALL', 30000),
  ('11111111-1111-4111-8111-111111111111', 'dddddddd-0000-4000-8000-000000000243', 1, 'discount', 'EUT1A2', 9900),
  ('11111111-1111-4111-8111-111111111111', 'dddddddd-0000-4000-8000-000000000243', 2, 'discount', 'TH26GF0001ALL', 24100);

insert into public.rides(id, owner_id, booking_id, ride_type, picked_up_at, dropped_off_at, pickup_place, dropoff_place,
  distance_meters, duration_minutes, payment_method, fare_minor, platform_fee_minor, total_minor)
values
  ('eeeeeeee-0000-4000-8000-000000000241', '11111111-1111-4111-8111-111111111111', 'A-R00241', 'Invented Bike',
   '2026-09-03T05:00:00Z', '2026-09-03T05:15:00Z', 'Invented P', 'Invented Q', 3000, 15, '0000', 4800, 200, 5000),
  ('eeeeeeee-0000-4000-8000-000000000242', '11111111-1111-4111-8111-111111111111', 'A-R00242', 'Invented Car',
   '2026-09-04T05:00:00Z', '2026-09-04T05:30:00Z', 'Invented P', 'Invented R', 9000, 30, '0000', 7001, 0, 7001);
set local session_replication_role = origin;

insert into auth.mfa_factors(id, user_id, friendly_name, factor_type, status, secret, created_at, updated_at)
values ('aaaaaaaa-0000-4000-8000-000000000037', '11111111-1111-4111-8111-111111111111',
  'delivery statistics TOTP', 'totp', 'verified', 'SYNTHETICDELIVERYSTATS', '2026-09-25T00:00:00Z', '2026-09-25T00:00:00Z');

select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal2"}',
  true
);
set local role authenticated;

create temporary table s on commit drop as select public.delivery_statistics() as v;

select ok(
  not has_function_privilege('anon', 'public.delivery_statistics()', 'execute')
    and has_function_privilege('authenticated', 'public.delivery_statistics()', 'execute'),
  'authenticated may read delivery statistics and anon may not'
);
select is((select v->'totals'->>'orders' from s), '5', 'every order is counted');
select is((select v->'totals'->>'spent' from s), '42801',
  'orders count at their real cost: 12000 + 12000 + 9640 + 9160 + 1');
select is((select v->'totals'->'averageSpent' from s), '{"quotient":"8560","remainder":"1"}'::jsonb,
  'the average order is an exact quotient and remainder');
select is((select v->'totals'->>'schemeOrders' from s), '4', 'the ฿0 GrabFood and split LINE MAN orders are ไทยช่วยไทย');
select is((select v->'totals'->>'schemePaid' from s), '43802',
  'the scheme paid 60% of each wallet food share: 18000 + 14460 + 11340 + 2');
select is((select v->'totals'->>'deliveryFees' from s), '11600', 'printed delivery fees are summed');
select is((select v->'totals'->>'discounts' from s), '13900', 'discounts leave out the scheme''s own line');
select is((select v->'platforms' from s),
  '[{"platform":"grabfood","orders":3,"spent":"33640"},{"platform":"lineman","orders":2,"spent":"9161"}]'::jsonb,
  'each platform carries its orders'' real cost');
select is((select v->'restaurants'->0 from s), '{"restaurant":"Invented B","orders":2,"spent":"21640"}'::jsonb,
  'restaurants are ranked by what they cost');
select is((select v->'months' from s),
  '[{"month":"2026-08","orders":1,"spent":"12000","rides":0,"rideSpent":"0"},{"month":"2026-09","orders":4,"spent":"30801","rides":2,"rideSpent":"12001"}]'::jsonb,
  'months are Bangkok months and carry orders and rides');
select is((select v->'rides' from s),
  '{"rides":2,"spent":"12001","averageSpent":{"quotient":"6000","remainder":"1"},"platformFees":"200"}'::jsonb,
  'rides count at their total, with an exact average');
select is((select v->'rideTypes' from s),
  '[{"rideType":"Invented Car","rides":1,"spent":"7001"},{"rideType":"Invented Bike","rides":1,"spent":"5000"}]'::jsonb,
  'ride types are grouped, most rides first, then most spent');

-- The year's rate and the daily cap (038), on five more ฿0 GrabFood orders:
-- E1 23:59 on 31 Dec 2025 in Bangkok, ฿300 at 50%: costs 15000, the government 15000.
-- E2, E3 one Bangkok day, ฿150 then ฿200: the government pays 9000, then 11000 of its 12000.
-- E4 00:30 the next Bangkok day, ฿200: a fresh cap, the government 12000.
-- E5 3 satang in 2025: half rounds up, costs 2, the government 1.
reset role;
set local session_replication_role = replica;
insert into public.deliveries(id, owner_id, platform, booking_id, restaurant, receipt_sent_at, food_minor, delivery_fee_minor, total_minor)
values
  ('dddddddd-0000-4000-8000-000000000251', '11111111-1111-4111-8111-111111111111', 'grabfood', 'A-000251', 'Invented E', '2025-12-31T16:59:00Z', 30000, 0, 0),
  ('dddddddd-0000-4000-8000-000000000252', '11111111-1111-4111-8111-111111111111', 'grabfood', 'A-000252', 'Invented E', '2026-09-10T02:00:00Z', 15000, 0, 0),
  ('dddddddd-0000-4000-8000-000000000253', '11111111-1111-4111-8111-111111111111', 'grabfood', 'A-000253', 'Invented E', '2026-09-10T12:00:00Z', 20000, 0, 0),
  ('dddddddd-0000-4000-8000-000000000254', '11111111-1111-4111-8111-111111111111', 'grabfood', 'A-000254', 'Invented E', '2026-09-10T17:30:00Z', 20000, 0, 0),
  ('dddddddd-0000-4000-8000-000000000255', '11111111-1111-4111-8111-111111111111', 'grabfood', 'A-000255', 'Invented E', '2025-11-02T05:00:00Z', 3, 0, 0);
insert into public.delivery_adjustments(owner_id, delivery_id, position, kind, name, amount_minor)
values
  ('11111111-1111-4111-8111-111111111111', 'dddddddd-0000-4000-8000-000000000251', 1, 'discount', 'TH25GF0001ALL', 30000),
  ('11111111-1111-4111-8111-111111111111', 'dddddddd-0000-4000-8000-000000000252', 1, 'discount', 'TH26GF0001ALL', 15000),
  ('11111111-1111-4111-8111-111111111111', 'dddddddd-0000-4000-8000-000000000253', 1, 'discount', 'TH26GF0001ALL', 20000),
  ('11111111-1111-4111-8111-111111111111', 'dddddddd-0000-4000-8000-000000000254', 1, 'discount', 'TH26GF0001ALL', 20000),
  ('11111111-1111-4111-8111-111111111111', 'dddddddd-0000-4000-8000-000000000255', 1, 'discount', 'TH25GF0001ALL', 3);
set local session_replication_role = origin;
set local role authenticated;

create temporary table s2 on commit drop as select public.delivery_statistics() as v;
select is((select v->'totals'->>'spent' from s2), '80803',
  'the year''s rate and the daily cap: 42801 + 15000 + 6000 + 9000 + 8000 + 2');
select is((select v->'totals'->>'schemePaid' from s2), '90803',
  'the government paid 43802 + 15000 + 9000 + 11000 + 12000 + 1');
select is((select jsonb_path_query_array(v->'months', '$[0 to 1]') from s2),
  '[{"month":"2025-11","orders":1,"spent":"2","rides":0,"rideSpent":"0"},{"month":"2025-12","orders":1,"spent":"15000","rides":0,"rideSpent":"0"}]'::jsonb,
  '2025 orders cost half their food, dated in Bangkok');

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal1"}',
  true
);
set local role authenticated;
select is((select public.delivery_statistics()->'totals'->>'orders'), '0',
  'a session that has not passed MFA sees no orders');
reset role;

select * from finish();
rollback;
