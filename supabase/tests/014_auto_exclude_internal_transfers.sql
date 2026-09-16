begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

-- Migration 026 (D-207): internal transfers are excluded from reporting automatically. Every row is
-- invented. What this proves: a pair needs the same amount, two different accounts, at most 24 hours
-- and a description naming the other account; pairing is one-to-one and nearest first; other overlay
-- fields survive; the owner's own reporting decision always wins; and a second run changes nothing.

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

--  1/2    A -500.00 / B +500.00, same minute, both name the other           -> paired
--  3/4    same amount and minute, neither names an account                  -> not paired
--  5/6/7  A -300.00; B +300.00 five minutes later and again the next day    -> 5 pairs with 6 only
--  8/9    a matching pair, but 9 was once excluded by hand, then re-included -> left alone
--  10/11  matching descriptions, 48 hours apart                              -> not paired
--  12/13  same account                                                       -> not paired
insert into public.source_transactions(id, owner_id, account_id, fingerprint_version, fingerprint,
  source_date, source_time, effective_date, transaction_label, description, post_balance_minor, currency)
select ('dddddddd-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, '11111111-1111-4111-8111-111111111111',
       ('cccccccc-0000-4000-8000-00000000000' || acct)::uuid, 'fingerprint-v1', md5(n::text) || md5(n::text),
       d::date, t::time, d::date, 'Invented label', descr, 100000, 'THB'
from (values
  (1, 1, '2026-05-01', '10:00', 'Invented TR to 1234-1357'),
  (2, 2, '2026-05-01', '10:00', 'Invented TR fr 5678-4242'),
  (3, 1, '2026-05-02', '09:00', 'Invented payment 777'),
  (4, 2, '2026-05-02', '09:00', 'Invented salary'),
  (5, 1, '2026-05-03', '10:00', 'Invented TR to 1357'),
  (6, 2, '2026-05-03', '10:05', 'Invented TR fr 4242'),
  (7, 2, '2026-05-04', '09:00', 'Invented TR fr 4242'),
  (8, 1, '2026-05-06', '10:00', 'Invented TR to 1357'),
  (9, 2, '2026-05-06', '10:00', 'Invented TR fr 4242'),
  (10, 1, '2026-05-08', '10:00', 'Invented TR to 1357'),
  (11, 2, '2026-05-10', '10:00', 'Invented TR fr 4242'),
  (12, 1, '2026-05-12', '10:00', 'Invented TR to 4242'),
  (13, 1, '2026-05-12', '10:00', 'Invented TR fr 4242')
) as v(n, acct, d, t, descr);

insert into public.source_components(id, owner_id, transaction_id, position, kind, amount_minor, currency)
select ('eeeeeeee-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, '11111111-1111-4111-8111-111111111111',
       ('dddddddd-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, 1,
       case when minor < 0 then 'withdrawal' else 'deposit' end, minor, 'THB'
from (values (1, -50000), (2, 50000), (3, -20000), (4, 20000), (5, -30000), (6, 30000), (7, 30000),
             (8, -40000), (9, 40000), (10, -60000), (11, 60000), (12, -70000), (13, 70000)) as v(n, minor);

-- Row 2 already carries a hand-written note; row 9 holds the owner's own reporting decision history.
insert into public.transaction_overlays(transaction_id, owner_id, note, include_in_reporting, revision)
values ('dddddddd-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'Invented note', true, 1),
       ('dddddddd-0000-4000-8000-000000000009', '11111111-1111-4111-8111-111111111111', null, true, 2);
insert into public.overlay_revisions(owner_id, transaction_id, revision, snapshot, changed_by)
values ('11111111-1111-4111-8111-111111111111', 'dddddddd-0000-4000-8000-000000000002', 1,
        '{"note":"Invented note","include_in_reporting":true}', '11111111-1111-4111-8111-111111111111'),
       ('11111111-1111-4111-8111-111111111111', 'dddddddd-0000-4000-8000-000000000009', 1,
        '{"include_in_reporting":false}', '11111111-1111-4111-8111-111111111111'),
       ('11111111-1111-4111-8111-111111111111', 'dddddddd-0000-4000-8000-000000000009', 2,
        '{"include_in_reporting":true}', '11111111-1111-4111-8111-111111111111');
set local session_replication_role = origin;

insert into auth.mfa_factors(id, user_id, friendly_name, factor_type, status, secret, created_at, updated_at)
values ('aaaaaaaa-0000-4000-8000-000000000126', '11111111-1111-4111-8111-111111111111',
        'auto exclude TOTP', 'totp', 'verified', 'SYNTHETICACCT', '2026-07-24T00:00:00Z', '2026-07-24T00:00:00Z');

select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal2"}',
  true
);

create temp table seq_before as
  select sequence from public.mutation_sequences where owner_id = '11111111-1111-4111-8111-111111111111';

select is(public.auto_exclude_internal_transfers(), '{"pairs": 2, "rows": 4}'::jsonb,
  'two pairs: the same-minute pair and the nearer of two same-amount deposits');

select set_eq(
  $$select transaction_id from public.transaction_overlays where not include_in_reporting$$,
  $$values ('dddddddd-0000-4000-8000-000000000001'::uuid), ('dddddddd-0000-4000-8000-000000000002'::uuid),
           ('dddddddd-0000-4000-8000-000000000005'::uuid), ('dddddddd-0000-4000-8000-000000000006'::uuid)$$,
  'exactly rows 1, 2, 5 and 6 are out of reporting');

select is((select note from public.transaction_overlays where transaction_id = 'dddddddd-0000-4000-8000-000000000002'),
  'Invented note', 'an existing note survives the automatic exclusion');

select is((select revision from public.transaction_overlays where transaction_id = 'dddddddd-0000-4000-8000-000000000002'),
  2, 'the automatic write is a new revision on top of the owner''s');

select is((select count(*)::integer from public.overlay_revisions where transaction_id = 'dddddddd-0000-4000-8000-000000000001'),
  1, 'a first write to a row records its revision');

select is((select count(*)::integer from public.audit_events where event_type = 'overlay.auto_excluded'),
  4, 'each excluded row has its own audit event');

select is((select sequence from public.mutation_sequences where owner_id = '11111111-1111-4111-8111-111111111111')
          - (select sequence from seq_before),
  1::bigint, 'one run advances the mutation sequence once, so the backup reads stale');

select is(jsonb_array_length(public.list_auto_excluded_transactions()), 4,
  'all four read back as auto-excluded');

select is(public.auto_exclude_internal_transfers(), '{"pairs": 0, "rows": 0}'::jsonb,
  'a second run finds nothing new');

select lives_ok(
  $$select public.update_transaction_overlay('dddddddd-0000-4000-8000-000000000001', 1, '{"include_in_reporting":true}'::jsonb)$$,
  'the owner can re-include an automatically excluded row');

select is(jsonb_array_length(public.list_auto_excluded_transactions()), 3,
  'a row the owner re-included no longer reads as auto-excluded');

select is(public.auto_exclude_internal_transfers(), '{"pairs": 0, "rows": 0}'::jsonb,
  'and it is never excluded again');

select ok(not has_function_privilege('anon', 'public.auto_exclude_internal_transfers()', 'execute'),
  'anon cannot run the automatic exclusion');

select * from finish();
rollback;
