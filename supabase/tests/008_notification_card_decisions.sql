begin;
create extension if not exists pgtap with schema extensions;
select plan(33);

-- A card's correction overlay, its stored decision, and retirement (migration 017, PLAN task 29).
--
-- The contract these tests hold: a card's typed figures are correctable while its **binding is
-- not**; the owner's decision outranks the automatic rule; a balance disagreement is **refused by
-- default and storable only with an explicit acknowledgement**; a card and a slip may claim the
-- same statement row while two cards may not; and retirement is a decision rather than a deletion,
-- so it is reversible while the card row stays append-only.
--
-- Every refusal is asserted by its message rather than by "something went wrong" — a check that
-- passes because a *different* error fired is the failure mode this file exists to prevent.
--
-- Every account number, digit group, amount and balance below is invented, per
-- `docs/FIXTURE_POLICY.md`.

set local session_replication_role = replica;
delete from public.notification_card_decision_revisions;
delete from public.notification_card_decision_overlays;
delete from public.notification_card_correction_revisions;
delete from public.notification_card_correction_overlays;
delete from public.notification_cards;
delete from public.slip_match_revisions;
delete from public.slip_match_overlays;
delete from public.slips;
delete from public.source_components;
delete from public.source_transactions;
delete from public.audit_events;
delete from public.categories;
delete from public.accounts;
update public.mutation_sequences
set sequence = 0, last_exported_sequence = 0, updated_at = '2026-07-24T00:00:00Z'
where owner_id = '11111111-1111-4111-8111-111111111111';
delete from auth.mfa_factors where user_id = '11111111-1111-4111-8111-111111111111';

insert into public.accounts(id, owner_id, bank_code, label, account_type, last_four, currency, timezone)
values
  ('cccccccc-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111',
   'SCB', 'Card decision SCB account', 'savings', '4321', 'THB', 'Asia/Bangkok'),
  ('cccccccc-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111',
   'SCB', 'Card decision second SCB account', 'savings', '1357', 'THB', 'Asia/Bangkok');

-- Three statement rows. The first two share an account, an amount and a day and differ only in
-- their running balance, which is the case the whole design turns on. The third is on the
-- *other* account and is otherwise identical to the first, so the account check has something
-- real to refuse rather than failing for want of a row.
insert into public.source_transactions(id, owner_id, account_id, fingerprint_version, fingerprint,
  source_date, source_time, effective_date, transaction_label, description, post_balance_minor, currency)
values
  ('dddddddd-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'cccccccc-0000-4000-8000-000000000001',
   'fingerprint-v1', repeat('a', 64), '2026-07-20', '09:00', '2026-07-20', 'Invented label', 'Invented description', '500000', 'THB'),
  ('dddddddd-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'cccccccc-0000-4000-8000-000000000001',
   'fingerprint-v1', repeat('b', 64), '2026-07-20', '10:00', '2026-07-20', 'Invented label two', 'Invented description two', '491000', 'THB'),
  ('dddddddd-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 'cccccccc-0000-4000-8000-000000000002',
   'fingerprint-v1', repeat('c', 64), '2026-07-20', '09:00', '2026-07-20', 'Invented label three', 'Invented description three', '500000', 'THB');

