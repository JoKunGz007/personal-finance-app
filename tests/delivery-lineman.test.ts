import { describe, expect, test } from "vitest";
import { readLinemanOrder, readLinemanPage, type LinemanPage } from "@/lib/delivery-lineman";
import type { OcrWord } from "@/lib/slip-ocr";

// Every value below is invented (`docs/FIXTURE_POLICY.md`): the order number, restaurant, dishes,
// amounts, name and address match no real order. The **layout** follows the order page measured
// 2026-09-24 over 7 real orders (D-223): the order number, restaurant and order time on the first
// screenshot, the owner's block above `Menu` on both, and Vision's measured quirks — a baht sign
// read as `$` or `B`, a dropped quantity, a stray glyph after `Total`, Thai words spaced apart.

/** Lines as Vision returns them: one word per space-separated token, a row per line. */
function words(lines: readonly string[]): OcrWord[] {
  return lines.flatMap((line, row) => line.split(" ").map((text, column) => ({
    text, left: column * 50, right: column * 50 + 40, top: row * 30, bottom: row * 30 + 20
  })));
}

const OWNER_BLOCK = ["Invented Name", "0000000000", "9/9 Invented Road , Invented District", "Hang / place at given spot .", "Invented note to rider"];

const FIRST = [
  "14:40 4G 53", "< Order details Contact us",
  "Order No. LMF - 260912-000000001",
  "ร้าน ทดสอบ - สาขา ทดสอบ >",
  "12 SEP 26 21:00",
  "Delivery", ...OWNER_BLOCK, "Menu", "ข้าว", "Reorder"
];

const SECOND = (tail: readonly string[]) => [
  "14:40 4G 53", "< Order details Contact us",
  ...OWNER_BLOCK.slice(2), "Menu",
  "1 ข้าว ผัด ทดสอบ $ 120.00", "ไข่ ดาว ( 1 ) , เผ็ด น้อย",
  "ก๋วยเตี๋ยว ทดสอบ $ 60.00",
  ...tail, "Reorder"
];

const TAIL = [
  "Food $ 180.00", "Delivery fee $ 20.00",
  "VIP ) LINE MAN VIP Delivery Discount - ฿ 15.00", "# Coupon - $ 40.00",
  "Pay with mobile banking $ 145.00", "Total ? B145.00",
  "Payment Method SCB EASY"
];

const page = (lines: readonly string[]): LinemanPage => {
  const read = readLinemanPage(words(lines));
  if (!read.ok) throw new Error(read.message);
  return read.value;
};

describe("readLinemanOrder", () => {
  test("reads the order across two screenshots, and never the owner's block", () => {
    const read = readLinemanOrder([page(FIRST), page(SECOND(TAIL))]);
    expect(read).toEqual({
      ok: true,
      value: {
        platform: "lineman", bookingId: "LMF-260912-000000001", restaurant: "ร้านทดสอบ - สาขาทดสอบ",
        orderedAt: "2026-09-12T21:00:00+07:00", paymentMethod: "Pay with mobile banking",
        items: [
          { position: 1, quantity: 1, name: "ข้าวผัดทดสอบ", options: ["ไข่ดาว (1), เผ็ดน้อย"], amountMinor: "12000" },
          { position: 2, quantity: 1, name: "ก๋วยเตี๋ยวทดสอบ", options: [], amountMinor: "6000" }
        ],
        foodMinor: "18000", deliveryFeeMinor: "2000",
        adjustments: [
          { position: 1, kind: "discount", name: "VIP) LINE MAN VIP Delivery Discount", amountMinor: "1500" },
          { position: 2, kind: "discount", name: "# Coupon", amountMinor: "4000" }
        ],
        totalMinor: "14500", chargedMinor: "14500"
      }
    });
    const text = JSON.stringify(read);
    for (const secret of ["Invented Name", "0000000000", "Invented Road", "Invented note"]) expect(text).not.toContain(secret);
  });

  test("a split payment keeps the total and charges only the Pay line", () => {
    const read = readLinemanOrder([page(FIRST), page(SECOND([
      "Food $ 180.00", "Delivery fee $ 30.00", "VIP LINE MAN VIP Delivery Discount - $ 15.00",
      "Pay delivery fee with mobile banking $ 15.00", "Total @ $ 195.00"
    ]))]);
    expect(read.ok && [read.value.totalMinor, read.value.chargedMinor, read.value.paymentMethod])
      .toEqual(["19500", "1500", "Pay delivery fee with mobile banking"]);
  });

  test("refuses when the dishes do not sum to Food", () => {
    const read = readLinemanOrder([page(FIRST), page(SECOND(["Food $ 181.00", ...TAIL.slice(1)]))]);
    expect(read).toMatchObject({ ok: false, code: "ITEMS_MISMATCH" });
  });

  test("refuses when food, fee and discounts do not make the total", () => {
    const read = readLinemanOrder([page(FIRST), page(SECOND(TAIL.map((line) => line.replace("B145.00", "B146.00").replace("$ 145.00", "$ 146.00"))))]);
    expect(read).toMatchObject({ ok: false, code: "TOTAL_MISMATCH" });
  });

  test("refuses screenshots picked bottom first, or without the order's top", () => {
    expect(readLinemanOrder([page(SECOND(TAIL)), page(FIRST)])).toMatchObject({ ok: false, code: "NEEDS_MORE" });
    expect(readLinemanOrder([page(SECOND(TAIL))])).toMatchObject({ ok: false, code: "NEEDS_MORE" });
  });

  test("refuses screenshots that do not overlap", () => {
    const other = SECOND(TAIL).map((line) => (OWNER_BLOCK.includes(line) ? `Other ${line}` : line));
    expect(readLinemanOrder([page(FIRST), page(other)])).toMatchObject({ ok: false, code: "NO_OVERLAP" });
  });

  test("refuses a second order's first screenshot in the same pick", () => {
    expect(readLinemanOrder([page(FIRST), page(FIRST)])).toMatchObject({ ok: false, code: "TWO_ORDERS" });
  });

  test("refuses a first screenshot's dishes that the second prices differently", () => {
    const first = page([...FIRST.slice(0, -2), "1 ข้าว ผัด ทดสอบ $ 125.00", "ไข่ ดาว", "Reorder"]);
    expect(readLinemanOrder([first, page(SECOND(TAIL))])).toMatchObject({ ok: false, code: "NO_OVERLAP" });
  });

  test("refuses an order number whose date is not the printed date", () => {
    expect(readLinemanPage(words(FIRST.map((line) => line.replace("260912", "260911"))))).toMatchObject({ ok: false, code: "MALFORMED_LINE" });
  });

  test("refuses an image that is not an order page", () => {
    expect(readLinemanPage(words(["Invented other app", "Menu"]))).toMatchObject({ ok: false, code: "NOT_AN_ORDER" });
  });
});
