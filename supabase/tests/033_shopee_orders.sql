begin;
create extension if not exists pgtap with schema extensions;
select plan(62);

-- Shopee orders: capture, refunds, the owner's match of a group of orders to one ledger row, and
-- the wallet / SPayLater / refund links (migration 055, PLAN task 62 step 2, D-270).
--
-- The contract: a second copy of an order is a no-op and a changed one is refused; one bad order
-- is refused while the rest of its batch is stored; the payment kind comes from the printed
-- method, server side; price lines (signed) must sum to the total; a refund is compared field by
-- field; every order table is append-only; a match is per order with optimistic revisions, may
-- name one row for several orders whose totals sum to its movement exactly, is claimed by exactly
-- the listed set, and is undone whole; a link is an idempotent event. Every value is invented.

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
update public.mutation_sequences
set sequence = 0, last_exported_sequence = 0, updated_at = '2026-10-17T00:00:00Z'
where owner_id = '11111111-1111-4111-8111-111111111111';
delete from auth.mfa_factors where user_id = '11111111-1111-4111-8111-111111111111';

insert into public.accounts(id, owner_id, bank_code, label, account_type, last_four, currency, timezone)
values ('cccccccc-0000-4000-8000-000000000055', '11111111-1111-4111-8111-111111111111', 'SCB', 'Invented SCB', 'savings', '4242', 'THB', 'Asia/Bangkok');

-- The ledger starts on 2026-09-01.
-- t1: -300.00 (one order).  t2: -500.00 (two orders).  t3: -999.00 (matches nothing).
-- t4: +150.00 (a refund deposit).  t5: -80.00 (a wallet top-up or a SPayLater repayment).
insert into public.source_transactions(id, owner_id, account_id, fingerprint_version, fingerprint,
  source_date, source_time, effective_date, transaction_label, description, post_balance_minor, currency)
values
  ('dddddddd-0000-4000-8000-000000000551', '11111111-1111-4111-8111-111111111111', 'cccccccc-0000-4000-8000-000000000055',
   'fingerprint-v1', repeat('a', 64), '2026-09-02', '19:02', '2026-09-02', 'Transfer', 'INVENTED ONE', '500000', 'THB'),
  ('dddddddd-0000-4000-8000-000000000552', '11111111-1111-4111-8111-111111111111', 'cccccccc-0000-4000-8000-000000000055',
   'fingerprint-v1', repeat('b', 64), '2026-09-02', '19:05', '2026-09-02', 'Transfer', 'INVENTED TWO', '450000', 'THB'),
  ('dddddddd-0000-4000-8000-000000000553', '11111111-1111-4111-8111-111111111111', 'cccccccc-0000-4000-8000-000000000055',
   'fingerprint-v1', repeat('c', 64), '2026-09-01', '19:06', '2026-09-01', 'Transfer', 'INVENTED THREE', '480000', 'THB'),
  ('dddddddd-0000-4000-8000-000000000554', '11111111-1111-4111-8111-111111111111', 'cccccccc-0000-4000-8000-000000000055',
   'fingerprint-v1', repeat('d', 64), '2026-09-03', '10:00', '2026-09-03', 'Deposit', 'INVENTED FOUR', '465000', 'THB'),
  ('dddddddd-0000-4000-8000-000000000555', '11111111-1111-4111-8111-111111111111', 'cccccccc-0000-4000-8000-000000000055',
   'fingerprint-v1', repeat('e', 64), '2026-09-03', '11:00', '2026-09-03', 'Transfer', 'INVENTED FIVE', '457000', 'THB');

