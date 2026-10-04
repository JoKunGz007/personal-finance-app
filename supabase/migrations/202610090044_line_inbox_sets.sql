-- Migration 044 — LINE multi-image sets: count them in the database, list them in page order (D-241).
--
-- Two limits of 043 are closed. (1) The bot said "Got N" on the event whose index equalled the total,
-- which can run before the other members are stored (LINE does not deliver a set in order, and the
-- webhook stores sequentially). Now the enqueue function reports `set_stored`, the number of rows held
-- for that set (moved markers included), computed under the advisory lock the function already takes,
-- so exactly one transaction sees it reach the total. (2) Members were listed in arrival order; the
-- list now keeps a set together and in index order.
--
-- The three set columns are all null (a lone image) or all set. A redelivery returns 'duplicate'
-- before anything is inserted, so it never adds to the count. The enqueue function keeps 043's secret
-- check, caps, SECURITY DEFINER and search_path, and is granted to anon alone.

begin;

alter table private.line_inbox_items
  add column image_set_id text,
  add column image_set_index integer,
  add column image_set_total integer,
  add constraint line_inbox_items_set_all_or_none check (
    (image_set_id is null and image_set_index is null and image_set_total is null)
    or (image_set_id is not null and image_set_index is not null and image_set_total is not null)),
  add constraint line_inbox_items_set_bounds check (
    image_set_index is null or (image_set_index >= 1 and image_set_index <= image_set_total and image_set_total <= 20)),
  add constraint line_inbox_items_set_id_safe check (image_set_id is null or image_set_id ~ '^[A-Za-z0-9_-]{1,64}$');

create index line_inbox_items_set on private.line_inbox_items (owner_id, image_set_id) where image_set_id is not null;

drop function public.line_inbox_enqueue(text, text, text, text);

-- Returns the outcome ('stored' or 'duplicate') and, for an image that belongs to a set, how many
-- members of that set are now held for the owner; null for a lone image. Anything else raises
-- 'line inbox refused'.
create or replace function public.line_inbox_enqueue(
  p_secret text, p_message_id text, p_content_type text, p_content_base64 text,
  p_set_id text default null, p_set_index integer default null, p_set_total integer default null)
returns table (outcome text, set_stored integer)
language plpgsql security definer set search_path = public, private, pg_temp
as $$
declare
  v_config private.line_webhook_config;
  v_content bytea;
  v_count integer;
  v_existing_set text;
  v_exists boolean;
begin
  select * into v_config from private.line_webhook_config where singleton;
  if v_config.owner_id is null or p_secret is null
    or extensions.digest(convert_to(p_secret, 'UTF8'), 'sha256') <> v_config.secret_sha256 then
    raise exception 'line inbox refused';
  end if;
  if p_message_id is null or p_message_id !~ '^[0-9]{1,32}$'
    or p_content_type is null or p_content_type not in ('image/jpeg', 'image/png')
    or p_content_base64 is null or length(p_content_base64) > 13981016 then
    raise exception 'line inbox refused';
  end if;
  -- A set is all three fields or none, and well-formed.
  if (p_set_id is null) <> (p_set_index is null) or (p_set_id is null) <> (p_set_total is null) then
    raise exception 'line inbox refused';
  end if;
  if p_set_id is not null and (p_set_id !~ '^[A-Za-z0-9_-]{1,64}$'
    or p_set_total not between 1 and 20 or p_set_index not between 1 and p_set_total) then
    raise exception 'line inbox refused';
  end if;

  begin
    v_content := decode(p_content_base64, 'base64');
  exception when others then raise exception 'line inbox refused'; end;
  if octet_length(v_content) not between 1 and 10485760 then raise exception 'line inbox refused'; end if;
  -- The bytes must be what the content type says: JPEG starts FF D8 FF, PNG with its 8-byte signature.
  if (p_content_type = 'image/jpeg' and substring(v_content from 1 for 3) <> '\xffd8ff'::bytea)
    or (p_content_type = 'image/png' and substring(v_content from 1 for 8) <> '\x89504e470d0a1a0a'::bytea) then
    raise exception 'line inbox refused';
  end if;

  -- Serialise the cap checks, the insert and the set count, so two concurrent deliveries cannot both
  -- pass a cap and exactly one sees the set reach its total.
  perform pg_advisory_xact_lock(hashtextextended(v_config.owner_id::text || ':line-inbox', 0));

  select i.image_set_id, true into v_existing_set, v_exists from private.line_inbox_items i where i.line_message_id = p_message_id;
  if coalesce(v_exists, false) then
    -- The set's current count (a lone image is 1 of 1), so a redelivery whose first reply was lost can still confirm.
    if v_existing_set is null then
      v_count := 1;
    else
      select count(*)::integer into v_count from private.line_inbox_items i
      where i.owner_id = v_config.owner_id and i.image_set_id = v_existing_set;
    end if;
    return query select 'duplicate'::text, v_count;
    return;
  end if;
  if (select count(*) from private.line_inbox_items i where i.received_at > now() - interval '24 hours') >= 200
    or (select count(*) from private.line_inbox_items i where i.content is not null) >= 500 then
    raise exception 'line inbox refused';
  end if;

  insert into private.line_inbox_items(owner_id, line_message_id, content_type, content,
    image_set_id, image_set_index, image_set_total)
  values (v_config.owner_id, p_message_id, p_content_type, v_content, p_set_id, p_set_index, p_set_total);

  if p_set_id is null then
    v_count := 1;
  else
    select count(*)::integer into v_count from private.line_inbox_items i
    where i.owner_id = v_config.owner_id and i.image_set_id = p_set_id;
  end if;
  return query select 'stored'::text, v_count;
