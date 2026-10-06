import { describe, expect, test } from "vitest";
import { classifyGrabReceipt, parseGrabDineOut, parseGrabExpress, parseGrabLateDelivery, parseGrabMart, readForwardedDate } from "@/lib/delivery-grab";

// Every value is invented (`docs/FIXTURE_POLICY.md`). Layouts follow the shapes described in D-247.

const martLines = (over: { items?: string[]; tail?: string[]; top?: string[] } = {}): string[] => [
  "ขอบคุณที่ซื้อสินค้ากับเรา!",
  ...(over.top ?? ["ทั้งหมด", "฿ 150"]),
  "จัดส่งเมื่อ", "9 Jul 26 13:05 +0700",
  "รหัสคำสั่งซื้อ", "A-9INVENTED01",
  "สั่งซื้อจาก:", "Invented Mart Branch",
  "GrabCoins ที่ได้รับ:", "+99",
  "วิธีการชำระเงิน:", "Invented 0000",
  ...(over.items ?? ["2x", "Invented Apples", "฿ 100", "1.5 kg", "1x", "Invented Rice", "฿ 60", "2 per pack"]),
  ...(over.tail ?? [
    "ราคาคำสั่งซื้อ", "฿ 160",
    "ค่าจัดส่ง", "฿ 20",
    "INVENTEDPROMO", "- ฿ 30",
    "ทั้งหมด", "฿ 150"
  ])
];

const dineOutLines = (over: { tail?: string[]; top?: string[]; spelling?: string } = {}): string[] => [
  "Hope you had a great meal!",
  ...(over.top ?? ["รวม", "฿ 405"]),
  "วันที่ | เวลา", "9 Jul 26 13:05 +0700",
  "รหัสคำสั่งซื้อแบบสั้น", "A-B1C",
  over.spelling ?? "ร้านอาาหร::", "Invented Grill",
  "รูปแบบการชำระเงิน:", "Invented 0000",
  "รายละเอียด", "จำนวน:", "2",
  ...(over.tail ?? [
    "ค่าอาหาร", "฿ 450",
    "10% off", "- ฿ 45",
    "Total", "฿ 405"
  ])
];

describe("classifyGrabReceipt, other services", () => {
  test("late delivery with a GrabFood banner is late, not food", () => {
    expect(classifyGrabReceipt(["ทานอาหารให้อร่อย!", "GrabFood", "We’re sorry for the late delivery"])).toBe("late");
    expect(classifyGrabReceipt(["GrabFood", "ทานอาหารให้อร่อย!", "We're sorry for the late delivery"])).toBe("late");
  });
  test("express with the ride heading is express, not ride", () => {
    for (const marker of ["Your item has been delivered!", "Item pickup location", "GrabExpress (Bike)"]) {
      expect(classifyGrabReceipt(["E-Receipt/Abbreviated Tax Invoice", marker])).toBe("express");
    }
  });
  test("dine out in both spellings", () => {
    expect(classifyGrabReceipt(["Hope you had a great meal!"])).toBe("dine_out");
    expect(classifyGrabReceipt(["x ส่วนลดสําหรับทานที่ร้าน y"])).toBe("dine_out");
    expect(classifyGrabReceipt(["x ส่วนลดสำหรับทานที่ร้าน y"])).toBe("dine_out");
  });
  test("a GrabFood receipt that also says the dine out closing phrase stays food", () => {
    expect(classifyGrabReceipt(["ทานอาหารให้อร่อย!", "GrabFood", "Hope you had a great meal!"])).toBe("food");
    expect(classifyGrabReceipt(["ทานอาหารให้อร่อย!", "GrabFood", "x ส่วนลดสำหรับทานที่ร้าน y"])).toBe("food");
  });
  test("mart by thanks line or by the GrabMart line after the order-with line", () => {
    expect(classifyGrabReceipt(["ขอบคุณที่ซื้อสินค้ากับเรา!"])).toBe("mart");
    expect(classifyGrabReceipt(["สั่งซื้อด้วย", "GrabMart"])).toBe("mart");
    expect(classifyGrabReceipt(["GrabMart", "สั่งซื้อด้วย"])).toBe("other");
  });
});