insert into public.source_components(id, owner_id, transaction_id, position, kind, amount_minor, currency)
values
  ('eeeeeeee-0000-4000-8000-000000000551', '11111111-1111-4111-8111-111111111111', 'dddddddd-0000-4000-8000-000000000551', 1, 'withdrawal', -30000, 'THB'),
  ('eeeeeeee-0000-4000-8000-000000000552', '11111111-1111-4111-8111-111111111111', 'dddddddd-0000-4000-8000-000000000552', 1, 'withdrawal', -50000, 'THB'),
  ('eeeeeeee-0000-4000-8000-000000000553', '11111111-1111-4111-8111-111111111111', 'dddddddd-0000-4000-8000-000000000553', 1, 'withdrawal', -99900, 'THB'),
  ('eeeeeeee-0000-4000-8000-000000000554', '11111111-1111-4111-8111-111111111111', 'dddddddd-0000-4000-8000-000000000554', 1, 'deposit', 15000, 'THB'),
  ('eeeeeeee-0000-4000-8000-000000000555', '11111111-1111-4111-8111-111111111111', 'dddddddd-0000-4000-8000-000000000555', 1, 'withdrawal', -8000, 'THB');
set local session_replication_role = origin;

insert into auth.mfa_factors(id, user_id, friendly_name, factor_type, status, secret, created_at, updated_at)
values ('aaaaaaaa-0000-4000-8000-000000000055', '11111111-1111-4111-8111-111111111111',
  'shopee TOTP', 'totp', 'verified', 'SYNTHETICSHOPEE', '2026-10-17T00:00:00Z', '2026-10-17T00:00:00Z');

select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal2"}',
  true
);

-- Builders so each order reads as one line. `pg_temp.ord` takes the order code suffix.
create function pg_temp.ord(p_suffix text, p_placed text, p_method text, p_total text, p_lines jsonb, p_refund jsonb default null)
returns jsonb language sql as $$
  select jsonb_build_object(
    'orderCode', 'TESTORDER' || p_suffix, 'linkId', '90000000' || p_suffix,
    'placedAt', p_placed, 'paidAt', p_placed, 'shop', 'Invented Shop',
    'paymentMethod', p_method, 'totalMinor', p_total, 'itemPriceIs', 'line total',
    'items', jsonb_build_array(jsonb_build_object('position', 1, 'name', 'Invented widget', 'variation', 'Blue',
      'quantity', 2, 'priceMinor', '16000', 'originalPriceMinor', null)),
    'priceLines', p_lines, 'refund', p_refund)
$$;
create function pg_temp.oid(p_suffix text) returns uuid language sql as $$
  select id from public.shopee_orders where order_code = 'TESTORDER' || p_suffix
$$;
create function pg_temp.m(p_suffix text, p_revision integer) returns jsonb language sql as $$
  select jsonb_build_object('orderId', pg_temp.oid(p_suffix), 'expectedRevision', p_revision)
$$;

-- Five orders to store, one before the ledger, one whose lines do not sum.
-- 0001 ฿300 bank debit (signed lines), 0002 ฿200 wallet, 0003 ฿300 SPayLater, 0004 ฿150 other with a
-- refund to the bank, 0005 ฿0.
select set_config('t.batch', jsonb_build_object('orders', jsonb_build_array(
  pg_temp.ord('0001', '2026-09-02T10:00:00+07:00', 'ShopeePay - ตัดบัญชีธนาคาร', '30000',
    '[{"position":1,"label":"Merchandise Subtotal","amountMinor":"32000"},{"position":2,"label":"Shipping Subtotal","amountMinor":"3000"},{"position":3,"label":"Shipping Discount","amountMinor":"-3000"},{"position":4,"label":"Voucher","amountMinor":"-2000"}]'),
  pg_temp.ord('0002', '2026-09-02T11:00:00+07:00', 'ShopeePay', '20000',
    '[{"position":1,"label":"Merchandise Subtotal","amountMinor":"20000"}]'),
  pg_temp.ord('0003', '2026-09-02T12:00:00+07:00', 'SPayLater', '30000',
    '[{"position":1,"label":"Merchandise Subtotal","amountMinor":"30000"}]'),
  pg_temp.ord('0004', '2026-09-02T13:00:00+07:00', 'QR พร้อมเพย์', '15000',
    '[{"position":1,"label":"Merchandise Subtotal","amountMinor":"15000"}]',
    '{"requestId":"TESTREFUND01","requestedAt":"2026-09-03T09:00:00+07:00","refundMinor":"15000","refundTo":"bank","requestedBy":"buyer","reason":"Invented reason","steps":["Cancellation Requested","Cancellation Accepted","Refunded"]}'),
  pg_temp.ord('0005', '2026-09-02T14:00:00+07:00', 'Cash on Delivery', '0',
    '[{"position":1,"label":"Merchandise Subtotal","amountMinor":"5000"},{"position":2,"label":"Voucher","amountMinor":"-5000"}]'),
  pg_temp.ord('0009', '2026-08-01T10:00:00+07:00', 'ShopeePay', '1000',
    '[{"position":1,"label":"Merchandise Subtotal","amountMinor":"1000"}]'),
  pg_temp.ord('0008', '2026-09-02T15:00:00+07:00', 'ShopeePay', '1000',
    '[{"position":1,"label":"Merchandise Subtotal","amountMinor":"999"}]')
))::text, true);

