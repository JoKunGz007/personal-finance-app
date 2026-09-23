begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

-- Receipt statistics (migration 031, PLAN task 56). The contract: every receipt's net counts;
-- item figures read only receipts whose items are complete, and only merchandise (no promotion,
-- no zero-priced line); the average is an exact quotient/remainder pair; nothing is visible
-- without strong access. Every value is invented.

set local session_replication_role = replica;
delete from public.receipt_match_revisions;
delete from public.receipt_match_overlays;
delete from public.receipt_items;
delete from public.receipt_discounts;
delete from public.receipts;
delete from auth.mfa_factors where user_id = '11111111-1111-4111-8111-111111111111';

-- R1 complete, R2 complete (another month, another branch, no payment line), R3 partial.
insert into public.receipts(id, owner_id, merchant, store_code, branch_name, receipt_number, purchased_on,
  purchased_at_time, payment_method, net_minor, completeness, sources, items_source, items_complete)
values
  ('ffffffff-0000-4000-8000-000000000011', '11111111-1111-4111-8111-111111111111', '7-eleven', '0001', 'Invented branch A', '11',
   '2026-08-10', '09:00', 'Invented wallet', 10000, 'complete', '{condensed}', 'condensed', true),
  ('ffffffff-0000-4000-8000-000000000012', '11111111-1111-4111-8111-111111111111', '7-eleven', '0002', 'Invented branch B', '12',
   '2026-09-02', null, null, 5001, 'complete', '{full}', 'full', true),
  ('ffffffff-0000-4000-8000-000000000013', '11111111-1111-4111-8111-111111111111', '7-eleven', '0001', 'Invented branch A', '13',
   '2026-09-03', '18:00', 'Invented wallet', 7000, 'partial', '{screenshot}', 'screenshot', false);

insert into public.receipt_items(owner_id, receipt_id, line_no, position, quantity, name, display_name,
  unit_price_minor, amount_minor, vat_exempt, is_promotion)
values
  ('11111111-1111-4111-8111-111111111111', 'ffffffff-0000-4000-8000-000000000011', 1, 0, 2, 'Invented water', null, 1500, 3000, false, false),
  ('11111111-1111-4111-8111-111111111111', 'ffffffff-0000-4000-8000-000000000011', 2, 1, 1, 'Invented bread', null, null, 8000, true, false),
  ('11111111-1111-4111-8111-111111111111', 'ffffffff-0000-4000-8000-000000000011', 3, 2, 3, 'M-Stamp(บาท)', null, null, 0, false, true),
  ('11111111-1111-4111-8111-111111111111', 'ffffffff-0000-4000-8000-000000000011', 4, 3, 10, 'Invented delivery', null, 0, 0, true, false),
  ('11111111-1111-4111-8111-111111111111', 'ffffffff-0000-4000-8000-000000000012', 1, 0, 1, 'Invented wat', 'Invented water', null, 5001, false, false),
  ('11111111-1111-4111-8111-111111111111', 'ffffffff-0000-4000-8000-000000000013', 1, 0, 9, 'Invented water', null, null, 9000, false, false);

insert into public.receipt_discounts(owner_id, receipt_id, position, name, amount_minor)
values
  ('11111111-1111-4111-8111-111111111111', 'ffffffff-0000-4000-8000-000000000011', 0, null, 1000),
  ('11111111-1111-4111-8111-111111111111', 'ffffffff-0000-4000-8000-000000000013', 0, null, 2000);
set local session_replication_role = origin;

insert into auth.mfa_factors(id, user_id, friendly_name, factor_type, status, secret, created_at, updated_at)
values ('aaaaaaaa-0000-4000-8000-000000000032', '11111111-1111-4111-8111-111111111111',
  'receipt statistics TOTP', 'totp', 'verified', 'SYNTHETICRECEIPTSTATS', '2026-09-23T00:00:00Z', '2026-09-23T00:00:00Z');

select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal2"}',
  true
);
set local role authenticated;

create temporary table s on commit drop as select public.receipt_statistics() as v;

select ok(
  not has_function_privilege('anon', 'public.receipt_statistics()', 'execute')
    and has_function_privilege('authenticated', 'public.receipt_statistics()', 'execute'),
  'authenticated may read receipt statistics and anon may not'
);
select is((select v->'totals'->>'receipts' from s), '3', 'every receipt is counted, partial included');
select is((select v->'totals'->>'net' from s), '22001', 'every receipt''s net counts, partial included');
select is((select v->'totals'->'averageNet' from s), '{"quotient":"7333","remainder":"2"}'::jsonb,
  'the average basket is an exact quotient and remainder');
select is((select v->'totals'->>'partialReceipts' from s), '1', 'the partial receipt is reported as left out of item figures');
select is((select v->'totals'->>'units' from s), '4', 'units count merchandise on complete receipts only');
select is((select v->'totals'->>'itemSpend' from s), '16001', 'item spend excludes the partial receipt''s lines');
select is((select v->'totals'->>'discounts' from s), '1000', 'discounts follow the item-list rule');
select is((select v->'mostBought'->0 from s),
  '{"name":"Invented water","quantity":3,"spend":"8001","receipts":2}'::jsonb,
  'the display name joins a truncated name to its whole one, and the partial list stays out');
select ok(
  not exists (select 1 from s, jsonb_array_elements(v->'mostBought') e
               where e->>'name' in ('M-Stamp(บาท)', 'Invented delivery')),
  'a promotion or zero-priced line is never an item'
);
select is((select array_agg(e->>'spend' order by o) from s, jsonb_array_elements(v->'mostSpent') with ordinality as x(e, o)),
  array['8001', '8000'], 'most spent is ranked by spend');
select is((select v->'months' from s),
  '[{"month":"2026-08","receipts":1,"net":"10000"},{"month":"2026-09","receipts":2,"net":"12001"}]'::jsonb,
  'months carry every receipt''s net');
select is((select v->'paymentMethods'->1 from s), '{"method":null,"receipts":1,"net":"5001"}'::jsonb,
  'a receipt with no payment line is its own group, not dropped');

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal1"}',
  true
);
set local role authenticated;
select is((select public.receipt_statistics()->'totals'->>'receipts'), '0',
  'a session that has not passed MFA sees no receipts');
reset role;

select * from finish();
rollback;
