-- `set_slip_match` must compare the amount that is actually in force, not the one first typed.
--
-- Migration 013 added the slip correction overlay and guarded one direction of the agreement
-- between a corrected amount and a stored match: correcting a slip is refused while it would
-- falsify a decision that already exists. The other direction was left open, and it is the
-- dangerous one. `set_slip_match` read `v_slip.amount_minor` — the figure captured from the
-- slip — so a slip already corrected to a different amount was still checked against its
-- original. Two consequences, both wrong and only one visible:
--
--   * a correct pairing was refused, because the corrected amount agreed with the statement
--     row while the original did not; and
--   * a **wrong pairing was accepted**, because the original agreed with a row the corrected
--     figure contradicts — which is precisely the "two unrelated sums declared one payment"
--     that D-072's equality guard exists to prevent, arrived at through the back door.
--
-- Caught by `supabase/tests/006_cash_and_corrections.sql`, which asserts both directions. The
-- red proof was an outright ERROR from the first of them, not a soft assertion failure.
--
-- 013 is not amended. It is committed and published, and this repository treats an applied
-- artifact as recorded rather than editable — the same reason `DECISIONS.md` supersedes rather
-- than rewrites. A migration that shipped a gap and the migration that closes it are both part
-- of what happened.

begin;

create or replace function public.set_slip_match(
  p_slip_id uuid, p_expected_revision integer, p_decision text, p_transaction_id uuid
) returns jsonb language plpgsql security definer set search_path = public, private, pg_temp
as $$
declare
  v_owner uuid := auth.uid();
  v_slip public.slips%rowtype;
  v_revision integer;
  v_snapshot jsonb;
  v_bank text;
  v_movement bigint;
  v_effective bigint;
begin
  if not private.has_strong_owner_access(v_owner) then raise exception 'strong owner access required'; end if;
  if p_decision not in ('matched','unmatched') then raise exception 'invalid slip match decision'; end if;
  if (p_decision = 'matched') <> (p_transaction_id is not null) then
    raise exception 'invalid slip match decision';
  end if;

  select * into v_slip from public.slips where id = p_slip_id and owner_id = v_owner;
  if v_slip.id is null then raise exception 'slip not owned'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_owner::text || ':ledger-mutation', 0));

  if p_decision = 'matched' then
    -- The same two facts the automatic rule matches on, re-checked here because a client is
    -- not a place to enforce an invariant about money.
    select a.bank_code, (select sum(c.amount_minor) from public.source_components c
                          where c.transaction_id = t.id and c.owner_id = v_owner)
      into v_bank, v_movement
      from public.source_transactions t
      join public.accounts a on a.id = t.account_id and a.owner_id = v_owner
     where t.id = p_transaction_id and t.owner_id = v_owner;
    if v_bank is null then raise exception 'transaction not owned'; end if;
    if v_bank is distinct from v_slip.bank_code then raise exception 'slip match bank mismatch'; end if;
    -- The amount in force: the correction when one stands, the captured figure otherwise
    -- (migration 013). Bank is deliberately not read this way — it comes from the QR and is
    -- not correctable, so there is nothing to fall through to.
    select coalesce(
      (select o.amount_minor from public.slip_correction_overlays o
        where o.slip_id = p_slip_id and o.owner_id = v_owner),
      v_slip.amount_minor
    ) into v_effective;
    if v_movement is distinct from v_effective then raise exception 'slip match amount mismatch'; end if;
  end if;

  select revision into v_revision from public.slip_match_overlays
    where slip_id = p_slip_id and owner_id = v_owner for update;
  v_revision := coalesce(v_revision, 0);
  if v_revision <> p_expected_revision then raise exception 'slip match revision conflict'; end if;
  v_revision := v_revision + 1;

  begin
    insert into public.slip_match_overlays(slip_id, owner_id, decision, transaction_id, revision)
      values (p_slip_id, v_owner, p_decision, p_transaction_id, v_revision)
    on conflict (slip_id) do update set decision = excluded.decision,
      transaction_id = excluded.transaction_id, revision = excluded.revision, updated_at = now();
  exception when unique_violation then
    -- The partial index from 012. Another slip already claims that row, and silently moving the
    -- claim would unmatch a payment the owner cannot see from here.
    raise exception 'statement row already claimed by another slip';
  end;

  select to_jsonb(o) into v_snapshot from public.slip_match_overlays o
    where o.slip_id = p_slip_id and o.owner_id = v_owner;
  insert into public.slip_match_revisions(owner_id, slip_id, revision, snapshot, changed_by)
    values (v_owner, p_slip_id, v_revision, v_snapshot, v_owner);
  insert into public.audit_events(owner_id, actor_id, event_type, entity_type, entity_id, detail)
    values (v_owner, v_owner, 'slip.match.' || p_decision, 'slip', p_slip_id,
      jsonb_build_object('revision', v_revision, 'decision', p_decision));
  update public.mutation_sequences set sequence = sequence + 1, updated_at = now() where owner_id = v_owner;

  return v_snapshot;
end;
$$;
revoke all on function public.set_slip_match(uuid,integer,text,uuid) from public, anon;
grant execute on function public.set_slip_match(uuid,integer,text,uuid) to authenticated;

commit;
