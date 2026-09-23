import { describe, expect, test } from "vitest";
import { classifyGrabReceipt, htmlToLines, lineShape, parseGrabFood, readSentAt } from "@/lib/delivery-grab";

// Every value below is invented (`docs/FIXTURE_POLICY.md`): the booking ID, restaurant, dishes,
// amounts, card and promo codes match no real order. The **layout** follows the masked shape of the
// real e-receipt, measured 2026-09-23 over all 114 real food receipts by
// `scripts/measure-grab-mail.ts`: every label and every amount on a line of its own, the total
// printed at the top as well as the bottom, a dish as quantity / name / price / option lines, and
// discount names that can themselves carry a baht figure.

const div = (lines: readonly string[]) => lines.map((line) => `<div>${line}</div>`).join("\n");

type Parts = { top?: string[]; header?: string[]; items?: string[]; tail?: string[] };

function receiptHtml(parts: Parts = {}): string {
  return `<html><head><style>div { color: red }</style><title>Your Grab E-Receipt</title></head><body>
  ${div(parts.top ?? ["ทานอาหารให้อร่อย!", "รวม", "฿ 205"])}
  ${div([
    "Invented thanks line | Invented thanks line",
    "12 Sep 26 19:42 +0700",
    "GrabFood",
    ...(parts.header ?? [
      "รหัสการจอง", "A-INVENTED01",
      "สถานที่เริ่มต้นการเดินทาง:", "Invented Kitchen &amp; Bar - Invented Branch 12",
      "สถานที่ปลายทาง:", "Invented destination label",
      "ชื่อ:", "Invented Name",
      "รูปแบบการชำระเงิน:", "Invented 0000",
      "สรุปคำสั่งซื้อ:"
    ])
  ])}
  ${div(parts.items ?? [
    "1x", "Invented Noodles", "฿ 150", "Extra invented egg", "Less spicy",
    "2x", "Invented Tea", "฿ 100"
  ])}
  ${div(parts.tail ?? [
    "ค่าอาหาร", "฿ 250",
    "ค่าจัดส่ง", "฿ 15",
    "20% off max ฿100", "- ฿ 50",
    "Invented promo ฿10 off [INVENTEDCODE]", "- ฿ 10",
    "รวม", "฿ 205"
  ])}
  ${div(["Invented footer", "Invented rider name"])}
  </body></html>`;
}

describe("htmlToLines", () => {
  test("one line per block, head and style dropped, entities decoded", () => {
    const lines = htmlToLines(receiptHtml());
    expect(lines).toContain("1x");
    expect(lines).toContain("Invented Kitchen & Bar - Invented Branch 12");
    expect(lines.some((line) => line.includes("color"))).toBe(false);
    expect(lines.some((line) => line.includes("Your Grab E-Receipt"))).toBe(false);
  });

  test("a table row still reads as one line", () => {
    expect(htmlToLines("<table><tr><td>1x</td><td>Invented Rice</td></tr></table>")).toEqual(["1x Invented Rice"]);
  });
});

describe("classifyGrabReceipt", () => {
  test("recognises food by its heading and GrabFood, rides by theirs, and nothing else", () => {
    expect(classifyGrabReceipt(htmlToLines(receiptHtml()))).toBe("food");
    expect(classifyGrabReceipt(["E-Receipt/Abbreviated Tax Invoice", "Invented Saver Bike"])).toBe("ride");
    expect(classifyGrabReceipt(["Sorry your order was cancelled", "GrabFood"])).toBe("other");
    // The heading alone is not enough: the template names GrabFood too.
    expect(classifyGrabReceipt(["ทานอาหารให้อร่อย!"])).toBe("other");
  });
});

describe("readSentAt", () => {
  test("reads dd Mon yy HH:MM +0700 as Bangkok time", () => {
    expect(readSentAt(["12 Sep 26 19:42 +0700"])).toBe("2026-09-12T19:42:00+07:00");
    expect(readSentAt(["3 Jan 2026 08:05 +0700"])).toBe("2026-01-03T08:05:00+07:00");
  });
  test("refuses an impossible date rather than rolling it over", () => {
    expect(readSentAt(["31 Feb 26 10:00 +0700"])).toBeNull();
  });
});

