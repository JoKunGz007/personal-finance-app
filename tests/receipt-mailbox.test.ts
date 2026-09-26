// @vitest-environment node
import { beforeEach, describe, expect, test } from "vitest";
import type { ParsedReceipt } from "@/lib/receipt-text";
import type { ReceiptCapture } from "@/lib/receipts";
import { readReceiptPdfBytes } from "@/lib/server/receipt-pdf-node";
import {
  emptyReceiptReport, readReceiptMessage, RECEIPT_FLAG, RECEIPT_SEARCH, syncReceiptMail,
  type ReadPdf, type ReceiptOutcome
} from "@/lib/server/receipt-mailbox";

// Mailbox Sync for 7-Eleven invoices (D-232): what each PDF counts as, when a message is marked
// done, how a bundle's embedded invoices are found, and that pdf.js runs under Node. The PDF
// reader itself is `tests/receipt-pdf.test.ts`'s. Every value is invented.

const receipt: ParsedReceipt = {
  receiptNumber: "00012", storeCode: "30219", branchName: "สาขาทดสอบ", purchasedAt: "2026-06-12", purchasedAtTime: "14:35",
  paymentMethod: "เงินสด",
  items: [{ lineNo: 2, quantity: 1, name: "น้ำดื่ม", unitPriceMinor: null, amountMinor: "1000", vatExempt: true, isPromotion: false }],
  discounts: [], subtotalMinor: "1000", netMinor: "1000", unitCount: 1, vat: null, vatCode: null, supersedesReceiptNumber: null,
  completeness: "complete", failedChecks: [], inapplicableChecks: ["VAT_IDENTITY_CHECK"]
};

const bytes = (tag: string) => new TextEncoder().encode(tag);
/** Reads each invented PDF by its tag: `r…` a receipt, `x` not one, `u` unopenable, `p` a parse refusal. */
const readPdf: ReadPdf = async (pdf) => {
  const tag = new TextDecoder().decode(pdf);
  if (tag.startsWith("r")) return { ok: true, form: "condensed", receipt: { ...receipt, receiptNumber: tag.slice(1) } };
  if (tag === "x") return { ok: false, code: "UNKNOWN_FORM", message: "static" };
  if (tag === "u") return { ok: false, code: "UNREADABLE_PDF", message: "static" };
  return { ok: false, code: "QUANTITY_MISMATCH", message: "static" };
};

let stored: ReceiptCapture[];
let answers: Map<string, ReceiptOutcome>;
const store = async (capture: ReceiptCapture): Promise<ReceiptOutcome> => {
  stored.push(capture);
  return answers.get(capture.receipt.receiptNumber) ?? "captured";
};

beforeEach(() => {
  stored = [];
  answers = new Map();
});

describe("readReceiptMessage", () => {
  test("stores receipts, counts other PDFs, and resolves the message", async () => {
    answers.set("2", "alreadyStored");
    const report = emptyReceiptReport();
    const resolved = await readReceiptMessage([bytes("r1"), bytes("r2"), bytes("x")], readPdf, store, report);
    expect(resolved).toBe(true);
    expect(stored.map((capture) => [capture.form, capture.receipt.receiptNumber])).toEqual([["condensed", "1"], ["condensed", "2"]]);
    expect(report).toMatchObject({ captured: 1, alreadyStored: 1, notReceipts: 1, refused: {} });
  });

  test("a refusal, an unopenable PDF, a missing download or a store refusal leaves the message to be read again", async () => {
    for (const [pdf, code, outcome] of [
      [bytes("p"), "QUANTITY_MISMATCH", undefined],
      [bytes("u"), "UNREADABLE_PDF", undefined],
      [null, "UNDOWNLOADABLE", undefined],
      [bytes("r9"), "DISAGREES", "disagrees"],
      [bytes("r9"), "STORE_REFUSED", "storeRefused"]
    ] as const) {
      if (outcome) answers.set("9", outcome);
      const report = emptyReceiptReport();
      expect(await readReceiptMessage([bytes("r1"), pdf], readPdf, store, report)).toBe(false);
      expect(report.refused).toEqual({ [code]: 1 });
      expect(report.captured).toBe(1);
    }
  });
});

type Structure = Record<string, unknown>;
const pdfPart = (part: string) => ({ part, type: "application/pdf", disposition: "attachment", dispositionParameters: { filename: "invented.pdf" }, size: 100 });

