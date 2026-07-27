-- Binds the recovery destination to a DIFFERENT invented owner than `supabase/seed.sql`.
-- Invented local identity only; never seed values derived from a real statement.
--
-- Two things here are load-bearing:
--   * the owner id and email differ from the source project's, so a restore that
--     carried an owner or actor column through verbatim would violate a foreign key
--     into this project's `auth.users` instead of silently succeeding;
--   * no accounts, categories or ledger rows are seeded, because `restore_backup`
--     requires an empty destination ledger and refuses one that is not.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000',
  '22222222-2222-4222-8222-222222222222',
  'authenticated', 'authenticated', 'recovery.owner@example.invalid',
  extensions.crypt('local-recovery-login-disabled', extensions.gen_salt('bf')),
  now(), '{"provider":"google","providers":["google"]}'::jsonb,
  '{"name":"Recovery Destination Owner"}'::jsonb, now(), now(), '', '', '', ''
) on conflict (id) do nothing;

select public.bind_ledger_owner(
  '22222222-2222-4222-8222-222222222222',
  'recovery.owner@example.invalid'
);
