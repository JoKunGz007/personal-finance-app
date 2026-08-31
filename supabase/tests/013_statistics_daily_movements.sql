begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

-- `dailyMovements` (migration 025, PLAN task 47's calendar heatmap). Same fixture as 011 and 012,
-- unchanged, because the point here is that this field describes the identical ledger those two
-- suites already characterise.
--
-- **What this suite exists to prove**: the array is grouped by day rather than by transaction, it
-- honours `include_in_reporting` the same way every other total on this page does, it narrows with
-- the account filter, and — the property the owner chose by hand — a day whose only movement was
-- excluded is **absent from the array**, not present at zero.

set local session_replication_role = replica;
delete from public.notification_card_decision_overlays;
delete from public.notification_card_correction_overlays;
delete from public.notification_cards;
delete from public.slip_correction_revisions;
delete from public.slip_correction_overlays;
delete from public.slip_match_revisions;
delete from public.slip_match_overlays;
delete from public.slips;
delete from public.overlay_revisions;
delete from public.transaction_overlays;
delete from public.source_components;
delete from public.source_transactions;
delete from public.audit_events;
delete from public.accounts;
delete from auth.mfa_factors where user_id = '11111111-1111-4111-8111-111111111111';

insert into public.accounts(id, owner_id, bank_code, label, account_type, last_four, currency, timezone)
values
  ('cccccccc-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111',
   'KTB', 'Invented A', 'savings', '4242', 'THB', 'Asia/Bangkok'),
  ('cccccccc-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111',
   'KTB', 'Invented B', 'savings', '1357', 'THB', 'Asia/Bangkok');

--   date        time   acct  movement   printed   combined
--   2026-03-05  09:00  A      +100000    100000    100000
--   2026-03-05  14:00  A           +1    100001    100001   <- same day, later: one movement row
--   2026-03-20  10:00  A       -30000     70001     70001
--   2026-04-10  10:00  B       +50058     50058    120059
--   2026-04-15  10:00  B        -7000     43058    113059   <- excluded from reporting
insert into public.source_transactions(id, owner_id, account_id, fingerprint_version, fingerprint,
  source_date, source_time, effective_date, transaction_label, description, post_balance_minor, currency)
values
  ('dddddddd-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'cccccccc-0000-4000-8000-000000000001',
   'fingerprint-v1', repeat('a', 64), '2026-03-05', '09:00', '2026-03-05', 'Invented one', 'Invented one', 100000, 'THB'),
  ('dddddddd-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'cccccccc-0000-4000-8000-000000000001',
   'fingerprint-v1', repeat('b', 64), '2026-03-05', '14:00', '2026-03-05', 'Invented two', 'Invented two', 100001, 'THB'),
  ('dddddddd-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 'cccccccc-0000-4000-8000-000000000001',
   'fingerprint-v1', repeat('c', 64), '2026-03-20', '10:00', '2026-03-20', 'Invented three', 'Invented three', 70001, 'THB'),
  ('dddddddd-0000-4000-8000-000000000004', '11111111-1111-4111-8111-111111111111', 'cccccccc-0000-4000-8000-000000000002',
   'fingerprint-v1', repeat('d', 64), '2026-04-10', '10:00', '2026-04-10', 'Invented four', 'Invented four', 50058, 'THB'),
  ('dddddddd-0000-4000-8000-000000000005', '11111111-1111-4111-8111-111111111111', 'cccccccc-0000-4000-8000-000000000002',
   'fingerprint-v1', repeat('e', 64), '2026-04-15', '10:00', '2026-04-15', 'Invented five', 'Invented five', 43058, 'THB');

insert into public.source_components(id, owner_id, transaction_id, position, kind, amount_minor, currency)
values
  ('eeeeeeee-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'dddddddd-0000-4000-8000-000000000001', 1, 'deposit', 100000, 'THB'),
  ('eeeeeeee-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'dddddddd-0000-4000-8000-000000000002', 1, 'deposit', 1, 'THB'),
  ('eeeeeeee-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 'dddddddd-0000-4000-8000-000000000003', 1, 'withdrawal', -30000, 'THB'),
  ('eeeeeeee-0000-4000-8000-000000000004', '11111111-1111-4111-8111-111111111111', 'dddddddd-0000-4000-8000-000000000004', 1, 'deposit', 50058, 'THB'),
  ('eeeeeeee-0000-4000-8000-000000000005', '11111111-1111-4111-8111-111111111111', 'dddddddd-0000-4000-8000-000000000005', 1, 'withdrawal', -7000, 'THB');

insert into public.transaction_overlays(transaction_id, owner_id, include_in_reporting, revision)
values ('dddddddd-0000-4000-8000-000000000005', '11111111-1111-4111-8111-111111111111', false, 0);
set local session_replication_role = origin;

insert into auth.mfa_factors(id, user_id, friendly_name, factor_type, status, secret, created_at, updated_at)
values ('aaaaaaaa-0000-4000-8000-000000000094', '11111111-1111-4111-8111-111111111111',
        'daily movements TOTP', 'totp', 'verified', 'SYNTHETICACCT', '2026-07-24T00:00:00Z', '2026-07-24T00:00:00Z');

select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal2"}',
  true
);

-- ------------------------------------------------------------------- grouped by day, all accounts

select is(
  jsonb_array_length(public.ledger_statistics('2026-03-01', '2026-04-30')->'dailyMovements'),
  3,
  'three days carry a reportable movement — the fourth, 2026-04-15, carried only the excluded one'
);
select is(
  public.ledger_statistics('2026-03-01', '2026-04-30')->'dailyMovements'->0->>'date',
  '2026-03-05',
  'the array is ordered by date, earliest first'
);
select is(
  public.ledger_statistics('2026-03-01', '2026-04-30')->'dailyMovements'->0->>'deposits',
  '100001',
  'two same-day deposits are summed into one entry, not carried as two'
);
select is(
  public.ledger_statistics('2026-03-01', '2026-04-30')->'dailyMovements'->0->>'transactions',
  '2',
  'and that entry counts both transactions, unlike dailyBalances which keeps only the day''s close'
);
select is(
  public.ledger_statistics('2026-03-01', '2026-04-30')->'dailyMovements'->1->>'withdrawals',
  '-30000',
  '2026-03-20 carries account A''s withdrawal'
);

-- ------------------------------------------------------------------- the excluded day is absent

select is(
  public.ledger_statistics('2026-03-01', '2026-04-30')
    -> 'dailyMovements' -> jsonb_array_length(public.ledger_statistics('2026-03-01', '2026-04-30')->'dailyMovements') - 1
    ->> 'date',
  '2026-04-10',
  'the last entry is 2026-04-10 — 2026-04-15 never appears, excluded rather than zero-valued'
);
select is(
  (select count(*) from jsonb_array_elements(public.ledger_statistics('2026-03-01', '2026-04-30')->'dailyMovements') e
    where e->>'date' = '2026-04-15'),
  0::bigint,
  'confirmed directly: no entry names the excluded day at all'
);
select is(
  jsonb_array_length(public.ledger_statistics('2026-03-01', '2026-04-30')->'dailyBalances'),
  4,
  'contrast: dailyBalances still carries all four days, because the flag does not un-move the money'
);

-- ------------------------------------------------------------------- the account filter narrows

select is(
  jsonb_array_length(public.ledger_statistics('2026-03-01', '2026-04-30', 10,
    'cccccccc-0000-4000-8000-000000000001')->'dailyMovements'),
  2,
  'account A holds two of the three reportable days'
);
select is(
  jsonb_array_length(public.ledger_statistics('2026-03-01', '2026-04-30', 10,
    'cccccccc-0000-4000-8000-000000000002')->'dailyMovements'),
  1,
  'account B holds the one day its own reportable movement fell on'
);
select is(
  public.ledger_statistics('2026-03-01', '2026-04-30', 10,
    'cccccccc-0000-4000-8000-000000000002')->'dailyMovements'->0->>'date',
  '2026-04-10',
  'and it is the deposit day, not the excluded withdrawal day'
);

-- ------------------------------------------------------------------- the empty ledger

select is(
  public.ledger_statistics('2027-01-01', '2027-01-31')->'dailyMovements',
  '[]'::jsonb,
  'a window with no rows at all returns the same empty array the other list fields do'
);

select * from finish();
rollback;
