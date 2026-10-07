import { readImageWords, type ImageWordsRead } from "@/lib/browser/ocr-reader";
import type { BoxCrop } from "@/lib/slip-batch";
import { paddedCrop, type Box } from "@/lib/slip-ocr";

export const YEAR_CROP_PAD_PX = 12;

/**
 * A second, enlarged read of one box: the printed year (D-257) or the amount (D-259), enlarged by
 * `crop.scale`.
 *
 * **The amount's box** is `locateAmount`'s (label and figure), padded by `paddedCrop`'s ratio, the
 * same region the single-slip form shows enlarged. Vision read "23.00" as "23,00" on a whole slip
 * and correctly on this crop at 2x and 3x (one real slip, D-259).
 *
 * **The year's box** (`crop.field` "year", enlarged 3x by its caller): Vision misreads the Krungthai slip font's 6 as 5 ("2569" as "2559") when it reads the whole slip,
 * and reads the same word correctly when that word is cropped and enlarged on its own (measured on
 * 10 real slips, 2026-10-07: 10 of 10). **Padded by a fixed 12 px, not a ratio**, because that is
 * what was measured; a year word is a few dozen pixels wide, so a proportional margin would be
 * either too thin to matter or wide enough to bring the neighbouring time into the crop.
 *
 * It goes through `readImageWords` and nowhere else, so the same-origin rule and the strict CSP are
 * untouched. The box is in the coordinate space of the image the first read decoded; `readImageFileWords`
 * and this both decode the same file, so they agree. Always resolves; the bitmap is released either way.
 */
export async function rereadBox(file: Blob, box: Box, crop: BoxCrop): Promise<ImageWordsRead> {
  const FAILED = { ok: false as const, why: `The ${crop.field} could not be read a second time.` };
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file);
    const { left, top, right, bottom } = crop.field === "amount"
      ? paddedCrop(box, bitmap)
      : {
        left: Math.max(0, Math.round(box.left - YEAR_CROP_PAD_PX)),
        top: Math.max(0, Math.round(box.top - YEAR_CROP_PAD_PX)),
        right: Math.min(bitmap.width, Math.round(box.right + YEAR_CROP_PAD_PX)),
        bottom: Math.min(bitmap.height, Math.round(box.bottom + YEAR_CROP_PAD_PX))
      };
    if (right <= left || bottom <= top) return FAILED;
    const canvas = document.createElement("canvas");
    canvas.width = (right - left) * crop.scale;
    canvas.height = (bottom - top) * crop.scale;
    const context = canvas.getContext("2d");
    if (!context) return FAILED;
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, left, top, right - left, bottom - top, 0, 0, canvas.width, canvas.height);
    const encoded = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!encoded) return FAILED;
    return await readImageWords(encoded);
  } catch {
    return FAILED;
  } finally {
    bitmap?.close();
  }
}
