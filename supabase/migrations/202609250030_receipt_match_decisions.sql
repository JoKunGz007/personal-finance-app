-- Migration 030 — matching a receipt to the ledger row that paid for it (PLAN task 56, D-212).
--
-- ## The rule, and where each half lives
--
-- The automatic rule is a **proposal computed at read time**, exactly as slip matching is
-- (`lib/slip-reconcile.ts`, D-063): `public.receipt_ledger_candidates()` below returns every
-- ledger row that could be a receipt's payment, and `lib/receipt-match.ts` decides which of them
-- is one. What is stored is only the owner's say — `matched` or `unmatched` — in the same
-- overlay-plus-revisions pair migration 012 introduced for slips, because an owner decision is a
-- fact and a proposal is not.
--
-- The automatic half (`docs/RECEIPT_CONTRACT.md` § Matching to the ledger):
--
--   * only rows whose bank description names `TRUE MONEY`;
--   * the row's movement is the receipt's net, negated, **to the minor unit**;
--   * the row is at or after the receipt time and within the lag window;
--   * exactly one such row, claimed by no other receipt — two is a refusal (D-063).
--
-- **The lag window is two hours, measured, not picked** (D-212, 2026-09-23): 13 real receipts
-- against the hosted ledger. The ten paid by the 7-Eleven app wallet landed 0–2 minutes after
-- the receipt; the one TrueMoney-wallet payment with a row landed at 47; no candidate fell
-- before its receipt; the nearest other row of an equal amount was weeks away. The window lives
-- in `lib/receipt-match.ts`, not here, so this function returns a wider net (three days either
-- side, any description) and the manual link can offer from the same read.
--
-- ## A manual link is held to the amount, and to nothing else
--
-- The case that proves the rule (`docs/RECEIPT_CONTRACT.md`): a purchase paid from someone
-- else's wallet and reimbursed by PromptPay a minute later. The automatic rule must decline it —
-- it cannot tell that reimbursement from an unrelated payment of the same amount — so the owner
-- links it by hand, and the link must accept a row that does not name TRUE MONEY. What it keeps
-- is the money: **the row's movement must equal the receipt's net, negated**, re-checked here
-- because a client is not a place to enforce an invariant about money. The slip rule's reasoning
-- (migration 012, D-072) carries over unchanged: an override resolves ambiguity and rejects a
-- wrong pairing; it is not a way to declare two different sums one payment.
--
-- A receipt is never money (migration 027), so none of this moves a balance or a total. A match
-- attaches itemization to a row; that is all it does.
--
-- ## The claim is unique in the database
--
-- One ledger row can be claimed by at most one receipt, by a partial unique index, for the
-- reason migration 012 gives for slips: a stored decision is a fact, and two receipts both
-- itemizing one payment would say it bought both lists.
--
-- ## Backup v8 -> v9
--
-- Two new owner tables, appended after `receipt_discounts`, parent (`receipts`) already before
-- them. Indices 0..26 keep meaning what they meant in v8. v2 through v8 stay restorable.

begin;

-- The owner-bound foreign key every decision table uses (`(slip_id, owner_id)` in migration 012)
-- needs a matching key on the parent. Migration 027 gave `receipts` none, because its children
-- reference `id` alone; this adds the key, not a column, so D-097 is untouched.
alter table public.receipts add constraint receipts_id_owner_id_key unique (id, owner_id);

create table public.receipt_match_overlays (
  receipt_id uuid primary key,
  owner_id uuid not null references public.ledger_owners(owner_id),
  decision text not null check (decision in ('matched','unmatched')),
  transaction_id uuid,
  revision integer not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now(),
  foreign key (receipt_id, owner_id) references public.receipts(id, owner_id),
  foreign key (transaction_id, owner_id) references public.source_transactions(id, owner_id),
  check ((decision = 'matched' and transaction_id is not null)
      or (decision = 'unmatched' and transaction_id is null)),
  unique (receipt_id, owner_id)
);

create unique index receipt_match_overlays_one_claim_per_transaction
  on public.receipt_match_overlays(transaction_id, owner_id)
  where transaction_id is not null;

