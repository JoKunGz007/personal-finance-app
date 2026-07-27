import type { z } from "zod";
import { canonicalJson, sha256Hex } from "@/lib/canonical";
import {
  BACKUP_TABLE_KINDS,
  backupChunkSchema,
  backupSnapshotSchema,
  restoreActionSchemas
} from "@/lib/backup-contract";

// Turns a decrypted schema-v2 snapshot into the exact request sequence
// `public.restore_backup` accepts: one stage, eleven chunks in table order, one commit.
//
// This lives in lib/ rather than in a test because recovery is the one path that has
// to work on a machine that has lost everything else. A builder that exists only in
// a suite means a real restore starts by reimplementing the manifest from memory —
// the digests, the chunk ordering, and the count bindings all have to be reproduced
// exactly or the server refuses, and it refuses without saying which one was wrong.

type Snapshot = z.infer<typeof backupSnapshotSchema>;

export type StageRequest = z.infer<typeof restoreActionSchemas.stage>;
export type ChunkRequest = z.infer<typeof restoreActionSchemas.chunk>;
export type CommitRequest = z.infer<typeof restoreActionSchemas.commit>;

export type RestorePlan = {
  digest: string;
  stage: StageRequest;
  chunks: ChunkRequest[];
  commit: CommitRequest;
  abort: CommitRequest;
};

export type RestorePlanIds = {
  restoreId: string;
  idempotencyKey: string;
};

// A chunk's digest covers {kind, rows} and the manifest's covers the whole snapshot.
// Both are recomputed server-side, so these are bindings rather than claims.
async function chunkPayloads(snapshot: Snapshot) {
  return Promise.all(BACKUP_TABLE_KINDS.map(async (kind, index) => {
    const payload = backupChunkSchema.parse({ kind, rows: snapshot.data[kind] });
    return { index, kind, payload, sha256: await sha256Hex(canonicalJson(payload)) };
  }));
}

export async function buildRestorePlan(
  snapshot: unknown,
  ids: RestorePlanIds = { restoreId: crypto.randomUUID(), idempotencyKey: crypto.randomUUID() }
): Promise<RestorePlan> {
  // Validate before building. A snapshot that does not meet the contract cannot produce
  // a plan the server will accept, and failing here names the offending field instead of
  // surfacing as an opaque staging rejection halfway through a recovery.
  const validated = backupSnapshotSchema.parse(snapshot);

  // Hash the caller's own object, not zod's reconstruction of it: the server recomputes
  // this digest from the chunks it reassembles, so it must cover exactly what travels.
  const digest = await sha256Hex(canonicalJson(snapshot));
  const parts = await chunkPayloads(validated);
  const base = { ...ids, schemaVersion: 2 as const, digest };

  return {
    digest,
    stage: {
      ...base,
      manifest: {
        payloadDigest: digest,
        snapshotSequence: validated.snapshotSequence,
        exportedAt: validated.exportedAt,
        tableCounts: validated.tableCounts,
        chunks: parts.map((part) => ({
          index: part.index,
          kind: part.kind,
          rowCount: part.payload.rows.length,
          sha256: part.sha256
        }))
      }
    },
    chunks: parts.map((part) => ({
      ...base,
      chunkIndex: part.index,
      chunkDigest: part.sha256,
      chunk: part.payload
    })),
    commit: base,
    abort: base
  };
}
