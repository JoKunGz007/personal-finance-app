import { describe, expect, test } from "vitest";
import { parseReceiptText, repairThai } from "@/lib/receipt-text";

// Every value below is invented (`docs/FIXTURE_POLICY.md`) — item names, prices, receipt
// numbers, store codes and dates are all made up for this test file and match no real receipt.
// Label wordings and field order follow `docs/RECEIPT_CONTRACT.md` and the coordinator's
// measured corrections; only the values inside them are invented.

const CONDENSED_HEADER_LINE = "CP ALL,7-Eleven สาขาลาดพร้าวซอย 5(30219)";
const FULL_STORE_LINE = "สาขาที่ออกใบกำกับภาษี : 30219 สาขา 7-Eleven สาขาลาดพร้าวซอย 5 Vat Code (0105536000000)";
// Real structure, per the coordinator's measurement: Thai prose, a spaced colon, the cancelled
// receipt number, `POS <n>`, more Thai, and **two** trailing dates — not one.
const FULL_SUPERSEDES_LINE = "ยกเลิกใบกำกับภาษีอย่างย่อเลขที่ : 0012 POS 02 ลงวันที่ 22/09/2569 22/09/2569";
const TID_LINE = "TID#20260922143501998877";
const R_LINE = "R#0012P02 :000456 22/09/69 14:35";

// The full invoice's real tail (corrections #14–16): `มูลค่าสินค้ารวม` (subtotal), an *optional*
// `หักส่วนลด` … `ส่วนลดที่ได้ทั้งหมด` discount block, then the three VAT-breakdown lines — the
// last of which, `มูลค่าสินค้ารวมภาษีมูลค่าเพิ่ม`, is the net. There is no `ยอดสุทธิ`/`ชิ้น` line on
// this form, and — measured after an earlier round of this file already got it wrong once —
// **no payment line, no `TID#`, and no `R#` either.** `เลขที่` and `วันที่` are the full
// invoice's only identity and date sources; earlier fixtures invented all of the above, which is
// why the tests built on them were validating a grammar this document does not actually print.
function fullFixture(
  overrides: {
    itemLine?: string;
    fullDateLine?: string;
    storeLine?: string;
    withSupersedes?: boolean;
    subtotalLine?: string;
    discountLines?: string[];
    discountTotalLine?: string;
    vatPreLine?: string;
    vatTaxLine?: string;
    vatTotalLine?: string;
  } = {}
): string {
  const lines = [
    overrides.storeLine ?? FULL_STORE_LINE,
    "เลขที่ F1000123",
    overrides.fullDateLine ?? "วันที่ 22/09/2569",
    overrides.itemLine ?? "1 2 ขนมปังไส้ครีม 15.00 30.00",
    "2 1 น้ำดื่มตราช้าง 10.00 10.00",
    overrides.subtotalLine ?? "มูลค่าสินค้ารวม 40.00"
  ];
  if (overrides.discountLines) {
    lines.push("หักส่วนลด", ...overrides.discountLines, overrides.discountTotalLine ?? "ส่วนลดที่ได้ทั้งหมด 5.00");
  }
  lines.push(
    overrides.vatPreLine ?? "มูลค่าสินค้าก่อนภาษีมูลค่าเพิ่ม 37.38",
    overrides.vatTaxLine ?? "ภาษีมูลค่าเพิ่ม 2.62",
    overrides.vatTotalLine ?? "มูลค่าสินค้ารวมภาษีมูลค่าเพิ่ม 40.00"
  );
  if (overrides.withSupersedes ?? true) lines.push(FULL_SUPERSEDES_LINE);
  return lines.join("\n");
}

function condensedFixture(
  overrides: { itemLines?: string[]; withSubtotal?: boolean; netLine?: string; rLine?: string } = {}
): string {
  const itemLines = overrides.itemLines ?? ["2 ขนมปังไส้ครีม @15.00 30.00", "1 น้ำดื่มตราช้าง 10.00"];
  const lines = [CONDENSED_HEADER_LINE, ...itemLines];
  if (overrides.withSubtotal) {
    lines.push("ยอดรวม 40.00");
    lines.push("1 ส่วนลดคูปอง 5.00");
    lines.push(overrides.netLine ?? "ยอดสุทธิ 3 ชิ้น 35.00");
  } else {
    lines.push(overrides.netLine ?? "ยอดสุทธิ 3 ชิ้น 40.00");
  }
  lines.push("เงินสด 40.00");
  lines.push("40.00");
  lines.push(TID_LINE);
  lines.push(overrides.rLine ?? R_LINE);
  return lines.join("\n");
}