create table public.receipt_match_revisions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.ledger_owners(owner_id),
  receipt_id uuid not null,
  revision integer not null check (revision > 0),
  snapshot jsonb not null,
  changed_at timestamptz not null default now(),
  changed_by uuid not null references auth.users(id),
  foreign key (receipt_id, owner_id) references public.receipts(id, owner_id),
  unique (receipt_id, revision),
  unique (id, owner_id)
);

create index receipt_match_revisions_owner_receipt on public.receipt_match_revisions(owner_id, receipt_id);

create trigger receipt_match_revisions_immutable before update or delete on public.receipt_match_revisions
  for each row execute function private.reject_change();

alter table public.receipt_match_overlays enable row level security;
alter table public.receipt_match_overlays force row level security;
alter table public.receipt_match_revisions enable row level security;
alter table public.receipt_match_revisions force row level security;

create policy strong_owner_select on public.receipt_match_overlays for select to authenticated
  using (private.has_strong_owner_access(owner_id));
create policy strong_owner_select on public.receipt_match_revisions for select to authenticated
  using (private.has_strong_owner_access(owner_id));

grant select on public.receipt_match_overlays to authenticated;
grant select on public.receipt_match_revisions to authenticated;
revoke insert, update, delete on public.receipt_match_overlays from authenticated, anon;
revoke insert, update, delete on public.receipt_match_revisions from authenticated, anon;

/*
 * Every ledger row that could be a receipt's payment: a movement equal to the receipt's net,
 * negated, within three days either side. Security invoker, so row-level security scopes it to
 * the strong owner exactly as a direct select would; it reads nothing a select could not.
 *
 * `lag_minutes` is null when either side has no time (a receipt read only from a full invoice,
 * which prints none) — the automatic rule then cannot establish "at or after" and declines.
 */
create or replace function public.receipt_ledger_candidates()
returns table (
  receipt_id uuid, transaction_id uuid, account_id uuid, source_date date, source_time time,
  transaction_label text, description text, lag_minutes integer, names_true_money boolean
) language sql stable security invoker set search_path = public, pg_temp
as $$
  select r.id, t.id, t.account_id, t.source_date, t.source_time, t.transaction_label, t.description,
    case when r.purchased_at_time is null or t.source_time is null then null
      else floor(extract(epoch from (t.source_date + t.source_time) - (r.purchased_on + r.purchased_at_time)) / 60)::integer end,
    (t.description ilike '%TRUE MONEY%' or t.transaction_label ilike '%TRUE MONEY%')
  from public.receipts r
  join public.source_transactions t
    on t.owner_id = r.owner_id and t.source_date between r.purchased_on - 3 and r.purchased_on + 3
  where (select sum(c.amount_minor) from public.source_components c
          where c.transaction_id = t.id and c.owner_id = t.owner_id) = -r.net_minor
$$;
revoke all on function public.receipt_ledger_candidates() from public, anon;
grant execute on function public.receipt_ledger_candidates() to authenticated;

/*
 * The single write path, shaped exactly like `set_slip_match` (migrations 012 and 014):
 * optimistic concurrency on `p_expected_revision` (0 = "no decision exists yet"), the ledger
 * mutation lock, a revision row, an audit event and a `mutation_sequences` bump — the last
 * because the backup's consistency check reads that sequence.
 */
create or replace function public.set_receipt_match(
  p_receipt_id uuid, p_expected_revision integer, p_decision text, p_transaction_id uuid
) returns jsonb language plpgsql security definer set search_path = public, private, pg_temp
as $$
declare
  v_owner uuid := auth.uid();
  v_receipt public.receipts%rowtype;
  v_revision integer;
  v_snapshot jsonb;
  v_found boolean;
  v_movement bigint;
