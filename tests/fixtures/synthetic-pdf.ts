import type { PageText } from "@/lib/krungthai-layout";

// Renders invented page geometry into a real PDF, so the browser path — pdf.js
// getDocument, getTextContent, then extractStatement — can be exercised end to end.
//
// Every parser test until now fed extractStatement a PageText array directly, which
// proves the layout rules but never touches pdf.js. That left the one integration the
// app actually depends on completely unverified (see GOTCHAS). This generator closes
// that gap without a real statement: it consumes the same invented fixtures from
// krungthai-layout-v1.ts, per docs/FIXTURE_POLICY.md.
//
// Text is written with a Type0/Identity-H font carrying an identity ToUnicode CMap and
// no embedded glyph program. pdf.js recovers text from ToUnicode rather than from
// glyph outlines, so this yields exact extraction — including Thai — without shipping
// a font binary. Coordinates go through Tm, so pdf.js reports transform[4]/[5] as the
// x and y the fixture asked for, which is what the layout reader keys on.

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
// Small enough that no cell's text reaches the next column's x. pdf.js merges
// near-adjacent runs on a line and, since v5, offers no way to turn that off — and a
// merged heading run is unreadable by construction, because it destroys the x position
// that defines where the next column begins. Every glyph here is DW 500, so a run is
// `FONT_SIZE / 2` points per character: keep this in step with the fixture's column
// spacing (GOTCHAS).
const FONT_SIZE = 6;

const TO_UNICODE_CMAP = `/CIDInit /ProcSet findresource begin
12 dict begin
begincmap
/CMapName /Identity-H def
/CMapType 2 def
/CIDSystemInfo <</Registry (Adobe) /Ordering (Identity) /Supplement 0>> def
1 begincodespacerange
<0000> <FFFF>
endcodespacerange
1 beginbfrange
<0000> <FFFF> <0000>
endbfrange
endcmap
CMapName currentdict /CMap defineresource pop
end
end`;

// UTF-16BE hex, so the CID of each character is its own code point and the identity
// ToUnicode range maps it straight back. Statement text is BMP-only (the import
// charset in lib/statement.ts excludes anything that would need a surrogate pair).
function hexString(value: string): string {
  let hex = "";
  for (const character of value) {
    const code = character.codePointAt(0)!;
    if (code > 0xffff) throw new Error("Synthetic PDF text must be BMP-only.");
    hex += code.toString(16).padStart(4, "0");
  }
  return `<${hex}>`;
}

function contentStream(page: PageText): string {
  return page
    .map((item) => `BT /F1 ${FONT_SIZE} Tf 1 0 0 1 ${item.x} ${item.y} Tm ${hexString(item.str)} Tj ET`)
    .join("\n");
}

export function buildStatementPdf(pages: readonly PageText[]): Uint8Array {
  if (pages.length === 0) throw new Error("A synthetic statement needs at least one page.");

  // Object numbering: 1 catalog, 2 pages, 3 font, 4 descendant font,
  // 5 font descriptor, 6 ToUnicode, then a page object and a content stream per page.
  const firstPageObject = 7;
  const objects = new Map<number, string | { dict: string; stream: string }>();
  const pageIds = pages.map((_, index) => firstPageObject + index * 2);

  objects.set(1, "<</Type/Catalog/Pages 2 0 R>>");
  objects.set(2, `<</Type/Pages/Count ${pages.length}/Kids[${pageIds.map((id) => `${id} 0 R`).join(" ")}]>>`);
  objects.set(3, "<</Type/Font/Subtype/Type0/BaseFont/SyntheticStatement/Encoding/Identity-H/DescendantFonts[4 0 R]/ToUnicode 6 0 R>>");
  objects.set(4, "<</Type/Font/Subtype/CIDFontType2/BaseFont/SyntheticStatement/CIDSystemInfo<</Registry(Adobe)/Ordering(Identity)/Supplement 0>>/FontDescriptor 5 0 R/DW 500>>");
  objects.set(5, "<</Type/FontDescriptor/FontName/SyntheticStatement/Flags 4/FontBBox[0 -200 1000 900]/ItalicAngle 0/Ascent 900/Descent -200/CapHeight 700/StemV 80>>");
  objects.set(6, { dict: "", stream: TO_UNICODE_CMAP });

  pages.forEach((page, index) => {
    const pageId = pageIds[index]!;
    const contentId = pageId + 1;
    objects.set(pageId, `<</Type/Page/Parent 2 0 R/MediaBox[0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}]/Resources<</Font<</F1 3 0 R>>>>/Contents ${contentId} 0 R>>`);
    objects.set(contentId, { dict: "", stream: contentStream(page) });
  });

  const chunks: Buffer[] = [];
  const offsets = new Map<number, number>();
  let length = 0;
  const push = (text: string) => {
    const buffer = Buffer.from(text, "latin1");
    chunks.push(buffer);
    length += buffer.length;
  };

  push("%PDF-1.7\n");
  // A binary comment marks the file as binary for tools that sniff it.
  push("%\xE2\xE3\xCF\xD3\n");

  const ids = [...objects.keys()].sort((left, right) => left - right);
  for (const id of ids) {
    offsets.set(id, length);
    const body = objects.get(id)!;
    if (typeof body === "string") {
      push(`${id} 0 obj\n${body}\nendobj\n`);
    } else {
      const streamBytes = Buffer.from(body.stream, "latin1").length;
      push(`${id} 0 obj\n<</Length ${streamBytes}>>\nstream\n${body.stream}\nendstream\nendobj\n`);
    }
  }

  const xrefOffset = length;
  const highest = ids[ids.length - 1]!;
  let xref = `xref\n0 ${highest + 1}\n0000000000 65535 f \n`;
  for (let id = 1; id <= highest; id += 1) {
    xref += `${String(offsets.get(id) ?? 0).padStart(10, "0")} 00000 n \n`;
  }
  push(xref);
  push(`trailer\n<</Size ${highest + 1}/Root 1 0 R>>\nstartxref\n${xrefOffset}\n%%EOF\n`);

  return new Uint8Array(Buffer.concat(chunks));
}
