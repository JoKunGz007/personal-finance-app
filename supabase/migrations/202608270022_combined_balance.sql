-- Migration 022 — the combined balance is computed once, in SQL, for everyone who needs it
-- (D-158 follow-up, PLAN task 45; task 44 is the reason it is a helper rather than a column).
--
-- ## Why
--
-- `combinedBalanceByTransaction` walks the rows the client is holding and seeds each account from
-- `post_balance − movement` of the oldest row it was handed. **Per account that is exact at any
-- window depth.** The merged, all-accounts figure is not: the walk supplies an account's seed for
-- every row older than that account's oldest *held* row, so once the ledger pages, an early row is
-- summed against a shallow account's mid-history balance.
--
-- D-158 shipped a **floor** for that — below the date where every account's balance is known, the
-- column showed an em dash rather than a wrong number. Correct, and on the real ledger nearly
-- useless: three accounts hold rows (about 1,259, 248 and 97), the largest sets the floor, and the
-- column went blank for most of what was on screen. Right answer, wrong shape.
--
-- **So the derivation moves here, and this is not the two-engines mistake D-120 refused.** That
-- refusal was about the *matching rule*, which stays in TypeScript with its ~85 tests. This is the
-- opposite move: the balance had a client implementation that a page could not feed correctly, and
-- it now has exactly one implementation instead of one-and-a-floor. `lib/transactions.ts` loses its
-- copy in the same change rather than keeping a second answer around to disagree.
--
-- ## Why a helper rather than an inlined query
--
-- PLAN task 44 (statistics) wants this number too — it is the owner's actual position over time,
-- which is the series any balance chart is drawn from. Writing it twice is the waste D-158 named
-- when it argued for one candidate query serving both callers, so it is a function from the start.
--
-- ## The identity this rests on, which is what makes it one pass instead of a lateral join
--
-- An account's balance at a row is its opening plus everything it has moved since. Summing over
-- accounts, the combined balance at row R is
--
--     sum(openings) + sum of every account's movement at or before R
--
-- which is a **running total** over one ordering, not a per-row subquery over every account.
--
-- **`delta` is the difference between printed balances, not the row's movement**, and the
-- distinction is load-bearing. They are equal whenever the statement chain is intact. They differ
-- across a gap between two separately imported statements, and there the printed balance is the
-- truth and the movement sum would drift from it silently. The client's walk read printed balances
-- for the same reason; this keeps that property rather than quietly trading it for tidier algebra.
--
-- ## Exact money
--
-- Every term is a `bigint` of minor units and **nothing divides**. `sum(...) over (...)` over
-- `bigint` returns `numeric`, so the running total is cast back explicitly — an implicit numeric
-- leaking into a money path is exactly the habit this app does not have.
--
-- ## Scope
--
-- **No table, no column, no trigger, no grant to anyone new.** One private helper and one replaced
-- function body. Backup contract stays **v7**; `export_backup_snapshot` reads tables and is
-- untouched.

begin;

-- The combined balance after every confirmed row the owner holds.
--
-- ## The ordering, which must match `compareTransactions` reversed and not merely resemble it
--
-- The ledger sorts newest-first on `source_date desc, source_time desc nulls last, id`. Walking it
-- oldest-first is the exact reverse: **date ascending, time ascending nulls FIRST, id DESCENDING**.
-- The id direction is the easy one to get wrong — it does not flip in the display sort, so reading
-- that sort and negating the first two clauses gives a different sequence at any tie. Ties are not
-- hypothetical here: untimed rows sharing a date are ordinary, and two orderings that disagree on
-- them produce two different balance chains.
--
-- Marked `stable` and not `immutable`: it reads tables.
create or replace function private.combined_balances(p_owner uuid)
returns table (transaction_id uuid, combined_balance_minor bigint)
language sql stable
as $$
  with chrono as (
    select t.id,
           t.account_id,
           t.post_balance_minor,
           coalesce(m.movement, 0) as movement,
           row_number() over (order by t.source_date, t.source_time nulls first, t.id desc) as seq
      from public.source_transactions t
      left join (
        select c.transaction_id, sum(c.amount_minor) as movement
          from public.source_components c
         where c.owner_id = p_owner
         group by c.transaction_id
      ) m on m.transaction_id = t.id
     where t.owner_id = p_owner
  ),
  deltas as (
    select id,
           seq,
           -- The first row of an account has no predecessor, so it falls back to that account's
           -- opening — `post_balance − movement` — which makes its delta the movement itself.
           post_balance_minor - coalesce(
             lag(post_balance_minor) over (partition by account_id order by seq),
             post_balance_minor - movement
           ) as delta
      from chrono
  ),
  -- Each account's opening, taken from its chronologically first row. An account holding no rows
  -- contributes nothing and cannot: there is no row to derive an opening from. That is the same
  -- rule the client's walk had, and the ledger view is expected to say how many accounts are in
  -- that state rather than let the total quietly stand for all of them.
  openings as (
    select coalesce(sum(f.post_balance_minor - f.movement), 0) as total
      from (
        select distinct on (account_id) account_id, post_balance_minor, movement
          from chrono
         order by account_id, seq
      ) f
  )
  select d.id,
         (o.total + sum(d.delta) over (order by d.seq rows between unbounded preceding and current row))::bigint
    from deltas d
    cross join openings o;
