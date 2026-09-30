-- Migration 042 — a private storage bucket `inbox` that queues the files the owner drops on
-- /inbox (D-235, step 2).
--
-- D-235 reverses D-050: images are now stored, temporarily. A file is deleted once it is imported,
-- and a held file expires after 7 days. That expiry is enforced by the app's drain, not by this
-- migration.
--
-- **Bucket.** Private, 40 MB per file (the statement attachment cap in `lib/statement-sync.ts`),
-- and only PNG, JPEG, WebP and PDF. Storage enforces the size and type limits on upload.
--
-- **Policies on storage.objects.** Select, insert and delete only, each for `authenticated`, only
-- inside the `inbox` bucket, only in the caller's own top-level folder (`<auth.uid()>/…`), and only
-- with strong owner access (the same `private.has_strong_owner_access` the table policies use:
-- an aal2 session with the verified TOTP factor). There is deliberately **no update policy**: an
-- object is never overwritten, a new drop is a new object. Nothing is granted to `anon`.

begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('inbox', 'inbox', false, 41943040, array['image/png', 'image/jpeg', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

create policy inbox_owner_select on storage.objects for select to authenticated
using (
  bucket_id = 'inbox'
  and (storage.foldername(name))[1] = auth.uid()::text
  and private.has_strong_owner_access(auth.uid())
);

create policy inbox_owner_insert on storage.objects for insert to authenticated
with check (
  bucket_id = 'inbox'
  and (storage.foldername(name))[1] = auth.uid()::text
  and private.has_strong_owner_access(auth.uid())
);

create policy inbox_owner_delete on storage.objects for delete to authenticated
using (
  bucket_id = 'inbox'
  and (storage.foldername(name))[1] = auth.uid()::text
  and private.has_strong_owner_access(auth.uid())
);

commit;
