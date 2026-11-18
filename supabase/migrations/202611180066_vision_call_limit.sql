-- Migration 066 — a hard monthly limit on Google Cloud Vision calls.
--
-- Google offers no spend cap for Vision (free to 1,000 units a month; each request asks for one
-- feature, so one unit), so the app counts its own calls and refuses past a limit it is given.
-- `vision_call_months` is a meter, not ledger data: `claim_vision_call` does not bump
-- `mutation_sequences`, write `audit_events` or take the ledger advisory lock.

begin;

create table public.vision_call_months (
  owner_id uuid not null references public.ledger_owners(owner_id),
  billing_month date not null,
  calls integer not null default 0 check (calls >= 0),
  primary key (owner_id, billing_month)
);

alter table public.vision_call_months enable row level security;
alter table public.vision_call_months force row level security;
create policy strong_owner_select on public.vision_call_months
  for select to authenticated using (private.has_strong_owner_access(owner_id));
revoke all on public.vision_call_months from anon, authenticated;
grant select on public.vision_call_months to authenticated;

-- Returns the new count when a unit was claimed, or 0 when the limit was already reached.
-- One insert-or-update statement, so two concurrent claims cannot both take the last unit.
-- The month is taken in America/Los_Angeles because Google Cloud billing months run on Pacific
-- Time: the counter then resets when Google's own free tier does.
create or replace function public.claim_vision_call(p_limit integer)
returns integer
language plpgsql security definer set search_path = public, private, pg_temp
as $$
declare
  v_owner uuid := auth.uid();
  v_month date := date_trunc('month', now() at time zone 'America/Los_Angeles')::date;
  v_calls integer;
begin
  if not private.has_strong_owner_access(v_owner) then raise exception 'strong owner access required'; end if;
  if p_limit is null or p_limit < 1 then raise exception 'invalid vision call limit'; end if;
  insert into public.vision_call_months as m (owner_id, billing_month, calls)
    values (v_owner, v_month, 1)
    on conflict (owner_id, billing_month) do update set calls = m.calls + 1
      where m.calls < p_limit
    returning m.calls into v_calls;
  return coalesce(v_calls, 0);
end;
$$;
revoke all on function public.claim_vision_call(integer) from public, anon;
grant execute on function public.claim_vision_call(integer) to authenticated;

-- Security invoker: RLS on vision_call_months decides what the caller sees.
create or replace function public.vision_calls_this_month()
returns integer
language sql stable security invoker set search_path = public, pg_temp
as $$
  select coalesce((
    select m.calls from public.vision_call_months m
     where m.owner_id = auth.uid()
       and m.billing_month = date_trunc('month', now() at time zone 'America/Los_Angeles')::date
  ), 0);
$$;
revoke all on function public.vision_calls_this_month() from public, anon;
grant execute on function public.vision_calls_this_month() to authenticated;

commit;
