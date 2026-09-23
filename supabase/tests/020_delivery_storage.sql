begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

-- Delivery order storage and its write path (migration 032, PLAN task 58 part 1,
-- `docs/DELIVERY_CONTRACT.md`).
--
-- What this proves: the three tables are select-only to `authenticated` with RLS forced;
-- `capture_delivery` stores an order with its dishes and discounts, audits it and bumps the
-- mutation sequence; a second copy of the same booking is a no-op; a second copy whose money
-- disagrees is refused; the server re-checks both sums, adding a charge and subtracting a discount; the rows are append-only; and a second
-- owner sees none of it. Every value below is invented.

set local session_replication_role = replica;
delete from public.delivery_adjustments;
delete from public.delivery_items;
delete from public.deliveries;
delete from public.audit_events;
update public.mutation_sequences
set sequence = 0, last_exported_sequence = 0, updated_at = '2026-09-23T00:00:00Z'
where owner_id = '11111111-1111-4111-8111-111111111111';
delete from auth.mfa_factors where user_id = '11111111-1111-4111-8111-111111111111';
set local session_replication_role = origin;

insert into auth.mfa_factors(id, user_id, friendly_name, factor_type, status, secret, created_at, updated_at)
values
  ('aaaaaaaa-0000-4000-8000-000000000032', '11111111-1111-4111-8111-111111111111',
   'delivery contract TOTP', 'totp', 'verified', 'SYNTHETICDELIVERYONE', '2026-09-23T00:00:00Z', '2026-09-23T00:00:00Z');

select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal2"}',
  true
);

-- Least privilege.
select ok(
  has_table_privilege('authenticated', 'public.deliveries', 'select')
    and has_table_privilege('authenticated', 'public.delivery_items', 'select')
    and has_table_privilege('authenticated', 'public.delivery_adjustments', 'select'),
  'authenticated may read its own orders, dishes and discounts'
);
select ok(
  not has_table_privilege('authenticated', 'public.deliveries', 'insert')
    and not has_table_privilege('authenticated', 'public.deliveries', 'update')
    and not has_table_privilege('authenticated', 'public.deliveries', 'delete')
    and not has_table_privilege('authenticated', 'public.delivery_items', 'insert')
    and not has_table_privilege('authenticated', 'public.delivery_adjustments', 'insert'),
  'authenticated holds no direct write on the delivery tables'
);
select ok(
  (select bool_and(relrowsecurity and relforcerowsecurity) from pg_class
    where oid in ('public.deliveries'::regclass, 'public.delivery_items'::regclass, 'public.delivery_adjustments'::regclass)),
  'all three delivery tables have RLS enabled and forced'
);
select ok(not has_function_privilege('anon', 'public.capture_delivery(jsonb)', 'execute'), 'anon cannot capture an order');

create temporary table invented_order as select jsonb_build_object(
  'platform', 'grabfood', 'bookingId', 'A-INVENTED0001', 'restaurant', 'Invented Kitchen',
  'paymentMethod', 'Invented card', 'receiptSentAt', '2026-09-01T19:30:00+07:00',
  'foodMinor', '25000', 'deliveryFeeMinor', '1500', 'totalMinor', '21500',
  'items', jsonb_build_array(
    jsonb_build_object('position', 1, 'quantity', 1, 'name', 'Invented noodles', 'options', jsonb_build_array('Extra invented egg'), 'amountMinor', '15000'),
    jsonb_build_object('position', 2, 'quantity', 2, 'name', 'Invented tea', 'options', '[]'::jsonb, 'amountMinor', '10000')),
  'adjustments', jsonb_build_array(
    jsonb_build_object('position', 1, 'kind', 'discount', 'name', 'INVENTEDCODE', 'amountMinor', '5000'))) as value;
grant select on invented_order to authenticated;

select is(
  (select public.capture_delivery(value)->>'captured' from invented_order),
  'true',
  'a new order is captured'
);
select is((select count(*)::integer from public.deliveries), 1, 'one order row');
select is((select count(*)::integer from public.delivery_items), 2, 'two dish rows');
select is(
  (select options from public.delivery_items where position = 1),
  array['Extra invented egg']::text[],
  'a dish keeps its priceless option lines'
);
select is((select count(*)::integer from public.delivery_adjustments), 1, 'one adjustment row');
select is(
  (select count(*)::integer from public.audit_events where event_type = 'delivery.capture'),
  1,
  'the capture is audited'
);
select is(
  (select sequence::integer from public.mutation_sequences where owner_id = '11111111-1111-4111-8111-111111111111'),
  1,
  'the capture bumps the mutation sequence the backup reads'
);

