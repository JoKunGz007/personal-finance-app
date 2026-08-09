-- Cash entry and the correction path (PLAN task 22, the rest of its title).
--
-- Two features in one migration, deliberately. Each new owner-record table is a table the
-- backup must carry, so each one bumps the backup schema version and every older version has
-- to stay restorable forever (D-056, SPEC gate 6). Shipping these separately would mean two
-- bumps and two more versions to keep alive; together it is one, v4 -> v5.
--
-- ## Why cash is its own table and not a `source_transactions` row
--
-- `source_transactions` requires a `fingerprint` unique per owner and account, a `source_date`,
-- an `account_id` and a `post_balance_minor`. Those columns exist to enforce two things: that a
-- statement row is imported at most once, and that the balances printed by the bank chain
-- together. A cash payment has no statement, so it has no fingerprint to be idempotent on and
-- no printed balance to chain to; `accounts.bank_code` is also checked against the three banks,
-- so there is no account to hang it on either. Admitting it would mean a nullable fingerprint
-- and a nullable post-balance, which removes the guarantees that table exists for from every
-- row in it, including the 1,465 real ones. Cash is a separate fact, and it merges into the
-- ledger view at read time exactly as a slip does (D-062).
--
-- ## Why corrections are overlays and not updates
--
-- Migration 011 put `slips_immutable` on `public.slips` and recorded the omission in its own
-- comment: correcting a captured slip was left out because the pattern for it —
-- `transaction_overlays` plus `overlay_revisions` — would have tripled that migration. This is
-- that pattern, applied twice. `cash_entries` gets the same immutable trigger for the same
-- reason: cash is the one figure in this ledger with no bank statement behind it, so what the
-- owner first typed and what they later corrected it to is the only evidence the number has.
--
-- ## Correcting an amount can invalidate a stored match, and that is refused rather than fixed
--
-- `set_slip_match` requires a slip's amount to equal the statement row's movement to the minor
-- unit (D-072). Correcting the amount afterwards could leave a stored `matched` decision whose
-- two sides no longer agree — a payment silently pairing with an unrelated row. Rather than
-- rewriting the decision on the owner's behalf, a correction that would break it is refused and
-- names the conflict. Unmatching first is one click and it is visible; a silent re-pair is not.

begin;

-- ---------------------------------------------------------------- cash entries

create table public.cash_entries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.ledger_owners(owner_id),
  -- The same two words `source_components` and `public.slips` use, so the ledger view keeps
  -- one vocabulary for one concept rather than translating between three.
  kind text not null check (kind in ('deposit','withdrawal')),
  amount_minor bigint not null,
  currency text not null check (currency = 'THB'),
  occurred_on date not null,
  occurred_at_time time,
  counterparty text check (counterparty is null or length(btrim(counterparty)) between 1 and 240),
  category_id uuid,
  note text check (note is null or length(note) <= 2000),
  created_at timestamptz not null default now(),
  foreign key (category_id, owner_id) references public.categories(id, owner_id),
  check ((kind = 'deposit' and amount_minor > 0) or (kind = 'withdrawal' and amount_minor < 0)),
  unique (id, owner_id)
);

create index cash_entries_owner_occurred_on on public.cash_entries(owner_id, occurred_on);

-- Append-only, like every other ledger-fact table. Unlike a slip there is no QR and no
-- statement to check the figure against later, which is the argument for the correction
-- overlay below rather than an argument against immutability.
create trigger cash_entries_immutable before update or delete on public.cash_entries
  for each row execute function private.reject_change();

-- ------------------------------------------------- cash entry correction overlay

create table public.cash_entry_overlays (
  cash_entry_id uuid primary key,
  owner_id uuid not null references public.ledger_owners(owner_id),
  -- Null means "not corrected"; the base row's value stands. Amount and kind move together
  -- because the sign check below couples them, and a corrected amount whose kind stayed
  -- behind would be a withdrawal recorded as a positive number.
  kind text check (kind is null or kind in ('deposit','withdrawal')),
  amount_minor bigint,
  occurred_on date,
  occurred_at_time time,
  counterparty text check (counterparty is null or length(btrim(counterparty)) between 1 and 240),
  category_id uuid,
  note text check (note is null or length(note) <= 2000),
  revision integer not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now(),
  foreign key (cash_entry_id, owner_id) references public.cash_entries(id, owner_id),
  foreign key (category_id, owner_id) references public.categories(id, owner_id),
  check ((kind is null) = (amount_minor is null)),
  check (amount_minor is null
      or (kind = 'deposit' and amount_minor > 0)
      or (kind = 'withdrawal' and amount_minor < 0)),
  unique (cash_entry_id, owner_id)
);

create table public.cash_entry_revisions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.ledger_owners(owner_id),
  cash_entry_id uuid not null,
  revision integer not null check (revision > 0),
  snapshot jsonb not null,
  changed_at timestamptz not null default now(),
  changed_by uuid not null references auth.users(id),
  foreign key (cash_entry_id, owner_id) references public.cash_entries(id, owner_id),
  unique (cash_entry_id, revision),
  unique (id, owner_id)
);

create index cash_entry_revisions_owner_entry on public.cash_entry_revisions(owner_id, cash_entry_id);

create trigger cash_entry_revisions_immutable before update or delete on public.cash_entry_revisions
  for each row execute function private.reject_change();

-- ------------------------------------------------------ slip correction overlay

-- Deliberately not correctable: `bank_code`, `bank_qr_code`, `slip_reference` and `qr_payload`.
-- Those came from the QR under its own CRC (D-053, D-056) rather than from typing, and
-- `slip_reference` is half the dedup key `unique (owner_id, bank_code, slip_reference)`. A
-- correctable identity would let one slip be re-typed into another's, which capture exists to
-- prevent. What the owner typed is what the owner may correct.
create table public.slip_correction_overlays (
  slip_id uuid primary key,
  owner_id uuid not null references public.ledger_owners(owner_id),
  kind text check (kind is null or kind in ('deposit','withdrawal')),
  amount_minor bigint,
  occurred_on date,
  occurred_at_time time,
  counterparty text check (counterparty is null or length(btrim(counterparty)) between 1 and 240),
  category_id uuid,
  note text check (note is null or length(note) <= 2000),
  revision integer not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now(),
  foreign key (slip_id, owner_id) references public.slips(id, owner_id),
  foreign key (category_id, owner_id) references public.categories(id, owner_id),
  check ((kind is null) = (amount_minor is null)),
  check (amount_minor is null
      or (kind = 'deposit' and amount_minor > 0)
      or (kind = 'withdrawal' and amount_minor < 0)),
  unique (slip_id, owner_id)
);

