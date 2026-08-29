begin;
create extension if not exists pgtap with schema extensions;
select plan(31);

-- The account filter and the ledger date range (migration 024, PLAN task 46's second half).
--
-- **What this suite exists to prove is that narrowing does not invent a figure.** Three properties
-- carry that, and the rest is shape:
--
--   * **The partition reconciles.** Every account's totals summed give the all-accounts totals, on
--     rows and on both directions of money. A filter that produced plausible-looking numbers which
--     did not add up would be the worst available outcome, because nothing on the page would say so.
--   * **The balance series has two sources and they genuinely differ.** All accounts is the derived
--     combined position; one account is that account's own *printed* balance. The fixture is chosen
--     so those disagree — B's last day closes at 113059 combined and 43058 printed — because if they
--     agreed, every assertion here would pass against a single-source implementation.
--   * **The ledger's window fences the rows and never the balance.** A row shown inside a one-day
--     window still carries the combined balance computed over the whole ledger. Recomputing it from
--     the windowed rows would restart the running total at the window's edge and print a figure that
--     belongs to no account on any date.
--
-- Every value is invented, per docs/FIXTURE_POLICY.md. The fixture is 011's, unchanged, because the
-- point of these assertions is that they describe the same ledger 011 already characterises.

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
--   2026-03-05  14:00  A           +1    100001    100001   <- same day, later: the day's close
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
values ('aaaaaaaa-0000-4000-8000-000000000093', '11111111-1111-4111-8111-111111111111',
        'account filter TOTP', 'totp', 'verified', 'SYNTHETICACCT', '2026-07-24T00:00:00Z', '2026-07-24T00:00:00Z');

select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal2"}',
  true
);

-- ------------------------------------------------------------------- the filter narrows

select is(
  public.ledger_statistics('2026-03-01', '2026-04-30', 10, 'cccccccc-0000-4000-8000-000000000001')->'totals'->>'deposits',
  '100001',
  'account A sees only its own deposits'
);
select is(
  public.ledger_statistics('2026-03-01', '2026-04-30', 10, 'cccccccc-0000-4000-8000-000000000001')->'totals'->>'withdrawals',
  '-30000',
  'account A sees only its own withdrawals'
);
select is(
  public.ledger_statistics('2026-03-01', '2026-04-30', 10, 'cccccccc-0000-4000-8000-000000000002')->'totals'->>'deposits',
  '50058',
  'account B sees only its own deposits'
);
select is(
  public.ledger_statistics('2026-03-01', '2026-04-30', 10, 'cccccccc-0000-4000-8000-000000000002')->'totals'->>'withdrawals',
  '0',
  'account B''s only withdrawal is the flagged transfer, so the filter and the flag compose'
);
select is(
  public.ledger_statistics('2026-03-01', '2026-04-30', 10, 'cccccccc-0000-4000-8000-000000000002')->'totals'->>'transactions',
  '1',
  'and the row count narrows with the money rather than beside it'
);

-- ------------------------------------------------------------------- the partition reconciles
--
-- The assertion that would catch a filter producing plausible figures that do not add up. Written as
-- arithmetic on the returned strings rather than against hard-coded totals, so it keeps holding if
-- the fixture changes underneath it.

