-- Migration 027 — receipt storage tables and their write path (PLAN task 56,
-- `docs/RECEIPT_CONTRACT.md`, D-decision recorded 2026-09-22).
--
-- **This migration does not touch the backup contract.** `receipts`, `receipt_items` and
-- `receipt_discounts` are not yet carried by `export_backup_snapshot` / `restore_backup`, and
-- `lib/backup-contract.ts` is untouched. That is a deliberate second pass, not an oversight —
-- widening the backup contract, its restore-time schema-version branch and its manifest-kind
-- list is its own decision surface and is out of scope here. A backup completeness check or
-- `check-docs` failing because these three tables now exist and the backup does not yet cover
-- them is the known, expected consequence of splitting the work this way.
--
-- ## A receipt is never money (see `docs/RECEIPT_CONTRACT.md` "The finding that decides the
-- design")
--
-- Every payment route a receipt could describe already lands in the ledger on its own (a
-- TrueMoney pull, a wallet top-up, a reimbursement row), so a receipt that touched
-- `source_transactions`, an overlay or any reporting total would double-count. This migration
-- therefore carries **no transaction foreign key anywhere** — not even a nullable one "for
-- later" — and no matching table, because the match lag window is measured on two points, which
-- is not a distribution (`docs/RECEIPT_CONTRACT.md` "The lag window is not yet measured"). A
-- receipt row costs nothing if it is never matched: the ledger totals are already correct
-- without it.
--
-- ## Merchant scope
--
-- 7-Eleven only, by the owner's decision (`docs/RECEIPT_CONTRACT.md` "Scope") — a CHECK
-- constraint rather than a merchants table, because a second merchant is a second contract file
-- and a second design, not a generalisation of this one (D-031's standing reason).
--
-- ## Identity: the receipt number is stored unpadded
--
-- The in-app screen prints the receipt number unpadded; both PDF forms' `R#` line prints it
-- zero-padded (`lib/receipt-text.ts`'s own comment on `R_LINE`). The same purchase read from two
-- sources must resolve to one row, so leading zeros are stripped before the unique key is ever
-- compared — storing the padded form would silently create two rows for one purchase the moment
-- a screenshot and a PDF of the same receipt were both captured.
--
-- ## The write path: three different rules, not one merge
--
-- `public.capture_receipt(p_request jsonb)` is the only write path, upserting on
-- `(owner_id, merchant, store_code, receipt_number)`. It follows `capture_slip`'s transaction
-- discipline exactly — the ledger-mutation advisory lock, an `audit_events` row, and a
-- `mutation_sequences` bump — even though a receipt is not ledger money, because the backup's
-- consistency check reads that one sequence for every owner table it covers; a table that skips
-- the bump could be captured mid-write and the backup would never notice.
--
-- **Rule 1 — scalar fields merge per field, `coalesce(incoming, stored)`.** The three input
-- forms are complementary, not ranked: a full invoice carries the best item names but no payment
-- method, no time and no unit count, so a plain replace on a later, "better" source would destroy
-- the only record of the fields it doesn't carry. `sources` accumulates instead of being
-- overwritten, for the same reason.
--
-- **Rule 2 — money fields that disagree are a refusal, not a merge.** A stored non-null
-- `net_minor`, `subtotal_minor` or `vat_*_minor` that differs from a non-null incoming value
-- raises rather than picking a winner. Two independent readings of one purchase's money must
-- agree; if they don't, one of them misread the document, and silently keeping either reading
-- would launder that disagreement into the stored row. Same fail-closed spirit as the reader's
-- own `QUANTITY_MISMATCH` / `DISCOUNT_TOTAL_MISMATCH` cross-checks.
--
-- **Rule 3 — items and discounts replace together, as one unit, only by a source at least as
-- good as the one that wrote them.** They come from a single parse of a single document, so they
-- move together rather than merging row by row. Rank is `(completeness = 'complete') * 2 +
-- (source = 'full') * 1`: full+complete scores 3, condensed-or-screenshot+complete scores 2,
-- full+partial scores 1, otherwise 0. A lower-ranked incoming source leaves the stored items and
-- discounts untouched (but Rule 1 and Rule 2 still apply, and `sources` still accumulates); an
-- equal-or-higher one deletes and re-inserts both children, carrying `display_name` across the
-- replace matched on `position` — it is the owner's own data, never a parse's, so it survives the
-- rows it was attached to.
--
-- Why items replace wholesale while the parent merges: a receipt is itemization, not money, so
-- item rows are not themselves an append-only record of anything — the durable trail is the
-- `audit_events` row and the accumulating `sources`. Replacing the children as a unit also avoids
-- orphaned rows a shorter later item list would otherwise leave behind, which a per-row merge
-- would not clean up. The asymmetry (parent merges, children replace) looks arbitrary without
-- this reasoning, which is why it is written down here rather than only in code.

begin;

-- -----------------------------------------------------------------------------------------------
-- Tables
-- -----------------------------------------------------------------------------------------------

create table public.receipts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.ledger_owners(owner_id),
  merchant text not null check (merchant = '7-eleven'),
  store_code text not null,
  branch_name text not null,
  -- Stored with leading zeros stripped (see the migration comment "Identity: the receipt number
  -- is stored unpadded"). The in-app screen prints it unpadded; both PDF forms' `R#` line pads
  -- it. Without stripping, the same purchase captured from a screenshot and a PDF becomes two
  -- rows instead of one.
  receipt_number text not null,
  purchased_on date not null,
  purchased_at_time time null,
  payment_method text null,
  subtotal_minor bigint null,
  net_minor bigint not null,
  unit_count integer null,
  vat_pre_minor bigint null,
  vat_minor bigint null,
  vat_total_minor bigint null,
  vat_code text null,
  supersedes_receipt_number text null,
  completeness text not null check (completeness in ('complete', 'partial')),
  failed_checks text[] not null default '{}',
  inapplicable_checks text[] not null default '{}',
  -- The forms that have contributed to this row, accumulating rather than being overwritten.
  sources text[] not null,
  -- Which source wrote the *current* item rows, and whether that source's own checks passed.
  -- Exists so Rule 3's replace-or-keep decision is decidable in SQL from the stored row alone,
  -- rather than requiring a caller to remember what it sent last time.
  items_source text not null check (items_source in ('screenshot', 'condensed', 'full')),
  items_complete boolean not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- The idempotency and dedup key. Identity is the store plus the (unpadded) receipt number,
  -- per `docs/RECEIPT_CONTRACT.md` "Identity and deduplication" — a full invoice resolves to the
  -- condensed number it names, via `supersedes_receipt_number`, rather than via this key.
  unique (owner_id, merchant, store_code, receipt_number)
);

create index receipts_owner_purchased_on on public.receipts(owner_id, purchased_on);

alter table public.receipts enable row level security;
alter table public.receipts force row level security;
create policy strong_owner_select on public.receipts for select to authenticated
  using (private.has_strong_owner_access(owner_id));

grant select on public.receipts to authenticated;
-- The only write path is `capture_receipt`, matching `slips`' migration-011 note: a future
-- blanket grant must not quietly open a way around it.
revoke insert, update, delete on public.receipts from authenticated, anon;

create table public.receipt_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.ledger_owners(owner_id),
  receipt_id uuid not null references public.receipts(id) on delete cascade,
  line_no integer not null,
  position integer not null,
  quantity integer not null,
  -- The printed, possibly-truncated name — the identity key `display_name` is matched against
  -- on a replace.
  name text not null,
  -- Owner-supplied. A parse must never write or clear this column; `capture_receipt` never
  -- assigns it from incoming data, only carries the stored value forward across a Rule 3 replace.
  display_name text null,
  unit_price_minor bigint null,
  amount_minor bigint not null,
  vat_exempt boolean not null,
  is_promotion boolean not null,
  unique (receipt_id, position)
);

alter table public.receipt_items enable row level security;
alter table public.receipt_items force row level security;
create policy strong_owner_select on public.receipt_items for select to authenticated
  using (private.has_strong_owner_access(owner_id));

grant select on public.receipt_items to authenticated;
revoke insert, update, delete on public.receipt_items from authenticated, anon;

create table public.receipt_discounts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.ledger_owners(owner_id),
  receipt_id uuid not null references public.receipts(id) on delete cascade,
  position integer not null,
  -- Nullable because `lib/receipt-text.ts` currently keeps only discount *amounts* and drops
  -- their printed names (see `ParsedReceipt.discounts`, `MinorUnitString[]`) — the reader is
  -- deliberately not changed in this task, so the column is ready for a future reader change
  -- rather than backfilled with an invented value now.
  name text null,
  amount_minor bigint not null,
  unique (receipt_id, position)
);

