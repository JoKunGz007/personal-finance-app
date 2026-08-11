begin;

-- Strong owner access requires ONE verified TOTP factor, not two (D-093, supersedes D-004).
--
-- **Why the second factor was never worth what it cost.** Reaching `aal2` takes verifying
-- any *one* enrolled factor, and this gate has always counted factors rather than
-- challenges — so a session that satisfied `>= 2` had still proved exactly one. Two
-- enrolled TOTP secrets therefore bought no additional strength at sign-in, and if
-- anything they widened the surface: either secret independently generates valid codes, so
-- there were two keys to one door instead of one.
--
-- The recovery argument does not survive either. It is the *secret* being stored somewhere
-- independent that makes a lost authenticator survivable, not the number enrolled — and in
-- this deployment nothing can lock the owner out regardless, because clearing
-- `auth.mfa_factors` from the project dashboard and re-enrolling is always available to
-- whoever controls the project.
--
-- D-004 recorded the rule as "a permanently bound owner, aal2, and two verified TOTP
-- factors" with the rationale "the ledger is deliberately single-owner and contains
-- sensitive financial history". That argues for requiring MFA. It never argued for two, and
-- the number went unexamined from 2026-07-24 until it was questioned on 2026-08-11.
--
-- Everything else about the gate is unchanged and deliberately so: the caller must still be
-- the bound owner, the JWT must still carry `aal2`, and the factor must still be a TOTP
-- factor in `verified` status — an unverified or non-TOTP factor still counts for nothing.
--
-- This replaces the definition from `202607240002_security_and_rpcs.sql`, which is the only
-- place the function has ever been defined; the twelve migrations that call it are
-- unchanged and pick this up automatically. It creates and alters no table, so
-- `export_backup_snapshot` still declares the same version and the v4-into-v5 restore pair
-- proven in D-089 is unaffected.
create or replace function private.has_strong_owner_access(p_owner uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, auth
as $$
  select auth.uid() = p_owner
    and coalesce((nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'aal') = 'aal2', false)
    and (select count(*) from auth.mfa_factors f where f.user_id = p_owner and f.factor_type = 'totp' and f.status = 'verified') >= 1;
$$;

revoke all on function private.has_strong_owner_access(uuid) from public;
grant execute on function private.has_strong_owner_access(uuid) to authenticated, service_role;

commit;