create table public.slip_correction_revisions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.ledger_owners(owner_id),
  slip_id uuid not null,
  revision integer not null check (revision > 0),
  snapshot jsonb not null,
  changed_at timestamptz not null default now(),
  changed_by uuid not null references auth.users(id),
  foreign key (slip_id, owner_id) references public.slips(id, owner_id),
  unique (slip_id, revision),
  unique (id, owner_id)
);

create index slip_correction_revisions_owner_slip on public.slip_correction_revisions(owner_id, slip_id);

create trigger slip_correction_revisions_immutable before update or delete on public.slip_correction_revisions
  for each row execute function private.reject_change();

-- ------------------------------------------------------------ RLS and grants

alter table public.cash_entries enable row level security;
alter table public.cash_entries force row level security;
alter table public.cash_entry_overlays enable row level security;
alter table public.cash_entry_overlays force row level security;
alter table public.cash_entry_revisions enable row level security;
alter table public.cash_entry_revisions force row level security;
alter table public.slip_correction_overlays enable row level security;
alter table public.slip_correction_overlays force row level security;
alter table public.slip_correction_revisions enable row level security;
alter table public.slip_correction_revisions force row level security;

create policy strong_owner_select on public.cash_entries for select to authenticated
  using (private.has_strong_owner_access(owner_id));
create policy strong_owner_select on public.cash_entry_overlays for select to authenticated
  using (private.has_strong_owner_access(owner_id));
create policy strong_owner_select on public.cash_entry_revisions for select to authenticated
  using (private.has_strong_owner_access(owner_id));
create policy strong_owner_select on public.slip_correction_overlays for select to authenticated
  using (private.has_strong_owner_access(owner_id));
create policy strong_owner_select on public.slip_correction_revisions for select to authenticated
  using (private.has_strong_owner_access(owner_id));

grant select on public.cash_entries to authenticated;
grant select on public.cash_entry_overlays to authenticated;
grant select on public.cash_entry_revisions to authenticated;
grant select on public.slip_correction_overlays to authenticated;
grant select on public.slip_correction_revisions to authenticated;
-- Stated rather than assumed, matching migrations 010, 011 and 012: the RPCs below are the
-- only write paths, and a future blanket grant must not quietly open a way around them.
revoke insert, update, delete on public.cash_entries from authenticated, anon;
revoke insert, update, delete on public.cash_entry_overlays from authenticated, anon;
revoke insert, update, delete on public.cash_entry_revisions from authenticated, anon;
revoke insert, update, delete on public.slip_correction_overlays from authenticated, anon;
revoke insert, update, delete on public.slip_correction_revisions from authenticated, anon;

-- --------------------------------------------------------------- write paths

/*
 * Recording a cash payment. There is no idempotency key here on purpose: a cash entry has no
 * external identity to be idempotent on, and two identical payments on one day are an ordinary
 * thing rather than a duplicate. That is the opposite of `capture_slip`, whose QR reference is
 * exactly such an identity, and the difference is worth stating so neither is copied onto the
 * other later.
 */
create or replace function public.create_cash_entry(
  p_kind text, p_amount_minor text, p_occurred_on date, p_occurred_at_time time,
  p_counterparty text, p_category_id uuid, p_note text
) returns jsonb language plpgsql security definer set search_path = public, private, pg_temp
as $$
declare
  v_owner uuid := auth.uid();
  v_amount bigint;
  v_id uuid;
  v_row jsonb;
begin
  if not private.has_strong_owner_access(v_owner) then raise exception 'strong owner access required'; end if;
  if p_kind not in ('deposit','withdrawal') then raise exception 'invalid cash entry kind'; end if;
  -- Money crosses this boundary as canonical int64 text, never as a JSON number (D-002).
  if not private.is_canonical_int64_text(p_amount_minor) then raise exception 'cash entry amount must be canonical int64 text'; end if;
  v_amount := p_amount_minor::bigint;
  if (p_kind = 'deposit') <> (v_amount > 0) then raise exception 'cash entry amount sign does not match its kind'; end if;
  if p_occurred_on is null then raise exception 'cash entry requires a date'; end if;
  if p_category_id is not null and not exists (
    select 1 from public.categories where id = p_category_id and owner_id = v_owner
  ) then raise exception 'category not owned'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_owner::text || ':ledger-mutation', 0));

  insert into public.cash_entries(owner_id, kind, amount_minor, currency, occurred_on, occurred_at_time, counterparty, category_id, note)
    values (v_owner, p_kind, v_amount, 'THB', p_occurred_on, p_occurred_at_time,
            nullif(btrim(coalesce(p_counterparty,'')),''), p_category_id, nullif(btrim(coalesce(p_note,'')),''))
    returning id into v_id;

  select to_jsonb(c) into v_row from public.cash_entries c where c.id = v_id and c.owner_id = v_owner;
  insert into public.audit_events(owner_id, actor_id, event_type, entity_type, entity_id, detail)
    values (v_owner, v_owner, 'cash.entry.created', 'cash_entry', v_id,
      jsonb_build_object('kind', p_kind, 'occurred_on', p_occurred_on));
  update public.mutation_sequences set sequence = sequence + 1, updated_at = now() where owner_id = v_owner;

  return v_row;
end;
$$;
revoke all on function public.create_cash_entry(text,text,date,time,text,uuid,text) from public, anon;
grant execute on function public.create_cash_entry(text,text,date,time,text,uuid,text) to authenticated;

/*
 * Correcting a cash entry. Optimistic concurrency through `p_expected_revision`, exactly as
 * `set_slip_match` and `update_transaction_overlay` do it: 0 means "I believe no correction
 * exists". A null amount clears the correction and lets the original figure stand again, which
 * is what makes a mistaken correction itself correctable.
 */
create or replace function public.set_cash_entry_correction(
  p_cash_entry_id uuid, p_expected_revision integer, p_kind text, p_amount_minor text,
  p_occurred_on date, p_occurred_at_time time, p_counterparty text, p_category_id uuid, p_note text
) returns jsonb language plpgsql security definer set search_path = public, private, pg_temp
as $$
declare
  v_owner uuid := auth.uid();
  v_entry public.cash_entries%rowtype;
  v_amount bigint;
  v_revision integer;
  v_snapshot jsonb;
