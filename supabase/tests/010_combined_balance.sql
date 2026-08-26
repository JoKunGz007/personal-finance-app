begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

-- The combined balance across every account, after each row (migration 022, D-158 follow-up).
--
-- **These cases moved here from `tests/transactions.test.ts` with the derivation itself.** They are
-- the same assertions the client's walk carried — an account seeded from its own opening, the
-- answer being independent of the order rows arrive in, an account with no rows contributing
-- nothing — plus the one the client could never satisfy once the ledger paged: **two accounts of
-- unequal window depth**, which is the defect that blanked the column on the real ledger.
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

-- Two accounts that interleave, which is the only arrangement that can tell a correct combined
-- figure from a plausible one. A opens at 0 and moves in January and June; B opens at 0 and moves
-- in February and July. A third account holds nothing at all.
--
--   chronological  account  movement  printed     combined truth
--   2026-01-10     A         +10000     10000      10000
--   2026-02-10     B        +100000    100000     110000
--   2026-06-10     A          +5000     15000     115000
--   2026-07-10     B         -50000     50000      65000
insert into public.accounts(id, owner_id, bank_code, label, account_type, last_four, currency, timezone)
values
  ('cccccccc-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111',
   'SCB', 'Invented SCB', 'savings', '4242', 'THB', 'Asia/Bangkok'),
  ('cccccccc-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111',
   'KBANK', 'Invented KBANK', 'savings', '1357', 'THB', 'Asia/Bangkok'),
  ('cccccccc-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111',
   'KTB', 'Invented empty', 'savings', '2468', 'THB', 'Asia/Bangkok');

insert into public.source_transactions(id, owner_id, account_id, fingerprint_version, fingerprint,
  source_date, source_time, effective_date, transaction_label, description, post_balance_minor, currency)
values
  ('dddddddd-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'cccccccc-0000-4000-8000-000000000001',
   'fingerprint-v1', repeat('a', 64), '2026-01-10', '09:00', '2026-01-10', 'Invented A one', 'Invented A one', 10000, 'THB'),
  ('dddddddd-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'cccccccc-0000-4000-8000-000000000002',
   'fingerprint-v1', repeat('b', 64), '2026-02-10', '09:00', '2026-02-10', 'Invented B one', 'Invented B one', 100000, 'THB'),
  ('dddddddd-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 'cccccccc-0000-4000-8000-000000000001',
   'fingerprint-v1', repeat('c', 64), '2026-06-10', '09:00', '2026-06-10', 'Invented A two', 'Invented A two', 15000, 'THB'),
  ('dddddddd-0000-4000-8000-000000000004', '11111111-1111-4111-8111-111111111111', 'cccccccc-0000-4000-8000-000000000002',
   'fingerprint-v1', repeat('d', 64), '2026-07-10', '09:00', '2026-07-10', 'Invented B two', 'Invented B two', 50000, 'THB');

