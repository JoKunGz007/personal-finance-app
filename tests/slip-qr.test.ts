import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  buildSlipQrPayload,
  crc16CcittFalse,
  parseTlv,
  readSlipQr,
  QR_CODE_BY_SLIP_BANK,
  SLIP_BANK_BY_QR_CODE
} from "@/lib/slip-qr";

// Every payload in this file is **built**, never copied. `buildSlipQrPayload` exists so a
// fixture can carry the real grammar without carrying a real transaction reference; the
// references below are invented strings of the observed lengths (KBANK 20, Krungthai 17
// and 21, SCB 25 — D-053), which is structure rather than content.
const KBANK_SLIP = { bankQrCode: "004", reference: "00000000000000000001" };
const KTB_SHORT_SLIP = { bankQrCode: "006", reference: "A0000000000000001" };
const KTB_LONG_SLIP = { bankQrCode: "006", reference: "C20260101000000001" + "234" };
const SCB_SLIP = { bankQrCode: "014", reference: "202601010000000000000001x" };

describe("slip QR grammar", () => {
  it("reads the bank and reference out of each observed layout", () => {
    expect(readSlipQr(buildSlipQrPayload(KBANK_SLIP))).toEqual({
      ok: true,
      identity: { bankCode: "KBANK", bankQrCode: "004", reference: KBANK_SLIP.reference }
    });
    expect(readSlipQr(buildSlipQrPayload(KTB_SHORT_SLIP))).toEqual({
      ok: true,
      identity: { bankCode: "KTB", bankQrCode: "006", reference: KTB_SHORT_SLIP.reference }
    });
    expect(readSlipQr(buildSlipQrPayload(SCB_SLIP))).toEqual({
      ok: true,
      identity: { bankCode: "SCB", bankQrCode: "014", reference: SCB_SLIP.reference }
    });
  });

  it("accepts both Krungthai reference lengths, which are one layout rather than two banks", () => {
    // D-053's only genuine sub-variant. Reading either as an error would refuse nine of
    // the sample's twenty-three slips.
    expect(KTB_SHORT_SLIP.reference).toHaveLength(17);
    expect(KTB_LONG_SLIP.reference).toHaveLength(21);
    for (const slip of [KTB_SHORT_SLIP, KTB_LONG_SLIP]) {
      const result = readSlipQr(buildSlipQrPayload(slip));
      expect(result.ok && result.identity.bankCode).toBe("KTB");
    }
  });

  it("maps every bank code in both directions", () => {
    for (const [qrCode, bankCode] of Object.entries(SLIP_BANK_BY_QR_CODE)) {
      expect(QR_CODE_BY_SLIP_BANK[bankCode]).toBe(qrCode);
    }
  });
});

describe("slip QR refusals", () => {
  it("refuses a bank this ledger holds no account for", () => {
    // A real code, and deliberately not one of the three: storing it would record a
    // reference against nothing a statement could ever reconcile it with.
    const result = readSlipQr(buildSlipQrPayload({ bankQrCode: "002", reference: "00000000000000000001" }));
    expect(result).toMatchObject({ ok: false, code: "UNKNOWN_SLIP_BANK" });
  });

  it("refuses a payload whose CRC does not cover it", () => {
    // The red proof for the whole file. One character of the reference is changed and
    // nothing else — the length, the tags and the structure all still parse, and only the
    // CRC distinguishes the tampered payload from a valid one.
    const payload = buildSlipQrPayload(SCB_SLIP);
    const mutated = payload.replace(SCB_SLIP.reference, `${SCB_SLIP.reference.slice(0, -1)}y`);
    expect(mutated).not.toBe(payload);
    expect(mutated).toHaveLength(payload.length);
    expect(parseTlv(mutated)).not.toBeNull();
    expect(readSlipQr(mutated)).toMatchObject({ ok: false, code: "SLIP_CRC_MISMATCH" });
  });

  it("refuses a truncated payload rather than reading the fields that survived", () => {
    const payload = buildSlipQrPayload(KBANK_SLIP);
    expect(readSlipQr(payload.slice(0, -6))).toMatchObject({ ok: false });
    expect(readSlipQr(payload.slice(0, 20))).toMatchObject({ ok: false });
  });

  it("refuses a payload with trailing bytes after the CRC", () => {
    // The CRC is computed over everything before it, so a field appended afterwards is
    // unprotected. Accepting it would leave a payload half-covered by its own checksum.
    // The appended field is deliberately well-formed TLV, so the TLV walker accepts the
    // whole string and the refusal has to come from the CRC no longer being last.
    const payload = buildSlipQrPayload(KBANK_SLIP);
    const extended = `${payload}6202AB`;
    expect(parseTlv(extended)).not.toBeNull();
    expect(readSlipQr(extended)).toMatchObject({ ok: false, code: "UNEXPECTED_SLIP_STRUCTURE" });
  });

  it("refuses a foreign or unknown slip format", () => {
    const wrongFormat = buildSlipQrPayload(KBANK_SLIP).replace("0006000001", "0006000002");
    // Rebuild the CRC so the format check is what refuses it, not the checksum.
    const body = wrongFormat.slice(0, -4);
    const repaired = body + crc16CcittFalse(body).toString(16).toUpperCase().padStart(4, "0");
    expect(readSlipQr(repaired)).toMatchObject({ ok: false, code: "UNSUPPORTED_SLIP_FORMAT" });
  });

  it.each(["", "not tlv at all", "00", "0099short", "00ÿ0100"])("refuses malformed input %j", (payload) => {
    expect(readSlipQr(payload)).toMatchObject({ ok: false });
  });
});

describe("slip QR round trip", () => {
  it("round-trips any bounded alphanumeric reference for any supported bank", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...Object.keys(SLIP_BANK_BY_QR_CODE)),
        fc.stringMatching(/^[0-9A-Za-z]{1,64}$/),
        (bankQrCode, reference) => {
          const result = readSlipQr(buildSlipQrPayload({ bankQrCode, reference }));
          return result.ok && result.identity.reference === reference && result.identity.bankQrCode === bankQrCode;
        }
      )
    );
  });

  it("never reads a different identity out of a single-character corruption", () => {
    // The property that actually protects the dedup key. A mutated payload may be refused
    // or — for the one lenient case below — accepted, but it must never quietly yield a
    // *different* bank or reference, because that is the failure D-050 calls catastrophic.
    //
    // Measured exhaustively rather than assumed: this is a claim about this payload
    // length, not a general property of CRC-16.
    const payload = buildSlipQrPayload(SCB_SLIP);
    const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
    const survivors: number[] = [];
    for (let index = 0; index < payload.length; index += 1) {
      for (const character of alphabet) {
        if (character === payload[index]) continue;
        const mutated = payload.slice(0, index) + character + payload.slice(index + 1);
        const result = readSlipQr(mutated);
        if (!result.ok) continue;
        survivors.push(index);
        expect(result.identity).toEqual({ bankCode: "SCB", bankQrCode: "014", reference: SCB_SLIP.reference });
      }
    }

    // Every survivor is a case change inside the four CRC digits, which `readSlipQr`
    // compares case-insensitively. That is leniency about how the checksum is spelled, not
    // about what it covers: the bytes it protects are byte-identical in each survivor.
    // Asserted rather than tolerated so that a survivor anywhere else fails this test.
    const crcStart = payload.length - 4;
    expect(survivors.every((index) => index >= crcStart)).toBe(true);
    for (const index of survivors) {
      expect(payload[index]!.toUpperCase()).toBe(payload[index]);
      expect(/[A-F]/.test(payload[index]!)).toBe(true);
    }
  });
});
