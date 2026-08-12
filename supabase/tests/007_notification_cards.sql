begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

-- Bank notification cards (migration 016, PLAN task 27).
--
-- The contract these tests hold: a card is bound to one of the owner's accounts at the bank
-- its channel belongs to, identified by a fingerprint the database computes rather than the
-- caller supplies, append-only once captured, and invisible to `authenticated` except through
-- `capture_notification_card`. Every refusal is asserted by its message rather than by
-- "something went wrong" — a check that passes because a *different* error fired is the
-- failure mode this file exists to prevent.
--
-- Every account number, digit group and amount below is invented, per `docs/FIXTURE_POLICY.md`.
-- The real cards were read under a grant on 2026-08-11 and 2026-08-12, and only shapes and
-- counts left that reading.

set local session_replication_role = replica;
delete from public.notification_cards;
delete from public.audit_events;
delete from public.categories;
delete from public.accounts;
update public.mutation_sequences
set sequence = 0, last_exported_sequence = 0, updated_at = '2026-07-24T00:00:00Z'
where owner_id = '11111111-1111-4111-8111-111111111111';
delete from auth.mfa_factors where user_id = '11111111-1111-4111-8111-111111111111';

-- Two accounts at different banks. The KBANK one exists so the channel/bank check below has
-- something real to refuse against rather than failing for want of an account.
insert into public.accounts(id, owner_id, bank_code, label, account_type, last_four, currency, timezone)
values
  ('cccccccc-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111',
   'SCB', 'Card contract SCB account', 'savings', '4321', 'THB', 'Asia/Bangkok'),
  ('cccccccc-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111',
   'KBANK', 'Card contract KBANK account', 'savings', '8765', 'THB', 'Asia/Bangkok');
set local session_replication_role = origin;

insert into auth.mfa_factors(id, user_id, friendly_name, factor_type, status, secret, created_at, updated_at)
values ('aaaaaaaa-0000-4000-8000-000000000031', '11111111-1111-4111-8111-111111111111',
        'card contract TOTP', 'totp', 'verified', 'SYNTHETICCARDONE', '2026-07-24T00:00:00Z', '2026-07-24T00:00:00Z');

select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal2"}',
  true
);

