import type { OcrWord } from "@/lib/slip-ocr";

/**
 * The browser half of slip OCR: pixels in, `OcrWord[]` out (PLAN task 21, D-087).
 *
 * `lib/slip-ocr.ts` is the policy — what counts as a label, what counts as money, when to
 * refuse — and it depends on no engine. This is the other side of that split, and it is the
 * only file in the repository that knows tesseract.js exists. The seam between them is
 * `OcrWord`: a word and its box, which every OCR engine reports and nothing here assumes more
 * than. Swapping the engine means rewriting this file and nothing else.
 *
 * ## What it is for, which is narrower than it sounds
 *
 * The words this produces are used to **locate** the amount, not to read it (`locateAmount`,
 * D-087). The owner reads the digits off a cropped enlargement. That is why nothing here
 * filters on confidence or tries to improve a doubtful read: a word only has to be found in
 * roughly the right place for the crop to be right, and the measured ~1-in-15 digit
 * instability cannot reach a stored value because no machine-read digit is ever stored.
 *
 * ## Native resolution, and the ladder is deliberately not reused
 *
 * `lib/slip-scan.ts` upscales to 2× when a QR will not decode, and that ladder **must not be
 * borrowed here**. Measured over all 23 real samples on 2026-08-10: a 2× cubic upscale
 * recovered 1 image and broke 3 that were working (D-087). The two are different problems — a
 * QR decoder needs module size above a threshold, a text recogniser needs glyph shapes near
 * its training, and interpolation adds no information while disturbing them.
 *
 * ## Why every path is written out, and none of them is a default
 *
 * tesseract.js resolves its worker, its core and its language data from a CDN when left
 * alone. `connect-src` names `'self'` and the configured Supabase origin (D-058), so those
 * fetches are blocked by policy — but the policy is the backstop, not the reason. A finance
 * app that pulled executable code and a language model from a third party at runtime would
 * have handed that party the page. `scripts/copy-tesseract-assets.mjs` puts all four files
 * under `public/tesseract/` at build time, so what ships is what was installed.
 */

/** One recognised word as tesseract reports it. Structural, so no engine type is imported. */
type RecognisedWord = { text?: string; bbox?: { x0: number; y0: number; x1: number; y1: number } };
type RecognisedLine = { words?: RecognisedWord[] };
type RecognisedParagraph = { lines?: RecognisedLine[] };
export type RecognisedBlock = { paragraphs?: RecognisedParagraph[] };

/** Anything tesseract.js will decode. The component hands it the captured file unchanged. */
export type SlipImage = Blob | ImageBitmap | HTMLCanvasElement;

type TesseractWorker = {
  recognize(
    image: SlipImage,
    options?: Record<string, unknown>,
    output?: Record<string, boolean>
  ): Promise<{ data: { blocks: RecognisedBlock[] | null } }>;
  terminate(): Promise<unknown>;
};

/**
 * Flattens tesseract's nested output into the flat word list the policy layer reads.
 *
 * Blocks, paragraphs and lines are all discarded, and that is deliberate rather than lazy:
 * `groupIntoLines` re-derives lines from vertical *overlap* because a Thai tone mark makes a
 * taller box and an engine's own line grouping splits on it (`lib/slip-ocr.ts`). Trusting the
 * engine's paragraph structure here would put a second, different line model in front of the
 * one that was measured.
 *
 * **Nothing is filtered on confidence.** The temptation is to drop doubtful words, and it is
 * the wrong move for this job: a low-confidence word still sits in the right place, and the
 * crop only needs the region. A confidence floor is an untested tuning knob whose only effect
 * would be to lose labels — and the failure that actually dominates is the label not being
 * recognised at all (7 of 23, D-087), which no threshold recovers.
 */
export function wordsFromBlocks(blocks: readonly RecognisedBlock[] | null | undefined): OcrWord[] {
  const words: OcrWord[] = [];
  for (const block of blocks ?? []) {
    for (const paragraph of block.paragraphs ?? []) {
      for (const line of paragraph.lines ?? []) {
        for (const word of line.words ?? []) {
          const text = word.text?.trim() ?? "";
          const box = word.bbox;
          if (text.length === 0 || !box) continue;
          // Degenerate boxes are dropped rather than passed on: a zero-width word cannot
          // contribute to a crop, and it would widen `locateAmount`'s region for nothing.
          if (box.x1 <= box.x0 || box.y1 <= box.y0) continue;
          words.push({ text, left: box.x0, top: box.y0, right: box.x1, bottom: box.y1 });
        }
      }
    }
  }
  return words;
}

