import { describe, expect, it } from "vitest";
import {
  gregorianFromPrintedYear,
  groupIntoLines,
  findLabelLine,
  proposeAmount,
  readAmount,
  readPrintedDate,
  valueWordsFor,
  THAI_MONTH_TOKENS,
  type OcrWord
} from "@/lib/slip-ocr";

// Reading printed fields off a slip (PLAN task 21). Every value here is invented, per
// docs/FIXTURE_POLICY.md — the amounts are round numbers chosen to exercise the grammar and
// none of them came from a real slip. Label wordings are format knowledge and are taken from
// docs/SLIP_CONTRACT.md, which is the one thing here that describes real documents.
//
// There is no OCR engine in these tests because there is none in the module. That is the
// point of the split: the rules that decide what to believe are testable without a browser,
// a WebAssembly build, or a language model file.

let nextTop = 0;

/** A line of words at a given band, laid out left to right. */
function line(top: number, entries: Array<[string, number, number]>): OcrWord[] {
  return entries.map(([text, left, right]) => ({ text, left, right, top, bottom: top + 20 }));
}

function word(text: string, left: number, right: number, top = (nextTop += 30)): OcrWord {
  return { text, left, right, top, bottom: top + 20 };
}

describe("grouping words into visual lines", () => {
  it("keeps words on one line even when their boxes disagree on both edges", () => {
    // A Thai tone mark makes a taller box, so two words on one line rarely share a `top`.
    // Overlap of the bands is what means "same line"; equality of an edge never does.
    const words: OcrWord[] = [
      { text: "จำนวนเงิน", left: 10, right: 90, top: 100, bottom: 124 },
      { text: "1,250.00", left: 300, right: 380, top: 104, bottom: 122 }
    ];
    expect(groupIntoLines(words)).toHaveLength(1);
  });

  it("separates genuinely different lines", () => {
    const words = [...line(100, [["จำนวน:", 10, 70]]), ...line(140, [["1,250.00", 300, 380]])];
    expect(groupIntoLines(words)).toHaveLength(2);
  });

  it("orders lines top to bottom and words left to right, whatever order they arrived in", () => {
    const words = [
      ...line(140, [["บาท", 390, 420], ["1,250.00", 300, 380]]),
      ...line(100, [["จำนวนเงิน", 10, 90]])
    ];
    const lines = groupIntoLines(words);
    expect(lines.map((entry) => entry.map((w) => w.text))).toEqual([
      ["จำนวนเงิน"],
      ["1,250.00", "บาท"]
    ]);
  });
});

describe("finding the line a label sits on", () => {
  it("matches a label the engine split into several words", () => {
    // Thai has no inter-word spaces, so where an engine breaks a label is its business.
    const lines = groupIntoLines(line(100, [["จำนวน", 10, 50], ["เงิน", 50, 90], ["1,250.00", 300, 380]]));
    const found = findLabelLine(lines, "จำนวนเงิน");
    expect(found.ok).toBe(true);
    if (found.ok) expect(found.labelRight).toBe(90);
  });

  it("refuses when the label appears on two lines rather than taking the first", () => {
    // Twice means the image caught something this policy does not model. Picking one would
    // be a guess wearing a result's clothing.
    const lines = groupIntoLines([
      ...line(100, [["จำนวนเงิน", 10, 90], ["1,250.00", 300, 380]]),
      ...line(140, [["จำนวนเงิน", 10, 90], ["999.00", 300, 380]])
    ]);
    expect(findLabelLine(lines, "จำนวนเงิน")).toEqual({ ok: false, code: "LABEL_AMBIGUOUS" });
  });

  it("reports a missing label as missing", () => {
    const lines = groupIntoLines(line(100, [["ค่าธรรมเนียม", 10, 90], ["12.00", 300, 360]]));
    expect(findLabelLine(lines, "จำนวนเงิน")).toEqual({ ok: false, code: "LABEL_NOT_FOUND" });
  });
});