describe("repairThai", () => {
  test("rule 1: U+0006 becomes sara aa", () => {
    // \x06 stands in for า in the measured font.
    expect(repairThai("\x06")).toBe("า");
  });

  test("rule 2: a decomposed ำ recomposes, with no stray า left behind", () => {
    // The font prints ำ as ำ + า (already-correct sara am plus rule 1's leftover). After
    // repair, exactly one ำ survives, not ำ followed by า.
    const repaired = repairThai("ำา");
    expect(repaired).toBe("ำ");
    expect(repaired).not.toContain("า");
  });

  test("both rules compose: rule 1 produces the า that rule 2 then removes", () => {
    // \x06 in this position stands for the decomposed sara aa half of a ำ.
    const repaired = repairThai("ำ\x06");
    expect(repaired).toBe("ำ");
  });

  test("a real word boundary á la 'a space after a Thai combining mark' is left untouched", () => {
    // Regression against the temptation the prompt calls out explicitly: no space-fixing.
    expect(repairThai("ก่อน ภาษี")).toBe("ก่อน ภาษี");
  });
});

describe("parseReceiptText — full invoice", () => {
  test("parses the full-invoice line shape: <no> <qty> <name> <unit price> <amount>", () => {
    const result = parseReceiptText(fullFixture(), "full");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.receiptNumber).toBe("F1000123");
    expect(result.value.storeCode).toBe("30219");
    expect(result.value.branchName).toBe("สาขาลาดพร้าวซอย 5");
    expect(result.value.items).toHaveLength(2);
    expect(result.value.items[0]).toMatchObject({ quantity: 2, name: "ขนมปังไส้ครีม", unitPriceMinor: "1500", amountMinor: "3000" });
    expect(result.value.subtotalMinor).toBe("4000");
    expect(result.value.netMinor).toBe("4000");
    expect(result.value.vat).toEqual({ preVatMinor: "3738", vatMinor: "262", totalInclVatMinor: "4000" });
    // Correction #15: no payment method on the full form — not missing, absent by document.
    expect(result.value.paymentMethod).toBeNull();
    // Correction #16: date-only (from วันที่, since there is no TID# to read a time from at all).
    expect(result.value.purchasedAt).toBe("2026-09-22");
    expect(result.value.purchasedAtTime).toBeNull();
    expect(result.value.completeness).toBe("complete");
  });

  test("no TID# and no R# at all: still parses, date comes solely from วันที่, receipt number solely from เลขที่", () => {
    // Correction #16, measured: `TID#` and `R#` occur zero times in the full invoice. The
    // default fixture above already carries neither — this test names that fact explicitly so
    // it cannot regress back to requiring them by accident.
    const text = fullFixture();
    expect(text).not.toContain("TID#");
    expect(text).not.toContain("R#");
    const result = parseReceiptText(text, "full");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.receiptNumber).toBe("F1000123");
    expect(result.value.purchasedAt).toBe("2026-09-22");
    expect(result.value.purchasedAtTime).toBeNull();
  });

  test("the date cross-check is inapplicable on the full form — a วันที่ that would disagree with a TID# has nothing to disagree with", () => {
    // There is exactly one printed date on this form. A value that would have failed the
    // condensed form's cross-check does not refuse here, because there is no second
    // representation for it to be checked against at all.
    const result = parseReceiptText(fullFixture({ fullDateLine: "วันที่ 01/01/2570" }), "full");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.purchasedAt).toBe("2027-01-01");
  });

  test("thousands separators parse: a 1,234.00-shaped figure survives the line grammar and parseThb", () => {
    const text = fullFixture({
      itemLine: "1 2 ของแพง 617.00 1,234.00",
      vatPreLine: "มูลค่าสินค้าก่อนภาษีมูลค่าเพิ่ม 1,161.68",
      vatTaxLine: "ภาษีมูลค่าเพิ่ม 82.32",
      vatTotalLine: "มูลค่าสินค้ารวมภาษีมูลค่าเพิ่ม 1,244.00"
    });
    const result = parseReceiptText(text, "full");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.items[0]).toMatchObject({ unitPriceMinor: "61700", amountMinor: "123400" });
    expect(result.value.netMinor).toBe("124400");
  });

  test("no unit count at all: null rather than invented, and the check that would need it is inapplicable, not failed", () => {
    // Correction #14: `ยอดรวม`, `ยอดสุทธิ` and `ชิ้น` occur zero times in the real full invoice.
    const result = parseReceiptText(fullFixture(), "full");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.unitCount).toBeNull();
    expect(result.value.failedChecks).not.toContain("UNIT_COUNT_CHECK");
    expect(result.value.inapplicableChecks).toContain("UNIT_COUNT_CHECK");
    // Not faked as passing either — "complete" here means "every applicable check passed",
    // not "every check that exists passed".
    expect(result.value.completeness).toBe("complete");
  });

  test("VAT identity check: pre-VAT + VAT must equal the VAT-inclusive total", () => {
    // 924.00 + 75.00 = 999.00, not the printed 40.00 total — an internal disagreement within
    // the VAT breakdown itself, independent of the item total.
    const result = parseReceiptText(
      fullFixture({ vatPreLine: "มูลค่าสินค้าก่อนภาษีมูลค่าเพิ่ม 924.00", vatTaxLine: "ภาษีมูลค่าเพิ่ม 75.00" }),
      "full"
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.completeness).toBe("partial");
    expect(result.value.failedChecks).toEqual(["VAT_IDENTITY_CHECK"]);
  });
});

