begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

-- Migration 062: the duplicate marker. Every row is invented. What this proves: marking excludes and
-- lists the row; the owner's ordinary Exclude is not listed; a stale revision is refused; marking twice
-- is one event; other overlay fields survive; re-including clears the marker; grants, a weak session,
-- another user and a row that is not the caller's are all refused.

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
values ('cccccccc-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111',
        'KTB', 'Invented A', 'savings', '4242', 'THB', 'Asia/Bangkok');

insert into public.source_transactions(id, owner_id, account_id, fingerprint_version, fingerprint,
  source_date, source_time, effective_date, transaction_label, description, post_balance_minor, currency)
select ('dddddddd-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, '11111111-1111-4111-8111-111111111111',
       'cccccccc-0000-4000-8000-000000000001', 'fingerprint-v1', md5(n::text) || md5(n::text),
       '2026-05-01', '10:00', '2026-05-01', 'Invented label', 'Invented row ' || n, 100000, 'THB'
from generate_series(1, 3) as n;

insert into public.source_components(id, owner_id, transaction_id, position, kind, amount_minor, currency)
select ('eeeeeeee-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, '11111111-1111-4111-8111-111111111111',
       ('dddddddd-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, 1, 'withdrawal', -10000, 'THB'
from generate_series(1, 3) as n;

-- Row 1 carries a hand-written note at revision 1.
insert into public.transaction_overlays(transaction_id, owner_id, note, include_in_reporting, revision)
values ('dddddddd-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'Invented note', true, 1);
insert into public.overlay_revisions(owner_id, transaction_id, revision, snapshot, changed_by)
values ('11111111-1111-4111-8111-111111111111', 'dddddddd-0000-4000-8000-000000000001', 1,
        '{"note":"Invented note","include_in_reporting":true}', '11111111-1111-4111-8111-111111111111');
set local session_replication_role = origin;

insert into auth.mfa_factors(id, user_id, friendly_name, factor_type, status, secret, created_at, updated_at)
values ('aaaaaaaa-0000-4000-8000-000000000162', '11111111-1111-4111-8111-111111111111',
        'duplicate TOTP', 'totp', 'verified', 'SYNTHETICDUP', '2026-07-24T00:00:00Z', '2026-07-24T00:00:00Z');

select ok(
  has_function_privilege('authenticated', 'public.mark_duplicate(uuid, integer)', 'execute')
    and has_function_privilege('authenticated', 'public.list_duplicate_transactions()', 'execute')
    and not has_function_privilege('anon', 'public.mark_duplicate(uuid, integer)', 'execute')
    and not has_function_privilege('anon', 'public.list_duplicate_transactions()', 'execute'),
  'authenticated may call both functions and anon may call neither'
);

select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal2"}', true);

select is(public.list_duplicate_transactions(), '[]'::jsonb, 'nothing is marked at first');

select is((public.mark_duplicate('dddddddd-0000-4000-8000-000000000001', 1))->>'include_in_reporting', 'false',
  'marking returns the new overlay with the row excluded');

select is(public.list_duplicate_transactions(), '["dddddddd-0000-4000-8000-000000000001"]'::jsonb,
  'the marked row is listed');

select is((select note from public.transaction_overlays where transaction_id = 'dddddddd-0000-4000-8000-000000000001'),
  'Invented note', 'the existing note survives');

select is((select revision from public.transaction_overlays where transaction_id = 'dddddddd-0000-4000-8000-000000000001'),
  2, 'marking is a new revision on top of the owner''s');

select throws_ok(
  $$select public.mark_duplicate('dddddddd-0000-4000-8000-000000000002', 99)$$,
  'P0001', 'overlay revision conflict', 'a stale revision on an unmarked row is refused');

select is((public.mark_duplicate('dddddddd-0000-4000-8000-000000000001', 1))->>'revision', '2',
  'a retried mark at the revision it was sent with is a no-op, not a conflict');

select is((public.mark_duplicate('dddddddd-0000-4000-8000-000000000001', 2))->>'revision', '2',
  'marking an already-marked row at its current revision returns the current state');

select is((select count(*)::integer from public.audit_events where event_type = 'overlay.marked_duplicate'),
  1, 'marking twice leaves one marker event');

select is((select count(*)::integer from public.overlay_revisions where transaction_id = 'dddddddd-0000-4000-8000-000000000001'),
  2, 'and no second revision');

select lives_ok(
  $$select public.update_transaction_overlay('dddddddd-0000-4000-8000-000000000002', 0, '{"include_in_reporting":false}'::jsonb)$$,
  'the owner can exclude a row by hand');
select is(public.list_duplicate_transactions(), '["dddddddd-0000-4000-8000-000000000001"]'::jsonb,
  'a hand-excluded row is not listed as a duplicate');

select lives_ok(
  $$select public.update_transaction_overlay('dddddddd-0000-4000-8000-000000000001', 2, '{"include_in_reporting":true,"note":"Invented note"}'::jsonb)$$,
  'the owner can re-include a marked row');
select is(public.list_duplicate_transactions(), '[]'::jsonb,
  're-including clears the marker with no further write');

-- A later edit that keeps the row excluded does not clear the marker; include-then-exclude does.
select lives_ok(
  $$select public.update_transaction_overlay('dddddddd-0000-4000-8000-000000000003', 0, '{"include_in_reporting":false}'::jsonb)$$,
  'row 3 is excluded by hand');
select is((public.mark_duplicate('dddddddd-0000-4000-8000-000000000003', 1))->>'revision', '2', 'row 3 is marked');
select lives_ok(
  $$select public.update_transaction_overlay('dddddddd-0000-4000-8000-000000000003', 2, '{"include_in_reporting":false,"note":"Invented later note"}'::jsonb)$$,
  'the owner adds a note to the marked row');
select is(public.list_duplicate_transactions(), '["dddddddd-0000-4000-8000-000000000003"]'::jsonb,
  'a note edit after marking keeps it listed');
select lives_ok(
  $$select public.update_transaction_overlay('dddddddd-0000-4000-8000-000000000003', 3, '{"include_in_reporting":true}'::jsonb),
           public.update_transaction_overlay('dddddddd-0000-4000-8000-000000000003', 4, '{"include_in_reporting":false}'::jsonb)$$,
  'include then exclude again');
select is(public.list_duplicate_transactions(), '[]'::jsonb, 'include then exclude again clears the marker');

select throws_ok(
  $$select public.mark_duplicate('dddddddd-0000-4000-8000-0000000000ff', 0)$$,
  'P0001', 'transaction not owned', 'a row that is not the caller''s is refused');

select set_config('request.jwt.claims',
  '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated","aal":"aal2"}', true);
select throws_ok(
  $$select public.mark_duplicate('dddddddd-0000-4000-8000-000000000003', 0)$$,
  'P0001', 'strong owner access required', 'another user is refused');

select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal1"}', true);
select throws_ok(
  $$select public.mark_duplicate('dddddddd-0000-4000-8000-000000000003', 0)$$,
  'P0001', 'strong owner access required', 'a session without aal2 is refused');

select * from finish();
rollback;
