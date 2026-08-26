/**
 * Every decision the notification-card capture form makes, with none of its markup.
 *
 * ## Why this module exists
 *
 * `app/notification-card-capture.tsx` was **1,081 lines and the top hot spot in the repo** — 14 of
 * the last 60 commits landed in it — while **no committed test drove a single line of it**. Every
 * rule below was asserted, if at all, by a source grep in `tests/privacy.test.ts`: a grep can say
 * that `prefill.amount.value.sign` appears inside a function, and cannot say that a card printing
 * `+` and a card printing `-` come out of it differently. The rules here decide whether an
 * **append-only** money row is written and with which sign, which is the worst place in this app
 * for the gap between "the source says so" and "the behaviour does so".
 *
 * So this is the D-150 pattern applied where D-150 said to apply it next: the decisions move to
 * `lib/` where they are pure and testable without a browser, and the component keeps its markup,
 * its file handling, its cropping and its fetches. Nothing here touches the DOM, the network or a
 * React hook, and nothing here logs.
 *
 * ## The three values that were fifteen slots
 *
 * The component carried twenty-three `useState` slots and now carries eight. The three groups below
 * were each **one concept spread across several**, which is the shape D-147 and D-148 were both
 * defects of:
 *
 * - **`CardReading`** replaces `regions`, `chosen`, `crops`, `notes`, `reading` and `readerNote`.
 *   Six slots that were only ever meaningful in combination — `crops` belonging to a `chosen` that
 *   indexes `regions` — and `null` is now the only way to have no reading at all.
 * - **`CardTyped`** replaces the nine boxes and the remembered offer. It is replaced **whole**, never
 *   in part, which is what makes "a refused field is emptied rather than inherited" (D-114) a
 *   property of the type instead of a list of nine setters that two call sites had to keep in step.
 * - **`CardResult`** replaces `status` and `error`. They were mutually exclusive in fact and
 *   independent in the type, so both could be set at once and the form would show two banners.
 *
 * ## The gate is one function, and it returns the request
 *
 * `captureRequest` is the only place that decides a card may be saved, and it answers by **building
 * the request body** rather than by returning a boolean. The component had the gate twice — once as
 * `ready`, to disable the button, and once restated at the top of `submit`, because a submit can
 * arrive by other routes — and two copies of the rule that guards an append-only row is exactly the
 * drift D-148 was. One function cannot disagree with itself, and returning the body means what
 * enables the button and what is sent are the same decision.
 */

import { bangkokToday } from "@/lib/dates";
import { parseThb } from "@/lib/money";
import {
  kindForDirection,
  matchAccountDigits,
  readDirection,
  type CardDirection,
  type CardDirectionReading,
  type NotificationCardLayout
} from "@/lib/notification-card";
import { BUDDHIST_ERA_OFFSET } from "@/lib/slip-ocr";
import { cardText, type CardFieldName, type CardRegion } from "@/lib/notification-card-ocr";
import { PREFILL_FIELDS, type CardPrefill, type PrefillField } from "@/lib/notification-card-prefill";
import type { NotificationCardCapture } from "@/lib/notification-cards";

/** One of the owner's accounts, in the shape a binding needs and nothing more. */
export type CardBindableAccount = {
  readonly id: string;
  readonly bank_code: string;
  readonly label: string;
  readonly last_four: string;
};

/** The capture window a card's date must fall inside, as `notificationCardDateWindow` reports it. */
export type CardDateWindow = { readonly earliest: string; readonly latest: string };

// ---------------------------------------------------------------------------
// What the owner has typed
// ---------------------------------------------------------------------------

/**
 * Everything the owner can type, as **one value that is only ever replaced whole**.
 *
 * These were nine `useState` slots plus `offered`, cleared by a `resetTyped()` helper that named
 * each of them by hand and set by an `offerPrefill` that named six of them by hand. Two hand-kept
 * lists of the same fields, with nothing checking that they agreed — the shape `GOTCHAS.md` records
 * as *a helper is not the fix for stale state, because a helper is still a list*.
 *
 * As one value there is no list. `emptyTyped` and `typedFromPrefill` both return a complete
 * `CardTyped`, so the compiler requires every field to be accounted for and a field added later
 * cannot be forgotten by one of them.
 */