describe("locating the value a label points at", () => {
  it("takes only what is right of the label on the same line", () => {
    const lines = groupIntoLines(line(100, [["จำนวนเงิน", 10, 90], ["1,250.00", 300, 380], ["บาท", 390, 420]]));
    const found = findLabelLine(lines, "จำนวนเงิน");
    expect(found.ok).toBe(true);
    if (!found.ok) return;
    expect(valueWordsFor(lines, found, "same-line-right").map((w) => w.text)).toEqual(["1,250.00", "บาท"]);
  });

  it("takes the line below when that is where the layout puts the value", () => {
    // KBANK, the layout that prints its value under its label rather than beside it.
    const lines = groupIntoLines([
      ...line(100, [["จำนวน:", 10, 70]]),
      ...line(140, [["1,250.00", 300, 380], ["บาท", 390, 420]])
    ]);
    const found = findLabelLine(lines, "จำนวน:");
    expect(found.ok).toBe(true);
    if (!found.ok) return;
    expect(valueWordsFor(lines, found, "next-line").map((w) => w.text)).toEqual(["1,250.00", "บาท"]);
  });
});

describe("reading an amount, or refusing to", () => {
  it("reads grouped thousands with two fractional places", () => {
    const read = readAmount([word("1,250.00", 300, 380)]);
    expect(read.ok).toBe(true);
    if (read.ok) expect(read.value).toBe("125000");
  });

  it("strips the baht suffix on the layouts that print one, and copes with the one that does not", () => {
    const withSuffix = readAmount([word("1,250.00", 300, 380), word("บาท", 390, 420)]);
    const without = readAmount([word("1250.00", 300, 380)]);
    expect(withSuffix.ok && withSuffix.value).toBe("125000");
    expect(without.ok && without.value).toBe("125000");
  });

  it("reads Thai digits, which are a transliteration rather than a judgement", () => {
    const read = readAmount([word("๑,๒๕๐.๐๐", 300, 380)]);
    expect(read.ok && read.value).toBe("125000");
  });

  // The three confusions docs/SLIP_CONTRACT.md names. None of them is repaired, and that is
  // the whole design: a corrected amount arrives wearing the same confidence as a correct
  // one, and only a reconciliation would ever catch it.
  it("refuses a letter standing in for a digit instead of correcting it", () => {
    const read = readAmount([word("1,25o.00", 300, 380)]);
    expect(read.ok).toBe(false);
    if (!read.ok) expect(read.code).toBe("VALUE_NOT_MONEY");
  });

  it("refuses one fractional place, because a slip prints two and one means a dropped glyph", () => {
    const read = readAmount([word("1250.5", 300, 380)]);
    expect(read.ok).toBe(false);
  });

  it("refuses a value that is only partly a number", () => {
    // Anchored at both ends: a partial match is how 1,250.00 silently becomes 1.
    expect(readAmount([word("1,250.00x", 300, 380)]).ok).toBe(false);
    expect(readAmount([word("x1,250.00", 300, 380)]).ok).toBe(false);
  });

  it("refuses when nothing beside the label carries a digit", () => {
    const read = readAmount([word("บาท", 390, 420)]);
    expect(read.ok).toBe(false);
    if (!read.ok) expect(read.code).toBe("NO_VALUE_BESIDE_LABEL");
  });

  it("refuses when two different amounts read off one line", () => {
    const read = readAmount([word("1,250.00", 300, 380), word("980.00", 400, 460)]);
    expect(read.ok).toBe(false);
    if (!read.ok) expect(read.code).toBe("VALUE_AMBIGUOUS");
  });

  it("accepts the same amount read twice, which is duplication rather than ambiguity", () => {
    const read = readAmount([word("1,250.00", 300, 380), word("1,250.00", 400, 480)]);
    expect(read.ok && read.value).toBe("125000");
  });
});

