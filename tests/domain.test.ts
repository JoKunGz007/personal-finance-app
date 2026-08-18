import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { bangkokInstant, bangkokToday, gregorianYearFrom, resolveStatementEra } from "@/lib/dates";
import { canonicalJson, confirmationDigest, normalizeSourceText, rowFingerprint } from "@/lib/canonical";
import { sourceRowCandidateSchema, type ImportPayload } from "@/lib/statement";
import { MAX_INT64, MIN_INT64, minor, minorUnitStringSchema, parseThb, plainThb } from "@/lib/money";
import { reconcileRows } from "@/lib/reconcile";
import { syntheticImport } from "@/lib/synthetic";

describe("exact THB money", () => {
  it("parses plain decimal text into minor units without floating point", () => {
    expect(parseThb("฿ 1,234.50")).toEqual({ minor: "123450", currency: "THB" });
    expect(parseThb("-0.25").minor).toBe("-25");
  });

  it.each(["1.001", "1e3", "+1.00", "-0", "-0.00", "01.00", "NaN"])("rejects non-canonical input %s", (value) => {
    expect(() => parseThb(value)).toThrow();
  });

  it("enforces the signed bigint boundaries", () => {
    expect(minorUnitStringSchema.parse(MIN_INT64.toString())).toBe(MIN_INT64.toString());
    expect(minorUnitStringSchema.parse(MAX_INT64.toString())).toBe(MAX_INT64.toString());
    expect(() => minorUnitStringSchema.parse((MAX_INT64 + 1n).toString())).toThrow();
    expect(() => minorUnitStringSchema.parse((MIN_INT64 - 1n).toString())).toThrow();
  });

  it("round-trips generated int64 values as canonical strings", () => {
    fc.assert(fc.property(fc.bigInt({ min: MIN_INT64, max: MAX_INT64 }), (value) => minor(value.toString()) === value.toString()));
  });

  // `plainThb` exists because a pre-filled amount box holds text that this app parses back with the
  // same grammar that produced it (D-129). So the property that matters is not how it *looks* —
  // it is that the round trip is exact, on every value, including the ones a formatter written for
  // reading would break: `formatThb` adds `฿`, groups thousands and uses U+2212 for minus, and
  // `parseThb` rejects that minus outright.
  it("writes a minor amount as text that parses back to exactly the same amount", () => {
    expect(plainThb("123450")).toBe("1234.50");
    expect(plainThb("-25")).toBe("-0.25");
    expect(plainThb("0")).toBe("0.00");
    // No thousands separators and no currency mark, which is what keeps the round trip exact
    // rather than merely usually right.
    expect(plainThb("100000000")).toBe("1000000.00");
    fc.assert(fc.property(fc.bigInt({ min: MIN_INT64 / 100n, max: MAX_INT64 / 100n }), (value) =>
      parseThb(plainThb(value.toString())).minor === value.toString()));
  });
});

