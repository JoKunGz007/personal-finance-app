-- Let the owner create a ledger account, and relabel one.
--
-- Until now `public.accounts` had no write path at all: migration 002 grants
-- `authenticated` select only, enables forced RLS, and creates just a select policy, so
-- every account in existence came from `supabase/seed.sql`. That was tolerable while the
-- app only ever met synthetic statements. It is the binding constraint now — a real
-- statement prints an account suffix, and if no account carries that suffix the bind step
-- refuses and there is nothing the owner can do about it from inside the app.
--
-- Create and relabel, and nothing else. `label` is the only field on an account that is
-- not part of its identity:
--   * `bank_code` is hashed into every row fingerprint (lib/canonical.ts rowFingerprint),
--     and `confirm_import` recomputes each one from the *bound account's* bank (D-041), so
--     changing it would invalidate every fingerprint already stored under that account;
--   * `last_four` is what binding matches a statement against (D-017), so changing it
--     silently re-scopes the history already imported under it;
--   * `currency` and `timezone` are single-valued by CHECK and carry the money invariants.
-- Deleting an account is not offered either: `source_transactions.account_id` references
-- it, and an append-only ledger has no story for removing the thing its rows hang from.
--
-- The allowed bank codes are deliberately NOT restated here. Migration 009 exists because
-- `confirm_import` restated 'KTB' as a literal and silently gated two whole banks out of
-- the product (D-041, GOTCHAS). The table's own CHECK constraints stay the single
-- authority for what an account may contain; this function turns their violation into an
-- error a route can map, and adding a fourth bank stays a one-line change to one CHECK.

create or replace function public.mutate_account(
  p_action text, p_id uuid, p_bank_code text, p_label text, p_account_type text, p_last_four text)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp
as $$
declare v_owner uuid := auth.uid(); v_account public.accounts%rowtype; v_previous text;
begin
  if not private.has_strong_owner_access(v_owner) then raise exception 'strong owner access required'; end if;
  if p_action not in ('create','relabel') then raise exception 'invalid account mutation'; end if;
  if length(btrim(coalesce(p_label,''))) not between 1 and 120 then raise exception 'invalid account mutation'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_owner::text || ':ledger-mutation', 0));

  if p_action = 'create' then
    if p_id is not null then raise exception 'create id must be null'; end if;
    begin
      insert into public.accounts(owner_id, bank_code, label, account_type, last_four, currency, timezone)
      values (v_owner, p_bank_code, btrim(p_label), p_account_type, p_last_four, 'THB', 'Asia/Bangkok')
      returning * into v_account;
    exception
      -- One owner may legitimately hold three accounts ending in the same digits at
      -- different banks — the unique key is (owner_id, bank_code, last_four) for exactly
      -- that reason (D-041). Only the same bank *and* the same digits is a duplicate, and
      -- it is a conflict the caller can act on rather than a malformed request.
      when unique_violation then raise exception 'account already exists';
      when check_violation then raise exception 'invalid account';
    end;
    insert into public.audit_events(owner_id, actor_id, event_type, entity_type, entity_id, detail)
      values (v_owner, v_owner, 'account.create', 'account', v_account.id,
        jsonb_build_object('bank_code', v_account.bank_code, 'account_type', v_account.account_type,
          'last_four', v_account.last_four, 'label', v_account.label));
  else
    -- Identity fields are refused rather than ignored on a relabel. A caller that sends
    -- them believes it is changing them, and silently dropping them would hand back a
    -- success for something that did not happen.
    if p_id is null then raise exception 'relabel requires an id'; end if;
    if p_bank_code is not null or p_account_type is not null or p_last_four is not null then
      raise exception 'account identity cannot be changed';
    end if;
    select label into v_previous from public.accounts where id = p_id and owner_id = v_owner for update;
    if v_previous is null then raise exception 'account not owned'; end if;
    update public.accounts set label = btrim(p_label) where id = p_id and owner_id = v_owner returning * into v_account;
    insert into public.audit_events(owner_id, actor_id, event_type, entity_type, entity_id, detail)
      values (v_owner, v_owner, 'account.relabel', 'account', v_account.id,
        jsonb_build_object('previous_label', v_previous, 'label', v_account.label));
  end if;

  -- `accounts` is one of the eleven tables a backup carries, so either mutation makes the
  -- last backup stale. Bumping the sequence is what says so (D-018's ordering contract).
  update public.mutation_sequences set sequence = sequence + 1, updated_at = now() where owner_id = v_owner;

  return jsonb_build_object('id', v_account.id, 'bank_code', v_account.bank_code, 'label', v_account.label,
    'account_type', v_account.account_type, 'last_four', v_account.last_four,
    'currency', v_account.currency, 'timezone', v_account.timezone);
end;
$$;

revoke all on function public.mutate_account(text,uuid,text,text,text,text) from public, anon;
grant execute on function public.mutate_account(text,uuid,text,text,text,text) to authenticated;

-- Defensive, and a no-op today: migration 002 granted `authenticated` select only. Stated
-- anyway so that a future `grant all` cannot quietly open a direct write path around this
-- function, the way migration 004 revoked the direct category writes it replaced.
revoke insert, update, delete on public.accounts from authenticated;
