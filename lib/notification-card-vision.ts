import type { OcrWord } from "@/lib/slip-ocr";

/**
 * The card reader's engine: pixels in, `OcrWord[]` out, via Google Cloud Vision (`PLAN.md` task 35).
 *
 * This is the Vision counterpart to `lib/slip-ocr-engine.ts` and it sits on the same seam. The
 * policy layers — `lib/notification-card-ocr.ts` and `lib/notification-card-prefill.ts` — depend on
 * no engine, and the only thing that crosses between them is `OcrWord`: a word and its box. That is
 * what made the comparison behind D-118 like-for-like, and it is what lets this file be swapped or
 * removed without touching a grammar rule.
 *
 * ## Why the card reader calls out and the slip reader does not
 *
 * Measured over the same 12 real screenshots and the same grammar (D-118, D-119): Vision fills
 * **99 of 100** digit-bearing fields where the local engine fills 70, and reads KBank Live's balance
 * and account digits, which are 0 of 5 locally under every mode, variant and scale tried (D-117).
 * `lib/slip-ocr-engine.ts` is untouched and keeps reading **slips** on the device, so tesseract, its
 * self-hosted assets and every privacy rule around them stay exactly as they were. Vision has never
 * been measured on a slip, and measuring it would mean sending 23 real slips to a third party —
 * a much larger disclosure than a card and not a thing this decision covers.
 *
 * ## No fallback, deliberately
 *
 * A failed read leaves every box blank and the owner types the card, which is what happened until
 * 2026-08-16 and is not a failure mode worth a second engine. The reason to refuse a silent
 * tesseract fallback is not safety — the pre-fill is blank-on-failure either way — it is that two
 * engines behind one grammar means every future grammar change has to be measured twice, and
 * `findCards` is already known to be sensitive to where an engine breaks a Thai run (D-119).
 *
 * ## What this file may not do
 *
 * It never holds, reads or logs the API key: the key is a parameter, supplied by the one route
 * allowed to know it. It emits no image and no recognised text to any log. And it is called from
 * the **server**, never the browser — a key in a `NEXT_PUBLIC_` value is a key the page hands to
 * anyone who loads it, and routing through this app's own origin is also why the CSP is unchanged:
 * `connect-src` still names `'self'` and the Supabase origin alone (D-058).
 */

/** Vision's response, structurally, so no client library is imported for four field names. */
type VisionVertex = { x?: number; y?: number };
type VisionWord = { symbols?: Array<{ text?: string }>; boundingBox?: { vertices?: VisionVertex[] } };
type VisionParagraph = { words?: VisionWord[] };
type VisionBlock = { paragraphs?: VisionParagraph[] };
type VisionPage = { blocks?: VisionBlock[] };

export type VisionAnnotateResponse = {
  responses?: Array<{
    fullTextAnnotation?: { pages?: VisionPage[] };
    error?: { message?: string };
  }>;
};

/**
 * `DOCUMENT_TEXT_DETECTION` rather than `TEXT_DETECTION`.
 *
 * Both return `fullTextAnnotation`, and the dense-text model is the right subject: a notification
 * card is small grey label text laid out in rows, not a photograph with a sign in it. The language
 * hint matters more than the feature choice — without it Thai tone marks are routinely attached to
 * the wrong base character, and a mangled label is a field the grammar refuses.
 */
export const VISION_FEATURE = "DOCUMENT_TEXT_DETECTION";
export const VISION_LANGUAGE_HINTS = ["th", "en"] as const;

export const VISION_ENDPOINT = "https://vision.googleapis.com/v1/images:annotate";

/**
 * The request body for one image.
 *
 * Exported so the measurement harness sends byte-for-byte what the app sends. A harness that built
 * its own body would be measuring a copy of this file's arithmetic, which is the error D-113 made.
 */
export function visionRequestBody(base64Image: string): string {
  return JSON.stringify({
    requests: [
      {
        image: { content: base64Image },
        features: [{ type: VISION_FEATURE }],
        imageContext: { languageHints: [...VISION_LANGUAGE_HINTS] }
      }
    ]
  });
}

