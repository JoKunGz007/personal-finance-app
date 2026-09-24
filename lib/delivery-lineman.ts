// Reading a LINE MAN order from its in-app order-page screenshots (PLAN task 58 part 4,
// `docs/DELIVERY_CONTRACT.md` § LINE MAN).
//
// **Pure: Vision's words in, an order out.** The image is read by the existing
// `POST /api/v1/ocr/read` route; nothing here knows an engine, as `lib/receipt-screenshot.ts` does
// for 7-Eleven.
//
// ## The layout, measured 2026-09-24 over 7 real orders, 2 screenshots each (D-223)
//
// Screenshot 1: `Order No. LMF-YYMMDD-N…`, the restaurant (one or two lines), the **order time**
// (`12 SEP 26 21:00`), then the status, the tip box, the owner's name, phone, both addresses and
// the note to the rider, then `Menu`. Screenshot 2 opens part-way through that block, then `Menu`,
// the dishes (`[qty] name ฿ price`, then priceless option lines), `Food`, `Delivery fee`, each
// discount (`name - ฿ n`), a `Pay … with …` line (what was charged, and how), `Total`, and the
// payment method.
//
// **What is never read**: everything between the order time and `Menu` — the owner's name, phone,
// addresses and note. `LinemanPage.aboveMenu` holds the last of those lines only so the stitch can
// check that two screenshots overlap; it never reaches the parsed order.
//
// Vision's measured quirks, each handled here: the baht sign reads `$`, `฿` or `B`; a quantity `1`
// is sometimes dropped; `Total` can carry a stray glyph (`Total ? $ 203.00`); Thai words come back
// spaced apart.
//
// ## Split payment
//
// Two of the seven orders paid the food with เป๋าตัง (the co-payment scheme) and only the delivery
// fee by mobile banking or LINE Pay: `Pay delivery fee with mobile banking ฿ 16.00` under a ฿205
// total. The `Pay …` amount is what reached a bank or wallet, so it is the order's **charged**
// amount and the one matched to the ledger (the owner's decision, D-223); the rest was paid outside
// LINE MAN.

import { minor, parseThb, type MinorUnitString } from "@/lib/money";
import { groupIntoLines, type OcrWord } from "@/lib/slip-ocr";
import type { DeliveryAdjustment, DeliveryItem } from "@/lib/delivery-grab";

export type LinemanRefusal = "NOT_AN_ORDER" | "NEEDS_MORE" | "NO_OVERLAP" | "TWO_ORDERS" | "MALFORMED_LINE" | "ITEMS_MISMATCH" | "TOTAL_MISMATCH";

export type LinemanRead<T> = { ok: true; value: T } | { ok: false; code: LinemanRefusal; message: string };

export type LinemanPage = {
  orderNumber: string | null;
  restaurant: string | null;
  /** The order time as printed, as Bangkok ISO; only on the first screenshot. */
  orderedAt: string | null;
  /** The lines just above `Menu`, compared for overlap and never returned (see the header). */
  aboveMenu: string[];
  /** Everything from `Menu` down to `Reorder`, normalised. */
  body: string[];
};

export type ParsedLinemanOrder = {
  readonly platform: "lineman";
  readonly bookingId: string;
  readonly restaurant: string;
  /** When the order was placed (ISO, +07:00), as the order page prints it. */
  readonly orderedAt: string;
  /** The `Pay … with …` line's wording without its amount: "Pay with mobile banking". */
  readonly paymentMethod: string;
  readonly items: readonly DeliveryItem[];
  readonly foodMinor: MinorUnitString;
  readonly deliveryFeeMinor: MinorUnitString | null;
  readonly adjustments: readonly DeliveryAdjustment[];
  readonly totalMinor: MinorUnitString;
  /** What was charged to a bank or wallet; less than the total when the food was paid outside. */
  readonly chargedMinor: MinorUnitString;
};

const THAI = "฀-๿";
const MONTHS: Record<string, number> = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12
};