begin
  if not private.has_strong_owner_access(v_owner) then raise exception 'strong owner access required'; end if;
  if p_decision is null or p_decision not in ('matched','unmatched') then raise exception 'invalid receipt match decision'; end if;
  if (p_decision = 'matched') <> (p_transaction_id is not null) then
    raise exception 'invalid receipt match decision';
  end if;

  select * into v_receipt from public.receipts where id = p_receipt_id and owner_id = v_owner;
  if v_receipt.id is null then raise exception 'receipt not owned'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_owner::text || ':ledger-mutation', 0));

  if p_decision = 'matched' then
    select true, (select sum(c.amount_minor) from public.source_components c
                   where c.transaction_id = t.id and c.owner_id = v_owner)
      into v_found, v_movement
      from public.source_transactions t
     where t.id = p_transaction_id and t.owner_id = v_owner;
    if v_found is null then raise exception 'transaction not owned'; end if;
    if v_movement is distinct from -v_receipt.net_minor then raise exception 'receipt match amount mismatch'; end if;
  end if;

  select revision into v_revision from public.receipt_match_overlays
    where receipt_id = p_receipt_id and owner_id = v_owner for update;
  v_revision := coalesce(v_revision, 0);
  if v_revision <> p_expected_revision then raise exception 'receipt match revision conflict'; end if;
  v_revision := v_revision + 1;

  begin
    insert into public.receipt_match_overlays(receipt_id, owner_id, decision, transaction_id, revision)
      values (p_receipt_id, v_owner, p_decision, p_transaction_id, v_revision)
    on conflict (receipt_id) do update set decision = excluded.decision,
      transaction_id = excluded.transaction_id, revision = excluded.revision, updated_at = now();
  exception when unique_violation then
    raise exception 'ledger row already claimed by another receipt';
  end;

  select to_jsonb(o) into v_snapshot from public.receipt_match_overlays o
    where o.receipt_id = p_receipt_id and o.owner_id = v_owner;
  insert into public.receipt_match_revisions(owner_id, receipt_id, revision, snapshot, changed_by)
    values (v_owner, p_receipt_id, v_revision, v_snapshot, v_owner);
  insert into public.audit_events(owner_id, actor_id, event_type, entity_type, entity_id, detail)
    values (v_owner, v_owner, 'receipt.match.' || p_decision, 'receipt', p_receipt_id,
      jsonb_build_object('revision', v_revision, 'decision', p_decision));
  update public.mutation_sequences set sequence = sequence + 1, updated_at = now() where owner_id = v_owner;

  return v_snapshot;
end;
$$;
revoke all on function public.set_receipt_match(uuid,integer,text,uuid) from public, anon;
grant execute on function public.set_receipt_match(uuid,integer,text,uuid) to authenticated;

alter table public.restore_runs
  drop constraint if exists restore_runs_schema_version_check,
  add constraint restore_runs_schema_version_check check (schema_version in (1,2,3,4,5,6,7,8,9));