-- Least privilege: the table is readable, and writable only through the function.
select ok(
  has_table_privilege('authenticated', 'public.notification_cards', 'select'),
  'authenticated may read its own notification cards'
);
select ok(
  not has_table_privilege('authenticated', 'public.notification_cards', 'insert')
    and not has_table_privilege('authenticated', 'public.notification_cards', 'update')
    and not has_table_privilege('authenticated', 'public.notification_cards', 'delete'),
  'authenticated holds no direct write on notification cards'
);
select ok(
  (select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.notification_cards'::regclass),
  'notification_cards has row level security enabled and forced'
);
-- The fingerprint helper is the database's own identity computation and must not be reachable
-- by a caller, who could otherwise probe it to learn whether a card is already held.
select ok(
  not has_function_privilege('authenticated',
    'private.notification_card_fingerprint(uuid,text,text,bigint,date,time,bigint)', 'execute'),
  'authenticated cannot call the fingerprint helper directly'
);

-- A capture, and what it stores.
select is(
  public.capture_notification_card(jsonb_build_object(
    'accountId', 'cccccccc-0000-4000-8000-000000000001',
    'channel', 'SCB Connect', 'printedAccountDigits', '4321',
    'kind', 'withdrawal', 'amountMinor', '-24500', 'currency', 'THB',
    'occurredOn', '2026-07-20', 'occurredAtTime', '13:45', 'balanceMinor', '1099500',
    'note', 'invented fixture'
  ))->>'captured',
  'true',
  'a new card reports itself as captured'
);
select is((select count(*)::text from public.notification_cards), '1', 'the card is stored');
select is(
  (select amount_minor::text || '/' || balance_minor::text from public.notification_cards),
  '-24500/1099500',
  'both the amount and the printed balance are stored in minor units'
);
-- The balance is the reason this table earns its place: it breaks ties the amount cannot and
-- cross-checks a proposed match. A card stored without it would be a worse cash entry.
select is(
  (select fingerprint_version from public.notification_cards),
  'card-fingerprint-v1',
  'the row records which fingerprint rule produced its identity'
);
select is(
  (select fingerprint from public.notification_cards),
  private.notification_card_fingerprint(
    'cccccccc-0000-4000-8000-000000000001', 'SCB Connect', 'withdrawal', -24500,
    '2026-07-20'::date, '13:45'::time, 1099500),
  'the stored fingerprint is the one the database computes from the row, not one supplied'
);
select is(
  (select sequence::text from public.mutation_sequences where owner_id = '11111111-1111-4111-8111-111111111111'),
  '1',
  'capturing a card bumps the mutation sequence, staling the last backup'
);
select is(
  (select count(*)::text from public.audit_events where event_type = 'notification_card.capture'),
  '1',
  'capturing a card writes one audit event'
);
-- The audit detail carries structure, not values: no amount, balance, counterparty or digits.
select ok(
  (select not (detail ? 'amount_minor') and not (detail ? 'balance_minor')
     and not (detail ? 'counterparty') and not (detail ? 'printed_account_digits')
     from public.audit_events where event_type = 'notification_card.capture'),
  'the audit event records no amount, balance, counterparty or account digits'
);

-- Idempotency on the computed fingerprint. Re-sharing the same screenshot is the expected
-- accident, exactly as it is for a slip, and must be a no-op rather than a duplicate row.
select is(
  public.capture_notification_card(jsonb_build_object(
    'accountId', 'cccccccc-0000-4000-8000-000000000001',
    'channel', 'SCB Connect', 'printedAccountDigits', '4321',
    'kind', 'withdrawal', 'amountMinor', '-24500', 'currency', 'THB',
    'occurredOn', '2026-07-20', 'occurredAtTime', '13:45', 'balanceMinor', '1099500'
  ))->>'captured',
  'false',
  're-capturing the same card reports that nothing was captured'
);
select is((select count(*)::text from public.notification_cards), '1', 're-capturing stores no second row');
select is(
  (select sequence::text from public.mutation_sequences where owner_id = '11111111-1111-4111-8111-111111111111'),
  '1',
  'a no-op re-capture does not stale the backup'
);
-- Two payments of the same amount at the same minute would be indistinguishable without the
-- balance, and this is the case the measurement said the balance answers: a running balance is
-- never shared by two transactions on one account.
select is(
  public.capture_notification_card(jsonb_build_object(
    'accountId', 'cccccccc-0000-4000-8000-000000000001',
    'channel', 'SCB Connect', 'printedAccountDigits', '4321',
    'kind', 'withdrawal', 'amountMinor', '-24500', 'currency', 'THB',
    'occurredOn', '2026-07-20', 'occurredAtTime', '13:45', 'balanceMinor', '1075000'
  ))->>'captured',
  'true',
  'the same amount at the same minute on a different balance is a distinct card'
);

-- The channel must belong to the bound account's bank. Without this, the per-layout digit rule
-- could bind an SCB card to a KBANK account whose stored last four happened to match.
select throws_ok(
  $$select public.capture_notification_card(jsonb_build_object(
      'accountId','cccccccc-0000-4000-8000-000000000002',
      'channel','SCB Connect','printedAccountDigits','8765',
      'kind','withdrawal','amountMinor','-100','currency','THB',
      'occurredOn','2026-07-20','occurredAtTime','09:00','balanceMinor','1000'))$$,
  'notification card channel does not match the account bank',
  'a card cannot be bound to an account at another bank'
);
select throws_ok(
  $$select public.capture_notification_card(jsonb_build_object(
      'accountId','cccccccc-0000-4000-8000-000000000009',
      'channel','SCB Connect','printedAccountDigits','4321',
      'kind','withdrawal','amountMinor','-100','currency','THB',
      'occurredOn','2026-07-20','occurredAtTime','09:00','balanceMinor','1000'))$$,
  'notification card account not owned',
  'a card naming an account this ledger does not hold is refused'
);
select throws_ok(
  $$select public.capture_notification_card(jsonb_build_object(
      'accountId','cccccccc-0000-4000-8000-000000000001',
      'channel','LINE BK','printedAccountDigits','4321',
      'kind','withdrawal','amountMinor','-100','currency','THB',
      'occurredOn','2026-07-20','occurredAtTime','09:00','balanceMinor','1000'))$$,
  'unknown notification card channel',
  'a channel no layout is registered for is refused'
);

-- The 543-year shift, refused at the database as well as resolved per layout in the client.
-- Two of the three layouts print a two-digit Buddhist year, and D-031 is what happens when one
-- rule is applied globally: a whole statement dated 43 years early, parsing cleanly throughout.
select throws_ok(
  $$select public.capture_notification_card(jsonb_build_object(
      'accountId','cccccccc-0000-4000-8000-000000000001',
      'channel','SCB Connect','printedAccountDigits','4321',
      'kind','withdrawal','amountMinor','-100','currency','THB',
      'occurredOn','2569-07-20','occurredAtTime','09:00','balanceMinor','1000'))$$,
  'notification card date is outside the plausible window',
  'a Buddhist-era year resolved through unconverted is refused'
);

-- Money contracts, for both figures. The balance is money and is checked as money.
select throws_ok(
  $$select public.capture_notification_card(jsonb_build_object(
      'accountId','cccccccc-0000-4000-8000-000000000001',
      'channel','SCB Connect','printedAccountDigits','4321',
      'kind','withdrawal','amountMinor','-01','currency','THB',
      'occurredOn','2026-07-20','occurredAtTime','09:00','balanceMinor','1000'))$$,
  'notification card amount must be canonical int64 text',
  'a non-canonical amount is refused before any cast'
);
select throws_ok(
  $$select public.capture_notification_card(jsonb_build_object(
      'accountId','cccccccc-0000-4000-8000-000000000001',
      'channel','SCB Connect','printedAccountDigits','4321',
      'kind','withdrawal','amountMinor','-100','currency','THB',
      'occurredOn','2026-07-20','occurredAtTime','09:00','balanceMinor',1000))$$,
  'notification card balance must be canonical int64 text',
  'a balance sent as a JSON number is refused rather than cast'
);
select throws_ok(
  $$select public.capture_notification_card(jsonb_build_object(
      'accountId','cccccccc-0000-4000-8000-000000000001',
      'channel','SCB Connect','printedAccountDigits','4321',
      'kind','withdrawal','amountMinor','100','currency','THB',
      'occurredOn','2026-07-20','occurredAtTime','09:00','balanceMinor','1000'))$$,
  'invalid notification card',
  'a withdrawal with a positive amount is refused'
);
select throws_ok(
  $$select public.capture_notification_card(jsonb_build_object(
      'accountId','cccccccc-0000-4000-8000-000000000001',
      'channel','SCB Connect','printedAccountDigits','43',
      'kind','withdrawal','amountMinor','-100','currency','THB',
      'occurredOn','2026-07-20','occurredAtTime','09:00','balanceMinor','1000'))$$,
  'invalid notification card',
  'printed account digits outside the four-digit shape are refused'
);

-- Append-only, like every other ledger-fact table. Correcting a captured card is deliberately
-- not offered yet; the confirm form is the review step (migration 016).
select throws_ok(
  $$update public.notification_cards set amount_minor = -1 where channel = 'SCB Connect'$$,
  'notification_cards is append-only: UPDATE is forbidden',
  'a captured card cannot be updated'
);
select throws_ok(
  $$delete from public.notification_cards where channel = 'SCB Connect'$$,
  'notification_cards is append-only: DELETE is forbidden',
  'a captured card cannot be deleted'
);

select * from finish();
rollback;