describe("full invoice: prose lines are not purchases", () => {
  // Found by review, reproduced before fixing. The full invoice prints the issuer's head-office
  // address on every page, and it ends in a postcode — so it has the exact shape of a
  // bare-quantity item line (`<integer> <text> <figure>`). While `QTY_NAME_AMOUNT_LINE` was
  // tried without a form guard, that line was captured as merchandise: quantity 313, amount
  // ฿10,500.00, twice over on a two-page invoice, and every real full invoice came back
  // "partial" with NET_CHECK failing.
  //
  // **The distinguishing assertion is the item count**, not the checksum: with the address row
  // present the net check fails, but a fixture could be contrived where the bogus amount happens
  // to balance. Asserting that only the real merchandise rows exist is what actually pins it.
  test("the printed address block is not read as an item", () => {
    const text = fullFixture().replace(
      "1 2 ขนมปังไส้ครีม 15.00 30.00",
      ["313 อาคารทดสอบ ชั้น 24 ถนนทดสอบ เขตทดสอบ กรุงเทพฯ 10500", "1 2 ขนมปังไส้ครีม 15.00 30.00"].join("\n")
    );
    const result = parseReceiptText(text, "full");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.items).toHaveLength(2);
    expect(result.value.items.map((item) => item.name)).toEqual(["ขนมปังไส้ครีม", "น้ำดื่มตราช้าง"]);
    expect(result.value.items.some((item) => item.quantity === 313)).toBe(false);
    // And the receipt still reconciles, which it did not while the address row was counted.
    expect(result.value.completeness).toBe("complete");
  });
});

