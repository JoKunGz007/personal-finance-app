begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

-- Backup v15 (migration 049, D-247): `deliveries.service` survives a backup and restore. What this
-- proves: the export writes schemaVersion 15 and carries `service`; a v15 file restores a mart order
-- as mart; a v14 file, whose delivery rows have no `service` key, restores the order as food; the
-- restore_runs CHECK and the restore RPC accept 15 and still refuse 16. Every value is invented.

set local session_replication_role = replica;
delete from public.restore_chunks;
delete from public.restore_runs;
delete from public.backup_records;
delete from public.ride_match_revisions;
delete from public.ride_match_overlays;
delete from public.ride_adjustments;
delete from public.rides;
delete from public.delivery_match_revisions;
delete from public.delivery_match_overlays;
delete from public.lineman_order_details;
delete from public.delivery_adjustments;
delete from public.delivery_items;
delete from public.deliveries;
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
set sequence = 0, last_exported_sequence = 0, updated_at = '2026-10-11T00:00:00Z'
where owner_id = '11111111-1111-4111-8111-111111111111';
delete from auth.mfa_factors where user_id = '11111111-1111-4111-8111-111111111111';
set local session_replication_role = origin;

insert into auth.mfa_factors(id, user_id, friendly_name, factor_type, status, secret, created_at, updated_at)
values
  ('aaaaaaaa-0000-4000-8000-000000000051', '11111111-1111-4111-8111-111111111111',
   'backup v15 TOTP', 'totp', 'verified', 'SYNTHETICBACKUPV15', '2026-10-11T00:00:00Z', '2026-10-11T00:00:00Z');

select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal2"}',
  true
);

-- The 42 chunk kinds in contract order (the v14 list, which v15 shares: no new table).
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
  'category_parents','category_provenance','category_reviews'
]) with ordinality as t(kind, ordinality);

-- One delivery order; `service` is added only when p_service is given, so a v14 row has no key.
create function pg_temp.delivery_rows(p_service text) returns jsonb language sql as $$
  select jsonb_build_array(
    jsonb_build_object(
      'id', 'eeeeeeee-0000-4000-8000-000000000001', 'owner_id', '11111111-1111-4111-8111-111111111111',
      'platform', 'grabfood', 'booking_id', 'A-BACKUP0001', 'restaurant', 'Invented Mart',
      'payment_method', 'Invented card', 'receipt_sent_at', '2026-10-01T12:30:00Z',
      'food_minor', '25000', 'delivery_fee_minor', '1500', 'total_minor', '26500',
      'created_at', '2026-10-01T12:31:00Z')
    || case when p_service is null then '{}'::jsonb else jsonb_build_object('service', p_service) end)
$$;

create function pg_temp.chunk(p_kind text, p_service text) returns jsonb language sql as $$
  select jsonb_build_object('kind', p_kind, 'rows', case
    when p_kind = 'mutation_sequences' then jsonb_build_array(jsonb_build_object(
      'owner_id', '11111111-1111-4111-8111-111111111111', 'sequence', '7',
      'last_exported_sequence', '7', 'updated_at', '2026-10-11T00:00:00Z'))
    when p_kind = 'deliveries' then pg_temp.delivery_rows(p_service)
    else '[]'::jsonb end)
$$;

-- Stage, send every chunk and commit one restore of the given version; returns the commit status.
create function pg_temp.run_restore(p_version integer, p_service text, p_restore uuid, p_key uuid)
returns text language plpgsql as $$
declare
  v_chunks jsonb; v_data jsonb := '{}'::jsonb; v_counts jsonb := '{}'::jsonb; v_desc jsonb := '[]'::jsonb;
  v_payload jsonb; v_digest text; v_manifest jsonb; v_ident jsonb; r record;