select has_table('public', 'shopee_orders', 'shopee_orders exists');
select has_table('public', 'shopee_order_items', 'shopee_order_items exists');
select has_table('public', 'shopee_order_price_lines', 'shopee_order_price_lines exists');
select has_table('public', 'shopee_refunds', 'shopee_refunds exists');
select has_table('public', 'shopee_payment_match_overlays', 'shopee_payment_match_overlays exists');
select has_table('public', 'shopee_payment_match_revisions', 'shopee_payment_match_revisions exists');
select has_table('public', 'shopee_order_links', 'shopee_order_links exists');

select ok(
  (select bool_and(relrowsecurity and relforcerowsecurity) from pg_class where oid in (
    'public.shopee_orders'::regclass, 'public.shopee_order_items'::regclass,
    'public.shopee_order_price_lines'::regclass, 'public.shopee_refunds'::regclass,
    'public.shopee_payment_match_overlays'::regclass, 'public.shopee_payment_match_revisions'::regclass,
    'public.shopee_order_links'::regclass)),
  'all seven Shopee tables have row level security enabled and forced'
);
select ok(
  has_table_privilege('authenticated', 'public.shopee_orders', 'select')
    and not has_table_privilege('authenticated', 'public.shopee_orders', 'insert')
    and not has_table_privilege('authenticated', 'public.shopee_payment_match_overlays', 'insert')
    and not has_table_privilege('authenticated', 'public.shopee_payment_match_overlays', 'update')
    and not has_table_privilege('authenticated', 'public.shopee_order_links', 'insert')
    and not has_table_privilege('anon', 'public.shopee_orders', 'select'),
  'authenticated may read and write nothing directly; anon reads nothing'
);
select ok(
  not has_function_privilege('anon', 'public.capture_shopee_orders(jsonb)', 'execute')
    and not has_function_privilege('anon', 'public.set_shopee_payment_match(uuid,jsonb,text)', 'execute')
    and not has_function_privilege('anon', 'public.set_shopee_order_links(text,uuid,uuid[],text)', 'execute'),
  'anon can call none of the three write paths'
);

select is(
  (select string_agg(private.shopee_payment_kind(m), ',' order by n) from (values
    (1, 'ShopeePay - ตัดบัญชีธนาคาร'), (2, 'ShopeePay'), (3, 'SPayLater'), (4, 'QR พร้อมเพย์'),
    (5, 'Mobile Banking'), (6, 'เก็บเงินปลายทาง'), (7, 'Cash on Delivery')) v(n, m)),
  'bank_debit,wallet,spaylater,other,other,other,other',
  'the payment kind is read from the printed method'
);

