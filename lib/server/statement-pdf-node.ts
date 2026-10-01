// Reading a statement PDF on the server, for the Inbox (D-235).
//
// Tries the file with no password, then each stored password, moving on only when pdf.js says
// `PasswordException`. The password, the PDF and its page text stay inside this function: a result
// carries the parsed statement or a fixed code, never a password, a pdf.js message or page text.

import type { LayoutResult, StatementFrame } from "@/lib/statement-frame";
import type { SourceRowCandidate } from "@/lib/statement";
import { readStatement } from "@/lib/read-statement";
import { buildPageText } from "@/lib/statement-page-text";
import type { PageText } from "@/lib/krungthai-layout";
import { loadPdfJs } from "@/lib/server/receipt-pdf-node";
import { storedStatementPasswords } from "@/lib/server/statement-passwords";

export type StatementPdfRead =
  | { kind: "read"; frame: StatementFrame; rows: SourceRowCandidate[] }
  /** Encrypted, and no stored password opens it. */
  | { kind: "locked" }
  /** Encrypted, and no password is configured at all. */
  | { kind: "no-passwords" }
  | { kind: "unreadable"; code: string };

// pdf.js reads this option but its types omit it (scripts/mask-statement.mjs sets it too).
const NO_EVAL = { isEvalSupported: false };

type Attempt = { kind: "opened"; result: LayoutResult } | { kind: "password" } | { kind: "failed" };

export async function readStatementPdf(bytes: Uint8Array): Promise<StatementPdfRead> {
  // Loading pdf.js is allowed to throw: a load failure is the route's 500, not "not a statement".
  const pdfjs = await loadPdfJs();
  const passwords = storedStatementPasswords();

  const attempt = async (password: string | undefined): Promise<Attempt> => {
    // pdf.js transfers the buffer it is given, so each attempt gets its own copy.
    const task = pdfjs.getDocument({
      data: new Uint8Array(bytes),
      ...(password === undefined ? {} : { password }),
      ...NO_EVAL,
      useSystemFonts: false,
      verbosity: 0
    });
    try {
      const document = await task.promise;
      try {
        const pages: PageText[] = [];
        for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
          const content = await (await document.getPage(pageNumber)).getTextContent();
          pages.push(buildPageText(content.items));
        }
        return { kind: "opened", result: readStatement(pages) };
      } finally {
        await document.destroy();
      }
    } catch (error) {
      return error instanceof Error && error.name === "PasswordException" ? { kind: "password" } : { kind: "failed" };
    } finally {
      await task.destroy().catch(() => undefined);
    }
  };

  const finish = (outcome: Attempt): StatementPdfRead | null => {
    if (outcome.kind === "password") return null;
    if (outcome.kind === "failed") return { kind: "unreadable", code: "PDF_PARSE_FAILED" };
    return outcome.result.ok
      ? { kind: "read", frame: outcome.result.frame, rows: outcome.result.rows }
      : { kind: "unreadable", code: outcome.result.code };
  };

  const first = finish(await attempt(undefined));
  if (first) return first;
  if (passwords.length === 0) return { kind: "no-passwords" };
  for (const password of passwords) {
    const done = finish(await attempt(password));
    if (done) return done;
  }
  return { kind: "locked" };
}