insert into public.source_components(id, owner_id, transaction_id, position, kind, amount_minor, currency)
values
  ('eeeeeeee-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'dddddddd-0000-4000-8000-000000000001', 1, 'withdrawal', -9000, 'THB'),
  ('eeeeeeee-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'dddddddd-0000-4000-8000-000000000002', 1, 'withdrawal', -9000, 'THB'),
  ('eeeeeeee-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 'dddddddd-0000-4000-8000-000000000003', 1, 'withdrawal', -9000, 'THB');
set local session_replication_role = origin;

insert into auth.mfa_factors(id, user_id, friendly_name, factor_type, status, secret, created_at, updated_at)
values ('aaaaaaaa-0000-4000-8000-000000000041', '11111111-1111-4111-8111-111111111111',
        'card decision TOTP', 'totp', 'verified', 'SYNTHETICCARDTWO', '2026-07-24T00:00:00Z', '2026-07-24T00:00:00Z');

select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal2"}',
  true
);

-- ------------------------------------------------------------- least privilege

select ok(
  has_table_privilege('authenticated', 'public.notification_card_correction_overlays', 'select')
    and has_table_privilege('authenticated', 'public.notification_card_decision_overlays', 'select'),
  'authenticated may read its own card corrections and decisions'
);
select ok(
  not has_table_privilege('authenticated', 'public.notification_card_correction_overlays', 'insert')
    and not has_table_privilege('authenticated', 'public.notification_card_correction_overlays', 'update')
    and not has_table_privilege('authenticated', 'public.notification_card_correction_overlays', 'delete')
    and not has_table_privilege('authenticated', 'public.notification_card_decision_overlays', 'insert')
    and not has_table_privilege('authenticated', 'public.notification_card_decision_overlays', 'update')
    and not has_table_privilege('authenticated', 'public.notification_card_decision_overlays', 'delete'),
  'authenticated holds no direct write on either card overlay'
);
select ok(
  (select bool_and(relrowsecurity and relforcerowsecurity) from pg_class
    where oid in ('public.notification_card_correction_overlays'::regclass,
                  'public.notification_card_correction_revisions'::regclass,
                  'public.notification_card_decision_overlays'::regclass,
                  'public.notification_card_decision_revisions'::regclass)),
  'all four card overlay tables have row level security enabled and forced'
);

-- A card to decide about: -90.00 out on 2026-07-20 at 09:00, balance 4,910.00. It fits both of
-- the first two rows on amount and date, and only the second on balance.
select ok(
  (public.capture_notification_card(jsonb_build_object(
    'accountId', 'cccccccc-0000-4000-8000-000000000001',
    'channel', 'SCB Connect', 'printedAccountDigits', '4321', 'kind', 'withdrawal',
    'amountMinor', '-9000', 'balanceMinor', '491000',
    'occurredOn', '2026-07-20', 'occurredAtTime', '09:00')) ->> 'captured')::boolean,
  'a card is captured for the decision contracts to act on'
);

create temporary table card_ids as
select id from public.notification_cards order by captured_at limit 1;

-- ------------------------------------------------------------ deciding a card

-- The balance is the fail-closed cross-check, and this is the assertion the whole design rests
-- on: the row that fits on amount and date but prints a different balance is **refused**, and it
-- is refused by name rather than by any other error.
select throws_ok(
  format($$select public.set_notification_card_decision(%L, 0, 'matched', 'dddddddd-0000-4000-8000-000000000001', false)$$,
    (select id from card_ids)),
  'notification card match balance mismatch',
  'a statement row whose printed balance contradicts the card is refused without an acknowledgement'
);

-- The account, not the bank. Both accounts are SCB and both rows carry the same amount and the
-- same balance, so only the account can tell them apart — a bank check would accept this.
select throws_ok(
  format($$select public.set_notification_card_decision(%L, 0, 'matched', 'dddddddd-0000-4000-8000-000000000003', true)$$,
    (select id from card_ids)),
  'notification card match account mismatch',
  'a row at the same bank on a different account is refused even with the acknowledgement'
);

-- The agreeing row pairs with no acknowledgement needed, and the consent is stored as false.
select is(
  (public.set_notification_card_decision(
    (select id from card_ids), 0, 'matched', 'dddddddd-0000-4000-8000-000000000002', false) ->> 'decision'),
  'matched',
  'the row whose printed balance equals the card pairs without any acknowledgement'
);
select is(
  (select accepted_balance_mismatch from public.notification_card_decision_overlays),
  false,
  'a pairing whose balances agree records no accepted mismatch'
);
select is(
  (select transaction_id from public.notification_card_decision_overlays),
  'dddddddd-0000-4000-8000-000000000002'::uuid,
  'the stored decision names the row the balance chose'
);
select is(
  (select count(*)::integer from public.notification_card_decision_revisions),
  1,
  'a decision writes exactly one append-only revision'
);
select is(
  (select event_type from public.audit_events where entity_type = 'notification_card' order by id desc limit 1),
  'notification_card.decision.matched',
  'a decision writes an audit event naming what was decided'
);

-- Optimistic concurrency, exactly as every other overlay in this schema does it.
select throws_ok(
  format($$select public.set_notification_card_decision(%L, 0, 'unmatched', null, false)$$, (select id from card_ids)),
  'notification card decision revision conflict',
  'a decision sent against a stale revision is refused'
);

-- The overrule, and the consent it stores. The disagreeing row is accepted **only** because the
-- acknowledgement is present, and what is recorded is the acknowledgement rather than a
-- comparison that would go stale the moment the balance is corrected.
select is(
  (public.set_notification_card_decision(
    (select id from card_ids), 1, 'matched', 'dddddddd-0000-4000-8000-000000000001', true) ->> 'accepted_balance_mismatch'),
  'true',
  'a disagreeing balance is storable with an explicit acknowledgement'
);
select is(
  (select accepted_balance_mismatch from public.notification_card_decision_overlays),
  true,
  'the acknowledgement is stored on the overlay rather than recomputed'
);

-- ------------------------------------------------- a card and a slip are not rivals

insert into public.slips(id, owner_id, bank_code, bank_qr_code, slip_reference, qr_payload, kind,
  amount_minor, currency, occurred_on, occurred_at_time)
values ('ffffffff-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'SCB',
  '014', 'INVENTEDSLIPREF0001', 'invented-payload', 'withdrawal', -9000, 'THB', '2026-07-20', '09:00');

-- The row the card claims is claimed by a slip too, and that is allowed: one payment can produce
-- both records, so they are two pieces of evidence rather than rivals for a scarce row (D-102).
-- The two partial unique indexes are separate precisely so this write succeeds.
select is(
  (public.set_slip_match('ffffffff-0000-4000-8000-000000000001', 0, 'matched',
    'dddddddd-0000-4000-8000-000000000001') ->> 'decision'),
  'matched',
  'a slip may claim the same statement row a card has already claimed'
);

-- Two *cards* claiming one row is refused, which is what the card index is for.
select ok(
  (public.capture_notification_card(jsonb_build_object(
    'accountId', 'cccccccc-0000-4000-8000-000000000001',
    'channel', 'SCB Connect', 'printedAccountDigits', '4321', 'kind', 'withdrawal',
    'amountMinor', '-9000', 'balanceMinor', '491000',
    'occurredOn', '2026-07-20', 'occurredAtTime', '11:30')) ->> 'captured')::boolean,
  'a second card is captured, differing only in its printed time'
);
select throws_ok(
  format($$select public.set_notification_card_decision(%L, 0, 'matched', 'dddddddd-0000-4000-8000-000000000001', true)$$,
    (select id from public.notification_cards where occurred_at_time = '11:30')),
  'statement row already claimed by another notification card',
  'a second card cannot claim a row another card already holds'
);

-- ---------------------------------------------------------------- retirement

select is(
  (public.set_notification_card_decision(
    (select id from public.notification_cards where occurred_at_time = '11:30'), 0, 'not-a-payment', null, false) ->> 'decision'),
  'not-a-payment',
  'a card can be retired, which is the remedy for a wrong binding or a duplicate capture'
);
select is(
  (select transaction_id from public.notification_card_decision_overlays
    where card_id = (select id from public.notification_cards where occurred_at_time = '11:30')),
  null,
  'a retired card names no statement row'
);
-- Reversible, which is the property that makes retirement safe on an append-only table: the card
-- row cannot be deleted, so the decision is the only thing that ever moves.
select is(
  (public.set_notification_card_decision(
    (select id from public.notification_cards where occurred_at_time = '11:30'), 1, 'unmatched', null, false) ->> 'decision'),
  'unmatched',
  'a card retired by mistake is un-retired by deciding something else'
);
-- Accepting a mismatch is meaningless without a row to disagree with, and the CHECK says so.
-- Asserted from the catalogue rather than by attempting the insert: `authenticated` holds no
-- insert grant on this table, so a direct write is refused for *privilege* long before the CHECK
-- is consulted, and a test written that way would pass on the wrong error.
select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.notification_card_decision_overlays'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%accepted_balance_mismatch%'
      and pg_get_constraintdef(oid) ilike '%matched%'
  ),
  'an accepted balance mismatch is constrained to a decision that names a row'
);