-- Capture.
select set_config('t.r1', public.capture_shopee_orders(current_setting('t.batch')::jsonb)::text, true);
select is(current_setting('t.r1')::jsonb->>'new', '5', 'five valid orders are stored');
select is(current_setting('t.r1')::jsonb->>'beforeLedger', '1', 'an order dated before the first ledger row is skipped and counted');
select is(
  current_setting('t.r1')::jsonb->'refused',
  '[{"orderCode":"TESTORDER0008","reason":"price lines do not sum to the total"}]'::jsonb,
  'an order whose lines do not sum is refused with a fixed reason while the others are stored'
);
select is(current_setting('t.r1')::jsonb->>'refundsNew', '1', 'the refund is stored');
select is(
  (select string_agg(payment_kind, ',' order by order_code) from public.shopee_orders where order_code <> 'TESTORDER0005'),
  'bank_debit,wallet,spaylater,other',
  'the stored kind is derived server side'
);
select is(
  (select amount_minor::text from public.shopee_order_price_lines where order_id = pg_temp.oid('0001') and position = 3),
  '-3000',
  'a price line is stored signed'
);
select is(
  (select count(*)::integer from public.shopee_order_items) || '/' || (select count(*)::integer from public.shopee_orders where order_code in ('TESTORDER0008','TESTORDER0009')),
  '5/0',
  'each stored order has its item, and neither skipped order was stored'
);

-- A replay writes nothing.
select set_config('t.r2', public.capture_shopee_orders(current_setting('t.batch')::jsonb)::text, true);
select is(
  current_setting('t.r2')::jsonb - 'refused',
  '{"new": 0, "stored": 5, "beforeLedger": 1, "refundsNew": 0, "refundsStored": 1}'::jsonb,
  'a second copy of the batch is a no-op'
);
select is(
  (select count(*)::integer from public.audit_events where event_type = 'shopee.capture')
    || '/' || (select sequence::text from public.mutation_sequences where owner_id = '11111111-1111-4111-8111-111111111111'),
  '1/1',
  'only the first capture is audited and advances the mutation sequence'
);

-- A changed order, a changed refund, a refund claimed by another order, a refund above the total.
select is(
  public.capture_shopee_orders(jsonb_build_object('orders', jsonb_build_array(
    pg_temp.ord('0001', '2026-09-02T10:00:00+07:00', 'ShopeePay - ตัดบัญชีธนาคาร', '30000',
      '[{"position":1,"label":"Merchandise Subtotal","amountMinor":"30000"}]'))))->'refused',
  '[{"orderCode":"TESTORDER0001","reason":"differs from the stored order"}]'::jsonb,
  'an order whose facts differ from the stored copy is refused'
);
select is(
  public.capture_shopee_orders(jsonb_build_object('orders', jsonb_build_array(
    pg_temp.ord('0004', '2026-09-02T13:00:00+07:00', 'QR พร้อมเพย์', '15000',
      '[{"position":1,"label":"Merchandise Subtotal","amountMinor":"15000"}]',
      '{"requestId":"TESTREFUND01","requestedAt":"2026-09-03T09:00:00+07:00","refundMinor":"14000","refundTo":"bank","requestedBy":"buyer","reason":null,"steps":[]}'))))
    - 'beforeLedger' - 'new' - 'refundsNew' - 'refundsStored',
  '{"stored": 1, "refused": [{"orderCode": "TESTORDER0004", "reason": "refund differs from the stored refund"}]}'::jsonb,
  'a refund that differs is refused while its order stands as stored'
);
select is(
  public.capture_shopee_orders(jsonb_build_object('orders', jsonb_build_array(
    pg_temp.ord('0002', '2026-09-02T11:00:00+07:00', 'ShopeePay', '20000',
      '[{"position":1,"label":"Merchandise Subtotal","amountMinor":"20000"}]',
      '{"requestId":"TESTREFUND01","requestedAt":"2026-09-03T09:00:00+07:00","refundMinor":"15000","refundTo":"bank","requestedBy":"buyer","reason":null,"steps":[]}'))))
    ->'refused',
  '[{"orderCode":"TESTORDER0002","reason":"refund differs from the stored refund"}]'::jsonb,
  'a request id already stored for another order is refused'
);
select is(
  public.capture_shopee_orders(jsonb_build_object('orders', jsonb_build_array(
    pg_temp.ord('0004', '2026-09-02T13:00:00+07:00', 'QR พร้อมเพย์', '15000',
      '[{"position":1,"label":"Merchandise Subtotal","amountMinor":"15000"}]',
      '{"requestId":"TESTREFUND02","requestedAt":"2026-09-03T09:00:00+07:00","refundMinor":"15001","refundTo":"bank","requestedBy":"buyer","reason":null,"steps":[]}'))))
    ->'refused',
  '[{"orderCode":"TESTORDER0004","reason":"refund exceeds the order total"}]'::jsonb,
  'a refund above the order total is refused'
);
select is(
  public.capture_shopee_orders(jsonb_build_object('orders', jsonb_build_array(
    jsonb_set(pg_temp.ord('0006', '2026-09-02T13:00:00+07:00', 'ShopeePay', '1000',
      '[{"position":1,"label":"Merchandise Subtotal","amountMinor":"1000"}]'), '{shop}', '""'))))
    ->'refused',
  '[{"orderCode":"TESTORDER0006","reason":"invalid order"}]'::jsonb,
  'any other refusal is reported as a fixed generic reason, never the database message'
);
select throws_ok(
  $$select public.capture_shopee_orders('{"orders":[]}'::jsonb)$$,
  'invalid shopee capture',
  'an empty batch is rejected'
);
select is(
  (select count(*)::integer from public.shopee_refunds), 1, 'only the first refund was ever stored'
);