alter table public.restore_chunks
  drop constraint if exists restore_chunks_v2_binding,
  add constraint restore_chunks_v2_binding check (
    chunk_kind is null or (
      chunk_kind in ('accounts','categories','import_artifacts','import_batches','source_transactions',
        'source_components','import_batch_rows','transaction_overlays','overlay_revisions','audit_events',
        'mutation_sequences','slips','slip_match_overlays','slip_match_revisions',
        'cash_entries','cash_entry_overlays','cash_entry_revisions',
        'slip_correction_overlays','slip_correction_revisions','notification_cards',
        'notification_card_correction_overlays','notification_card_correction_revisions',
        'notification_card_decision_overlays','notification_card_decision_revisions',
        'receipts','receipt_items','receipt_discounts',
        'receipt_match_overlays','receipt_match_revisions')
      and row_count >= 0 and chunk_digest ~ '^[a-f0-9]{64}$'
    )
  );

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
    'cash_entry_overlays',(select coalesce(jsonb_agg(case when amount_minor is null then to_jsonb(x)
      else to_jsonb(x)-'amount_minor'||jsonb_build_object('amount_minor',amount_minor::text) end order by cash_entry_id),'[]') from public.cash_entry_overlays x where owner_id=v_owner),
    'cash_entry_revisions',(select coalesce(jsonb_agg(to_jsonb(x) order by cash_entry_id,revision),'[]') from public.cash_entry_revisions x where owner_id=v_owner),
    'slip_correction_overlays',(select coalesce(jsonb_agg(case when amount_minor is null then to_jsonb(x)
      else to_jsonb(x)-'amount_minor'||jsonb_build_object('amount_minor',amount_minor::text) end order by slip_id),'[]') from public.slip_correction_overlays x where owner_id=v_owner),
    'slip_correction_revisions',(select coalesce(jsonb_agg(to_jsonb(x) order by slip_id,revision),'[]') from public.slip_correction_revisions x where owner_id=v_owner),
    'notification_cards',(select coalesce(jsonb_agg(to_jsonb(x)-'amount_minor'-'balance_minor'
      ||jsonb_build_object('amount_minor',amount_minor::text,'balance_minor',balance_minor::text) order by id),'[]')
      from public.notification_cards x where owner_id=v_owner),
    'notification_card_correction_overlays',(select coalesce(jsonb_agg(
      to_jsonb(x)-'amount_minor'-'balance_minor'
        ||case when amount_minor is null then jsonb_build_object('amount_minor',null) else jsonb_build_object('amount_minor',amount_minor::text) end
        ||case when balance_minor is null then jsonb_build_object('balance_minor',null) else jsonb_build_object('balance_minor',balance_minor::text) end
      order by card_id),'[]') from public.notification_card_correction_overlays x where owner_id=v_owner),
    'notification_card_correction_revisions',(select coalesce(jsonb_agg(to_jsonb(x) order by card_id,revision),'[]') from public.notification_card_correction_revisions x where owner_id=v_owner),
    'notification_card_decision_overlays',(select coalesce(jsonb_agg(to_jsonb(x) order by card_id),'[]') from public.notification_card_decision_overlays x where owner_id=v_owner),
    'notification_card_decision_revisions',(select coalesce(jsonb_agg(to_jsonb(x) order by card_id,revision),'[]') from public.notification_card_decision_revisions x where owner_id=v_owner),
    -- Five nullable money columns plus the one not-null (`net_minor`). Each is stringified only
    -- when present, the same shape every nullable money column above uses, applied five times
    -- because a receipt carries that many.
    'receipts',(select coalesce(jsonb_agg(
      to_jsonb(x)-'subtotal_minor'-'net_minor'-'vat_pre_minor'-'vat_minor'-'vat_total_minor'
        ||jsonb_build_object('net_minor',net_minor::text)
        ||case when subtotal_minor is null then jsonb_build_object('subtotal_minor',null) else jsonb_build_object('subtotal_minor',subtotal_minor::text) end
        ||case when vat_pre_minor is null then jsonb_build_object('vat_pre_minor',null) else jsonb_build_object('vat_pre_minor',vat_pre_minor::text) end
        ||case when vat_minor is null then jsonb_build_object('vat_minor',null) else jsonb_build_object('vat_minor',vat_minor::text) end
        ||case when vat_total_minor is null then jsonb_build_object('vat_total_minor',null) else jsonb_build_object('vat_total_minor',vat_total_minor::text) end
      order by id),'[]') from public.receipts x where owner_id=v_owner),
    'receipt_items',(select coalesce(jsonb_agg(
      to_jsonb(x)-'unit_price_minor'-'amount_minor'
        ||jsonb_build_object('amount_minor',amount_minor::text)
        ||case when unit_price_minor is null then jsonb_build_object('unit_price_minor',null) else jsonb_build_object('unit_price_minor',unit_price_minor::text) end
      order by receipt_id,position),'[]') from public.receipt_items x where owner_id=v_owner),
    'receipt_discounts',(select coalesce(jsonb_agg(to_jsonb(x)-'amount_minor'||jsonb_build_object('amount_minor',amount_minor::text) order by receipt_id,position),'[]') from public.receipt_discounts x where owner_id=v_owner),
    'receipt_match_overlays',(select coalesce(jsonb_agg(to_jsonb(x) order by receipt_id),'[]') from public.receipt_match_overlays x where owner_id=v_owner),
    'receipt_match_revisions',(select coalesce(jsonb_agg(to_jsonb(x) order by receipt_id,revision),'[]') from public.receipt_match_revisions x where owner_id=v_owner)
  );
  select jsonb_object_agg(key,jsonb_array_length(value)) into v_counts from jsonb_each(v_data);
  return jsonb_build_object('schemaVersion',9,'exportedAt',to_char(v_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'snapshotSequence',v_sequence::text,'tableCounts',v_counts,'data',v_data);
end;
$$;
revoke all on function public.export_backup_snapshot() from public,anon;
grant execute on function public.export_backup_snapshot() to authenticated;

-- The kind list is built up by version, so a tenth version adds one line and strands nothing.
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
 if v_schema_text not in ('2','3','4','5','6','7','8','9') or v_digest!~'^[a-f0-9]{64}$' then raise exception 'invalid restore contract'; end if;
 v_schema:=v_schema_text::integer;
 v_expected_kinds:=v_base_kinds;
 if v_schema>=3 then v_expected_kinds:=v_expected_kinds||array['slips']; end if;
 if v_schema>=4 then v_expected_kinds:=v_expected_kinds||array['slip_match_overlays','slip_match_revisions']; end if;
 if v_schema>=5 then v_expected_kinds:=v_expected_kinds||array['cash_entries','cash_entry_overlays','cash_entry_revisions','slip_correction_overlays','slip_correction_revisions']; end if;
 if v_schema>=6 then v_expected_kinds:=v_expected_kinds||array['notification_cards']; end if;
 if v_schema>=7 then v_expected_kinds:=v_expected_kinds||array['notification_card_correction_overlays','notification_card_correction_revisions','notification_card_decision_overlays','notification_card_decision_revisions']; end if;
 if v_schema>=8 then v_expected_kinds:=v_expected_kinds||array['receipts','receipt_items','receipt_discounts']; end if;
 if v_schema>=9 then v_expected_kinds:=v_expected_kinds||array['receipt_match_overlays','receipt_match_revisions']; end if;
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
    or exists(select 1 from public.cash_entries where owner_id=v_owner)
    or exists(select 1 from public.cash_entry_overlays where owner_id=v_owner)
    or exists(select 1 from public.cash_entry_revisions where owner_id=v_owner)
    or exists(select 1 from public.slip_correction_overlays where owner_id=v_owner)
    or exists(select 1 from public.slip_correction_revisions where owner_id=v_owner)
    or exists(select 1 from public.notification_cards where owner_id=v_owner)
    or exists(select 1 from public.notification_card_correction_overlays where owner_id=v_owner)
    or exists(select 1 from public.notification_card_correction_revisions where owner_id=v_owner)
    or exists(select 1 from public.notification_card_decision_overlays where owner_id=v_owner)
    or exists(select 1 from public.notification_card_decision_revisions where owner_id=v_owner)
    or exists(select 1 from public.receipts where owner_id=v_owner)
    or exists(select 1 from public.receipt_items where owner_id=v_owner)
    or exists(select 1 from public.receipt_discounts where owner_id=v_owner)
    or exists(select 1 from public.receipt_match_overlays where owner_id=v_owner)
    or exists(select 1 from public.receipt_match_revisions where owner_id=v_owner)
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
    when 'notification_cards' then
     if jsonb_typeof(v_row->'amount_minor') is distinct from 'string'
       or not private.is_canonical_int64_text(v_row->>'amount_minor')
       or jsonb_typeof(v_row->'balance_minor') is distinct from 'string'
       or not private.is_canonical_int64_text(v_row->>'balance_minor')
       then raise exception 'restore notification card money must be canonical int64 text'; end if;
     insert into public.notification_cards(id,owner_id,account_id,channel,printed_account_digits,kind,amount_minor,currency,
       occurred_on,occurred_at_time,balance_minor,counterparty,category_id,note,fingerprint_version,fingerprint,captured_at)
      values((v_row->>'id')::uuid,v_owner,(v_row->>'account_id')::uuid,v_row->>'channel',v_row->>'printed_account_digits',v_row->>'kind',
        (v_row->>'amount_minor')::bigint,v_row->>'currency',(v_row->>'occurred_on')::date,(v_row->>'occurred_at_time')::time,
        (v_row->>'balance_minor')::bigint,v_row->>'counterparty',nullif(v_row->>'category_id','')::uuid,v_row->>'note',
        v_row->>'fingerprint_version',v_row->>'fingerprint',(v_row->>'captured_at')::timestamptz);
    when 'notification_card_correction_overlays' then
     if v_row->'amount_minor' is not null and jsonb_typeof(v_row->'amount_minor') <> 'null' then
      if jsonb_typeof(v_row->'amount_minor') is distinct from 'string'
        or not private.is_canonical_int64_text(v_row->>'amount_minor')
        then raise exception 'restore notification card correction money must be canonical int64 text'; end if;
     end if;
     if v_row->'balance_minor' is not null and jsonb_typeof(v_row->'balance_minor') <> 'null' then
      if jsonb_typeof(v_row->'balance_minor') is distinct from 'string'
        or not private.is_canonical_int64_text(v_row->>'balance_minor')
        then raise exception 'restore notification card correction money must be canonical int64 text'; end if;
     end if;
     insert into public.notification_card_correction_overlays(card_id,owner_id,kind,amount_minor,balance_minor,occurred_on,occurred_at_time,counterparty,category_id,note,revision,updated_at)
      values((v_row->>'card_id')::uuid,v_owner,v_row->>'kind',nullif(v_row->>'amount_minor','')::bigint,nullif(v_row->>'balance_minor','')::bigint,
        nullif(v_row->>'occurred_on','')::date,nullif(v_row->>'occurred_at_time','')::time,v_row->>'counterparty',
        nullif(v_row->>'category_id','')::uuid,v_row->>'note',(v_row->>'revision')::integer,(v_row->>'updated_at')::timestamptz);
   when 'notification_card_correction_revisions' then insert into public.notification_card_correction_revisions(id,owner_id,card_id,revision,snapshot,changed_at,changed_by)
    values((v_row->>'id')::uuid,v_owner,(v_row->>'card_id')::uuid,(v_row->>'revision')::integer,(v_row->'snapshot')||jsonb_build_object('owner_id',v_owner),(v_row->>'changed_at')::timestamptz,v_owner);
   when 'notification_card_decision_overlays' then insert into public.notification_card_decision_overlays(card_id,owner_id,decision,transaction_id,accepted_balance_mismatch,revision,updated_at)
    values((v_row->>'card_id')::uuid,v_owner,v_row->>'decision',nullif(v_row->>'transaction_id','')::uuid,(v_row->>'accepted_balance_mismatch')::boolean,(v_row->>'revision')::integer,(v_row->>'updated_at')::timestamptz);
   when 'notification_card_decision_revisions' then insert into public.notification_card_decision_revisions(id,owner_id,card_id,revision,snapshot,changed_at,changed_by)
    values((v_row->>'id')::uuid,v_owner,(v_row->>'card_id')::uuid,(v_row->>'revision')::integer,(v_row->'snapshot')||jsonb_build_object('owner_id',v_owner),(v_row->>'changed_at')::timestamptz,v_owner);
    when 'receipts' then
     -- `net_minor` is not nullable; the other four are, and each is checked only when present —
     -- the same shape the cash and notification-card correction overlays use for their own
     -- nullable money columns above.
     if jsonb_typeof(v_row->'net_minor') is distinct from 'string'
       or not private.is_canonical_int64_text(v_row->>'net_minor')
       then raise exception 'restore receipt money must be canonical int64 text'; end if;
     if v_row->'subtotal_minor' is not null and jsonb_typeof(v_row->'subtotal_minor') <> 'null' then
      if jsonb_typeof(v_row->'subtotal_minor') is distinct from 'string'
        or not private.is_canonical_int64_text(v_row->>'subtotal_minor')
        then raise exception 'restore receipt money must be canonical int64 text'; end if;
     end if;
     if v_row->'vat_pre_minor' is not null and jsonb_typeof(v_row->'vat_pre_minor') <> 'null' then
      if jsonb_typeof(v_row->'vat_pre_minor') is distinct from 'string'
        or not private.is_canonical_int64_text(v_row->>'vat_pre_minor')
        then raise exception 'restore receipt money must be canonical int64 text'; end if;
     end if;
     if v_row->'vat_minor' is not null and jsonb_typeof(v_row->'vat_minor') <> 'null' then
      if jsonb_typeof(v_row->'vat_minor') is distinct from 'string'
        or not private.is_canonical_int64_text(v_row->>'vat_minor')
        then raise exception 'restore receipt money must be canonical int64 text'; end if;
     end if;
     if v_row->'vat_total_minor' is not null and jsonb_typeof(v_row->'vat_total_minor') <> 'null' then
      if jsonb_typeof(v_row->'vat_total_minor') is distinct from 'string'
        or not private.is_canonical_int64_text(v_row->>'vat_total_minor')
        then raise exception 'restore receipt money must be canonical int64 text'; end if;
     end if;
     insert into public.receipts(id,owner_id,merchant,store_code,branch_name,receipt_number,purchased_on,
       purchased_at_time,payment_method,subtotal_minor,net_minor,unit_count,vat_pre_minor,vat_minor,
       vat_total_minor,vat_code,supersedes_receipt_number,completeness,failed_checks,inapplicable_checks,
       sources,items_source,items_complete,created_at,updated_at)
      values((v_row->>'id')::uuid,v_owner,v_row->>'merchant',v_row->>'store_code',v_row->>'branch_name',v_row->>'receipt_number',
        (v_row->>'purchased_on')::date,nullif(v_row->>'purchased_at_time','')::time,v_row->>'payment_method',
        nullif(v_row->>'subtotal_minor','')::bigint,(v_row->>'net_minor')::bigint,nullif(v_row->>'unit_count','')::integer,
        nullif(v_row->>'vat_pre_minor','')::bigint,nullif(v_row->>'vat_minor','')::bigint,nullif(v_row->>'vat_total_minor','')::bigint,
        v_row->>'vat_code',v_row->>'supersedes_receipt_number',v_row->>'completeness',
        (select coalesce(array_agg(value),'{}') from jsonb_array_elements_text(coalesce(v_row->'failed_checks','[]'::jsonb))),
        (select coalesce(array_agg(value),'{}') from jsonb_array_elements_text(coalesce(v_row->'inapplicable_checks','[]'::jsonb))),
        (select coalesce(array_agg(value),'{}') from jsonb_array_elements_text(coalesce(v_row->'sources','[]'::jsonb))),
        v_row->>'items_source',(v_row->>'items_complete')::boolean,(v_row->>'created_at')::timestamptz,(v_row->>'updated_at')::timestamptz);
    when 'receipt_items' then
     if jsonb_typeof(v_row->'amount_minor') is distinct from 'string'
       or not private.is_canonical_int64_text(v_row->>'amount_minor')
       then raise exception 'restore receipt item money must be canonical int64 text'; end if;
     if v_row->'unit_price_minor' is not null and jsonb_typeof(v_row->'unit_price_minor') <> 'null' then
      if jsonb_typeof(v_row->'unit_price_minor') is distinct from 'string'
        or not private.is_canonical_int64_text(v_row->>'unit_price_minor')
        then raise exception 'restore receipt item money must be canonical int64 text'; end if;
     end if;
     insert into public.receipt_items(id,owner_id,receipt_id,line_no,position,quantity,name,display_name,
       unit_price_minor,amount_minor,vat_exempt,is_promotion)
      values((v_row->>'id')::uuid,v_owner,(v_row->>'receipt_id')::uuid,(v_row->>'line_no')::integer,(v_row->>'position')::integer,
        (v_row->>'quantity')::integer,v_row->>'name',v_row->>'display_name',nullif(v_row->>'unit_price_minor','')::bigint,
        (v_row->>'amount_minor')::bigint,(v_row->>'vat_exempt')::boolean,(v_row->>'is_promotion')::boolean);
    when 'receipt_discounts' then
     if jsonb_typeof(v_row->'amount_minor') is distinct from 'string'
       or not private.is_canonical_int64_text(v_row->>'amount_minor')
       then raise exception 'restore receipt discount money must be canonical int64 text'; end if;
     insert into public.receipt_discounts(id,owner_id,receipt_id,position,name,amount_minor)
      values((v_row->>'id')::uuid,v_owner,(v_row->>'receipt_id')::uuid,(v_row->>'position')::integer,v_row->>'name',(v_row->>'amount_minor')::bigint);
   when 'receipt_match_overlays' then insert into public.receipt_match_overlays(receipt_id,owner_id,decision,transaction_id,revision,updated_at)
    values((v_row->>'receipt_id')::uuid,v_owner,v_row->>'decision',nullif(v_row->>'transaction_id','')::uuid,(v_row->>'revision')::integer,(v_row->>'updated_at')::timestamptz);
   -- The snapshot carries an owner id; rebound like every other revisions table's (D-044).
   when 'receipt_match_revisions' then insert into public.receipt_match_revisions(id,owner_id,receipt_id,revision,snapshot,changed_at,changed_by)
    values((v_row->>'id')::uuid,v_owner,(v_row->>'receipt_id')::uuid,(v_row->>'revision')::integer,(v_row->'snapshot')||jsonb_build_object('owner_id',v_owner),(v_row->>'changed_at')::timestamptz,v_owner);
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
