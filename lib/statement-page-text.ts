import type { PageText, TextItem } from "@/lib/krungthai-layout";

/** The structural slice of a pdf.js `getTextContent()` item this reads; marked items have no `str`. */
export type PdfTextContentItem = { str?: string; transform?: unknown; width?: number };

/**
 * Turns one page's pdf.js text items into positioned, NFKC-normalised runs. Blank runs are dropped.
 * Pure: no pdf.js import, no I/O.
 */
export function buildPageText(items: readonly object[]): PageText {
  const out: TextItem[] = [];
  for (const raw of items) {
    const item = raw as PdfTextContentItem;
    if (!("str" in item) || typeof item.str !== "string" || item.str.trim() === "") continue;
    // pdf.js transform is [a, b, c, d, e, f]; e and f are the device x and y.
    const [, , , , x, y] = item.transform as number[];
    // The run's width matters as much as its x: the money and branch columns are
    // right-aligned, so a wider figure starts further left and its left edge alone
    // cannot say which column it belongs to (D-030).
    out.push({ str: item.str.normalize("NFKC"), x: x!, y: y!, width: item.width as number });
  }
  return out;
}