describe("parseGrabFood", () => {
  test("reads the order, its dishes with their options, the fee and each discount", () => {
    const parsed = parseGrabFood(htmlToLines(receiptHtml()));
    expect(parsed.ok, JSON.stringify(parsed)).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value).toEqual({
      platform: "grabfood",
      bookingId: "A-INVENTED01",
      restaurant: "Invented Kitchen & Bar - Invented Branch 12",
      paymentMethod: "Invented 0000",
      receiptSentAt: "2026-09-12T19:42:00+07:00",
      items: [
        { position: 1, quantity: 1, name: "Invented Noodles", options: ["Extra invented egg", "Less spicy"], amountMinor: "15000" },
        { position: 2, quantity: 2, name: "Invented Tea", options: [], amountMinor: "10000" }
      ],
      foodMinor: "25000",
      deliveryFeeMinor: "1500",
      adjustments: [
        { position: 1, kind: "discount", name: "20% off max ฿100", amountMinor: "5000" },
        { position: 2, kind: "discount", name: "Invented promo ฿10 off [INVENTEDCODE]", amountMinor: "1000" }
      ],
      totalMinor: "20500"
    });
  });

  test("never reads the destination label, the name or the rider into any field", () => {
    const text = JSON.stringify(parseGrabFood(htmlToLines(receiptHtml())));
    expect(text).not.toContain("destination");
    expect(text).not.toContain("Invented Name");
    expect(text).not.toContain("rider");
  });

  test("reads a dish whose name shares the quantity line", () => {
    const parsed = parseGrabFood(htmlToLines(receiptHtml({ items: ["1x Invented Noodles", "฿ 150", "2x", "Invented Tea", "฿ 100"] })));
    expect(parsed.ok && parsed.value.items.map((item) => item.name)).toEqual(["Invented Noodles", "Invented Tea"]);
  });

  test("stores a zero-total order whose whole food price is discounted", () => {
    const parsed = parseGrabFood(htmlToLines(receiptHtml({
      top: ["ทานอาหารให้อร่อย!", "รวม", "฿ 0"],
      tail: ["ค่าอาหาร", "฿ 250", "INVENTEDSCHEME", "- ฿ 250", "รวม", "฿ 0"]
    })));
    expect(parsed.ok && parsed.value.totalMinor).toBe("0");
    expect(parsed.ok && parsed.value.deliveryFeeMinor).toBeNull();
  });

  test("refuses dishes that do not sum to the food line", () => {
    const parsed = parseGrabFood(htmlToLines(receiptHtml({
      top: ["ทานอาหารให้อร่อย!"],
      tail: ["ค่าอาหาร", "฿ 240", "ค่าจัดส่ง", "฿ 15", "รวม", "฿ 255"]
    })));
    expect(parsed).toMatchObject({ ok: false, code: "ITEMS_MISMATCH" });
  });

  test("refuses a total higher than its lines: nothing unprinted adds to a bill", () => {
    const parsed = parseGrabFood(htmlToLines(receiptHtml({
      top: ["ทานอาหารให้อร่อย!", "รวม", "฿ 270"],
      tail: ["ค่าอาหาร", "฿ 250", "ค่าจัดส่ง", "฿ 15", "รวม", "฿ 270"]
    })));
    expect(parsed).toMatchObject({ ok: false, code: "TOTAL_MISMATCH" });
  });

  test("stores more taken off than printed as an unprinted line, when both printed totals agree", () => {
    // The shape of the one real receipt paid partly in GrabCoins, which the e-receipt never prints.
    const parsed = parseGrabFood(htmlToLines(receiptHtml({
      top: ["ทานอาหารให้อร่อย!", "รวม", "฿ 180"],
      tail: ["ค่าอาหาร", "฿ 250", "ค่าจัดส่ง", "฿ 15", "INVENTEDCODE", "- ฿ 50", "รวม", "฿ 180"]
    })));
    expect(parsed.ok && parsed.value.adjustments).toEqual([
      { position: 1, kind: "discount", name: "INVENTEDCODE", amountMinor: "5000" },
      { position: 2, kind: "unprinted", name: "Not on the e-receipt", amountMinor: "3500" }
    ]);
    expect(parsed.ok && parsed.value.totalMinor).toBe("18000");
  });

  test("refuses a positive gap when the total is printed only once", () => {
    const parsed = parseGrabFood(htmlToLines(receiptHtml({
      top: ["ทานอาหารให้อร่อย!"],
      tail: ["ค่าอาหาร", "฿ 250", "ค่าจัดส่ง", "฿ 15", "รวม", "฿ 260"]
    })));
    expect(parsed).toMatchObject({ ok: false, code: "TOTAL_MISMATCH" });
  });

  test("refuses when the top total and the bottom total disagree", () => {
    const parsed = parseGrabFood(htmlToLines(receiptHtml({ top: ["ทานอาหารให้อร่อย!", "รวม", "฿ 206"] })));
    expect(parsed).toMatchObject({ ok: false, code: "TOTAL_MISMATCH" });
  });

  test("reads a line printed without a minus sign as a charge, and the sums confirm it", () => {
    // The shape measured on 2 real receipts: a promotion-worded name whose amount is unsigned.
    const parsed = parseGrabFood(htmlToLines(receiptHtml({
      top: ["ทานอาหารให้อร่อย!", "รวม", "฿ 267.50"],
      tail: ["ค่าอาหาร", "฿ 250", "ค่าจัดส่ง", "฿ 15", "[Invented] ฿20 off GrabFood, min ฿100", "฿ 2.50", "รวม", "฿ 267.50"]
    })));
    expect(parsed.ok && parsed.value.adjustments).toEqual([
      { position: 1, kind: "charge", name: "[Invented] ฿20 off GrabFood, min ฿100", amountMinor: "250" }
    ]);
  });

  test("refuses a charge that makes the sums fail rather than reading it as a discount", () => {
    const parsed = parseGrabFood(htmlToLines(receiptHtml({
      top: ["ทานอาหารให้อร่อย!"],
      tail: ["ค่าอาหาร", "฿ 250", "Invented fee", "฿ 2", "รวม", "฿ 256"]
    })));
    expect(parsed).toMatchObject({ ok: false, code: "TOTAL_MISMATCH" });
  });

  test("reads a minus sign printed after the baht sign", () => {
    const parsed = parseGrabFood(htmlToLines(receiptHtml({
      top: ["ทานอาหารให้อร่อย!"],
      tail: ["ค่าอาหาร", "฿ 250", "INVENTEDCODE", "฿ -50", "รวม", "฿ 200"]
    })));
    expect(parsed.ok && parsed.value.adjustments[0]?.kind).toBe("discount");
  });

  test("refuses an amount with no label above it", () => {
    const parsed = parseGrabFood(htmlToLines(receiptHtml({ tail: ["ค่าอาหาร", "฿ 250", "฿ 15", "รวม", "฿ 205"] })));
    expect(parsed).toMatchObject({ ok: false, code: "MALFORMED_LINE" });
  });

  test("refuses a receipt with no booking ID", () => {
    const parsed = parseGrabFood(htmlToLines(receiptHtml({
      header: ["สถานที่เริ่มต้นการเดินทาง:", "Invented Kitchen", "รูปแบบการชำระเงิน:", "Invented 0000"]
    })));
    expect(parsed).toMatchObject({ ok: false, code: "MISSING_FIELD" });
  });
});

describe("lineShape", () => {
  test("keeps labels and masks every value", () => {
    expect(lineShape("1x Invented Noodles ฿ 150.00")).toBe("9x a a ฿ 999.99");
    expect(lineShape("รหัสการจอง A-INVENTED0001")).toBe("รหัสการจอง a-a9999");
    expect(lineShape("ค่าอาหาร ฿ 250.00")).toBe("ค่าอาหาร ฿ 999.99");
    expect(lineShape("ข้าวผัดกุ้ง")).toBe("ก");
  });
});
