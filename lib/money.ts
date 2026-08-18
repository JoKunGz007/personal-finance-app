import { z } from "zod";

export const MIN_INT64 = -(1n << 63n);
export const MAX_INT64 = (1n << 63n) - 1n;
const CANONICAL_INTEGER = /^(?:0|-[1-9]\d*|[1-9]\d*)$/;

export const minorUnitStringSchema = z.string().superRefine((value, context) => {
  if (!CANONICAL_INTEGER.test(value) || value === "-0") {
    context.addIssue({ code: "custom", message: "Money must be a canonical signed integer string." });
    return;
  }
  const amount = BigInt(value);
  if (amount < MIN_INT64 || amount > MAX_INT64) {
    context.addIssue({ code: "custom", message: "Money is outside the PostgreSQL bigint range." });
  }
});

export const moneySchema = z.object({
  minor: minorUnitStringSchema,
  currency: z.literal("THB")
}).strict();

export type MinorUnitString = z.infer<typeof minorUnitStringSchema>;
export type Money = z.infer<typeof moneySchema>;

export function minor(value: string): MinorUnitString {
  return minorUnitStringSchema.parse(value);
}

// Zod runs an object's refinements even when one of its fields already failed, so a
// cross-field check that reaches for `BigInt(row.amount_minor)` throws a raw SyntaxError
// instead of adding an issue — turning a 422 into a 500 at any route that validates a
// payload. Refinements use this instead of casting directly.
export function toMinorAmount(value: unknown): bigint | null {
  if (typeof value !== "string" || !CANONICAL_INTEGER.test(value) || value === "-0") return null;
  return BigInt(value);
}

export function parseThb(text: string): Money {
  const cleaned = text.normalize("NFKC").replace(/[฿,\s]/g, "");
  if (!/^-?(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(cleaned) || cleaned === "-0") {
    throw new Error("THB amount must be plain decimal notation with at most two fractional digits.");
  }
  const negative = cleaned.startsWith("-");
  const unsigned = negative ? cleaned.slice(1) : cleaned;
  const [whole = "0", fraction = ""] = unsigned.split(".");
  const signedMinor = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (negative && signedMinor === 0n) throw new Error("Negative zero is not a valid THB amount.");
  const canonical = negative ? -signedMinor : signedMinor;
  return { minor: minor(canonical.toString()), currency: "THB" };
}

export function addMinor(values: readonly MinorUnitString[]): MinorUnitString {
  return minor(values.reduce((total, value) => total + BigInt(value), 0n).toString());
}

/**
 * A minor-unit amount as plain decimal notation, which is what a form's amount box holds.
 *
 * **The inverse of `parseThb`, and deliberately not `formatThb`.** That one is for *reading*: it
 * prefixes `฿`, groups thousands and uses a typographic minus (U+2212), and every one of those
 * would have to be undone before the value could be parsed back. This round-trips by construction —
 * `parseThb(plainThb(m)).minor === m` — which is what a pre-filled box needs, because the figure
 * offered there is parsed again on submit by the same grammar that produced it (D-129).
 */
export function plainThb(value: MinorUnitString): string {
  const amount = BigInt(value);
  const negative = amount < 0n;
  const absolute = negative ? -amount : amount;
  const fraction = (absolute % 100n).toString().padStart(2, "0");
  return `${negative ? "-" : ""}${absolute / 100n}.${fraction}`;
}

export function formatThb(value: MinorUnitString, locale = "en-GB"): string {
  const amount = BigInt(value);
  const sign = amount < 0n ? "−" : "";
  const absolute = amount < 0n ? -amount : amount;
  const whole = absolute / 100n;
  const fraction = (absolute % 100n).toString().padStart(2, "0");
  const grouped = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(whole);
  return `${sign}฿${grouped}.${fraction}`;
}
