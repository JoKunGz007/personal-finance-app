import { describe, expect, it } from "vitest";
import { layoutForChannel } from "@/lib/notification-card";
import { locateCardFields, type Box, type CardFieldName, type CardOcrRead, type OcrWord } from "@/lib/notification-card-ocr";
import {
  CARD_TOKEN_REPAIRS,
  PREFILL_FIELDS,
  offeredFields,
  prefillCardFields,
  repairToken,
  tokensIn,
  type CardPrefill
} from "@/lib/notification-card-prefill";

// Every value in this file is invented, per `docs/FIXTURE_POLICY.md`. Real cards were read under
// grants on 2026-08-12 and 2026-08-16; only shapes, counts and **label wordings** left those
// readings. No amount, balance, date, account digit or name below came from a real card, and the
// misread characters are the *classes* D-112 and D-113 record rather than any card's own text.

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

/** A box around every word given, which is what the reader returns for a located field. */
function boxAround(words: readonly OcrWord[]): Box {
  return {
    left: Math.min(...words.map((word) => word.left)),
    top: Math.min(...words.map((word) => word.top)),
    right: Math.max(...words.map((word) => word.right)),
    bottom: Math.max(...words.map((word) => word.bottom))
  };
}

const SCB = layoutForChannel("SCB Connect");
const KBANK = layoutForChannel("KBank Live");
const KTB = layoutForChannel("Krungthai Connext");

const YEAR = 2026;

/**
 * One field's worth of tokens, handed to the pre-fill through a box drawn around them.
 *
 * The reader's own targeting is exercised separately, at the bottom of this file. Everything else
 * here is about what happens *inside* a box that was located correctly, which is the half this
 * module owns.
 */
function readField(
  field: CardFieldName,
  tokens: readonly string[],
  layout = SCB,
  currentYear = YEAR
): CardPrefill {
  const words = card([tokens]);
  const located: Partial<Record<CardFieldName, CardOcrRead<Box>>> = {
    [field]: { ok: true, value: boxAround(words), source: "test" }
  };
  return prefillCardFields(words, located, layout, currentYear);
}

describe("the digit guard, which is the load-bearing part rather than the substitution list", () => {
  // **The test task 34 names by hand**, and the one to keep if only one survives. No member of
  // `CARD_TOKEN_REPAIRS` can alter a digit, so the guard is unreachable through the shipped list —
  // which is exactly why it is proved against the class a future maintainer would reach for first.
  // `O`→`0` is the single most tempting OCR repair there is, and under it `1O5` becomes `105`: a
  // different number, arrived at without anything looking wrong.
  it("discards a repair that would alter a digit, keeping the original token", () => {
    const letterOhToZero = [{ find: /O/gu, replace: "0" }];
    expect(repairToken("1O5", letterOhToZero)).toBe("1O5");
    // And the same for a class that *removes* a digit rather than adding one.
    expect(repairToken("1,234.00", [{ find: /4/gu, replace: "" }])).toBe("1,234.00");
  });

  // The other half of the same claim: the guard refuses a dangerous repair rather than refusing
  // every repair. Without this, a guard that always discarded would pass the test above.
  it("applies a repair that leaves every digit where it was", () => {
    expect(repairToken("1O5", [{ find: /O/gu, replace: "Q" }])).toBe("1Q5");
  });

  // A dangerous substitution poisons the whole token, including the safe repairs travelling with
  // it. That is the fail-closed direction — the field is left blank rather than filled with a
  // figure that is half-repaired and looks whole.
  it("discards every repair in a token when any one of them would alter a digit", () => {
    const mixed = [...CARD_TOKEN_REPAIRS, { find: /O/gu, replace: "0" }];
    expect(repairToken("=1O5.00", mixed)).toBe("=1O5.00");
  });

  it("restores a minus read as one of its lookalikes, and only at the front", () => {
    expect(repairToken("=1,234.00")).toBe("-1,234.00");
    expect(repairToken("~1,234.00")).toBe("-1,234.00");
    expect(repairToken("—1,234.00")).toBe("-1,234.00");
    expect(repairToken("–1,234.00")).toBe("-1,234.00");
    // A lookalike in the middle of a token is not a sign and is left alone.
    expect(repairToken("12=34")).toBe("12=34");
  });

  it("restores a date separator read as a bar or a bang, doubled or not", () => {
    expect(repairToken("07|08|2026")).toBe("07/08/2026");
    expect(repairToken("07!08!2026")).toBe("07/08/2026");
    expect(repairToken("07||08|2026")).toBe("07/08/2026");
  });

  it("rejoins a thousands comma that a stray space had detached", () => {
    expect(repairToken("1, 234.00")).toBe("1,234.00");
  });
});

