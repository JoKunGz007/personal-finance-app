begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

-- The monthly Vision call limit (migration 066). Nothing here is real data.
--
-- What this proves: the meter forces RLS and is select-only for the owner; claim_vision_call counts
-- up to the limit, then returns 0 without incrementing; a limit under 1 or null is refused; a
-- caller without strong owner access is refused; direct writes are not granted; and
-- vision_calls_this_month reads the count back.

set local session_replication_role = replica;
delete from public.vision_call_months;
delete from auth.mfa_factors where user_id = '11111111-1111-4111-8111-111111111111';
set local session_replication_role = origin;

insert into auth.mfa_factors(id, user_id, friendly_name, factor_type, status, secret, created_at, updated_at)
values ('aaaaaaaa-0000-4000-8000-000000000661', '11111111-1111-4111-8111-111111111111',
        'vision TOTP', 'totp', 'verified', 'SYNTHETICVISION', '2026-11-18T00:00:00Z', '2026-11-18T00:00:00Z');

select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal2"}', true);

-- ------------------------------------------------------------------- (a) shape and access

select has_table('public', 'vision_call_months', 'the meter table exists');
select ok(
  (select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.vision_call_months'::regclass),
  'the meter forces RLS'
);
select ok(
  has_table_privilege('authenticated', 'public.vision_call_months', 'select')
    and not has_table_privilege('authenticated', 'public.vision_call_months', 'insert')
    and not has_table_privilege('authenticated', 'public.vision_call_months', 'update')
    and not has_table_privilege('authenticated', 'public.vision_call_months', 'delete')
    and not has_table_privilege('anon', 'public.vision_call_months', 'select')
    and not has_table_privilege('anon', 'public.vision_call_months', 'insert')
    and not has_table_privilege('anon', 'public.vision_call_months', 'update'),
  'authenticated is select-only; anon has nothing'
);
select ok(
  has_function_privilege('authenticated', 'public.claim_vision_call(integer)', 'execute')
    and has_function_privilege('authenticated', 'public.vision_calls_this_month()', 'execute')
    and not has_function_privilege('anon', 'public.claim_vision_call(integer)', 'execute')
    and not has_function_privilege('anon', 'public.vision_calls_this_month()', 'execute'),
  'authenticated may execute both functions; anon neither'
);

-- ------------------------------------------------------------------- (b) claiming
-- As `authenticated`, the role the route's client uses, so the grant and definer path are the
-- ones production takes.
set local role authenticated;

select is(public.vision_calls_this_month(), 0, 'no calls counted at first');
select is(public.claim_vision_call(3), 1, 'first claim returns 1');
select is(public.claim_vision_call(3), 2, 'second claim returns 2');
select is(public.claim_vision_call(3), 3, 'third claim returns 3, the limit');
select is(public.claim_vision_call(3), 0, 'a claim at the limit returns 0');
select is(public.claim_vision_call(3), 0, 'a repeat claim at the limit still returns 0');
select is(public.vision_calls_this_month(), 3, 'the refused claims did not increment the count');
select is(public.claim_vision_call(4), 4, 'a raised limit allows one more');

-- ------------------------------------------------------------------- (c) refusals

select throws_ok($$select public.claim_vision_call(0)$$, 'invalid vision call limit', 'a limit under 1 is refused');
select throws_ok($$select public.claim_vision_call(null)$$, 'invalid vision call limit', 'a null limit is refused');

select set_config('request.jwt.claims',
  '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated","aal":"aal2"}', true);
select throws_ok(
  $$select public.claim_vision_call(900)$$,
  'strong owner access required',
  'a caller without strong owner access is refused'
);

-- ------------------------------------------------------------------- (d) no direct writes

select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;
select throws_ok(
  $$update public.vision_call_months set calls = 0$$,
  '42501',
  'permission denied for table vision_call_months',
  'the owner cannot reset the meter directly'
);
reset role;

select * from finish();
rollback;
