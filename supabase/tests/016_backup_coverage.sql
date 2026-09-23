begin;
create extension if not exists pgtap with schema extensions;
select plan(2);

-- The tripwire pass 1 found: nothing anywhere enumerated the real tables and checked them
-- against the backup contract. Coverage was enforced only by hardcoded name arrays inside
-- `restore_backup` and by the field list in `export_backup_snapshot` — so a future migration
-- could add an owner-bearing table, the backup would silently not carry it, and every existing
-- test would still pass, while SPEC.md gate 6 promises "a backup covers *every* table holding
-- owner records". This queries the live schema, which is the one thing that cannot go stale the
-- way a second hand-maintained list can.
--
-- pgTAP rather than the DB-backed vitest suite: this check is purely a live-schema fact (which
-- tables exist and which have an `owner_id` column), needs no HTTP session or RPC, and belongs
-- beside the other structural contracts `supabase/tests` already asserts — `002_security_contracts.sql`
-- checks grants the same way, against `information_schema`, not through the API.

create temporary table backup_table_kinds (kind text primary key);
-- Kept in sync by hand with `lib/backup-contract.ts`'s `BACKUP_TABLE_KINDS` (v11). There is no
-- way to import the TypeScript array into pgTAP, so this list is the SQL side of the same
-- contract the restore's own `v_expected_kinds` and `restore_chunks_v2_binding` CHECK already
-- restate — a drift between any of them is exactly the class of bug this test exists to catch
-- for the *fourth* list (the live schema) that none of the other three read from.
insert into backup_table_kinds(kind) values
  ('accounts'),('categories'),('import_artifacts'),('import_batches'),('source_transactions'),
  ('source_components'),('import_batch_rows'),('transaction_overlays'),('overlay_revisions'),
  ('audit_events'),('mutation_sequences'),
  ('slips'),
  ('slip_match_overlays'),('slip_match_revisions'),
  ('cash_entries'),('cash_entry_overlays'),('cash_entry_revisions'),
  ('slip_correction_overlays'),('slip_correction_revisions'),
  ('notification_cards'),
  ('notification_card_correction_overlays'),('notification_card_correction_revisions'),
  ('notification_card_decision_overlays'),('notification_card_decision_revisions'),
  ('receipts'),('receipt_items'),('receipt_discounts'),
  ('receipt_match_overlays'),('receipt_match_revisions'),
  ('deliveries'),('delivery_items'),('delivery_adjustments'),
  ('delivery_match_overlays'),('delivery_match_revisions');

create temporary table backup_exclusions (kind text primary key, reason text not null);
-- The backup machinery itself, deliberately never carried by a backup of itself. Excluding a
-- table is always a deliberate act written down here, never an accident of a hardcoded list
-- falling behind the schema.
insert into backup_exclusions(kind, reason) values
  ('ledger_owners', 'the binding record itself (owner_id is its primary key, not owned data) — carrying it in a backup would let a restore rebind an owner rather than have the caller''s own session do so'),
  ('backup_records', 'a log of past exports; restoring one would fabricate export history that never happened on the destination'),
  ('restore_runs', 'the restore machinery''s own bookkeeping; a backup that carried it could stage a restore inside a restore'),
  ('restore_chunks', 'the restore machinery''s own staged payload storage, for the same reason restore_runs is excluded');

select is(
  (
    select count(*)::integer from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
    where c.table_schema = 'public' and c.column_name = 'owner_id'
      and c.table_name not in (select kind from backup_table_kinds)
      and c.table_name not in (select kind from backup_exclusions)
  ),
  0,
  'every public table with an owner_id column is either in BACKUP_TABLE_KINDS or an explicit, commented exclusion'
);

-- The other half of the property: every table this test names as covered must still exist and
-- still carry owner_id, so a table renamed or dropped out from under BACKUP_TABLE_KINDS is also
-- caught rather than only additions.
select is(
  (
    select count(*)::integer from backup_table_kinds k
    where not exists (
      select 1 from information_schema.columns c
      join information_schema.tables t
        on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
      where c.table_schema = 'public' and c.column_name = 'owner_id' and c.table_name = k.kind
    )
  ),
  0,
  'every table named in BACKUP_TABLE_KINDS still exists in the public schema with an owner_id column'
);

select * from finish();
rollback;
