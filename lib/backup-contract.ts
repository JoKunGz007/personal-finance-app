import { z } from "zod";
import { isoDateSchema } from "@/lib/dates";
import { minorUnitStringSchema, toMinorAmount } from "@/lib/money";
import { BANK_CODES, CONTRACT_VERSIONS } from "@/lib/statement-frame";

// Order is contract, not style. A manifest binds each chunk to its index, so `slips` is
// appended rather than slotted in alphabetically: indices 0..10 keep meaning exactly what
// they meant in schema v2, and a v2 payload therefore stages against the same descriptors
// it always did. Inserting a kind in the middle would invalidate every existing descriptor
// in a way no digest could distinguish from tampering.
export const BACKUP_TABLE_KINDS_V2 = [
  "accounts", "categories", "import_artifacts", "import_batches", "source_transactions",
  "source_components", "import_batch_rows", "transaction_overlays", "overlay_revisions",
  "audit_events", "mutation_sequences"
] as const;

export const BACKUP_TABLE_KINDS_V3 = [...BACKUP_TABLE_KINDS_V2, "slips"] as const;

// v4 appends the owner's match decisions and their history (migration 012). Appended for the
// same reason `slips` was: indices 0..11 keep meaning exactly what they meant in v3.
export const BACKUP_TABLE_KINDS_V4 = [
  ...BACKUP_TABLE_KINDS_V3, "slip_match_overlays", "slip_match_revisions"
] as const;

// v5 appends cash entries and the two correction overlays with their histories (migration
// 013). Same rule again: indices 0..13 keep meaning exactly what they meant in v4.
export const BACKUP_TABLE_KINDS = [
  ...BACKUP_TABLE_KINDS_V4,
  "cash_entries", "cash_entry_overlays", "cash_entry_revisions",
  "slip_correction_overlays", "slip_correction_revisions"
] as const;

export type BackupTableKind = (typeof BACKUP_TABLE_KINDS)[number];

// The owner holds exactly one backup covering the whole ledger and it is **still a v2 file**.
// Reading it stays supported for that reason — a hard bump, the way pre-release v1 was
// dropped (D-018), would have stranded the only complete backup in existence the moment
// migration 011 landed, and neither 012 nor 013 changes that arithmetic. Every version ever
// written stays readable; new backups are always written at the current version.
export const BACKUP_SCHEMA_VERSION = 5;
export const SUPPORTED_BACKUP_SCHEMA_VERSIONS = [2, 3, 4, 5] as const;

export function backupTableKindsFor(schemaVersion: number): readonly BackupTableKind[] {
  if (schemaVersion === 2) return BACKUP_TABLE_KINDS_V2;
  if (schemaVersion === 3) return BACKUP_TABLE_KINDS_V3;
  if (schemaVersion === 4) return BACKUP_TABLE_KINDS_V4;
  return BACKUP_TABLE_KINDS;
}

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
  // `toMinorAmount` rather than a bare cast: an object refinement still runs when the
  // field it reads has already failed, so casting here would throw out of a `safeParse`
  // that a restore route depends on to fail closed.
  const amount = toMinorAmount(component.amount_minor);
  if (amount !== null && ((component.kind === "deposit" && amount <= 0n) || (component.kind === "withdrawal" && amount >= 0n))) {
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

// A slip is a provisional entry: identity from the QR, values from the owner (D-050). It
// carries no account_id, because the QR names a bank and only the statement will later say
// which account — see migration 011.
const slipRowSchema = z.object({
  id: uuidSchema,
  owner_id: uuidSchema,
  bank_code: z.enum(BANK_CODES),
  bank_qr_code: z.string().regex(/^\d{3}$/),
  slip_reference: z.string().regex(/^[0-9A-Za-z]{1,64}$/),
  qr_payload: z.string().min(1).max(512),
  kind: z.enum(["deposit", "withdrawal"]),
  amount_minor: minorUnitStringSchema,
  currency: z.literal("THB"),
  occurred_on: isoDateSchema,
  occurred_at_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,6})?)?$/).nullable(),
  counterparty: nullableText,
  category_id: uuidSchema.nullable(),
  note: nullableText,
  captured_at: timestampSchema
}).strict().superRefine((slip, context) => {
  const amount = toMinorAmount(slip.amount_minor);
  if (amount !== null && ((slip.kind === "deposit" && amount <= 0n) || (slip.kind === "withdrawal" && amount >= 0n))) {
    context.addIssue({ code: "custom", message: "Slip sign does not match its kind." });
  }
});

