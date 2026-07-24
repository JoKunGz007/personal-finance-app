import { z } from "zod";
import { isoDateSchema } from "@/lib/dates";
import { moneySchema } from "@/lib/money";

export const componentSchema = z.object({
  kind: z.enum(["deposit", "withdrawal"]),
  amount: moneySchema
}).strict().superRefine((component, context) => {
  const amount = BigInt(component.amount.minor);
  if (component.kind === "deposit" && amount <= 0n) context.addIssue({ code: "custom", message: "Deposits must be positive." });
  if (component.kind === "withdrawal" && amount >= 0n) context.addIssue({ code: "custom", message: "Withdrawals must be negative." });
});

export const sourceRowCandidateSchema = z.object({
  sourceDate: isoDateSchema,
  sourceTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/).nullable(),
  effectiveDate: isoDateSchema,
  transactionLabel: z.string().trim().min(1).max(160),
  description: z.string().trim().min(1).max(500),
  reference: z.string().trim().max(200).nullable(),
  branch: z.string().trim().max(160).nullable(),
  components: z.array(componentSchema).min(1).max(2),
  postBalance: moneySchema,
  provenance: z.object({
    page: z.number().int().positive(),
    row: z.number().int().positive(),
    parserFields: z.record(z.string(), z.unknown())
  }).strict()
}).strict().superRefine((row, context) => {
  const currencies = new Set([...row.components.map((item) => item.amount.currency), row.postBalance.currency]);
  if (currencies.size !== 1) context.addIssue({ code: "custom", message: "Mixed currencies are not supported." });
  if (row.components.length === 2) {
    const kinds = row.components.map((item) => item.kind).sort().join(":");
    if (kinds !== "deposit:withdrawal") context.addIssue({ code: "custom", message: "Compound rows require one interest deposit and one tax withdrawal." });
  }
});

export const importPayloadSchema = z.object({
  contractVersion: z.literal("krungthai-layout-v1"),
  fingerprintVersion: z.literal("fingerprint-v1"),
  accountId: z.string().uuid(),
  bankCode: z.literal("KTB"),
  currency: z.literal("THB"),
  periodStart: isoDateSchema,
  periodEnd: isoDateSchema,
  openingBalance: moneySchema,
  closingBalance: moneySchema,
  rows: z.array(sourceRowCandidateSchema).min(1).max(5000)
}).strict().superRefine((payload, context) => {
  if (payload.periodStart > payload.periodEnd) context.addIssue({ code: "custom", message: "Statement period is inverted.", path: ["periodEnd"] });
  if (payload.openingBalance.currency !== payload.currency || payload.closingBalance.currency !== payload.currency) {
    context.addIssue({ code: "custom", message: "Statement-frame currency must match.", path: ["currency"] });
  }
  payload.rows.forEach((row, index) => {
    if (row.sourceDate < payload.periodStart || row.sourceDate > payload.periodEnd) {
      context.addIssue({ code: "custom", message: "Source date is outside the statement period.", path: ["rows", index, "sourceDate"] });
    }
  });
});

export type TransactionComponentCandidate = z.infer<typeof componentSchema>;
export type SourceRowCandidate = z.infer<typeof sourceRowCandidateSchema>;
export type ImportPayload = z.infer<typeof importPayloadSchema>;