/** One OCR line as printed: Thai words rejoined, punctuation tightened, spaces collapsed. */
export function linemanLine(words: readonly OcrWord[]): string {
  return words.map((word) => word.text).join(" ")
    .replace(new RegExp(`([${THAI}])\\s+(?=[${THAI}])`, "gu"), "$1")
    .replace(/\s+([,.)\]])/gu, "$1")
    .replace(/([([])\s+/gu, "$1")
    .replace(/\s+/gu, " ")
    .trim();
}

const ORDER_NUMBER = /^Order No\.?\s*([A-Z]{2,4})\s*-\s*(\d{6})\s*-\s*(\d{6,})$/u;
const ORDER_TIME = /^(\d{1,2}) ([A-Z]{3}) (\d{2}) (\d{2}):(\d{2})$/u;
const MENU = /^Menu$/u;
const REORDER = /^Reorder$/u;
// An amount at the end of a line: the baht sign, however Vision read it, then `n.nn`.
const TRAILING_AMOUNT = /(-\s*)?(?:[$฿B]\s*)?([\d,]+\.\d{2})$/u;

function orderTime(match: RegExpExecArray): string | null {
  const month = MONTHS[match[2]!];
  const day = Number(match[1]), year = 2000 + Number(match[3]), hour = Number(match[4]), minute = Number(match[5]);
  if (!month || hour > 23 || minute > 59) return null;
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:00+07:00`;
}

/** One screenshot's order header (first screenshot only) and menu region, or why it is not one. */
export function readLinemanPage(words: readonly OcrWord[]): LinemanRead<LinemanPage> {
  const lines = groupIntoLines(words).map(linemanLine).filter((line) => line !== "");
  if (!lines.some((line) => /^<?\s*Order details\b/u.test(line))) {
    return { ok: false, code: "NOT_AN_ORDER", message: "This image is not a LINE MAN order page this app can read." };
  }
  const menuAt = lines.findIndex((line) => MENU.test(line));
  if (menuAt < 0) {
    return { ok: false, code: "NEEDS_MORE", message: "This screenshot does not show the order's Menu heading. Scroll so it is in view." };
  }
  let orderNumber: string | null = null;
  let orderedAt: string | null = null;
  let restaurant: string | null = null;
  const numberAt = lines.findIndex((line, index) => index < menuAt && ORDER_NUMBER.test(line));
  if (numberAt >= 0) {
    const number = ORDER_NUMBER.exec(lines[numberAt]!)!;
    orderNumber = `${number[1]}-${number[2]}-${number[3]}`;
    const timeAt = lines.findIndex((line, index) => index > numberAt && index < menuAt && ORDER_TIME.test(line));
    if (timeAt < 0) return { ok: false, code: "NOT_AN_ORDER", message: "The first screenshot shows no order time." };
    orderedAt = orderTime(ORDER_TIME.exec(lines[timeAt]!)!);
    if (!orderedAt) return { ok: false, code: "MALFORMED_LINE", message: "The order time is not a date." };
    // The order number carries its own date, which must be the printed one.
    if (number[2] !== `${orderedAt.slice(2, 4)}${orderedAt.slice(5, 7)}${orderedAt.slice(8, 10)}`) {
      return { ok: false, code: "MALFORMED_LINE", message: "The order number's date is not the order date." };
    }
    restaurant = lines.slice(numberAt + 1, timeAt).join(" ").replace(/\s*>$/u, "").replace(/\s*\(?\s*\.\.\.\s*$/u, "").trim() || null;
    if (!restaurant) return { ok: false, code: "NOT_AN_ORDER", message: "The first screenshot shows no restaurant." };
  }
  const endAt = lines.findIndex((line, index) => index > menuAt && REORDER.test(line));
  return {
    ok: true,
    value: {
      orderNumber, restaurant, orderedAt,
      // The app's own title bar is on every screenshot, so it proves no overlap and is left out.
      aboveMenu: lines.slice(Math.max(0, menuAt - 2), menuAt).filter((line) => !/Order details/u.test(line)),
      body: lines.slice(menuAt + 1, endAt < 0 ? undefined : endAt)
    }
  };
}

const amountOf = (line: string) => TRAILING_AMOUNT.exec(line);
const priced = (body: readonly string[]) => body.map(amountOf).filter((match) => match !== null).map((match) => match[2]!);
const squash = (line: string) => line.replace(/\s+/gu, "");

/**
 * The screenshots of **one** order, in the order picked, read into an order — or refused.
 *
 * The join is made safe by rules rather than a key, because only the first screenshot carries the
 * order number: each later screenshot must repeat a line from just above `Menu` in the one before
 * it; the dishes a screenshot already showed must reappear, priced the same, in the next; and the
 * order's own sums must close. A later screenshot carrying an order number is a second order.
 */
export function readLinemanOrder(pages: readonly LinemanPage[]): LinemanRead<ParsedLinemanOrder> {
  const first = pages[0];
  if (!first || !first.orderNumber || !first.orderedAt || !first.restaurant) {
    return { ok: false, code: "NEEDS_MORE", message: "Pick the top of the order page first: the screenshot showing the order number and time." };
  }
  for (let index = 1; index < pages.length; index += 1) {
    const page = pages[index]!, previous = pages[index - 1]!;
    if (page.orderNumber !== null) {
      return { ok: false, code: "TWO_ORDERS", message: "These screenshots are from more than one order. Pick one order's screenshots at a time." };
    }
    const above = new Set(previous.aboveMenu.map(squash));
    if (!page.aboveMenu.some((line) => above.has(squash(line)))) {
      return { ok: false, code: "NO_OVERLAP", message: "These screenshots do not overlap, so they cannot be joined safely." };
    }
    // What the earlier screenshot already showed must reappear, priced the same. Its last line may
    // be cut off at the screen's edge, so only its complete priced lines count.
    const shown = priced(previous.body.slice(0, -1));
    const next = priced(page.body);
    if (shown.some((amount, at) => next[at] !== amount)) {
      return { ok: false, code: "NO_OVERLAP", message: "These screenshots show different dishes, so they cannot be joined safely." };
    }
  }
  const body = pages.at(-1)!.body;

  const foodAt = body.findIndex((line) => /^Food\b/u.test(line) && amountOf(line) !== null);
  const totalAt = body.findIndex((line) => /^Total\b/u.test(line) && amountOf(line) !== null);
  if (foodAt < 0 || totalAt < foodAt) {
    return { ok: false, code: "NEEDS_MORE", message: "Add the screenshot showing the Food line and the Total." };
  }

  // Dishes: a priced line, optionally led by its quantity, then priceless option lines.
  const items: { position: number; quantity: number; name: string; options: string[]; amountMinor: MinorUnitString }[] = [];
  for (const line of body.slice(0, foodAt)) {
    const amount = amountOf(line);
    if (amount) {
      if (amount[1]) return { ok: false, code: "MALFORMED_LINE", message: "A dish prints a negative price." };
      const text = line.slice(0, amount.index).trim();
      const quantity = /^(\d{1,2})\s+(?=\S)/u.exec(text);
      const name = (quantity ? text.slice(quantity[0].length) : text).trim();
      if (name === "") return { ok: false, code: "MALFORMED_LINE", message: "A dish has no name." };
      items.push({ position: items.length + 1, quantity: quantity ? Number(quantity[1]) : 1, name, options: [], amountMinor: parseThb(amount[2]!).minor });
    } else if (items.length > 0) {
      items.at(-1)!.options.push(line);
    } else {
      return { ok: false, code: "MALFORMED_LINE", message: "A line above the first dish is not a dish." };
    }
  }
  if (items.length === 0) return { ok: false, code: "NEEDS_MORE", message: "No dish lines were found." };
  const foodMinor = parseThb(amountOf(body[foodAt]!)![2]!).minor;

  // Between Food and Total: the fee, each discount (printed with a minus) or charge, and the one
  // `Pay … with …` line saying what was charged.
  let deliveryFeeMinor: MinorUnitString | null = null;
  let charged: { amount: MinorUnitString; method: string } | null = null;
  const adjustments: DeliveryAdjustment[] = [];
  for (const line of body.slice(foodAt + 1, totalAt)) {
    const amount = amountOf(line);
    if (!amount) continue;
    const text = line.slice(0, amount.index).trim();
    const value = parseThb(amount[2]!).minor;
    if (/^Pay\b/u.test(text)) {
      if (charged || amount[1]) return { ok: false, code: "MALFORMED_LINE", message: "The payment line is not the known shape." };
      charged = { amount: value, method: text };
    } else if (/^Delivery fee$/u.test(text) && !amount[1]) {
      if (deliveryFeeMinor !== null) return { ok: false, code: "MALFORMED_LINE", message: "Two delivery fee lines were found." };
      deliveryFeeMinor = value;
    } else if (text !== "") {
      adjustments.push({ position: adjustments.length + 1, kind: amount[1] ? "discount" : "charge", name: text, amountMinor: value });
    } else {
      return { ok: false, code: "MALFORMED_LINE", message: "An amount has no label." };
    }
  }
  if (!charged) return { ok: false, code: "NEEDS_MORE", message: "No payment line was found." };
  const totalMinor = parseThb(amountOf(body[totalAt]!)![2]!).minor;

  const itemSum = items.reduce((sum, item) => sum + BigInt(item.amountMinor), 0n);
  if (itemSum !== BigInt(foodMinor)) return { ok: false, code: "ITEMS_MISMATCH", message: "The dishes do not add up to the Food line." };
  const net = adjustments.reduce((sum, row) => sum + (row.kind === "charge" ? 1n : -1n) * BigInt(row.amountMinor), 0n);
  if (BigInt(foodMinor) + BigInt(deliveryFeeMinor ?? "0") + net !== BigInt(totalMinor)) {
    return { ok: false, code: "TOTAL_MISMATCH", message: "Food plus delivery minus discounts does not equal the total." };
  }
  if (BigInt(charged.amount) > BigInt(totalMinor)) {
    return { ok: false, code: "TOTAL_MISMATCH", message: "More was charged than the order's total." };
  }

  return {
    ok: true,
    value: {
      platform: "lineman", bookingId: first.orderNumber, restaurant: first.restaurant, orderedAt: first.orderedAt,
      paymentMethod: charged.method, items, foodMinor, deliveryFeeMinor, adjustments,
      totalMinor: minor(totalMinor), chargedMinor: charged.amount
    }
  };
}
