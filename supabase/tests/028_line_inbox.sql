begin;
create extension if not exists pgtap with schema extensions;
select plan(32);

-- The LINE bot's holding table (migration 043, D-241). What this proves: nothing in it is reachable
-- by anon or a signed-in session except through the functions; the webhook entry point refuses
-- without the right secret, refuses anything but a well-formed JPEG/PNG of at most 10 MB under a
-- numeric message ID, stores a redelivered message once, and holds the 24-hour and total caps;
-- only the owner with strong access sets the secret (stored as a hash) and lists, reads and
-- deletes; listing drops week-old redelivery markers but never an unmoved image. Every value below is invented.

set local session_replication_role = replica;
delete from private.line_inbox_items;
delete from private.line_webhook_config;
delete from auth.mfa_factors where user_id = '11111111-1111-4111-8111-111111111111';
set local session_replication_role = origin;

insert into auth.mfa_factors(id, user_id, friendly_name, factor_type, status, secret, created_at, updated_at)
values ('aaaaaaaa-0000-4000-8000-000000000043', '11111111-1111-4111-8111-111111111111',
  'line TOTP', 'totp', 'verified', 'SYNTHETICLINE', '2026-10-04T00:00:00Z', '2026-10-04T00:00:00Z');

-- An invented PNG: the 8-byte signature and one byte. Only the signature is checked.
create temporary table fixture(png text, png_as_jpeg text) on commit drop;
insert into fixture values (encode('\x89504e470d0a1a0a00'::bytea, 'base64'), encode('\x89504e470d0a1a0a00'::bytea, 'base64'));
grant select on fixture to anon, authenticated;

-- anon, before any secret exists
set local role anon;
select throws_ok($$select count(*) from private.line_inbox_items$$, '42501', null, 'anon cannot read the holding table');
select throws_ok($$select public.set_line_webhook_secret('invented-secret-invented-secret-0001')$$, '42501', null, 'anon cannot set the webhook secret');
select throws_ok($$select * from public.list_line_inbox()$$, '42501', null, 'anon cannot list the holding table');
select throws_ok($$select public.read_line_inbox_item(1)$$, '42501', null, 'anon cannot read a held image');
select throws_ok($$select public.delete_line_inbox_item(1)$$, '42501', null, 'anon cannot delete a held image');
select throws_ok($$select public.line_inbox_enqueue('invented-secret-invented-secret-0001', '100001', 'image/png', (select png from fixture))$$,
  'P0001', 'line inbox refused', 'the webhook is refused while no secret is configured');
reset role;

-- authenticated, aal1
select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select throws_ok($$select public.set_line_webhook_secret('invented-secret-invented-secret-0001')$$,
  'P0001', 'strong owner access required', 'a session without aal2 cannot set the webhook secret');
select throws_ok($$select * from public.list_line_inbox()$$,
  'P0001', 'strong owner access required', 'a session without aal2 cannot list the holding table');
reset role;

-- authenticated, aal2, the owner
select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;
select throws_ok($$select public.set_line_webhook_secret('too-short')$$,
  'P0001', 'webhook secret must be 32 to 256 characters', 'a short webhook secret is refused');
select lives_ok($$select public.set_line_webhook_secret('invented-secret-invented-secret-0001')$$, 'the owner with aal2 sets the webhook secret');
select throws_ok($$select public.line_inbox_enqueue('invented-secret-invented-secret-0001', '100001', 'image/png', (select png from fixture))$$,
  '42501', null, 'a signed-in session cannot call the webhook entry point');
reset role;

select is(
  (select secret_sha256 from private.line_webhook_config),
  extensions.digest('invented-secret-invented-secret-0001', 'sha256'),
  'only the SHA-256 of the secret is stored');

-- anon, as the webhook
set local role anon;
select throws_ok($$select public.line_inbox_enqueue('invented-secret-invented-secret-WRONG', '100001', 'image/png', (select png from fixture))$$,
  'P0001', 'line inbox refused', 'a wrong secret is refused');
select is(public.line_inbox_enqueue('invented-secret-invented-secret-0001', '100001', 'image/png', (select png from fixture)),
  'stored', 'the right secret stores a PNG');
select is(public.line_inbox_enqueue('invented-secret-invented-secret-0001', '100001', 'image/png', (select png from fixture)),
  'duplicate', 'a redelivered message ID is answered as a duplicate');
select throws_ok($$select public.line_inbox_enqueue('invented-secret-invented-secret-0001', '100002', 'image/jpeg', (select png_as_jpeg from fixture))$$,
  'P0001', 'line inbox refused', 'bytes that do not match the content type are refused');
