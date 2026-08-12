import { describe, expect, it } from "vitest";
import { decryptBackup, encryptBackup } from "@/lib/backup";
import {
  BACKUP_SCHEMA_VERSION,
  BACKUP_TABLE_KINDS,
  BACKUP_TABLE_KINDS_V2,
  BACKUP_TABLE_KINDS_V3,
  BACKUP_TABLE_KINDS_V4,
  backupDataSchema,
  backupDataSchemaV2,
  backupDataSchemaV3,
  backupDataSchemaV4,
  backupSnapshotSchema,
  describeBackupSnapshot,
  restoreActionSchemas,
  restoreManifestSchema,
  restoreManifestSchemaV2,
  restoreManifestSchemaV3,
  restoreManifestSchemaV4
} from "@/lib/backup-contract";

describe("portable encrypted backup", () => {
  it("round-trips canonical JSON with the versioned authenticated envelope", async () => {
    const value = { schemaVersion: 2, money: "-9223372036854775808", thai: "ข้อมูลสังเคราะห์" };
    const encrypted = await encryptBackup(value, "correct horse ledger battery");
    expect(encrypted.header.iterations).toBe(600_000);
    expect(encrypted.ciphertext).not.toContain(value.money);
    await expect(decryptBackup(encrypted, "correct horse ledger battery")).resolves.toEqual(value);
  }, 30_000);

  it("rejects a wrong password and an altered authenticated header", async () => {
    const encrypted = await encryptBackup({ safe: true }, "correct horse ledger battery");
    await expect(decryptBackup(encrypted, "wrong password is long enough")).rejects.toThrow();
    const altered = { ...encrypted, header: { ...encrypted.header, envelopeVersion: 2 as 1 } };
    await expect(decryptBackup(altered, "correct horse ledger battery")).rejects.toThrow("header");
  }, 30_000);
});

function manifestOver(kinds: readonly string[]) {
  return {
    exportedAt: "2026-07-24T00:00:00.000Z",
    snapshotSequence: "0",
    chunks: kinds.map((kind, index) => ({ index, kind, rowCount: 0, sha256: "a".repeat(64) })),
    tableCounts: Object.fromEntries(kinds.map((kind) => [kind, 0])),
    payloadDigest: "b".repeat(64)
  };
}