describe("parseGrabMart", () => {
  test("reads the happy path; the coins line is ignored", () => {
    const read = parseGrabMart(martLines());
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    const v = read.value;
    expect(v.service).toBe("mart");
    expect(v.platform).toBe("grabfood");
    expect(v.bookingId).toBe("A-9INVENTED01");
    expect(v.restaurant).toBe("Invented Mart Branch");
    expect(v.paymentMethod).toBe("Invented 0000");
    expect(v.receiptSentAt).toBe("2026-07-09T13:05:00+07:00");
    expect(v.items.map((i) => [i.quantity, i.name, i.amountMinor, i.options])).toEqual([
      [2, "Invented Apples", "10000", ["1.5 kg"]],
      [1, "Invented Rice", "6000", ["2 per pack"]]
    ]);
    expect(v.foodMinor).toBe("16000");
    expect(v.deliveryFeeMinor).toBe("2000");
    expect(v.adjustments).toEqual([{ position: 1, kind: "discount", name: "INVENTEDPROMO", amountMinor: "3000" }]);
    expect(v.totalMinor).toBe("15000");
    expect(JSON.stringify(v)).not.toContain("+99");
  });

  test("refuses when the sums do not close", () => {
    const bad = parseGrabMart(martLines({ top: ["ทั้งหมด", "฿ 140"], tail: ["ราคาคำสั่งซื้อ", "฿ 160", "ค่าจัดส่ง", "฿ 20", "INVENTEDPROMO", "- ฿ 30", "ทั้งหมด", "฿ 140"] }));
    expect(bad).toMatchObject({ ok: false, code: "TOTAL_MISMATCH" });
    const items = parseGrabMart(martLines({ tail: ["ราคาคำสั่งซื้อ", "฿ 170", "ค่าจัดส่ง", "฿ 20", "INVENTEDPROMO", "- ฿ 40", "ทั้งหมด", "฿ 150"] }));
    expect(items).toMatchObject({ ok: false, code: "ITEMS_MISMATCH" });
    const top = parseGrabMart(martLines({ top: ["ทั้งหมด", "฿ 151"] }));
    expect(top).toMatchObject({ ok: false, code: "TOTAL_MISMATCH" });
  });
});

describe("parseGrabDineOut", () => {
  test("reads the happy path and suffixes the booking ID with the Bangkok date", () => {
    const read = parseGrabDineOut(dineOutLines());
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    const v = read.value;
    expect(v).toMatchObject({
      service: "dine_out", platform: "grabfood", bookingId: "A-B1C-2026-07-09", restaurant: "Invented Grill",
      paymentMethod: "Invented 0000", receiptSentAt: "2026-07-09T13:05:00+07:00", foodMinor: "45000",
      deliveryFeeMinor: null, totalMinor: "40500"
    });
    expect(v.items).toEqual([]);
    expect(v.adjustments).toEqual([{ position: 1, kind: "discount", name: "10% off", amountMinor: "4500" }]);
  });

  test("accepts the correctly spelled restaurant label", () => {
    const read = parseGrabDineOut(dineOutLines({ spelling: "ร้านอาหาร:" }));
    expect(read.ok && read.value.restaurant).toBe("Invented Grill");
  });

  test("the same short ID on another day is another booking", () => {
    const later = dineOutLines().map((line) => (line === "9 Jul 26 13:05 +0700" ? "10 Jul 26 13:05 +0700" : line));
    const read = parseGrabDineOut(later);
    expect(read.ok && read.value.bookingId).toBe("A-B1C-2026-07-10");
  });

  test("two discounts, one label carrying a baht figure", () => {
    const read = parseGrabDineOut(dineOutLines({
      top: ["รวม", "฿ 350"],
      tail: ["ค่าอาหาร", "฿ 450", "10% off", "- ฿ 45", "Invented promo ฿100 off [CODE]", "- ฿ 55", "Total", "฿ 350"]
    }));
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.value.adjustments.map((a) => [a.name, a.amountMinor])).toEqual([["10% off", "4500"], ["Invented promo ฿100 off [CODE]", "5500"]]);
    expect(read.value.totalMinor).toBe("35000");
  });

  test("refuses when the sums do not close", () => {
    expect(parseGrabDineOut(dineOutLines({ tail: ["ค่าอาหาร", "฿ 450", "10% off", "- ฿ 40", "Total", "฿ 405"] })))
      .toMatchObject({ ok: false, code: "TOTAL_MISMATCH" });
    expect(parseGrabDineOut(dineOutLines({ top: ["รวม", "฿ 400"] }))).toMatchObject({ ok: false, code: "TOTAL_MISMATCH" });
  });
});