// The owner's say over a match, and its append-only history (migration 012). The current
// value carries a transaction exactly when the decision is `matched`, which is a CHECK in the
// database and is re-stated here because a restore must not be able to smuggle past it.
const slipMatchOverlayRowSchema = z.object({
  slip_id: uuidSchema,
  owner_id: uuidSchema,
  decision: z.enum(["matched", "unmatched"]),
  transaction_id: uuidSchema.nullable(),
  revision: z.number().int().nonnegative(),
  updated_at: timestampSchema
}).strict().superRefine((overlay, context) => {
  if ((overlay.decision === "matched") !== (overlay.transaction_id !== null)) {
    context.addIssue({ code: "custom", message: "A matched decision must name a transaction, and an unmatched one must not." });
  }
});

const slipMatchRevisionRowSchema = z.object({
  id: uuidSchema,
  owner_id: uuidSchema,
  slip_id: uuidSchema,
  revision: z.number().int().positive(),
  snapshot: jsonObjectSchema,
  changed_at: timestampSchema,
  changed_by: uuidSchema
}).strict();

const timeOfDaySchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,6})?)?$/);

// A cash payment (migration 013). No bank, no statement, no fingerprint — which is exactly why
// it is its own kind rather than a `source_transactions` row with those columns left empty.
const cashEntryRowSchema = z.object({
  id: uuidSchema,
  owner_id: uuidSchema,
  kind: z.enum(["deposit", "withdrawal"]),
  amount_minor: minorUnitStringSchema,
  currency: z.literal("THB"),
  occurred_on: isoDateSchema,
  occurred_at_time: timeOfDaySchema.nullable(),
  counterparty: nullableText,
  category_id: uuidSchema.nullable(),
  note: nullableText,
  created_at: timestampSchema
}).strict().superRefine((entry, context) => {
  const amount = toMinorAmount(entry.amount_minor);
  if (amount !== null && ((entry.kind === "deposit" && amount <= 0n) || (entry.kind === "withdrawal" && amount >= 0n))) {
    context.addIssue({ code: "custom", message: "Cash entry sign does not match its kind." });
  }
});

/*
 * A correction overlay. Null means "not corrected" and the base row's value stands, so a
 * restore that turned an absent amount into a present one would be restoring a correction the
 * owner never made — which is why `amount_minor` is nullable here and not merely optional.
 *
 * Amount and kind are null together or present together, restated from the database CHECK for
 * the same reason the slip-match binding is: a restore must not be able to smuggle past it.
 */
function correctionOverlaySchema<const Key extends string>(key: Key) {
  return z.object({
    [key]: uuidSchema,
    owner_id: uuidSchema,
    kind: z.enum(["deposit", "withdrawal"]).nullable(),
    amount_minor: minorUnitStringSchema.nullable(),
    occurred_on: isoDateSchema.nullable(),
    occurred_at_time: timeOfDaySchema.nullable(),
    counterparty: nullableText,
    category_id: uuidSchema.nullable(),
    note: nullableText,
    revision: z.number().int().nonnegative(),
    updated_at: timestampSchema
  } as Record<string, z.ZodTypeAny>).strict().superRefine((overlay, context) => {
    const kind = overlay.kind as "deposit" | "withdrawal" | null;
    const raw = overlay.amount_minor as string | null;
    if ((kind === null) !== (raw === null)) {
      context.addIssue({ code: "custom", message: "A corrected amount and its kind must be present together." });
      return;
    }
    if (raw === null) return;
    const amount = toMinorAmount(raw);
    if (amount !== null && ((kind === "deposit" && amount <= 0n) || (kind === "withdrawal" && amount >= 0n))) {
      context.addIssue({ code: "custom", message: "Corrected sign does not match its kind." });
    }
  });
}

function correctionRevisionSchema<const Key extends string>(key: Key) {
  return z.object({
    id: uuidSchema,
    owner_id: uuidSchema,
    [key]: uuidSchema,
    revision: z.number().int().positive(),
    snapshot: jsonObjectSchema,
    changed_at: timestampSchema,
    changed_by: uuidSchema
  } as Record<string, z.ZodTypeAny>).strict();
}

const cashEntryOverlayRowSchema = correctionOverlaySchema("cash_entry_id");
const cashEntryRevisionRowSchema = correctionRevisionSchema("cash_entry_id");
const slipCorrectionOverlayRowSchema = correctionOverlaySchema("slip_id");
const slipCorrectionRevisionRowSchema = correctionRevisionSchema("slip_id");

const v2DataShape = {
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
} as const;

