import { z } from "zod";
import { isoDateSchema } from "@/lib/dates";
import { minorUnitStringSchema, toMinorAmount } from "@/lib/money";
import { applyCorrection, correctionFields, refineCorrection } from "@/lib/corrections";
import { BANK_CODES } from "@/lib/statement-frame";
import { readSlipQr } from "@/lib/slip-qr";

// The wire contract for capturing a slip, and the one place the QR and the owner's typed
// values are checked against each other.
//
// D-050 splits the two deliberately: **the QR supplies identity, the owner supplies the
// values.** That split is only real if nothing lets a client claim an identity the QR does
// not carry — otherwise a mistyped bank would silently write a slip that no statement can
// ever reconcile. So the payload carries the QR text, and the bank and reference are
// re-derived from it here rather than trusted as sent.

export const SLIP_KINDS = ["deposit", "withdrawal"] as const;

// A slip is money moving today, not a statement covering a period. The window is generous
// enough for a slip found in the camera roll weeks later and narrow enough that a Buddhist
// year typed through unconverted — 543 years ahead — cannot pass. `capture_slip` enforces
// the same bound server-side; this copy exists so the form can say so before submitting.
export const SLIP_MAX_AGE_YEARS = 10;

export const slipCaptureSchema = z.object({
  qrPayload: z.string().min(1).max(512),
  bankCode: z.enum(BANK_CODES),
  bankQrCode: z.string().regex(/^\d{3}$/),
  slipReference: z.string().regex(/^[0-9A-Za-z]{1,64}$/),
  kind: z.enum(SLIP_KINDS),
  amountMinor: minorUnitStringSchema,
  currency: z.literal("THB"),
  occurredOn: isoDateSchema,
  occurredAtTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(),
  counterparty: z.string().trim().min(1).max(240).nullable(),
  categoryId: z.string().uuid().nullable(),
  note: z.string().trim().min(1).max(2000).nullable()
}).strict().superRefine((slip, context) => {
  const amount = toMinorAmount(slip.amountMinor);
  if (amount !== null && ((slip.kind === "deposit" && amount <= 0n) || (slip.kind === "withdrawal" && amount >= 0n))) {
    context.addIssue({ code: "custom", message: "The amount's sign does not match the slip's direction.", path: ["amountMinor"] });
  }

  // The identity check. Re-reading the payload here means the bank and reference stored are
  // the ones the QR actually carried, CRC and all — a client cannot assert them.
  const read = readSlipQr(slip.qrPayload);
  if (!read.ok) {
    context.addIssue({ code: "custom", message: `The slip QR was not readable: ${read.message}`, path: ["qrPayload"] });
    return;
  }
  if (read.identity.bankCode !== slip.bankCode || read.identity.bankQrCode !== slip.bankQrCode) {
    context.addIssue({ code: "custom", message: "The declared bank does not match the slip QR.", path: ["bankCode"] });
  }
  if (read.identity.reference !== slip.slipReference) {
    context.addIssue({ code: "custom", message: "The declared reference does not match the slip QR.", path: ["slipReference"] });
  }
});

export type SlipCapture = z.infer<typeof slipCaptureSchema>;

// The read contract for GET /api/v1/slips, which returns `public.slips` for the owner.
// Column names stay as the database returns them, matching every other read endpoint, and
// money arrives as canonical text because the route stringifies the bigint (D-018).
//
// Strict on purpose, like the overlay schema: a migration adding a column to `public.slips`
// should fail this parse loudly rather than have the ledger view quietly ignore a field the
// database now considers part of a slip.
export const capturedSlipSchema = z.object({
  id: z.string().uuid(),
  bank_code: z.enum(BANK_CODES),
  slip_reference: z.string(),
  kind: z.enum(SLIP_KINDS),
  amount_minor: minorUnitStringSchema,
  currency: z.literal("THB"),
  occurred_on: isoDateSchema,
  occurred_at_time: z.string().nullable(),
  counterparty: z.string().nullable(),
  category_id: z.string().uuid().nullable(),
  note: z.string().nullable(),
  captured_at: z.string()
}).strict();

/**
 * A decision the owner stored about one slip (migration 012, D-067).
 *
 * `matched` names the statement row, `unmatched` says this slip is none of them, and the
 * absence of a row means no decision has been made and the automatic rule applies. Strict for
 * the same reason the slip schema is: this is the shape the ledger view reasons about, and a
 * column the database later considers part of a decision must fail loudly here.
 */
export const slipMatchDecisionSchema = z.object({
  slip_id: z.string().uuid(),
  decision: z.enum(["matched", "unmatched"]),
  transaction_id: z.string().uuid().nullable(),
  revision: z.number().int().nonnegative()
}).strict();

export type SlipMatchDecision = z.infer<typeof slipMatchDecisionSchema>;

/**
 * A correction the owner stored against one slip (migration 013, PLAN task 22).
 *
 * The correctable half is what the owner typed; `bank_code`, `slip_reference` and the QR
 * payload are absent from the overlay entirely, because those came from the QR under its own
 * CRC and a correctable identity would let one slip be re-typed into another's.
 *
 * The shared shape and the null-means-uncorrected rule are in `lib/corrections.ts`.
 */
export const slipCorrectionSchema = z.object({
  slip_id: z.string().uuid(),
  ...correctionFields
}).strict().superRefine(refineCorrection);

export type SlipCorrection = z.infer<typeof slipCorrectionSchema>;

