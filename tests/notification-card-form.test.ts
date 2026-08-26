import { describe, expect, it } from "vitest";
import { layoutForChannel, type CardDirection } from "@/lib/notification-card";
import { type CardRegion, type OcrWord } from "@/lib/notification-card-ocr";
import { PREFILL_FIELDS, type CardPrefill } from "@/lib/notification-card-prefill";
import { notificationCardCaptureSchema } from "@/lib/notification-cards";
import {
  afterCapture,
  amountEntry,
  balanceEntry,
  bindPrintedDigits,
  cardChosen,
  cardCount,
  cardsFound,
  captureRequest,
  changedFieldNames,
  chosenCard,
  cropsCut,
  directionAgrees,
  directionCheck,
  emptyTyped,
  failedResult,
  namesOrAbsent,
  nextCardIndex,
  noCardsFound,
  offeredFieldNames,
  printedDateHint,
  readerFailed,
  readerRefused,
  startedReading,
  typedFromPrefill,
  type CardBindableAccount,
  type CardFormState,
  type CardTyped
} from "@/lib/notification-card-form";

/**
 * The card capture form's decisions, driven directly.
 *
 * **This file is the first committed test of any kind over this form** (`PLAN.md`, "the
 * committed-spec gap"). Until `lib/notification-card-form.ts` existed, every rule below lived
 * inside a 1,081-line React component and was guarded, where it was guarded at all, by a source
 * grep in `tests/privacy.test.ts`. A grep can say that `prefill.amount.value.sign` appears inside a
 * function. It cannot say that a card printing `+` and a card printing `-` come out of that function
 * differently, and it cannot say anything at all about a card that prints neither.
 *
 * Every value here is invented, per `docs/FIXTURE_POLICY.md`. Real cards were read under grants on
 * 2026-08-12 and 2026-08-16; only **shapes, counts and label wordings** left those readings. No
 * amount, balance, date, account digit or name below came from a real card.
 */

const SCB = layoutForChannel("SCB Connect");
const KBANK = layoutForChannel("KBank Live");
const KTB = layoutForChannel("Krungthai Connext");

const WINDOW = { earliest: "2016-08-26", latest: "2026-08-26" } as const;
const TODAY = "2026-08-26";

/** The direction words the layouts print, which is the signal that comes from the **image**. */
const DIRECTION_WORD: Record<string, Record<CardDirection, string>> = {
  "SCB Connect": { in: "รายการเงินเข้า", out: "รายการเงินออก" },
  "KBank Live": { in: "รายการเงินเข้า", out: "รายการโอน/ถอน" },
  "Krungthai Connext": { in: "เงินเข้า", out: "เงินออก" }
};

/** One line of words, laid out left to right, which is all `cardText` needs to read a title. */
function words(line: readonly string[]): OcrWord[] {
  let left = 0;
  return line.map((text) => {
    const width = Math.max(8, text.length * 6);
    const word = { text, left, top: 0, right: left + width, bottom: 16 };
    left += width + 6;
    return word;
  });
}

/**
 * A card as the reader hands it over: the direction its **words** say, and those words.
 *
 * The two are given together deliberately — `region.direction` is the word-derived signal, and a
 * fixture whose `direction` disagreed with its printed title would be testing a state the reader
 * cannot produce.
 */
function region(direction: CardDirection, layout = SCB): CardRegion {
  return { direction, words: words([DIRECTION_WORD[layout.channel]![direction]!]) };
}

/** A `CardPrefill` stated directly. Absent fields are refused, which is the ordinary case. */
function prefill(offer: {
  amount?: { magnitude: string; sign: "-" | "+" | "" };
  balance?: string;
  ownAccount?: string;
  occurredAt?: { date: string; time: string };
}): CardPrefill {
  const refused = { ok: false, code: "NOT_LOCATED", why: "The reader would not say where this field is." } as const;
  return {
    amount: offer.amount ? { ok: true, value: offer.amount } : refused,
    balance: offer.balance !== undefined ? { ok: true, value: offer.balance } : refused,
    ownAccount: offer.ownAccount !== undefined ? { ok: true, value: offer.ownAccount } : refused,
    occurredAt: offer.occurredAt ? { ok: true, value: offer.occurredAt } : refused
  };
}

