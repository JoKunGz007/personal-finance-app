import { z } from "zod";
import { isoDateSchema } from "@/lib/dates";
import { minorUnitStringSchema } from "@/lib/money";
import { BANK_CODES, CONTRACT_VERSIONS } from "@/lib/statement-frame";

export const BACKUP_TABLE_KINDS = [
  "accounts", "categories", "import_artifacts", "import_batches", "source_transactions",
  "source_components", "import_batch_rows", "transaction_overlays", "overlay_revisions",
  "audit_events", "mutation_sequences"
] as const;

export const digestSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const canonicalSequenceSchema = minorUnitStringSchema.refine((value) => BigInt(value) >= 0n);
const timestampSchema = z.string().datetime({ offset: true });
const uuidSchema = z.string().uuid();
const nullableText = z.string().nullable();
const jsonObjectSchema = z.record(z.string(), z.unknown());

const accountRowSchema = z.object({
  id: uuidSchema,
  owner_id: uuidSchema,
  bank_code: z.enum(BANK_CODES),
  label: z.string().min(1).max(120),
  account_type: z.enum(["savings", "current"]),
  last_four: z.string().regex(/^\d{4}$/),
  currency: z.literal("THB"),
  timezone: z.literal("Asia/Bangkok"),
  created_at: timestampSchema
}).strict();

const categoryRowSchema = z.object({
  id: uuidSchema,
  owner_id: uuidSchema,
  name: z.string().trim().min(1).max(80),
  archived: z.boolean(),
  created_at: timestampSchema,
  updated_at: timestampSchema
}).strict();

const importArtifactRowSchema = z.object({
  id: uuidSchema,
  owner_id: uuidSchema,
  artifact_digest: digestSchema,
  contract_version: z.enum(CONTRACT_VERSIONS),
  created_at: timestampSchema
}).strict();

const importBatchRowSchema = z.object({
  id: uuidSchema,
  owner_id: uuidSchema,
  account_id: uuidSchema,
  artifact_id: uuidSchema,
  idempotency_key: uuidSchema,
  payload_digest: digestSchema,
  status: z.enum(["confirmed", "failed"]),
  confirmed_at: timestampSchema,
  period_start: isoDateSchema,
  period_end: isoDateSchema,
  opening_balance_minor: minorUnitStringSchema,
  closing_balance_minor: minorUnitStringSchema,
  currency: z.literal("THB")
}).strict();

const sourceTransactionRowSchema = z.object({
  id: uuidSchema,
  owner_id: uuidSchema,
  account_id: uuidSchema,
  fingerprint_version: z.literal("fingerprint-v1"),
  fingerprint: digestSchema,
  source_date: isoDateSchema,
  source_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,6})?)?$/).nullable(),
  effective_date: isoDateSchema,
  transaction_label: z.string().min(1).max(160),
  description: z.string().min(1).max(500),
  reference: nullableText,
  branch: nullableText,
  post_balance_minor: minorUnitStringSchema,
  currency: z.literal("THB"),
  created_at: timestampSchema
}).strict();

const sourceComponentRowSchema = z.object({
  id: uuidSchema,
  owner_id: uuidSchema,
  transaction_id: uuidSchema,
  position: z.number().int().min(1).max(2),
  kind: z.enum(["deposit", "withdrawal"]),
  amount_minor: minorUnitStringSchema,
  currency: z.literal("THB"),
  created_at: timestampSchema
}).strict().superRefine((component, context) => {
  const amount = BigInt(component.amount_minor);
  if ((component.kind === "deposit" && amount <= 0n) || (component.kind === "withdrawal" && amount >= 0n)) {
    context.addIssue({ code: "custom", message: "Component sign does not match its kind." });
  }
});

const importBatchProvenanceRowSchema = z.object({
  id: uuidSchema,
  owner_id: uuidSchema,
  batch_id: uuidSchema,
  transaction_id: uuidSchema,
  source_index: z.number().int().positive(),
  page: z.number().int().positive(),
  row_number: z.number().int().positive(),
  parser_fields: jsonObjectSchema,
  linked_existing: z.boolean()
}).strict();

const transactionOverlayRowSchema = z.object({
  transaction_id: uuidSchema,
  owner_id: uuidSchema,
  category_id: uuidSchema.nullable(),
  description: nullableText,
  counterparty: nullableText,
  effective_date: isoDateSchema.nullable(),
  note: nullableText,
  include_in_reporting: z.boolean(),
  revision: z.number().int().nonnegative(),
  updated_at: timestampSchema
}).strict();

const overlayRevisionRowSchema = z.object({
  id: uuidSchema,
  owner_id: uuidSchema,
  transaction_id: uuidSchema,
  revision: z.number().int().positive(),
  snapshot: jsonObjectSchema,
  changed_at: timestampSchema,
  changed_by: uuidSchema
}).strict();

