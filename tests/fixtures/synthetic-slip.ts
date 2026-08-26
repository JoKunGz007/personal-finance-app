import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { prepareZXingModule, writeBarcode } from "zxing-wasm/writer";
import { buildSlipQrPayload } from "@/lib/slip-qr";

/**
 * Point the QR **writer** at the binary pnpm already installed, instead of a CDN.
 *
 * **This is the root of the "QR intermittent".** `zxing-wasm`'s writer resolves its `.wasm`
 * relative to a jsDelivr URL when nothing overrides it, so every spec that renders a slip fixture
 * was quietly reaching the network — and failing with `wasm streaming compile failed: TypeError:
 * fetch failed` whenever it could not. That is not intermittent so much as *dependent on the
 * network*, which looks the same from inside a test run and is why re-running usually "fixed" it.
 *
 * `scripts/copy-zxing-wasm.mjs` is the app's answer to the same problem for the **reader**, and it
 * deliberately does not cover this one: the reader's binary has to be served from the app's own
 * origin under the CSP, while the writer never runs in the app at all. Fixtures are the only thing
 * that writes a QR, so the override belongs here rather than in the build.
 */
// Anchored at the project root rather than at `import.meta.url`: Playwright loads this file
// through a CJS transform, where `import.meta` does not exist and the warning it raises is
// swallowed into a module that simply fails to load. Both runners start at the repo root.
const require = createRequire(join(process.cwd(), "package.json"));
// `<pkg>/dist/<es|cjs>/writer/index.js` sits two levels below `dist`, and the binary that entry
// point loads lives at `<pkg>/dist/writer/zxing_writer.wasm` — the same shape the reader has.
const writerWasm = join(dirname(require.resolve("zxing-wasm/writer")), "..", "..", "writer", "zxing_writer.wasm");
// `wasmBinary` rather than `locateFile`: emscripten checks for an already-loaded binary before it
// resolves a path at all, so handing it the bytes skips the fetch instead of redirecting it. The
// path override was tried first and did not take — this build reaches for its URL regardless.
prepareZXingModule({ overrides: { wasmBinary: readFileSync(writerWasm) } });

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