const ACCOUNTS: readonly CardBindableAccount[] = [
  { id: "11111111-1111-4111-8111-111111111111", bank_code: "SCB", label: "SCB everyday", last_four: "4417" },
  { id: "22222222-2222-4222-8222-222222222222", bank_code: "SCB", label: "SCB savings", last_four: "9083" },
  { id: "33333333-3333-4333-8333-333333333333", bank_code: "KBANK", label: "KBank main", last_four: "5210" },
  { id: "44444444-4444-4444-8444-444444444444", bank_code: "KBANK", label: "KBank spare", last_four: "5211" }
];

/** A form filled in exactly far enough to be capturable, so each test can break one thing. */
function capturable(over: Partial<CardTyped> = {}): CardTyped {
  return {
    ...emptyTyped(TODAY),
    direction: "out",
    amount: "1,250.75",
    balance: "9,310.00",
    printedDigits: "4417",
    occurredOn: "2026-08-20",
    occurredAtTime: "14:07",
    ...over
  };
}

function state(over: Partial<CardFormState> = {}): CardFormState {
  return { layout: SCB, typed: capturable(), reading: null, accounts: ACCOUNTS, ...over };
}

// ---------------------------------------------------------------------------

describe("what a card's own figures may fill in", () => {
  /**
   * **The rule D-123 exists for, driven rather than grepped.**
   *
   * `readDirection` compares the direction the card's *words* say against the sign on the amount the
   * owner submitted. If the control were filled from the word, the check would be comparing the word
   * with itself — agreeing on every card forever while still looking like a check. The three cases
   * below are exactly what a source grep cannot distinguish: same code, three different answers.
   */
  it("fills the direction control from the printed sign and never from the direction word", () => {
    const outgoing = typedFromPrefill(prefill({ amount: { magnitude: "1,250.75", sign: "-" } }), "out", WINDOW, TODAY);
    expect(outgoing.direction).toBe("out");

    const incoming = typedFromPrefill(prefill({ amount: { magnitude: "480.00", sign: "+" } }), "in", WINDOW, TODAY);
    expect(incoming.direction).toBe("in");

    // **The case the grep cannot see.** A KBank Live incoming card names its direction in the title
    // and prints no sign, so the word says "in" with total confidence and the control must still
    // come back blank — the owner sets it, and only then is there a second signal to check against.
    const titleOnly = typedFromPrefill(prefill({ amount: { magnitude: "480.00", sign: "" } }), "in", WINDOW, TODAY);
    expect(titleOnly.direction, "the direction word alone may never fill the control").toBe("");
  });

  it("withholds the direction when the sign and the word disagree", () => {
    // One of the two was misread. Filling either in would hand `readDirection` a signal it now
    // agrees with by construction, and the contradiction would never surface.
    const disagreeing = typedFromPrefill(prefill({ amount: { magnitude: "1,250.75", sign: "+" } }), "out", WINDOW, TODAY);
    expect(disagreeing.direction).toBe("");
  });

  it("offers a figure only where the strict grammar offered one, and leaves the rest blank", () => {
    // The amount is offered and nothing else is. A refused field is blank rather than guessed
    // (D-114, D-115), and it is blank here because the form is **built from empty** rather than
    // patched — which is what stops a previous card's figure surviving into this one's boxes.
    const typed = typedFromPrefill(prefill({ amount: { magnitude: "1,250.75", sign: "-" } }), "out", WINDOW, TODAY);
    expect(typed.amount).toBe("1,250.75");
    expect(typed.balance).toBe("");
    expect(typed.printedDigits).toBe("");
    expect(typed.occurredAtTime).toBe("");
    // The date has no blank state, so a refusal returns it to the Bangkok default (D-110).
    expect(typed.occurredOn).toBe(TODAY);
    expect(offeredFieldNames(typed)).toEqual(["amount"]);
  });

  it("clears every box a previous card filled, because it returns a whole form", () => {
    // The guarantee is structural: `typedFromPrefill` takes no prior form, so there is nothing for a
    // stale value to survive in. Stated as a test anyway, because the guarantee is the reason the
    // signature is that shape and a future change that threads the old form back in would pass
    // review while quietly reintroducing D-114's inheritance hazard.
    const everything = typedFromPrefill(
      prefill({
        amount: { magnitude: "480.00", sign: "+" },
        balance: "9,310.00",
        ownAccount: "4417",
        occurredAt: { date: "2026-08-20", time: "14:07" }
      }),
      "in",
      WINDOW,
      TODAY
    );
    const nothing = typedFromPrefill(prefill({}), "in", WINDOW, TODAY);
    expect(everything.offered).toEqual({
      amount: "480.00",
      balance: "9,310.00",
      ownAccount: "4417",
      occurredAt: "2026-08-20 14:07"
    });
    expect(nothing).toEqual(emptyTyped(TODAY));
    // Including the free-text boxes, which have no crop of their own to contradict them and were
    // the one place a value could previously ride from one screenshot to the next.
    expect(nothing.counterparty).toBe("");
    expect(nothing.categoryId).toBe("");
    expect(nothing.note).toBe("");
  });

  it("does not offer a date the capture window would refuse", () => {
    // A value the date input refuses would sit in the box looking typed while being unsubmittable.
    const tooOld = typedFromPrefill(
      prefill({ occurredAt: { date: "2001-03-04", time: "09:15" } }),
      "out",
      WINDOW,
      TODAY
    );
    expect(tooOld.occurredOn).toBe(TODAY);
    expect(tooOld.occurredAtTime).toBe("");
    expect(offeredFieldNames(tooOld)).toEqual([]);

    const inWindow = typedFromPrefill(
      prefill({ occurredAt: { date: "2026-08-20", time: "14:07" } }),
      "out",
      WINDOW,
      TODAY
    );
    expect(inWindow.occurredOn).toBe("2026-08-20");
    expect(inWindow.occurredAtTime).toBe("14:07");
    expect(offeredFieldNames(inWindow)).toEqual(["occurredAt"]);
  });
});