-- A second copy of the same booking is a no-op.
select is(
  (select public.capture_delivery(value)->>'captured' from invented_order),
  'false',
  'a second copy of the same booking is not captured again'
);
select is((select count(*)::integer from public.deliveries), 1, 'the second copy created no row');
select is(
  (select sequence::integer from public.mutation_sequences where owner_id = '11111111-1111-4111-8111-111111111111'),
  1,
  'the second copy wrote nothing, so the sequence did not move'
);

-- A second copy that disagrees about money is refused.
select throws_ok(
  $$select public.capture_delivery(value || jsonb_build_object('deliveryFeeMinor', '2500', 'totalMinor', '22500')) from invented_order$$,
  'delivery disagrees with the stored copy; refusing to guess which reading is right',
  'a disagreeing second copy is refused rather than kept or overwritten'
);

-- The server re-checks both sums.
select throws_ok(
  $$select public.capture_delivery(value || jsonb_build_object('bookingId', 'A-INVENTED0002', 'foodMinor', '24000', 'totalMinor', '20500')) from invented_order$$,
  'delivery items do not sum to the food subtotal',
  'dishes that do not sum to the food line are refused'
);
select throws_ok(
  $$select public.capture_delivery(value || jsonb_build_object('bookingId', 'A-INVENTED0003', 'totalMinor', '21000')) from invented_order$$,
  'delivery food plus delivery plus charges minus discounts does not equal the total',
  'a total that does not reconcile is refused'
);
-- A charge (printed without a minus sign) adds to the total rather than taking from it.
select is(
  (select public.capture_delivery(value || jsonb_build_object('bookingId', 'A-INVENTED0006', 'totalMinor', '22500',
    'adjustments', jsonb_build_array(
      jsonb_build_object('position', 1, 'kind', 'discount', 'name', 'INVENTEDCODE', 'amountMinor', '5000'),
      jsonb_build_object('position', 2, 'kind', 'charge', 'name', 'Invented small order fee', 'amountMinor', '1000')))) ->> 'captured'
   from invented_order),
  'true',
  'a charge line is added, not subtracted'
);
select throws_ok(
  $$select public.capture_delivery(value || jsonb_build_object('bookingId', 'A-INVENTED0004', 'totalMinor', 21500)) from invented_order$$,
  'delivery money must be canonical int64 text',
  'money as a JSON number is refused'
);

-- An unprinted line (a deduction the e-receipt never shows) subtracts like a discount.
select is(
  (select public.capture_delivery(value || jsonb_build_object('bookingId', 'A-INVENTED0007', 'totalMinor', '18500',
    'adjustments', jsonb_build_array(
      jsonb_build_object('position', 1, 'kind', 'discount', 'name', 'INVENTEDCODE', 'amountMinor', '5000'),
      jsonb_build_object('position', 2, 'kind', 'unprinted', 'name', 'Not on the e-receipt', 'amountMinor', '3000')))) ->> 'captured'
   from invented_order),
  'true',
  'an unprinted line is subtracted'
);
select throws_ok(
  $$select public.capture_delivery(value || jsonb_build_object('bookingId', 'A-INVENTED0008',
    'adjustments', jsonb_build_array(jsonb_build_object('position', 1, 'kind', 'invented', 'name', 'X', 'amountMinor', '5000')))) from invented_order$$,
  'invalid delivery',
  'an adjustment kind outside the three is refused'
);

-- A ฿0 order (every baht discounted) is stored; "paid outside the platform" is read from it.
select is(
  (select public.capture_delivery(value || jsonb_build_object('bookingId', 'A-INVENTED0005', 'deliveryFeeMinor', null, 'totalMinor', '0',
    'adjustments', jsonb_build_array(jsonb_build_object('position', 1, 'kind', 'discount', 'name', 'INVENTEDSCHEME', 'amountMinor', '25000')))) ->> 'captured'
   from invented_order),
  'true',
  'a zero-total order is stored'
);

-- Append-only.
select throws_ok(
  $$update public.deliveries set restaurant = 'Changed' where booking_id = 'A-INVENTED0001'$$,
  'deliveries is append-only: UPDATE is forbidden',
  'an order cannot be edited in place'
);

-- RLS isolates a second owner, read as the authenticated role rather than the test's superuser.
select set_config(
  'request.jwt.claims',
  '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated","aal":"aal2"}',
  true
);
set local role authenticated;
create temporary table second_owner_view on commit drop as
  select (select count(*)::integer from public.deliveries) + (select count(*)::integer from public.delivery_items) as seen;
reset role;
select is((select seen from second_owner_view), 0, 'a second owner sees no orders and no dishes');

select * from finish();
rollback;
