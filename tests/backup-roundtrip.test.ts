import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { canonicalJson } from "@/lib/canonical";
import { decryptBackup, encryptBackup } from "@/lib/backup";
import { backupSnapshotSchema } from "@/lib/backup-contract";
import { buildRestorePlan } from "@/lib/restore-plan";

// Full schema-v2 recovery chain over more than 1,000 rows:
// export -> validate -> encrypt -> decrypt -> stage -> chunk x11 -> commit -> re-export.
//
// The pgTAP suite proves the restore contract with small hand-authored fixtures and
// the unit suite proves the envelope in isolation. Neither exercises the chain end
// to end at a size where chunking, ordering, and int64 text handling actually
// matter, which is where a recovery path fails in practice.
//
// This test mutates the database, so it exports whatever state it finds first and
// restores it at the end, leaving the ledger as it was for pgTAP and the seed.
const CONTAINER = "supabase_db_private-ledger-local";
const OWNER = "11111111-1111-4111-8111-111111111111";
const ROW_COUNT = 1200;

type Snapshot = { schemaVersion: 2; exportedAt: string; snapshotSequence: string; tableCounts: Record<string, number>; data: Record<string, unknown[]> };

function psql(sql: string): { ok: boolean; output: string } {
  try {
    const output = execFileSync(
      "docker",
      ["exec", "-i", CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-t", "-A", "-v", "ON_ERROR_STOP=1", "-f", "-"],
      { input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], maxBuffer: 256 * 1024 * 1024 }
    );
    return { ok: true, output };
  } catch (error) {
    const shell = error as { stdout?: string; stderr?: string };
    return { ok: false, output: `${shell.stdout ?? ""}${shell.stderr ?? ""}` };
  }
}

const reachable = psql("select 1;").ok;

// The owner gate is enforced inside the RPCs, so every session must present the
// same claims pgTAP does: two verified TOTP factors and an aal2 JWT.
const AS_OWNER = `
set local session_replication_role = replica;
insert into auth.mfa_factors(id, user_id, friendly_name, factor_type, status, secret, created_at, updated_at)
values ('aaaaaaaa-0000-4000-8000-0000000000f1', '${OWNER}', 'roundtrip one', 'totp', 'verified', 'SYNTHETICROUNDONE', now(), now()),
       ('aaaaaaaa-0000-4000-8000-0000000000f2', '${OWNER}', 'roundtrip two', 'totp', 'verified', 'SYNTHETICROUNDTWO', now(), now())
on conflict (id) do nothing;
set local session_replication_role = origin;
select set_config('request.jwt.claims', '{"sub":"${OWNER}","role":"authenticated","aal":"aal2"}', true);
`;

const WIPE = `
set local session_replication_role = replica;
delete from public.restore_chunks; delete from public.restore_runs; delete from public.backup_records;
delete from public.overlay_revisions; delete from public.transaction_overlays;
delete from public.import_batch_rows; delete from public.source_components; delete from public.source_transactions;
delete from public.audit_events; delete from public.import_batches; delete from public.import_artifacts;
delete from public.categories; delete from public.accounts;
set local session_replication_role = origin;
`;

const encode = (value: unknown) =>
  `convert_from(decode('${Buffer.from(JSON.stringify(value), "utf8").toString("hex")}','hex'),'UTF8')::jsonb`;

function exportSnapshot(): Snapshot {
  const result = psql(`begin;\n${AS_OWNER}\nselect public.export_backup_snapshot();\ncommit;`);
  if (!result.ok) throw new Error(`export failed: ${result.output}`);
  const line = result.output.trim().split("\n").filter((row) => row.startsWith("{")).pop();
  if (!line) throw new Error(`no snapshot in output: ${result.output.slice(0, 400)}`);
  return JSON.parse(line) as Snapshot;
}

// Runs the whole staged restore in one session: stage, every chunk in order, commit.
// The request sequence comes from `lib/restore-plan.ts` — the same shipped builder a
// real recovery uses — so this suite exercises it at 1,200 rows rather than proving a
// second implementation that only ever runs in tests.
async function restore(snapshot: Snapshot): Promise<void> {
  const plan = await buildRestorePlan(snapshot);

  const statements = [
    `select public.restore_backup('stage', ${encode(plan.stage)});`,
    ...plan.chunks.map((chunk) => `select public.restore_backup('chunk', ${encode(chunk)});`),
    `select public.restore_backup('commit', ${encode(plan.commit)});`
  ];

  // restore_backup refuses a non-empty destination, mirroring portable recovery
  // into a fresh project. Clearing first is how the real flow reaches it.
  const result = psql(`begin;\n${AS_OWNER}\n${WIPE}\n${statements.join("\n")}\ncommit;`);
  if (!result.ok) throw new Error(`restore failed: ${result.output.slice(-1500)}`);
}

// Mutation sequences legitimately advance across a restore, so they are compared
// separately rather than being expected to round-trip byte for byte.
const withoutSequences = (snapshot: Snapshot) => {
  const rest = { ...snapshot.data };
  delete rest.mutation_sequences;
  return rest;
};

