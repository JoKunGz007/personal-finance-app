begin;
create extension if not exists pgtap with schema extensions;
select plan(36);

-- Receipt storage and its write path (migration 027, PLAN task 56, `docs/RECEIPT_CONTRACT.md`).
--
-- What this proves: the tables are select-only to `authenticated` with RLS forced; a duplicate
-- key is refused by the constraint itself; `capture_receipt` merges scalar fields per field
-- (Rule 1, red-proved against a plain replace), refuses a disagreeing money figure rather than
-- picking a winner (Rule 2), and replaces items+discounts as one unit only when the incoming
-- source ranks at least as high as the one that wrote them, carrying `display_name` across the
-- replace (Rule 3); `sources` accumulates; cascade delete removes children; and a second owner
-- sees none of it. Every value below is invented.

set local session_replication_role = replica;
delete from public.receipt_items;
delete from public.receipt_discounts;
delete from public.receipts;
delete from public.audit_events;
update public.mutation_sequences
set sequence = 0, last_exported_sequence = 0, updated_at = '2026-09-22T00:00:00Z'
where owner_id = '11111111-1111-4111-8111-111111111111';
delete from auth.mfa_factors where user_id = '11111111-1111-4111-8111-111111111111';
set local session_replication_role = origin;

insert into auth.mfa_factors(id, user_id, friendly_name, factor_type, status, secret, created_at, updated_at)
values
  ('aaaaaaaa-0000-4000-8000-000000000031', '11111111-1111-4111-8111-111111111111',
   'receipt contract TOTP', 'totp', 'verified', 'SYNTHETICRECEIPTONE', '2026-09-22T00:00:00Z', '2026-09-22T00:00:00Z');

select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal2"}',
  true
);

-- Least privilege, matching `slips`.
select ok(has_table_privilege('authenticated', 'public.receipts', 'select'), 'authenticated may read its own receipts');
select ok(
  not has_table_privilege('authenticated', 'public.receipts', 'insert')
    and not has_table_privilege('authenticated', 'public.receipts', 'update')
    and not has_table_privilege('authenticated', 'public.receipts', 'delete'),
  'authenticated holds no direct write on receipts'
);
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.receipts'::regclass), 'receipts has RLS enabled and forced');
select ok(has_table_privilege('authenticated', 'public.receipt_items', 'select'), 'authenticated may read its own receipt items');
select ok(
  not has_table_privilege('authenticated', 'public.receipt_items', 'insert')
    and not has_table_privilege('authenticated', 'public.receipt_items', 'update')
    and not has_table_privilege('authenticated', 'public.receipt_items', 'delete'),
  'authenticated holds no direct write on receipt_items'
);
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.receipt_items'::regclass), 'receipt_items has RLS enabled and forced');
select ok(has_table_privilege('authenticated', 'public.receipt_discounts', 'select'), 'authenticated may read its own receipt discounts');
select ok(
  not has_table_privilege('authenticated', 'public.receipt_discounts', 'insert')
    and not has_table_privilege('authenticated', 'public.receipt_discounts', 'update')
    and not has_table_privilege('authenticated', 'public.receipt_discounts', 'delete'),
  'authenticated holds no direct write on receipt_discounts'
);
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.receipt_discounts'::regclass), 'receipt_discounts has RLS enabled and forced');

-- The unique key rejects a duplicate at the constraint itself, independent of the function.
set local session_replication_role = replica;
insert into public.receipts(
  owner_id, merchant, store_code, branch_name, receipt_number, purchased_on, net_minor,
  completeness, sources, items_source, items_complete
) values (
  '11111111-1111-4111-8111-111111111111', '7-eleven', '9999', 'Invented dup branch', '1',
  '2026-09-01', 100, 'complete', array['condensed'], 'condensed', true
);
select throws_ok(
  $$insert into public.receipts(
      owner_id, merchant, store_code, branch_name, receipt_number, purchased_on, net_minor,
      completeness, sources, items_source, items_complete
    ) values (
      '11111111-1111-4111-8111-111111111111', '7-eleven', '9999', 'Invented dup branch', '1',
      '2026-09-02', 200, 'complete', array['full'], 'full', true
    )$$,
  'duplicate key value violates unique constraint "receipts_owner_id_merchant_store_code_receipt_number_key"',
  'a duplicate (owner, merchant, store_code, receipt_number) is refused by the unique key'
);
delete from public.receipts where store_code = '9999';
set local session_replication_role = origin;

