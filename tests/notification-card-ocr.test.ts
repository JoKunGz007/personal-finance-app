import { describe, expect, it } from "vitest";
import { layoutForChannel } from "@/lib/notification-card";
import {
  CARD_FIELDS,
  findCards,
  locateCardField,
  locateCardFields,
  opensWith,
  readCardDirection,
  type OcrWord
} from "@/lib/notification-card-ocr";

// Every value in this file is invented, per `docs/FIXTURE_POLICY.md`. The real cards were read
// under grants on 2026-08-12 and only shapes, counts and **label wordings** left that reading —
// wordings are format knowledge and live in `docs/NOTIFICATION_CARD_CONTRACT.md`. No amount,
// balance, date, account digit or name below came from a real card.

const LINE_HEIGHT = 20;

/** Lays out lines of words into boxes, one line per array, top to bottom. */
function card(lines: readonly (readonly string[])[]): OcrWord[] {
  const words: OcrWord[] = [];
  lines.forEach((line, row) => {
    let left = 0;
    for (const text of line) {
      const width = Math.max(8, text.length * 6);
      words.push({ text, left, top: row * LINE_HEIGHT, right: left + width, bottom: row * LINE_HEIGHT + 16 });
      left += width + 6;
    }
  });
  return words;
}

/** The line a box starts on, so a test can say *which* row was located rather than only that one was. */
function rowOf(box: { top: number }): number {
  return Math.round(box.top / LINE_HEIGHT);
}

const SCB = layoutForChannel("SCB Connect");
const KBANK = layoutForChannel("KBank Live");
const KTB = layoutForChannel("Krungthai Connext");

describe("direction is read from the printed words, before any amount exists", () => {
  it("reads a layout's own direction word", () => {
    const words = card([["รายการเงินออก"], ["-1,234.00", "บาท"], ["จากบัญชี", "X-4321"]]);
    const read = readCardDirection(words, SCB);
    expect(read).toMatchObject({ ok: true, value: "out" });
  });

  // The nested-word trap D-099 records, reached through the reader rather than directly:
  // KBank Live's incoming title *contains* Krungthai Connext's incoming word, and Thai has no
  // word separator to tell them apart. This pairing must refuse, because the next thing that
  // happens is the account digits being matched with the wrong mask.
  it("refuses a card whose direction word is nested inside another layout's", () => {
    const words = card([["รายการเงินเข้า"], ["จำนวนเงิน", "1,234.00", "บาท"]]);
    expect(readCardDirection(words, KBANK)).toMatchObject({ ok: true, value: "in" });
    expect(readCardDirection(words, KTB)).toMatchObject({ ok: false, code: "DIRECTION_NOT_READ" });
  });

  // **The limit, asserted rather than left implicit**, the way D-099 asserts it for the grammar.
  // SCB Connect and KBank Live print the *identical* incoming title, so the nesting rule cannot
  // fire between them — it catches a word contained in a longer one, and these are equal. Both
  // layouts therefore accept the same incoming card and nothing in the body distinguishes them.
  // This test exists so the reader is never mistaken for a channel detector: the channel comes
  // from the LINE conversation, which means from the owner.
  it("cannot tell SCB Connect from KBank Live on an incoming card, and does not pretend to", () => {
    const incoming = card([["รายการเงินเข้า"], ["จำนวนเงิน", "1,234.00", "บาท"], ["เข้าบัญชี", "4321"]]);
    expect(readCardDirection(incoming, SCB)).toMatchObject({ ok: true, value: "in" });
    expect(readCardDirection(incoming, KBANK)).toMatchObject({ ok: true, value: "in" });
    // And the outgoing titles differ, which is the half that *is* separable — so the limit is
    // specific to one direction rather than a blanket inability.
    const outgoing = card([["รายการเงินออก"], ["-1,234.00", "บาท"], ["จากบัญชี", "X-4321"]]);
    expect(readCardDirection(outgoing, SCB)).toMatchObject({ ok: true, value: "out" });
    expect(readCardDirection(outgoing, KBANK)).toMatchObject({ ok: false, code: "DIRECTION_NOT_READ" });
  });

  it("refuses an image carrying no direction word at all", () => {
    expect(readCardDirection(card([["ยอดเงินคงเหลือ", "9,999.00"]]), KBANK)).toMatchObject({
      ok: false,
      code: "DIRECTION_NOT_READ"
    });
  });

  // Joining the lines flush would let two innocent halves form a direction word across a row
  // boundary. On a script with no word separator that is a real way to invent a reading.
  it("does not form a direction word across a line boundary", () => {
    expect(readCardDirection(card([["รายการ"], ["เงินออก", "1,234.00"]]), SCB)).toMatchObject({
      ok: false,
      code: "DIRECTION_NOT_READ"
    });
  });
});

