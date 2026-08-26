-- Migration 021 — the ledger pages, and reconciliation keeps its rule (PLAN task 45, D-063, D-120).
--
-- ## Why
--
-- `list_account_transactions` bounds nothing: no `limit`, no `offset`, one `jsonb_agg` of every
-- confirmed row for the account. At 1,604 rows that is roughly 785 KB fetched on arrival, on a
-- phone, growing with every import. D-155 trimmed the **width** of a row instead, deliberately,
-- because paging is not "add LIMIT" — three things on that page are derived over the *whole*
-- ledger and a first page silently changes all three.
--
-- ## What this adds, and what it refuses to add
--
-- Two functions, because they answer to different callers and different sizes.
--
-- `list_account_transactions_page` is the ledger's window: keyset-paged, newest first, in the
-- ordering the unpaged function already used. It carries the one thing a page cannot derive for
-- itself: the **whole-account totals**, computed over rows nobody fetched.
--
-- `list_match_candidates` is the reconciliation set: every confirmed row that any slip or card
-- **could** be paired with, whatever page it falls on.
--
-- **The matching rule does not move here, and that is the point of the second function.** It is
-- ~85 tested cases across `tests/slip-reconcile.test.ts` and
-- `tests/notification-card-reconcile.test.ts`; re-implementing it in PL/pgSQL would mean one rule
-- in two languages, one of them untested — the two-engines mistake D-120 already refused. What SQL
-- does here is narrow the input the rule runs over, never decide the answer. The client reconciles
-- over `page ∪ candidates`, which is what keeps a paged status honest: handed only a page, a slip
-- that is genuinely ambiguous ledger-wide would find a single match and pair, rendering `verified`
-- where the truth is `needs-review`. That is a wrong answer about money, not a slow one.
--
-- ## Scope
--
-- **No table, no column, no trigger.** Two new functions, one private helper, two indexes. The
-- backup contract stays at **v7** and no file anyone holds is stranded — `export_backup_snapshot`
-- reads tables, not these functions, and is untouched.
--
-- `list_account_transactions` is **left in place and still granted**. Nothing in the app calls it
-- after this migration; it is kept because `supabase/tests/001_security.sql` pins its grants and
-- dropping a published, granted function is a contract change of its own rather than a side
-- effect of this one. It is superseded, not retired — removing it is its own task.
--
-- ## Exact money
--
-- Every figure below is a sum of `bigint` minor units. **No division anywhere**, which is what
-- makes the totals safe to compute here and is precisely the line task 44 will have to argue
-- about separately. Money leaves as `::text` for the same reason it always has: a JSON number
-- would be the one place in the read path a float could enter.

begin;

-- The paging order, as an index. Matches `order by source_date desc, source_time desc nulls last,
-- id` exactly, including the nulls placement — PostgreSQL puts nulls *first* under `desc` by
-- default, so an index that omitted `nulls last` would describe a different sequence than the one
-- the keyset predicate walks and would simply not be used.
create index if not exists source_transactions_ledger_order_idx
  on public.source_transactions (owner_id, account_id, source_date desc, source_time desc nulls last, id);

-- The candidate scan groups components by transaction. The FK already indexes `transaction_id`
-- on its own; this is the owner-scoped form the aggregate below actually walks.
create index if not exists source_components_owner_transaction_idx
  on public.source_components (owner_id, transaction_id);

-- One row of the ledger, as the view reads it.
--
-- **`fingerprint` and `import_batch_rows` are absent, and that is this migration doing what the
-- route has been doing by hand.** `app/api/v1/accounts/[id]/transactions/route.ts` deleted both
-- keys on the way out because changing the RPC needed a migration; this is that migration, so the
-- database stops assembling what nothing reads. `lib/transactions.ts` is `.strict()` and fails by
-- name if either ever comes back.
--
-- The columns stay exactly as they were in both cases: `unique (owner_id, account_id, fingerprint)`
-- is what makes a re-imported statement idempotent, `confirm_import` still recomputes and rebinds
-- it, and both still reach the backup through `export_backup_snapshot`.
create or replace function private.ledger_transaction_json(p_owner uuid, p_transaction public.source_transactions)
returns jsonb language sql stable
as $$
  select jsonb_build_object(
    'id', p_transaction.id,
    'source_date', p_transaction.source_date,
    'source_time', p_transaction.source_time,
    'effective_date', p_transaction.effective_date,
    'transaction_label', p_transaction.transaction_label,
    'description', p_transaction.description,
    'reference', p_transaction.reference,
    'branch', p_transaction.branch,
    'post_balance_minor', p_transaction.post_balance_minor::text,
    'currency', p_transaction.currency,
    'source_components', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', c.id, 'kind', c.kind, 'amount_minor', c.amount_minor::text, 'currency', c.currency
      ) order by c.position), '[]')
      from public.source_components c
      where c.owner_id = p_owner and c.transaction_id = p_transaction.id
    ),
    'transaction_overlays', (
      select coalesce(jsonb_agg(to_jsonb(o) - 'owner_id' - 'transaction_id'), '[]')
      from public.transaction_overlays o
      where o.owner_id = p_owner and o.transaction_id = p_transaction.id
    )
  );
