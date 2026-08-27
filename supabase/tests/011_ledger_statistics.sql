begin;
create extension if not exists pgtap with schema extensions;
select plan(35);

-- The statistics surface (migration 023, PLAN task 44, D-160).
--
-- **What this suite exists to prove is the money rule**, not the shape of the JSON. Every average on
-- this surface is a division, and this app had never divided money before task 44. The load-bearing
-- assertions are therefore:
--
--   * `quotient * divisor + remainder = total`, for a **positive** total and a **negative** one.
--     Withdrawals are stored negative and PostgreSQL truncates toward zero on both `/` and `%`, so
--     the negative case is the one that would break under any other rounding rule and is asserted
--     separately rather than assumed to follow.
--   * `avg_week` is `total * 7 / days` and **not** `avg_day * 7`. The fixture is chosen so those two
--     give different answers — if they agreed, the assertion would pass against the wrong formula.
--   * `include_in_reporting` removes a row from the **totals** and leaves it in the **balance
--     series**, because the flag says the money should not be counted as income or spending, never
--     that it failed to move.
--
-- Every value is invented, per docs/FIXTURE_POLICY.md.

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

-- Two of the owner's own accounts, which is what makes the excluded row a *transfer* rather than an
-- arbitrary exclusion — the case `include_in_reporting` exists for.
insert into public.accounts(id, owner_id, bank_code, label, account_type, last_four, currency, timezone)
values
  ('cccccccc-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111',
   'KTB', 'Invented A', 'savings', '4242', 'THB', 'Asia/Bangkok'),
  ('cccccccc-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111',
   'KTB', 'Invented B', 'savings', '1357', 'THB', 'Asia/Bangkok');

-- The chronology, and the combined balance it produces:
--
--   date        time   acct  movement   printed   combined
--   2026-03-05  09:00  A      +100000    100000    100000
--   2026-03-05  14:00  A           +1    100001    100001   <- same day, later: the day's close
--   2026-03-20  10:00  A       -30000     70001     70001
--   2026-04-10  10:00  B       +50058     50058    120059
--   2026-04-15  10:00  B        -7000     43058    113059   <- excluded from reporting
--
-- Reportable deposits total **150059**, chosen deliberately: over a 61-day window its daily
-- remainder is 60, and 60 * 7 exceeds 61, which is exactly the condition under which
-- `total * 7 / days` and `(total / days) * 7` disagree. A rounder number would let the wrong
-- formula pass.
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

-- The one row the flag removes. Every other row has no overlay at all, which is the ordinary state
-- and is why the predicate is `coalesce(..., true)` rather than a join that would drop them.
insert into public.transaction_overlays(transaction_id, owner_id, include_in_reporting, revision)
values ('dddddddd-0000-4000-8000-000000000005', '11111111-1111-4111-8111-111111111111', false, 0);
set local session_replication_role = origin;

insert into auth.mfa_factors(id, user_id, friendly_name, factor_type, status, secret, created_at, updated_at)
values ('aaaaaaaa-0000-4000-8000-000000000092', '11111111-1111-4111-8111-111111111111',
        'statistics TOTP', 'totp', 'verified', 'SYNTHETICSTATS', '2026-07-24T00:00:00Z', '2026-07-24T00:00:00Z');

select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal2"}',
  true
);

-- ------------------------------------------------------------------- totals

select is(
  public.ledger_statistics('2026-03-01', '2026-04-30')->'totals'->>'deposits',
  '150059',
  'deposits sum the reportable rows only'
);
select is(
  public.ledger_statistics('2026-03-01', '2026-04-30')->'totals'->>'withdrawals',
  '-30000',
  'withdrawals exclude the flagged transfer, which is the whole point of the flag'
);
select is(
  public.ledger_statistics('2026-03-01', '2026-04-30')->'totals'->>'net',
  '120059',
  'net is deposits plus withdrawals, withdrawals already being negative'
);
select is(
  public.ledger_statistics('2026-03-01', '2026-04-30')->'totals'->>'transactions',
  '4',
  'the transaction count counts reportable rows'
);
select is(
  public.ledger_statistics('2026-03-01', '2026-04-30')->'totals'->>'excluded',
  '1',
  'the excluded count is reported rather than hidden, so an inert flag is distinguishable from a working one'
);

-- ------------------------------------------------------------------- exact money

