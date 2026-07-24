/// <reference lib="webworker" />
import { getDocument } from "pdfjs-dist";
import { extractStatement, type PageText, type TextItem } from "@/lib/krungthai-layout";

type ParseMessage = { type: "parse"; bytes: ArrayBuffer; password: string; statementEndYear: number };

const workerScope: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;

// The PDF and its password never leave this worker. Only extracted rows, or an
// error code, are posted back — never raw page text, which could carry values from
// a document the caller did not intend to surface.
workerScope.onmessage = async (event: MessageEvent<ParseMessage>) => {
  if (event.data.type !== "parse") return;
  const { bytes, statementEndYear } = event.data;
  let ephemeralPassword = event.data.password;
  try {
    const document = await getDocument({ data: new Uint8Array(bytes), password: ephemeralPassword }).promise;

    const pages: PageText[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const items: TextItem[] = [];
      for (const item of content.items) {
        if (!("str" in item) || item.str.trim() === "") continue;
        // pdf.js transform is [a, b, c, d, e, f]; e and f are the device x and y.
        const [, , , , x, y] = item.transform as number[];
        items.push({ str: item.str.normalize("NFKC"), x: x!, y: y! });
      }
      pages.push(items);
    }

    const result = extractStatement(pages, statementEndYear);
    if (!result.ok) {
      workerScope.postMessage({
        type: "error",
        code: result.code,
        message: result.code === "UNSUPPORTED_LAYOUT"
          ? "This PDF does not match the supported Krungthai layout. No data left this device."
          : "This layout could not be read exactly, so nothing was imported. No data left this device."
      });
      return;
    }

    workerScope.postMessage({ type: "parsed", rows: result.rows, pageCount: document.numPages });
  } catch (error) {
    const name = error instanceof Error ? error.name : "UnknownError";
    const code = name === "PasswordException" ? "WRONG_PASSWORD" : "PDF_PARSE_FAILED";
    workerScope.postMessage({ type: "error", code, message: code === "WRONG_PASSWORD" ? "The PDF password is incorrect." : "The PDF could not be parsed safely." });
  } finally {
    ephemeralPassword = "";
  }
};

export {};
