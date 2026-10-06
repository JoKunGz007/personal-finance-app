// Reading a GrabFood e-receipt email into an order (PLAN task 58 part 1, `docs/DELIVERY_CONTRACT.md`).
//
// **Pure functions over already-decoded HTML**, so every rule is testable without a mailbox — the
// same split `lib/receipt-text.ts` makes against its PDF extraction. The IMAP half is
// `lib/server/delivery-mailbox.ts`.
//
// **A receipt is recognised by its content, never by its sender** (the owner's decision, D-218): a
// forwarded copy still comes from Grab, but a backfilled one arrives inside a bundle from the
// owner's own address, and a hand-forward can come from anywhere. So the body decides: the food
// template is headed `ทานอาหารให้อร่อย!` and names GrabFood; the ride template is headed
// "E-Receipt/Abbreviated Tax Invoice". Rides have their own reader, `parseGrabRide`, at the end.
//
// **Only what the order needs is read.** The destination label, the name on the receipt and every
// rider detail are never looked up, so nothing downstream can store them (the contract's "What is
// never stored"). The email's date line is when the email was sent, not when the order was
// placed, and is named for that.
//
// **Fail closed on arithmetic.** Items must sum to the food line, and food plus delivery plus each
// charge minus each discount must equal the total, which must also equal the total printed at the
// top. Every sign is read as printed; the sums are what confirm the reading.

import { minor, parseThb, type MinorUnitString } from "@/lib/money";

export type GrabKind = "food" | "ride" | "other" | "mart" | "express" | "dine_out" | "late";

export type DeliveryRefusal =
  | "MISSING_FIELD"
  | "MALFORMED_LINE"
  | "UNKNOWN_CHARGE"
  | "ITEMS_MISMATCH"
  | "TOTAL_MISMATCH";

export type DeliveryRead<T> =
  | { ok: true; value: T }
  | { ok: false; code: DeliveryRefusal; message: string };

export type DeliveryItem = {
  readonly position: number;
  readonly quantity: number;
  readonly name: string;
  /** The indented lines under a dish that carry no price: choices, add-ons, spice level. */
  readonly options: readonly string[];
  readonly amountMinor: MinorUnitString;
};

/**
 * A line between the delivery fee and the total. A discount prints with a minus sign; a charge (a
 * small-order fee, say) prints without one — measured on 2 of 114 real receipts, where only reading
 * it as a charge made the sums close. `unprinted` is the reader's own line for a deduction the
 * e-receipt does not print (a GrabCoins redemption), sized to the gap. The amount is always
 * positive; `kind` carries the sign.
 */
export const ADJUSTMENT_KINDS = ["discount", "charge", "unprinted"] as const;
export const UNPRINTED_NAME = "Not on the e-receipt";

export type DeliveryAdjustment = {
  readonly position: number;
  readonly kind: (typeof ADJUSTMENT_KINDS)[number];
  /** A readable name or a promo code, as printed. Never interpreted — no split is inferred from it. */
  readonly name: string;
  readonly amountMinor: MinorUnitString;
};

export type ParsedDelivery = {
  readonly platform: "grabfood";
  /** Which Grab service the order came from; absent means food (migration 049). */
  readonly service?: "food" | "mart" | "express" | "dine_out";
  readonly bookingId: string;
  readonly restaurant: string;
  readonly paymentMethod: string | null;
  /** When the email was sent (ISO, +07:00) — after delivery, not when the order was placed. */
  readonly receiptSentAt: string;
  readonly items: readonly DeliveryItem[];
  readonly foodMinor: MinorUnitString;
  /** Null when the receipt prints no delivery line at all (a pickup order). */
  readonly deliveryFeeMinor: MinorUnitString | null;
  readonly adjustments: readonly DeliveryAdjustment[];
  readonly totalMinor: MinorUnitString;
};

export const FOOD_HEADING = "ทานอาหารให้อร่อย";
export const RIDE_HEADING = "E-Receipt/Abbreviated Tax Invoice";
export const BOOKING_LABEL = "รหัสการจอง";
export const RESTAURANT_LABEL = "สถานที่เริ่มต้นการเดินทาง";
export const PAYMENT_LABEL = "รูปแบบการชำระเงิน";
export const FOOD_LABEL = "ค่าอาหาร";
export const DELIVERY_LABEL = "ค่าจัดส่ง";
export const TOTAL_LABEL = "รวม";

/** Every label this reader knows, for the value-free shape dump the measuring harness prints. */
export const KNOWN_LABELS = [
  FOOD_HEADING, RIDE_HEADING, BOOKING_LABEL, RESTAURANT_LABEL, PAYMENT_LABEL, FOOD_LABEL,
  DELIVERY_LABEL, TOTAL_LABEL, "GrabFood", "+0700"
] as const;

const BLOCK_TAGS = "p|div|tr|table|tbody|thead|tfoot|h[1-6]|li|ul|ol|section|article|header|footer|center|blockquote";
const NAMED_ENTITIES: Record<string, string> = {
  nbsp: " ", amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", times: "×", bull: "•",
  ndash: "–", mdash: "—", middot: "·", hellip: "…", zwnj: "", zwj: ""
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/giu, (whole, body: string) => {
    if (body[0] === "#") {
      const code = body[1] === "x" || body[1] === "X" ? Number.parseInt(body.slice(2), 16) : Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? whole;
  });
}

/**
 * Decoded HTML as trimmed, non-empty text lines.
 *
 * Block boundaries become line breaks and table cells become spaces, so a row printed as three
 * cells (`1x` · dish · price) reads as one line — which is what the item grammar expects. No DOM:
 * this runs on the server, and a regex tag-stripper is enough for reading text out of a mail
 * template that is never rendered.
 */
export function htmlToLines(html: string): string[] {
  const text = html
    .replace(/<!--[\s\S]*?-->/gu, "")
    .replace(/<(head|style|script|title)\b[\s\S]*?<\/\1\s*>/giu, "")
    .replace(/<br\b[^>]*>/giu, "\n")
    .replace(new RegExp(`<\\/?(?:${BLOCK_TAGS})\\b[^>]*>`, "giu"), "\n")
    .replace(/<\/t[dh]\s*>/giu, " ")
    .replace(/<[^>]*>/gu, "");
  return decodeEntities(text)
    .normalize("NFC")
    .replace(/[\u200b-\u200d\ufeff]/gu, "")
    .split(/\r?\n/u)
    .map((line) => line.replace(/[\s\u00a0]+/gu, " ").trim())
    .filter((line) => line !== "");
}

