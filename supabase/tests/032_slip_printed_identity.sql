begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

-- Slip capture on the printed reference (migration 052, D-258).
--
-- A slip whose QR does not decode is stored with both QR columns null and its printed
-- reference as identity. An exact re-capture is a no-op as for a QR slip; a printed capture
-- matching a stored slip on bank, date, time and amount under another reference is refused.
-- QR captures are unchanged. Every reference and payload here is invented.

set local session_replication_role = replica;
delete from public.slips;
delete from public.audit_events;
delete from public.categories;
delete from public.accounts;
update public.mutation_sequences
set sequence = 0, last_exported_sequence = 0, updated_at = '2026-07-24T00:00:00Z'
where owner_id = '11111111-1111-4111-8111-111111111111';
delete from auth.mfa_factors where user_id = '11111111-1111-4111-8111-111111111111';
set local session_replication_role = origin;

insert into auth.mfa_factors(id, user_id, friendly_name, factor_type, status, secret, created_at, updated_at)
values
  ('aaaaaaaa-0000-4000-8000-000000000321', '11111111-1111-4111-8111-111111111111',
   'printed slip TOTP one', 'totp', 'verified', 'SYNTHETICPRINTONE', '2026-07-24T00:00:00Z', '2026-07-24T00:00:00Z'),
  ('aaaaaaaa-0000-4000-8000-000000000322', '11111111-1111-4111-8111-111111111111',
   'printed slip TOTP two', 'totp', 'verified', 'SYNTHETICPRINTTWO', '2026-07-24T00:00:00Z', '2026-07-24T00:00:00Z');

select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal2"}',
  true
);

-- A printed SCB capture.
select is(
  public.capture_slip(jsonb_build_object(
    'bankCode', 'SCB', 'bankQrCode', null, 'qrPayload', null,
    'slipReference', '20260720INVENTED0001',
    'kind', 'withdrawal', 'amountMinor', '-12500', 'currency', 'THB',
    'occurredOn', '2026-07-20', 'occurredAtTime', '13:45'
  ))->>'captured',
  'true',
  'a printed-identity slip is captured'
);
select ok(
  (select qr_payload is null and bank_qr_code is null from public.slips where slip_reference = '20260720INVENTED0001'),
  'a printed-identity slip is stored with both QR columns null'
);
select is(
  (select detail->>'identity' from public.audit_events where event_type = 'slip.capture' and entity_id =
     (select id from public.slips where slip_reference = '20260720INVENTED0001')),
  'printed',
  'the audit event names the printed identity'
);

-- Exact-reference re-capture is a no-op.
select is(
  public.capture_slip(jsonb_build_object(
    'bankCode', 'SCB', 'bankQrCode', null, 'qrPayload', null,
    'slipReference', '20260720INVENTED0001',
    'kind', 'withdrawal', 'amountMinor', '-12500', 'currency', 'THB',
    'occurredOn', '2026-07-20', 'occurredAtTime', '13:45'
  ))->>'captured',
  'false',
  're-capturing the same printed reference reports nothing captured'
);
select is((select count(*)::text from public.slips), '1', 'the re-capture stores no second row');

-- Same bank, date, time and amount under a different reference is refused.
select throws_ok(
  $$select public.capture_slip(jsonb_build_object(
    'bankCode', 'SCB', 'bankQrCode', null, 'qrPayload', null,
    'slipReference', '20260720INVENTED0002',
    'kind', 'withdrawal', 'amountMinor', '-12500', 'currency', 'THB',
    'occurredOn', '2026-07-20', 'occurredAtTime', '13:45'))$$,
  'P0001', 'slip may already be captured',
  'a printed slip matching a stored one on all but the reference is refused'
);

-- A QR slip that differs from the stored printed one (here by amount) is stored.
select is(
  public.capture_slip(jsonb_build_object(
    'bankCode', 'SCB', 'bankQrCode', '014',
    'slipReference', '202607200000000000000003x',
    'qrPayload', 'INVENTED-QR-PAYLOAD-0003',
    'kind', 'withdrawal', 'amountMinor', '-12600', 'currency', 'THB',
    'occurredOn', '2026-07-20', 'occurredAtTime', '13:45'
  ))->>'captured',
  'true',
  'a QR capture differing from the stored printed slip is stored'
);
select is(
  (select detail->>'identity' from public.audit_events where event_type = 'slip.capture' and entity_id =
     (select id from public.slips where slip_reference = '202607200000000000000003x')),
  'qr',
  'the audit event names the QR identity'
);

-- A printed capture matching a stored QR slip is refused too.
select is(
  public.capture_slip(jsonb_build_object(
    'bankCode', 'KTB', 'bankQrCode', '006',
    'slipReference', 'INVENTEDKTB000004',
    'qrPayload', 'INVENTED-QR-PAYLOAD-0004',
    'kind', 'deposit', 'amountMinor', '50000', 'currency', 'THB',
    'occurredOn', '2026-07-21', 'occurredAtTime', '09:10'
  ))->>'captured',
  'true',
  'a KTB QR slip is captured'
);
select throws_ok(
  $$select public.capture_slip(jsonb_build_object(
    'bankCode', 'KTB', 'bankQrCode', null, 'qrPayload', null,
    'slipReference', 'INVENTEDKTB000005',
    'kind', 'deposit', 'amountMinor', '50000', 'currency', 'THB',
    'occurredOn', '2026-07-21', 'occurredAtTime', '09:10'))$$,
  'P0001', 'slip may already be captured',
  'a printed slip matching a stored QR slip is refused'
);