describe("full invoice: the discount block (correction #12/#13)", () => {
  test("discount lines with no leading quantity subtract from the net, and the block's own total is a passing cross-check", () => {
    const result = parseReceiptText(
      fullFixture({
        discountLines: ["ส่วนลดคูปอง 5.00"],
        discountTotalLine: "ส่วนลดที่ได้ทั้งหมด 5.00",
        vatPreLine: "มูลค่าสินค้าก่อนภาษีมูลค่าเพิ่ม 32.71",
        vatTaxLine: "ภาษีมูลค่าเพิ่ม 2.29",
        vatTotalLine: "มูลค่าสินค้ารวมภาษีมูลค่าเพิ่ม 35.00"
      }),
      "full"
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.discounts).toEqual(["500"]);
    // 3000 + 1000 (items) − 500 (discount) = 3500 = net.
    expect(result.value.netMinor).toBe("3500");
    expect(result.value.completeness).toBe("complete");
    expect(result.value.failedChecks).toEqual([]);
  });

  test("ส่วนลดที่ได้ทั้งหมด is excluded from discounts itself, not double-counted", () => {
    const result = parseReceiptText(
      fullFixture({
        discountLines: ["ส่วนลดคูปอง 5.00"],
        discountTotalLine: "ส่วนลดที่ได้ทั้งหมด 5.00"
      }),
      "full"
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Exactly one entry — the coupon line — not two (which double-counting the total line
    // would produce).
    expect(result.value.discounts).toEqual(["500"]);
  });

  test("a disagreeing ส่วนลดที่ได้ทั้งหมด is refused, not reconciled", () => {
    const result = parseReceiptText(
      fullFixture({
        discountLines: ["ส่วนลดคูปอง 5.00"],
        // Claims 7.00 while the one discount line above sums to 5.00.
        discountTotalLine: "ส่วนลดที่ได้ทั้งหมด 7.00"
      }),
      "full"
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("DISCOUNT_TOTAL_MISMATCH");
  });
});

describe("full invoice: classification applies to the item table's own row shape too (correction #11)", () => {
  test("a discount-named row inside the item table is treated as a discount, not merchandise", () => {
    const text = fullFixture({ itemLine: ["1 2 ขนมปังไส้ครีม 15.00 30.00", "9 1 ส่วนลดพิเศษ 5.00 5.00"].join("\n") });
    const result = parseReceiptText(text, "full");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.items.some((item) => item.name === "ส่วนลดพิเศษ")).toBe(false);
    expect(result.value.discounts).toContain("500");
  });
});

describe("parseReceiptText — condensed form", () => {
  test("parses @unit when quantity > 1, and its absence when quantity is 1", () => {
    const result = parseReceiptText(condensedFixture(), "condensed");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.items[0]).toMatchObject({ quantity: 2, unitPriceMinor: "1500", amountMinor: "3000" });
    expect(result.value.items[1]).toMatchObject({ quantity: 1, unitPriceMinor: null, amountMinor: "1000" });
    // The receipt number is R#'s first digit run, not the after-colon sequence (correction #7).
    expect(result.value.receiptNumber).toBe("0012");
    expect(result.value.storeCode).toBe("30219");
    expect(result.value.supersedesReceiptNumber).toBeNull();
  });

  test("no ยอดรวม line when there are no discounts", () => {
    const result = parseReceiptText(condensedFixture({ withSubtotal: false }), "condensed");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.subtotalMinor).toBeNull();
    expect(result.value.discounts).toEqual([]);
  });

  test("ยอดรวม is present and discounts subtract correctly when discounts follow", () => {
    const result = parseReceiptText(condensedFixture({ withSubtotal: true }), "condensed");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.subtotalMinor).toBe("4000");
    expect(result.value.discounts).toEqual(["500"]);
    expect(result.value.completeness).toBe("complete");
  });
});

describe("full invoice: labelled store/branch line, and the supersedes link", () => {
  test("parses store code, branch name and VAT code from the labelled สาขาที่ออกใบกำกับภาษี line", () => {
    // Correction #8: the full invoice carries no `CP ALL` line at all — a shared regex with the
    // condensed form's header would refuse every full invoice on store/branch. This is the
    // path that broke before the fix.
    const result = parseReceiptText(fullFixture(), "full");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.storeCode).toBe("30219");
    expect(result.value.branchName).toBe("สาขาลาดพร้าวซอย 5");
    expect(result.value.vatCode).toBe("0105536000000");
  });

  test("a repeated per-page header (store line, เลขที่, วันที่) does not cause a refusal", () => {
    // The measured document is two pages and prints these three lines on each. Re-matching an
    // identical value on the second occurrence must be harmless.
    const text = [fullFixture({ withSupersedes: false }), FULL_STORE_LINE, "เลขที่ F1000123", "วันที่ 22/09/2569"].join("\n");
    const result = parseReceiptText(text, "full");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.storeCode).toBe("30219");
    expect(result.value.receiptNumber).toBe("F1000123");
  });

  test("captures the condensed receipt number this invoice supersedes, distinct from its own เลขที่", () => {
    const result = parseReceiptText(fullFixture(), "full");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.receiptNumber).toBe("F1000123");
    expect(result.value.supersedesReceiptNumber).toBe("0012");
    expect(result.value.supersedesReceiptNumber).not.toBe(result.value.receiptNumber);
  });

  test("supersedesReceiptNumber is null when the full invoice's fixture omits the cancellation line", () => {
    const result = parseReceiptText(fullFixture({ withSupersedes: false }), "full");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.supersedesReceiptNumber).toBeNull();
  });

  test("a second trailing date after POS <n> does not defeat the match", () => {
    // Correction #10: the real line carries two dates after the POS number, not one — an
    // end-of-line-anchored regex (the first version of this rule) would fail to match at all.
    // `FULL_SUPERSEDES_LINE` above already carries two dates; this test exists so that fact is
    // asserted rather than merely present.
    expect(FULL_SUPERSEDES_LINE.match(/\d{2}\/\d{2}\/\d{4}/g)).toHaveLength(2);
    const result = parseReceiptText(fullFixture(), "full");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.supersedesReceiptNumber).toBe("0012");
  });
});