describe("what the amount offers, and what it refuses", () => {
  it("offers a clean figure with the sign kept apart from the magnitude", () => {
    const { amount } = readField("amount", ["จำนวนเงิน", "-1,234.00", "บาท"]);
    expect(amount).toEqual({ ok: true, value: { magnitude: "1,234.00", sign: "-" } });
  });

  it("offers a figure the card printed with no sign at all, which is ordinary on a titled layout", () => {
    const { amount } = readField("amount", ["จำนวนเงิน", "820.00", "บาท"]);
    expect(amount).toMatchObject({ ok: true, value: { magnitude: "820.00", sign: "" } });
  });

  // The repair that D-113 measured, reaching the offer rather than being asserted in isolation.
  it("offers a figure whose minus was read as an equals, with the sign restored", () => {
    const { amount } = readField("amount", ["จำนวนเงิน", "=1,234.00", "บาท"]);
    expect(amount).toMatchObject({ ok: true, value: { magnitude: "1,234.00", sign: "-" } });
  });

  // The measured refusal: three of nineteen amount regions held Thai label text and no figure.
  it("refuses a region holding label text and no digits", () => {
    const { amount } = readField("amount", ["จำนวนเงิน", "บาท"]);
    expect(amount).toMatchObject({ ok: false, code: "NO_DIGITS" });
  });

  it("refuses digits that are not shaped like a printed figure", () => {
    const { amount } = readField("amount", ["จำนวนเงิน", "12:34:56"]);
    expect(amount).toMatchObject({ ok: false, code: "NO_MONEY_TOKEN" });
  });

  // **The refusal that must never become an acceptance.** The shape gate passes and the strict
  // grammar refuses, which is precisely where a parser written for the occasion would "help" and
  // manufacture the silent error D-112 went looking for.
  it("refuses a money-shaped token the strict grammar rejects, rather than softening the grammar", () => {
    const { amount } = readField("amount", ["จำนวนเงิน", "0,123"]);
    expect(amount).toMatchObject({ ok: false, code: "GRAMMAR_REFUSED" });
  });

  // Two figures in one region, one of them plainly signed. The unsigned one is reached first, and
  // offering it would be reporting a movement whose direction the card stated and this did not
  // read. Refused rather than given the benefit of the doubt.
  it("refuses an unsigned figure when a sign character sits beside it unread", () => {
    const { amount } = readField("amount", ["จำนวนเงิน", "234.00", "=1,234.00"]);
    expect(amount).toMatchObject({ ok: false, code: "SIGN_UNREADABLE" });
  });

  // **A fragment must never displace the figure it is part of.** The harness this was ported from
  // tried every single token before any join, so `1,` + `234.00` offered `234.00` — a tenth of what
  // the card printed, and a wrong-but-plausible value, which is the one outcome D-112 measured as
  // absent. The harness could not have caught it: it never graded its own accepted values.
  it("recovers a figure whose thousands comma was split into two words, rather than offering the tail", () => {
    const { amount } = readField("amount", ["จำนวนเงิน", "1,", "234.00"]);
    expect(amount).toMatchObject({ ok: true, value: { magnitude: "1,234.00" } });
  });

  // The other side of that order: a join only wins where it reconstructs one printed figure. Two
  // unrelated figures sharing a region join into something the money shape refuses, so the first
  // is still what is offered and the second cannot swallow it.
  it("does not join two unrelated figures that happen to sit side by side", () => {
    const { amount } = readField("amount", ["จำนวนเงิน", "234.00", "9,310.00"]);
    expect(amount).toMatchObject({ ok: true, value: { magnitude: "234.00" } });
  });
});

