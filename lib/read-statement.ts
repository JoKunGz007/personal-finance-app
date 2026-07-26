import { extractStatement as extractKrungthai } from "@/lib/krungthai-layout";
import type { PageText } from "@/lib/masked-diagnostics";
import type { LayoutResult } from "@/lib/statement-frame";
import { extractWithLayout, matchLayout } from "@/lib/statement-layout";

// Chooses a reader for a pdf.js text layer, and is the only entry point the worker uses.
//
// The descriptor-driven layouts are matched first, on their heading anchor sets. That
// order matters and is not arbitrary: Krungthai identifies itself by a name regex, and a
// name is exactly the thing that turns up on *other* banks' statements — an SCB transfer
// row naming Krungthai would otherwise route a whole SCB statement to the Krungthai
// reader and fail it on a column anchor. A heading set cannot be forged that way, so the
// stronger test runs first and the name test is the fallback.
//
// Krungthai keeps its own signature rather than being converted to heading matching. It
// is the one reader proven against a real statement, and its signature is proven with it;
// nothing here changes how it decides.
export function readStatement(pages: readonly PageText[]): LayoutResult {
  const descriptor = matchLayout(pages);
  if (descriptor) return extractWithLayout(descriptor, pages);

  const krungthai = extractKrungthai(pages);
  if (krungthai.ok || krungthai.code !== "UNSUPPORTED_LAYOUT") return krungthai;

  // Every reader declined, so this is not a statement any of them reads. Say that,
  // rather than passing on the last reader's own wording, which would name one bank for a
  // document that may be from none of them.
  return {
    ok: false,
    code: "UNSUPPORTED_LAYOUT",
    message: "This PDF does not match any supported bank statement layout."
  };
}
