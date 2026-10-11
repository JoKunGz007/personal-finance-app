begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

-- The ledger read beneath Shopee matching (migration 056, PLAN task 62 step 4a, D-270).
-- A row qualifies by naming SHOPEE, by equalling an order's total (negated) within three days
-- of its Bangkok date, or by equalling a bank-bound refund within 30 days after the request.
-- Every value is invented.

set local session_replication_role = replica;
delete from public.shopee_order_links;
delete from public.shopee_payment_match_revisions;
delete from public.shopee_payment_match_overlays;
delete from public.shopee_refunds;
delete from public.shopee_order_price_lines;
delete from public.shopee_order_items;
delete from public.shopee_orders;
delete from public.delivery_match_revisions;
delete from public.delivery_match_overlays;
delete from public.receipt_match_revisions;
delete from public.receipt_match_overlays;
delete from public.slip_match_revisions;
delete from public.slip_match_overlays;
delete from public.source_components;
delete from public.source_transactions;
delete from public.audit_events;
delete from public.accounts;
delete from auth.mfa_factors where user_id = '11111111-1111-4111-8111-111111111111';

insert into public.accounts(id, owner_id, bank_code, label, account_type, last_four, currency, timezone)
values ('cccccccc-0000-4000-8000-000000000056', '11111111-1111-4111-8111-111111111111', 'SCB', 'Invented SCB', 'savings', '4242', 'THB', 'Asia/Bangkok');

-- Order O1: total 300.00, paid 2026-10-10 23:30 UTC = 2026-10-11 06:30 Bangkok.
-- Refund R1 to the bank: 150.00, requested 2026-10-10 17:30 UTC = 2026-10-11 00:30 Bangkok.
-- 561: names SHOPEEPAY in the description, any amount.         -> (a)
-- 562: label names shopee, lower case.                          -> (a)
-- 563: -300.00 on 2026-10-14 (3 days after).                    -> (b)
-- 564: -300.00 on 2026-10-15 (4 days after).                    -> excluded
-- 565: -300.00 on 2026-10-08 (3 days before), no time.          -> (b)
-- 566: +150.00 on 2026-11-10 (30 days after the request date).  -> (c)
-- 567: +150.00 on 2026-11-11 (31 days after).                   -> excluded
-- 568: +150.00 on 2026-10-10 (before the request date).         -> excluded
-- 569: -77.00, names nothing.                                   -> excluded
-- 570: -300.00 on 2026-10-13 as -100.00 and -200.00 (movement is the component sum). -> (b)
insert into public.source_transactions(id, owner_id, account_id, fingerprint_version, fingerprint,
  source_date, source_time, effective_date, transaction_label, description, post_balance_minor, currency)