describe("what the balance offers, and where it deliberately differs from the amount", () => {
  it("offers the balance as printed", () => {
    const { balance } = readField("balance", ["ยอดเงินที่ใช้ได้", "9,310.00", "บาท"]);
    expect(balance).toEqual({ ok: true, value: "9,310.00" });
  });

  // A balance is a position rather than a movement, so an overdraft keeps its sign and the form's
  // box parses it directly.
  it("keeps a negative balance's sign, because an overdraft is a real position", () => {
    const { balance } = readField("balance", ["ยอดเงินที่ใช้ได้", "-45.00", "บาท"]);
    expect(balance).toEqual({ ok: true, value: "-45.00" });
  });

  // The asymmetry with the amount, asserted rather than left to the comment that explains it: the
  // same tokens that refuse as an amount are offered as a balance, because no sign rule applies.
  it("offers an unsigned balance even where an amount would have refused for an unreadable sign", () => {
    expect(readField("balance", ["ยอดเงินที่ใช้ได้", "234.00", "=1,234.00"]).balance)
      .toMatchObject({ ok: true, value: "234.00" });
  });
});

describe("what the timestamp offers, resolved per layout because a global year rule is D-031", () => {
  it("offers a four-digit Gregorian date and its time on the layout that prints one", () => {
    const { occurredAt } = readField("occurredAt", ["วันที่/เวลา", "07/08/2026", "09:41"], SCB);
    expect(occurredAt).toEqual({ ok: true, value: { date: "2026-08-07", time: "09:41" } });
  });

  // The repair that took the date from 0 of 19 to 10 of 19: `/` comes back as `|` or `!` on
  // essentially every card, so without it no card's date would ever be offered.
  it("offers a date whose separators were read as bars", () => {
    const { occurredAt } = readField("occurredAt", ["วันที่/เวลา", "07|08|2026", "09:41"], SCB);
    expect(occurredAt).toMatchObject({ ok: true, value: { date: "2026-08-07" } });
  });

  it("turns a two-digit Buddhist year into a Gregorian one on the layout that prints one", () => {
    const { occurredAt } = readField("occurredAt", ["วันที่ทำรายการ", "07/08/69", "09:41"], KTB);
    expect(occurredAt).toMatchObject({ ok: true, value: { date: "2026-08-07" } });
  });

  // **The failure D-031 cost this project a ledger dated 43 years early.** A four-digit year on a
  // layout that prints two is not reinterpreted into something plausible; it is refused.
  it("refuses a year of the wrong width for the layout rather than reinterpreting it", () => {
    const { occurredAt } = readField("occurredAt", ["วันที่ทำรายการ", "07/08/2026", "09:41"], KTB);
    expect(occurredAt).toMatchObject({ ok: false, code: "YEAR_NOT_RESOLVED" });
    const other = readField("occurredAt", ["วันที่/เวลา", "07/08/69", "09:41"], SCB);
    expect(other.occurredAt).toMatchObject({ ok: false, code: "YEAR_NOT_RESOLVED" });
  });

  it("refuses a date no calendar has", () => {
    const { occurredAt } = readField("occurredAt", ["วันที่/เวลา", "31/02/2026", "09:41"], SCB);
    expect(occurredAt).toMatchObject({ ok: false, code: "NOT_A_CALENDAR_DATE" });
  });

  // Half a timestamp is the shape most likely to be submitted unnoticed, so date and time refuse
  // together in both directions.
  it("offers neither half when only one of the date and the time reads", () => {
    expect(readField("occurredAt", ["วันที่/เวลา", "07/08/2026"], SCB).occurredAt)
      .toMatchObject({ ok: false, code: "TIME_NOT_READ" });
    expect(readField("occurredAt", ["วันที่/เวลา", "09:41"], SCB).occurredAt)
      .toMatchObject({ ok: false, code: "DATE_NOT_READ" });
  });

  it("refuses a region with no digits in it at all", () => {
    expect(readField("occurredAt", ["วันที่/เวลา"], SCB).occurredAt).toMatchObject({ ok: false, code: "NO_DIGITS" });
  });

  // **Removed once and restored the same day, which is the history worth keeping.** KBank Live
  // prints `d <thai-month-abbrev> yy hh:mm` (`docs/NOTIFICATION_CARD_CONTRACT.md`). A reader for it
  // was built, measured at 0 of 2 real cards and deleted (D-117) because the local engine could not
  // see those rows at all — then restored once Cloud Vision read them and this grammar was what
  // refused them (D-118). A feature that does not work and a feature whose input never arrives look
  // identical from outside; only a measurement separates them.
  it("reads KBank Live's month-name timestamp, which no slashed reader can", () => {
    const { occurredAt } = readField("occurredAt", ["7", "ส.ค.", "69", "09:41", "น."], KBANK);
    expect(occurredAt).toEqual({ ok: true, value: { date: "2026-08-07", time: "09:41" } });
  });

  // **The trap `lib/slip-ocr.ts` names, reached through a card.** `normalise` removes the spaces
  // this layout separates its parts with, so the year and the time arrive as one run: `…6909:41น.`
  // An unanchored year group reads `6909`, which then fails the era rule and reports no date about
  // a card that plainly prints one.
  it("does not swallow the time into the year when the spaces between them are gone", () => {
    expect(readField("occurredAt", ["7ส.ค.6909:41น."], KBANK).occurredAt)
      .toMatchObject({ ok: true, value: { date: "2026-08-07", time: "09:41" } });
  });

  // A month token carrying a vowel, which is the class a shape-based pattern silently misses:
  // `[ก-ฮ]\.[ก-ฮ]\.` looks right and fails for March, April and June.
  it("reads a month token that carries a vowel", () => {
    expect(readField("occurredAt", ["3", "เม.ย.", "69", "14:05", "น."], KBANK).occurredAt)
      .toMatchObject({ ok: true, value: { date: "2026-04-03" } });
    expect(readField("occurredAt", ["3", "มิ.ย.", "69", "14:05", "น."], KBANK).occurredAt)
      .toMatchObject({ ok: true, value: { date: "2026-06-03" } });
  });

  // The era rule stays per layout on the month-name form too, which is the half D-031 is about:
  // the same printed year under SCB's Gregorian rule is refused rather than turned into 0069.
  it("keeps the era rule per layout on the month-name form too", () => {
    expect(readField("occurredAt", ["7", "ส.ค.", "69", "09:41", "น."], SCB).occurredAt)
      .toMatchObject({ ok: false, code: "YEAR_NOT_RESOLVED" });
  });

  // The two grammars are disjoint, so trying both on every layout cannot make one read as the
  // other. Asserted so "try both" is not mistaken for a global date assumption.
  it("does not read a month name out of a slashed date, or a slash out of a month name", () => {
    expect(readField("occurredAt", ["วันที่ทำรายการ", "07/08/69", "09:41"], KTB).occurredAt)
      .toMatchObject({ ok: true, value: { date: "2026-08-07" } });
    // A month-name line with no time refuses on the time rather than inventing one.
    expect(readField("occurredAt", ["7", "ส.ค.", "69"], KBANK).occurredAt)
      .toMatchObject({ ok: false, code: "TIME_NOT_READ" });
  });
});

