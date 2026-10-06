/**
 * Keyword rules for the auto-categoriser (D-245), kept as code so each is reviewable and its id is
 * recorded in the provenance `detail`. Ordered: the first rule that fits a row wins. Each pattern is
 * tested against `description + " " + transaction_label`. Public merchant names and keywords only,
 * never a person's name.
 *
 * `category` is `"Parent"` or `"Parent › Child"`. A child that does not exist falls back to its
 * parent; a parent that does not exist leaves the row alone (`lib/server/auto-categorise.ts`).
 */
export interface CategoryRule {
  id: string;
  /** `out` for a negative amount, `in` for a positive one, `any` for either. */
  direction: "in" | "out" | "any";
  match: RegExp;
  /**
   * Absolute amounts in minor units the row must equal, when the name alone is ambiguous. A rule
   * with amounts never fits a caller that passes none.
   */
  amountsMinor?: readonly bigint[];
  category: string;
}

/** Round top-up amounts, ฿100 … ฿1,000, in satang (keyword rules round 2: TrueMoney charges). */
const TOP_UP_AMOUNTS = [10000n, 20000n, 30000n, 40000n, 50000n, 100000n] as const;

export const CATEGORY_RULES: readonly CategoryRule[] = [
  // Money out.
  { id: "apple-bill", direction: "out", match: /APPLE\.?COM\/?BILL/i, category: "Subscriptions & Digital › Cloud & Apps" },
  { id: "streaming", direction: "out", match: /SPOTIFY|YOUTUBE|NETFLIX/i, category: "Subscriptions & Digital › Streaming & Music" },
  { id: "google-one", direction: "out", match: /GOOGLE ONE/i, category: "Subscriptions & Digital › Cloud & Apps" },
  { id: "ai-tools", direction: "out", match: /ANTHROPIC|CLAUDE\.AI|OPENAI/i, category: "Subscriptions & Digital › AI Tools" },
  { id: "wallet-top-up", direction: "out", match: /เติมเงิน|TOP.?UP|To .*TRUE MONEY CO/i, category: "Wallet Top-up" },
  // A TrueMoney charge is a 7-Eleven purchase or a top-up and prints the same either way; only a
  // round top-up amount is called one. Receipt-matched rows are decided before any rule runs.
  { id: "truemoney-top-up", direction: "out", match: /SIPS TRUE MONEY/i, amountsMinor: TOP_UP_AMOUNTS, category: "Wallet Top-up" },
  { id: "cash-withdrawal", direction: "out", match: /Cash Withdrawal|\bATM\b(?!.*Fee)/i, category: "Cash" },
  { id: "fees-government", direction: "out", match: /\bFee\b|ATM Annual Fee|กรมการกงสุล/i, category: "Fees & Government" },
  { id: "dining-out", direction: "out", match: /สุกี้ตี๋น้อย|RESTAURANTS DEVELOPMENT|เรสเทอรองตส์|YAKIN|SWENSEN|SUSHIRO|ซูชิโร่|ข้าวเหนียวไก่ทอด/i, category: "Food & Drinks › Dining Out" },
  { id: "coffee", direction: "out", match: /COFFEE|\bCAFE\b|คาเฟ่|กาแฟ|อาว์ชา/i, category: "Food & Drinks › Coffee & Snacks" },
  { id: "supermarket", direction: "out", match: /\bTOPS\b|BIG ?C\b|LOTUS|MAKRO/i, category: "Groceries & Convenience › Supermarket" },
  { id: "convenience-store", direction: "out", match: /\bCJ\b|7-?ELEVEN|FAMILYMART|LAWSON|GREENET|กรีนเนท/i, category: "Groceries & Convenience › Convenience Store" },
  { id: "pharmacy", direction: "out", match: /PHARMACY|STARDRUG|WATSON|วัตสัน|BOOTS/i, category: "Health & Personal Care" },
  { id: "shopeepay", direction: "out", match: /SHOPEEPAY/i, category: "Shopping › Online" },
  { id: "clothing", direction: "out", match: /UNIQLO|ยูนิโคล่/i, category: "Shopping › Clothing" },
  { id: "electronics", direction: "out", match: /APPLE CENTRAL|APPLE STORE/i, category: "Shopping › Electronics" },
  { id: "travel", direction: "out", match: /AIR ?ASIA|TRAVELOKA|AGODA|BOOKING\.COM/i, category: "Travel" },
  { id: "public-transit", direction: "out", match: /LP_BTS|\bBTS\b|\bMRT\b|เอ็มอาร์ที|การรถไฟแห่งประเทศไทย/i, category: "Transport › Public Transit" },
  { id: "parking", direction: "out", match: /PARKING|CENTRAL PATTANA/i, category: "Transport › Parking" },
  // SUANPHLU STATION is a Shell station's operating company: a bill payment names the company.
  // Bangchak's Greenet shops are stores, caught by the convenience-store rule above.
  { id: "fuel", direction: "out", match: /SUANPHLU STATION|\bSHELL\b|BANGCHAK|บางจาก|CALTEX/i, category: "Transport › Fuel" },
  { id: "courier", direction: "out", match: /ปณท|THAILAND POST/i, category: "Services › Courier" },
  { id: "entertainment", direction: "out", match: /SEA ?LIFE|SEALIFE|CINEPLEX|ซีนีเพล็กซ์|ฟุตบอล/i, category: "Entertainment" },
  { id: "education", direction: "out", match: /UNIVERSITY|มหาวิทยาลัย/i, category: "Education" },
  // Money in.
  { id: "student-loan", direction: "in", match: /กยศ|กองทุนให้กู้ยืมเพื่อการศึกษา|Education Loan/i, category: "Student Loan" },
  { id: "refund-interest", direction: "in", match: /POS REFUND|Interest/i, category: "Refunds & Other Income" }
];

/**
 * Whether a rule tells this description's rows apart by amount, so one row's category says nothing
 * about the next. The categoriser keeps such descriptions out of history: otherwise one confirmed
 * TrueMoney top-up would spread Wallet Top-up to every TrueMoney purchase, past the amount check.
 */
export function isAmountGated(text: string, amountSign: number, rules: readonly CategoryRule[] = CATEGORY_RULES): boolean {
  return rules.some((rule) =>
    rule.amountsMinor !== undefined &&
    !(rule.direction === "out" && amountSign >= 0) &&
    !(rule.direction === "in" && amountSign <= 0) &&
    rule.match.test(text)
  );
}

/** The first rule that fits, or null. `amountSign` is -1, 0 or 1; `amountMinor` is the row's amount, either sign. */
export function firstMatchingRule(
  text: string,
  amountSign: number,
  rules: readonly CategoryRule[] = CATEGORY_RULES,
  amountMinor?: bigint
): CategoryRule | null {
  const absolute = amountMinor === undefined ? undefined : amountMinor < 0n ? -amountMinor : amountMinor;
  for (const rule of rules) {
    if (rule.direction === "out" && amountSign >= 0) continue;
    if (rule.direction === "in" && amountSign <= 0) continue;
    if (rule.amountsMinor && (absolute === undefined || !rule.amountsMinor.includes(absolute))) continue;
    // A fresh test each time: none of these carries the `g` flag, so `lastIndex` never matters.
    if (rule.match.test(text)) return rule;
  }
  return null;
}
