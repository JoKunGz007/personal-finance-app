/// <reference lib="webworker" />
import { GlobalWorkerOptions, getDocument } from "pdfjs-dist";
import {
  describeLabelGeometry, describeStructure, describeValueLabels,
  type PageText, type TextItem
} from "@/lib/krungthai-layout";
import { readStatement } from "@/lib/read-statement";

// pdf.js needs its own worker, and it has to be handed over explicitly. Left unset it
// falls back to loading that module inline, which throws a bare `Error` before any page
// is read — so every PDF looks unparseable no matter what it contains. A `workerPort`
// built from a dedicated entry module keeps pdf.js in its own scope; see
// workers/pdf.worker.entry.ts for why `workerSrc` with a package path is not enough.
GlobalWorkerOptions.workerPort = new Worker(new URL("./pdf.worker.entry.ts", import.meta.url), { type: "module" });

type ParseMessage = { type: "parse"; bytes: ArrayBuffer; password: string };

const workerScope: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;

// The PDF and its password never leave this worker. Only extracted rows, or an
// error code, are posted back — never raw page text, which could carry values from
// a document the caller did not intend to surface.
workerScope.onmessage = async (event: MessageEvent<ParseMessage>) => {
  if (event.data.type !== "parse") return;
  const { bytes } = event.data;
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
        // The run's width matters as much as its x: the money and branch columns are
        // right-aligned, so a wider figure starts further left and its left edge alone
        // cannot say which column it belongs to (D-030).
        items.push({ str: item.str.normalize("NFKC"), x: x!, y: y!, width: item.width });
      }
      pages.push(items);
    }

    // Three layouts now, chosen by the document rather than by the caller.
    const result = readStatement(pages);
    if (!result.ok) {
      // A layout that will not read is fixed by knowing which heading words the
      // statement prints, so send those candidate labels back for the owner to see.
      // describeLabelGeometry drops every item containing a digit, so no amount,
      // balance, date, or account number can travel with them.
      //
      // Reduced here, one statement before the post, deliberately: `pages` must never
      // appear inside a postMessage call, so the call site can be read at a glance to
      // confirm only derived values cross. tests/privacy.test.ts enforces both halves.
      const labelCandidates = describeLabelGeometry(pages);
      const valueLabels = describeValueLabels(pages);
      const structure = describeStructure(pages);
      // The reader's own message carries the detail that makes a failure actionable —
      // masked cell shapes and allowlisted token names. Every message in
      // lib/krungthai-layout.ts is built from static text, field names, maskShape(), or
      // the currency allowlist, never from raw cell text; tests/privacy.test.ts guards
      // that. Discarding it, as this worker used to, made each failure a bare code.
      workerScope.postMessage({
        type: "error",
        code: result.code,
        labelCandidates,
        valueLabels,
        structure,
        detail: result.message,
        message: result.code === "UNSUPPORTED_LAYOUT"
          ? "This PDF does not match a supported statement layout. No data left this device."
          : "This layout could not be read exactly, so nothing was imported. No data left this device."
      });
      return;
    }

    // A statement whose printed totals never confirmed its rows parses fine and is then
    // refused at assembly (D-043). The one thing needed to fix that is the wording of the
    // summary labels the statement actually prints, so send the candidate label wordings
    // with the successful parse — otherwise the owner sees a refusal with no way to act on
    // it, and the diagnostic only exists on the failure path.
    //
    // Reduced here, one statement before the post, on the same terms as the error path
    // below: `pages` must never appear inside a postMessage call. describeValueLabels
    // reports only digit-free wordings printed left of a number, which is the label/value
    // shape a summary line uses; tests/privacy.test.ts holds it to that.
    const summaryLabels = result.frame.crossChecked ? [] : describeValueLabels(pages);
    workerScope.postMessage({
      type: "parsed", frame: result.frame, rows: result.rows,
      pageCount: document.numPages, valueLabels: summaryLabels
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : "UnknownError";
    const code = name === "PasswordException" ? "WRONG_PASSWORD" : "PDF_PARSE_FAILED";
    // The error's class name goes back, never its message. pdf.js names are a fixed
    // set of library constants (PasswordException, InvalidPDFException,
    // UnknownErrorException…), so they distinguish "this file is not a PDF" from "our
    // worker is misconfigured" without carrying anything read out of the document.
    workerScope.postMessage({
      type: "error",
      code,
      reason: name,
      message: code === "WRONG_PASSWORD" ? "The PDF password is incorrect." : "The PDF could not be parsed safely."
    });
  } finally {
    ephemeralPassword = "";
  }
};

export {};