export const slipCorrectionResponseSchema = z.object({ correction: slipCorrectionSchema }).strict();

/**
 * Slips, their decisions and their corrections travel together, on one response, deliberately.
 *
 * A decision is meaningless without its slip, and two endpoints mean two failure modes — the
 * dangerous one being slips arriving while their decisions do not, which shows the owner a
 * pairing they have already overruled and reports it as the rule's own. One response cannot
 * half-arrive: the ledger view already treats a slips failure as "no slips shown", and that
 * degradation stays honest only while a decision cannot go missing on its own.
 *
 * Corrections are on the same response for a sharper version of the same argument. A slip
 * whose correction went missing shows its **original** amount, and the ledger would then
 * reconcile, total and offer candidates on a figure the owner has already replaced — which is
 * exactly the defect migration 014 had to fix on the write side, arriving through the read.
 */
export const slipListSchema = z.object({
  slips: z.array(capturedSlipSchema),
  matches: z.array(slipMatchDecisionSchema),
  corrections: z.array(slipCorrectionSchema)
}).strict();

export type CapturedSlip = z.infer<typeof capturedSlipSchema>;

/**
 * Each slip as it stands after its correction, resolved once at the edge of the read path.
 *
 * Everything downstream — the match rule, the manual candidate list, the totals and the row
 * itself — then reads the figure in force without having to remember to ask. Migration 014 is
 * the argument: on the write side, comparing a slip's *original* amount against a statement row
 * both refused correct pairings and accepted wrong ones, and a read path that resolved
 * corrections in some places and not others would reproduce that silently.
 *
 * The originals are not lost — they are still `slips`, and the overlay is still `corrections`,
 * so a view that wants to say "you corrected this" has both halves to compare.
 */
export function slipsInForce(
  slips: readonly CapturedSlip[],
  corrections: readonly SlipCorrection[] = []
): CapturedSlip[] {
  const bySlip = new Map(corrections.map((correction) => [correction.slip_id, correction]));
  return slips.map((slip) => applyCorrection(slip, bySlip.get(slip.id)));
}

/**
 * The write contract for `PUT /api/v1/slips/[id]/match`, mirroring `set_slip_match`.
 *
 * The null travels *with* the decision rather than being implied by it: the RPC and the table's
 * CHECK both require `transaction_id` to be present exactly when the decision is `matched`, so
 * a client that sends one without the other is refused here rather than by the database, where
 * the message would have to be translated back into something the form can say.
 *
 * `expectedRevision` is optimistic concurrency, exactly as the transaction overlay does it
 * (D-067): 0 means "I believe no decision exists". Two tabs disagreeing about a match is worth
 * surfacing, because the loser's intent is invisible afterwards.
 */
export const slipMatchRequestSchema = z.object({
  expectedRevision: z.number().int().nonnegative(),
  decision: z.enum(["matched", "unmatched"]),
  transactionId: z.string().uuid().nullable()
}).strict().superRefine((match, context) => {
  if ((match.decision === "matched") !== (match.transactionId !== null)) {
    context.addIssue({
      code: "custom",
      message: "A match names a statement row and an undo names none.",
      path: ["transactionId"]
    });
  }
});

export type SlipMatchRequest = z.infer<typeof slipMatchRequestSchema>;

export const slipMatchResponseSchema = z.object({ match: slipMatchDecisionSchema }).strict();

// Offsets at which a reference has been observed to begin with a date: SCB starts with one
// outright, and Krungthai's 21-character variant puts a single letter in front. Only these
// two are tried, because every additional offset is another chance to read eight unrelated
// digits as a date.
const DATE_OFFSETS = [0, 1] as const;

/**
 * The transaction date carried inside the QR reference, when there is one.
 *
 * Measured over the 23 real samples: SCB 9/9 and Krungthai's 21-character variant 5/5 embed
 * a `YYYYMMDD`; Krungthai's 17-character variant and KBANK carry none (D-059). Reference
 * *lengths* are deliberately not keyed on — D-057 established that pinning them refuses
 * legitimate slips — so this reads the shape and lets implausible values fall out.
 *
 * Returns null unless the digits parse as a real calendar date **inside the window the form
 * would accept**, which is what stops it pre-filling something the server then refuses. This
 * is exact rather than inferred: the reference is covered by the QR's CRC, so a date read
 * here is the bank's own, not a guess from pixels. The owner still confirms it.
 */
export function slipDateFromReference(
  reference: string,
  window: { earliest: string; latest: string }
): string | null {
  for (const offset of DATE_OFFSETS) {
    const digits = reference.slice(offset, offset + 8);
    if (digits.length !== 8 || !/^\d{8}$/.test(digits)) continue;
    const candidate = `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
    // `isoDateSchema` rejects impossible days such as 2026-02-30, so a run of digits that
    // merely looks date-shaped does not survive.
    if (!isoDateSchema.safeParse(candidate).success) continue;
    if (candidate < window.earliest || candidate > window.latest) continue;
    return candidate;
  }
  return null;
}

export function slipDateWindow(today: Date): { earliest: string; latest: string } {
  const latest = new Date(today);
  latest.setUTCDate(latest.getUTCDate() + 1);
  const earliest = new Date(today);
  earliest.setUTCFullYear(earliest.getUTCFullYear() - SLIP_MAX_AGE_YEARS);
  return { earliest: earliest.toISOString().slice(0, 10), latest: latest.toISOString().slice(0, 10) };
}
