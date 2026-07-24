/// <reference lib="webworker" />
import { getDocument } from "pdfjs-dist";

type ParseMessage = { type: "parse"; bytes: ArrayBuffer; password: string };

const workerScope: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;

workerScope.onmessage = async (event: MessageEvent<ParseMessage>) => {
  if (event.data.type !== "parse") return;
  const { bytes } = event.data;
  let ephemeralPassword = event.data.password;
  try {
    const document = await getDocument({ data: new Uint8Array(bytes), password: ephemeralPassword }).promise;
    const firstPage = await document.getPage(1);
    const content = await firstPage.getTextContent();
    const text = content.items.map((item) => "str" in item ? item.str : "").join(" ").normalize("NFKC");
    const bankSignature = /Krungthai|กรุงไทย/iu.test(text);
    const anchors = [/วันที่|Date/iu, /รายการ|Description/iu, /ยอดคงเหลือ|Balance/iu];
    if (!bankSignature || !anchors.every((anchor) => anchor.test(text))) {
      workerScope.postMessage({ type: "error", code: "UNSUPPORTED_LAYOUT", message: "This PDF does not match the supported Krungthai layout." });
      return;
    }
    workerScope.postMessage({
      type: "error",
      code: "LAYOUT_V1_UNSUPPORTED_DOCUMENT",
      message: "The bank signature is recognized, but this layout has not passed synthetic fixture validation. No data left this device."
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : "UnknownError";
    const code = name === "PasswordException" ? "WRONG_PASSWORD" : "PDF_PARSE_FAILED";
    workerScope.postMessage({ type: "error", code, message: code === "WRONG_PASSWORD" ? "The PDF password is incorrect." : "The PDF could not be parsed safely." });
  } finally {
    ephemeralPassword = "";
  }
};

export {};