$$;
revoke all on function private.combined_balances(uuid) from public, anon, authenticated;

-- Reproduced whole rather than patched, on migration 019 and 020's reasoning: `create or replace
-- function` replaces a body entire, so a migration showing only the changed lines would leave the
-- current definition readable nowhere. This is 021's function with the combined balance joined onto
-- each returned row, marked below.
create or replace function public.list_account_transactions_page(
  p_account_id uuid,
  p_limit integer default 100,
  p_before_date date default null,
  p_before_time time default null,
  p_before_id uuid default null
) returns jsonb language plpgsql stable security definer set search_path = public, private, pg_temp
as $$
declare
  v_owner uuid := auth.uid();
  v_limit integer;
  v_rows jsonb;
  v_ids uuid[];
  v_page uuid[];
  v_combined jsonb;
  v_more boolean;
  v_count bigint;
  v_deposits bigint;
  v_withdrawals bigint;
begin
  if not private.has_strong_owner_access(v_owner) then
    return jsonb_build_object('rows', '[]'::jsonb, 'hasMore', false,
      'totals', jsonb_build_object('rows', 0, 'deposits', '0', 'withdrawals', '0', 'net', '0'));
  end if;

  v_limit := least(greatest(coalesce(p_limit, 100), 1), 500);

  if (p_before_date is null) <> (p_before_id is null) then
    raise exception 'incomplete ledger page cursor';
  end if;

  select array_agg(t.id order by t.source_date desc, t.source_time desc nulls last, t.id)
    into v_ids
    from (
      select t.id, t.source_date, t.source_time
        from public.source_transactions t
       where t.owner_id = v_owner
         and t.account_id = p_account_id
         and (
           p_before_date is null
           or t.source_date < p_before_date
           or (t.source_date = p_before_date and (
                (p_before_time is not null and t.source_time is null)
                or (p_before_time is not null and t.source_time is not null and t.source_time < p_before_time)
                or (t.source_time is not distinct from p_before_time and t.id > p_before_id)
              ))
         )
       order by t.source_date desc, t.source_time desc nulls last, t.id
       limit v_limit + 1
    ) t;

  v_ids := coalesce(v_ids, array[]::uuid[]);
  v_more := array_length(v_ids, 1) > v_limit;
  v_page := v_ids[1:v_limit];

  -- **New in 022.** The combined balance is a fact about the whole ledger at a row, so it is
  -- computed across every account and then narrowed to this page — never derived from the page,
  -- which is precisely what the client could not do correctly once the ledger paged.
  select coalesce(jsonb_object_agg(b.transaction_id::text, b.combined_balance_minor::text), '{}')
    into v_combined
    from private.combined_balances(v_owner) b
   where b.transaction_id = any(v_page);

  select coalesce(jsonb_agg(
           private.ledger_transaction_json(v_owner, t)
             || jsonb_build_object('combined_balance_minor', v_combined->>t.id::text)
           order by t.source_date desc, t.source_time desc nulls last, t.id), '[]')
    into v_rows
    from public.source_transactions t
   where t.owner_id = v_owner and t.id = any(v_page);

  select count(*) into v_count
    from public.source_transactions t
   where t.owner_id = v_owner and t.account_id = p_account_id;

  select coalesce(sum(c.amount_minor) filter (where c.kind = 'deposit'), 0),
         coalesce(sum(c.amount_minor) filter (where c.kind = 'withdrawal'), 0)
    into v_deposits, v_withdrawals
    from public.source_components c
    join public.source_transactions t on t.id = c.transaction_id and t.owner_id = c.owner_id
   where c.owner_id = v_owner and t.account_id = p_account_id;

  return jsonb_build_object(
    'rows', v_rows,
    'hasMore', coalesce(v_more, false),
    'totals', jsonb_build_object(
      'rows', v_count,
      'deposits', v_deposits::text,
      'withdrawals', v_withdrawals::text,
      'net', (v_deposits + v_withdrawals)::text
    )
  );
end;
$$;
revoke all on function public.list_account_transactions_page(uuid, integer, date, time, uuid) from public, anon;
grant execute on function public.list_account_transactions_page(uuid, integer, date, time, uuid) to authenticated;

commit;