-- Append-only.
select throws_ok($$update public.shopee_orders set shop = 'x'$$,
  'shopee_orders is append-only: UPDATE is forbidden', 'an order cannot be updated');
select throws_ok($$delete from public.shopee_orders$$,
  'shopee_orders is append-only: DELETE is forbidden', 'an order cannot be deleted');

-- Match: one order, then a combined group.
select is(
  public.set_shopee_payment_match('dddddddd-0000-4000-8000-000000000551',
    jsonb_build_array(pg_temp.m('0001', 0)), 'matched')#>>'{orders,0,revision}',
  '1',
  'a first decision is revision 1'
);
select is(
  (select decision || ' ' || transaction_id::text from public.shopee_payment_match_overlays where order_id = pg_temp.oid('0001')),
  'matched dddddddd-0000-4000-8000-000000000551',
  'the decision and its ledger row are stored'
);
select is(
  (select count(*)::integer from public.shopee_payment_match_revisions where order_id = pg_temp.oid('0001'))
    || '/' || (select event_type from public.audit_events where entity_id = pg_temp.oid('0001') order by id desc limit 1)
    || '/' || (select sequence::text from public.mutation_sequences where owner_id = '11111111-1111-4111-8111-111111111111'),
  '1/shopee.match.matched/2',
  'the decision is revisioned, audited and advances the mutation sequence'
);
select throws_ok(
  format($$select public.set_shopee_payment_match('dddddddd-0000-4000-8000-000000000551', %L::jsonb, 'matched')$$,
    jsonb_build_array(pg_temp.m('0003', 0))::text),
  'ledger row already claimed by another shopee order',
  'a second order may not claim a row another order holds'
);
select throws_ok(
  format($$select public.set_shopee_payment_match('dddddddd-0000-4000-8000-000000000553', %L::jsonb, 'matched')$$,
    jsonb_build_array(pg_temp.m('0002', 0))::text),
  'shopee match amount mismatch',
  'a row whose movement is not the order total, negated, is refused'
);
select throws_ok(
  format($$select public.set_shopee_payment_match('dddddddd-0000-4000-8000-000000000552', %L::jsonb, 'matched')$$,
    jsonb_build_array(pg_temp.m('0002', 0))::text),
  'shopee match amount mismatch',
  'one order of a combined checkout alone does not equal the row'
);
select throws_ok(
  format($$select public.set_shopee_payment_match('dddddddd-0000-4000-8000-000000000552', %L::jsonb, 'matched')$$,
    jsonb_build_array(pg_temp.m('0001', 1))::text),
  'shopee order already matched to another ledger row',
  'an order matched to one row cannot be matched to another without undoing the first'
);
select throws_ok(
  format($$select public.set_shopee_payment_match('dddddddd-0000-4000-8000-000000000552', %L::jsonb, 'matched')$$,
    jsonb_build_array(pg_temp.m('0002', 3), pg_temp.m('0003', 0))::text),
  'shopee match revision conflict',
  'a stale expected revision is refused rather than overwritten'
);
select throws_ok(
  format($$select public.set_shopee_payment_match('dddddddd-0000-4000-8000-000000000551', %L::jsonb, 'matched')$$,
    jsonb_build_array(pg_temp.m('0005', 0))::text),
  'shopee order paid outside the platform',
  'a ฿0 order is never matched'
);
select throws_ok(
  format($$select public.set_shopee_payment_match('dddddddd-0000-4000-8000-000000000551', %L::jsonb, 'matched')$$,
    jsonb_build_array(pg_temp.m('0002', 0), pg_temp.m('0002', 0))::text),
  'invalid shopee match orders',
  'the listed orders must be distinct'
);
select throws_ok(
  format($$select public.set_shopee_payment_match('dddddddd-0000-4000-8000-00000000dead', %L::jsonb, 'matched')$$,
    jsonb_build_array(pg_temp.m('0002', 0))::text),
  'transaction not owned',
  'a ledger row this owner does not hold is refused'
);
select is(
  (select count(*)::integer from jsonb_array_elements(
    public.set_shopee_payment_match('dddddddd-0000-4000-8000-000000000552',
      jsonb_build_array(pg_temp.m('0002', 0), pg_temp.m('0003', 0)), 'matched')->'orders')),
  2,
  'two orders whose totals sum to the row movement are matched together'
);
select is(
  (select count(*)::integer from public.shopee_payment_match_overlays
    where transaction_id = 'dddddddd-0000-4000-8000-000000000552'),
  2,
  'both orders now claim the one row'
);
select throws_ok(
  format($$select public.set_shopee_payment_match(null, %L::jsonb, 'unmatched')$$,
    jsonb_build_array(pg_temp.m('0002', 1))::text),
  'combined shopee match must be undone whole',
  'half of a combined group cannot be unmatched'
);
select is(
  (select count(*)::integer from jsonb_array_elements(public.set_shopee_payment_match(null,
    jsonb_build_array(pg_temp.m('0002', 1), pg_temp.m('0003', 1)), 'unmatched')->'orders')),
  2,
  'the whole group is undone together'
);
select is(
  (select string_agg(decision || ':' || revision, ',' order by order_id::text) from public.shopee_payment_match_overlays
    where order_id in (pg_temp.oid('0002'), pg_temp.oid('0003'))),
  'unmatched:2,unmatched:2',
  'both are unmatched at revision 2, with the history kept'
);

