begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

-- Backup v16 (migration 055, PLAN task 62 step 2b): the seven Shopee tables survive a backup and
-- restore. What this proves: the export writes schemaVersion 16 and carries every Shopee table with
-- its money as text (a null-price item stays null, a price line keeps its minus sign); a v16 file
-- restored into an empty owner reproduces all seven tables exactly (a combined match, a refund and
-- a link event included); a v15 file restores and leaves them empty; the restore refuses 17 and a
-- Shopee chunk kind in a v15 manifest. Every value is invented.


set local session_replication_role = replica;
delete from public.restore_chunks;
delete from public.restore_runs;
delete from public.backup_records;
delete from public.shopee_order_links;
delete from public.shopee_payment_match_revisions;
delete from public.shopee_payment_match_overlays;
delete from public.shopee_refunds;
delete from public.shopee_order_price_lines;
delete from public.shopee_order_items;
delete from public.shopee_orders;
delete from public.delivery_match_revisions;
delete from public.delivery_match_overlays;
delete from public.receipt_match_revisions;
delete from public.receipt_match_overlays;
delete from public.slip_match_revisions;
delete from public.slip_match_overlays;
delete from public.overlay_revisions;
delete from public.transaction_overlays;
delete from public.import_batch_rows;
delete from public.source_components;
delete from public.source_transactions;
delete from public.audit_events;
delete from public.import_batches;
delete from public.import_artifacts;
delete from public.categories;
delete from public.accounts;
update public.mutation_sequences
set sequence = 0, last_exported_sequence = 0, updated_at = '2026-10-18T00:00:00Z'
where owner_id = '11111111-1111-4111-8111-111111111111';
delete from auth.mfa_factors where user_id = '11111111-1111-4111-8111-111111111111';

insert into public.accounts(id, owner_id, bank_code, label, account_type, last_four, currency, timezone)
values ('cccccccc-0000-4000-8000-000000000056', '11111111-1111-4111-8111-111111111111', 'SCB', 'Invented SCB', 'savings', '4343', 'THB', 'Asia/Bangkok');

-- t1: -500.00 (two orders), t2: +150.00 (a refund deposit), t3: -80.00 (a wallet top-up).
insert into public.source_transactions(id, owner_id, account_id, fingerprint_version, fingerprint,
  source_date, source_time, effective_date, transaction_label, description, post_balance_minor, currency)
values
  ('dddddddd-0000-4000-8000-000000000561', '11111111-1111-4111-8111-111111111111', 'cccccccc-0000-4000-8000-000000000056',
   'fingerprint-v1', repeat('a', 64), '2026-09-02', '19:02', '2026-09-02', 'Transfer', 'INVENTED ONE', '500000', 'THB'),
  ('dddddddd-0000-4000-8000-000000000562', '11111111-1111-4111-8111-111111111111', 'cccccccc-0000-4000-8000-000000000056',
   'fingerprint-v1', repeat('b', 64), '2026-09-03', '10:00', '2026-09-03', 'Deposit', 'INVENTED TWO', '515000', 'THB'),
  ('dddddddd-0000-4000-8000-000000000563', '11111111-1111-4111-8111-111111111111', 'cccccccc-0000-4000-8000-000000000056',
   'fingerprint-v1', repeat('c', 64), '2026-09-03', '11:00', '2026-09-03', 'Transfer', 'INVENTED THREE', '507000', 'THB');
insert into public.source_components(id, owner_id, transaction_id, position, kind, amount_minor, currency)
values
  ('eeeeeeee-0000-4000-8000-000000000561', '11111111-1111-4111-8111-111111111111', 'dddddddd-0000-4000-8000-000000000561', 1, 'withdrawal', -50000, 'THB'),
  ('eeeeeeee-0000-4000-8000-000000000562', '11111111-1111-4111-8111-111111111111', 'dddddddd-0000-4000-8000-000000000562', 1, 'deposit', 15000, 'THB'),
  ('eeeeeeee-0000-4000-8000-000000000563', '11111111-1111-4111-8111-111111111111', 'dddddddd-0000-4000-8000-000000000563', 1, 'withdrawal', -8000, 'THB');
set local session_replication_role = origin;

insert into auth.mfa_factors(id, user_id, friendly_name, factor_type, status, secret, created_at, updated_at)
values ('aaaaaaaa-0000-4000-8000-000000000056', '11111111-1111-4111-8111-111111111111',
  'backup v16 TOTP', 'totp', 'verified', 'SYNTHETICBACKUPV16', '2026-10-18T00:00:00Z', '2026-10-18T00:00:00Z');