describe("dates and canonical identity", () => {
  it("resolves Thai statement years and defines Bangkok instants", () => {
    // The same month of the same year, printed in each calendar a Krungthai statement uses.
    expect(gregorianYearFrom(69, 2026, "buddhist")).toBe(2026);
    expect(gregorianYearFrom(26, 2026, "gregorian")).toBe(2026);
    expect(bangkokInstant("2026-06-01", "23:59")).toBe("2026-06-01T23:59:00+07:00");
  });

  it("reads today in Bangkok rather than in UTC, which is a different day for seven hours", () => {
    // 17:30 UTC is 00:30 the NEXT day in Bangkok. This is the hour that mattered: two capture
    // forms defaulted their date with `toISOString().slice(0, 10)` and so offered yesterday to
    // anyone entering a payment before 07:00 local (D-110). Asserted against the UTC answer
    // explicitly, because the two agree for seventeen hours a day and a test written at any
    // other instant would pass while the defect stood.
    const earlyMorning = new Date("2026-08-15T17:30:00Z");
    expect(bangkokToday(earlyMorning)).toBe("2026-08-16");
    expect(earlyMorning.toISOString().slice(0, 10)).toBe("2026-08-15");

    // The boundary itself, from either side: 16:59:59 UTC is still the 15th in Bangkok.
    expect(bangkokToday(new Date("2026-08-15T16:59:59Z"))).toBe("2026-08-15");
    expect(bangkokToday(new Date("2026-08-15T17:00:00Z"))).toBe("2026-08-16");

    // Zero-padded, because a date input reads `YYYY-MM-DD` and nothing else.
    expect(bangkokToday(new Date("2026-01-05T04:00:00Z"))).toBe("2026-01-05");
  });

  it("decides the statement era from its period end, refusing an implausible year", () => {
    // The two readings of the same digits are always 543 years apart, so a window narrower
    // than that admits exactly one. `26` in 2026 is Gregorian 2026, never Buddhist 1983 —
    // the bug a real statement exposed, which redated every row by 43 years without failing.
    expect(resolveStatementEra(26, 2026)).toEqual({ era: "gregorian", year: 2026 });
    expect(resolveStatementEra(69, 2026)).toEqual({ era: "buddhist", year: 2026 });
    // Neither reading is plausible: Gregorian 2035 is in the future, Buddhist 1992 too old.
    expect(() => resolveStatementEra(35, 2026)).toThrow();
    // The two plausible ranges never overlap — Gregorian admits 06–27, Buddhist 49–70 —
    // which is what makes this a determination rather than a preference between calendars.
    for (let twoDigit = 0; twoDigit <= 99; twoDigit += 1) {
      expect(() => resolveStatementEra(twoDigit, 2026), `ambiguous at ${twoDigit}`)
        .not.toThrow(/ambiguous/u);
    }
  });

  it("normalizes NFKC and collapsed whitespace for fingerprints", async () => {
    expect(normalizeSourceText("  Ａ   ไทย\ntext ")).toBe("A ไทย text");
    const left = syntheticImport.rows[0]!;
    const right = { ...left, description: `  ${left.description.replaceAll(" ", "   ")} ` };
    expect(await rowFingerprint(syntheticImport.accountId, "KTB", left)).toBe(await rowFingerprint(syntheticImport.accountId, "KTB", right));
  });

  it("sorts object keys and changes the digest when immutable facts change", async () => {
    expect(canonicalJson({ z: 1, a: { y: true, x: "v" } })).toBe('{"a":{"x":"v","y":true},"z":1}');
    const frameOf = (payload: ImportPayload) => ({
      accountId: payload.accountId,
      contractVersion: payload.contractVersion,
      currency: payload.currency,
      periodStart: payload.periodStart,
      periodEnd: payload.periodEnd,
      openingBalanceMinor: payload.openingBalance.minor,
      closingBalanceMinor: payload.closingBalance.minor
    });
    const changed = { ...syntheticImport, periodEnd: "2026-07-01" } as const;
    expect(await confirmationDigest(frameOf(changed), syntheticImport.rows))
      .not.toBe(await confirmationDigest(frameOf(syntheticImport), syntheticImport.rows));
  });
});

