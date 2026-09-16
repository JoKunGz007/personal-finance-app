-- Migration 026 — internal transfers between the owner's own accounts are excluded from reporting
-- automatically (D-207).
--
-- ## What this adds
--
-- `public.auto_exclude_internal_transfers()` finds a withdrawal on one of the owner's accounts and a
-- deposit of exactly the same amount on another, at most 24 hours apart, **where either row's bank
-- description names the other account** (a digit run ending in its `last_four`). Candidates are
-- paired one-to-one, nearest in time first, so two same-amount transfers a day apart cannot cross.
-- Both rows of each pair get `include_in_reporting = false` through the same steps as
-- `update_transaction_overlay`: the ledger-mutation lock, a new overlay revision with its snapshot,
-- an audit event and one mutation-sequence step. Every other overlay field is kept as it was.
--
-- `public.list_auto_excluded_transactions()` returns the ids whose **current** exclusion was written
-- by the function above, so the ledger can label them "Auto-excluded".
--
-- ## The owner's decision always wins
--
-- A row is never touched if any overlay revision has ever held `include_in_reporting = false`, or
-- if it already carries an `overlay.auto_excluded` audit event. So a row the owner excluded by hand
-- stays his, and a row he re-includes after the function excluded it is never excluded again.
-- Both rows of a pair must be eligible; a half-decided pair is left alone.
--
-- ## Where the marker lives, and why not a column
--
-- The marker is the audit event (`event_type = 'overlay.auto_excluded'`, `detail.revision`). A new
-- column on `transaction_overlays` would change the strict backup row contract (v7) and the restore
-- function; `audit_events` is already backed up and restored whole with a free-form `detail`, so the
-- label survives a restore with **no backup contract change**. "Current" means the event's revision
-- equals the overlay's revision: a later hand edit of that row moves the revision on and the label
-- goes with it.
--
-- ## Scope
--
-- Two functions, no table, no column, no trigger. The scan reads every owner transaction once per
-- call (bounded by the ledger's size, as `ledger_statistics` is); it is called after an import
-- confirms, not on page load. Backup contract stays **v7**.

begin;

create or replace function public.auto_exclude_internal_transfers()
returns jsonb language plpgsql security definer set search_path=public,private,pg_temp
as $$
declare
  v_owner uuid := auth.uid();
  v_used uuid[] := '{}';
  v_pairs integer := 0;
  v_pair record;
  v_id uuid;
  v_other uuid;
  v_revision integer;
  v_snapshot jsonb;
begin
  if not private.has_strong_owner_access(v_owner) then raise exception 'strong owner access required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_owner::text||':ledger-mutation',0));

  for v_pair in
    with movement as (
      select t.id, t.account_id, a.last_four, t.description,
             (t.source_date + coalesce(t.source_time, time '00:00')) as at,
             sum(c.amount_minor) as minor
      from public.source_transactions t
      join public.accounts a on a.id = t.account_id and a.owner_id = t.owner_id
      join public.source_components c on c.transaction_id = t.id and c.owner_id = t.owner_id
      where t.owner_id = v_owner
      group by t.id, t.account_id, a.last_four, t.description, t.source_date, t.source_time
    ),
    eligible as (
      select m.* from movement m
      where not exists (
          select 1 from public.overlay_revisions r
          where r.owner_id = v_owner and r.transaction_id = m.id
            and (r.snapshot->>'include_in_reporting')::boolean is false)
        and not exists (
          select 1 from public.transaction_overlays o
          where o.owner_id = v_owner and o.transaction_id = m.id and not o.include_in_reporting)
        and not exists (
          select 1 from public.audit_events e
          where e.owner_id = v_owner and e.entity_id = m.id and e.event_type = 'overlay.auto_excluded')
    )
    select w.id as withdrawal_id, d.id as deposit_id,
           abs(extract(epoch from (d.at - w.at))) as gap
    from eligible w
    join eligible d
      on d.account_id <> w.account_id
     and w.minor < 0 and d.minor = -w.minor
     and abs(extract(epoch from (d.at - w.at))) <= 86400
     and (d.description ~ ('(^|[^0-9])[0-9]*' || w.last_four || '([^0-9]|$)')
       or w.description ~ ('(^|[^0-9])[0-9]*' || d.last_four || '([^0-9]|$)'))
    order by gap, w.id, d.id
  loop
    continue when v_pair.withdrawal_id = any(v_used) or v_pair.deposit_id = any(v_used);
    v_used := v_used || v_pair.withdrawal_id || v_pair.deposit_id;
    v_pairs := v_pairs + 1;

    foreach v_id in array array[v_pair.withdrawal_id, v_pair.deposit_id] loop
      v_other := case when v_id = v_pair.withdrawal_id then v_pair.deposit_id else v_pair.withdrawal_id end;
      select revision into v_revision from public.transaction_overlays
        where transaction_id = v_id and owner_id = v_owner for update;
      v_revision := coalesce(v_revision, 0) + 1;
      insert into public.transaction_overlays(transaction_id, owner_id, include_in_reporting, revision)
      values (v_id, v_owner, false, v_revision)
      on conflict (transaction_id) do update
        set include_in_reporting = false, revision = excluded.revision, updated_at = now();
      select to_jsonb(o) into v_snapshot from public.transaction_overlays o where transaction_id = v_id;
      insert into public.overlay_revisions(owner_id, transaction_id, revision, snapshot, changed_by)
        values (v_owner, v_id, v_revision, v_snapshot, v_owner);
      insert into public.audit_events(owner_id, actor_id, event_type, entity_type, entity_id, detail)
        values (v_owner, v_owner, 'overlay.auto_excluded', 'source_transaction', v_id,
                jsonb_build_object('revision', v_revision, 'pair_transaction_id', v_other));
    end loop;
  end loop;

  if v_pairs > 0 then
    update public.mutation_sequences set sequence = sequence + 1, updated_at = now() where owner_id = v_owner;
  end if;
  return jsonb_build_object('pairs', v_pairs, 'rows', v_pairs * 2);
end;
$$;

create or replace function public.list_auto_excluded_transactions()
returns jsonb language plpgsql stable security definer set search_path=public,private,pg_temp
as $$
declare v_owner uuid := auth.uid();
begin
  if not private.has_strong_owner_access(v_owner) then raise exception 'strong owner access required'; end if;
  return coalesce((
    select jsonb_agg(o.transaction_id order by o.transaction_id)
    from public.transaction_overlays o
    where o.owner_id = v_owner and not o.include_in_reporting
      and exists (
        select 1 from public.audit_events e
        where e.owner_id = v_owner and e.entity_id = o.transaction_id
          and e.event_type = 'overlay.auto_excluded'
          and (e.detail->>'revision')::integer = o.revision)
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.auto_exclude_internal_transfers() from public, anon;
grant execute on function public.auto_exclude_internal_transfers() to authenticated;
revoke all on function public.list_auto_excluded_transactions() from public, anon;
grant execute on function public.list_auto_excluded_transactions() to authenticated;

commit;