describe("the pre-fill's audit trail", () => {
  const offeredAll = typedFromPrefill(
    prefill({
      amount: { magnitude: "480.00", sign: "+" },
      balance: "9,310.00",
      ownAccount: "4417",
      occurredAt: { date: "2026-08-20", time: "14:07" }
    }),
    "in",
    WINDOW,
    TODAY
  );

  it("names fields and never carries a figure", () => {
    // D-114 records **structure, never values**. Both lists are filtered from the field-name
    // constant, so every member is a field name by construction.
    expect(offeredFieldNames(offeredAll)).toEqual(["amount", "balance", "occurredAt", "ownAccount"]);
    for (const name of [...offeredFieldNames(offeredAll), ...changedFieldNames(offeredAll)]) {
      expect(PREFILL_FIELDS).toContain(name);
    }
  });

  it("counts a box as changed only once the owner has actually moved it", () => {
    expect(changedFieldNames(offeredAll), "an untouched form has changed nothing").toEqual([]);
    expect(changedFieldNames({ ...offeredAll, amount: "481.00" })).toEqual(["amount"]);
    expect(changedFieldNames({ ...offeredAll, printedDigits: "9083" })).toEqual(["ownAccount"]);
  });

  it("treats the two timestamp inputs as the one field they record", () => {
    // A card stores one instant and the pairing rule uses the instant rather than the day (D-102),
    // so either input moving is the owner disagreeing with what the image offered.
    expect(changedFieldNames({ ...offeredAll, occurredAtTime: "14:08" })).toEqual(["occurredAt"]);
    expect(changedFieldNames({ ...offeredAll, occurredOn: "2026-08-21" })).toEqual(["occurredAt"]);
  });

  it("reports a field the pre-fill never offered as neither offered nor changed", () => {
    // A field changed from a value it was never offered is a caller with a broken model of its own
    // form, and the route refuses it. It must be unrepresentable here rather than refused there.
    const typedByHand: CardTyped = { ...emptyTyped(TODAY), amount: "999.00", balance: "12.00" };
    expect(offeredFieldNames(typedByHand)).toEqual([]);
    expect(changedFieldNames(typedByHand)).toEqual([]);
  });

  it("says an empty list by leaving the key out (D-122)", () => {
    // Migration 019 defines absent as empty and **refuses an explicitly empty array**: its
    // duplicate-name check compares `array_length`, which PostgreSQL answers NULL for an empty
    // array, against a `count(distinct)` of 0. It bites hardest when the pre-fill is perfect.
    expect(namesOrAbsent([])).toBeUndefined();
    expect(namesOrAbsent(["amount"])).toEqual(["amount"]);
  });
});