values
  ('dddddddd-0000-4000-8000-000000000561', '11111111-1111-4111-8111-111111111111', 'cccccccc-0000-4000-8000-000000000056', 'fingerprint-v1', repeat('1', 64), '2026-10-01', '10:00', '2026-10-01', 'Transfer', 'INVENTED SHOPEEPAY ROW', '100000', 'THB'),
  ('dddddddd-0000-4000-8000-000000000562', '11111111-1111-4111-8111-111111111111', 'cccccccc-0000-4000-8000-000000000056', 'fingerprint-v1', repeat('2', 64), '2026-10-02', '10:00', '2026-10-02', 'Pay to shopee', 'Invented other', '100000', 'THB'),
  ('dddddddd-0000-4000-8000-000000000563', '11111111-1111-4111-8111-111111111111', 'cccccccc-0000-4000-8000-000000000056', 'fingerprint-v1', repeat('3', 64), '2026-10-14', '10:00', '2026-10-14', 'Transfer', 'Invented plain', '100000', 'THB'),
  ('dddddddd-0000-4000-8000-000000000564', '11111111-1111-4111-8111-111111111111', 'cccccccc-0000-4000-8000-000000000056', 'fingerprint-v1', repeat('4', 64), '2026-10-15', '10:00', '2026-10-15', 'Transfer', 'Invented plain', '100000', 'THB'),
  ('dddddddd-0000-4000-8000-000000000565', '11111111-1111-4111-8111-111111111111', 'cccccccc-0000-4000-8000-000000000056', 'fingerprint-v1', repeat('5', 64), '2026-10-08', null, '2026-10-08', 'Transfer', 'Invented plain', '100000', 'THB'),
  ('dddddddd-0000-4000-8000-000000000566', '11111111-1111-4111-8111-111111111111', 'cccccccc-0000-4000-8000-000000000056', 'fingerprint-v1', repeat('6', 64), '2026-11-10', '10:00', '2026-11-10', 'Deposit', 'Invented plain', '100000', 'THB'),
  ('dddddddd-0000-4000-8000-000000000567', '11111111-1111-4111-8111-111111111111', 'cccccccc-0000-4000-8000-000000000056', 'fingerprint-v1', repeat('7', 64), '2026-11-11', '10:00', '2026-11-11', 'Deposit', 'Invented plain', '100000', 'THB'),
  ('dddddddd-0000-4000-8000-000000000568', '11111111-1111-4111-8111-111111111111', 'cccccccc-0000-4000-8000-000000000056', 'fingerprint-v1', repeat('8', 64), '2026-10-10', '10:00', '2026-10-10', 'Deposit', 'Invented plain', '100000', 'THB'),
  ('dddddddd-0000-4000-8000-000000000569', '11111111-1111-4111-8111-111111111111', 'cccccccc-0000-4000-8000-000000000056', 'fingerprint-v1', repeat('9', 64), '2026-10-12', '10:00', '2026-10-12', 'Transfer', 'Invented plain', '100000', 'THB'),
  ('dddddddd-0000-4000-8000-000000000570', '11111111-1111-4111-8111-111111111111', 'cccccccc-0000-4000-8000-000000000056', 'fingerprint-v1', repeat('f', 64), '2026-10-13', '10:00', '2026-10-13', 'Transfer', 'Invented plain', '100000', 'THB');

insert into public.source_components(id, owner_id, transaction_id, position, kind, amount_minor, currency)
values
  ('eeeeeeee-0000-4000-8000-000000000561', '11111111-1111-4111-8111-111111111111', 'dddddddd-0000-4000-8000-000000000561', 1, 'withdrawal', -12300, 'THB'),
  ('eeeeeeee-0000-4000-8000-000000000562', '11111111-1111-4111-8111-111111111111', 'dddddddd-0000-4000-8000-000000000562', 1, 'withdrawal', -4500, 'THB'),
  ('eeeeeeee-0000-4000-8000-000000000563', '11111111-1111-4111-8111-111111111111', 'dddddddd-0000-4000-8000-000000000563', 1, 'withdrawal', -30000, 'THB'),
  ('eeeeeeee-0000-4000-8000-000000000564', '11111111-1111-4111-8111-111111111111', 'dddddddd-0000-4000-8000-000000000564', 1, 'withdrawal', -30000, 'THB'),
  ('eeeeeeee-0000-4000-8000-000000000565', '11111111-1111-4111-8111-111111111111', 'dddddddd-0000-4000-8000-000000000565', 1, 'withdrawal', -30000, 'THB'),
  ('eeeeeeee-0000-4000-8000-000000000566', '11111111-1111-4111-8111-111111111111', 'dddddddd-0000-4000-8000-000000000566', 1, 'deposit', 15000, 'THB'),
  ('eeeeeeee-0000-4000-8000-000000000567', '11111111-1111-4111-8111-111111111111', 'dddddddd-0000-4000-8000-000000000567', 1, 'deposit', 15000, 'THB'),
  ('eeeeeeee-0000-4000-8000-000000000568', '11111111-1111-4111-8111-111111111111', 'dddddddd-0000-4000-8000-000000000568', 1, 'deposit', 15000, 'THB'),
  ('eeeeeeee-0000-4000-8000-000000000569', '11111111-1111-4111-8111-111111111111', 'dddddddd-0000-4000-8000-000000000569', 1, 'withdrawal', -7700, 'THB'),
  ('eeeeeeee-0000-4000-8000-000000000570', '11111111-1111-4111-8111-111111111111', 'dddddddd-0000-4000-8000-000000000570', 1, 'withdrawal', -10000, 'THB'),
  ('eeeeeeee-0000-4000-8000-000000000571', '11111111-1111-4111-8111-111111111111', 'dddddddd-0000-4000-8000-000000000570', 2, 'withdrawal', -20000, 'THB');