select is(
  (public.ledger_statistics('2026-03-01', '2026-04-30', 10, 'cccccccc-0000-4000-8000-000000000001')->'totals'->>'deposits')::bigint
    + (public.ledger_statistics('2026-03-01', '2026-04-30', 10, 'cccccccc-0000-4000-8000-000000000002')->'totals'->>'deposits')::bigint,
  (public.ledger_statistics('2026-03-01', '2026-04-30')->'totals'->>'deposits')::bigint,
  'every account''s deposits sum to the all-accounts deposits'
);
select is(
  (public.ledger_statistics('2026-03-01', '2026-04-30', 10, 'cccccccc-0000-4000-8000-000000000001')->'totals'->>'withdrawals')::bigint
    + (public.ledger_statistics('2026-03-01', '2026-04-30', 10, 'cccccccc-0000-4000-8000-000000000002')->'totals'->>'withdrawals')::bigint,
  (public.ledger_statistics('2026-03-01', '2026-04-30')->'totals'->>'withdrawals')::bigint,
  'and so do the withdrawals, which are negative and therefore the direction worth checking'
);
select is(
  (public.ledger_statistics('2026-03-01', '2026-04-30', 10, 'cccccccc-0000-4000-8000-000000000001')->'totals'->>'transactions')::bigint
    + (public.ledger_statistics('2026-03-01', '2026-04-30', 10, 'cccccccc-0000-4000-8000-000000000002')->'totals'->>'transactions')::bigint,
  (public.ledger_statistics('2026-03-01', '2026-04-30')->'totals'->>'transactions')::bigint,
  'and the row counts, so no row is counted twice or dropped by the partition'
);
select is(
  (public.ledger_statistics('2026-03-01', '2026-04-30', 10, 'cccccccc-0000-4000-8000-000000000001')->'totals'->>'excluded')::bigint
    + (public.ledger_statistics('2026-03-01', '2026-04-30', 10, 'cccccccc-0000-4000-8000-000000000002')->'totals'->>'excluded')::bigint,
  (public.ledger_statistics('2026-03-01', '2026-04-30')->'totals'->>'excluded')::bigint,
  'and the excluded count, which is its own query and had to be narrowed by hand'
);
select is(
  public.ledger_statistics('2026-03-01', '2026-04-30', 10, 'cccccccc-0000-4000-8000-000000000001')->'totals'->>'excluded',
  '0',
  'account A holds no excluded row, so its strip does not report another account''s exclusion'
);

-- ------------------------------------------------------------------- the two sources differ
--
-- The load-bearing pair. If these two ever agree, the fixture has stopped distinguishing a derived
-- combined position from a printed per-account one and every assertion below is worthless.

select is(
  public.ledger_statistics('2026-03-01', '2026-04-30')->'dailyBalances'->-1->>'balance',
  '113059',
  'all accounts closes on the derived combined position'
);
select is(
  public.ledger_statistics('2026-03-01', '2026-04-30', 10, 'cccccccc-0000-4000-8000-000000000002')->'dailyBalances'->-1->>'balance',
  '43058',
  'one account closes on its own printed balance, which is a different number on the same day'
);
select isnt(
  public.ledger_statistics('2026-03-01', '2026-04-30')->'dailyBalances'->-1->>'balance',
  public.ledger_statistics('2026-03-01', '2026-04-30', 10, 'cccccccc-0000-4000-8000-000000000002')->'dailyBalances'->-1->>'balance',
  'and the fixture is one where they disagree, so a single-source implementation cannot pass'
);
select is(
  jsonb_array_length(public.ledger_statistics('2026-03-01', '2026-04-30', 10, 'cccccccc-0000-4000-8000-000000000002')->'dailyBalances'),
  2,
  'the series holds one point per day the account moved, not per day the ledger moved'
);
select is(
  jsonb_array_length(public.ledger_statistics('2026-03-01', '2026-04-30')->'dailyBalances'),
  4,
  'while all accounts holds one point per day any account moved'
);
select is(
  public.ledger_statistics('2026-03-01', '2026-04-30', 10, 'cccccccc-0000-4000-8000-000000000001')->'dailyBalances'->0->>'balance',
  '100001',
  'a day with two rows closes on its **last** one, which is what the distinct-on ordering decides'
);
select is(
  public.ledger_statistics('2026-03-01', '2026-04-30', 10, 'cccccccc-0000-4000-8000-000000000002')->'dailyBalances'->-1->>'date',
  '2026-04-15',
  'the excluded row still moves the balance line, because the flag says do not count it, not that it did not happen'
);