-- ------------------------------------------------------------ correcting a card

-- The binding is not correctable, and the overlay has no column for it. This is the structural
-- half of D-103's second decision: retirement is the remedy for a wrong account because there is
-- nowhere to write a corrected one.
select ok(
  not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'notification_card_correction_overlays'
      and column_name in ('account_id', 'channel', 'printed_account_digits')
  ),
  'a card correction cannot re-bind the account, the channel or the printed digits'
);

-- A correction that breaks a stored match is refused rather than quietly re-pairing. The card
-- from `card_ids` is matched to row one at -90.00; correcting the amount contradicts that.
select throws_ok(
  format($$select public.set_notification_card_correction(%L, 0, 'withdrawal', '-9500', null, null, null, null, null, null)$$,
    (select id from card_ids)),
  'notification card correction conflicts with stored match',
  'correcting the amount under a stored match is refused'
);

-- The balance half of the same rule, and the part that respects the owner's own consent: this
-- card's pairing was made *with* an accepted mismatch, so a balance correction is not re-refused
-- for the disagreement it was already made in spite of.
select is(
  (public.set_notification_card_correction(
    (select id from card_ids), 0, null, null, '777777', null, null, null, null, null) ->> 'balance_minor'),
  '777777',
  'a balance correction is allowed under a pairing that already accepted a mismatch'
);
select is(
  (select count(*)::integer from public.notification_card_correction_revisions),
  1,
  'a correction writes exactly one append-only revision'
);
select is(
  (select event_type from public.audit_events where entity_type = 'notification_card' order by id desc limit 1),
  'notification_card.corrected',
  'a correction writes its own audit event'
);

