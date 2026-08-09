import { describe, expect, it } from "vitest";
import { buildSlipQrPayload } from "@/lib/slip-qr";
import { slipCaptureSchema, slipDateFromReference, slipDateWindow } from "@/lib/slips";

const REFERENCE = "202601010000000000000001x";
const PAYLOAD = buildSlipQrPayload({ bankQrCode: "014", reference: REFERENCE });

function capture(overrides: Record<string, unknown> = {}) {
  return {
    qrPayload: PAYLOAD,
    bankCode: "SCB",
    bankQrCode: "014",
    slipReference: REFERENCE,
    kind: "withdrawal",
    amountMinor: "-12500",
    currency: "THB",
    occurredOn: "2026-07-20",
    occurredAtTime: "13:45",
    counterparty: "Synthetic payee",
    categoryId: null,
    note: null,
    ...overrides
  };
}

describe("slip capture contract", () => {
  it("accepts a slip whose declared identity matches its QR", () => {
    expect(slipCaptureSchema.safeParse(capture()).success).toBe(true);
  });

  it("refuses a declared bank or reference the QR does not carry", () => {
    // The check that makes D-050's split real. Identity comes from the QR; if a client can
    // assert it instead, a mistyped bank writes a slip no statement can ever reconcile.
    expect(slipCaptureSchema.safeParse(capture({ bankCode: "KTB", bankQrCode: "006" })).success).toBe(false);
    expect(slipCaptureSchema.safeParse(capture({ slipReference: "202601010000000000000001y" })).success).toBe(false);
  });

  it("refuses a payload whose QR does not survive its own CRC", () => {
    const corrupted = PAYLOAD.replace(REFERENCE, `${REFERENCE.slice(0, -1)}y`);
    expect(slipCaptureSchema.safeParse(capture({ qrPayload: corrupted })).success).toBe(false);
  });

  it("requires the amount's sign to match the direction", () => {
    expect(slipCaptureSchema.safeParse(capture({ kind: "deposit" })).success).toBe(false);
    expect(slipCaptureSchema.safeParse(capture({ kind: "deposit", amountMinor: "12500" })).success).toBe(true);
    expect(slipCaptureSchema.safeParse(capture({ amountMinor: "0" })).success).toBe(false);
  });

  it("refuses non-canonical or floating money without throwing out of safeParse", () => {
    // The throw is the point, not just the refusal. Zod runs an object's refinements even
    // when a field has already failed, so a cross-field check that casts `BigInt(...)`
    // directly raises a SyntaxError straight through `safeParse` — which the route would
    // surface as a 500 instead of a 422. Same shape as the source-component refinement in
    // `lib/backup-contract.ts`, fixed alongside this.
    for (const amountMinor of ["-125.00", "-0125", "-1e4", "-0", "", "  -1", 125 as unknown as string]) {
      expect(() => slipCaptureSchema.safeParse(capture({ amountMinor }))).not.toThrow();
      expect(slipCaptureSchema.safeParse(capture({ amountMinor })).success).toBe(false);
    }
  });

  it("refuses a currency the ledger does not hold", () => {
    expect(slipCaptureSchema.safeParse(capture({ currency: "USD" })).success).toBe(false);
  });

  it("refuses unknown fields rather than dropping them", () => {
    // Strict by design: a client sending `accountId` believes it is binding the slip to an
    // account, and silently ignoring it would hand back a success for something that did
    // not happen. Slips carry no account (migration 011).
    expect(slipCaptureSchema.safeParse(capture({ accountId: "11111111-1111-4111-8111-111111111111" })).success).toBe(false);
  });

  it("refuses a malformed date and an impossible calendar day", () => {
    expect(slipCaptureSchema.safeParse(capture({ occurredOn: "20-07-2026" })).success).toBe(false);
    expect(slipCaptureSchema.safeParse(capture({ occurredOn: "2026-02-30" })).success).toBe(false);
  });

  it("puts a Buddhist-era year outside the window the form offers", () => {
    // The client-side half of the guard `capture_slip` enforces. A Thai slip prints 2569
    // for 2026; typed through unconverted it lands 543 years ahead, and D-031 established
    // that this shift must fail closed rather than be silently reinterpreted.
    const window = slipDateWindow(new Date("2026-07-30T00:00:00Z"));
    expect(window.latest).toBe("2026-07-31");
    expect(window.earliest).toBe("2016-07-30");
    expect("2569-07-20" > window.latest).toBe(true);
  });
});

describe("date carried in the QR reference", () => {
  // Measured over the 23 real samples (D-059): SCB embeds YYYYMMDD at the start, Krungthai's
  // 21-character variant after one letter, and Krungthai's 17-character variant and KBANK
  // carry none.
  //
  // Three of the references here **were** real, copied from sample slips while writing these
  // tests and left visible under D-060 because a breach of `docs/FIXTURE_POLICY.md` is only
  // useful if it is legible. Replaced with invented values on 2026-08-09 (D-077). Each keeps
  // the *grammar* that makes the test meaningful — leading letter, hex run, digit-then-letter
  // block — and none keeps a digit from a real slip.
  const window = slipDateWindow(new Date("2026-07-31T00:00:00Z"));

  it("reads the date SCB puts at the start of its reference", () => {
    expect(slipDateFromReference("202607200000000000000001x", window)).toBe("2026-07-20");
  });

  it("reads the date Krungthai puts after its leading letter", () => {
    expect(slipDateFromReference("C20260401000000000123", window)).toBe("2026-04-01");
  });

  it("returns nothing for the reference shapes that carry no date", () => {
    // Krungthai's 17-character hex variant and a KBANK reference. Both must fail rather than
    // find a date in unrelated digits — a wrong pre-filled date is worse than none. The hex
    // one is the sharper case: its second character onward *is* eight digits, so it reaches
    // the date parser and has to be refused on the calendar rather than on the shape.
    expect(slipDateFromReference("A0123456789abcdef", window)).toBeNull();
    expect(slipDateFromReference("000000000000AOR00001", window)).toBeNull();
  });

  it("refuses digits that are date-shaped but not a real date", () => {
    expect(slipDateFromReference("20260230abcdefghijklmnopq", window)).toBeNull();
    expect(slipDateFromReference("20261301abcdefghijklmnopq", window)).toBeNull();
    expect(slipDateFromReference("00000000abcdefghijklmnopq", window)).toBeNull();
  });

  it("never proposes a date the form would then refuse", () => {
    // The guarantee that makes this safe to pre-fill: anything outside the accepted window
    // yields null, so the field is never populated with a value the server rejects. A
    // Buddhist-era year is the case that matters, and it cannot reach the field.
    expect(slipDateFromReference("25690720abcdefghijklmnopq", window)).toBeNull();
    expect(slipDateFromReference("19990720abcdefghijklmnopq", window)).toBeNull();
    // Tomorrow is inside the window; the day after is not.
    expect(slipDateFromReference("20260801abcdefghijklmnopq", window)).toBe("2026-08-01");
    expect(slipDateFromReference("20260802abcdefghijklmnopq", window)).toBeNull();
  });

  it("prefers the earliest offset that yields a valid date", () => {
    // Deterministic rather than "whichever matched": offset 0 wins when both parse.
    expect(slipDateFromReference("2026072020260721xxxxxxxxx", window)).toBe("2026-07-20");
  });
});
