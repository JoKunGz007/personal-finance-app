-- Migration 067 — a screenshot receipt whose purchase time is ambiguous keeps two candidate
-- times, and a later ledger match fills the time from the candidate that fits.
--
-- A 7-Eleven app screenshot prints the time twice (the screen header and the R# line). When they
-- disagree and the enlarged re-read does not settle it, the capture stores `purchased_at_time`
-- null and passes `timeCandidates`: exactly two distinct HH:MM strings. No new column (D-097):
-- the candidates live in the `detail` of the `receipt.capture` / `receipt.merge` audit event as
-- `time_candidates`. Candidates are refused ('invalid receipt') unless the form is `screenshot`
-- and the request's time is null. The table and the RPC already allowed a null time for every
-- form, so nothing else about the time changes (coalesce(incoming, stored) on merge stays).
--
-- `capture_receipt` is 060's, unchanged apart from the candidate validation and the two audit
-- details. `fill_receipt_time` is new: given a receipt and a ledger row, it fills a null time from
-- the candidate whose lag to the row is in [0, 120] minutes (the automatic rule's window). When
-- both candidates qualify, it fills only if exactly one lag is in [0, 2]. The row must move
-- exactly minus the receipt's net (the `receipt_ledger_candidates()` equality) and either name
-- TRUE MONEY (the `names_true_money` ilike test) or be the owner's stored match for the receipt.
-- Every refusal to fill is a no-op returning `{filled: false, reason}`, so a replay writes
-- nothing. A fill writes a `receipt.time_filled` audit event and bumps `mutation_sequences`.
--
-- No table, column or restore change: audit events are already backed up and their type is free
-- text, so the backup contract is unchanged.

begin;

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
  -- True when the stored row already holds a reading taken from real PDF text. An OCR reading
  -- (the screenshot) never overwrites such a value, only fills one that is still null.
  v_stored_has_text boolean;
  -- Migration 067: the two readings of the purchase time when the screen header and the R# line
  -- disagree and the enlarged re-read did not settle it. Null when the request carries none.
  v_time_candidates jsonb := p_request->'timeCandidates';
begin
  if not private.has_strong_owner_access(v_owner) then raise exception 'strong owner access required'; end if;

  if p_request->>'merchant' is distinct from '7-eleven' then raise exception 'invalid receipt'; end if;
  if v_source not in ('screenshot', 'condensed', 'full') then raise exception 'invalid receipt'; end if;
  if v_completeness not in ('complete', 'partial') then raise exception 'invalid receipt'; end if;
  if coalesce(p_request->>'storeCode', '') = '' or coalesce(p_request->>'branchName', '') = '' then
    raise exception 'invalid receipt';
  end if;

  -- Migration 067: time candidates are accepted only from a screenshot whose time was left null,
  -- and only as exactly two distinct HH:MM strings. A JSON null counts as absent.
  if jsonb_typeof(v_time_candidates) = 'null' then v_time_candidates := null; end if;
  if v_time_candidates is not null then
    -- Checked apart first: SQL does not promise to short-circuit `or`, and
    -- jsonb_array_length raises on a non-array.
    if v_source is distinct from 'screenshot'
      or nullif(p_request->>'purchasedAtTime', '') is not null
      or jsonb_typeof(v_time_candidates) is distinct from 'array'
      then raise exception 'invalid receipt'; end if;
    if jsonb_array_length(v_time_candidates) <> 2
      or exists (select 1 from jsonb_array_elements(v_time_candidates) e
                  where jsonb_typeof(e.value) is distinct from 'string'
                     or not (e.value #>> '{}') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
      or (v_time_candidates->>0) = (v_time_candidates->>1)
      then raise exception 'invalid receipt'; end if;
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
          'completeness', v_completeness)
          || case when v_time_candidates is null then '{}'::jsonb
               else jsonb_build_object('time_candidates', v_time_candidates) end);
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
  -- replace when the incoming one is at least as good. **Migration 029 ranks the forms, not just
  -- full-or-not**: complete beats partial first, then full invoice > condensed PDF > screenshot, so
  -- an OCR reading never replaces an equally complete reading of real PDF text (D-210).
  v_incoming_rank := (case when v_completeness = 'complete' then 4 else 0 end)
    + (case v_source when 'full' then 2 when 'condensed' then 1 else 0 end);
  v_stored_rank := (case when v_existing.items_complete then 4 else 0 end)
    + (case v_existing.items_source when 'full' then 2 when 'condensed' then 1 else 0 end);
  v_replace_items := v_incoming_rank >= v_stored_rank;
  v_stored_has_text := v_existing.sources && array['condensed', 'full'];

  -- Rule 1: sources accumulate rather than being overwritten.
  v_merged_sources := case when v_source = any(v_existing.sources) then v_existing.sources
    else v_existing.sources || v_source end;

  update public.receipts set
    -- Rule 1: coalesce(incoming, stored) so a `null` on this call never clears a stored value.
    -- Migration 029: text fields read by OCR fill a gap but never replace a PDF's reading.
    branch_name = case when v_source = 'screenshot' and v_stored_has_text then v_existing.branch_name
      else coalesce(p_request->>'branchName', v_existing.branch_name) end,
    purchased_at_time = coalesce(nullif(p_request->>'purchasedAtTime', '')::time, v_existing.purchased_at_time),
    payment_method = case when v_source = 'screenshot' and v_stored_has_text
      then coalesce(v_existing.payment_method, nullif(p_request->>'paymentMethod', ''))
      else coalesce(nullif(p_request->>'paymentMethod', ''), v_existing.payment_method) end,
    subtotal_minor = coalesce(v_subtotal_minor, v_existing.subtotal_minor),
    net_minor = coalesce(v_net_minor, v_existing.net_minor),
    unit_count = coalesce(nullif(p_request->>'unitCount', '')::integer, v_existing.unit_count),
    vat_pre_minor = coalesce(v_vat_pre_minor, v_existing.vat_pre_minor),
    vat_minor = coalesce(v_vat_minor, v_existing.vat_minor),
    vat_total_minor = coalesce(v_vat_total_minor, v_existing.vat_total_minor),
    vat_code = coalesce(nullif(p_request->>'vatCode', ''), v_existing.vat_code),
    supersedes_receipt_number = coalesce(nullif(p_request->>'supersedesReceiptNumber', ''), v_existing.supersedes_receipt_number),
    -- Migration 060: the assessment describes the stored items, so it changes only with them.
    completeness = case when v_replace_items then v_completeness else v_existing.completeness end,
    failed_checks = case when v_replace_items then v_failed_checks else v_existing.failed_checks end,
    inapplicable_checks = case when v_replace_items then v_inapplicable_checks else v_existing.inapplicable_checks end,
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
        'completeness', v_completeness, 'items_replaced', v_replace_items)
        || case when v_time_candidates is null then '{}'::jsonb
             else jsonb_build_object('time_candidates', v_time_candidates) end);
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