describe("a field is found by the label its layout and direction pair", () => {
  // SCB Connect prints its amount on the line under the title with no label of its own.
  it("locates an unlabelled amount under the title, and takes the title with it", () => {
    const words = card([
      ["รายการเงินออก"],
      ["-1,234.00", "บาท"],
      ["จากบัญชี", "X-4321"],
      ["วันที่/เวลา", "12/08/2026", "14:05"],
      ["ยอดเงินที่ใช้ได้", "9,999.00", "บาท"]
    ]);
    const amount = locateCardField(words, SCB, "out", "amount");
    expect(amount.ok).toBe(true);
    if (!amount.ok) return;
    // The crop spans the title and the figure: a bare number would ask the owner to trust the
    // targeting, where the title above it says which field this is.
    expect(rowOf(amount.value)).toBe(0);
    expect(amount.value.bottom).toBeGreaterThan(LINE_HEIGHT);
    expect(amount.source).toBe("under the title");
  });

  // The collision, and it is the reason the map is keyed by direction rather than by layout.
  it("reads จากบัญชี as the owner's account outgoing and the sender's incoming", () => {
    const outgoing = card([
      ["รายการเงินออก"],
      ["-1,234.00", "บาท"],
      ["จากบัญชี", "X-4321"],
      ["วันที่/เวลา", "12/08/2026", "14:05"],
      ["ยอดเงินที่ใช้ได้", "9,999.00", "บาท"]
    ]);
    const incoming = card([
      ["รายการเงินเข้า"],
      ["1,234.00", "บาท"],
      ["เข้าบัญชี", "X-4321"],
      ["จากบัญชี", "สมชาย", "X-8765", "ธนาคารตัวอย่าง"],
      ["วันที่/เวลา", "12/08/2026", "14:05"],
      ["ยอดเงินที่ใช้ได้", "9,999.00", "บาท"]
    ]);

    const own = locateCardField(outgoing, SCB, "out", "ownAccount");
    expect(own).toMatchObject({ ok: true, source: "จากบัญชี" });
    if (own.ok) expect(rowOf(own.value)).toBe(2);

    // Same label, other direction, different field — and the owner's account has moved.
    const ownIncoming = locateCardField(incoming, SCB, "in", "ownAccount");
    expect(ownIncoming).toMatchObject({ ok: true, source: "เข้าบัญชี" });
    if (ownIncoming.ok) expect(rowOf(ownIncoming.value)).toBe(2);

    const sender = locateCardField(incoming, SCB, "in", "counterpartyName");
    expect(sender).toMatchObject({ ok: true, source: "จากบัญชี" });
    if (sender.ok) expect(rowOf(sender.value)).toBe(3);
  });

  it("says a field is not printed rather than refusing it as a misread", () => {
    const words = card([
      ["รายการเงินออก"],
      ["-1,234.00", "บาท"],
      ["จากบัญชี", "X-4321"],
      ["วันที่/เวลา", "12/08/2026", "14:05"],
      ["ยอดเงินที่ใช้ได้", "9,999.00", "บาท"]
    ]);
    expect(locateCardField(words, SCB, "out", "counterpartyName")).toMatchObject({ ok: false, code: "NOT_PRINTED" });
    expect(locateCardField(words, KBANK, "in", "counterpartyName")).toMatchObject({ ok: false, code: "NOT_PRINTED" });
  });

  it("refuses a label this image does not carry", () => {
    const words = card([["รายการเงินออก"], ["-1,234.00", "บาท"], ["จากบัญชี", "X-4321"]]);
    expect(locateCardField(words, SCB, "out", "balance")).toMatchObject({ ok: false, code: "LABEL_NOT_FOUND" });
  });
});

