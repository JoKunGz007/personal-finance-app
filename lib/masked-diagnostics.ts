// Value-free diagnostics over a pdf.js text layer.
//
// These describe a document's *structure* — line grouping, run positions, and the shape
// of each run with every numeral and letter destroyed — so a layout that will not read
// can be diagnosed without anyone reading the statement. Every finding in the Krungthai
// reads (D-023 … D-034) came from these four functions.
//
// This module deliberately has **no imports**. Two reasons:
//
//  1. It is the privacy-critical surface, guarded by `tests/privacy.test.ts`. Nothing it
//     can reach can widen what it emits, so the guarantee is readable in one file.
//  2. `scripts/mask-statement.mjs` imports it directly under plain Node, which strips
//     types but does not resolve the `@/` alias or bundle. A dependency-free module with
//     an explicit relative specifier is importable from both the app and the harness, so
//     the offline dump is masked by the same code the app ships rather than by a copy
//     that can drift (D-035).
//
// It is a diagnostic aid, not a sanitizer: output is shown to the owner on their own
// device, and what leaves that device stays their decision.

// `width` is the printed width of the run, as pdf.js reports it. It is optional only
// because a hand-written fixture may omit it; real input always carries it, and column
// assignment needs it (see `centreOf` in lib/krungthai-layout.ts).
export type TextItem = { str: string; x: number; y: number; width?: number };
export type PageText = readonly TextItem[];

// Vertical distance within which two items are considered the same printed line.
export const LINE_TOLERANCE = 3;

export function groupIntoLines(items: PageText): TextItem[][] {
  const lines: TextItem[][] = [];
  for (const item of [...items].sort((a, b) => b.y - a.y || a.x - b.x)) {
    const line = lines.find((candidate) => Math.abs(candidate[0]!.y - item.y) <= LINE_TOLERANCE);
    if (line) line.push(item);
    else lines.push([item]);
  }
  return lines.map((line) => line.sort((a, b) => a.x - b.x));
}

// Reduces text to its shape: every numeral becomes `d`, every letter or combining mark
// `x`, and everything else — separators, punctuation, spacing — is kept. `01/01/26 09:15`
// becomes `dd/dd/dd dd:dd`, which says what format a cell is printed in while destroying
// the value. Row-level failures report this instead of the cell, so a date or amount
// format can be diagnosed without any figure leaving the device.
//
// Combining marks must be masked, not just letters: Thai vowel and tone marks are
// `\p{M}`, so masking `\p{L}` alone left them intact and `โอนเงินเข้า` came out as
// `xxxxxิxxx้x`, leaking fragments of the real text. `\p{N}` rather than `\p{Nd}` for the
// same reason — non-decimal numerals are still values.
// One pass, not two: masking numerals to `d` and then letters to `x` overwrites those
// `d`s, because `d` is itself a letter — which silently turned every date into
// `xx/xx/xx` and made the shapes useless for reading a format.
export function maskShape(value: string): string {
  return value.replace(/[\p{N}\p{L}\p{M}]/gu, (character) => /\p{N}/u.test(character) ? "d" : "x");
}

// On-device diagnostic for a layout that will not read.
//
// When the anchors do not match, the only thing needed to fix the reader is the set of
// heading words the statement actually prints — the x positions come from the PDF at
// runtime. This returns those candidate labels and nothing else, so a layout can be
// repaired without anyone reading the statement.
//
// Two filters make the output structurally incapable of carrying financial data: any
// item containing a digit is dropped (excluding amounts, balances, dates, times,
// account and reference numbers), and only lines holding at least three surviving
// short items are reported — heading rows are dense, whereas a name or address line is
// not.
const DIAGNOSTIC_MAX_LABEL = 24;
const DIAGNOSTIC_MIN_ITEMS_PER_LINE = 3;
const DIAGNOSTIC_MAX_LINES = 12;

export function describeLabelGeometry(pages: readonly PageText[]): string[][] {
  const described: string[][] = [];
  for (const page of pages) {
    for (const line of groupIntoLines(page)) {
      const labels = line
        .map((item) => item.str.normalize("NFKC").trim())
        .filter((label) => label.length > 0 && label.length <= DIAGNOSTIC_MAX_LABEL && !/\p{Nd}/u.test(label));
      if (labels.length >= DIAGNOSTIC_MIN_ITEMS_PER_LINE) described.push(labels);
      if (described.length >= DIAGNOSTIC_MAX_LINES) return described;
    }
  }
  return described;
}

// The frame labels — account number, period, opening and closing balance — sit on lines
// whose values carry digits, so describeLabelGeometry filters those lines out entirely
// and their wording stays unknown. This reports a label only when the item printed
// *immediately* to its right carries a digit, which is exactly the label/value shape
// those fields use. The account holder's name is excluded by construction: its value is
// text, not digits, so the label never qualifies.
export function describeValueLabels(pages: readonly PageText[]): string[] {
  const labels = new Set<string>();
  // The first and last pages: the frame is on page one, and a statement's summary totals
  // are on the last, where their labels are the only way to read them.
  const scanned = pages.length > 1 ? [pages[0]!, pages[pages.length - 1]!] : pages.slice(0, 1);
  for (const page of scanned) {
    for (const line of groupIntoLines(page)) {
      line.forEach((item, index) => {
        const text = item.str.normalize("NFKC").trim();
        if (!text || text.length > DIAGNOSTIC_MAX_LABEL || /\p{Nd}/u.test(text)) return;
        const next = line[index + 1];
        if (next && /\p{Nd}/u.test(next.str)) labels.add(text);
      });
    }
  }
  return [...labels].slice(0, DIAGNOSTIC_MAX_LINES * 2);
}

// The whole statement's structure with none of its content: every line, every run's
// x position, and each run reduced by maskShape to `d` for a digit and `x` for a letter.
// Punctuation and spacing survive, so formats, column bands, wrapped continuation lines,
// page breaks, and footer blocks are all visible while no name, amount, balance, date, or
// account number can be. Page one is reported in full because the frame and the first
// rows live there; later pages contribute only their opening lines, which is enough to
// show how a continuation page begins.
const STRUCTURE_MAX_LINES = 120;
const STRUCTURE_CONTINUATION_LINES = 12;

export function describeStructure(pages: readonly PageText[]): string[] {
  const described: string[] = [];
  const lastIndex = pages.length - 1;
  const render = (line: TextItem[], pageIndex: number) => {
    const cells = line
      .map((item) => `${maskShape(item.str.normalize("NFKC").trim())}@${Math.round(item.x)}`)
      .join("  ");
    described.push(`p${pageIndex + 1} y=${Math.round(line[0]!.y)}  ${cells}`);
  };

  pages.forEach((page, pageIndex) => {
    if (pageIndex === lastIndex && lastIndex > 0) return; // rendered in full below
    const lines = groupIntoLines(page);
    const limit = pageIndex === 0 ? lines.length : STRUCTURE_CONTINUATION_LINES;
    for (const line of lines.slice(0, limit)) {
      if (described.length >= STRUCTURE_MAX_LINES) return;
      render(line, pageIndex);
    }
  });

  // The last page in full, always. A statement may close with a summary block — totals,
  // an opening or closing balance — and that is exactly the region a middle-page cap
  // would hide. Without it, balances have to be derived rather than read (D-026).
  if (lastIndex > 0) {
    described.push(`--- last page (${lastIndex + 1}) in full ---`);
    for (const line of groupIntoLines(pages[lastIndex]!)) render(line, lastIndex);
  }
  return described;
}
