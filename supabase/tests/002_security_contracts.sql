begin;
create extension if not exists pgtap with schema extensions;
select plan(50);

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

-- Strong access requires the bound owner, aal2, and a verified TOTP factor (D-093,
-- migration 015; two until 2026-08-11). The cases below build up one condition at a time so
-- a failure names which one broke, and the three refusals — wrong owner, aal1, and no
-- verified TOTP factor — are the contract. The count is the part that changed; nothing else
-- here did.
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
-- The bar itself. Everything above this line is still refused; this is the first state that
-- is accepted, and it is exactly one verified TOTP factor on a bound owner at aal2.
select ok(
  private.has_strong_owner_access('11111111-1111-4111-8111-111111111111'),
  'one verified TOTP factor grants strong owner access'
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
-- And a second factor neither adds nor removes anything, which is the property that made
-- requiring two pointless: the gate counts factors, so more of them changes no outcome.
select ok(
  private.has_strong_owner_access('11111111-1111-4111-8111-111111111111'),
  'a second verified TOTP factor is still accepted and changes nothing'
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
  '7',
  'snapshot export succeeds with schema version 7'
);
-- Each new table has to be *in* the export, not merely permitted by it. A version bump that
-- forgot to emit the new key would still read as the right version here and would silently
-- back up a ledger without its slips, or without the owner's match decisions.
select ok(
  (select value#>'{data,slips}' is not null from snapshot_result)
    and (select value#>'{tableCounts,slips}' is not null from snapshot_result),
  'snapshot export carries the slips table and its count'
);
select ok(
  (select value#>'{data,slip_match_overlays}' is not null from snapshot_result)
    and (select value#>'{tableCounts,slip_match_overlays}' is not null from snapshot_result)
    and (select value#>'{data,slip_match_revisions}' is not null from snapshot_result)
    and (select value#>'{tableCounts,slip_match_revisions}' is not null from snapshot_result),
  'snapshot export carries both slip-match tables and their counts'
);
-- Cash is the one figure with no statement behind it, so a backup that quietly omitted it
-- would lose the only record of those payments. Both correction overlays are here for the
-- same reason: the correction *is* the evidence of what the number should have been.
select ok(
  (select value#>'{data,cash_entries}' is not null from snapshot_result)
    and (select value#>'{tableCounts,cash_entries}' is not null from snapshot_result)
    and (select value#>'{data,cash_entry_overlays}' is not null from snapshot_result)
    and (select value#>'{tableCounts,cash_entry_overlays}' is not null from snapshot_result)
    and (select value#>'{data,cash_entry_revisions}' is not null from snapshot_result)
    and (select value#>'{tableCounts,cash_entry_revisions}' is not null from snapshot_result)
    and (select value#>'{data,slip_correction_overlays}' is not null from snapshot_result)
    and (select value#>'{tableCounts,slip_correction_overlays}' is not null from snapshot_result)
    and (select value#>'{data,slip_correction_revisions}' is not null from snapshot_result)
    and (select value#>'{tableCounts,slip_correction_revisions}' is not null from snapshot_result),
  'snapshot export carries the cash and correction tables and their counts'
);
-- A card is the only record of a payment that produced no e-slip, so a backup that omitted it
-- would lose those payments outright — and both its money columns have to survive, since the
-- printed balance is what tells a card apart from another of the same amount and minute.
select ok(
  (select value#>'{data,notification_cards}' is not null from snapshot_result)
    and (select value#>'{tableCounts,notification_cards}' is not null from snapshot_result),
  'snapshot export carries the notification card table and its count'
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

-- Migration 009: the three supported layouts, and the pairing between a contract
-- version and the bank whose account it may be confirmed into.
--
-- Red proof against the pre-009 schema: the SCB import below fails with
-- 'invalid import contract', because confirm_import compared p_contract_version to the
-- literal 'krungthai-layout-v1'. Widening only that comparison is not enough either —
-- with the CHECK constraints relaxed but the fingerprint's bank code left as the literal
-- 'KTB', the same import fails with 'fingerprint mismatch', which is why the bank code
-- now comes from the bound account.

select is(
  array[
    private.contract_bank_code('krungthai-layout-v1'),
    private.contract_bank_code('scb-layout-v1'),
    private.contract_bank_code('kbank-layout-v1'),
    private.contract_bank_code('receipt-layout-v1')
  ],
  array['KTB', 'SCB', 'KBANK', null],
  'a contract version maps to exactly one bank, and an unknown one maps to nothing'
);

select ok(
  (select count(*) from public.accounts
    where owner_id = '11111111-1111-4111-8111-111111111111'
      and bank_code in ('KTB', 'SCB', 'KBANK') and last_four = '4242') = 3,
  'one owner may hold an account at each supported bank sharing a last four'
);

select throws_ok(
  $$insert into public.accounts(owner_id, bank_code, label, account_type, last_four, currency, timezone)
    values ('11111111-1111-4111-8111-111111111111', 'HSBC', 'Unsupported', 'savings', '1111', 'THB', 'Asia/Bangkok')$$,
  '23514',
  null,
  'a bank with no reader is still refused'
);

-- Mirrors pg_temp.confirm, parameterised by account, bank and contract version. The
-- fingerprint is derived with the *statement's* bank code, exactly as lib/canonical.ts
-- does on the client, so a server that hard-coded a different one would fail here.
create function pg_temp.confirm_as(
  p_account uuid, p_bank text, p_contract text, p_artifact text, p_idempotency uuid,
  p_period_start date, p_period_end date, p_opening text, p_closing text, p_rows jsonb
) returns uuid language plpgsql as $fn$
declare v_digest text;
begin
  select coalesce(jsonb_agg(
           r.value || jsonb_build_object('fingerprint', private.row_fingerprint(p_account, p_bank, r.value))
           order by r.ordinality), '[]'::jsonb)
    into p_rows
    from jsonb_array_elements(p_rows) with ordinality r(value, ordinality);
  v_digest := private.sha256_jsonb(jsonb_build_object(
    'accountId', p_account::text, 'contractVersion', p_contract, 'currency', 'THB',
    'periodStart', to_char(p_period_start, 'YYYY-MM-DD'),
    'periodEnd', to_char(p_period_end, 'YYYY-MM-DD'),
    'openingBalance', p_opening, 'closingBalance', p_closing, 'rows', p_rows
  ));
  return public.confirm_import(
    p_account, p_artifact, v_digest, p_idempotency, p_contract,
    p_period_start, p_period_end, p_opening, p_closing, 'THB', p_rows
  );
end;
$fn$;

select lives_ok(
  $$select pg_temp.confirm_as(
    '11111111-2222-4333-8444-555555555556', 'SCB', 'scb-layout-v1',
    repeat('c',64), 'bbbbbbbb-0000-4000-8000-000000000011',
    '2026-01-01','2026-01-31','500000','400000',
    '[{"sourceIndex":"1","sourceDate":"2026-01-02","sourceTime":"09:15:00","effectiveDate":"2026-01-02","transactionLabel":"ENET","description":"Synthetic outbound transfer","reference":"E1","branch":"","fingerprint":"0000000000000000000000000000000000000000000000000000000000000000","postBalance":{"minor":"400000","currency":"THB"},"components":[{"kind":"withdrawal","amount":{"minor":"-100000","currency":"THB"}}],"provenance":{"page":"1","row":"1","parserFields":{"contractVersion":"scb-layout-v1"}}}]'::jsonb
  )$$,
  'an SCB statement confirms into the owner''s SCB account'
);

select is(
  (select contract_version from public.import_artifacts
    where owner_id = '11111111-1111-4111-8111-111111111111' and artifact_digest = repeat('c',64)),
  'scb-layout-v1',
  'the artifact records the contract version that read it'
);

-- A layout reads one bank, so confirming it into another bank's account is a mis-binding
-- and is named as one rather than surfacing as a fingerprint error.
select throws_ok(
  $$select pg_temp.confirm_as(
    '11111111-2222-4333-8444-555555555555', 'SCB', 'scb-layout-v1',
    repeat('d',64), 'bbbbbbbb-0000-4000-8000-000000000012',
    '2026-01-01','2026-01-31','500000','400000',
    '[{"sourceIndex":"1","sourceDate":"2026-01-02","sourceTime":"09:15:00","effectiveDate":"2026-01-02","transactionLabel":"ENET","description":"Synthetic outbound transfer","reference":"E1","branch":"","fingerprint":"0000000000000000000000000000000000000000000000000000000000000000","postBalance":{"minor":"400000","currency":"THB"},"components":[{"kind":"withdrawal","amount":{"minor":"-100000","currency":"THB"}}],"provenance":{"page":"1","row":"1"}}]'::jsonb
  )$$,
  'P0001',
  'contract version does not match account bank',
  'an SCB statement cannot be confirmed into a Krungthai account'
);

-- Account creation (migration 010). Until it existed, every account came from the seed,
-- so a real statement whose printed suffix matched nothing could not be imported at all.
create temporary table account_sequence_before as
  select sequence from public.mutation_sequences where owner_id = '11111111-1111-4111-8111-111111111111';

select lives_ok(
  $$select public.mutate_account('create', null, 'KTB', 'Synthetic second current', 'current', '9911')$$,
  'the owner creates an account'
);

select is(
  (select account_type from public.accounts
    where owner_id = '11111111-1111-4111-8111-111111111111' and bank_code = 'KTB' and last_four = '9911'),
  'current',
  'the created account is stored as given'
);

select is(
  (select count(*)::integer from public.audit_events
    where owner_id = '11111111-1111-4111-8111-111111111111' and event_type = 'account.create'),
  1,
  'creating an account writes exactly one audit event'
);

-- An account is one of the eleven tables a backup carries, so creating one must make the
-- last backup stale. The sequence bump is what says so.
select is(
  (select sequence from public.mutation_sequences where owner_id = '11111111-1111-4111-8111-111111111111'),
  (select sequence from account_sequence_before) + 1,
  'creating an account advances the mutation sequence'
);

select throws_ok(
  $$select public.mutate_account('create', null, 'KTB', 'Duplicate', 'current', '9911')$$,
  'P0001',
  'account already exists',
  'the same bank and last four cannot be created twice'
);

-- The unique key is (owner_id, bank_code, last_four) precisely so this is allowed: one
-- owner may hold accounts ending in the same digits at different banks (D-041).
select lives_ok(
  $$select public.mutate_account('create', null, 'SCB', 'Synthetic second savings', 'savings', '9911')$$,
  'the same last four at another bank is a different account'
);

-- The bank list lives in the table CHECK and nowhere else, so that adding a fourth bank
-- stays a one-line change. Migration 009 exists because a literal was restated in an RPC.
select throws_ok(
  $$select public.mutate_account('create', null, 'HSBC', 'Unsupported bank', 'savings', '9912')$$,
  'P0001',
  'invalid account',
  'an unsupported bank code is refused by the constraint, not by a restated list'
);

select lives_ok(
  $$select public.mutate_account('relabel',
      (select id from public.accounts where owner_id = '11111111-1111-4111-8111-111111111111'
        and bank_code = 'KTB' and last_four = '9911'),
      null, 'Renamed current', null, null)$$,
  'the owner relabels an account'
);

-- Identity is refused rather than ignored: a caller that sends bank_code believes it is
-- changing it, and every stored fingerprint was computed from the one it has.
select throws_ok(
  $$select public.mutate_account('relabel',
      (select id from public.accounts where owner_id = '11111111-1111-4111-8111-111111111111'
        and bank_code = 'KTB' and last_four = '9911'),
      'SCB', 'Rebanked', null, null)$$,
  'P0001',
  'account identity cannot be changed',
  'an account cannot be moved to another bank by relabelling it'
);

select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal1"}', true);
select throws_ok(
  $$select public.mutate_account('create', null, 'KTB', 'Weak session', 'current', '9913')$$,
  'P0001',
  'strong owner access required',
  -- Named for what it sets, which is aal1. It read "a single-factor session cannot create
  -- an account" until 2026-08-11 — a label describing a factor count while the fixture
  -- above it changes only the assurance level. The test was always about aal1.
  'an aal1 session cannot create an account'
);

select * from finish();
rollback;