describe("the money boxes", () => {
  it("takes the amount's sign from the direction control", () => {
    expect(amountEntry("1,250.75", "out")).toEqual({ ok: true, minor: "-125075" });
    expect(amountEntry("1,250.75", "in")).toEqual({ ok: true, minor: "125075" });
    // A magnitude typed with its own sign is still governed by the control, not by the keystroke.
    expect(amountEntry("-1,250.75", "in")).toEqual({ ok: true, minor: "125075" });
  });

  it("is empty rather than wrong until both halves are given", () => {
    expect(amountEntry("", "out")).toBeNull();
    expect(amountEntry("   ", "out")).toBeNull();
    expect(amountEntry("1,250.75", "")).toBeNull();
  });

  it("refuses a movement of nothing and anything the strict grammar will not take", () => {
    expect(amountEntry("0", "out")).toEqual({ ok: false, message: "No card prints a movement of nothing." });
    expect(amountEntry("0.00", "in")?.ok).toBe(false);
    expect(amountEntry("1.234", "in")?.ok, "three decimal places is not THB").toBe(false);
    expect(amountEntry("about 200", "in")?.ok).toBe(false);
    expect(amountEntry("200฿", "in")?.ok, "the grammar strips the symbol rather than refusing").toBe(true);
  });

  it("lets a balance be zero or negative, because it is a position and not a movement", () => {
    expect(balanceEntry("0")).toEqual({ ok: true, minor: "0" });
    expect(balanceEntry("-450.00"), "an overdraft is an ordinary balance").toEqual({ ok: true, minor: "-45000" });
    expect(balanceEntry("")).toBeNull();
    expect(balanceEntry("nine")?.ok).toBe(false);
  });
});

describe("binding the printed digits to an account", () => {
  it("binds under the layout's own mask", () => {
    expect(bindPrintedDigits(SCB, "4417", ACCOUNTS)).toEqual({ ok: true, account: ACCOUNTS[0] });
    // `offset-one`: the card shows digits 6–9 and the ledger stores 7–10, so the card's last three
    // are the stored value's first three. `5210` and `5211` share those three.
    expect(bindPrintedDigits(KBANK, "9521", ACCOUNTS)?.ok, "two KBank accounts fit those three digits").toBe(false);
  });

  it("fails closed rather than guessing, in both bad cases", () => {
    const none = bindPrintedDigits(SCB, "0000", ACCOUNTS);
    expect(none?.ok).toBe(false);
    expect(none?.ok === false && none.message).toContain("No SCB account");

    const ambiguous = bindPrintedDigits(KBANK, "9521", ACCOUNTS);
    expect(ambiguous?.ok === false && ambiguous.message).toContain("Say which account yourself");
  });

  it("only ever considers accounts at the card's own bank", () => {
    // The channel comes from the owner, and getting it wrong reads the digits with the wrong rule —
    // so the bank filter is the thing standing between a mis-set channel and a cross-bank binding.
    expect(bindPrintedDigits(KTB, "4417", ACCOUNTS)?.ok, "an SCB account may not bind a Krungthai card").toBe(false);
  });

  it("is empty rather than refusing until four digits are typed", () => {
    expect(bindPrintedDigits(SCB, "", ACCOUNTS)).toBeNull();
    expect(bindPrintedDigits(SCB, "441", ACCOUNTS)).toBeNull();
    expect(bindPrintedDigits(null, "4417", ACCOUNTS)).toBeNull();
  });
});

