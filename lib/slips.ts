import { z } from "zod";
import { isoDateSchema } from "@/lib/dates";
import { minorUnitStringSchema, toMinorAmount } from "@/lib/money";
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

export function slipDateWindow(today: Date): { earliest: string; latest: string } {
  const latest = new Date(today);
  latest.setUTCDate(latest.getUTCDate() + 1);
  const earliest = new Date(today);
  earliest.setUTCFullYear(earliest.getUTCFullYear() - SLIP_MAX_AGE_YEARS);
  return { earliest: earliest.toISOString().slice(0, 10), latest: latest.toISOString().slice(0, 10) };
}