begin
  if not private.has_strong_owner_access(v_owner) then raise exception 'strong owner access required'; end if;
  if (p_kind is null) <> (p_amount_minor is null) then raise exception 'cash correction amount and kind move together'; end if;
  if p_amount_minor is not null then
    if p_kind not in ('deposit','withdrawal') then raise exception 'invalid cash entry kind'; end if;
    if not private.is_canonical_int64_text(p_amount_minor) then raise exception 'cash entry amount must be canonical int64 text'; end if;
    v_amount := p_amount_minor::bigint;
    if (p_kind = 'deposit') <> (v_amount > 0) then raise exception 'cash entry amount sign does not match its kind'; end if;
  end if;

  select * into v_entry from public.cash_entries where id = p_cash_entry_id and owner_id = v_owner;
  if v_entry.id is null then raise exception 'cash entry not owned'; end if;
  if p_category_id is not null and not exists (
    select 1 from public.categories where id = p_category_id and owner_id = v_owner
  ) then raise exception 'category not owned'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_owner::text || ':ledger-mutation', 0));

  select revision into v_revision from public.cash_entry_overlays
    where cash_entry_id = p_cash_entry_id and owner_id = v_owner for update;
  v_revision := coalesce(v_revision, 0);
  if v_revision <> p_expected_revision then raise exception 'cash correction revision conflict'; end if;
  v_revision := v_revision + 1;

  insert into public.cash_entry_overlays(cash_entry_id, owner_id, kind, amount_minor, occurred_on,
      occurred_at_time, counterparty, category_id, note, revision)
    values (p_cash_entry_id, v_owner, p_kind, v_amount, p_occurred_on, p_occurred_at_time,
      nullif(btrim(coalesce(p_counterparty,'')),''), p_category_id, nullif(btrim(coalesce(p_note,'')),''), v_revision)
  on conflict (cash_entry_id) do update set kind = excluded.kind, amount_minor = excluded.amount_minor,
    occurred_on = excluded.occurred_on, occurred_at_time = excluded.occurred_at_time,
    counterparty = excluded.counterparty, category_id = excluded.category_id, note = excluded.note,
    revision = excluded.revision, updated_at = now();

  select to_jsonb(o) into v_snapshot from public.cash_entry_overlays o
    where o.cash_entry_id = p_cash_entry_id and o.owner_id = v_owner;
  insert into public.cash_entry_revisions(owner_id, cash_entry_id, revision, snapshot, changed_by)
    values (v_owner, p_cash_entry_id, v_revision, v_snapshot, v_owner);
  insert into public.audit_events(owner_id, actor_id, event_type, entity_type, entity_id, detail)
    values (v_owner, v_owner, 'cash.entry.corrected', 'cash_entry', p_cash_entry_id,
      jsonb_build_object('revision', v_revision, 'amount_corrected', p_amount_minor is not null));
  update public.mutation_sequences set sequence = sequence + 1, updated_at = now() where owner_id = v_owner;

  return v_snapshot;
end;
$$;
revoke all on function public.set_cash_entry_correction(uuid,integer,text,text,date,time,text,uuid,text) from public, anon;
grant execute on function public.set_cash_entry_correction(uuid,integer,text,text,date,time,text,uuid,text) to authenticated;

/*
 * Correcting a captured slip — the omission migration 011 recorded in its own comment.
 *
 * The stored-match guard is the reason this is not a copy of the cash version. `set_slip_match`
 * accepted a pairing because the slip's amount equalled the statement row's movement exactly.
 * Correcting the amount afterwards can falsify that, and the resulting pair would be a payment
 * matched to an unrelated row with nothing on screen to say so. The correction is refused while
 * such a decision stands.
 */
create or replace function public.set_slip_correction(
  p_slip_id uuid, p_expected_revision integer, p_kind text, p_amount_minor text,
  p_occurred_on date, p_occurred_at_time time, p_counterparty text, p_category_id uuid, p_note text
) returns jsonb language plpgsql security definer set search_path = public, private, pg_temp
as $$
declare
  v_owner uuid := auth.uid();
  v_slip public.slips%rowtype;
  v_amount bigint;
  v_effective bigint;
  v_revision integer;
  v_snapshot jsonb;
  v_matched uuid;
  v_movement bigint;
begin
  if not private.has_strong_owner_access(v_owner) then raise exception 'strong owner access required'; end if;
  if (p_kind is null) <> (p_amount_minor is null) then raise exception 'slip correction amount and kind move together'; end if;
  if p_amount_minor is not null then
    if p_kind not in ('deposit','withdrawal') then raise exception 'invalid slip kind'; end if;
    if not private.is_canonical_int64_text(p_amount_minor) then raise exception 'slip amount must be canonical int64 text'; end if;
    v_amount := p_amount_minor::bigint;
    if (p_kind = 'deposit') <> (v_amount > 0) then raise exception 'slip amount sign does not match its kind'; end if;
  end if;

  select * into v_slip from public.slips where id = p_slip_id and owner_id = v_owner;
  if v_slip.id is null then raise exception 'slip not owned'; end if;
  if p_category_id is not null and not exists (
    select 1 from public.categories where id = p_category_id and owner_id = v_owner
  ) then raise exception 'category not owned'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_owner::text || ':ledger-mutation', 0));

  -- The amount that would be in force after this correction: the corrected one when given,
  -- otherwise the slip's own. Checked against a stored match either way, because clearing a
  -- correction can break a pairing just as setting one can.
  v_effective := coalesce(v_amount, v_slip.amount_minor);
  select o.transaction_id into v_matched from public.slip_match_overlays o
    where o.slip_id = p_slip_id and o.owner_id = v_owner and o.decision = 'matched';
  if v_matched is not null then
    select sum(c.amount_minor) into v_movement from public.source_components c
      where c.transaction_id = v_matched and c.owner_id = v_owner;
    if v_movement is distinct from v_effective then
      raise exception 'slip correction conflicts with stored match';
    end if;
  end if;

  select revision into v_revision from public.slip_correction_overlays
    where slip_id = p_slip_id and owner_id = v_owner for update;
  v_revision := coalesce(v_revision, 0);
  if v_revision <> p_expected_revision then raise exception 'slip correction revision conflict'; end if;
  v_revision := v_revision + 1;

  insert into public.slip_correction_overlays(slip_id, owner_id, kind, amount_minor, occurred_on,
      occurred_at_time, counterparty, category_id, note, revision)
    values (p_slip_id, v_owner, p_kind, v_amount, p_occurred_on, p_occurred_at_time,
      nullif(btrim(coalesce(p_counterparty,'')),''), p_category_id, nullif(btrim(coalesce(p_note,'')),''), v_revision)
  on conflict (slip_id) do update set kind = excluded.kind, amount_minor = excluded.amount_minor,
    occurred_on = excluded.occurred_on, occurred_at_time = excluded.occurred_at_time,
    counterparty = excluded.counterparty, category_id = excluded.category_id, note = excluded.note,
    revision = excluded.revision, updated_at = now();

  select to_jsonb(o) into v_snapshot from public.slip_correction_overlays o
    where o.slip_id = p_slip_id and o.owner_id = v_owner;
  insert into public.slip_correction_revisions(owner_id, slip_id, revision, snapshot, changed_by)
    values (v_owner, p_slip_id, v_revision, v_snapshot, v_owner);
  insert into public.audit_events(owner_id, actor_id, event_type, entity_type, entity_id, detail)
    values (v_owner, v_owner, 'slip.corrected', 'slip', p_slip_id,
      jsonb_build_object('revision', v_revision, 'amount_corrected', p_amount_minor is not null));
  update public.mutation_sequences set sequence = sequence + 1, updated_at = now() where owner_id = v_owner;

  return v_snapshot;