select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal2"}',
  true
);

-- The 49 chunk kinds in contract order (the v15 list of 42, then the seven Shopee tables).
create temporary table kinds (idx integer primary key, kind text not null);
insert into kinds(idx, kind)
select ordinality - 1, kind from unnest(array[
  'accounts','categories','import_artifacts','import_batches','source_transactions',
  'source_components','import_batch_rows','transaction_overlays','overlay_revisions','audit_events',
  'mutation_sequences','slips','slip_match_overlays','slip_match_revisions',
  'cash_entries','cash_entry_overlays','cash_entry_revisions',
  'slip_correction_overlays','slip_correction_revisions','notification_cards',
  'notification_card_correction_overlays','notification_card_correction_revisions',
  'notification_card_decision_overlays','notification_card_decision_revisions',
  'receipts','receipt_items','receipt_discounts','receipt_match_overlays','receipt_match_revisions',
  'deliveries','delivery_items','delivery_adjustments','delivery_match_overlays','delivery_match_revisions',
  'rides','ride_adjustments','ride_match_overlays','ride_match_revisions','lineman_order_details',
  'category_parents','category_provenance','category_reviews',
  'shopee_orders','shopee_order_items','shopee_order_price_lines','shopee_refunds',
  'shopee_payment_match_overlays','shopee_payment_match_revisions','shopee_order_links'
]) with ordinality as t(kind, ordinality);

-- Stage, send every chunk and commit one restore of the given version from an exported snapshot;
-- a v15 file is the snapshot with the seven Shopee kinds left out. Returns the commit status.
create function pg_temp.run_restore(p_snap jsonb, p_version integer, p_restore uuid, p_key uuid)
returns text language plpgsql as $$
declare
  v_n integer := case when p_version = 16 then 49 else 42 end;
  v_chunks jsonb := '[]'::jsonb; v_data jsonb := '{}'::jsonb; v_counts jsonb := '{}'::jsonb; v_desc jsonb := '[]'::jsonb;
  v_chunk jsonb; v_payload jsonb; v_digest text; v_manifest jsonb; v_ident jsonb; r record;
begin
  for r in select idx, kind from kinds where idx < v_n order by idx loop
    v_chunk := jsonb_build_object('kind', r.kind, 'rows', p_snap->'data'->r.kind);
    v_chunks := v_chunks || jsonb_build_array(v_chunk);
    v_data := jsonb_set(v_data, array[r.kind], p_snap->'data'->r.kind);
    v_counts := jsonb_set(v_counts, array[r.kind], p_snap->'tableCounts'->r.kind);
    v_desc := v_desc || jsonb_build_array(jsonb_build_object('index', r.idx, 'kind', r.kind,
      'rowCount', jsonb_array_length(v_chunk->'rows'), 'sha256', private.sha256_jsonb(v_chunk)));
  end loop;
  v_payload := jsonb_build_object('schemaVersion', p_version, 'exportedAt', p_snap->'exportedAt',
    'snapshotSequence', p_snap->'snapshotSequence', 'tableCounts', v_counts, 'data', v_data);
  v_digest := private.sha256_jsonb(v_payload);
  v_manifest := jsonb_build_object('payloadDigest', v_digest, 'snapshotSequence', p_snap->'snapshotSequence',
    'exportedAt', p_snap->'exportedAt', 'tableCounts', v_counts, 'chunks', v_desc);
  v_ident := jsonb_build_object('restoreId', p_restore, 'idempotencyKey', p_key,
    'schemaVersion', p_version, 'digest', v_digest);
  perform public.restore_backup('stage', v_ident || jsonb_build_object('manifest', v_manifest));
  for r in select idx from kinds where idx < v_n order by idx loop
    perform public.restore_backup('chunk', v_ident || jsonb_build_object('chunkIndex', r.idx,
      'chunkDigest', v_desc->r.idx->>'sha256', 'chunk', v_chunks->r.idx));
  end loop;
  return public.restore_backup('commit', v_ident)->>'status';
end;
$$;