end;
$$;

-- What is held (leaving out a set that is still arriving): a set together (by the set's earliest receipt, then its id, then page index), a lone
-- image by its own receipt time. Same row shape as 043.
create or replace function public.list_line_inbox()
returns table (id bigint, line_message_id text, content_type text, byte_size integer, received_at timestamptz)
language plpgsql security definer set search_path = public, private, pg_temp
as $$
declare
  v_owner uuid := auth.uid();
begin
  if not private.has_strong_owner_access(v_owner) then raise exception 'strong owner access required'; end if;
  delete from private.line_inbox_items i
  where i.owner_id = v_owner and i.content is null and i.received_at < now() - interval '7 days';
  return query
    with held as (
      select i.id, i.line_message_id, i.content_type, octet_length(i.content) as byte_size, i.received_at,
        i.image_set_id, i.image_set_index, i.content is not null as is_held,
        min(i.received_at) filter (where i.content is not null) over (partition by i.image_set_id) as set_first,
        count(*) over (partition by i.image_set_id) as set_rows,
        max(i.received_at) over (partition by i.image_set_id) as set_last,
        max(i.image_set_total) over (partition by i.image_set_id) as set_total
      from private.line_inbox_items i where i.owner_id = v_owner
    )
    select h.id, h.line_message_id, h.content_type, h.byte_size, h.received_at
    from held h
    where h.is_held
      -- A set still short of its total whose newest member arrived under 2 minutes ago is left for the
      -- next open; after that it drains anyway, so a set that lost a member is not stuck.
      and (h.image_set_id is null or h.set_rows >= h.set_total or h.set_last <= now() - interval '2 minutes')
    order by case when h.image_set_id is null then h.received_at else h.set_first end, h.image_set_id nulls last, h.image_set_index, h.received_at, h.id;
end;
$$;

-- Whether the bot is connected, for the /inbox panel. Owner-only, like the other owner functions of 043.
-- `connected_at` is when the secret was last set or rotated (`updated_at`); the hash is never returned.
create or replace function public.line_bot_status()
returns table (connected boolean, connected_at timestamptz)
language plpgsql security definer set search_path = public, private, pg_temp
as $$
declare
  v_owner uuid := auth.uid();
begin
  if not private.has_strong_owner_access(v_owner) then raise exception 'strong owner access required'; end if;
  return query
    select exists (select 1 from private.line_webhook_config c where c.singleton and c.owner_id = v_owner),
      (select c.updated_at from private.line_webhook_config c where c.singleton and c.owner_id = v_owner);
end;
$$;

revoke all on function public.line_inbox_enqueue(text, text, text, text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.line_inbox_enqueue(text, text, text, text, text, integer, integer) to anon;
revoke all on function public.list_line_inbox() from public, anon, authenticated;
grant execute on function public.list_line_inbox() to authenticated;
revoke all on function public.line_bot_status() from public, anon, authenticated;
grant execute on function public.line_bot_status() to authenticated;

commit;