-- 61 days: 2026-03-01 through 2026-04-30 inclusive.
select is(
  (public.ledger_statistics('2026-03-01', '2026-04-30')->'averages'->'perDay'->>'divisor')::bigint,
  61::bigint,
  'the daily divisor counts both ends of the window'
);
select is(
  (public.ledger_statistics('2026-03-01', '2026-04-30')->'averages'->'perDay'->'deposits'->>'quotient')::bigint
    * 61 +
  (public.ledger_statistics('2026-03-01', '2026-04-30')->'averages'->'perDay'->'deposits'->>'remainder')::bigint,
  150059::bigint,
  'quotient * divisor + remainder = total, for a positive total: nothing is lost to the division'
);
select is(
  (public.ledger_statistics('2026-03-01', '2026-04-30')->'averages'->'perDay'->'withdrawals'->>'quotient')::bigint
    * 61 +
  (public.ledger_statistics('2026-03-01', '2026-04-30')->'averages'->'perDay'->'withdrawals'->>'remainder')::bigint,
  -30000::bigint,
  'and for a negative total, where truncation toward zero is what makes the identity worth checking'
);
select is(
  public.ledger_statistics('2026-03-01', '2026-04-30')->'averages'->'perDay'->'deposits'->>'quotient',
  '2459',
  'the daily deposit quotient is the exact truncated figure'
);
select is(
  public.ledger_statistics('2026-03-01', '2026-04-30')->'averages'->'perDay'->'withdrawals'->>'quotient',
  '-491',
  'a negative quotient truncates toward zero rather than downward'
);
select is(
  (public.ledger_statistics('2026-03-01', '2026-04-30')->'averages'->'perWeek'->'deposits'->>'quotient')::bigint
    * 61 +
  (public.ledger_statistics('2026-03-01', '2026-04-30')->'averages'->'perWeek'->'deposits'->>'remainder')::bigint,
  (150059 * 7)::bigint,
  'the weekly identity holds against the scaled numerator, which is what one division buys'
);
select is(
  (public.ledger_statistics('2026-03-01', '2026-04-30')->'averages'->'perWeek'->'withdrawals'->>'quotient')::bigint
    * 61 +
  (public.ledger_statistics('2026-03-01', '2026-04-30')->'averages'->'perWeek'->'withdrawals'->>'remainder')::bigint,
  (-30000 * 7)::bigint,
  'and holds for the negative total too'
);
-- **The distinguishing assertion.** `avg_day * 7` is 17213 and `total * 7 / days` is 17219. A suite
-- that only checked the identity would pass against either, because both are internally consistent;
-- only a fixture where they disagree can tell which formula shipped.
select is(
  public.ledger_statistics('2026-03-01', '2026-04-30')->'averages'->'perWeek'->'deposits'->>'quotient',
  '17219',
  'the weekly average divides once on a scaled numerator and is NOT the daily quotient times seven'
);

-- ------------------------------------------------------------------- the monthly series

select is(
  jsonb_array_length(public.ledger_statistics('2026-03-01', '2026-04-30')->'months'),
  2,
  'the window covers two months'
);
select is(
  public.ledger_statistics('2026-03-01', '2026-04-30')->'months'->0,
  jsonb_build_object(
    'month', '2026-03', 'days', 31, 'isPartial', false,
    'deposits', '100001', 'withdrawals', '-30000', 'net', '70001', 'transactions', 3,
    'previousDeposits', null, 'previousWithdrawals', null),
  'March carries its own rows, a full-month divisor, and no delta because nothing precedes it'
);
-- The previous month travels; the comparison does not. A **signed** month-over-month delta was
-- emitted here at first and removed: withdrawals are stored negative, so spending more yields a more
-- negative delta, which prints as a fall and means a rise. The client compares magnitudes instead.
select is(
  public.ledger_statistics('2026-03-01', '2026-04-30')->'months'->1->>'previousDeposits',
  '100001',
  'a month carries its predecessor''s figures rather than a ratio or a sign-ambiguous delta'
);
select is(
  public.ledger_statistics('2026-03-01', '2026-04-30')->'months'->1->>'transactions',
  '1',
  'April counts only its reportable row, the flagged transfer being absent'
);

-- A window that starts and ends mid-month, which is the ordinary case the moment the owner looks at
-- the current month before it is over.
select is(
  public.ledger_statistics('2026-03-10', '2026-04-20')->'months'->0,
  jsonb_build_object(
    'month', '2026-03', 'days', 22, 'isPartial', true,
    'deposits', '0', 'withdrawals', '-30000', 'net', '-30000', 'transactions', 1,
    'previousDeposits', null, 'previousWithdrawals', null),
  'a clipped first month divides by the days inside the window and says it is partial'
);
select is(
  public.ledger_statistics('2026-03-10', '2026-04-20')->'months'->1->>'days',
  '20',
  'and a clipped last month does the same, which is what keeps the current month honest'
);
select is(
  public.ledger_statistics('2026-02-01', '2026-04-30')->'months'->0,
  jsonb_build_object(
    'month', '2026-02', 'days', 28, 'isPartial', false,
    'deposits', '0', 'withdrawals', '0', 'net', '0', 'transactions', 0,
    'previousDeposits', null, 'previousWithdrawals', null),
  'a month holding nothing still appears, because a missing bar reads as a shorter year'
);

