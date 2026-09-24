import { describe, expect, it } from "vitest";
import { canonicalJson } from "@/lib/canonical";
import { decryptBackup, encryptBackup } from "@/lib/backup";
import {
  backupSnapshotSchema, backupSnapshotSchemaV4, backupSnapshotSchemaV5, backupSnapshotSchemaV6, backupSnapshotSchemaV7, backupSnapshotSchemaV8, backupSnapshotSchemaV9, backupSnapshotSchemaV10, backupSnapshotSchemaV11,
  BACKUP_SCHEMA_VERSION,
  BACKUP_TABLE_KINDS, BACKUP_TABLE_KINDS_V4, BACKUP_TABLE_KINDS_V5, BACKUP_TABLE_KINDS_V6, BACKUP_TABLE_KINDS_V7, BACKUP_TABLE_KINDS_V8, BACKUP_TABLE_KINDS_V9, BACKUP_TABLE_KINDS_V10, BACKUP_TABLE_KINDS_V11
} from "@/lib/backup-contract";
import { buildRestorePlan } from "@/lib/restore-plan";
import {
  API, CONTAINER, OWNER_EMAIL, OWNER_PASSWORD,
  api, assertOnlyDisposableLedgerData, containerReachable, psql, psqlAt, sessionAt, type OwnerSession
} from "./helpers/local-owner";

// Portable recovery into an empty, separately bound project — PLAN.md § Later
// authorization gates item 3, the gate on importing anything real.
//
// What this proves that `tests/backup-roundtrip.test.ts` cannot. That suite restores
// into the project the snapshot came from, as the owner it came from, so:
//   * every owner and actor id in the payload already exists in that project's
//     `auth.users`, and a restore that carried one through verbatim would still
//     satisfy its foreign keys;
//   * "the destination was empty" is manufactured by deleting rows rather than being
//     a property of the destination;
//   * the RPC is driven through psql with `request.jwt.claims` set by hand.
//
// Here the destination is a different Supabase project (`recovery/supabase/config.toml`)
// bound to a different owner, which has never seen the source's auth users, and both
// sides are driven over HTTP with real aal2 sessions minted by their own GoTrue.
// `restore_backup` does not disable replication triggers, so the destination's foreign
// keys into `auth.users` are live throughout: an actor column that failed to remap
// cannot pass.
//
// Bring the destination up first:
//   node scripts/recovery-destination.mjs up

const DESTINATION_API = "http://127.0.0.1:54331";
const DESTINATION_CONTAINER = "supabase_db_private-ledger-recovery";
const DESTINATION_EMAIL = "recovery.owner@example.invalid";
const DESTINATION_PASSWORD = "local-recovery-login-disabled";
const DESTINATION_OWNER = "22222222-2222-4222-8222-222222222222";
const SOURCE_OWNER = "11111111-1111-4111-8111-111111111111";

// Ids the source rows are inserted under, so cleanup can be exact and can never touch
// the seeded accounts the browser suites depend on.
const ID = (n: number) => `f0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ROW_COUNT = 3;

type Snapshot = { schemaVersion: 2; exportedAt: string; snapshotSequence: string; tableCounts: Record<string, number>; data: Record<string, Record<string, unknown>[]> };

const sourceUp = containerReachable(CONTAINER);
const destinationUp = containerReachable(DESTINATION_CONTAINER);
const ready = sourceUp && destinationUp;

// Both projects present the same publishable key because both use the CLI's default
// local JWT secret; the helper's constant is therefore correct for either base.
async function rpc(base: string, session: OwnerSession, name: string, body: unknown = {}) {
  return api(`/rest/v1/rpc/${name}`, { base, method: "POST", token: session.access_token, body: JSON.stringify(body) });
}

// Gives the source ledger something worth carrying: rows in every one of the eleven
// backup tables, including the only two restored tables that reference `auth.users`
// directly — `audit_events.actor_id` and `overlay_revisions.changed_by`. Those two are
// what a same-project test cannot hold to account, because there the id they carry is a
// real user either way. (`backup_records.confirmed_by` also points at auth.users but is
// not part of a backup, so a restore never carries it.)
function populateSource(): void {
  const result = psql(`
begin;
set local session_replication_role = replica;

insert into public.accounts(id, owner_id, bank_code, label, account_type, last_four, currency, timezone)
values ('${ID(1)}', '${SOURCE_OWNER}', 'KTB', 'Recovery rehearsal account', 'current', '7788', 'THB', 'Asia/Bangkok');

insert into public.categories(id, owner_id, name, archived)
values ('${ID(2)}', '${SOURCE_OWNER}', 'Rehearsal category', false);

insert into public.import_artifacts(id, owner_id, artifact_digest, contract_version)
values ('${ID(3)}', '${SOURCE_OWNER}', repeat('a', 64), 'krungthai-layout-v1');

insert into public.import_batches(id, owner_id, account_id, artifact_id, idempotency_key, payload_digest,
  period_start, period_end, opening_balance_minor, closing_balance_minor, currency)
values ('${ID(4)}', '${SOURCE_OWNER}', '${ID(1)}', '${ID(3)}', '${ID(5)}', repeat('b', 64),
  '2026-01-01', '2026-01-31', 0, ${ROW_COUNT} * 100, 'THB');

insert into public.source_transactions(id, owner_id, account_id, fingerprint_version, fingerprint,
  source_date, source_time, effective_date, transaction_label, description, reference, branch,
  post_balance_minor, currency)
select ('f0000000-0000-4000-8000-1000000000' || lpad(n::text, 2, '0'))::uuid, '${SOURCE_OWNER}', '${ID(1)}',
  'fingerprint-v1', encode(sha256(('rehearsal-' || n)::bytea), 'hex'),
  date '2026-01-01' + n, '09:00', date '2026-01-01' + n,
  'Rehearsal label ' || n, 'Rehearsal description ' || n, 'REF-' || n, 'BR01', n * 100, 'THB'
from generate_series(1, ${ROW_COUNT}) as n;

insert into public.source_components(owner_id, transaction_id, position, kind, amount_minor, currency)
select '${SOURCE_OWNER}', ('f0000000-0000-4000-8000-1000000000' || lpad(n::text, 2, '0'))::uuid, 1, 'deposit', 100, 'THB'
from generate_series(1, ${ROW_COUNT}) as n;

insert into public.import_batch_rows(owner_id, batch_id, transaction_id, source_index, page, row_number, parser_fields, linked_existing)
select '${SOURCE_OWNER}', '${ID(4)}', ('f0000000-0000-4000-8000-1000000000' || lpad(n::text, 2, '0'))::uuid,
  n, 1, n, '{}'::jsonb, false
from generate_series(1, ${ROW_COUNT}) as n;

insert into public.transaction_overlays(transaction_id, owner_id, category_id, description, counterparty,
  effective_date, note, include_in_reporting, revision)
values ('f0000000-0000-4000-8000-100000000001', '${SOURCE_OWNER}', '${ID(2)}', 'Overlaid description',
  'Rehearsal counterparty', '2026-01-02', 'Rehearsal note', true, 1);

-- The snapshot is built the way the overlay RPC builds it — to_jsonb of the whole
-- overlay row — so it embeds the owner id inside jsonb, where no column-level check
-- would ever find it. That is the case the restore's owner_id merge exists for.
insert into public.overlay_revisions(id, owner_id, transaction_id, revision, snapshot, changed_by)
select '${ID(6)}', '${SOURCE_OWNER}', 'f0000000-0000-4000-8000-100000000001', 1, to_jsonb(o), '${SOURCE_OWNER}'
from public.transaction_overlays o where o.transaction_id = 'f0000000-0000-4000-8000-100000000001';

insert into public.audit_events(owner_id, actor_id, event_type, entity_type, entity_id, detail)
values ('${SOURCE_OWNER}', '${SOURCE_OWNER}', 'import.confirmed', 'import_batch', '${ID(4)}',
  jsonb_build_object('row_count', ${ROW_COUNT}));

update public.mutation_sequences set sequence = sequence + 1, updated_at = now() where owner_id = '${SOURCE_OWNER}';
set local session_replication_role = origin;
commit;
`);
  if (!result.ok) throw new Error(`source populate failed: ${result.output}`);
}

// Removes exactly what this suite inserted. The seeded accounts the browser suites bind
// against are matched by neither id pattern, so they survive.
function cleanSource(): void {
  psql(`
begin;
set local session_replication_role = replica;
delete from public.audit_events where owner_id = '${SOURCE_OWNER}' and entity_id = '${ID(4)}';
delete from public.overlay_revisions where id = '${ID(6)}';
delete from public.transaction_overlays where transaction_id::text like 'f0000000-0000-4000-8000-1%';
delete from public.import_batch_rows where batch_id = '${ID(4)}';
delete from public.source_components where transaction_id::text like 'f0000000-0000-4000-8000-1%';
delete from public.source_transactions where id::text like 'f0000000-0000-4000-8000-1%';
delete from public.import_batches where id = '${ID(4)}';
delete from public.import_artifacts where id = '${ID(3)}';
delete from public.categories where id = '${ID(2)}';
delete from public.accounts where id = '${ID(1)}';
set local session_replication_role = origin;
select setval(pg_get_serial_sequence('public.audit_events','id'),
  greatest(coalesce((select max(id) from public.audit_events), 1), 1), true);
