begin;

create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.ledger_owners (
  owner_id uuid primary key references auth.users(id),
  google_email text not null unique check (google_email = lower(google_email)),
  bound_at timestamptz not null default now(),
  bound_by uuid not null references auth.users(id),
  check (owner_id = bound_by)
);

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.ledger_owners(owner_id),
  bank_code text not null check (bank_code = 'KTB'),
  label text not null check (length(label) between 1 and 120),
  account_type text not null check (account_type in ('savings','current')),
  last_four text not null check (last_four ~ '^[0-9]{4}$'),
  currency text not null check (currency = 'THB'),
  timezone text not null check (timezone = 'Asia/Bangkok'),
  created_at timestamptz not null default now(),
  unique (owner_id, bank_code, last_four),
  unique (id, owner_id)
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.ledger_owners(owner_id),
  name text not null check (length(btrim(name)) between 1 and 80),
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id)
);
create unique index categories_owner_name_ci on public.categories(owner_id, lower(name));

create table public.import_artifacts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.ledger_owners(owner_id),
  artifact_digest text not null check (artifact_digest ~ '^[a-f0-9]{64}$'),
  contract_version text not null check (contract_version = 'krungthai-layout-v1'),
  created_at timestamptz not null default now(),
  unique (owner_id, artifact_digest),
  unique (id, owner_id)
);

create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.ledger_owners(owner_id),
  account_id uuid not null,
  artifact_id uuid not null,
  idempotency_key uuid not null,
  payload_digest text not null check (payload_digest ~ '^[a-f0-9]{64}$'),
  status text not null default 'confirmed' check (status in ('confirmed','failed')),
  confirmed_at timestamptz not null default now(),
  foreign key (account_id, owner_id) references public.accounts(id, owner_id),
  foreign key (artifact_id, owner_id) references public.import_artifacts(id, owner_id),
  unique (owner_id, idempotency_key),
  unique (owner_id, artifact_id),
  unique (id, owner_id)
);

create table public.source_transactions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.ledger_owners(owner_id),
  account_id uuid not null,
  fingerprint_version text not null check (fingerprint_version = 'fingerprint-v1'),
  fingerprint text not null check (fingerprint ~ '^[a-f0-9]{64}$'),
  source_date date not null,
  source_time time,
  effective_date date not null,
  transaction_label text not null check (length(transaction_label) between 1 and 160),
  description text not null check (length(description) between 1 and 500),
  reference text check (reference is null or length(reference) <= 200),
  branch text check (branch is null or length(branch) <= 160),
  post_balance_minor bigint not null,
  currency text not null check (currency = 'THB'),
  created_at timestamptz not null default now(),
  foreign key (account_id, owner_id) references public.accounts(id, owner_id),
  unique (owner_id, account_id, fingerprint),
  unique (id, owner_id)
);

create table public.source_components (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.ledger_owners(owner_id),
  transaction_id uuid not null,
  position smallint not null check (position in (1,2)),
  kind text not null check (kind in ('deposit','withdrawal')),
  amount_minor bigint not null,
  currency text not null check (currency = 'THB'),
  created_at timestamptz not null default now(),
  foreign key (transaction_id, owner_id) references public.source_transactions(id, owner_id),
  check ((kind = 'deposit' and amount_minor > 0) or (kind = 'withdrawal' and amount_minor < 0)),
  unique (transaction_id, position),
  unique (id, owner_id)
);

create table public.import_batch_rows (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.ledger_owners(owner_id),
  batch_id uuid not null,
  transaction_id uuid not null,
  source_index integer not null check (source_index > 0),
  page integer not null check (page > 0),
  row_number integer not null check (row_number > 0),
  parser_fields jsonb not null default '{}'::jsonb,
  linked_existing boolean not null default false,
  foreign key (batch_id, owner_id) references public.import_batches(id, owner_id),
  foreign key (transaction_id, owner_id) references public.source_transactions(id, owner_id),
  unique (batch_id, source_index),
  unique (batch_id, transaction_id),
  unique (id, owner_id)
);

create table public.transaction_overlays (
  transaction_id uuid primary key,
  owner_id uuid not null references public.ledger_owners(owner_id),
  category_id uuid,
  description text check (description is null or length(description) <= 500),
  counterparty text check (counterparty is null or length(counterparty) <= 240),
  effective_date date,
  note text check (note is null or length(note) <= 2000),
  include_in_reporting boolean not null default true,
  revision integer not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now(),
  foreign key (transaction_id, owner_id) references public.source_transactions(id, owner_id),
  foreign key (category_id, owner_id) references public.categories(id, owner_id),
  unique (transaction_id, owner_id)
);

create table public.overlay_revisions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.ledger_owners(owner_id),
  transaction_id uuid not null,
  revision integer not null check (revision > 0),
  snapshot jsonb not null,
  changed_at timestamptz not null default now(),
  changed_by uuid not null references auth.users(id),
  foreign key (transaction_id, owner_id) references public.source_transactions(id, owner_id),
  unique (transaction_id, revision),
  unique (id, owner_id)
);

create table public.audit_events (
  id bigint generated always as identity primary key,
  owner_id uuid not null references public.ledger_owners(owner_id),
  actor_id uuid not null references auth.users(id),
  event_type text not null,
  entity_type text not null,
  entity_id uuid not null,
  detail jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  unique (id, owner_id)
);

create table public.mutation_sequences (
  owner_id uuid primary key references public.ledger_owners(owner_id),
  sequence bigint not null default 0 check (sequence >= 0),
  last_exported_sequence bigint not null default 0 check (last_exported_sequence >= 0),
  updated_at timestamptz not null default now(),
  check (last_exported_sequence <= sequence)
);

create table public.backup_records (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.ledger_owners(owner_id),
  mutation_sequence bigint not null check (mutation_sequence >= 0),
  payload_digest text not null check (payload_digest ~ '^[a-f0-9]{64}$'),
  exported_at timestamptz not null default now(),
  confirmed_by uuid not null references auth.users(id),
  unique (owner_id, payload_digest),
  unique (id, owner_id)
);

create table public.restore_runs (
  id uuid primary key,
  owner_id uuid not null references public.ledger_owners(owner_id),
  idempotency_key uuid not null,
  schema_version integer not null check (schema_version = 1),
  payload_digest text not null check (payload_digest ~ '^[a-f0-9]{64}$'),
  status text not null check (status in ('staged','applied','aborted','failed')),
  created_at timestamptz not null default now(),
  applied_at timestamptz,
  unique (owner_id, idempotency_key),
  unique (id, owner_id)
);

create table public.restore_chunks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.ledger_owners(owner_id),
  restore_id uuid not null,
  chunk_index integer not null check (chunk_index >= 0),
  chunk jsonb not null,
  created_at timestamptz not null default now(),
  foreign key (restore_id, owner_id) references public.restore_runs(id, owner_id),
  unique (restore_id, chunk_index)
);

commit;
