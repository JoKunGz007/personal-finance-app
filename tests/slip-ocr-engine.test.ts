import { describe, expect, it } from "vitest";
import { wordsFromBlocks, type RecognisedBlock } from "@/lib/slip-ocr-engine";
import { locateAmount } from "@/lib/slip-ocr";

// The seam between the engine and the policy layer (PLAN task 21, D-087). Every value here is
// invented per docs/FIXTURE_POLICY.md; the label wording is format knowledge from
// docs/SLIP_CONTRACT.md, which is the only thing in this file describing a real document.
//
// tesseract.js is not loaded by any of these. `wordsFromBlocks` is the whole of what this
// module does with the engine's output, and it is a pure function over a shape — which is why
// it is typed structurally rather than imported from the package. A test that had to boot a
// WebAssembly build to check that an empty word is dropped would not be run.

/** tesseract's nesting, built the way it reports it: blocks → paragraphs → lines → words. */
function block(lines: Array<Array<{ text: string; box: [number, number, number, number] }>>): RecognisedBlock {
  return {
    paragraphs: [{
      lines: lines.map((words) => ({
        words: words.map(({ text, box }) => ({ text, bbox: { x0: box[0], y0: box[1], x1: box[2], y1: box[3] } }))
      }))
    }]
  };
}

describe("flattening the engine's output into words", () => {
  it("maps every word's box onto the policy layer's coordinates", () => {
    const words = wordsFromBlocks([block([[{ text: "จำนวนเงิน", box: [10, 100, 90, 122] }, { text: "1,250.00", box: [300, 100, 380, 122] }]])]);
    expect(words).toEqual([
      { text: "จำนวนเงิน", left: 10, top: 100, right: 90, bottom: 122 },
      { text: "1,250.00", left: 300, top: 100, right: 380, bottom: 122 }
    ]);
  });

  it("flattens across blocks, paragraphs and lines without keeping any of them", () => {
    // The engine's own line grouping is discarded deliberately: `groupIntoLines` re-derives
    // lines from vertical overlap, because a Thai tone mark makes a taller box and an engine
    // splits on it. Two line models would be one more than was measured.
    const words = wordsFromBlocks([
      block([[{ text: "a", box: [0, 0, 10, 10] }], [{ text: "b", box: [0, 20, 10, 30] }]]),
      block([[{ text: "c", box: [0, 40, 10, 50] }]])
    ]);
    expect(words.map((word) => word.text)).toEqual(["a", "b", "c"]);
  });

  it("drops a word with no text and one whose box has no area", () => {
    // Both are things an engine emits routinely. An empty word would join a label's line and
    // contribute nothing; a zero-width one would widen the crop for nothing.
    const words = wordsFromBlocks([block([[
      { text: "   ", box: [0, 0, 10, 10] },
      { text: "keep", box: [20, 0, 40, 10] },
      { text: "flat", box: [50, 0, 50, 10] },
      { text: "thin", box: [60, 0, 80, 0] }
    ]])]);
    expect(words.map((word) => word.text)).toEqual(["keep"]);
  });

  it("trims the text it keeps, since a label is matched on its characters", () => {
    const words = wordsFromBlocks([block([[{ text: "  1,250.00\n", box: [0, 0, 10, 10] }]])]);
    expect(words[0]!.text).toBe("1,250.00");
  });

  it("keeps a word the engine was unsure about, because the crop only needs its position", () => {
    // No confidence floor, on purpose. A doubtful word still sits in the right place, and the
    // dominant failure is a label that was never recognised at all (7 of 23, D-087) — which no
    // threshold recovers. A floor would only lose labels.
    const unsure = [{ paragraphs: [{ lines: [{ words: [
      { text: "จำนวนเงิน", bbox: { x0: 10, y0: 100, x1: 90, y1: 122 }, confidence: 4 }
    ] }] }] }];
    expect(wordsFromBlocks(unsure).map((word) => word.text)).toEqual(["จำนวนเงิน"]);
  });

  it("returns nothing rather than throwing when the engine reports no geometry", () => {
    // `recognize` without `{ blocks: true }` returns `blocks: null` and text only — the half
    // this feature does not use. An engine that read nothing must be an empty list, which the
    // policy layer turns into `LABEL_NOT_FOUND`, and never a crash.
    expect(wordsFromBlocks(null)).toEqual([]);
    expect(wordsFromBlocks(undefined)).toEqual([]);
    expect(wordsFromBlocks([{}])).toEqual([]);
    expect(wordsFromBlocks([{ paragraphs: [{}] }])).toEqual([]);
    expect(wordsFromBlocks([{ paragraphs: [{ lines: [{}] }] }])).toEqual([]);
  });
});

describe("the seam holds end to end", () => {
  it("hands the policy layer words it can locate an amount in", () => {
    // The one test that spans both halves: engine-shaped input on one side, a located region
    // on the other, with nothing stubbed between them. If the box mapping were transposed or
    // off by an axis, this is what would catch it.
    const words = wordsFromBlocks([block([
      [{ text: "ค่าธรรมเนียม", box: [10, 60, 110, 82] }, { text: "0.00", box: [300, 60, 360, 82] }],
      [{ text: "จำนวนเงิน", box: [10, 100, 90, 122] }, { text: "1,250.00", box: [300, 100, 380, 122] }]
    ])]);
    const located = locateAmount(words, "KTB");
    expect(located.ok).toBe(true);
    if (!located.ok) return;
    // The amount's line and nothing from the fee's line above it — the region spans the label
    // and its value, which is what makes the crop self-describing.
    expect(located.value).toEqual({ left: 10, top: 100, right: 380, bottom: 122 });
  });
});