function populate(): void {
  const result = psql(`begin;
${AS_OWNER}
${WIPE}

insert into public.accounts(id, owner_id, bank_code, label, account_type, last_four, currency, timezone)
values ('dddddddd-0000-4000-8000-000000000001', '${OWNER}', 'KTB', 'Roundtrip synthetic', 'savings', '4321', 'THB', 'Asia/Bangkok');

insert into public.import_artifacts(id, owner_id, artifact_digest, contract_version)
values ('dddddddd-0000-4000-8000-000000000002', '${OWNER}', repeat('c', 64), 'krungthai-layout-v1');

insert into public.import_batches(id, owner_id, account_id, artifact_id, idempotency_key, payload_digest,
  period_start, period_end, opening_balance_minor, closing_balance_minor, currency)
values ('dddddddd-0000-4000-8000-000000000003', '${OWNER}', 'dddddddd-0000-4000-8000-000000000001',
  'dddddddd-0000-4000-8000-000000000002', 'dddddddd-0000-4000-8000-000000000004', repeat('d', 64),
  '2026-01-01', '2026-12-31', 0, ${ROW_COUNT} * 100, 'THB');

-- Deterministic synthetic rows; balances climb by 100 minor units per row so the
-- ledger stays internally consistent at this size.
insert into public.source_transactions(id, owner_id, account_id, fingerprint_version, fingerprint,
  source_date, source_time, effective_date, transaction_label, description, reference, branch,
  post_balance_minor, currency)
select ('eeeeeeee-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, '${OWNER}',
  'dddddddd-0000-4000-8000-000000000001', 'fingerprint-v1', encode(sha256(('roundtrip-' || n)::bytea), 'hex'),
  date '2026-01-01' + (n % 360), '09:00', date '2026-01-01' + (n % 360),
  'Synthetic label ' || n, 'Synthetic description ' || n, 'REF-' || n, 'BR01',
  n * 100, 'THB'
from generate_series(1, ${ROW_COUNT}) as n;

insert into public.source_components(owner_id, transaction_id, position, kind, amount_minor, currency)
select '${OWNER}', ('eeeeeeee-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, 1, 'deposit', 100, 'THB'
from generate_series(1, ${ROW_COUNT}) as n;

insert into public.import_batch_rows(owner_id, batch_id, transaction_id, source_index, page, row_number, parser_fields, linked_existing)
select '${OWNER}', 'dddddddd-0000-4000-8000-000000000003',
  ('eeeeeeee-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, n, 1 + (n / 40), 1 + (n % 40), '{}'::jsonb, false
from generate_series(1, ${ROW_COUNT}) as n;

insert into public.audit_events(owner_id, actor_id, event_type, entity_type, entity_id, detail)
values ('${OWNER}', '${OWNER}', 'import.confirmed', 'import_batch', 'dddddddd-0000-4000-8000-000000000003',
  jsonb_build_object('row_count', ${ROW_COUNT}));

update public.mutation_sequences set sequence = sequence + 1, updated_at = now() where owner_id = '${OWNER}';
commit;`);
  if (!result.ok) throw new Error(`populate failed: ${result.output.slice(0, 600)}`);
}

describe.skipIf(!reachable)(`schema-v2 recovery chain over ${ROW_COUNT} rows`, () => {
  it("survives export, encryption, staged chunked restore, and re-export", async () => {
    // Preserve whatever the database currently holds so the run is non-destructive.
    const original = exportSnapshot();

    try {
      populate();
      const exported = exportSnapshot();
      expect(exported.tableCounts.source_transactions).toBe(ROW_COUNT);
      expect(exported.data.source_components).toHaveLength(ROW_COUNT);

      // The snapshot must satisfy the shared contract, not merely parse.
      const validated = backupSnapshotSchema.safeParse(exported);
      expect(validated.success, JSON.stringify(validated.error?.issues?.slice(0, 3))).toBe(true);

      // Money must survive as canonical text, never as a JSON number.
      const firstRow = exported.data.source_transactions![0] as { post_balance_minor: unknown };
      expect(typeof firstRow.post_balance_minor).toBe("string");

      const envelope = await encryptBackup(exported, "correct horse battery staple 2026");
      const decrypted = await decryptBackup(envelope, "correct horse battery staple 2026") as Snapshot;
      expect(canonicalJson(decrypted)).toBe(canonicalJson(exported));

      await restore(decrypted);

      const reExported = exportSnapshot();
      expect(reExported.tableCounts).toEqual(exported.tableCounts);
      expect(canonicalJson(withoutSequences(reExported))).toBe(canonicalJson(withoutSequences(exported)));
    } finally {
      // Leave the ledger as found, whatever happened above. A failure here must not
      // mask the failure that brought us here.
      try {
        await restore(original);
      } catch (error) {
        console.warn(`could not restore the original snapshot: ${(error as Error).message}`);
      }
    }

    const restored = exportSnapshot();
    expect(canonicalJson(withoutSequences(restored))).toBe(canonicalJson(withoutSequences(original)));
  }, 180_000);
});

it.skipIf(reachable)("reports that the recovery chain was not verified", () => {
  console.warn(
    `Skipped schema-v2 recovery chain: container ${CONTAINER} is unreachable. ` +
    "Run `pnpm supabase:start` to exercise it — a skipped run proves nothing about recovery."
  );
  expect(reachable).toBe(false);
});