$$;
revoke all on function private.ledger_transaction_json(uuid, public.source_transactions) from public, anon, authenticated;

-- One page of an account's ledger, plus the two facts a page cannot derive about itself.
--
-- ## Keyset, not offset
--
-- `offset` re-reads and discards everything above the page, so the last page costs the most and a
-- row inserted mid-read shifts the window under the reader. The cursor is the last row the caller
-- already holds — `(source_date, source_time, id)` — and the predicate below is the exact
-- complement of the sort, `nulls last` included.
--
-- ## No carried balance, and the reason is worth recording
--
-- A first draft of this returned the balance carried **into** the page, because PLAN task 45
-- predicted that `combinedBalanceByTransaction` would otherwise seed from the wrong row. **It does
-- not**: that rule seeds from `post_balance − movement` of the oldest row it holds, which is the
-- balance immediately *before* that row whichever row it happens to be — already the balance
-- carried into the window, with no help from here.
--
-- The field was then kept briefly as a cross-check and removed on review: it can disagree with the
-- client's derivation whenever the sort order and the balance chain differ, which happens for
-- ordinary reasons — two untimed rows on one date order by uuid — so it would raise a false alarm
-- about money on real data. What the merged view actually needs is a different fact, and the client
-- derives it from window depth rather than from a balance (`combinedBalanceFloor`).
--
-- ## `totals`
--
-- Whole-account and unpaged, because a total over a page would answer a question nobody asked.
-- Sums of `bigint` minor units; deposits and withdrawals keep their own signs, so `net` is their
-- sum rather than a difference and nothing here divides.
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
  v_more boolean;
  v_count bigint;
  v_deposits bigint;
  v_withdrawals bigint;
begin
  -- Answering an empty page rather than raising keeps this the same shape as
  -- `list_account_transactions`, whose `else '[]' end` the ledger view already relies on: a
  -- signed-out arrival is a 401 from the route, not an exception from the database.
  if not private.has_strong_owner_access(v_owner) then
    return jsonb_build_object('rows', '[]'::jsonb, 'hasMore', false,
      'totals', jsonb_build_object('rows', 0, 'deposits', '0', 'withdrawals', '0', 'net', '0'));
  end if;

  -- A caller does not get to ask for the whole ledger by passing a large limit — that is the
  -- unbounded read this migration exists to end. Clamped rather than rejected, because a limit is
  -- a request for a page size and not an assertion about one.
  v_limit := least(greatest(coalesce(p_limit, 100), 1), 500);

  -- A partial cursor is a caller bug, not a first page: `(date, id)` without the time would walk a
  -- different sequence than the sort and skip rows silently. The first page is all three null.
  if (p_before_date is null) <> (p_before_id is null) then
    raise exception 'incomplete ledger page cursor';
  end if;

  -- One row beyond the page, so `hasMore` is a fact rather than a guess. Held as an ordered array
  -- rather than a temporary table: this function is `stable`, and a temp table would make it write.
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
                -- `nulls last` under `desc`: an untimed row sorts after every timed one on its day.
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

  select coalesce(jsonb_agg(private.ledger_transaction_json(v_owner, t)
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
      -- Both carry their own sign, so this is a sum and never a subtraction.
      'net', (v_deposits + v_withdrawals)::text
    )
  );
end;
$$;
revoke all on function public.list_account_transactions_page(uuid, integer, date, time, uuid) from public, anon;
grant execute on function public.list_account_transactions_page(uuid, integer, date, time, uuid) to authenticated;