describe("the two direction signals", () => {
  it("agrees when the card's word and the control's sign say the same thing", () => {
    const card = region("out");
    const check = directionCheck(SCB, card, amountEntry("1,250.75", "out"));
    expect(check?.outcome).toBe("read");
    expect(directionAgrees(card, check)).toBe(true);
  });

  it("refuses a card whose two printed signals disagree (D-099)", () => {
    const card = region("out");
    const check = directionCheck(SCB, card, amountEntry("1,250.75", "in"));
    expect(check?.outcome).toBe("contradicted");
    expect(directionAgrees(card, check), "a card is never stored on the surviving signal").toBe(false);
  });

  /**
   * **The gap a `!== "contradicted"` gate leaves open**, asserted rather than described.
   *
   * With no card read from an image the check is `null`, and `null` is not `"contradicted"` — so the
   * looser gate passes and the cross-check retires itself silently while the form stays submittable.
   * Here the two situations answer differently: no card is genuinely one signal and stays open, and
   * a card that was read but not understood is closed.
   */
  it("tells no second signal apart from a second signal that failed", () => {
    expect(directionAgrees(null, null), "a card typed by hand has only ever had one signal").toBe(true);

    const unreadable = region("out");
    // A card whose words are present but whose amount never parsed: nothing to compare against.
    expect(directionCheck(SCB, unreadable, amountEntry("", "out"))).toBeNull();
    expect(directionAgrees(unreadable, null), "a card is in hand, so its second signal is required").toBe(false);
  });

  it("notices a card read under the wrong layout, where the vocabularies differ", () => {
    // Krungthai's words under SCB's layout are not SCB's words, so this refuses rather than reading
    // the digits with the wrong mask. It cannot separate SCB Connect from KBank Live, whose incoming
    // titles are identical — which is why the channel comes from the LINE conversation.
    const krungthai = region("in", KTB);
    expect(directionCheck(SCB, krungthai, amountEntry("480.00", "in"))?.outcome).toBe("unrecognised");
  });
});

