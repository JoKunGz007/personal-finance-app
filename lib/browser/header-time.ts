import type { ImageWordsRead } from "@/lib/browser/ocr-reader";
import { rereadBox } from "@/lib/browser/year-reread";
import type { BoxCrop } from "@/lib/slip-batch";
import { readHeaderTime } from "@/lib/receipt-screenshot";
import type { Box } from "@/lib/slip-ocr";

export type HeaderTimeAnswer = { ok: true; answer: string | null } | { ok: false; why: string };

/**
 * The second read of a 7-Eleven screenshot's header time, shared by the Inbox and the receipts bench
 * (`readScreenshotReceipt`'s `headerTimeReread`). No box means no answer (a blank time, never a guess);
 * a failed re-read is a transport failure the caller shows or retries, never a saved blank time;
 * a successful read answers with the one time in the crop, or null when it has none.
 */
export async function resolveHeaderTime(
  file: Blob,
  box: Box | null,
  reread: (file: Blob, box: Box, crop: BoxCrop) => Promise<ImageWordsRead> = rereadBox
): Promise<HeaderTimeAnswer> {
  if (box === null) return { ok: true, answer: null };
  const read = await reread(file, box, { field: "time", scale: 2 });
  if (!read.ok) return { ok: false, why: read.why };
  return { ok: true, answer: readHeaderTime(read.words) };
}