-- Links.
select is(
  public.set_shopee_order_links('wallet_topup', 'dddddddd-0000-4000-8000-000000000555', array[pg_temp.oid('0002')], 'link')->>'changed',
  '1',
  'a wallet order is linked to a debit'
);
select is(
  public.set_shopee_order_links('wallet_topup', 'dddddddd-0000-4000-8000-000000000555', array[pg_temp.oid('0002')], 'link')->>'changed',
  '0',
  'linking again appends nothing'
);
select throws_ok(
  format($$select public.set_shopee_order_links('wallet_topup', 'dddddddd-0000-4000-8000-000000000555', array[%L::uuid], 'link')$$, pg_temp.oid('0003')),
  'shopee link kind mismatch',
  'a SPayLater order cannot be linked as a wallet top-up'
);
select throws_ok(
  format($$select public.set_shopee_order_links('wallet_topup', 'dddddddd-0000-4000-8000-000000000554', array[%L::uuid], 'link')$$, pg_temp.oid('0002')),
  'shopee link kind mismatch',
  'a wallet top-up must be a debit'
);
select is(
  public.set_shopee_order_links('spaylater_repayment', 'dddddddd-0000-4000-8000-000000000555', array[pg_temp.oid('0003')], 'link')->>'changed',
  '1',
  'a SPayLater order is linked to a repayment'
);
select is(
  public.set_shopee_order_links('refund_deposit', 'dddddddd-0000-4000-8000-000000000554', array[pg_temp.oid('0004')], 'link')->>'changed',
  '1',
  'a bank refund is linked to the deposit of exactly its amount'
);
select throws_ok(
  format($$select public.set_shopee_order_links('refund_deposit', 'dddddddd-0000-4000-8000-000000000554', array[%L::uuid], 'link')$$, pg_temp.oid('0002')),
  'shopee link kind mismatch',
  'an order with no bank refund cannot be linked as a refund deposit'
);
select throws_ok(
  format($$select public.set_shopee_order_links('refund_deposit', 'dddddddd-0000-4000-8000-000000000555', array[%L::uuid], 'link')$$, pg_temp.oid('0004')),
  'shopee link kind mismatch',
  'a refund deposit must equal the refund exactly'
);
select throws_ok(
  format($$select public.set_shopee_order_links('refund_deposit', 'dddddddd-0000-4000-8000-000000000554', array[%L::uuid, %L::uuid], 'link')$$, pg_temp.oid('0004'), pg_temp.oid('0002')),
  'invalid shopee link',
  'a refund deposit names exactly one order'
);
select is(
  public.set_shopee_order_links('wallet_topup', 'dddddddd-0000-4000-8000-000000000555', array[pg_temp.oid('0002')], 'unlink')->>'changed',
  '1',
  'a link can be undone'
);
select is(
  public.set_shopee_order_links('wallet_topup', 'dddddddd-0000-4000-8000-000000000555', array[pg_temp.oid('0002')], 'unlink')->>'changed',
  '0',
  'undoing twice appends nothing'
);
select is(
  (select count(*)::integer from public.shopee_order_links where order_id = pg_temp.oid('0002'))
    || '/' || (select sequence::text from public.mutation_sequences where owner_id = '11111111-1111-4111-8111-111111111111'),
  '2/8',
  'the log keeps both events; only effective changes advance the mutation sequence'
);
select throws_ok($$delete from public.shopee_order_links$$,
  'shopee_order_links is append-only: DELETE is forbidden', 'a link event cannot be deleted');