describe("the reading", () => {
  it("is a refusal when the reader found no card, naming the channel to check", () => {
    const empty = cardsFound([], "KBank Live");
    expect(empty).toEqual({ phase: "refused", why: noCardsFound("KBank Live") });
    expect(noCardsFound("KBank Live")).toContain("KBank Live");
    expect(cardCount(empty)).toBe(0);
    expect(chosenCard(empty)).toBeNull();
  });

  it("puts the first card on screen when cards were found", () => {
    const read = cardsFound([region("out"), region("in")], "SCB Connect");
    expect(read.phase).toBe("read");
    expect(cardCount(read)).toBe(2);
    expect(chosenCard(read)).toEqual(region("out"));
  });

  /**
   * **The illegal state six `useState` slots made ordinary.**
   *
   * Cutting up to six crops takes long enough for the owner to switch cards while it runs. With
   * `crops` independent of `chosen`, the previous card's pictures stayed on screen beside the new
   * card's figures for that whole interval — one card's picture over another card's amount, above an
   * append-only Capture button. Choosing a card and clearing its crops is now one transition.
   */
  it("drops the previous card's crops the moment a different card is chosen", () => {
    const read = cardsFound([region("out"), region("in")], "SCB Connect");
    const cropped = cropsCut(read, { amount: "data:image/png;base64,AAAA" }, { balance: "not placed" });
    expect(cropped?.phase === "read" && cropped.crops.amount).toBe("data:image/png;base64,AAAA");

    const switched = cardChosen(cropped, 1);
    expect(switched?.phase === "read" && switched.chosen).toBe(1);
    expect(switched?.phase === "read" && switched.crops, "no crop may outlive the card it was cut for").toEqual({});
    expect(switched?.phase === "read" && switched.notes).toEqual({});
  });

  it("ignores a card index the screenshot does not have", () => {
    const read = cardsFound([region("out")], "SCB Connect");
    expect(cardChosen(read, 4)).toBe(read);
    expect(cardChosen(read, -1)).toBe(read);
    expect(cardChosen(read, 1.5)).toBe(read);
  });

  it("lands a late crop pass nowhere once its screenshot is gone", () => {
    // A pass that outlives its reading must not resurrect one, which is the same hazard from the
    // other side: crops arriving into a form that has moved on.
    expect(cropsCut(null, { amount: "data:image/png;base64,AAAA" }, {})).toBeNull();
    expect(cropsCut(startedReading(), { amount: "x" }, {})).toEqual(startedReading());
    expect(cardChosen(readerRefused("nope"), 0)).toEqual(readerRefused("nope"));
  });

  /**
   * **The regression the restructure introduced, kept out by a value rather than by a `.catch()`.**
   *
   * `readImage` establishes the `read` phase and then cuts crops inside the same `try`. A crop
   * failure reaching a bare `catch` that called `readerRefused` replaced the whole reading — and
   * because the boxes were already filled by `typedFromPrefill`, the result was a pre-filled form
   * with no card in hand, which makes `directionAgrees` return `true` for want of a second signal
   * and drops the D-099 cross-check on an append-only row.
   */
  it("does not un-find cards that were already found when something later throws", () => {
    const read = cardsFound([region("out"), region("in")], "SCB Connect");
    expect(readerFailed(read, "This image could not be read."), "a crop failure is not an unread card")
      .toBe(read);
    expect(chosenCard(readerFailed(read, "nope")), "the card must stay in hand, so its words still check the sign")
      .toEqual(region("out"));
  });

  it("still refuses when nothing had been found yet", () => {
    // Before any card is in hand there is nothing to protect, and the owner needs to be told.
    expect(readerFailed(null, "This image could not be read.")).toEqual(readerRefused("This image could not be read."));
    expect(readerFailed(startedReading(), "nope")).toEqual(readerRefused("nope"));
    expect(readerFailed(readerRefused("earlier"), "nope")).toEqual(readerRefused("nope"));
  });

  it("has no card on screen while it is reading or refusing", () => {
    expect(chosenCard(null)).toBeNull();
    expect(chosenCard(startedReading())).toBeNull();
    expect(chosenCard(readerRefused("nope"))).toBeNull();
    expect(nextCardIndex(startedReading())).toBeNull();
  });
});

describe("what the form says after a capture", () => {
  const two = cardsFound([region("out"), region("in")], "SCB Connect");

  /**
   * The banner and the advance are one answer, which is the point of `afterCapture`.
   *
   * They were computed a few lines apart from the same values with nothing tying them together, so a
   * change to either was free to leave the other saying something else — a banner announcing the
   * next card while the form sat on the last one.
   */
  it("advances to the card beside it and says so, from one call", () => {
    const { result, next } = afterCapture(true, two);
    expect(next).toBe(1);
    expect(result.tone).toBe("captured");
    expect(result.message).toContain("Card 2 of 2 is ready");
  });

  it("says that was the last one when there is no card beside it", () => {
    const onLast = cardChosen(two, 1);
    const { result, next } = afterCapture(true, onLast);
    expect(next).toBeNull();
    expect(result.message).toContain("That was the last card on this screenshot.");
  });

  it("distinguishes a card it stored from one it already held", () => {
    // Both are successes and only one added a row, and a card cannot be deleted or edited once
    // saved — so the two must not read as shades of the same grey.
    expect(afterCapture(true, two).result.tone).toBe("captured");
    expect(afterCapture(false, two).result.tone).toBe("already");
    expect(afterCapture(false, two).result.message).toContain("already captured");
    expect(afterCapture(true, two).result.message).toContain("in the ledger");
  });

  it("keeps a failure in the same one value, so two banners cannot stand at once", () => {
    // `status` and `error` were independent slots that were mutually exclusive in fact.
    expect(failedResult("The ledger could not be reached.")).toEqual({
      tone: "failed",
      message: "The ledger could not be reached."
    });
  });

  it("says the last card even for a card typed with no screenshot at all", () => {
    expect(afterCapture(true, null).next).toBeNull();
    expect(afterCapture(true, null).result.message).toContain("That was the last card");
  });
});

