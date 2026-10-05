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
  category: string;
}

export const CATEGORY_RULES: readonly CategoryRule[] = [
  // Money out.
  { id: "apple-bill", direction: "out", match: /APPLE\.?COM\/?BILL/i, category: "Subscriptions & Digital › Cloud & Apps" },
  { id: "streaming", direction: "out", match: /SPOTIFY|YOUTUBE|NETFLIX/i, category: "Subscriptions & Digital › Streaming & Music" },
  { id: "google-one", direction: "out", match: /GOOGLE ONE/i, category: "Subscriptions & Digital › Cloud & Apps" },
  { id: "ai-tools", direction: "out", match: /ANTHROPIC|CLAUDE\.AI|OPENAI/i, category: "Subscriptions & Digital › AI Tools" },
  { id: "wallet-top-up", direction: "out", match: /เติมเงิน|TOP.?UP|To .*TRUE MONEY CO/i, category: "Wallet Top-up" },
  { id: "cash-withdrawal", direction: "out", match: /Cash Withdrawal|\bATM\b(?!.*Fee)/i, category: "Cash" },
  { id: "fees-government", direction: "out", match: /\bFee\b|ATM Annual Fee|กรมการกงสุล/i, category: "Fees & Government" },
  { id: "dining-out", direction: "out", match: /สุกี้ตี๋น้อย|RESTAURANTS DEVELOPMENT|เรสเทอรองตส์|YAKIN/i, category: "Food & Drinks › Dining Out" },
  { id: "coffee", direction: "out", match: /COFFEE|\bCAFE\b|คาเฟ่|กาแฟ/i, category: "Food & Drinks › Coffee & Snacks" },
  { id: "supermarket", direction: "out", match: /\bTOPS\b|BIG ?C\b|LOTUS|MAKRO/i, category: "Groceries & Convenience › Supermarket" },
  { id: "convenience-store", direction: "out", match: /\bCJ\b|7-?ELEVEN|FAMILYMART|LAWSON/i, category: "Groceries & Convenience › Convenience Store" },
  { id: "pharmacy", direction: "out", match: /PHARMACY|STARDRUG|WATSON|วัตสัน|BOOTS/i, category: "Health & Personal Care" },
  { id: "clothing", direction: "out", match: /UNIQLO|ยูนิโคล่/i, category: "Shopping › Clothing" },
  { id: "electronics", direction: "out", match: /APPLE CENTRAL|APPLE STORE/i, category: "Shopping › Electronics" },
  { id: "travel", direction: "out", match: /AIR ?ASIA|TRAVELOKA|AGODA|BOOKING\.COM/i, category: "Travel" },
  { id: "public-transit", direction: "out", match: /LP_BTS|\bBTS\b|\bMRT\b/i, category: "Transport › Public Transit" },
  { id: "parking", direction: "out", match: /PARKING/i, category: "Transport › Parking" },
  { id: "entertainment", direction: "out", match: /SEA ?LIFE|SEALIFE/i, category: "Entertainment" },
  { id: "education", direction: "out", match: /UNIVERSITY|มหาวิทยาลัย/i, category: "Education" },
  // Money in.
  { id: "student-loan", direction: "in", match: /กยศ|กองทุนให้กู้ยืมเพื่อการศึกษา|Education Loan/i, category: "Student Loan" },
  { id: "refund-interest", direction: "in", match: /POS REFUND|Interest/i, category: "Refunds & Other Income" }
];

/** The first rule that fits, or null. `amountSign` is -1, 0 or 1. */
export function firstMatchingRule(text: string, amountSign: number, rules: readonly CategoryRule[] = CATEGORY_RULES): CategoryRule | null {
  for (const rule of rules) {
    if (rule.direction === "out" && amountSign >= 0) continue;
    if (rule.direction === "in" && amountSign <= 0) continue;
    // A fresh test each time: none of these carries the `g` flag, so `lastIndex` never matters.
    if (rule.match.test(text)) return rule;
  }
  return null;
}