export type CardTyped = {
  readonly direction: CardDirection | "";
  readonly amount: string;
  readonly balance: string;
  readonly printedDigits: string;
  readonly occurredOn: string;
  readonly occurredAtTime: string;
  readonly counterparty: string;
  readonly categoryId: string;
  readonly note: string;
  /**
   * What the pre-fill put in each box, so a change to it can be detected at submit (D-114).
   *
   * **Values are held only to be compared, never to be sent.** What leaves the form is the two
   * lists of *field names* — `offeredFieldNames` and `changedFieldNames` — because that is the whole
   * of what the trial needs and the whole of what an audit row may carry.
   */
  readonly offered: Partial<Record<PrefillField, string>>;
};

/**
 * An empty form, dated **Bangkok today** rather than the browser's today.
 *
 * `toISOString()` here named yesterday between midnight and 07:00 local, and a card matches its
 * statement row on a one-day window, so the default silently narrowed the pairing for seven hours a
 * day (D-110). The date is a parameter so a test can state the day rather than depend on the clock;
 * the component passes nothing and gets the rule.
 */
export function emptyTyped(today: string = bangkokToday()): CardTyped {
  return {
    direction: "",
    amount: "",
    balance: "",
    printedDigits: "",
    occurredOn: today,
    occurredAtTime: "",
    counterparty: "",
    categoryId: "",
    note: "",
    offered: {}
  };
}

/**
 * The card's own figures as starting values, and a record of exactly what was offered.
 *
 * **This is D-087 on trial, not overturned** (D-114). `lib/notification-card-prefill.ts` repairs only
 * characters carrying no value, proves no digit moved, runs the same strict grammar the form runs,
 * and offers nothing at all when any of that refuses. Nothing here parses: every value comes from a
 * `prefill.<field>.ok` branch, so a figure cannot reach a box by any route but that grammar.
 *
 * **It returns a whole form, and that is the guarantee rather than an implementation detail.** This
 * runs whenever a different card comes on screen. Leaving a refused field alone would carry the
 * previous card's figure into this card's form while its crop showed something else — the exact
 * mismatch the component's `cropPass` guard exists to prevent, arriving by a slower route. Building
 * a fresh `CardTyped` makes that impossible to get wrong: a refused field is empty because the empty
 * form is what it was built from, not because someone remembered to clear it.
 *
 * **The direction is filled from the printed sign and never from the direction word** (D-123), and
 * that distinction is the whole of the last branch. `readDirection` refuses a card whose two printed
 * signals disagree; it takes the word from the image and the sign from this control. Filling the
 * control from the **word** would hand the check back the signal it already holds, and it would
 * agree with itself on every card forever while still looking like a check. Filling it from the
 * **sign** keeps two genuinely different printed features in play — a misread that garbles a Thai
 * direction word and one that drops a leading `-` are not the same misread. Where the two do not
 * agree, or the card prints no sign, the control stays blank and the owner sets it: on the measured
 * samples that is KBank Live incoming and nothing else.
 *
 * @param wordDirection the direction read from the card's **words** — used only to withhold.
 */
