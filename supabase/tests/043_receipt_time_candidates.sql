begin;
create extension if not exists pgtap with schema extensions;
select plan(40);

-- Ambiguous screenshot times and the later fill (migration 067). Nothing here is real data.
--
-- What this proves: `capture_receipt` accepts `timeCandidates` only from a screenshot whose time
-- is null, only as exactly two distinct HH:MM strings, and records them in the capture / merge
-- audit detail; `fill_receipt_time` fills a null time from the one candidate whose lag to an
-- exact-amount TRUE MONEY row (or the owner's stored match) is in [0, 120], breaks a tie only by
-- a single lag in [0, 2], and otherwise writes nothing; a fill is audited and bumps the mutation
-- sequence; a replay is a no-op with no second audit event; access is refused as elsewhere.

set local session_replication_role = replica;
delete from public.receipt_match_revisions;
delete from public.receipt_match_overlays;
delete from public.receipt_items;
delete from public.receipt_discounts;
delete from public.receipts;
delete from public.slip_match_revisions;
delete from public.slip_match_overlays;
delete from public.source_components;
delete from public.source_transactions;
delete from public.audit_events;
delete from public.accounts;
update public.mutation_sequences
set sequence = 0, last_exported_sequence = 0, updated_at = '2026-11-19T00:00:00Z'
where owner_id = '11111111-1111-4111-8111-111111111111';
delete from auth.mfa_factors where user_id = '11111111-1111-4111-8111-111111111111';

insert into public.accounts(id, owner_id, bank_code, label, account_type, last_four, currency, timezone)
values
  ('cccccccc-0000-4000-8000-000000000671', '11111111-1111-4111-8111-111111111111', 'SCB', 'Invented SCB', 'savings', '6701', 'THB', 'Asia/Bangkok'),
  -- Another owner's account, inserted with constraints off: only its rows' ownership matters.
  ('cccccccc-0000-4000-8000-000000000672', '22222222-2222-4222-8222-222222222222', 'SCB', 'Invented other', 'savings', '6702', 'THB', 'Asia/Bangkok');

-- Every row moves money out on an invented date. Amounts are invented.
insert into public.source_transactions(id, owner_id, account_id, fingerprint_version, fingerprint,
  source_date, source_time, effective_date, transaction_label, description, post_balance_minor, currency)
values
  -- For receipt 1 (candidates 10:00 / 10:30, net 14100).
  ('dddddddd-0000-4000-8000-000000000671', '11111111-1111-4111-8111-111111111111', 'cccccccc-0000-4000-8000-000000000671',
   'fingerprint-v1', repeat('1', 64), '2026-11-01', '10:45', '2026-11-01', 'SIPI', 'SIPS TRUE MONEY CO.,LTD. NOTE : -', '500000', 'THB'),
  ('dddddddd-0000-4000-8000-000000000672', '11111111-1111-4111-8111-111111111111', 'cccccccc-0000-4000-8000-000000000671',
   'fingerprint-v1', repeat('2', 64), '2026-11-01', '10:31', '2026-11-01', 'SIPI', 'SIPS TRUE MONEY CO.,LTD. NOTE : -', '490000', 'THB'),
  -- For receipt 2 (candidates 09:00 / 13:00, net 25500).
  ('dddddddd-0000-4000-8000-000000000673', '11111111-1111-4111-8111-111111111111', 'cccccccc-0000-4000-8000-000000000671',
   'fingerprint-v1', repeat('3', 64), '2026-11-02', '13:05', '2026-11-02', 'SIPI', 'SIPS TRUE MONEY CO.,LTD. NOTE : -', '480000', 'THB'),
  ('dddddddd-0000-4000-8000-000000000674', '11111111-1111-4111-8111-111111111111', 'cccccccc-0000-4000-8000-000000000671',
   'fingerprint-v1', repeat('4', 64), '2026-11-02', '13:05', '2026-11-02', 'SIPI', 'SIPS TRUE MONEY CO.,LTD. NOTE : -', '470000', 'THB'),
  ('dddddddd-0000-4000-8000-000000000675', '22222222-2222-4222-8222-222222222222', 'cccccccc-0000-4000-8000-000000000672',
   'fingerprint-v1', repeat('5', 64), '2026-11-02', '13:05', '2026-11-02', 'SIPI', 'SIPS TRUE MONEY CO.,LTD. NOTE : -', '460000', 'THB'),
  ('dddddddd-0000-4000-8000-000000000676', '11111111-1111-4111-8111-111111111111', 'cccccccc-0000-4000-8000-000000000671',
   'fingerprint-v1', repeat('6', 64), '2026-11-02', null, '2026-11-02', 'SIPI', 'SIPS TRUE MONEY CO.,LTD. NOTE : -', '450000', 'THB'),
  -- For receipt 3 (candidates 08:00 / 08:01, net 30000).
  ('dddddddd-0000-4000-8000-000000000677', '11111111-1111-4111-8111-111111111111', 'cccccccc-0000-4000-8000-000000000671',
   'fingerprint-v1', repeat('7', 64), '2026-11-03', '08:02', '2026-11-03', 'SIPI', 'SIPS TRUE MONEY CO.,LTD. NOTE : -', '440000', 'THB'),
  ('dddddddd-0000-4000-8000-000000000678', '11111111-1111-4111-8111-111111111111', 'cccccccc-0000-4000-8000-000000000671',
   'fingerprint-v1', repeat('8', 64), '2026-11-03', '12:00', '2026-11-03', 'SIPI', 'SIPS TRUE MONEY CO.,LTD. NOTE : -', '430000', 'THB'),
  -- For receipt 4 (candidates 07:00 / 11:00, net 40000): a PromptPay row, the reimbursement shape.
  ('dddddddd-0000-4000-8000-000000000679', '11111111-1111-4111-8111-111111111111', 'cccccccc-0000-4000-8000-000000000671',
   'fingerprint-v1', repeat('9', 64), '2026-11-04', '07:10', '2026-11-04', 'ENET', 'PromptPay invented payee', '420000', 'THB');

insert into public.source_components(id, owner_id, transaction_id, position, kind, amount_minor, currency)
values
  ('eeeeeeee-0000-4000-8000-000000000671', '11111111-1111-4111-8111-111111111111', 'dddddddd-0000-4000-8000-000000000671', 1, 'withdrawal', -14100, 'THB'),
  ('eeeeeeee-0000-4000-8000-000000000672', '11111111-1111-4111-8111-111111111111', 'dddddddd-0000-4000-8000-000000000672', 1, 'withdrawal', -14100, 'THB'),
  ('eeeeeeee-0000-4000-8000-000000000673', '11111111-1111-4111-8111-111111111111', 'dddddddd-0000-4000-8000-000000000673', 1, 'withdrawal', -25500, 'THB'),
  ('eeeeeeee-0000-4000-8000-000000000674', '11111111-1111-4111-8111-111111111111', 'dddddddd-0000-4000-8000-000000000674', 1, 'withdrawal', -25400, 'THB'),
  ('eeeeeeee-0000-4000-8000-000000000675', '22222222-2222-4222-8222-222222222222', 'dddddddd-0000-4000-8000-000000000675', 1, 'withdrawal', -25500, 'THB'),
  ('eeeeeeee-0000-4000-8000-000000000676', '11111111-1111-4111-8111-111111111111', 'dddddddd-0000-4000-8000-000000000676', 1, 'withdrawal', -25500, 'THB'),
  ('eeeeeeee-0000-4000-8000-000000000677', '11111111-1111-4111-8111-111111111111', 'dddddddd-0000-4000-8000-000000000677', 1, 'withdrawal', -30000, 'THB'),
  ('eeeeeeee-0000-4000-8000-000000000678', '11111111-1111-4111-8111-111111111111', 'dddddddd-0000-4000-8000-000000000678', 1, 'withdrawal', -30000, 'THB'),
  ('eeeeeeee-0000-4000-8000-000000000679', '11111111-1111-4111-8111-111111111111', 'dddddddd-0000-4000-8000-000000000679', 1, 'withdrawal', -40000, 'THB');
set local session_replication_role = origin;

insert into auth.mfa_factors(id, user_id, friendly_name, factor_type, status, secret, created_at, updated_at)
values ('aaaaaaaa-0000-4000-8000-000000000671', '11111111-1111-4111-8111-111111111111',
  'receipt time TOTP', 'totp', 'verified', 'SYNTHETICRECEIPTTIME', '2026-11-19T00:00:00Z', '2026-11-19T00:00:00Z');

select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal2"}', true);

-- One capture request; `p_extra` overrides or adds keys.
create function pg_temp.req(p_number text, p_on text, p_net text, p_source text, p_extra jsonb)
returns jsonb language sql as $$
  select jsonb_build_object(
    'merchant', '7-eleven', 'storeCode', '0067', 'branchName', 'Invented branch',
    'receiptNumber', p_number, 'purchasedOn', p_on, 'purchasedAtTime', null,
    'paymentMethod', 'Invented wallet', 'netMinor', p_net, 'completeness', 'complete',
    'failedChecks', '[]'::jsonb, 'inapplicableChecks', '[]'::jsonb, 'source', p_source,
    'items', jsonb_build_array(jsonb_build_object('lineNo', 1, 'position', 1, 'quantity', 1,
      'name', 'Invented item', 'unitPriceMinor', null, 'amountMinor', p_net,
      'vatExempt', false, 'isPromotion', false)),
    'discounts', '[]'::jsonb) || p_extra
$$;

create function pg_temp.rid(p_number text) returns uuid language sql as $$
  select id from public.receipts where store_code = '0067' and receipt_number = p_number
$$;

-- ------------------------------------------------------------------- (a) grants

select ok(
  has_function_privilege('authenticated', 'public.fill_receipt_time(uuid,uuid)', 'execute')
    and not has_function_privilege('anon', 'public.fill_receipt_time(uuid,uuid)', 'execute')
    and not has_function_privilege('public', 'public.fill_receipt_time(uuid,uuid)', 'execute'),
  'authenticated may execute fill_receipt_time; anon and public may not'
);
select ok(
  has_function_privilege('authenticated', 'public.capture_receipt(jsonb)', 'execute')
    and not has_function_privilege('anon', 'public.capture_receipt(jsonb)', 'execute'),
  'capture_receipt keeps its grants'
);

-- ------------------------------------------------------------------- (b) capture with candidates

select is(
  (public.capture_receipt(pg_temp.req('1', '2026-11-01', '14100', 'screenshot',
    '{"timeCandidates":["10:00","10:30"]}'))->>'captured')::boolean,
  true, 'a screenshot with a null time and two candidates is captured');
select is((select purchased_at_time from public.receipts where id = pg_temp.rid('1')), null::time,
  'the captured time stays null');
select is(
  (select detail->'time_candidates' from public.audit_events
    where entity_id = pg_temp.rid('1') and event_type = 'receipt.capture'),
  '["10:00","10:30"]'::jsonb, 'the capture audit detail records both candidates');

select public.capture_receipt(pg_temp.req('2', '2026-11-02', '25500', 'screenshot', '{"timeCandidates":["09:00","13:00"]}'));
select public.capture_receipt(pg_temp.req('3', '2026-11-03', '30000', 'screenshot', '{"timeCandidates":["08:00","08:01"]}'));
select public.capture_receipt(pg_temp.req('4', '2026-11-04', '40000', 'screenshot', '{"timeCandidates":["07:00","11:00"]}'));
-- Receipt 5 has a time; receipt 6 has neither a time nor candidates.
select public.capture_receipt(pg_temp.req('5', '2026-11-01', '14100', 'screenshot', '{"purchasedAtTime":"10:00"}'));
select public.capture_receipt(pg_temp.req('6', '2026-11-01', '14100', 'screenshot', '{}'));

select ok(
  not ((select detail from public.audit_events where entity_id = pg_temp.rid('6') and event_type = 'receipt.capture') ? 'time_candidates'),
  'a capture without candidates records no time_candidates key');

-- A merge carries them too: receipt 7 is first captured without, then re-read with candidates.
select public.capture_receipt(pg_temp.req('7', '2026-11-05', '5000', 'screenshot', '{}'));
select is(
  (public.capture_receipt(pg_temp.req('7', '2026-11-05', '5000', 'screenshot',
    '{"timeCandidates":["15:00","15:10"]}'))->>'merged')::boolean,
  true, 'a screenshot re-read with candidates merges');
select is(
  (select detail->'time_candidates' from public.audit_events
    where entity_id = pg_temp.rid('7') and event_type = 'receipt.merge'),
  '["15:00","15:10"]'::jsonb, 'the merge audit detail records both candidates');

-- ------------------------------------------------------------------- (c) capture refusals

select throws_ok(
  $$select public.capture_receipt(pg_temp.req('80', '2026-11-01', '100', 'screenshot', '{"purchasedAtTime":"10:00","timeCandidates":["10:00","10:30"]}'))$$,
  'invalid receipt', 'candidates with a non-null time are refused');
select throws_ok(
  $$select public.capture_receipt(pg_temp.req('81', '2026-11-01', '100', 'condensed', '{"timeCandidates":["10:00","10:30"]}'))$$,
  'invalid receipt', 'candidates on a condensed form are refused');
select throws_ok(
  $$select public.capture_receipt(pg_temp.req('82', '2026-11-01', '100', 'full', '{"timeCandidates":["10:00","10:30"]}'))$$,
  'invalid receipt', 'candidates on a full invoice are refused');
select throws_ok(
  $$select public.capture_receipt(pg_temp.req('83', '2026-11-01', '100', 'screenshot', '{"timeCandidates":["10:00"]}'))$$,
  'invalid receipt', 'one candidate is refused');
select throws_ok(
  $$select public.capture_receipt(pg_temp.req('84', '2026-11-01', '100', 'screenshot', '{"timeCandidates":["10:00","10:30","11:00"]}'))$$,
  'invalid receipt', 'three candidates are refused');
select throws_ok(
  $$select public.capture_receipt(pg_temp.req('85', '2026-11-01', '100', 'screenshot', '{"timeCandidates":["10:00","10:00"]}'))$$,
  'invalid receipt', 'duplicate candidates are refused');
select throws_ok(
  $$select public.capture_receipt(pg_temp.req('86', '2026-11-01', '100', 'screenshot', '{"timeCandidates":["10:00","24:00"]}'))$$,
  'invalid receipt', 'a candidate that is not a valid HH:MM is refused');
select throws_ok(
  $$select public.capture_receipt(pg_temp.req('87', '2026-11-01', '100', 'screenshot', '{"timeCandidates":["10:00",1030]}'))$$,
  'invalid receipt', 'a non-string candidate is refused');
select throws_ok(
  $$select public.capture_receipt(pg_temp.req('88', '2026-11-01', '100', 'screenshot', '{"timeCandidates":"10:00"}'))$$,
  'invalid receipt', 'candidates that are not an array are refused');
select is((select count(*)::integer from public.receipts where receipt_number like '8_'), 0,
  'no refused capture stored a receipt');

-- ------------------------------------------------------------------- (d) fill: no-ops

update public.mutation_sequences set sequence = 0 where owner_id = '11111111-1111-4111-8111-111111111111';

select is(public.fill_receipt_time(pg_temp.rid('1'), 'dddddddd-0000-4000-8000-000000000671')->>'reason',
  'candidates ambiguous', 'both candidates fit and neither is within two minutes: no fill');
select is(public.fill_receipt_time(pg_temp.rid('3'), 'dddddddd-0000-4000-8000-000000000677')->>'reason',
  'candidates ambiguous', 'both candidates fit and both are within two minutes: no fill');
select is(public.fill_receipt_time(pg_temp.rid('3'), 'dddddddd-0000-4000-8000-000000000678')->>'reason',
  'no candidate fits', 'neither candidate is within the window: no fill');
select is(public.fill_receipt_time(pg_temp.rid('5'), 'dddddddd-0000-4000-8000-000000000671')->>'reason',
  'time already set', 'a receipt with a time is left alone');
select is(public.fill_receipt_time(pg_temp.rid('6'), 'dddddddd-0000-4000-8000-000000000671')->>'reason',
  'no time candidates', 'a receipt without recorded candidates is left alone');
select is(public.fill_receipt_time(pg_temp.rid('2'), 'dddddddd-0000-4000-8000-000000000674')->>'reason',
  'amount mismatch', 'a row of a different amount does not fill');
select is(public.fill_receipt_time(pg_temp.rid('2'), 'dddddddd-0000-4000-8000-000000000675')->>'reason',
  'transaction not owned', 'another owner''s row does not fill');
select is(public.fill_receipt_time(pg_temp.rid('2'), 'dddddddd-0000-4000-8000-000000000676')->>'reason',
  'transaction has no time', 'a row with no time does not fill');
select is(public.fill_receipt_time(pg_temp.rid('4'), 'dddddddd-0000-4000-8000-000000000679')->>'reason',
  'not a TRUE MONEY row or stored match', 'a row that neither names TRUE MONEY nor is the stored match does not fill');
select is(
  (select count(*)::integer from public.receipts where store_code = '0067' and receipt_number in ('1','2','3','4','6') and purchased_at_time is not null)
  + (select count(*)::integer from public.audit_events where event_type = 'receipt.time_filled')
  + (select sequence::integer from public.mutation_sequences where owner_id = '11111111-1111-4111-8111-111111111111'),
  0, 'no no-op wrote a time, an audit event or a sequence bump');

-- ------------------------------------------------------------------- (e) fill: fills

select is(public.fill_receipt_time(pg_temp.rid('2'), 'dddddddd-0000-4000-8000-000000000673'),
  '{"filled":true,"reason":"filled","time":"13:00"}'::jsonb, 'the one candidate in the window fills');
select is((select purchased_at_time from public.receipts where id = pg_temp.rid('2')), '13:00'::time,
  'the stored time is the fitting candidate');
select is(
  (select detail from public.audit_events where entity_id = pg_temp.rid('2') and event_type = 'receipt.time_filled'),
  jsonb_build_object('transaction_id', 'dddddddd-0000-4000-8000-000000000673', 'time', '13:00',
    'lag_minutes', 5, 'time_candidates', '["09:00","13:00"]'::jsonb),
  'the fill is audited with the row, the chosen time, its lag and the candidates');
select is((select sequence::integer from public.mutation_sequences where owner_id = '11111111-1111-4111-8111-111111111111'),
  1, 'the fill bumps the mutation sequence');

select is(public.fill_receipt_time(pg_temp.rid('1'), 'dddddddd-0000-4000-8000-000000000672')->>'time',
  '10:30', 'both fit and exactly one is within two minutes: that one fills');

-- The stored match admits a row that does not name TRUE MONEY.
select public.set_receipt_match(pg_temp.rid('4'), 0, 'matched', 'dddddddd-0000-4000-8000-000000000679');
select is(public.fill_receipt_time(pg_temp.rid('4'), 'dddddddd-0000-4000-8000-000000000679')->>'time',
  '07:00', 'the owner''s stored match fills even when the row does not name TRUE MONEY');

-- ------------------------------------------------------------------- (f) replay

select is(public.fill_receipt_time(pg_temp.rid('2'), 'dddddddd-0000-4000-8000-000000000673'),
  '{"filled":false,"reason":"time already set"}'::jsonb, 'a replayed fill is a no-op');
select is(
  (select count(*)::integer from public.audit_events where entity_id = pg_temp.rid('2') and event_type = 'receipt.time_filled'),
  1, 'the replay wrote no second audit event');
select is((select sequence::integer from public.mutation_sequences where owner_id = '11111111-1111-4111-8111-111111111111'),
  4, 'the replay did not bump the sequence (three fills and one match only)');

-- ------------------------------------------------------------------- (g) access

select throws_ok(
  $$select public.fill_receipt_time('ffffffff-0000-4000-8000-0000000006ff', 'dddddddd-0000-4000-8000-000000000673')$$,
  'receipt not owned', 'an unknown receipt is refused');

select set_config('test.receipt3', pg_temp.rid('3')::text, true);
set local role authenticated;
select is(public.fill_receipt_time(current_setting('test.receipt3')::uuid,'dddddddd-0000-4000-8000-000000000678')->>'reason',
  'no candidate fits', 'the authenticated role reaches the function through its grant');
reset role;

select set_config('request.jwt.claims',
  '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated","aal":"aal2"}', true);
select throws_ok(
  $$select public.fill_receipt_time(pg_temp.rid('3'), 'dddddddd-0000-4000-8000-000000000677')$$,
  'strong owner access required', 'a caller without strong owner access is refused');

select * from finish();
rollback;
