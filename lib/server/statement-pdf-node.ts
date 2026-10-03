// Reading a statement PDF on the server, for the Inbox (D-235).
//
// Tries the file with no password, then each stored password, moving on only when pdf.js says
// `PasswordException`. The password, the PDF and its page text stay inside this function: a result
// carries the parsed statement or a fixed code, never a password, a pdf.js message or page text.

import type { StatementFrame } from "@/lib/statement-frame";
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

type Attempt<T> = { kind: "opened"; value: T } | { kind: "password" } | { kind: "failed" };

/** The pages of a PDF opened with no password or a stored one, handed to `extract`; or why it did not open. */
type Opened<T> =
  | { kind: "opened"; value: T }
  | { kind: "locked" }
  | { kind: "no-passwords" }
  | { kind: "unreadable" };

async function openPages<T>(bytes: Uint8Array, extract: (pages: PageText[]) => T): Promise<Opened<T>> {
  // Loading pdf.js is allowed to throw: a load failure is the route's 500, not "not a statement".
  const pdfjs = await loadPdfJs();
  const passwords = storedStatementPasswords();

  const attempt = async (password: string | undefined): Promise<Attempt<T>> => {
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
        return { kind: "opened", value: extract(pages) };
      } finally {
        await document.destroy();
      }
    } catch (error) {
      return error instanceof Error && error.name === "PasswordException" ? { kind: "password" } : { kind: "failed" };
    } finally {
      await task.destroy().catch(() => undefined);
    }
  };

  const finish = (outcome: Attempt<T>): Opened<T> | null => {
    if (outcome.kind === "password") return null;
    return outcome.kind === "failed" ? { kind: "unreadable" } : outcome;
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

export async function readStatementPdf(bytes: Uint8Array): Promise<StatementPdfRead> {
  const opened = await openPages(bytes, readStatement);
  if (opened.kind === "unreadable") return { kind: "unreadable", code: "PDF_PARSE_FAILED" };
  if (opened.kind !== "opened") return { kind: opened.kind };
  return opened.value.ok
    ? { kind: "read", frame: opened.value.frame, rows: opened.value.rows }
    : { kind: "unreadable", code: opened.value.code };
}

/** The text layer of a statement PDF, for the masked dump only: positioned runs, never rendered back as text. */
export type StatementPdfPages =
  | { kind: "pages"; pages: PageText[] }
  | { kind: "locked" }
  | { kind: "no-passwords" }
  | { kind: "unreadable"; code: string };

export async function readStatementPdfPages(bytes: Uint8Array): Promise<StatementPdfPages> {
  const opened = await openPages(bytes, (pages) => pages);
  if (opened.kind === "unreadable") return { kind: "unreadable", code: "PDF_PARSE_FAILED" };
  return opened.kind === "opened" ? { kind: "pages", pages: opened.value } : { kind: opened.kind };
}
