import { parseReceiptText, type ParsedReceipt } from "@/lib/receipt-text";
import { groupIntoLines, type OcrWord } from "@/lib/slip-ocr";

/**
 * Reading 7-Eleven app receipt screenshots (PLAN task 56, `docs/RECEIPT_CONTRACT.md` § The
 * screenshot). Pure: Vision's words in, a parse out. The image itself is read by the existing
 * `POST /api/v1/ocr/read` route; nothing here knows an engine.
 *
 * **The screenshot is the condensed receipt, rendered.** Its item block, `ยอดรวม`, discounts,
 * `ยอดสุทธิ`, payment line, `TID#` and `R#` are the same lines the condensed PDF prints, so once
 * OCR's words are put back into those lines the tested condensed grammar reads them — one grammar,
 * not two. What differs is the header (the app's own: date, `เลขที่ใบเสร็จ`, branch, `รหัสร้าน`)
 * and that a long receipt spans several screenshots.
 *
 * **Several screenshots of one receipt are stitched on their overlap**, and **the receipt's own
 * checksums say whether the stitch is whole** — not the number of images, and not the owner's
 * judgement at capture time (the contract's rule). A stitch that loses the tail (payment, `TID#`,
 * `R#`) is refused with a sentence saying to add the bottom of the receipt.
 */

export type ScreenshotPage = {
  receiptNumber: string;
  storeCode: string;
  branchName: string;
  /** As printed in the app header: `dd/mm/yy` Buddhist era, and `HH:MM`. */
  headerDate: { day: number; month: number; buddhistYear2: number };
  headerTime: string;
  /** The item region's lines, top to bottom, canonicalised (`canonicalLine`). */
  body: string[];
};

export type ScreenshotRefusal = "NOT_A_RECEIPT" | "NEEDS_MORE" | "NO_OVERLAP" | "MISMATCH" | "UNREADABLE";

export type ScreenshotRead<T> = { ok: true; value: T } | { ok: false; code: ScreenshotRefusal; message: string };

const THAI = "\u0E00-\u0E7F";

/**
 * Puts one OCR line back into the printed line's text. Each rule answers something measured on
 * the real screenshots (2026-09-23, D-210):
 *
 * - Vision inserts a space between Thai words the receipt prints joined, so a space between two
 *   Thai characters is removed. A space between Thai and Latin is kept: the receipt prints some.
 * - It spaces punctuation the receipt prints tight (`M - Stamp ( บาท )`, `R # …`, `@ 0.00`). A
 *   space before a figure is kept, though: a truncated name can end in `(` right before its
 *   amount (`… หมู ( 47.00`), and the grammar needs that space to find the amount — the first
 *   version glued them and lost the line. `@unit` gets a space before it for the same reason.
 * - It reads the VAT-exempt `N` hard against a figure as a third decimal digit (`0.000`). A printed
 *   amount always has exactly two decimals, so a third character there can only be the `N`.
 * - It reads `ชิ้น` as `ชั้น` on the net line; the net line's grammar is fixed, so the unit word
 *   is restored there and nowhere else.
 */