function mailbox(messages: { uid: number; flags: string[]; structure: Structure; parts: Record<string, string> }[]) {
  const flagged: number[] = [];
  const downloads: string[] = [];
  const client = {
    search: async (query: unknown) => (expect(query).toEqual(RECEIPT_SEARCH), messages.map((message) => message.uid)),
    fetch: async function* (uids: number[], query: { flags?: boolean; bodyStructure?: boolean }) {
      for (const message of messages.filter((entry) => uids.includes(entry.uid))) {
        yield query.flags ? { uid: message.uid, flags: new Set(message.flags) } : { uid: message.uid, bodyStructure: message.structure };
      }
    },
    download: async (uid: string, part: string) => {
      downloads.push(`${uid}:${part}`);
      const text = messages.find((message) => String(message.uid) === uid)!.parts[part]!;
      return { content: (async function* () { yield Buffer.from(text); })() };
    },
    messageFlagsAdd: async (uid: number, flags: string[]) => {
      expect(flags).toEqual([RECEIPT_FLAG]);
      flagged.push(uid);
      return true;
    }
  };
  return { client: client as unknown as Parameters<typeof syncReceiptMail>[0], flagged, downloads };
}

describe("syncReceiptMail", () => {
  test("reads a forward and a bundle's embedded invoices, skips flagged mail, and flags only what resolved", async () => {
    const { client, flagged, downloads } = mailbox([
      // A forwarded invoice: the PDF is the message's own attachment.
      { uid: 10, flags: [], structure: { type: "multipart/mixed", childNodes: [{ part: "1", type: "text/html" }, pdfPart("2")] }, parts: { 2: "r1" } },
      // A bundle: two embedded messages, each carrying its PDF.
      {
        uid: 11, flags: [], parts: { "2.2": "r2", "3.2": "p" },
        structure: { type: "multipart/mixed", childNodes: [
          { part: "1", type: "text/plain" },
          { part: "2", type: "message/rfc822", childNodes: [{ type: "multipart/mixed", childNodes: [{ part: "2.1", type: "text/html" }, pdfPart("2.2")] }] },
          { part: "3", type: "message/rfc822", childNodes: [{ type: "multipart/mixed", childNodes: [{ part: "3.1", type: "text/html" }, pdfPart("3.2")] }] }
        ] }
      },
      // Done last time.
      { uid: 12, flags: [RECEIPT_FLAG], structure: { type: "multipart/mixed", childNodes: [pdfPart("2")] }, parts: { 2: "r3" } }
    ]);
    const report = await syncReceiptMail(client, readPdf, store, Date.now() + 60_000);
    expect(downloads.sort()).toEqual(["10:2", "11:2.2", "11:3.2"]);
    expect(stored.map((capture) => capture.receipt.receiptNumber).sort()).toEqual(["1", "2"]);
    expect(report).toMatchObject({ messages: 2, captured: 2, refused: { QUANTITY_MISMATCH: 1 }, truncated: false });
    expect(flagged).toEqual([10]);
  });

  test("a message with no PDF is marked done, and a spent deadline stops before reading", async () => {
    const empty = mailbox([{ uid: 20, flags: [], structure: { type: "text/plain", part: "1" }, parts: {} }]);
    expect(await syncReceiptMail(empty.client, readPdf, store, Date.now() + 60_000)).toMatchObject({ messages: 1 });
    expect(empty.flagged).toEqual([20]);

    const late = mailbox([{ uid: 21, flags: [], structure: { type: "multipart/mixed", childNodes: [pdfPart("2")] }, parts: { 2: "r1" } }]);
    expect(await syncReceiptMail(late.client, readPdf, store, 0, () => 1)).toMatchObject({ messages: 0, truncated: true });
    expect(late.downloads).toEqual([]);
  });
});

describe("readReceiptPdfBytes under Node", () => {
  // A one-page PDF saying an invented sentence, with no xref: pdf.js rebuilds it, as it must for
  // mail it did not write.
  const pdf = (text: string) => new TextEncoder().encode([
    "%PDF-1.4",
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
    "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj",
    `4 0 obj << /Length ${38 + text.length} >> stream`,
    `BT /F1 12 Tf 20 100 Td (${text}) Tj ET`,
    "endstream endobj",
    "5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj",
    "trailer << /Root 1 0 R >>",
    "%%EOF"
  ].join("\n"));

  test("opens a PDF and refuses one that is not a 7-Eleven form as not a receipt", async () => {
    expect(await readReceiptPdfBytes(pdf("An invented letter"))).toMatchObject({ ok: false, code: "UNKNOWN_FORM" });
  });

  test("hands the page text to the reader: a condensed-form header is recognised, then refused as incomplete", async () => {
    const read = await readReceiptPdfBytes(pdf("CP ALL,7-Eleven Invented"));
    expect(read.ok).toBe(false);
    expect(read.ok ? null : read.code).not.toMatch(/^(UNKNOWN_FORM|UNREADABLE_PDF)$/);
  });

  test("a file that is not a PDF is a refusal to retry, not 'not a receipt'", async () => {
    expect(await readReceiptPdfBytes(new TextEncoder().encode("not a pdf at all"))).toMatchObject({ ok: false, code: "UNREADABLE_PDF" });
  });
});