insert into public.source_components(id, owner_id, transaction_id, position, kind, amount_minor, currency)
values
  ('eeeeeeee-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'dddddddd-0000-4000-8000-000000000001', 1, 'deposit', 10000, 'THB'),
  ('eeeeeeee-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'dddddddd-0000-4000-8000-000000000002', 1, 'deposit', 100000, 'THB'),
  ('eeeeeeee-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 'dddddddd-0000-4000-8000-000000000003', 1, 'deposit', 5000, 'THB'),
  ('eeeeeeee-0000-4000-8000-000000000004', '11111111-1111-4111-8111-111111111111', 'dddddddd-0000-4000-8000-000000000004', 1, 'withdrawal', -50000, 'THB');
set local session_replication_role = origin;

insert into auth.mfa_factors(id, user_id, friendly_name, factor_type, status, secret, created_at, updated_at)
values ('aaaaaaaa-0000-4000-8000-000000000101', '11111111-1111-4111-8111-111111111111',
        'combined TOTP', 'totp', 'verified', 'SYNTHETICCOMBINE', '2026-07-24T00:00:00Z', '2026-07-24T00:00:00Z');

select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal2"}',
  true
);

-- ------------------------------------------------------------------- least privilege

-- Reachable only through the page function, which is `security definer`. Granting it would hand
-- `authenticated` a way to compute balances for any owner id it named.
select ok(
  not has_function_privilege('authenticated', 'private.combined_balances(uuid)', 'execute')
    and not has_function_privilege('anon', 'private.combined_balances(uuid)', 'execute'),
  'the combined-balance helper is granted to nobody'
);

-- ------------------------------------------------------------------- the figure itself

select is(
  (select combined_balance_minor from private.combined_balances('11111111-1111-4111-8111-111111111111')
    where transaction_id = 'dddddddd-0000-4000-8000-000000000001'),
  10000::bigint,
  'the first row of the ledger is its own account opening plus its movement'
);
-- The row that would be wrong if B were seeded from anywhere but its opening.
select is(
  (select combined_balance_minor from private.combined_balances('11111111-1111-4111-8111-111111111111')
    where transaction_id = 'dddddddd-0000-4000-8000-000000000002'),
  110000::bigint,
  'a row of one account carries the other account balance as it stood at that moment'
);
select is(
  (select combined_balance_minor from private.combined_balances('11111111-1111-4111-8111-111111111111')
    where transaction_id = 'dddddddd-0000-4000-8000-000000000003'),
  115000::bigint,
  'a later row of the first account adds only what that account moved'
);
select is(
  (select combined_balance_minor from private.combined_balances('11111111-1111-4111-8111-111111111111')
    where transaction_id = 'dddddddd-0000-4000-8000-000000000004'),
  65000::bigint,
  'a withdrawal reduces the combined figure by exactly its own amount'
);
-- The newest row's combined figure must equal the sum of every account's latest printed balance.
-- Asserted against the tables rather than a literal, so it cannot agree with the same mistake twice.
select is(
  (select combined_balance_minor from private.combined_balances('11111111-1111-4111-8111-111111111111')
    where transaction_id = 'dddddddd-0000-4000-8000-000000000004'),
  -- `sum()` over bigint returns numeric, so it is cast back explicitly rather than compared across types.
  (select coalesce(sum(latest.post_balance_minor), 0)::bigint from (
     select distinct on (t.account_id) t.post_balance_minor
       from public.source_transactions t
      where t.owner_id = '11111111-1111-4111-8111-111111111111'
      order by t.account_id, t.source_date desc, t.source_time desc nulls last, t.id
   ) latest),
  'the newest row equals the sum of every account latest printed balance'
);
select is(
  (select count(*) from private.combined_balances('11111111-1111-4111-8111-111111111111')),
  4::bigint,
  'an account holding no rows contributes nothing and produces no row of its own'
);

-- ------------------------------------------------------------------- what the client could not do

/*
 * **The defect this migration exists for.** The client walked the rows it held and seeded each
 * account from `post_balance − movement` of the oldest one it had. Handed only B's newest row — B
 * windowed shallower than A, which is what per-account paging produces — it seeded B at 100000 and
 * printed 110000 against A's January row, where the truth is 10000. B had not moved yet.
 *
 * Asserted here as the property that makes it impossible: the figure at a row does not depend on
 * how much of any account happens to be loaded, because it is not derived from a window at all.
 */
select is(
  (select combined_balance_minor from private.combined_balances('11111111-1111-4111-8111-111111111111')
    where transaction_id = 'dddddddd-0000-4000-8000-000000000001'),
  10000::bigint,
  'an early row does not carry a later account balance, whatever a page happens to hold'
);
select is(
  (select r->>'combined_balance_minor' from jsonb_array_elements(
     public.list_account_transactions_page('cccccccc-0000-4000-8000-000000000001', 1)->'rows') r),
  '115000',
  'a one-row page of one account still carries the whole ledger figure at that row'
);
select is(
  (select r->>'combined_balance_minor' from jsonb_array_elements(
     public.list_account_transactions_page('cccccccc-0000-4000-8000-000000000001', 1,
       '2026-06-10', '09:00', 'dddddddd-0000-4000-8000-000000000003')->'rows') r),
  '10000',
  'and the same is true a page deeper, where the client used to go wrong'
);

-- ------------------------------------------------------------------- the printed chain wins

/*
 * `delta` is the difference between printed balances rather than the row's own movement, and they
 * are equal only while a statement chain is intact. Two separately imported statements can leave a
 * gap, and there the printed balance is the truth. Written directly, since no import path produces
 * a gap on purpose: B's second row is moved to a printed balance its own movement does not explain.
 */
set local session_replication_role = replica;
update public.source_transactions set post_balance_minor = 70000
 where id = 'dddddddd-0000-4000-8000-000000000004';
set local session_replication_role = origin;

select is(
  (select combined_balance_minor from private.combined_balances('11111111-1111-4111-8111-111111111111')
    where transaction_id = 'dddddddd-0000-4000-8000-000000000004'),
  85000::bigint,
  'a gap in the balance chain follows the printed balance rather than the movement sum'
);
select is(
  (select combined_balance_minor from private.combined_balances('11111111-1111-4111-8111-111111111111')
    where transaction_id = 'dddddddd-0000-4000-8000-000000000003'),
  115000::bigint,
  'and a row before the gap is untouched by it'
);

-- ------------------------------------------------------------------- weak session

select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal1"}',
  true
);
select is(
  public.list_account_transactions_page('cccccccc-0000-4000-8000-000000000001', 100)->'rows',
  '[]'::jsonb,
  'a session without aal2 reads no balance, because it reads no rows'
);

select * from finish();
rollback;