// confirm_import recomputes each row fingerprint in PostgreSQL and rejects a claim
// that does not match (migration 202607240008), so the two normalizers must agree.
// The source-text charset is what makes that hold: it excludes the codepoints where
// V8's ICU and PostgreSQL's Unicode data disagree under NFKC. Full cross-engine
// parity is proven by the pgTAP-side harness; these guard the charset boundary that
// the proof depends on, so a future widening cannot silently break the invariant.
describe("source text charset guard", () => {
  const rowWith = (text: string) => ({ ...syntheticImport.rows[0]!, description: text });

  it("accepts the scripts a Krungthai statement can contain", () => {
    for (const text of ["โอนเงินเข้าบัญชี", "Interest & tax", "Café Ø", "ＦＵＬＬＷＩＤＴＨ", "฿1,234.50", "ref—99"]) {
      expect(sourceRowCandidateSchema.safeParse(rowWith(text)).success).toBe(true);
    }
  });

  it("rejects the Unicode-16 exotics that diverge under PostgreSQL NFKC", () => {
    // U+1CCF0 is the exact codepoint the 50k-string parity run diverged on: V8 folds
    // it to "0", PostgreSQL's older Unicode data leaves it intact.
    expect(sourceRowCandidateSchema.safeParse(rowWith("total \u{1CCF0}")).success).toBe(false);
  });

  it("rejects invisible controls that would not survive a round trip", () => {
    for (const text of ["bom﻿inside", "zero​width", "emoji \u{1F600}"]) {
      expect(sourceRowCandidateSchema.safeParse(rowWith(text)).success).toBe(false);
    }
  });

  it("keeps every accepted string inside the settled planes after normalization", () => {
    const allowed = fc.stringMatching(/^[ -~ -ɏ฀-๿‐- ₠-⃏！-￮]{1,40}$/u);
    fc.assert(fc.property(allowed, (text) => {
      if (!sourceRowCandidateSchema.safeParse(rowWith(text)).success) return true;
      return [...(normalizeSourceText(text) ?? "")].every((character) => character.codePointAt(0)! <= 0xffef);
    }));
  });
});

