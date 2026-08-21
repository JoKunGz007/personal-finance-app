import { describe, expect, it } from "vitest";
import { classifySlip, resolveSlipDate, signedSlipAmount } from "@/lib/slip-batch";
import { type OcrWord } from "@/lib/slip-ocr";
import { slipDateWindow } from "@/lib/slips";

/**
 * Bulk slip upload's policy (PLAN task 39, D-135).
 *
 * Every value here is invented, per `docs/FIXTURE_POLICY.md`: the amounts are round numbers chosen
 * to exercise the grammar, and the references are built to the *shape* recorded in D-059 — eight
 * date-shaped digits at offset 0 for SCB, at offset 1 for Krungthai's longer variant — not copied
 * from any real slip. Label wordings come from `docs/SLIP_CONTRACT.md`, which is the one thing here
 * describing real documents.
 *
 * There is no browser and no OCR engine in these tests, because there is none in the module. That
 * is the point of the split: the rule deciding **whether a slip may be filed without the owner
 * looking at it** is the rule most worth testing, and it must not need a camera to exercise.
 */

// Fixed so the era conversion and the ten-year window are the same on every run. `slipDateWindow`
// is the shipped function rather than a hand-written pair, so this cannot drift from the form.
const TODAY = new Date("2026-08-21T04:00:00Z");
const WINDOW = slipDateWindow(TODAY);

function line(top: number, entries: Array<[string, number, number]>): OcrWord[] {
  return entries.map(([text, left, right]) => ({ text, left, right, top, bottom: top + 20 }));
}

/** A Krungthai slip: the amount under its own label, and a fee below it to be ignored. */
function slipWords(options: { amount?: string; printed?: string | null } = {}): OcrWord[] {
  const words = [
    ...line(100, [["จำนวนเงิน", 10, 90], [options.amount ?? "1,250.00", 300, 380], ["บาท", 390, 420]]),
    ...line(140, [["ค่าธรรมเนียม", 10, 90], ["12.00", 300, 360], ["บาท", 390, 420]])
  ];
  if (options.printed !== null && options.printed !== undefined) {
    words.push(...line(60, [[options.printed, 10, 200]]));
  }
  return words;
}

// SCB puts the date first; Krungthai's 21-character variant puts one letter in front of it.
const scbReference = (date: string) => `${date}1234567890AB`;
const ktbReference = (date: string) => `K${date}1234567890AB`;

describe("resolving a batch slip's date", () => {
  it("takes the QR reference's date, which is exact and under the QR's own CRC", () => {
    const resolved = resolveSlipDate({
      reference: scbReference("20260714"),
      words: slipWords({ printed: null }),
      window: WINDOW,
      today: TODAY
    });
    expect(resolved.ok && resolved.date).toEqual({ occurredOn: "2026-07-14", occurredAtTime: null, source: "qr" });
  });

  it("reads the same date out of Krungthai's longer reference, one character in", () => {
    const resolved = resolveSlipDate({
      reference: ktbReference("20260714"),
      words: slipWords({ printed: null }),
      window: WINDOW,
      today: TODAY
    });
    expect(resolved.ok && resolved.date.source).toBe("qr");
    expect(resolved.ok && resolved.date.occurredOn).toBe("2026-07-14");
  });

  // The finding this whole module turns on. `readPrintedDate` shipped on 2026-08-10 (D-086) and
  // nothing in the app called it, so a reference carrying no date meant "today" — and a backlog
  // dated today can never pair, because slips reconcile inside a one-day window.
  it("falls back to the date printed on the slip when the reference carries none", () => {
    const resolved = resolveSlipDate({
      // No date-shaped run at either offset, so the reference contributes nothing.
      reference: "AB12CD34EF56GH78",
      words: slipWords({ printed: "14 ก.ค. 2569 - 09:05" }),
      window: WINDOW,
      today: TODAY
    });
    // 2569 BE is 2026 CE. A slip prints the Buddhist era and the QR reference does not, which is
    // the asymmetry D-031 already cost this project a ledger dated 1983.
    expect(resolved.ok && resolved.date).toEqual({ occurredOn: "2026-07-14", occurredAtTime: "09:05", source: "printed" });
  });

  it("carries the printed time alongside the reference's date, because the reference has none", () => {
    const resolved = resolveSlipDate({
      reference: scbReference("20260714"),
      words: slipWords({ printed: "14 ก.ค. 2569 - 09:05" }),
      window: WINDOW,
      today: TODAY
    });
    expect(resolved.ok && resolved.date).toEqual({ occurredOn: "2026-07-14", occurredAtTime: "09:05", source: "qr" });
  });

  // Nothing here can say which reading is right, and a wrong date is the one failure that never
  // heals itself — so this refuses rather than preferring the CRC-covered one and moving on.
  it("refuses when the QR's date and the printed date disagree", () => {
    const resolved = resolveSlipDate({
      reference: scbReference("20260714"),
      words: slipWords({ printed: "15 ก.ค. 2569 - 09:05" }),
      window: WINDOW,
      today: TODAY
    });
    expect(resolved.ok).toBe(false);
    expect(!resolved.ok && resolved.reason).toContain("disagree");
  });

  // KBANK: no date in the reference and a two-digit printed year, which `readPrintedDate` will not
  // complete (D-031). This is the residue bulk upload cannot close, and it is named rather than
  // absorbed into a generic failure.
  it("passes the printed reader's own refusal through for a two-digit year", () => {
    const resolved = resolveSlipDate({
      reference: "AB12CD34EF56GH78",
      words: slipWords({ printed: "24 ก.ค. 69  11:38 น." }),
      window: WINDOW,
      today: TODAY
    });
    expect(resolved.ok).toBe(false);
    expect(!resolved.ok && resolved.reason).toContain("two-digit year");
  });

  it("says so plainly when neither source carries a date", () => {
    const resolved = resolveSlipDate({
      reference: "AB12CD34EF56GH78",
      words: slipWords({ printed: null }),
      window: WINDOW,
      today: TODAY
    });
    expect(resolved.ok).toBe(false);
    expect(!resolved.ok && resolved.reason).toContain("No line on this image reads as a date");
  });

  // The two windows do not coincide and the gap between them is real rather than contrived.
  // `gregorianFromPrintedYear` fails closed on a *year* — this year minus ten — while
  // `slipDateWindow` bounds a *date*, ten years back to the day. So a slip printed in the earlier
  // part of the tenth year back passes the era check and is still outside what `capture_slip` will
  // accept. Checked here rather than discovered as a refusal after the request went.
  it("refuses a printed date outside the window this ledger accepts", () => {
    const resolved = resolveSlipDate({
      reference: "AB12CD34EF56GH78",
      // 2559 BE is 2016 CE, which the era window allows and which falls a month before the
      // earliest date this window accepts.
      words: slipWords({ printed: "14 ก.ค. 2559" }),
      window: WINDOW,
      today: TODAY
    });
    expect(resolved.ok).toBe(false);
    expect(!resolved.ok && resolved.reason).toContain("outside the range");
  });
});