/**
 * Flattens Vision's page/block/paragraph/word nesting into the flat word list the policy layer reads.
 *
 * Structure above the word is discarded for the same reason `wordsFromBlocks` discards tesseract's:
 * `groupIntoLines` re-derives lines from vertical *overlap*, because a Thai tone mark makes a taller
 * box and an engine's own line grouping splits on it (`lib/slip-ocr.ts`). Trusting Vision's
 * paragraphs here would put a second, different line model in front of the measured one.
 *
 * A box arrives as four vertices rather than a rectangle, and may be rotated. The axis-aligned
 * bounds are taken, which is what `OcrWord` holds and all any caller uses. **A missing coordinate
 * means zero**, which is Vision's own convention rather than an assumption: it omits `x` or `y`
 * when the value is 0, so treating absence as "unknown" would drop every word touching an edge.
 */
export function wordsFromVision(response: VisionAnnotateResponse | null | undefined): OcrWord[] {
  const words: OcrWord[] = [];
  for (const page of response?.responses?.[0]?.fullTextAnnotation?.pages ?? []) {
    for (const block of page.blocks ?? []) {
      for (const paragraph of block.paragraphs ?? []) {
        for (const word of paragraph.words ?? []) {
          const text = (word.symbols ?? []).map((symbol) => symbol.text ?? "").join("").trim();
          const vertices = word.boundingBox?.vertices ?? [];
          if (text.length === 0 || vertices.length === 0) continue;
          const xs = vertices.map((vertex) => vertex.x ?? 0);
          const ys = vertices.map((vertex) => vertex.y ?? 0);
          const left = Math.min(...xs);
          const top = Math.min(...ys);
          const right = Math.max(...xs);
          const bottom = Math.max(...ys);
          // Degenerate boxes are dropped rather than passed on, exactly as the tesseract seam does:
          // a zero-width word cannot contribute to a crop and would widen a field region for nothing.
          if (right <= left || bottom <= top) continue;
          words.push({ text, left, top, right, bottom });
        }
      }
    }
  }
  return words;
}

/** What went wrong, in the vocabulary the form turns into a sentence for the owner. */
export type CardReadFailure =
  /** No key configured. The deployment is misconfigured; the owner still types the card. */
  | "NOT_CONFIGURED"
  /** The call did not complete — no network, a timeout, DNS, a refused connection. */
  | "UNREACHABLE"
  /** Vision answered and refused: a bad key, a disabled API, a quota, an unreadable image. */
  | "REFUSED";

export type CardReadResult =
  | { readonly ok: true; readonly words: OcrWord[] }
  | { readonly ok: false; readonly code: CardReadFailure };

/**
 * Reads every word on a card screenshot, or says which way it failed.
 *
 * The key is a parameter and is never read from the environment here, so this function is callable
 * from a test and from the measurement harness without either one holding a credential. It is also
 * the reason nothing in this file can accidentally log it.
 *
 * **An empty word list is a success, not a failure**, and the distinction is the same one
 * `readSlipWords` makes: "the engine ran and read nothing" is an honest answer that the grammar
 * turns into a named refusal, whereas a failure means no reading happened at all.
 */
export async function readCardWordsWithVision(
  image: Uint8Array,
  apiKey: string,
  fetchImpl: typeof fetch = fetch
): Promise<CardReadResult> {
  if (apiKey.length === 0) return { ok: false, code: "NOT_CONFIGURED" };

  let response: Response;
  try {
    response = await fetchImpl(VISION_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // The key travels in a header rather than the `?key=` query string Google's examples use.
        // Same authentication either way; a query string is the half of a URL that ends up in
        // access logs and error reports, and a credential should not be in either.
        "X-Goog-Api-Key": apiKey
      },
      body: visionRequestBody(Buffer.from(image).toString("base64"))
    });
  } catch {
    return { ok: false, code: "UNREACHABLE" };
  }

  if (!response.ok) return { ok: false, code: "REFUSED" };

  let parsed: VisionAnnotateResponse;
  try {
    parsed = (await response.json()) as VisionAnnotateResponse;
  } catch {
    return { ok: false, code: "REFUSED" };
  }
  // A 200 carrying a per-image error is Vision's normal way of refusing one image in a batch, so
  // the status alone is not the answer. The message is deliberately not returned or logged: it can
  // quote the image, and nothing about this card may reach a log.
  if (parsed.responses?.[0]?.error) return { ok: false, code: "REFUSED" };

  return { ok: true, words: wordsFromVision(parsed) };
}
