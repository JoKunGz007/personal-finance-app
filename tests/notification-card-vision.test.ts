import { describe, expect, it, vi } from "vitest";
import {
  VISION_ENDPOINT,
  readCardWordsWithVision,
  visionRequestBody,
  wordsFromVision,
  type VisionAnnotateResponse
} from "@/lib/notification-card-vision";

/**
 * The Vision seam (D-120, `PLAN.md` task 35).
 *
 * Nothing here measures recognition — the accuracy claim is a measurement over real screenshots
 * (D-118, D-119), not something a fixture can assert. What these cover is the two halves that can
 * go wrong silently: the shape a Vision response is turned into, and which failures are told apart
 * from which. Every fixture below is invented, per `docs/FIXTURE_POLICY.md`.
 */

/** Structural, and looser than `visionWord` returns, so a fixture may omit a zero coordinate. */
type WordFixture = {
  symbols: Array<{ text: string }>;
  boundingBox: { vertices: Array<{ x?: number; y?: number }> };
};

/** One Vision word, in the nesting the API actually returns. */
function visionWord(text: string, box: { left: number; top: number; right: number; bottom: number }): WordFixture {
  return {
    symbols: [...text].map((character) => ({ text: character })),
    boundingBox: {
      vertices: [
        { x: box.left, y: box.top },
        { x: box.right, y: box.top },
        { x: box.right, y: box.bottom },
        { x: box.left, y: box.bottom }
      ]
    }
  };
}

function annotated(words: WordFixture[]): VisionAnnotateResponse {
  return { responses: [{ fullTextAnnotation: { pages: [{ blocks: [{ paragraphs: [{ words }] }] }] } }] };
}

describe("turning a Vision response into the words the grammar reads", () => {
  it("joins a word's symbols and takes its bounds", () => {
    const words = wordsFromVision(annotated([visionWord("บาท", { left: 10, top: 20, right: 60, bottom: 44 })]));
    expect(words).toEqual([{ text: "บาท", left: 10, top: 20, right: 60, bottom: 44 }]);
  });

  it("reads a rotated box as the rectangle that contains it", () => {
    // Vision returns four vertices, not a rectangle, and they can be skewed. `OcrWord` holds an
    // axis-aligned box and every caller treats it as one, so the bounds are what must be taken —
    // reading vertices 0 and 2 as opposite corners would give the wrong box on any tilt.
    const skewed = {
      symbols: [{ text: "1" }, { text: "2" }],
      boundingBox: { vertices: [{ x: 12, y: 4 }, { x: 40, y: 9 }, { x: 38, y: 30 }, { x: 10, y: 25 }] }
    };
    expect(wordsFromVision(annotated([skewed]))).toEqual([{ text: "12", left: 10, top: 4, right: 40, bottom: 30 }]);
  });

  it("treats a missing coordinate as zero, because that is what Vision means by it", () => {
    // Vision omits `x` or `y` when the value is 0. Reading absence as "unknown" and skipping the
    // word would drop every word touching the left or top edge — on a notification card, the
    // labels every field is located from.
    const atTheEdge = {
      symbols: [{ text: "ก" }],
      boundingBox: { vertices: [{ y: 5 }, { x: 30, y: 5 }, { x: 30, y: 25 }, { y: 25 }] }
    };
    expect(wordsFromVision(annotated([atTheEdge]))).toEqual([{ text: "ก", left: 0, top: 5, right: 30, bottom: 25 }]);
  });

  it("drops a word with no text and a box with no area", () => {
    // The same two exclusions the tesseract seam makes (`wordsFromBlocks`): a zero-width word
    // cannot contribute to a crop and would widen a field region for nothing.
    const empty = visionWord("   ", { left: 0, top: 0, right: 10, bottom: 10 });
    const flat = visionWord("x", { left: 5, top: 5, right: 5, bottom: 20 });
    expect(wordsFromVision(annotated([empty, flat]))).toEqual([]);
  });

  it("returns nothing rather than throwing when the response carries no annotation", () => {
    expect(wordsFromVision(null)).toEqual([]);
    expect(wordsFromVision(undefined)).toEqual([]);
    expect(wordsFromVision({})).toEqual([]);
    expect(wordsFromVision({ responses: [{}] })).toEqual([]);
  });

  it("reads words from every block and paragraph, not only the first", () => {
    const response: VisionAnnotateResponse = {
      responses: [
        {
          fullTextAnnotation: {
            pages: [
              {
                blocks: [
                  { paragraphs: [{ words: [visionWord("a", { left: 0, top: 0, right: 5, bottom: 5 })] }] },
                  { paragraphs: [{ words: [visionWord("b", { left: 0, top: 9, right: 5, bottom: 14 })] }] }
                ]
              }
            ]
          }
        }
      ]
    };
    expect(wordsFromVision(response).map((word) => word.text)).toEqual(["a", "b"]);
  });
});