export function typedFromPrefill(
  prefill: CardPrefill,
  wordDirection: CardDirection,
  window_: CardDateWindow,
  today: string = bangkokToday()
): CardTyped {
  const empty = emptyTyped(today);
  const remembered: Partial<Record<PrefillField, string>> = {};

  const amount = prefill.amount.ok ? prefill.amount.value.magnitude : "";
  if (prefill.amount.ok) remembered.amount = amount;

  const balance = prefill.balance.ok ? prefill.balance.value : "";
  if (prefill.balance.ok) remembered.balance = balance;

  const printedDigits = prefill.ownAccount.ok ? prefill.ownAccount.value : "";
  if (prefill.ownAccount.ok) remembered.ownAccount = printedDigits;

  // The date input refuses anything outside the capture window, and a value it refuses would sit in
  // the box looking typed while being unsubmittable. Offered only where it can stand; otherwise the
  // box returns to the Bangkok default (D-110) rather than to nothing.
  const timestamp = prefill.occurredAt.ok ? prefill.occurredAt.value : null;
  const datable = timestamp !== null && timestamp.date >= window_.earliest && timestamp.date <= window_.latest;
  if (datable) remembered.occurredAt = `${timestamp.date} ${timestamp.time}`;

  const printedSign = prefill.amount.ok ? prefill.amount.value.sign : "";
  const bySign: CardDirection | "" = printedSign === "+" ? "in" : printedSign === "-" ? "out" : "";

  return {
    ...empty,
    direction: bySign !== "" && bySign === wordDirection ? bySign : "",
    amount,
    balance,
    printedDigits,
    occurredOn: datable ? timestamp.date : empty.occurredOn,
    occurredAtTime: datable ? timestamp.time : "",
    offered: remembered
  };
}

/**
 * What is in each pre-fillable box now, in the same form the offer was remembered in.
 *
 * The timestamp is two inputs and one field: a card stores one instant, the pairing rule uses the
 * instant rather than the day (D-102), and either input moving is the owner disagreeing with what
 * the image offered.
 */
function typedNow(typed: CardTyped): Record<PrefillField, string> {
  return {
    amount: typed.amount,
    balance: typed.balance,
    ownAccount: typed.printedDigits,
    occurredAt: `${typed.occurredOn} ${typed.occurredAtTime}`
  };
}

/**
 * What the image put in front of the owner — **field names, never values** (D-114).
 *
 * Built by filtering the field-name constant rather than by hand, so a figure cannot travel in one
 * by construction rather than by review.
 */
export function offeredFieldNames(typed: CardTyped): PrefillField[] {
  return PREFILL_FIELDS.filter((field) => typed.offered[field] !== undefined);
}

/** Which of the offered fields the owner overtyped before submitting. Field names, never values. */
export function changedFieldNames(typed: CardTyped): PrefillField[] {
  const now = typedNow(typed);
  return PREFILL_FIELDS.filter((field) => typed.offered[field] !== undefined && typed.offered[field] !== now[field]);
}

/**
 * A list of field names, or nothing at all when it is empty (D-122).
 *
 * `JSON.stringify` drops an `undefined` value, so this is what turns an empty list into an absent
 * key — the encoding migration 019 documents as meaning "empty" and the only one it accepts. Its
 * duplicate-name check compares `array_length(names, 1)`, which PostgreSQL answers **NULL** for an
 * empty array, against a `count(distinct)` of 0 — so `[]` raises "contains a repeated field name".
 * **It bites hardest when the pre-fill is perfect**: a card the owner changed nothing on sends an
 * empty `prefillChanged` and cannot be captured at all, which is the first thing real use of Cloud
 * Vision found (D-120). The audit row records `[]` either way, so nothing is lost by saying it this
 * way.
 */
export function namesOrAbsent(names: readonly PrefillField[]): PrefillField[] | undefined {
  return names.length > 0 ? [...names] : undefined;
}

// ---------------------------------------------------------------------------
// What was read off the screenshot
// ---------------------------------------------------------------------------

/** A cropped enlargement per field, keyed by the field it sits beside. */
export type CardCrops = Partial<Record<CardFieldName, string>>;
/** The reader's own words about a field it could not place, keyed the same way. */
export type CardNotes = Partial<Record<CardFieldName, string>>;