commit;
`);
}

// One invented receipt with an item and a discount, for the v8 file: the first version whose
// receipt tables a restore must actually carry rather than find empty. Invented values only.
const RECEIPT_ID = ID(40);
function populateSourceReceipt(): void {
  const result = psql(`
begin;
set local session_replication_role = replica;
insert into public.receipts(id, owner_id, merchant, store_code, branch_name, receipt_number, purchased_on,
  purchased_at_time, payment_method, subtotal_minor, net_minor, unit_count, completeness, sources, items_source, items_complete)
values ('${RECEIPT_ID}', '${SOURCE_OWNER}', '7-eleven', '0001', 'Rehearsal branch', '1', '2026-01-02',
  '09:00', 'Rehearsal wallet', 1200, 1000, 1, 'complete', '{condensed}', 'condensed', true);
insert into public.receipt_items(id, owner_id, receipt_id, line_no, position, quantity, name, unit_price_minor, amount_minor, vat_exempt, is_promotion)
values ('${ID(41)}', '${SOURCE_OWNER}', '${RECEIPT_ID}', 1, 0, 1, 'Rehearsal item', null, 1200, false, false);
insert into public.receipt_discounts(id, owner_id, receipt_id, position, name, amount_minor)
values ('${ID(42)}', '${SOURCE_OWNER}', '${RECEIPT_ID}', 0, null, 200);
update public.mutation_sequences set sequence = sequence + 1, updated_at = now() where owner_id = '${SOURCE_OWNER}';
set local session_replication_role = origin;
commit;
`);
  if (!result.ok) throw new Error(`source receipt populate failed: ${result.output}`);
}

// A stored match decision on that receipt, with its revision — the two v9 tables. Written
// directly rather than through `set_receipt_match`, whose money guard pgTAP already proves; what
// is under test here is only that the rows travel. The revision's snapshot embeds the owner id,
// the case the restore's jsonb rebind exists for.
function populateSourceReceiptMatch(): void {
  const result = psql(`
begin;
set local session_replication_role = replica;
insert into public.receipt_match_overlays(receipt_id, owner_id, decision, transaction_id, revision)
values ('${RECEIPT_ID}', '${SOURCE_OWNER}', 'matched', 'f0000000-0000-4000-8000-100000000001', 1);
insert into public.receipt_match_revisions(id, owner_id, receipt_id, revision, snapshot, changed_by)
select '${ID(43)}', '${SOURCE_OWNER}', '${RECEIPT_ID}', 1, to_jsonb(o), '${SOURCE_OWNER}'
from public.receipt_match_overlays o where o.receipt_id = '${RECEIPT_ID}';
update public.mutation_sequences set sequence = sequence + 1, updated_at = now() where owner_id = '${SOURCE_OWNER}';
set local session_replication_role = origin;
commit;
`);
  if (!result.ok) throw new Error(`source receipt match populate failed: ${result.output}`);
}

// One invented delivery order with a dish and a discount — the three v10 tables. Written directly
// rather than through `capture_delivery`, whose arithmetic pgTAP already proves; what is under test
// here is only that the rows travel. Invented values only.
const DELIVERY_ID = ID(44);
function populateSourceDelivery(): void {
  const result = psql(`
begin;
set local session_replication_role = replica;
insert into public.deliveries(id, owner_id, platform, booking_id, restaurant, payment_method, receipt_sent_at,
  food_minor, delivery_fee_minor, total_minor)
values ('${DELIVERY_ID}', '${SOURCE_OWNER}', 'grabfood', 'A-REHEARSAL01', 'Rehearsal kitchen', 'Rehearsal card',
  '2026-01-02T12:00:00+07:00', 10000, 1500, 9500);
insert into public.delivery_items(id, owner_id, delivery_id, position, quantity, name, options, amount_minor)
values ('${ID(45)}', '${SOURCE_OWNER}', '${DELIVERY_ID}', 1, 1, 'Rehearsal dish', '{Rehearsal option}', 10000);
insert into public.delivery_adjustments(id, owner_id, delivery_id, position, kind, name, amount_minor)
values ('${ID(46)}', '${SOURCE_OWNER}', '${DELIVERY_ID}', 1, 'discount', 'Rehearsal promo', 2000);
update public.mutation_sequences set sequence = sequence + 1, updated_at = now() where owner_id = '${SOURCE_OWNER}';
set local session_replication_role = origin;
commit;
`);
  if (!result.ok) throw new Error(`source delivery populate failed: ${result.output}`);
}

// The owner's link from that order to a ledger row, with its revision — the two v11 tables.
// Written directly for the reason the receipt match above is; the snapshot embeds the owner id.
function populateSourceDeliveryMatch(): void {
  const result = psql(`
begin;
set local session_replication_role = replica;
insert into public.delivery_match_overlays(delivery_id, owner_id, decision, transaction_id, revision)
values ('${DELIVERY_ID}', '${SOURCE_OWNER}', 'matched', 'f0000000-0000-4000-8000-100000000001', 1);
insert into public.delivery_match_revisions(id, owner_id, delivery_id, revision, snapshot, changed_by)
select '${ID(47)}', '${SOURCE_OWNER}', '${DELIVERY_ID}', 1, to_jsonb(o), '${SOURCE_OWNER}'
from public.delivery_match_overlays o where o.delivery_id = '${DELIVERY_ID}';
update public.mutation_sequences set sequence = sequence + 1, updated_at = now() where owner_id = '${SOURCE_OWNER}';
set local session_replication_role = origin;
commit;
`);
  if (!result.ok) throw new Error(`source delivery match populate failed: ${result.output}`);
}

// A ride with a toll and a promo, and the owner's decline of it — the four v12 tables. Written
// directly for the reason the delivery above is; the snapshot embeds the owner id.
const RIDE_ID = ID(48);
function populateSourceRide(): void {
  const result = psql(`
begin;
set local session_replication_role = replica;
insert into public.rides(id, owner_id, booking_id, ride_type, picked_up_at, dropped_off_at, pickup_place, dropoff_place,
  distance_meters, duration_minutes, payment_method, fare_minor, platform_fee_minor, total_minor)
values ('${RIDE_ID}', '${SOURCE_OWNER}', 'A-REHEARSAL02', 'Rehearsal Bike', '2026-01-02T20:05:00+07:00', '2026-01-02T20:22:00+07:00',
  'Rehearsal pickup', 'Rehearsal drop-off', 4200, 17, '0000', 9000, 600, 12600);
insert into public.ride_adjustments(id, owner_id, ride_id, position, kind, name, amount_minor)
values ('${ID(49)}', '${SOURCE_OWNER}', '${RIDE_ID}', 1, 'charge', 'Toll', 5000),
       ('${ID(50)}', '${SOURCE_OWNER}', '${RIDE_ID}', 2, 'discount', 'Promo', 2000);
insert into public.ride_match_overlays(ride_id, owner_id, decision, transaction_id, revision)
values ('${RIDE_ID}', '${SOURCE_OWNER}', 'unmatched', null, 1);
insert into public.ride_match_revisions(id, owner_id, ride_id, revision, snapshot, changed_by)
select '${ID(51)}', '${SOURCE_OWNER}', '${RIDE_ID}', 1, to_jsonb(o), '${SOURCE_OWNER}'
from public.ride_match_overlays o where o.ride_id = '${RIDE_ID}';
update public.mutation_sequences set sequence = sequence + 1, updated_at = now() where owner_id = '${SOURCE_OWNER}';
set local session_replication_role = origin;
commit;
`);
  if (!result.ok) throw new Error(`source ride populate failed: ${result.output}`);
}

function cleanSourceReceipt(): void {
  psql(`
begin;
set local session_replication_role = replica;
delete from public.ride_match_revisions where ride_id = '${RIDE_ID}';
delete from public.ride_match_overlays where ride_id = '${RIDE_ID}';
delete from public.ride_adjustments where ride_id = '${RIDE_ID}';
delete from public.rides where id = '${RIDE_ID}';
delete from public.delivery_match_revisions where delivery_id = '${DELIVERY_ID}';
delete from public.delivery_match_overlays where delivery_id = '${DELIVERY_ID}';
delete from public.delivery_adjustments where delivery_id = '${DELIVERY_ID}';
delete from public.delivery_items where delivery_id = '${DELIVERY_ID}';
delete from public.deliveries where id = '${DELIVERY_ID}';
delete from public.receipt_match_revisions where receipt_id = '${RECEIPT_ID}';
delete from public.receipt_match_overlays where receipt_id = '${RECEIPT_ID}';
delete from public.receipt_discounts where receipt_id = '${RECEIPT_ID}';
delete from public.receipt_items where receipt_id = '${RECEIPT_ID}';
delete from public.receipts where id = '${RECEIPT_ID}';
set local session_replication_role = origin;
commit;
`);
}

// The destination has to start empty for `restore_backup` to accept it at all. That the
// RPC enforces this is proven by pgTAP; clearing here is only what makes the suite
// repeatable, and the last assertion re-establishes that the check is live.
function emptyDestination(): void {
  // Every backup table, not the eleven this file was written against. `restore_backup`
  // refuses a destination that is not empty, and it counts the tables the *destination's*
  // migration knows about — so a leftover row in one of the newer ones fails a later restore
  // at commit, after every chunk has been accepted, with a message about emptiness that says
  // nothing about which table.
  const result = psqlAt(DESTINATION_CONTAINER, `