select throws_ok($$select public.line_inbox_enqueue('invented-secret-invented-secret-0001', '10000x', 'image/png', (select png from fixture))$$,
  'P0001', 'line inbox refused', 'a non-numeric message ID is refused');
select throws_ok($$select public.line_inbox_enqueue('invented-secret-invented-secret-0001', '100003', 'image/gif', (select png from fixture))$$,
  'P0001', 'line inbox refused', 'a content type other than JPEG or PNG is refused');
select throws_ok($$select public.line_inbox_enqueue('invented-secret-invented-secret-0001', '100004', 'image/png', '%%%not base64%%%')$$,
  'P0001', 'line inbox refused', 'content that is not base64 is refused');
select throws_ok($$select public.line_inbox_enqueue('invented-secret-invented-secret-0001', '100005', 'image/png',
    translate(encode('\x89504e470d0a1a0a'::bytea || decode(repeat('00', 10485753), 'hex'), 'base64'), E'\n', ''))$$,
  'P0001', 'line inbox refused', 'an image over 10 MB is refused');
reset role;

select is((select count(*) from private.line_inbox_items), 1::bigint, 'only the one good image was stored');

-- The 24-hour cap: 199 more received now makes 200.
insert into private.line_inbox_items(owner_id, line_message_id, content_type, content)
select '11111111-1111-4111-8111-111111111111', (200000 + g)::text, 'image/png', '\x89504e470d0a1a0a00'::bytea
from generate_series(1, 199) g;
set local role anon;
select throws_ok($$select public.line_inbox_enqueue('invented-secret-invented-secret-0001', '100006', 'image/png', (select png from fixture))$$,
  'P0001', 'line inbox refused', 'the 201st image in 24 hours is refused');
reset role;

-- The total cap: 500 held, all older than 24 hours.
update private.line_inbox_items set received_at = now() - interval '2 days';
insert into private.line_inbox_items(owner_id, line_message_id, content_type, content, received_at)
select '11111111-1111-4111-8111-111111111111', (300000 + g)::text, 'image/png', '\x89504e470d0a1a0a00'::bytea, now() - interval '2 days'
from generate_series(1, 300) g;
set local role anon;
select throws_ok($$select public.line_inbox_enqueue('invented-secret-invented-secret-0001', '100007', 'image/png', (select png from fixture))$$,
  'P0001', 'line inbox refused', 'the 501st held image is refused');
reset role;

-- Owner side: an 8-day-old marker expires on list; an 8-day-old unmoved image does not.
delete from private.line_inbox_items where line_message_id <> '100001';
insert into private.line_inbox_items(owner_id, line_message_id, content_type, content, received_at)
values ('11111111-1111-4111-8111-111111111111', '400001', 'image/png', null, now() - interval '8 days'),
  ('11111111-1111-4111-8111-111111111111', '400002', 'image/png', '\x89504e470d0a1a0a00'::bytea, now() - interval '8 days');

select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;
select is((select array_agg(line_message_id) from public.list_line_inbox()), array['400002', '100001'],
  'listing returns every unmoved image oldest first, however old');
select is(public.delete_line_inbox_item((select id from public.list_line_inbox() where line_message_id = '400002')), true,
  'the owner drops the old image after moving it');
reset role;
select is((select count(*) from private.line_inbox_items where line_message_id = '400001'), 0::bigint,
  'listing dropped the week-old redelivery marker');
select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;
select is(public.read_line_inbox_item((select id from public.list_line_inbox())), (select png from fixture),
  'the owner reads a held image back unchanged');
select is(public.delete_line_inbox_item((select id from public.list_line_inbox())), true, 'the owner deletes a held image');
select is((select count(*) from public.list_line_inbox()), 0::bigint, 'a moved image is no longer listed');
reset role;

select is((select count(*) from private.line_inbox_items where content is not null), 0::bigint, 'no image bytes are left held');
set local role anon;
select is(public.line_inbox_enqueue('invented-secret-invented-secret-0001', '100001', 'image/png', (select png from fixture)),
  'duplicate', 'a redelivery after the move is still a duplicate, not queued again');
reset role;
-- Markers do not count toward the 500-held cap: 499 held plus the marker still accepts one more.
insert into private.line_inbox_items(owner_id, line_message_id, content_type, content, received_at)
select '11111111-1111-4111-8111-111111111111', (500000 + g)::text, 'image/png', '\x89504e470d0a1a0a00'::bytea, now() - interval '2 days'
from generate_series(1, 499) g;
set local role anon;
select is(public.line_inbox_enqueue('invented-secret-invented-secret-0001', '100008', 'image/png', (select png from fixture)),
  'stored', 'a moved image''s marker does not count toward the held cap');
reset role;

select * from finish();
rollback;