describe("the request Vision is asked", () => {
  it("asks for dense text with a Thai hint", () => {
    // The language hint is the part that matters: without it Thai tone marks attach to the wrong
    // base character, and a mangled label is a field the grammar refuses rather than a value that
    // reads wrongly.
    const body = JSON.parse(visionRequestBody("QUJD")) as {
      requests: Array<{
        image: { content: string };
        features: Array<{ type: string }>;
        imageContext: { languageHints: string[] };
      }>;
    };
    expect(body.requests).toHaveLength(1);
    expect(body.requests[0]!.image.content).toBe("QUJD");
    expect(body.requests[0]!.features[0]!.type).toBe("DOCUMENT_TEXT_DETECTION");
    expect(body.requests[0]!.imageContext.languageHints).toContain("th");
  });
});

describe("which failures are told apart", () => {
  const image = new Uint8Array([1, 2, 3]);

  it("refuses without calling out at all when no key is configured", async () => {
    const fetchImpl = vi.fn();
    const result = await readCardWordsWithVision(image, "", fetchImpl as unknown as typeof fetch);
    expect(result).toEqual({ ok: false, code: "NOT_CONFIGURED" });
    // The call must not be attempted: an unauthenticated request is a refusal that costs a round
    // trip and puts the image on the wire for nothing.
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("carries the key in a header and never in the URL", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(annotated([])), { status: 200 }));
    await readCardWordsWithVision(image, "a-key", fetchImpl as unknown as typeof fetch);

    const [url, init] = fetchImpl.mock.calls[0]! as unknown as [string, RequestInit];
    expect(url).toBe(VISION_ENDPOINT);
    // A query string is the half of a URL that lands in access logs and error reports.
    expect(url).not.toContain("a-key");
    expect((init.headers as Record<string, string>)["X-Goog-Api-Key"]).toBe("a-key");
  });

  it("separates a call that did not complete from one that was refused", async () => {
    const threw = vi.fn(async () => { throw new Error("network"); });
    expect(await readCardWordsWithVision(image, "k", threw as unknown as typeof fetch))
      .toEqual({ ok: false, code: "UNREACHABLE" });

    const rejected = vi.fn(async () => new Response("{}", { status: 403 }));
    expect(await readCardWordsWithVision(image, "k", rejected as unknown as typeof fetch))
      .toEqual({ ok: false, code: "REFUSED" });
  });

  it("treats a 200 carrying a per-image error as a refusal", async () => {
    // Vision's normal way of refusing one image is a 200 whose response object holds an error, so
    // the status alone is not the answer — reading it as success would hand the grammar an empty
    // word list and report "no card found on this image", which is a different problem.
    const fetchImpl = vi.fn(async () => new Response(
      JSON.stringify({ responses: [{ error: { message: "Bad image data" } }] }),
      { status: 200 }
    ));
    expect(await readCardWordsWithVision(image, "k", fetchImpl as unknown as typeof fetch))
      .toEqual({ ok: false, code: "REFUSED" });
  });

  it("refuses a body that is not the JSON it claims to be", async () => {
    const fetchImpl = vi.fn(async () => new Response("<html>gateway</html>", { status: 200 }));
    expect(await readCardWordsWithVision(image, "k", fetchImpl as unknown as typeof fetch))
      .toEqual({ ok: false, code: "REFUSED" });
  });

  it("counts an empty reading as a success, because it is one", async () => {
    // "The engine ran and read nothing" is an honest answer the grammar turns into a named
    // refusal; a failure means no reading happened at all. `readSlipWords` draws the same line.
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(annotated([])), { status: 200 }));
    expect(await readCardWordsWithVision(image, "k", fetchImpl as unknown as typeof fetch))
      .toEqual({ ok: true, words: [] });
  });

  it("returns the words when the call succeeds", async () => {
    const fetchImpl = vi.fn(async () => new Response(
      JSON.stringify(annotated([visionWord("ยอด", { left: 4, top: 8, right: 40, bottom: 30 })])),
      { status: 200 }
    ));
    expect(await readCardWordsWithVision(image, "k", fetchImpl as unknown as typeof fetch))
      .toEqual({ ok: true, words: [{ text: "ยอด", left: 4, top: 8, right: 40, bottom: 30 }] });
  });
});