end;
$$;
revoke all on function public.set_slip_correction(uuid,integer,text,text,date,time,text,uuid,text) from public, anon;
grant execute on function public.set_slip_correction(uuid,integer,text,text,date,time,text,uuid,text) to authenticated;

-- ------------------------------------------------------------- backup 4 -> 5

-- Same reasoning as 011 and 012, and it does not weaken with age: the only backup covering
-- this owner's whole ledger may still be an older file, so a version that stops being
-- restorable strands whatever was taken under it. None of them ever stops.
alter table public.restore_runs
  drop constraint if exists restore_runs_schema_version_check,
  add constraint restore_runs_schema_version_check check (schema_version in (1,2,3,4,5));

alter table public.restore_chunks
  drop constraint if exists restore_chunks_v2_binding,
  add constraint restore_chunks_v2_binding check (
    chunk_kind is null or (
      chunk_kind in ('accounts','categories','import_artifacts','import_batches','source_transactions',
        'source_components','import_batch_rows','transaction_overlays','overlay_revisions','audit_events',
        'mutation_sequences','slips','slip_match_overlays','slip_match_revisions',
        'cash_entries','cash_entry_overlays','cash_entry_revisions',
        'slip_correction_overlays','slip_correction_revisions')
      and row_count >= 0 and chunk_digest ~ '^[a-f0-9]{64}$'
    )
  );

