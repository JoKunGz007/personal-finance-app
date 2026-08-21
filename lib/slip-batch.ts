import { toMinorAmount, type MinorUnitString } from "@/lib/money";
import { proposeAmount, readPrintedDate, type OcrWord } from "@/lib/slip-ocr";
import { slipDateFromReference, type SlipKind } from "@/lib/slips";
import { type BankCode } from "@/lib/statement-frame";

/**
 * Bulk slip upload's policy layer: many slips in, one verdict each, no pixels and no network.
 *
 * The separation is the one `lib/slip-scan.ts` already makes and for the same reason — the
 * interesting decisions here are about *when a slip may be filed without the owner looking at it*,
 * and a decision that can only be exercised through a browser is a decision nothing tests. The
 * component supplies the QR reading and the recognised words; everything below is arithmetic and
 * rules over them.
 *
 * ## What makes filing a slip unseen safe at all
 *
 * **Identity never comes from OCR.** The bank and the transaction reference come out of the QR
 * under its own CRC and are re-derived server-side from the payload (`lib/slips.ts`), so no
 * misreading can put a slip under the wrong identity. And re-capturing a slip already in the ledger
 * writes nothing (migration 011), so a batch may be re-run over the same files without duplicating
 * anything.
 *
 * What is *not* protected that way is the amount, the date and the direction, and each is handled
 * differently below because each fails differently.
 */

/** Where a batch slip's date came from. Both are exact; neither is "today". */
export type SlipDateSource = "qr" | "printed";

export type ResolvedSlipDate = {
  readonly occurredOn: string;
  /** `HH:MM` when the printed date carried one. The QR reference never does. */
  readonly occurredAtTime: string | null;
  readonly source: SlipDateSource;
};

export type SlipDateResolution =
  | { readonly ok: true; readonly date: ResolvedSlipDate }
  | { readonly ok: false; readonly reason: string };

/**
 * The transaction's date, from the QR reference first and the printed slip second.
 *
 * **This is the part of bulk upload that the single-slip form does not need and cannot borrow.**
 * That form defaults an unresolved date to today, which is right for a slip captured at the moment
 * of payment and wrong for a backlog — and a backlog is the whole point of uploading many at once.
 * A slip dated today that actually happened last month is worse than one left for review: slips
 * pair with statement rows inside a one-day window (`lib/slip-reconcile.ts`), so a wrongly dated
 * slip can never pair and never self-corrects. So this returns a refusal where the form returns
 * today, and the refusal is what sends the slip to the review list.
 *
 * **The QR wins over the print, and the order is not arbitrary.** The reference is covered by the
 * QR's own CRC and is already Gregorian (D-059); the printed date is pixels and is Buddhist, so it
 * carries both a recognition risk and an era conversion. When only the print has a time, that time
 * is carried alongside the QR's date — a time is not a date and nothing reconciles on it.
 *
 * **Two readings that disagree refuse rather than pick.** Nothing here can say which is right, and
 * a wrong date is the failure that cannot heal itself, so the slip goes to the owner. This costs
 * nothing when they agree, which is the ordinary case.
 */
export function resolveSlipDate(input: {
  readonly reference: string;
  readonly words: readonly OcrWord[];
  readonly window: { readonly earliest: string; readonly latest: string };
  readonly today: Date;
}): SlipDateResolution {
  // Already checked against the window by `slipDateFromReference`, which returns null rather
  // than a date the form would then be refused for.
  const fromQr = slipDateFromReference(input.reference, input.window);
  const printed = readPrintedDate(input.words, input.today);

  if (fromQr !== null) {
    if (printed.ok && printed.value.iso !== fromQr) {
      return {
        ok: false,
        reason: "The QR code's date and the date printed on this slip disagree, so neither is used."
      };
    }
    return { ok: true, date: { occurredOn: fromQr, occurredAtTime: printed.ok ? printed.value.time : null, source: "qr" } };
  }

  // The refusal's own words, which distinguish a two-digit year (KBANK, and a decision rather
  // than an oversight) from no date at all and from two candidate lines. All three mean the same
  // thing here — the owner types it — but they mean different things to whoever reads the list.
  if (!printed.ok) return { ok: false, reason: printed.message };

  // `readPrintedDate` checks the era window, not this ledger's slip window, so a date it believes
  // can still be one `capture_slip` would refuse. Checked here rather than discovered on submit.
  if (printed.value.iso < input.window.earliest || printed.value.iso > input.window.latest) {
    return { ok: false, reason: "The date printed on this slip is outside the range this ledger accepts." };
  }
  return { ok: true, date: { occurredOn: printed.value.iso, occurredAtTime: printed.value.time, source: "printed" } };
}