// Dine Out's discount heading is printed with U+0E4D U+0E32 (sara am split in two) in real mail;
// the composed U+0E33 spelling is accepted too.
const DINE_OUT_DISCOUNT = /ส่วนลดสำหรับทานที่ร้าน|ส่วนลดสําหรับทานที่ร้าน/u;
const LATE_APOLOGY = /We[\u2019']re sorry for the late delivery/u;

/**
 * Which Grab template a body is, by its content. Anything else is not a receipt this app reads.
 * Order matters: a late-delivery apology carries a GrabFood banner, and GrabExpress carries the
 * ride heading, so both are decided before food and ride.
 */
export function classifyGrabReceipt(lines: readonly string[]): GrabKind {
  if (lines.some((line) => LATE_APOLOGY.test(line))) return "late";
  if (lines.some((line) => line === "Your item has been delivered!" || line === "Item pickup location" || line.startsWith("GrabExpress ("))) return "express";
  // Dine Out prints no `GrabFood` line, so a food receipt with the same closing phrase stays food.
  if (lines.some((line) => line === "Hope you had a great meal!" || DINE_OUT_DISCOUNT.test(line)) && !lines.some((line) => line.includes("GrabFood"))) return "dine_out";
  if (lines.some((line, index) => line === "ขอบคุณที่ซื้อสินค้ากับเรา!" || (line.includes("สั่งซื้อด้วย") && (lines[index + 1] ?? "").includes("GrabMart")))) return "mart";
  const food = lines.some((line) => line.includes(FOOD_HEADING)) && lines.some((line) => line.includes("GrabFood"));
  if (food) return "food";
  if (lines.some((line) => line.includes(RIDE_HEADING))) return "ride";
  return "other";
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12
};
const SENT_AT = /\b(\d{1,2}) ([A-Za-z]{3,4}) (\d{2}|\d{4}),? (\d{1,2}):(\d{2}) \+0700\b/u;

/** The `dd Mon yy HH:MM +0700` line as an ISO timestamp in Bangkok time, or null. */
export function readSentAt(lines: readonly string[]): string | null {
  for (const line of lines) {
    const match = SENT_AT.exec(line);
    if (!match) continue;
    const [, day, monthName, yearText, hour, minute] = match;
    const month = MONTHS[monthName!.toLowerCase()];
    const year = yearText!.length === 2 ? 2000 + Number(yearText) : Number(yearText);
    const d = Number(day), h = Number(hour), m = Number(minute);
    if (!month || d < 1 || d > 31 || h > 23 || m > 59) continue;
    const check = new Date(Date.UTC(year, month - 1, d));
    if (check.getUTCMonth() !== month - 1) continue;
    const pad = (value: number) => String(value).padStart(2, "0");
    return `${year}-${pad(month)}-${pad(d)}T${pad(h)}:${pad(m)}:00+07:00`;
  }
  return null;
}

/** The value printed after a label: the rest of its line, or the next line when that is empty. */
function labelValue(lines: readonly string[], label: string): string | null {
  const index = lines.findIndex((line) => line.includes(label));
  if (index < 0) return null;
  const rest = lines[index]!.slice(lines[index]!.indexOf(label) + label.length).replace(/^[\s:：]+/u, "").trim();
  if (rest !== "") return rest;
  return lines[index + 1] ?? null;
}

// The e-receipt prints every label and every amount on a line of its own (measured 2026-09-23 over
// all 114 real food receipts): `ค่าอาหาร` on one line and `฿ 250` on the next, a dish as `1x`, then
// its name, then its price. So an amount-only line is read as the value of the line above it, and
// **only** an amount-only line is an amount — a discount's own name can carry a baht figure
// ("20% off, max ฿100"), and reading that as a charge would be exactly the silent misread the sums
// exist to catch.
// The sign may sit either side of the baht sign: food prints `- ฿ 50`, rides print `฿ -5`.
const AMOUNT_ONLY = /^(?:(-|−)\s*)?฿\s*(-|−)?\s*([\d,]+(?:\.\d{1,2})?)$/u;
const QUANTITY = /^(\d{1,3})\s*[x×X](?:\s+(.+))?$/u;

type Line = { readonly text: string; amount: { readonly negative: boolean; readonly minor: MinorUnitString } | null };

/** Lines with each amount-only line folded into the line above it. */
export function pairAmounts(lines: readonly string[]): DeliveryRead<Line[]> {
  const out: Line[] = [];
  for (const text of lines) {
    const match = AMOUNT_ONLY.exec(text);
    if (!match) {
      out.push({ text, amount: null });
      continue;
    }
    const previous = out.at(-1);
    if (!previous || previous.amount !== null) {
      return { ok: false, code: "MALFORMED_LINE", message: "An amount has no label above it." };
    }
    if (match[1] !== undefined && match[2] !== undefined) {
      return { ok: false, code: "MALFORMED_LINE", message: "An amount carries two minus signs." };
    }
    previous.amount = { negative: match[1] !== undefined || match[2] !== undefined, minor: parseThb(match[3]!).minor };
  }
  return { ok: true, value: out };
}

type RawItem = { position: number; quantity: number; name: string; options: string[]; amountMinor: MinorUnitString };

/**
 * Dishes before the subtotal row: a quantity line, the name (on the same line or the next), its
 * price on the line after, then priceless option lines until the next quantity line. Lines before
 * the first quantity line are header lines and are skipped.
 */
function readItems(rows: readonly Line[], foodAt: number): DeliveryRead<RawItem[]> {
  const items: RawItem[] = [];
  for (let index = 0; index < foodAt; index += 1) {
    const row = rows[index]!;
    const match = QUANTITY.exec(row.text);
    if (match) {
      const quantity = Number(match[1]);
      if (quantity < 1) return { ok: false, code: "MALFORMED_LINE", message: "A dish line has a zero quantity." };
      const namedAt = match[2] !== undefined ? index : index + 1;
      const named = rows[namedAt];
      if (!named || namedAt >= foodAt || named.amount === null || named.amount.negative || (named !== row && row.amount !== null)) {
        return { ok: false, code: "MALFORMED_LINE", message: "A dish has no name and price." };
      }
      items.push({ position: items.length + 1, quantity, name: match[2] ?? named.text, options: [], amountMinor: named.amount.minor });
      if (named !== row) index += 1;
    } else if (items.length > 0) {
      if (row.amount !== null) return { ok: false, code: "UNKNOWN_CHARGE", message: "A priced line among the dishes is not a dish." };
      items.at(-1)!.options.push(row.text);
    }
  }
  if (items.length === 0) return { ok: false, code: "MISSING_FIELD", message: "No dish lines were found." };
  return { ok: true, value: items };
}

/** Reads a food e-receipt's lines. Call only on lines `classifyGrabReceipt` called `food`. */
export function parseGrabFood(lines: readonly string[]): DeliveryRead<ParsedDelivery> {
  const bookingValue = labelValue(lines, BOOKING_LABEL);
  const bookingId = bookingValue?.split(" ")[0] ?? "";
  if (!/^[A-Za-z0-9][A-Za-z0-9-]{5,}$/u.test(bookingId)) {
    return { ok: false, code: "MISSING_FIELD", message: "No booking ID was found." };
  }
  const restaurant = labelValue(lines, RESTAURANT_LABEL);
  if (!restaurant) return { ok: false, code: "MISSING_FIELD", message: "No restaurant line was found." };
  const receiptSentAt = readSentAt(lines);
  if (!receiptSentAt) return { ok: false, code: "MISSING_FIELD", message: "No sent-at date line was found." };
  const paymentMethod = labelValue(lines, PAYMENT_LABEL);

  const paired = pairAmounts(lines);
  if (!paired.ok) return paired;
  const rows = paired.value;

  const foodAt = rows.findIndex((row) => row.text.startsWith(FOOD_LABEL) && row.amount !== null && !row.amount.negative);
  if (foodAt < 0) return { ok: false, code: "MISSING_FIELD", message: "No food subtotal line was found." };
  const foodMinor = rows[foodAt]!.amount!.minor;

  // The same total is printed at the top, under the heading. When it is there it must agree.
  const topTotal = rows.slice(0, foodAt).find((row) => row.text === TOTAL_LABEL && row.amount !== null)?.amount ?? null;

  const itemsRead = readItems(rows, foodAt);
  if (!itemsRead.ok) return itemsRead;
  const items = itemsRead.value;

  // The tail: delivery, then each discount (printed with a minus sign) or other named charge
  // (printed without one, as the delivery fee is), then the total. The sign is read as printed and
  // never inferred from a name; the sums below are what confirm the reading.
  let deliveryFeeMinor: MinorUnitString | null = null;
  let totalMinor: MinorUnitString | null = null;
  const adjustments: DeliveryAdjustment[] = [];
  for (let index = foodAt + 1; index < rows.length && totalMinor === null; index += 1) {
    const { text, amount } = rows[index]!;
    if (amount === null) continue;
    if (text === TOTAL_LABEL && !amount.negative) {
      totalMinor = amount.minor;
    } else if (text.startsWith(DELIVERY_LABEL) && !amount.negative) {
      if (deliveryFeeMinor !== null) return { ok: false, code: "MALFORMED_LINE", message: "Two delivery fee lines were found." };
      deliveryFeeMinor = amount.minor;
    } else {
      adjustments.push({ position: adjustments.length + 1, kind: amount.negative ? "discount" : "charge", name: text, amountMinor: amount.minor });
    }
  }
  if (totalMinor === null) return { ok: false, code: "MISSING_FIELD", message: "No total line was found." };
  if (topTotal !== null && (topTotal.negative || topTotal.minor !== totalMinor)) {
    return { ok: false, code: "TOTAL_MISMATCH", message: "The total at the top does not equal the total at the bottom." };
  }

  const itemSum = items.reduce((sum, item) => sum + BigInt(item.amountMinor), 0n);
  if (itemSum !== BigInt(foodMinor)) {
    return { ok: false, code: "ITEMS_MISMATCH", message: "The dishes do not add up to the food subtotal." };
  }
  const net = adjustments.reduce((sum, row) => sum + (row.kind === "charge" ? 1n : -1n) * BigInt(row.amountMinor), 0n);
  const gap = BigInt(foodMinor) + BigInt(deliveryFeeMinor ?? "0") + net - BigInt(totalMinor);
  // **More taken off than printed is an `unprinted` line, not a refusal** (the owner's call, D-219).
  // A GrabCoins redemption is on the app's order page and never on the e-receipt, so its order
  // cannot otherwise close. Only a positive gap, and only when the total is printed twice and both
  // agree: the total is then the email's own figure, and only the breakdown carries an unknown,
  // stored under its own kind rather than dressed as a named discount. A total *higher* than the
  // lines is still refused — nothing unprinted adds to a bill.
  if (gap > 0n && topTotal !== null) {
    adjustments.push({ position: adjustments.length + 1, kind: "unprinted", name: UNPRINTED_NAME, amountMinor: minor(gap.toString()) });
  } else if (gap !== 0n) {
    return { ok: false, code: "TOTAL_MISMATCH", message: "Food plus delivery plus charges minus discounts does not equal the total." };
  }

  return {
    ok: true,
    value: {
      platform: "grabfood", bookingId, restaurant, paymentMethod: paymentMethod || null, receiptSentAt,
      items, foodMinor, deliveryFeeMinor, adjustments, totalMinor: minor(totalMinor)
    }
  };
}

/**
 * One line with every value masked, for the measuring harness: known labels survive, digits
 * become `9`, Thai runs `ก`, Latin runs `a`. The shape of a real receipt is reportable; its dishes,
 * amounts, booking ID and restaurant are not (`docs/FIXTURE_POLICY.md`).
 */
export function lineShape(line: string): string {
  // Each label is parked on a private-use character, which none of the masks below touch.
  let masked = line;
  KNOWN_LABELS.forEach((label, index) => {
    masked = masked.split(label).join(String.fromCharCode(0xe000 + index));
  });
  masked = masked
    .replace(/\d/gu, "9")
    // Thai script only: the baht sign is Script=Common, so it survives as a shape.
    .replace(/\p{Script=Thai}+/gu, "ก")
    .replace(/[A-Za-z]+/gu, (word) => (word === "x" || word === "X" ? word : "a"));
  return masked.replace(/\p{Co}/gu, (mark) => KNOWN_LABELS[mark.charCodeAt(0) - 0xe000]!);
}

// ---------------------------------------------------------------------------------------------
// Rides (PLAN task 58 part 5, D-222)
//
// The ride template, measured 2026-09-24 over all 276 real ride receipts by the owner-run harness
// (`scripts/measure-grab-mail.ts --rides-detail`), counts and labels only:
//
//   E-Receipt/Abbreviated Tax Invoice · the ride type · … · `Picked up on D Month YYYY` (no time,
//   and unlike food no `+0700` line) · `Booking ID: A-…` · `Total Paid` · `฿ N` · the rating ·
//   `Compliments for driver` · the driver's name · … · `Breakdown` · label / amount pairs ·
//   `Total Paid` · `฿ N` · `Passenger` · the passenger's name · `Profile` · `PERSONAL` · `Paid by` ·
//   the card's last four · `฿ N` · optional marketing · `Got an issue…` · `Your Trip` ·
//   `X.XX km • N mins` · eight `⋮` · pickup place · pickup time · drop-off place · drop-off time ·
//   `Grab Thailand`.
//
// **Read by label, never by position**, and never near a name: the rating, the driver's name, the
// passenger's name and any plate sit between labels this reader skips over, so nothing downstream
// can store them. The pickup and drop-off places and times *are* read — the owner reversed D-218's
// never-store rule for ride places only (D-222).
//
// Breakdown labels seen: Fare, Platform Fee, and optionally Promo, GrabCoins and Toll. The platform
// fee prints `฿ N*` (a VAT asterisk), and in 2 rides a GrabCoins amount prints as a bare `-99` with
// no baht sign; both are accepted, the second only straight after a GrabCoins label. The sums close
// in all 276: fare + fee + charges − discounts = the bottom total = the top total = the amount paid.
// ---------------------------------------------------------------------------------------------

export const RIDE_BOOKING_LABEL = "Booking ID";
export const RIDE_TOTAL_LABEL = "Total Paid";
export const RIDE_BREAKDOWN_LABEL = "Breakdown";
export const RIDE_FARE_LABEL = "Fare";
export const RIDE_FEE_LABEL = "Platform Fee";
export const RIDE_PAID_BY_LABEL = "Paid by";
export const RIDE_TRIP_LABEL = "Your Trip";
export const RIDE_FOOTER = "Grab Thailand";
const RIDE_COINS_LABEL = "GrabCoins";

export type RideAdjustment = {
  readonly position: number;
  /** A discount prints negative (Promo, GrabCoins); a charge positive (Toll). Amount always positive. */
  readonly kind: "discount" | "charge";
  readonly name: string;
  readonly amountMinor: MinorUnitString;
};

export type ParsedRide = {
  readonly platform: "grab";
  readonly bookingId: string;
  /** As printed: "Saver Bike", "JustGrab", "GrabCar (Airport)". */
  readonly rideType: string;
  /** Pickup date plus pickup time, Bangkok (ISO, +07:00). */
  readonly pickedUpAt: string;
  /** The pickup date plus the drop-off time, a day later when that time is earlier than pickup's. The match keys on the pickup (migration 035). */
  readonly droppedOffAt: string;
  readonly pickupPlace: string;
  readonly dropoffPlace: string;
  readonly distanceMeters: number;
  readonly durationMinutes: number;
  /** The line under "Paid by", as printed (the card's last four). */
  readonly paymentMethod: string;
  readonly fareMinor: MinorUnitString;
  readonly platformFeeMinor: MinorUnitString;
  readonly adjustments: readonly RideAdjustment[];
  readonly totalMinor: MinorUnitString;
};

const FULL_MONTHS = [
  "january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"
];
const PICKED_UP_ON = /^Picked up on (\d{1,2}) ([A-Za-z]+) (\d{4})$/u;
const CLOCK = /^(\d{1,2}):(\d{2})\s?([AP]M)$/iu;
const RIDE_AMOUNT = /^(-|−)?\s*฿\s*(-|−)?\s*([\d,]+(?:\.\d{1,2})?)\*?$/u;
const BARE_NEGATIVE = /^(?:-|−)\s*([\d,]+(?:\.\d{1,2})?)$/u;
const DISTANCE_DURATION = /^(\d+(?:\.\d{1,3})?) km • (.+)$/u;
const DURATION = /^(?:(\d+) hours?)?\s*(?:(\d+) mins?)?$/u;
// Grab's product name, Latin text (10 values over 276 real rides: "GrabBike Saver", "Standard I Car
// only", "GrabCar Priority (BETA)", "Standard | Van"). A narrower class refused the `|`, so the line
// is held to its shape instead: Latin-led, short, and no Thai, baht sign or sentence punctuation — so
// a greeting that moved under the heading is refused rather than stored as the ride type.
const RIDE_TYPE = /^[A-Za-z][^\p{Script=Thai}฿!?.:]{1,39}$/u;

type RideAmount = { readonly negative: boolean; readonly minor: MinorUnitString };

function rideAmount(line: string | undefined): RideAmount | null {
  const match = line === undefined ? null : RIDE_AMOUNT.exec(line);
  if (!match || (match[1] !== undefined && match[2] !== undefined)) return null;
  return { negative: match[1] !== undefined || match[2] !== undefined, minor: parseThb(match[3]!).minor };
}

/** `8:05PM` as minutes after midnight, or null. */
function clockMinutes(line: string): number | null {
  const match = CLOCK.exec(line);
  if (!match) return null;
  const hour = Number(match[1]), minute = Number(match[2]);
  if (hour < 1 || hour > 12 || minute > 59) return null;
  return ((hour % 12) + (match[3]!.toUpperCase() === "PM" ? 12 : 0)) * 60 + minute;
}

function bangkokIso(year: number, month: number, day: number, minutes: number): string {
  const at = new Date(Date.UTC(year, month - 1, day) + minutes * 60_000);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${at.getUTCFullYear()}-${pad(at.getUTCMonth() + 1)}-${pad(at.getUTCDate())}T${pad(at.getUTCHours())}:${pad(at.getUTCMinutes())}:00+07:00`;
}

/** "3.45" km as 3450 metres, from the digits rather than a float. */
function metres(km: string): number {
  const [whole, fraction = ""] = km.split(".");
  return Number(whole) * 1000 + Number((fraction + "000").slice(0, 3));
}

const refuse = (code: DeliveryRefusal, message: string) => ({ ok: false as const, code, message });

/** Reads a ride e-receipt's lines. Call only on lines `classifyGrabReceipt` called `ride`. */
export function parseGrabRide(lines: readonly string[]): DeliveryRead<ParsedRide> {
  const headingAt = lines.findIndex((line) => line.includes(RIDE_HEADING));
  if (headingAt < 0) return refuse("MISSING_FIELD", "No ride heading was found.");
  const rideType = lines[headingAt + 1] ?? "";
  if (!RIDE_TYPE.test(rideType)) return refuse("MISSING_FIELD", "No ride type line was found.");

  // The date: `Picked up on D Month YYYY`, the full English month name, and no time.
  let date: { year: number; month: number; day: number } | null = null;
  for (const line of lines) {
    const match = PICKED_UP_ON.exec(line);
    if (!match) continue;
    const month = FULL_MONTHS.indexOf(match[2]!.toLowerCase()) + 1;
    const year = Number(match[3]), day = Number(match[1]);
    const check = new Date(Date.UTC(year, month - 1, day));
    if (month === 0 || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
      return refuse("MALFORMED_LINE", "The pickup date is not a date.");
    }
    date = { year, month, day };
    break;
  }
  if (!date) return refuse("MISSING_FIELD", "No pickup date line was found.");

  const bookingId = labelValue(lines, `${RIDE_BOOKING_LABEL}:`)?.split(" ")[0] ?? "";
  if (!/^[A-Za-z0-9][A-Za-z0-9-]{5,}$/u.test(bookingId)) return refuse("MISSING_FIELD", "No booking ID was found.");

  // The top total: the first `Total Paid`, before the breakdown.
  const breakdownAt = lines.indexOf(RIDE_BREAKDOWN_LABEL);
  if (breakdownAt < 0) return refuse("MISSING_FIELD", "No breakdown was found.");
  const topAt = lines.indexOf(RIDE_TOTAL_LABEL);
  const topTotal = topAt >= 0 && topAt < breakdownAt ? rideAmount(lines[topAt + 1]) : null;
  if (!topTotal || topTotal.negative) return refuse("MISSING_FIELD", "No total was found at the top.");

  // The breakdown: label / amount pairs until the second `Total Paid`.
  const bottomAt = lines.findIndex((line, index) => index > breakdownAt && line === RIDE_TOTAL_LABEL);
  const bottomTotal = bottomAt < 0 ? null : rideAmount(lines[bottomAt + 1]);
  if (!bottomTotal || bottomTotal.negative) return refuse("MISSING_FIELD", "The breakdown has no total.");
  const pairs = lines.slice(breakdownAt + 1, bottomAt);
  if (pairs.length % 2 !== 0) return refuse("MALFORMED_LINE", "A breakdown line has no amount.");
  let fare: MinorUnitString | null = null;
  let fee: MinorUnitString | null = null;
  const adjustments: RideAdjustment[] = [];
  for (let index = 0; index < pairs.length; index += 2) {
    const label = pairs[index]!;
    if (rideAmount(label) !== null) return refuse("MALFORMED_LINE", "A breakdown amount has no label.");
    let amount = rideAmount(pairs[index + 1]);
    // A GrabCoins redemption can print as a bare `-99`, with no baht sign — only after that label.
    if (!amount && label.includes(RIDE_COINS_LABEL)) {
      const bare = BARE_NEGATIVE.exec(pairs[index + 1]!);
      if (bare) amount = { negative: true, minor: parseThb(bare[1]!).minor };
    }
    if (!amount) return refuse("MALFORMED_LINE", "A breakdown line has no amount.");
    if (label === RIDE_FARE_LABEL || label === RIDE_FEE_LABEL) {
      if (amount.negative) return refuse("MALFORMED_LINE", "A fare or fee prints negative.");
      if ((label === RIDE_FARE_LABEL ? fare : fee) !== null) return refuse("MALFORMED_LINE", "A fare or fee line is printed twice.");
      if (label === RIDE_FARE_LABEL) fare = amount.minor;
      else fee = amount.minor;
    } else {
      if (BigInt(amount.minor) === 0n) return refuse("MALFORMED_LINE", "A breakdown line is zero.");
      adjustments.push({ position: adjustments.length + 1, kind: amount.negative ? "discount" : "charge", name: label, amountMinor: amount.minor });
    }
  }
  if (fare === null) return refuse("MISSING_FIELD", "No fare line was found.");
  if (fee === null) return refuse("MISSING_FIELD", "No platform fee line was found.");

  const totalMinor = bottomTotal.minor;
  if (topTotal.minor !== totalMinor) return refuse("TOTAL_MISMATCH", "The total at the top does not equal the total at the bottom.");
  const net = adjustments.reduce((sum, row) => sum + (row.kind === "charge" ? 1n : -1n) * BigInt(row.amountMinor), 0n);
  if (BigInt(fare) + BigInt(fee) + net !== BigInt(totalMinor)) {
    return refuse("TOTAL_MISMATCH", "Fare plus fee plus charges minus discounts does not equal the total.");
  }

  // Payment: `Paid by`, the method as printed, then the amount paid, which must be the total.
  const paidAt = lines.findIndex((line, index) => index > bottomAt && line === RIDE_PAID_BY_LABEL);
  const paymentMethod = paidAt >= 0 ? lines[paidAt + 1] ?? "" : "";
  if (paymentMethod === "" || rideAmount(paymentMethod) !== null) return refuse("MISSING_FIELD", "No payment method was found.");
  const paid = rideAmount(lines[paidAt + 2]);
  if (!paid || paid.negative || paid.minor !== totalMinor) return refuse("TOTAL_MISMATCH", "The amount paid does not equal the total.");

  // The trip: distance and duration, then pickup place, pickup time, drop-off place, drop-off time.
  const tripAt = lines.findIndex((line, index) => index > paidAt && line === RIDE_TRIP_LABEL);
  const footerAt = tripAt < 0 ? -1 : lines.findIndex((line, index) => index > tripAt && line === RIDE_FOOTER);
  if (footerAt < 0) return refuse("MISSING_FIELD", "No trip section was found.");
  const measured = DISTANCE_DURATION.exec(lines[tripAt + 1] ?? "");
  const duration = measured ? DURATION.exec(measured[2]!) : null;
  if (!measured || !duration || (duration[1] === undefined && duration[2] === undefined)) {
    return refuse("MALFORMED_LINE", "The trip's distance and duration line is not the known shape.");
  }
  const stops = lines.slice(tripAt + 2, footerAt).filter((line) => line !== "⋮");
  if (stops.length !== 4) return refuse("MALFORMED_LINE", "The trip does not print one pickup and one drop-off.");
  const [pickupPlace, pickupClock, dropoffPlace, dropoffClock] = stops as [string, string, string, string];
  const pickupMinutes = clockMinutes(pickupClock);
  const dropoffMinutes = clockMinutes(dropoffClock);
  if (pickupMinutes === null || dropoffMinutes === null || clockMinutes(pickupPlace) !== null || clockMinutes(dropoffPlace) !== null) {
    return refuse("MALFORMED_LINE", "The trip does not print one pickup and one drop-off.");
  }
  const dropoffOffset = dropoffMinutes < pickupMinutes ? dropoffMinutes + 24 * 60 : dropoffMinutes;

  return {
    ok: true,
    value: {
      platform: "grab", bookingId, rideType,
      pickedUpAt: bangkokIso(date.year, date.month, date.day, pickupMinutes),
      droppedOffAt: bangkokIso(date.year, date.month, date.day, dropoffOffset),
      pickupPlace, dropoffPlace,
      distanceMeters: metres(measured[1]!),
      durationMinutes: Number(duration[1] ?? 0) * 60 + Number(duration[2] ?? 0),
      paymentMethod, fareMinor: fare, platformFeeMinor: fee, adjustments, totalMinor
    }
  };
}

// ---------------------------------------------------------------------------------------------
// GrabMart and Dine Out (D-247). Same pure-function shape as food; sibling parsers sharing the
// helpers above. Both fail closed on arithmetic exactly as food does, minus the `unprinted` rule.
// ---------------------------------------------------------------------------------------------

const MART_ORDER_LABEL = "รหัสคำสั่งซื้อ";
const MART_SHOP_LABEL = "สั่งซื้อจาก:";
const MART_PAYMENT_LABEL = "วิธีการชำระเงิน:";
const MART_SENT_LABEL = "จัดส่งเมื่อ";
const MART_TOTAL_LABEL = "ทั้งหมด";
const MART_SUBTOTAL_LABEL = "ราคาคำสั่งซื้อ";
const BOOKING_SHAPE = /^[A-Za-z0-9][A-Za-z0-9-]{5,}$/u;

/** Reads a GrabMart e-receipt's lines. Call only on lines `classifyGrabReceipt` called `mart`. */
export function parseGrabMart(lines: readonly string[]): DeliveryRead<ParsedDelivery> {
  const bookingId = labelValue(lines, MART_ORDER_LABEL)?.split(" ")[0] ?? "";
  if (!BOOKING_SHAPE.test(bookingId)) return refuse("MISSING_FIELD", "No booking ID was found.");
  const restaurant = labelValue(lines, MART_SHOP_LABEL);
  if (!restaurant) return refuse("MISSING_FIELD", "No shop line was found.");
  const receiptSentAt = readSentAt(lines);
  if (!receiptSentAt || !lines.some((line) => line.includes(MART_SENT_LABEL))) return refuse("MISSING_FIELD", "No delivered-at date line was found.");
  const paymentMethod = labelValue(lines, MART_PAYMENT_LABEL);

  const paired = pairAmounts(lines);
  if (!paired.ok) return paired;
  const rows = paired.value;
  const subtotalAt = rows.findIndex((row) => row.text.startsWith(MART_SUBTOTAL_LABEL) && row.amount !== null && !row.amount.negative);
  if (subtotalAt < 0) return refuse("MISSING_FIELD", "No order subtotal line was found.");
  const foodMinor = rows[subtotalAt]!.amount!.minor;
  const topTotal = rows.slice(0, subtotalAt).find((row) => row.text === MART_TOTAL_LABEL && row.amount !== null)?.amount ?? null;

  const itemsRead = readItems(rows, subtotalAt);
  if (!itemsRead.ok) return itemsRead;
  const items = itemsRead.value;

  let deliveryFeeMinor: MinorUnitString | null = null;
  let totalMinor: MinorUnitString | null = null;
  const adjustments: DeliveryAdjustment[] = [];
  for (let index = subtotalAt + 1; index < rows.length && totalMinor === null; index += 1) {
    const { text, amount } = rows[index]!;
    if (amount === null) continue;
    if (text === MART_TOTAL_LABEL && !amount.negative) {
      totalMinor = amount.minor;
    } else if (text.startsWith(DELIVERY_LABEL) && !amount.negative) {
      if (deliveryFeeMinor !== null) return refuse("MALFORMED_LINE", "Two delivery fee lines were found.");
      deliveryFeeMinor = amount.minor;
    } else {
      adjustments.push({ position: adjustments.length + 1, kind: amount.negative ? "discount" : "charge", name: text, amountMinor: amount.minor });
    }
  }
  if (totalMinor === null) return refuse("MISSING_FIELD", "No total line was found.");
  if (topTotal !== null && (topTotal.negative || topTotal.minor !== totalMinor)) {
    return refuse("TOTAL_MISMATCH", "The total at the top does not equal the total at the bottom.");
  }
  if (items.reduce((sum, item) => sum + BigInt(item.amountMinor), 0n) !== BigInt(foodMinor)) {
    return refuse("ITEMS_MISMATCH", "The items do not add up to the order subtotal.");
  }
  const net = adjustments.reduce((sum, row) => sum + (row.kind === "charge" ? 1n : -1n) * BigInt(row.amountMinor), 0n);
  if (BigInt(foodMinor) + BigInt(deliveryFeeMinor ?? "0") + net !== BigInt(totalMinor)) {
    return refuse("TOTAL_MISMATCH", "Subtotal plus delivery plus charges minus discounts does not equal the total.");
  }
  return {
    ok: true,
    value: {
      platform: "grabfood", service: "mart", bookingId, restaurant, paymentMethod: paymentMethod || null, receiptSentAt,
      items, foodMinor, deliveryFeeMinor, adjustments, totalMinor: minor(totalMinor)
    }
  };
}

const DINE_OUT_SHORT_LABEL = "รหัสคำสั่งซื้อแบบสั้น";
const DINE_OUT_SENT_LABEL = "วันที่ | เวลา";
const DINE_OUT_SHOP_LABELS = ["ร้านอาาหร:", "ร้านอาหาร:"] as const;
const DINE_OUT_TOTAL_LABEL = "Total";

/**
 * Reads a Dine Out (pay-at-the-restaurant) receipt's lines. Call only on lines `classifyGrabReceipt`
 * called `dine_out`. The receipt prints a short order ID that repeats over time, so the booking ID
 * is `<shortId>-<YYYY-MM-DD>` (Bangkok date of the receipt): an `@` joiner would break the
 * `booking_id` check `^[A-Za-z0-9][A-Za-z0-9-]{5,}$`, which a bare short ID like `A-B1C` also fails.
 */
export function parseGrabDineOut(lines: readonly string[]): DeliveryRead<ParsedDelivery> {
  const shortId = labelValue(lines, DINE_OUT_SHORT_LABEL)?.split(" ")[0] ?? "";
  if (!/^[A-Za-z0-9][A-Za-z0-9-]{2,}$/u.test(shortId)) return refuse("MISSING_FIELD", "No short order ID was found.");
  const restaurant = DINE_OUT_SHOP_LABELS.map((label) => labelValue(lines, label)).find((value) => value);
  if (!restaurant) return refuse("MISSING_FIELD", "No restaurant line was found.");
  if (!lines.some((line) => line.includes(DINE_OUT_SENT_LABEL))) return refuse("MISSING_FIELD", "No date line was found.");
  const receiptSentAt = readSentAt(lines);
  if (!receiptSentAt) return refuse("MISSING_FIELD", "No date line was found.");
  const paymentMethod = labelValue(lines, PAYMENT_LABEL);

  const paired = pairAmounts(lines);
  if (!paired.ok) return paired;
  const rows = paired.value;
  const foodAt = rows.findIndex((row) => row.text.startsWith(FOOD_LABEL) && row.amount !== null && !row.amount.negative);
  if (foodAt < 0) return refuse("MISSING_FIELD", "No food line was found.");
  const foodMinor = rows[foodAt]!.amount!.minor;
  const topTotal = rows.slice(0, foodAt).find((row) => row.text === TOTAL_LABEL && row.amount !== null)?.amount ?? null;
  if (topTotal === null || topTotal.negative) return refuse("MISSING_FIELD", "No total was found at the top.");

  let totalMinor: MinorUnitString | null = null;
  const adjustments: DeliveryAdjustment[] = [];
  for (let index = foodAt + 1; index < rows.length && totalMinor === null; index += 1) {
    const { text, amount } = rows[index]!;
    if (amount === null) continue;
    if (text === DINE_OUT_TOTAL_LABEL && !amount.negative) totalMinor = amount.minor;
    else if (amount.negative) adjustments.push({ position: adjustments.length + 1, kind: "discount", name: text, amountMinor: amount.minor });
    else return refuse("UNKNOWN_CHARGE", "A positive line between the food line and the total is not known.");
  }
  if (totalMinor === null) return refuse("MISSING_FIELD", "No total line was found.");
  if (topTotal.minor !== totalMinor) return refuse("TOTAL_MISMATCH", "The total at the top does not equal the total at the bottom.");
  const discounts = adjustments.reduce((sum, row) => sum + BigInt(row.amountMinor), 0n);
  if (BigInt(foodMinor) - discounts !== BigInt(totalMinor)) {
    return refuse("TOTAL_MISMATCH", "Food minus discounts does not equal the total.");
  }
  return {
    ok: true,
    value: {
      platform: "grabfood", service: "dine_out", bookingId: `${shortId}-${receiptSentAt.slice(0, 10)}`, restaurant,
      paymentMethod: paymentMethod || null, receiptSentAt, items: [], foodMinor, deliveryFeeMinor: null, adjustments,
      totalMinor: minor(totalMinor)
    }
  };
}

// ---------------------------------------------------------------------------------------------
// Forwarded-mail date, GrabExpress and late-delivery receipts (D-247 part 2). Pure, no sync wiring.
// ---------------------------------------------------------------------------------------------

const FORWARDED_DATE = /^Date:\s*[A-Za-z]{3,9},\s*([A-Za-z]{3,4})\s+(\d{1,2}),\s*(\d{4})\s+at\s+(\d{1,2}):(\d{2})[\s ]*([AP]M)$/iu;

/**
 * The original send time of a Gmail inline forward: the first `Date: Thu, Apr 9, 2026 at 9:41 PM`
 * line after a `Forwarded message` marker, as ISO +07:00. Gmail prints no zone, and the owner is in
 * Bangkok, so +07:00 is assumed. English Gmail only; null when there is no marker or no parsable line.
 */
export function readForwardedDate(lines: readonly string[]): string | null {
  const marker = lines.findIndex((line) => line.includes("Forwarded message"));
  if (marker < 0) return null;
  for (const line of lines.slice(marker + 1)) {
    const match = FORWARDED_DATE.exec(line.trim());
    if (!match) continue;
    const [, monthName, day, year, hour, minute, meridiem] = match;
    const month = MONTHS[monthName!.toLowerCase()];
    const d = Number(day), y = Number(year), h12 = Number(hour), m = Number(minute);
    if (!month || d < 1 || d > 31 || h12 < 1 || h12 > 12 || m > 59) continue;
    if (new Date(Date.UTC(y, month - 1, d)).getUTCMonth() !== month - 1) continue;
    const h = (h12 % 12) + (meridiem!.toUpperCase() === "PM" ? 12 : 0);
    const pad = (value: number) => String(value).padStart(2, "0");
    return `${y}-${pad(month)}-${pad(d)}T${pad(h)}:${pad(m)}:00+07:00`;
  }
  return null;
}

const PRINTED_DATE = /^(\d{1,2}) ([A-Za-z]{3,4}) (\d{2}|\d{4})$/u;
const EXPRESS_RESTAURANT = "GrabExpress";

/** The Bangkok calendar date (YYYY-MM-DD) of an ISO timestamp, or null when it does not parse. */
function bangkokDate(iso: string): string | null {
  const at = new Date(iso).getTime();
  return Number.isNaN(at) ? null : new Date(at + 7 * 3_600_000).toISOString().slice(0, 10);
}

/**
 * Reads a GrabExpress (parcel) receipt's lines. Call only on lines `classifyGrabReceipt` called
 * `express`. The two address lines are never read, so nothing can store them; the restaurant is the
 * fixed name `GrabExpress`. `Total VAT Item(s) Amount1` after the bottom total is VAT information,
 * not money, and the read stops at the bottom total.
 *
 * The receipt prints a date only. When the mail's own sent time falls on that Bangkok date it is
 * used; otherwise (a forward's own time is not the order's) the printed date at 12:00 +07:00.
 */
export function parseGrabExpress(lines: readonly string[], mailSentAt: string | null): DeliveryRead<ParsedDelivery> {
  const paired = pairAmounts(lines);
  if (!paired.ok) return paired;
  const rows = paired.value;
  const valueOf = (label: string): string | null => {
    const at = rows.findIndex((row) => row.text === label);
    return at < 0 ? null : (rows[at + 1]?.text ?? null);
  };

  const bookingId = valueOf("Booking code") ?? "";
  if (!BOOKING_SHAPE.test(bookingId)) return refuse("MISSING_FIELD", "No booking code was found.");
  const dateMatch = PRINTED_DATE.exec(valueOf("Date") ?? "");
  const month = dateMatch ? MONTHS[dateMatch[2]!.toLowerCase()] : undefined;
  if (!dateMatch || !month) return refuse("MISSING_FIELD", "No printed date was found.");
  const year = dateMatch[3]!.length === 2 ? 2000 + Number(dateMatch[3]) : Number(dateMatch[3]);
  const day = Number(dateMatch[1]);
  if (day < 1 || day > 31 || new Date(Date.UTC(year, month - 1, day)).getUTCMonth() !== month - 1) {
    return refuse("MISSING_FIELD", "No printed date was found.");
  }
  const pad = (value: number) => String(value).padStart(2, "0");
  const printedDate = `${year}-${pad(month)}-${pad(day)}`;
  const receiptSentAt = mailSentAt !== null && bangkokDate(mailSentAt) === printedDate ? mailSentAt : `${printedDate}T12:00:00+07:00`;

  const topTotal = rows.find((row) => row.text === "TOTAL" && row.amount !== null)?.amount ?? null;
  if (topTotal === null || topTotal.negative) return refuse("MISSING_FIELD", "No total was found at the top.");
  const summaryAt = rows.findIndex((row) => row.text === "Receipt Summary");
  if (summaryAt < 0) return refuse("MISSING_FIELD", "No receipt summary was found.");
  const paymentAt = rows.findIndex((row, index) => index > summaryAt && row.text === "Payment Method");
  const paymentRow = paymentAt < 0 ? undefined : rows[paymentAt + 1];
  const paymentMethod = paymentRow && paymentRow.amount === null && paymentRow.text !== "Amount" ? paymentRow.text : null;

  let deliveryFeeMinor: MinorUnitString | null = null;
  let totalMinor: MinorUnitString | null = null;
  const adjustments: DeliveryAdjustment[] = [];
  for (let index = summaryAt + 1; index < rows.length && totalMinor === null; index += 1) {
    const { text, amount } = rows[index]!;
    if (amount === null) continue;
    if (text === "TOTAL" && !amount.negative) totalMinor = amount.minor;
    else if (text.startsWith("Basic Delivery Guarantee") && !amount.negative) {
      if (deliveryFeeMinor !== null) return refuse("MALFORMED_LINE", "Two delivery fee lines were found.");
      deliveryFeeMinor = amount.minor;
    } else if (text === "Item Carrying Fee" && !amount.negative) {
      adjustments.push({ position: adjustments.length + 1, kind: "charge", name: text, amountMinor: amount.minor });
    } else if (text === "Rewards" && amount.negative) {
      adjustments.push({ position: adjustments.length + 1, kind: "discount", name: text, amountMinor: amount.minor });
    } else return refuse("UNKNOWN_CHARGE", "A priced line in the receipt summary is not known.");
  }
  if (totalMinor === null) return refuse("MISSING_FIELD", "No total line was found.");
  if (topTotal.minor !== totalMinor) return refuse("TOTAL_MISMATCH", "The total at the top does not equal the total at the bottom.");
  const net = adjustments.reduce((sum, row) => sum + (row.kind === "charge" ? 1n : -1n) * BigInt(row.amountMinor), 0n);
  if (BigInt(deliveryFeeMinor ?? "0") + net !== BigInt(totalMinor)) {
    return refuse("TOTAL_MISMATCH", "Delivery plus charges minus discounts does not equal the total.");
  }
  return {
    ok: true,
    value: {
      platform: "grabfood", service: "express", bookingId, restaurant: EXPRESS_RESTAURANT, paymentMethod,
      receiptSentAt, items: [], foodMinor: minor("0"), deliveryFeeMinor, adjustments, totalMinor: minor(totalMinor)
    }
  };
}

const LATE_ID_LINE = /^[A-Za-z]+ [A-Za-z]+:\s*(\S+)$/u;
// Always printed with two decimals, so an option line such as `2` is never read as a price.
const BARE_AMOUNT = /^(?:0|[1-9]\d{0,2}(?:,\d{3})+|[1-9]\d*)\.\d{2}$/u;
const LATE_SERVICE_FEE = "Service Fee";
const LATE_DELIVERY_FEE = "Delivery Fee";
const LATE_COMBINED_NAME = "Service Fee + Delivery Fee";

const bareMinor = (line: string | undefined): MinorUnitString | null =>
  line !== undefined && BARE_AMOUNT.test(line) ? parseThb(line).minor : null;

/**
 * Reads a late-delivery apology mail's GrabFood order breakdown. Call only on lines
 * `classifyGrabReceipt` called `late`. Amounts are bare (no baht sign), so the `฿` voucher amount
 * in the apology sentence is never a candidate. Options print BEFORE a dish's price here. When the
 * two fee labels sit together over one amount the split is unknowable: it is stored as a single
 * `charge` and the delivery fee is null. The mail's own sent time is the receipt time.
 */
export function parseGrabLateDelivery(lines: readonly string[], mailSentAt: string | null): DeliveryRead<ParsedDelivery> {
  const breakdownAt = lines.findIndex((line) => line === "Order breakdown");
  if (breakdownAt < 0) return refuse("MISSING_FIELD", "No order breakdown was found.");
  // The ID line is the last `<Word> <Word>: <ID>` before the breakdown, so a forward's or the
  // apology's earlier lines cannot supply it.
  let bookingId = "";
  for (const line of lines.slice(0, breakdownAt).reverse()) {
    const id = LATE_ID_LINE.exec(line.trim())?.[1];
    if (id !== undefined && BOOKING_SHAPE.test(id)) { bookingId = id; break; }
  }
  if (bookingId === "") return refuse("MISSING_FIELD", "No order ID was found.");
  const body = lines.slice(breakdownAt + 1);
  const merchantAt = body.indexOf("Merchant");
  const restaurant = merchantAt < 0 ? undefined : body[merchantAt + 1];
  if (!restaurant) return refuse("MISSING_FIELD", "No merchant line was found.");
  const headerAt = body.indexOf("Amount (THB)");
  if (headerAt < 0) return refuse("MISSING_FIELD", "No amount header was found.");
  if (mailSentAt === null) return refuse("MISSING_FIELD", "No sent-at time was given.");

  const isFeeOrTotal = (line: string) => line === LATE_SERVICE_FEE || line === LATE_DELIVERY_FEE || line === "Total";
  const items: DeliveryItem[] = [];
  let index = headerAt + 1;
  while (index < body.length && !isFeeOrTotal(body[index]!)) {
    const match = QUANTITY.exec(body[index]!);
    if (!match) return refuse("MALFORMED_LINE", "A line among the dishes is not a dish.");
    const quantity = Number(match[1]);
    if (quantity < 1) return refuse("MALFORMED_LINE", "A dish line has a zero quantity.");
    let name = match[2];
    index += 1;
    if (name === undefined) { name = body[index]; index += 1; }
    if (!name || bareMinor(name) !== null) return refuse("MALFORMED_LINE", "A dish has no name.");
    const options: string[] = [];
    let amountMinor: MinorUnitString | null = null;
    while (index < body.length && !isFeeOrTotal(body[index]!) && !QUANTITY.test(body[index]!)) {
      amountMinor = bareMinor(body[index]);
      index += 1;
      if (amountMinor !== null) break;
      options.push(body[index - 1]!);
    }
    if (amountMinor === null) return refuse("MALFORMED_LINE", "A dish has no price.");
    items.push({ position: items.length + 1, quantity, name, options, amountMinor });
  }
  if (items.length === 0) return refuse("MISSING_FIELD", "No dish lines were found.");

  let deliveryFeeMinor: MinorUnitString | null = null;
  const adjustments: DeliveryAdjustment[] = [];
  let totalMinor: MinorUnitString | null = null;
  while (index < body.length && totalMinor === null) {
    const label = body[index]!;
    const own = bareMinor(body[index + 1]);
    if (label === "Total") {
      if (own === null) return refuse("MISSING_FIELD", "No total amount was found.");
      totalMinor = own;
      index += 2;
    } else if (label === LATE_SERVICE_FEE || label === LATE_DELIVERY_FEE) {
      const other = label === LATE_SERVICE_FEE ? LATE_DELIVERY_FEE : LATE_SERVICE_FEE;
      const combined = bareMinor(body[index + 2]);
      if (own !== null) {
        if (label === LATE_SERVICE_FEE) adjustments.push({ position: adjustments.length + 1, kind: "charge", name: label, amountMinor: own });
        else if (deliveryFeeMinor !== null) return refuse("MALFORMED_LINE", "Two delivery fee lines were found.");
        else deliveryFeeMinor = own;
        index += 2;
      } else if (body[index + 1] === other && combined !== null) {
        adjustments.push({ position: adjustments.length + 1, kind: "charge", name: LATE_COMBINED_NAME, amountMinor: combined });
        index += 3;
      } else return refuse("MALFORMED_LINE", "A fee label has no amount.");
    } else index += 1;
  }
  if (totalMinor === null) return refuse("MISSING_FIELD", "No total line was found.");
  const foodMinor = items.reduce((sum, item) => sum + BigInt(item.amountMinor), 0n);
  const fees = adjustments.reduce((sum, row) => sum + BigInt(row.amountMinor), 0n) + BigInt(deliveryFeeMinor ?? "0");
  // The breakdown prints no discounts, and every measured mail's total is below food plus fees, so
  // the gap is D-219's `unprinted` line. The total is printed once here; matching it exactly to a
  // bank charge is the check. A total above the lines is still refused.
  const gap = foodMinor + fees - BigInt(totalMinor);
  if (gap < 0n) return refuse("TOTAL_MISMATCH", "The total is more than food plus fees.");
  if (gap > 0n) adjustments.push({ position: adjustments.length + 1, kind: "unprinted", name: UNPRINTED_NAME, amountMinor: minor(gap.toString()) });
  return {
    ok: true,
    value: {
      platform: "grabfood", service: "food", bookingId, restaurant, paymentMethod: null, receiptSentAt: mailSentAt,
      items, foodMinor: minor(foodMinor.toString()), deliveryFeeMinor, adjustments, totalMinor: minor(totalMinor)
    }
  };
}