-- Capture 1: a condensed, complete parse creates the row (rank 2: complete, not full).
select is(
  (public.capture_receipt(jsonb_build_object(
    'merchant', '7-eleven', 'storeCode', '0001', 'branchName', 'Invented branch',
    'receiptNumber', '0000123', 'purchasedOn', '2026-09-01', 'purchasedAtTime', '10:15',
    'paymentMethod', 'Cash', 'netMinor', '1000', 'completeness', 'complete',
    'failedChecks', '[]'::jsonb, 'inapplicableChecks', '[]'::jsonb, 'source', 'condensed',
    'items', jsonb_build_array(
      jsonb_build_object('lineNo', 1, 'position', 1, 'quantity', 1, 'name', 'Invented item A',
        'unitPriceMinor', null, 'amountMinor', '600', 'vatExempt', false, 'isPromotion', false),
      jsonb_build_object('lineNo', 2, 'position', 2, 'quantity', 1, 'name', 'Invented item B',
        'unitPriceMinor', null, 'amountMinor', '400', 'vatExempt', false, 'isPromotion', false)
    ),
    'discounts', '[]'::jsonb
  ))->>'captured')::boolean,
  true,
  'a new receipt reports itself as captured'
);
select is((select count(*)::text from public.receipts), '1', 'the receipt is stored');
select is((select count(*)::text from public.receipt_items where receipt_id = (select id from public.receipts)), '2', 'both items are stored');
select is(
  (select sequence::text from public.mutation_sequences where owner_id = '11111111-1111-4111-8111-111111111111'),
  '1',
  'capturing a receipt bumps the mutation sequence'
);
select is((select count(*)::text from public.audit_events where event_type = 'receipt.capture'), '1', 'capturing a receipt writes one audit event');

-- Owner-supplied display_name on item 1, for Rule 3's carry-across-replace assertion later.
update public.receipt_items set display_name = 'Owner label'
where receipt_id = (select id from public.receipts) and position = 1;

-- Capture 2: a full, *partial* parse of the same receipt (agreeing net, null payment method,
-- lower rank than the stored condensed+complete items: 1 < 2).
select public.capture_receipt(jsonb_build_object(
  'merchant', '7-eleven', 'storeCode', '0001', 'branchName', 'Invented branch',
  'receiptNumber', '123', 'purchasedOn', '2026-09-01', 'purchasedAtTime', null,
  'paymentMethod', null, 'netMinor', '1000', 'completeness', 'partial',
  'failedChecks', jsonb_build_array('UNIT_COUNT_CHECK'), 'inapplicableChecks', '[]'::jsonb,
  'source', 'full',
  'items', jsonb_build_array(
    jsonb_build_object('lineNo', 1, 'position', 1, 'quantity', 1, 'name', 'Invented item A full',
      'unitPriceMinor', null, 'amountMinor', '1000', 'vatExempt', false, 'isPromotion', false)
  ),
  'discounts', '[]'::jsonb
));

-- Rule 1, red-proved: the distinguishing assertion is `payment_method`. A plain replace of the
-- row (rather than a per-field merge) would set it to NULL, because capture 2 carries no payment
-- method at all (the full invoice never prints one). Confirm this fails under `update ... set
-- payment_method = incoming` — swap the merge for a bare assignment and this assertion is the
-- one that turns red.
select is((select payment_method from public.receipts), 'Cash', 'Rule 1: a later null payment_method does not clear the stored value');
select is((select purchased_at_time::text from public.receipts), '10:15:00', 'Rule 1: a later null purchased_at_time does not clear the stored value');
select is((select completeness from public.receipts), 'partial', 'Rule 1: a not-null scalar field (completeness) takes the incoming value');
select is((select sources from public.receipts), array['condensed', 'full'], 'sources accumulates rather than being overwritten');

