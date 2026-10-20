-- Migration 062 — a "duplicate" marker for ledger rows, distinct from the owner's own Excluded.
--
-- The marker is an audit event (`overlay.marked_duplicate`, `detail.revision`) on top of the existing
-- Excluded flag, the same pattern as `overlay.auto_excluded` (migration 026, D-207). No column, no
-- enum, no backup contract change: `audit_events.event_type` is free text and `detail` a free object.
--
-- `mark_duplicate` writes include_in_reporting = false through `update_transaction_overlay` (same
-- auth, ownership, revision check, snapshot, audit and mutation-sequence step; every other overlay
-- field is carried over), then appends the marker event for the new revision. Marking a row that is
-- already marked at its current revision is a no-op.
-- `list_duplicate_transactions` returns ids that are still excluded, have a marker event, and have no
-- later revision that re-included them. Only re-including clears the marker.

begin;

-- The marker lookup reads one row's events of one type; without this every excluded overlay scans
-- audit_events on each ledger load. An index only: no table, column or grant change.
create index if not exists audit_events_owner_entity_type_idx
  on public.audit_events (owner_id, entity_id, event_type, id);

-- Marked = currently excluded, a marker event exists (latest revision R), and no snapshot after R
-- re-included the row. Edits that keep it excluded do not clear the marker.
create or replace function private.is_marked_duplicate(p_owner uuid, p_transaction_id uuid, p_included boolean)
returns boolean language sql stable security definer set search_path=public,private,pg_temp
as $$
  select not p_included and exists(
    select 1 from public.audit_events e
    where e.owner_id=p_owner and e.entity_id=p_transaction_id and e.event_type='overlay.marked_duplicate'
      and e.id=(select max(x.id) from public.audit_events x
                where x.owner_id=p_owner and x.entity_id=p_transaction_id and x.event_type='overlay.marked_duplicate')
      and not exists(
        select 1 from public.overlay_revisions r
        where r.owner_id=p_owner and r.transaction_id=p_transaction_id
          and r.revision>(e.detail->>'revision')::integer
          and (r.snapshot->>'include_in_reporting')::boolean is true));
$$;
revoke all on function private.is_marked_duplicate(uuid,uuid,boolean) from public, anon, authenticated;

create or replace function public.mark_duplicate(p_transaction_id uuid, p_expected_revision integer)
returns jsonb language plpgsql security definer set search_path=public,private,pg_temp
as $$
declare v_owner uuid:=auth.uid(); v_o public.transaction_overlays%rowtype; v_snapshot jsonb;
begin
  if not private.has_strong_owner_access(v_owner) then raise exception 'strong owner access required'; end if;
  if not exists(select 1 from public.source_transactions where id=p_transaction_id and owner_id=v_owner) then raise exception 'transaction not owned'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_owner::text||':ledger-mutation',0));
  select * into v_o from public.transaction_overlays where transaction_id=p_transaction_id and owner_id=v_owner for update;
  -- Already marked: the request's intent holds whatever revision it carried, so a retried request
  -- (its answer lost after the commit) is a no-op rather than a conflict.
  if v_o.transaction_id is not null and private.is_marked_duplicate(v_owner,p_transaction_id,v_o.include_in_reporting) then
    return to_jsonb(v_o);
  end if;
  if coalesce(v_o.revision,0)<>p_expected_revision then raise exception 'overlay revision conflict'; end if;
  v_snapshot:=public.update_transaction_overlay(p_transaction_id,p_expected_revision,jsonb_build_object(
    'category_id',v_o.category_id,'description',v_o.description,'counterparty',v_o.counterparty,
    'effective_date',v_o.effective_date,'note',v_o.note,'include_in_reporting',false));
  insert into public.audit_events(owner_id,actor_id,event_type,entity_type,entity_id,detail)
    values(v_owner,v_owner,'overlay.marked_duplicate','source_transaction',p_transaction_id,
           jsonb_build_object('revision',(v_snapshot->>'revision')::integer));
  return v_snapshot;
end;
$$;

create or replace function public.list_duplicate_transactions()
returns jsonb language plpgsql stable security definer set search_path=public,private,pg_temp
as $$
declare v_owner uuid:=auth.uid();
begin
  if not private.has_strong_owner_access(v_owner) then raise exception 'strong owner access required'; end if;
  return coalesce((
    select jsonb_agg(o.transaction_id order by o.transaction_id)
    from public.transaction_overlays o
    where o.owner_id=v_owner and private.is_marked_duplicate(v_owner,o.transaction_id,o.include_in_reporting)
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.mark_duplicate(uuid,integer) from public, anon;
grant execute on function public.mark_duplicate(uuid,integer) to authenticated;
revoke all on function public.list_duplicate_transactions() from public, anon;
grant execute on function public.list_duplicate_transactions() to authenticated;

commit;