/**
 * Where reading the screenshot has got to.
 *
 * `null` is "no screenshot has been read", and the three members are the only other states there
 * are. As six independent slots the illegal combinations were all reachable and one of them was
 * ordinary: `regions` non-null with `crops` belonging to a different card, which is a form showing
 * one card's picture beside another card's figures above an append-only Capture button.
 */
export type CardReading =
  | { readonly phase: "reading" }
  | { readonly phase: "refused"; readonly why: string }
  | {
      readonly phase: "read";
      readonly cards: readonly CardRegion[];
      readonly chosen: number;
      readonly crops: CardCrops;
      readonly notes: CardNotes;
    };

/** The screenshot is being read. */
export function startedReading(): CardReading {
  return { phase: "reading" };
}

/** The reader would not read it, in its own words. */
export function readerRefused(why: string): CardReading {
  return { phase: "refused", why };
}

/**
 * Something threw while reading, **without un-finding cards that were already found**.
 *
 * This exists because the restructure introduced the bug it prevents, and the bug was in the gate on
 * an append-only row. `readImage` establishes the `read` phase and *then* cuts crops inside the same
 * `try`; a crop failure — `drawImage` on a bitmap the decoder mangled, `toDataURL` on an oversized
 * canvas, both reachable, which is why `selectCard` guards its own call — reached a `catch` that
 * replaced the whole reading with a refusal.
 *
 * **What that costs is not a missing picture.** With no card in hand, `directionAgrees` returns
 * `true` because there is genuinely no second signal, so `captureRequest` stops requiring the
 * printed-word cross-check (D-099) — while the boxes still hold the amount, balance, digits and date
 * that `typedFromPrefill` put there from that very card, now with no crops to check them against.
 * The form would say "This image could not be read. Type the values from the card yourself" above a
 * form that is pre-filled and freshly submittable on one signal.
 *
 * The remedy is a value rather than a `.catch()` at the call site, for the reason `GOTCHAS.md` gives
 * about helpers: a `.catch()` is something to remember, and the code this replaced was written by
 * someone who had just written the same guard fifteen lines above and still missed this one.
 */
export function readerFailed(current: CardReading | null, why: string): CardReading {
  if (current !== null && current.phase === "read") return current;
  return readerRefused(why);
}

/**
 * Cards were found, and the first is on screen.
 *
 * An empty list is a refusal rather than a `read` phase holding nothing, because "read, with no
 * cards" and "not read" are the same thing to every reader of this value and only one of them can
 * be rendered.
 */
export function cardsFound(cards: readonly CardRegion[], channel: string): CardReading {
  if (cards.length === 0) return readerRefused(noCardsFound(channel));
  return { phase: "read", cards, chosen: 0, crops: {}, notes: {} };
}

/**
 * What to say when the reader found no card, which is most often the wrong channel.
 *
 * The channel cannot be read off the card — SCB Connect and KBank Live print the identical incoming
 * title (D-099) — so the conversation the screenshot came from is the only thing that says which
 * bank it is, and it is the first thing to check here.
 */
export function noCardsFound(channel: string): string {
  return `No ${channel} card was found on this image. Check the channel above is the conversation this screenshot came from — an in-app transaction list is not a card and is not captured here.`;
}

/**
 * A different card of the same screenshot comes on screen, with **no crops yet**.
 *
 * Clearing them here rather than leaving them for the crop pass to overwrite is the point: cutting
 * up to six regions takes long enough for the owner to switch again while it runs, and the previous
 * card's pictures sitting under the new card's figures for that interval is the mismatch this type
 * exists to prevent. Out of range is ignored rather than clamped — a chooser cannot offer an index
 * it does not have, so one means a caller with a broken model, not a card to guess at.
 */
export function cardChosen(reading: CardReading | null, index: number): CardReading | null {
  if (reading === null || reading.phase !== "read") return reading;
  if (!Number.isInteger(index) || index < 0 || index >= reading.cards.length) return reading;
  return { ...reading, chosen: index, crops: {}, notes: {} };
}