alter table public.receipt_discounts enable row level security;
alter table public.receipt_discounts force row level security;
create policy strong_owner_select on public.receipt_discounts for select to authenticated
  using (private.has_strong_owner_access(owner_id));

grant select on public.receipt_discounts to authenticated;
revoke insert, update, delete on public.receipt_discounts from authenticated, anon;

-- -----------------------------------------------------------------------------------------------
-- The write path
-- -----------------------------------------------------------------------------------------------

create or replace function public.capture_receipt(p_request jsonb)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp
as $$
declare
  v_owner uuid := auth.uid();
  v_receipt public.receipts%rowtype;
  v_existing public.receipts%rowtype;
  v_receipt_number text;
  v_purchased_on date;
  v_source text := p_request->>'source';
  v_completeness text := p_request->>'completeness';
  v_subtotal_minor bigint;
  v_net_minor bigint;
  v_vat_pre_minor bigint;
  v_vat_minor bigint;
  v_vat_total_minor bigint;
  v_failed_checks text[];
  v_inapplicable_checks text[];
  v_merged_sources text[];
  v_incoming_rank integer;
  v_stored_rank integer;
  v_replace_items boolean;
  v_display_names jsonb;
  v_item jsonb;
  v_discount jsonb;
  v_captured boolean := true;