begin;
set local session_replication_role = replica;
delete from public.restore_chunks; delete from public.restore_runs; delete from public.backup_records;
${BACKUP_TABLE_KINDS.filter((kind) => kind !== "mutation_sequences").map((kind) => `delete from public.${kind};`).join(" ")}
set local session_replication_role = origin;
commit;
`);
  if (!result.ok) throw new Error(`could not empty the destination: ${result.output}`);
}

// GoTrue refuses to enroll a factor at aal1 once the user has a verified one, so a
// leftover factor from an earlier suite makes signing in to aal2 impossible. Clearing
// first is what makes both sides repeatable; the other authenticated suites clear
// theirs in teardown for the same reason.
function clearFactors(container: string, owner: string): void {
  psqlAt(container, `delete from auth.mfa_factors where user_id = '${owner}';`);
}

// Counts every row anywhere in the destination that still carries the source owner —
// across all eleven owner columns, both restored actor columns, and the binding itself.
function sourceOwnerTraces(): number {
  const owned = BACKUP_TABLE_KINDS.map((kind) => `select count(*) as n from public.${kind} where owner_id = '${SOURCE_OWNER}'`);
  const actors = [
    `select count(*) from public.overlay_revisions where changed_by = '${SOURCE_OWNER}'`,
    `select count(*) from public.receipt_match_revisions where changed_by = '${SOURCE_OWNER}'`,
    `select count(*) from public.delivery_match_revisions where changed_by = '${SOURCE_OWNER}'`,
    `select count(*) from public.ride_match_revisions where changed_by = '${SOURCE_OWNER}'`,
    `select count(*) from public.audit_events where actor_id = '${SOURCE_OWNER}'`,
    `select count(*) from public.ledger_owners where owner_id = '${SOURCE_OWNER}'`
  ];
  const result = psqlAt(DESTINATION_CONTAINER, `select coalesce(sum(n), 0) from (${[...owned, ...actors].join(" union all ")}) as traces;`);
  if (!result.ok) throw new Error(`trace query failed: ${result.output}`);
  return Number(result.output.trim());
}

// The tables an older file predates entirely: six for a v4 file (migration 013's five plus
// migration 016's card table), one for a v5 file.
const newerThan = (kinds: readonly string[]) => BACKUP_TABLE_KINDS.filter((kind) => !kinds.includes(kind));
const NEWER_THAN_V4 = newerThan(BACKUP_TABLE_KINDS_V4);
const NEWER_THAN_V5 = newerThan(BACKUP_TABLE_KINDS_V5);
const NEWER_THAN_V6 = newerThan(BACKUP_TABLE_KINDS_V6);
const NEWER_THAN_V7 = newerThan(BACKUP_TABLE_KINDS_V7);
const NEWER_THAN_V8 = newerThan(BACKUP_TABLE_KINDS_V8);
const NEWER_THAN_V9 = newerThan(BACKUP_TABLE_KINDS_V9);
const NEWER_THAN_V10 = newerThan(BACKUP_TABLE_KINDS_V10);
const NEWER_THAN_V11 = newerThan(BACKUP_TABLE_KINDS_V11);

/**
 * Turns a current export into the file an older ledger would have written.
 *
 * **Why this is a genuine artifact of that version and not an approximation of one.** The
 * version kind lists are strictly additive — `restore_backup` builds them by appending, so an
 * older version is the current one minus exactly the tables it predates — and every migration
 * since has altered no column of any table those versions carry; their only `alter table`
 * statements touch the new tables and the `restore_runs` / `restore_chunks` version
 * constraints, neither of which travels in a backup. So dropping the newer keys leaves
 * precisely what the older `export_backup_snapshot` emitted. The alternative was standing up a
 * further local project pinned at each old migration to produce one, which would test the same
 * bytes at considerably more expense.
 *
 * The caller asserts the dropped tables are empty at source first, without which this would be
 * lossy rather than a downgrade.
 */
function downgradeTo(snapshot: Snapshot, schemaVersion: number, kinds: readonly string[]): unknown {
  const data: Record<string, unknown> = {};
  const tableCounts: Record<string, number> = {};
  for (const kind of kinds) {
    data[kind] = snapshot.data[kind];
    tableCounts[kind] = snapshot.tableCounts[kind]!;
  }
  return {
    schemaVersion,
    exportedAt: snapshot.exportedAt,
    snapshotSequence: snapshot.snapshotSequence,
    tableCounts,
    data
  };
}

describe.skipIf(!ready)("portable recovery into an empty separately bound project", () => {
  it("carries a ledger across projects and rebinds every owner and actor", async () => {
    // This suite exports the *whole* source ledger and restores it into the destination
    // project, so an unrecognised account here would be copied into a second database as
    // well as read. Both are local, but a real ledger should not spread by running a test.
    assertOnlyDisposableLedgerData([ID(1)]);

    clearFactors(CONTAINER, SOURCE_OWNER);
    clearFactors(DESTINATION_CONTAINER, DESTINATION_OWNER);
    const sourceSession = await sessionAt(API, OWNER_EMAIL, OWNER_PASSWORD);
    const destinationSession = await sessionAt(DESTINATION_API, DESTINATION_EMAIL, DESTINATION_PASSWORD);

    emptyDestination();
    expect(sourceOwnerTraces(), "the destination must not already hold source-owned rows").toBe(0);

    try {
      populateSource();

      // Export over HTTP with a real aal2 token, exactly as the app's own export route does.
      const exported = await rpc(API, sourceSession, "export_backup_snapshot");
      expect(exported.status, exported.body).toBe(200);
      const snapshot = exported.json() as Snapshot;

      const validated = backupSnapshotSchema.safeParse(snapshot);
      expect(validated.success, JSON.stringify(validated.error?.issues?.slice(0, 3))).toBe(true);
      expect(snapshot.tableCounts.source_transactions).toBeGreaterThanOrEqual(ROW_COUNT);
      expect(snapshot.data.overlay_revisions).toHaveLength(1);
      expect(snapshot.data.audit_events?.length ?? 0).toBeGreaterThanOrEqual(1);

      // The artifact travels as an encrypted file, which is the only form it ever has
      // outside a session.
      const envelope = await encryptBackup(snapshot, "recovery rehearsal passphrase 2026");
      const carried = await decryptBackup(envelope, "recovery rehearsal passphrase 2026") as Snapshot;
      expect(canonicalJson(carried)).toBe(canonicalJson(snapshot));

      const plan = await buildRestorePlan(carried);
      const staged = await rpc(DESTINATION_API, destinationSession, "restore_backup", { p_action: "stage", p_request: plan.stage });
      expect(staged.status, staged.body).toBe(200);
      for (const chunk of plan.chunks) {
        const sent = await rpc(DESTINATION_API, destinationSession, "restore_backup", { p_action: "chunk", p_request: chunk });
        expect(sent.status, `chunk ${chunk.chunk.kind}: ${sent.body}`).toBe(200);
      }
      const committed = await rpc(DESTINATION_API, destinationSession, "restore_backup", { p_action: "commit", p_request: plan.commit });
      expect(committed.status, committed.body).toBe(200);

      // Nothing may still belong to the owner this ledger came from.
      expect(sourceOwnerTraces(), "the source owner must not survive anywhere in the destination").toBe(0);

      // Including inside jsonb. An overlay revision snapshot embeds the whole overlay
      // row, owner id and all, so a restore that only rewrote columns would leave the
      // previous owner's id sitting in a payload no foreign key or column check reaches.
      const embedded = psqlAt(DESTINATION_CONTAINER, `select count(*) from public.overlay_revisions where snapshot::text like '%${SOURCE_OWNER}%';`);
      expect(embedded.ok && embedded.output.trim(), "no jsonb snapshot may still carry the source owner").toBe("0");

      // And the ledger itself must have arrived whole: a re-export from the destination
      // is the source snapshot with every occurrence of one owner id replaced by the
      // other. Mutation sequences legitimately advance across a restore.
      const reExported = await rpc(DESTINATION_API, destinationSession, "export_backup_snapshot");
      expect(reExported.status, reExported.body).toBe(200);
      const landed = reExported.json() as Snapshot;

      expect(landed.tableCounts).toEqual(snapshot.tableCounts);
      // Compared table by table so a mismatch names the table rather than producing one
      // unreadable string. mutation_sequences is excluded: a restore legitimately
      // advances it.
      for (const kind of BACKUP_TABLE_KINDS.filter((table) => table !== "mutation_sequences")) {
        const rebound = canonicalJson(snapshot.data[kind]).split(SOURCE_OWNER).join(DESTINATION_OWNER);
        expect(canonicalJson(landed.data[kind]), `${kind} did not arrive intact`).toBe(rebound);
      }

      // The destination is no longer empty, so a second recovery into it must be refused
      // — the check that makes this a restore into a fresh project rather than an
      // overwrite of a live one. It is enforced at commit, after all eleven chunks have
      // been accepted, so the whole sequence has to be replayed to reach it; asserting on
      // the reason rather than merely on failure is what keeps this from passing because
      // of some unrelated rejection.
      const second = await buildRestorePlan(carried);
      const replay = [
        await rpc(DESTINATION_API, destinationSession, "restore_backup", { p_action: "stage", p_request: second.stage })
      ];
      for (const chunk of second.chunks) {
        replay.push(await rpc(DESTINATION_API, destinationSession, "restore_backup", { p_action: "chunk", p_request: chunk }));
      }
      replay.push(await rpc(DESTINATION_API, destinationSession, "restore_backup", { p_action: "commit", p_request: second.commit }));

      expect(replay.at(-1)?.status, "a second restore into a populated destination must not commit").not.toBe(200);
      expect(replay.map((step) => step.body).join(" ")).toMatch(/not empty/iu);
    } finally {
      cleanSource();
      clearFactors(CONTAINER, SOURCE_OWNER);
      clearFactors(DESTINATION_CONTAINER, DESTINATION_OWNER);
    }
  }, 180_000);

  // The version pair hosting actually depends on, and the one nothing exercised until now.
  //
  // `PLAN.md` task 19 moves this ledger by **restoring its encrypted backup into the hosted
  // project** rather than reimporting the statements (D-083). The hosted project takes its
  // migrations from this repository, so it starts on 014 and writes v5 — while
  // `private-ledger-live` is still on 012 and therefore writes **v4**. That makes the first
  // act of hosting a v4-into-v5 restore.
  //
  // What already existed was weaker than it looks. `tests/backup.test.ts` checks that the
  // client's zod schemas accept a v4 manifest and refuse mismatched pairs — the *client*
  // contract, never the database. pgTAP's restore contracts exercise schemaVersion 2 only.
  // D-078 restored a real v3 file into a v4 ledger, which proved the mechanism but is a
  // different pair, was operational rather than a suite row, and cannot be re-run without the
  // owner's password. So "v2, v3, v4 and v5 all stay restorable" (SPEC gate 6) held for v4
  // by construction and by nothing else.
  //
  // Note what this does *not* need: any access to the live ledger. The version being
  // rehearsed is a property of the file format, not of the data, so synthetic rows through
  // the real export, the real plan builder and the real RPC answer the question exactly.
  it("restores a v4 file into the current ledger, whatever version that now is", async () => {
    assertOnlyDisposableLedgerData([ID(1)]);

    clearFactors(CONTAINER, SOURCE_OWNER);
    clearFactors(DESTINATION_CONTAINER, DESTINATION_OWNER);
    const sourceSession = await sessionAt(API, OWNER_EMAIL, OWNER_PASSWORD);
    const destinationSession = await sessionAt(DESTINATION_API, DESTINATION_EMAIL, DESTINATION_PASSWORD);

    emptyDestination();
    expect(sourceOwnerTraces(), "the destination must not already hold source-owned rows").toBe(0);

    try {
      populateSource();

      const exported = await rpc(API, sourceSession, "export_backup_snapshot");
      expect(exported.status, exported.body).toBe(200);
      const current = exported.json() as Snapshot;
      expect(current.schemaVersion, "the source is on the newest migration and must write the newest version").toBe(BACKUP_SCHEMA_VERSION);

      // Without this the "downgrade" would be silently dropping rows, and every assertion
      // below would pass while testing a file no ledger could ever have produced.
      for (const kind of NEWER_THAN_V4) {
        expect(current.tableCounts[kind], `${kind} must be empty for the downgrade to be lossless`).toBe(0);
      }

      const v4 = downgradeTo(current, 4, BACKUP_TABLE_KINDS_V4);
      const validated = backupSnapshotSchemaV4.safeParse(v4);
      expect(validated.success, JSON.stringify(validated.error?.issues?.slice(0, 3))).toBe(true);

      // Encrypted and decrypted like any other artifact — a file restored during a migration
      // to hosting is one that has been sitting on disk, not one handed straight over.
      const envelope = await encryptBackup(v4, "v4 into v5 rehearsal passphrase 2026");
      const carried = await decryptBackup(envelope, "v4 into v5 rehearsal passphrase 2026");
      expect(canonicalJson(carried)).toBe(canonicalJson(v4));

      const plan = await buildRestorePlan(carried);
      // Planned from the file's own declared version, not from this build's newest list.
      expect(plan.stage.schemaVersion).toBe(4);
      expect(plan.chunks).toHaveLength(BACKUP_TABLE_KINDS_V4.length);
      expect(plan.chunks.map((chunk) => chunk.chunk.kind)).toEqual([...BACKUP_TABLE_KINDS_V4]);

      const staged = await rpc(DESTINATION_API, destinationSession, "restore_backup", { p_action: "stage", p_request: plan.stage });
      expect(staged.status, staged.body).toBe(200);
      for (const chunk of plan.chunks) {
        const sent = await rpc(DESTINATION_API, destinationSession, "restore_backup", { p_action: "chunk", p_request: chunk });
        expect(sent.status, `chunk ${chunk.chunk.kind}: ${sent.body}`).toBe(200);
      }
      const committed = await rpc(DESTINATION_API, destinationSession, "restore_backup", { p_action: "commit", p_request: plan.commit });
      expect(committed.status, committed.body).toBe(200);

      // Rebinding is not weakened by the version gap.
      expect(sourceOwnerTraces(), "the source owner must not survive a cross-version restore either").toBe(0);

      // The six tables the file predates exist in the destination and stay empty. A restore
      // that applied the newest kind list leniently would have had to invent rows for them.
      const untouched = psqlAt(
        DESTINATION_CONTAINER,
        `select ${NEWER_THAN_V4.map((kind) => `(select count(*) from public.${kind})`).join(" + ")};`
      );
      expect(untouched.ok && untouched.output.trim(), "a v4 file must leave the newer tables empty").toBe("0");

      // The payoff: the ledger is now readable as the current version. This is the state
      // hosting ended in — an older file in, the current contract out, with everything rebound.
      const reExported = await rpc(DESTINATION_API, destinationSession, "export_backup_snapshot");
      expect(reExported.status, reExported.body).toBe(200);
      const landed = reExported.json() as Snapshot;
      expect(landed.schemaVersion, "the destination writes its own version, not the file's").toBe(BACKUP_SCHEMA_VERSION);
      expect(backupSnapshotSchema.safeParse(landed).success).toBe(true);

      for (const kind of BACKUP_TABLE_KINDS_V4.filter((table) => table !== "mutation_sequences")) {
        const rebound = canonicalJson((v4 as Snapshot).data[kind]).split(SOURCE_OWNER).join(DESTINATION_OWNER);
        expect(canonicalJson(landed.data[kind]), `${kind} did not survive the version change`).toBe(rebound);
      }
      for (const kind of NEWER_THAN_V4) {
        expect(landed.tableCounts[kind], `${kind} must be present and empty in the re-export`).toBe(0);
      }
    } finally {
      cleanSource();
      clearFactors(CONTAINER, SOURCE_OWNER);
      clearFactors(DESTINATION_CONTAINER, DESTINATION_OWNER);
    }
  }, 180_000);

  // The pair the *next* restore of this ledger will use, proven the way D-089 proved the last
  // one — before anything depends on it rather than after.
  //
  // The ledger now lives in the hosted Supabase project (D-094) and the newest file the owner
  // holds was taken from it at **v5**. Migration 016 takes that project to **v6** the moment it
  // is pushed there. So the first restore after this migration — a recovery, a second region,
  // a move — is a v5 file into a v6 ledger, and until this test existed that pair had never
  // run: `tests/backup.test.ts` checks only the client's zod schemas, and pgTAP's restore
  // contracts exercise schemaVersion 2 alone.
  //
  // Note what it does *not* need: any access to the hosted ledger. The version being rehearsed
  // is a property of the file format rather than of the data, so synthetic rows through the
  // real export, the real plan builder and the real RPC answer the question exactly.
  it("restores a v5 file into the current ledger, which is what the hosted project still writes", async () => {
    assertOnlyDisposableLedgerData([ID(1)]);

    clearFactors(CONTAINER, SOURCE_OWNER);
    clearFactors(DESTINATION_CONTAINER, DESTINATION_OWNER);
    const sourceSession = await sessionAt(API, OWNER_EMAIL, OWNER_PASSWORD);
    const destinationSession = await sessionAt(DESTINATION_API, DESTINATION_EMAIL, DESTINATION_PASSWORD);

    emptyDestination();
    expect(sourceOwnerTraces(), "the destination must not already hold source-owned rows").toBe(0);

    try {
      populateSource();

      const exported = await rpc(API, sourceSession, "export_backup_snapshot");
      expect(exported.status, exported.body).toBe(200);
      const current = exported.json() as Snapshot;
      expect(current.schemaVersion, "the source is on the newest migration and must write the newest version").toBe(BACKUP_SCHEMA_VERSION);

      for (const kind of NEWER_THAN_V5) {
        expect(current.tableCounts[kind], `${kind} must be empty for the downgrade to be lossless`).toBe(0);
      }

      const v5 = downgradeTo(current, 5, BACKUP_TABLE_KINDS_V5);
      const validated = backupSnapshotSchemaV5.safeParse(v5);
      expect(validated.success, JSON.stringify(validated.error?.issues?.slice(0, 3))).toBe(true);

      const envelope = await encryptBackup(v5, "v5 into v6 rehearsal passphrase 2026");
      const carried = await decryptBackup(envelope, "v5 into v6 rehearsal passphrase 2026");
      expect(canonicalJson(carried)).toBe(canonicalJson(v5));

      const plan = await buildRestorePlan(carried);
      // Planned from the file's own declared version, not from this build's newest list.
      expect(plan.stage.schemaVersion).toBe(5);
      expect(plan.chunks).toHaveLength(BACKUP_TABLE_KINDS_V5.length);
      expect(plan.chunks.map((chunk) => chunk.chunk.kind)).toEqual([...BACKUP_TABLE_KINDS_V5]);

      const staged = await rpc(DESTINATION_API, destinationSession, "restore_backup", { p_action: "stage", p_request: plan.stage });
      expect(staged.status, staged.body).toBe(200);
      for (const chunk of plan.chunks) {
        const sent = await rpc(DESTINATION_API, destinationSession, "restore_backup", { p_action: "chunk", p_request: chunk });
        expect(sent.status, `chunk ${chunk.chunk.kind}: ${sent.body}`).toBe(200);
      }
      const committed = await rpc(DESTINATION_API, destinationSession, "restore_backup", { p_action: "commit", p_request: plan.commit });
      expect(committed.status, committed.body).toBe(200);

      expect(sourceOwnerTraces(), "the source owner must not survive a cross-version restore either").toBe(0);

      const untouched = psqlAt(
        DESTINATION_CONTAINER,
        `select ${NEWER_THAN_V5.map((kind) => `(select count(*) from public.${kind})`).join(" + ")};`
      );
      expect(untouched.ok && untouched.output.trim(), "a v5 file must leave the card table empty").toBe("0");

      const reExported = await rpc(DESTINATION_API, destinationSession, "export_backup_snapshot");
      expect(reExported.status, reExported.body).toBe(200);
      const landed = reExported.json() as Snapshot;
      expect(landed.schemaVersion, "the destination writes its own version, not the file's").toBe(BACKUP_SCHEMA_VERSION);
      expect(backupSnapshotSchema.safeParse(landed).success).toBe(true);

      for (const kind of BACKUP_TABLE_KINDS_V5.filter((table) => table !== "mutation_sequences")) {
        const rebound = canonicalJson((v5 as Snapshot).data[kind]).split(SOURCE_OWNER).join(DESTINATION_OWNER);
        expect(canonicalJson(landed.data[kind]), `${kind} did not survive the version change`).toBe(rebound);
      }
      for (const kind of NEWER_THAN_V5) {
        expect(landed.tableCounts[kind], `${kind} must be present and empty in the re-export`).toBe(0);
      }
    } finally {
      cleanSource();
      clearFactors(CONTAINER, SOURCE_OWNER);
      clearFactors(DESTINATION_CONTAINER, DESTINATION_OWNER);
    }
  }, 180_000);

  // **Why these three name a file version and not a destination version.** Each of them restores
  // into whatever the newest migration writes, so a title naming the destination goes stale at
  // the next version bump while the assertions underneath are quietly updated — which is exactly
  // what happened to the two above when migration 017 landed: they still said "into a v5 ledger"
  // and "into a v6 ledger" while both were restoring into a v7 one. A reader checking whether
  // their own file restores would have read the wrong answer. The file version is the fact being
  // tested and it is stable; the destination is `BACKUP_SCHEMA_VERSION` and is asserted as such.
  //
  // The pair the next restore of this ledger will use, proven before anything depends on it —
  // the same argument D-089 made one version earlier and D-098 made the version after that.
  //
  // The owner's newest file was taken from the hosted project, which is on **015** and writes
  // **v6** once migration 016 reaches it. Migration 017 takes a project to **v7**. So the first
  // restore after this migration is a v6 file into a v7 ledger, and until this test existed that
  // pair had never run: `tests/backup.test.ts` checks only the client's zod schemas, and pgTAP's
  // restore contracts exercise schemaVersion 2 alone.
  //
  // This is also the first version pair whose older side carries a **card**, since v6 is the
  // first version that has one — so the downgrade is lossless only because the four tables 017
  // adds are empty, which is asserted rather than assumed.
  it("restores a v6 file into the current ledger, which is what the hosted project writes once 016 lands", async () => {
    assertOnlyDisposableLedgerData([ID(1)]);

    clearFactors(CONTAINER, SOURCE_OWNER);
    clearFactors(DESTINATION_CONTAINER, DESTINATION_OWNER);
    const sourceSession = await sessionAt(API, OWNER_EMAIL, OWNER_PASSWORD);
    const destinationSession = await sessionAt(DESTINATION_API, DESTINATION_EMAIL, DESTINATION_PASSWORD);

    emptyDestination();
    expect(sourceOwnerTraces(), "the destination must not already hold source-owned rows").toBe(0);

    try {
      populateSource();

      const exported = await rpc(API, sourceSession, "export_backup_snapshot");
      expect(exported.status, exported.body).toBe(200);
      const current = exported.json() as Snapshot;
      expect(current.schemaVersion, "the source is on the newest migration and must write the newest version").toBe(BACKUP_SCHEMA_VERSION);

      for (const kind of NEWER_THAN_V6) {
        expect(current.tableCounts[kind], `${kind} must be empty for the downgrade to be lossless`).toBe(0);
      }

      const v6 = downgradeTo(current, 6, BACKUP_TABLE_KINDS_V6);
      const validated = backupSnapshotSchemaV6.safeParse(v6);
      expect(validated.success, JSON.stringify(validated.error?.issues?.slice(0, 3))).toBe(true);

      const envelope = await encryptBackup(v6, "v6 into v7 rehearsal passphrase 2026");
      const carried = await decryptBackup(envelope, "v6 into v7 rehearsal passphrase 2026");
      expect(canonicalJson(carried)).toBe(canonicalJson(v6));

      const plan = await buildRestorePlan(carried);
      // Planned from the file's own declared version, not from this build's newest list.
      expect(plan.stage.schemaVersion).toBe(6);
      expect(plan.chunks).toHaveLength(BACKUP_TABLE_KINDS_V6.length);
      expect(plan.chunks.map((chunk) => chunk.chunk.kind)).toEqual([...BACKUP_TABLE_KINDS_V6]);

      const staged = await rpc(DESTINATION_API, destinationSession, "restore_backup", { p_action: "stage", p_request: plan.stage });
      expect(staged.status, staged.body).toBe(200);
      for (const chunk of plan.chunks) {
        const sent = await rpc(DESTINATION_API, destinationSession, "restore_backup", { p_action: "chunk", p_request: chunk });
        expect(sent.status, `chunk ${chunk.chunk.kind}: ${sent.body}`).toBe(200);
      }
      const committed = await rpc(DESTINATION_API, destinationSession, "restore_backup", { p_action: "commit", p_request: plan.commit });
      expect(committed.status, committed.body).toBe(200);

      expect(sourceOwnerTraces(), "the source owner must not survive a cross-version restore either").toBe(0);

      const untouched = psqlAt(
        DESTINATION_CONTAINER,
        `select ${NEWER_THAN_V6.map((kind) => `(select count(*) from public.${kind})`).join(" + ")};`
      );
      expect(untouched.ok && untouched.output.trim(), "a v6 file must leave the correction and decision tables empty").toBe("0");

      const reExported = await rpc(DESTINATION_API, destinationSession, "export_backup_snapshot");
      expect(reExported.status, reExported.body).toBe(200);
      const landed = reExported.json() as Snapshot;
      expect(landed.schemaVersion, "the destination writes its own version, not the file's").toBe(BACKUP_SCHEMA_VERSION);
      expect(backupSnapshotSchema.safeParse(landed).success).toBe(true);

      for (const kind of BACKUP_TABLE_KINDS_V6.filter((table) => table !== "mutation_sequences")) {
        const rebound = canonicalJson((v6 as Snapshot).data[kind]).split(SOURCE_OWNER).join(DESTINATION_OWNER);
        expect(canonicalJson(landed.data[kind]), `${kind} did not survive the version change`).toBe(rebound);
      }
      for (const kind of NEWER_THAN_V6) {
        expect(landed.tableCounts[kind], `${kind} must be present and empty in the re-export`).toBe(0);
      }
    } finally {
      cleanSource();
      clearFactors(CONTAINER, SOURCE_OWNER);
      clearFactors(DESTINATION_CONTAINER, DESTINATION_OWNER);
    }
  }, 180_000);

  // The owner's newest file was taken from the hosted project, which is on **017** and writes
  // **v7**. Migration 028 takes a project to **v8**. So the first restore after this migration
  // is a v7 file into a v8 ledger, and until this test existed that pair had never run — the
  // same gap the v6-into-v7 test above closed one version earlier.
  //
  // This is also the first version pair whose older side predates the three receipt tables,
  // since v7 is the newest version that has none — so the downgrade is lossless only because
  // those three tables are empty at source, which is asserted rather than assumed.
  it("restores a v7 file into the current ledger, which is what the hosted project writes once 027/028 land", async () => {
    assertOnlyDisposableLedgerData([ID(1)]);

    clearFactors(CONTAINER, SOURCE_OWNER);
    clearFactors(DESTINATION_CONTAINER, DESTINATION_OWNER);
    const sourceSession = await sessionAt(API, OWNER_EMAIL, OWNER_PASSWORD);
    const destinationSession = await sessionAt(DESTINATION_API, DESTINATION_EMAIL, DESTINATION_PASSWORD);

    emptyDestination();
    expect(sourceOwnerTraces(), "the destination must not already hold source-owned rows").toBe(0);

    try {
      populateSource();

      const exported = await rpc(API, sourceSession, "export_backup_snapshot");
      expect(exported.status, exported.body).toBe(200);
      const current = exported.json() as Snapshot;
      expect(current.schemaVersion, "the source is on the newest migration and must write the newest version").toBe(BACKUP_SCHEMA_VERSION);

      for (const kind of NEWER_THAN_V7) {
        expect(current.tableCounts[kind], `${kind} must be empty for the downgrade to be lossless`).toBe(0);
      }

      const v7 = downgradeTo(current, 7, BACKUP_TABLE_KINDS_V7);
      const validated = backupSnapshotSchemaV7.safeParse(v7);
      expect(validated.success, JSON.stringify(validated.error?.issues?.slice(0, 3))).toBe(true);

      const envelope = await encryptBackup(v7, "v7 into v8 rehearsal passphrase 2026");
      const carried = await decryptBackup(envelope, "v7 into v8 rehearsal passphrase 2026");
      expect(canonicalJson(carried)).toBe(canonicalJson(v7));

      const plan = await buildRestorePlan(carried);
      // Planned from the file's own declared version, not from this build's newest list.
      expect(plan.stage.schemaVersion).toBe(7);
      expect(plan.chunks).toHaveLength(BACKUP_TABLE_KINDS_V7.length);
      expect(plan.chunks.map((chunk) => chunk.chunk.kind)).toEqual([...BACKUP_TABLE_KINDS_V7]);

      const staged = await rpc(DESTINATION_API, destinationSession, "restore_backup", { p_action: "stage", p_request: plan.stage });
      expect(staged.status, staged.body).toBe(200);
      for (const chunk of plan.chunks) {
        const sent = await rpc(DESTINATION_API, destinationSession, "restore_backup", { p_action: "chunk", p_request: chunk });
        expect(sent.status, `chunk ${chunk.chunk.kind}: ${sent.body}`).toBe(200);
      }
      const committed = await rpc(DESTINATION_API, destinationSession, "restore_backup", { p_action: "commit", p_request: plan.commit });
      expect(committed.status, committed.body).toBe(200);

      expect(sourceOwnerTraces(), "the source owner must not survive a cross-version restore either").toBe(0);

      const untouched = psqlAt(
        DESTINATION_CONTAINER,
        `select ${NEWER_THAN_V7.map((kind) => `(select count(*) from public.${kind})`).join(" + ")};`
      );
      expect(untouched.ok && untouched.output.trim(), "a v7 file must leave the three receipt tables empty").toBe("0");

      const reExported = await rpc(DESTINATION_API, destinationSession, "export_backup_snapshot");
      expect(reExported.status, reExported.body).toBe(200);
      const landed = reExported.json() as Snapshot;
      expect(landed.schemaVersion, "the destination writes its own version, not the file's").toBe(BACKUP_SCHEMA_VERSION);
      expect(backupSnapshotSchema.safeParse(landed).success).toBe(true);

      for (const kind of BACKUP_TABLE_KINDS_V7.filter((table) => table !== "mutation_sequences")) {
        const rebound = canonicalJson((v7 as Snapshot).data[kind]).split(SOURCE_OWNER).join(DESTINATION_OWNER);
        expect(canonicalJson(landed.data[kind]), `${kind} did not survive the version change`).toBe(rebound);
      }
      for (const kind of NEWER_THAN_V7) {
        expect(landed.tableCounts[kind], `${kind} must be present and empty in the re-export`).toBe(0);
      }
    } finally {
      cleanSource();
      clearFactors(CONTAINER, SOURCE_OWNER);
      clearFactors(DESTINATION_CONTAINER, DESTINATION_OWNER);
    }
  }, 180_000);

  // The hosted project is on **029** and writes **v8**, and its receipt tables hold the owner's
  // real receipts. Migration 030 takes a project to **v9**. So the first restore after it is a
  // v8 file into a v9 ledger — and unlike the pairs above, the older side's newest tables are
  // **not** empty: a receipt, an item and a discount travel, so this proves the receipt rows
  // themselves restore, not only that their absence does. The two match tables v8 predates are
  // empty at source, which is what makes the downgrade lossless, and that is asserted.
  it("restores a v8 file carrying a receipt into the current ledger, which is what the hosted project writes once 030 lands", async () => {
    assertOnlyDisposableLedgerData([ID(1)]);

    clearFactors(CONTAINER, SOURCE_OWNER);
    clearFactors(DESTINATION_CONTAINER, DESTINATION_OWNER);
    const sourceSession = await sessionAt(API, OWNER_EMAIL, OWNER_PASSWORD);
    const destinationSession = await sessionAt(DESTINATION_API, DESTINATION_EMAIL, DESTINATION_PASSWORD);

    emptyDestination();
    expect(sourceOwnerTraces(), "the destination must not already hold source-owned rows").toBe(0);

    try {
      populateSource();
      populateSourceReceipt();

      const exported = await rpc(API, sourceSession, "export_backup_snapshot");
      expect(exported.status, exported.body).toBe(200);
      const current = exported.json() as Snapshot;
      expect(current.schemaVersion, "the source is on the newest migration and must write the newest version").toBe(BACKUP_SCHEMA_VERSION);

      for (const kind of NEWER_THAN_V8) {
        expect(current.tableCounts[kind], `${kind} must be empty for the downgrade to be lossless`).toBe(0);
      }

      const v8 = downgradeTo(current, 8, BACKUP_TABLE_KINDS_V8);
      const validated = backupSnapshotSchemaV8.safeParse(v8);
      expect(validated.success, JSON.stringify(validated.error?.issues?.slice(0, 3))).toBe(true);

      const envelope = await encryptBackup(v8, "v8 into v9 rehearsal passphrase 2026");
      const carried = await decryptBackup(envelope, "v8 into v9 rehearsal passphrase 2026");
      expect(canonicalJson(carried)).toBe(canonicalJson(v8));

      const plan = await buildRestorePlan(carried);
      // Planned from the file's own declared version, not from this build's newest list.
      expect(plan.stage.schemaVersion).toBe(8);
      expect(plan.chunks).toHaveLength(BACKUP_TABLE_KINDS_V8.length);
      expect(plan.chunks.map((chunk) => chunk.chunk.kind)).toEqual([...BACKUP_TABLE_KINDS_V8]);

      const staged = await rpc(DESTINATION_API, destinationSession, "restore_backup", { p_action: "stage", p_request: plan.stage });
      expect(staged.status, staged.body).toBe(200);
      for (const chunk of plan.chunks) {
        const sent = await rpc(DESTINATION_API, destinationSession, "restore_backup", { p_action: "chunk", p_request: chunk });
        expect(sent.status, `chunk ${chunk.chunk.kind}: ${sent.body}`).toBe(200);
      }
      const committed = await rpc(DESTINATION_API, destinationSession, "restore_backup", { p_action: "commit", p_request: plan.commit });
      expect(committed.status, committed.body).toBe(200);

      expect(sourceOwnerTraces(), "the source owner must not survive a cross-version restore either").toBe(0);

      const untouched = psqlAt(
        DESTINATION_CONTAINER,
        `select ${NEWER_THAN_V8.map((kind) => `(select count(*) from public.${kind})`).join(" + ")};`
      );
      expect(untouched.ok && untouched.output.trim(), "a v8 file must leave every newer table empty").toBe("0");

      const reExported = await rpc(DESTINATION_API, destinationSession, "export_backup_snapshot");
      expect(reExported.status, reExported.body).toBe(200);
      const landed = reExported.json() as Snapshot;
      expect(landed.schemaVersion, "the destination writes its own version, not the file's").toBe(BACKUP_SCHEMA_VERSION);
      expect(backupSnapshotSchema.safeParse(landed).success).toBe(true);

      for (const kind of BACKUP_TABLE_KINDS_V8.filter((table) => table !== "mutation_sequences")) {
        const rebound = canonicalJson((v8 as Snapshot).data[kind]).split(SOURCE_OWNER).join(DESTINATION_OWNER);
        expect(canonicalJson(landed.data[kind]), `${kind} did not survive the version change`).toBe(rebound);
      }
      for (const kind of NEWER_THAN_V8) {
        expect(landed.tableCounts[kind], `${kind} must be present and empty in the re-export`).toBe(0);
      }
      expect(landed.tableCounts.receipts, "the receipt must have travelled, not merely its empty table").toBe(1);
      expect(landed.tableCounts.receipt_items).toBe(1);
      expect(landed.tableCounts.receipt_discounts).toBe(1);
    } finally {
      cleanSourceReceipt();
      cleanSource();
      clearFactors(CONTAINER, SOURCE_OWNER);
      clearFactors(DESTINATION_CONTAINER, DESTINATION_OWNER);
    }
  }, 180_000);

  // v9's own two tables, carried at v9: a receipt linked to a ledger row, and the revision that
  // recorded it. The v8 test above proves the receipt rows travel; this proves the decision does,
  // with its owner rebound inside the snapshot jsonb as well as in its columns.
  it("carries a receipt's match decision, a matched delivery order and a declined ride across projects at the current version", async () => {
    assertOnlyDisposableLedgerData([ID(1)]);

    clearFactors(CONTAINER, SOURCE_OWNER);
    clearFactors(DESTINATION_CONTAINER, DESTINATION_OWNER);
    const sourceSession = await sessionAt(API, OWNER_EMAIL, OWNER_PASSWORD);
    const destinationSession = await sessionAt(DESTINATION_API, DESTINATION_EMAIL, DESTINATION_PASSWORD);

    emptyDestination();
    expect(sourceOwnerTraces(), "the destination must not already hold source-owned rows").toBe(0);

    try {
      populateSource();
      populateSourceReceipt();
      populateSourceReceiptMatch();
      populateSourceDelivery();
      populateSourceDeliveryMatch();
      populateSourceRide();

      const exported = await rpc(API, sourceSession, "export_backup_snapshot");
      expect(exported.status, exported.body).toBe(200);
      const current = exported.json() as Snapshot;
      expect(current.schemaVersion).toBe(BACKUP_SCHEMA_VERSION);
      expect(current.tableCounts.receipt_match_overlays).toBe(1);
      expect(current.tableCounts.receipt_match_revisions).toBe(1);

      const envelope = await encryptBackup(current, "v9 receipt match rehearsal passphrase 2026");
      const carried = await decryptBackup(envelope, "v9 receipt match rehearsal passphrase 2026");
      const plan = await buildRestorePlan(carried);
      expect(plan.chunks.map((chunk) => chunk.chunk.kind)).toEqual([...BACKUP_TABLE_KINDS]);

      const staged = await rpc(DESTINATION_API, destinationSession, "restore_backup", { p_action: "stage", p_request: plan.stage });
      expect(staged.status, staged.body).toBe(200);
      for (const chunk of plan.chunks) {
        const sent = await rpc(DESTINATION_API, destinationSession, "restore_backup", { p_action: "chunk", p_request: chunk });
        expect(sent.status, `chunk ${chunk.chunk.kind}: ${sent.body}`).toBe(200);
      }
      const committed = await rpc(DESTINATION_API, destinationSession, "restore_backup", { p_action: "commit", p_request: plan.commit });
      expect(committed.status, committed.body).toBe(200);

      expect(sourceOwnerTraces(), "the source owner must not survive, not even inside a match snapshot").toBe(0);

      const reExported = await rpc(DESTINATION_API, destinationSession, "export_backup_snapshot");
      expect(reExported.status, reExported.body).toBe(200);
      const landed = reExported.json() as Snapshot;
      expect(current.tableCounts.deliveries).toBe(1);
      expect(current.tableCounts.delivery_match_revisions).toBe(1);
      expect(current.tableCounts.ride_match_revisions).toBe(1);
      for (const kind of ["receipts", "receipt_match_overlays", "receipt_match_revisions", "deliveries", "delivery_items",
        "delivery_adjustments", "delivery_match_overlays", "delivery_match_revisions",
        "rides", "ride_adjustments", "ride_match_overlays", "ride_match_revisions"] as const) {
        const rebound = canonicalJson(current.data[kind]).split(SOURCE_OWNER).join(DESTINATION_OWNER);
        expect(canonicalJson(landed.data[kind]), `${kind} did not survive the restore`).toBe(rebound);
      }
    } finally {
      cleanSourceReceipt();
      cleanSource();
      clearFactors(CONTAINER, SOURCE_OWNER);
      clearFactors(DESTINATION_CONTAINER, DESTINATION_OWNER);
    }
  }, 180_000);

  // A v9 file — the version the owner's hosted backups are written at until migration 032 lands —
  // restored into a v10 destination. Same method as the v8 test: a genuine v9 artifact made by
  // dropping the tables v9 predates, which must be empty for that to be lossless.
  it("restores a v9 file into a v10 destination, leaving the delivery tables empty", async () => {
    assertOnlyDisposableLedgerData([ID(1)]);

    clearFactors(CONTAINER, SOURCE_OWNER);
    clearFactors(DESTINATION_CONTAINER, DESTINATION_OWNER);
    const sourceSession = await sessionAt(API, OWNER_EMAIL, OWNER_PASSWORD);
    const destinationSession = await sessionAt(DESTINATION_API, DESTINATION_EMAIL, DESTINATION_PASSWORD);

    emptyDestination();
    expect(sourceOwnerTraces(), "the destination must not already hold source-owned rows").toBe(0);

    try {
      populateSource();
      populateSourceReceipt();
      populateSourceReceiptMatch();

      const exported = await rpc(API, sourceSession, "export_backup_snapshot");
      expect(exported.status, exported.body).toBe(200);
      const current = exported.json() as Snapshot;
      expect(current.schemaVersion).toBe(BACKUP_SCHEMA_VERSION);
      for (const kind of NEWER_THAN_V9) {
        expect(current.tableCounts[kind], `${kind} must be empty for the downgrade to be lossless`).toBe(0);
      }

      const v9 = downgradeTo(current, 9, BACKUP_TABLE_KINDS_V9);
      const validated = backupSnapshotSchemaV9.safeParse(v9);
      expect(validated.success, JSON.stringify(validated.error?.issues?.slice(0, 3))).toBe(true);

      const envelope = await encryptBackup(v9, "v9 into v10 rehearsal passphrase 2026");
      const carried = await decryptBackup(envelope, "v9 into v10 rehearsal passphrase 2026");
      const plan = await buildRestorePlan(carried);
      expect(plan.stage.schemaVersion).toBe(9);
      expect(plan.chunks.map((chunk) => chunk.chunk.kind)).toEqual([...BACKUP_TABLE_KINDS_V9]);

      const staged = await rpc(DESTINATION_API, destinationSession, "restore_backup", { p_action: "stage", p_request: plan.stage });
      expect(staged.status, staged.body).toBe(200);
      for (const chunk of plan.chunks) {
        const sent = await rpc(DESTINATION_API, destinationSession, "restore_backup", { p_action: "chunk", p_request: chunk });
        expect(sent.status, `chunk ${chunk.chunk.kind}: ${sent.body}`).toBe(200);
      }
      const committed = await rpc(DESTINATION_API, destinationSession, "restore_backup", { p_action: "commit", p_request: plan.commit });
      expect(committed.status, committed.body).toBe(200);
      expect(sourceOwnerTraces()).toBe(0);

      const reExported = await rpc(DESTINATION_API, destinationSession, "export_backup_snapshot");
      expect(reExported.status, reExported.body).toBe(200);
      const landed = reExported.json() as Snapshot;
      expect(landed.schemaVersion).toBe(BACKUP_SCHEMA_VERSION);
      for (const kind of BACKUP_TABLE_KINDS_V9.filter((table) => table !== "mutation_sequences")) {
        const rebound = canonicalJson((v9 as Snapshot).data[kind]).split(SOURCE_OWNER).join(DESTINATION_OWNER);
        expect(canonicalJson(landed.data[kind]), `${kind} did not survive the version change`).toBe(rebound);
      }
      for (const kind of NEWER_THAN_V9) {
        expect(landed.tableCounts[kind], `${kind} must be present and empty in the re-export`).toBe(0);
      }
      expect(landed.tableCounts.receipt_match_overlays, "the match decision must have travelled").toBe(1);
    } finally {
      cleanSourceReceipt();
      cleanSource();
      clearFactors(CONTAINER, SOURCE_OWNER);
      clearFactors(DESTINATION_CONTAINER, DESTINATION_OWNER);
    }
  }, 180_000);

  // A v10 file — what the owner's hosted backups are written at until migration 033 lands —
  // restored into a v11 destination, the v9 test's method: a genuine v10 artifact made by dropping
  // the two tables v10 predates, which must be empty for that to be lossless.
  it("restores a v10 file into a v11 destination, leaving the delivery match tables empty", async () => {
    assertOnlyDisposableLedgerData([ID(1)]);

    clearFactors(CONTAINER, SOURCE_OWNER);
    clearFactors(DESTINATION_CONTAINER, DESTINATION_OWNER);
    const sourceSession = await sessionAt(API, OWNER_EMAIL, OWNER_PASSWORD);
    const destinationSession = await sessionAt(DESTINATION_API, DESTINATION_EMAIL, DESTINATION_PASSWORD);

    emptyDestination();
    expect(sourceOwnerTraces(), "the destination must not already hold source-owned rows").toBe(0);

    try {
      populateSource();
      populateSourceReceipt();
      populateSourceReceiptMatch();
      populateSourceDelivery();

      const exported = await rpc(API, sourceSession, "export_backup_snapshot");
      expect(exported.status, exported.body).toBe(200);
      const current = exported.json() as Snapshot;
      expect(current.schemaVersion).toBe(BACKUP_SCHEMA_VERSION);
      for (const kind of NEWER_THAN_V10) {
        expect(current.tableCounts[kind], `${kind} must be empty for the downgrade to be lossless`).toBe(0);
      }

      const v10 = downgradeTo(current, 10, BACKUP_TABLE_KINDS_V10);
      const validated = backupSnapshotSchemaV10.safeParse(v10);
      expect(validated.success, JSON.stringify(validated.error?.issues?.slice(0, 3))).toBe(true);

      const envelope = await encryptBackup(v10, "v10 into v11 rehearsal passphrase 2026");
      const carried = await decryptBackup(envelope, "v10 into v11 rehearsal passphrase 2026");
      const plan = await buildRestorePlan(carried);
      expect(plan.stage.schemaVersion).toBe(10);
      expect(plan.chunks.map((chunk) => chunk.chunk.kind)).toEqual([...BACKUP_TABLE_KINDS_V10]);

      const staged = await rpc(DESTINATION_API, destinationSession, "restore_backup", { p_action: "stage", p_request: plan.stage });
      expect(staged.status, staged.body).toBe(200);
      for (const chunk of plan.chunks) {
        const sent = await rpc(DESTINATION_API, destinationSession, "restore_backup", { p_action: "chunk", p_request: chunk });
        expect(sent.status, `chunk ${chunk.chunk.kind}: ${sent.body}`).toBe(200);
      }
      const committed = await rpc(DESTINATION_API, destinationSession, "restore_backup", { p_action: "commit", p_request: plan.commit });
      expect(committed.status, committed.body).toBe(200);
      expect(sourceOwnerTraces()).toBe(0);

      const reExported = await rpc(DESTINATION_API, destinationSession, "export_backup_snapshot");
      expect(reExported.status, reExported.body).toBe(200);
      const landed = reExported.json() as Snapshot;
      expect(landed.schemaVersion).toBe(BACKUP_SCHEMA_VERSION);
      for (const kind of BACKUP_TABLE_KINDS_V10.filter((table) => table !== "mutation_sequences")) {
        const rebound = canonicalJson((v10 as Snapshot).data[kind]).split(SOURCE_OWNER).join(DESTINATION_OWNER);
        expect(canonicalJson(landed.data[kind]), `${kind} did not survive the version change`).toBe(rebound);
      }
      for (const kind of NEWER_THAN_V10) {
        expect(landed.tableCounts[kind], `${kind} must be present and empty in the re-export`).toBe(0);
      }
      expect(landed.tableCounts.deliveries, "the delivery order must have travelled").toBe(1);
    } finally {
      cleanSourceReceipt();
      cleanSource();
      clearFactors(CONTAINER, SOURCE_OWNER);
      clearFactors(DESTINATION_CONTAINER, DESTINATION_OWNER);
    }
  }, 180_000);

  // A v11 file — what the owner's hosted backups are written at until migration 034 lands —
  // restored into a v12 destination, the same method: a genuine v11 artifact made by dropping the
  // four ride tables v11 predates, which must be empty for that to be lossless.
  it("restores a v11 file into a v12 destination, leaving the ride tables empty", async () => {
    assertOnlyDisposableLedgerData([ID(1)]);

    clearFactors(CONTAINER, SOURCE_OWNER);
    clearFactors(DESTINATION_CONTAINER, DESTINATION_OWNER);
    const sourceSession = await sessionAt(API, OWNER_EMAIL, OWNER_PASSWORD);
    const destinationSession = await sessionAt(DESTINATION_API, DESTINATION_EMAIL, DESTINATION_PASSWORD);

    emptyDestination();
    expect(sourceOwnerTraces(), "the destination must not already hold source-owned rows").toBe(0);

    try {
      populateSource();
      populateSourceReceipt();
      populateSourceReceiptMatch();
      populateSourceDelivery();
      populateSourceDeliveryMatch();

      const exported = await rpc(API, sourceSession, "export_backup_snapshot");
      expect(exported.status, exported.body).toBe(200);
      const current = exported.json() as Snapshot;
      expect(current.schemaVersion).toBe(BACKUP_SCHEMA_VERSION);
      for (const kind of NEWER_THAN_V11) {
        expect(current.tableCounts[kind], `${kind} must be empty for the downgrade to be lossless`).toBe(0);
      }

      const v11 = downgradeTo(current, 11, BACKUP_TABLE_KINDS_V11);
      const validated = backupSnapshotSchemaV11.safeParse(v11);
      expect(validated.success, JSON.stringify(validated.error?.issues?.slice(0, 3))).toBe(true);

      const envelope = await encryptBackup(v11, "v11 into v12 rehearsal passphrase 2026");
      const carried = await decryptBackup(envelope, "v11 into v12 rehearsal passphrase 2026");
      const plan = await buildRestorePlan(carried);
      expect(plan.stage.schemaVersion).toBe(11);
      expect(plan.chunks.map((chunk) => chunk.chunk.kind)).toEqual([...BACKUP_TABLE_KINDS_V11]);

      const staged = await rpc(DESTINATION_API, destinationSession, "restore_backup", { p_action: "stage", p_request: plan.stage });
      expect(staged.status, staged.body).toBe(200);
      for (const chunk of plan.chunks) {
        const sent = await rpc(DESTINATION_API, destinationSession, "restore_backup", { p_action: "chunk", p_request: chunk });
        expect(sent.status, `chunk ${chunk.chunk.kind}: ${sent.body}`).toBe(200);
      }
      const committed = await rpc(DESTINATION_API, destinationSession, "restore_backup", { p_action: "commit", p_request: plan.commit });
      expect(committed.status, committed.body).toBe(200);
      expect(sourceOwnerTraces()).toBe(0);

      const reExported = await rpc(DESTINATION_API, destinationSession, "export_backup_snapshot");
      expect(reExported.status, reExported.body).toBe(200);
      const landed = reExported.json() as Snapshot;
      expect(landed.schemaVersion).toBe(BACKUP_SCHEMA_VERSION);
      for (const kind of BACKUP_TABLE_KINDS_V11.filter((table) => table !== "mutation_sequences")) {
        const rebound = canonicalJson((v11 as Snapshot).data[kind]).split(SOURCE_OWNER).join(DESTINATION_OWNER);
        expect(canonicalJson(landed.data[kind]), `${kind} did not survive the version change`).toBe(rebound);
      }
      for (const kind of NEWER_THAN_V11) {
        expect(landed.tableCounts[kind], `${kind} must be present and empty in the re-export`).toBe(0);
      }
      expect(landed.tableCounts.deliveries, "the delivery order must have travelled").toBe(1);
      expect(landed.tableCounts.delivery_match_overlays, "its match decision must have travelled").toBe(1);
    } finally {
      cleanSourceReceipt();
      cleanSource();
      clearFactors(CONTAINER, SOURCE_OWNER);
      clearFactors(DESTINATION_CONTAINER, DESTINATION_OWNER);
    }
  }, 180_000);
});

it.skipIf(ready)("reports that portable recovery was not verified", () => {
  const missing = [
    sourceUp ? null : `source container ${CONTAINER} (\`pnpm supabase:start\`)`,
    destinationUp ? null : `destination container ${DESTINATION_CONTAINER} (\`node scripts/recovery-destination.mjs up\`)`
  ].filter(Boolean).join(" and ");
  console.warn(
    `Skipped portable recovery into a separately bound project: ${missing} unreachable. ` +
    "A skipped run proves nothing about recovery, and recovery is the gate on importing real data."
  );
  expect(ready).toBe(false);
});