describe("segmented reconciliation", () => {
  it("warns at the known anomaly and resumes from its printed balance", () => {
    const result = reconcileRows(syntheticImport.openingBalance.minor, syntheticImport.rows);
    expect(result.warnings).toHaveLength(1);
    expect(result.blockers).toHaveLength(0);
    expect(result.warnings[0]?.row).toBe(4);
    expect(result.rows[4]?.status).toBe("balanced");
    expect(result.closingBalance).toBe("1375012");
  });

  it("blocks an unexplained ordinary-row balance gap", () => {
    const row = { ...syntheticImport.rows[0]!, postBalance: { minor: minor("1499999"), currency: "THB" as const } };
    const result = reconcileRows(syntheticImport.openingBalance.minor, [row]);
    expect(result.warnings).toHaveLength(0);
    expect(result.blockers).toHaveLength(1);
    expect(result.rows[0]?.status).toBe("blocked");
  });

  it("blocks an unmarked compound-row gap instead of treating every pair as the known anomaly", () => {
    const source = syntheticImport.rows[3]!;
    const row = {
      ...source,
      provenance: { ...source.provenance, parserFields: { fixture: true } }
    };
    const result = reconcileRows(minor("1389450"), [row]);
    expect(result.warnings).toHaveLength(0);
    expect(result.blockers).toHaveLength(1);
    expect(result.rows[0]?.status).toBe("blocked");
  });

  it("preserves arithmetic for generated one-component rows", () => {
    fc.assert(fc.property(fc.array(fc.integer({ min: -100_000, max: 100_000 }).filter((value) => value !== 0), { minLength: 1, maxLength: 30 }), (movements) => {
      let balance = 1_000_000n;
      const rows = movements.map((movement, index) => {
        balance += BigInt(movement);
        return {
          ...syntheticImport.rows[0]!,
          description: `Generated ${index}`,
          components: [{ kind: movement > 0 ? "deposit" as const : "withdrawal" as const, amount: { minor: minor(String(movement)), currency: "THB" as const } }],
          postBalance: { minor: minor(balance.toString()), currency: "THB" as const },
          provenance: { page: 1, row: index + 1, parserFields: {} }
        };
      });
      return reconcileRows(minor("1000000"), rows).warnings.length === 0;
    }));
  });

  // Invented rows throughout (docs/FIXTURE_POLICY.md). The shape is the one a real
  // Krungthai statement prints (D-055): a date whose rows are printed in a different order
  // from the one their balances were applied in, with an end-of-day posting printed first
  // and applied last.
  const dayRow = (date: string, movement: string, balance: string, index: number) => ({
    sourceDate: date, sourceTime: null, effectiveDate: date,
    transactionLabel: "รายการ", description: `Invented ${index}`, reference: `INV-${index}`, branch: null,
    components: [{
      kind: (BigInt(movement) > 0n ? "deposit" : "withdrawal") as "deposit" | "withdrawal",
      amount: { minor: minor(movement), currency: "THB" as const }
    }],
    postBalance: { minor: minor(balance), currency: "THB" as const },
    provenance: { page: 1, row: index, parserFields: { fixture: true } }
  });

  it("recovers the one ordering of a date's rows that reproduces every printed balance", () => {
    const rows = [
      dayRow("2026-07-01", "500", "49500", 1),      // applied last, printed first
      dayRow("2026-07-01", "-20000", "80000", 2),
      dayRow("2026-07-01", "-30000", "50000", 3),
      dayRow("2026-07-01", "-1000", "49000", 4),
      dayRow("2026-07-02", "-500", "49000", 5)
    ];
    const result = reconcileRows(minor("100000"), rows);

    expect(result.blockers).toEqual([]);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]?.code).toBe("out-of-order-run");
    expect(result.warnings[0]).toMatchObject({
      row: 1, order: [2, 3, 4, 1], entryBalance: "100000", recoveredClosing: "49500"
    });
    // `rows` is printed order, for display.
    expect(result.rows.map((row) => row.status))
      .toEqual(["reordered", "reordered", "reordered", "reordered", "balanced"]);
    // `applied` is the order the balances were applied in, and the order an import submits:
    // confirm_import walks the payload requiring the chain to close.
    expect(result.applied.map((row) => row.description))
      .toEqual(["Invented 2", "Invented 3", "Invented 4", "Invented 1", "Invented 5"]);
    let running = 100000n;
    for (const row of result.applied) {
      running += row.components.reduce((sum, item) => sum + BigInt(item.amount.minor), 0n);
      expect(running).toBe(BigInt(row.postBalance.minor));
    }
    expect(running.toString()).toBe(result.closingBalance);
    // The run leaves the balance its own order ends on, not the printed-order last row's,
    // and the next date chains from that.
    expect(result.rows[0]?.expectedBalance).toBe("49500");
    expect(result.closingBalance).toBe("49000");
  });

  it("refuses when more than one ordering of a date's rows closes the chain", () => {
    const rows = [
      dayRow("2026-07-01", "1000", "101000", 1),
      dayRow("2026-07-01", "1000", "101000", 2), // indistinguishable from row 1
      dayRow("2026-07-01", "-1000", "100000", 3)
    ];
    const result = reconcileRows(minor("100000"), rows);

    // Both 1,3,2 and 2,3,1 reproduce every printed balance, so neither is chosen.
    expect(result.warnings).toEqual([]);
    expect(result.blockers).toHaveLength(1);
    expect(result.rows.some((row) => row.status === "blocked")).toBe(true);
  });

  it("does not reorder across a date boundary", () => {
    const rows = [
      dayRow("2026-07-01", "500", "49500", 1), // belongs after the 07-02 rows
      dayRow("2026-07-02", "-20000", "80000", 2),
      dayRow("2026-07-02", "-30000", "50000", 3),
      dayRow("2026-07-02", "-1000", "49000", 4)
    ];
    const result = reconcileRows(minor("100000"), rows);

    expect(result.warnings).toEqual([]);
    expect(result.blockers.length).toBeGreaterThan(0);
    // Nothing was repaired, so the submitted order is the printed order.
    expect(result.applied.map((row) => row.description)).toEqual(rows.map((row) => row.description));
  });

  it("refuses a same-date run too long to settle rather than searching it", () => {
    // Eleven rows on one date, one past MAX_REORDER_RUN. Built as a correct chain and then
    // rotated, so an ordering exists and is deliberately not looked for.
    const movements = ["-100", "-200", "-300", "-400", "-500", "-600", "-700", "-800", "-900", "-1000", "-1100"];
    let balance = 100000n;
    const chain = movements.map((movement, index) => {
      balance += BigInt(movement);
      return dayRow("2026-07-01", movement, balance.toString(), index + 1);
    });
    const rotated = [chain[chain.length - 1]!, ...chain.slice(0, -1)];
    const result = reconcileRows(minor("100000"), rotated);

    expect(result.warnings).toEqual([]);
    expect(result.blockers.length).toBeGreaterThan(0);
  });
});