// A screenshot carries two clocks and only one of them is the transaction: the card prints its
// own timestamp, and LINE prints a message timestamp outside the bubble. On one measured KBank
// pair they differ, and the card's is the one that equals the statement row's.
describe("the timestamp comes from inside the card", () => {
  const words = card([
    ["รายการเงินเข้า"],
    ["12", "ส.ค.", "69", "14:05", "น."],
    ["จำนวนเงิน", "1,234.00", "บาท"],
    ["เข้าบัญชี", "xxx-x-x4321-x"],
    ["ยอดเงินคงเหลือ", "9,999.00", "บาท"],
    ["21:30"]
  ]);

  it("takes the line under the title, not the other time-shaped line on the image", () => {
    const occurred = locateCardField(words, KBANK, "in", "occurredAt");
    expect(occurred.ok).toBe(true);
    if (!occurred.ok) return;
    expect(rowOf(occurred.value)).toBe(0);
    // The region ends on the card's own timestamp row, nowhere near LINE's clock five rows down.
    expect(occurred.value.bottom).toBeLessThan(2 * LINE_HEIGHT);
  });

  it("still finds the labelled fields on the same card", () => {
    expect(locateCardField(words, KBANK, "in", "amount")).toMatchObject({ ok: true, source: "จำนวนเงิน" });
    expect(locateCardField(words, KBANK, "in", "balance")).toMatchObject({ ok: true, source: "ยอดเงินคงเหลือ" });
    expect(locateCardField(words, KBANK, "in", "ownAccount")).toMatchObject({ ok: true, source: "เข้าบัญชี" });
  });
});

// **Measured on the real sample 2026-08-16.** D-113 established that `/` comes back as `|` or `!`
// on essentially every card and treated it as a problem for a date's value. It is also a problem
// for the *anchor*: two of the wordings this grammar matches on carry a slash, so a garbled one
// makes the field unfindable and the refusal reads as "this card prints no timestamp". Seven SCB
// cards refused their date that way; two are recovered by repairing the separator before matching.
// Measured 2026-08-16 under Google Cloud Vision (D-118): three screenshots yielded no card, and on
// two the direction word was present but began at offset 1 or 3 — every layout prints an icon
// beside its title, and that engine reads it as a character where tesseract dropped it.
describe("a card's title survives an icon glyph in front of it", () => {
  it("opens a card when a stray glyph precedes the direction word", () => {
    const words = card([["*รายการเงินออก"], ["-1,234.00", "บาท"], ["จากบัญชี", "x-4321"]]);
    expect(findCards(words, SCB)).toHaveLength(1);
    expect(readCardDirection(words, SCB)).toMatchObject({ ok: true, value: "out" });
  });

  // **The trap this must never reopen**, and the reason matching anywhere on the line is wrong: a
  // Krungthai `ประเภท` row carries a free-text phrase containing the direction word, and Thai has
  // no separator to say it is part of something else. Left unguarded it split one real card in two.
  it("still refuses a direction word buried inside a label's own value", () => {
    const words = card([["เงินออก", "1,234.00"], ["ประเภทเงินออกจากบัญชี"], ["จากบัญชี", "x-4321"]]);
    // One card, from the first row — not a second one invented by the type row below it.
    expect(findCards(words, KTB)).toHaveLength(1);
  });

  // The guard that does the real work is the character class, not the distance: a Thai consonant in
  // front of the word means a Thai word is starting, however few characters precede it.
  it("refuses a Thai word in front of the direction word even when it is short", () => {
    expect(opensWith("กเงินออก", "เงินออก")).toBe(false);
    expect(opensWith("*เงินออก", "เงินออก")).toBe(true);
    expect(opensWith("เงินออก", "เงินออก")).toBe(true);
  });

  it("refuses a direction word that starts too far into the line", () => {
    expect(opensWith("****เงินออก", "เงินออก")).toBe(false);
    expect(opensWith("เงินเข้า", "เงินออก")).toBe(false);
  });
});