describe("classifying one slip in a batch", () => {
  it("is ready when the amount read cleanly and the date is exact", () => {
    const verdict = classifySlip({
      reference: scbReference("20260714"),
      bankCode: "KTB",
      words: slipWords(),
      readerRefusal: null,
      window: WINDOW,
      today: TODAY
    });
    expect(verdict.status).toBe("ready");
    // The **magnitude**. The direction supplies the sign at submit, so changing the batch's
    // direction re-signs every row without re-reading a single image.
    expect(verdict.status === "ready" && verdict.amountMinor).toBe("125000");
    expect(verdict.status === "ready" && verdict.date.source).toBe("qr");
  });

  // The hazard `proposeAmount` exists to refuse, carried up to the batch verdict: a fee is money,
  // on a nearby line, small and plausible. A slip whose amount label did not read must reach the
  // owner rather than be filed with whatever other number was visible.
  it("sends a slip to review when the amount's label is not found, rather than taking the fee", () => {
    const verdict = classifySlip({
      reference: scbReference("20260714"),
      bankCode: "KTB",
      words: line(140, [["ค่าธรรมเนียม", 10, 90], ["12.00", 300, 360], ["บาท", 390, 420]]),
      readerRefusal: null,
      window: WINDOW,
      today: TODAY
    });
    expect(verdict.status).toBe("review");
    expect(verdict.status === "review" && verdict.reason).toContain("could not be found");
  });

  it("sends a slip to review when the figure beside the label does not read as money", () => {
    const verdict = classifySlip({
      reference: scbReference("20260714"),
      bankCode: "KTB",
      // One fractional place is a dropped glyph, not a tidy number, and the grammar refuses it.
      words: slipWords({ amount: "1,250.5" }),
      readerRefusal: null,
      window: WINDOW,
      today: TODAY
    });
    expect(verdict.status).toBe("review");
  });

  it("refuses a zero amount, which is not a slip this ledger can store", () => {
    const verdict = classifySlip({
      reference: scbReference("20260714"),
      bankCode: "KTB",
      words: slipWords({ amount: "0" }),
      readerRefusal: null,
      window: WINDOW,
      today: TODAY
    });
    expect(verdict.status).toBe("review");
  });

  // A slip whose amount read perfectly is still not fileable unseen without a date, and this is
  // the case the handoff identified as the one where bulk upload breaks precisely when it is most
  // wanted — a backlog.
  it("sends a slip with a perfect amount and no usable date to review", () => {
    const verdict = classifySlip({
      reference: "AB12CD34EF56GH78",
      bankCode: "KTB",
      words: slipWords({ printed: null }),
      readerRefusal: null,
      window: WINDOW,
      today: TODAY
    });
    expect(verdict.status).toBe("review");
  });

  it("carries the reader's own words when the reader could not be reached at all", () => {
    const verdict = classifySlip({
      reference: scbReference("20260714"),
      bankCode: "KTB",
      words: null,
      readerRefusal: "The reader could not be reached.",
      window: WINDOW,
      today: TODAY
    });
    expect(verdict.status).toBe("review");
    expect(verdict.status === "review" && verdict.reason).toBe("The reader could not be reached.");
  });
});

describe("applying the batch's direction", () => {
  // The same sign convention `slipCaptureSchema` cross-checks. A deposit filed as a withdrawal has
  // the opposite sign, can never pair with any statement row, and skews the totals until corrected
  // by hand — which is why direction is asked once rather than guessed per slip.
  it("makes a withdrawal negative and a deposit positive", () => {
    expect(signedSlipAmount("125000", "withdrawal")).toBe("-125000");
    expect(signedSlipAmount("125000", "deposit")).toBe("125000");
  });

  it("takes the magnitude first, so a signed input cannot override the chosen direction", () => {
    expect(signedSlipAmount("-125000", "deposit")).toBe("125000");
    expect(signedSlipAmount("-125000", "withdrawal")).toBe("-125000");
  });
});
