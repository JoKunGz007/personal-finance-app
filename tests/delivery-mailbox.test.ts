import { describe, expect, test } from "vitest";
import { DELIVERY_FLAG, decodeBody, emptyReport, readMessage, receiptDocuments, type ReceiptDocument } from "@/lib/server/delivery-mailbox";
import type { ParsedDelivery, ParsedRide } from "@/lib/delivery-grab";

// Body structures shaped as imapflow parses them (`parseBodystructure`): the root multipart has no
// part number, and an embedded message's body reuses its wrapper's path. Invented values only.

const html = (part?: string) => ({ part, type: "text/html", encoding: "quoted-printable", parameters: { charset: "UTF-8" } });
const plain = (part: string) => ({ part, type: "text/plain", encoding: "7bit", parameters: { charset: "utf-8" } });

describe("receiptDocuments", () => {
  test("a forwarded receipt is the message's own HTML body", () => {
    const root = { type: "multipart/alternative", childNodes: [plain("1"), html("2")] };
    expect(receiptDocuments(root)).toEqual([{ part: "2", encoding: "quoted-printable", charset: "utf-8", mailSentAt: null }]);
  });

  test("a single-part HTML message is part 1", () => {
    expect(receiptDocuments(html())).toEqual([{ part: "1", encoding: "quoted-printable", charset: "utf-8", mailSentAt: null }]);
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
// The measured ride layout (see tests/delivery-grab-ride.test.ts), invented values.
const ride = (fare: string) => ["E-Receipt/Abbreviated Tax Invoice", "Saver Bike", "Picked up on 12 September 2026",
  "Booking ID: A-INVENTED0002", "Total Paid", "฿ 50", "Breakdown", "Fare", fare, "Platform Fee", "฿ 6*", "Total Paid", "฿ 50",
  "Paid by", "0000", "฿ 50", "Your Trip", "2 km • 9 mins", "⋮", "Invented A", "8:05PM", "Invented B", "8:14PM", "Grab Thailand"]
  .map((line) => `<div>${line}</div>`).join("");
const RIDE = ride("฿ 44");
const BROKEN_RIDE = ride("฿ 45");
const stores = (orders: (orders: readonly ParsedDelivery[]) => Promise<("captured" | "alreadyStored" | "disagrees" | "storeRefused")[]>,
  rides: (rides: readonly ParsedRide[]) => Promise<("captured" | "alreadyStored" | "disagrees" | "storeRefused")[]> = async (list) => list.map(() => "captured")) =>
  ({ orders, rides });
const BROKEN = receipt("฿ 61");

const doc = (part: string, mailSentAt: string | null = null): ReceiptDocument => ({ part, encoding: "8bit", charset: "utf-8", mailSentAt });
const bodies = (entries: Record<string, string>) => new Map(Object.entries(entries).map(([part, text]) => [part, Buffer.from(text, "utf8")]));

describe("readMessage", () => {
  test("stores food and rides, skips cover notes, and resolves the message", async () => {
    const report = emptyReport();
    const stored: ParsedDelivery[] = [];
    const storedRides: ParsedRide[] = [];
    const resolved = await readMessage([doc("1"), doc("2.2"), doc("3.1")], bodies({ 1: "<p>Invented cover note</p>", "2.2": FOOD, "3.1": RIDE }),
      new Set(), stores(async (orders) => { stored.push(...orders); return orders.map(() => "captured"); },
        async (rides) => { storedRides.push(...rides); return rides.map(() => "alreadyStored"); }), report);
    expect(resolved).toBe(true);
    expect(stored.map((order) => order.bookingId)).toEqual(["A-INVENTED0001"]);
    expect(storedRides.map((row) => row.bookingId)).toEqual(["A-INVENTED0002"]);
    expect(report).toMatchObject({ captured: 1, ridesCaptured: 0, ridesAlreadyStored: 1, notReceipts: 1, refused: {} });
  });

  test("a refused ride is counted under its own prefix and leaves the message unresolved", async () => {
    const report = emptyReport();
    const resolved = await readMessage([doc("1")], bodies({ 1: BROKEN_RIDE }), new Set(), stores(async () => []), report);
    expect(resolved).toBe(false);
    expect(report.refused).toEqual({ RIDE_TOTAL_MISMATCH: 1 });
  });

  test("a ride the store refuses leaves the message unresolved too", async () => {
    const report = emptyReport();
    const resolved = await readMessage([doc("1")], bodies({ 1: RIDE }), new Set(), stores(async () => [], async () => ["disagrees"]), report);
    expect(resolved).toBe(false);
    expect(report.refused).toEqual({ RIDE_DISAGREES: 1 });
  });

  test("a refused receipt leaves the message unresolved, so it is read again next sync", async () => {
    const report = emptyReport();
    const resolved = await readMessage([doc("2"), doc("3")], bodies({ 2: FOOD, 3: BROKEN }), new Set(),
      stores(async (orders) => orders.map(() => "alreadyStored")), report);
    expect(resolved).toBe(false);
    expect(report).toMatchObject({ alreadyStored: 1, refused: { TOTAL_MISMATCH: 1 } });
  });

  test("a store that disagrees with the stored copy leaves it unresolved too", async () => {
    const report = emptyReport();
    const resolved = await readMessage([doc("1")], bodies({ 1: FOOD }), new Set(), stores(async () => ["disagrees"]), report);
    expect(resolved).toBe(false);
    expect(report.refused).toEqual({ DISAGREES: 1 });
  });

  test("a body that did not arrive is counted, not skipped silently", async () => {
    const report = emptyReport();
    const resolved = await readMessage([doc("1")], new Map(), new Set(), stores(async () => []), report);
    expect(resolved).toBe(false);
    expect(report.refused).toEqual({ UNDECODABLE: 1 });
  });

  test("the done-flag is the renamed one", () => {
    expect(DELIVERY_FLAG).toBe("PLGrab2");
  });
});

const wrap = (lines: string[]) => lines.map((line) => `<div>${line}</div>`).join("");
const MART = wrap(["ขอบคุณที่ซื้อสินค้ากับเรา!", "ทั้งหมด", "฿ 150", "จัดส่งเมื่อ", "9 Jul 26 13:05 +0700", "รหัสคำสั่งซื้อ", "A-9INVENTED01",
  "สั่งซื้อจาก:", "Invented Mart Branch", "วิธีการชำระเงิน:", "Invented 0000", "2x", "Invented Apples", "฿ 100", "1x", "Invented Rice", "฿ 60",
  "ราคาคำสั่งซื้อ", "฿ 160", "ค่าจัดส่ง", "฿ 20", "INVENTEDPROMO", "- ฿ 30", "ทั้งหมด", "฿ 150"]);
const DINE = wrap(["Hope you had a great meal!", "รวม", "฿ 405", "วันที่ | เวลา", "9 Jul 26 13:05 +0700", "รหัสคำสั่งซื้อแบบสั้น", "A-B1C",
  "ร้านอาหาร:", "Invented Grill", "รูปแบบการชำระเงิน:", "Invented 0000", "รายละเอียด", "จำนวน:", "2", "ค่าอาหาร", "฿ 450", "10% off", "- ฿ 45", "Total", "฿ 405"]);
const expressBody = (price: string) => ["Your item has been delivered!", "TOTAL", "฿ 85", "Date", "9 Apr 26", "Booking code", "A-INVENTED-0000001",
  "1 Invented Road, Invented District", "Invented City 10000", "Receipt Summary", "Payment Method", "Mastercard 0000", "Payment Method", "Amount",
  "Basic Delivery Guarantee*", "฿ 70", "Item Carrying Fee", "฿ 25", "Rewards", "- ฿ 10", "TOTAL", price, "Total VAT Item(s) Amount1", "฿ 5.56"];
const EXPRESS = wrap(expressBody("฿ 85"));
const BROKEN_EXPRESS = wrap(expressBody("฿ 86"));
const LATE_LINES = ["ทานอาหารให้อร่อย!", "GrabFood", "We’re sorry for the late delivery. Here is a ฿ 50 voucher.", "Order ID: A-1B2C3D", "Order breakdown",
  "Merchant", "Invented Noodles", "Status", "Completed", "Description", "Amount (THB)", "2x", "Invented Noodle", "120.50", "1x", "Invented Tea", "35.00",
  "Service Fee", "5.25", "Delivery Fee", "20.00", "Total", "180.75"];
const LATE = wrap(LATE_LINES);
const FORWARD = wrap(["---------- Forwarded message ---------", "From: Invented <x@example.invalid>", "Date: Thu, Apr 9, 2026 at 9:41 PM", ...LATE_LINES]);
const BADFORWARD = wrap(["---------- Forwarded message ---------", "Date: sometime last week", ...LATE_LINES]);

async function readOne(body: string, sentAt: string | null = null) {
  const report = emptyReport();
  const stored: ParsedDelivery[] = [];
  const resolved = await readMessage([doc("1", sentAt)], bodies({ 1: body }), new Set(),
    stores(async (orders) => { stored.push(...orders); return orders.map(() => "captured"); }), report);
  return { report, stored, resolved };
}

describe("readMessage, other Grab services", () => {
  test.each([
    ["mart", MART, "A-9INVENTED01", "mart"],
    ["dine out", DINE, "A-B1C-2026-07-09", "dine_out"],
    ["express", EXPRESS, "A-INVENTED-0000001", "express"],
    ["late", LATE, "A-1B2C3D", "food"]
  ])("%s goes to its parser and to the order store", async (_name, body, bookingId, service) => {
    const { report, stored, resolved } = await readOne(body, "2026-04-09T14:41:00.000Z");
    expect(resolved).toBe(true);
    expect(stored.map((order) => [order.bookingId, order.service])).toEqual([[bookingId, service]]);
    expect(report).toMatchObject({ captured: 1, notReceipts: 0, refused: {} });
  });

  test("a late mail takes the mail's send time from the envelope", async () => {
    const { stored } = await readOne(LATE, "2026-04-09T14:41:00.000Z");
    expect(stored[0]!.receiptSentAt).toBe("2026-04-09T14:41:00.000Z");
  });

  test("a late mail with no send time is refused and left unresolved", async () => {
    const { report, resolved } = await readOne(LATE, null);
    expect(resolved).toBe(false);
    expect(report.refused).toEqual({ MISSING_FIELD: 1 });
  });

  test("an inline forward uses the forwarded Date, not the envelope's", async () => {
    const { stored } = await readOne(FORWARD, "2026-10-01T00:00:00.000Z");
    expect(stored[0]!.receiptSentAt).toBe("2026-04-09T21:41:00+07:00");
  });

  test("a forward whose Date does not parse falls back to no time, never the envelope's", async () => {
    const { resolved, report } = await readOne(BADFORWARD, "2026-10-01T00:00:00.000Z");
    expect(resolved).toBe(false);
    expect(report.refused).toEqual({ MISSING_FIELD: 1 });
  });

  test("a refused new-kind receipt leaves the message unresolved like food", async () => {
    const { resolved, report, stored } = await readOne(BROKEN_EXPRESS);
    expect(resolved).toBe(false);
    expect(stored).toEqual([]);
    expect(report.refused).toEqual({ TOTAL_MISMATCH: 1 });
  });

  test("a store that disagrees on a new kind leaves it unresolved", async () => {
    const report = emptyReport();
    const resolved = await readMessage([doc("1")], bodies({ 1: MART }), new Set(), stores(async () => ["disagrees"]), report);
    expect(resolved).toBe(false);
    expect(report.refused).toEqual({ DISAGREES: 1 });
  });

  test("a store that disagrees on a late order counts it as already stored and resolves the message", async () => {
    const report = emptyReport();
    const resolved = await readMessage([doc("1", "2026-04-09T14:41:00.000Z")], bodies({ 1: LATE }), new Set(), stores(async () => ["disagrees"]), report);
    expect(resolved).toBe(true);
    expect(report).toMatchObject({ alreadyStored: 1, refused: {} });
  });

  test("other mail is still not a receipt", async () => {
    const { report, resolved, stored } = await readOne("<p>Invented newsletter</p>");
    expect(resolved).toBe(true);
    expect(stored).toEqual([]);
    expect(report.notReceipts).toBe(1);
  });
});

describe("receiptDocuments, mail send time", () => {
  const outer = new Date("2026-10-01T00:00:00Z");
  const inner = new Date("2026-04-09T14:41:00Z");
  test("a root document takes the outer envelope date; an embedded one its own", () => {
    const root = {
      type: "multipart/mixed", envelope: { date: outer },
      childNodes: [html("1"), { part: "2", type: "message/rfc822", envelope: { date: inner }, childNodes: [html("2")] },
        { part: "3", type: "message/rfc822", envelope: { date: "not a Date" }, childNodes: [html("3")] }]
    };
    expect(receiptDocuments(root).map((document) => document.mailSentAt)).toEqual([outer.toISOString(), inner.toISOString(), null]);
  });
  test("an invalid Date or no envelope is null", () => {
    expect(receiptDocuments({ ...html("1"), envelope: { date: new Date("nope") } })[0]!.mailSentAt).toBeNull();
    expect(receiptDocuments(html("1"))[0]!.mailSentAt).toBeNull();
  });
});
