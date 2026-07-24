begin;
create extension if not exists pgtap with schema extensions;
select plan(30);

-- Canonical signed-int64 text boundaries.
select ok(private.is_canonical_int64_text('-9223372036854775808'), 'signed int64 minimum is canonical');
select ok(private.is_canonical_int64_text('9223372036854775807'), 'signed int64 maximum is canonical');
select ok(not private.is_canonical_int64_text('-9223372036854775809'), 'value below signed int64 is rejected');
select ok(not private.is_canonical_int64_text('9223372036854775808'), 'value above signed int64 is rejected');
select ok(private.is_canonical_int64_text('0'), 'zero is canonical');
select ok(not private.is_canonical_int64_text('+1'), 'leading plus is rejected');
select ok(not private.is_canonical_int64_text('01'), 'leading zero is rejected');
select ok(not private.is_canonical_int64_text('-0'), 'negative zero is rejected');
select ok(not private.is_canonical_int64_text('-1', true), 'negative value is rejected for nonnegative text');
select ok(not private.is_canonical_int64_text(null), 'null is rejected');

-- Strong access requires the bound owner, aal2, and two verified TOTP factors.
select set_config(
  'request.jwt.claims',
  '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated","aal":"aal2"}',
  true
);
select ok(
  not private.has_strong_owner_access('11111111-1111-4111-8111-111111111111'),
  'non-owner is rejected even at aal2'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal1"}',
  true
);
select ok(
  not private.has_strong_owner_access('11111111-1111-4111-8111-111111111111'),
  'owner at aal1 is rejected'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal2"}',
  true
);
delete from auth.mfa_factors where user_id = '11111111-1111-4111-8111-111111111111';
select ok(
  not private.has_strong_owner_access('11111111-1111-4111-8111-111111111111'),
  'owner with zero factors is rejected'
);