describe("proposing the amount for a bank", () => {
  it("reads Krungthai's amount from beside its own label", () => {
    const words = [
      ...line(100, [["จำนวนเงิน", 10, 90], ["1,250.00", 300, 380], ["บาท", 390, 420]]),
      ...line(140, [["ค่าธรรมเนียม", 10, 90], ["12.00", 300, 360], ["บาท", 390, 420]])
    ];
    const read = proposeAmount(words, "KTB");
    expect(read.ok && read.value).toBe("125000");
  });

  it("reads KBANK's amount from the line below its label", () => {
    const words = [
      ...line(100, [["จำนวน:", 10, 70]]),
      ...line(140, [["1,250.00", 300, 380], ["บาท", 390, 420]])
    ];
    const read = proposeAmount(words, "KBANK");
    expect(read.ok && read.value).toBe("125000");
  });

  it("reads SCB's amount, which prints no baht suffix", () => {
    const words = line(100, [["จำนวนเงิน", 10, 90], ["1,250.00", 300, 380]]);
    const read = proposeAmount(words, "SCB");
    expect(read.ok && read.value).toBe("125000");
  });

  // The hazard this module exists to refuse. A fee is money, on a nearby line, and small and
  // plausible — so a reader that shrugged and took the nearest number when it could not find
  // the amount's label would return a wrong number that looks entirely reasonable.
  it("refuses rather than returning the fee when the amount's label is not found", () => {
    const words = line(100, [["ค่าธรรมเนียม", 10, 90], ["12.00", 300, 360], ["บาท", 390, 420]]);
    const read = proposeAmount(words, "KTB");
    expect(read.ok).toBe(false);
    if (!read.ok) expect(read.code).toBe("LABEL_NOT_FOUND");
  });

  it("does not take the fee even when it sits above the amount", () => {
    const words = [
      ...line(100, [["ค่าธรรมเนียม", 10, 90], ["12.00", 300, 360]]),
      ...line(140, [["จำนวนเงิน", 10, 90], ["1,250.00", 300, 380]])
    ];
    const read = proposeAmount(words, "KTB");
    expect(read.ok && read.value).toBe("125000");
  });
});

describe("the Buddhist era, which is the opposite way round from the QR", () => {
  const today = new Date("2026-08-05T00:00:00Z");

  it("converts a printed Buddhist year to Gregorian", () => {
    expect(gregorianFromPrintedYear(2569, today)).toBe(2026);
  });

  // D-031: a 543-year shift parsed cleanly once and would have written 1983 dates into the
  // ledger. This is a guard rather than a silent subtraction because of that.
  it("refuses an already-Gregorian year rather than shifting it 543 years into the past", () => {
    expect(gregorianFromPrintedYear(2026, today)).toBeNull();
  });

  it("refuses a two-digit year instead of assuming a century", () => {
    // KBANK prints `69`. That is 2569 BE and 2026 CE, and resolving it by assuming a century
    // is guessing at precisely the point this project has already been burned.
    expect(gregorianFromPrintedYear(69, today)).toBeNull();
  });

  it("refuses a converted year outside the window a slip can belong to", () => {
    expect(gregorianFromPrintedYear(2999, today)).toBeNull();
    expect(gregorianFromPrintedYear(1900, today)).toBeNull();
  });

  it("accepts the edges of the window and nothing beyond them", () => {
    expect(gregorianFromPrintedYear(2570, today)).toBe(2027);
    expect(gregorianFromPrintedYear(2571, today)).toBeNull();
    expect(gregorianFromPrintedYear(2559, today)).toBe(2016);
    expect(gregorianFromPrintedYear(2558, today)).toBeNull();
  });
});

