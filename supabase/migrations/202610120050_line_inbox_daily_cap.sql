-- The LINE holding table's 24-hour cap rises from 200 to 600 images (owner, 2026-10-07).
--
-- The owner is backfilling about 400 slips through LINE; 200 in 24 hours refused 24 of one batch.
-- Only the owner's signed LINE ID reaches this function, so the cap guards against a runaway
-- sender, not a stranger; 600 is a day's backfill with room. The 500-held cap is unchanged: moved
-- images free it when /inbox opens. Everything else is migration 044's function, unchanged.

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
  if (select count(*) from private.line_inbox_items i where i.received_at > now() - interval '24 hours') >= 600
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

revoke all on function public.line_inbox_enqueue(text, text, text, text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.line_inbox_enqueue(text, text, text, text, text, integer, integer) to anon;
