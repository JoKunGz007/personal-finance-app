begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

-- `public.spending_by_category` (migration 063). Invented fixture, in the style of 013.
--
-- What this proves: the listed categories sum to the statistics page's own spending figure (the
-- sign-flipped withdrawals total) for the whole ledger, one account and a bounded window; an
-- excluded row is not counted; uncategorised rows form one bucket; a child category reports its
-- parent; a deposit in a category never reduces its spending; money travels as text; anon and a
-- non-owner get nothing.

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
delete from public.category_parents;
delete from public.category_provenance;
delete from public.category_reviews;
delete from public.categories;
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

insert into public.categories(id, owner_id, name, archived) values
  ('cafecafe-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'Invented Food', false),
  ('cafecafe-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'Invented Coffee', true),
  ('cafecafe-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 'Invented Travel', false);
insert into public.category_parents(category_id, owner_id, parent_id) values
  ('cafecafe-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'cafecafe-0000-4000-8000-000000000001');

--   id  date        acct  movement   category
--   1   2026-03-05  A     +100000    none          <- deposit only
--   2   2026-03-10  A      -30000    Food
--   3   2026-03-12  A       -4000    Food
--   4   2026-03-20  A      -20000    Coffee (child of Food, archived)
--   5   2026-04-10  B       -5000    none          <- uncategorised spending
--   6   2026-04-15  B       -7000    Food          <- excluded from reporting
--   7   2026-04-20  B       +2000    Food          <- refund deposit, must not reduce Food
--   8   2026-04-25  B       -9000    Travel
insert into public.source_transactions(id, owner_id, account_id, fingerprint_version, fingerprint,
  source_date, source_time, effective_date, transaction_label, description, post_balance_minor, currency)
select ('dddddddd-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, '11111111-1111-4111-8111-111111111111',
       case when n <= 4 then 'cccccccc-0000-4000-8000-000000000001'::uuid else 'cccccccc-0000-4000-8000-000000000002'::uuid end,
       'fingerprint-v1', repeat(to_hex(n), 64), d::date, '10:00', d::date, 'Invented ' || n, 'Invented ' || n, 1000, 'THB'
  from (values (1, '2026-03-05'), (2, '2026-03-10'), (3, '2026-03-12'), (4, '2026-03-20'),
               (5, '2026-04-10'), (6, '2026-04-15'), (7, '2026-04-20'), (8, '2026-04-25')) v(n, d);

insert into public.source_components(id, owner_id, transaction_id, position, kind, amount_minor, currency)
select ('eeeeeeee-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, '11111111-1111-4111-8111-111111111111',
       ('dddddddd-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, 1,
       case when a > 0 then 'deposit' else 'withdrawal' end, a, 'THB'
  from (values (1, 100000), (2, -30000), (3, -4000), (4, -20000), (5, -5000), (6, -7000), (7, 2000), (8, -9000)) v(n, a);

insert into public.transaction_overlays(transaction_id, owner_id, category_id, include_in_reporting, revision) values
  ('dddddddd-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'cafecafe-0000-4000-8000-000000000001', true, 0),
  ('dddddddd-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 'cafecafe-0000-4000-8000-000000000001', true, 0),
  ('dddddddd-0000-4000-8000-000000000004', '11111111-1111-4111-8111-111111111111', 'cafecafe-0000-4000-8000-000000000002', true, 0),
  ('dddddddd-0000-4000-8000-000000000006', '11111111-1111-4111-8111-111111111111', 'cafecafe-0000-4000-8000-000000000001', false, 0),
  ('dddddddd-0000-4000-8000-000000000007', '11111111-1111-4111-8111-111111111111', 'cafecafe-0000-4000-8000-000000000001', true, 0),
  ('dddddddd-0000-4000-8000-000000000008', '11111111-1111-4111-8111-111111111111', 'cafecafe-0000-4000-8000-000000000003', true, 0);
set local session_replication_role = origin;

insert into auth.mfa_factors(id, user_id, friendly_name, factor_type, status, secret, created_at, updated_at)
values ('aaaaaaaa-0000-4000-8000-000000000095', '11111111-1111-4111-8111-111111111111',
        'spending by category TOTP', 'totp', 'verified', 'SYNTHETICACCT', '2026-07-24T00:00:00Z', '2026-07-24T00:00:00Z');

select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal2"}',
  true
);

-- ------------------------------------------------------------------- (a) categories sum to spending

select is(
  (select sum((e->>'spendingMinor')::bigint)::bigint from jsonb_array_elements(public.spending_by_category()->'categories') e),
  -(public.ledger_statistics()->'totals'->>'withdrawals')::bigint,
  'whole ledger: the categories sum to the statistics page spending figure'
);
select is(
  (public.spending_by_category()->>'spendingMinor')::bigint,
  -(public.ledger_statistics()->'totals'->>'withdrawals')::bigint,
  'whole ledger: the top-level spending is the statistics withdrawals total, sign-flipped'
);
select is(
  (select sum((e->>'spendingMinor')::bigint)::bigint from jsonb_array_elements(
     public.spending_by_category(null, null, 'cccccccc-0000-4000-8000-000000000002')->'categories') e),
  -(public.ledger_statistics(null, null, 10, 'cccccccc-0000-4000-8000-000000000002')->'totals'->>'withdrawals')::bigint,
  'one account: the categories sum to that account''s statistics spending'
);
select is(
  (select sum((e->>'spendingMinor')::bigint)::bigint from jsonb_array_elements(
     public.spending_by_category('2026-03-11', '2026-04-12')->'categories') e),
  -(public.ledger_statistics('2026-03-11', '2026-04-12')->'totals'->>'withdrawals')::bigint,
  'bounded window: the categories sum to the statistics spending for the same window'
);
select is(
  public.spending_by_category('2026-03-11', '2026-04-12')->>'spendingMinor',
  '29000',
  'bounded window total is 4000 + 20000 + 5000'
);
select is(
  public.spending_by_category(null, null, 'cccccccc-0000-4000-8000-000000000001')->>'from',
  '2026-03-05',
  'a null lower bound defaults to the first row of the chosen account, as ledger_statistics does'
);

-- ------------------------------------------------------------------- (b) excluded row

select is(
  (select e->>'spendingMinor' from jsonb_array_elements(public.spending_by_category()->'categories') e
    where e->>'categoryId' = 'cafecafe-0000-4000-8000-000000000001'),
  '34000',
  'Food is 30000 + 4000: the excluded 7000 is not counted'
);

-- ------------------------------------------------------------------- (c) uncategorised bucket

select is(
  (select e->>'spendingMinor' from jsonb_array_elements(public.spending_by_category()->'categories') e
    where e->'categoryId' = 'null'::jsonb),
  '5000',
  'a row with no overlay falls in the uncategorised bucket'
);
select is(
  (select e->'name' = 'null'::jsonb from jsonb_array_elements(public.spending_by_category()->'categories') e
    where e->'categoryId' = 'null'::jsonb),
  true,
  'and the bucket has a null name'
);
select is(
  jsonb_array_length(public.spending_by_category()->'categories'),
  4,
  'four buckets carry spending: Food, Coffee, Travel and uncategorised (the deposit-only row adds none)'
);

-- ------------------------------------------------------------------- (d) parent

select is(
  (select e->>'parentName' from jsonb_array_elements(public.spending_by_category()->'categories') e
    where e->>'categoryId' = 'cafecafe-0000-4000-8000-000000000002'),
  'Invented Food',
  'a child category reports its parent name'
);
select is(
  (select e->>'parentId' from jsonb_array_elements(public.spending_by_category()->'categories') e
    where e->>'categoryId' = 'cafecafe-0000-4000-8000-000000000002'),
  'cafecafe-0000-4000-8000-000000000001',
  'and its parent id'
);
select is(
  (select (e->>'archived')::boolean from jsonb_array_elements(public.spending_by_category()->'categories') e
    where e->>'categoryId' = 'cafecafe-0000-4000-8000-000000000002'),
  true,
  'an archived category is kept and flagged'
);

-- ordering: spending desc
select is(
  (select array_agg(e->>'spendingMinor' order by o) from jsonb_array_elements(public.spending_by_category()->'categories') with ordinality x(e, o)),
  array['34000', '20000', '9000', '5000'],
  'ordered by spending, largest first'
);

-- ------------------------------------------------------------------- (g) a refund does not reduce

select is(
  (select e->>'transactionCount' from jsonb_array_elements(public.spending_by_category()->'categories') e
    where e->>'categoryId' = 'cafecafe-0000-4000-8000-000000000001'),
  '2',
  'the +2000 refund in Food neither reduces its spending nor counts as a spending transaction'
);

-- ------------------------------------------------------------------- (f) types

select ok(
  (select bool_and((e->>'spendingMinor') ~ '^[1-9][0-9]*$' and jsonb_typeof(e->'spendingMinor') = 'string')
     from jsonb_array_elements(public.spending_by_category()->'categories') e)
    and jsonb_typeof(public.spending_by_category()->'spendingMinor') = 'string'
    and (select bool_and(jsonb_typeof(e->'transactionCount') = 'number')
           from jsonb_array_elements(public.spending_by_category()->'categories') e),
  'money values are strings parsing as integers; counts are numbers'
);

-- ------------------------------------------------------------------- (e) access

select ok(
  has_function_privilege('authenticated', 'public.spending_by_category(date, date, uuid)', 'execute'),
  'authenticated may execute'
);
select ok(
  not has_function_privilege('anon', 'public.spending_by_category(date, date, uuid)', 'execute'),
  'anon may not'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"99999999-9999-4999-8999-999999999999","role":"authenticated","aal":"aal2"}',
  true
);
select is(
  public.spending_by_category(),
  '{"from":null,"to":null,"spendingMinor":"0","categories":[]}'::jsonb,
  'a caller who is not the owner sees the empty shape, not the owner''s ledger'
);

select * from finish();
rollback;
