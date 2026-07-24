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

// Source text feeds row fingerprints, which the database independently recomputes
// (private.row_fingerprint, migration 202607240007) and enforces (migration
// 202607240008). That parity depends on NFKC agreeing between V8's ICU and
// PostgreSQL's Unicode data, which only holds for long-settled codepoints: a
// randomized 50k-string parity run diverged solely on Unicode-16-era exotics such
// as U+1CCF0. Constraining these fields to the scripts a Krungthai statement can
// actually contain excludes that class by construction, so a fingerprint mismatch
// at import means tampering or a real bug rather than expected version skew.
// Whitespace controls are allowed because both normalizers collapse them identically.
const SOURCE_TEXT_CHARSET = new RegExp(
  "^[" +
    "\\u0009-\\u000D" + // tab, newline, CR family
    "\\u0020-\\u007E" + // ASCII printable
    "\\u00A0-\\u024F" + // Latin-1 Supplement, Latin Extended-A/B
    "\\u0300-\\u036F" + // combining diacritical marks
    "\\u0E00-\\u0E7F" + // Thai
    "\\u2010-\\u205F" + // general punctuation (dashes, quotes, spaces)
    "\\u20A0-\\u20CF" + // currency symbols
    "\\u2122" + // trademark sign
    "\\uFF01-\\uFFEE" + // halfwidth and fullwidth forms
    "]*$",
  "u"
);

const sourceText = (max: number) =>
  z.string().trim().max(max).regex(SOURCE_TEXT_CHARSET, "Unsupported character in statement text.");

export const sourceRowCandidateSchema = z.object({
  sourceDate: isoDateSchema,
  sourceTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/).nullable(),
  effectiveDate: isoDateSchema,
  transactionLabel: sourceText(160).min(1),
  description: sourceText(500).min(1),
  reference: sourceText(200).nullable(),
  branch: sourceText(160).nullable(),
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