describe("what the account digits offer", () => {
  // The mask is what OCR garbles; the four digits inside it were correct on every measured card.
  it("offers four digits taken from wherever the mask put them", () => {
    expect(readField("ownAccount", ["จากบัญชี", "x-4321"]).ownAccount).toEqual({ ok: true, value: "4321" });
    expect(readField("ownAccount", ["จากบัญชี", "xxx-x-4321-x"]).ownAccount).toEqual({ ok: true, value: "4321" });
  });

  // The measured refusal: two cards yielded five digits, from a mask character read as a digit.
  it("refuses when the mask read as a digit and made five", () => {
    expect(readField("ownAccount", ["จากบัญชี", "x-43218"]).ownAccount)
      .toMatchObject({ ok: false, code: "WRONG_DIGIT_COUNT" });
  });

  it("refuses a region with no digits in it", () => {
    expect(readField("ownAccount", ["จากบัญชี"]).ownAccount).toMatchObject({ ok: false, code: "NO_DIGITS" });
  });
});

describe("a field the reader would not locate is a refusal rather than a blank guess", () => {
  it("refuses every field the reader refused, and reads the ones it located", () => {
    const words = card([["จำนวนเงิน", "1,234.00"]]);
    const located: Partial<Record<CardFieldName, CardOcrRead<Box>>> = {
      amount: { ok: true, value: boxAround(words), source: "test" },
      balance: { ok: false, code: "LABEL_NOT_FOUND", message: "no balance row on this card" }
    };
    const prefill = prefillCardFields(words, located, SCB, YEAR);
    expect(prefill.amount).toMatchObject({ ok: true });
    expect(prefill.balance).toMatchObject({ ok: false, code: "NOT_LOCATED" });
    // A field the reader said nothing about at all is the same refusal, not an exception.
    expect(prefill.occurredAt).toMatchObject({ ok: false, code: "NOT_LOCATED" });
    expect(prefill.ownAccount).toMatchObject({ ok: false, code: "NOT_LOCATED" });
  });
});

