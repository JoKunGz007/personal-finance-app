import { describe, expect, it, vi } from "vitest";
import { buildSlipQrPayload } from "@/lib/slip-qr";
import { scanForSlipIdentity, SLIP_SCAN_SCALES } from "@/lib/slip-scan";

const SCB_REFERENCE = "202601010000000000000001x";
const SCB_PAYLOAD = buildSlipQrPayload({ bankQrCode: "014", reference: SCB_REFERENCE });
const KTB_PAYLOAD = buildSlipQrPayload({ bankQrCode: "006", reference: "A0000000000000001" });

// A detector that reads nothing until the image is upscaled — the exact behaviour D-053
// measured on 3 of the 23 sample slips.
function decodesOnlyAtScale(target: number, payload: string) {
  return vi.fn(async (scale: number) => (scale === target ? [payload] : []));
}

describe("slip scan retry ladder", () => {
  it("reads a slip that decodes at native resolution without upscaling", async () => {
    const detect = decodesOnlyAtScale(1, SCB_PAYLOAD);
    const result = await scanForSlipIdentity(detect);

    expect(result).toMatchObject({ ok: true, scale: 1 });
    // The upscale costs a full re-decode of a phone-sized image, so it must not run when
    // the first pass already succeeded.
    expect(detect).toHaveBeenCalledTimes(1);
  });

  it("recovers a slip that only decodes upscaled, instead of reporting no QR", async () => {
    // The regression this module exists to prevent. Before the retry, 3 of 23 real slips
    // reached the no-QR path with a perfectly good QR on them.
    const detect = decodesOnlyAtScale(2, SCB_PAYLOAD);
    const result = await scanForSlipIdentity(detect);

    expect(result).toMatchObject({ ok: true, scale: 2 });
    expect(result.ok && result.identity.bankCode).toBe("SCB");
    expect(detect).toHaveBeenCalledTimes(SLIP_SCAN_SCALES.length);
  });

  it("reports no QR only after every scale has been tried", async () => {
    const detect = vi.fn(async () => []);
    const result = await scanForSlipIdentity(detect);

    expect(result).toMatchObject({ ok: false, code: "NO_QR_DETECTED" });
    expect(detect).toHaveBeenCalledTimes(SLIP_SCAN_SCALES.length);
  });

  it("distinguishes a readable non-slip QR from an unreadable image", async () => {
    // These need different words to the owner: one means "retake the photo", the other
    // means "that is the wrong code". Collapsing them sends the owner to fix the camera.
    const detect = vi.fn(async () => ["https://example.invalid/promotion"]);
    const result = await scanForSlipIdentity(detect);

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.code).not.toBe("NO_QR_DETECTED");
  });

  it("picks the slip QR out of an image carrying more than one code", async () => {
    const detect = vi.fn(async () => ["https://example.invalid/promotion", KTB_PAYLOAD]);
    const result = await scanForSlipIdentity(detect);

    expect(result).toMatchObject({ ok: true, candidates: 2 });
    expect(result.ok && result.identity.bankCode).toBe("KTB");
  });

  it("reports a corrupted slip QR as a CRC failure rather than as a missing one", async () => {
    // One character of the reference, leaving every tag and length intact, so the TLV
    // still parses and only the checksum can tell the difference.
    const corrupted = SCB_PAYLOAD.replace(SCB_REFERENCE, `${SCB_REFERENCE.slice(0, -1)}y`);
    expect(corrupted).not.toBe(SCB_PAYLOAD);
    const result = await scanForSlipIdentity(vi.fn(async () => [corrupted]));

    expect(result).toMatchObject({ ok: false, code: "SLIP_CRC_MISMATCH" });
  });
});
