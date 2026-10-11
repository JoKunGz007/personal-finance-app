begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

-- shopee_monthly_summary() (migration 057, PLAN task 62 step 6, D-270 "Totals").
-- Every value is invented; every date is relative to now() so the test does not rot.
-- M0 is the current Bangkok month, M1 the one before, and so on.

set local session_replication_role = replica;
delete from public.shopee_order_links;
delete from public.shopee_payment_match_revisions;
delete from public.shopee_payment_match_overlays;
delete from public.shopee_refunds;
delete from public.shopee_order_price_lines;
delete from public.shopee_order_items;
delete from public.shopee_orders;
delete from public.audit_events;
delete from auth.mfa_factors where user_id = '11111111-1111-4111-8111-111111111111';

-- 61  M0 boundary: paid 30 minutes after the Bangkok month began (17:30 UTC on the last day of M1) -> M0. bank_debit 100.00
-- 62  M1 boundary: paid 30 minutes before M0 began (16:30 UTC) -> M1. wallet 200.00, partial refund 50.00 requested in M0 -> counts in M1
-- 63  M1: no paid time, placed in M1. spaylater 300.00, refund 300.00 -> cancelled
-- 64  M2: no paid time, placed in M2. other 400.00, refund 500.00 (exceeds total) -> cancelled, refunded clamped to 400.00
-- 65  M2: placed in M3 but paid in M2 -> M2 (paid time wins). bank_debit 70.00
-- 66  12 months before M0 (outside the window) and 67  13 months before: excluded
insert into public.shopee_orders(id, owner_id, order_code, link_id, placed_at, paid_at, shop, payment_method,
  payment_kind, total_minor, facts_digest)
select ('ffffffff-0000-4000-8000-0000000005' || s.n)::uuid, '11111111-1111-4111-8111-111111111111',
       'INVENTEDSUM00' || s.n, '20000000000' || s.n, (s.placed at time zone 'Asia/Bangkok'),
       (s.paid at time zone 'Asia/Bangkok'), 'Invented shop', 'Invented', s.kind, s.total, repeat('b', 64)
  from (
    select v.*
      from (select date_trunc('month', now() at time zone 'Asia/Bangkok') as m0) c,
      lateral (values
        ('61', c.m0 + interval '30 minutes' - interval '1 hour', c.m0 + interval '30 minutes', 'bank_debit', 10000),
        ('62', c.m0 - interval '2 hours', c.m0 - interval '30 minutes', 'wallet', 20000),
        ('63', c.m0 - interval '1 month' + interval '10 days', null::timestamp, 'spaylater', 30000),
        ('64', c.m0 - interval '2 months' + interval '10 days', null::timestamp, 'other', 40000),
        ('65', c.m0 - interval '3 months' + interval '10 days', c.m0 - interval '2 months' + interval '12 days', 'bank_debit', 7000),
        ('66', c.m0 - interval '12 months' + interval '10 days', c.m0 - interval '12 months' + interval '10 days', 'bank_debit', 99900),
        ('67', c.m0 - interval '13 months' + interval '10 days', c.m0 - interval '13 months' + interval '10 days', 'wallet', 88800)
      ) as v(n, placed, paid, kind, total)
  ) s;

insert into public.shopee_refunds(id, owner_id, order_id, request_id, requested_at, refund_minor, refund_to, requested_by, steps)
select ('99999999-0000-4000-8000-0000000005' || r.n)::uuid, '11111111-1111-4111-8111-111111111111',
       ('ffffffff-0000-4000-8000-0000000005' || r.n)::uuid, 'INVENTEDSUMREQ' || r.n,
       (date_trunc('month', now() at time zone 'Asia/Bangkok') + interval '2 hours') at time zone 'Asia/Bangkok',
       r.amount, 'bank', 'buyer', array['Cancellation Requested']
  from (values ('62', 5000), ('63', 30000), ('64', 50000)) as r(n, amount);
set local session_replication_role = origin;

insert into auth.mfa_factors(id, user_id, friendly_name, factor_type, status, secret, created_at, updated_at)
values ('aaaaaaaa-0000-4000-8000-000000000057', '11111111-1111-4111-8111-111111111111',
  'shopee summary TOTP', 'totp', 'verified', 'SYNTHETICSHOPEESUMMARY', '2026-10-18T00:00:00Z', '2026-10-18T00:00:00Z');