describe("discount and promotional lines are not merchandise", () => {
  // This is the defect the coordinator's correction round exists to fix: a discount line and a
  // promotional line share the plain item shape (`<qty> <name> <amount>[N]`) and are told
  // apart only by name. Before the fix, the discount line below was captured as a positive
  // item (inflating the item total and never being subtracted) and the promotion's differing
  // shape made it fall through to the item branch too, corrupting the unit-count check. Both
  // are red-proved together: this fixture's checksums only balance if both are classified
  // correctly.
  test("a discount line subtracts rather than adding, and a promotion is flagged rather than counted", () => {
    const text = condensedFixture({
      itemLines: [
        "2 ขนมปังไส้ครีม @15.00 30.00",
        "1 น้ำดื่มตราช้าง 10.00",
        "1 ส่วนลดคูปอง 5.00",
        "1 M-Stamp(บาท) 0.00N"
      ],
      withSubtotal: false,
      netLine: "ยอดสุทธิ 3 ชิ้น 35.00"
    });
    const result = parseReceiptText(text, "condensed");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // The discount is not in `items` at all — it lives only in `discounts`.
    expect(result.value.items.some((item) => item.name.startsWith("ส่วนลด"))).toBe(false);
    expect(result.value.discounts).toEqual(["500"]);

    // The promotion is in `items`, flagged, and excluded from the unit-count check.
    const promo = result.value.items.find((item) => item.isPromotion);
    expect(promo).toMatchObject({ name: "M-Stamp(บาท)", amountMinor: "0", isPromotion: true });

    // Both checksums balance only when the discount subtracts and the promotion is excluded
    // from the unit count: 3000 + 1000 (merch) + 0 (promo) − 500 (discount) = 3500 = net; and
    // 2 + 1 (merch qty) = 3 = the printed unit count, with the promotion's own qty excluded.
    expect(result.value.completeness).toBe("complete");
    expect(result.value.failedChecks).toEqual([]);
  });

  // The same rule on the full form, which is where it was broken for a different reason: the
  // VAT-exempt `N` prints hard against the figure with no space in **both** forms, but
  // `ITEM_FULL_LINE` briefly required `\s+N`. A promotional line ending `0.00N` then matched
  // nothing at all and was skipped in silence, so the promotion vanished and the unit-count
  // checksum lost the row it was supposed to exclude.
  //
  // **This is the distinguishing assertion**: restore the space requirement and the promotion
  // disappears from `items`, so the `isPromotion` expectation below fails. The completeness
  // assertion alone would not catch it — the unit count excludes promotions either way, so a
  // dropped promotional row still balances. Only looking for the row itself proves it survived.
  test("full form: a promotional line ending in N with no space is read, not silently dropped", () => {
    const text = fullFixture({ itemLine: "1 2 ขนมปังไส้ครีม 15.00 30.00" }).replace(
      "2 1 น้ำดื่มตราช้าง 10.00 10.00",
      ["2 1 น้ำดื่มตราช้าง 10.00 10.00", "3 4 M-Stamp(บาท) 0.00 0.00N"].join("\n")
    );
    const result = parseReceiptText(text, "full");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const promo = result.value.items.find((item) => item.isPromotion);
    expect(promo).toMatchObject({ name: "M-Stamp(บาท)", quantity: 4, amountMinor: "0", isPromotion: true });
    expect(promo?.vatExempt).toBe(true);

    // Its zero amount does not disturb the net check either (the full form has no unit-count
    // check to disturb at all — correction #14).
    expect(result.value.completeness).toBe("complete");
  });
});