describe("a separator misread must not make a label unfindable", () => {
  it("finds a timestamp label whose slash was read as a bar or a bang", () => {
    for (const misread of ["วันที่|เวลา", "วันที่!เวลา"]) {
      const words = card([["รายการเงินออก"], ["-1,234.00", "บาท"], [misread, "07/08/2026", "09:41"]]);
      expect(locateCardField(words, SCB, "out", "occurredAt")).toMatchObject({ ok: true, source: "วันที่/เวลา" });
    }
  });

  it("finds a title whose slash was read as a bar, which is how a card is split at all", () => {
    const words = card([["รายการโอน|ถอน"], ["12", "ส.ค.", "69", "14:05", "น."], ["จำนวนเงิน", "1,234.00", "บาท"]]);
    expect(readCardDirection(words, KBANK)).toMatchObject({ ok: true, value: "out" });
    expect(findCards(words, KBANK)).toHaveLength(1);
  });

  // The repair only ever touches matching. Every box comes from word coordinates, so it cannot
  // move a crop or change a digit — which is what makes it safe to run before the anchors.
  it("does not move the crop it finds", () => {
    const clean = card([["รายการเงินออก"], ["-1,234.00", "บาท"], ["วันที่/เวลา", "07/08/2026", "09:41"]]);
    const misread = card([["รายการเงินออก"], ["-1,234.00", "บาท"], ["วันที่|เวลา", "07/08/2026", "09:41"]]);
    const a = locateCardField(clean, SCB, "out", "occurredAt");
    const b = locateCardField(misread, SCB, "out", "occurredAt");
    expect(a.ok && b.ok && a.value).toEqual(b.ok && b.value);
  });
});

describe("one direction of one layout has two measured variants", () => {
  const toBankAccount = card([
    ["เงินออก", "-1,234.00", "บาท"],
    ["ประเภท", "โอนเงิน"],
    ["จากบัญชี", "4321"],
    ["ไปยังบัญชี", "TESTBANK", "8765"],
    ["ผู้รับโอน", "สมชาย"],
    ["วันที่ทำรายการ", "12/08/69", "14:05"],
    ["ยอดที่ใช้ได้", "9,999.00", "บาท"]
  ]);

  const toWallet = card([
    ["เงินออก", "-1,234.00", "บาท"],
    ["ประเภท", "โอนเงิน"],
    ["จากบัญชี", "4321"],
    ["หมายเลข", "TESTWALLET", "8765"],
    ["ไปยัง", "สมชาย"],
    ["วันที่ทำรายการ", "12/08/69", "14:05"],
    ["ยอดที่ใช้ได้", "9,999.00", "บาท"]
  ]);

  it("reads the bank-account variant by its own labels", () => {
    expect(locateCardField(toBankAccount, KTB, "out", "counterpartyName")).toMatchObject({ ok: true, source: "ผู้รับโอน" });
    expect(locateCardField(toBankAccount, KTB, "out", "counterpartyAccount")).toMatchObject({
      ok: true,
      source: "ไปยังบัญชี"
    });
  });

  it("reads the wallet variant by the other pair", () => {
    expect(locateCardField(toWallet, KTB, "out", "counterpartyName")).toMatchObject({ ok: true, source: "ไปยัง" });
    expect(locateCardField(toWallet, KTB, "out", "counterpartyAccount")).toMatchObject({ ok: true, source: "หมายเลข" });
  });

  // D-099's nested-word defect in a second place. `ไปยังบัญชี` *contains* `ไปยัง`, so when the
  // first alternative is not recognised the second one lands on the account row and the form
  // would show a crop of the wrong field with nothing marking it as wrong. Removing the
  // `eclipsedBy` check makes this test — and only this test — return the account row's box.
  it("refuses a recipient label found only inside the longer account label", () => {
    const recipientMissed = card([
      ["เงินออก", "-1,234.00", "บาท"],
      ["จากบัญชี", "4321"],
      ["ไปยังบัญชี", "TESTBANK", "8765"],
      ["วันที่ทำรายการ", "12/08/69", "14:05"],
      ["ยอดที่ใช้ได้", "9,999.00", "บาท"]
    ]);
    const name = locateCardField(recipientMissed, KTB, "out", "counterpartyName");
    expect(name).toMatchObject({ ok: false, code: "LABEL_ECLIPSED" });
    // The account row itself still reads, so the refusal is about the recipient alone.
    expect(locateCardField(recipientMissed, KTB, "out", "counterpartyAccount")).toMatchObject({
      ok: true,
      source: "ไปยังบัญชี"
    });
  });

  // With two alternatives, `LABEL_NOT_FOUND` is the ordinary outcome for whichever variant does
  // not apply, so reporting the *last* one tried tells the owner a label they never saw is
  // missing while hiding the real condition.
  it("reports the most specific refusal, not the last alternative tried", () => {
    const doubledRecipient = card([
      ["เงินออก", "-1,234.00", "บาท"],
      ["จากบัญชี", "4321"],
      ["ผู้รับโอน", "สมชาย"],
      ["ผู้รับโอน", "สมหญิง"],
      ["วันที่ทำรายการ", "12/08/69", "14:05"],
      ["ยอดที่ใช้ได้", "9,999.00", "บาท"]
    ]);
    const name = locateCardField(doubledRecipient, KTB, "out", "counterpartyName");
    expect(name).toMatchObject({ ok: false, code: "LABEL_AMBIGUOUS" });
    if (!name.ok) expect(name.message).toContain("ผู้รับโอน");
  });

  it("keeps the direction word doing double duty as the amount's label", () => {
    const amount = locateCardField(toWallet, KTB, "out", "amount");
    expect(amount).toMatchObject({ ok: true, source: "เงินออก" });
    if (amount.ok) expect(rowOf(amount.value)).toBe(0);
  });
});