insert into auth.mfa_factors(id, user_id, friendly_name, factor_type, status, secret, created_at, updated_at)
values
  ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'unverified synthetic TOTP', 'totp', 'unverified', 'SYNTHETICSECRETONE', '2026-01-01 00:00:00+00', '2026-01-01 00:00:00+00'),
  ('aaaaaaaa-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'verified synthetic phone', 'phone', 'verified', null, '2026-01-01 00:00:00+00', '2026-01-01 00:00:00+00');
select ok(
  not private.has_strong_owner_access('11111111-1111-4111-8111-111111111111'),
  'unverified and non-TOTP factors are excluded'
);

insert into auth.mfa_factors(id, user_id, friendly_name, factor_type, status, secret, created_at, updated_at)
values (
  'aaaaaaaa-0000-4000-8000-000000000003',
  '11111111-1111-4111-8111-111111111111',
  'verified synthetic TOTP one',
  'totp',
  'verified',
  'SYNTHETICSECRETTWO',
  '2026-01-01 00:00:00+00',
  '2026-01-01 00:00:00+00'
);
select ok(
  not private.has_strong_owner_access('11111111-1111-4111-8111-111111111111'),
  'one verified TOTP factor is rejected'
);

insert into auth.mfa_factors(id, user_id, friendly_name, factor_type, status, secret, created_at, updated_at)
values (
  'aaaaaaaa-0000-4000-8000-000000000004',
  '11111111-1111-4111-8111-111111111111',
  'verified synthetic TOTP two',
  'totp',
  'verified',
  'SYNTHETICSECRETTHREE',
  '2026-01-01 00:00:00+00',
  '2026-01-01 00:00:00+00'
);
select ok(
  private.has_strong_owner_access('11111111-1111-4111-8111-111111111111'),
  'two verified TOTP factors grant strong owner access'
);

create temporary table contract_results(name text primary key, value uuid);

-- Wrapper that computes the canonical payload digest exactly as confirm_import
-- recomputes it (frame + rows), so the contract tests exercise real digest binding
-- rather than passing a trusted claim. Mirrors migration 202607240005 and the
-- client in app/api/v1/imports/confirm/route.ts.
--
-- p_bind_fingerprints (default true) replaces each row's fingerprint with the value
-- private.row_fingerprint derives from that row, mirroring what a correct client
-- sends (migration 202607240008). Pass false to send the row's literal fingerprint
-- when a test needs to exercise a wrong or deliberately colliding claim.
create function pg_temp.confirm(
  p_artifact text, p_idempotency uuid, p_period_start date, p_period_end date,
  p_opening text, p_closing text, p_rows jsonb, p_bind_fingerprints boolean default true
) returns uuid language plpgsql as $fn$
declare v_digest text;
begin
  if p_bind_fingerprints then
    select coalesce(jsonb_agg(
             r.value || jsonb_build_object(
               'fingerprint',
               private.row_fingerprint('11111111-2222-4333-8444-555555555555', 'KTB', r.value)
             ) order by r.ordinality), '[]'::jsonb)
      into p_rows
      from jsonb_array_elements(p_rows) with ordinality r(value, ordinality);
  end if;
  v_digest := private.sha256_jsonb(jsonb_build_object(
    'accountId', '11111111-2222-4333-8444-555555555555',
    'contractVersion', 'krungthai-layout-v1',
    'currency', 'THB',
    'periodStart', to_char(p_period_start, 'YYYY-MM-DD'),
    'periodEnd', to_char(p_period_end, 'YYYY-MM-DD'),
    'openingBalance', p_opening,
    'closingBalance', p_closing,
    'rows', p_rows
  ));
  return public.confirm_import(
    '11111111-2222-4333-8444-555555555555', p_artifact, v_digest, p_idempotency,
    'krungthai-layout-v1', p_period_start, p_period_end, p_opening, p_closing, 'THB', p_rows
  );
end;
$fn$;

select lives_ok(
  $test$
    insert into contract_results(name, value)
    select 'first', pg_temp.confirm(
      repeat('1', 64), 'bbbbbbbb-0000-4000-8000-000000000001',
      '2026-01-01', '2026-01-31', '10000', '10100',
      '[{"sourceIndex":"1","sourceDate":"2026-01-02","sourceTime":"09:15:00","effectiveDate":"2026-01-02","transactionLabel":"Synthetic credit","description":"Synthetic contract row","reference":"SYNTHETIC-001","branch":"","fingerprint":"3333333333333333333333333333333333333333333333333333333333333333","postBalance":{"minor":"10100","currency":"THB"},"components":[{"kind":"deposit","amount":{"minor":"100","currency":"THB"}}],"provenance":{"page":"1","row":"1","parserFields":{"fixture":"contract"}}}]'::jsonb
    )
  $test$,
  'initial import succeeds'
);

select is(
  pg_temp.confirm(
    repeat('1',64), 'bbbbbbbb-0000-4000-8000-000000000001',
    '2026-01-01','2026-01-31','10000','10100',
    '[{"sourceIndex":"1","sourceDate":"2026-01-02","sourceTime":"09:15:00","effectiveDate":"2026-01-02","transactionLabel":"Synthetic credit","description":"Synthetic contract row","reference":"SYNTHETIC-001","branch":"","fingerprint":"3333333333333333333333333333333333333333333333333333333333333333","postBalance":{"minor":"10100","currency":"THB"},"components":[{"kind":"deposit","amount":{"minor":"100","currency":"THB"}}],"provenance":{"page":"1","row":"1","parserFields":{"fixture":"contract"}}}]'::jsonb
  ),
  (select value from contract_results where name='first'),
  'identical idempotency-key replay returns the original batch'
);

-- The server must recompute the digest and refuse a claim that does not match the
-- rows. A fresh artifact + fresh idempotency key with valid rows but a bogus claimed
-- digest must fail closed on the create path.
select throws_ok(
  $$select public.confirm_import(
    '11111111-2222-4333-8444-555555555555', repeat('a',64), repeat('0',64),
    'bbbbbbbb-0000-4000-8000-000000000009', 'krungthai-layout-v1',
    '2026-01-01','2026-01-31','10000','10100','THB',
    '[{"sourceIndex":"1","sourceDate":"2026-01-02","sourceTime":"09:15:00","effectiveDate":"2026-01-02","transactionLabel":"Synthetic credit","description":"Synthetic contract row","reference":"SYNTHETIC-001","branch":"","fingerprint":"3333333333333333333333333333333333333333333333333333333333333333","postBalance":{"minor":"10100","currency":"THB"},"components":[{"kind":"deposit","amount":{"minor":"100","currency":"THB"}}],"provenance":{"page":"1","row":"1","parserFields":{"fixture":"contract"}}}]'::jsonb
  )$$,
  'P0001',
  'payload digest mismatch',
  'a claimed digest that does not match the rows is rejected'
);

select throws_ok(
  $$select pg_temp.confirm(
    repeat('1',64), 'bbbbbbbb-0000-4000-8000-000000000001',
    '2026-01-01','2026-01-31','10000','10100',
    '[{"sourceIndex":"1","sourceDate":"2026-01-02","effectiveDate":"2026-01-02","transactionLabel":"Synthetic credit","description":"Synthetic contract row","fingerprint":"3333333333333333333333333333333333333333333333333333333333333333","postBalance":{"minor":"10100","currency":"THB"},"components":[{"kind":"deposit","amount":{"minor":"100","currency":"THB"}}],"provenance":{"page":"1","row":"1"}}]'::jsonb
  )$$,
  'P0001',
  'idempotency key reused with different payload',
  'same idempotency key with divergent payload conflicts'
);

-- Divergent rows under the same artifact but a new idempotency key must conflict:
-- with digest binding the recomputed digest no longer matches the stored batch, so
-- the caller can no longer bless different rows under a claimed identical digest.
select throws_ok(
  $$select pg_temp.confirm(
    repeat('1',64), 'bbbbbbbb-0000-4000-8000-000000000002',
    '2026-01-01','2026-01-31','10000','10100',
    '[{"sourceIndex":"1","sourceDate":"2026-01-02","effectiveDate":"2026-01-02","transactionLabel":"Synthetic credit","description":"Synthetic equivalent replay","fingerprint":"4444444444444444444444444444444444444444444444444444444444444444","postBalance":{"minor":"10100","currency":"THB"},"components":[{"kind":"deposit","amount":{"minor":"100","currency":"THB"}}],"provenance":{"page":"1","row":"1"}}]'::jsonb
  )$$,
  'P0001',
  'artifact reused with different payload',
  'divergent rows under the same artifact conflict instead of blessing a claimed digest'
);

select throws_ok(
  $$select pg_temp.confirm(
    repeat('6',64), 'bbbbbbbb-0000-4000-8000-000000000004',
    '2026-02-01','2026-02-28','0','20',
    '[{"sourceIndex":"1","sourceDate":"2026-02-01","effectiveDate":"2026-02-01","transactionLabel":"Synthetic","description":"Duplicate one","fingerprint":"6666666666666666666666666666666666666666666666666666666666666666","postBalance":{"minor":"10","currency":"THB"},"components":[{"kind":"deposit","amount":{"minor":"10","currency":"THB"}}],"provenance":{"page":"1","row":"1"}},{"sourceIndex":"2","sourceDate":"2026-02-02","effectiveDate":"2026-02-02","transactionLabel":"Synthetic","description":"Duplicate two","fingerprint":"6666666666666666666666666666666666666666666666666666666666666666","postBalance":{"minor":"20","currency":"THB"},"components":[{"kind":"deposit","amount":{"minor":"10","currency":"THB"}}],"provenance":{"page":"1","row":"2"}}]'::jsonb,
    false
  )$$,
  'P0001',
  'ambiguous duplicate fingerprints',
  'duplicate fingerprints within one import are rejected'
);

-- The fingerprint is the ledger deduplication key, so a claim that does not match
-- the row it identifies could silently drop a real transaction or force a spurious
-- dedup. confirm_import recomputes it (migration 202607240008); a well-formed but
-- wrong claim must fail closed. Sent with p_bind_fingerprints => false so the literal
-- reaches the server, on a fresh artifact and idempotency key so nothing earlier in
-- confirm_import can raise first.
select throws_ok(
  $$select pg_temp.confirm(
    repeat('9',64), 'bbbbbbbb-0000-4000-8000-000000000006',
    '2026-01-01','2026-01-31','10000','10100',
    '[{"sourceIndex":"1","sourceDate":"2026-01-02","sourceTime":"09:15:00","effectiveDate":"2026-01-02","transactionLabel":"Synthetic credit","description":"Synthetic contract row","reference":"SYNTHETIC-001","branch":"","fingerprint":"7777777777777777777777777777777777777777777777777777777777777777","postBalance":{"minor":"10100","currency":"THB"},"components":[{"kind":"deposit","amount":{"minor":"100","currency":"THB"}}],"provenance":{"page":"1","row":"1"}}]'::jsonb,
    false
  )$$,
  'P0001',
  'fingerprint mismatch',
  'a fingerprint that does not match its row is rejected'
);

-- Overlap means the same real transaction reappearing in a second statement, so this
-- row must carry identical fingerprint inputs to the first import (only provenance,
-- which is not fingerprinted, differs). Under fingerprint binding the collision is now
-- derived from the row content rather than asserted by a shared literal.
select lives_ok(
  $test$
    insert into contract_results(name, value)
    select 'overlap', pg_temp.confirm(
      repeat('8',64), 'bbbbbbbb-0000-4000-8000-000000000005',
      '2026-01-01','2026-01-31','10000','10100',
      '[{"sourceIndex":"1","sourceDate":"2026-01-02","sourceTime":"09:15:00","effectiveDate":"2026-01-02","transactionLabel":"Synthetic credit","description":"Synthetic contract row","reference":"SYNTHETIC-001","branch":"","fingerprint":"3333333333333333333333333333333333333333333333333333333333333333","postBalance":{"minor":"10100","currency":"THB"},"components":[{"kind":"deposit","amount":{"minor":"100","currency":"THB"}}],"provenance":{"page":"2","row":"1"}}]'::jsonb
    )
  $test$,
  'distinct artifact may overlap an existing transaction'
);
select ok(
  (select linked_existing from public.import_batch_rows where batch_id=(select value from contract_results where name='overlap')),
  'overlap row is marked linked_existing'
);

create temporary table snapshot_result as
select public.export_backup_snapshot() as value;
select is(
  (select value->>'schemaVersion' from snapshot_result),
  '2',
  'snapshot export succeeds with schema version 2'
);
select is(
  public.mark_backup_exported(
    repeat('a',64),
    (select value->>'snapshotSequence' from snapshot_result)
  ),
  (select value->>'snapshotSequence' from snapshot_result),
  'snapshot sequence can be acknowledged'
);
select is(
  (select last_exported_sequence::text from public.mutation_sequences where owner_id='11111111-1111-4111-8111-111111111111'),
  (select value->>'snapshotSequence' from snapshot_result),
  'successful acknowledgement records the exported sequence'
);
select lives_ok(
  $$select public.mutate_category('create', null, 'Synthetic post-snapshot category', false)$$,
  'post-snapshot mutation succeeds'
);
select throws_ok(
  $$select public.mark_backup_exported(
    repeat('b',64),
    (select value->>'snapshotSequence' from snapshot_result)
  )$$,
  'P0001',
  'snapshot sequence changed',
  'stale snapshot sequence is rejected after mutation'
);

select * from finish();
rollback;
