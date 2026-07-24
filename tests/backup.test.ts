import { describe, expect, it } from "vitest";
import { decryptBackup, encryptBackup } from "@/lib/backup";
import { BACKUP_TABLE_KINDS, backupSnapshotSchema, restoreActionSchemas, restoreManifestSchema } from "@/lib/backup-contract";

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

describe("schema-v2 restore manifest", () => {
  it("requires the exact ordered table set and canonical snapshot sequence", () => {
    const chunks = BACKUP_TABLE_KINDS.map((kind, index) => ({ index, kind, rowCount: 0, sha256: "a".repeat(64) }));
    const tableCounts = Object.fromEntries(BACKUP_TABLE_KINDS.map((kind) => [kind, 0]));
    expect(restoreManifestSchema.parse({
      exportedAt: "2026-07-24T00:00:00.000Z", snapshotSequence: "0", chunks, tableCounts, payloadDigest: "b".repeat(64)
    }).chunks).toHaveLength(11);
    expect(() => restoreManifestSchema.parse({
      exportedAt: "2026-07-24T00:00:00.000Z", snapshotSequence: "01", chunks: [...chunks].reverse(), tableCounts, payloadDigest: "b".repeat(64)
    })).toThrow();
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
      schemaVersion: 2, exportedAt: "2026-07-24T00:00:00.000Z", snapshotSequence: "9223372036854775807", tableCounts, data
    });
    expect(parsed.data.source_transactions).toHaveLength(1001);
    expect(parsed.data.source_transactions[0]).toMatchObject({ post_balance_minor: "-9223372036854775808" });
    expect(parsed.data.source_transactions[1000]).toMatchObject({ post_balance_minor: "9223372036854775807" });
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
