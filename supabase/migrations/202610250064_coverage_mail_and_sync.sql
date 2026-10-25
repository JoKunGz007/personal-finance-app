-- Migration 064 — statement-mail arrivals, mailbox sync runs and per-account coverage.
--
-- `statement_mail_arrivals` records when the mail carrying a confirmed statement batch arrived;
-- `mail_sync_runs` records when a mailbox sync finished and whether it read everything it meant to.
-- Both are bookkeeping about the mailbox, not ledger data: neither RPC below bumps
-- `mutation_sequences`, writes `audit_events` or takes the ledger advisory lock.
-- `list_account_coverage` joins the newest stored row per account to the latest statement-mail time.

begin;

create table public.statement_mail_arrivals (
  batch_id uuid primary key,
  owner_id uuid not null references public.ledger_owners(owner_id),
  account_id uuid not null,
  received_at timestamptz not null,
  created_at timestamptz not null default now(),
  foreign key (batch_id, owner_id) references public.import_batches(id, owner_id),
  foreign key (account_id, owner_id) references public.accounts(id, owner_id)
);
create index statement_mail_arrivals_owner_account_idx
  on public.statement_mail_arrivals (owner_id, account_id, received_at desc);

create table public.mail_sync_runs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.ledger_owners(owner_id),
  finished_at timestamptz not null default now(),
  complete boolean not null
);
create index mail_sync_runs_owner_finished_idx on public.mail_sync_runs (owner_id, finished_at desc);

create trigger statement_mail_arrivals_immutable before update or delete on public.statement_mail_arrivals
  for each row execute function private.reject_change();
create trigger mail_sync_runs_immutable before update or delete on public.mail_sync_runs
  for each row execute function private.reject_change();

do $$
declare v_table text;
begin
  foreach v_table in array array['statement_mail_arrivals','mail_sync_runs'] loop
    execute format('alter table public.%I enable row level security', v_table);
    execute format('alter table public.%I force row level security', v_table);
    execute format('create policy strong_owner_select on public.%I for select to authenticated using (private.has_strong_owner_access(owner_id))', v_table);
    execute format('revoke all on public.%I from anon, authenticated', v_table);
    execute format('grant select on public.%I to authenticated', v_table);
  end loop;
end $$;

create or replace function public.record_statement_mail(p_batch_id uuid, p_received_at timestamptz)
returns void
language plpgsql security definer set search_path = public, private, pg_temp
as $$
declare v_owner uuid := auth.uid(); v_count integer;
begin
  if not private.has_strong_owner_access(v_owner) then raise exception 'strong owner access required'; end if;
  if p_batch_id is null or p_received_at is null then raise exception 'invalid statement mail'; end if;
  -- Not ledger data: no mutation sequence bump, no audit event, no ledger lock.
  insert into public.statement_mail_arrivals(batch_id, owner_id, account_id, received_at)
    select b.id, b.owner_id, b.account_id, p_received_at
      from public.import_batches b where b.id = p_batch_id and b.owner_id = v_owner
    on conflict (batch_id) do nothing;
  get diagnostics v_count = row_count;
  -- A replay inserts nothing; it is fine only when the batch exists (and is the caller's).
  if v_count = 0 and not exists (select 1 from public.import_batches where id = p_batch_id and owner_id = v_owner) then
    raise exception 'batch not owned';
  end if;
end;
$$;
revoke all on function public.record_statement_mail(uuid, timestamptz) from public, anon;
grant execute on function public.record_statement_mail(uuid, timestamptz) to authenticated;

create or replace function public.record_mail_sync(p_complete boolean)
returns timestamptz
language plpgsql security definer set search_path = public, private, pg_temp
as $$
declare v_owner uuid := auth.uid(); v_finished timestamptz;
begin
  if not private.has_strong_owner_access(v_owner) then raise exception 'strong owner access required'; end if;
  if p_complete is null then raise exception 'invalid mail sync'; end if;
  -- Not ledger data: no mutation sequence bump, no audit event, no ledger lock.
  insert into public.mail_sync_runs(owner_id, complete) values (v_owner, p_complete)
    returning finished_at into v_finished;
  return v_finished;
end;
$$;
revoke all on function public.record_mail_sync(boolean) from public, anon;
grant execute on function public.record_mail_sync(boolean) to authenticated;

-- Security invoker: RLS on accounts, source_transactions and statement_mail_arrivals decides what
-- the caller sees. The lateral order matches source_transactions_ledger_order_idx.
create or replace function public.list_account_coverage()
returns table (account_id uuid, newest_date date, newest_time time, last_statement_mail_at timestamptz)
language sql stable security invoker set search_path = public, pg_temp
as $$
  select a.id, n.source_date, n.source_time,
         (select max(m.received_at) from public.statement_mail_arrivals m
            where m.owner_id = a.owner_id and m.account_id = a.id)
    from public.accounts a
    left join lateral (
      select st.source_date, st.source_time from public.source_transactions st
       where st.owner_id = a.owner_id and st.account_id = a.id
       order by st.source_date desc, st.source_time desc nulls last, st.id
       limit 1
    ) n on true
   order by a.id;
$$;
revoke all on function public.list_account_coverage() from public, anon;
grant execute on function public.list_account_coverage() to authenticated;

commit;