/**
 * The crop pass finished and its pictures belong to the card on screen.
 *
 * Returns the reading unchanged when nothing is read, so a pass that outlives its screenshot lands
 * nowhere instead of resurrecting one.
 */
export function cropsCut(reading: CardReading | null, crops: CardCrops, notes: CardNotes): CardReading | null {
  if (reading === null || reading.phase !== "read") return reading;
  return { ...reading, crops, notes };
}

/** The card on screen, or `null` when none is — which is what the direction cross-check turns on. */
export function chosenCard(reading: CardReading | null): CardRegion | null {
  if (reading === null || reading.phase !== "read") return null;
  return reading.cards[reading.chosen] ?? null;
}

/** How many cards this screenshot held. Zero when nothing has been read. */
export function cardCount(reading: CardReading | null): number {
  return reading !== null && reading.phase === "read" ? reading.cards.length : 0;
}

/**
 * The card to advance to after a capture, or `null` when that was the last one.
 *
 * A screenshot carries two cards more often than one (D-100), so the ordinary next act after a
 * capture is the card beside it — advancing rather than making the owner re-pick is what turns a
 * two-card screenshot into one pass instead of two.
 */
export function nextCardIndex(reading: CardReading | null): number | null {
  if (reading === null || reading.phase !== "read") return null;
  const next = reading.chosen + 1;
  return next < reading.cards.length ? next : null;
}

// ---------------------------------------------------------------------------
// What the form says after a capture
// ---------------------------------------------------------------------------

/**
 * The result of the last capture, in one of the three established `.capture-result` tones.
 *
 * A captured card, a card already held and a failure read very differently and are acted on
 * differently, so the result carries its own tone rather than being three shades of grey. It was two
 * slots — `status` and `error` — that were mutually exclusive in fact and independent in the type,
 * so both could stand at once and the form would show two banners with contradictory news.
 */
export type CardResult = { readonly tone: "captured" | "already" | "failed"; readonly message: string };

/** Something went wrong, in the words the caller already has. */
export function failedResult(message: string): CardResult {
  return { tone: "failed", message };
}

/**
 * The banner after the route answered, **and the card to advance to**, from one call.
 *
 * The two used to be computed separately a few lines apart: `next` chose which card to select and a
 * ternary over the same values wrote the sentence describing it. Nothing tied them together, so a
 * change to one was free to leave the other saying something else — a banner announcing the next
 * card while the form sat on the last one. Answering both here means they cannot disagree.
 *
 * **"In the ledger" is in this sentence rather than under the form, and the placement is the
 * decision** (D-139). The route lists captured *slips* below and never lists cards, so the form's
 * own surroundings answer "where did that go" for one record kind and stay silent for the other. The
 * banner already appears only after a capture and is already scrolled to, so it costs no permanent
 * vertical space and lands at the moment the question is actually asked.
 */
export function afterCapture(
  captured: boolean,
  reading: CardReading | null
): { readonly result: CardResult; readonly next: number | null } {
  const next = nextCardIndex(reading);
  const remaining = next === null
    ? "That was the last card on this screenshot."
    : `Card ${next + 1} of ${cardCount(reading)} is ready — check each figure against its crop.`;
  return {
    next,
    result: {
      tone: captured ? "captured" : "already",
      message: captured
        ? `Captured, and it is in the ledger rather than in the list below — that list is slips only. A card cannot be deleted or edited once saved. ${remaining}`
        : `This exact card was already captured, so nothing was added. The one already held is in the ledger. ${remaining}`
    }
  };
}

// ---------------------------------------------------------------------------
// The gates
// ---------------------------------------------------------------------------

/** A money box that is empty, understood, or refused with the reason shown under it. */
export type MoneyEntry =
  | { readonly ok: true; readonly minor: string }
  | { readonly ok: false; readonly message: string }
  | null;

/**
 * The typed amount as signed minor units, with the sign coming from the **direction control**.
 *
 * Zero is refused rather than stored: no card prints a movement of nothing, so a zero here is a
 * failed read wearing a plausible shape.
 */