// One worker per page, created on first use and reused afterwards.
//
// The reuse is not a micro-optimisation. Every response this app serves carries
// `Cache-Control: no-store` (`lib/security-headers.ts`), `public/tesseract/` included, so a
// second worker would re-fetch all 3.8 MB from the origin. Holding one for the page means the
// owner pays that once and every slip after the first starts immediately. Narrowing `no-store`
// to exempt these files would be the other way to fix it, and it is not worth weakening a
// blanket header for.
let workerPromise: Promise<TesseractWorker | null> | null = null;

async function startWorker(): Promise<TesseractWorker | null> {
  try {
    // Imported here rather than at module scope so the 3.9 MB of engine, core and language
    // data is fetched when the owner asks to find an amount and never merely by loading the
    // slips page. Same argument D-057 made for the 1.1 MB ZXing fallback, and it binds harder
    // at four times the size — on the phone this feature is for.
    const { createWorker, OEM } = await import("tesseract.js");
    const worker = await createWorker("tha", OEM.LSTM_ONLY, {
      workerPath: "/tesseract/worker.min.js",
      // **Named to the exact file, and that is load-bearing.** Given a directory, tesseract
      // feature-detects SIMD and asks for `tesseract-core-simd-lstm.wasm.js` — a 3.9 MB
      // single-file variant that `scripts/copy-tesseract-assets.mjs` does not copy, because it
      // copies the 89 KB loader and its separate 2.9 MB `.wasm` instead. The result would be a
      // 404 on a file nobody named, at a point where the obvious suspect is the CSP. A path
      // ending in `js` is taken verbatim and skips detection entirely.
      corePath: "/tesseract/tesseract-core-simd-lstm.js",
      // `${langPath}/tha.traineddata.gz`, which is what the build copied.
      langPath: "/tesseract",
      gzip: true,
      // **No client storage, including for a language model.** Left at its default this writes
      // the traineddata into IndexedDB, and this app stores nothing on the device — the rule
      // the privacy suite enforces and the promise slip capture makes about the image itself
      // (D-050). The cost is the re-fetch the worker reuse above already answers.
      cacheMethod: "none",
      // Same-origin worker rather than a blob one. `worker-src` permits both; a plain URL is
      // the narrower of the two and needs no exception if the policy ever tightens.
      workerBlobURL: false
    });
    return worker as unknown as TesseractWorker;
  } catch {
    // A browser that cannot start the engine is not a failure worth diagnosing here — the
    // caller reports that the amount could not be located and the owner reads the slip, which
    // is what they were going to do anyway. This feature is a convenience over a path that
    // already works without it.
    return null;
  }
}

/**
 * Reads every word on the image, or returns null if the engine could not run.
 *
 * Null and an empty array mean different things and both are real: null is "no engine", an
 * empty array is "the engine ran and read nothing". The policy layer turns the second into
 * `LABEL_NOT_FOUND`, which is the honest description of a slip whose Thai never resolved.
 */
export async function readSlipWords(image: SlipImage): Promise<OcrWord[] | null> {
  workerPromise ??= startWorker();
  const worker = await workerPromise;
  if (!worker) return null;
  try {
    // `blocks` is off by default in v5 and later, and the words only exist inside it — a
    // recognise without it returns text and no geometry at all, which is exactly the half
    // this feature does not use.
    const { data } = await worker.recognize(image, {}, { blocks: true });
    return wordsFromBlocks(data.blocks);
  } catch {
    return null;
  }
}

/** Ends the worker and lets the next call start a fresh one. */
export async function releaseSlipOcr(): Promise<void> {
  const pending = workerPromise;
  workerPromise = null;
  if (!pending) return;
  const worker = await pending.catch(() => null);
  await worker?.terminate().catch(() => undefined);
}