describe("the gate on an append-only row", () => {
  it("builds a body the route's own schema accepts", () => {
    // The client and the route agree about the body, or this fails — rather than the disagreement
    // surfacing as a rejected capture of a real card that cannot be retried from the same state.
    const request = captureRequest(state());
    expect(request).not.toBeNull();
    expect(() => notificationCardCaptureSchema.parse(request)).not.toThrow();
    expect(request).toMatchObject({
      accountId: ACCOUNTS[0]!.id,
      channel: "SCB Connect",
      printedAccountDigits: "4417",
      kind: "withdrawal",
      amountMinor: "-125075",
      balanceMinor: "931000",
      occurredOn: "2026-08-20",
      occurredAtTime: "14:07"
    });
  });

  it("signs the amount to match the direction, which the schema cross-checks", () => {
    const incoming = captureRequest(state({ typed: capturable({ direction: "in" }) }));
    expect(incoming).toMatchObject({ kind: "deposit", amountMinor: "125075" });
    expect(() => notificationCardCaptureSchema.parse(incoming)).not.toThrow();
  });

  it("refuses a card whose two printed direction signals disagree", () => {
    // The card's words say money out; the control says money in. The looser gate this replaced would
    // still have been enabled whenever no card was in hand, which is the failure D-099 names.
    const contradicted = state({ reading: cardsFound([region("out")], "SCB Connect"), typed: capturable({ direction: "in" }) });
    expect(captureRequest(contradicted)).toBeNull();

    const agreeing = state({ reading: cardsFound([region("out")], "SCB Connect"), typed: capturable({ direction: "out" }) });
    expect(captureRequest(agreeing)).not.toBeNull();
  });

  it("still lets the owner type a card no image was read from", () => {
    // The engine cannot read every card, and a form that refused what it could not read would make
    // the reader load-bearing for capture. With no card there is genuinely one signal, and the form
    // says so elsewhere rather than looking equally confident.
    expect(captureRequest(state({ reading: null }))).not.toBeNull();
    expect(captureRequest(state({ reading: readerRefused(noCardsFound("SCB Connect")) }))).not.toBeNull();
  });

  it.each([
    ["no channel chosen", state({ layout: null })],
    ["no direction", state({ typed: capturable({ direction: "" }) })],
    ["no time", state({ typed: capturable({ occurredAtTime: "" }) })],
    ["an amount the grammar refuses", state({ typed: capturable({ amount: "about 200" }) })],
    ["a movement of nothing", state({ typed: capturable({ amount: "0" }) })],
    ["no balance", state({ typed: capturable({ balance: "" }) })],
    ["a balance the grammar refuses", state({ typed: capturable({ balance: "9,310.000" }) })],
    ["digits that name no account", state({ typed: capturable({ printedDigits: "0000" }) })],
    ["digits not yet complete", state({ typed: capturable({ printedDigits: "441" }) })],
    ["accounts not loaded", state({ accounts: [] })]
  ])("refuses to build a body with %s", (_why, refused) => {
    expect(captureRequest(refused)).toBeNull();
  });

  it("refuses digits that fit more than one account under a masking layout", () => {
    // `offset-one` pins down three digits, so two KBank accounts differing only in the masked digit
    // are indistinguishable from the card. A wrong account on an append-only row does not undo.
    const kbank = state({
      layout: KBANK,
      reading: null,
      typed: capturable({ printedDigits: "9521" })
    });
    expect(captureRequest(kbank)).toBeNull();
  });

  // **There is no "the button agrees with the body" test here, and its absence is deliberate.** One
  // was written: it asserted `readyToCapture(s) === (captureRequest(s) !== null)` over a matrix,
  // which is `readyToCapture`'s own body restated and therefore could not fail. Both it and the
  // function are gone. The component reads `request === null` for the button and sends `request`, so
  // the two are one value and the property holds by construction rather than by assertion.
});

