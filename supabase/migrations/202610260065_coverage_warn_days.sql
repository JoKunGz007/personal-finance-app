-- Migration 065 — per-account "check" line for the Inbox coverage section.
--
-- `account_coverage_settings` stores how many days without a new row make an account read "check".
-- It is a display preference, mutable by design (the latest value wins), so it has no immutability
-- trigger. It is not ledger data: `set_account_coverage_warn_days` does not bump `mutation_sequences`,
-- write `audit_events` or take the ledger advisory lock. An account without a row warns at 35 days.
-- `list_account_coverage` gains a last column, `warn_after_days`.
-- accounts has unique (id, owner_id), so the composite foreign key below is used.

begin;

create table public.account_coverage_settings (
  owner_id uuid not null references public.ledger_owners(owner_id),
  account_id uuid not null,
  warn_after_days smallint not null check (warn_after_days between 1 and 365),
  updated_at timestamptz not null default now(),
  primary key (owner_id, account_id),
  foreign key (account_id, owner_id) references public.accounts(id, owner_id)
);

alter table public.account_coverage_settings enable row level security;
alter table public.account_coverage_settings force row level security;
create policy strong_owner_select on public.account_coverage_settings
  for select to authenticated using (private.has_strong_owner_access(owner_id));
revoke all on public.account_coverage_settings from anon, authenticated;
grant select on public.account_coverage_settings to authenticated;

create or replace function public.set_account_coverage_warn_days(p_account_id uuid, p_days integer)
returns void
language plpgsql security definer set search_path = public, private, pg_temp
as $$
declare v_owner uuid := auth.uid();
begin
  if not private.has_strong_owner_access(v_owner) then raise exception 'strong owner access required'; end if;
  if p_account_id is null or p_days is null or p_days < 1 or p_days > 365 then
    raise exception 'invalid coverage setting';
  end if;
  if not exists (select 1 from public.accounts where id = p_account_id and owner_id = v_owner) then
    raise exception 'account not owned';
  end if;
  -- Not ledger data: no mutation sequence bump, no audit event, no ledger lock.
  insert into public.account_coverage_settings(owner_id, account_id, warn_after_days)
    values (v_owner, p_account_id, p_days)
  on conflict (owner_id, account_id) do update
    set warn_after_days = excluded.warn_after_days, updated_at = now();
end;
$$;
revoke all on function public.set_account_coverage_warn_days(uuid, integer) from public, anon;
grant execute on function public.set_account_coverage_warn_days(uuid, integer) to authenticated;

-- The return type changes, so the function is dropped and created again.
drop function public.list_account_coverage();

-- Security invoker: RLS on accounts, source_transactions, statement_mail_arrivals and
-- account_coverage_settings decides what the caller sees. The lateral order matches
-- source_transactions_ledger_order_idx.
create function public.list_account_coverage()
returns table (account_id uuid, newest_date date, newest_time time, last_statement_mail_at timestamptz,
               warn_after_days integer)
language sql stable security invoker set search_path = public, pg_temp
as $$
  select a.id, n.source_date, n.source_time,
         (select max(m.received_at) from public.statement_mail_arrivals m
            where m.owner_id = a.owner_id and m.account_id = a.id),
         coalesce(s.warn_after_days, 35)::integer
    from public.accounts a
    left join lateral (
      select st.source_date, st.source_time from public.source_transactions st
       where st.owner_id = a.owner_id and st.account_id = a.id
       order by st.source_date desc, st.source_time desc nulls last, st.id
       limit 1
    ) n on true
    left join public.account_coverage_settings s
      on s.owner_id = a.owner_id and s.account_id = a.id
   order by a.id;
$$;
revoke all on function public.list_account_coverage() from public, anon;
grant execute on function public.list_account_coverage() to authenticated;

commit;