// All three are `.strict()`, which is what makes the versions genuinely distinct rather than
// merely tolerant: a v2 payload carrying a `slips` key is refused, a v3 payload missing one
// is refused, and a v3 payload that has grown match decisions is refused too. "Accepts v2"
// must not mean "stops checking".
export const backupDataSchemaV2 = z.object(v2DataShape).strict();
const v3DataShape = { ...v2DataShape, slips: z.array(slipRowSchema) } as const;
export const backupDataSchemaV3 = z.object(v3DataShape).strict();
const v4DataShape = {
  ...v3DataShape,
  slip_match_overlays: z.array(slipMatchOverlayRowSchema),
  slip_match_revisions: z.array(slipMatchRevisionRowSchema)
} as const;
export const backupDataSchemaV4 = z.object(v4DataShape).strict();
export const backupDataSchema = z.object({
  ...v4DataShape,
  cash_entries: z.array(cashEntryRowSchema),
  cash_entry_overlays: z.array(cashEntryOverlayRowSchema),
  cash_entry_revisions: z.array(cashEntryRevisionRowSchema),
  slip_correction_overlays: z.array(slipCorrectionOverlayRowSchema),
  slip_correction_revisions: z.array(slipCorrectionRevisionRowSchema)
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
  chunkSchema("mutation_sequences", mutationSequenceRowSchema),
  chunkSchema("slips", slipRowSchema),
  chunkSchema("slip_match_overlays", slipMatchOverlayRowSchema),
  chunkSchema("slip_match_revisions", slipMatchRevisionRowSchema),
  chunkSchema("cash_entries", cashEntryRowSchema),
  chunkSchema("cash_entry_overlays", cashEntryOverlayRowSchema),
  chunkSchema("cash_entry_revisions", cashEntryRevisionRowSchema),
  chunkSchema("slip_correction_overlays", slipCorrectionOverlayRowSchema),
  chunkSchema("slip_correction_revisions", slipCorrectionRevisionRowSchema)
]);

function tableCountsFor(kinds: readonly BackupTableKind[]) {
  return z.object(
    Object.fromEntries(kinds.map((kind) => [kind, z.number().int().nonnegative()])) as Record<string, z.ZodNumber>
  ).strict();
}

export const tableCountsSchemaV2 = tableCountsFor(BACKUP_TABLE_KINDS_V2);
export const tableCountsSchema = tableCountsFor(BACKUP_TABLE_KINDS);

function manifestFor(kinds: readonly BackupTableKind[]) {
  return z.object({
    exportedAt: z.string().datetime({ offset: true }),
    snapshotSequence: canonicalSequenceSchema,
    chunks: z.array(z.object({
      index: z.number().int().nonnegative(),
      kind: z.enum(BACKUP_TABLE_KINDS),
      rowCount: z.number().int().nonnegative(),
      sha256: digestSchema
    }).strict()).length(kinds.length),
    tableCounts: tableCountsFor(kinds),
    payloadDigest: digestSchema
  }).strict().superRefine((manifest, context) => {
    manifest.chunks.forEach((chunk, index) => {
      if (chunk.index !== index || chunk.kind !== kinds[index] || chunk.rowCount !== manifest.tableCounts[chunk.kind]) {
        context.addIssue({ code: "custom", message: "Manifest chunks must exactly follow the backup table order.", path: ["chunks", index] });
      }
    });
  });
}

export const restoreManifestSchemaV2 = manifestFor(BACKUP_TABLE_KINDS_V2);
export const restoreManifestSchemaV3 = manifestFor(BACKUP_TABLE_KINDS_V3);
export const restoreManifestSchemaV4 = manifestFor(BACKUP_TABLE_KINDS_V4);
export const restoreManifestSchema = manifestFor(BACKUP_TABLE_KINDS);

// Version is part of the request rather than a constant, and the manifest that travels
// with it is validated against *that* version's table list. The two cannot drift: a v2
// request carrying a twelve-chunk manifest fails, and so does a v3 request carrying eleven.
const identity = {
  restoreId: z.string().uuid(),
  idempotencyKey: z.string().uuid(),
  digest: digestSchema
} as const;

const baseV2 = z.object({ ...identity, schemaVersion: z.literal(2) }).strict();
const baseV3 = z.object({ ...identity, schemaVersion: z.literal(3) }).strict();
const baseV4 = z.object({ ...identity, schemaVersion: z.literal(4) }).strict();
const baseV5 = z.object({ ...identity, schemaVersion: z.literal(5) }).strict();

