begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

-- The private `inbox` bucket (migration 042, D-235, reverses D-050: images are now stored,
-- temporarily — deleted on import; held files expire after 7 days, enforced by the app's drain,
-- not by the migration). What this proves: the bucket exists, is private, and carries the 40 MB
-- and MIME limits; exactly three policies (select, insert, delete) cover it and none updates;
-- anon and a session without aal2 can neither read nor write it; the owner with aal2 can write
-- into their own folder and not into another uid's. Every value below is invented.

set local session_replication_role = replica;
delete from storage.objects where bucket_id = 'inbox';
delete from auth.mfa_factors where user_id = '11111111-1111-4111-8111-111111111111';
set local session_replication_role = origin;

insert into auth.mfa_factors(id, user_id, friendly_name, factor_type, status, secret, created_at, updated_at)
values ('aaaaaaaa-0000-4000-8000-000000000042', '11111111-1111-4111-8111-111111111111',
  'inbox TOTP', 'totp', 'verified', 'SYNTHETICINBOX', '2026-09-30T00:00:00Z', '2026-09-30T00:00:00Z');

select is(
  (select public from storage.buckets where id = 'inbox'), false, 'the inbox bucket exists and is private');
select is(
  (select file_size_limit from storage.buckets where id = 'inbox'), 41943040::bigint, 'the inbox bucket caps a file at 40 MB');
select is(
  (select array(select unnest(allowed_mime_types) order by 1) from storage.buckets where id = 'inbox'),
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
  'the inbox bucket accepts only PNG, JPEG, WebP and PDF');
select is(
  (select array_agg(policyname::text order by policyname) from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname like 'inbox\_%'),
  array['inbox_owner_delete', 'inbox_owner_insert', 'inbox_owner_select'],
  'exactly the owner select, insert and delete policies cover the inbox');
select is(
  (select count(*) from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and cmd in ('UPDATE', 'ALL')
      and (coalesce(qual, '') like '%inbox%' or coalesce(with_check, '') like '%inbox%')),
  0::bigint, 'no update policy (and no all-commands policy) covers the inbox');

-- An object already held in the owner's folder, written as the superuser, for the read checks.
insert into storage.objects(bucket_id, name, owner_id, metadata)
values ('inbox', '11111111-1111-4111-8111-111111111111/invented-held.png', '11111111-1111-4111-8111-111111111111', '{}'::jsonb);

-- anon
set local role anon;
select is((select count(*) from storage.objects where bucket_id = 'inbox'), 0::bigint, 'anon sees no inbox object');
select throws_ok(
  $$insert into storage.objects(bucket_id, name) values ('inbox', '11111111-1111-4111-8111-111111111111/anon.png')$$,
  '42501', null, 'anon cannot insert into the inbox');
reset role;

-- authenticated, aal1
select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select is((select count(*) from storage.objects where bucket_id = 'inbox'), 0::bigint, 'a session without aal2 sees no inbox object');
select throws_ok(
  $$insert into storage.objects(bucket_id, name, owner_id) values ('inbox', '11111111-1111-4111-8111-111111111111/aal1.png', '11111111-1111-4111-8111-111111111111')$$,
  '42501', null, 'a session without aal2 cannot insert into the inbox');
reset role;

-- authenticated, aal2, the owner
select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;
select lives_ok(
  $$insert into storage.objects(bucket_id, name, owner_id) values ('inbox', '11111111-1111-4111-8111-111111111111/owner.png', '11111111-1111-4111-8111-111111111111')$$,
  'the owner with aal2 can insert into their own folder');
select is(
  (select count(*) from storage.objects where bucket_id = 'inbox' and name = '11111111-1111-4111-8111-111111111111/invented-held.png'),
  1::bigint, 'the owner with aal2 sees their own inbox object');
select throws_ok(
  $$insert into storage.objects(bucket_id, name, owner_id) values ('inbox', '22222222-2222-4222-8222-222222222222/other.png', '11111111-1111-4111-8111-111111111111')$$,
  '42501', null, 'the owner cannot insert into another uid''s folder');
-- Storage refuses a direct delete unless `storage.allow_delete_query` is 'true'; the Storage API sets
-- it for its own deletes, so the test does the same. The delete policy still applies on top of it.
select set_config('storage.allow_delete_query', 'true', true);
delete from storage.objects where bucket_id = 'inbox' and name = '11111111-1111-4111-8111-111111111111/invented-held.png';
select is(
  (select count(*) from storage.objects where bucket_id = 'inbox' and name = '11111111-1111-4111-8111-111111111111/invented-held.png'),
  0::bigint, 'the owner with aal2 can delete their own inbox object (row gone afterwards)');
reset role;

select * from finish();
rollback;
