-- Migration 043 — a holding table for images the owner sends to the LINE bot (D-241).
--
-- **Why a table, not the `inbox` bucket.** The bucket is written as the owner under
-- `private.has_strong_owner_access` (migration 042), and the deployment has no service-role key
-- (D-141). The LINE webhook has no session, and LINE deletes user content after an unstated period,
-- so the image is taken at webhook time and held here until the owner next opens /inbox, which
-- moves it into the bucket queue under the owner's own session.
--
-- **The webhook's only power.** `public.line_inbox_enqueue` is callable by `anon` and does nothing
-- unless the caller presents the webhook secret, whose SHA-256 is held in
-- `private.line_webhook_config` (set by the owner with strong access, never in a migration). With
-- the secret it can only append one JPEG or PNG of at most 10 MB, keyed on LINE's message ID, while
-- fewer than 200 images arrived in the last 24 hours and fewer than 500 are held. It returns no
-- row data. A leaked secret cannot read anything, but an image it appends is moved into the Inbox
-- queue and read like any dropped file, so a slip filed unseen (D-135) can reach the ledger: the
-- secret is its own random value (`LINE_INBOX_SECRET`), not derived from the LINE channel secret,
-- so leaking one does not give the other. Every refusal raises the same message, so the caller
-- learns nothing about which check failed.
--
-- **A moved image keeps its message ID.** Deleting after the move drops the bytes and keeps the
-- row as a marker, so a late LINE redelivery is still answered 'duplicate' instead of queueing the
-- image a second time. Markers expire 7 days after receipt. A held image never expires here:
-- the bot already told the owner "Got it", so it waits until moved, and the bucket's own 7-day
-- expiry (D-235) applies from then; the 500-held cap bounds the wait.
--
-- **Owner side.** List (which also drops redelivery markers received more than 7 days ago), read
-- one image as base64, and drop one image's bytes after the drain has stored it in the bucket. All
-- three need strong owner access.
--
-- **Backup.** The tables live in `private`, outside the backup's coverage, which is correct for a
-- temporary queue (the bucket is not backed up either, D-235 step 2a).

begin;

create table private.line_webhook_config (
  singleton boolean primary key default true check (singleton),
  owner_id uuid not null references public.ledger_owners(owner_id),
  secret_sha256 bytea not null check (octet_length(secret_sha256) = 32),
  updated_at timestamptz not null default now()
);

create table private.line_inbox_items (
  id bigint generated always as identity primary key,
  owner_id uuid not null references public.ledger_owners(owner_id),
  line_message_id text not null unique check (line_message_id ~ '^[0-9]{1,32}$'),
  content_type text not null check (content_type in ('image/jpeg', 'image/png')),
  -- Null once the image has been moved to the bucket; the row stays as a redelivery marker.
  content bytea check (content is null or octet_length(content) between 1 and 10485760),
  received_at timestamptz not null default now()
);

create index line_inbox_items_received_at on private.line_inbox_items (received_at);

revoke all on private.line_webhook_config, private.line_inbox_items from public, anon, authenticated;

-- The owner sets (or rotates) the secret. Only its hash is stored.
create or replace function public.set_line_webhook_secret(p_secret text)
returns void language plpgsql security definer set search_path = public, private, pg_temp
as $$
declare
  v_owner uuid := auth.uid();
begin
  if not private.has_strong_owner_access(v_owner) then raise exception 'strong owner access required'; end if;
  if p_secret is null or length(p_secret) < 32 or length(p_secret) > 256 then
    raise exception 'webhook secret must be 32 to 256 characters';
  end if;
  insert into private.line_webhook_config(singleton, owner_id, secret_sha256)
  values (true, v_owner, extensions.digest(convert_to(p_secret, 'UTF8'), 'sha256'))
  on conflict (singleton) do update
    set owner_id = excluded.owner_id, secret_sha256 = excluded.secret_sha256, updated_at = now();
end;
$$;