describe("a wrapped counterparty row keeps its continuation", () => {
  // SCB Connect prints the sender's name, masked account and bank on one row, which wraps when
  // it is long. A crop that stopped at the first line would show half a name.
  it("extends the crop onto a following line that carries no label", () => {
    const wrapped = card([
      ["รายการเงินเข้า"],
      ["1,234.00", "บาท"],
      ["เข้าบัญชี", "X-4321"],
      ["จากบัญชี", "สมชาย", "ทดสอบนามสกุลยาว"],
      ["X-8765", "ธนาคารตัวอย่าง"],
      ["วันที่/เวลา", "12/08/2026", "14:05"],
      ["ยอดเงินที่ใช้ได้", "9,999.00", "บาท"]
    ]);
    const sender = locateCardField(wrapped, SCB, "in", "counterpartyName");
    expect(sender.ok).toBe(true);
    if (sender.ok) expect(sender.value.bottom).toBeGreaterThan(4 * LINE_HEIGHT);
  });

  // A single continuation is what the measured SCB wrap needs, and taking only one truncates a
  // longer name in the direction the owner cannot see past.
  it("chains a second continuation line, and still stops at the next labelled row", () => {
    const wrappedTwice = card([
      ["รายการเงินเข้า"],
      ["1,234.00", "บาท"],
      ["เข้าบัญชี", "X-4321"],
      ["จากบัญชี", "สมชาย"],
      ["ทดสอบนามสกุลยาว"],
      ["X-8765", "ธนาคารตัวอย่าง"],
      ["วันที่/เวลา", "12/08/2026", "14:05"]
    ]);
    const sender = locateCardField(wrappedTwice, SCB, "in", "counterpartyName");
    expect(sender.ok).toBe(true);
    if (!sender.ok) return;
    expect(sender.value.bottom).toBeGreaterThan(5 * LINE_HEIGHT);
    // The timestamp row is row 6 and must stay outside the crop.
    expect(sender.value.bottom).toBeLessThan(6 * LINE_HEIGHT);
  });

  // The guard is start-of-row, like every other anchor in this module. A merely *contained*
  // label would suppress a real continuation and truncate the crop with no signal — and
  // `จากบัญชี` is an ordinary enough phrase to fall inside a wrapped bank name.
  it("does not treat a label buried in a continuation as the next row", () => {
    const buried = card([
      ["รายการเงินเข้า"],
      ["1,234.00", "บาท"],
      ["เข้าบัญชี", "X-4321"],
      ["จากบัญชี", "สมชาย"],
      ["ธนาคารทดสอบจากบัญชีออมทรัพย์"],
      ["วันที่/เวลา", "12/08/2026", "14:05"]
    ]);
    const sender = locateCardField(buried, SCB, "in", "counterpartyName");
    expect(sender.ok).toBe(true);
    if (sender.ok) expect(sender.value.bottom).toBeGreaterThan(4 * LINE_HEIGHT);
  });

  it("stops at the next labelled row rather than swallowing it", () => {
    const unwrapped = card([
      ["รายการเงินเข้า"],
      ["1,234.00", "บาท"],
      ["เข้าบัญชี", "X-4321"],
      ["จากบัญชี", "สมชาย", "X-8765"],
      ["วันที่/เวลา", "12/08/2026", "14:05"],
      ["ยอดเงินที่ใช้ได้", "9,999.00", "บาท"]
    ]);
    const sender = locateCardField(unwrapped, SCB, "in", "counterpartyName");
    expect(sender.ok).toBe(true);
    if (sender.ok) expect(sender.value.bottom).toBeLessThan(5 * LINE_HEIGHT);
  });
});

