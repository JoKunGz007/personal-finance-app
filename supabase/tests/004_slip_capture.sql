begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

-- Slip capture (migration 011, D-050, PLAN task 20).
--
-- The contract these tests hold: a slip is provisional, identified by its QR, append-only
-- once captured, and invisible to `authenticated` except through `capture_slip`. Every
-- refusal below is a fail-closed path, so each is asserted by its message rather than by
-- "something went wrong" — a check that passes because a *different* error fired is the
-- failure mode this file exists to prevent.

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
  ('aaaaaaaa-0000-4000-8000-000000000021', '11111111-1111-4111-8111-111111111111',
   'slip contract TOTP one', 'totp', 'verified', 'SYNTHETICSLIPONE', '2026-07-24T00:00:00Z', '2026-07-24T00:00:00Z'),
  ('aaaaaaaa-0000-4000-8000-000000000022', '11111111-1111-4111-8111-111111111111',
   'slip contract TOTP two', 'totp', 'verified', 'SYNTHETICSLIPTWO', '2026-07-24T00:00:00Z', '2026-07-24T00:00:00Z');

select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal2"}',
  true
);

-- Least privilege: the table is readable, and writable only through the function.
select ok(
  has_table_privilege('authenticated', 'public.slips', 'select'),
  'authenticated may read its own slips'
);
select ok(
  not has_table_privilege('authenticated', 'public.slips', 'insert')
    and not has_table_privilege('authenticated', 'public.slips', 'update')
    and not has_table_privilege('authenticated', 'public.slips', 'delete'),
  'authenticated holds no direct write on slips'
);
select ok(
  (select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.slips'::regclass),
  'slips has row level security enabled and forced'
);

-- All fixture references below are invented. Their lengths match the real layouts
-- (KBANK 20, Krungthai 17 and 21, SCB 25 — D-053) because length is structure; the
-- characters are not, and no real slip reference exists anywhere in this repo.
select is(
  public.capture_slip(jsonb_build_object(
    'bankCode', 'SCB', 'bankQrCode', '014',
    'slipReference', '202601010000000000000001x',
    'qrPayload', '0046000600000101030140225202601010000000000000001x5102TH9104ABCD',
    'kind', 'withdrawal', 'amountMinor', '-12500', 'currency', 'THB',
    'occurredOn', '2026-07-20', 'occurredAtTime', '13:45',
    'counterparty', 'Synthetic payee', 'note', 'invented fixture'
  ))->>'captured',
  'true',
  'a new slip reports itself as captured'
);
select is((select count(*)::text from public.slips), '1', 'the slip is stored');
select is(
  (select amount_minor::text from public.slips),
  '-12500',
  'the amount is stored in minor units'
);
select is(
  (select sequence::text from public.mutation_sequences where owner_id = '11111111-1111-4111-8111-111111111111'),
  '1',
  'capturing a slip bumps the mutation sequence, staling the last backup'
);
select is(
  (select count(*)::text from public.audit_events where event_type = 'slip.capture'),
  '1',
  'capturing a slip writes one audit event'
);
-- The audit detail carries structure, not values: no amount, counterparty or reference.
select ok(
  (select not (detail ? 'amount_minor') and not (detail ? 'counterparty') and not (detail ? 'slip_reference')
     from public.audit_events where event_type = 'slip.capture'),
  'the audit event records no amount, counterparty or reference'
);

-- Idempotency on the QR identity. Share-to-app makes double capture the expected accident,
-- not an unlikely one, so the second share must be a no-op rather than a duplicate or an
-- error the owner has to interpret.
select is(
  public.capture_slip(jsonb_build_object(
    'bankCode', 'SCB', 'bankQrCode', '014',
    'slipReference', '202601010000000000000001x',
    'qrPayload', '0046000600000101030140225202601010000000000000001x5102TH9104ABCD',
    'kind', 'withdrawal', 'amountMinor', '-99900', 'currency', 'THB',
    'occurredOn', '2026-07-20'
  ))->>'captured',
  'false',
  're-sharing the same slip reports that nothing was captured'
);
select is((select count(*)::text from public.slips), '1', 're-sharing the same slip stores no second row');
select is(
  (select amount_minor::text from public.slips),
  '-12500',
  're-sharing with a different amount does not overwrite the confirmed one'
);
select is(
  (select sequence::text from public.mutation_sequences where owner_id = '11111111-1111-4111-8111-111111111111'),
  '1',
  'a no-op re-share does not stale the backup'
);

-- The same reference at a different bank is a different slip: the dedup key is the pair.
select is(
  public.capture_slip(jsonb_build_object(
    'bankCode', 'KTB', 'bankQrCode', '006',
    'slipReference', '202601010000000000000001x',
    'qrPayload', '0038000600000101030060225202601010000000000000001x5102TH9104ABCD',
    'kind', 'deposit', 'amountMinor', '5000', 'currency', 'THB',
    'occurredOn', '2026-07-21'
  ))->>'captured',
  'true',
  'the same reference at another bank is a distinct slip'
);

-- The Buddhist-era guard D-050 asked for. A Thai slip prints 2569 for 2026; typed through
-- unconverted it lands 543 years ahead, and D-031 established that the 543-year shift must
-- fail closed rather than be silently reinterpreted.
select throws_ok(
  $$select public.capture_slip(jsonb_build_object(
      'bankCode','SCB','bankQrCode','014','slipReference','buddhistera0000000000001',
      'qrPayload','x','kind','withdrawal','amountMinor','-100','currency','THB',
      'occurredOn','2569-07-20'))$$,
  'slip date is outside the plausible window',
  'a Buddhist-era year typed through unconverted is refused'
);
select throws_ok(
  $$select public.capture_slip(jsonb_build_object(
      'bankCode','SCB','bankQrCode','014','slipReference','ancient00000000000000001',
      'qrPayload','x','kind','withdrawal','amountMinor','-100','currency','THB',
      'occurredOn','2001-07-20'))$$,
  'slip date is outside the plausible window',
  'a date older than the plausible window is refused'
);

-- Money contracts, identical to the ones every authoritative row already obeys.
select throws_ok(
  $$select public.capture_slip(jsonb_build_object(
      'bankCode','SCB','bankQrCode','014','slipReference','noncanonical000000000001',
      'qrPayload','x','kind','withdrawal','amountMinor','-01','currency','THB',
      'occurredOn','2026-07-20'))$$,
  'slip amount must be canonical int64 text',
  'a non-canonical amount is refused before any cast'
);
select throws_ok(
  $$select public.capture_slip(jsonb_build_object(
      'bankCode','SCB','bankQrCode','014','slipReference','overflow00000000000000001',
      'qrPayload','x','kind','withdrawal','amountMinor','9223372036854775808','currency','THB',
      'occurredOn','2026-07-20'))$$,
  'slip amount must be canonical int64 text',
  'an amount beyond int64 is refused rather than overflowing'
);
select throws_ok(
  $$select public.capture_slip(jsonb_build_object(
      'bankCode','SCB','bankQrCode','014','slipReference','signmismatch00000000001',
      'qrPayload','x','kind','withdrawal','amountMinor','100','currency','THB',
      'occurredOn','2026-07-20'))$$,
  'invalid slip',
  'a withdrawal with a positive amount is refused'
);
select throws_ok(
  $$select public.capture_slip(jsonb_build_object(
      'bankCode','SCB','bankQrCode','014','slipReference','wrongcurrency000000001',
      'qrPayload','x','kind','withdrawal','amountMinor','-100','currency','USD',
      'occurredOn','2026-07-20'))$$,
  'invalid slip',
  'a non-THB slip is refused'
);
select throws_ok(
  $$select public.capture_slip(jsonb_build_object(
      'bankCode','HSBC','bankQrCode','004','slipReference','unknownbank000000000001',
      'qrPayload','x','kind','withdrawal','amountMinor','-100','currency','THB',
      'occurredOn','2026-07-20'))$$,
  'invalid slip',
  'a bank this ledger holds no account for is refused'
);
select throws_ok(
  $$select public.capture_slip(jsonb_build_object(
      'bankCode','SCB','bankQrCode','014','slipReference','not a reference!',
      'qrPayload','x','kind','withdrawal','amountMinor','-100','currency','THB',
      'occurredOn','2026-07-20'))$$,
  'invalid slip',
  'a reference outside the alphanumeric charset is refused'
);

-- Append-only, like every other ledger-fact table. Correcting a captured slip is
-- deliberately not offered yet; the confirm form is the review step (migration 011).
select throws_ok(
  $$update public.slips set amount_minor = -1 where slip_reference = '202601010000000000000001x'$$,
  'slips is append-only: UPDATE is forbidden',
  'a captured slip cannot be updated'
);
select throws_ok(
  $$delete from public.slips where slip_reference = '202601010000000000000001x'$$,
  'slips is append-only: DELETE is forbidden',
  'a captured slip cannot be deleted'
);

select * from finish();
rollback;