describe("restore manifest", () => {
  it("requires the exact ordered table set and canonical snapshot sequence", () => {
    const manifest = manifestOver(BACKUP_TABLE_KINDS);
    expect(restoreManifestSchema.parse(manifest).chunks).toHaveLength(19);
    expect(() => restoreManifestSchema.parse({ ...manifest, snapshotSequence: "01" })).toThrow();
    expect(() => restoreManifestSchema.parse({ ...manifest, chunks: [...manifest.chunks].reverse() })).toThrow();
  });

  it("keeps reading a v2 manifest, and refuses to read any version as another", () => {
    // The owner holds one backup covering the whole ledger and it is **still** a v2 file. If
    // this test ever goes red, that file has become unrestorable — which is the specific harm
    // the multi-version contract exists to prevent, and neither migration 012 nor 013 changes
    // it. The owner also now holds a v3 file (D-073), which the same reasoning covers.
    const v2 = manifestOver(BACKUP_TABLE_KINDS_V2);
    const v3 = manifestOver(BACKUP_TABLE_KINDS_V3);
    const v4 = manifestOver(BACKUP_TABLE_KINDS_V4);
    const v5 = manifestOver(BACKUP_TABLE_KINDS);
    expect(restoreManifestSchemaV2.parse(v2).chunks).toHaveLength(11);
    expect(restoreManifestSchemaV3.parse(v3).chunks).toHaveLength(12);
    expect(restoreManifestSchemaV4.parse(v4).chunks).toHaveLength(14);

    // Accepting an old version must not mean accepting anything. Each version pins its own
    // table count, so no manifest passes as another.
    expect(restoreManifestSchemaV2.safeParse(v3).success).toBe(false);
    expect(restoreManifestSchemaV3.safeParse(v4).success).toBe(false);
    expect(restoreManifestSchemaV4.safeParse(v5).success).toBe(false);
    expect(restoreManifestSchema.safeParse(v2).success).toBe(false);
    expect(restoreManifestSchema.safeParse(v3).success).toBe(false);
    expect(restoreManifestSchema.safeParse(v4).success).toBe(false);
  });

  it("binds a staged manifest to the version declared alongside it", () => {
    const identity = {
      restoreId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      idempotencyKey: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      digest: "a".repeat(64)
    };
    expect(restoreActionSchemas.stage.safeParse({ ...identity, schemaVersion: 2, manifest: manifestOver(BACKUP_TABLE_KINDS_V2) }).success).toBe(true);
    expect(restoreActionSchemas.stage.safeParse({ ...identity, schemaVersion: 3, manifest: manifestOver(BACKUP_TABLE_KINDS_V3) }).success).toBe(true);
    expect(restoreActionSchemas.stage.safeParse({ ...identity, schemaVersion: 4, manifest: manifestOver(BACKUP_TABLE_KINDS_V4) }).success).toBe(true);
    expect(restoreActionSchemas.stage.safeParse({ ...identity, schemaVersion: 5, manifest: manifestOver(BACKUP_TABLE_KINDS) }).success).toBe(true);
    // The pairing is the point: a version and a manifest that disagree about how many
    // tables exist cannot both be right, and the server would otherwise stage one and
    // then refuse chunks against the other.
    expect(restoreActionSchemas.stage.safeParse({ ...identity, schemaVersion: 3, manifest: manifestOver(BACKUP_TABLE_KINDS_V2) }).success).toBe(false);
    expect(restoreActionSchemas.stage.safeParse({ ...identity, schemaVersion: 2, manifest: manifestOver(BACKUP_TABLE_KINDS) }).success).toBe(false);
    expect(restoreActionSchemas.stage.safeParse({ ...identity, schemaVersion: 4, manifest: manifestOver(BACKUP_TABLE_KINDS_V3) }).success).toBe(false);
    expect(restoreActionSchemas.stage.safeParse({ ...identity, schemaVersion: 5, manifest: manifestOver(BACKUP_TABLE_KINDS_V4) }).success).toBe(false);
    expect(restoreActionSchemas.stage.safeParse({ ...identity, schemaVersion: 4, manifest: manifestOver(BACKUP_TABLE_KINDS) }).success).toBe(false);
  });

  it("does not impose a 1,000-row API cap and preserves int64 text", () => {
    const ownerId = "11111111-1111-4111-8111-111111111111";
    const accountId = "11111111-2222-4333-8444-555555555555";
    const data = Object.fromEntries(BACKUP_TABLE_KINDS.map((kind) => [kind, []])) as unknown as Record<(typeof BACKUP_TABLE_KINDS)[number], unknown[]>;
    data.source_transactions = Array.from({ length: 1001 }, (_, index) => ({
      id: `33333333-3333-4333-8333-${index.toString(16).padStart(12, "0")}`,
      owner_id: ownerId,
      account_id: accountId,
      fingerprint_version: "fingerprint-v1",
      fingerprint: index.toString(16).padStart(64, "0"),
      source_date: "2026-06-01",
      source_time: null,
      effective_date: "2026-06-01",
      transaction_label: "Synthetic",
      description: `Synthetic row ${index}`,
      reference: null,
      branch: null,
      post_balance_minor: index === 0 ? "-9223372036854775808" : index === 1000 ? "9223372036854775807" : "0",
      currency: "THB",
      created_at: "2026-07-24T00:00:00.000Z"
    }));
    data.mutation_sequences = [{
      owner_id: ownerId,
      sequence: "9223372036854775807",
      last_exported_sequence: "0",
      updated_at: "2026-07-24T00:00:00.000Z"
    }];
    const tableCounts = Object.fromEntries(BACKUP_TABLE_KINDS.map((kind) => [kind, data[kind].length]));
    const parsed = backupSnapshotSchema.parse({
      schemaVersion: BACKUP_SCHEMA_VERSION, exportedAt: "2026-07-24T00:00:00.000Z", snapshotSequence: "9223372036854775807", tableCounts, data
    });
    expect(parsed.schemaVersion).toBe(5);
    expect(parsed.data.source_transactions).toHaveLength(1001);
    expect(parsed.data.source_transactions[0]).toMatchObject({ post_balance_minor: "-9223372036854775808" });
    expect(parsed.data.source_transactions[1000]).toMatchObject({ post_balance_minor: "9223372036854775807" });
  });

  it("describes a written backup from the snapshot rather than from the newest table list", () => {
    // The defect this replaces: the recovery bench printed a row count computed from the file
    // beside a table count read off `BACKUP_TABLE_KINDS`, which is always the *newest* list.
    // Both halves looked like evidence and only one was. On 2026-08-09 a real export from a
    // ledger still on migration 011 wrote twelve tables at v3 and announced fourteen (D-074).
    const countsFor = (kinds: readonly string[]) => Object.fromEntries(kinds.map((kind, index) => [kind, index]));

    const v3 = describeBackupSnapshot({ schemaVersion: 3, tableCounts: countsFor(BACKUP_TABLE_KINDS_V3) });
    expect(v3).toContain(`${BACKUP_TABLE_KINDS_V3.length} tables`);
    expect(v3).toContain("schema version 3");
    // The whole point: the newest list is longer, and saying so here would be the bug.
    expect(v3).not.toContain(`${BACKUP_TABLE_KINDS.length} tables`);

    const v4 = describeBackupSnapshot({ schemaVersion: 4, tableCounts: countsFor(BACKUP_TABLE_KINDS_V4) });
    expect(v4).toContain(`${BACKUP_TABLE_KINDS_V4.length} tables`);
    expect(v4).toContain("schema version 4");
    // The same trap one version on: v4 is now an older list too, so describing it with the
    // newest length would be D-074 repeating itself rather than a new defect.
    expect(v4).not.toContain(`${BACKUP_TABLE_KINDS.length} tables`);

    const v5 = describeBackupSnapshot({ schemaVersion: 5, tableCounts: countsFor(BACKUP_TABLE_KINDS) });
    expect(v5).toContain(`${BACKUP_TABLE_KINDS.length} tables`);
    expect(v5).toContain("schema version 5");

    // Rows are summed from the counts, so the sentence cannot claim rows the file lacks.
    const rows = BACKUP_TABLE_KINDS_V3.reduce((sum, _kind, index) => sum + index, 0);
    expect(v3).toContain(`${rows} rows`);
  });

  it("rejects numeric or non-canonical bigint values at the HTTP restore boundary", () => {
    const common = {
      restoreId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      idempotencyKey: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      schemaVersion: 2 as const,
      digest: "a".repeat(64),
      chunkIndex: 4,
      chunkDigest: "b".repeat(64)
    };
    const invalidRow = {
      id: "33333333-3333-4333-8333-333333333333",
      owner_id: "11111111-1111-4111-8111-111111111111",
      account_id: "11111111-2222-4333-8444-555555555555",
      fingerprint_version: "fingerprint-v1",
      fingerprint: "c".repeat(64),
      source_date: "2026-06-01",
      source_time: null,
      effective_date: "2026-06-01",
      transaction_label: "Synthetic",
      description: "Unsafe numeric boundary",
      reference: null,
      branch: null,
      post_balance_minor: 9_007_199_254_740_993,
      currency: "THB",
      created_at: "2026-07-24T00:00:00.000Z"
    };
    expect(restoreActionSchemas.chunk.safeParse({
      ...common,
      chunk: { kind: "source_transactions", rows: [invalidRow] }
    }).success).toBe(false);
  });
});