export type SlipBatchDecision =
  | {
    readonly status: "ready";
    readonly date: ResolvedSlipDate;
    /** The **magnitude**, in minor units. The direction supplies the sign at submit. */
    readonly amountMinor: MinorUnitString;
  }
  | { readonly status: "review"; readonly reason: string };

const READER_UNAVAILABLE = "This slip could not be read, so its amount and date need typing in.";

/**
 * One slip's verdict: file it unseen, or put it in front of the owner.
 *
 * **"Ready" means every value that could be wrong was read exactly, not that it was read
 * confidently.** The amount comes through `proposeAmount`, which finds it under its own label and
 * converts it under the strict money grammar or refuses — there is no second, lenient path, and
 * that absence is the same rule the single-slip form is held to (D-129, `tests/privacy.test.ts`).
 * The date comes from the QR's CRC-covered reference or from the printed line, never from today.
 *
 * **Direction is deliberately not decided here, and that is not an omission.** A slip prints who
 * paid whom; which of those two is the owner is not on the image and is not in this app, so no
 * amount of reading pixels can settle it. It stays one choice over the whole batch, applied by
 * `signedSlipAmount` at submit, where changing it re-signs every row without re-reading anything.
 * A direction filed wrong has the opposite sign, can never pair with any statement row, and skews
 * the totals until corrected by hand — so it is a question asked once rather than guessed many
 * times.
 */
export function classifySlip(input: {
  readonly reference: string;
  readonly bankCode: BankCode;
  /** Null when the reader could not be reached at all. */
  readonly words: readonly OcrWord[] | null;
  readonly readerRefusal: string | null;
  readonly window: { readonly earliest: string; readonly latest: string };
  readonly today: Date;
}): SlipBatchDecision {
  if (input.words === null) return { status: "review", reason: input.readerRefusal ?? READER_UNAVAILABLE };

  const amount = proposeAmount(input.words, input.bankCode);
  if (!amount.ok) return { status: "review", reason: amount.message };

  const magnitude = toMinorAmount(amount.value);
  // Defensive rather than expected: printed money carries no sign, so the grammar should never
  // produce one. Taking the magnitude means a slip can never be filed with the sign of whatever
  // the image happened to say instead of the sign the direction chose.
  if (magnitude === null || magnitude === 0n) {
    return { status: "review", reason: "The amount read off this slip is not one this ledger can store." };
  }

  const date = resolveSlipDate({ reference: input.reference, words: input.words, window: input.window, today: input.today });
  if (!date.ok) return { status: "review", reason: date.reason };

  return { status: "ready", date: date.date, amountMinor: (magnitude < 0n ? -magnitude : magnitude).toString() };
}

/**
 * The batch's direction applied to one slip's magnitude.
 *
 * The same sign convention the single-slip form uses and the same one `slipCaptureSchema`
 * cross-checks: a withdrawal is negative, a deposit positive, and a mismatch is refused before the
 * request is built rather than by the database.
 */
export function signedSlipAmount(amountMinor: MinorUnitString, kind: SlipKind): MinorUnitString {
  const magnitude = toMinorAmount(amountMinor) ?? 0n;
  const positive = magnitude < 0n ? -magnitude : magnitude;
  return (kind === "withdrawal" ? -positive : positive).toString();
}