-- A stored QR slip with no time of day matches a printed capture at any time.
select is(
  public.capture_slip(jsonb_build_object(
    'bankCode', 'KTB', 'bankQrCode', '006',
    'slipReference', 'INVENTEDKTBQR000011',
    'qrPayload', 'INVENTED-QR-PAYLOAD-0011',
    'kind', 'withdrawal', 'amountMinor', '-777', 'currency', 'THB',
    'occurredOn', '2026-07-23'
  ))->>'captured',
  'true',
  'a KTB QR slip with no time is captured'
);
select throws_ok(
  $$select public.capture_slip(jsonb_build_object(
    'bankCode', 'KTB', 'bankQrCode', null, 'qrPayload', null,
    'slipReference', 'INVENTEDKTB000012',
    'kind', 'withdrawal', 'amountMinor', '-777', 'currency', 'THB',
    'occurredOn', '2026-07-23', 'occurredAtTime', '16:20'))$$,
  'P0001', 'slip may already be captured',
  'a printed slip matching a stored slip with no time is refused'
);

-- A QR capture matching a stored PRINTED slip on bank, date, time and amount is refused.
select is(
  public.capture_slip(jsonb_build_object(
    'bankCode', 'KTB', 'bankQrCode', null, 'qrPayload', null,
    'slipReference', 'INVENTEDKTBPRINT21',
    'kind', 'withdrawal', 'amountMinor', '-4200', 'currency', 'THB',
    'occurredOn', '2026-07-24', 'occurredAtTime', '11:30'
  ))->>'captured',
  'true',
  'a KTB printed slip is captured'
);
select throws_ok(
  $$select public.capture_slip(jsonb_build_object(
    'bankCode', 'KTB', 'bankQrCode', '006',
    'slipReference', 'INVENTEDKTBQR000022',
    'qrPayload', 'INVENTED-QR-PAYLOAD-0022',
    'kind', 'withdrawal', 'amountMinor', '-4200', 'currency', 'THB',
    'occurredOn', '2026-07-24', 'occurredAtTime', '11:30'))$$,
  'P0001', 'slip may already be captured',
  'a QR capture matching a stored printed slip is refused'
);

-- Two QR slips alike on bank, date, time and amount are both stored.
select is(
  public.capture_slip(jsonb_build_object(
    'bankCode', 'KTB', 'bankQrCode', '006',
    'slipReference', 'INVENTEDKTBQR000031',
    'qrPayload', 'INVENTED-QR-PAYLOAD-0031',
    'kind', 'withdrawal', 'amountMinor', '-3100', 'currency', 'THB',
    'occurredOn', '2026-07-25', 'occurredAtTime', '08:15'
  ))->>'captured',
  'true',
  'a first QR slip is captured'
);
select is(
  public.capture_slip(jsonb_build_object(
    'bankCode', 'KTB', 'bankQrCode', '006',
    'slipReference', 'INVENTEDKTBQR000032',
    'qrPayload', 'INVENTED-QR-PAYLOAD-0032',
    'kind', 'withdrawal', 'amountMinor', '-3100', 'currency', 'THB',
    'occurredOn', '2026-07-25', 'occurredAtTime', '08:15'
  ))->>'captured',
  'true',
  'a second QR slip alike on bank, date, time and amount is still captured'
);

-- Printed-identity request shape.
select throws_ok(
  $$select public.capture_slip(jsonb_build_object(
    'bankCode', 'KBANK', 'bankQrCode', null, 'qrPayload', null,
    'slipReference', 'INVENTEDKBANK00006',
    'kind', 'withdrawal', 'amountMinor', '-100', 'currency', 'THB',
    'occurredOn', '2026-07-22', 'occurredAtTime', '10:00'))$$,
  'P0001', 'invalid slip', 'a printed KBANK slip is refused'
);
select throws_ok(
  $$select public.capture_slip(jsonb_build_object(
    'bankCode', 'KTB', 'bankQrCode', null, 'qrPayload', null,
    'slipReference', 'INVENTEDKTB000007',
    'kind', 'withdrawal', 'amountMinor', '-100', 'currency', 'THB',
    'occurredOn', '2026-07-22'))$$,
  'P0001', 'invalid slip', 'a printed slip without a time is refused'
);
select throws_ok(
  $$select public.capture_slip(jsonb_build_object(
    'bankCode', 'KTB', 'bankQrCode', '006', 'qrPayload', null,
    'slipReference', 'INVENTEDKTB000008',
    'kind', 'withdrawal', 'amountMinor', '-100', 'currency', 'THB',
    'occurredOn', '2026-07-22', 'occurredAtTime', '10:00'))$$,
  'P0001', 'invalid slip', 'a printed slip carrying a bank QR code is refused'
);
select throws_ok(
  $$select public.capture_slip(jsonb_build_object(
    'bankCode', 'KTB', 'bankQrCode', null, 'qrPayload', 'INVENTED-QR-PAYLOAD-0009',
    'slipReference', 'INVENTEDKTB000009',
    'kind', 'withdrawal', 'amountMinor', '-100', 'currency', 'THB',
    'occurredOn', '2026-07-22', 'occurredAtTime', '10:00'))$$,
  'P0001', 'invalid slip', 'a QR payload without a bank QR code is refused'
);

-- The pair CHECK holds on the table itself.
select throws_ok(
  $$insert into public.slips(owner_id, bank_code, bank_qr_code, slip_reference, qr_payload, kind, amount_minor, currency, occurred_on)
    values ('11111111-1111-4111-8111-111111111111', 'KTB', '006', 'INVENTEDKTB000010', null, 'withdrawal', -100, 'THB', '2026-07-22')$$,
  '23514', null, 'slips_qr_pair refuses a bank QR code without a payload'
);
select is((select count(*)::text from public.slips), '7', 'only the seven accepted slips are stored');

select * from finish();
rollback;