// The rule these two tests exist to hold is D-097: **new owner data goes in a new table,
// never in a new column on an existing one.**
//
// Why it is worth a test rather than a note. `export_backup_snapshot` serialises whole rows
// with `to_jsonb`, so a column added by a migration travels into the file whether or not
// anyone updates the export — and every row schema here is `.strict()`, so that file then
// fails its own validation. The loud half of that is fine; the dangerous half is the obvious
// fix, which is to add the key to the shared row schema. That silently breaks **every older
// version**, because v2…v5 deliberately share one row schema per table. These tests fail at
// exactly that moment, with a reason, instead of the next export failing without one.
//
// Both are structural rather than fixture-based on purpose: they need no valid row for any of
// the nineteen tables, so they cannot rot as the row contracts change.
describe("backup row shapes are shared by every version that carries the table", () => {
  function rowSchemaOf(dataSchema: unknown, table: string): unknown {
    const shape = (dataSchema as { shape?: Record<string, unknown> }).shape;
    const field = shape?.[table];
    return field === undefined ? undefined : (field as { element?: unknown }).element;
  }

  const versions = [
    { name: "v2", data: backupDataSchemaV2, kinds: BACKUP_TABLE_KINDS_V2 },
    { name: "v3", data: backupDataSchemaV3, kinds: BACKUP_TABLE_KINDS_V3 },
    { name: "v4", data: backupDataSchemaV4, kinds: BACKUP_TABLE_KINDS_V4 },
    { name: "v5", data: backupDataSchema, kinds: BACKUP_TABLE_KINDS }
  ] as const;

  it("uses one row schema per table across every version, so a column cannot diverge them", () => {
    const first = new Map<string, unknown>();
    const divergent: string[] = [];
    for (const version of versions) {
      for (const table of version.kinds) {
        const row = rowSchemaOf(version.data, table);
        expect(row, `${version.name} carries no row schema for ${table}`).toBeDefined();
        if (!first.has(table)) {
          first.set(table, row);
        } else if (first.get(table) !== row) {
          divergent.push(`${table} diverges at ${version.name}`);
        }
      }
    }
    // Reference equality, not deep equality: the versions are built by spreading the previous
    // shape, so a shared table must be the *same* schema object. Rewriting one version's entry
    // to a look-alike is the change this catches.
    expect(divergent).toEqual([]);
    expect(first.size).toBe(BACKUP_TABLE_KINDS.length);
  });

  it("grows only by appending tables, so no version ever drops or reorders one", () => {
    for (let index = 1; index < versions.length; index += 1) {
      const older = versions[index - 1]!;
      const newer = versions[index]!;
      expect(
        newer.kinds.slice(0, older.kinds.length),
        `${newer.name} does not begin with ${older.name}'s table list`
      ).toEqual([...older.kinds]);
      expect(newer.kinds.length).toBeGreaterThan(older.kinds.length);
    }
  });
});