const auditEventRowSchema = z.object({
  id: canonicalSequenceSchema,
  owner_id: uuidSchema,
  actor_id: uuidSchema,
  event_type: z.string().min(1),
  entity_type: z.string().min(1),
  entity_id: uuidSchema,
  detail: jsonObjectSchema,
  occurred_at: timestampSchema
}).strict();

const mutationSequenceRowSchema = z.object({
  owner_id: uuidSchema,
  sequence: canonicalSequenceSchema,
  last_exported_sequence: canonicalSequenceSchema,
  updated_at: timestampSchema
}).strict().refine((row) => BigInt(row.last_exported_sequence) <= BigInt(row.sequence), {
  message: "Exported sequence cannot exceed the mutation sequence."
});

export const backupDataSchema = z.object({
  accounts: z.array(accountRowSchema),
  categories: z.array(categoryRowSchema),
  import_artifacts: z.array(importArtifactRowSchema),
  import_batches: z.array(importBatchRowSchema),
  source_transactions: z.array(sourceTransactionRowSchema),
  source_components: z.array(sourceComponentRowSchema),
  import_batch_rows: z.array(importBatchProvenanceRowSchema),
  transaction_overlays: z.array(transactionOverlayRowSchema),
  overlay_revisions: z.array(overlayRevisionRowSchema),
  audit_events: z.array(auditEventRowSchema),
  mutation_sequences: z.array(mutationSequenceRowSchema).length(1)
}).strict();

function chunkSchema<const Kind extends (typeof BACKUP_TABLE_KINDS)[number], Row extends z.ZodType>(
  kind: Kind,
  row: Row
) {
  return z.object({ kind: z.literal(kind), rows: z.array(row) }).strict();
}

export const backupChunkSchema = z.discriminatedUnion("kind", [
  chunkSchema("accounts", accountRowSchema),
  chunkSchema("categories", categoryRowSchema),
  chunkSchema("import_artifacts", importArtifactRowSchema),
  chunkSchema("import_batches", importBatchRowSchema),
  chunkSchema("source_transactions", sourceTransactionRowSchema),
  chunkSchema("source_components", sourceComponentRowSchema),
  chunkSchema("import_batch_rows", importBatchProvenanceRowSchema),
  chunkSchema("transaction_overlays", transactionOverlayRowSchema),
  chunkSchema("overlay_revisions", overlayRevisionRowSchema),
  chunkSchema("audit_events", auditEventRowSchema),
  chunkSchema("mutation_sequences", mutationSequenceRowSchema)
]);

const tableCountsShape = Object.fromEntries(BACKUP_TABLE_KINDS.map((kind) => [kind, z.number().int().nonnegative()])) as Record<(typeof BACKUP_TABLE_KINDS)[number], z.ZodNumber>;
export const tableCountsSchema = z.object(tableCountsShape).strict();

export const restoreManifestSchema = z.object({
  exportedAt: z.string().datetime({ offset: true }),
  snapshotSequence: canonicalSequenceSchema,
  chunks: z.array(z.object({
    index: z.number().int().nonnegative(),
    kind: z.enum(BACKUP_TABLE_KINDS),
    rowCount: z.number().int().nonnegative(),
    sha256: digestSchema
  }).strict()).length(BACKUP_TABLE_KINDS.length),
  tableCounts: tableCountsSchema,
  payloadDigest: digestSchema
}).strict().superRefine((manifest, context) => {
  manifest.chunks.forEach((chunk, index) => {
    if (chunk.index !== index || chunk.kind !== BACKUP_TABLE_KINDS[index] || chunk.rowCount !== manifest.tableCounts[chunk.kind]) {
      context.addIssue({ code: "custom", message: "Manifest chunks must exactly follow the backup table order.", path: ["chunks", index] });
    }
  });
});

const base = z.object({
  restoreId: z.string().uuid(),
  idempotencyKey: z.string().uuid(),
  schemaVersion: z.literal(2),
  digest: digestSchema
}).strict();

export const restoreActionSchemas = {
  stage: base.extend({ manifest: restoreManifestSchema }).strict(),
  chunk: base.extend({
    chunkIndex: z.number().int().nonnegative(),
    chunkDigest: digestSchema,
    chunk: backupChunkSchema
  }).strict(),
  commit: base,
  abort: base
} as const;

export const backupSnapshotSchema = z.object({
  schemaVersion: z.literal(2),
  exportedAt: z.string().datetime({ offset: true }),
  snapshotSequence: canonicalSequenceSchema,
  tableCounts: tableCountsSchema,
  data: backupDataSchema
}).strict().superRefine((snapshot, context) => {
  BACKUP_TABLE_KINDS.forEach((kind) => {
    if (snapshot.tableCounts[kind] !== snapshot.data[kind].length) {
      context.addIssue({ code: "custom", message: "Snapshot table count does not match its rows.", path: ["tableCounts", kind] });
    }
  });
  if (snapshot.data.mutation_sequences[0]?.sequence !== snapshot.snapshotSequence) {
    context.addIssue({ code: "custom", message: "Snapshot sequence does not match the mutation-sequence row.", path: ["snapshotSequence"] });
  }
});