-- Seed through the three write paths. 0001: bank debit, signed price lines, an item without a
-- price, a refund to the bank. 0002: bank debit. 0003: wallet.
select public.capture_shopee_orders(jsonb_build_object('orders', jsonb_build_array(
  jsonb_build_object('orderCode', 'BKPORDER0001', 'linkId', '9000000000000001',
    'placedAt', '2026-09-02T10:00:00+07:00', 'paidAt', '2026-09-02T10:01:00+07:00', 'shop', 'Invented Shop',
    'paymentMethod', 'ShopeePay - ตัดบัญชีธนาคาร', 'totalMinor', '30000', 'itemPriceIs', 'line total',
    'items', '[{"position":1,"name":"Invented widget","variation":"Blue","quantity":2,"priceMinor":"32000","originalPriceMinor":"40000"},
               {"position":2,"name":"Invented gift","variation":null,"quantity":1,"priceMinor":null,"originalPriceMinor":null}]'::jsonb,
    'priceLines', '[{"position":1,"label":"Merchandise Subtotal","amountMinor":"32000"},{"position":2,"label":"Shipping Subtotal","amountMinor":"3000"},{"position":3,"label":"Shipping Discount","amountMinor":"-3000"},{"position":4,"label":"Voucher","amountMinor":"-2000"}]'::jsonb,
    'refund', '{"requestId":"BKPREFUND01","requestedAt":"2026-09-03T09:00:00+07:00","refundMinor":"15000","refundTo":"bank","requestedBy":"buyer","reason":"Invented reason","steps":["Cancellation Requested","Cancellation Accepted","Refunded"]}'::jsonb),
  jsonb_build_object('orderCode', 'BKPORDER0002', 'linkId', '9000000000000002',
    'placedAt', '2026-09-02T11:00:00+07:00', 'paidAt', null, 'shop', 'Invented Shop',
    'paymentMethod', 'ShopeePay - ตัดบัญชีธนาคาร', 'totalMinor', '20000', 'itemPriceIs', null,
    'items', '[{"position":1,"name":"Invented gadget","variation":null,"quantity":1,"priceMinor":"20000","originalPriceMinor":null}]'::jsonb,
    'priceLines', '[{"position":1,"label":"Merchandise Subtotal","amountMinor":"20000"}]'::jsonb),
  jsonb_build_object('orderCode', 'BKPORDER0003', 'linkId', '9000000000000003',
    'placedAt', '2026-09-02T12:00:00+07:00', 'paidAt', '2026-09-02T12:00:30+07:00', 'shop', 'Invented Shop',
    'paymentMethod', 'ShopeePay', 'totalMinor', '8000', 'itemPriceIs', 'unit price',
    'items', '[{"position":1,"name":"Invented trinket","variation":"Red","quantity":1,"priceMinor":"8000","originalPriceMinor":null}]'::jsonb,
    'priceLines', '[{"position":1,"label":"Merchandise Subtotal","amountMinor":"8000"}]'::jsonb)
)));
select public.set_shopee_payment_match('dddddddd-0000-4000-8000-000000000561', jsonb_build_array(
  jsonb_build_object('orderId', (select id from public.shopee_orders where order_code = 'BKPORDER0001'), 'expectedRevision', 0),
  jsonb_build_object('orderId', (select id from public.shopee_orders where order_code = 'BKPORDER0002'), 'expectedRevision', 0)),
  'matched');
select public.set_shopee_order_links('refund_deposit', 'dddddddd-0000-4000-8000-000000000562',
  array[(select id from public.shopee_orders where order_code = 'BKPORDER0001')], 'link');
select public.set_shopee_order_links('wallet_topup', 'dddddddd-0000-4000-8000-000000000563',
  array[(select id from public.shopee_orders where order_code = 'BKPORDER0003')], 'link');

create temporary table snap_before as select public.export_backup_snapshot() as value;
create function pg_temp.shopee_data(p_snap jsonb) returns jsonb language sql as $$
  select jsonb_object_agg(k, p_snap->'data'->k)
  from unnest(array['shopee_orders','shopee_order_items','shopee_order_price_lines','shopee_refunds',
    'shopee_payment_match_overlays','shopee_payment_match_revisions','shopee_order_links']) k
$$;

-- Export.
select is((select value->>'schemaVersion' from snap_before), '16', 'the export writes schema version 16');
select is(
  (select (value->'tableCounts') - (select array_agg(kind) from kinds where idx < 42) from snap_before),
  '{"shopee_orders":3,"shopee_order_items":4,"shopee_order_price_lines":6,"shopee_refunds":1,"shopee_payment_match_overlays":2,"shopee_payment_match_revisions":2,"shopee_order_links":2}'::jsonb,
  'the export carries all seven Shopee tables with their counts');