describe("the field names a pre-fill reports, which is all migration 019 will record", () => {
  it("names the fields that were offered and nothing else", () => {
    const words = card([["จำนวนเงิน", "1,234.00"]]);
    const prefill = prefillCardFields(
      words,
      { amount: { ok: true, value: boxAround(words), source: "test" } },
      SCB,
      YEAR
    );
    expect(offeredFields(prefill)).toEqual(["amount"]);
  });

  it("carries no value of any kind, only field names", () => {
    const words = card([["จำนวนเงิน", "1,234.00"]]);
    const prefill = prefillCardFields(
      words,
      { amount: { ok: true, value: boxAround(words), source: "test" } },
      SCB,
      YEAR
    );
    for (const field of offeredFields(prefill)) {
      expect(PREFILL_FIELDS).toContain(field);
      expect(JSON.stringify(field)).not.toContain("1,234");
    }
  });
});

describe("tokens inside a located box", () => {
  it("takes a word whose centre is inside the box and leaves one whose centre is outside", () => {
    const words = card([["inside", "outside"]]);
    const box = boxAround([words[0]!]);
    expect(tokensIn(words, box)).toEqual(["inside"]);
  });

  it("returns tokens top to bottom then left to right, which is reading order", () => {
    const words = card([["first", "second"], ["third"]]);
    expect(tokensIn(words, boxAround(words))).toEqual(["first", "second", "third"]);
  });
});

// The two modules meeting: the reader locates a field on an invented card and the pre-fill reads
// inside the box it returned. Everything above hands the pre-fill a box drawn by hand, so without
// this nothing asserts that the two halves agree about where a field is.
describe("the reader and the pre-fill, end to end on an invented card", () => {
  it("offers all four fields of a card whose grammar the reader can resolve", () => {
    const words = card([
      ["รายการเงินออก"],
      ["-1,234.00", "บาท"],
      ["จากบัญชี", "x-4321"],
      ["วันที่/เวลา", "07|08|2026", "09:41"],
      ["ยอดเงินที่ใช้ได้", "9,310.00", "บาท"]
    ]);
    const located = locateCardFields(words, SCB, "out");
    const prefill = prefillCardFields(words, located, SCB, YEAR);

    expect(prefill.amount).toMatchObject({ ok: true, value: { magnitude: "1,234.00", sign: "-" } });
    expect(prefill.balance).toMatchObject({ ok: true, value: "9,310.00" });
    expect(prefill.occurredAt).toMatchObject({ ok: true, value: { date: "2026-08-07", time: "09:41" } });
    expect(prefill.ownAccount).toMatchObject({ ok: true, value: "4321" });
    expect(offeredFields(prefill)).toEqual([...PREFILL_FIELDS]);
  });
});
