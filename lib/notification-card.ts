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
};

// Deliberately no `carriesCounterparty` flag. It existed until 2026-08-12 and said SCB Connect
// prints no counterparty, which was measured from **outgoing cards only** — an incoming SCB card
// names the sender, their masked account and their bank. Whether a counterparty is printed turns
// out to depend on the direction and on the transfer type, not on the layout, so the question is
// answered by `printsCounterparty` from the field map rather than by a per-layout boolean that
// can only be wrong half the time.
export const NOTIFICATION_CARD_LAYOUTS: readonly NotificationCardLayout[] = [
  { channel: "SCB Connect", bankCode: "SCB", yearFormat: "gregorian-4", accountMask: "last-four" },
  { channel: "KBank Live", bankCode: "KBANK", yearFormat: "buddhist-2", accountMask: "offset-one" },
  { channel: "Krungthai Connext", bankCode: "KTB", yearFormat: "buddhist-2", accountMask: "last-four" }
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

// ------------------------------------------------------------------- the printed grammar
//
// Where each field sits on a card, measured 2026-08-12 and recorded in
// `docs/NOTIFICATION_CARD_CONTRACT.md`. Three properties of the real layouts shape everything
// below, and each one rules out the obvious simpler design:
//
//   * **Anchor on labels, never on positions.** The field order, the label set and the number
//     of rows all differ per layout *and* per direction. That is the third time this repo has
//     met the lesson — D-024 and D-026 for statements, `docs/SLIP_CONTRACT.md` for slips.
//   * **Direction is printed in words as well as signed on the amount**, so the two can be
//     cross-checked and made to fail closed, the way the statement readers take direction from
//     the balance chain and check it against column geometry (D-039).
//   * **A label does not mean the same thing in both directions.** On Krungthai Connext
//     `จากบัญชี` is the owner's own account on an outgoing card and the *sender's* on an
//     incoming one, and both print four digits. Looking the label up by direction is the only
//     thing that tells them apart.

/** The card's direction, from the owner's point of view. */
export type CardDirection = "in" | "out";

/**
 * How a field is found on the card.
 *
 * `label` — the value sits beside the given label.
 *
 * `under-title` — the value is on the line below the card's title, carrying **no label of its
 * own**. Two layouts need this and they need it for different fields: SCB Connect prints its
 * amount there and KBank Live prints its timestamp there. It is deliberately not called
 * "unlabelled": an unanchored search for a time-shaped string would find LINE's own message
 * timestamp outside the card, which is a different clock and is not the transaction.
 */
export type CardFieldAnchor =
  | { readonly kind: "label"; readonly label: string }
  | { readonly kind: "under-title" };

const at = (label: string): CardFieldAnchor => ({ kind: "label", label });
const UNDER_TITLE: CardFieldAnchor = { kind: "under-title" };

/**
 * Where a layout puts each field, for one direction.
 *
 * `counterpartyName` and `counterpartyAccount` are absent on the layouts that print neither, so
 * a reader distinguishes "this layout never prints it" from "it should be here and is missing"
 * — the second is a misread and the first is not.
 */
export type CardFieldMap = {
  /** The word the card uses for this direction, wherever the layout prints it. */
  readonly directionWord: string;
  readonly amount: CardFieldAnchor;
  readonly ownAccount: CardFieldAnchor;
  readonly occurredAt: CardFieldAnchor;
  readonly balance: CardFieldAnchor;
  /**
   * Ordered alternatives, because one label is not enough on the layouts that print several
   * kinds of transfer. A Krungthai outgoing card to a bank account labels the recipient
   * `ผู้รับโอน` and their account `ไปยังบัญชี`; the same card to a wallet labels them `ไปยัง`
   * and `หมายเลข`. Both are outgoing Krungthai cards. An empty list means this layout does not
   * print the field in this direction at all, which is a different finding from "it should be
   * here and is missing" — only the second is a misread.
   */
  readonly counterpartyName: readonly CardFieldAnchor[];
  readonly counterpartyAccount: readonly CardFieldAnchor[];
};

// Measured 2026-08-12 over twelve real cards. **Both directions of all three layouts are now
// read**; the earlier gap — an incoming SCB Connect card — was filled the same day, and filling
// it overturned two things the first pass had recorded, which is why the map is built from
// measurement rather than from symmetry.
const FIELD_MAPS: Readonly<Record<NotificationCardLayout["channel"], Partial<Record<CardDirection, CardFieldMap>>>> = {
  "SCB Connect": {
    in: {
      directionWord: "รายการเงินเข้า",
      amount: UNDER_TITLE,
      // The collision, and it is not Krungthai's alone: on an outgoing SCB card `จากบัญชี` is
      // the owner's own account, and on an incoming one it is the *sender's*.
      ownAccount: at("เข้าบัญชี"),
      occurredAt: at("วันที่/เวลา"),
      balance: at("ยอดเงินที่ใช้ได้"),
      // One row carries the sender's name, their masked account and their bank, wrapping onto a
      // second line when it is long — so name and account share an anchor here rather than
      // having one each.
      counterpartyName: [at("จากบัญชี")],
      counterpartyAccount: [at("จากบัญชี")]
    },
    out: {
      directionWord: "รายการเงินออก",
      amount: UNDER_TITLE,
      ownAccount: at("จากบัญชี"),
      occurredAt: at("วันที่/เวลา"),
      balance: at("ยอดเงินที่ใช้ได้"),
      // A bill payment prints a `รายการ` description instead of a counterparty account, and a
      // plain transfer prints neither. Nothing outgoing has named an account, so nothing here
      // claims one.
      counterpartyName: [],
      counterpartyAccount: []
    }
  },
  "KBank Live": {
    in: {
      directionWord: "รายการเงินเข้า",
      amount: at("จำนวนเงิน"),
      ownAccount: at("เข้าบัญชี"),
      occurredAt: UNDER_TITLE,
      balance: at("ยอดเงินคงเหลือ"),
      counterpartyName: [],
      counterpartyAccount: []
    },
    out: {
      directionWord: "รายการโอน/ถอน",
      amount: at("จำนวนเงิน"),
      ownAccount: at("จากบัญชี"),
      occurredAt: UNDER_TITLE,
      balance: at("ยอดเงินคงเหลือ"),
      counterpartyName: [],
      counterpartyAccount: []
    }
  },
  "Krungthai Connext": {
    in: {
      // The direction word *is* the amount's label on this layout, which is why the two anchors
      // are the same string rather than one referring to the other.
      directionWord: "เงินเข้า",
      amount: at("เงินเข้า"),
      ownAccount: at("เข้าบัญชี"),
      occurredAt: at("วันที่ทำรายการ"),
      balance: at("ยอดที่ใช้ได้"),
      counterpartyName: [at("ผู้โอน")],
      counterpartyAccount: [at("จากบัญชี")]
    },
    out: {
      directionWord: "เงินออก",
      amount: at("เงินออก"),
      // The collision again: this same label names the counterparty's account one direction up.
      ownAccount: at("จากบัญชี"),
      occurredAt: at("วันที่ทำรายการ"),
      balance: at("ยอดที่ใช้ได้"),
      // Two measured variants of one outgoing card: to a bank account, and to a wallet.
      counterpartyName: [at("ผู้รับโอน"), at("ไปยัง")],
      counterpartyAccount: [at("ไปยังบัญชี"), at("หมายเลข")]
    }
  }
};

/**
 * Where each field sits, for one layout in one direction.
 *
 * Returns `null` for a combination no real card has ever been read for, which is a refusal
 * rather than a gap to fill in by analogy. **Every combination is measured as of 2026-08-12**,
 * so `null` is currently unreachable — it stays because the alternative, once a fourth layout
 * or a new direction appears, is inventing a label for it, and that is the shape of D-031.
 */
export function fieldMapFor(layout: NotificationCardLayout, direction: CardDirection): CardFieldMap | null {
  return FIELD_MAPS[layout.channel][direction] ?? null;
}

/**
 * Whether this layout names the other side of the transfer, in this direction.
 *
 * A question about a direction and not about a bank, which is the correction 2026-08-12 forced:
 * an incoming SCB Connect card names the sender while an outgoing one does not, so the flag
 * this replaces was wrong for half of that layout's cards.
 */
export function printsCounterparty(layout: NotificationCardLayout, direction: CardDirection): boolean {
  const map = fieldMapFor(layout, direction);
  return map !== null && map.counterpartyName.length > 0;
}

/** The `kind` this ledger stores for a card direction, in the vocabulary every table shares. */
export function kindForDirection(direction: CardDirection): "deposit" | "withdrawal" {
  return direction === "in" ? "deposit" : "withdrawal";
}

type DirectionWord = {
  readonly channel: NotificationCardLayout["channel"];
  readonly direction: CardDirection;
  readonly word: string;
};

// Every direction word any layout prints, flattened once. `readDirection` compares against all
// of them rather than only the caller's layout, which is what lets it notice that a card was
// paired with the wrong layout — see the nesting note there.
const DIRECTION_WORDS: readonly DirectionWord[] = Object.entries(FIELD_MAPS).flatMap(
  ([channel, byDirection]) => Object.entries(byDirection).map(([direction, map]) => ({
    channel: channel as NotificationCardLayout["channel"],
    direction: direction as CardDirection,
    word: map.directionWord
  }))
);

export type CardDirectionWordReading =
  | { readonly outcome: "read"; readonly direction: CardDirection }
  | { readonly outcome: "unrecognised" };

/**
 * The direction the card's *words* say, with no reference to the amount.
 *
 * Split out of `readDirection` so the reader can select a field map before any amount exists:
 * the grammar is looked up per layout **and per direction**, so the direction has to be known
 * first, while the amount is typed by the owner at the end (D-087). `readDirection` then runs
 * the same reading against the typed sign as the cross-check D-099 requires. **One
 * implementation, deliberately** — the nesting rule below is a defect this module already had
 * once, and a second copy of it is a second chance to lose it.
 */
export function readDirectionWord(layout: NotificationCardLayout, printedWords: string): CardDirectionWordReading {
  const mine = DIRECTION_WORDS.filter((entry) => entry.channel === layout.channel && printedWords.includes(entry.word));
  // Exactly one of this layout's words must appear. "The first one found" is deliberately not
  // the rule: text matching both directions was misread and text matching neither is a layout
  // that has changed, and both are refusals rather than a direction chosen on a tie-break.
  if (mine.length !== 1) return { outcome: "unrecognised" };
  const reading = mine[0]!;
  // Then reject a match that is really part of a longer word belonging to another layout, and
  // note that this is not tidiness. **Thai has no word separator**, so a plain substring test
  // cannot tell a word from part of a longer one: KBank Live's incoming title `รายการเงินเข้า`
  // *contains* Krungthai Connext's incoming word `เงินเข้า`. Without this, Krungthai's grammar
  // reads a KBank card happily — and the account digits are then matched with the wrong mask,
  // which is the failure this whole module exists to prevent.
  const eclipsed = DIRECTION_WORDS.some(
    (other) => other.word !== reading.word && other.word.includes(reading.word) && printedWords.includes(other.word)
  );
  if (eclipsed) return { outcome: "unrecognised" };
  return { outcome: "read", direction: reading.direction };
}

export type CardDirectionReading =
  | { readonly outcome: "read"; readonly direction: CardDirection; readonly kind: "deposit" | "withdrawal" }
  | { readonly outcome: "unrecognised" }
  | { readonly outcome: "contradicted"; readonly byWords: CardDirection; readonly bySign: CardDirection };

/**
 * Which way the money went, from the two signals the card prints independently.
 *
 * Every layout names the direction in words *and* signs the amount, so this takes both and
 * **refuses when they disagree** rather than trusting either. A contradiction is not a tie to
 * be broken: it means one of the two was misread, and a card stored on the strength of the
 * surviving signal would be a payment recorded backwards — which no later correction fully
 * undoes on an append-only row.
 *
 * Zero is `unrecognised` rather than a direction: no card prints a zero movement, so a zero
 * here is a failed amount read wearing a plausible shape. A zero *balance* is a different
 * matter and is perfectly ordinary — two measured cards carry one.
 *
 * **What this cannot do, stated so nobody relies on it.** It catches a card paired with the
 * wrong layout only where the vocabularies differ. SCB Connect and KBank Live print the
 * *identical* incoming title `รายการเงินเข้า`, so nothing in the printed words distinguishes
 * those two, and the channel must come from the LINE conversation the screenshot was taken in
 * rather than from the card body.
 */
export function readDirection(
  layout: NotificationCardLayout,
  printedWords: string,
  signedAmountMinor: bigint
): CardDirectionReading {
  const byWords = readDirectionWord(layout, printedWords);
  if (byWords.outcome !== "read") return { outcome: "unrecognised" };
  if (signedAmountMinor === 0n) return { outcome: "unrecognised" };
  const bySign: CardDirection = signedAmountMinor > 0n ? "in" : "out";
  if (byWords.direction !== bySign) return { outcome: "contradicted", byWords: byWords.direction, bySign };
  return { outcome: "read", direction: bySign, kind: kindForDirection(bySign) };
}
