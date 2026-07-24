import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { bangkokInstant, resolveKrungthaiYear } from "@/lib/dates";
import { canonicalJson, normalizeSourceText, payloadDigest, rowFingerprint } from "@/lib/canonical";
import { MAX_INT64, MIN_INT64, minor, minorUnitStringSchema, parseThb } from "@/lib/money";
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
});

describe("dates and canonical identity", () => {
  it("resolves Thai statement years and defines Bangkok instants", () => {
    expect(resolveKrungthaiYear(69, 2026)).toBe(2026);
    expect(bangkokInstant("2026-06-01", "23:59")).toBe("2026-06-01T23:59:00+07:00");
  });

  it("normalizes NFKC and collapsed whitespace for fingerprints", async () => {
    expect(normalizeSourceText("  Ａ   ไทย\ntext ")).toBe("A ไทย text");
    const left = syntheticImport.rows[0]!;
    const right = { ...left, description: `  ${left.description.replaceAll(" ", "   ")} ` };
    expect(await rowFingerprint(syntheticImport.accountId, "KTB", left)).toBe(await rowFingerprint(syntheticImport.accountId, "KTB", right));
  });

  it("sorts object keys and changes the digest when immutable facts change", async () => {
    expect(canonicalJson({ z: 1, a: { y: true, x: "v" } })).toBe('{"a":{"x":"v","y":true},"z":1}');
    const changed = { ...syntheticImport, periodEnd: "2026-07-01" } as const;
    expect(await payloadDigest(changed)).not.toBe(await payloadDigest(syntheticImport));
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
});
