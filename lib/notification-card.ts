import { resolveStatementEra } from "@/lib/dates";
import { BANK_CODES } from "@/lib/statement-frame";

// Reading a bank's LINE push notification (PLAN task 27).
//
// This module is the per-layout half and nothing else: it turns what a card *prints* into
// what the ledger *stores*, for the two fields where the three layouts disagree. It knows
// nothing about the database, the wire contract or capture.
//
// **Both rules here are per-layout, and a global rule is the failure this module exists to
// prevent.** That is not caution by analogy — it is the shape of D-031, where one wrong
// global assumption about a printed year dated an entire statement 43 years early and
// parsed cleanly the whole way. Two layouts print a two-digit Buddhist year and one prints
// a four-digit Gregorian one; two print the account's last four digits and one does not.

export type CardYearFormat = "gregorian-4" | "buddhist-2";

/**
 * How a layout masks the account it names.
 *
 * `last-four` — the printed digits are the account's last four, which is exactly what
 * `public.accounts.last_four` stores. Compare directly.
 *
 * `offset-one` — KBank Live formats a ten-digit account as `xxx-x-xxxxx-x` and reveals the
 * **first four digits of the five-digit group**, masking the final digit. Those are digits
 * 6–9 of ten, while `last_four` holds digits 7–10. **They overlap by three and are one
 * digit apart**, so comparing them directly matches nothing, on every card, forever — and
 * it fails as *no such account* rather than as an error, which is the worst available
 * shape. Measured against the real ledger on 2026-08-12: four cards on `last-four` layouts
 * matched their statement rows, and two on this layout did not until the offset was
 * applied, after which they matched on account, timestamp and balance like the rest.
 */
export type CardAccountMask = "last-four" | "offset-one";

export type NotificationCardLayout = {
  /** The LINE channel as it identifies itself, kept distinct from the bank it belongs to. */
  readonly channel: "SCB Connect" | "KBank Live" | "Krungthai Connext";
  readonly bankCode: (typeof BANK_CODES)[number];
  readonly yearFormat: CardYearFormat;
  readonly accountMask: CardAccountMask;
  /** Only one layout names the other side of the transfer. Recorded so a reader does not
   *  treat its absence elsewhere as a parse failure. */
  readonly carriesCounterparty: boolean;
};

export const NOTIFICATION_CARD_LAYOUTS: readonly NotificationCardLayout[] = [
  { channel: "SCB Connect", bankCode: "SCB", yearFormat: "gregorian-4", accountMask: "last-four", carriesCounterparty: false },
  { channel: "KBank Live", bankCode: "KBANK", yearFormat: "buddhist-2", accountMask: "offset-one", carriesCounterparty: false },
  { channel: "Krungthai Connext", bankCode: "KTB", yearFormat: "buddhist-2", accountMask: "last-four", carriesCounterparty: true }
];

export function layoutForChannel(channel: NotificationCardLayout["channel"]): NotificationCardLayout {
  const layout = NOTIFICATION_CARD_LAYOUTS.find((candidate) => candidate.channel === channel);
  // Unreachable while the union above and the table agree; guarded rather than asserted,
  // because a channel added to the type and forgotten here would otherwise read as undefined.
  if (!layout) throw new Error(`No notification-card layout is registered for ${channel}.`);
  return layout;
}

/**
 * The Gregorian year a card means by the year it printed.
 *
 * A `gregorian-4` layout is returned unchanged — it is already unambiguous, and putting it
 * through two-digit resolution is precisely the global rule this module refuses.
 *
 * A `buddhist-2` layout goes through `resolveStatementEra`, which reads the two digits in
 * both calendars and keeps whichever falls inside a plausible window. That works here for
 * the same reason it works on statements: the two readings are always 543 years apart, so a
 * window narrower than that admits exactly one. A card is days old rather than months, so
 * this is a strictly easier case than the one that function was written for.
 */
export function resolveCardYear(layout: NotificationCardLayout, printedYear: number, currentYear: number): number {
  if (layout.yearFormat === "gregorian-4") {
    if (!Number.isInteger(printedYear) || printedYear < 1000 || printedYear > 9999) {
      throw new Error(`${layout.channel} prints a four-digit year; received ${printedYear}.`);
    }
    return printedYear;
  }
  if (!Number.isInteger(printedYear) || printedYear < 0 || printedYear > 99) {
    throw new Error(`${layout.channel} prints a two-digit year; received ${printedYear}.`);
  }
  return resolveStatementEra(printedYear, currentYear).year;
}

/** The digits a layout prints, as printed — never reordered or padded. */
export function assertPrintedDigits(layout: NotificationCardLayout, printed: string): void {
  if (!/^[0-9]{4}$/u.test(printed)) {
    throw new Error(`${layout.channel} prints four account digits; received ${JSON.stringify(printed)}.`);
  }
}

export type AccountDigitMatch =
  | { readonly outcome: "matched"; readonly lastFour: string }
  | { readonly outcome: "none" }
  | { readonly outcome: "ambiguous"; readonly candidates: readonly string[] };

/**
 * Which of the owner's accounts a card names, decided from the printed digits alone.
 *
 * Returns a **refusal rather than a guess** in both bad cases, and the ambiguous one is not
 * hypothetical for `offset-one`: that layout only ever pins down **three** shared digits, so
 * two KBank accounts whose last four differ only in the final digit are indistinguishable
 * from the card. Fail closed and let the owner say which — a wrong account binding on an
 * append-only row is not something a later correction can fully undo.
 *
 * `candidates` are compared against `public.accounts.last_four` values supplied by the
 * caller; this function does not read the database.
 */
export function matchAccountDigits(
  layout: NotificationCardLayout,
  printed: string,
  lastFourValues: readonly string[]
): AccountDigitMatch {
  assertPrintedDigits(layout, printed);
  const matches = lastFourValues.filter((lastFour) => {
    if (!/^[0-9]{4}$/u.test(lastFour)) return false;
    // `last-four`: the printed digits are the stored ones.
    if (layout.accountMask === "last-four") return lastFour === printed;
    // `offset-one`: the card shows digits 6–9, the ledger stores 7–10. The three they share
    // are the card's last three and the stored value's first three. The stored value's final
    // digit is the one the card masks, so nothing here can constrain it.
    return lastFour.slice(0, 3) === printed.slice(1);
  });
  const distinct = [...new Set(matches)];
  if (distinct.length === 1) return { outcome: "matched", lastFour: distinct[0]! };
  if (distinct.length === 0) return { outcome: "none" };
  return { outcome: "ambiguous", candidates: distinct };
}

/**
 * How many digits of the account a layout actually pins down.
 *
 * Stated as a value rather than left implicit because it is the honest strength of the
 * binding, and `offset-one` is weaker than it looks: four digits are printed but only three
 * of them constrain the stored account.
 */
export function boundDigitCount(layout: NotificationCardLayout): 3 | 4 {
  return layout.accountMask === "last-four" ? 4 : 3;
}