-- Appended, never slotted in: the manifest binds a chunk to its index, so reordering would
-- invalidate every descriptor in a way no digest could distinguish from tampering. Indices
-- 0..13 keep meaning exactly what they meant in v4.
create or replace function public.export_backup_snapshot()
returns jsonb language plpgsql security definer set search_path=public,private,pg_temp
as $$
declare v_owner uuid:=auth.uid(); v_at timestamptz:=clock_timestamp(); v_sequence bigint; v_data jsonb; v_counts jsonb;
begin
  if not private.has_strong_owner_access(v_owner) then raise exception 'strong owner access required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_owner::text||':ledger-mutation',0));
  select sequence into v_sequence from public.mutation_sequences where owner_id=v_owner;
  v_data:=jsonb_build_object(
    'accounts',(select coalesce(jsonb_agg(to_jsonb(x) order by id),'[]') from (select * from public.accounts where owner_id=v_owner) x),
    'categories',(select coalesce(jsonb_agg(to_jsonb(x) order by id),'[]') from (select * from public.categories where owner_id=v_owner) x),
    'import_artifacts',(select coalesce(jsonb_agg(to_jsonb(x) order by id),'[]') from (select * from public.import_artifacts where owner_id=v_owner) x),
    'import_batches',(select coalesce(jsonb_agg(to_jsonb(x)-'opening_balance_minor'-'closing_balance_minor'||jsonb_build_object('opening_balance_minor',opening_balance_minor::text,'closing_balance_minor',closing_balance_minor::text) order by id),'[]') from public.import_batches x where owner_id=v_owner),
    'source_transactions',(select coalesce(jsonb_agg(to_jsonb(x)-'post_balance_minor'||jsonb_build_object('post_balance_minor',post_balance_minor::text) order by id),'[]') from public.source_transactions x where owner_id=v_owner),
    'source_components',(select coalesce(jsonb_agg(to_jsonb(x)-'amount_minor'||jsonb_build_object('amount_minor',amount_minor::text) order by transaction_id,position),'[]') from public.source_components x where owner_id=v_owner),
    'import_batch_rows',(select coalesce(jsonb_agg(to_jsonb(x) order by batch_id,source_index),'[]') from public.import_batch_rows x where owner_id=v_owner),
    'transaction_overlays',(select coalesce(jsonb_agg(to_jsonb(x) order by transaction_id),'[]') from public.transaction_overlays x where owner_id=v_owner),
    'overlay_revisions',(select coalesce(jsonb_agg(to_jsonb(x) order by transaction_id,revision),'[]') from public.overlay_revisions x where owner_id=v_owner),
    'audit_events',(select coalesce(jsonb_agg(to_jsonb(x)-'id'||jsonb_build_object('id',id::text) order by id),'[]') from public.audit_events x where owner_id=v_owner),
    'mutation_sequences',(select coalesce(jsonb_agg(to_jsonb(x)-'sequence'-'last_exported_sequence'||jsonb_build_object('sequence',sequence::text,'last_exported_sequence',last_exported_sequence::text) order by owner_id),'[]') from public.mutation_sequences x where owner_id=v_owner),
    'slips',(select coalesce(jsonb_agg(to_jsonb(x)-'amount_minor'||jsonb_build_object('amount_minor',amount_minor::text) order by id),'[]') from public.slips x where owner_id=v_owner),
    'slip_match_overlays',(select coalesce(jsonb_agg(to_jsonb(x) order by slip_id),'[]') from public.slip_match_overlays x where owner_id=v_owner),
    'slip_match_revisions',(select coalesce(jsonb_agg(to_jsonb(x) order by slip_id,revision),'[]') from public.slip_match_revisions x where owner_id=v_owner),
    'cash_entries',(select coalesce(jsonb_agg(to_jsonb(x)-'amount_minor'||jsonb_build_object('amount_minor',amount_minor::text) order by id),'[]') from public.cash_entries x where owner_id=v_owner),
    -- A null corrected amount stays null rather than becoming the string "null": the overlay's
    -- own CHECK reads it as "not corrected", and a restore that turned it into text would be
    -- restoring a correction the owner never made.
    'cash_entry_overlays',(select coalesce(jsonb_agg(case when amount_minor is null then to_jsonb(x)
      else to_jsonb(x)-'amount_minor'||jsonb_build_object('amount_minor',amount_minor::text) end order by cash_entry_id),'[]') from public.cash_entry_overlays x where owner_id=v_owner),
    'cash_entry_revisions',(select coalesce(jsonb_agg(to_jsonb(x) order by cash_entry_id,revision),'[]') from public.cash_entry_revisions x where owner_id=v_owner),
    'slip_correction_overlays',(select coalesce(jsonb_agg(case when amount_minor is null then to_jsonb(x)
      else to_jsonb(x)-'amount_minor'||jsonb_build_object('amount_minor',amount_minor::text) end order by slip_id),'[]') from public.slip_correction_overlays x where owner_id=v_owner),
    'slip_correction_revisions',(select coalesce(jsonb_agg(to_jsonb(x) order by slip_id,revision),'[]') from public.slip_correction_revisions x where owner_id=v_owner)
  );
  select jsonb_object_agg(key,jsonb_array_length(value)) into v_counts from jsonb_each(v_data);
  return jsonb_build_object('schemaVersion',5,'exportedAt',to_char(v_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'snapshotSequence',v_sequence::text,'tableCounts',v_counts,'data',v_data);
end;
$$;
revoke all on function public.export_backup_snapshot() from public,anon;
grant execute on function public.export_backup_snapshot() to authenticated;

-- The kind list is built up by version, so a sixth version adds one line and strands nothing.
create or replace function public.restore_backup(p_action text,p_request jsonb)
returns jsonb language plpgsql security definer set search_path=public,private,pg_temp
as $$
declare
 v_owner uuid:=auth.uid(); v_restore uuid; v_idempotency uuid; v_digest text;
 v_run public.restore_runs%rowtype; v_descriptor jsonb; v_chunk record; v_row jsonb;
 v_index integer; v_kind text; v_count integer; v_chunk_digest text; v_manifest jsonb; v_payload jsonb;
 v_base_kinds text[]:=array['accounts','categories','import_artifacts','import_batches','source_transactions',
  'source_components','import_batch_rows','transaction_overlays','overlay_revisions','audit_events','mutation_sequences'];
 v_expected_kinds text[]; v_kind_count integer; v_schema integer; v_schema_text text;
 v_restored_sequence bigint;
begin
 if not private.has_strong_owner_access(v_owner) then raise exception 'strong owner access required'; end if;
 begin
  v_restore:=(p_request->>'restoreId')::uuid; v_idempotency:=(p_request->>'idempotencyKey')::uuid; v_digest:=p_request->>'digest';
 exception when others then raise exception 'invalid restore contract'; end;
 v_schema_text:=p_request->>'schemaVersion';
 if v_schema_text not in ('2','3','4','5') or v_digest!~'^[a-f0-9]{64}$' then raise exception 'invalid restore contract'; end if;
 v_schema:=v_schema_text::integer;
 v_expected_kinds:=v_base_kinds;
 if v_schema>=3 then v_expected_kinds:=v_expected_kinds||array['slips']; end if;
 if v_schema>=4 then v_expected_kinds:=v_expected_kinds||array['slip_match_overlays','slip_match_revisions']; end if;
 if v_schema>=5 then v_expected_kinds:=v_expected_kinds||array['cash_entries','cash_entry_overlays','cash_entry_revisions','slip_correction_overlays','slip_correction_revisions']; end if;
 v_kind_count:=array_length(v_expected_kinds,1);
 perform pg_advisory_xact_lock(hashtextextended(v_owner::text||':ledger-mutation',0));
  if p_action='stage' then
   v_manifest:=p_request->'manifest';
   if jsonb_typeof(v_manifest) is distinct from 'object'
     or jsonb_typeof(v_manifest->'payloadDigest') is distinct from 'string'
     or v_manifest->>'payloadDigest' is distinct from v_digest
     or jsonb_typeof(v_manifest->'snapshotSequence') is distinct from 'string'
     or not private.is_canonical_int64_text(v_manifest->>'snapshotSequence',true)
     or (v_manifest->>'snapshotSequence')::numeric >= 9223372036854775807
     or jsonb_typeof(v_manifest->'exportedAt') is distinct from 'string'
     or jsonb_typeof(v_manifest->'chunks') is distinct from 'array'
     or jsonb_array_length(v_manifest->'chunks')<>v_kind_count
     or jsonb_typeof(v_manifest->'tableCounts') is distinct from 'object'
     or (select count(*) from jsonb_object_keys(v_manifest->'tableCounts'))<>v_kind_count
     or (v_manifest->>'exportedAt')::timestamptz is null then raise exception 'invalid restore manifest'; end if;
  for v_index in 0..v_kind_count-1 loop
   v_descriptor:=v_manifest->'chunks'->v_index;
   v_kind:=v_expected_kinds[v_index+1];
    if jsonb_typeof(v_descriptor) is distinct from 'object'
      or (select count(*) from jsonb_object_keys(v_descriptor))<>4
      or not (v_manifest->'tableCounts' ? v_kind)
      or jsonb_typeof(v_manifest#>array['tableCounts',v_kind]) is distinct from 'number'
      or jsonb_typeof(v_descriptor->'index') is distinct from 'number'
      or jsonb_typeof(v_descriptor->'rowCount') is distinct from 'number'
      or (v_manifest#>>array['tableCounts',v_kind]) !~ '^(0|[1-9][0-9]*)$'
      or (v_descriptor->>'rowCount') !~ '^(0|[1-9][0-9]*)$'
      or (v_descriptor->>'index')::integer is distinct from v_index
      or v_descriptor->>'kind' is distinct from v_kind
      or (v_descriptor->>'rowCount')::integer<0
      or v_descriptor->>'sha256' is null or v_descriptor->>'sha256'!~'^[a-f0-9]{64}$'
      or (v_manifest#>>array['tableCounts',v_kind])::integer is distinct from (v_descriptor->>'rowCount')::integer
      or (v_kind='mutation_sequences' and (v_descriptor->>'rowCount')::integer<>1)
      then raise exception 'invalid restore manifest descriptor'; end if;
  end loop;
  select * into v_run from public.restore_runs where owner_id=v_owner and idempotency_key=v_idempotency;
  if v_run.id is not null then
   if v_run.id<>v_restore or v_run.payload_digest<>v_digest or v_run.manifest<>v_manifest
     or v_run.schema_version is distinct from v_schema then raise exception 'restore idempotency conflict'; end if;
   return to_jsonb(v_run);
  end if;
  insert into public.restore_runs(id,owner_id,idempotency_key,schema_version,payload_digest,status,manifest,snapshot_sequence)
   values(v_restore,v_owner,v_idempotency,v_schema,v_digest,'staged',v_manifest,(v_manifest->>'snapshotSequence')::bigint) returning * into v_run;
  return to_jsonb(v_run);
 end if;
  select * into v_run from public.restore_runs where id=v_restore and owner_id=v_owner for update;
  if v_run.id is null or v_run.schema_version is distinct from v_schema
    or v_run.idempotency_key is distinct from v_idempotency
    or v_run.payload_digest is distinct from v_digest then raise exception 'restore session not found'; end if;
  if p_action='abort' then
   if v_run.status='applied' then return to_jsonb(v_run); end if;
   if v_run.status<>'staged' then raise exception 'restore is not staged'; end if;
   delete from public.restore_chunks where restore_id=v_restore and owner_id=v_owner;
   update public.restore_runs set status='aborted' where id=v_restore returning * into v_run; return to_jsonb(v_run);
 elsif p_action='chunk' then
  if v_run.status<>'staged' or jsonb_typeof(p_request->'chunk')<>'object'
    or jsonb_typeof(p_request#>'{chunk,rows}')<>'array' then raise exception 'restore is not accepting chunks'; end if;
  v_index:=(p_request->>'chunkIndex')::integer; v_kind:=p_request#>>'{chunk,kind}'; v_chunk_digest:=p_request->>'chunkDigest';
   if v_index not between 0 and v_kind_count-1 or v_kind is distinct from v_expected_kinds[v_index+1] then raise exception 'restore chunk ordering mismatch'; end if;
   v_descriptor:=v_run.manifest->'chunks'->v_index;
   v_count:=jsonb_array_length(p_request#>'{chunk,rows}');
   if v_kind is distinct from v_descriptor->>'kind'
     or v_count is distinct from (v_descriptor->>'rowCount')::integer
     or v_chunk_digest is distinct from v_descriptor->>'sha256'
     or private.sha256_jsonb(p_request->'chunk') is distinct from v_chunk_digest
     then raise exception 'restore chunk binding mismatch'; end if;
   if v_kind='mutation_sequences' then
    v_row:=p_request#>'{chunk,rows,0}';
    if v_count<>1
      or jsonb_typeof(v_row->'sequence') is distinct from 'string'
      or jsonb_typeof(v_row->'last_exported_sequence') is distinct from 'string'
      or not private.is_canonical_int64_text(v_row->>'sequence',true)
      or not private.is_canonical_int64_text(v_row->>'last_exported_sequence',true)
      or (v_row->>'sequence')::bigint is distinct from v_run.snapshot_sequence
      or (v_row->>'last_exported_sequence')::bigint>(v_row->>'sequence')::bigint
      then raise exception 'restore mutation sequence mismatch'; end if;
   end if;
  if exists(select 1 from public.restore_chunks where restore_id=v_restore and chunk_index=v_index
    and (chunk<>p_request->'chunk' or chunk_digest<>v_chunk_digest)) then raise exception 'restore chunk overwrite rejected'; end if;
  insert into public.restore_chunks(owner_id,restore_id,chunk_index,chunk,chunk_kind,row_count,chunk_digest)
   values(v_owner,v_restore,v_index,p_request->'chunk',v_kind,v_count,v_chunk_digest) on conflict(restore_id,chunk_index) do nothing;
  return jsonb_build_object('id',v_restore,'status','staged','chunkIndex',v_index);
 elsif p_action<>'commit' then raise exception 'unknown restore action'; end if;
 if v_run.status='applied' then return to_jsonb(v_run); end if;
 if v_run.status<>'staged' then raise exception 'restore is not staged'; end if;
  if exists(select 1 from public.accounts where owner_id=v_owner)
    or exists(select 1 from public.import_artifacts where owner_id=v_owner)
    or exists(select 1 from public.import_batches where owner_id=v_owner)
    or exists(select 1 from public.source_transactions where owner_id=v_owner)
    or exists(select 1 from public.source_components where owner_id=v_owner)
    or exists(select 1 from public.import_batch_rows where owner_id=v_owner)
    or exists(select 1 from public.transaction_overlays where owner_id=v_owner)
    or exists(select 1 from public.overlay_revisions where owner_id=v_owner)
    or exists(select 1 from public.audit_events where owner_id=v_owner)
    or exists(select 1 from public.slips where owner_id=v_owner)
    or exists(select 1 from public.slip_match_overlays where owner_id=v_owner)
    or exists(select 1 from public.slip_match_revisions where owner_id=v_owner)
    -- Cash and corrections count as records for the same reason slips and decisions do: the
    -- question is whether this ledger already holds anything, not whether the payload does.
    or exists(select 1 from public.cash_entries where owner_id=v_owner)
    or exists(select 1 from public.cash_entry_overlays where owner_id=v_owner)
    or exists(select 1 from public.cash_entry_revisions where owner_id=v_owner)
    or exists(select 1 from public.slip_correction_overlays where owner_id=v_owner)
    or exists(select 1 from public.slip_correction_revisions where owner_id=v_owner)
    then raise exception 'restore destination ledger is not empty'; end if;
 if (select count(*) from public.restore_chunks where restore_id=v_restore and owner_id=v_owner)<>v_kind_count then raise exception 'restore chunks incomplete'; end if;
 v_payload:=jsonb_build_object('schemaVersion',v_schema,'exportedAt',v_run.manifest->'exportedAt',
   'snapshotSequence',v_run.manifest->'snapshotSequence','tableCounts',v_run.manifest->'tableCounts','data','{}'::jsonb);
 for v_index in 0..v_kind_count-1 loop
  select * into v_chunk from public.restore_chunks where restore_id=v_restore and owner_id=v_owner and chunk_index=v_index;
  v_descriptor:=v_run.manifest->'chunks'->v_index;
   if v_chunk.chunk_kind is distinct from v_expected_kinds[v_index+1]
     or v_chunk.row_count is distinct from jsonb_array_length(v_chunk.chunk->'rows')
     or v_chunk.chunk_digest is distinct from private.sha256_jsonb(v_chunk.chunk)
     or v_chunk.chunk_digest is distinct from v_descriptor->>'sha256'
     then raise exception 'restore chunk altered'; end if;
  v_payload:=jsonb_set(v_payload,array['data',v_chunk.chunk_kind],v_chunk.chunk->'rows',true);
 end loop;
 if private.sha256_jsonb(v_payload)<>v_run.payload_digest then raise exception 'restore aggregate digest mismatch'; end if;
 delete from public.categories where owner_id=v_owner;
 for v_chunk in select * from public.restore_chunks where restore_id=v_restore and owner_id=v_owner order by chunk_index loop
  for v_row in select value from jsonb_array_elements(v_chunk.chunk->'rows') loop
   case v_chunk.chunk_kind
   when 'accounts' then insert into public.accounts(id,owner_id,bank_code,label,account_type,last_four,currency,timezone,created_at)
    values((v_row->>'id')::uuid,v_owner,v_row->>'bank_code',v_row->>'label',v_row->>'account_type',v_row->>'last_four',v_row->>'currency',v_row->>'timezone',(v_row->>'created_at')::timestamptz);
   when 'categories' then insert into public.categories(id,owner_id,name,archived,created_at,updated_at)
    values((v_row->>'id')::uuid,v_owner,v_row->>'name',(v_row->>'archived')::boolean,(v_row->>'created_at')::timestamptz,(v_row->>'updated_at')::timestamptz);
   when 'import_artifacts' then insert into public.import_artifacts(id,owner_id,artifact_digest,contract_version,created_at)
    values((v_row->>'id')::uuid,v_owner,v_row->>'artifact_digest',v_row->>'contract_version',(v_row->>'created_at')::timestamptz);
    when 'import_batches' then
     if jsonb_typeof(v_row->'opening_balance_minor') is distinct from 'string'
       or jsonb_typeof(v_row->'closing_balance_minor') is distinct from 'string'
       or not private.is_canonical_int64_text(v_row->>'opening_balance_minor')
       or not private.is_canonical_int64_text(v_row->>'closing_balance_minor')
       then raise exception 'restore import-batch money must be canonical int64 text'; end if;
     insert into public.import_batches(id,owner_id,account_id,artifact_id,idempotency_key,payload_digest,status,confirmed_at,period_start,period_end,opening_balance_minor,closing_balance_minor,currency)
      values((v_row->>'id')::uuid,v_owner,(v_row->>'account_id')::uuid,(v_row->>'artifact_id')::uuid,(v_row->>'idempotency_key')::uuid,v_row->>'payload_digest',v_row->>'status',(v_row->>'confirmed_at')::timestamptz,
        (v_row->>'period_start')::date,(v_row->>'period_end')::date,(v_row->>'opening_balance_minor')::bigint,(v_row->>'closing_balance_minor')::bigint,v_row->>'currency');
    when 'source_transactions' then
     if jsonb_typeof(v_row->'post_balance_minor') is distinct from 'string'
       or not private.is_canonical_int64_text(v_row->>'post_balance_minor')
       then raise exception 'restore transaction money must be canonical int64 text'; end if;
     insert into public.source_transactions(id,owner_id,account_id,fingerprint_version,fingerprint,source_date,source_time,effective_date,transaction_label,description,reference,branch,post_balance_minor,currency,created_at)
      values((v_row->>'id')::uuid,v_owner,(v_row->>'account_id')::uuid,v_row->>'fingerprint_version',v_row->>'fingerprint',(v_row->>'source_date')::date,nullif(v_row->>'source_time','')::time,(v_row->>'effective_date')::date,v_row->>'transaction_label',v_row->>'description',v_row->>'reference',v_row->>'branch',(v_row->>'post_balance_minor')::bigint,v_row->>'currency',(v_row->>'created_at')::timestamptz);
    when 'source_components' then
     if jsonb_typeof(v_row->'amount_minor') is distinct from 'string'
       or not private.is_canonical_int64_text(v_row->>'amount_minor')
       then raise exception 'restore component money must be canonical int64 text'; end if;
     insert into public.source_components(id,owner_id,transaction_id,position,kind,amount_minor,currency,created_at)
      values((v_row->>'id')::uuid,v_owner,(v_row->>'transaction_id')::uuid,(v_row->>'position')::smallint,v_row->>'kind',(v_row->>'amount_minor')::bigint,v_row->>'currency',(v_row->>'created_at')::timestamptz);
   when 'import_batch_rows' then insert into public.import_batch_rows(id,owner_id,batch_id,transaction_id,source_index,page,row_number,parser_fields,linked_existing)
    values((v_row->>'id')::uuid,v_owner,(v_row->>'batch_id')::uuid,(v_row->>'transaction_id')::uuid,(v_row->>'source_index')::integer,(v_row->>'page')::integer,(v_row->>'row_number')::integer,v_row->'parser_fields',(v_row->>'linked_existing')::boolean);
   when 'transaction_overlays' then insert into public.transaction_overlays(transaction_id,owner_id,category_id,description,counterparty,effective_date,note,include_in_reporting,revision,updated_at)
    values((v_row->>'transaction_id')::uuid,v_owner,nullif(v_row->>'category_id','')::uuid,v_row->>'description',v_row->>'counterparty',nullif(v_row->>'effective_date','')::date,v_row->>'note',(v_row->>'include_in_reporting')::boolean,(v_row->>'revision')::integer,(v_row->>'updated_at')::timestamptz);
   when 'overlay_revisions' then insert into public.overlay_revisions(id,owner_id,transaction_id,revision,snapshot,changed_at,changed_by)
    values((v_row->>'id')::uuid,v_owner,(v_row->>'transaction_id')::uuid,(v_row->>'revision')::integer,(v_row->'snapshot')||jsonb_build_object('owner_id',v_owner),(v_row->>'changed_at')::timestamptz,v_owner);
    when 'audit_events' then
     if jsonb_typeof(v_row->'id') is distinct from 'string'
       or not private.is_canonical_int64_text(v_row->>'id',true)
       then raise exception 'restore audit id must be canonical int64 text'; end if;
     insert into public.audit_events(id,owner_id,actor_id,event_type,entity_type,entity_id,detail,occurred_at) overriding system value
      values((v_row->>'id')::bigint,v_owner,v_owner,v_row->>'event_type',v_row->>'entity_type',(v_row->>'entity_id')::uuid,v_row->'detail',(v_row->>'occurred_at')::timestamptz);
    when 'slips' then
     if jsonb_typeof(v_row->'amount_minor') is distinct from 'string'
       or not private.is_canonical_int64_text(v_row->>'amount_minor')
       then raise exception 'restore slip money must be canonical int64 text'; end if;
     insert into public.slips(id,owner_id,bank_code,bank_qr_code,slip_reference,qr_payload,kind,amount_minor,currency,occurred_on,occurred_at_time,counterparty,category_id,note,captured_at)
      values((v_row->>'id')::uuid,v_owner,v_row->>'bank_code',v_row->>'bank_qr_code',v_row->>'slip_reference',v_row->>'qr_payload',v_row->>'kind',(v_row->>'amount_minor')::bigint,v_row->>'currency',
        (v_row->>'occurred_on')::date,nullif(v_row->>'occurred_at_time','')::time,v_row->>'counterparty',nullif(v_row->>'category_id','')::uuid,v_row->>'note',(v_row->>'captured_at')::timestamptz);
   when 'slip_match_overlays' then insert into public.slip_match_overlays(slip_id,owner_id,decision,transaction_id,revision,updated_at)
    values((v_row->>'slip_id')::uuid,v_owner,v_row->>'decision',nullif(v_row->>'transaction_id','')::uuid,(v_row->>'revision')::integer,(v_row->>'updated_at')::timestamptz);
   -- Same owner rebind the overlay history needs: the snapshot carries an owner id, and every
   -- column-level check looks straight past it (D-044).
   when 'slip_match_revisions' then insert into public.slip_match_revisions(id,owner_id,slip_id,revision,snapshot,changed_at,changed_by)
    values((v_row->>'id')::uuid,v_owner,(v_row->>'slip_id')::uuid,(v_row->>'revision')::integer,(v_row->'snapshot')||jsonb_build_object('owner_id',v_owner),(v_row->>'changed_at')::timestamptz,v_owner);
    when 'cash_entries' then
     if jsonb_typeof(v_row->'amount_minor') is distinct from 'string'
       or not private.is_canonical_int64_text(v_row->>'amount_minor')
       then raise exception 'restore cash entry money must be canonical int64 text'; end if;
     insert into public.cash_entries(id,owner_id,kind,amount_minor,currency,occurred_on,occurred_at_time,counterparty,category_id,note,created_at)
      values((v_row->>'id')::uuid,v_owner,v_row->>'kind',(v_row->>'amount_minor')::bigint,v_row->>'currency',(v_row->>'occurred_on')::date,
        nullif(v_row->>'occurred_at_time','')::time,v_row->>'counterparty',nullif(v_row->>'category_id','')::uuid,v_row->>'note',(v_row->>'created_at')::timestamptz);
    when 'cash_entry_overlays' then
     -- Null stays null: an absent corrected amount means the original stands, and only a
     -- present one is held to the canonical-text rule.
     if v_row->'amount_minor' is not null and jsonb_typeof(v_row->'amount_minor') <> 'null' then
      if jsonb_typeof(v_row->'amount_minor') is distinct from 'string'
        or not private.is_canonical_int64_text(v_row->>'amount_minor')
        then raise exception 'restore cash correction money must be canonical int64 text'; end if;
     end if;
     insert into public.cash_entry_overlays(cash_entry_id,owner_id,kind,amount_minor,occurred_on,occurred_at_time,counterparty,category_id,note,revision,updated_at)
      values((v_row->>'cash_entry_id')::uuid,v_owner,v_row->>'kind',nullif(v_row->>'amount_minor','')::bigint,nullif(v_row->>'occurred_on','')::date,
        nullif(v_row->>'occurred_at_time','')::time,v_row->>'counterparty',nullif(v_row->>'category_id','')::uuid,v_row->>'note',(v_row->>'revision')::integer,(v_row->>'updated_at')::timestamptz);
   when 'cash_entry_revisions' then insert into public.cash_entry_revisions(id,owner_id,cash_entry_id,revision,snapshot,changed_at,changed_by)
    values((v_row->>'id')::uuid,v_owner,(v_row->>'cash_entry_id')::uuid,(v_row->>'revision')::integer,(v_row->'snapshot')||jsonb_build_object('owner_id',v_owner),(v_row->>'changed_at')::timestamptz,v_owner);
    when 'slip_correction_overlays' then
     if v_row->'amount_minor' is not null and jsonb_typeof(v_row->'amount_minor') <> 'null' then
      if jsonb_typeof(v_row->'amount_minor') is distinct from 'string'
        or not private.is_canonical_int64_text(v_row->>'amount_minor')
        then raise exception 'restore slip correction money must be canonical int64 text'; end if;
     end if;
     insert into public.slip_correction_overlays(slip_id,owner_id,kind,amount_minor,occurred_on,occurred_at_time,counterparty,category_id,note,revision,updated_at)
      values((v_row->>'slip_id')::uuid,v_owner,v_row->>'kind',nullif(v_row->>'amount_minor','')::bigint,nullif(v_row->>'occurred_on','')::date,
        nullif(v_row->>'occurred_at_time','')::time,v_row->>'counterparty',nullif(v_row->>'category_id','')::uuid,v_row->>'note',(v_row->>'revision')::integer,(v_row->>'updated_at')::timestamptz);
   when 'slip_correction_revisions' then insert into public.slip_correction_revisions(id,owner_id,slip_id,revision,snapshot,changed_at,changed_by)
    values((v_row->>'id')::uuid,v_owner,(v_row->>'slip_id')::uuid,(v_row->>'revision')::integer,(v_row->'snapshot')||jsonb_build_object('owner_id',v_owner),(v_row->>'changed_at')::timestamptz,v_owner);
    when 'mutation_sequences' then v_restored_sequence:=(v_row->>'sequence')::bigint;
   else raise exception 'unsupported restore chunk kind';
   end case;
  end loop;
 end loop;
 perform setval(pg_get_serial_sequence('public.audit_events','id'),greatest(coalesce((select max(id) from public.audit_events),1),1),true);
 update public.mutation_sequences set sequence=coalesce(v_restored_sequence,v_run.snapshot_sequence)+1,last_exported_sequence=0,updated_at=now() where owner_id=v_owner;
 update public.restore_runs set status='applied',applied_at=now() where id=v_restore returning * into v_run;
 return to_jsonb(v_run);
end;
$$;
revoke all on function public.restore_backup(text,jsonb) from public,anon;
grant execute on function public.restore_backup(text,jsonb) to authenticated;

commit;
