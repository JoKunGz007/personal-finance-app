// Copies tesseract's browser assets into `public/tesseract/` so the app serves them from its
// own origin.
//
// Same reasoning as `copy-zxing-wasm.mjs`, and it binds harder here:
//
//   * **Not a CDN.** `connect-src` names `'self'` and the configured Supabase origin and
//     nothing else (`lib/security-headers.ts`, D-058). tesseract.js fetches its core, its
//     worker and its language data at runtime and defaults to a CDN for all three, so without
//     this every fetch is blocked by the policy — and a finance app that pulled executable
//     code and a language model from a third party at runtime would have handed that party
//     the page.
//   * **Not committed.** These are ~3.8 MB of binaries; in git they would be a review surface
//     nobody can read and would drift from the package version they must match. Copying at
//     build time from the installed packages makes that match structural rather than
//     remembered.
//
// Only **Thai** is copied, deliberately. Measured on 2026-08-10 over all 23 real samples:
// adding English took amounts read from 13 to 15 of 23 and cost ~5 MB, while the dominant
// failure — the engine not recognising the Thai *label* — was 7 of 23 either way and unmoved
// by it (D-087, `docs/SLIP_CONTRACT.md`). The shipped feature crops rather than reads, so the
// two slips English would have added are ones the owner reads off the crop regardless.
//
// Runs from `prebuild`, so `pnpm build` — which every browser config and `pnpm verify` runs —
// always has them.

import { copyFile, mkdir, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);

// `tesseract.js-core` is a transitive dependency, so it is resolved from tesseract.js's own
// location rather than from this repo's root — under pnpm's strict layout it is not reachable
// from here directly, and a resolve from the wrong place fails only at build time.
const tesseractEntry = require.resolve("tesseract.js");
const tesseractRoot = join(dirname(tesseractEntry), "..");
const fromTesseract = createRequire(join(tesseractRoot, "package.json"));
const coreRoot = join(dirname(fromTesseract.resolve("tesseract.js-core")), "..");
const thaRoot = join(dirname(require.resolve("@tesseract.js-data/tha")), "..");

// The SIMD + LSTM core is the smallest that runs the modern engine. Pinned by name rather than
// left to tesseract.js's own feature detection, because a build must copy exactly what the
// runtime will ask for, and a variant chosen at runtime that was never copied is a 404 the
// CSP then reports as something else entirely.
const assets = [
  { from: join(tesseractRoot, "dist", "worker.min.js"), to: "worker.min.js" },
  { from: join(coreRoot, "tesseract.js-core", "tesseract-core-simd-lstm.js"), to: "tesseract-core-simd-lstm.js" },
  { from: join(coreRoot, "tesseract.js-core", "tesseract-core-simd-lstm.wasm"), to: "tesseract-core-simd-lstm.wasm" },
  { from: join(thaRoot, "tha", "4.0.0", "tha.traineddata.gz"), to: "tha.traineddata.gz" }
];

const destination = join(root, "public", "tesseract");
await mkdir(destination, { recursive: true });

let total = 0;
for (const asset of assets) {
  const { size } = await stat(asset.from).catch(() => {
    throw new Error(
      `tesseract asset missing at ${asset.from}. Run \`pnpm install\` — the slip amount finder cannot run without it.`
    );
  });
  await copyFile(asset.from, join(destination, asset.to));
  total += size;
}
console.log(`copied ${assets.length} tesseract assets (${(total / 1024 / 1024).toFixed(2)} MB) to public/tesseract/`);