describe("completeness — red-proved", () => {
  // These two are the distinguishing assertions: a fixture genuinely missing a line must be
  // reported partial, and each failure must name the specific check it tripped. Deleting either
  // `if (!xCheckOk) failedChecks.push(...)` line in lib/receipt-text.ts makes the matching
  // assertion below fail, which is what proves the check is doing real work rather than always
  // reporting "complete".

  test("check 1 (net), full form: catches a receipt truncated after item capture but before the total was corrected", () => {
    // The VAT-inclusive total claims 999.00 instead of the true 40.00 the items actually sum
    // to — exactly what a silently-truncated item list looks like from the checksum's point of
    // view. `vatPreLine`/`vatTaxLine` are overridden to still sum to 999.00 themselves, so
    // `VAT_IDENTITY_CHECK` stays internally consistent and only `NET_CHECK` — which compares
    // against the *items* — is the one this fixture is testing.
    const result = parseReceiptText(
      fullFixture({
        vatPreLine: "มูลค่าสินค้าก่อนภาษีมูลค่าเพิ่ม 924.00",
        vatTaxLine: "ภาษีมูลค่าเพิ่ม 75.00",
        vatTotalLine: "มูลค่าสินค้ารวมภาษีมูลค่าเพิ่ม 999.00"
      }),
      "full"
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.completeness).toBe("partial");
    expect(result.value.failedChecks).toEqual(["NET_CHECK"]);
  });

  test("check 2 (unit count), condensed form: catches a receipt whose printed count disagrees with summed quantities, net still balancing", () => {
    // netLine here keeps the true net (40.00) but claims 9 units instead of 3 — the shape a
    // screenshot's silently-cut scroll region produces (D-031's sibling hazard, item side).
    // Condensed-only, per correction #14 — the full form has no unit count to disagree with.
    const result = parseReceiptText(condensedFixture({ netLine: "ยอดสุทธิ 9 ชิ้น 40.00" }), "condensed");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.completeness).toBe("partial");
    expect(result.value.failedChecks).toContain("UNIT_COUNT_CHECK");
    expect(result.value.failedChecks).not.toContain("NET_CHECK");
  });

  test("check 2 does not run on the full form at all — inapplicable, not silently passing", () => {
    const result = parseReceiptText(fullFixture(), "full");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.unitCount).toBeNull();
    expect(result.value.inapplicableChecks).toContain("UNIT_COUNT_CHECK");
  });

  test("a genuinely complete condensed receipt passes both its applicable checks (VAT identity is inapplicable there)", () => {
    const result = parseReceiptText(condensedFixture(), "condensed");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.completeness).toBe("complete");
    expect(result.value.failedChecks).toEqual([]);
    // The condensed form never prints a VAT breakdown, so that check cannot run on it either.
    expect(result.value.inapplicableChecks).toEqual(["VAT_IDENTITY_CHECK"]);
  });

  test("a genuinely complete full-invoice receipt passes both of its applicable checks", () => {
    const result = parseReceiptText(fullFixture(), "full");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.completeness).toBe("complete");
    expect(result.value.failedChecks).toEqual([]);
    expect(result.value.inapplicableChecks).toEqual(["UNIT_COUNT_CHECK"]);
  });
});

describe("quantity cross-check", () => {
  test("refuses a line where unit price times quantity disagrees with the printed amount", () => {
    // 2 × 15.00 should be 30.00, not 31.00 — the full invoice's at-risk case the contract names.
    const result = parseReceiptText(fullFixture({ itemLine: "1 2 ขนมปังไส้ครีม 15.00 31.00" }), "full");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("QUANTITY_MISMATCH");
    expect(result.lineNo).toBeDefined();
  });
});

describe("TID# / date-line cross-check", () => {
  // Full-form date handling (no TID#, no cross-check) is covered above, in
  // "parseReceiptText — full invoice" — this section is condensed-only now that correction #16
  // established the full form has no second date representation to cross-check against at all.

  test("condensed: refuses when R#'s two-digit Buddhist year disagrees with TID#'s Gregorian date", () => {
    // TID# still names 22/09/2026 (2569 BE, printed "69"); R# claims "68" instead.
    const result = parseReceiptText(condensedFixture({ rLine: "R#0012P02 :000456 22/09/68 14:35" }), "condensed");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("DATE_MISMATCH");
  });

  test("condensed: agrees and parses when R# and TID# name the same day", () => {
    const result = parseReceiptText(condensedFixture(), "condensed");
    expect(result.ok).toBe(true);
  });
});