// Each version keeps its own kind list, so a v2 request is still checked against eleven
// chunks and a v3 against twelve. Widening the union is not the same as relaxing it.
function actionUnion<Shape extends z.ZodRawShape>(extend: (kinds: readonly BackupTableKind[]) => Shape) {
  return z.discriminatedUnion("schemaVersion", [
    baseV2.extend(extend(BACKUP_TABLE_KINDS_V2)).strict(),
    baseV3.extend(extend(BACKUP_TABLE_KINDS_V3)).strict(),
    baseV4.extend(extend(BACKUP_TABLE_KINDS_V4)).strict(),
    baseV5.extend(extend(BACKUP_TABLE_KINDS)).strict()
  ]);
}

export const restoreActionSchemas = {
  stage: actionUnion((kinds) => ({ manifest: manifestFor(kinds) })),
  chunk: actionUnion(() => ({
    chunkIndex: z.number().int().nonnegative(),
    chunkDigest: digestSchema,
    chunk: backupChunkSchema
  })),
  commit: z.discriminatedUnion("schemaVersion", [baseV2, baseV3, baseV4, baseV5]),
  abort: z.discriminatedUnion("schemaVersion", [baseV2, baseV3, baseV4, baseV5])
} as const;

function snapshotFor<Data extends z.ZodType>(
  version: (typeof SUPPORTED_BACKUP_SCHEMA_VERSIONS)[number],
  kinds: readonly BackupTableKind[],
  data: Data
) {
  return z.object({
    schemaVersion: z.literal(version),
    exportedAt: z.string().datetime({ offset: true }),
    snapshotSequence: canonicalSequenceSchema,
    tableCounts: tableCountsFor(kinds),
    data
  }).strict().superRefine((value, context) => {
    const snapshot = value as { tableCounts: Record<string, number>; data: Record<string, unknown[]>; snapshotSequence: string };
    const rows = snapshot.data;
    kinds.forEach((kind) => {
      if (snapshot.tableCounts[kind] !== rows[kind]?.length) {
        context.addIssue({ code: "custom", message: "Snapshot table count does not match its rows.", path: ["tableCounts", kind] });
      }
    });
    const sequences = rows.mutation_sequences as Array<{ sequence: string }> | undefined;
    if (sequences?.[0]?.sequence !== snapshot.snapshotSequence) {
      context.addIssue({ code: "custom", message: "Snapshot sequence does not match the mutation-sequence row.", path: ["snapshotSequence"] });
    }
  });
}

export const backupSnapshotSchemaV2 = snapshotFor(2, BACKUP_TABLE_KINDS_V2, backupDataSchemaV2);
export const backupSnapshotSchemaV3 = snapshotFor(3, BACKUP_TABLE_KINDS_V3, backupDataSchemaV3);
export const backupSnapshotSchemaV4 = snapshotFor(4, BACKUP_TABLE_KINDS_V4, backupDataSchemaV4);
export const backupSnapshotSchemaV5 = snapshotFor(5, BACKUP_TABLE_KINDS, backupDataSchema);

// What a restore accepts. A snapshot read off disk is one of these and nothing else — the
// union discriminates on the payload's own declared version rather than sniffing for a
// `slips` key, so a v2 file with a stray slips array is refused instead of upgraded.
export const backupSnapshotSchema = z.discriminatedUnion("schemaVersion", [
  backupSnapshotSchemaV2,
  backupSnapshotSchemaV3,
  backupSnapshotSchemaV4,
  backupSnapshotSchemaV5
]);

/**
 * What a written backup actually contains, described from the snapshot rather than from here.
 *
 * The recovery bench used to report `BACKUP_TABLE_KINDS.length` — this module's **newest**
 * table list — beside a row count it computed from the file. The row count was therefore
 * evidence and the table count was a constant, and the two disagreed the moment the server was
 * a version behind the client: on 2026-08-09 an export from a ledger still on migration 011
 * wrote twelve tables at schema v3 and announced fourteen. Nothing was wrong with the file;
 * the sentence was wrong about it, which is worse on a screen whose whole job is to tell the
 * owner what they now hold.
 *
 * Both figures now come from the snapshot, and the version is named because a person checking
 * a backup needs to know which one they are holding — v2, v3 and v4 are all still restorable
 * and all still in circulation here.
 */
export function describeBackupSnapshot(
  snapshot: { schemaVersion: number; tableCounts: Record<string, number> }
): string {
  const counts = Object.values(snapshot.tableCounts);
  const rows = counts.reduce((sum, count) => sum + count, 0);
  return `${rows} rows across ${counts.length} tables at schema version ${snapshot.schemaVersion}`;
}
