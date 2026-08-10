import { z } from "zod";
import { isoDateSchema } from "@/lib/dates";
import { minorUnitStringSchema, toMinorAmount, type MinorUnitString } from "@/lib/money";

/**
 * The correction overlay, shared by slips and cash entries (migration 013).
 *
 * Both tables carry the same nine columns and the same two CHECKs, because both answer the
 * same question: an append-only ledger fact cannot be edited, so what the owner typed and what
 * they later corrected it to are two records rather than one mutable row. The shape lives here
 * rather than being written out twice — two hand-kept copies would drift the moment one gained
 * a field, and the field they would drift on is money.
 *
 * **Null means "not corrected", not "cleared".** The base row's value stands wherever the
 * overlay is null, and that is forced by the storage rather than chosen here: the RPCs write
 * `nullif(btrim(coalesce($1,'')),'')`, so an empty counterparty and an absent one arrive as the
 * same null and nothing distinguishes them. The consequence is worth stating plainly — a
 * correction can change a counterparty, a note or a time, but it cannot remove one. Removing
 * would need its own sentinel in the migration, and none exists.
 */
export const correctionFields = {
  kind: z.enum(["deposit", "withdrawal"]).nullable(),
  amount_minor: minorUnitStringSchema.nullable(),
  occurred_on: isoDateSchema.nullable(),
  occurred_at_time: z.string().nullable(),
  counterparty: z.string().nullable(),
  category_id: z.string().uuid().nullable(),
  note: z.string().nullable(),
  revision: z.number().int().nonnegative(),
  updated_at: z.string()
};

/**
 * The two CHECKs migration 013 puts on both overlay tables, re-asserted on the way in.
 *
 * Strict for the same reason every read schema in this app is: a row that reached the wire
 * violating them would put a withdrawal on screen as a positive number, and a total built from
 * it would be wrong in the direction nobody double-checks. Reading is where that must fail
 * loudly, not where it is quietly accommodated.
 */
export function refineCorrection(
  correction: { kind: string | null; amount_minor: string | null },
  context: z.RefinementCtx
): void {
  if ((correction.kind === null) !== (correction.amount_minor === null)) {
    context.addIssue({
      code: "custom",
      message: "A corrected amount and its direction move together.",
      path: ["amount_minor"]
    });
    return;
  }
  const amount = toMinorAmount(correction.amount_minor);
  if (amount === null) return;
  if ((correction.kind === "deposit" && amount <= 0n) || (correction.kind === "withdrawal" && amount >= 0n)) {
    context.addIssue({
      code: "custom",
      message: "The corrected amount's sign does not match its direction.",
      path: ["amount_minor"]
    });
  }
}

/**
 * The write contract both correction routes take, mirroring `set_slip_correction` and
 * `set_cash_entry_correction` parameter for parameter.
 *
 * `expectedRevision` is optimistic concurrency, as every other overlay in this app does it
 * (D-067): 0 means "I believe no correction exists". Two tabs correcting one figure is worth
 * surfacing, because the loser's intent is invisible afterwards.
 *
 * The coupling is checked here as well as in the database, so the form can say which field is
 * wrong rather than relaying a message written for a stack trace. Sending every field null is
 * a legitimate request — it clears the correction and lets the original figure stand again,
 * which is what makes a mistaken correction itself correctable.
 */
export const correctionRequestSchema = z.object({
  expectedRevision: z.number().int().nonnegative(),
  kind: z.enum(["deposit", "withdrawal"]).nullable(),
  amountMinor: minorUnitStringSchema.nullable(),
  occurredOn: isoDateSchema.nullable(),
  occurredAtTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(),
  counterparty: z.string().trim().min(1).max(240).nullable(),
  categoryId: z.string().uuid().nullable(),
  note: z.string().trim().min(1).max(2000).nullable()
}).strict().superRefine((correction, context) => {
  if ((correction.kind === null) !== (correction.amountMinor === null)) {
    context.addIssue({
      code: "custom",
      message: "A corrected amount and its direction move together.",
      path: ["amountMinor"]
    });
    return;
  }
  const amount = toMinorAmount(correction.amountMinor);
  if (amount === null) return;
  if ((correction.kind === "deposit" && amount <= 0n) || (correction.kind === "withdrawal" && amount >= 0n)) {
    context.addIssue({
      code: "custom",
      message: "The corrected amount's sign does not match its direction.",
      path: ["amountMinor"]
    });
  }
});

