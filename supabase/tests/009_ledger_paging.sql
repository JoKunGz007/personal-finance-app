begin;
create extension if not exists pgtap with schema extensions;
select plan(33);

-- Paging the ledger, and the candidate set that lets reconciliation stay in TypeScript
-- (migration 021, PLAN task 45, D-063, D-120).
--
-- The contract these tests hold:
--
--   * a page is a **window on one ordering**, and three pages laid end to end are the ledger
--     exactly — no repeat, no gap, and an untimed row lands where `nulls last` says it does;
--   * a page carries the whole-account totals, which it cannot derive from its own rows;
--   * totals are whole-account whatever page asked for them, and are sums of `bigint` minor
--     units with no division anywhere;
--   * the candidate set answers *which rows are worth considering* and never *which row
--     matched* — bank for a slip, account for a card, the amount **in force** rather than the
--     one first typed, and every row a stored decision names whatever the predicate thinks.
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
delete from public.source_components;
delete from public.source_transactions;
delete from public.audit_events;
delete from public.accounts;
delete from auth.mfa_factors where user_id = '11111111-1111-4111-8111-111111111111';

-- Two accounts at two banks. The second exists so a card's candidate can be shown to be chosen
-- by **account** and a slip's by **bank** — the one check a slip cannot make.
insert into public.accounts(id, owner_id, bank_code, label, account_type, last_four, currency, timezone)
values
  ('cccccccc-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111',
   'SCB', 'Invented SCB', 'savings', '4242', 'THB', 'Asia/Bangkok'),
  ('cccccccc-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111',
   'KBANK', 'Invented KBANK', 'savings', '1357', 'THB', 'Asia/Bangkok');

-- Five rows on the SCB account, arranged so the ordering is actually exercised rather than
-- merely satisfied: three share one date, one of those three is **untimed**, and the untimed one
-- is the oldest of the whole ledger. Under `source_time desc nulls last` it must sort last on its
-- day, which puts it first chronologically — the case a naive `desc` gets exactly backwards.
--
-- The printed balances form a coherent walk from an opening of 100000:
--   tx3 (07-01, untimed)  -30000 -> 70000
--   tx1 (07-01, 09:00)    +50000 -> 120000
--   tx2 (07-01, 10:00)    -20000 -> 100000
--   tx4 (07-02, 08:00)    +10000 -> 110000
--   tx5 (07-03, untimed)   -5000 -> 105000
insert into public.source_transactions(id, owner_id, account_id, fingerprint_version, fingerprint,
  source_date, source_time, effective_date, transaction_label, description, post_balance_minor, currency)
values
  ('dddddddd-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'cccccccc-0000-4000-8000-000000000001',
   'fingerprint-v1', repeat('a', 64), '2026-07-01', '09:00', '2026-07-01', 'Invented one', 'Invented description one', 120000, 'THB'),
  ('dddddddd-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'cccccccc-0000-4000-8000-000000000001',
   'fingerprint-v1', repeat('b', 64), '2026-07-01', '10:00', '2026-07-01', 'Invented two', 'Invented description two', 100000, 'THB'),
  ('dddddddd-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 'cccccccc-0000-4000-8000-000000000001',
   'fingerprint-v1', repeat('c', 64), '2026-07-01', null, '2026-07-01', 'Invented three', 'Invented description three', 70000, 'THB'),
  ('dddddddd-0000-4000-8000-000000000004', '11111111-1111-4111-8111-111111111111', 'cccccccc-0000-4000-8000-000000000001',
   'fingerprint-v1', repeat('d', 64), '2026-07-02', '08:00', '2026-07-02', 'Invented four', 'Invented description four', 110000, 'THB'),
  ('dddddddd-0000-4000-8000-000000000005', '11111111-1111-4111-8111-111111111111', 'cccccccc-0000-4000-8000-000000000001',
   'fingerprint-v1', repeat('e', 64), '2026-07-03', null, '2026-07-03', 'Invented five', 'Invented description five', 105000, 'THB'),
  -- The KBANK row, of the same amount as tx2 on purpose, so a slip filtering by bank cannot
  -- reach it and a card filtering by account can.
  ('dddddddd-0000-4000-8000-000000000006', '11111111-1111-4111-8111-111111111111', 'cccccccc-0000-4000-8000-000000000002',
   'fingerprint-v1', repeat('f', 64), '2026-07-02', '09:00', '2026-07-02', 'Invented six', 'Invented description six', 300000, 'THB');