select throws_ok($$delete from public.shopee_payment_match_revisions$$,
  'shopee_payment_match_revisions is append-only: DELETE is forbidden', 'a stored match revision cannot be deleted');

-- A gift line prints no price: the item is display only, so a null price is accepted.
select set_config('t.r3', public.capture_shopee_orders(jsonb_build_object('orders', jsonb_build_array(
  jsonb_set(pg_temp.ord('0007', '2026-09-02T16:00:00+07:00', 'ShopeePay', '1000',
    '[{"position":1,"label":"Merchandise Subtotal","amountMinor":"1000"}]'),
    '{items}', '[{"position":1,"name":"Invented gift","variation":null,"quantity":1,"priceMinor":null,"originalPriceMinor":null}]'::jsonb))))::text, true);
select is(
  (current_setting('t.r3')::jsonb->>'new')
    || '/' || (select count(*)::integer from public.shopee_order_items where order_id = pg_temp.oid('0007') and price_minor is null),
  '1/1',
  'an order with a null-price item is captured'
);
-- Weak access last, so nothing above runs on a downgraded session.
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal1"}',
  true
);
select throws_ok(
  $$select public.capture_shopee_orders('{"orders":[]}'::jsonb)$$,
  'strong owner access required',
  'a session that has not passed MFA cannot capture'
);
select throws_ok(
  $$select public.set_shopee_order_links('wallet_topup', 'dddddddd-0000-4000-8000-000000000555', array[]::uuid[], 'link')$$,
  'strong owner access required',
  'a session that has not passed MFA cannot link'
);

select * from finish();
rollback;