insert into public.shopee_orders(id, owner_id, order_code, link_id, placed_at, paid_at, shop, payment_method,
  payment_kind, total_minor, facts_digest)
values ('ffffffff-0000-4000-8000-000000000561', '11111111-1111-4111-8111-111111111111', 'INVENTEDORD0001', '1000000000001',
  '2026-10-10T23:00:00Z', '2026-10-10T23:30:00Z', 'Invented shop', 'Invented', 'bank_debit', 30000, repeat('a', 64));

insert into public.shopee_refunds(id, owner_id, order_id, request_id, requested_at, refund_minor, refund_to, requested_by, steps)
values ('99999999-0000-4000-8000-000000000561', '11111111-1111-4111-8111-111111111111', 'ffffffff-0000-4000-8000-000000000561',
  'INVENTEDREQ0001', '2026-10-10T17:30:00Z', 15000, 'bank', 'buyer', array['Cancellation Requested']);
set local session_replication_role = origin;

insert into auth.mfa_factors(id, user_id, friendly_name, factor_type, status, secret, created_at, updated_at)
values ('aaaaaaaa-0000-4000-8000-000000000056', '11111111-1111-4111-8111-111111111111',
  'shopee matching TOTP', 'totp', 'verified', 'SYNTHETICSHOPEEMATCH', '2026-10-18T00:00:00Z', '2026-10-18T00:00:00Z');

select ok(
  not has_function_privilege('anon', 'public.shopee_ledger_rows()', 'execute')
    and has_function_privilege('authenticated', 'public.shopee_ledger_rows()', 'execute'),
  'anon cannot call the Shopee ledger read; authenticated can'
);

select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;

select is(
  (select string_agg(right(transaction_id::text, 3), ',' order by transaction_id) from public.shopee_ledger_rows()),
  '561,562,563,565,566,570',
  'the read returns exactly the name, order-amount and refund-amount rows'
);
select is(
  (select string_agg(right(transaction_id::text, 3), ',' order by transaction_id) from public.shopee_ledger_rows()
    where description ilike '%SHOPEE%' or transaction_label ilike '%SHOPEE%'),
  '561,562',
  '(a) the description or the label naming Shopee, in any case, qualifies'
);
select is(
  (select string_agg(right(transaction_id::text, 3), ',' order by transaction_id) from public.shopee_ledger_rows()
    where movement_minor = -30000),
  '563,565,570',
  '(b) an order''s total, negated, qualifies from three days before to three days after its Bangkok date, including a multi-component sum'
);
select is(
  (select count(*)::integer from public.shopee_ledger_rows() where transaction_id = 'dddddddd-0000-4000-8000-000000000564'),
  0,
  '(b) the same amount four days after is excluded'
);
select is(
  (select string_agg(right(transaction_id::text, 3), ',' order by transaction_id) from public.shopee_ledger_rows()
    where movement_minor = 15000),
  '566',
  '(c) a bank refund''s amount qualifies from the Bangkok request date to 30 days after; day 31 and the day before are excluded'
);
select is(
  (select count(*)::integer from public.shopee_ledger_rows() where transaction_id = 'dddddddd-0000-4000-8000-000000000569'),
  0,
  'a row that names nothing and equals no order or refund is excluded'
);
select is(
  (select source_time::text from public.shopee_ledger_rows() where transaction_id = 'dddddddd-0000-4000-8000-000000000565'),
  null,
  'a row with no time is returned with a null time'
);

-- Another owner sees none of it.
reset role;
select set_config('request.jwt.claims',
  '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;
select is(
  (select count(*)::integer from public.shopee_ledger_rows()),
  0,
  'another owner reads none of this owner''s rows'
);
reset role;

select * from finish();
rollback;
