-- Migration 029 — an OCR reading never overwrites a PDF's (PLAN task 56, D-210).
--
-- The screenshot path reads the app's receipt screen through Google Cloud Vision. Its money is
-- held to the same Rule 2 as any source, but its *text* is an OCR reading, and 027's rules let it
-- overwrite text read exactly from a PDF:
--
-- - **Rule 3** ranked only complete-or-not and full-or-not, so a complete screenshot tied a
--   complete condensed PDF and, replacing on `>=`, swapped the PDF's exact item names for OCR's.
--   Items are now ranked complete first, then full invoice > condensed PDF > screenshot.
-- - **Rule 1** merged `coalesce(incoming, stored)`, so a screenshot saved after a PDF replaced the
--   branch name and the payment method — the field ledger matching will key on — with OCR text.
--   A screenshot now only fills those when no PDF has supplied them.
--
-- Everything else in `capture_receipt` is 027's, unchanged. No table, column or grant changes, so
-- the backup contract stays at v8.

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
