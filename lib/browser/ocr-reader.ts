import type { OcrWord } from "@/lib/slip-ocr";
import { readError } from "@/lib/wire";

/**
 * The browser's half of reading an image: pixels out, `OcrWord[]` back (D-120, D-129).
 *
 * Two capture forms call this — `app/notification-card-capture.tsx` and `app/slip-capture.tsx` —
 * and **that is why it is a module rather than a function in each of them**. The card form had
 * both halves inline while it was the only caller; a second copy in the slip form would have been
 * two chances to encode differently, name a different path, or disagree about what an empty
 * response means. What each form still owns is the grammar it runs over the words, which is the
 * part that genuinely differs.
 *
 * **The bytes leave the device here, and both forms say so on their own screen.** This is the only
 * place in the app where that happens. Statement import still reads entirely on the device and
 * says so as it always did.
 */

/**
 * Named once, imported everywhere, and deliberately naming no record type.
 *
 * It was `/api/v1/notification-cards/read` while the card form was its only caller. A slip reading
 * through a card's URL would be a misdescription that later gets reasoned from — the route has
 * never known what the pixels depict (`app/api/v1/ocr/read/route.ts`).
 */
export const OCR_READ_PATH = "/api/v1/ocr/read";

/**
 * The image as PNG bytes for the reader route.
 *
 * **Re-encoded rather than forwarded, and that is what makes the format question go away.** Both
 * forms' file pickers accept `image/*`, so an iPhone can hand either one a HEIC that Vision cannot
 * decode; anything the *browser* decoded into a bitmap re-encodes to a PNG it can. The pixels are
 * the ones already decoded, so this changes nothing about what the reader sees — a PNG of a decoded
 * JPEG carries the same pixels the JPEG did, which is why measurements taken over half-JPEG samples
 * transfer to it unchanged (D-120, D-128).
 *
 * **Native size, no rescaling, for both records and for different measured reasons.** A card at 2×
 * bought nothing under Vision and would have quadrupled the bytes leaving the device (D-120); a
 * slip at 2× was measured to *hurt* — one image recovered, three broken (D-087) — and the shipped
 * slip path has always read at native size (D-128). Rescaling here would also break the one thing
 * both callers depend on: the boxes come back in the coordinate space of the bytes sent, and every
 * crop is cut from the same bitmap.
 */
export async function encodeForReader(bitmap: ImageBitmap): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.drawImage(bitmap, 0, 0);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

/**
 * Words and their boxes, or a sentence saying why there are none.
 *
 * A refusal is a sentence rather than a code because it is shown to the owner beside the form.
 * Every one of them ends the same way — type the values — since that is the remedy in all cases.
 */
export type ImageWordsRead =
  | { readonly ok: true; readonly words: OcrWord[] }
  | { readonly ok: false; readonly why: string };

const READER_UNAVAILABLE = "The reader could not be reached. Read the image yourself and type the values.";

/**
 * Posts the encoded image to this app's own origin and nowhere else.
 *
 * **Same-origin is the whole point, not an implementation detail.** The route holds the API key and
 * names the third party; the browser does neither, so `connect-src` still names `'self'` and the
 * Supabase origin alone and the strict CSP is untouched (D-058, D-120). An absolute URL in this
 * file would put both back, which is why `tests/privacy.test.ts` asserts there is none.
 *
 * **There is no local fallback and that is a decision, not an omission** (D-120, D-129): a failure
 * leaves every box blank and the owner types the figures, exactly as before pre-fill existed, and
 * keeping a second engine behind the same grammar would mean measuring every future grammar change
 * twice while one side rots quietly.
 */
export async function readImageWords(encoded: Blob): Promise<ImageWordsRead> {
  let response: Response;
  try {
    response = await fetch(OCR_READ_PATH, {
      method: "POST",
      headers: { "Content-Type": "image/png" },
      body: encoded
    });
  } catch {
    return { ok: false, why: READER_UNAVAILABLE };
  }

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) return { ok: false, why: readError(body, READER_UNAVAILABLE) };

  const words = (body as { words?: OcrWord[] } | null)?.words;
  if (!Array.isArray(words)) return { ok: false, why: READER_UNAVAILABLE };
  return { ok: true, words };
}