export function canonicalLine(words: readonly OcrWord[]): string {
  return words.map((word) => word.text).join(" ")
    .replace(new RegExp(`([${THAI}])\\s+(?=[${THAI}])`, "gu"), "$1")
    .replace(/\s*([-#:])\s*/gu, "$1")
    .replace(/\(\s+(?![\d.,]+(?:\s|$))/gu, "(")
    .replace(/\s+\)/gu, ")")
    .replace(/\s*@\s*(?=\d)/gu, " @")
    .replace(/(\d\.\d{2})\s*[0N](?=\s|$)/gu, "$1N")
    .replace(/^(ยอดสุทธิ\s*\d+\s*)ช\S{0,2}น(?=\s)/u, "$1ชิ้น")
    .replace(/\s+/gu, " ")
    .trim();
}

const HEADER_DATE = /^(\d{2})\/(\d{2})\/(\d{2})\s*\S?\s*(\d{2}):(\d{2})$/u;
const HEADER_NUMBER = /^เลขที่ใบเสร็จ\s*(\d+)$/u;
const HEADER_BRANCH = /^สาขา\s*7-Eleven\s+(.+)$/u;
const HEADER_STORE = /^รหัสร้าน:(\d+)$/u;
const BODY_START = /^รายการสินค้า$/u;
// The two buttons under the receipt card; everything from the first of them down is app chrome.
const BODY_END = /^(ดูใบกำกับ|ขอใบกำกับ)/u;

/** One screenshot's header and item region, or why it is not a receipt screenshot. */
export function readScreenshotPage(words: readonly OcrWord[]): ScreenshotRead<ScreenshotPage> {
  const lines = groupIntoLines(words).map(canonicalLine);
  let date: ScreenshotPage["headerDate"] | null = null;
  let time: string | null = null;
  let receiptNumber: string | null = null;
  let branchName: string | null = null;
  let storeCode: string | null = null;
  let start = -1;
  for (const [index, line] of lines.entries()) {
    let match: RegExpExecArray | null;
    if (start >= 0) break;
    if ((match = HEADER_DATE.exec(line))) {
      date = { day: Number(match[1]), month: Number(match[2]), buddhistYear2: Number(match[3]) };
      time = `${match[4]}:${match[5]}`;
    } else if ((match = HEADER_NUMBER.exec(line))) receiptNumber = match[1]!;
    else if ((match = HEADER_BRANCH.exec(line))) branchName = match[1]!.trim();
    else if ((match = HEADER_STORE.exec(line))) storeCode = match[1]!;
    else if (BODY_START.test(line)) start = index + 1;
  }
  if (date === null || time === null || receiptNumber === null || branchName === null || storeCode === null || start < 0) {
    return { ok: false, code: "NOT_A_RECEIPT", message: "This image is not a 7-Eleven app receipt screenshot this app can read." };
  }
  const end = lines.findIndex((line, index) => index >= start && BODY_END.test(line));
  const body = lines.slice(start, end < 0 ? undefined : end).filter((line) => line.length > 0);
  return { ok: true, value: { receiptNumber, storeCode, branchName, headerDate: date, headerTime: time, body } };
}

const stripZeros = (value: string) => value.replace(/^0+(?=.)/u, "");

/** Screenshots of the same receipt, by store and unpadded number, in the order given. */
export function groupScreenshotPages<T extends { page: ScreenshotPage }>(pages: readonly T[]): T[][] {
  const groups = new Map<string, T[]>();
  for (const entry of pages) {
    const key = `${entry.page.storeCode}:${stripZeros(entry.page.receiptNumber)}`;
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }
  return [...groups.values()];
}

/**
 * What two readings of one printed line agree on. **Not the text**: measured on the real pairs,
 * Vision reads the same row differently in two screenshots — a stray `.`, a space — so exact
 * comparison found no overlap on any of seven pairs. A priced row is keyed on its quantity and its
 * amount, which are what the checksum reads; any other line on its characters without spaces.
 */
export function lineKey(line: string): string {
  const priced = /^(\d+)\s.*?(\d[\d,]*\.\d{2})N?$/u.exec(line);
  return priced ? `${priced[1]}|${priced[2]}` : line.replace(/\s+/gu, "");
}

/**
 * How many lines `head` and `tail` share at the seam, and how many unreadable edge lines to drop.
 *
 * The longest shared run wins rather than the first, because a receipt can print one row twice in a
 * row and the shortest match would stitch on the wrong copy. **One edge line may be dropped on each
 * side of the seam**: the scroll region clips the row at its edge, and Vision reads a half-visible
 * row as garbage (measured: `ก(a)` at the foot of four screenshots). Anything wrongly dropped or
 * joined leaves the receipt's own checksums failing, which is what marks it partial.
 */
function seam(head: readonly string[], tail: readonly string[]): { dropHead: number; dropTail: number; shared: number } | null {
  let best: { dropHead: number; dropTail: number; shared: number } | null = null;
  for (const dropHead of [0, 1]) {
    for (const dropTail of [0, 1]) {
      const a = head.slice(0, head.length - dropHead).map(lineKey);
      const b = tail.slice(dropTail).map(lineKey);
      for (let size = Math.min(a.length, b.length); size > 0; size -= 1) {
        if (a.slice(a.length - size).every((key, index) => key === b[index])) {
          if (!best || size > best.shared) best = { dropHead, dropTail, shared: size };
          break;
        }
      }
    }
  }
  return best;
}

/** Joins bodies in the given order with the lines shared across all seams, or null when two neighbours share none. */
function joinInOrder(bodies: readonly (readonly string[])[]): { body: string[]; shared: number } | null {
  let joined = [...bodies[0]!];
  let shared = 0;
  for (const next of bodies.slice(1)) {
    const cut = seam(joined, next);
    if (!cut) return null;
    joined = [...joined.slice(0, joined.length - cut.dropHead), ...next.slice(cut.dropTail + cut.shared)];
    shared += cut.shared;
  }
  return { body: joined, shared };
}

function permutations<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) return [[...items]];
  return items.flatMap((item, index) => permutations([...items.slice(0, index), ...items.slice(index + 1)]).map((rest) => [item, ...rest]));
}

// A receipt that needs more than this is a stitch nobody should trust from a picker's order anyway.
const MAX_PAGES = 5;

/**
 * One receipt from one or more screenshots of it. The order they were picked in is not trusted:
 * every order that joins with an overlap at each seam is read, and **the best reading wins, not the
 * first** — a complete one over a partial one, then the most lines shared across the seams. Rows
 * are compared on quantity and amount, so a wrong order can join on a coincidental match; taking
 * the first join would let it win over the right order (code review, D-210). One screenshot needs
 * no seam.
 */
export function readScreenshotReceipt(pages: readonly ScreenshotPage[]): ScreenshotRead<ParsedReceipt> {
  if (pages.length === 0 || pages.length > MAX_PAGES) {
    return { ok: false, code: "UNREADABLE", message: `A receipt is read from 1 to ${MAX_PAGES} screenshots.` };
  }
  const first = pages[0]!;
  for (const page of pages) {
    if (page.storeCode !== first.storeCode || stripZeros(page.receiptNumber) !== stripZeros(first.receiptNumber)
      || page.headerTime !== first.headerTime || JSON.stringify(page.headerDate) !== JSON.stringify(first.headerDate)) {
      return { ok: false, code: "MISMATCH", message: "These screenshots are not all of the same receipt." };
    }
  }

  const joins = permutations(pages).flatMap((order) => joinInOrder(order.map((page) => page.body)) ?? []);
  if (joins.length === 0) {
    return { ok: false, code: "NO_OVERLAP", message: "These screenshots do not overlap, so part of the receipt between them is missing. Add a screenshot that covers the gap." };
  }

  // The condensed grammar reads the store and branch from its `CP ALL` line, which the app screen
  // does not print; the header supplies both, so the line is restated from it rather than the
  // grammar growing a second header path.
  const header = `CP ALL,7-Eleven ${first.branchName}(${first.storeCode})`;
  const readings = joins.map((join) => ({ ...join, parsed: parseReceiptText([header, ...join.body].join("\n"), "condensed") }));
  const score = (reading: (typeof readings)[number]) =>
    (reading.parsed.ok ? (reading.parsed.value.completeness === "complete" ? 2 : 1) : 0) * 10_000 + reading.shared;
  const parsed = readings.reduce((best, reading) => (score(reading) > score(best) ? reading : best)).parsed;
  if (!parsed.ok) {
    if (parsed.code === "MISSING_FIELD") {
      return { ok: false, code: "NEEDS_MORE", message: "The bottom of this receipt (the payment, TID# and R# lines) is not in the screenshots. Scroll to the end of the receipt and add a screenshot of it." };
    }
    return { ok: false, code: "UNREADABLE", message: parsed.message };
  }

  // The header is a third printing of the number, date and time; it must agree with `R#`/`TID#`.
  const receipt = parsed.value;
  const [year, month, day] = receipt.purchasedAt.split("-").map(Number) as [number, number, number];
  if (stripZeros(receipt.receiptNumber) !== stripZeros(first.receiptNumber)
    || first.headerDate.day !== day || first.headerDate.month !== month || first.headerDate.buddhistYear2 !== (year + 543) % 100
    || first.headerTime !== receipt.purchasedAtTime) {
    return { ok: false, code: "MISMATCH", message: "The screen header and the receipt's own R# line disagree, so neither is trusted." };
  }
  return { ok: true, value: receipt };
}