describe("readForwardedDate", () => {
  const fwd = (date: string) => ["---------- Forwarded message ---------", "From: Invented <x@example.invalid>", date];
  test("PM, AM and the 12 o'clock edges", () => {
    expect(readForwardedDate(fwd("Date: Thu, Apr 9, 2026 at 9:41 PM"))).toBe("2026-04-09T21:41:00+07:00");
    expect(readForwardedDate(fwd("Date: Thu, Apr 9, 2026 at 9:41 AM"))).toBe("2026-04-09T09:41:00+07:00");
    expect(readForwardedDate(fwd("Date: Thu, Apr 9, 2026 at 12:05 AM"))).toBe("2026-04-09T00:05:00+07:00");
    expect(readForwardedDate(fwd("Date: Thu, Apr 9, 2026 at 12:05 PM"))).toBe("2026-04-09T12:05:00+07:00");
  });
  test("no marker, or an unparsable line, is null", () => {
    expect(readForwardedDate(["Date: Thu, Apr 9, 2026 at 9:41 PM"])).toBeNull();
    expect(readForwardedDate(fwd("Date: sometime last week"))).toBeNull();
    expect(readForwardedDate(fwd("Date: Thu, Feb 31, 2026 at 9:41 PM"))).toBeNull();
  });
});

const expressLines = (over: { top?: string[]; tail?: string[]; date?: string } = {}): string[] => [
  "Your item has been delivered!",
  "TOTAL", ...(over.top ?? ["฿ 85"]),
  "Date", over.date ?? "9 Apr 26",
  "Booking code", "A-INVENTED-0000001",
  "1 Invented Road, Invented District",
  "Invented City 10000",
  "Receipt Summary",
  "Payment Method", "Mastercard 0000",
  "Payment Method", "Amount",
  ...(over.tail ?? [
    "Basic Delivery Guarantee*", "฿ 70",
    "Item Carrying Fee", "฿ 25",
    "Rewards", "- ฿ 10",
    "TOTAL", "฿ 85",
    "Total VAT Item(s) Amount1", "฿ 5.56"
  ])
];

describe("parseGrabExpress", () => {
  test("happy path; the VAT line is not money; the address is never stored", () => {
    const read = parseGrabExpress(expressLines(), "2026-04-09T21:41:00+07:00");
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.value).toMatchObject({
      service: "express", platform: "grabfood", bookingId: "A-INVENTED-0000001", restaurant: "GrabExpress",
      paymentMethod: "Mastercard 0000", items: [], foodMinor: "0", deliveryFeeMinor: "7000", totalMinor: "8500",
      receiptSentAt: "2026-04-09T21:41:00+07:00"
    });
    expect(read.value.adjustments.map((a) => [a.kind, a.name, a.amountMinor])).toEqual([
      ["charge", "Item Carrying Fee", "2500"], ["discount", "Rewards", "1000"]
    ]);
    expect(JSON.stringify(read.value)).not.toContain("Invented Road");
  });
  test("a top total that differs from the bottom is refused", () => {
    const read = parseGrabExpress(expressLines({ top: ["฿ 86"] }), null);
    expect(read).toMatchObject({ ok: false, code: "TOTAL_MISMATCH" });
  });
  test("fee, charges and discounts that miss the total are refused", () => {
    const tail = ["Basic Delivery Guarantee*", "฿ 70", "TOTAL", "฿ 85"];
    expect(parseGrabExpress(expressLines({ tail }), null)).toMatchObject({ ok: false, code: "TOTAL_MISMATCH" });
  });
  test("mail date on another day falls back to the printed date at noon; null mail time too", () => {
    const other = parseGrabExpress(expressLines(), "2026-04-12T08:00:00+07:00");
    expect(other.ok && other.value.receiptSentAt).toBe("2026-04-09T12:00:00+07:00");
    const none = parseGrabExpress(expressLines(), null);
    expect(none.ok && none.value.receiptSentAt).toBe("2026-04-09T12:00:00+07:00");
  });
  test("no printed date is refused", () => {
    expect(parseGrabExpress(expressLines({ date: "yesterday" }), null)).toMatchObject({ ok: false, code: "MISSING_FIELD" });
  });
});