// Measured 2026-08-12 over the six real card screenshots: **every one of them carries two
// cards**. Reading a screenshot as a single card meets each label twice and refuses the lot,
// which is the right refusal about the wrong input.
describe("a screenshot is not a card", () => {
  const twoCards = [
    ["เงินเข้า", "1,234.00", "บาท"],
    ["ประเภท", "โอนเข้าทดสอบ"],
    ["เข้าบัญชี", "4321"],
    ["จากบัญชี", "TESTBANK", "8765"],
    ["ผู้โอน", "สมชาย"],
    ["ยอดที่ใช้ได้", "9,999.00", "บาท"],
    ["วันที่ทำรายการ", "12/08/69", "14:05"],
    ["เงินออก", "-2,345.00", "บาท"],
    ["ประเภท", "ทดสอบเงินออก"],
    ["จากบัญชี", "4321"],
    ["ไปยังบัญชี", "TESTBANK", "8765"],
    ["ผู้รับโอน", "สมหญิง"],
    ["ยอดที่ใช้ได้", "7,654.00", "บาท"],
    ["วันที่ทำรายการ", "12/08/69", "17:00"]
  ];

  it("splits a screenshot into one region per card, each with its own direction", () => {
    const cards = findCards(card(twoCards), KTB);
    expect(cards.map((each) => each.direction)).toEqual(["in", "out"]);
  });

  it("reads every field of each card, which the whole screenshot could not", () => {
    const words = card(twoCards);
    // The doubled labels are exactly what makes the unsplit read refuse: both cards print a
    // balance and a timestamp, so those rows appear twice on the one image.
    expect(locateCardField(words, KTB, "in", "balance")).toMatchObject({ ok: false, code: "LABEL_AMBIGUOUS" });
    expect(locateCardField(words, KTB, "in", "occurredAt")).toMatchObject({ ok: false, code: "LABEL_AMBIGUOUS" });
    for (const region of findCards(words, KTB)) {
      const located = locateCardFields(region.words, KTB, region.direction);
      for (const field of CARD_FIELDS) expect(located[field].ok).toBe(true);
    }
  });

  // The third appearance of D-099's nested-word trap, and the first to arrive from a *value*
  // rather than another layout's label: a Krungthai `ประเภท` row carries a free-text
  // transfer-kind phrase, and a measured one contains the direction word inside a longer run.
  // Dropping the start-of-row rule splits the second card in two and points its amount crop at
  // the type row — a wrong crop with nothing marking it as wrong.
  it("does not start a card from a direction word buried in a value", () => {
    const cards = findCards(card(twoCards), KTB);
    expect(cards).toHaveLength(2);
    const second = cards[1]!;
    const amount = locateCardField(second.words, KTB, second.direction, "amount");
    expect(amount).toMatchObject({ ok: true });
    // The amount's crop is the card's first row, not the type row under it.
    if (amount.ok) expect(amount.value.top).toBe(7 * LINE_HEIGHT);
  });

  // The in-app transaction lists this task excludes print row titles that *contain* a direction
  // word, carry no per-row balance, and would fail open if a row were misread. The reader now
  // enforces the exclusion rather than relying on the owner not to try.
  it("finds no card on an in-app transaction list", () => {
    const accountDetail = card([
      ["Account", "Detail"],
      ["ยอดเงินคงเหลือ", "(บาท)", "9,999.00"],
      ["เงินโอนเข้า-ทดสอบ", "30", "ก.ค.", "16:52", "55.00"],
      ["โอนเงินออก", "27", "ก.ค.", "01:49", "-530.00"]
    ]);
    expect(findCards(accountDetail, KTB)).toHaveLength(0);
  });
});

describe("the form asks for every field at once", () => {
  it("answers each field separately, so one unreadable field is not a failed read", () => {
    const words = card([
      ["รายการเงินออก"],
      ["-1,234.00", "บาท"],
      ["จากบัญชี", "X-4321"],
      ["วันที่/เวลา", "12/08/2026", "14:05"],
      ["ยอดเงินที่ใช้ได้", "9,999.00", "บาท"]
    ]);
    const located = locateCardFields(words, SCB, "out");
    expect(Object.keys(located).sort()).toEqual([...CARD_FIELDS].sort());
    expect(located.amount.ok).toBe(true);
    expect(located.balance.ok).toBe(true);
    expect(located.counterpartyName).toMatchObject({ ok: false, code: "NOT_PRINTED" });
  });
});