begin
  if not private.has_strong_owner_access(v_owner) then raise exception 'strong owner access required'; end if;

  if p_request->>'merchant' is distinct from '7-eleven' then raise exception 'invalid receipt'; end if;
  if v_source not in ('screenshot', 'condensed', 'full') then raise exception 'invalid receipt'; end if;
  if v_completeness not in ('complete', 'partial') then raise exception 'invalid receipt'; end if;
  if coalesce(p_request->>'storeCode', '') = '' or coalesce(p_request->>'branchName', '') = '' then
    raise exception 'invalid receipt';
  end if;

  -- Leading zeros stripped here, once, so every later comparison — the unique key, the
  -- idempotent re-select below — works on the same normalised value regardless of which form
  -- supplied it. A run of all zeros collapses to a single '0' rather than the empty string.
  v_receipt_number := ltrim(coalesce(p_request->>'receiptNumber', ''), '0');
  if v_receipt_number = '' then v_receipt_number := '0'; end if;

  begin
    v_purchased_on := (p_request->>'purchasedOn')::date;
  exception when others then raise exception 'invalid receipt date'; end;

  -- Money crosses the wire as canonical text, exactly as `capture_slip` requires, so an
  -- out-of-range or malformed figure is refused before any cast rather than surfacing as a bare
  -- 22P02 partway through.
  if jsonb_typeof(p_request->'netMinor') is distinct from 'string'
    or not private.is_canonical_int64_text(p_request->>'netMinor')
    then raise exception 'receipt net amount must be canonical int64 text'; end if;
  v_net_minor := (p_request->>'netMinor')::bigint;

  if jsonb_typeof(p_request->'subtotalMinor') not in ('string', 'null')
    or (jsonb_typeof(p_request->'subtotalMinor') = 'string' and not private.is_canonical_int64_text(p_request->>'subtotalMinor'))
    then raise exception 'receipt subtotal must be canonical int64 text'; end if;
  v_subtotal_minor := nullif(p_request->>'subtotalMinor', '')::bigint;

  if jsonb_typeof(p_request->'vatPreMinor') not in ('string', 'null')
    or (jsonb_typeof(p_request->'vatPreMinor') = 'string' and not private.is_canonical_int64_text(p_request->>'vatPreMinor'))
    then raise exception 'receipt VAT figure must be canonical int64 text'; end if;
  v_vat_pre_minor := nullif(p_request->>'vatPreMinor', '')::bigint;

  if jsonb_typeof(p_request->'vatMinor') not in ('string', 'null')
    or (jsonb_typeof(p_request->'vatMinor') = 'string' and not private.is_canonical_int64_text(p_request->>'vatMinor'))
    then raise exception 'receipt VAT figure must be canonical int64 text'; end if;
  v_vat_minor := nullif(p_request->>'vatMinor', '')::bigint;

  if jsonb_typeof(p_request->'vatTotalMinor') not in ('string', 'null')
    or (jsonb_typeof(p_request->'vatTotalMinor') = 'string' and not private.is_canonical_int64_text(p_request->>'vatTotalMinor'))
    then raise exception 'receipt VAT figure must be canonical int64 text'; end if;
  v_vat_total_minor := nullif(p_request->>'vatTotalMinor', '')::bigint;

  select coalesce(array_agg(value), '{}') into v_failed_checks
    from jsonb_array_elements_text(coalesce(p_request->'failedChecks', '[]'::jsonb));
  select coalesce(array_agg(value), '{}') into v_inapplicable_checks
    from jsonb_array_elements_text(coalesce(p_request->'inapplicableChecks', '[]'::jsonb));

  perform pg_advisory_xact_lock(hashtextextended(v_owner::text || ':ledger-mutation', 0));

  select * into v_existing from public.receipts
    where owner_id = v_owner and merchant = '7-eleven' and store_code = p_request->>'storeCode'
      and receipt_number = v_receipt_number
    for update;

  if v_existing.id is null then
    -- New receipt: nothing to merge, nothing to disagree with, and the incoming source is
    -- necessarily the best one seen so far.
    begin
      insert into public.receipts(
        owner_id, merchant, store_code, branch_name, receipt_number, purchased_on,
        purchased_at_time, payment_method, subtotal_minor, net_minor, unit_count,
        vat_pre_minor, vat_minor, vat_total_minor, vat_code, supersedes_receipt_number,
        completeness, failed_checks, inapplicable_checks, sources, items_source, items_complete
      ) values (
        v_owner, '7-eleven', p_request->>'storeCode', p_request->>'branchName', v_receipt_number,
        v_purchased_on, nullif(p_request->>'purchasedAtTime', '')::time,
        nullif(p_request->>'paymentMethod', ''), v_subtotal_minor, v_net_minor,
        nullif(p_request->>'unitCount', '')::integer, v_vat_pre_minor, v_vat_minor,
        v_vat_total_minor, nullif(p_request->>'vatCode', ''),
        nullif(p_request->>'supersedesReceiptNumber', ''), v_completeness, v_failed_checks,
        v_inapplicable_checks, array[v_source], v_source, v_completeness = 'complete'
      )
      returning * into v_receipt;
    exception
      when check_violation then raise exception 'invalid receipt';
      when not_null_violation then raise exception 'invalid receipt';
      when invalid_text_representation then raise exception 'invalid receipt';
      when unique_violation then raise exception 'receipt already captured';
    end;

    for v_item in select value from jsonb_array_elements(coalesce(p_request->'items', '[]'::jsonb)) loop
      if jsonb_typeof(v_item->'amountMinor') is distinct from 'string'
        or not private.is_canonical_int64_text(v_item->>'amountMinor')
        then raise exception 'receipt item amount must be canonical int64 text'; end if;
      if jsonb_typeof(v_item->'unitPriceMinor') not in ('string', 'null')
        or (jsonb_typeof(v_item->'unitPriceMinor') = 'string' and not private.is_canonical_int64_text(v_item->>'unitPriceMinor'))
        then raise exception 'receipt item unit price must be canonical int64 text'; end if;
      insert into public.receipt_items(
        owner_id, receipt_id, line_no, position, quantity, name, display_name,
        unit_price_minor, amount_minor, vat_exempt, is_promotion
      ) values (
        v_owner, v_receipt.id, (v_item->>'lineNo')::integer, (v_item->>'position')::integer,
        (v_item->>'quantity')::integer, v_item->>'name', null,
        nullif(v_item->>'unitPriceMinor', '')::bigint, (v_item->>'amountMinor')::bigint,
        (v_item->>'vatExempt')::boolean, (v_item->>'isPromotion')::boolean
      );
    end loop;

    for v_discount in select value from jsonb_array_elements(coalesce(p_request->'discounts', '[]'::jsonb)) loop
      if jsonb_typeof(v_discount->'amountMinor') is distinct from 'string'
        or not private.is_canonical_int64_text(v_discount->>'amountMinor')
        then raise exception 'receipt discount amount must be canonical int64 text'; end if;
      insert into public.receipt_discounts(owner_id, receipt_id, position, name, amount_minor)
      values (v_owner, v_receipt.id, (v_discount->>'position')::integer,
        nullif(v_discount->>'name', ''), (v_discount->>'amountMinor')::bigint);
    end loop;

    insert into public.audit_events(owner_id, actor_id, event_type, entity_type, entity_id, detail)
      values (v_owner, v_owner, 'receipt.capture', 'receipt', v_receipt.id,
        jsonb_build_object('store_code', v_receipt.store_code, 'source', v_source,
          'completeness', v_completeness));
    update public.mutation_sequences set sequence = sequence + 1, updated_at = now() where owner_id = v_owner;

    return jsonb_build_object('captured', v_captured, 'merged', false, 'receipt', to_jsonb(v_receipt)
      - 'subtotal_minor' - 'net_minor' - 'vat_pre_minor' - 'vat_minor' - 'vat_total_minor'
      || jsonb_build_object(
          'subtotal_minor', v_receipt.subtotal_minor::text, 'net_minor', v_receipt.net_minor::text,
          'vat_pre_minor', v_receipt.vat_pre_minor::text, 'vat_minor', v_receipt.vat_minor::text,
          'vat_total_minor', v_receipt.vat_total_minor::text));
  end if;

  -- Rule 2: a stored non-null money figure that disagrees with a non-null incoming one is a
  -- refusal. Two readings of one purchase must agree about the money, or one of them is
  -- misread; picking a winner would launder that disagreement into the stored row.
  if v_existing.net_minor is not null and v_net_minor is not null and v_existing.net_minor <> v_net_minor then
    raise exception 'receipt net amount disagrees with the stored value; refusing to guess which reading is right';
  end if;
  if v_existing.subtotal_minor is not null and v_subtotal_minor is not null and v_existing.subtotal_minor <> v_subtotal_minor then
    raise exception 'receipt subtotal disagrees with the stored value; refusing to guess which reading is right';
  end if;
  if v_existing.vat_pre_minor is not null and v_vat_pre_minor is not null and v_existing.vat_pre_minor <> v_vat_pre_minor then
    raise exception 'receipt VAT figure disagrees with the stored value; refusing to guess which reading is right';
  end if;
  if v_existing.vat_minor is not null and v_vat_minor is not null and v_existing.vat_minor <> v_vat_minor then
    raise exception 'receipt VAT figure disagrees with the stored value; refusing to guess which reading is right';
  end if;
  if v_existing.vat_total_minor is not null and v_vat_total_minor is not null and v_existing.vat_total_minor <> v_vat_total_minor then
    raise exception 'receipt VAT figure disagrees with the stored value; refusing to guess which reading is right';
  end if;

  -- Rule 3: rank the incoming source against the one that wrote the stored items, and only
  -- replace when the incoming one is at least as good.
  v_incoming_rank := (case when v_completeness = 'complete' then 2 else 0 end)
    + (case when v_source = 'full' then 1 else 0 end);
  v_stored_rank := (case when v_existing.items_complete then 2 else 0 end)
    + (case when v_existing.items_source = 'full' then 1 else 0 end);
  v_replace_items := v_incoming_rank >= v_stored_rank;

  -- Rule 1: sources accumulate rather than being overwritten.
  v_merged_sources := case when v_source = any(v_existing.sources) then v_existing.sources
    else v_existing.sources || v_source end;

  update public.receipts set
    -- Rule 1: coalesce(incoming, stored) so a `null` on this call never clears a stored value.
    branch_name = coalesce(p_request->>'branchName', v_existing.branch_name),
    purchased_at_time = coalesce(nullif(p_request->>'purchasedAtTime', '')::time, v_existing.purchased_at_time),
    payment_method = coalesce(nullif(p_request->>'paymentMethod', ''), v_existing.payment_method),
    subtotal_minor = coalesce(v_subtotal_minor, v_existing.subtotal_minor),
    net_minor = coalesce(v_net_minor, v_existing.net_minor),
    unit_count = coalesce(nullif(p_request->>'unitCount', '')::integer, v_existing.unit_count),
    vat_pre_minor = coalesce(v_vat_pre_minor, v_existing.vat_pre_minor),
    vat_minor = coalesce(v_vat_minor, v_existing.vat_minor),
    vat_total_minor = coalesce(v_vat_total_minor, v_existing.vat_total_minor),
    vat_code = coalesce(nullif(p_request->>'vatCode', ''), v_existing.vat_code),
    supersedes_receipt_number = coalesce(nullif(p_request->>'supersedesReceiptNumber', ''), v_existing.supersedes_receipt_number),
    -- Not nullable columns: the incoming value always wins, which is `coalesce(incoming,
    -- stored)` degenerating to `incoming` because `incoming` is never null here.
    completeness = v_completeness,
    failed_checks = v_failed_checks,
    inapplicable_checks = v_inapplicable_checks,
    sources = v_merged_sources,
    items_source = case when v_replace_items then v_source else v_existing.items_source end,
    items_complete = case when v_replace_items then (v_completeness = 'complete') else v_existing.items_complete end,
    updated_at = now()
  where id = v_existing.id
  returning * into v_receipt;

  if v_replace_items then
    -- `display_name` is the owner's own data, never a parse's, and survives the rows it was
    -- attached to. Captured before the delete so a position present in both the old and the new
    -- item list keeps its owner-supplied name.
    select coalesce(jsonb_object_agg(position::text, display_name) filter (where display_name is not null), '{}'::jsonb)
      into v_display_names
      from public.receipt_items where receipt_id = v_existing.id;

    delete from public.receipt_items where receipt_id = v_existing.id;
    delete from public.receipt_discounts where receipt_id = v_existing.id;

    for v_item in select value from jsonb_array_elements(coalesce(p_request->'items', '[]'::jsonb)) loop
      if jsonb_typeof(v_item->'amountMinor') is distinct from 'string'
        or not private.is_canonical_int64_text(v_item->>'amountMinor')
        then raise exception 'receipt item amount must be canonical int64 text'; end if;
      if jsonb_typeof(v_item->'unitPriceMinor') not in ('string', 'null')
        or (jsonb_typeof(v_item->'unitPriceMinor') = 'string' and not private.is_canonical_int64_text(v_item->>'unitPriceMinor'))
        then raise exception 'receipt item unit price must be canonical int64 text'; end if;
      insert into public.receipt_items(
        owner_id, receipt_id, line_no, position, quantity, name, display_name,
        unit_price_minor, amount_minor, vat_exempt, is_promotion
      ) values (
        v_owner, v_existing.id, (v_item->>'lineNo')::integer, (v_item->>'position')::integer,
        (v_item->>'quantity')::integer, v_item->>'name',
        v_display_names->>(v_item->>'position'),
        nullif(v_item->>'unitPriceMinor', '')::bigint, (v_item->>'amountMinor')::bigint,
        (v_item->>'vatExempt')::boolean, (v_item->>'isPromotion')::boolean
      );
    end loop;

    for v_discount in select value from jsonb_array_elements(coalesce(p_request->'discounts', '[]'::jsonb)) loop
      if jsonb_typeof(v_discount->'amountMinor') is distinct from 'string'
        or not private.is_canonical_int64_text(v_discount->>'amountMinor')
        then raise exception 'receipt discount amount must be canonical int64 text'; end if;
      insert into public.receipt_discounts(owner_id, receipt_id, position, name, amount_minor)
      values (v_owner, v_existing.id, (v_discount->>'position')::integer,
        nullif(v_discount->>'name', ''), (v_discount->>'amountMinor')::bigint);
    end loop;
  end if;

  insert into public.audit_events(owner_id, actor_id, event_type, entity_type, entity_id, detail)
    values (v_owner, v_owner, 'receipt.merge', 'receipt', v_existing.id,
      jsonb_build_object('store_code', v_existing.store_code, 'source', v_source,
        'completeness', v_completeness, 'items_replaced', v_replace_items));
  update public.mutation_sequences set sequence = sequence + 1, updated_at = now() where owner_id = v_owner;

  return jsonb_build_object('captured', false, 'merged', true, 'itemsReplaced', v_replace_items,
    'receipt', to_jsonb(v_receipt)
      - 'subtotal_minor' - 'net_minor' - 'vat_pre_minor' - 'vat_minor' - 'vat_total_minor'
      || jsonb_build_object(
          'subtotal_minor', v_receipt.subtotal_minor::text, 'net_minor', v_receipt.net_minor::text,
          'vat_pre_minor', v_receipt.vat_pre_minor::text, 'vat_minor', v_receipt.vat_minor::text,
          'vat_total_minor', v_receipt.vat_total_minor::text));
end;
$$;
revoke all on function public.capture_receipt(jsonb) from public, anon;
grant execute on function public.capture_receipt(jsonb) to authenticated;

commit;