export type CorrectionRequest = z.infer<typeof correctionRequestSchema>;

/** The RPC arguments both correction functions take, built once from a parsed request. */
export function correctionRpcArgs(correction: CorrectionRequest): Record<string, unknown> {
  return {
    p_expected_revision: correction.expectedRevision,
    p_kind: correction.kind,
    p_amount_minor: correction.amountMinor,
    p_occurred_on: correction.occurredOn,
    p_occurred_at_time: correction.occurredAtTime,
    p_counterparty: correction.counterparty,
    p_category_id: correction.categoryId,
    p_note: correction.note
  };
}

/** The overlay's own columns, without whichever id binds it to its base row. */
export type CorrectionOverlay = {
  kind: "deposit" | "withdrawal" | null;
  amount_minor: MinorUnitString | null;
  occurred_on: string | null;
  occurred_at_time: string | null;
  counterparty: string | null;
  category_id: string | null;
  note: string | null;
  revision: number;
  updated_at: string;
};

/** What a correction may replace: the typed half of a slip or a cash entry. */
export type Correctable = {
  kind: "deposit" | "withdrawal";
  amount_minor: MinorUnitString;
  occurred_on: string;
  occurred_at_time: string | null;
  counterparty: string | null;
  category_id: string | null;
  note: string | null;
};

/**
 * The record **in force**: the correction where one stands, the original everywhere else.
 *
 * Resolved once, at the edge of the read path, so that nothing downstream has to remember to
 * ask. That is not a tidiness argument — migration 014 exists because `set_slip_match` read
 * `v_slip.amount_minor` and compared a slip's *original* figure against a statement row, which
 * both refused correct pairings and accepted wrong ones. A view that reconciled, totalled or
 * offered candidates on the uncorrected amount would reproduce that defect on the read side,
 * where nothing would raise.
 *
 * Deliberately not applied to identity. A slip's bank and reference come from the QR under its
 * own CRC and are not correctable columns at all (migration 013), so there is nothing here to
 * fall through to.
 */
export function applyCorrection<T extends Correctable>(base: T, correction: CorrectionOverlay | null | undefined): T {
  if (!correction) return base;
  return {
    ...base,
    // Kind and amount move together — the overlay's CHECK couples them — so reading one
    // corrected and the other original is unrepresentable rather than merely avoided.
    kind: correction.kind ?? base.kind,
    amount_minor: correction.amount_minor ?? base.amount_minor,
    occurred_on: correction.occurred_on ?? base.occurred_on,
    occurred_at_time: correction.occurred_at_time ?? base.occurred_at_time,
    counterparty: correction.counterparty ?? base.counterparty,
    category_id: correction.category_id ?? base.category_id,
    note: correction.note ?? base.note
  };
}

/** True when the overlay actually changes something the base row says. */
export function correctionChanges(base: Correctable, correction: CorrectionOverlay | null | undefined): boolean {
  if (!correction) return false;
  const corrected = applyCorrection(base, correction);
  return (
    corrected.kind !== base.kind ||
    corrected.amount_minor !== base.amount_minor ||
    corrected.occurred_on !== base.occurred_on ||
    corrected.occurred_at_time !== base.occurred_at_time ||
    corrected.counterparty !== base.counterparty ||
    corrected.category_id !== base.category_id ||
    corrected.note !== base.note
  );
}
