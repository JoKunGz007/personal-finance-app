import { writeBarcode } from "zxing-wasm/writer";
import { buildSlipQrPayload } from "@/lib/slip-qr";

// Renders a slip QR to a real PNG, the same way `synthetic-pdf.ts` renders a statement to
// a real PDF. It exists so the browser specs can put an **actual image** through the
// **actual decoder** instead of stubbing `BarcodeDetector` and proving only the wiring.
//
// Every payload is built by `buildSlipQrPayload`, which keeps the grammar real without a
// real *payload* ever being pasted in. The references are invented, including
// `KTB_SLIP_DATED` below — which **was** a real one, copied from a slip while writing
// D-059's tests, left visible for a week under D-060 because a breach of
// `docs/FIXTURE_POLICY.md` is only useful if it is legible, and replaced on 2026-08-09
// (D-077). What a shape has to preserve is the *grammar*, not the digits: the leading
// letter, the eight-digit date, and the twelve digits after it.
//
// Note what this does and does not establish. It proves the app's decoder reads a
// well-formed QR of this grammar end to end. It does not reproduce a phone camera's
// noise, glare or compression, which is why the 23 real samples were measured separately
// (D-057) rather than being replaced by this.

export type SlipFixture = { bankQrCode: string; reference: string };

export const SCB_SLIP: SlipFixture = { bankQrCode: "014", reference: "202601010000000000000009z" };
export const KTB_SLIP: SlipFixture = { bankQrCode: "006", reference: "A0000000000000042" };
// Krungthai's 21-character variant, which puts a date after its leading letter where the
// 17-character one above carries none (D-059). Invented, and the date in it is invented
// too — a real slip's date is a real value even when its digits are not money (D-077).
export const KTB_SLIP_DATED: SlipFixture = { bankQrCode: "006", reference: "C20260401000000000123" };
export const KBANK_SLIP: SlipFixture = { bankQrCode: "004", reference: "00000000000000000042" };

/**
 * A PNG of the slip's QR, at `scale` pixels per module.
 *
 * `scale` is a test lever rather than decoration: a small enough rendering is a QR the
 * decoder cannot read at native size and can read once upscaled, which is how the retry
 * ladder gets exercised against a real image instead of a mocked empty result.
 */
export async function buildSlipQrPng(slip: SlipFixture, scale = 8): Promise<Buffer> {
  const payload = buildSlipQrPayload(slip);
  const written = await writeBarcode(payload, {
    format: "QRCode",
    ecLevel: "M",
    scale,
    withQuietZones: true
  });
  return Buffer.from(await written.image!.arrayBuffer());
}