-- ------------------------------------------------------------------- the balance series

select is(
  (select b->>'balance' from jsonb_array_elements(
     public.ledger_statistics('2026-03-01', '2026-04-30')->'dailyBalances') b
    where b->>'date' = '2026-03-05'),
  '100001',
  'a day holding two rows closes on the later one, not the first'
);
select is(
  (select b->>'balance' from jsonb_array_elements(
     public.ledger_statistics('2026-03-01', '2026-04-30')->'dailyBalances') b
    where b->>'date' = '2026-04-15'),
  '113059',
  'the excluded row still moves the balance, because the flag says do not count it, not that it never happened'
);
select is(
  jsonb_array_length(public.ledger_statistics('2026-03-01', '2026-04-30')->'dailyBalances'),
  4,
  'one point per day that holds a row, rather than one per row'
);

-- ------------------------------------------------------------------- day of week

select is(
  jsonb_array_length(public.ledger_statistics('2026-03-01', '2026-04-30')->'dayOfWeek'),
  7,
  'all seven days appear, including the ones that never saw a transaction'
);
-- The cast on the outer `sum` is not decoration: **`sum()` over `bigint` returns `numeric`**, which
-- is the exact trap the migration's header warns about, and it surfaced here first — in the test
-- that was written to check the surface, not the arithmetic.
select is(
  (select sum((d->>'deposits')::bigint)::bigint from jsonb_array_elements(
     public.ledger_statistics('2026-03-01', '2026-04-30')->'dayOfWeek') d),
  150059::bigint,
  'the day-of-week split sums back to the total, so no row is dropped or counted twice'
);

-- ------------------------------------------------------------------- largest movements

-- **The two directions rank separately.** A single list ordered by absolute size is dominated by
-- whichever direction moves in bigger lumps: here the deposits are 100000 and 50058 against a single
-- 30000 withdrawal, so a combined top three would be two arrivals and one departure and a real
-- ledger's would be ten paydays. This fixture would pass a combined ranking too, which is why the
-- assertion names the arrays rather than the order.
select is(
  public.ledger_statistics('2026-03-01', '2026-04-30')->'largestIn'->0->>'amount',
  '100000',
  'the largest arrival leads its own list'
);
select is(
  public.ledger_statistics('2026-03-01', '2026-04-30')->'largestOut'->0->>'amount',
  '-30000',
  'and the largest departure leads its own, rather than being crowded out by every deposit'
);
select is(
  jsonb_array_length(public.ledger_statistics('2026-03-01', '2026-04-30')->'largestOut'),
  1,
  'a direction lists only its own rows, and the flagged transfer is not among them'
);
select is(
  jsonb_array_length(public.ledger_statistics('2026-03-01', '2026-04-30', 1)->'largestIn'),
  1,
  'the caller may narrow the list'
);

-- ------------------------------------------------------------------- least privilege

select ok(
  has_function_privilege('authenticated', 'public.ledger_statistics(date, date, integer)', 'execute'),
  'authenticated may execute the statistics function'
);
select ok(
  not has_function_privilege('anon', 'public.ledger_statistics(date, date, integer)', 'execute'),
  'anon may not'
);
select ok(
  not has_function_privilege('authenticated', 'private.reportable_movements(uuid, date, date)', 'execute')
    and not has_function_privilege('authenticated', 'private.daily_closing_balances(uuid, date, date)', 'execute'),
  'both private helpers are executable by nobody, exactly as private.combined_balances is'
);

-- ------------------------------------------------------------------- the retrofit

-- Account B holds the flagged transfer and one ordinary deposit. Its money totals must drop the
-- transfer while its **row count** must not: the count says how many rows the account holds, which
-- is a fact about the ledger rather than about reporting, and the paging cursor walks all of them.
select is(
  public.list_account_transactions_page('cccccccc-0000-4000-8000-000000000002', 100)->'totals'->>'withdrawals',
  '0',
  'the ledger totals strip now honours include_in_reporting, so it cannot disagree with the statistics page'
);
select is(
  public.list_account_transactions_page('cccccccc-0000-4000-8000-000000000002', 100)->'totals'->>'rows',
  '2',
  'while the row count still counts every row the account holds'
);

-- ------------------------------------------------------------------- weak session

select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal1"}',
  true
);
select is(
  public.ledger_statistics('2026-03-01', '2026-04-30')->'totals'->>'deposits',
  '0',
  'a session without aal2 reads no statistics, and gets the empty shape rather than an error'
);

select * from finish();
rollback;
