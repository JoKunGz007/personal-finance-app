/**
 * The browser's half of reading a slip's QR: a file in, payload strings back.
 *
 * **This is a module rather than a pair of functions in a form because there are now two forms.**
 * `app/slip-capture.tsx` had both halves inline while it was the only caller; `app/slip-batch.tsx`
 * reads the same QR off many files at once, and a second copy would be two chances to disagree
 * about which scales to try, whether a native detector may be trusted, or where the WebAssembly
 * reader's binary lives. That is the argument `lib/browser/ocr-reader.ts` already makes for the
 * other reader, applied to this one.
 *
 * The **policy** — what to do with the payloads, and how many scales to try — stays in
 * `lib/slip-scan.ts`, where a test can drive it without a browser. This only supplies pixels.
 */

type BarcodeDetectorLike = { detect(source: ImageBitmapSource): Promise<Array<{ rawValue: string }>> };
type BarcodeDetectorConstructor = {
  new (options?: { formats?: string[] }): BarcodeDetectorLike;
  getSupportedFormats?: () => Promise<string[]>;
};

export type SlipQrReader = BarcodeDetectorLike;

/**
 * Resolves a QR reader, preferring the platform's own.
 *
 * The native detector is the better choice **where it exists**: nothing to download, and it is
 * backed by the platform on the device this feature is actually for. It does not exist everywhere.
 * Chrome implements the Shape Detection barcode backend on Android, macOS and ChromeOS and **not on
 * Windows or Linux desktop** — measured on this machine across bundled Chromium and installed
 * Chrome, headless and headed, with the relevant flags, all absent (D-057). Depending on it alone
 * meant slip capture could not run, or be verified, on the owner's own computer.
 *
 * The fallback is `import()`ed rather than imported at module scope, so a platform that has a
 * native detector never downloads the ~1.1 MB WebAssembly reader. That is what makes its size
 * acceptable; putting it in the bundle unconditionally would tax the phone, which is the one device
 * that does not need it.
 */
export async function resolveDetector(): Promise<SlipQrReader | null> {
  const native = (globalThis as { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector;
  if (native) {
    try {
      // Constructing it is not proof it can read a QR: the constructor's presence and its
      // format support are separate facts, so ask before trusting it.
      const formats = await native.getSupportedFormats?.();
      if (!formats || formats.includes("qr_code")) return new native({ formats: ["qr_code"] });
    } catch {
      // Fall through. A native detector that throws is not worth diagnosing here when a
      // working reader is one dynamic import away.
    }
  }
  try {
    const { BarcodeDetector, prepareZXingModule } = await import("barcode-detector/ponyfill");
    // Point the reader at our own copy of its WebAssembly binary. Without this it resolves
    // the file relative to its bundled chunk — `/_next/static/chunks/zxing_reader.wasm` —
    // which does not exist, so the fetch 404s and every decode returns nothing at all. The
    // failure is silent, which is what makes it worth an explicit override rather than a
    // default. `scripts/copy-zxing-wasm.mjs` puts the file there at build time, and the CSP
    // permits it precisely because it is same-origin (D-057).
    await prepareZXingModule({
      overrides: {
        locateFile: (path: string, prefix: string) => (path.endsWith(".wasm") ? "/zxing_reader.wasm" : `${prefix}${path}`)
      },
      fireImmediately: true
    });
    return new BarcodeDetector({ formats: ["qr_code"] });
  } catch {
    return null;
  }
}

/**
 * Draws the image at `scale` and hands the result to the detector.
 *
 * The 2× pass is the whole reason this indirection exists: D-053 measured that 3 of 23 real slips
 * do not decode at native resolution while the detector still finds the finder pattern, so a
 * single-pass reader silently loses 13% of them. In a batch that loss is worse than in a single
 * capture, because nobody is looking at the slip that vanished.
 */
export async function detectAtScale(bitmap: ImageBitmap, detector: SlipQrReader, scale: number): Promise<string[]> {
  const source = scale === 1
    ? bitmap
    : await (async () => {
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      const context = canvas.getContext("2d");
      if (!context) return bitmap;
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      return canvas;
    })();
  try {
    const found = await detector.detect(source as ImageBitmapSource);
    return found.map((code) => code.rawValue).filter((value) => typeof value === "string" && value.length > 0);
  } catch {
    // A detector that throws on one scale must not abort the ladder — the next scale is
    // exactly the case this is here to rescue.
    return [];
  }
}