// The printed date (measured 2026-08-10, docs/SLIP_CONTRACT.md § The month vocabulary). Every
// date below is invented; what is real is the month vocabulary and the per-layout grammar, both
// of which are format knowledge like the labels above.
describe("reading the printed date", () => {
  // 2026 CE is 2569 BE. `today` is fixed so the plausibility window cannot drift with the clock.
  const today = new Date(Date.UTC(2026, 6, 1));

  const dateLine = (text: string) => [{ text, left: 100, right: 400, top: 50, bottom: 74 }];

  it("reads the Krungthai and SCB grammar, four-digit year with a hyphen before the time", () => {
    const read = readPrintedDate(dateLine("14 ก.ค. 2569 - 09:05"), today);
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.value).toEqual({ iso: "2026-07-14", time: "09:05" });
  });

  it("converts out of the Buddhist era rather than believing the printed year", () => {
    // The whole hazard in one assertion: 2569 must not reach the ledger as the year 2569, and
    // must not be silently accepted as 2026 without the subtraction either (D-031).
    const read = readPrintedDate(dateLine("3 ธ.ค. 2568 - 18:40"), today);
    expect(read.ok && read.value.iso).toBe("2025-12-03");
  });

  it("reads a date with no time printed beside it", () => {
    const read = readPrintedDate(dateLine("9 ส.ค. 2569"), today);
    expect(read.ok && read.value).toEqual({ iso: "2026-08-09", time: null });
  });

  // The three that defeat the obvious matcher. A `[ก-ฮ]\.[ก-ฮ]\.` pattern reads none of these,
  // and a reader tested only in July would never find out.
  it.each([
    ["มี.ค.", "2026-03-08"],
    ["เม.ย.", "2026-04-08"],
    ["มิ.ย.", "2026-06-08"]
  ])("reads %s, which carries a vowel and breaks a two-consonant pattern", (month, iso) => {
    const read = readPrintedDate(dateLine(`8 ${month} 2569`), today);
    expect(read.ok && read.value.iso).toBe(iso);
  });

  it("reads every month in the table, so none is left to be discovered in production", () => {
    const isos = THAI_MONTH_TOKENS.map(([token]) => {
      const read = readPrintedDate(dateLine(`5 ${token} 2569`), today);
      return read.ok ? read.value.iso : `refused: ${token}`;
    });
    expect(isos).toEqual([
      "2026-01-05", "2026-02-05", "2026-03-05", "2026-04-05", "2026-05-05", "2026-06-05",
      "2026-07-05", "2026-08-05", "2026-09-05", "2026-10-05", "2026-11-05", "2026-12-05"
    ]);
  });

  it("refuses KBANK's two-digit year rather than assuming a century", () => {
    // The decision this reader deliberately does not make. It is named in the refusal so the
    // form can say something true, rather than reporting "no date found" on a slip that
    // plainly prints one.
    const read = readPrintedDate(dateLine("24 ก.ค. 69  11:38 น."), today);
    expect(read.ok).toBe(false);
    if (read.ok) return;
    expect(read.code).toBe("DATE_YEAR_UNRESOLVED");
  });

  it("refuses two date-shaped lines rather than picking the first", () => {
    const read = readPrintedDate(
      [
        { text: "14 ก.ค. 2569 - 09:05", left: 100, right: 400, top: 50, bottom: 74 },
        { text: "15 ก.ค. 2569 - 10:10", left: 100, right: 400, top: 120, bottom: 144 }
      ],
      today
    );
    expect(read.ok).toBe(false);
    if (read.ok) return;
    expect(read.code).toBe("DATE_AMBIGUOUS");
  });

  it("does not read a reference or a masked account as a date", () => {
    // Both are digit runs, and a grammar keyed on digits alone would take either. Requiring a
    // month token from a closed list is what makes scanning safe without a label.
    const read = readPrintedDate(
      [
        { text: "202607231GM7e5j3VFEeH4XvB", left: 100, right: 500, top: 50, bottom: 74 },
        { text: "xxx-x-x6850-x", left: 100, right: 300, top: 120, bottom: 144 }
      ],
      today
    );
    expect(read.ok).toBe(false);
    if (read.ok) return;
    expect(read.code).toBe("DATE_NOT_FOUND");
  });

  it("refuses a day the calendar does not have, rather than rolling it forward", () => {
    // `Date` would turn 31 September into 1 October without complaint, which is a wrong date
    // that looks right — the failure mode this whole module exists to avoid.
    const read = readPrintedDate(dateLine("31 ก.ย. 2569"), today);
    expect(read.ok).toBe(false);
  });

  it("refuses a year outside the window a slip can plausibly belong to", () => {
    const read = readPrintedDate(dateLine("14 ก.ค. 2500"), today);
    expect(read.ok).toBe(false);
    // The code matters as much as the refusal. This is a four-digit year that converts out of
    // the window, which is a different failure from the two-digit one above — and asserting
    // only `ok === false` let both report as "this slip prints a two-digit year", which was
    // false for this input and is exactly the passing-for-the-wrong-reason GOTCHAS warns of.
    if (read.ok) return;
    expect(read.code).toBe("DATE_NOT_FOUND");
  });

  it("tolerates the word breaks an engine chooses, since Thai has no spaces", () => {
    // The same argument `findLabelLine` makes: where the engine splits a run is its business.
    const read = readPrintedDate(
      [
        { text: "14", left: 100, right: 130, top: 50, bottom: 74 },
        { text: "ก.ค.", left: 135, right: 180, top: 50, bottom: 74 },
        { text: "2569", left: 185, right: 240, top: 50, bottom: 74 }
      ],
      today
    );
    expect(read.ok && read.value.iso).toBe("2026-07-14");
  });
});