-- The webhook's single entry point. Returns 'stored' or 'duplicate'; anything else raises
-- 'line inbox refused'.
create or replace function public.line_inbox_enqueue(
  p_secret text, p_message_id text, p_content_type text, p_content_base64 text)
returns text language plpgsql security definer set search_path = public, private, pg_temp
as $$
declare
  v_config private.line_webhook_config;
  v_content bytea;
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

  begin
    v_content := decode(p_content_base64, 'base64');
  exception when others then raise exception 'line inbox refused'; end;
  if octet_length(v_content) not between 1 and 10485760 then raise exception 'line inbox refused'; end if;
  -- The bytes must be what the content type says: JPEG starts FF D8 FF, PNG with its 8-byte signature.
  if (p_content_type = 'image/jpeg' and substring(v_content from 1 for 3) <> '\xffd8ff'::bytea)
    or (p_content_type = 'image/png' and substring(v_content from 1 for 8) <> '\x89504e470d0a1a0a'::bytea) then
    raise exception 'line inbox refused';
  end if;

  -- Serialise the cap checks and the insert, so two concurrent deliveries cannot both pass a cap.
  perform pg_advisory_xact_lock(hashtextextended(v_config.owner_id::text || ':line-inbox', 0));

  if exists (select 1 from private.line_inbox_items where line_message_id = p_message_id) then
    return 'duplicate';
  end if;
  if (select count(*) from private.line_inbox_items where received_at > now() - interval '24 hours') >= 200
    or (select count(*) from private.line_inbox_items where content is not null) >= 500 then
    raise exception 'line inbox refused';
  end if;

  insert into private.line_inbox_items(owner_id, line_message_id, content_type, content)
  values (v_config.owner_id, p_message_id, p_content_type, v_content);
  return 'stored';
end;
$$;

-- What is held, oldest first, after dropping redelivery markers received more than 7 days ago.
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
    select i.id, i.line_message_id, i.content_type, octet_length(i.content), i.received_at
    from private.line_inbox_items i where i.owner_id = v_owner and i.content is not null
    order by i.received_at, i.id;
end;
$$;

create or replace function public.read_line_inbox_item(p_id bigint)
returns text language plpgsql security definer set search_path = public, private, pg_temp
as $$
declare
  v_owner uuid := auth.uid();
  v_content bytea;
begin
  if not private.has_strong_owner_access(v_owner) then raise exception 'strong owner access required'; end if;
  select i.content into v_content from private.line_inbox_items i where i.id = p_id and i.owner_id = v_owner;
  if v_content is null then raise exception 'line inbox item not found'; end if;
  return translate(encode(v_content, 'base64'), E'\n', '');
end;
$$;

-- Called by the drain only after Storage confirmed the copy in the bucket. Drops the bytes and keeps
-- the message ID, so a redelivery is still a duplicate.
create or replace function public.delete_line_inbox_item(p_id bigint)
returns boolean language plpgsql security definer set search_path = public, private, pg_temp
as $$
declare
  v_owner uuid := auth.uid();
begin
  if not private.has_strong_owner_access(v_owner) then raise exception 'strong owner access required'; end if;
  update private.line_inbox_items i set content = null
  where i.id = p_id and i.owner_id = v_owner and i.content is not null;
  return found;
end;
$$;

revoke all on function public.set_line_webhook_secret(text) from public, anon, authenticated;
revoke all on function public.line_inbox_enqueue(text, text, text, text) from public, anon, authenticated;
revoke all on function public.list_line_inbox() from public, anon, authenticated;
revoke all on function public.read_line_inbox_item(bigint) from public, anon, authenticated;
revoke all on function public.delete_line_inbox_item(bigint) from public, anon, authenticated;

grant execute on function public.line_inbox_enqueue(text, text, text, text) to anon;
grant execute on function public.set_line_webhook_secret(text) to authenticated;
grant execute on function public.list_line_inbox() to authenticated;
grant execute on function public.read_line_inbox_item(bigint) to authenticated;
grant execute on function public.delete_line_inbox_item(bigint) to authenticated;

commit;
