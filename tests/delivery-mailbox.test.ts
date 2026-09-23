import { describe, expect, test } from "vitest";
import { decodeBody, emptyReport, readMessage, receiptDocuments, type ReceiptDocument } from "@/lib/server/delivery-mailbox";
import type { ParsedDelivery } from "@/lib/delivery-grab";

// Body structures shaped as imapflow parses them (`parseBodystructure`): the root multipart has no
// part number, and an embedded message's body reuses its wrapper's path. Invented values only.

const html = (part?: string) => ({ part, type: "text/html", encoding: "quoted-printable", parameters: { charset: "UTF-8" } });
const plain = (part: string) => ({ part, type: "text/plain", encoding: "7bit", parameters: { charset: "utf-8" } });

describe("receiptDocuments", () => {
  test("a forwarded receipt is the message's own HTML body", () => {
    const root = { type: "multipart/alternative", childNodes: [plain("1"), html("2")] };
    expect(receiptDocuments(root)).toEqual([{ part: "2", encoding: "quoted-printable", charset: "utf-8" }]);
  });

  test("a single-part HTML message is part 1", () => {
    expect(receiptDocuments(html())).toEqual([{ part: "1", encoding: "quoted-printable", charset: "utf-8" }]);
  });

  test("a bundle yields its cover note and one document per embedded receipt", () => {
    const root = {
      type: "multipart/mixed",
      childNodes: [
        html("1"),
        // Embedded message with a multipart body: children numbered under the wrapper.
        { part: "2", type: "message/rfc822", childNodes: [{ part: "2", type: "multipart/alternative", childNodes: [plain("2.1"), html("2.2")] }] },
        // Embedded message with a single-part body: imapflow gives it the wrapper's path; IMAP wants `.1`.
        { part: "3", type: "message/rfc822", childNodes: [html("3")] }
      ]
    };
    expect(receiptDocuments(root).map((document) => document.part)).toEqual(["1", "2.2", "3.1"]);
  });

  test("an HTML attachment is not a body", () => {
    const root = { type: "multipart/mixed", childNodes: [plain("1"), { ...html("2"), disposition: "attachment" }] };
    expect(receiptDocuments(root)).toEqual([]);
  });
});

describe("decodeBody", () => {
  const document = { encoding: "quoted-printable", charset: "utf-8" };
  test("decodes quoted-printable Thai with soft line breaks", () => {
    const raw = Buffer.from("=E0=B8=A3=E0=B8=A7=\r\n=E0=B8=A1 =E0=B8=BF 1", "latin1");
    expect(decodeBody(raw, document)).toBe("รวม ฿ 1");
  });
  test("decodes base64", () => {
    const raw = Buffer.from(Buffer.from("ค่าอาหาร", "utf8").toString("base64"), "latin1");
    expect(decodeBody(raw, { encoding: "base64", charset: "utf-8" })).toBe("ค่าอาหาร");
  });
  test("refuses a charset it cannot read faithfully, and invalid UTF-8", () => {
    expect(decodeBody(Buffer.from("x"), { encoding: "7bit", charset: "tis-620" })).toBeNull();
    expect(decodeBody(Buffer.from([0xe0, 0x28]), { encoding: "8bit", charset: "utf-8" })).toBeNull();
  });
});

// The measured layout (see tests/delivery-grab.test.ts): every label and amount on its own line.
const receipt = (total: string) => ["ทานอาหารให้อร่อย!", "12 Sep 26 19:42 +0700", "GrabFood",
  "รหัสการจอง", "A-INVENTED0001", "สถานที่เริ่มต้นการเดินทาง:", "Invented Kitchen",
  "1x", "Invented Rice", "฿ 60", "ค่าอาหาร", "฿ 60", "รวม", total].map((line) => `<div>${line}</div>`).join("");
const FOOD = receipt("฿ 60");
const RIDE = "<p>E-Receipt/Abbreviated Tax Invoice</p><p>Invented Saver Bike</p>";
const BROKEN = receipt("฿ 61");

const doc = (part: string): ReceiptDocument => ({ part, encoding: "8bit", charset: "utf-8" });
const bodies = (entries: Record<string, string>) => new Map(Object.entries(entries).map(([part, text]) => [part, Buffer.from(text, "utf8")]));

describe("readMessage", () => {
  test("stores food, skips rides and cover notes, and resolves the message", async () => {
    const report = emptyReport();
    const stored: ParsedDelivery[] = [];
    const resolved = await readMessage([doc("1"), doc("2.2"), doc("3.1")], bodies({ 1: "<p>Invented cover note</p>", "2.2": FOOD, "3.1": RIDE }),
      new Set(), async (orders) => { stored.push(...orders); return orders.map(() => "captured"); }, report);
    expect(resolved).toBe(true);
    expect(stored.map((order) => order.bookingId)).toEqual(["A-INVENTED0001"]);
    expect(report).toMatchObject({ captured: 1, rides: 1, notReceipts: 1, refused: {} });
  });

  test("a refused receipt leaves the message unresolved, so it is read again next sync", async () => {
    const report = emptyReport();
    const resolved = await readMessage([doc("2"), doc("3")], bodies({ 2: FOOD, 3: BROKEN }), new Set(),
      async (orders) => orders.map(() => "alreadyStored"), report);
    expect(resolved).toBe(false);
    expect(report).toMatchObject({ alreadyStored: 1, refused: { TOTAL_MISMATCH: 1 } });
  });

  test("a store that disagrees with the stored copy leaves it unresolved too", async () => {
    const report = emptyReport();
    const resolved = await readMessage([doc("1")], bodies({ 1: FOOD }), new Set(), async () => ["disagrees"], report);
    expect(resolved).toBe(false);
    expect(report.refused).toEqual({ DISAGREES: 1 });
  });

  test("a body that did not arrive is counted, not skipped silently", async () => {
    const report = emptyReport();
    const resolved = await readMessage([doc("1")], new Map(), new Set(), async () => [], report);
    expect(resolved).toBe(false);
    expect(report.refused).toEqual({ UNDECODABLE: 1 });
  });
});