export function amountEntry(amount: string, direction: CardDirection | ""): MoneyEntry {
  if (amount.trim() === "" || direction === "") return null;
  try {
    const magnitude = BigInt(parseThb(amount).minor);
    const absolute = magnitude < 0n ? -magnitude : magnitude;
    if (absolute === 0n) return { ok: false, message: "No card prints a movement of nothing." };
    return { ok: true, minor: (direction === "out" ? -absolute : absolute).toString() };
  } catch {
    return { ok: false, message: "Enter a plain amount such as 250 or 250.75." };
  }
}

/** The balance is a position rather than a movement: zero is ordinary and negative is an overdraft. */
export function balanceEntry(balance: string): MoneyEntry {
  if (balance.trim() === "") return null;
  try {
    return { ok: true, minor: BigInt(parseThb(balance).minor).toString() };
  } catch {
    return { ok: false, message: "Enter the balance as printed, such as 9310 or 9310.00." };
  }
}

/** Which of the owner's accounts the printed digits name, or why they name none. */
export type AccountBinding =
  | { readonly ok: true; readonly account: CardBindableAccount }
  | { readonly ok: false; readonly message: string }
  | null;

/**
 * The account binding, under this layout's mask, **failing closed in both bad cases**.
 *
 * The ambiguous branch is not hypothetical: `offset-one` pins down three digits rather than four, so
 * two KBank accounts differing only in the masked digit are indistinguishable from the card. A wrong
 * account on an append-only row is not something a later correction fully undoes.
 */
export function bindPrintedDigits(
  layout: NotificationCardLayout | null,
  printedDigits: string,
  accounts: readonly CardBindableAccount[]
): AccountBinding {
  if (!layout || !/^[0-9]{4}$/u.test(printedDigits)) return null;
  const mine = accounts.filter((account) => account.bank_code === layout.bankCode);
  const match = matchAccountDigits(layout, printedDigits, mine.map((account) => account.last_four));
  if (match.outcome === "matched") {
    const account = mine.find((each) => each.last_four === match.lastFour);
    // Unreachable while `mine` is what was matched against, and a refusal rather than a `!` because
    // the alternative to finding it is binding money to an account nobody named.
    if (!account) {
      return { ok: false, message: "Those digits matched an account that is no longer loaded. Reload and try again." };
    }
    return { ok: true, account };
  }
  if (match.outcome === "none") {
    return { ok: false, message: `No ${layout.bankCode} account of yours prints those digits.` };
  }
  return {
    ok: false,
    message: "Those digits fit more than one of your accounts, and this layout masks the digit that would tell them apart. Say which account yourself."
  };
}

/**
 * The two direction signals, compared — the words from the image, the sign from the control.
 *
 * `null` when there is nothing to compare: no layout, no card read from an image, or no understood
 * amount to take a sign from.
 */
export function directionCheck(
  layout: NotificationCardLayout | null,
  card: CardRegion | null,
  amount: MoneyEntry
): CardDirectionReading | null {
  if (!layout || !card || amount?.ok !== true) return null;
  return readDirection(layout, cardText(card.words), BigInt(amount.minor));
}

/**
 * The second direction signal, **required whenever there is one**.
 *
 * `!== "contradicted"` was not enough, and the gap is not theoretical: the check is `null` whenever
 * no card region is in hand, and `null` is not "contradicted" — so the cross-check silently stopped
 * applying while the form stayed submittable. D-099's whole point is that a card is never stored on
 * one signal.
 *
 * With no card there genuinely is no second signal, because nothing read the card's words. That path
 * stays open — the owner can always type a card the engine could not read — and the form says which
 * of the two situations it is in rather than looking equally confident in both.
 */
export function directionAgrees(card: CardRegion | null, check: CardDirectionReading | null): boolean {
  return card === null || check?.outcome === "read";
}

