import { describe, expect, it } from "vitest";
import { canonicalJson } from "@/lib/canonical";
import { decryptBackup, encryptBackup } from "@/lib/backup";
import {
  backupSnapshotSchema, backupSnapshotSchemaV4, BACKUP_TABLE_KINDS, BACKUP_TABLE_KINDS_V4
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
    `select count(*) from public.audit_events where actor_id = '${SOURCE_OWNER}'`,
    `select count(*) from public.ledger_owners where owner_id = '${SOURCE_OWNER}'`
  ];
  const result = psqlAt(DESTINATION_CONTAINER, `select coalesce(sum(n), 0) from (${[...owned, ...actors].join(" union all ")}) as traces;`);
  if (!result.ok) throw new Error(`trace query failed: ${result.output}`);
  return Number(result.output.trim());
}

// The five tables a v4 file predates entirely — everything migration 013 added.
const V5_ONLY_KINDS = BACKUP_TABLE_KINDS.filter((kind) => !(BACKUP_TABLE_KINDS_V4 as readonly string[]).includes(kind));

/**
 * Turns a v5 export into the v4 file a ledger on migration 012 would have written.
 *
 * **Why this is a genuine v4 artifact and not an approximation of one.** The version kind
 * lists are strictly additive — `restore_backup` builds them by appending, so v4 is v5 minus
 * exactly these five tables — and migrations 013 and 014 alter no column of any table v4
 * carries; their only `alter table` statements touch the new tables and the `restore_runs` /
 * `restore_chunks` version constraints, neither of which travels in a backup. So dropping the
 * five leaves precisely what the older `export_backup_snapshot` emitted. The alternative was
 * standing up a fourth local project pinned at migration 012 to produce one, which would test
 * the same bytes at considerably more expense.
 *
 * The caller asserts the five are empty at source first, without which this would be lossy
 * rather than a downgrade.
 */
function downgradeToV4(snapshot: Snapshot): unknown {
  const data: Record<string, unknown> = {};
  const tableCounts: Record<string, number> = {};
  for (const kind of BACKUP_TABLE_KINDS_V4) {
    data[kind] = snapshot.data[kind];
    tableCounts[kind] = snapshot.tableCounts[kind]!;
  }
  return {
    schemaVersion: 4,
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
  it("restores a v4 file into a v5 ledger, which is the version pair hosting will use", async () => {
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
      expect(current.schemaVersion, "the source is on 014 and must write the newest version").toBe(5);

      // Without this the "downgrade" would be silently dropping rows, and every assertion
      // below would pass while testing a file no ledger could ever have produced.
      for (const kind of V5_ONLY_KINDS) {
        expect(current.tableCounts[kind], `${kind} must be empty for the downgrade to be lossless`).toBe(0);
      }

      const v4 = downgradeToV4(current);
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

      // The five tables the file predates exist in the destination and stay empty. A restore
      // that applied the newest kind list leniently would have had to invent rows for them.
      const untouched = psqlAt(
        DESTINATION_CONTAINER,
        `select ${V5_ONLY_KINDS.map((kind) => `(select count(*) from public.${kind})`).join(" + ")};`
      );
      expect(untouched.ok && untouched.output.trim(), "a v4 file must leave the v5-only tables empty").toBe("0");

      // The payoff: the ledger is now readable as v5. This is the state hosting ends in —
      // an older file in, the current contract out, with everything rebound.
      const reExported = await rpc(DESTINATION_API, destinationSession, "export_backup_snapshot");
      expect(reExported.status, reExported.body).toBe(200);
      const landed = reExported.json() as Snapshot;
      expect(landed.schemaVersion, "the destination writes its own version, not the file's").toBe(5);
      expect(backupSnapshotSchema.safeParse(landed).success).toBe(true);

      for (const kind of BACKUP_TABLE_KINDS_V4.filter((table) => table !== "mutation_sequences")) {
        const rebound = canonicalJson((v4 as Snapshot).data[kind]).split(SOURCE_OWNER).join(DESTINATION_OWNER);
        expect(canonicalJson(landed.data[kind]), `${kind} did not survive the version change`).toBe(rebound);
      }
      for (const kind of V5_ONLY_KINDS) {
        expect(landed.tableCounts[kind], `${kind} must be present and empty in the re-export`).toBe(0);
      }
    } finally {
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