-- Every confirmed row that any slip or card could be paired with, whatever page it falls on.
--
-- ## Why this is not the matching rule
--
-- It answers "which rows are worth considering", never "which row matched". The deciding — the
-- date window, the nearest-first tie-break, the competition between two slips claiming one row,
-- the balance check that makes a card fail closed — all of it stays in TypeScript with its ~85
-- tests. This is the narrowing that lets that rule run correctly over a page.
--
-- ## The predicate, and why it carries no date bound
--
-- Bank and exact amount for a slip; **account** and exact amount for a card, which is the check a
-- slip cannot make. Deliberately unbounded in date, because that is what the manual choosers
-- already need: `matchCandidates` and `cardMatchCandidates` filter on bank/account and amount and
-- not on date, since an override exists precisely to reach past the automatic window (D-067). The
-- automatic rules' ±1 day is a subset of this, so one query serves both.
--
-- Amounts are the ones **in force**, correction applied — migration 014's lesson. A candidate set
-- built from the figure first typed would offer rows the corrected slip contradicts and withhold
-- the row it agrees with.
--
-- ## The union with decided rows
--
-- Both rules ignore a stored decision naming a row the ledger does not hold, so the record falls
-- back to being visibly provisional rather than pairing with nothing (`slip-reconcile.ts`,
-- `notification-card-reconcile.ts`). Unpaged that guard can only fire on a genuinely absent row.
-- Paged, it would also fire on a decided row that fell outside this set — and the owner's own
-- decision would be silently discarded rather than obeyed.
--
-- **Every live write path already makes that unreachable, and this was checked rather than
-- assumed.** Migration 013 refuses a slip correction that would falsify a stored match
-- (`slip correction conflicts with stored match`) and migration 017 refuses the card's equivalent
-- in both amount and balance, so an in-force amount cannot drift away from its decided row. Bank
-- is not correctable on a slip and account is not correctable on a card, so neither side of the
-- join can move either.
--
-- It is included anyway, for the one case those guards do not cover: **a decision stored before
-- the guard that protects it existed.** Slip decisions have been writable since migration 012 and
-- the correction guard arrived in 013 — 014 then found that `set_slip_match` had been reading the
-- uncorrected figure all along. Neither migration re-validated the rows already stored. A decision
-- from that window can name a row this predicate does not select, and the cost of covering it is a
-- union against two small tables. A guess about which historical rows are clean is not worth
-- saving that.
--
-- ## What this costs, stated plainly rather than optimistically
--
-- **The returned set is small; the scan is not.** `movements` aggregates every transaction and
-- component the owner holds — no account bound, no date bound, no limit — on every ledger load.
-- The result is bounded by how many slips and cards exist, which is what keeps the *payload* small
-- and is the claim worth making; it does not bound the work. Paging shrank what crosses the wire
-- and left this scan whole, and saying otherwise would be the kind of sentence a later reader
-- believes instead of measuring.
--
-- Making it cheap needs a stored per-transaction movement to index against, which is a column on
-- an append-only table and therefore a backup-contract change — deliberately out of scope here.
-- At this ledger's size (order 10^3 rows) the scan is not worth a migration; the number to watch
-- is `source_components`, and the moment this shows up in a page load it is the thing to fix.
--
-- ## `account_id` travels with the row
--
-- The paged function does not need it — the caller asked for one account and knows which. A
-- candidate is returned without anyone having named its account, and every rule downstream reads
-- `account_id` off the row, so it is part of the record here rather than something the client
-- reconstructs.
create or replace function public.list_match_candidates()
returns jsonb language plpgsql stable security definer set search_path = public, private, pg_temp
as $$
declare
  v_owner uuid := auth.uid();
  v_rows jsonb;
begin
  if not private.has_strong_owner_access(v_owner) then return '[]'::jsonb; end if;

  with movements as (
    select t.id, t.account_id, a.bank_code, sum(c.amount_minor) as movement
      from public.source_transactions t
      join public.accounts a on a.id = t.account_id and a.owner_id = v_owner
      join public.source_components c on c.transaction_id = t.id and c.owner_id = v_owner
     where t.owner_id = v_owner
     group by t.id, t.account_id, a.bank_code
  ),
  slip_amounts as (
    select s.bank_code, coalesce(o.amount_minor, s.amount_minor) as amount_minor
      from public.slips s
      left join public.slip_correction_overlays o on o.slip_id = s.id and o.owner_id = v_owner
     where s.owner_id = v_owner
  ),
  card_amounts as (
    select c.account_id, coalesce(o.amount_minor, c.amount_minor) as amount_minor
      from public.notification_cards c
      left join public.notification_card_correction_overlays o on o.card_id = c.id and o.owner_id = v_owner
     where c.owner_id = v_owner
  ),
  candidates as (
    select m.id from movements m
      join slip_amounts s on s.bank_code = m.bank_code and s.amount_minor = m.movement
    union
    select m.id from movements m
      join card_amounts c on c.account_id = m.account_id and c.amount_minor = m.movement
    union
    select d.transaction_id from public.slip_match_overlays d
     where d.owner_id = v_owner and d.transaction_id is not null
    union
    select d.transaction_id from public.notification_card_decision_overlays d
     where d.owner_id = v_owner and d.transaction_id is not null
  )
  select coalesce(jsonb_agg(
           private.ledger_transaction_json(v_owner, t) || jsonb_build_object('account_id', t.account_id)
           order by t.source_date desc, t.source_time desc nulls last, t.id), '[]')
    into v_rows
    from public.source_transactions t
    join candidates x on x.id = t.id
   where t.owner_id = v_owner;

  return v_rows;
end;
$$;
revoke all on function public.list_match_candidates() from public, anon;
grant execute on function public.list_match_candidates() to authenticated;

commit;
