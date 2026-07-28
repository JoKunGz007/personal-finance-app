-- Binds the live ledger's owner. Nothing else: no accounts, no categories, no rows.
--
-- The live project starts empty on purpose. `restore_backup` requires an empty
-- destination ledger, and the way real data arrives here is a restore of the backup
-- exported from wherever it was before — the same portable-recovery path proven in D-044,
-- used for its actual purpose rather than as a rehearsal.
--
-- The identity is the same local password account the test project seeds, and that is a
-- placeholder rather than a decision. The owner gate compares an email and never inspects
-- the provider (D-020), and the development sign-in — still the only sign-in that exists,
-- since Google OAuth is unbuilt and behind the hosted gate — has this address compiled
-- into it. When real OAuth lands, this is the row that has to change, and
-- `public.ledger_owners` is immutable, so changing it means a fresh project and a restore
-- into it. That is a known, tested operation, which is the point of having proved it.
--
-- The owner id differs from the test project's deliberately: if a row from one database
-- ever turns up in the other, the owner id says which it came from.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000',
  '44444444-4444-4444-8444-444444444444',
  'authenticated', 'authenticated', 'synthetic.owner@example.invalid',
  extensions.crypt('local-synthetic-login-disabled', extensions.gen_salt('bf')),
  now(), '{"provider":"google","providers":["google"]}'::jsonb,
  '{"name":"Ledger Owner"}'::jsonb, now(), now(), '', '', '', ''
) on conflict (id) do nothing;

select public.bind_ledger_owner(
  '44444444-4444-4444-8444-444444444444',
  'synthetic.owner@example.invalid'
);
