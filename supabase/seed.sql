-- Invented local identity and account only. Never seed copied, redacted, hashed,
-- or transformed values from a real statement.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000',
  '11111111-1111-4111-8111-111111111111',
  'authenticated', 'authenticated', 'synthetic.owner@example.invalid',
  extensions.crypt('local-synthetic-login-disabled', extensions.gen_salt('bf')),
  now(), '{"provider":"google","providers":["google"]}'::jsonb,
  '{"name":"Synthetic Owner"}'::jsonb, now(), now(), '', '', '', ''
) on conflict (id) do nothing;

select public.bind_ledger_owner(
  '11111111-1111-4111-8111-111111111111',
  'synthetic.owner@example.invalid'
);

insert into public.accounts(id, owner_id, bank_code, label, account_type, last_four, currency, timezone)
values (
  '11111111-2222-4333-8444-555555555555',
  '11111111-1111-4111-8111-111111111111',
  'KTB', 'Synthetic current account', 'current', '4242', 'THB', 'Asia/Bangkok'
) on conflict (id) do nothing;