-- The coupling and the sign rule, the same two the slip and cash overlays carry.
select throws_ok(
  format($$select public.set_notification_card_correction(%L, 1, null, '-9500', null, null, null, null, null, null)$$,
    (select id from card_ids)),
  'notification card correction amount and kind move together',
  'a corrected amount without its direction is refused'
);
select throws_ok(
  format($$select public.set_notification_card_correction(%L, 1, 'deposit', '-9500', null, null, null, null, null, null)$$,
    (select id from card_ids)),
  'notification card amount sign does not match its kind',
  'a corrected amount whose sign contradicts its direction is refused'
);
-- The balance is money and is held to the canonical-text rule the amount is, rather than being
-- treated as metadata because it is not the transaction's own value.
select throws_ok(
  format($$select public.set_notification_card_correction(%L, 1, null, null, '007', null, null, null, null, null)$$,
    (select id from card_ids)),
  'notification card balance must be canonical int64 text',
  'a corrected balance in non-canonical text is refused'
);

-- Append-only revisions, like every other history table in this schema.
select throws_ok(
  $$update public.notification_card_decision_revisions set revision = 99$$,
  'notification_card_decision_revisions is append-only: UPDATE is forbidden',
  'a decision revision cannot be rewritten'
);
select throws_ok(
  $$delete from public.notification_card_correction_revisions$$,
  'notification_card_correction_revisions is append-only: DELETE is forbidden',
  'a correction revision cannot be deleted'
);

-- ------------------------------------------------------------------- backup v7

select is(
  (public.export_backup_snapshot() ->> 'schemaVersion')::integer,
  7,
  'the export declares schema version 7'
);
select ok(
  (public.export_backup_snapshot() -> 'tableCounts') ?& array[
    'notification_card_correction_overlays', 'notification_card_correction_revisions',
    'notification_card_decision_overlays', 'notification_card_decision_revisions'],
  'the export carries all four new tables, so the backup still covers every owner table'
);

select * from finish();
rollback;