-- Rule 3: the lower-ranked full+partial source did not replace the higher-ranked condensed+complete items.
select is((select count(*)::text from public.receipt_items where receipt_id = (select id from public.receipts)), '2', 'Rule 3: a lower-ranked source does not replace higher-ranked items');
select is((select items_source from public.receipts), 'condensed', 'Rule 3: items_source is untouched by a lower-ranked capture');
select is(
  (select array_agg(name order by position) from public.receipt_items where receipt_id = (select id from public.receipts)),
  array['Invented item A', 'Invented item B'],
  'Rule 3: the stored item names are untouched by a lower-ranked capture'
);
select is(
  (select sequence::text from public.mutation_sequences where owner_id = '11111111-1111-4111-8111-111111111111'),
  '2',
  'a merge still bumps the mutation sequence, even when items are not replaced'
);
select is((select count(*)::text from public.audit_events where event_type = 'receipt.merge'), '1', 'a merge writes one audit event');

-- Capture 3: a full, complete parse (rank 3, agreeing net) — equal-or-higher than the stored
-- condensed+complete rank (2), so items are replaced.
select public.capture_receipt(jsonb_build_object(
  'merchant', '7-eleven', 'storeCode', '0001', 'branchName', 'Invented branch',
  'receiptNumber', '123', 'purchasedOn', '2026-09-01', 'netMinor', '1000',
  'completeness', 'complete', 'failedChecks', '[]'::jsonb, 'inapplicableChecks', jsonb_build_array('UNIT_COUNT_CHECK'),
  'source', 'full', 'vatPreMinor', '900', 'vatMinor', '100', 'vatTotalMinor', '1000',
  'items', jsonb_build_array(
    jsonb_build_object('lineNo', 1, 'position', 1, 'quantity', 1, 'name', 'Invented item A untruncated',
      'unitPriceMinor', null, 'amountMinor', '600', 'vatExempt', false, 'isPromotion', false),
    jsonb_build_object('lineNo', 2, 'position', 2, 'quantity', 1, 'name', 'Invented item B untruncated',
      'unitPriceMinor', null, 'amountMinor', '300', 'vatExempt', false, 'isPromotion', false),
    jsonb_build_object('lineNo', 3, 'position', 3, 'quantity', 1, 'name', 'Invented item C',
      'unitPriceMinor', null, 'amountMinor', '100', 'vatExempt', false, 'isPromotion', false)
  ),
  'discounts', '[]'::jsonb
));

select is((select items_source from public.receipts), 'full', 'Rule 3: an equal-or-higher-ranked source replaces items_source');
select is((select count(*)::text from public.receipt_items where receipt_id = (select id from public.receipts)), '3', 'Rule 3: an equal-or-higher-ranked source replaces the item rows');
select is(
  (select display_name from public.receipt_items where receipt_id = (select id from public.receipts) and position = 1),
  'Owner label',
  'display_name survives a Rule 3 replace, matched by position'
);
select is(
  (select display_name from public.receipt_items where receipt_id = (select id from public.receipts) and position = 2),
  null,
  'a position with no prior owner display_name stays null after a replace'
);
select is((select vat_minor::text from public.receipts), '100', 'Rule 1: a VAT figure absent from earlier captures is filled in by a later one');

-- Rule 2: a disagreeing net_minor is refused, not merged.
select throws_ok(
  $$select public.capture_receipt(jsonb_build_object(
      'merchant', '7-eleven', 'storeCode', '0001', 'branchName', 'Invented branch',
      'receiptNumber', '123', 'purchasedOn', '2026-09-01', 'netMinor', '999',
      'completeness', 'complete', 'source', 'screenshot',
      'items', '[]'::jsonb, 'discounts', '[]'::jsonb))$$,
  'receipt net amount disagrees with the stored value; refusing to guess which reading is right',
  'a disagreeing net_minor is refused rather than overwritten'
);
select is((select net_minor::text from public.receipts), '1000', 'the refused capture left the stored net amount unchanged');
select is((select count(*)::text from public.receipts), '1', 'the refused capture created no second row');

-- Cascade delete: removing the receipt removes its children.
select lives_ok(
  $$delete from public.receipts where store_code = '0001'$$,
  'the receipt can be deleted directly in this fixture'
);
select is((select count(*)::text from public.receipt_items), '0', 'cascade delete removes item rows');
select is((select count(*)::text from public.receipt_discounts), '0', 'cascade delete removes discount rows');

-- RLS isolates a second owner.
select set_config(
  'request.jwt.claims',
  '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated","aal":"aal2"}',
  true
);
select is((select count(*)::integer from public.receipts), 0, 'a forged non-owner JWT sees no receipts');

select * from finish();
rollback;