insert into public.source_components(id, owner_id, transaction_id, position, kind, amount_minor, currency)
values
  ('eeeeeeee-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'dddddddd-0000-4000-8000-000000000001', 1, 'deposit', 50000, 'THB'),
  ('eeeeeeee-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'dddddddd-0000-4000-8000-000000000002', 1, 'withdrawal', -20000, 'THB'),
  ('eeeeeeee-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 'dddddddd-0000-4000-8000-000000000003', 1, 'withdrawal', -30000, 'THB'),
  ('eeeeeeee-0000-4000-8000-000000000004', '11111111-1111-4111-8111-111111111111', 'dddddddd-0000-4000-8000-000000000004', 1, 'deposit', 10000, 'THB'),
  ('eeeeeeee-0000-4000-8000-000000000005', '11111111-1111-4111-8111-111111111111', 'dddddddd-0000-4000-8000-000000000005', 1, 'withdrawal', -5000, 'THB'),
  ('eeeeeeee-0000-4000-8000-000000000006', '11111111-1111-4111-8111-111111111111', 'dddddddd-0000-4000-8000-000000000006', 1, 'withdrawal', -20000, 'THB');

-- Three slips and one card, each aimed at a different clause of the candidate predicate.
--   s1  plain bank + amount, reaching tx2 and never the KBANK row of the same amount
--   s2  captured at one figure and corrected to another, so the amount **in force** decides
--   s3  matches nothing on amount, and is decided against tx4 anyway (see below)
insert into public.slips(id, owner_id, bank_code, bank_qr_code, slip_reference, qr_payload, kind,
  amount_minor, currency, occurred_on)
values
  ('ffffffff-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'SCB', '014',
   '202607010000000000000001x', 'invented payload one', 'withdrawal', -20000, 'THB', '2026-07-01'),
  ('ffffffff-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'SCB', '014',
   '202607030000000000000002x', 'invented payload two', 'withdrawal', -99999, 'THB', '2026-07-03'),
  ('ffffffff-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 'SCB', '014',
   '202607020000000000000003x', 'invented payload three', 'withdrawal', -777, 'THB', '2026-07-02');

-- The correction that moves s2 from a figure matching nothing to one matching tx5.
-- `kind` travels with `amount_minor` because the table makes them one fact: `(kind is null) =
-- (amount_minor is null)`, and the sign must agree with the word.
insert into public.slip_correction_overlays(slip_id, owner_id, kind, amount_minor, revision)
values ('ffffffff-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'withdrawal', -5000, 1);

/*
 * A stored decision naming a row the amount predicate does not select.
 *
 * **Written directly, because no live write path can produce it** — and that is the point rather
 * than a shortcut. Migration 013 refuses a slip correction that would falsify a stored match and
 * migration 017 refuses the card's equivalent, so an in-force amount cannot drift away from its
 * decided row today. What neither migration did was re-validate rows already stored: slip
 * decisions have been writable since 012, the correction guard arrived in 013, and 014 then found
 * that `set_slip_match` had been comparing against the uncorrected figure the whole time.
 *
 * A decision from that window is exactly this row, and unpaged it is harmless because every
 * transaction is present anyway. Paged it would be dropped from the candidate set, the rule would
 * find the row missing, and the owner's own decision would be silently discarded.
 */
insert into public.slip_match_overlays(slip_id, owner_id, decision, transaction_id, revision)
values ('ffffffff-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111',
        'matched', 'dddddddd-0000-4000-8000-000000000004', 1);

insert into public.notification_cards(id, owner_id, account_id, channel, printed_account_digits,
  kind, amount_minor, currency, occurred_on, occurred_at_time, balance_minor,
  fingerprint_version, fingerprint)
values ('99999999-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111',
        'cccccccc-0000-4000-8000-000000000002', 'KBank Live', '1357',
        'withdrawal', -20000, 'THB', '2026-07-02', '09:00', 300000,
        'card-fingerprint-v1', repeat('9', 64));
set local session_replication_role = origin;

insert into auth.mfa_factors(id, user_id, friendly_name, factor_type, status, secret, created_at, updated_at)
values ('aaaaaaaa-0000-4000-8000-000000000091', '11111111-1111-4111-8111-111111111111',
        'paging TOTP', 'totp', 'verified', 'SYNTHETICPAGING', '2026-07-24T00:00:00Z', '2026-07-24T00:00:00Z');

select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal2"}',
  true
);

-- ------------------------------------------------------------------- least privilege

select ok(
  has_function_privilege('authenticated', 'public.list_account_transactions_page(uuid, integer, date, time, uuid, date, date)', 'execute')
    and has_function_privilege('authenticated', 'public.list_match_candidates()', 'execute'),
  'authenticated may execute both new read functions'
);
select ok(
  not has_function_privilege('anon', 'public.list_account_transactions_page(uuid, integer, date, time, uuid, date, date)', 'execute')
    and not has_function_privilege('anon', 'public.list_match_candidates()', 'execute'),
  'anon may execute neither'
);
-- The row builder is an implementation detail of the two above and is reachable only through
-- them. Granting it would hand `authenticated` a way to assemble a row for any owner id it named.
select ok(
  not has_function_privilege('authenticated', 'private.ledger_transaction_json(uuid, public.source_transactions)', 'execute')
    and not has_function_privilege('anon', 'private.ledger_transaction_json(uuid, public.source_transactions)', 'execute'),
  'the private row builder is granted to nobody'
);

-- ------------------------------------------------------------------- the window

select is(
  (select jsonb_agg(r->>'id') from jsonb_array_elements(
     public.list_account_transactions_page('cccccccc-0000-4000-8000-000000000001', 2)->'rows') r),
  '["dddddddd-0000-4000-8000-000000000005","dddddddd-0000-4000-8000-000000000004"]'::jsonb,
  'the first page is the newest rows, newest first'
);
select is(
  public.list_account_transactions_page('cccccccc-0000-4000-8000-000000000001', 2)->'hasMore',
  'true'::jsonb,
  'hasMore is true while rows remain, and is read from one row beyond the page'
);
select is(
  (select jsonb_agg(r->>'id') from jsonb_array_elements(
     public.list_account_transactions_page('cccccccc-0000-4000-8000-000000000001', 2,
       '2026-07-02', '08:00', 'dddddddd-0000-4000-8000-000000000004')->'rows') r),
  '["dddddddd-0000-4000-8000-000000000002","dddddddd-0000-4000-8000-000000000001"]'::jsonb,
  'the cursor continues the same ordering without repeating or skipping a row'
);
-- The clause a naive `desc` gets backwards. tx3 shares its date with tx1 and tx2 and has no time,
-- so `nulls last` puts it after both — last in the descending walk, and therefore the oldest row.
select is(
  (select jsonb_agg(r->>'id') from jsonb_array_elements(
     public.list_account_transactions_page('cccccccc-0000-4000-8000-000000000001', 2,
       '2026-07-01', '09:00', 'dddddddd-0000-4000-8000-000000000001')->'rows') r),
  '["dddddddd-0000-4000-8000-000000000003"]'::jsonb,
  'an untimed row sorts after every timed row on its own day'
);
select is(
  public.list_account_transactions_page('cccccccc-0000-4000-8000-000000000001', 2,
    '2026-07-01', '09:00', 'dddddddd-0000-4000-8000-000000000001')->'hasMore',
  'false'::jsonb,
  'hasMore is false on the last page'
);
-- Three pages laid end to end are the ledger exactly. Asserted as a set comparison against the
-- table rather than against a literal, so it cannot pass by agreeing with the same mistake twice.
select is(
  (select count(distinct id) from (
     select r->>'id' as id from jsonb_array_elements(
       public.list_account_transactions_page('cccccccc-0000-4000-8000-000000000001', 2)->'rows') r
     union all
     select r->>'id' from jsonb_array_elements(
       public.list_account_transactions_page('cccccccc-0000-4000-8000-000000000001', 2,
         '2026-07-02', '08:00', 'dddddddd-0000-4000-8000-000000000004')->'rows') r
     union all
     select r->>'id' from jsonb_array_elements(
       public.list_account_transactions_page('cccccccc-0000-4000-8000-000000000001', 2,
         '2026-07-01', '09:00', 'dddddddd-0000-4000-8000-000000000001')->'rows') r
   ) pages),
  5::bigint,
  'three pages cover all five rows of the account with no repeat and no gap'
);
select is(
  (select count(*) from jsonb_array_elements(
     public.list_account_transactions_page('cccccccc-0000-4000-8000-000000000001', 2)->'rows') r
   where r->>'account_id' is not null),
  0::bigint,
  'a page does not carry account_id: the caller named the account'
);

-- ------------------------------------------------------------------- no carried balance

-- A first draft returned the balance carried into the page. It was removed on review: the client's
-- own seed is already exact (`post_balance − movement` is the balance before whatever row it is
-- applied to), and keeping the field as a cross-check would have raised false alarms wherever the
-- sort order and the balance chain differ — two untimed rows on one date, for instance. Pinned so
-- the field cannot quietly come back and be relied on.
select ok(
  not (public.list_account_transactions_page('cccccccc-0000-4000-8000-000000000001', 2) ? 'carriedBalance'),
  'a page carries no balance: the client derives its own and the server does not second-guess it'
);
select is(
  (select count(*) from jsonb_object_keys(public.list_account_transactions_page('cccccccc-0000-4000-8000-000000000001', 2)) k),
  3::bigint,
  'a page answers with exactly rows, hasMore and totals'
);

-- ------------------------------------------------------------------- totals

select is(
  public.list_account_transactions_page('cccccccc-0000-4000-8000-000000000001', 2)->'totals',
  '{"rows": 5, "deposits": "60000", "withdrawals": "-55000", "net": "5000"}'::jsonb,
  'totals are whole-account and exact, with money as text'
);
select is(
  public.list_account_transactions_page('cccccccc-0000-4000-8000-000000000001', 2)->'totals',
  public.list_account_transactions_page('cccccccc-0000-4000-8000-000000000001', 2,
    '2026-07-01', '09:00', 'dddddddd-0000-4000-8000-000000000001')->'totals',
  'the same totals whatever page asked for them'
);
-- Both sides carry their own sign, so net is their sum. A subtraction here would flip the answer
-- and a division would leave the exact-money rule entirely.
select is(
  (public.list_account_transactions_page('cccccccc-0000-4000-8000-000000000001', 2)->'totals'->>'net')::bigint,
  (public.list_account_transactions_page('cccccccc-0000-4000-8000-000000000001', 2)->'totals'->>'deposits')::bigint
    + (public.list_account_transactions_page('cccccccc-0000-4000-8000-000000000001', 2)->'totals'->>'withdrawals')::bigint,
  'net is the sum of deposits and withdrawals, not a difference'
);
select is(
  public.list_account_transactions_page('cccccccc-0000-4000-8000-000000000002', 10)->'totals',
  '{"rows": 1, "deposits": "0", "withdrawals": "-20000", "net": "-20000"}'::jsonb,
  'totals are scoped to the account asked for and not to the ledger'
);

-- ------------------------------------------------------------------- the trim

select ok(
  (select bool_and(not (r ? 'fingerprint') and not (r ? 'import_batch_rows'))
     from jsonb_array_elements(
       public.list_account_transactions_page('cccccccc-0000-4000-8000-000000000001', 100)->'rows') r),
  'no row carries fingerprint or import_batch_rows: the trim is the migration now, not the route'
);
select ok(
  (select bool_and((r ? 'source_components') and (r ? 'transaction_overlays')
                   and (r ? 'post_balance_minor') and jsonb_typeof(r->'post_balance_minor') = 'string')
     from jsonb_array_elements(
       public.list_account_transactions_page('cccccccc-0000-4000-8000-000000000001', 100)->'rows') r),
  'every row still carries its components, its overlays and its balance as text'
);
select is(
  (select r->'source_components'->0->>'amount_minor' from jsonb_array_elements(
     public.list_account_transactions_page('cccccccc-0000-4000-8000-000000000001', 100)->'rows') r
   where r->>'id' = 'dddddddd-0000-4000-8000-000000000002'),
  '-20000',
  'a component amount arrives as an exact signed integer string'
);

-- ------------------------------------------------------------------- bounds and refusals

select is(
  (select count(*) from jsonb_array_elements(
     public.list_account_transactions_page('cccccccc-0000-4000-8000-000000000001', 0)->'rows') r),
  1::bigint,
  'a limit below one is clamped up to one rather than returning nothing'
);
select is(
  (select count(*) from jsonb_array_elements(
     public.list_account_transactions_page('cccccccc-0000-4000-8000-000000000001', 100000)->'rows') r),
  5::bigint,
  'a limit above the ceiling is clamped rather than honoured: no caller reopens the unbounded read'
);
-- A cursor missing its id would walk a different sequence than the sort and skip rows in silence,
-- which is the worse half of every paging bug. Refused by name instead.
select throws_ok(
  $$ select public.list_account_transactions_page('cccccccc-0000-4000-8000-000000000001', 2, '2026-07-02', '08:00', null) $$,
  'incomplete ledger page cursor',
  'a partial cursor is refused rather than read as a first page'
);

-- ------------------------------------------------------------------- candidates

select is(
  (select jsonb_agg(r->>'id' order by r->>'id') from jsonb_array_elements(public.list_match_candidates()) r),
  '["dddddddd-0000-4000-8000-000000000002","dddddddd-0000-4000-8000-000000000004","dddddddd-0000-4000-8000-000000000005","dddddddd-0000-4000-8000-000000000006"]'::jsonb,
  'the candidate set is exactly the rows some record could be paired with'
);
select ok(
  (select bool_and(r->>'account_id' is not null) from jsonb_array_elements(public.list_match_candidates()) r),
  'every candidate carries its account_id: nobody named the account on its behalf'
);
-- tx1 (+50000) and tx3 (-30000) match no slip, no card and no decision. A candidate query that
-- returned them would not be wrong so much as pointless — it is the narrowing that makes the
-- second query cheap at any ledger size.
select ok(
  (select count(*) = 0 from jsonb_array_elements(public.list_match_candidates()) r
    where r->>'id' in ('dddddddd-0000-4000-8000-000000000001', 'dddddddd-0000-4000-8000-000000000003')),
  'a row no record could be paired with is not a candidate'
);
-- s1 is an SCB slip of -20000. tx2 is the SCB row of that amount and tx6 is the KBANK row of the
-- same amount; only the first is reachable by a slip, because a QR names a bank (D-056).
select ok(
  (select count(*) = 1 from jsonb_array_elements(public.list_match_candidates()) r
    where r->>'id' = 'dddddddd-0000-4000-8000-000000000002'),
  'a slip reaches the row at its own bank'
);
-- tx6 is in the set, and the only record that can reach it is the card — which matches on
-- account, the check a slip cannot make.
select ok(
  (select count(*) = 1 from jsonb_array_elements(public.list_match_candidates()) r
    where r->>'id' = 'dddddddd-0000-4000-8000-000000000006'),
  'a card reaches its row by account rather than by bank'
);
-- s2 was captured at -99999 and corrected to -5000. tx5 is the -5000 row. Reading the captured
-- figure would offer nothing here and withhold the row the slip now agrees with — migration 014.
select ok(
  (select count(*) = 1 from jsonb_array_elements(public.list_match_candidates()) r
    where r->>'id' = 'dddddddd-0000-4000-8000-000000000005'),
  'the amount in force decides candidacy, not the amount first typed'
);
-- s3 is -777 and tx4 moved +10000, so no predicate here selects it. The decision does.
select ok(
  (select count(*) = 1 from jsonb_array_elements(public.list_match_candidates()) r
    where r->>'id' = 'dddddddd-0000-4000-8000-000000000004'),
  'a row named by a stored decision is a candidate whatever the amount predicate says'
);
select ok(
  (select bool_and(not (r ? 'fingerprint') and not (r ? 'import_batch_rows'))
     from jsonb_array_elements(public.list_match_candidates()) r),
  'a candidate is trimmed exactly as a page row is'
);

-- ------------------------------------------------------------------- weak session

select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal1"}',
  true
);
-- An empty page rather than an exception, matching `list_account_transactions`' own `else '[]'`.
-- The route answers a signed-out arrival with 401 and the ledger view renders that as a note
-- rather than an alert; a raise here would reach it as a 400 and read as a fault.
select is(
  public.list_account_transactions_page('cccccccc-0000-4000-8000-000000000001', 100)->'rows',
  '[]'::jsonb,
  'a session without aal2 reads no rows'
);
select is(
  public.list_account_transactions_page('cccccccc-0000-4000-8000-000000000001', 100)->'totals'->>'rows',
  '0',
  'and is told nothing about the size of the ledger it cannot read'
);
select is(
  public.list_match_candidates(),
  '[]'::jsonb,
  'and reaches no candidate either'
);

select * from finish();
rollback;