select is(
  (select r->'price_minor' from snap_before, jsonb_array_elements(value#>'{data,shopee_order_items}') r
    where r->>'name' = 'Invented gift'),
  'null'::jsonb, 'an item without a price exports null');
select is(
  (select r->>'amount_minor' from snap_before, jsonb_array_elements(value#>'{data,shopee_order_price_lines}') r
    where r->>'label' = 'Shipping Discount'),
  '-3000', 'a price line exports its signed amount as text');

-- Restore a v16 file into an empty owner.
set local session_replication_role = replica;
delete from public.restore_chunks;
delete from public.restore_runs;
delete from public.backup_records;
delete from public.shopee_order_links;
delete from public.shopee_payment_match_revisions;
delete from public.shopee_payment_match_overlays;
delete from public.shopee_refunds;
delete from public.shopee_order_price_lines;
delete from public.shopee_order_items;
delete from public.shopee_orders;
delete from public.delivery_match_revisions;
delete from public.delivery_match_overlays;
delete from public.receipt_match_revisions;
delete from public.receipt_match_overlays;
delete from public.slip_match_revisions;
delete from public.slip_match_overlays;
delete from public.overlay_revisions;
delete from public.transaction_overlays;
delete from public.import_batch_rows;
delete from public.source_components;
delete from public.source_transactions;
delete from public.audit_events;
delete from public.import_batches;
delete from public.import_artifacts;
delete from public.categories;
delete from public.accounts;
set local session_replication_role = origin;
select is(
  pg_temp.run_restore((select value from snap_before), 16, 'cccccccc-0000-4000-8000-000000000561', 'dddddddd-0000-4000-8000-000000000561'),
  'applied', 'a v16 file restores into an empty owner');
select is(
  pg_temp.shopee_data(public.export_backup_snapshot()), pg_temp.shopee_data((select value from snap_before)),
  'the restore reproduces all seven Shopee tables exactly');
select is(
  (select count(*)::integer from public.shopee_order_links l
    join public.shopee_orders o on o.id = l.order_id and o.owner_id = l.owner_id
    join public.source_transactions t on t.id = l.transaction_id and t.owner_id = l.owner_id),
  2, 'the restored links still reach their orders and ledger rows');
select is(
  (select schema_version from public.restore_runs where id = 'cccccccc-0000-4000-8000-000000000561'),
  16, 'the restore run records schema version 16');

-- Restore a v15 file (no Shopee kinds) into an empty owner.
set local session_replication_role = replica;
delete from public.restore_chunks;
delete from public.restore_runs;
delete from public.backup_records;
delete from public.shopee_order_links;
delete from public.shopee_payment_match_revisions;
delete from public.shopee_payment_match_overlays;
delete from public.shopee_refunds;
delete from public.shopee_order_price_lines;
delete from public.shopee_order_items;
delete from public.shopee_orders;
delete from public.delivery_match_revisions;
delete from public.delivery_match_overlays;
delete from public.receipt_match_revisions;
delete from public.receipt_match_overlays;
delete from public.slip_match_revisions;
delete from public.slip_match_overlays;
delete from public.overlay_revisions;
delete from public.transaction_overlays;
delete from public.import_batch_rows;
delete from public.source_components;
delete from public.source_transactions;
delete from public.audit_events;
delete from public.import_batches;
delete from public.import_artifacts;
delete from public.categories;
delete from public.accounts;
set local session_replication_role = origin;
select is(
  pg_temp.run_restore(
    jsonb_set((select value from snap_before), '{data}',
      (select (value->'data') - (select array_agg(kind) from kinds where idx >= 42) from snap_before)),
    15, 'cccccccc-0000-4000-8000-000000000562', 'dddddddd-0000-4000-8000-000000000562'),
  'applied', 'a v15 file restores and leaves the Shopee tables empty');
select is(
  (select count(*)::integer from public.shopee_orders) + (select count(*)::integer from public.shopee_order_links),
  0, 'a v15 restore writes no Shopee rows');

-- Refusals.
select throws_ok(
  $$select public.restore_backup('stage', jsonb_build_object('restoreId', 'cccccccc-0000-4000-8000-000000000563',
    'idempotencyKey', 'dddddddd-0000-4000-8000-000000000563', 'schemaVersion', 17, 'digest', repeat('a', 64)))$$,
  'P0001', 'invalid restore contract', 'schema version 17 is refused');
select throws_ok(
  $$insert into public.restore_chunks(owner_id, restore_id, chunk_index, chunk, chunk_kind, row_count, chunk_digest)
    values ('11111111-1111-4111-8111-111111111111', 'cccccccc-0000-4000-8000-000000000564', 0,
      '{"kind":"shopee_unknown","rows":[]}', 'shopee_unknown', 0, repeat('a', 64))$$,
  '23514', null, 'the chunk-kind CHECK refuses a kind outside the contract');

select * from finish();
rollback;