begin
  select jsonb_agg(pg_temp.chunk(kind, p_service) order by idx) into v_chunks from kinds;
  for r in select idx, kind from kinds order by idx loop
    v_data := jsonb_set(v_data, array[r.kind], v_chunks->r.idx->'rows');
    v_counts := jsonb_set(v_counts, array[r.kind], to_jsonb(jsonb_array_length(v_chunks->r.idx->'rows')));
    v_desc := v_desc || jsonb_build_array(jsonb_build_object('index', r.idx, 'kind', r.kind,
      'rowCount', jsonb_array_length(v_chunks->r.idx->'rows'), 'sha256', private.sha256_jsonb(v_chunks->r.idx)));
  end loop;
  v_payload := jsonb_build_object('schemaVersion', p_version, 'exportedAt', '2026-10-11T00:00:00.000000Z',
    'snapshotSequence', '7', 'tableCounts', v_counts, 'data', v_data);
  v_digest := private.sha256_jsonb(v_payload);
  v_manifest := jsonb_build_object('payloadDigest', v_digest, 'snapshotSequence', '7',
    'exportedAt', '2026-10-11T00:00:00.000000Z', 'tableCounts', v_counts, 'chunks', v_desc);
  v_ident := jsonb_build_object('restoreId', p_restore, 'idempotencyKey', p_key,
    'schemaVersion', p_version, 'digest', v_digest);
  perform public.restore_backup('stage', v_ident || jsonb_build_object('manifest', v_manifest));
  for r in select idx from kinds order by idx loop
    perform public.restore_backup('chunk', v_ident || jsonb_build_object('chunkIndex', r.idx,
      'chunkDigest', v_desc->r.idx->>'sha256', 'chunk', v_chunks->r.idx));
  end loop;
  return public.restore_backup('commit', v_ident)->>'status';
end;
$$;

-- Export: version 15, and an order's service is in its row.
insert into public.deliveries(id, owner_id, platform, booking_id, restaurant, payment_method, receipt_sent_at,
  food_minor, delivery_fee_minor, total_minor, created_at, service)
values ('eeeeeeee-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'grabfood',
  'A-BACKUP0002', 'Invented Express', 'Invented card', '2026-10-02T12:30:00Z', 0, 3000, 3000,
  '2026-10-02T12:31:00Z', 'express');
select is(public.export_backup_snapshot()->>'schemaVersion', '15', 'the export writes schema version 15');
select is(
  public.export_backup_snapshot()#>>'{data,deliveries,0,service}', 'express',
  'the export carries each order service');
set local session_replication_role = replica;
delete from public.deliveries;
set local session_replication_role = origin;

-- Restore v15: a mart order stays mart.
select is(
  pg_temp.run_restore(15, 'mart', 'cccccccc-0000-4000-8000-000000000051', 'dddddddd-0000-4000-8000-000000000051'),
  'applied', 'a v15 file with a mart order restores');
select is(
  (select service from public.deliveries where id = 'eeeeeeee-0000-4000-8000-000000000001'),
  'mart', 'a v15 restore keeps the non-food service');
select is(
  (select schema_version from public.restore_runs where id = 'cccccccc-0000-4000-8000-000000000051'),
  15, 'the restore run records schema version 15');

-- Restore v14: no service key, so the order is food.
set local session_replication_role = replica;
delete from public.restore_chunks;
delete from public.deliveries;
delete from public.audit_events;
update public.mutation_sequences set sequence = 0, last_exported_sequence = 0
where owner_id = '11111111-1111-4111-8111-111111111111';
set local session_replication_role = origin;

select is(
  pg_temp.run_restore(14, null, 'cccccccc-0000-4000-8000-000000000052', 'dddddddd-0000-4000-8000-000000000052'),
  'applied', 'a v14 file whose delivery rows have no service restores');
select is(
  (select service from public.deliveries where id = 'eeeeeeee-0000-4000-8000-000000000001'),
  'food', 'a v14 restore leaves the order as food');

-- A version beyond 15 is still refused.
select throws_ok(
  $$select public.restore_backup('stage', jsonb_build_object('restoreId', 'cccccccc-0000-4000-8000-000000000053',
    'idempotencyKey', 'dddddddd-0000-4000-8000-000000000053', 'schemaVersion', 16, 'digest', repeat('a', 64)))$$,
  'P0001', 'invalid restore contract', 'schema version 16 is refused');

select * from finish();
rollback;
