begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

-- An OCR reading never overwrites a PDF's (migration 029, D-210). A screenshot saved after a
-- complete condensed PDF keeps the PDF's items, branch and payment method; a condensed PDF saved
-- after a screenshot replaces them. Every value below is invented.

set local session_replication_role = replica;
delete from public.receipt_items;
delete from public.receipt_discounts;
delete from public.receipts;
delete from public.audit_events;
delete from auth.mfa_factors where user_id = '11111111-1111-4111-8111-111111111111';
set local session_replication_role = origin;

insert into auth.mfa_factors(id, user_id, friendly_name, factor_type, status, secret, created_at, updated_at)
values
  ('aaaaaaaa-0000-4000-8000-000000000032', '11111111-1111-4111-8111-111111111111',
   'receipt rank TOTP', 'totp', 'verified', 'SYNTHETICRECEIPTTWO', '2026-09-23T00:00:00Z', '2026-09-23T00:00:00Z');

select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal2"}',
  true
);

create function pg_temp.capture(p_store text, p_source text, p_branch text, p_payment text, p_name text)
returns jsonb language sql as $$
  select public.capture_receipt(jsonb_build_object(
    'merchant', '7-eleven', 'storeCode', p_store, 'branchName', p_branch,
    'receiptNumber', '0000777', 'purchasedOn', '2026-09-03', 'purchasedAtTime', '09:30',
    'paymentMethod', p_payment, 'netMinor', '500', 'unitCount', '1', 'completeness', 'complete',
    'failedChecks', '[]'::jsonb, 'inapplicableChecks', '["VAT_IDENTITY_CHECK"]'::jsonb, 'source', p_source,
    'items', jsonb_build_array(jsonb_build_object('lineNo', 1, 'position', 0, 'quantity', 1, 'name', p_name,
      'unitPriceMinor', null, 'amountMinor', '500', 'vatExempt', false, 'isPromotion', false)),
    'discounts', '[]'::jsonb))
$$;

-- PDF first, then the screenshot of the same purchase.
select pg_temp.capture('0101', 'condensed', 'Invented branch', 'InventedPay', 'Invented exact name');
select is(
  (pg_temp.capture('0101', 'screenshot', 'Invented bra nch', 'Invented Pay', 'Invented 0CR name')->>'itemsReplaced')::boolean,
  false,
  'a complete screenshot does not replace a complete condensed PDF''s items'
);
select is((select name from public.receipt_items), 'Invented exact name', 'the PDF''s item name survives the screenshot');
select is((select items_source from public.receipts where store_code = '0101'), 'condensed', 'items_source stays the PDF');
select is((select branch_name from public.receipts where store_code = '0101'), 'Invented branch', 'the PDF''s branch name survives the OCR reading');
select is((select payment_method from public.receipts where store_code = '0101'), 'InventedPay', 'the PDF''s payment method survives the OCR reading');
select is((select sources from public.receipts where store_code = '0101'), array['condensed', 'screenshot'], 'the screenshot is still recorded as a source');

-- Screenshot first, then the PDF: the PDF's reading replaces the OCR one.
select pg_temp.capture('0202', 'screenshot', 'Invented bra nch', 'Invented Pay', 'Invented 0CR name');
select is(
  (pg_temp.capture('0202', 'condensed', 'Invented branch', 'InventedPay', 'Invented exact name')->>'itemsReplaced')::boolean,
  true,
  'a complete condensed PDF replaces a complete screenshot''s items'
);
select is(
  (select name from public.receipt_items where receipt_id = (select id from public.receipts where store_code = '0202')),
  'Invented exact name',
  'the PDF''s item name replaces the OCR one'
);
select is((select branch_name from public.receipts where store_code = '0202'), 'Invented branch', 'the PDF''s branch replaces the OCR one');
select is((select payment_method from public.receipts where store_code = '0202'), 'InventedPay', 'the PDF''s payment method replaces the OCR one');

select * from finish();
rollback;