-- ------------------------------------------------------------------- all time, per account
--
-- An account opened last month has no history before that, and a window defaulting to the whole
-- ledger's span would divide its figures by years it did not exist for.

select is(
  public.ledger_statistics(null, null, 10, 'cccccccc-0000-4000-8000-000000000002')->'window'->>'from',
  '2026-04-10',
  'an unbounded window starts at the chosen account''s own first row'
);
select is(
  public.ledger_statistics(null, null, 10, 'cccccccc-0000-4000-8000-000000000002')->'window'->>'days',
  '6',
  'so its day count — every average''s divisor — is its own span and not the ledger''s'
);
select is(
  public.ledger_statistics(null, null)->'window'->>'days',
  '42',
  'while all accounts spans the whole ledger, which is the figure the account window must not inherit'
);
select is(
  jsonb_array_length(public.ledger_statistics(null, null, 10, 'cccccccc-0000-4000-8000-000000000002')->'months'),
  1,
  'and the month list covers the account''s window rather than the ledger''s'
);
select is(
  jsonb_array_length(public.ledger_statistics('2026-03-01', '2026-04-30', 10, 'cccccccc-0000-4000-8000-000000000002')->'largestIn'),
  1,
  'the largest-movement lists narrow with everything else'
);

-- ------------------------------------------------------------------- the ledger window

select is(
  public.list_account_transactions_page('cccccccc-0000-4000-8000-000000000001', 100)->'totals'->>'rows',
  '3',
  'with no bounds the row count is every row the account holds, exactly as 023 left it'
);
select is(
  public.list_account_transactions_page('cccccccc-0000-4000-8000-000000000001', 100,
    null, null, null, '2026-03-06', '2026-03-31')->'totals'->>'rows',
  '1',
  'and with bounds it describes the window, so the strip cannot disagree with what is on screen'
);
select is(
  jsonb_array_length(public.list_account_transactions_page('cccccccc-0000-4000-8000-000000000001', 100,
    null, null, null, '2026-03-06', '2026-03-31')->'rows'),
  1,
  'the page holds the same rows the count claims'
);
select is(
  public.list_account_transactions_page('cccccccc-0000-4000-8000-000000000001', 100,
    null, null, null, '2026-03-06', '2026-03-31')->'totals'->>'deposits',
  '0',
  'money outside the window is not counted into it'
);
select is(
  public.list_account_transactions_page('cccccccc-0000-4000-8000-000000000001', 100,
    null, null, null, '2026-03-01', '2026-03-05')->'totals'->>'deposits',
  '100001',
  'and both rows of a shared day fall inside a window whose end is that day'
);

-- **The window fences the rows and never the balance.** A one-day window on account B shows one row,
-- and that row still carries the combined balance computed over the whole ledger — 113059, the
-- figure from the chronology above, not anything restarted at the window's edge.
select is(
  public.list_account_transactions_page('cccccccc-0000-4000-8000-000000000002', 100,
    null, null, null, '2026-04-15', '2026-04-15')->'rows'->0->>'combined_balance_minor',
  '113059',
  'a windowed row keeps the combined balance of the whole ledger, because a running total has no window'
);

select throws_ok(
  $$select public.list_account_transactions_page('cccccccc-0000-4000-8000-000000000001', 100,
      null, null, null, '2026-03-31', '2026-03-01')$$,
  'ledger window ends before it begins',
  'a transposed window is refused rather than answered with an empty page that means something else'
);

-- ------------------------------------------------------------------- least privilege

select ok(
  has_function_privilege('authenticated',
    'public.list_account_transactions_page(uuid, integer, date, time, uuid, date, date)', 'execute'),
  'authenticated may execute the widened paging function'
);
select ok(
  not has_function_privilege('anon',
    'public.list_account_transactions_page(uuid, integer, date, time, uuid, date, date)', 'execute'),
  'anon may not, and the grant did not survive the drop by accident'
);

select * from finish();
rollback;
