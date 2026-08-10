import { z } from "zod";
import { isoDateSchema } from "@/lib/dates";
import { minorUnitStringSchema, toMinorAmount } from "@/lib/money";
import { applyCorrection, correctionFields, refineCorrection } from "@/lib/corrections";

// The read contract for GET /api/v1/cash, which returns `public.cash_entries` and their
// correction overlays for the owner (migration 013, PLAN task 22).
//
// A cash payment is a ledger fact with no statement behind it. It has no account, no bank, no
// fingerprint and no printed balance — migration 013 records at length why admitting it to
// `source_transactions` would have meant nullable columns on all 1,465 rows that already live
// there. So it merges into the ledger view at read time exactly as a slip does (D-062), and
// unlike a slip it is never reconciled against anything: there is no statement row it could
// collapse onto, now or later.
//
// Money arrives as canonical text because the route stringifies the bigint (D-018), and the
// object is strict for the same reason every other read schema is: a migration that adds a
// column should fail this parse loudly rather than have the ledger quietly ignore a field the
// database now considers part of a cash entry.

export const CASH_KINDS = ["deposit", "withdrawal"] as const;

export const cashEntrySchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(CASH_KINDS),
  amount_minor: minorUnitStringSchema,
  currency: z.literal("THB"),
  occurred_on: isoDateSchema,
  occurred_at_time: z.string().nullable(),
  counterparty: z.string().nullable(),
  category_id: z.string().uuid().nullable(),
  note: z.string().nullable(),
  created_at: z.string()
}).strict();

export const cashCorrectionSchema = z.object({
  cash_entry_id: z.string().uuid(),
  ...correctionFields
}).strict().superRefine(refineCorrection);

/**
 * The window a cash date must fall in, and **the only place it is enforced.**
 *
 * `capture_slip` bounds a slip's date server-side, so a Buddhist-era year typed through
 * unconverted — 543 years ahead — cannot reach the slips table. `create_cash_entry` carries no
 * such bound: migration 013 refuses a null date and nothing else. That is a real gap and it is
 * recorded here rather than worked around silently, because this check is in the client and a
 * caller that skips the form skips it too. Closing it properly needs a migration, and an
 * applied migration is not edited — so it would be a new one.
 */
export const CASH_MAX_AGE_YEARS = 10;

export function cashDateWindow(today: Date): { earliest: string; latest: string } {
  const latest = new Date(today);
  latest.setUTCDate(latest.getUTCDate() + 1);
  const earliest = new Date(today);
  earliest.setUTCFullYear(earliest.getUTCFullYear() - CASH_MAX_AGE_YEARS);
  return { earliest: earliest.toISOString().slice(0, 10), latest: latest.toISOString().slice(0, 10) };
}

/**
 * The write contract for POST /api/v1/cash, mirroring `create_cash_entry`.
 *
 * No currency field: the RPC hardcodes THB and the table's CHECK enforces it, so a currency on
 * the wire would be a value the server ignores — which reads as a choice the owner does not
 * have. No idempotency key either, and that is the deliberate opposite of slip capture: a slip
 * has a QR reference that *is* an external identity, while two identical cash payments on one
 * day are an ordinary thing rather than a duplicate to collapse.
 */
export const cashCaptureSchema = z.object({
  kind: z.enum(CASH_KINDS),
  amountMinor: minorUnitStringSchema,
  occurredOn: isoDateSchema,
  occurredAtTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(),
  counterparty: z.string().trim().min(1).max(240).nullable(),
  categoryId: z.string().uuid().nullable(),
  note: z.string().trim().min(1).max(2000).nullable()
}).strict().superRefine((entry, context) => {
  const amount = toMinorAmount(entry.amountMinor);
  if (amount !== null && ((entry.kind === "deposit" && amount <= 0n) || (entry.kind === "withdrawal" && amount >= 0n))) {
    context.addIssue({ code: "custom", message: "The amount's sign does not match the entry's direction.", path: ["amountMinor"] });
  }
});

export type CashCapture = z.infer<typeof cashCaptureSchema>;

export const cashEntryResponseSchema = z.object({ entry: cashEntrySchema }).strict();
export const cashCorrectionResponseSchema = z.object({ correction: cashCorrectionSchema }).strict();

/**
 * Entries and their corrections travel on one response, for the reason slips and their
 * decisions do (D-067): the dangerous half-arrival is entries without corrections, which shows
 * the owner the figure they already corrected and reports it as the ledger's. One response
 * cannot half-arrive.
 */
export const cashListSchema = z.object({
  entries: z.array(cashEntrySchema),
  corrections: z.array(cashCorrectionSchema)
}).strict();

export type CashEntry = z.infer<typeof cashEntrySchema>;
export type CashCorrection = z.infer<typeof cashCorrectionSchema>;

/** Each entry as it stands after its correction — the cash half of `slipsInForce`. */
export function cashInForce(
  entries: readonly CashEntry[],
  corrections: readonly CashCorrection[] = []
): CashEntry[] {
  const byEntry = new Map(corrections.map((correction) => [correction.cash_entry_id, correction]));
  return entries.map((entry) => applyCorrection(entry, byEntry.get(entry.id)));
}
