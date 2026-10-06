import { describe, expect, it } from "vitest";
import { CATEGORY_RULES, firstMatchingRule } from "@/lib/category-rules";

// One invented description per rule (D-245). The text is description + " " + label, as the
// categoriser builds it. Merchant names are public; nothing here is a real statement line.
const OUT = -1;
const IN = 1;

const cases: [id: string, text: string, sign: number, amountMinor?: bigint][] = [
  ["apple-bill", "APPLE.COM/BILL INVENTED Card payment", OUT],
  ["streaming", "INVENTED SPOTIFY P0000 Card payment", OUT],
  ["google-one", "GOOGLE ONE INVENTED Card payment", OUT],
  ["ai-tools", "CLAUDE.AI SUBSCRIPTION INVENTED Card payment", OUT],
  ["wallet-top-up", "To 000-0-00000-0 TRUE MONEY CO., LTD Transfer", OUT],
  ["truemoney-top-up", "SIPS TRUE MONEY CO.,LTD. NOTE : -", OUT, -20000n],
  ["cash-withdrawal", "INVENTED BRANCH 0000 Cash Withdrawal", OUT],
  ["fees-government", "ATM Annual Fee Fee", OUT],
  ["dining-out", "INVENTED YAKINIKU HOUSE Card payment", OUT],
  ["coffee", "INVENTED COFFEE ROASTERY Card payment", OUT],
  ["supermarket", "TOPS INVENTED BRANCH Card payment", OUT],
  ["convenience-store", "7-ELEVEN INVENTED 00000 Card payment", OUT],
  ["pharmacy", "WATSONS INVENTED MALL Card payment", OUT],
  ["shopeepay", "SIPS SHOPEEPAY (THAILAND) CO.,LTD. NOTE : -", OUT],
  ["clothing", "UNIQLO INVENTED MALL Card payment", OUT],
  ["electronics", "APPLE STORE INVENTED Card payment", OUT],
  ["travel", "AGODA INVENTED HOTEL Card payment", OUT],
  ["public-transit", "LP_BTS INVENTED Card payment", OUT],
  ["parking", "INVENTED PARKING LOT Card payment", OUT],
  ["fuel", "จ่ายบิล SUANPHLU STATION CO.,LTD. NOTE : -", OUT],
  ["courier", "จ่ายบิล ระบบรับชำระคิวอาร์ ปณท NOTE : -", OUT],
  ["entertainment", "SEA LIFE INVENTED Card payment", OUT],
  ["education", "INVENTED UNIVERSITY BURSAR Bill payment", OUT],
  ["student-loan", "INVENTED REF 0000 Education Loan", IN],
  ["refund-interest", "POS REFUND INVENTED Transfer", IN]
];

describe("CATEGORY_RULES", () => {
  it.each(cases)("%s matches an invented row", (id, text, sign, amountMinor) => {
    expect(firstMatchingRule(text, sign, CATEGORY_RULES, amountMinor)?.id).toBe(id);
  });

  it("calls a TrueMoney charge a top-up only at a round top-up amount", () => {
    const text = "SIPS TRUE MONEY CO.,LTD. NOTE : -";
    for (const amount of [-10000n, -50000n, -100000n]) expect(firstMatchingRule(text, OUT, CATEGORY_RULES, amount)?.id).toBe("truemoney-top-up");
    // ฿230 is round but not a top-up amount; ฿164 is a purchase; no amount at all fits nothing.
    for (const amount of [-23000n, -16400n, -20001n]) expect(firstMatchingRule(text, OUT, CATEGORY_RULES, amount)).toBeNull();
    expect(firstMatchingRule(text, OUT)).toBeNull();
  });

  it("names the round-2 merchants that share an existing rule", () => {
    expect(firstMatchingRule("จ่ายบิล CENTRAL PATTANA PUBLIC COMPANY L NOTE : -", OUT)?.id).toBe("parking");
    expect(firstMatchingRule("จ่ายบิล SWENSENS (THAI) LIMITED NOTE : -", OUT)?.id).toBe("dining-out");
    expect(firstMatchingRule("จ่ายบิล บจก. ซูชิโร่ จีเอช (ไทย) NOTE : -", OUT)?.id).toBe("dining-out");
    expect(firstMatchingRule("จ่ายบิล ร้านข้าวเหนียวไก่ทอดตัวอย่าง NOTE : -", OUT)?.id).toBe("dining-out");
    expect(firstMatchingRule("จ่ายบิล อาว์ชา สาขาตัวอย่าง NOTE : -", OUT)?.id).toBe("coffee");
    expect(firstMatchingRule("จ่ายบิล เอ็มอาร์ที-ตัวอย่าง NOTE : -", OUT)?.id).toBe("public-transit");
    expect(firstMatchingRule("จ่ายบิล ถุงเงิน (การรถไฟแห่งประเทศไทย NOTE : -", OUT)?.id).toBe("public-transit");
    expect(firstMatchingRule("จ่ายบิล บจก.สยาม ซีนีเพล็กซ์ NOTE : -", OUT)?.id).toBe("entertainment");
    expect(firstMatchingRule("จ่ายบิล ตัวอย่าง ฟุตบอล พาร์ค NOTE : -", OUT)?.id).toBe("entertainment");
    // A Bangchak station's Greenet shop is a store, not fuel.
    expect(firstMatchingRule("จ่ายบิล บางจาก กรีนเนท.สาขาตัวอย่าง NOTE : -", OUT)?.id).toBe("convenience-store");
    expect(firstMatchingRule("จ่ายบิล บางจาก สาขาตัวอย่าง NOTE : -", OUT)?.id).toBe("fuel");
  });

  it("covers every rule with a case, and every id is unique", () => {
    const ids = CATEGORY_RULES.map((rule) => rule.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(cases.map(([id]) => id))).toEqual(new Set(ids));
  });

  it("keeps an ATM fee out of Cash", () => {
    expect(firstMatchingRule("INVENTED ATM Annual Fee", OUT)?.id).toBe("fees-government");
    expect(firstMatchingRule("INVENTED ATM 0000", OUT)?.id).toBe("cash-withdrawal");
  });

  it("respects direction: an out rule never fits money in, and nothing fits a zero amount by direction", () => {
    expect(firstMatchingRule("INVENTED SPOTIFY Card payment", IN)).toBeNull();
    expect(firstMatchingRule("POS REFUND INVENTED", OUT)).toBeNull();
    expect(firstMatchingRule("INVENTED SPOTIFY", 0)).toBeNull();
    expect(firstMatchingRule("Interest", IN)?.id).toBe("refund-interest");
  });

  it("matches TOPS and CAFE as whole words only", () => {
    expect(firstMatchingRule("INVENTED LAPTOPS SHOP Card payment", OUT)).toBeNull();
    expect(firstMatchingRule("INVENTED CAFETERIA Card payment", OUT)).toBeNull();
  });

  it("finds nothing for an unknown merchant", () => {
    expect(firstMatchingRule("INVENTED UNKNOWN SHOP Card payment", OUT)).toBeNull();
  });
});