/*
 * Fill a receipt's null time from its recorded candidates, against one ledger row. Access, lock
 * and audit follow `set_receipt_match` (migration 030). Every reason not to fill returns
 * `{filled: false, reason}` and writes nothing, so a replay after a fill is a no-op (the time is
 * set by then) and leaves no second audit event.
 */
create or replace function public.fill_receipt_time(p_receipt_id uuid, p_transaction_id uuid)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp
as $$
declare
  v_owner uuid := auth.uid();
  v_receipt public.receipts%rowtype;
  v_candidates jsonb;
  v_found boolean;
  v_source_date date;
  v_source_time time;
  v_label text;
  v_description text;
  v_movement bigint;
  v_is_stored_match boolean;
  v_lag_a integer;
  v_lag_b integer;
  v_fits_a boolean;
  v_fits_b boolean;
  v_time text;
  v_lag integer;
begin
  if not private.has_strong_owner_access(v_owner) then raise exception 'strong owner access required'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_owner::text || ':ledger-mutation', 0));

  select * into v_receipt from public.receipts
    where id = p_receipt_id and owner_id = v_owner
    for update;
  if v_receipt.id is null then raise exception 'receipt not owned'; end if;

  if v_receipt.purchased_at_time is not null then
    return jsonb_build_object('filled', false, 'reason', 'time already set');
  end if;

  -- The newest capture or merge that recorded candidates speaks for the receipt.
  select e.detail->'time_candidates' into v_candidates
    from public.audit_events e
   where e.owner_id = v_owner and e.entity_type = 'receipt' and e.entity_id = p_receipt_id
     and e.event_type in ('receipt.capture', 'receipt.merge')
     and e.detail ? 'time_candidates'
   order by e.id desc
   limit 1;
  if v_candidates is null then
    return jsonb_build_object('filled', false, 'reason', 'no time candidates');
  end if;

  select true, t.source_date, t.source_time, t.transaction_label, t.description,
         (select sum(c.amount_minor) from public.source_components c
           where c.transaction_id = t.id and c.owner_id = v_owner)
    into v_found, v_source_date, v_source_time, v_label, v_description, v_movement
    from public.source_transactions t
   where t.id = p_transaction_id and t.owner_id = v_owner;
  if v_found is null then
    return jsonb_build_object('filled', false, 'reason', 'transaction not owned');
  end if;
  if v_source_time is null then
    return jsonb_build_object('filled', false, 'reason', 'transaction has no time');
  end if;
  -- The same equality `receipt_ledger_candidates()` uses: the row moves exactly minus the net.
  if v_movement is distinct from -v_receipt.net_minor then
    return jsonb_build_object('filled', false, 'reason', 'amount mismatch');
  end if;

  select exists (select 1 from public.receipt_match_overlays o
                  where o.receipt_id = p_receipt_id and o.owner_id = v_owner
                    and o.decision = 'matched' and o.transaction_id = p_transaction_id)
    into v_is_stored_match;
  -- The `names_true_money` test of `receipt_ledger_candidates()`, or the owner's own link.
  if not (coalesce(v_description ilike '%TRUE MONEY%', false)
          or coalesce(v_label ilike '%TRUE MONEY%', false)
          or v_is_stored_match) then
    return jsonb_build_object('filled', false, 'reason', 'not a TRUE MONEY row or stored match');
  end if;

  -- Lag in whole minutes, floored, exactly as `receipt_ledger_candidates()` computes it.
  v_lag_a := floor(extract(epoch from (v_source_date + v_source_time)
    - (v_receipt.purchased_on + (v_candidates->>0)::time)) / 60)::integer;
  v_lag_b := floor(extract(epoch from (v_source_date + v_source_time)
    - (v_receipt.purchased_on + (v_candidates->>1)::time)) / 60)::integer;
  v_fits_a := v_lag_a between 0 and 120;
  v_fits_b := v_lag_b between 0 and 120;

  if v_fits_a and v_fits_b then
    -- Both fit the window: only a candidate within two minutes of the row, and only one, settles it.
    if (v_lag_a between 0 and 2) = (v_lag_b between 0 and 2) then
      return jsonb_build_object('filled', false, 'reason', 'candidates ambiguous');
    end if;
    v_fits_a := v_lag_a between 0 and 2;
    v_fits_b := not v_fits_a;
  end if;

  if v_fits_a then v_time := v_candidates->>0; v_lag := v_lag_a;
  elsif v_fits_b then v_time := v_candidates->>1; v_lag := v_lag_b;
  else return jsonb_build_object('filled', false, 'reason', 'no candidate fits');
  end if;

  update public.receipts set purchased_at_time = v_time::time, updated_at = now()
    where id = p_receipt_id;

  insert into public.audit_events(owner_id, actor_id, event_type, entity_type, entity_id, detail)
    values (v_owner, v_owner, 'receipt.time_filled', 'receipt', p_receipt_id,
      jsonb_build_object('transaction_id', p_transaction_id, 'time', v_time,
        'lag_minutes', v_lag, 'time_candidates', v_candidates));
  update public.mutation_sequences set sequence = sequence + 1, updated_at = now() where owner_id = v_owner;

  return jsonb_build_object('filled', true, 'reason', 'filled', 'time', v_time);
end;
$$;
revoke all on function public.fill_receipt_time(uuid, uuid) from public, anon;
grant execute on function public.fill_receipt_time(uuid, uuid) to authenticated;

commit;