const lateLines = (over: { items?: string[]; fees?: string[]; total?: string } = {}): string[] => [
  "ทานอาหารให้อร่อย!", "GrabFood",
  "We’re sorry for the late delivery. Here is a ฿ 50 voucher.",
  "Order ID: A-1B2C3D",
  "Order breakdown",
  "Merchant", "Invented Noodles",
  "Status", "Completed",
  "Description", "Amount (THB)",
  ...(over.items ?? ["2x", "Invented Noodle", "No spice", "Extra egg", "120.50", "1x", "Invented Tea", "35.00"]),
  ...(over.fees ?? ["Service Fee", "5.25", "Delivery Fee", "20.00"]),
  "Total", over.total ?? "180.75"
];

describe("parseGrabLateDelivery", () => {
  const sent = "2026-04-09T21:41:00+07:00";
  test("options before the price, separate fees, voucher in the apology ignored", () => {
    const read = parseGrabLateDelivery(lateLines(), sent);
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.value).toMatchObject({
      service: "food", bookingId: "A-1B2C3D", restaurant: "Invented Noodles", paymentMethod: null, receiptSentAt: sent,
      foodMinor: "15550", deliveryFeeMinor: "2000", totalMinor: "18075"
    });
    expect(read.value.items).toEqual([
      { position: 1, quantity: 2, name: "Invented Noodle", options: ["No spice", "Extra egg"], amountMinor: "12050" },
      { position: 2, quantity: 1, name: "Invented Tea", options: [], amountMinor: "3500" }
    ]);
    expect(read.value.adjustments).toEqual([{ position: 1, kind: "charge", name: "Service Fee", amountMinor: "525" }]);
  });
  test("adjacent fee labels over one amount become a single charge", () => {
    const read = parseGrabLateDelivery(lateLines({ fees: ["Service Fee", "Delivery Fee", "25.25"] }), sent);
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.value.deliveryFeeMinor).toBeNull();
    expect(read.value.adjustments).toEqual([{ position: 1, kind: "charge", name: "Service Fee + Delivery Fee", amountMinor: "2525" }]);
  });
  test("a total that does not close is refused", () => {
    expect(parseGrabLateDelivery(lateLines({ total: "180.76" }), sent)).toMatchObject({ ok: false, code: "TOTAL_MISMATCH" });
  });
  test("the order ID is the last ID line before the breakdown", () => {
    const lines = lateLines();
    lines.splice(lines.indexOf("Order ID: A-1B2C3D"), 0, "Voucher code: GRAB15OFF2");
    const read = parseGrabLateDelivery(lines, sent);
    expect(read.ok && read.value.bookingId).toBe("A-1B2C3D");
  });
  test("an option line that is a bare integer is an option, not a price", () => {
    const read = parseGrabLateDelivery(
      lateLines({ items: ["1x", "Invented Noodle", "2", "120.00"], fees: ["Service Fee", "5.00", "Delivery Fee", "20.00"], total: "145.00" }), sent);
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.value.items).toEqual([{ position: 1, quantity: 1, name: "Invented Noodle", options: ["2"], amountMinor: "12000" }]);
  });
  test("a null mail time is refused", () => {
    expect(parseGrabLateDelivery(lateLines(), null)).toMatchObject({ ok: false, code: "MISSING_FIELD" });
  });
});

describe("stored delivery read model", () => {
  test("reads an absent service as food and keeps a stated one", async () => {
    const { storedDeliverySchema } = await import("@/lib/deliveries");
    const base = {
      id: "00000000-0000-4000-8000-000000000001", platform: "grabfood", booking_id: "A-1", restaurant: "Invented",
      payment_method: null, receipt_sent_at: null, ordered_at: null, charged_minor: null, food_minor: "100",
      delivery_fee_minor: null, total_minor: "100", items: [], adjustments: [],
      match: { status: "none", row: null, options: [], revision: 0 }
    };
    expect(storedDeliverySchema.parse(base).service).toBe("food");
    expect(storedDeliverySchema.parse({ ...base, service: "mart" }).service).toBe("mart");
  });
});
