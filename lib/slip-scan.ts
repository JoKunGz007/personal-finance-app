import { readSlipQr, type SlipIdentity, type SlipQrErrorCode } from "@/lib/slip-qr";

// The policy that turns an image into a slip identity, kept separate from the browser
// machinery that actually looks at pixels.
//
// The separation is the point. D-053 measured that **3 of 23 sample slips do not decode at
// native resolution** while the detector still finds the finder pattern, and warned that
// reading a decode failure as "no QR present" drops 13% of the sample into whatever the
// no-QR path does. That is a policy bug, not a pixel bug — so the retry ladder lives here
// where a test can drive it, and `scanImageForSlip` in the component supplies the pixels.

export const SLIP_SCAN_SCALES = [1, 2] as const;

export type SlipScanErrorCode = "NO_QR_DETECTED" | "NO_SLIP_QR_DETECTED" | SlipQrErrorCode;

export type SlipScanResult =
  // `payload` is the exact text the detector read and `readSlipQr` accepted. It travels to
  // the server so the bank and reference can be re-derived there rather than asserted by
  // the client (lib/slips.ts) — which is only sound if this is the accepted payload
  // verbatim, CRC included, and not a reconstruction of it.
  | { ok: true; identity: SlipIdentity; payload: string; scale: number; candidates: number }
  | { ok: false; code: SlipScanErrorCode; message: string };

// Returns every payload the detector could read from the image at the given scale.
// Empty means "found nothing readable", which is deliberately not the same as "no QR".
export type SlipQrDetector = (scale: number) => Promise<readonly string[]>;

export async function scanForSlipIdentity(detect: SlipQrDetector): Promise<SlipScanResult> {
  let candidates = 0;
  // Remembered so a slip carrying a readable QR that is not a *slip* QR — a promotion or
  // a PromptPay code — is reported as that, rather than as an image with no QR in it. The
  // two need different words to the owner: one is "try a better photo", the other is
  // "this is the wrong code".
  let lastRefusal: { code: SlipQrErrorCode; message: string } | null = null;

  for (const scale of SLIP_SCAN_SCALES) {
    const payloads = await detect(scale);
    candidates += payloads.length;
    for (const payload of payloads) {
      const result = readSlipQr(payload);
      if (result.ok) return { ok: true, identity: result.identity, payload, scale, candidates };
      lastRefusal = { code: result.code, message: result.message };
    }
  }

  if (candidates === 0) {
    return {
      ok: false,
      code: "NO_QR_DETECTED",
      message: "No QR code could be read from this image, at native resolution or upscaled."
    };
  }
  if (lastRefusal) return { ok: false, ...lastRefusal };
  return { ok: false, code: "NO_SLIP_QR_DETECTED", message: "This image carries a QR code, but not a bank slip one." };
}