select ok(
  not has_function_privilege('anon', 'public.shopee_monthly_summary()', 'execute')
    and has_function_privilege('authenticated', 'public.shopee_monthly_summary()', 'execute'),
  'anon cannot call the monthly summary; authenticated can'
);

select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;

select is(jsonb_array_length(public.shopee_monthly_summary()->'months'), 12, 'exactly 12 months');
select is(public.shopee_monthly_summary()->'months'->11->>'month',
  to_char(now() at time zone 'Asia/Bangkok', 'YYYY-MM'), 'the last month is the current Bangkok month');
select is(public.shopee_monthly_summary()->'months'->0->>'month',
  to_char((now() at time zone 'Asia/Bangkok') - interval '11 months', 'YYYY-MM'), 'the first month is 11 months earlier (oldest first)');
select is(
  (select count(*)::integer from jsonb_array_elements(public.shopee_monthly_summary()->'months') m
    where (m->>'orders')::int = 0 and (m->>'cancelled')::int = 0 and m->>'spentMinor' = '0' and m->>'refundedMinor' = '0'
      and m->'byKind' = '{"bank_debit":"0","wallet":"0","spaylater":"0","other":"0"}'::jsonb),
  9, 'the nine empty months are zeros with money as text 0 (orders 12 and 13 months old are excluded)'
);
select is(public.shopee_monthly_summary()->'months'->11,
  jsonb_build_object('month', to_char(now() at time zone 'Asia/Bangkok', 'YYYY-MM'),
    'orders', 1, 'cancelled', 0, 'spentMinor', '10000', 'refundedMinor', '0',
    'byKind', jsonb_build_object('bank_debit','10000','wallet','0','spaylater','0','other','0')),
  'M0: paid 17:30 UTC on the last day of the month before lands in the next Bangkok month');
select is(public.shopee_monthly_summary()->'months'->10->>'orders', '1', 'M1: the order paid 16:30 UTC lands in M1; a partial refund still counts it as an order');
select is(public.shopee_monthly_summary()->'months'->10->>'spentMinor', '15000', 'M1: spent is total minus the partial refund; the cancelled order adds 0');
select is(public.shopee_monthly_summary()->'months'->10->>'refundedMinor', '35000', 'M1: refunded is the partial 50.00 plus the full 300.00, though requested in M0');
select is(public.shopee_monthly_summary()->'months'->10->>'cancelled', '1', 'M1: a full refund counts as cancelled, not as an order');
select is(public.shopee_monthly_summary()->'months'->9->>'cancelled', '1', 'M2: a refund above the total is cancelled');
select is(public.shopee_monthly_summary()->'months'->9->>'refundedMinor', '40000', 'M2: refunded is clamped to the order total');
select is(public.shopee_monthly_summary()->'months'->9->>'spentMinor', '7000', 'M2: paid time wins over placed time; the cancelled order adds 0 to spent');
select is(
  (select jsonb_agg(m->'byKind' order by m->>'month') from jsonb_array_elements(public.shopee_monthly_summary()->'months') m
    where m->>'spentMinor' <> '0'),
  '[{"other":"0","wallet":"0","spaylater":"0","bank_debit":"7000"},
    {"other":"0","wallet":"15000","spaylater":"0","bank_debit":"0"},
    {"other":"0","wallet":"0","spaylater":"0","bank_debit":"10000"}]'::jsonb,
  'byKind splits spentMinor by payment kind (the cancelled spaylater and other orders contribute 0)'
);
select is(
  (select bool_and((m->'byKind'->>'bank_debit')::bigint + (m->'byKind'->>'wallet')::bigint
      + (m->'byKind'->>'spaylater')::bigint + (m->'byKind'->>'other')::bigint = (m->>'spentMinor')::bigint)
     from jsonb_array_elements(public.shopee_monthly_summary()->'months') m),
  true, 'byKind sums to spentMinor in every month'
);

-- Another owner sees zeros.
reset role;
select set_config('request.jwt.claims',
  '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;
select is(
  (select count(*)::integer from jsonb_array_elements(public.shopee_monthly_summary()->'months') m
    where m->>'spentMinor' <> '0' or (m->>'orders')::int <> 0 or (m->>'cancelled')::int <> 0),
  0, 'another owner sees zeros for this owner''s orders'
);
reset role;

select * from finish();
rollback;