/**
 * What the card should print for the date chosen, as a check against the crop.
 *
 * Two of the three layouts print a two-digit Buddhist year, so this is the conversion the owner
 * would otherwise do in their head against a picture of the real thing.
 */
export function printedDateHint(layout: NotificationCardLayout | null, occurredOn: string): string | null {
  if (!layout || !/^\d{4}-\d{2}-\d{2}$/u.test(occurredOn)) return null;
  const [year, month, day] = occurredOn.split("-");
  return layout.yearFormat === "gregorian-4"
    ? `${day}/${month}/${year}`
    : `${day}/${month}/${String(Number(year) + BUDDHIST_ERA_OFFSET).slice(-2)}`;
}

/** Everything a capture is decided from. */
export type CardFormState = {
  readonly layout: NotificationCardLayout | null;
  readonly typed: CardTyped;
  readonly reading: CardReading | null;
  readonly accounts: readonly CardBindableAccount[];
};

/**
 * The request body for a card that may be saved, or `null` for one that may not.
 *
 * **This is the only gate, and it answers with the body rather than with a boolean.** The component
 * had the rule twice — as `ready`, which disables the button, and restated at the top of `submit`,
 * because a submit can arrive by routes that never touched the button. Two copies of the rule
 * guarding an append-only row is the drift D-148 was, and the restatement could only ever be as
 * current as the last person to remember it. Returning the body collapses the two: what enables the
 * button is what is sent, because it is the same value.
 *
 * The conditions, and why each is here rather than left to the inputs' own `required`:
 *
 * - **The amount and the balance are understood**, by the strict grammar and nothing else.
 * - **The digits bind to exactly one account**, failing closed on none and on ambiguous.
 * - **The two printed direction signals agree**, whenever the card gave a second one (D-099).
 * - **A time was typed.** The card's own clock, not LINE's — but this only knows that one was given.
 *
 * The result matches `notificationCardCaptureSchema` by construction, which the committed test
 * asserts by parsing it: the client and the route agree about the body or the test fails, rather
 * than the disagreement surfacing as a rejected capture of a real card.
 */
export function captureRequest(state: CardFormState): NotificationCardCapture | null {
  const { layout, typed, reading, accounts } = state;
  if (!layout || typed.direction === "" || typed.occurredAtTime === "") return null;

  const amount = amountEntry(typed.amount, typed.direction);
  const balance = balanceEntry(typed.balance);
  const binding = bindPrintedDigits(layout, typed.printedDigits, accounts);
  if (amount?.ok !== true || balance?.ok !== true || binding?.ok !== true) return null;

  const card = chosenCard(reading);
  if (!directionAgrees(card, directionCheck(layout, card, amount))) return null;

  return {
    accountId: binding.account.id,
    channel: layout.channel,
    printedAccountDigits: typed.printedDigits,
    kind: kindForDirection(typed.direction),
    amountMinor: amount.minor,
    balanceMinor: balance.minor,
    occurredOn: typed.occurredOn,
    occurredAtTime: typed.occurredAtTime,
    counterparty: typed.counterparty.trim() || null,
    categoryId: typed.categoryId || null,
    note: typed.note.trim() || null,
    // Field names only, both derived by filtering the field-name constant, so no figure can travel
    // in either by construction (D-114, D-116) — and an empty list travels as an absent key (D-122).
    prefillOffered: namesOrAbsent(offeredFieldNames(typed)),
    prefillChanged: namesOrAbsent(changedFieldNames(typed))
  };
}

// **There is deliberately no `readyToCapture` boolean beside this.** One was written and removed the
// same day: nothing could call it, because the component needs the body anyway to send it and reads
// `request === null` for the button. Its test asserted `readyToCapture(s) === (captureRequest(s) !==
// null)`, which is that function's own body restated — a test that cannot fail, standing in for the
// property it was named after. The property it claimed (the button agrees with the body) now holds
// because there is only one value, which is the stronger form of the same guarantee.