describe("what leaves the form", () => {
  const offered = typedFromPrefill(
    prefill({
      amount: { magnitude: "1,250.75", sign: "-" },
      balance: "9,310.00",
      ownAccount: "4417",
      occurredAt: { date: "2026-08-20", time: "14:07" }
    }),
    "out",
    WINDOW,
    TODAY
  );

  it("carries the pre-fill's field names and none of its values", () => {
    // D-114's whole distinction, checked on the wire shape rather than in a comment. The remembered
    // offer is a map of values and exists only to be compared.
    const request = captureRequest(state({ typed: { ...offered, occurredAtTime: "14:07" } }));
    expect(request?.prefillOffered).toEqual(["amount", "balance", "occurredAt", "ownAccount"]);
    expect(request?.prefillChanged, "an untouched form changed nothing").toBeUndefined();
    // Nothing in the body is keyed by, or shaped like, the remembered map.
    expect(Object.keys(request ?? {})).not.toContain("offered");
  });

  it("names a field as changed only when the owner overtyped it, and sends what they typed", () => {
    const overtyped = { ...offered, amount: "1,260.00" };
    const request = captureRequest(state({ typed: overtyped }));
    expect(request?.prefillChanged).toEqual(["amount"]);
    expect(request?.amountMinor, "the row carries what was typed, not what was offered").toBe("-126000");
    expect(() => notificationCardCaptureSchema.parse(request)).not.toThrow();
  });

  /**
   * **The perfect pre-fill, which is where D-122 bites hardest.**
   *
   * A card the owner changed nothing on sends an empty `prefillChanged`, and migration 019 refuses
   * an explicitly empty array. `JSON.stringify` drops an `undefined`, so the key must be absent from
   * the serialised body and not merely empty — asserted on the JSON, because that is what travels.
   */
  it("drops an empty name list out of the serialised body entirely", () => {
    const body = JSON.stringify(captureRequest(state({ typed: { ...offered, occurredAtTime: "14:07" } })));
    expect(body).not.toContain("prefillChanged");
    expect(body).toContain("prefillOffered");

    // And a form nothing was offered on drops both, rather than sending two empty arrays.
    const byHand = JSON.stringify(captureRequest(state()));
    expect(byHand).not.toContain("prefillOffered");
    expect(byHand).not.toContain("prefillChanged");
  });

  it("sends the optional free text as null rather than as an empty string", () => {
    const blank = captureRequest(state({ typed: capturable({ counterparty: "   ", note: "", categoryId: "" }) }));
    expect(blank).toMatchObject({ counterparty: null, categoryId: null, note: null });
    expect(() => notificationCardCaptureSchema.parse(blank)).not.toThrow();

    const filled = captureRequest(state({ typed: capturable({ counterparty: "  Landlord  ", note: " rent " }) }));
    expect(filled).toMatchObject({ counterparty: "Landlord", note: "rent" });
  });
});

describe("the date hint under the crop", () => {
  it("converts to the era the layout prints", () => {
    // Two of the three layouts print a two-digit Buddhist year, which is the arithmetic the owner
    // would otherwise do in their head against a picture of the real thing.
    expect(printedDateHint(SCB, "2026-08-20")).toBe("20/08/2026");
    expect(printedDateHint(KBANK, "2026-08-20")).toBe("20/08/69");
    expect(printedDateHint(KTB, "2026-08-20")).toBe("20/08/69");
  });

  it("says nothing until there is a layout and a whole date", () => {
    expect(printedDateHint(null, "2026-08-20")).toBeNull();
    expect(printedDateHint(SCB, "")).toBeNull();
    expect(printedDateHint(SCB, "2026-08")).toBeNull();
  });
});
